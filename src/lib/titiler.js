import { TITILER_BASE } from './constants.js'

// Convert s3:// to https:// for Maxar's public S3 bucket
export function toHttpsUrl(url) {
  if (!url) return url
  if (url.startsWith('s3://')) {
    const withoutProtocol = url.slice(5)
    const slashIdx = withoutProtocol.indexOf('/')
    const bucket = withoutProtocol.slice(0, slashIdx)
    const key = withoutProtocol.slice(slashIdx + 1)
    return `https://${bucket}.s3.amazonaws.com/${key}`
  }
  return url
}

// MapLibre raster tile URL template for a COG
export function cogTileUrl(cogUrl, { rescale = '0,255', bidx = [1, 2, 3], colormapName } = {}) {
  const httpsUrl = toHttpsUrl(cogUrl)
  const params = new URLSearchParams({ url: httpsUrl, rescale })
  bidx.forEach(b => params.append('bidx', String(b)))
  if (colormapName) params.set('colormap_name', colormapName)
  return `${TITILER_BASE}/cog/tiles/WebMercatorQuad/{z}/{x}/{y}.png?${params}`
}

// Static preview JPEG for a card thumbnail
export function cogPreviewUrl(cogUrl, { width = 512, height = 512, rescale = '0,255', bidx = [1, 2, 3] } = {}) {
  const httpsUrl = toHttpsUrl(cogUrl)
  const params = new URLSearchParams({ url: httpsUrl, width: String(width), height: String(height), rescale })
  bidx.forEach(b => params.append('bidx', String(b)))
  return `${TITILER_BASE}/cog/preview.jpg?${params}`
}

// Single tile URL for a thumbnail — uses a tile at the bbox center, which is fast
// since TiTiler already proved tiles work well for Maxar COGs
export function cogThumbnailTileUrl(cogUrl, bbox, zoom = 14) {
  if (!cogUrl || !bbox || bbox.length < 4) return null
  const [minX, minY, maxX, maxY] = bbox
  const lng = (minX + maxX) / 2
  const lat = (minY + maxY) / 2
  const n = Math.pow(2, zoom)
  const x = Math.floor((lng + 180) / 360 * n)
  const latRad = lat * Math.PI / 180
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n)
  const httpsUrl = toHttpsUrl(cogUrl)
  const params = new URLSearchParams({ url: httpsUrl, rescale: '0,255' })
  ;[1, 2, 3].forEach(b => params.append('bidx', String(b)))
  return `${TITILER_BASE}/cog/tiles/WebMercatorQuad/${zoom}/${x}/${y}.png?${params}`
}

// Bounding box for TiTiler (used to set map bounds when item selected)
async function cogInfo(cogUrl) {
  const httpsUrl = toHttpsUrl(cogUrl)
  const params = new URLSearchParams({ url: httpsUrl })
  const res = await fetch(`${TITILER_BASE}/cog/info?${params}`)
  if (!res.ok) throw new Error(`TiTiler info failed: ${res.status}`)
  return res.json()
}
