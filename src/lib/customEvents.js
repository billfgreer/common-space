/**
 * customEvents.js
 *
 * CRUD helpers for user-created events, persisted in localStorage.
 * Custom events follow the same schema as static EVENTS but are flagged
 * with `isCustom: true` so the UI can offer edit/delete options.
 */

const KEY = 'common-space:custom-events'

export function loadCustomEvents() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    return JSON.parse(raw).map(e => ({ ...e, isCustom: true }))
  } catch { return [] }
}

export function saveCustomEvent(event) {
  const events = loadCustomEvents()
  const idx = events.findIndex(e => e.id === event.id)
  const toSave = { ...event, isCustom: true }
  if (idx >= 0) events[idx] = toSave
  else events.unshift(toSave)
  localStorage.setItem(KEY, JSON.stringify(events))
  return toSave
}

export function deleteCustomEvent(id) {
  const events = loadCustomEvents().filter(e => e.id !== id)
  localStorage.setItem(KEY, JSON.stringify(events))
}

// Disaster-type emoji map (shared with CreateEvent)
export const EVENT_TYPES = [
  { type: 'Earthquake', emoji: '🌍', label: 'Earthquake' },
  { type: 'Flood',      emoji: '🌊', label: 'Flood'      },
  { type: 'Wildfire',   emoji: '🔥', label: 'Wildfire'   },
  { type: 'Hurricane',  emoji: '🌀', label: 'Hurricane'  },
  { type: 'Cyclone',    emoji: '🌀', label: 'Cyclone'    },
  { type: 'Typhoon',    emoji: '🌀', label: 'Typhoon'    },
  { type: 'Volcano',    emoji: '🌋', label: 'Volcano'    },
  { type: 'Landslide',  emoji: '⛰',  label: 'Landslide'  },
  { type: 'Drought',    emoji: '☀️', label: 'Drought'    },
  { type: 'Tsunami',    emoji: '🌊', label: 'Tsunami'    },
  { type: 'Conflict',   emoji: '⚔️', label: 'Conflict'   },
  { type: 'Other',      emoji: '📍', label: 'Other'      },
]

const GRADIENTS = {
  Earthquake: 'linear-gradient(135deg,#6B5B45,#8B7355,#9B8B6A,#7A7A6A)',
  Flood:      'linear-gradient(150deg,#4A6A9B,#2E5A8A,#4A7AAD,#6A9AAD)',
  Wildfire:   'linear-gradient(155deg,#8B4513,#A0522D,#CD853F,#D2691E)',
  Hurricane:  'linear-gradient(120deg,#2D5A8E,#4A8BAD,#6BAD8E,#8BA06B)',
  Cyclone:    'linear-gradient(130deg,#2D6A8E,#4A9BAD,#6BAAAD,#3A7A9E)',
  Typhoon:    'linear-gradient(130deg,#2D6A8E,#4A9BAD,#6BAAAD,#3A7A9E)',
  Volcano:    'linear-gradient(160deg,#8B2500,#A03520,#C04520,#6A3010)',
  Landslide:  'linear-gradient(140deg,#4A6B3A,#6A8B5A,#5A7B4A,#3A5B2A)',
  Drought:    'linear-gradient(155deg,#8B7A3A,#A09040,#C0AA60,#6A7A4A)',
  Tsunami:    'linear-gradient(150deg,#2D5A8E,#1E4A8A,#4A8AAD,#6AAAD0)',
  Conflict:   'linear-gradient(145deg,#4A2020,#6A2A2A,#8A3A3A,#5A1A1A)',
  Other:      'linear-gradient(145deg,#4A5A6A,#6A7A8A,#5A6A7A,#3A4A5A)',
}

export function autoGradient(type) {
  return GRADIENTS[type] || GRADIENTS.Other
}

// Geocode a location string via Nominatim (free, no API key)
export async function geocodeLocation(query) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`
    const res  = await fetch(url, { headers: { 'Accept-Language': 'en' } })
    if (!res.ok) return null
    const data = await res.json()
    if (!data.length) return null
    const r = data[0]
    const lat = parseFloat(r.lat)
    const lon = parseFloat(r.lon)
    // Nominatim bbox: [west, east, south, north] (weird order)
    const bb = r.boundingbox?.map(Number)
    const bbox = bb ? [bb[2], bb[0], bb[3], bb[1]] : null  // [W,S,E,N]
    const span = bbox ? Math.max(bbox[2]-bbox[0], bbox[3]-bbox[1]) : 1
    const zoom = span < 0.02 ? 14 : span < 0.1 ? 12 : span < 0.5 ? 10 : span < 2 ? 8 : 6
    return { center: [lon, lat], zoom, bbox }
  } catch { return null }
}
