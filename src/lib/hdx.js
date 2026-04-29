// Humanitarian Data Exchange — CKAN API
// https://data.humdata.org/api/3

const HDX_API = 'https://data.humdata.org/api/3/action'

// Ordered list of CORS proxy fallbacks.
// We try direct fetch first, then each proxy in turn until one succeeds.
const PROXIES = [
  url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  url => `https://thingproxy.freeboard.io/fetch/${url}`,
]

async function fetchWithFallback(url, options = {}) {
  // 1. Direct
  try {
    const res = await fetch(url, options)
    if (res.ok) return res
  } catch {}

  // 2. Try each proxy
  let lastErr = new Error('All proxies failed')
  for (const makeProxy of PROXIES) {
    try {
      const res = await fetch(makeProxy(url), options)
      if (res.ok) return res
      lastErr = new Error(`Download failed (${res.status})`)
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr
}

// Resource formats we can parse with vectorParse.js
const GEO_FORMATS = new Set([
  'geojson', 'json', 'kml', 'kmz', 'gpx',
  'shp', 'shapefile', 'zipped shapefile', 'zip',
])

export function isGeoFormat(fmt) {
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
// Returns { total: number, datasets: Dataset[] }

export async function searchHDX({ bbox, query = '', rows = 25 } = {}) {
  const params = new URLSearchParams({ rows: String(rows), start: '0' })
  if (query) params.set('q', query)
  if (bbox)  params.set('ext_bbox', bbox.map(v => +v.toFixed(5)).join(','))

  const apiUrl = `${HDX_API}/package_search?${params}`

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
        .filter(r => isGeoFormat(r.format))
        .map(r => ({
          id:     r.id,
          name:   r.name || r.description || ds.title,
          format: r.format,
          url:    r.url,
          size:   r.size,
        })),
    }))
    .filter(ds => ds.resources.length > 0)

  return { total: data.result?.count ?? 0, datasets }
}

// ─── Fetch a resource file ─────────────────────────────────────────────────────

export async function fetchHDXResource(url) {
  const res = await fetchWithFallback(url)
  return await res.blob()
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stripHtml(str) {
  return str.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}
