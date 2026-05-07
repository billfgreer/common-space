/**
 * datasetStorage.js
 *
 * Persist loaded vector datasets per event in localStorage.
 * Datasets include the parsed GeoJSON so they reload instantly
 * without re-fetching. If storage is full we silently skip — the
 * datasets still work for the session, they just won't survive a reload.
 */

const KEY_PREFIX = 'common-space:datasets:'

export function loadEventDatasets(eventId) {
  if (!eventId) return []
  try {
    const raw = localStorage.getItem(KEY_PREFIX + eventId)
    if (!raw) return []
    return JSON.parse(raw)
  } catch { return [] }
}

export function saveEventDatasets(eventId, datasets) {
  if (!eventId) return
  try {
    localStorage.setItem(KEY_PREFIX + eventId, JSON.stringify(
      datasets.map(d => ({
        id:           d.id,
        name:         d.name,
        color:        d.color,
        visible:      d.visible,
        featureCount: d.featureCount,
        geojson:      d.geojson,
        sourceUrl:    d.sourceUrl ?? null,
      }))
    ))
  } catch {
    // QuotaExceededError — the GeoJSON is probably too large.
    // Sessions still work; persistence is just unavailable for this event.
  }
}

export function clearEventDatasets(eventId) {
  if (!eventId) return
  localStorage.removeItem(KEY_PREFIX + eventId)
}
