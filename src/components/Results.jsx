import { useState, useEffect, useRef, useCallback } from 'react'
import Header from './Header.jsx'
import MapPanel from './MapPanel.jsx'
import ResultsPanel from './ResultsPanel.jsx'
import { streamEventItems } from '../lib/stac.js'
import styles from './Results.module.css'

// How often (ms) to flush the item buffer to React state.
// Batching avoids an O(n) re-render for every single STAC item streamed —
// 500 items → ~25 flushes instead of 500 individual state updates.
const FLUSH_INTERVAL_MS = 80

export default function Results({ event, onBack, onHome, onCompare }) {
  const [items, setItems]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [hoveredId, setHoveredId] = useState(null)
  const [selected, setSelected]   = useState({ before: null, after: null })
  const [previewRequest, setPreviewRequest] = useState(null)
  const previewItem = previewRequest?.item ?? null

  const abortRef    = useRef(null)
  const bufferRef   = useRef([])    // Holds items between flush intervals
  const flushRef    = useRef(null)  // setInterval handle

  // Flush buffered items to React state in one batch
  const flush = useCallback(() => {
    if (!bufferRef.current.length) return
    const batch = bufferRef.current.splice(0)   // Drain buffer atomically
    setItems(prev => [...prev, ...batch])
  }, [])

  // Fetch items whenever the event changes
  useEffect(() => {
    if (!event?.catalogUrl) return

    // Abort any in-flight fetch for a previous event
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    // Reset state
    setItems([])
    setLoading(true)
    setSelected({ before: null, after: null })
    setPreviewRequest(null)
    bufferRef.current = []

    // Start periodic flush — items stream in asynchronously so we batch them
    // rather than triggering a React render for each individual arrival.
    clearInterval(flushRef.current)
    flushRef.current = setInterval(flush, FLUSH_INTERVAL_MS)

    streamEventItems(event.catalogUrl, {
      maxItems:  500,
      eventDate: event.eventDate,
      signal:    controller.signal,
      onItem:    item => {
        if (!controller.signal.aborted) bufferRef.current.push(item)
      },
    }).finally(() => {
      if (!controller.signal.aborted) {
        clearInterval(flushRef.current)
        flushRef.current = null
        flush()           // Final flush — emit any remaining buffered items
        setLoading(false)
      }
    })

    return () => {
      controller.abort()
      clearInterval(flushRef.current)
      flushRef.current  = null
      bufferRef.current = []
    }
  }, [event?.id, flush]) // eslint-disable-line react-hooks/exhaustive-deps

  const previewSeqRef = useRef(0)
  const handlePreview = useCallback((item) => {
    previewSeqRef.current += 1
    setPreviewRequest({ item, seq: previewSeqRef.current })
  }, [])

  const handleSelect = useCallback((item, timing) => {
    handlePreview(item)
    setSelected(prev => {
      if (prev[timing]?.id === item.id) return { ...prev, [timing]: null }
      return { ...prev, [timing]: item }
    })
  }, [handlePreview])

  const handleCompare = useCallback(() => {
    if (selected.before && selected.after) {
      onCompare(selected.before, selected.after, event)
    }
  }, [selected, event, onCompare])

  const handleSelectPair = useCallback((beforeItem, afterItem) => {
    setSelected({ before: beforeItem, after: afterItem })
    onCompare(beforeItem, afterItem, event)
  }, [event, onCompare])

  return (
    <div className={styles.screen}>
      <Header event={event} onBack={onBack} backLabel="All Events" onHome={onHome} />
      <div className={styles.body}>
        <MapPanel
          event={event}
          items={items}
          hoveredId={hoveredId}
          selectedItems={selected}
          previewRequest={previewRequest}
          onItemClick={handlePreview}
          onSelectPair={handleSelectPair}
        />
        <ResultsPanel
          items={items}
          loading={loading}
          event={event}
          selectedItems={selected}
          previewItemId={previewItem?.id}
          onPreview={handlePreview}
          onSelect={handleSelect}
          onHoverEnter={item => setHoveredId(item.id)}
          onHoverLeave={() => setHoveredId(null)}
          onCompare={handleCompare}
        />
      </div>
    </div>
  )
}
