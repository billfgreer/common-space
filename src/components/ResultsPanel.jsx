import { useState, useMemo } from 'react'
import ImageryCard from './ImageryCard.jsx'
import styles from './ResultsPanel.module.css'

function bboxOverlaps(a, b) {
  if (!a || !b || a.length < 4 || b.length < 4) return false
  return a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]
}

function bboxCenter(bbox) {
  return [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2]
}

function bboxDistance(a, b) {
  if (!a || !b) return Infinity
  const [ax, ay] = bboxCenter(a)
  const [bx, by] = bboxCenter(b)
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2)
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
            {beforeItems.map(item => (
              <ImageryCard
                key={item.id}
                item={item}
                timing="before"
                selected={isSelected(item)}
                overlapsSelected={overlapsSelected(item)}
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
            {afterItems.map(item => (
              <ImageryCard
                key={item.id}
                item={item}
                timing="after"
                selected={isSelected(item)}
                overlapsSelected={overlapsSelected(item)}
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
            onSelect={onSelect}
            onMouseEnter={onHoverEnter}
            onMouseLeave={onHoverLeave}
          />
        ))}
      </div>
    </div>
  )
}
