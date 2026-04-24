import { useState, useMemo } from 'react'
import ImageryCard from './ImageryCard.jsx'
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
}) {
  const [sort, setSort]       = useState('date-asc')
  const [filter, setFilter]   = useState('all')  // all | before | after
  const [pairOpen, setPairOpen] = useState(true)  // best pair suggestion collapsed?

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

  // Best pair: score by cloud cover + proximity to event + overlap (weighted heavily)
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

    // Find best pair maximizing combined score + overlap (overlap weighted 3× per %)
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

    // Fallback: no overlap, just best individual scores
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

  // Overlap % between this item and whatever is selected on the other slot
  function overlapWithSelected(item) {
    if (item.timing === 'after' && selectedItems.before)
      return bboxOverlapPct(item.bbox, selectedItems.before.bbox)
    if (item.timing === 'before' && selectedItems.after)
      return bboxOverlapPct(item.bbox, selectedItems.after.bbox)
    return null
  }

  // Items to show in main list — exclude best pair items only when the pair section is visible
  const showPairSection = !!(bestPair && filter === 'all')
  const mainList = filtered.filter(i =>
    !showPairSection || (i.id !== bestPair?.before?.id && i.id !== bestPair?.after?.id)
  )

  return (
    <div className={styles.panel}>

      {/* ── Toolbar ── */}
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
          {['all', 'before', 'after'].map(f => (
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

      {/* ── Compare status bar (only shown when actively comparing) ── */}
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

      {/* ── Scrollable list ── */}
      <div className={styles.list}>

        {/* Loading state */}
        {loading && items.length === 0 && (
          <div className={styles.skeletonWrap}>
            {[...Array(5)].map((_, i) => <div key={i} className={styles.skeleton} />)}
          </div>
        )}

        {!loading && items.length === 0 && (
          <div className={styles.empty}>No imagery found for this event.</div>
        )}

        {/* ── Suggested pair ── */}
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

        {/* ── All imagery ── */}
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
                selected={isSelected(item)}
                overlapPct={overlapWithSelected(item)}
                isPreview={item.id === previewItemId}
                onSelect={onSelect}
                onMouseEnter={onHoverEnter}
                onMouseLeave={onHoverLeave}
              />
            ))}
          </>
        )}
      </div>
    </div>
  )
}
