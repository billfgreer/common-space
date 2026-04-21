import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import styles from './MapPanel.module.css'

const SOURCE_ID = 'footprints'

function buildGeoJSON(items) {
  return {
    type: 'FeatureCollection',
    features: items
      .filter(i => i.geometry)
      .map(i => ({
        type: 'Feature',
        geometry: i.geometry,
        properties: { id: i.id, timing: i.timing },
      })),
  }
}

export default function MapPanel({ event, items, hoveredId, selectedItems }) {
  const containerRef = useRef(null)
  const mapRef       = useRef(null)
  const initialised  = useRef(false)

  // Init map once
  useEffect(() => {
    if (initialised.current) return
    initialised.current = true

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://demotiles.maplibre.org/style.json',
      center: event?.center || [0, 20],
      zoom:   event?.zoom   || 3,
    })
    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    mapRef.current = map

    map.on('load', () => {
      map.addSource(SOURCE_ID, { type: 'geojson', data: buildGeoJSON([]) })

      // Fill
      map.addLayer({
        id: 'fp-fill', type: 'fill', source: SOURCE_ID,
        paint: {
          'fill-color': ['case', ['==', ['get', 'timing'], 'before'], 'rgba(232,184,32,.15)', 'rgba(10,175,184,.15)'],
          'fill-opacity': 1,
        },
      })

      // Outline
      map.addLayer({
        id: 'fp-line', type: 'line', source: SOURCE_ID,
        paint: {
          'line-color': ['case', ['==', ['get', 'timing'], 'before'], '#E8B820', '#0AAFB8'],
          'line-width': 1.5, 'line-opacity': .8,
        },
      })

      // Hover highlight
      map.addLayer({
        id: 'fp-hover', type: 'line', source: SOURCE_ID,
        filter: ['==', 'id', ''],
        paint: { 'line-color': '#ffffff', 'line-width': 2.5 },
      })

      // Selected fills
      map.addLayer({
        id: 'fp-selected', type: 'fill', source: SOURCE_ID,
        filter: ['in', 'id', ''],
        paint: { 'fill-color': 'rgba(200,57,138,.25)', 'fill-opacity': 1 },
      })
    })

    return () => {
      map.remove()
      mapRef.current = null
      initialised.current = false
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Update footprints when items change (waits for style if not yet loaded)
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const update = () => {
      const src = map.getSource(SOURCE_ID)
      if (src) src.setData(buildGeoJSON(items))
    }
    if (map.isStyleLoaded()) {
      update()
    } else {
      map.once('load', update)
      return () => map.off('load', update)
    }
  }, [items])

  // Hover highlight
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    map.setFilter('fp-hover', ['==', 'id', hoveredId || ''])
  }, [hoveredId])

  // Selected highlight
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    const ids = Object.values(selectedItems || {})
      .filter(Boolean)
      .map(i => i.id)
    map.setFilter('fp-selected', ids.length ? ['in', ['get', 'id'], ['literal', ids]] : ['==', 'id', ''])
  }, [selectedItems])

  // Fly to event when it changes (wait for style to be ready)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !event) return
    const fly = () => map.flyTo({ center: event.center, zoom: event.zoom, duration: 800 })
    if (map.isStyleLoaded()) {
      fly()
    } else {
      map.once('load', fly)
    }
  }, [event?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={styles.wrap}>
      <div ref={containerRef} className={styles.map} />
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
