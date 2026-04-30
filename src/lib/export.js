/**
 * Full-resolution map export via tile stitching
 *
 * Rather than fetching the entire COG (which can be gigabytes), we stitch
 * together the same small 256×256 tiles TiTiler already serves to the map.
 * Exporting at zoom+1 gives one resolution step above the current view.
 * Vector layers are projected using Web Mercator so they align exactly with
 * the tile grid.
 */

import { TITILER_BASE } from './constants.js'

const TILE_PX = 256

// ── Web Mercator helpers ──────────────────────────────────────────────────────

function lngToWorldX(lng, z) {
  return ((lng + 180) / 360) * (1 << z) * TILE_PX
}
function latToWorldY(lat, z) {
  const r = lat * Math.PI / 180
  return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * (1 << z) * TILE_PX
}
function lngToTileX(lng, z) { return Math.floor(lngToWorldX(lng, z) / TILE_PX) }
function latToTileY(lat, z)  { return Math.floor(latToWorldY(lat, z)  / TILE_PX) }

// ── Tile loading ──────────────────────────────────────────────────────────────

function buildTileUrl(cogUrl, z, x, y) {
  const params = new URLSearchParams({ url: cogUrl, rescale: '0,255' })
  ;[1, 2, 3].forEach(b => params.append('bidx', String(b)))
  return `${TITILER_BASE}/cog/tiles/WebMercatorQuad/${z}/${x}/${y}.png?${params}`
}

function loadTile(url) {
  return new Promise(resolve => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload  = () => resolve(img)
    img.onerror = () => resolve(null)   // missing tile → leave blank, don't abort
    img.src = url
  })
}

// ── Zoom selection ────────────────────────────────────────────────────────────

const MAX_TILES = 256   // cap at 16×16 → 4096×4096 canvas

function chooseZoom(mapZoom, west, south, east, north) {
  // Try zoom+1 first, fall back to current zoom, then lower until under the cap
  const target = Math.min(Math.ceil(mapZoom) + 1, 18)
  for (let z = target; z >= Math.max(target - 3, 6); z--) {
    const xMin = lngToTileX(west, z),  xMax = lngToTileX(east, z)
    const yMin = latToTileY(north, z), yMax = latToTileY(south, z)
    if ((xMax - xMin + 1) * (yMax - yMin + 1) <= MAX_TILES)
      return { z, xMin, xMax, yMin, yMax }
  }
  // Fallback: single-tile overview
  const z = 8
  return { z,
    xMin: lngToTileX(west, z), xMax: lngToTileX(east, z),
    yMin: latToTileY(north, z), yMax: latToTileY(south, z),
  }
}

// ── Canvas geometry drawing ───────────────────────────────────────────────────
// project(lng, lat) → [canvasX, canvasY]

function drawRing(ctx, coords, project) {
  if (!coords.length) return
  const [x0, y0] = project(coords[0][0], coords[0][1])
  ctx.moveTo(x0, y0)
  for (let i = 1; i < coords.length; i++) {
    const [x, y] = project(coords[i][0], coords[i][1])
    ctx.lineTo(x, y)
  }
  ctx.closePath()
}

function drawGeometry(ctx, geom, project) {
  if (!geom) return
  switch (geom.type) {
    case 'Point': {
      const [x, y] = project(geom.coordinates[0], geom.coordinates[1])
      ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2)
      ctx.fill(); ctx.stroke()
      break
    }
    case 'MultiPoint':
      geom.coordinates.forEach(c =>
        drawGeometry(ctx, { type: 'Point', coordinates: c }, project))
      break
    case 'LineString':
      ctx.beginPath()
      geom.coordinates.forEach(([lng, lat], i) => {
        const [x, y] = project(lng, lat)
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      })
      ctx.stroke()
      break
    case 'MultiLineString':
      geom.coordinates.forEach(coords =>
        drawGeometry(ctx, { type: 'LineString', coordinates: coords }, project))
      break
    case 'Polygon':
      ctx.beginPath()
      geom.coordinates.forEach(ring => drawRing(ctx, ring, project))
      ctx.fill(); ctx.stroke()
      break
    case 'MultiPolygon':
      geom.coordinates.forEach(rings =>
        drawGeometry(ctx, { type: 'Polygon', coordinates: rings }, project))
      break
    case 'GeometryCollection':
      geom.geometries?.forEach(g => drawGeometry(ctx, g, project))
      break
    default: break
  }
}

// ── Main export function ──────────────────────────────────────────────────────

/**
 * Stitches map tiles at zoom+1 and composites all visible vector layers on
 * top, then triggers a PNG download.
 *
 * @param {object}   opts
 * @param {string}   opts.cogUrl    - COG HTTPS URL (same one fed to TiTiler tiles)
 * @param {object[]} opts.layers    - uploadedLayers array ({ geojson, color, visible })
 * @param {string}   opts.filename  - download filename
 * @param {object}   opts.map       - live MapLibre map instance
 */
export async function exportWithLayers({ cogUrl, layers, filename, map }) {
  const bounds = map.getBounds()
  const west   = bounds.getWest()
  const south  = bounds.getSouth()
  const east   = bounds.getEast()
  const north  = bounds.getNorth()

  const { z, xMin, xMax, yMin, yMax } = chooseZoom(map.getZoom(), west, south, east, north)

  const tilesWide = xMax - xMin + 1
  const tilesHigh = yMax - yMin + 1
  const canvasW   = tilesWide * TILE_PX
  const canvasH   = tilesHigh * TILE_PX

  // World-pixel origin of the top-left tile (used for vector projection)
  const originX = xMin * TILE_PX
  const originY = yMin * TILE_PX

  // Fetch all tiles in parallel — errors resolve as null (blank tile)
  const fetches = []
  for (let tx = xMin; tx <= xMax; tx++)
    for (let ty = yMin; ty <= yMax; ty++)
      fetches.push(loadTile(buildTileUrl(cogUrl, z, tx, ty)).then(img => ({ tx, ty, img })))

  const tiles = await Promise.all(fetches)

  // Stitch onto canvas
  const canvas  = document.createElement('canvas')
  canvas.width  = canvasW
  canvas.height = canvasH
  const ctx     = canvas.getContext('2d')

  for (const { tx, ty, img } of tiles) {
    if (img) ctx.drawImage(img, (tx - xMin) * TILE_PX, (ty - yMin) * TILE_PX)
  }

  // Project WGS84 → canvas pixels via Web Mercator (aligns exactly with tiles)
  const project = (lng, lat) => [
    lngToWorldX(lng, z) - originX,
    latToWorldY(lat, z) - originY,
  ]

  // Composite vector layers
  ctx.lineWidth = Math.max(1.5, canvasW / 1500)
  for (const layer of layers) {
    if (!layer.visible || !layer.geojson?.features?.length) continue
    const base      = layer.color.slice(0, 7)
    ctx.strokeStyle = base
    ctx.fillStyle   = base + '55'        // ~33% opacity fill
    for (const feature of layer.geojson.features)
      drawGeometry(ctx, feature.geometry, project)
  }

  // Download
  await new Promise(resolve => {
    canvas.toBlob(blob => {
      if (!blob) { resolve(); return }
      const url = URL.createObjectURL(blob)
      Object.assign(document.createElement('a'), { href: url, download: filename }).click()
      URL.revokeObjectURL(url)
      resolve()
    }, 'image/png')
  })
}
