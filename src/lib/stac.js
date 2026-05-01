import { toHttpsUrl } from './titiler.js'

// ─── Module-level LRU cache for STAC JSON fetches ────────────────────────────
// Catalog nodes (collections, root catalogs) are fetched repeatedly during
// multi-pass traversal. Caching avoids redundant network requests.
// Map preserves insertion order → easy FIFO eviction when capacity is reached.

const CACHE_MAX  = 300
const fetchCache = new Map()

function cacheGet(url) { return fetchCache.get(url) }

function cachePut(url, data) {
  if (fetchCache.size >= CACHE_MAX) {
    fetchCache.delete(fetchCache.keys().next().value)  // Evict oldest
  }
  fetchCache.set(url, data)
}

// ─── Exponential-backoff fetch ────────────────────────────────────────────────
// Passes signal through so aborted controllers actually cancel in-flight requests.
// Retries with exponential backoff on transient HTTP/network errors.

async function fetchJSON(url, signal, retries = 2) {
  const cached = cacheGet(url)
  if (cached) return cached

  let delay = 400
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    try {
      const res = await fetch(url, { signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      cachePut(url, data)
      return data
    } catch (err) {
      if (err?.name === 'AbortError') throw err
      if (attempt === retries) throw err
      await new Promise(r => setTimeout(r, delay))
      delay *= 2  // Exponential backoff: 400 → 800 → 1600 ms
    }
  }
}

// ─── URL helpers ──────────────────────────────────────────────────────────────

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

// ─── Normalise a STAC item into the app's internal format ────────────────────

function normaliseItem(item, itemUrl) {
  const dt   = item.properties?.datetime || item.properties?.start_datetime
  const base = itemUrl ? itemUrl.replace(/[^/]+$/, '') : null

  const resolve = href => {
    if (!href) return null
    return base ? resolveAssetHref(itemUrl, href) : toHttpsUrl(href)
  }

  // Try well-known asset keys first (Maxar, Planet, Satellogic)
  let cogHref =
    item.assets?.visual?.href ||
    item.assets?.pan_analytic?.href ||
    item.assets?.ms?.href ||
    null

  // Fallback: search all assets by MIME type for any cloud-optimized GeoTIFF.
  // Prefer "overview" role (Umbra's display-ready SAR GeoTIFF), then any COG.
  if (!cogHref && item.assets) {
    const assetList = Object.values(item.assets)
    const isCog = a => typeof a.type === 'string' && a.type.includes('cloud-optimized')
    const overviewCog = assetList.find(a => isCog(a) && Array.isArray(a.roles) && a.roles.includes('overview'))
    const anyCog      = assetList.find(a => isCog(a))
    cogHref = (overviewCog || anyCog)?.href ?? null
  }

  // Detect SAR instruments — drives single-band rendering in MapPanel
  const isSAR = !!(
    item.properties?.['sar:instrument_mode'] ||
    item.properties?.['sar:frequency_band'] ||
    item.properties?.['sar:polarizations']
  )

  return {
    id:         item.id,
    datetime:   dt ? new Date(dt) : null,
    platform:   item.properties?.platform || 'Unknown',
    cloudCover: item.properties?.['eo:cloud_cover'] ?? null,
    gsd:        item.properties?.gsd || null,
    bbox:       item.bbox || null,
    geometry:   item.geometry || null,
    cogUrl:     resolve(cogHref),
    isSAR,
    thumbnailUrl: resolve(
      item.assets?.thumbnail?.href ||
      item.assets?.overview?.href  ||
      item.assets?.preview?.href   ||
      null
    ),
    raw: item,
  }
}

// ─── Maxar ARD helpers ────────────────────────────────────────────────────────

function parseDateFromHref(href) {
  const m = href?.match(/\/(\d{4}-\d{2}-\d{2})\//)
  return m ? new Date(m[1]) : null
}

function parseGridCellFromHref(href) {
  const m = href?.match(/\/ard\/\d+\/([^/]+)\//)
  return m ? m[1] : null
}

function evenSample(arr, count) {
  if (arr.length <= count) return arr
  const step = arr.length / count
  return Array.from({ length: count }, (_, i) => arr[Math.floor(i * step)])
}

function parseCollLinkMeta(href) {
  const m = href?.match(/\/ard\/\d+\/([^/]+)\/(\d{4}-\d{2}-\d{2})\//)
  if (!m) return null
  return { gridCell: m[1], date: new Date(m[2]) }
}

// ─── Maxar-style multi-pass strategy ─────────────────────────────────────────
// Pass 0: parse grid cell + date from link hrefs (zero network cost)
// Pass 1: fetch selected sub-collection JSONs to get item hrefs
// Pass 2: fetch item JSONs within each sub-collection

async function streamMaxarStyle(rootNode, catalogUrl, maxItems, eventDate, onItem, signal) {
  const base       = catalogUrl.replace(/[^/]+$/, '')
  const childLinks = rootNode.links.filter(l => l.rel === 'child')

  const linkMetas = childLinks
    .map(l => ({ href: l.href, ...parseCollLinkMeta(l.href) }))
    .filter(m => m.gridCell && m.date)

  if (!linkMetas.length) {
    // Fallback: fetch all collection JSONs then sample
    const summaries = (await Promise.allSettled(
      childLinks.map(async link => {
        if (signal?.aborted) return null
        const url = resolveHref(base, link.href)
        if (!url) return null
        try {
          const coll      = await fetchJSON(url, signal)
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

    let fetched = 0
    const selected = evenSample(summaries, maxItems)
    await Promise.allSettled(selected.flatMap(s =>
      s.itemLinks.map(async link => {
        if (signal?.aborted || fetched >= maxItems) return
        const itemUrl = resolveHref(s.collBase, link.href)
        if (!itemUrl) return
        try {
          const item = await fetchJSON(itemUrl, signal)
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

  const byCell = {}
  for (const m of linkMetas) {
    if (!byCell[m.gridCell]) byCell[m.gridCell] = { pre: [], post: [] }
    if (m.date <= splitDate) byCell[m.gridCell].pre.push(m)
    else                     byCell[m.gridCell].post.push(m)
  }

  const pairedCells  = Object.entries(byCell).filter(([, v]) => v.pre.length && v.post.length)
  const unpairedPre  = Object.entries(byCell).filter(([, v]) => v.pre.length  && !v.post.length).flatMap(([, v]) => v.pre)
  const unpairedPost = Object.entries(byCell).filter(([, v]) => v.post.length && !v.pre.length).flatMap(([, v]) => v.post)

  const ACQS_PER_CELL = 4
  const pairSlots     = Math.min(pairedCells.length, Math.ceil(maxItems / ACQS_PER_CELL))
  const fillSlots     = maxItems - pairSlots * ACQS_PER_CELL
  const sampledPairs  = evenSample(pairedCells, pairSlots)
  const sampledFill   = evenSample([...unpairedPre, ...unpairedPost], Math.max(0, fillSlots))

  const collsToFetch = [
    ...sampledPairs.flatMap(([, v]) => [
      ...v.pre.slice(-2),
      ...v.post.slice(0, 2),
    ]),
    ...sampledFill,
  ].map(m => resolveHref(base, m.href)).filter(Boolean)

  const collDatas = (await Promise.allSettled(
    collsToFetch.map(async url => {
      if (signal?.aborted) return null
      try {
        const coll      = await fetchJSON(url, signal)
        const itemLinks = (coll.links || []).filter(l => l.rel === 'item')
        if (!itemLinks.length) return null
        return { collBase: url.replace(/[^/]+$/, ''), itemLinks }
      } catch { return null }
    })
  ))
    .filter(r => r.status === 'fulfilled' && r.value)
    .map(r => r.value)

  let fetched = 0
  await Promise.allSettled(
    collDatas.flatMap(({ collBase, itemLinks }) =>
      itemLinks.map(async link => {
        if (signal?.aborted || fetched >= maxItems) return
        const itemUrl = resolveHref(collBase, link.href)
        if (!itemUrl) return
        try {
          const item = await fetchJSON(itemUrl, signal)
          if (item && !signal?.aborted) { fetched++; onItem?.(normaliseItem(item, itemUrl)) }
        } catch {}
      })
    )
  )
}

// ─── Generic catalog walk ─────────────────────────────────────────────────────
// Recursively traverses child → item links. Parallel at each level.

async function walkSimple(url, maxItems, onItem, signal) {
  let found = 0

  async function walk(nodeUrl, depth) {
    if (found >= maxItems || signal?.aborted) return
    let node
    try { node = await fetchJSON(nodeUrl, signal) } catch { return }

    if (node.type === 'Feature') {
      if (found < maxItems) { found++; onItem?.(normaliseItem(node, nodeUrl)) }
      return
    }
    if (node.type === 'FeatureCollection') {
      for (const f of node.features) {
        if (found >= maxItems) return
        found++; onItem?.(normaliseItem(f, nodeUrl))
      }
      return
    }

    const nodeBase   = nodeUrl.replace(/[^/]+$/, '')
    const links      = node.links || []
    const itemLinks  = links.filter(l => l.rel === 'item')
    const childLinks = links.filter(l => l.rel === 'child')

    if (itemLinks.length) {
      const take    = Math.min(20, maxItems - found, itemLinks.length)
      const sampled = evenSample(itemLinks, take)
      await Promise.allSettled(sampled.map(async l => {
        if (found >= maxItems || signal?.aborted) return
        const h = resolveHref(nodeBase, l.href)
        if (h) await walk(h, depth + 1)
      }))
      return
    }
    if (childLinks.length) {
      const limit   = depth === 0 ? 60 : depth === 1 ? 25 : 12
      const sampled = evenSample(childLinks, Math.min(limit, childLinks.length))
      await Promise.allSettled(sampled.map(async l => {
        if (found >= maxItems || signal?.aborted) return
        const h = resolveHref(nodeBase, l.href)
        if (h) await walk(h, depth + 1)
      }))
    }
  }

  await walk(url, 0)
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function streamEventItems(catalogUrl, { maxItems = 40, eventDate, onItem, signal } = {}) {
  let root
  try { root = await fetchJSON(catalogUrl, signal) } catch { return }

  const splitDate = eventDate ? new Date(eventDate) : null

  const taggedOnItem = item => {
    const tagged = splitDate && item.datetime
      ? { ...item, timing: item.datetime <= splitDate ? 'before' : 'after' }
      : item
    onItem?.(tagged)
  }

  const childLinks = (root.links || []).filter(l => l.rel === 'child')

  const isMaxarStyle = childLinks.length > 5 &&
    childLinks.some(l => l.href && /\/ard\/\d+\/[^/]+\/\d{4}-\d{2}-\d{2}\//.test(l.href))

  if (isMaxarStyle) {
    await streamMaxarStyle(root, catalogUrl, maxItems, splitDate, taggedOnItem, signal)
  } else {
    await walkSimple(catalogUrl, maxItems, taggedOnItem, signal)
  }
}
