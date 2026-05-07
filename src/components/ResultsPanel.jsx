import { useState, useMemo, useRef } from 'react'
import ImageryCard from './ImageryCard.jsx'
import { parseVectorFiles } from '../lib/vectorParse.js'
import styles from './ResultsPanel.module.css'

// ─── Geometry helpers ──────────────────────────────────────────────────────────

function bboxOverlapPct(a, b) {
  if (!a || !b || a.length < 4 || b.length < 4) return 0
  const ix1 = Math.max(a[0], b[0]), iy1 = Math.max(a[1], b[1])
  const ix2 = Math.min(a[2], b[2]), iy2 = Math.min(a[3], b[3])
  if (ix1 >= ix2 || iy1 >= iy2) return 0
  const inter = (ix2 - ix1) * (iy2 - iy1)
  const aArea = (a[2] - a[0]) * (a[3] - a[1])
  const bArea = (b[2] - b[0]) * (b[3] - b[1])
  const union = aArea + bArea - inter
  return union > 0 ? Math.round((inter / union) * 100) : 0
}

const SORT_OPTIONS = [
  { value: 'date-desc', label: 'Newest first' },
  { value: 'date-asc',  label: 'Oldest first' },
  { value: 'cloud',     label: 'Cloud cover' },
]

// ─── Type badge meta ───────────────────────────────────────────────────────────
const TYPE_META = {
  damage:    { label: 'Damage',    color: '#dc2626' },
  flood:     { label: 'Flood',     color: '#2563eb' },
  shakemap:  { label: 'ShakeMap',  color: '#7c3aed' },
  buildings: { label: 'Buildings', color: '#d97706' },
  roads:     { label: 'Roads',     color: '#6b7280' },
  admin:     { label: 'Admin',     color: '#059669' },
  population:{ label: 'Population',color: '#db2777' },
}

// ─── Icons ────────────────────────────────────────────────────────────────────
const DownloadIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="3" x2="12" y2="15"/>
  </svg>
)

const EyeIcon = ({ off }) => off ? (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
) : (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
)

// ─── Datasets tab ─────────────────────────────────────────────────────────────

function DatasetsTab({
  event, datasets,
  onAddDataset, onRemoveDataset, onToggleDataset, onChangeDatasetColor,
  hdxLayerLoading, hdxLayerErrors, onLoadHdxLayer,
}) {
  const [urlInput, setUrlInput]     = useState('')
  const [urlName, setUrlName]       = useState('')
  const [urlLoading, setUrlLoading] = useState(false)
  const [urlError, setUrlError]     = useState(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const urlInputRef = useRef(null)

  async function handleAddUrl() {
    const url = urlInput.trim()
    if (!url) return
    setUrlLoading(true)
    setUrlError(null)
    try {
      const resp = await fetch(url)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const blob = await resp.blob()
      const ext  = url.split('.').pop().split('?')[0].toLowerCase() || 'geojson'
      const name = urlName.trim() || url.split('/').pop().split('?')[0] || 'Dataset'
      const file = new File([blob], `${name}.${ext}`, { type: blob.type })
      const result = await parseVectorFiles([file])
      onAddDataset(name, result.geojson)
      setUrlInput('')
      setUrlName('')
      setShowAddForm(false)
    } catch (e) {
      setUrlError(e.message || 'Failed to load URL')
    } finally {
      setUrlLoading(false)
    }
  }

  function downloadDataset(ds) {
    if (!ds.geojson) return
    const json = JSON.stringify(ds.geojson, null, 2)
    const blob = new Blob([json], { type: 'application/geo+json' })
    const url  = URL.createObjectURL(blob)
    Object.assign(document.createElement('a'), {
      href: url,
      download: `${ds.name.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_')}.geojson`,
    }).click()
    URL.revokeObjectURL(url)
  }

  const hdxLayers = event?.hdxLayers ?? []

  return (
    <div className={styles.datasetTab}>

      {/* ── Event data layers (from the event definition) ── */}
      {hdxLayers.length > 0 && (
        <div className={styles.dsSection}>
          <div className={styles.dsSectionLabel}>Event Datasets</div>
          {hdxLayers.map(hdxLayer => {
            const key      = hdxLayer.url
            const isLoaded = datasets.some(d => d.name === hdxLayer.name)
            const isLoading = hdxLayerLoading[key]
            const err      = hdxLayerErrors[key]
            const meta     = TYPE_META[hdxLayer.type] || { label: hdxLayer.type, color: '#6b7280' }
            return (
              <div key={key} className={styles.dsEventRow}>
                <span
                  className={styles.dsTypeBadge}
                  style={{ background: `${meta.color}18`, color: meta.color, borderColor: `${meta.color}44` }}
                >
                  {meta.label}
                </span>
                <span className={styles.dsEventName} title={`${hdxLayer.name} · ${hdxLayer.source}`}>
                  {hdxLayer.name}
                </span>
                {isLoaded ? (
                  <span className={styles.dsLoaded}>✓ on map</span>
                ) : (
                  <button
                    className={`${styles.dsLoadBtn} ${err ? styles.dsLoadBtnRetry : ''}`}
                    disabled={!!isLoading}
                    onClick={() => onLoadHdxLayer?.(hdxLayer)}
                    title={`Load from ${hdxLayer.source || 'source'}`}
                  >
                    {isLoading ? <span className={styles.spinnerXs} /> : err ? 'Retry' : 'Add to Map'}
                  </button>
                )}
                {err && <div className={styles.dsErr}>{err}</div>}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Loaded datasets ── */}
      {datasets.length > 0 && (
        <div className={styles.dsSection}>
          <div className={styles.dsSectionLabel}>
            Active Layers
            <span className={styles.dsSectionCount}>{datasets.length}</span>
          </div>
          <div className={styles.dsLayerList}>
            {datasets.map(ds => (
              <div key={ds.id} className={`${styles.dsLayerRow} ${!ds.visible ? styles.dsLayerRowHidden : ''}`}>
                {/* Color swatch / picker */}
                <label className={styles.dsColorSwatch} style={{ background: ds.color }} title="Change color">
                  <input
                    type="color"
                    value={ds.color}
                    onChange={e => onChangeDatasetColor?.(ds.id, e.target.value)}
                    className={styles.colorInput}
                  />
                </label>

                <div className={styles.dsLayerMeta}>
                  <span className={styles.dsLayerName}>{ds.name}</span>
                  <span className={styles.dsLayerCount}>
                    {ds.featureCount !== undefined ? `${ds.featureCount} features` : ''}
                  </span>
                </div>

                <div className={styles.dsLayerActions}>
                  <button
                    className={styles.dsActionBtn}
                    onClick={() => onToggleDataset?.(ds.id)}
                    title={ds.visible ? 'Hide layer' : 'Show layer'}
                  >
                    <EyeIcon off={!ds.visible} />
                  </button>
                  {ds.geojson && (
                    <button className={styles.dsActionBtn} onClick={() => downloadDataset(ds)} title="Download GeoJSON">
                      <DownloadIcon />
                    </button>
                  )}
                  <button
                    className={`${styles.dsActionBtn} ${styles.dsRemoveBtn}`}
                    onClick={() => onRemoveDataset?.(ds.id)}
                    title="Remove layer"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Add dataset form ── */}
      <div className={styles.dsAddSection}>
        {!showAddForm ? (
          <button className={styles.dsAddBtn} onClick={() => { setShowAddForm(true); setTimeout(() => urlInputRef.current?.focus(), 50) }}>
            + Add dataset from URL
          </button>
        ) : (
          <div className={styles.dsAddForm}>
            <div className={styles.dsSectionLabel}>Add Dataset</div>
            <input
              ref={urlInputRef}
              className={styles.dsInput}
              placeholder="Name (optional)"
              value={urlName}
              onChange={e => setUrlName(e.target.value)}
            />
            <input
              className={styles.dsInput}
              placeholder="URL — GeoJSON, KML, or similar"
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddUrl()}
            />
            {urlError && <div className={styles.dsErr}>{urlError}</div>}
            <div className={styles.dsAddActions}>
              <button className={styles.dsCancelBtn} onClick={() => { setShowAddForm(false); setUrlError(null) }}>
                Cancel
              </button>
              <button
                className={styles.dsSubmitBtn}
                onClick={handleAddUrl}
                disabled={urlLoading || !urlInput.trim()}
              >
                {urlLoading ? 'Loading…' : 'Add to Map'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Empty state */}
      {hdxLayers.length === 0 && datasets.length === 0 && (
        <div className={styles.dsEmpty}>
          <div className={styles.dsEmptyIcon}>📂</div>
          <div className={styles.dsEmptyTitle}>No datasets yet</div>
          <div className={styles.dsEmptyText}>
            Add a URL above, or use the HDX / GDACS buttons on the map to discover datasets for this event.
          </div>
        </div>
      )}
    </div>
  )
}

// ─── ResultsPanel ──────────────────────────────────────────────────────────────

export default function ResultsPanel({
  items,
  loading,
  event,
  selectedItems,   // { before: item|null, after: item|null }
  previewItemId,
  onPreview,       // (item) => void — show image on map, primary action
  onSelect,        // (item, timing) => void — add to comparison
  onHoverEnter,
  onHoverLeave,
  onCompare,
  // Dataset props
  datasets = [],
  onAddDataset,
  onRemoveDataset,
  onToggleDataset,
  onChangeDatasetColor,
  hdxLayerLoading = {},
  hdxLayerErrors = {},
  onLoadHdxLayer,
}) {
  const [activeTab, setActiveTab] = useState('imagery')
  const [sort, setSort]       = useState('date-asc')
  const [filter, setFilter]   = useState('all')  // all | before | after
  const [pairOpen, setPairOpen] = useState(true)

  // Decorate items with timing based on event date
  const decorated = useMemo(() => {
    if (!items.length) return []
    const eventMs = event ? new Date(event.eventDate).getTime() : null
    return items.map(item => ({
      ...item,
      timing: !eventMs || !item.datetime
        ? 'after'
        : item.datetime.getTime() <= eventMs ? 'before' : 'after',
    }))
  }, [items, event])

  const allBefore = useMemo(() => decorated.filter(i => i.timing === 'before'), [decorated])
  const allAfter  = useMemo(() => decorated.filter(i => i.timing === 'after'),  [decorated])

  // Best pair: score by cloud cover + proximity to event + overlap
  const bestPair = useMemo(() => {
    if (!allBefore.length || !allAfter.length) return null
    const eventMs = event?.eventDate ? new Date(event.eventDate).getTime() : null

    function imgScore(item) {
      let s = 100 - (item.cloudCover ?? 50)
      if (eventMs && item.datetime) {
        const days = Math.abs(item.datetime.getTime() - eventMs) / 86400000
        s += Math.max(0, 200 - days)
      }
      return s
    }

    const topBefore = [...allBefore].sort((a, b) => imgScore(b) - imgScore(a)).slice(0, 12)
    const topAfter  = [...allAfter].sort((a, b)  => imgScore(b) - imgScore(a)).slice(0, 12)

    let best = null, bestScore = -Infinity
    for (const b of topBefore) {
      for (const a of topAfter) {
        const pct = bboxOverlapPct(b.bbox, a.bbox)
        if (pct === 0) continue
        const s = imgScore(b) + imgScore(a) + pct * 3
        if (s > bestScore) { bestScore = s; best = { before: b, after: a, overlapPct: pct } }
      }
    }
    if (best) return best
    return { before: topBefore[0], after: topAfter[0], overlapPct: 0 }
  }, [allBefore, allAfter, event])

  const sorted = useMemo(() => {
    const copy = [...decorated]
    if (sort === 'date-desc') copy.sort((a, b) => (b.datetime || 0) - (a.datetime || 0))
    if (sort === 'date-asc')  copy.sort((a, b) => (a.datetime || 0) - (b.datetime || 0))
    if (sort === 'cloud')     copy.sort((a, b) => (a.cloudCover ?? 100) - (b.cloudCover ?? 100))
    return copy
  }, [decorated, sort])

  const filtered = useMemo(() => {
    if (filter === 'all') return sorted
    return sorted.filter(i => i.timing === filter)
  }, [sorted, filter])

  const canCompare = !!(selectedItems.before && selectedItems.after)
  const selectedOverlapPct = canCompare
    ? bboxOverlapPct(selectedItems.before.bbox, selectedItems.after.bbox)
    : null

  function isSelected(item) {
    if (selectedItems.before?.id === item.id) return 'before'
    if (selectedItems.after?.id  === item.id) return 'after'
    return false
  }

  function overlapWithSelected(item) {
    if (item.timing === 'after' && selectedItems.before)
      return bboxOverlapPct(item.bbox, selectedItems.before.bbox)
    if (item.timing === 'before' && selectedItems.after)
      return bboxOverlapPct(item.bbox, selectedItems.after.bbox)
    return null
  }

  const showPairSection = !!(bestPair && filter === 'all')
  const mainList = filtered.filter(i =>
    !showPairSection || (i.id !== bestPair?.before?.id && i.id !== bestPair?.after?.id)
  )

  const hasEventDate = !!(event?.eventDate)

  return (
    <div className={styles.panel}>

      {/* ── Tab strip ── */}
      <div className={styles.tabStrip}>
        <button
          className={`${styles.tab} ${activeTab === 'imagery' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('imagery')}
        >
          Imagery
          {items.length > 0 && <span className={styles.tabBadge}>{items.length}</span>}
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'datasets' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('datasets')}
        >
          Datasets
          {datasets.length > 0 && <span className={styles.tabBadge}>{datasets.length}</span>}
        </button>
      </div>

      {/* ── Imagery tab ── */}
      {activeTab === 'imagery' && (
        <>
          {/* Toolbar */}
          <div className={styles.toolbar}>
            <div className={styles.toolbarTop}>
              <div className={styles.count}>
                {loading
                  ? <span className={styles.loadingText}>Loading imagery…</span>
                  : <><span className={styles.countNum}>{items.length}</span> images</>
                }
              </div>
              <select className={styles.sortSelect} value={sort} onChange={e => setSort(e.target.value)}>
                {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className={styles.filters}>
              {(hasEventDate ? ['all', 'before', 'after'] : ['all']).map(f => (
                <button
                  key={f}
                  className={[styles.chip, filter === f ? styles[`chip_${f}`] : ''].join(' ')}
                  onClick={() => setFilter(f)}
                >
                  {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Compare status bar */}
          {(selectedItems.before || selectedItems.after) && (
            <div className={styles.compareBar}>
              <div className={styles.compareBarLeft}>
                <span className={styles.compareBarTitle}>Comparing</span>
                <span className={styles.compareBarStatus}>
                  {!selectedItems.before && <span className={styles.slotEmpty}>Before not set</span>}
                  {selectedItems.before  && <span className={styles.slotFilled}>✓ Before</span>}
                  <span className={styles.slotDivider}>·</span>
                  {!selectedItems.after  && <span className={styles.slotEmpty}>After not set</span>}
                  {selectedItems.after   && <span className={styles.slotFilled}>✓ After</span>}
                  {canCompare && selectedOverlapPct > 0 && (
                    <span className={styles.overlapBadge}>{selectedOverlapPct}% overlap</span>
                  )}
                  {canCompare && selectedOverlapPct === 0 && (
                    <span className={styles.noOverlapBadge}>⚠ No overlap</span>
                  )}
                </span>
              </div>
              <button className={styles.compareBtn} onClick={onCompare} disabled={!canCompare}>
                Compare ↗
              </button>
            </div>
          )}

          {/* Scrollable list */}
          <div className={styles.list}>
            {loading && items.length === 0 && (
              <div className={styles.skeletonWrap}>
                {[...Array(5)].map((_, i) => <div key={i} className={styles.skeleton} />)}
              </div>
            )}

            {!loading && items.length === 0 && (
              <div className={styles.empty}>No imagery found for this event.</div>
            )}

            {/* Suggested pair */}
            {showPairSection && (
              <div className={styles.pairSection}>
                <button className={styles.pairToggle} onClick={() => setPairOpen(v => !v)}>
                  <span className={styles.pairToggleLeft}>
                    <span className={styles.pairStar}>★</span>
                    <span className={styles.pairToggleLabel}>Suggested Pair</span>
                    {bestPair.overlapPct > 0 && (
                      <span className={styles.pairOverlap}>{bestPair.overlapPct}% overlap</span>
                    )}
                  </span>
                  <span className={styles.pairToggleActions}>
                    <button
                      className={styles.selectBothBtn}
                      onClick={e => {
                        e.stopPropagation()
                        onSelect(bestPair.before, 'before')
                        onSelect(bestPair.after, 'after')
                      }}
                    >
                      Select Both
                    </button>
                    <span className={styles.pairCaret}>{pairOpen ? '▲' : '▼'}</span>
                  </span>
                </button>

                {pairOpen && (
                  <div className={styles.pairCards}>
                    <ImageryCard
                      key={`bp-b-${bestPair.before.id}`}
                      item={bestPair.before}
                      timing="before"
                      hasEventDate={hasEventDate}
                      selected={isSelected(bestPair.before)}
                      overlapPct={overlapWithSelected(bestPair.before)}
                      isBestPair={true}
                      isPreview={bestPair.before.id === previewItemId}
                      onPreview={onPreview}
                      onSelect={onSelect}
                      onMouseEnter={onHoverEnter}
                      onMouseLeave={onHoverLeave}
                    />
                    <ImageryCard
                      key={`bp-a-${bestPair.after.id}`}
                      item={bestPair.after}
                      timing="after"
                      hasEventDate={hasEventDate}
                      selected={isSelected(bestPair.after)}
                      overlapPct={overlapWithSelected(bestPair.after)}
                      isBestPair={true}
                      isPreview={bestPair.after.id === previewItemId}
                      onPreview={onPreview}
                      onSelect={onSelect}
                      onMouseEnter={onHoverEnter}
                      onMouseLeave={onHoverLeave}
                    />
                  </div>
                )}
              </div>
            )}

            {/* All imagery */}
            {filtered.length > 0 && (
              <>
                <div className={styles.listHeader}>
                  <span className={styles.listHeaderLabel}>All imagery</span>
                  <span className={styles.listHeaderCount}>{filtered.length}</span>
                </div>
                {mainList.map(item => (
                  <ImageryCard
                    key={item.id}
                    item={item}
                    timing={item.timing}
                    hasEventDate={hasEventDate}
                    selected={isSelected(item)}
                    overlapPct={overlapWithSelected(item)}
                    isPreview={item.id === previewItemId}
                    onPreview={onPreview}
                    onSelect={onSelect}
                    onMouseEnter={onHoverEnter}
                    onMouseLeave={onHoverLeave}
                  />
                ))}
              </>
            )}
          </div>
        </>
      )}

      {/* ── Datasets tab ── */}
      {activeTab === 'datasets' && (
        <DatasetsTab
          event={event}
          datasets={datasets}
          onAddDataset={onAddDataset}
          onRemoveDataset={onRemoveDataset}
          onToggleDataset={onToggleDataset}
          onChangeDatasetColor={onChangeDatasetColor}
          hdxLayerLoading={hdxLayerLoading}
          hdxLayerErrors={hdxLayerErrors}
          onLoadHdxLayer={onLoadHdxLayer}
        />
      )}
    </div>
  )
}
