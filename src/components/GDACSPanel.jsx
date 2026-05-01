import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { fetchGDACSEvents, ALERT_COLORS, EVENT_TYPE_META } from '../lib/gdacs.js'
import styles from './GDACSPanel.module.css'

const ALERT_LEVELS  = ['Red', 'Orange', 'Green']
const EVENT_TYPES   = ['EQ', 'TC', 'FL', 'VO', 'WF', 'DR']
const DAYS_OPTIONS  = [7, 14, 30]

function AlertDot({ level }) {
  return (
    <span
      className={styles.alertDot}
      style={{ background: ALERT_COLORS[level] ?? '#9ca3af' }}
    />
  )
}

export default function GDACSPanel({ anchorRect, onAddLayer, onClose }) {
  const [alertFilter, setAlertFilter] = useState('all')
  const [typeFilters, setTypeFilters] = useState([])    // empty = all types
  const [daysBack,    setDaysBack]    = useState(14)
  const [events,      setEvents]      = useState([])
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState(null)
  const abortRef = useRef(null)

  // ── Load events (re-fires whenever filters change) ────────────────────────
  const load = useCallback(async (alert, types, days) => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    setLoading(true)
    setError(null)
    try {
      const fc = await fetchGDACSEvents({
        alertLevel: alert,
        eventTypes: types,
        daysBack:   days,
        signal:     ctrl.signal,
      })
      if (!ctrl.signal.aborted) {
        // Flatten features into plain event objects, keeping geometry coords
        setEvents(fc.features.map(f => ({
          ...f.properties,
          lng: f.geometry.coordinates[0],
          lat: f.geometry.coordinates[1],
        })))
      }
    } catch (e) {
      if (!ctrl.signal.aborted) setError(e.message)
    } finally {
      if (!ctrl.signal.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(alertFilter, typeFilters, daysBack)
    return () => abortRef.current?.abort()
  }, [alertFilter, typeFilters, daysBack, load])

  // ── Filter handlers ───────────────────────────────────────────────────────

  function toggleType(t) {
    setTypeFilters(prev =>
      prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]
    )
  }

  // ── Add a single event as a point layer on the map ────────────────────────

  function handleAdd(ev) {
    const geojson = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [ev.lng, ev.lat] },
        properties: { ...ev },
      }],
    }
    const color = ALERT_COLORS[ev.alertLevel] ?? '#9ca3af'
    const meta  = EVENT_TYPE_META[ev.eventType]
    const name  = `GDACS · ${meta?.emoji ?? ''}${meta?.emoji ? ' ' : ''}${ev.title || ev.eventType}`
    onAddLayer(name, geojson, color)
    // Panel stays open — user can continue browsing
  }

  // ── Positioning (matches HDXPanel formula) ────────────────────────────────

  const panelStyle = anchorRect ? {
    position:  'fixed',
    left:      Math.max(8, anchorRect.left),
    bottom:    window.innerHeight - anchorRect.top + 8,
    maxHeight: Math.min(520, anchorRect.top - 20),
  } : {}

  const panel = (
    <div className={styles.panel} style={panelStyle}>

      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.gdacsIcon}>🌐</span>
          <span className={styles.title}>GDACS · Live Disaster Alerts</span>
        </div>
        <button className={styles.closeBtn} onClick={onClose}>✕</button>
      </div>

      {/* Filters */}
      <div className={styles.filters}>

        {/* Alert level */}
        <div className={styles.filterRow}>
          <span className={styles.filterLabel}>Alert</span>
          <div className={styles.chips}>
            <button
              className={[styles.chip, alertFilter === 'all' ? styles.chipActive : ''].filter(Boolean).join(' ')}
              onClick={() => setAlertFilter('all')}
            >
              All
            </button>
            {ALERT_LEVELS.map(level => (
              <button
                key={level}
                className={[
                  styles.chip,
                  alertFilter === level ? styles[`chip${level}Active`] : '',
                ].filter(Boolean).join(' ')}
                onClick={() => setAlertFilter(level)}
              >
                <AlertDot level={level} />
                {level}
              </button>
            ))}
          </div>
        </div>

        {/* Event type */}
        <div className={styles.filterRow}>
          <span className={styles.filterLabel}>Type</span>
          <div className={styles.chips}>
            {EVENT_TYPES.map(t => {
              const meta   = EVENT_TYPE_META[t]
              const active = typeFilters.includes(t)
              return (
                <button
                  key={t}
                  className={[styles.chip, active ? styles.chipActive : ''].filter(Boolean).join(' ')}
                  onClick={() => toggleType(t)}
                  title={meta?.label}
                >
                  {meta?.emoji} {t}
                </button>
              )
            })}
          </div>
        </div>

        {/* Days back */}
        <div className={styles.filterRow}>
          <span className={styles.filterLabel}>Period</span>
          <div className={styles.chips}>
            {DAYS_OPTIONS.map(d => (
              <button
                key={d}
                className={[styles.chip, daysBack === d ? styles.chipActive : ''].filter(Boolean).join(' ')}
                onClick={() => setDaysBack(d)}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>

      </div>

      {/* Body */}
      <div className={styles.body}>

        {loading && (
          <div className={styles.loadingState}>
            <div className={styles.spinner} />
            Loading GDACS alerts…
          </div>
        )}

        {error && !loading && (
          <div className={styles.errorState}>
            <strong>Failed to load</strong><br />{error}
          </div>
        )}

        {!loading && !error && events.length === 0 && (
          <div className={styles.emptyState}>
            No alerts found for this period and filter.
          </div>
        )}

        {!loading && events.length > 0 && (
          <>
            <div className={styles.resultCount}>
              {events.length} alert{events.length !== 1 ? 's' : ''} · last {daysBack} days
            </div>

            {events.map(ev => {
              const meta  = EVENT_TYPE_META[ev.eventType] ?? { emoji: '⚠️', label: ev.eventType }
              const color = ALERT_COLORS[ev.alertLevel] ?? '#9ca3af'
              return (
                <div key={ev.id} className={styles.eventCard}>
                  <div className={styles.cardTop}>
                    <AlertDot level={ev.alertLevel} />
                    <span className={styles.typeEmoji} title={meta.label}>{meta.emoji}</span>
                    <span className={styles.cardTitle}>{ev.title}</span>
                    {ev.country && <span className={styles.country}>{ev.country}</span>}
                  </div>

                  {(ev.fromDate || ev.severity) && (
                    <div className={styles.cardMeta}>
                      {ev.fromDate && <span>{ev.fromDate.slice(0, 10)}</span>}
                      {ev.severity && <span className={styles.severity}>{ev.severity}</span>}
                    </div>
                  )}

                  <div className={styles.cardActions}>
                    {ev.url && (
                      <a href={ev.url} target="_blank" rel="noreferrer" className={styles.gdacsLink}>
                        GDACS ↗
                      </a>
                    )}
                    <button
                      className={styles.addBtn}
                      style={{ borderColor: `${color}66`, color }}
                      onClick={() => handleAdd(ev)}
                    >
                      + Add to Map
                    </button>
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>

      {/* Footer */}
      <div className={styles.footer}>
        Data from{' '}
        <a href="https://www.gdacs.org" target="_blank" rel="noreferrer">gdacs.org</a>
        {' '}· Updated every 15 minutes
      </div>

    </div>
  )

  return createPortal(panel, document.body)
}
