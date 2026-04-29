// OpenStreetMap data via Overpass API
// No authentication required — free & open.
// Docs: https://wiki.openstreetmap.org/wiki/Overpass_API

// Two public Overpass endpoints — try the first, fall back to the second
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]

// ─── Preset layer catalogue ───────────────────────────────────────────────────

export const OSM_LAYERS = [
  {
    id:      'hospitals',
    name:    'Hospitals & Clinics',
    icon:    '🏥',
    color:   '#ef4444',
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
// bbox: [west, south, east, north]  (GeoJSON order)
// Overpass expects (south, west, north, east)
//
// Uses `out geom;` so:
//   - nodes     → lat/lon directly
//   - ways      → geometry[] array of {lat,lon} — we build Polygon or LineString
//   - relations → members[].geometry arrays — we build MultiPolygon from outers

function buildQuery(bbox, filters) {
  const [west, south, east, north] = bbox
  const bboxStr = `${south},${west},${north},${east}`

  // Include node, way, AND relation for each filter tag
  const unions = filters.flatMap(filter => {
    const eqIdx = filter.indexOf('=')
    const key   = eqIdx === -1 ? filter : filter.slice(0, eqIdx)
    const val   = eqIdx === -1 ? null   : filter.slice(eqIdx + 1)
    const tag   = val !== null ? `["${key}"="${val}"]` : `["${key}"]`
    return [
      `node${tag}(${bboxStr});`,
      `way${tag}(${bboxStr});`,
      `relation${tag}(${bboxStr});`,
    ]
  })

  // timeout:60 because full geometry responses are larger than centroid responses
  return `[out:json][timeout:60];\n(\n  ${unions.join('\n  ')}\n);\nout geom;`
}

// ─── Geometry helpers ─────────────────────────────────────────────────────────

function nodeCoords(el)  { return [el.lon, el.lat] }
function wayCoords(geom) { return geom.map(n => [n.lon, n.lat]) }

// A way ring is a closed polygon when first === last coord and has ≥4 points
function isClosedRing(coords) {
  if (coords.length < 4) return false
  return coords[0][0] === coords[coords.length - 1][0] &&
         coords[0][1] === coords[coords.length - 1][1]
}

// ─── Convert a single Overpass element → GeoJSON Feature (or null) ────────────

function elementToFeature(el, layerName) {
  const props = {
    osm_id:   el.id,
    osm_type: el.type,
    name:     el.tags?.name ?? el.tags?.['name:en'] ?? layerName,
    amenity:  el.tags?.amenity ?? '',
    phone:    el.tags?.phone ?? el.tags?.['contact:phone'] ?? null,
    website:  el.tags?.website ?? el.tags?.['contact:website'] ?? null,
    operator: el.tags?.operator ?? null,
    ...el.tags, // keep all tags for popup use
  }

  // ── Node → Point ──────────────────────────────────────────────────────────
  if (el.type === 'node') {
    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: nodeCoords(el) },
      properties: props,
    }
  }

  // ── Way → Polygon or LineString ───────────────────────────────────────────
  if (el.type === 'way' && el.geometry?.length) {
    const coords = wayCoords(el.geometry)
    return {
      type: 'Feature',
      geometry: isClosedRing(coords)
        ? { type: 'Polygon',    coordinates: [coords] }
        : { type: 'LineString', coordinates: coords   },
      properties: props,
    }
  }

  // ── Relation → MultiPolygon from outer members ────────────────────────────
  if (el.type === 'relation' && el.members?.length) {
    const outers = el.members
      .filter(m => m.role === 'outer' && m.geometry?.length)
      .map(m => wayCoords(m.geometry))
      .filter(isClosedRing)

    if (outers.length > 0) {
      return {
        type: 'Feature',
        geometry: { type: 'MultiPolygon', coordinates: outers.map(ring => [ring]) },
        properties: props,
      }
    }

    // Relation without usable outer geometry — use center point if present
    if (el.center) {
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [el.center.lon, el.center.lat] },
        properties: props,
      }
    }
  }

  return null // element had no usable geometry
}

// ─── Convert full Overpass JSON response → GeoJSON FeatureCollection ──────────

function toGeoJSON(data, layerName) {
  const features = (data.elements ?? [])
    .map(el => elementToFeature(el, layerName))
    .filter(Boolean)

  return { type: 'FeatureCollection', features }
}

// ─── Main export ─────────────────────────────────────────────────────────────
// bbox: [west, south, east, north]
// filters: string[] from OSM_LAYERS[n].filters
// Returns a GeoJSON FeatureCollection with real polygon/line geometry

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
        signal: AbortSignal.timeout(65_000), // slightly longer than Overpass timeout
      })
      if (!res.ok) throw new Error(`Overpass returned ${res.status}`)
      const json = await res.json()
      return toGeoJSON(json, layerName)
    } catch (e) {
      lastErr = e
    }
  }

  throw lastErr
}
