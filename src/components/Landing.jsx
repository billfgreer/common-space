import { useState, useMemo } from 'react'
import { EVENTS } from '../lib/events.js'
import Header from './Header.jsx'
import styles from './Landing.module.css'

// ─── Category map ─────────────────────────────────────────────────────────────

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
  { id: 'all',        label: 'All',         emoji: '🌐' },
  { id: 'Earthquake', label: 'Earthquake',  emoji: '🌍' },
  { id: 'Flood',      label: 'Flood',       emoji: '🌊' },
  { id: 'Fire',       label: 'Wildfire',    emoji: '🔥' },
  { id: 'Hurricane',  label: 'Hurricane',   emoji: '🌀' },
  { id: 'Volcano',    label: 'Volcano',     emoji: '🌋' },
  { id: 'Archive',    label: 'Archive',     emoji: '🛰' },
]

const SORT_OPTIONS = [
  { id: 'impact', label: 'Human Impact' },
  { id: 'recent', label: 'Most Recent'  },
  { id: 'cost',   label: 'Economic Cost'},
]

const DATA_TYPE_COLORS = {
  damage:     { color: '#dc2626', label: 'Damage' },
  flood:      { color: '#2563eb', label: 'Flood'  },
  shakemap:   { color: '#7c3aed', label: 'ShakeMap' },
  buildings:  { color: '#d97706', label: 'Buildings' },
  admin:      { color: '#16a34a', label: 'Admin'  },
  population: { color: '#9333ea', label: 'Population' },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function esriTileUrl(center, zoom) {
  const [lng, lat] = center
  const n = Math.pow(2, zoom)
  const x = Math.floor((lng + 180) / 360 * n)
  const latRad = lat * Math.PI / 180
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n)
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${y}/${x}`
}

function getCategory(event) { return TYPE_CATS[event.type] || 'Other' }

// Weighted human-impact score: deaths matter most, then displaced, homes, cost
function impactScore(e) {
  const i = e.impact
  if (!i) return 0
  return i.deaths * 100 + i.displaced * 0.05 + i.homesDestroyed * 5 + i.costUSD * 0.5
}

function fmt(n) {
  if (!n) return null
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`
  return `${n}`
}

function fmtCost(usdM) {
  if (!usdM) return null
  if (usdM >= 1_000) return `$${(usdM / 1_000).toFixed(1).replace(/\.0$/, '')}B`
  return `$${usdM}M`
}

function shortDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

// Pick the single most alarming stat to show prominently on the card
function topStat(impact) {
  if (!impact) return null
  if (impact.deaths > 0)          return { label: 'lives lost',  value: fmt(impact.deaths),      red: true }
  if (impact.displaced > 0)       return { label: 'displaced',   value: fmt(impact.displaced),   red: false }
  if (impact.homesDestroyed > 0)  return { label: 'homes lost',  value: fmt(impact.homesDestroyed), red: false }
  if (impact.costUSD > 0)         return { label: 'est. damage', value: fmtCost(impact.costUSD), red: false }
  return null
}

// ─── Search icon ──────────────────────────────────────────────────────────────
const SearchIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
)

// ─── Event card ───────────────────────────────────────────────────────────────
function EventCard({ event, onClick }) {
  const isArchive = event.source === 'satellogic'
  const stat      = topStat(event.impact)
  const hdxTypes  = useMemo(() => {
    const seen = new Set()
    event.hdxLayers?.forEach(l => seen.add(l.type))
    return [...seen].slice(0, 3) // max 3 dataset pills on card
  }, [event.hdxLayers])

  return (
    <button className={styles.card} onClick={onClick}>
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
        {/* Top impact stat overlaid on thumbnail */}
        {stat && (
          <span className={`${styles.statBadge} ${stat.red ? styles.statBadgeRed : ''}`}>
            {stat.value} {stat.label}
          </span>
        )}
      </div>

      <div className={styles.body}>
        <div className={styles.cardName}>{event.name}</div>
        <div className={styles.cardMeta}>
          <span className={styles.cardLocation}>{event.location}</span>
          <span className={styles.cardDate}>{shortDate(event.eventDate)}</span>
        </div>

        {/* Secondary impact row */}
        {event.impact && (event.impact.displaced > 0 || event.impact.costUSD > 0) && (
          <div className={styles.impactRow}>
            {event.impact.displaced > 0 && (
              <span className={styles.impactChip}>
                <span className={styles.impactDot} style={{ background: '#f59e0b' }} />
                {fmt(event.impact.displaced)} displaced
              </span>
            )}
            {event.impact.costUSD > 0 && (
              <span className={styles.impactChip}>
                <span className={styles.impactDot} style={{ background: '#64748b' }} />
                {fmtCost(event.impact.costUSD)}
              </span>
            )}
          </div>
        )}

        {/* Data pills */}
        <div className={styles.dataRow}>
          <span className={styles.dataPill} style={{ background: 'rgba(10,175,184,.1)', color: '#0AAFB8', border: '1px solid rgba(10,175,184,.28)' }}>
            🛰 {event.imageCount}+
          </span>
          {hdxTypes.map(type => {
            const m = DATA_TYPE_COLORS[type]
            return m ? (
              <span key={type} className={styles.dataPill}
                style={{ background: `${m.color}15`, color: m.color, border: `1px solid ${m.color}33` }}>
                {m.label}
              </span>
            ) : null
          })}
        </div>
      </div>
    </button>
  )
}

// ─── Landing ──────────────────────────────────────────────────────────────────
export default function Landing({ onSelectEvent }) {
  const [query,  setQuery]  = useState('')
  const [filter, setFilter] = useState('all')
  const [sort,   setSort]   = useState('impact')

  const baseEvents = useMemo(() => {
    const disasters = EVENTS.filter(e => e.source !== 'satellogic')
    const archives  = EVENTS.filter(e => e.source === 'satellogic')
    // Sort disasters
    const sorted = [...disasters].sort((a, b) => {
      if (sort === 'impact') return impactScore(b) - impactScore(a)
      if (sort === 'cost')   return (b.impact?.costUSD ?? 0) - (a.impact?.costUSD ?? 0)
      return new Date(b.eventDate) - new Date(a.eventDate)  // recent
    })
    return [...sorted, ...archives]
  }, [sort])

  const visible = useMemo(() => baseEvents.filter(e => {
    const matchCat = filter === 'all' || getCategory(e) === filter
    const q = query.toLowerCase()
    const matchQ = !q || e.name.toLowerCase().includes(q) || e.location.toLowerCase().includes(q)
    return matchCat && matchQ
  }), [baseEvents, filter, query])

  // Summary counts for the toolbar
  const totalEvents    = EVENTS.filter(e => e.source !== 'satellogic').length
  const totalDeaths    = useMemo(() =>
    EVENTS.reduce((s, e) => s + (e.impact?.deaths ?? 0), 0), [])
  const totalDisplaced = useMemo(() =>
    EVENTS.reduce((s, e) => s + (e.impact?.displaced ?? 0), 0), [])

  return (
    <div className={styles.screen}>
      <Header />

      {/* ── Compact hero bar ── */}
      <div className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.heroLeft}>
            <div className={styles.heroTag}>Open Crisis Geospatial Data</div>
            <div className={styles.heroStats}>
              <span>{totalEvents} events</span>
              <span className={styles.heroDot}>·</span>
              <span className={styles.heroRed}>{fmt(totalDeaths)} lives lost</span>
              <span className={styles.heroDot}>·</span>
              <span>{fmt(totalDisplaced)} displaced</span>
            </div>
          </div>
          <div className={styles.heroSearch}>
            <span className={styles.searchIcon}><SearchIcon /></span>
            <input
              className={styles.searchInput}
              type="text"
              placeholder="Search events or locations…"
              value={query}
              onChange={e => { setQuery(e.target.value); setFilter('all') }}
              autoComplete="off"
            />
            {query && <button className={styles.clearBtn} onClick={() => setQuery('')}>✕</button>}
          </div>
        </div>
      </div>

      {/* ── Controls: filter tabs + sort ── */}
      <div className={styles.controls}>
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
        <div className={styles.sortBar}>
          <span className={styles.sortLabel}>Sort:</span>
          {SORT_OPTIONS.map(s => (
            <button
              key={s.id}
              className={`${styles.sortBtn} ${sort === s.id ? styles.sortBtnActive : ''}`}
              onClick={() => setSort(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Event grid ── */}
      <div className={styles.gridWrap}>
        {visible.length === 0 ? (
          <div className={styles.empty}>No events match "{query || filter}"</div>
        ) : (
          <div className={styles.grid}>
            {visible.map(event => (
              <EventCard key={event.id} event={event} onClick={() => onSelectEvent(event)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
