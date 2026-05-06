/**
 * cogRenderer.js
 *
 * MapLibre protocol handler that renders Cloud-Optimized GeoTIFF tiles
 * directly in the browser via HTTP range requests (geotiff.js).
 * Zero tile-server dependency — replaces titiler.xyz which rate-limits
 * under real map load.
 *
 * Architecture:
 *  - Registers a `cog://` protocol with MapLibre.
 *  - Each tile URL encodes the COG URL, item bbox (WGS84), and render params.
 *  - On tile request: geotiff.js fetches only the relevant overview pixels
 *    via HTTP Range, renders them to ImageData, encodes as PNG, returns to
 *    MapLibre's raster pipeline.
 *  - COG objects are cached (weak per-URL) so metadata is only fetched once.
 *
 * Band auto-detection:
 *  - On first open, reads GDAL_METADATA XML (TIFF tag 42112) for explicit
 *    color interpretation (Red/Green/Blue sample indices).
 *  - Falls back to PhotometricInterpretation tag.
 *  - Explicit bidx in the tile URL always overrides auto-detection (used for SAR).
 *
 * Coordinate mapping:
 *  - Uses `item.bbox` (WGS84) as the COG's geographic extent, performing a
 *    simple linear mapping from geographic coords → pixel coords.  For the
 *    small tiles typical of disaster-event imagery (< 1° across), the error
 *    from ignoring map-projection distortion is ≪ 1 pixel and visually
 *    imperceptible.
 */

// Lazy-import geotiff so it's only bundled when the renderer is first used.
let _geotiffModule = null
async function geotiff() {
  if (!_geotiffModule) _geotiffModule = await import('geotiff')
  return _geotiffModule
}

// ─── GeoTIFF object cache ─────────────────────────────────────────────────────
const cogCache  = new Map()   // url → Promise<{tiff, imageCount, images, rgbSamples, nodataValue}>
const CACHE_MAX = 20

function evict() {
  if (cogCache.size >= CACHE_MAX) {
    cogCache.delete(cogCache.keys().next().value)
  }
}

// ─── Band auto-detection ──────────────────────────────────────────────────────
// Uses geotiff.js's built-in image.getGDALMetadata(sampleIndex) API to read
// per-band ColorInterp values from GDAL_METADATA XML (lazy-loaded, one range
// request). Satellite COGs are stored in BGRN, RGBN, or RGB order depending
// on the provider — GDAL_METADATA is the only reliable source of truth.
async function detectRGBSamples(image) {
  try {
    const n = image.getSamplesPerPixel()
    if (n >= 3 && image.fileDirectory.hasTag('GDAL_METADATA')) {
      const interps = []
      // getGDALMetadata(i) returns { [name]: value } where name is the literal
      // XML attribute — GDAL writes 'COLORINTERP' (all-caps), some tools write
      // 'ColorInterp' or 'colorinterp'. Use a case-insensitive key search.
      for (let i = 0; i < Math.min(n, 6); i++) {
        const meta = await image.getGDALMetadata(i)
        if (!meta) { interps.push(''); continue }
        const entry = Object.entries(meta).find(([k]) => k.toLowerCase() === 'colorinterp')
        interps.push(typeof entry?.[1] === 'string' ? entry[1].toLowerCase() : '')
      }
      const rI = interps.findIndex(v => v === 'red')
      const gI = interps.findIndex(v => v === 'green')
      const bI = interps.findIndex(v => v === 'blue')
      if (rI >= 0 && gI >= 0 && bI >= 0) return [rI, gI, bI]
    }
  } catch {}

  // ── PhotometricInterpretation fallback (eager tag, no extra request) ────────
  const photometric = image.fileDirectory.getValue('PhotometricInterpretation')
  const n = image.getSamplesPerPixel()
  if (photometric === 2 && n >= 3) return [0, 1, 2]  // RGB photometric
  if (photometric === 1 || n === 1) return [0]         // Grayscale

  return [0, 1, 2]  // unknown — assume RGB
}

async function openCOG(cogUrl) {
  if (cogCache.has(cogUrl)) return cogCache.get(cogUrl)
  evict()
  const p = (async () => {
    try {
      const { fromUrl } = await geotiff()
      const tiff        = await fromUrl(cogUrl, { allowFullFile: false })
      const imageCount  = await tiff.getImageCount()
      // Pre-fetch all image headers (small HTTP range requests) so we know sizes
      const images = await Promise.all(
        Array.from({ length: imageCount }, (_, i) => tiff.getImage(i))
      )
      // Detect band ordering and nodata from the full-resolution image metadata.
      // getGDALMetadata is async (lazy range request); getGDALNoData is sync (eager tag).
      const rgbSamples  = await detectRGBSamples(images[0])
      const nodataValue = images[0].getGDALNoData() ?? 0
      return { tiff, imageCount, images, rgbSamples, nodataValue }
    } catch (e) {
      console.warn('[cog] open failed:', cogUrl, e?.message)
      return null
    }
  })()
  cogCache.set(cogUrl, p)
  return p
}

// ─── Slippy-map tile → WGS84 bbox ────────────────────────────────────────────
function tile2bbox(z, x, y) {
  const n2 = Math.pow(2, z)
  const toLat = (ny) => {
    const rad = Math.atan(Math.sinh(Math.PI * (1 - 2 * ny / n2)))
    return (rad * 180) / Math.PI
  }
  return {
    west:  (x / n2) * 360 - 180,
    east:  ((x + 1) / n2) * 360 - 180,
    north: toLat(y),
    south: toLat(y + 1),
  }
}

// ─── Select the best overview for a given zoom ────────────────────────────────
// We want the overview where reading a 256-tile window covers ≈200–3000 source
// pixels — enough for quality but not so many that the range request is huge.
function pickOverview(images, geoBbox, tileBbox) {
  const [bW, bS, bE, bN] = geoBbox
  // Fraction of the COG's geographic extent covered by this tile
  const fx = (Math.min(tileBbox.east, bE) - Math.max(tileBbox.west, bW))  / (bE - bW)
  const fy = (Math.min(tileBbox.north, bN) - Math.max(tileBbox.south, bS)) / (bN - bS)
  if (fx <= 0 || fy <= 0) return null  // tile doesn't overlap this COG

  let best = 0
  let bestDiff = Infinity
  for (let i = 0; i < images.length; i++) {
    const srcPx = fx * images[i].getWidth() * fy * images[i].getHeight()
    const diff  = Math.abs(srcPx - 256 * 256)
    if (diff < bestDiff) { bestDiff = diff; best = i }
  }
  return best
}

// ─── Render one 256×256 tile ──────────────────────────────────────────────────
// bidx is 1-indexed (matching STAC/titiler convention). Empty array = auto-detect
// from GDAL metadata (the normal case for optical imagery). SAR always passes [1].
async function renderTile(cogUrl, geoBbox, z, x, y, { rescale = [0, 255], bidx = [], isSAR = false } = {}) {
  const cog = await openCOG(cogUrl)
  if (!cog) return null

  const { images, rgbSamples, nodataValue } = cog
  const tileBbox   = tile2bbox(z, x, y)
  const [bW, bS, bE, bN] = geoBbox

  // Overlap check
  if (tileBbox.east <= bW || tileBbox.west >= bE ||
      tileBbox.north <= bS || tileBbox.south >= bN) return null

  const idx = pickOverview(images, geoBbox, tileBbox)
  if (idx === null) return null

  const image  = images[idx]
  const imgW   = image.getWidth()
  const imgH   = image.getHeight()
  const SIZE   = 256

  // Tile bounds clamped to COG extent, expressed as fractions of the COG
  const clampWest  = Math.max(tileBbox.west,  bW)
  const clampEast  = Math.min(tileBbox.east,  bE)
  const clampNorth = Math.min(tileBbox.north, bN)
  const clampSouth = Math.max(tileBbox.south, bS)

  // Pixel window in the overview image (top-left origin)
  const fracL = (clampWest  - bW) / (bE - bW)
  const fracR = (clampEast  - bW) / (bE - bW)
  const fracT = (bN - clampNorth) / (bN - bS)
  const fracB = (bN - clampSouth) / (bN - bS)

  const winL = Math.max(0, Math.floor(fracL * imgW))
  const winR = Math.min(imgW, Math.ceil(fracR  * imgW))
  const winT = Math.max(0, Math.floor(fracT * imgH))
  const winB = Math.min(imgH, Math.ceil(fracB  * imgH))

  if (winR <= winL || winB <= winT) return null

  // How many pixels of the 256-tile fall on the COG (for partial overlap)
  const outW = Math.round((clampEast - clampWest) / (tileBbox.east - tileBbox.west) * SIZE)
  const outH = Math.round((clampNorth - clampSouth) / (tileBbox.north - tileBbox.south) * SIZE)
  const outX = Math.round((clampWest - tileBbox.west) / (tileBbox.east - tileBbox.west) * SIZE)
  const outY = Math.round((tileBbox.north - clampNorth) / (tileBbox.north - tileBbox.south) * SIZE)

  // Band selection:
  //   SAR → always single band [0]
  //   explicit bidx (1-indexed) → convert to 0-indexed
  //   empty bidx → use GDAL-detected RGB sample indices
  const samples = isSAR
    ? [0]
    : (bidx.length > 0 ? bidx.map(b => b - 1) : rgbSamples)

  let rasters
  try {
    rasters = await image.readRasters({
      window:     [winL, winT, winR, winB],
      samples,
      width:      outW,
      height:     outH,
      interleave: false,
      fillValue:  nodataValue,
    })
  } catch (e) {
    console.warn('[cog] readRasters failed:', e?.message)
    return null
  }

  // Allocate output RGBA (transparent)
  const pixels = new Uint8ClampedArray(SIZE * SIZE * 4)
  const [rMin, rMax] = rescale
  const scale        = rMax > rMin ? 255 / (rMax - rMin) : 1
  const clamp = v => Math.max(0, Math.min(255, Math.round((v - rMin) * scale)))

  const nodata = nodataValue

  if (isSAR || samples.length === 1) {
    const band = rasters[0]
    for (let row = 0; row < outH; row++) {
      for (let col = 0; col < outW; col++) {
        const src = row * outW + col
        const dst = ((outY + row) * SIZE + (outX + col)) * 4
        const v   = clamp(band[src])
        pixels[dst]     = v
        pixels[dst + 1] = v
        pixels[dst + 2] = v
        pixels[dst + 3] = band[src] === nodata ? 0 : 220
      }
    }
  } else {
    const [r, g, b] = rasters
    for (let row = 0; row < outH; row++) {
      for (let col = 0; col < outW; col++) {
        const src = row * outW + col
        const dst = ((outY + row) * SIZE + (outX + col)) * 4
        pixels[dst]     = clamp(r[src])
        pixels[dst + 1] = clamp(g[src])
        pixels[dst + 2] = clamp(b[src])
        pixels[dst + 3] = (r[src] === nodata && g[src] === nodata && b[src] === nodata) ? 0 : 230
      }
    }
  }

  return new ImageData(pixels, SIZE, SIZE)
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build a MapLibre tile URL template for a COG.
 *
 * The tile URLs produced are in the `cog://tile/` scheme, which must be
 * registered via `maplibregl.addProtocol('cog', cogProtocolHandler)` before
 * adding any sources that use them.
 *
 * @param {string}   cogUrl   - HTTPS URL of the COG
 * @param {number[]} bbox     - [west, south, east, north] in WGS84
 * @param {object}   opts     - { rescale, bidx, isSAR }
 *   bidx: 1-indexed band indices. Omit (or pass []) to auto-detect from GDAL
 *         metadata — correct for all optical imagery regardless of storage order.
 *         Pass [1] + isSAR:true for SAR single-band rendering.
 * @returns {string}          - tile URL template with {z}/{x}/{y}
 */
export function cogTileUrlTemplate(cogUrl, bbox, { rescale = '0,255', bidx = null, isSAR = false } = {}) {
  const params = new URLSearchParams({
    url:     cogUrl,
    bbox:    bbox.join(','),
    rescale,
  })
  if (bidx?.length) bidx.forEach(b => params.append('bidx', String(b)))
  if (isSAR) params.set('sar', '1')
  return `cog://tile/{z}/{x}/{y}?${params}`
}

/**
 * MapLibre protocol handler — register with:
 *   maplibregl.addProtocol('cog', cogProtocolHandler)
 *
 * MapLibre calls this for every tile in the `cog://` scheme.
 * Returns {data: ArrayBuffer} containing PNG bytes.
 */
export async function cogProtocolHandler({ url }, abortController) {
  try {
    // Parse: cog://tile/Z/X/Y?url=...&bbox=W,S,E,N&rescale=min,max[&bidx=1&bidx=2&bidx=3]
    const afterScheme = url.replace('cog://tile/', '')
    const [pathPart, queryPart] = afterScheme.split('?')
    const [z, x, y]  = pathPart.split('/').map(Number)
    const params      = new URLSearchParams(queryPart)

    const cogUrl      = params.get('url')
    const bboxStr     = params.get('bbox')
    const bbox        = bboxStr ? bboxStr.split(',').map(Number) : null
    const rescaleStr  = params.get('rescale') || '0,255'
    const rescale     = rescaleStr.split(',').map(Number)
    const bidx        = params.getAll('bidx').map(Number)  // empty = auto-detect
    const isSAR       = params.get('sar') === '1'

    if (!cogUrl || !bbox || bbox.length < 4) return { data: new ArrayBuffer(0) }
    if (abortController?.signal?.aborted) return { data: new ArrayBuffer(0) }

    const imageData = await renderTile(
      cogUrl, bbox, z, x, y,
      { rescale, bidx, isSAR }
    )

    if (!imageData) return { data: new ArrayBuffer(0) }

    // Convert ImageData → PNG → ArrayBuffer
    const canvas = new OffscreenCanvas(256, 256)
    canvas.getContext('2d').putImageData(imageData, 0, 0)
    const blob   = await canvas.convertToBlob({ type: 'image/png' })
    const buffer = await blob.arrayBuffer()
    return { data: buffer }

  } catch (e) {
    if (e?.name !== 'AbortError') console.warn('[cog] protocol handler error:', e?.message)
    return { data: new ArrayBuffer(0) }
  }
}
