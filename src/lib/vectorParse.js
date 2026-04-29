import { kml, gpx } from '@tmcw/togeojson'
import shp from 'shpjs'

// ─── File readers ─────────────────────────────────────────────────────────────

function readText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload  = e => resolve(e.target.result)
    r.onerror = () => reject(new Error(`Failed to read ${file.name}`))
    r.readAsText(file)
  })
}

function readArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload  = e => resolve(e.target.result)
    r.onerror = () => reject(new Error(`Failed to read ${file.name}`))
    r.readAsArrayBuffer(file)
  })
}

// ─── Normalise any GeoJSON-ish result to a FeatureCollection ─────────────────

function toFeatureCollection(raw) {
  if (!raw) throw new Error('Empty result')
  if (raw.type === 'FeatureCollection') return raw
  if (raw.type === 'Feature') return { type: 'FeatureCollection', features: [raw] }
  if (Array.isArray(raw)) {
    // shpjs sometimes returns an array of FeatureCollections (one per layer)
    const features = raw.flatMap(fc =>
      fc.type === 'FeatureCollection' ? fc.features : fc.type === 'Feature' ? [fc] : []
    )
    return { type: 'FeatureCollection', features }
  }
  // Plain geometry
  return { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: raw, properties: {} }] }
}

// ─── Main parser — accepts a FileList or array of Files ──────────────────────

export async function parseVectorFiles(files) {
  const arr = Array.from(files)

  const find = ext => arr.find(f => f.name.toLowerCase().endsWith(ext))

  // ── GeoJSON ──
  const geojsonFile = find('.geojson') || find('.json')
  if (geojsonFile) {
    const text = await readText(geojsonFile)
    let parsed
    try { parsed = JSON.parse(text) } catch { throw new Error('Invalid GeoJSON — could not parse JSON.') }
    return { name: stripExt(geojsonFile.name), geojson: toFeatureCollection(parsed) }
  }

  // ── KML ──
  const kmlFile = find('.kml')
  if (kmlFile) {
    const text = await readText(kmlFile)
    const dom  = new DOMParser().parseFromString(text, 'text/xml')
    const geo  = kml(dom)
    return { name: stripExt(kmlFile.name), geojson: toFeatureCollection(geo) }
  }

  // ── GPX ──
  const gpxFile = find('.gpx')
  if (gpxFile) {
    const text = await readText(gpxFile)
    const dom  = new DOMParser().parseFromString(text, 'text/xml')
    const geo  = gpx(dom)
    return { name: stripExt(gpxFile.name), geojson: toFeatureCollection(geo) }
  }

  // ── Zipped Shapefile (.zip containing .shp/.dbf/.prj) ──
  const zipFile = find('.zip')
  if (zipFile) {
    const buf    = await readArrayBuffer(zipFile)
    const result = await shp(buf)
    return { name: stripExt(zipFile.name), geojson: toFeatureCollection(result) }
  }

  // ── Raw Shapefile (.shp + optional .dbf) ──
  const shpFile = find('.shp')
  if (shpFile) {
    const shpBuf = await readArrayBuffer(shpFile)
    const dbfFile = find('.dbf')
    let geojson
    if (dbfFile) {
      const dbfBuf = await readArrayBuffer(dbfFile)
      geojson = toFeatureCollection(await shp.combine([shp.parseShp(shpBuf), shp.parseDbf(dbfBuf)]))
    } else {
      geojson = toFeatureCollection(shp.parseShp(shpBuf).map(g => ({ type: 'Feature', geometry: g, properties: {} })))
    }
    return { name: stripExt(shpFile.name), geojson }
  }

  throw new Error(
    'Unsupported format. Please upload a GeoJSON (.geojson), KML (.kml), GPX (.gpx), ' +
    'zipped Shapefile (.zip), or raw Shapefile (.shp + .dbf).'
  )
}

function stripExt(filename) {
  return filename.replace(/\.[^.]+$/, '')
}
