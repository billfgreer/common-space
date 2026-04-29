import { useState, useRef, useEffect, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import Header from './Header.jsx'
import { cogTileUrl } from '../lib/titiler.js'
import styles from './Compare.module.css'

function formatDate(date) {
  if (!date) return '—'
  // date may be a Date object or an ISO string (e.g. after JSON round-trip)
  const d = date instanceof Date ? date : new Date(date)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Compute intersection of two bboxes; returns null if they don't overlap
function bboxIntersection(a, b) {
  if (!a || !b || a.length < 4 || b.length < 4) return null
  const minX = Math.max(a[0], b[0])
  const minY = Math.max(a[1], b[1])
  const maxX = Math.min(a[2], b[2])
  const maxY = Math.min(a[3], b[3])
  if (minX >= maxX || minY >= maxY) return null
  return [minX, minY, maxX, maxY]
}

// Derive a sensible map center + zoom from a bbox
function mapViewFromBbox(bbox) {
  if (!bbox || bbox.length < 4) return { center: [36.9, 37.6], zoom: 11 }
  const cx = (bbox[0] + bbox[2]) / 2
  const cy = (bbox[1] + bbox[3]) / 2
  const span = Math.max(bbox[2] - bbox[0], bbox[3] - bbox[1])
  const zoom = span < 0.02 ? 14 : span < 0.05 ? 13 : span < 0.15 ? 12 : span < 0.4 ? 10 : 9
  return { center: [cx, cy], zoom }
}

function ShareIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
    </svg>
  )
}

function EmbedIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  )
}

export default function Compare({ beforeItem, afterItem, event, onBack, onHome }) {
  const [sliderPct, setSliderPct]   = useState(50)
  const [modal, setModal]           = useState(null)
  const [copied, setCopied]         = useState(false)
  const dragging     = useRef(false)
  const bodyRef      = useRef(null)
  const beforeMapEl  = useRef(null)
  const afterMapEl   = useRef(null)
  const beforeMapRef = useRef(null)
  const afterMapRef  = useRef(null)
  const syncing      = useRef(false) // prevent sync feedback loops

  // ── Initialize both maps ─────────────────────────────
  useEffect(() => {
    const overlap   = bboxIntersection(beforeItem?.bbox, afterItem?.bbox)
    const focusBbox = overlap || afterItem?.bbox || beforeItem?.bbox
    const view      = mapViewFromBbox(focusBbox)

    const baseStyle = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'

    const bMap = new maplibregl.Map({
      container: beforeMapEl.current,
      style: baseStyle,
      center: view.center,
      zoom: view.zoom,
    })
    bMap.addControl(new maplibregl.NavigationControl(), 'top-right')

    const aMap = new maplibregl.Map({
      container: afterMapEl.current,
      style: baseStyle,
      center: view.center,
      zoom: view.zoom,
      interactive: false,
      attributionControl: false,
    })

    // Fit to focus bbox and load both COG layers once maps are ready
    bMap.on('load', () => {
      if (focusBbox) {
        bMap.fitBounds(
          [[focusBbox[0], focusBbox[1]], [focusBbox[2], focusBbox[3]]],
          { padding: 20, duration: 0 }
        )
      }
      if (beforeItem?.cogUrl) {
        try {
          bMap.addSource('cog-before', { type: 'raster', tiles: [cogTileUrl(beforeItem.cogUrl)], tileSize: 256 })
          bMap.addLayer({ id: 'cog-before-layer', type: 'raster', source: 'cog-before', paint: { 'raster-opacity': 0.95 } })
        } catch (e) { console.warn('before COG error:', e) }
      }
    })

    // Sync after map whenever before map moves
    bMap.on('move', () => {
      if (syncing.current) return
      syncing.current = true
      aMap.jumpTo({
        center: bMap.getCenter(),
        zoom: bMap.getZoom(),
        bearing: bMap.getBearing(),
        pitch: bMap.getPitch(),
      })
      syncing.current = false
    })

    aMap.on('load', () => {
      if (afterItem?.cogUrl) {
        try {
          aMap.addSource('cog-after', { type: 'raster', tiles: [cogTileUrl(afterItem.cogUrl)], tileSize: 256 })
          aMap.addLayer({ id: 'cog-after-layer', type: 'raster', source: 'cog-after', paint: { 'raster-opacity': 0.95 } })
        } catch (e) { console.warn('after COG error:', e) }
      }
    })

    beforeMapRef.current = bMap
    afterMapRef.current  = aMap

    return () => {
      bMap.remove()
      aMap.remove()
      beforeMapRef.current = null
      afterMapRef.current  = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Slider drag ──────────────────────────────────────
  const updateSlider = useCallback((clientX) => {
    if (!bodyRef.current) return
    const rect = bodyRef.current.getBoundingClientRect()
    setSliderPct(Math.max(2, Math.min(98, ((clientX - rect.left) / rect.width) * 100)))
  }, [])

  useEffect(() => {
    const onMove = e => { if (dragging.current) updateSlider(e.clientX ?? e.touches?.[0]?.clientX) }
    const onUp   = () => { dragging.current = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend',  onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup',   onUp)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend',  onUp)
    }
  }, [updateSlider])

  // ── Share / Embed ─────────────────────────────────────
  const shareUrl  = `${window.location.origin}/compare?before=${encodeURIComponent(beforeItem?.id || '')}&after=${encodeURIComponent(afterItem?.id || '')}&event=${event?.id || ''}`
  const embedCode = `<iframe\n  src="${window.location.origin}/embed/compare?before=${encodeURIComponent(beforeItem?.id || '')}&after=${encodeURIComponent(afterItem?.id || '')}"\n  width="800" height="500"\n  frameborder="0" allowfullscreen>\n</iframe>`

  async function copyToClipboard() {
    await navigator.clipboard.writeText(modal === 'share' ? shareUrl : embedCode).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={styles.screen}>
      <Header
        event={event ? { name: `Comparing — ${event.name}` } : null}
        onBack={onBack}
        backLabel="Results"
        onHome={onHome}
      />

      {/* ── Comparison viewport ── */}
      <div className={styles.body} ref={bodyRef}>

        {/* Before map — full width, always visible */}
        <div className={styles.panel}>
          <div ref={beforeMapEl} className={styles.mapEl} />
          <span className={`${styles.label} ${styles.labelBefore}`}>
            Before · {formatDate(beforeItem?.datetime)}
          </span>
        </div>

        {/* After map — full width, clipped by slider */}
        <div
          className={`${styles.panel} ${styles.panelAfter}`}
          style={{ clipPath: `inset(0 ${100 - sliderPct}% 0 0)` }}
        >
          <div ref={afterMapEl} className={styles.mapEl} />
          <span className={`${styles.label} ${styles.labelAfter}`}>
            After · {formatDate(afterItem?.datetime)}
          </span>
        </div>

        {/* Drag handle */}
        <div
          className={styles.handle}
          style={{ left: `${sliderPct}%` }}
          onMouseDown={() => { dragging.current = true }}
          onTouchStart={() => { dragging.current = true }}
        >
          <div className={styles.grip}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
              <polyline points="9 18 3 12 9 6" transform="translate(9,0) scale(-1,1) translate(-9,0)"/>
            </svg>
          </div>
        </div>
      </div>

      {/* ── Metadata strip ── */}
      <div className={styles.meta}>
        <div className={styles.metaItem}>
          <span className={`${styles.metaBadge} ${styles.metaBefore}`}>Before</span>
          <span className={styles.metaText}>
            {formatDate(beforeItem?.datetime)} · {beforeItem?.platform || '—'}
          </span>
        </div>
        <div className={styles.metaDivider} />
        <div className={styles.metaItem}>
          <span className={`${styles.metaBadge} ${styles.metaAfter}`}>After</span>
          <span className={styles.metaText}>
            {formatDate(afterItem?.datetime)} · {afterItem?.platform || '—'}
            {afterItem?.cloudCover != null ? ` · ${Math.round(afterItem.cloudCover)}% cloud` : ''}
          </span>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className={styles.toolbar}>
        <button className="btn-ghost" onClick={() => setModal('share')}><ShareIcon /> Share link</button>
        <button className="btn-ghost" onClick={() => setModal('embed')}><EmbedIcon /> Embed</button>
        <div className={styles.toolbarSpacer} />
        {beforeItem?.cogUrl && (
          <button className="btn-ghost" onClick={() => window.open(beforeItem.cogUrl, '_blank')}>
            <DownloadIcon /> Download Before
          </button>
        )}
        {afterItem?.cogUrl && (
          <button className="btn-primary" style={{ fontSize: 13, padding: '8px 16px' }} onClick={() => window.open(afterItem.cogUrl, '_blank')}>
            <DownloadIcon /> Download After
          </button>
        )}
      </div>

      {/* ── Share / Embed modal ── */}
      {modal && (
        <div className={styles.overlay} onClick={e => { if (e.target === e.currentTarget) setModal(null) }}>
          <div className={styles.modalBox}>
            <div className={styles.modalHeader}>
              <span className={styles.modalTitle}>{modal === 'share' ? 'Share comparison' : 'Embed comparison'}</span>
              <button className={styles.modalClose} onClick={() => setModal(null)}>✕</button>
            </div>
            <div className={styles.modalTabs}>
              <button className={`${styles.tab} ${modal === 'share' ? styles.tabActive : ''}`} onClick={() => setModal('share')}>Link</button>
              <button className={`${styles.tab} ${modal === 'embed' ? styles.tabActive : ''}`} onClick={() => setModal('embed')}>Embed</button>
            </div>
            <pre className={styles.code}>{modal === 'share' ? shareUrl : embedCode}</pre>
            <button className={styles.copyBtn} onClick={copyToClipboard}>
              {copied ? 'Copied!' : 'Copy to clipboard'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
