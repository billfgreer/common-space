import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { cogTileUrl } from '../lib/titiler.js'
import styles from './MapPanel.module.css'

const SOURCE_ID = 'footprints'

function buildGeoJSON(items, eventDate) {
  const eventMs = eventDate ? new Date(eventDate).getTime() : null
  return {
    type: 'FeatureCollection',
    features: items
      .filter(i => i.geometry)
      .map(i => {
        const timing = !eventMs || !i.datetime
          ? 'after'
          : i.datetime.getTime() <= eventMs
          ? 'before'
          : 'after'
        return {
          type: 'Feature',
          geometry: i.geometry,
          properties: { id: i.id, timing },
        }
      }),
  }
}

export default function MapPanel({ event, items, hoveredId, selectedItems, previewItem, onItemClick }) {
  const containerRef   = useRef(null)
  const mapRef         = useRef(null)
  const initialised    = useRef(false)

  // Stable refs so map event handlers never capture stale props
  const itemsRef       = useRef(items)
  const eventRef       = useRef(event)
  const onItemClickRef = useRef(onItemClick)
  const showBeforeRef  = useRef(true)
  const showAfterRef   = useRef(true)

  const [showBefore, setShowBefore] = useState(true)
  const [showAfter,  setShowAfter]  = useState(true)

  useEffect(() => { itemsRef.current       = items       }, [items])
  useEffect(() => { eventRef.current       = event       }, [event])
  useEffect(() => { onItemClickRef.current = onItemClick }, [onItemClick])
  useEffect(() => { showBeforeRef.current  = showBefore  }, [showBefore])
  useEffect(() => { showAfterRef.current   = showAfter   }, [showAfter])

  // ── Init map once ─────────────────────────────────────
  useEffect(() => {
    if (initialised.current) return
    initialised.current = true

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
      center: event?.center || [0, 20],
      zoom:   event?.zoom   || 3,
    })
    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    mapRef.current = map

    map.on('load', () => {
      map.addSource(SOURCE_ID, { type: 'geojson', data: buildGeoJSON([], null) })

      map.addLayer({
        id: 'fp-fill', type: 'fill', source: SOURCE_ID,
        paint: {
          'fill-color': ['case', ['==', ['get', 'timing'], 'before'], 'rgba(232,184,32,.15)', 'rgba(10,175,184,.15)'],
          'fill-opacity': 1,
        },
      })
      map.addLayer({
        id: 'fp-line', type: 'line', source: SOURCE_ID,
        paint: {
          'line-color': ['case', ['==', ['get', 'timing'], 'before'], '#E8B820', '#0AAFB8'],
          'line-width': 1.5, 'line-opacity': .8,
        },
      })
      map.addLayer({
        id: 'fp-hover', type: 'line', source: SOURCE_ID,
        filter: ['==', 'id', ''],
        paint: { 'line-color': '#ffffff', 'line-width': 2.5 },
      })
      map.addLayer({
        id: 'fp-selected', type: 'fill', source: SOURCE_ID,
        filter: ['in', 'id', ''],
        paint: { 'fill-color': 'rgba(200,57,138,.25)', 'fill-opacity': 1 },
      })

      // ── Click polygon → select item ───────────────────
      map.on('click', 'fp-fill', e => {
        const feature = e.features?.[0]
        if (!feature) return
        const item = itemsRef.current.find(i => i.id === feature.properties.id)
        if (!item) return
        const ev = eventRef.current
        const eventMs = ev?.eventDate ? new Date(ev.eventDate).getTime() : null
        const timing = !eventMs || !item.datetime
          ? 'after'
          : item.datetime.getTime() <= eventMs ? 'before' : 'after'
        onItemClickRef.current?.(item, timing)
      })
      map.on('mouseenter', 'fp-fill', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'fp-fill', () => { map.getCanvas().style.cursor = '' })
    })

    return () => {
      map.remove()
      mapRef.current = null
      initialised.current = false
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Footprints — update geometry + timing when items/event change ──
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const update = () => {
      const src = map.getSource(SOURCE_ID)
      if (src) src.setData(buildGeoJSON(items, event?.eventDate))
    }
    if (map.isStyleLoaded()) update()
    else { map.once('load', update); return () => map.off('load', update) }
  }, [items, event])

  // ── Hover highlight ───────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    map.setFilter('fp-hover', ['==', 'id', hoveredId || ''])
  }, [hoveredId])

  // ── Selected highlight ────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    const ids = Object.values(selectedItems || {}).filter(Boolean).map(i => i.id)
    map.setFilter('fp-selected', ids.length ? ['in', ['get', 'id'], ['literal', ids]] : ['==', 'id', ''])
  }, [selectedItems])

  // ── Before COG layer ──────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const apply = () => {
      try { if (map.getLayer('before-cog-layer')) map.removeLayer('before-cog-layer') } catch {}
      try { if (map.getSource('cog-before'))      map.removeSource('cog-before')      } catch {}
      if (!selectedItems.before?.cogUrl) return
      try {
        // Insert below after-cog-layer (if present), otherwise below footprints
        const anchor = map.getLayer('after-cog-layer') ? 'after-cog-layer'
                     : map.getLayer('fp-fill')         ? 'fp-fill'
                     : undefined
        map.addSource('cog-before', { type: 'raster', tiles: [cogTileUrl(selectedItems.before.cogUrl)], tileSize: 256 })
        map.addLayer({
          id: 'before-cog-layer', type: 'raster', source: 'cog-before',
          layout: { visibility: showBeforeRef.current ? 'visible' : 'none' },
          paint: { 'raster-opacity': 0.9 },
        }, anchor)
      } catch (e) { console.warn('before COG layer error:', e) }
    }
    if (map.isStyleLoaded()) apply()
    else { map.once('load', apply); return () => map.off('load', apply) }
  }, [selectedItems.before]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── After COG layer ───────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const apply = () => {
      try { if (map.getLayer('after-cog-layer')) map.removeLayer('after-cog-layer') } catch {}
      try { if (map.getSource('cog-after'))      map.removeSource('cog-after')      } catch {}
      if (!selectedItems.after?.cogUrl) return
      try {
        const anchor = map.getLayer('fp-fill') ? 'fp-fill' : undefined
        map.addSource('cog-after', { type: 'raster', tiles: [cogTileUrl(selectedItems.after.cogUrl)], tileSize: 256 })
        map.addLayer({
          id: 'after-cog-layer', type: 'raster', source: 'cog-after',
          layout: { visibility: showAfterRef.current ? 'visible' : 'none' },
          paint: { 'raster-opacity': 0.9 },
        }, anchor)
      } catch (e) { console.warn('after COG layer error:', e) }
    }
    if (map.isStyleLoaded()) apply()
    else { map.once('load', apply); return () => map.off('load', apply) }
  }, [selectedItems.after]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Toggle before visibility ──────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    try { map.setLayoutProperty('before-cog-layer', 'visibility', showBefore ? 'visible' : 'none') } catch {}
  }, [showBefore])

  // ── Toggle after visibility ───────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    try { map.setLayoutProperty('after-cog-layer', 'visibility', showAfter ? 'visible' : 'none') } catch {}
  }, [showAfter])

  // ── Zoom to previewItem bbox ──────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !previewItem?.bbox?.length) return
    const [minX, minY, maxX, maxY] = previewItem.bbox
    const apply = () => map.fitBounds([[minX, minY], [maxX, maxY]], { padding: 60, duration: 800, maxZoom: 16 })
    if (map.isStyleLoaded()) apply()
    else { map.once('load', apply); return () => map.off('load', apply) }
  }, [previewItem])

  // ── Fly to event ──────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !event) return
    const fly = () => map.flyTo({ center: event.center, zoom: event.zoom, duration: 800 })
    if (map.isStyleLoaded()) fly()
    else { map.once('load', fly) }
  }, [event?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const hasBefore = !!selectedItems?.before
  const hasAfter  = !!selectedItems?.after

  return (
    <div className={styles.wrap}>
      <div ref={containerRef} className={styles.map} />

      {/* Before / After layer toggles */}
      {(hasBefore || hasAfter) && (
        <div className={styles.toggleBar}>
          {hasBefore && (
            <button
              className={[styles.toggleBtn, styles.toggleBefore, showBefore ? '' : styles.toggleOff].filter(Boolean).join(' ')}
              onClick={() => setShowBefore(v => !v)}
              title={showBefore ? 'Hide before imagery' : 'Show before imagery'}
            >
              <span className={styles.toggleDot} />
              Before
            </button>
          )}
          {hasAfter && (
            <button
              className={[styles.toggleBtn, styles.toggleAfter, showAfter ? '' : styles.toggleOff].filter(Boolean).join(' ')}
              onClick={() => setShowAfter(v => !v)}
              title={showAfter ? 'Hide after imagery' : 'Show after imagery'}
            >
              <span className={styles.toggleDot} />
              After
            </button>
          )}
        </div>
      )}

      {/* Legend */}
      <div className={styles.legend}>
        <span className={styles.legendItem}>
          <span className={`${styles.dot} ${styles.before}`} />Before
        </span>
        <span className={styles.legendItem}>
          <span className={`${styles.dot} ${styles.after}`} />After
        </span>
      </div>
    </div>
  )
}
