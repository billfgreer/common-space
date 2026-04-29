import { useEffect, useRef, useState, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { cogTileUrl } from '../lib/titiler.js'
import { parseVectorFiles } from '../lib/vectorParse.js'
import { fetchHDXResource, formatToExt } from '../lib/hdx.js'
import HDXPanel from './HDXPanel.jsx'
import styles from './MapPanel.module.css'

const SOURCE_ID = 'footprints'

// Colour palette for successive uploaded layers
const UPLOAD_COLORS = [
  '#e74c3c', '#3498db', '#2ecc71', '#f39c12',
  '#9b59b6', '#1abc9c', '#e67e22', '#e91e63',
]

// Type badge colours for curated event data layers
const TYPE_META = {
  damage:    { label: 'Damage',    color: '#dc2626' },
  flood:     { label: 'Flood',     color: '#2563eb' },
  shakemap:  { label: 'ShakeMap',  color: '#7c3aed' },
  buildings: { label: 'Buildings', color: '#d97706' },
  roads:     { label: 'Roads',     color: '#6b7280' },
  admin:     { label: 'Admin',     color: '#059669' },
  population:{ label: 'Population',color: '#db2777' },
}

function buildGeoJSON(items, eventDate) {
  const eventMs = eventDate ? new Date(eventDate).getTime() : null
  return {
    type: 'FeatureCollection',
    features: items
      .filter(i => i.geometry)
      .map(i => {
        const timing = !eventMs || !i.datetime
          ? 'after'
          : i.datetime.getTime() <= eventMs ? 'before' : 'after'
        return {
          type: 'Feature',
          geometry: i.geometry,
          properties: { id: i.id, timing },
        }
      }),
  }
}

// ─── UploadButton ─────────────────────────────────────────────────────────────

const UploadIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="17 8 12 3 7 8"/>
    <line x1="12" y1="3" x2="12" y2="15"/>
  </svg>
)

// ─── MapPanel ─────────────────────────────────────────────────────────────────

export default function MapPanel({ event, items, hoveredId, selectedItems, previewRequest, onItemClick }) {
  const containerRef = useRef(null)
  const mapRef       = useRef(null)
  const initialised  = useRef(false)
  const fileInputRef   = useRef(null)
  const hdxBtnRef      = useRef(null)

  // Stable refs so map event handlers never capture stale props
  const itemsRef       = useRef(items)
  const eventRef       = useRef(event)
  const onItemClickRef = useRef(onItemClick)
  const showBeforeRef  = useRef(true)
  const showAfterRef   = useRef(true)

  const [showBefore, setShowBefore] = useState(true)
  const [showAfter,  setShowAfter]  = useState(true)
  const [showPreview, setShowPreview] = useState(true)

  // Uploaded vector layers: [{ id, name, color, visible, featureCount }]
  const [uploadedLayers, setUploadedLayers]   = useState([])
  const [uploadError, setUploadError]         = useState(null)
  const [uploading, setUploading]             = useState(false)
  const [isDragging, setIsDragging]           = useState(false)
  const [showHDX, setShowHDX]                 = useState(false)
  const [hdxAnchorRect, setHDXAnchorRect]     = useState(null)
  const uploadedLayersRef = useRef([])

  // Curated event data layer state: which are loading, which have errors
  const [hdxLayerLoading, setHdxLayerLoading] = useState({}) // key -> true
  const [hdxLayerErrors,  setHdxLayerErrors]  = useState({}) // key -> string

  useEffect(() => { itemsRef.current        = items       }, [items])
  useEffect(() => { eventRef.current        = event       }, [event])
  useEffect(() => { onItemClickRef.current  = onItemClick }, [onItemClick])
  useEffect(() => { showBeforeRef.current   = showBefore  }, [showBefore])
  useEffect(() => { showAfterRef.current    = showAfter   }, [showAfter])
  useEffect(() => { uploadedLayersRef.current = uploadedLayers }, [uploadedLayers])

  // ── Init map once ─────────────────────────────────────────────────────────
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

      map.on('click', 'fp-fill', e => {
        const feature = e.features?.[0]
        if (!feature) return
        const item = itemsRef.current.find(i => i.id === feature.properties.id)
        if (!item) return
        onItemClickRef.current?.(item)
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

  // ── Footprints ────────────────────────────────────────────────────────────
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

  // ── Hover highlight ───────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    map.setFilter('fp-hover', ['==', 'id', hoveredId || ''])
  }, [hoveredId])

  // ── Selected highlight ────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    const ids = Object.values(selectedItems || {}).filter(Boolean).map(i => i.id)
    map.setFilter('fp-selected', ids.length ? ['in', ['get', 'id'], ['literal', ids]] : ['==', 'id', ''])
  }, [selectedItems])

  // ── Before COG layer ──────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const apply = () => {
      try { if (map.getLayer('before-cog-layer')) map.removeLayer('before-cog-layer') } catch {}
      try { if (map.getSource('cog-before'))      map.removeSource('cog-before')      } catch {}
      if (!selectedItems.before?.cogUrl) return
      try {
        const anchor = map.getLayer('after-cog-layer') ? 'after-cog-layer'
                     : map.getLayer('fp-fill')         ? 'fp-fill' : undefined
        map.addSource('cog-before', { type: 'raster', tiles: [cogTileUrl(selectedItems.before.cogUrl)], tileSize: 256 })
        map.addLayer({ id: 'before-cog-layer', type: 'raster', source: 'cog-before',
          layout: { visibility: showBeforeRef.current ? 'visible' : 'none' },
          paint: { 'raster-opacity': 0.9 } }, anchor)
      } catch (e) { console.warn('before COG layer error:', e) }
    }
    if (map.isStyleLoaded()) apply()
    else { map.once('load', apply); return () => map.off('load', apply) }
  }, [selectedItems.before]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── After COG layer ───────────────────────────────────────────────────────
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
        map.addLayer({ id: 'after-cog-layer', type: 'raster', source: 'cog-after',
          layout: { visibility: showAfterRef.current ? 'visible' : 'none' },
          paint: { 'raster-opacity': 0.9 } }, anchor)
      } catch (e) { console.warn('after COG layer error:', e) }
    }
    if (map.isStyleLoaded()) apply()
    else { map.once('load', apply); return () => map.off('load', apply) }
  }, [selectedItems.after]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── COG toggle visibility ─────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    try { map.setLayoutProperty('before-cog-layer', 'visibility', showBefore ? 'visible' : 'none') } catch {}
  }, [showBefore])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    try { map.setLayoutProperty('after-cog-layer', 'visibility', showAfter ? 'visible' : 'none') } catch {}
  }, [showAfter])

  // ── Preview: fitBounds then load COG ─────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const item = previewRequest?.item

    const apply = () => {
      try { if (map.getLayer('preview-cog-layer')) map.removeLayer('preview-cog-layer') } catch {}
      try { if (map.getSource('cog-preview'))      map.removeSource('cog-preview')      } catch {}
      if (!item) return

      if (item.bbox?.length === 4) {
        const [minX, minY, maxX, maxY] = item.bbox
        map.fitBounds([[minX, minY], [maxX, maxY]], { padding: 60, duration: 600, maxZoom: 16 })
      }

      if (!item.cogUrl) return
      setTimeout(() => {
        if (!mapRef.current) return
        try { if (map.getLayer('preview-cog-layer')) map.removeLayer('preview-cog-layer') } catch {}
        try { if (map.getSource('cog-preview'))      map.removeSource('cog-preview')      } catch {}
        try {
          const anchor = map.getLayer('fp-line') ? 'fp-line' : map.getLayer('fp-fill') ? 'fp-fill' : undefined
          map.addSource('cog-preview', { type: 'raster', tiles: [cogTileUrl(item.cogUrl)], tileSize: 256 })
          map.addLayer({ id: 'preview-cog-layer', type: 'raster', source: 'cog-preview',
            layout: { visibility: 'visible' }, paint: { 'raster-opacity': 0.95 } }, anchor)
        } catch (e) { console.warn('preview COG layer error:', e) }
      }, 100)

      setShowPreview(true)
    }

    if (map.isStyleLoaded()) apply()
    else { map.once('load', apply); return () => map.off('load', apply) }
  }, [previewRequest]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    try { map.setLayoutProperty('preview-cog-layer', 'visibility', showPreview ? 'visible' : 'none') } catch {}
  }, [showPreview])

  // ── Fly to event ──────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !event) return
    const fly = () => map.flyTo({ center: event.center, zoom: event.zoom, duration: 800 })
    if (map.isStyleLoaded()) fly()
    else { map.once('load', fly) }
  }, [event?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Uploaded vector layers — sync to MapLibre ────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return

    for (const layer of uploadedLayers) {
      const fillId   = `upload-fill-${layer.id}`
      const lineId   = `upload-line-${layer.id}`
      const circleId = `upload-circle-${layer.id}`
      const srcId    = `upload-src-${layer.id}`
      const vis      = layer.visible ? 'visible' : 'none'

      // Source already added — just toggle visibility
      if (map.getSource(srcId)) {
        try { map.setLayoutProperty(fillId,   'visibility', vis) } catch {}
        try { map.setLayoutProperty(lineId,   'visibility', vis) } catch {}
        try { map.setLayoutProperty(circleId, 'visibility', vis) } catch {}
        continue
      }

      // Add new source + layers
      try {
        map.addSource(srcId, { type: 'geojson', data: layer.geojson })

        map.addLayer({
          id: fillId, type: 'fill', source: srcId,
          filter: ['==', ['geometry-type'], 'Polygon'],
          layout: { visibility: vis },
          paint: { 'fill-color': layer.color, 'fill-opacity': 0.2 },
        })
        map.addLayer({
          id: lineId, type: 'line', source: srcId,
          filter: ['any', ['==', ['geometry-type'], 'Polygon'], ['==', ['geometry-type'], 'LineString'],
                          ['==', ['geometry-type'], 'MultiPolygon'], ['==', ['geometry-type'], 'MultiLineString']],
          layout: { visibility: vis },
          paint: { 'line-color': layer.color, 'line-width': 2, 'line-opacity': 0.9 },
        })
        map.addLayer({
          id: circleId, type: 'circle', source: srcId,
          filter: ['any', ['==', ['geometry-type'], 'Point'], ['==', ['geometry-type'], 'MultiPoint']],
          layout: { visibility: vis },
          paint: { 'circle-radius': 5, 'circle-color': layer.color, 'circle-stroke-width': 1.5, 'circle-stroke-color': '#fff' },
        })
      } catch (e) { console.warn('upload layer error:', e) }
    }
  }, [uploadedLayers])

  // ── Shared: add a parsed GeoJSON layer to the map ────────────────────────
  const addLayer = useCallback((name, geojson) => {
    const map   = mapRef.current
    const color = UPLOAD_COLORS[uploadedLayersRef.current.length % UPLOAD_COLORS.length]
    const id    = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const featureCount = geojson.features?.length ?? 0

    if (map && featureCount > 0) {
      const coords = []
      geojson.features.forEach(f => collectCoords(f.geometry, coords))
      if (coords.length) {
        const lngs = coords.map(c => c[0]), lats = coords.map(c => c[1])
        const b = [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]]
        const apply = () => map.fitBounds(b, { padding: 60, duration: 700, maxZoom: 16 })
        if (map.isStyleLoaded()) apply()
        else map.once('load', apply)
      }
    }

    setUploadedLayers(prev => [...prev, { id, name, color, visible: true, featureCount, geojson }])
  }, [])

  // ── File upload parsing ───────────────────────────────────────────────────
  const handleFiles = useCallback(async (files) => {
    if (!files?.length) return
    setUploadError(null)
    setUploading(true)
    try {
      const { name, geojson } = await parseVectorFiles(files)
      addLayer(name, geojson)
    } catch (err) {
      setUploadError(err.message)
    } finally {
      setUploading(false)
    }
  }, [addLayer])

  // ── Load a pre-curated event data layer from HDX ─────────────────────────
  const handleLoadHdxLayer = useCallback(async (hdxLayer) => {
    const key = hdxLayer.url
    setHdxLayerLoading(prev => ({ ...prev, [key]: true }))
    setHdxLayerErrors(prev => ({ ...prev, [key]: null }))
    try {
      const blob = await fetchHDXResource(hdxLayer.url)
      const ext  = formatToExt(hdxLayer.format)
      const file = new File([blob], `${hdxLayer.name}.${ext}`, { type: blob.type })
      const { name, geojson } = await parseVectorFiles([file])
      addLayer(name, geojson)
    } catch (e) {
      setHdxLayerErrors(prev => ({ ...prev, [key]: e.message }))
    } finally {
      setHdxLayerLoading(prev => ({ ...prev, [key]: false }))
    }
  }, [addLayer])

  function removeLayer(layerId) {
    const map = mapRef.current
    if (map && map.isStyleLoaded()) {
      try { map.removeLayer(`upload-fill-${layerId}`)   } catch {}
      try { map.removeLayer(`upload-line-${layerId}`)   } catch {}
      try { map.removeLayer(`upload-circle-${layerId}`) } catch {}
      try { map.removeSource(`upload-src-${layerId}`)   } catch {}
    }
    setUploadedLayers(prev => prev.filter(l => l.id !== layerId))
  }

  function toggleLayer(layerId) {
    setUploadedLayers(prev => prev.map(l => l.id === layerId ? { ...l, visible: !l.visible } : l))
  }

  // Drag-and-drop onto the map container
  function onDragOver(e) { e.preventDefault(); setIsDragging(true) }
  function onDragLeave()  { setIsDragging(false) }
  function onDrop(e)      { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files) }

  const previewItem = previewRequest?.item ?? null
  const hasBefore   = !!selectedItems?.before
  const hasAfter    = !!selectedItems?.after
  const hasPreview  = !!previewItem?.cogUrl

  return (
    <div
      className={`${styles.wrap} ${isDragging ? styles.dragging : ''}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div ref={containerRef} className={styles.map} />

      {/* Drag overlay */}
      {isDragging && (
        <div className={styles.dragOverlay}>
          <div className={styles.dragBox}>
            <UploadIcon />
            <span>Drop vector file to add layer</span>
          </div>
        </div>
      )}

      {/* ── Top-left: COG layer toggles ── */}
      {(hasPreview || hasBefore || hasAfter) && (
        <div className={styles.toggleBar}>
          {hasPreview && (
            <button
              className={[styles.toggleBtn, styles.togglePreview, showPreview ? '' : styles.toggleOff].filter(Boolean).join(' ')}
              onClick={() => setShowPreview(v => !v)}
              title={showPreview ? 'Hide imagery' : 'Show imagery'}
            >
              <span className={styles.toggleDot} />
              {previewItem?.platform
                ? previewItem.platform.replace('worldview-', 'WV-').replace('WorldView-', 'WV-')
                : 'Image'}
            </button>
          )}
          {hasBefore && (
            <button
              className={[styles.toggleBtn, styles.toggleBefore, showBefore ? '' : styles.toggleOff].filter(Boolean).join(' ')}
              onClick={() => setShowBefore(v => !v)}
              title="Toggle before imagery"
            >
              <span className={styles.toggleDot} />Before
            </button>
          )}
          {hasAfter && (
            <button
              className={[styles.toggleBtn, styles.toggleAfter, showAfter ? '' : styles.toggleOff].filter(Boolean).join(' ')}
              onClick={() => setShowAfter(v => !v)}
              title="Toggle after imagery"
            >
              <span className={styles.toggleDot} />After
            </button>
          )}
        </div>
      )}

      {/* ── Bottom-left: Uploaded layers panel ── */}
      <div className={styles.layerPanel}>

        {/* Curated event data layers */}
        {event?.hdxLayers?.length > 0 && (
          <div className={styles.eventDataSection}>
            <div className={styles.eventDataLabel}>Event Data</div>
            {event.hdxLayers.map(hdxLayer => {
              const key      = hdxLayer.url
              const isLoaded = uploadedLayers.some(l => l.name === hdxLayer.name)
              const isLoading = hdxLayerLoading[key]
              const err      = hdxLayerErrors[key]
              const meta     = TYPE_META[hdxLayer.type] || { label: hdxLayer.type, color: '#6b7280' }
              return (
                <div key={key} className={styles.eventDataRow}>
                  <span
                    className={styles.eventDataType}
                    style={{ background: `${meta.color}22`, color: meta.color, borderColor: `${meta.color}55` }}
                  >
                    {meta.label}
                  </span>
                  <span className={styles.eventDataName} title={`${hdxLayer.name} · ${hdxLayer.source}`}>
                    {hdxLayer.name}
                  </span>
                  {isLoaded ? (
                    <span className={styles.eventDataLoaded}>✓</span>
                  ) : (
                    <button
                      className={styles.eventDataLoad}
                      disabled={!!isLoading}
                      onClick={() => handleLoadHdxLayer(hdxLayer)}
                      title={`Load from ${hdxLayer.source}`}
                    >
                      {isLoading ? <span className={styles.spinnerXs} /> : 'Load'}
                    </button>
                  )}
                  {err && <span className={styles.eventDataErr} title={err}>!</span>}
                </div>
              )
            })}
          </div>
        )}

        {/* Upload layers list */}
        {uploadedLayers.length > 0 && (
          <div className={styles.layerList}>
            {uploadedLayers.map(layer => (
              <div key={layer.id} className={styles.layerRow}>
                <button
                  className={`${styles.layerToggle} ${!layer.visible ? styles.layerToggleOff : ''}`}
                  onClick={() => toggleLayer(layer.id)}
                  title={layer.visible ? 'Hide layer' : 'Show layer'}
                >
                  <span className={styles.layerSwatch} style={{ background: layer.color }} />
                  <span className={styles.layerName}>{layer.name}</span>
                  <span className={styles.layerCount}>{layer.featureCount}</span>
                </button>
                <button className={styles.layerRemove} onClick={() => removeLayer(layer.id)} title="Remove layer">✕</button>
              </div>
            ))}
          </div>
        )}

        {/* Upload error */}
        {uploadError && (
          <div className={styles.uploadError}>
            <span>{uploadError}</span>
            <button onClick={() => setUploadError(null)}>✕</button>
          </div>
        )}

        {/* Action buttons */}
        <div className={styles.actionRow}>
          <button
            className={`${styles.uploadBtn} ${uploading ? styles.uploadBtnBusy : ''}`}
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            title="Upload GeoJSON, KML, or Shapefile"
          >
            <UploadIcon />
            {uploading ? 'Parsing…' : 'Add Layer'}
          </button>

          <button
            ref={hdxBtnRef}
            className={`${styles.uploadBtn} ${showHDX ? styles.uploadBtnActive : ''}`}
            onClick={() => {
              const rect = hdxBtnRef.current?.getBoundingClientRect()
              setHDXAnchorRect(rect ?? null)
              setShowHDX(v => !v)
            }}
            title="Search Humanitarian Data Exchange for datasets in this area"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            HDX
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".geojson,.json,.kml,.gpx,.shp,.dbf,.prj,.zip"
          style={{ display: 'none' }}
          onChange={e => { handleFiles(e.target.files); e.target.value = '' }}
        />
      </div>

      {/* HDX search panel — rendered via portal, positioned above the button */}
      {showHDX && (
        <HDXPanel
          anchorRect={hdxAnchorRect}
          bounds={mapRef.current?.getBounds?.() ?? null}
          eventName={event?.name ?? ''}
          onAdd={(name, geojson) => { addLayer(name, geojson); setShowHDX(false) }}
          onClose={() => setShowHDX(false)}
        />
      )}

      {/* Legend */}
      <div className={styles.legend}>
        <span className={styles.legendItem}><span className={`${styles.dot} ${styles.before}`} />Before</span>
        <span className={styles.legendItem}><span className={`${styles.dot} ${styles.after}`} />After</span>
      </div>
    </div>
  )
}

// ─── Helper: collect all coordinate pairs from a geometry ─────────────────────
function collectCoords(geom, out) {
  if (!geom) return
  switch (geom.type) {
    case 'Point':              out.push(geom.coordinates); break
    case 'MultiPoint':
    case 'LineString':         geom.coordinates.forEach(c => out.push(c)); break
    case 'MultiLineString':
    case 'Polygon':            geom.coordinates.forEach(r => r.forEach(c => out.push(c))); break
    case 'MultiPolygon':       geom.coordinates.forEach(p => p.forEach(r => r.forEach(c => out.push(c)))); break
    case 'GeometryCollection': geom.geometries?.forEach(g => collectCoords(g, out)); break
  }
}
