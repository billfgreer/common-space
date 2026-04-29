import { useState, useMemo } from 'react'
import { EVENTS } from '../lib/events.js'
import Header from './Header.jsx'
import styles from './Landing.module.css'

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_CATS = {
  Wildfire:   'Fire',
  Flood:      'Flood',
  Hurricane:  'Hurricane',
  Cyclone:    'Hurricane',
  Typhoon:    'Hurricane',
  Earthquake: 'Earthquake',
  Volcano:    'Volcano',
  Landslide:  'Landslide',
  Explosion:  'Other',
  Archive:    'Archive',
}

const CAT_FILTERS = [
  { id: 'all',        label: 'All Events', emoji: '🌐' },
  { id: 'Earthquake', label: 'Earthquake',  emoji: '🌍' },
  { id: 'Flood',      label: 'Flood',       emoji: '🌊' },
  { id: 'Fire',       label: 'Wildfire',    emoji: '🔥' },
  { id: 'Hurricane',  label: 'Hurricane',   emoji: '🌀' },
  { id: 'Volcano',    label: 'Volcano',     emoji: '🌋' },
  { id: 'Archive',    label: 'Archive',     emoji: '🛰' },
]

const DATA_TYPE_COLORS = {
  damage:     { bg: '#fef2f2', color: '#dc2626', label: 'Damage Map' },
  flood:      { bg: '#eff6ff', color: '#2563eb', label: 'Flood Extent' },
  shakemap:   { bg: '#f5f3ff', color: '#7c3aed', label: 'ShakeMap' },
  buildings:  { bg: '#fffbeb', color: '#d97706', label: 'Buildings' },
  roads:      { bg: '#f9fafb', color: '#6b7280', label: 'Roads' },
  admin:      { bg: '#f0fdf4', color: '#16a34a', label: 'Admin Bounds' },
  population: { bg: '#fdf4ff', color: '#9333ea', label: 'Population' },
}

// Compute ESRI tile URL for a center + zoom
function esriTileUrl(center, zoom) {
  const [lng, lat] = center
  const n = Math.pow(2, zoom)
  const x = Math.floor((lng + 180) / 360 * n)
  const latRad = lat * Math.PI / 180
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n)
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${y}/${x}`
}

function formatEventDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function getCategory(event) {
  return TYPE_CATS[event.type] || 'Other'
}

// ─── Search icon ──────────────────────────────────────────────────────────────
const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
)

// ─── Event card ───────────────────────────────────────────────────────────────
function EventCard({ event, onClick }) {
  const cat    = getCategory(event)
  const hdxSet = useMemo(() => {
    const types = new Set()
    event.hdxLayers?.forEach(l => types.add(l.type))
    return [...types]
  }, [event.hdxLayers])

  const isArchive = event.source === 'satellogic'

  return (
    <button className={styles.card} onClick={onClick}>
      {/* Satellite thumbnail */}
      <div className={styles.thumb} style={{ background: event.thumbGradient }}>
        <img
          src={esriTileUrl(event.center, Math.min(event.zoom, 12))}
          alt=""
          className={styles.thumbImg}
          loading="lazy"
        />
        <span className={`${styles.typeBadge} ${isArchive ? styles.typeBadgeArchive : ''}`}>
          {isArchive ? 'Archive' : event.type}
        </span>
        {isArchive && (
          <span className={styles.sourceBadge}>Satellogic 1m</span>
        )}
      </div>

      {/* Card body */}
      <div className={styles.body}>
        <div className={styles.cardName}>{event.name}</div>
        <div className={styles.cardMeta}>
          <span className={styles.cardLocation}>{event.location}</span>
          {event.eventDate && (
            <span className={styles.cardDate}>{formatEventDate(event.eventDate)}</span>
          )}
        </div>

        {/* Data availability */}
        <div className={styles.dataRow}>
          {/* Imagery pill */}
          <span className={styles.dataPill} style={{ background: 'rgba(10,175,184,.1)', color: '#0AAFB8', border: '1px solid rgba(10,175,184,.3)' }}>
            🛰 {event.imageCount}+ scenes
          </span>

          {/* HDX dataset pills */}
          {hdxSet.map(type => {
            const meta = DATA_TYPE_COLORS[type]
            if (!meta) return null
            return (
              <span
                key={type}
                className={styles.dataPill}
                style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.color}33` }}
              >
                {meta.label}
              </span>
            )
          })}
        </div>
      </div>
    </button>
  )
}

// ─── Landing page ─────────────────────────────────────────────────────────────
export default function Landing({ onSelectEvent }) {
  const [query,  setQuery]  = useState('')
  const [filter, setFilter] = useState('all')

  // Sort all events newest-first; archives go last
  const sortedEvents = useMemo(() => {
    const disasters = EVENTS
      .filter(e => e.source !== 'satellogic')
      .sort((a, b) => new Date(b.eventDate) - new Date(a.eventDate))
    const archives  = EVENTS.filter(e => e.source === 'satellogic')
    return [...disasters, ...archives]
  }, [])

  const visibleEvents = useMemo(() => {
    return sortedEvents.filter(e => {
      const matchesCat = filter === 'all' || getCategory(e) === filter
      const matchesQ   = !query
        || e.name.toLowerCase().includes(query.toLowerCase())
        || e.location.toLowerCase().includes(query.toLowerCase())
      return matchesCat && matchesQ
    })
  }, [sortedEvents, filter, query])

  // Hero featured event = most recent disaster
  const featured = sortedEvents.find(e => e.source !== 'satellogic')

  return (
    <div className={styles.screen}>
      <Header />

      {/* ── Hero ── */}
      <div className={styles.hero}>
        <div className={styles.eyebrow}>Open Crisis Geospatial Data</div>
        <h1 className={styles.title}>
          Satellite imagery &amp; field data<br />
          for every <span>major disaster.</span>
        </h1>
        <p className={styles.sub}>
          Browse satellite scenes from Maxar and Satellogic, load curated damage assessments, flood extents, and administrative boundaries — all in one place.
        </p>

        {/* Search */}
        <div className={styles.searchWrap}>
          <span className={styles.searchIcon}><SearchIcon /></span>
          <input
            className={styles.searchInput}
            type="text"
            placeholder="Search by event name or location…"
            value={query}
            onChange={e => { setQuery(e.target.value); setFilter('all') }}
            autoComplete="off"
          />
          {query && (
            <button className={styles.clearBtn} onClick={() => setQuery('')}>✕</button>
          )}
        </div>
      </div>

      {/* ── Featured event banner ── */}
      {!query && filter === 'all' && featured && (
        <div className={styles.featuredWrap}>
          <button className={styles.featured} onClick={() => onSelectEvent(featured)}>
            <div className={styles.featuredThumb} style={{ background: featured.thumbGradient }}>
              <img
                src={esriTileUrl(featured.center, Math.min(featured.zoom - 1, 11))}
                alt=""
                className={styles.featuredThumbImg}
                loading="lazy"
              />
              <div className={styles.featuredGradient} />
            </div>
            <div className={styles.featuredContent}>
              <span className={styles.featuredEyebrow}>Latest Event</span>
              <div className={styles.featuredName}>{featured.name}</div>
              <div className={styles.featuredMeta}>
                {featured.location} · {formatEventDate(featured.eventDate)}
              </div>
              <div className={styles.featuredData}>
                <span className={styles.dataPill} style={{ background: 'rgba(10,175,184,.15)', color: '#0AAFB8', border: '1px solid rgba(10,175,184,.4)' }}>
                  🛰 {featured.imageCount}+ satellite scenes
                </span>
                {featured.hdxLayers?.map(l => {
                  const meta = DATA_TYPE_COLORS[l.type]
                  return meta ? (
                    <span key={l.url} className={styles.dataPill}
                      style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.color}33` }}>
                      {meta.label}
                    </span>
                  ) : null
                })}
              </div>
              <div className={styles.featuredCta}>Open Event →</div>
            </div>
          </button>
        </div>
      )}

      {/* ── Filter tabs ── */}
      <div className={styles.filterBar}>
        {CAT_FILTERS.map(f => (
          <button
            key={f.id}
            className={`${styles.filterTab} ${filter === f.id ? styles.filterTabActive : ''}`}
            onClick={() => { setFilter(f.id); setQuery('') }}
          >
            <span className={styles.filterEmoji}>{f.emoji}</span>
            {f.label}
          </button>
        ))}
      </div>

      {/* ── Event grid ── */}
      <div className={styles.gridWrap}>
        {visibleEvents.length === 0 ? (
          <div className={styles.empty}>
            No events match "{query || filter}"
          </div>
        ) : (
          <div className={styles.grid}>
            {visibleEvents.map(event => (
              <EventCard key={event.id} event={event} onClick={() => onSelectEvent(event)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
