import { toHttpsUrl } from './titiler.js'

function resolveHref(base, href) {
  if (!href) return null
  if (href.startsWith('http') || href.startsWith('s3://')) return href
  try { return new URL(href, base).toString() } catch { return href }
}

function resolveAssetHref(itemUrl, href) {
  if (!href) return null
  if (href.startsWith('s3://') || href.startsWith('http')) return toHttpsUrl(href)
  try { return toHttpsUrl(new URL(href, itemUrl).toString()) } catch { return href }
}

async function fetchJSON(url, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (err) {
      if (i === retries) throw err
      await new Promise(r => setTimeout(r, 300 * (i + 1)))
    }
  }
}

function normaliseItem(item, itemUrl) {
  const dt = item.properties?.datetime || item.properties?.start_datetime
  const base = itemUrl ? itemUrl.replace(/[^/]+$/, '') : null

  const resolve = href => {
    if (!href) return null
    return base ? resolveAssetHref(itemUrl, href) : toHttpsUrl(href)
  }

  const cogHref =
    item.assets?.visual?.href ||
    item.assets?.pan_analytic?.href ||
    item.assets?.ms?.href ||
    null

  return {
    id: item.id,
    datetime: dt ? new Date(dt) : null,
    platform: item.properties?.platform || 'Unknown',
    cloudCover: item.properties?.['eo:cloud_cover'] ?? null,
    gsd: item.properties?.gsd || null,
    bbox: item.bbox || null,
    geometry: item.geometry || null,
    cogUrl: resolve(cogHref),
    // Check preview (Satellogic) as an additional thumbnail fallback
    thumbnailUrl: resolve(
      item.assets?.thumbnail?.href ||
      item.assets?.overview?.href ||
      item.assets?.preview?.href ||
      null
    ),
    raw: item,
  }
}

// Parse a date embedded in an item href path (Maxar format: .../YYYY-MM-DD/...)
function parseDateFromHref(href) {
  const m = href?.match(/\/(\d{4}-\d{2}-\d{2})\//)
  return m ? new Date(m[1]) : null
}

// Parse ARD grid cell quadkey from item href (Maxar format: .../ard/NN/QUADKEY/...)
function parseGridCellFromHref(href) {
  const m = href?.match(/\/ard\/\d+\/([^/]+)\//)
  return m ? m[1] : null
}

// Evenly sample `count` items from an array by index
function evenSample(arr, count) {
  if (arr.length <= count) return arr
  const step = arr.length / count
  return Array.from({ length: count }, (_, i) => arr[Math.floor(i * step)])
}

// Extract grid cell quadkey and date from a sub-collection link href
// Maxar format: ./ard/NN/GRIDCELL/YYYY-MM-DD/collection.json
function parseCollLinkMeta(href) {
  const m = href?.match(/\/ard\/\d+\/([^/]+)\/(\d{4}-\d{2}-\d{2})\//)
  if (!m) return null
  return { gridCell: m[1], date: new Date(m[2]) }
}

// Two-pass strategy for Maxar-style catalogs:
//   Pass 0 — parse grid cell + date from all childLink hrefs (no network!)
//   Pass 1 — find cells with both pre+post coverage; fetch those sub-collection JSONs
//   Pass 2 — fetch ALL item JSON files within each selected collection
async function streamMaxarStyle(rootNode, catalogUrl, maxItems, eventDate, onItem, signal) {
  const base = catalogUrl.replace(/[^/]+$/, '')
  const childLinks = rootNode.links.filter(l => l.rel === 'child')

  // Pass 0: parse metadata from link hrefs — free, no network requests
  const linkMetas = childLinks
    .map(l => ({ href: l.href, ...parseCollLinkMeta(l.href) }))
    .filter(m => m.gridCell && m.date)

  if (!linkMetas.length) {
    // Fallback: can't extract metadata from hrefs — fetch all collection JSONs then sample
    const summaries = (await Promise.allSettled(
      childLinks.map(async link => {
        if (signal?.aborted) return null
        const url = resolveHref(base, link.href)
        if (!url) return null
        try {
          const coll = await fetchJSON(url)
          const itemLinks = (coll.links || []).filter(l => l.rel === 'item')
          if (!itemLinks.length) return null
          const collBase = url.replace(/[^/]+$/, '')
          return { collBase, itemLinks, date: parseDateFromHref(itemLinks[0].href) }
        } catch { return null }
      })
    ))
      .filter(r => r.status === 'fulfilled' && r.value?.date)
      .map(r => r.value)
      .sort((a, b) => a.date - b.date)

    // Fetch ALL items from each sampled collection (not just the first)
    let fetched = 0
    const selected = evenSample(summaries, maxItems)
    await Promise.allSettled(selected.flatMap(s =>
      s.itemLinks.map(async link => {
        if (signal?.aborted || fetched >= maxItems) return
        const itemUrl = resolveHref(s.collBase, link.href)
        if (!itemUrl) return
        try {
          const item = await fetchJSON(itemUrl)
          if (item && !signal?.aborted) { fetched++; onItem?.(normaliseItem(item, itemUrl)) }
        } catch {}
      })
    ))
    return
  }

  const splitDate = eventDate || (() => {
    const ms = linkMetas.map(m => m.date.getTime()).sort((a, b) => a - b)
    return new Date(ms[Math.floor(ms.length / 2)])
  })()

  // Group by grid cell
  const byCell = {}
  for (const m of linkMetas) {
    if (!byCell[m.gridCell]) byCell[m.gridCell] = { pre: [], post: [] }
    if (m.date <= splitDate) byCell[m.gridCell].pre.push(m)
    else byCell[m.gridCell].post.push(m)
  }

  // Find cells with both pre- and post-event coverage
  const pairedCells  = Object.entries(byCell).filter(([, v]) => v.pre.length && v.post.length)
  const unpairedPre  = Object.entries(byCell).filter(([, v]) => v.pre.length  && !v.post.length).flatMap(([, v]) => v.pre)
  const unpairedPost = Object.entries(byCell).filter(([, v]) => v.post.length && !v.pre.length).flatMap(([, v]) => v.post)

  // Each paired cell contributes up to 4 collections (2 most-recent pre + 2 earliest post)
  // for temporal depth; fill remaining slots with unpaired cells
  const ACQS_PER_CELL = 4
  const pairSlots  = Math.min(pairedCells.length, Math.ceil(maxItems / ACQS_PER_CELL))
  const fillSlots  = maxItems - pairSlots * ACQS_PER_CELL
  const sampledPairs = evenSample(pairedCells, pairSlots)
  const sampledFill  = evenSample([...unpairedPre, ...unpairedPost], Math.max(0, fillSlots))

  // Collect collection URLs — 2 most-recent pre + 2 earliest post per paired cell
  const collsToFetch = [
    ...sampledPairs.flatMap(([, v]) => [
      ...v.pre.slice(-2),    // 2 most recent pre-event acquisitions for this cell
      ...v.post.slice(0, 2), // 2 earliest post-event acquisitions for this cell
    ]),
    ...sampledFill,
  ].map(m => resolveHref(base, m.href)).filter(Boolean)

  // Pass 1: fetch selected sub-collection JSONs to get item hrefs
  const collDatas = (await Promise.allSettled(
    collsToFetch.map(async url => {
      if (signal?.aborted) return null
      try {
        const coll = await fetchJSON(url)
        const itemLinks = (coll.links || []).filter(l => l.rel === 'item')
        if (!itemLinks.length) return null
        return { collBase: url.replace(/[^/]+$/, ''), itemLinks }
      } catch { return null }
    })
  ))
    .filter(r => r.status === 'fulfilled' && r.value)
    .map(r => r.value)

  // Pass 2: fetch ALL items within each selected collection
  let fetched = 0
  await Promise.allSettled(
    collDatas.flatMap(({ collBase, itemLinks }) =>
      itemLinks.map(async link => {
        if (signal?.aborted || fetched >= maxItems) return
        const itemUrl = resolveHref(collBase, link.href)
        if (!itemUrl) return
        try {
          const item = await fetchJSON(itemUrl)
          if (item && !signal?.aborted) { fetched++; onItem?.(normaliseItem(item, itemUrl)) }
        } catch { /* skip */ }
      })
    )
  )
}

// Generic single-pass walk for simpler catalog structures.
// Uses sequential child traversal to avoid request explosions on deep catalogs
// (e.g. Satellogic: month → 31 days → N items/day).
async function walkSimple(url, maxItems, onItem, signal) {
  let found = 0

  async function walk(nodeUrl, depth) {
    if (found >= maxItems || signal?.aborted) return
    let node
    try { node = await fetchJSON(nodeUrl) } catch { return }

    if (node.type === 'Feature') {
      found++; onItem?.(normaliseItem(node, nodeUrl)); return
    }
    if (node.type === 'FeatureCollection') {
      for (const f of node.features) {
        if (found >= maxItems) return
        found++; onItem?.(normaliseItem(f, nodeUrl))
      }
      return
    }

    const nodeBase = nodeUrl.replace(/[^/]+$/, '')
    const links = node.links || []
    const itemLinks  = links.filter(l => l.rel === 'item')
    const childLinks = links.filter(l => l.rel === 'child')

    if (itemLinks.length) {
      // Take up to 20 items per catalog node for good coverage at each location
      const take = Math.min(20, maxItems - found, itemLinks.length)
      const sampled = evenSample(itemLinks, take)
      for (const l of sampled) {
        if (found >= maxItems || signal?.aborted) return
        const h = resolveHref(nodeBase, l.href)
        if (h) await walk(h, depth + 1)
      }
      return
    }
    if (childLinks.length) {
      // Sample children evenly so we get geographic/temporal spread
      const limit = depth === 0 ? 60 : depth === 1 ? 25 : 12
      const sampled = evenSample(childLinks, Math.min(limit, childLinks.length))
      for (const l of sampled) {
        if (found >= maxItems || signal?.aborted) return
        const h = resolveHref(nodeBase, l.href)
        if (h) await walk(h, depth + 1)
      }
    }
  }

  await walk(url, 0)
}

export async function streamEventItems(catalogUrl, { maxItems = 40, eventDate, onItem, signal } = {}) {
  let root
  try { root = await fetchJSON(catalogUrl) } catch { return }

  const splitDate = eventDate ? new Date(eventDate) : null

  // Wrap onItem to inject timing based on datetime vs event date
  const taggedOnItem = item => {
    const tagged = splitDate && item.datetime
      ? { ...item, timing: item.datetime <= splitDate ? 'before' : 'after' }
      : item
    onItem?.(tagged)
  }

  const childLinks = (root.links || []).filter(l => l.rel === 'child')

  // Detect Maxar-style catalogs by checking if child hrefs contain ARD grid-cell patterns
  // (e.g. ./ard/37/QUADKEY/YYYY-MM-DD/collection.json)
  const isMaxarStyle = childLinks.length > 5 &&
    childLinks.some(l => l.href && /\/ard\/\d+\/[^/]+\/\d{4}-\d{2}-\d{2}\//.test(l.href))

  if (isMaxarStyle) {
    await streamMaxarStyle(root, catalogUrl, maxItems, splitDate, taggedOnItem, signal)
  } else {
    await walkSimple(catalogUrl, maxItems, taggedOnItem, signal)
  }
}

async function getEventItems(catalogUrl, maxItems = 40) {
  const items = []
  await streamEventItems(catalogUrl, { maxItems, onItem: item => items.push(item) })
  return items
}
