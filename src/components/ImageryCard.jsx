import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { cogThumbnailTileUrl } from '../lib/titiler.js'
import styles from './ImageryCard.module.css'

// ─── Icons ────────────────────────────────────────────────────────────────────

const CloudIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>
  </svg>
)

const DownloadIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
)

// ─── Portal tooltip ───────────────────────────────────────────────────────────
// Renders outside any overflow-clipping ancestor via document.body portal.

function Tip({ text }) {
  const [tipPos, setTipPos] = useState(null)
  const ref = useRef(null)

  function handleMouseEnter() {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    // prefer right side; fall back to left if too close to right edge
    const side = r.right + 230 < window.innerWidth ? 'right' : 'left'
    // clamp vertically so tooltip doesn't go off-screen
    const rawY = r.top + r.height / 2
    const clampedY = Math.max(30, Math.min(rawY, window.innerHeight - 80))
    setTipPos({ side, x: side === 'right' ? r.right + 10 : r.left - 10, y: clampedY })
  }

  function handleMouseLeave() { setTipPos(null) }

  return (
    <span
      ref={ref}
      className={styles.tip}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" opacity=".55">
        <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" fill="none" opacity=".7"/>
        <path d="M7.25 6.5h1.5v5h-1.5zm0-2.5h1.5v1.5h-1.5z"/>
      </svg>

      {tipPos && createPortal(
        <div
          className={styles.tipPortal}
          style={{
            left:  tipPos.side === 'right' ? tipPos.x      : undefined,
            right: tipPos.side === 'left'  ? window.innerWidth - tipPos.x : undefined,
            top:   tipPos.y,
            transform: 'translateY(-50%)',
          }}
        >
          {text}
        </div>,
        document.body
      )}
    </span>
  )
}

// ─── Metadata helpers ─────────────────────────────────────────────────────────

const CLOUD_SCALE = [
  { max: 5,   label: 'Excellent', color: '#22c55e' },
  { max: 15,  label: 'Good',      color: '#84cc16' },
  { max: 30,  label: 'Fair',      color: '#f59e0b' },
  { max: 100, label: 'Poor',      color: '#ef4444' },
]
const NADIR_SCALE = [
  { max: 10,  label: 'Excellent',  color: '#22c55e' },
  { max: 20,  label: 'Good',       color: '#84cc16' },
  { max: 30,  label: 'Fair',       color: '#f59e0b' },
  { max: 90,  label: 'Distorted',  color: '#ef4444' },
]
const GSD_SCALE = [
  { max: 0.5, label: 'Very high res', color: '#0AAFB8' },
  { max: 1.0, label: 'High res',      color: '#22c55e' },
  { max: 3.0, label: 'Medium res',    color: '#f59e0b' },
  { max: 999, label: 'Standard',      color: '#94a3b8' },
]

function getQuality(value, scale) {
  return scale.find(s => value <= s.max) || scale[scale.length - 1]
}

const TIPS = {
  cloudCover:    'Percentage of the image area obscured by clouds. Lower is better — images above 20% cloud cover are often unusable for change detection.',
  gsd:           'Ground Sample Distance — the real-world size of one pixel. Sub-meter GSD (< 1m) reveals individual vehicles and structures.',
  offNadir:      'Angle between the sensor and the point directly beneath it (nadir). Smaller angles produce less geometric distortion and more accurate measurements.',
  sunElevation:  'Angle of the sun above the horizon at capture time. Higher values (> 40°) mean shorter shadows and more evenly lit terrain.',
  sunAzimuth:    'Compass direction of the sun at capture time, measured clockwise from north. Determines which side of buildings and terrain is in shadow.',
  platform:      'The satellite that captured this image. Different platforms offer trade-offs in resolution, revisit frequency, and spectral bands.',
  instrument:    'The sensor or camera system onboard the satellite used to record the image.',
  processing:    'Level of radiometric and geometric correction applied to the raw data. Higher levels are more ready for quantitative analysis.',
  datetime:      'Date and time the center of the image was captured, in Coordinated Universal Time (UTC).',
  collection:    'The dataset collection or product line this image belongs to within the provider\'s catalog.',
  id:            'Unique identifier for this image in the STAC (SpatioTemporal Asset Catalog) metadata standard.',
  bbox:          'Geographic bounding box of the image: west longitude, south latitude, east longitude, north latitude (decimal degrees, WGS84).',
}

// ─── MetaModal sub-components ─────────────────────────────────────────────────

function SectionHead({ emoji, label }) {
  return (
    <div className={styles.sectionHead}>
      <span className={styles.sectionEmoji}>{emoji}</span>
      <span className={styles.sectionLabel}>{label}</span>
    </div>
  )
}

function StatCard({ label, tip, value, bar, barPct, barColor, badge, badgeColor }) {
  return (
    <div className={styles.statCard}>
      <div className={styles.statLabel}>{label}{tip && <Tip text={tip} />}</div>
      <div className={styles.statValue}>{value}</div>
      {bar && (
        <div className={styles.statBar}>
          <div className={styles.statFill} style={{ width: `${Math.min(100, barPct)}%`, background: barColor }} />
        </div>
      )}
      {badge && (
        <span className={styles.statBadge} style={{ color: badgeColor, borderColor: `${badgeColor}55` }}>
          {badge}
        </span>
      )}
    </div>
  )
}

function MetaRow({ label, value, tip, mono }) {
  if (value == null || value === '') return null
  return (
    <div className={styles.mRow}>
      <span className={styles.mKey}>{label}{tip && <Tip text={tip} />}</span>
      <span className={`${styles.mVal} ${mono ? styles.mMono : ''}`}>{String(value)}</span>
    </div>
  )
}

// ─── MetaModal ────────────────────────────────────────────────────────────────

function MetaModal({ item, onClose }) {
  const [showRaw, setShowRaw] = useState(false)

  const raw   = item.raw || {}
  const props = raw.properties || {}
  const assets = raw.assets || {}

  const cloudCover   = item.cloudCover
  const gsd          = item.gsd ?? props.gsd
  const offNadir     = props['view:off_nadir']
  const sunElevation = props['view:sun_elevation']
  const sunAzimuth   = props['view:sun_azimuth']

  const cloudQ = cloudCover != null ? getQuality(cloudCover, CLOUD_SCALE) : null
  const nadirQ = offNadir   != null ? getQuality(offNadir,   NADIR_SCALE) : null
  const gsdQ   = gsd        != null ? getQuality(gsd,        GSD_SCALE)   : null

  const platform = item.platform || props.platform
  const subtitle = [
    platform?.replace('worldview-', 'WV-').replace('WorldView-', 'WV-'),
    item.datetime?.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
  ].filter(Boolean).join(' · ')

  const hasStats   = cloudCover != null || gsd != null || offNadir != null
  const hasCapture = sunElevation != null || sunAzimuth != null
  const assetEntries = Object.entries(assets)

  return createPortal(
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className={styles.modalHeader}>
          <div>
            <div className={styles.modalTitle}>Image Metadata</div>
            {subtitle && <div className={styles.modalSubtitle}>{subtitle}</div>}
          </div>
          <button className={styles.modalClose} onClick={onClose}>✕</button>
        </div>

        <div className={styles.modalBody}>

          {/* ── Quality stats ── */}
          {hasStats && (
            <div className={styles.statsRow}>
              {cloudCover != null && (
                <StatCard
                  label="Cloud Cover" tip={TIPS.cloudCover}
                  value={`${Math.round(cloudCover)}%`}
                  bar barPct={cloudCover} barColor={cloudQ.color}
                  badge={cloudQ.label} badgeColor={cloudQ.color}
                />
              )}
              {gsd != null && (
                <StatCard
                  label="Resolution" tip={TIPS.gsd}
                  value={`${gsd}m GSD`}
                  badge={gsdQ.label} badgeColor={gsdQ.color}
                />
              )}
              {offNadir != null && (
                <StatCard
                  label="Off-nadir" tip={TIPS.offNadir}
                  value={`${offNadir}°`}
                  badge={nadirQ.label} badgeColor={nadirQ.color}
                />
              )}
            </div>
          )}

          {/* ── Sensor ── */}
          <SectionHead emoji="📡" label="Sensor" />
          <div className={styles.metaGroup}>
            <MetaRow label="Platform"   value={platform}                         tip={TIPS.platform}   />
            <MetaRow label="Instrument" value={props.instruments?.join(', ')}    tip={TIPS.instrument} />
            <MetaRow label="Processing" value={props['processing:level']}        tip={TIPS.processing} />
          </div>

          {/* ── Capture conditions ── */}
          {hasCapture && (
            <>
              <SectionHead emoji="☀️" label="Capture Conditions" />
              <div className={styles.metaGroup}>
                <MetaRow label="Sun Elevation" value={sunElevation != null ? `${sunElevation}°` : null} tip={TIPS.sunElevation} />
                <MetaRow label="Sun Azimuth"   value={sunAzimuth   != null ? `${sunAzimuth}°`   : null} tip={TIPS.sunAzimuth}   />
              </div>
            </>
          )}

          {/* ── Catalog ── */}
          <SectionHead emoji="🗂" label="Catalog" />
          <div className={styles.metaGroup}>
            <MetaRow label="Captured"     value={item.datetime?.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) + ' UTC'} tip={TIPS.datetime}   />
            <MetaRow label="Collection"   value={raw.collection}                   tip={TIPS.collection} />
            <MetaRow label="Image ID"     value={item.id}                          tip={TIPS.id}         mono />
            <MetaRow label="Bounding Box" value={item.bbox?.map(n => n.toFixed(4)).join(', ')} tip={TIPS.bbox} mono />
          </div>

          {/* ── Assets ── */}
          {assetEntries.length > 0 && (
            <>
              <SectionHead emoji="📦" label="Assets" />
              <div className={styles.assetList}>
                {assetEntries.map(([key, asset]) => {
                  const href = asset.href?.startsWith('http') ? asset.href : null
                  const ext  = asset.type?.split('/').pop()?.split('+')[0]?.toUpperCase()
                  return (
                    <a
                      key={key}
                      href={href || undefined}
                      target="_blank"
                      rel="noreferrer"
                      className={`${styles.assetChip} ${!href ? styles.assetChipDisabled : ''}`}
                      onClick={!href ? e => e.preventDefault() : undefined}
                      title={asset.href}
                    >
                      <span className={styles.assetName}>{key}</span>
                      {ext && <span className={styles.assetExt}>{ext}</span>}
                    </a>
                  )
                })}
              </div>
            </>
          )}

          {/* ── Raw JSON ── */}
          <button className={styles.rawToggle} onClick={() => setShowRaw(v => !v)}>
            <span className={styles.rawToggleArrow}>{showRaw ? '▼' : '▶'}</span>
            Raw JSON
          </button>
          {showRaw && (
            <pre className={styles.rawJson}>{JSON.stringify(raw, null, 2)}</pre>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

// ─── ImageryCard ──────────────────────────────────────────────────────────────

function formatDate(date) {
  if (!date) return 'Unknown date'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatPlatform(platform) {
  return platform.replace('worldview-', 'WV-').replace('WorldView-', 'WV-')
}

export default function ImageryCard({
  item,
  timing,        // 'before' | 'after'
  selected,      // false | 'before' | 'after'
  overlapPct,    // number 0-100 | null — overlap with the currently selected comparison item
  isBestPair,    // true | undefined
  isPreview,     // true | undefined — currently shown on map
  onSelect,
  onMouseEnter,
  onMouseLeave,
}) {
  const initSource = item.thumbnailUrl ? 'thumbnail' : item.cogUrl ? 'cog' : 'none'
  const [thumbSource, setThumbSource] = useState(initSource)
  const [showMeta, setShowMeta]       = useState(false)

  const thumbSrc = thumbSource === 'thumbnail' ? item.thumbnailUrl
                 : thumbSource === 'cog'       ? cogThumbnailTileUrl(item.cogUrl, item.bbox)
                 : null

  function handleThumbError() {
    if (thumbSource === 'thumbnail' && item.cogUrl) setThumbSource('cog')
    else setThumbSource('none')
  }

  const cardClass = [
    styles.card,
    selected === 'before' ? styles.selectedBefore : '',
    selected === 'after'  ? styles.selectedAfter  : '',
    isBestPair && !selected ? styles.bestPairCard : '',
  ].filter(Boolean).join(' ')

  function handleDownload(e) {
    e.stopPropagation()
    if (item.cogUrl) window.open(item.cogUrl, '_blank')
  }

  // Overlap indicator color
  const overlapColor = overlapPct == null ? null
    : overlapPct >= 60 ? '#22c55e'
    : overlapPct >= 30 ? '#f59e0b'
    : overlapPct >  0  ? '#ef4444'
    : '#94a3b8'

  return (
    <>
      <div
        className={cardClass}
        onClick={() => onSelect(item, timing)}
        onMouseEnter={() => onMouseEnter?.(item)}
        onMouseLeave={() => onMouseLeave?.()}
      >
        {/* Thumbnail */}
        <div className={styles.thumb}>
          {thumbSrc ? (
            <img src={thumbSrc} alt={`${timing} imagery`} className={styles.thumbImg} onError={handleThumbError} />
          ) : (
            <div className={styles.thumbPlaceholder} />
          )}
          <span className={`${styles.badge} ${timing === 'before' ? styles.badgeBefore : styles.badgeAfter}`}>
            {timing}
          </span>
          {isPreview && <span className={styles.onMapBadge}>◉ On map</span>}
        </div>

        {/* Body */}
        <div className={styles.body}>
          <div className={styles.top}>
            <div>
              <div className={styles.date}>{formatDate(item.datetime)}</div>
              <div className={styles.platform}>{formatPlatform(item.platform)}</div>
            </div>
            <div className={styles.topRight}>
              {item.cloudCover !== null && (
                <div className={styles.cloud}>
                  <CloudIcon />
                  {Math.round(item.cloudCover)}%
                </div>
              )}
            </div>
          </div>

          {/* Overlap indicator */}
          {overlapPct != null && (
            <div className={styles.overlapRow}>
              <div className={styles.overlapBar}>
                <div
                  className={styles.overlapFill}
                  style={{ width: `${overlapPct}%`, background: overlapColor }}
                />
              </div>
              <span className={styles.overlapLabel} style={{ color: overlapColor }}>
                {overlapPct}% overlap
              </span>
            </div>
          )}

          {/* Actions */}
          <div className={styles.actions}>
            {/* Primary: Download */}
            <button
              className={styles.actionDownload}
              onClick={handleDownload}
              title={item.cogUrl ? 'Download Cloud-Optimised GeoTIFF' : 'No download available'}
              disabled={!item.cogUrl}
            >
              <DownloadIcon /> Download
            </button>

            {/* Secondary: Compare */}
            <button
              className={`${styles.actionCompare} ${selected ? styles.actionCompareActive : ''}`}
              onClick={e => { e.stopPropagation(); onSelect(item, timing) }}
              title={selected ? 'Remove from comparison' : 'Add to comparison'}
            >
              {selected ? '✓' : '⊕'} Compare
            </button>

            {/* Info */}
            <button
              className={`${styles.actionInfo}`}
              onClick={e => { e.stopPropagation(); setShowMeta(true) }}
              title="View image metadata"
            >
              Info
            </button>
          </div>
        </div>
      </div>

      {showMeta && <MetaModal item={item} onClose={() => setShowMeta(false)} />}
    </>
  )
}
