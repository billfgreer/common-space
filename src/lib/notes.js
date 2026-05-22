/**
 * notes.js
 *
 * Community notes / after-action reports for each event.
 * Persisted in localStorage, keyed by event ID.
 *
 * Note schema:
 *   { id, timestamp, text, tags, attachments: [{ name, type, dataUrl }] }
 *
 * tags: one or more of 'general' | 'went-well' | 'didnt-go-well' | 'report'
 */

const KEY_PREFIX = 'common-space:notes:'

export const NOTE_TAGS = [
  { id: 'general',       label: 'General',         color: '#6b7280' },
  { id: 'went-well',     label: 'Went Well',        color: '#16a34a' },
  { id: 'didnt-go-well', label: "Didn't Go Well",   color: '#dc2626' },
  { id: 'report',        label: 'Report / Document', color: '#2563eb' },
]

export function loadEventNotes(eventId) {
  if (!eventId) return []
  try {
    const raw = localStorage.getItem(KEY_PREFIX + eventId)
    if (!raw) return []
    return JSON.parse(raw)
  } catch { return [] }
}

export function saveNote(eventId, note) {
  if (!eventId) return note
  const notes = loadEventNotes(eventId)
  const idx = notes.findIndex(n => n.id === note.id)
  if (idx >= 0) notes[idx] = note
  else notes.unshift(note)
  try {
    localStorage.setItem(KEY_PREFIX + eventId, JSON.stringify(notes))
  } catch { /* QuotaExceededError — silently skip */ }
  return note
}

export function deleteNote(eventId, noteId) {
  if (!eventId) return
  const notes = loadEventNotes(eventId).filter(n => n.id !== noteId)
  try {
    localStorage.setItem(KEY_PREFIX + eventId, JSON.stringify(notes))
  } catch { /* silently skip */ }
}
