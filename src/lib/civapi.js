// CivAPI — Humanitarian data (infrastructure/OSM, population, conflict)
// Docs: https://docs.civapi.com
// Auth: x-api-key header — get a key at https://dashboard.civapi.com

import { CIVAPI_BASE } from './constants.js'

// localStorage key for the user's API key
const STORAGE_KEY = 'civapi_key'

export function getCivapiKey()         { return localStorage.getItem(STORAGE_KEY) ?? '' }
export function setCivapiKey(key)      { localStorage.setItem(STORAGE_KEY, key.trim()) }
export function clearCivapiKey()       { localStorage.removeItem(STORAGE_KEY) }

// ─── Infrastructure / Places (OpenStreetMap via CivAPI) ───────────────────────
// Returns a GeoJSON FeatureCollection of points (hospitals, schools, etc.)
//
// country  — ISO 3166-1 alpha-2 code (e.g. 'np', 'tr', 'ly')
// types    — array of CivAPI infrastructure types to fetch in parallel
//            Supported: 'hospitals' | 'schools' | 'pharmacies' | 'clinics' |
//                       'fire_stations' | 'police' | 'bus_stops'
// apiKey   — caller passes the stored key; throws if missing

export async function fetchInfrastructure(country, types, apiKey) {
  if (!apiKey) throw new Error('No CivAPI key — add one in Settings')
  if (!country) throw new Error('No country code for this event')

  const headers = { 'x-api-key': apiKey, 'Accept': 'application/json' }

  // Fetch each type in parallel
  const results = await Promise.allSettled(
    types.map(type =>
      fetch(`${CIVAPI_BASE}/infrastructure/${country.toLowerCase()}?source=osm&type=${type}&limit=500`, { headers })
        .then(r => {
          if (r.status === 401) throw new Error('Invalid CivAPI key')
          if (r.status === 403) throw new Error('CivAPI key unauthorised')
          if (!r.ok) throw new Error(`CivAPI ${type} failed (${r.status})`)
          return r.json()
        })
        .then(data => normaliseToGeoJSON(data, type))
    )
  )

  // Collect features from all successful type requests
  const features = []
  const errors   = []
  for (const r of results) {
    if (r.status === 'fulfilled') features.push(...(r.value.features ?? []))
    else errors.push(r.reason?.message ?? 'Unknown error')
  }

  if (features.length === 0 && errors.length > 0) {
    throw new Error(errors[0])
  }

  return {
    type: 'FeatureCollection',
    features,
  }
}

// ─── Normalise CivAPI response to GeoJSON ─────────────────────────────────────
// CivAPI may return an array of objects with lat/lng/name/type,
// or a GeoJSON FeatureCollection directly.
function normaliseToGeoJSON(data, typeName) {
  // Already GeoJSON
  if (data?.type === 'FeatureCollection') return data
  if (data?.type === 'Feature') return { type: 'FeatureCollection', features: [data] }

  // Array of objects with coordinates
  const arr = Array.isArray(data) ? data : (data?.data ?? data?.results ?? [])
  const features = arr
    .filter(item => item.lat != null && item.lon != null)
    .map(item => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [parseFloat(item.lon), parseFloat(item.lat)] },
      properties: {
        name:     item.name ?? item.tags?.name ?? `${typeName}`,
        type:     typeName,
        amenity:  item.tags?.amenity ?? typeName,
        ...item.tags,
      },
    }))

  return { type: 'FeatureCollection', features }
}

// ─── CivAPI layer catalogue — what we expose per event type ──────────────────
// Each entry maps to one or more CivAPI infrastructure types.
// 'country' must be set on the event for these to load.

export const CIVAPI_LAYERS = [
  {
    id:    'hospitals',
    name:  'Hospitals & Clinics',
    types: ['hospitals', 'clinics'],
    color: '#ef4444',
    icon:  '🏥',
  },
  {
    id:    'schools',
    name:  'Schools',
    types: ['schools'],
    color: '#f59e0b',
    icon:  '🏫',
  },
  {
    id:    'fire_police',
    name:  'Fire & Police',
    types: ['fire_stations', 'police'],
    color: '#3b82f6',
    icon:  '🚒',
  },
]
