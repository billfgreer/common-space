import { useState, useRef, useEffect, useMemo } from 'react'
import { EVENTS } from '../lib/events.js'
import Header from './Header.jsx'
import styles from './Landing.module.css'

const CATEGORY_ORDER = ['Fire', 'Flood', 'Hurricane', 'Earthquake', 'Conflict', 'Other']

const CATEGORY_EMOJI = {
  Fire:       '🔥',
  Flood:      '🌊',
  Hurricane:  '🌀',
  Earthquake: '🌍',
  Conflict:   '⚔️',
  Other:      '◆',
}

const TYPE_TO_CATEGORY = {
  Wildfire:   'Fire',
  Flood:      'Flood',
  Hurricane:  'Hurricane',
  Cyclone:    'Hurricane',
  Typhoon:    'Hurricane',
  Earthquake: 'Earthquake',
  Conflict:   'Conflict',
}

function getCategory(type) {
  return TYPE_TO_CATEGORY[type] || 'Other'
}

// Compute ESRI World Imagery tile URL for a given center [lng, lat] and zoom
function esriTileUrl(center, zoom) {
  const [lng, lat] = center
  const n = Math.pow(2, zoom)
  const x = Math.floor((lng + 180) / 360 * n)
  const latRad = lat * Math.PI / 180
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n)
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${y}/${x}`
}

const SearchIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
)

export default function Landing({ onSelectEvent }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  const filtered = EVENTS.filter(e =>
    !query || e.name.toLowerCase().includes(query.toLowerCase()) || e.location.toLowerCase().includes(query.toLowerCase())
  )

  // Group disaster events by category, sorted chronologically within each group
  const categorizedEvents = useMemo(() => {
    const disasterEvents = EVENTS.filter(e => e.source !== 'satellogic')
    const groups = {}
    for (const cat of CATEGORY_ORDER) groups[cat] = []
    for (const event of disasterEvents) groups[getCategory(event.type)].push(event)
    for (const cat of CATEGORY_ORDER) {
      groups[cat].sort((a, b) => new Date(a.eventDate) - new Date(b.eventDate))
    }
    return CATEGORY_ORDER
      .filter(cat => groups[cat].length > 0)
      .map(cat => ({ cat, events: groups[cat] }))
  }, [])

  const satellogicEvents = useMemo(() => EVENTS.filter(e => e.source === 'satellogic'), [])

  useEffect(() => {
    function onClickOutside(e) {
      if (!wrapRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  return (
    <div className={styles.screen}>
      <Header />

      <div className={styles.hero}>
        <div className={styles.eyebrow}>Open Satellite Imagery</div>
        <h1 className={styles.title}>
          See Earth.<br />Before &amp; <span>After.</span>
        </h1>
        <p className={styles.sub}>
          Explore satellite imagery from major providers — search by disaster event, draw an area, and compare how places changed.
        </p>

        {/* Search */}
        <div className={styles.searchWrap} ref={wrapRef}>
          <span className={styles.searchIcon}><SearchIcon /></span>
          <input
            className={styles.searchInput}
            type="text"
            placeholder="Search by event or location…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => setOpen(true)}
            autoComplete="off"
          />

          {open && (
            <div className={styles.dropdown}>
              <div className={styles.dropdownLabel}>
                {query ? `${filtered.length} results` : 'Featured Events'}
              </div>
              {filtered.map(event => (
                <button
                  key={event.id}
                  className={styles.dropdownItem}
                  onClick={() => { setOpen(false); onSelectEvent(event) }}
                >
                  <span className={styles.dropdownIcon}>{event.emoji}</span>
                  <span className={styles.dropdownText}>
                    <span className={styles.dropdownName}>{event.name}</span>
                    <span className={styles.dropdownMeta}>{event.location} · {event.eventDate}</span>
                  </span>
                  <span className={styles.dropdownCount}>{event.imageCount} images</span>
                </button>
              ))}
              {filtered.length === 0 && (
                <div className={styles.dropdownEmpty}>No events match "{query}"</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Event grid — grouped by category */}
      <div className={styles.grid}>
        {categorizedEvents.map(({ cat, events }) => (
          <div key={cat} className={styles.categorySection}>
            <div className={styles.gridLabel}>
              <span className={styles.categoryEmoji}>{CATEGORY_EMOJI[cat]}</span>
              {cat}
            </div>
            <div className={styles.eventGrid}>
              {events.map(event => (
                <button
                  key={event.id}
                  className={styles.eventCard}
                  onClick={() => onSelectEvent(event)}
                >
                  <div className={styles.eventThumb} style={{ background: event.thumbGradient }}>
                    <img
                      src={esriTileUrl(event.center, Math.min(event.zoom, 12))}
                      alt=""
                      className={styles.eventThumbImg}
                      loading="lazy"
                    />
                    <span className={styles.eventBadge}>{event.type}</span>
                    <span className={styles.eventCount}>{event.imageCount}+ images</span>
                  </div>
                  <div className={styles.eventInfo}>
                    <div className={styles.eventName}>{event.name}</div>
                    <div className={styles.eventMeta}>
                      {event.location}{event.eventDate ? ` · ${new Date(event.eventDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}` : ''}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}

        {/* Satellogic open archive section */}
        <div className={styles.categorySection}>
          <div className={styles.gridLabel}>
            <span className={styles.categoryEmoji}>🛰</span>
            Open Archive · Satellogic EarthView · 1m GSD · CC-BY-4.0
          </div>
          <div className={styles.eventGrid}>
            {satellogicEvents.map(event => (
              <button
                key={event.id}
                className={styles.eventCard}
                onClick={() => onSelectEvent(event)}
              >
                <div className={styles.eventThumb} style={{ background: event.thumbGradient }}>
                  <img
                    src={esriTileUrl(event.center, Math.min(event.zoom, 12))}
                    alt=""
                    className={styles.eventThumbImg}
                    loading="lazy"
                  />
                  <span className={`${styles.eventBadge} ${styles.eventBadgeArchive}`}>Archive</span>
                  <span className={styles.eventSourceBadge}>Satellogic 1m</span>
                  <span className={styles.eventCount}>80+ images</span>
                </div>
                <div className={styles.eventInfo}>
                  <div className={styles.eventName}>{event.name}</div>
                  <div className={styles.eventMeta}>{event.location} · 2022</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
