import { ELEMENT84_STAC, MPC_DATA } from './constants.js'

// Sentinel-2 natural color render params for MPC titiler-pgstac.
// Uses B04/B03/B02 (Red/Green/Blue) with a color formula that properly
// tone-maps 16-bit DN values into a vivid true-color view.
const S2_RENDER = [
  ['assets', 'B04'],
  ['assets', 'B03'],
  ['assets', 'B02'],
  ['nodata', '0'],
  ['color_formula', 'Gamma RGB 3.2 Saturation 0.8 Sigmoidal RGB 25 0.35'],
].map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')

// Register an MPC pgstac mosaic for a bbox + date window + cloud cover.
// Returns the stable tile URL template (z/x/y) ready for MapLibre.
async function registerMPCMosaic({ bbox, dateStart, dateEnd, maxCloud = 30, signal }) {
  const [minX, minY, maxX, maxY] = bbox
  const body = {
    'filter-lang': 'cql2-json',
    filter: {
      op: 'and',
      args: [
        { op: '=',            args: [{ property: 'collection' }, 'sentinel-2-l2a'] },
        { op: '<=',           args: [{ property: 'eo:cloud_cover' }, maxCloud] },
        { op: 's_intersects', args: [
          { property: 'geometry' },
          { type: 'Polygon', coordinates: [
            [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY], [minX, minY]]
          ]},
        ]},
        { op: 'anyinteracts', args: [
          { property: 'datetime' },
          { interval: [dateStart, dateEnd] },
        ]},
      ],
    },
    sortby: [{ field: 'properties.datetime', direction: 'desc' }],
  }

  const res = await fetch(`${MPC_DATA}/mosaic/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok) throw new Error(`MPC mosaic registration failed: ${res.status}`)
  const { id } = await res.json()
  return `${MPC_DATA}/mosaic/${id}/tiles/WebMercatorQuad/{z}/{x}/{y}@1x?${S2_RENDER}`
}

// Fetch the most recent Sentinel-2 L2A true-color scene covering bbox.
//
// Strategy:
//   1. Query Element84 Earth Search to find the best (lowest-cloud, most recent)
//      scene and get its metadata (date, cloud cover, item bbox).
//   2. Register a Microsoft Planetary Computer titiler-pgstac mosaic search
//      scoped to a ±20-day window around that scene.  MPC has no rate limits
//      for the mosaic/register endpoint (free, CORS: *).
//   3. Return the mosaic tile URL for direct use as a MapLibre raster source.
//
// Falls back to progressively looser cloud thresholds: 15 → 30 → 60 %.
export async function fetchLatestS2({ bbox, signal } = {}) {
  if (!bbox || bbox.length < 4) throw new Error('bbox required')

  for (const maxCloud of [15, 30, 60]) {
    // ── 1. Find best STAC item via Element84 ──────────────────────────────
    const searchRes = await fetch(`${ELEMENT84_STAC}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        collections: ['sentinel-2-l2a'],
        bbox,
        query: { 'eo:cloud_cover': { lte: maxCloud } },
        // 'properties.datetime' is the correct sort field for this ES index
        sortby: [{ field: 'properties.datetime', direction: 'desc' }],
        limit: 1,
      }),
      signal,
    })
    if (!searchRes.ok) throw new Error(`Sentinel-2 search failed: ${searchRes.status}`)
    const data = await searchRes.json()
    const item = data.features?.[0]
    if (!item) continue   // try looser threshold

    const datetime    = item.properties?.datetime
    const cloudCover  = item.properties?.['eo:cloud_cover']

    // ── 2. Register MPC mosaic scoped ±20 days around best item ──────────
    const itemTime  = new Date(datetime).getTime()
    const dateStart = new Date(itemTime - 20 * 86_400_000).toISOString()
    const dateEnd   = new Date(itemTime +      86_400_000).toISOString()  // +1 day buffer

    const tileUrl = await registerMPCMosaic({
      bbox, dateStart, dateEnd, maxCloud, signal,
    })

    return {
      id: item.id,
      datetime,
      cloudCover,
      tileUrl,           // MapLibre-ready {z}/{x}/{y} template
      bbox: item.bbox,
      platform: 'Sentinel-2',
    }
  }

  return null   // no scene found even at 60 % cloud cover
}
