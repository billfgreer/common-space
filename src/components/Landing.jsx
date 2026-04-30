import { useState, useMemo } from 'react'
import { EVENTS } from '../lib/events.js'
import { esriTileUrl, shortDate, impactScore, topStat, fmtNum, fmtCost } from '../lib/utils.js'
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

// ─── Provider metadata ────────────────────────────────────────────────────────

export const PROVIDER_META = {
  maxar:      { label: 'Maxar',       color: '#1a56db', bg: 'rgba(26,86,219,.1)',  border: 'rgba(26,86,219,.28)' },
  planet:     { label: 'Planet',      color: '#15803d', bg: 'rgba(21,128,61,.1)',  border: 'rgba(21,128,61,.28)' },
  satellogic: { label: 'Satellogic',  color: '#7c3aed', bg: 'rgba(124,58,237,.1)', border: 'rgba(124,58,237,.28)' },
  umbra:      { label: 'Umbra SAR',   color: '#b45309', bg: 'rgba(180,83,9,.1)',   border: 'rgba(180,83,9,.28)' },
}

const PROVIDER_FILTERS = [
  { id: 'all',        label: 'All Providers', dot: null },
  { id: 'maxar',      label: 'Maxar',         dot: '#1a56db' },
  { id: 'planet',     label: 'Planet',        dot: '#15803d' },
  { id: 'satellogic', label: 'Satellogic',    dot: '#7c3aed' },
  { id: 'umbra',      label: 'Umbra SAR',     dot: '#b45309' },
]

// Detect provider from source field or catalog URL
function getProvider(event) {
  if (event.source) return event.source
  const url = event.catalogUrl || ''
  if (url.includes('maxar-opendata')) return 'maxar'
  if (url.includes('planet.com'))     return 'planet'
  if (url.includes('satellogic'))     return 'satellogic'
  if (url.includes('umbra'))          return 'umbra'
  return 'maxar'
}

// Archive sources (non-disaster events pinned to bottom of list)
// Note: planet disaster events (Harvey) are NOT archives — only skysat
const ARCHIVE_SOURCES = new Set(['satellogic', 'umbra'])

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

function getCategory(event) { return TYPE_CATS[event.type] || 'Other' }

// ─── Search icon ──────────────────────────────────────────────────────────────
const SearchIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
)

// ─── Event card ───────────────────────────────────────────────────────────────
function EventCard({ event, onClick }) {
  const provider  = getProvider(event)
  const provMeta  = PROVIDER_META[provider]
  const isArchive = ARCHIVE_SOURCES.has(event.source) || event.type === 'Archive'
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
                {fmtNum(event.impact.displaced)} displaced
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
          {provMeta && (
            <span className={styles.dataPill}
              style={{ background: provMeta.bg, color: provMeta.color, border: `1px solid ${provMeta.border}` }}>
              {provMeta.label}
            </span>
          )}
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
  const [query,    setQuery]    = useState('')
  const [filter,   setFilter]   = useState('all')
  const [provider, setProvider] = useState('all')
  const [sort,     setSort]     = useState('impact')

  const baseEvents = useMemo(() => {
    const isArchive = e => ARCHIVE_SOURCES.has(e.source) || e.type === 'Archive'
    const disasters = EVENTS.filter(e => !isArchive(e))
    const archives  = EVENTS.filter(e => isArchive(e))
    // Sort disasters only — archives pin to bottom
    const sorted = [...disasters].sort((a, b) => {
      if (sort === 'impact') return impactScore(b) - impactScore(a)
      if (sort === 'cost')   return (b.impact?.costUSD ?? 0) - (a.impact?.costUSD ?? 0)
      return new Date(b.eventDate) - new Date(a.eventDate)  // recent
    })
    return [...sorted, ...archives]
  }, [sort])

  const visible = useMemo(() => baseEvents.filter(e => {
    const matchCat      = filter === 'all' || getCategory(e) === filter
    const matchProvider = provider === 'all' || getProvider(e) === provider
    const q = query.toLowerCase()
    const matchQ = !q || e.name.toLowerCase().includes(q) || e.location.toLowerCase().includes(q)
    return matchCat && matchProvider && matchQ
  }), [baseEvents, filter, provider, query])

  // Summary counts for the toolbar
  const totalEvents    = EVENTS.filter(e => !(ARCHIVE_SOURCES.has(e.source) || e.type === 'Archive')).length
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
              <span className={styles.heroRed}>{fmtNum(totalDeaths)} lives lost</span>
              <span className={styles.heroDot}>·</span>
              <span>{fmtNum(totalDisplaced)} displaced</span>
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

      {/* ── Provider filter buttons ── */}
      <div className={styles.providerRow}>
        <span className={styles.providerLabel}>Data source</span>
        <div className={styles.providerBar}>
          {PROVIDER_FILTERS.map(p => {
            const isActive = provider === p.id
            return (
              <button
                key={p.id}
                className={`${styles.providerBtn} ${isActive ? styles.providerBtnActive : ''}`}
                style={isActive && p.dot ? { borderColor: p.dot, color: p.dot } : {}}
                onClick={() => setProvider(p.id)}
              >
                {p.dot && (
                  <span
                    className={styles.providerDot}
                    style={{ background: p.dot, opacity: isActive ? 1 : 0.45 }}
                  />
                )}
                {p.label}
              </button>
            )
          })}
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
