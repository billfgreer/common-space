/**
 * Full-resolution map export
 *
 * Fetches the satellite COG at native resolution via TiTiler, composites
 * all visible vector layers on top using Canvas 2D, and downloads a PNG.
 */

import { TITILER_BASE } from './constants.js'

// ── Image loading ─────────────────────────────────────────────────────────────

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload  = () => resolve(img)
    img.onerror = () => reject(new Error(`Could not load image from TiTiler: ${url}`))
    img.src = url
  })
}

// ── COG metadata ──────────────────────────────────────────────────────────────

/**
 * Returns the geographic bounds [west, south, east, north] of a COG in WGS84.
 * Prefers the STAC item bbox; falls back to TiTiler /cog/bounds.
 */
export async function getCogBounds(cogUrl, itemBbox) {
  if (itemBbox?.length === 4) return itemBbox
  const res  = await fetch(`${TITILER_BASE}/cog/bounds?url=${encodeURIComponent(cogUrl)}`)
  const data = await res.json()
  return data.bounds // [west, south, east, north]
}

// ── Coordinate projection ─────────────────────────────────────────────────────
// Linear interpolation from WGS84 → image pixels.
// Accurate enough for disaster-area footprints (≤ ~100 km across).

function toPixel(lng, lat, bbox, w, h) {
  const [west, south, east, north] = bbox
  return [
    ((lng  - west)  / (east  - west))  * w,
    ((north - lat) / (north - south)) * h,   // Y axis is inverted in image space
  ]
}

// ── Canvas geometry drawing ───────────────────────────────────────────────────

function drawRing(ctx, coords, bbox, w, h) {
  if (!coords.length) return
  const [x0, y0] = toPixel(coords[0][0], coords[0][1], bbox, w, h)
  ctx.moveTo(x0, y0)
  for (let i = 1; i < coords.length; i++) {
    const [x, y] = toPixel(coords[i][0], coords[i][1], bbox, w, h)
    ctx.lineTo(x, y)
  }
  ctx.closePath()
}

function drawGeometry(ctx, geom, bbox, w, h) {
  if (!geom) return
  const lw = Math.max(1.5, w / 1500)  // line width scales with image size

  switch (geom.type) {
    case 'Point': {
      const [x, y] = toPixel(geom.coordinates[0], geom.coordinates[1], bbox, w, h)
      const r = Math.max(5, w / 400)
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill(); ctx.stroke()
      break
    }
    case 'MultiPoint':
      geom.coordinates.forEach(c =>
        drawGeometry(ctx, { type: 'Point', coordinates: c }, bbox, w, h))
      break

    case 'LineString':
      ctx.lineWidth = lw
      ctx.beginPath()
      geom.coordinates.forEach(([lng, lat], i) => {
        const [x, y] = toPixel(lng, lat, bbox, w, h)
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      })
      ctx.stroke()
      break
    case 'MultiLineString':
      geom.coordinates.forEach(coords =>
        drawGeometry(ctx, { type: 'LineString', coordinates: coords }, bbox, w, h))
      break

    case 'Polygon':
      ctx.lineWidth = lw
      ctx.beginPath()
      geom.coordinates.forEach(ring => drawRing(ctx, ring, bbox, w, h))
      ctx.fill(); ctx.stroke()
      break
    case 'MultiPolygon':
      geom.coordinates.forEach(rings =>
        drawGeometry(ctx, { type: 'Polygon', coordinates: rings }, bbox, w, h))
      break

    case 'GeometryCollection':
      geom.geometries?.forEach(g => drawGeometry(ctx, g, bbox, w, h))
      break
    default: break
  }
}

// ── Main export function ──────────────────────────────────────────────────────

/**
 * Fetches the full-resolution COG preview, composites visible vector layers
 * on top, and triggers a PNG download.
 *
 * @param {object} opts
 * @param {string}   opts.cogUrl    - HTTPS URL to the COG
 * @param {number[]} opts.bbox      - [west, south, east, north] WGS84
 * @param {object[]} opts.layers    - uploadedLayers array (must have .geojson, .color, .visible)
 * @param {string}   opts.filename  - download filename
 */
export async function exportWithLayers({ cogUrl, bbox, layers, filename }) {
  // Step 1 — fetch full-resolution satellite image from TiTiler
  // max_size=4096 caps the longest dimension at 4096 px, preserving aspect ratio.
  // If the native COG is smaller, the native resolution is used.
  const previewUrl =
    `${TITILER_BASE}/cog/preview` +
    `?url=${encodeURIComponent(cogUrl)}` +
    `&max_size=4096` +
    `&format=png`

  const img = await loadImage(previewUrl)
  const w   = img.naturalWidth
  const h   = img.naturalHeight

  // Step 2 — composite on Canvas 2D
  const canvas  = document.createElement('canvas')
  canvas.width  = w
  canvas.height = h
  const ctx     = canvas.getContext('2d')

  // Draw the satellite base image at full resolution
  ctx.drawImage(img, 0, 0)

  // Draw each visible vector layer on top
  for (const layer of layers) {
    if (!layer.visible || !layer.geojson?.features?.length) continue

    // Parse colour — strip any alpha suffix so we can apply our own
    const base  = layer.color.slice(0, 7)   // e.g. '#ef4444'
    ctx.strokeStyle = base
    ctx.fillStyle   = base + '55'           // ~33% opacity fill

    for (const feature of layer.geojson.features) {
      drawGeometry(ctx, feature.geometry, bbox, w, h)
    }
  }

  // Step 3 — download
  await new Promise(resolve => {
    canvas.toBlob(blob => {
      if (!blob) { resolve(); return }
      const url = URL.createObjectURL(blob)
      const a   = document.createElement('a')
      a.href    = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      resolve()
    }, 'image/png')
  })
}
