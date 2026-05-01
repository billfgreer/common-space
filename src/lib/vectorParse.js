// ─── Vector file parser ───────────────────────────────────────────────────────
// All heavy geo libraries (shpjs, togeojson, flatgeobuf) are loaded via dynamic
// import so they don't inflate the initial JS bundle. They only parse and execute
// when the user actually uploads a file.

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

function toFeatureCollection(raw) {
  if (!raw) throw new Error('Empty result')
  if (raw.type === 'FeatureCollection') return raw
  if (raw.type === 'Feature') return { type: 'FeatureCollection', features: [raw] }
  if (Array.isArray(raw)) {
    const features = raw.flatMap(fc =>
      fc.type === 'FeatureCollection' ? fc.features : fc.type === 'Feature' ? [fc] : []
    )
    return { type: 'FeatureCollection', features }
  }
  return { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: raw, properties: {} }] }
}

function stripExt(filename) {
  return filename.replace(/\.[^.]+$/, '')
}

// ─── Main parser ──────────────────────────────────────────────────────────────
// Returns { name, geojson }  for standard vector formats.
// Returns { name, pmtiles: File } for .pmtiles — MapPanel handles those directly.

export async function parseVectorFiles(files) {
  const arr  = Array.from(files)
  const find = ext => arr.find(f => f.name.toLowerCase().endsWith(ext))

  // ── PMTiles — return the File object; MapPanel adds it as a vector tile source
  const pmFile = find('.pmtiles')
  if (pmFile) {
    return { name: stripExt(pmFile.name), pmtiles: pmFile }
  }

  // ── GeoJSON — no library needed, parse directly
  const geojsonFile = find('.geojson') || find('.json')
  if (geojsonFile) {
    const text = await readText(geojsonFile)
    let parsed
    try { parsed = JSON.parse(text) } catch { throw new Error('Invalid GeoJSON — could not parse JSON.') }
    return { name: stripExt(geojsonFile.name), geojson: toFeatureCollection(parsed) }
  }

  // ── FlatGeobuf — binary, spatially indexed, Cloud Native Geospatial format
  const fgbFile = find('.fgb')
  if (fgbFile) {
    const { deserialize } = await import('flatgeobuf/lib/mjs/geojson.js')
    const buf      = await readArrayBuffer(fgbFile)
    const features = []
    for await (const feature of deserialize(new Uint8Array(buf))) {
      features.push(feature)
    }
    return { name: stripExt(fgbFile.name), geojson: { type: 'FeatureCollection', features } }
  }

  // ── KML / KMZ — dynamic import; only loads @tmcw/togeojson when needed
  const kmlFile = find('.kml') || find('.kmz')
  if (kmlFile) {
    const { kml } = await import('@tmcw/togeojson')
    const text = await readText(kmlFile)
    const dom  = new DOMParser().parseFromString(text, 'text/xml')
    return { name: stripExt(kmlFile.name), geojson: toFeatureCollection(kml(dom)) }
  }

  // ── GPX — dynamic import
  const gpxFile = find('.gpx')
  if (gpxFile) {
    const { gpx } = await import('@tmcw/togeojson')
    const text = await readText(gpxFile)
    const dom  = new DOMParser().parseFromString(text, 'text/xml')
    return { name: stripExt(gpxFile.name), geojson: toFeatureCollection(gpx(dom)) }
  }

  // ── Zipped Shapefile — dynamic import; shpjs is ~300KB, only loaded when needed
  const zipFile = find('.zip')
  if (zipFile) {
    const shp    = (await import('shpjs')).default
    const buf    = await readArrayBuffer(zipFile)
    const result = await shp(buf)
    return { name: stripExt(zipFile.name), geojson: toFeatureCollection(result) }
  }

  // ── Raw Shapefile (.shp + optional .dbf)
  const shpFile = find('.shp')
  if (shpFile) {
    const shp    = (await import('shpjs')).default
    const shpBuf = await readArrayBuffer(shpFile)
    const dbfFile = find('.dbf')
    let geojson
    if (dbfFile) {
      const dbfBuf = await readArrayBuffer(dbfFile)
      geojson = toFeatureCollection(await shp.combine([shp.parseShp(shpBuf), shp.parseDbf(dbfBuf)]))
    } else {
      geojson = toFeatureCollection(
        shp.parseShp(shpBuf).map(g => ({ type: 'Feature', geometry: g, properties: {} }))
      )
    }
    return { name: stripExt(shpFile.name), geojson }
  }

  throw new Error(
    'Unsupported format. Upload GeoJSON (.geojson), FlatGeobuf (.fgb), PMTiles (.pmtiles), ' +
    'KML (.kml), GPX (.gpx), or zipped Shapefile (.zip).'
  )
}
