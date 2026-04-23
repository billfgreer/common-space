import { useState, useMemo } from 'react'
import ImageryCard from './ImageryCard.jsx'
import styles from './ResultsPanel.module.css'

function bboxOverlaps(a, b) {
  if (!a || !b || a.length < 4 || b.length < 4) return false
  return a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]
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
  previewItemId,   // id of item currently shown on map
  onSelect,
  onHoverEnter,
  onHoverLeave,
  onCompare,
}) {
  const [sort, setSort]     = useState('date-asc')
  const [filter, setFilter] = useState('all')  // all | before | after

  // Decorate items with timing based on event date
  const decorated = useMemo(() => {
    if (!items.length) return []
    const eventMs = event ? new Date(event.eventDate).getTime() : null
    return items.map(item => ({
      ...item,
      timing: !eventMs || !item.datetime
        ? 'after'
        : item.datetime.getTime() <= eventMs
        ? 'before'
        : 'after',
    }))
  }, [items, event])

  // All before/after items (pre-sort/filter) used for best pair computation
  const allBefore = useMemo(() => decorated.filter(i => i.timing === 'before'), [decorated])
  const allAfter  = useMemo(() => decorated.filter(i => i.timing === 'after'),  [decorated])

  // Best pair: score by proximity to event date + low cloud cover, require bbox overlap
  const bestPair = useMemo(() => {
    if (!allBefore.length || !allAfter.length) return null
    const eventMs = event?.eventDate ? new Date(event.eventDate).getTime() : null

    function score(item) {
      let s = 100 - (item.cloudCover ?? 50)           // cloud bonus 0–100
      if (eventMs && item.datetime) {
        const days = Math.abs(item.datetime.getTime() - eventMs) / 86400000
        s += Math.max(0, 200 - days)                   // proximity bonus 0–200
      }
      return s
    }

    const topBefore = [...allBefore].sort((a, b) => score(b) - score(a)).slice(0, 10)
    const topAfter  = [...allAfter].sort((a, b)  => score(b) - score(a)).slice(0, 10)

    for (const b of topBefore) {
      for (const a of topAfter) {
        if (bboxOverlaps(b.bbox, a.bbox)) return { before: b, after: a }
      }
    }
    return { before: topBefore[0], after: topAfter[0] }  // fallback: no overlap
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

  const beforeItemsRaw = filtered.filter(i => i.timing === 'before')
  const afterItemsRaw  = filtered.filter(i => i.timing === 'after')

  // When an item is selected on one side, filter the other side to overlapping images only
  // Fall back to all images if nothing overlaps
  const beforeItems = useMemo(() => {
    if (!selectedItems.after) return beforeItemsRaw
    const overlapping = beforeItemsRaw.filter(i => bboxOverlaps(i.bbox, selectedItems.after.bbox))
    return overlapping.length ? overlapping : beforeItemsRaw
  }, [beforeItemsRaw, selectedItems.after])

  const afterItems = useMemo(() => {
    if (!selectedItems.before) return afterItemsRaw
    const overlapping = afterItemsRaw.filter(i => bboxOverlaps(i.bbox, selectedItems.before.bbox))
    return overlapping.length ? overlapping : afterItemsRaw
  }, [afterItemsRaw, selectedItems.before])

  const canCompare = selectedItems.before && selectedItems.after

  // Warn if selected pair doesn't overlap
  const selectedOverlap = canCompare
    ? bboxOverlaps(selectedItems.before.bbox, selectedItems.after.bbox)
    : true

  function isSelected(item) {
    if (selectedItems.before?.id === item.id) return 'before'
    if (selectedItems.after?.id  === item.id) return 'after'
    return false
  }

  // Does this item overlap with whatever is already selected on the other side?
  function overlapsSelected(item) {
    if (item.timing === 'after' && selectedItems.before)
      return bboxOverlaps(item.bbox, selectedItems.before.bbox)
    if (item.timing === 'before' && selectedItems.after)
      return bboxOverlaps(item.bbox, selectedItems.after.bbox)
    return null // no selection to compare against yet
  }

  return (
    <div className={styles.panel}>

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarTop}>
          <div className={styles.count}>
            {loading
              ? <span className={styles.loadingText}>Loading imagery…</span>
              : <><span className={styles.countNum}>{items.length}</span> images found</>
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

      {/* Compare nudge bar */}
      {(selectedItems.before || selectedItems.after) && (
        <div className={styles.compareBar}>
          <span className={styles.compareBarText}>
            {!selectedItems.before && 'Select a Before image'}
            {!selectedItems.after  && 'Select an After image'}
            {canCompare && selectedOverlap  && 'Ready to compare!'}
            {canCompare && !selectedOverlap && '⚠ These images don\'t overlap — pick images with matching areas'}
          </span>
          <button
            className={styles.compareBtn}
            onClick={onCompare}
            disabled={!canCompare}
          >
            Compare
          </button>
        </div>
      )}

      {/* Card list */}
      <div className={styles.list}>
        {loading && items.length === 0 && (
          <div className={styles.skeletonWrap}>
            {[...Array(4)].map((_, i) => <div key={i} className={styles.skeleton} />)}
          </div>
        )}

        {!loading && items.length === 0 && (
          <div className={styles.empty}>No imagery found for this event.</div>
        )}

        {beforeItems.length > 0 && (
          <>
            <div className={styles.groupLabel}>Before — {event?.eventDate}</div>

            {/* Best pair pin */}
            {bestPair?.before && (
              <>
                <div className={styles.bestPairHeader}>
                  <span className={styles.bestPairLabel}>★ Best Match</span>
                  <button
                    className={styles.selectPairBtn}
                    onClick={() => { onSelect(bestPair.before, 'before'); onSelect(bestPair.after, 'after') }}
                  >
                    Select Both ↗
                  </button>
                </div>
                <ImageryCard
                  key={`bp-${bestPair.before.id}`}
                  item={bestPair.before}
                  timing="before"
                  selected={isSelected(bestPair.before)}
                  overlapsSelected={overlapsSelected(bestPair.before)}
                  isBestPair={true}
                  isPreview={bestPair.before.id === previewItemId}
                  onSelect={onSelect}
                  onMouseEnter={onHoverEnter}
                  onMouseLeave={onHoverLeave}
                />
                {beforeItems.filter(i => i.id !== bestPair.before.id).length > 0 && (
                  <div className={styles.allImagesLabel}>All imagery</div>
                )}
              </>
            )}

            {beforeItems.filter(i => i.id !== bestPair?.before?.id).map(item => (
              <ImageryCard
                key={item.id}
                item={item}
                timing="before"
                selected={isSelected(item)}
                overlapsSelected={overlapsSelected(item)}
                isPreview={item.id === previewItemId}
                onSelect={onSelect}
                onMouseEnter={onHoverEnter}
                onMouseLeave={onHoverLeave}
              />
            ))}
          </>
        )}

        {afterItems.length > 0 && (
          <>
            <div className={styles.groupLabel} style={{ marginTop: beforeItems.length ? 8 : 0 }}>After — {event?.eventDate}</div>

            {/* Best pair pin */}
            {bestPair?.after && (
              <>
                <div className={styles.bestPairHeader}>
                  <span className={styles.bestPairLabel}>★ Best Match</span>
                </div>
                <ImageryCard
                  key={`bp-${bestPair.after.id}`}
                  item={bestPair.after}
                  timing="after"
                  selected={isSelected(bestPair.after)}
                  overlapsSelected={overlapsSelected(bestPair.after)}
                  isBestPair={true}
                  isPreview={bestPair.after.id === previewItemId}
                  onSelect={onSelect}
                  onMouseEnter={onHoverEnter}
                  onMouseLeave={onHoverLeave}
                />
                {afterItems.filter(i => i.id !== bestPair.after.id).length > 0 && (
                  <div className={styles.allImagesLabel}>All imagery</div>
                )}
              </>
            )}

            {afterItems.filter(i => i.id !== bestPair?.after?.id).map(item => (
              <ImageryCard
                key={item.id}
                item={item}
                timing="after"
                selected={isSelected(item)}
                overlapsSelected={overlapsSelected(item)}
                isPreview={item.id === previewItemId}
                onSelect={onSelect}
                onMouseEnter={onHoverEnter}
                onMouseLeave={onHoverLeave}
              />
            ))}
          </>
        )}

        {/* Show ungrouped items if no event date to compare against */}
        {beforeItems.length === 0 && afterItems.length === 0 && filtered.map(item => (
          <ImageryCard
            key={item.id}
            item={item}
            timing={item.timing}
            selected={isSelected(item)}
            isPreview={item.id === previewItemId}
            onSelect={onSelect}
            onMouseEnter={onHoverEnter}
            onMouseLeave={onHoverLeave}
          />
        ))}
      </div>
    </div>
  )
}
