import { ELEMENT84_STAC } from './constants.js'

// Fetch the most recent Sentinel-2 L2A true-color scene covering bbox.
// Tries progressively higher cloud cover thresholds (15 → 30 → 60 %) if no
// low-cloud scene is found.  Returns null if the area has no coverage at all.
export async function fetchLatestS2({ bbox, signal } = {}) {
  if (!bbox || bbox.length < 4) throw new Error('bbox required')

  const [minX, minY, maxX, maxY] = bbox

  for (const maxCloud of [15, 30, 60]) {
    const body = {
      collections: ['sentinel-2-l2a'],
      bbox: [minX, minY, maxX, maxY],
      query: { 'eo:cloud_cover': { lte: maxCloud } },
      sortby: [{ field: 'datetime', direction: 'desc' }],
      limit: 1,
    }

    const res = await fetch(`${ELEMENT84_STAC}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })

    if (!res.ok) throw new Error(`Sentinel-2 search failed: ${res.status}`)

    const data = await res.json()
    const item = data.features?.[0]
    if (!item) continue   // try looser cloud threshold

    // The 'visual' asset is a pre-rendered 8-bit RGB true-color COG (TCI).
    // It renders correctly with bidx [1,2,3] and rescale 0,255 — same as Maxar.
    const cogUrl = item.assets?.visual?.href
    if (!cogUrl) throw new Error('No visual asset in Sentinel-2 item')

    return {
      id: item.id,
      datetime: item.properties?.datetime,
      cloudCover: item.properties?.['eo:cloud_cover'],
      cogUrl,
      bbox: item.bbox,
      platform: 'Sentinel-2',
    }
  }

  return null   // no scene found even at 60 % cloud cover
}
