// OpenStreetMap data via Overpass API
// No authentication required — free & open.
// Docs: https://wiki.openstreetmap.org/wiki/Overpass_API

// Two public Overpass endpoints — we try the first, fall back to the second
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]

// ─── Preset layer catalogue ───────────────────────────────────────────────────
// Each entry defines what to show in the layer panel and what OSM tags to query.

export const OSM_LAYERS = [
  {
    id:      'hospitals',
    name:    'Hospitals & Clinics',
    icon:    '🏥',
    color:   '#ef4444',
    // Overpass filter — matched against node/way/relation tags
    filters: ['amenity=hospital', 'amenity=clinic', 'amenity=doctors'],
  },
  {
    id:      'schools',
    name:    'Schools',
    icon:    '🏫',
    color:   '#f59e0b',
    filters: ['amenity=school', 'amenity=university', 'amenity=college'],
  },
  {
    id:      'emergency',
    name:    'Fire & Police',
    icon:    '🚒',
    color:   '#3b82f6',
    filters: ['amenity=fire_station', 'amenity=police'],
  },
  {
    id:      'pharmacies',
    name:    'Pharmacies',
    icon:    '💊',
    color:   '#10b981',
    filters: ['amenity=pharmacy'],
  },
  {
    id:      'shelters',
    name:    'Shelters & Camps',
    icon:    '⛺',
    color:   '#8b5cf6',
    filters: ['amenity=shelter', 'refugee=yes', 'social_facility=shelter'],
  },
  {
    id:      'water',
    name:    'Water Points',
    icon:    '💧',
    color:   '#0ea5e9',
    filters: ['amenity=water_point', 'man_made=water_well', 'amenity=drinking_water'],
  },
]

// ─── Build Overpass QL query ──────────────────────────────────────────────────
// bbox: [west, south, east, north]  — standard GeoJSON order
// Overpass expects (south, west, north, east)

function buildQuery(bbox, filters) {
  const [west, south, east, north] = bbox
  const bboxStr = `${south},${west},${north},${east}`

  // Build a union of node/way queries for each filter tag
  const unions = filters.flatMap(filter => {
    const [key, val] = filter.split('=')
    const tag = val ? `["${key}"="${val}"]` : `["${key}"]`
    return [
      `node${tag}(${bboxStr});`,
      `way${tag}(${bboxStr});`,
    ]
  })

  return `[out:json][timeout:25];\n(\n  ${unions.join('\n  ')}\n);\nout center;`
}

// ─── Convert Overpass JSON → GeoJSON FeatureCollection ────────────────────────
// Uses `out center;` so ways get a centroid rather than full polygon geometry.
// This keeps the response small and renderable as circle markers.

function toGeoJSON(data, layerName) {
  const features = (data.elements ?? []).flatMap(el => {
    let coordinates
    if (el.type === 'node') {
      coordinates = [el.lon, el.lat]
    } else if (el.center) {
      coordinates = [el.center.lon, el.center.lat]
    } else {
      return [] // skip if no position
    }

    return [{
      type: 'Feature',
      geometry: { type: 'Point', coordinates },
      properties: {
        id:      `${el.type}/${el.id}`,
        name:    el.tags?.name ?? el.tags?.['name:en'] ?? layerName,
        amenity: el.tags?.amenity ?? '',
        osm_id:  el.id,
        osm_type: el.type,
        // Preserve useful tags for popups
        phone:    el.tags?.phone ?? el.tags?.contact?.phone ?? null,
        website:  el.tags?.website ?? el.tags?.contact?.website ?? null,
        operator: el.tags?.operator ?? null,
        ...el.tags,
      },
    }]
  })

  return { type: 'FeatureCollection', features }
}

// ─── Main fetch ───────────────────────────────────────────────────────────────
// bbox: [west, south, east, north]
// filters: string[] from OSM_LAYERS[n].filters
// Returns a GeoJSON FeatureCollection

export async function fetchOSMLayer(bbox, filters, layerName) {
  const query = buildQuery(bbox, filters)
  const body  = new URLSearchParams({ data: query })

  let lastErr = new Error('Overpass API unavailable')

  for (const endpoint of ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      })
      if (!res.ok) throw new Error(`Overpass returned ${res.status}`)
      const json = await res.json()
      const geojson = toGeoJSON(json, layerName)
      return geojson
    } catch (e) {
      lastErr = e
    }
  }

  throw lastErr
}
