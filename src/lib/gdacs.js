// GDACS — Global Disaster Alerting Coordination System
// https://www.gdacs.org

import { GDACS_RSS } from './constants.js'

// CORS proxy fallback chain — same pattern as hdx.js
const PROXIES = [
  url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  url => `https://thingproxy.freeboard.io/fetch/${url}`,
]

export const ALERT_COLORS = {
  Red:    '#ef4444',
  Orange: '#f97316',
  Green:  '#22c55e',
}

export const EVENT_TYPE_META = {
  EQ: { emoji: '🌍', label: 'Earthquake' },
  TC: { emoji: '🌀', label: 'Cyclone'    },
  FL: { emoji: '🌊', label: 'Flood'      },
  VO: { emoji: '🌋', label: 'Volcano'    },
  WF: { emoji: '🔥', label: 'Wildfire'   },
  DR: { emoji: '☀️',  label: 'Drought'   },
}

async function fetchWithFallback(url, signal) {
  // 1. Direct
  try {
    const res = await fetch(url, { signal })
    if (res.ok) return res
  } catch (e) {
    if (e?.name === 'AbortError') throw e
  }

  // 2. Try each proxy
  let lastErr = new Error('All proxies failed')
  for (const makeProxy of PROXIES) {
    try {
      const res = await fetch(makeProxy(url), { signal })
      if (res.ok) return res
      lastErr = new Error(`Request failed (${res.status})`)
    } catch (e) {
      if (e?.name === 'AbortError') throw e
      lastErr = e
    }
  }
  throw lastErr
}

// Namespace-safe tag reader — works across browsers (avoids Safari querySelector issues)
function getTag(el, localName) {
  return el.getElementsByTagNameNS('*', localName)[0]?.textContent?.trim() ?? ''
}

// ─── Main fetch function ──────────────────────────────────────────────────────

export async function fetchGDACSEvents({
  eventTypes = [],      // e.g. ['EQ','TC'] — empty means all types
  alertLevel = 'all',   // 'Red' | 'Orange' | 'Green' | 'all'
  daysBack   = 14,
  signal,
} = {}) {
  const to   = new Date()
  const from = new Date(to)
  from.setDate(from.getDate() - daysBack)

  const params = new URLSearchParams({
    fromDate: from.toISOString().slice(0, 10),
    toDate:   to.toISOString().slice(0, 10),
  })
  if (eventTypes.length)    params.set('eventlist',  eventTypes.join(','))
  if (alertLevel !== 'all') params.set('alertlevel', alertLevel)

  const url = `${GDACS_RSS}?${params}`

  let xml
  try {
    const res = await fetchWithFallback(url, signal)
    xml = await res.text()
  } catch (e) {
    if (e?.name === 'AbortError') throw e
    throw new Error(`GDACS fetch failed: ${e.message}`)
  }

  const doc   = new DOMParser().parseFromString(xml, 'text/xml')
  const items = Array.from(doc.getElementsByTagName('item'))

  const features = []
  for (const item of items) {
    // GeoRSS geo:lat / geo:long — skip items with no coordinates
    const lat = parseFloat(getTag(item, 'lat'))
    const lng = parseFloat(getTag(item, 'long'))
    if (!isFinite(lat) || !isFinite(lng)) continue

    const alertlevel = getTag(item, 'alertlevel') || 'Green'
    const eventtype  = getTag(item, 'eventtype')  || ''
    const eventid    = getTag(item, 'eventid')    || String(Math.random())
    const eventname  = getTag(item, 'eventname')  ||
                       item.getElementsByTagName('title')[0]?.textContent?.trim() || ''
    const link       = item.getElementsByTagName('link')[0]?.textContent?.trim() || ''

    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: {
        id:         eventid,
        title:      eventname,
        alertLevel: alertlevel,
        eventType:  eventtype,
        severity:   getTag(item, 'severity'),
        population: getTag(item, 'population'),
        country:    getTag(item, 'country'),
        fromDate:   getTag(item, 'fromdate'),
        toDate:     getTag(item, 'todate'),
        url:        link,
      },
    })
  }

  return { type: 'FeatureCollection', features }
}
