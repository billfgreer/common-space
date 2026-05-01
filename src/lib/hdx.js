// Humanitarian Data Exchange — CKAN API
// https://data.humdata.org/api/3

import { HDX_API_BASE } from './constants.js'

// Ordered list of CORS proxy fallbacks.
// We try direct fetch first, then each proxy in turn until one succeeds.
const PROXIES = [
  url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  url => `https://thingproxy.freeboard.io/fetch/${url}`,
]

const PROXY_TIMEOUT_MS = 12_000  // 12 seconds per proxy attempt

// Wraps fetch with an AbortController timeout so stalled proxies don't hang forever.
async function timedFetch(url, options = {}) {
  const ctrl = new AbortController()
  const tid  = setTimeout(() => ctrl.abort(), PROXY_TIMEOUT_MS)
  try {
    return await fetch(url, { ...options, signal: ctrl.signal })
  } finally {
    clearTimeout(tid)
  }
}

// Returns true if the response looks like an HTML page (login redirect, error page, etc.)
// Some HDX resource URLs redirect to a login page which returns 200 OK but HTML body.
function isHtmlResponse(res) {
  const ct = res.headers.get('content-type') ?? ''
  return ct.split(';')[0].trim() === 'text/html'
}

async function fetchWithFallback(url, options = {}) {
  // 1. Direct — CORS errors throw immediately, so no timeout needed here
  try {
    const res = await fetch(url, options)
    if (res.ok && !isHtmlResponse(res)) return res
  } catch {}

  // 2. Try each proxy with a timeout
  let lastErr = new Error('All proxies failed')
  for (const makeProxy of PROXIES) {
    try {
      const res = await timedFetch(makeProxy(url), options)
      if (res.ok && !isHtmlResponse(res)) return res
      if (res.ok)                          lastErr = new Error('Server returned an HTML page instead of a file — the resource may require a login. Try downloading it directly from the HDX website.')
      else                                 lastErr = new Error(`Download failed (HTTP ${res.status})`)
    } catch (e) {
      lastErr = e?.name === 'AbortError'
        ? new Error('Download timed out — the file may be too large for a browser proxy. Try a smaller dataset.')
        : e
    }
  }
  throw lastErr
}

// Resource formats we can parse with vectorParse.js
const GEO_FORMATS = new Set([
  'geojson', 'json', 'kml', 'kmz', 'gpx',
  'shp', 'shapefile', 'zipped shapefile', 'zip',
])

function isGeoFormat(fmt) {
  return fmt && GEO_FORMATS.has(fmt.toLowerCase().trim())
}

// Map HDX format label → file extension for FileReader
export function formatToExt(fmt) {
  if (!fmt) return 'geojson'
  const f = fmt.toLowerCase().trim()
  if (f === 'geojson' || f === 'json') return 'geojson'
  if (f === 'kml' || f === 'kmz')      return 'kml'
  if (f === 'gpx')                     return 'gpx'
  if (f.includes('shapefile') || f === 'shp') return 'zip'  // most shapefiles on HDX are zipped
  if (f === 'zip')                     return 'zip'
  return 'geojson'
}

// ─── Search ───────────────────────────────────────────────────────────────────
// bbox: [west, south, east, north]
// organization: HDX org slug, e.g. 'cred-crunch' (optional)
// allFormats: if true, include non-geo resources (CSV, XLSX, etc.)
// Returns { total: number, datasets: Dataset[] }

export async function searchHDX({ bbox, query = '', rows = 25, organization, allFormats = false } = {}) {
  const params = new URLSearchParams({ rows: String(rows), start: '0' })
  if (query)        params.set('q', query)
  if (bbox)         params.set('ext_bbox', bbox.map(v => +v.toFixed(5)).join(','))
  if (organization) params.set('fq', `organization:${organization}`)

  const apiUrl = `${HDX_API_BASE}/package_search?${params}`

  let data
  try {
    const res = await fetchWithFallback(apiUrl, { headers: { Accept: 'application/json' } })
    data = await res.json()
  } catch (e) {
    throw new Error(`HDX search failed: ${e.message}`)
  }

  if (!data.success) throw new Error('HDX returned an error response')

  const raw = data.result?.results ?? []
  const datasets = raw
    .map(ds => ({
      id:        ds.id,
      name:      ds.name,
      title:     ds.title || ds.name,
      notes:     ds.notes ? stripHtml(ds.notes).slice(0, 120) : '',
      location:  (ds.groups ?? []).map(g => g.display_name).filter(Boolean).join(', '),
      updated:   ds.metadata_modified,
      hdxUrl:    `https://data.humdata.org/dataset/${ds.name}`,
      resources: (ds.resources ?? [])
        .filter(r => allFormats || isGeoFormat(r.format))
        .map(r => ({
          id:     r.id,
          name:   r.name || r.description || ds.title,
          format: r.format,
          url:    r.url,
          size:   r.size,
          canAdd: isGeoFormat(r.format),
        })),
    }))
    .filter(ds => ds.resources.length > 0)

  return { total: data.result?.count ?? 0, datasets }
}

// ─── Fetch a resource file (HDX or direct URL) ────────────────────────────────

export async function fetchHDXResource(url) {
  const res = await fetchWithFallback(url)
  return await res.blob()
}

// ─── Fetch a USGS ShakeMap intensity contour GeoJSON ──────────────────────────
// eventId: USGS ComCat event ID, e.g. 'us6000jllz'
// Returns a parsed GeoJSON FeatureCollection (polygons, one per MMI band).

export async function fetchUSGSShakeMap(eventId) {
  // Step 1: fetch event detail — USGS FDSNWS has CORS enabled, no proxy needed
  const detailUrl = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&eventid=${eventId}`
  let detail
  try {
    const res = await fetch(detailUrl)
    if (!res.ok) throw new Error(`USGS event ${eventId} not found (${res.status})`)
    detail = await res.json()
  } catch (e) {
    throw new Error(`USGS lookup failed: ${e.message}`)
  }

  // Step 2: find the shakemap product and extract contour URL
  const shakemaps = detail.properties?.products?.shakemap
  if (!shakemaps?.length) throw new Error('No ShakeMap available for this event')

  const contents = shakemaps[0]?.contents ?? {}
  // Try MMI first (Modified Mercalli), fall back to PGA
  const entry = contents['cont_mmi.json'] || contents['cont_mi.json'] || contents['download/cont_mmi.json']
  if (!entry?.url) throw new Error('ShakeMap intensity contours not available')

  // Step 3: fetch the contour GeoJSON (hosted on USGS CDN, CORS enabled)
  let geojson
  try {
    const res = await fetch(entry.url)
    if (!res.ok) throw new Error(`ShakeMap download failed (${res.status})`)
    geojson = await res.json()
  } catch (e) {
    throw new Error(`ShakeMap download failed: ${e.message}`)
  }

  if (!geojson?.type) throw new Error('ShakeMap returned invalid GeoJSON')
  return geojson
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stripHtml(str) {
  return str.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}
