import { useState, useEffect, useRef, useCallback } from 'react'
import Header from './Header.jsx'
import MapPanel from './MapPanel.jsx'
import ResultsPanel from './ResultsPanel.jsx'
import { streamEventItems } from '../lib/stac.js'
import styles from './Results.module.css'

export default function Results({ event, onBack, onHome, onCompare }) {
  const [items, setItems]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [hoveredId, setHoveredId] = useState(null)
  const [selected, setSelected]   = useState({ before: null, after: null })
  const [previewItem, setPreviewItem] = useState(null)
  const abortRef = useRef(null)

  // Fetch items whenever the event changes
  useEffect(() => {
    if (!event?.catalogUrl) return

    // Cancel any in-flight fetch for a previous event
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setItems([])
    setLoading(true)
    setSelected({ before: null, after: null })
    setPreviewItem(null)

    streamEventItems(event.catalogUrl, {
      maxItems: 80,
      eventDate: event.eventDate,
      signal: controller.signal,
      onItem: item => {
        if (!controller.signal.aborted) {
          setItems(prev => [...prev, item])
        }
      },
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false)
    })

    return () => controller.abort()
  }, [event?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Preview: just show this image on the map (primary exploration action)
  const handlePreview = useCallback((item) => {
    setPreviewItem(item)
  }, [])

  // Select for comparison: assign to before/after slot (also previews)
  const handleSelect = useCallback((item, timing) => {
    setPreviewItem(item)
    setSelected(prev => {
      if (prev[timing]?.id === item.id) return { ...prev, [timing]: null }
      return { ...prev, [timing]: item }
    })
  }, [])

  const handleCompare = useCallback(() => {
    if (selected.before && selected.after) {
      onCompare(selected.before, selected.after, event)
    }
  }, [selected, event, onCompare])

  return (
    <div className={styles.screen}>
      <Header event={event} onBack={onBack} backLabel="All Events" onHome={onHome} />
      <div className={styles.body}>
        <MapPanel
          event={event}
          items={items}
          hoveredId={hoveredId}
          selectedItems={selected}
          previewItem={previewItem}
          onItemClick={handleSelect}
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
