import { useEffect, useRef, useState, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { cogTileUrl, cogThumbnailTileUrl } from '../lib/titiler.js'
import { parseVectorFiles } from '../lib/vectorParse.js'
import { fetchHDXResource, fetchUSGSShakeMap, formatToExt } from '../lib/hdx.js'
import { fetchOSMLayer, OSM_LAYERS } from '../lib/osm.js'
import { MAPLIBRE_STYLE } from '../lib/constants.js'
import { formatPlatform, shortDate } from '../lib/utils.js'
import { exportWithLayers } from '../lib/export.js'
import HDXPanel   from './HDXPanel.jsx'
import GDACSPanel from './GDACSPanel.jsx'
import styles from './MapPanel.module.css'

const SOURCE_ID = 'footprints'

// Returns cogTileUrl options appropriate for the item's sensor type.
// SAR imagery (Umbra, etc.) is single-band floating-point — needs bidx=1 + grayscale colormap.
function cogOpts(item) {
  if (item?.isSAR) return { bidx: [1], rescale: '0,1500', colormapName: 'greys_r' }
  return {}
}

// Colour palette for successive uploaded layers
const UPLOAD_COLORS = [
  '#e74c3c', '#3498db', '#2ecc71', '#f39c12',
  '#9b59b6', '#1abc9c', '#e67e22', '#e91e63',
]

// ─── Stack Picker ─────────────────────────────────────────────────────────────
// Floating card anchored to a map click that lists every image stacked at that
// point. The user can see all options, pick one to load on the map, and optionally
// jump straight to a before/after comparison.

function StackRow({ item, isActive, onSelect }) {
  const [imgErr, setImgErr] = useState(false)
  const src = !imgErr && item.thumbnailUrl
    ? item.thumbnailUrl
    : item.cogUrl
    ? cogThumbnailTileUrl(item.cogUrl, item.bbox)
    : null

  return (
    <button
      className={`${styles.stackRow} ${isActive ? styles.stackRowActive : ''}`}
      onClick={() => onSelect(item)}
    >
      <div className={styles.stackThumb}>
        {src
          ? <img src={src} alt="" className={styles.stackThumbImg} onError={() => setImgErr(true)} />
          : <div className={styles.stackThumbBlank} />
        }
      </div>
      <div className={styles.stackMeta}>
        <div className={styles.stackDate}>{shortDate(item.datetime?.toISOString())}</div>
        <div className={styles.stackPlatform}>{formatPlatform(item.platform)}</div>
      </div>
      <div className={styles.stackRight}>
        <span className={`${styles.stackTiming} ${item.timing === 'before' ? styles.stackTimingBefore : styles.stackTimingAfter}`}>
          {item.timing}
        </span>
        {isActive && <span className={styles.stackOnMap}>◉</span>}
      </div>
    </button>
  )
}

function StackPicker({ x, y, items, onPreview, onCompare, onClose }) {
  const [activeId, setActiveId] = useState(items[0]?.id ?? null)

  const beforeItems = items.filter(i => i.timing === 'before')
  const afterItems  = items.filter(i => i.timing === 'after')
  const hasPair     = beforeItems.length > 0 && afterItems.length > 0
  const bestBefore  = hasPair ? [...beforeItems].sort((a, b) => (b.datetime ?? 0) - (a.datetime ?? 0))[0] : null
  const bestAfter   = hasPair ? [...afterItems].sort((a, b)  => (a.datetime ?? 0) - (b.datetime ?? 0))[0] : null

  function handleSelect(item) {
    setActiveId(item.id)
    onPreview(item)
  }

  return (
    <div className={styles.stackPicker} style={{ left: x, top: y }}>
      <div className={styles.stackPickerArrow} />
      <div className={styles.stackPickerHeader}>
        <span className={styles.stackPickerTitle}>
          {items.length} image{items.length !== 1 ? 's' : ''} at this location
        </span>
        <button className={styles.stackPickerClose} onClick={onClose}>✕</button>
      </div>
      <div className={styles.stackPickerList}>
        {items.map(item => (
          <StackRow
            key={item.id}
            item={item}
            isActive={item.id === activeId}
            onSelect={handleSelect}
          />
        ))}
      </div>
      {hasPair && (
        <div className={styles.stackPickerFooter}>
          <button
            className={styles.stackCompareBtn}
            onClick={() => { onCompare(bestBefore, bestAfter); onClose() }}
          >
            ↔ Compare Before / After
          </button>
        </div>
      )}
    </div>
  )
}

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

const DownloadIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="3" x2="12" y2="15"/>
  </svg>
)

// ─── MapPanel ─────────────────────────────────────────────────────────────────

export default function MapPanel({ event, items, hoveredId, selectedItems, previewRequest, onItemClick, onSelectPair }) {
  const containerRef       = useRef(null)
  const mapRef             = useRef(null)
  const initialised        = useRef(false)
  const fileInputRef       = useRef(null)
  const hdxBtnRef          = useRef(null)
  const gdacsBtnRef        = useRef(null)
  const popupRef           = useRef(null)   // reusable MapLibre popup for feature info
  const cursorLayersRef    = useRef(new Set()) // tracks which upload src IDs have cursor handlers

  // Stable refs so map event handlers never capture stale props
  const itemsRef        = useRef(items)
  const eventRef        = useRef(event)
  const onItemClickRef  = useRef(onItemClick)
  const onSelectPairRef = useRef(onSelectPair)
  const showBeforeRef   = useRef(true)
  const showAfterRef    = useRef(true)

  // Stack picker: shown when a map click finds 2+ overlapping footprints
  const [stackPicker, setStackPicker] = useState(null) // { x, y, items }

  const [showBefore, setShowBefore] = useState(true)
  const [showAfter,  setShowAfter]  = useState(true)
  const [showPreview, setShowPreview] = useState(true)

  // Uploaded vector layers: [{ id, name, color, visible, featureCount }]
  const [uploadedLayers, setUploadedLayers]   = useState([])
  const [uploadError, setUploadError]         = useState(null)
  const [uploading, setUploading]             = useState(false)
  const [isDragging, setIsDragging]           = useState(false)
  const [showHDX,   setShowHDX]       = useState(false)
  const [hdxAnchorRect, setHDXAnchorRect] = useState(null)
  const [showGDACS, setShowGDACS]     = useState(false)
  const [gdacsAnchorRect, setGDACSAnchorRect] = useState(null)
  const uploadedLayersRef = useRef([])

  // Curated event data layer state: which are loading, which have errors
  const [hdxLayerLoading, setHdxLayerLoading] = useState({}) // key -> true
  const [hdxLayerErrors,  setHdxLayerErrors]  = useState({}) // key -> string

  // OSM layer state
  const [osmLoading, setOsmLoading] = useState({}) // layerId -> true
  const [osmErrors,  setOsmErrors]  = useState({}) // layerId -> string

  // Export state
  const [exporting, setExporting]   = useState(false)
  const [exportErr, setExportErr]   = useState(null)

  useEffect(() => { itemsRef.current        = items        }, [items])
  useEffect(() => { eventRef.current        = event        }, [event])
  useEffect(() => { onItemClickRef.current  = onItemClick  }, [onItemClick])
  useEffect(() => { onSelectPairRef.current = onSelectPair }, [onSelectPair])
  useEffect(() => { showBeforeRef.current   = showBefore   }, [showBefore])
  useEffect(() => { showAfterRef.current    = showAfter    }, [showAfter])
  useEffect(() => { uploadedLayersRef.current = uploadedLayers }, [uploadedLayers])

  // ── Init map once ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (initialised.current) return
    initialised.current = true

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAPLIBRE_STYLE,
      center: event?.center || [0, 20],
      zoom:   event?.zoom   || 3,
      preserveDrawingBuffer: true, // required for canvas → PNG export
    })
    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    mapRef.current = map
    popupRef.current = new maplibregl.Popup({ closeButton: true, maxWidth: '420px' })

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
        // Query ALL footprints at this point, deduplicate by id
        const allFeatures = map.queryRenderedFeatures(e.point, { layers: ['fp-fill'] })
        const seen = new Set()
        const allItems = allFeatures
          .map(f => itemsRef.current.find(i => i.id === f.properties.id))
          .filter(Boolean)
          .filter(item => { if (seen.has(item.id)) return false; seen.add(item.id); return true })

        if (!allItems.length) return

        // Always preview the first item immediately
        onItemClickRef.current?.(allItems[0])

        if (allItems.length > 1) {
          // Multiple images — show the stack picker so user can browse and choose
          const rect = e.target.getContainer().getBoundingClientRect()
          setStackPicker({
            x: e.originalEvent.clientX - rect.left,
            y: e.originalEvent.clientY - rect.top,
            items: allItems,
          })
        } else {
          // Single image — preview directly, no picker needed
          setStackPicker(null)
        }
      })
      map.on('mouseenter', 'fp-fill', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'fp-fill', () => { map.getCanvas().style.cursor = '' })

      // Generic click handler — shows popup for any uploaded vector feature (OSM, HDX, GDACS, uploads)
      map.on('click', e => {
        const ids = uploadedLayersRef.current.flatMap(l => [
          `upload-fill-${l.id}`, `upload-line-${l.id}`, `upload-circle-${l.id}`,
        ]).filter(id => { try { return !!map.getLayer(id) } catch { return false } })
        if (!ids.length) return
        // Use a small bbox instead of a single pixel — makes thin lines and small circles
        // reliably clickable (MapLibre's default point tolerance is only 3px).
        const { x, y } = e.point
        const bbox = [[x - 6, y - 6], [x + 6, y + 6]]
        const features = map.queryRenderedFeatures(bbox, { layers: ids })
        if (!features.length) return
        popupRef.current
          .setLngLat(e.lngLat)
          .setHTML(buildPopupHtml(features[0].properties))
          .addTo(map)
      })
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
    const item = selectedItems.before
    const apply = () => {
      try { if (map.getLayer('before-cog-layer')) map.removeLayer('before-cog-layer') } catch {}
      try { if (map.getSource('cog-before'))      map.removeSource('cog-before')      } catch {}
      if (!item?.cogUrl) return
      try {
        const anchor = map.getLayer('after-cog-layer') ? 'after-cog-layer'
                     : map.getLayer('fp-fill')         ? 'fp-fill' : undefined
        map.addSource('cog-before', {
          type: 'raster', tiles: [cogTileUrl(item.cogUrl, cogOpts(item))], tileSize: 256,
          ...(item.bbox?.length === 4 ? { bounds: item.bbox } : {}),
        })
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
    const item = selectedItems.after
    const apply = () => {
      try { if (map.getLayer('after-cog-layer')) map.removeLayer('after-cog-layer') } catch {}
      try { if (map.getSource('cog-after'))      map.removeSource('cog-after')      } catch {}
      if (!item?.cogUrl) return
      try {
        const anchor = map.getLayer('fp-fill') ? 'fp-fill' : undefined
        map.addSource('cog-after', {
          type: 'raster', tiles: [cogTileUrl(item.cogUrl, cogOpts(item))], tileSize: 256,
          ...(item.bbox?.length === 4 ? { bounds: item.bbox } : {}),
        })
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

  // ── Preview: load COG tiles immediately, animate camera concurrently ────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const item = previewRequest?.item

    const apply = () => {
      try { if (map.getLayer('preview-cog-layer')) map.removeLayer('preview-cog-layer') } catch {}
      try { if (map.getSource('cog-preview'))      map.removeSource('cog-preview')      } catch {}
      if (!item) return

      // Add tile source first — tiles start fetching in the background immediately
      if (item.cogUrl) {
        try {
          const anchor = map.getLayer('fp-line') ? 'fp-line' : map.getLayer('fp-fill') ? 'fp-fill' : undefined
          map.addSource('cog-preview', {
            type: 'raster', tiles: [cogTileUrl(item.cogUrl, cogOpts(item))], tileSize: 256,
            ...(item.bbox?.length === 4 ? { bounds: item.bbox } : {}),
          })
          map.addLayer({ id: 'preview-cog-layer', type: 'raster', source: 'cog-preview',
            layout: { visibility: 'visible' }, paint: { 'raster-opacity': 0.95 } }, anchor)
        } catch (e) { console.warn('preview COG layer error:', e) }
      }

      // Animate camera to the item concurrently — tiles are already loading
      if (item.bbox?.length === 4) {
        const [minX, minY, maxX, maxY] = item.bbox
        map.fitBounds([[minX, minY], [maxX, maxY]], { padding: 60, duration: 350, maxZoom: 16 })
      }

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

        // Pointer cursor on hover — registered once per source
        if (!cursorLayersRef.current.has(srcId)) {
          cursorLayersRef.current.add(srcId)
          for (const lid of [fillId, lineId, circleId]) {
            map.on('mouseenter', lid, () => { map.getCanvas().style.cursor = 'pointer' })
            map.on('mouseleave', lid, () => { map.getCanvas().style.cursor = '' })
          }
        }
      } catch (e) { console.warn('upload layer error:', e) }
    }
  }, [uploadedLayers])

  // ── Shared: add a parsed GeoJSON layer to the map ────────────────────────
  // color is optional — pass a hex string to override the auto palette
  const addLayer = useCallback((name, geojson, color) => {
    const map = mapRef.current
    color = color ?? UPLOAD_COLORS[uploadedLayersRef.current.length % UPLOAD_COLORS.length]
    const id  = `${Date.now()}-${Math.random().toString(36).slice(2)}`
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

  // ── Load a pre-curated event data layer ──────────────────────────────────
  // Supports three urlType values:
  //   'usgs-shakemap' — url is a USGS ComCat event ID; fetches ShakeMap contours
  //   'direct'        — url is a public CORS-enabled GeoJSON (e.g. GeoBoundaries)
  //   (default)       — url is an HDX/S3 resource; use proxy fallback chain
  const handleLoadHdxLayer = useCallback(async (hdxLayer) => {
    const key = hdxLayer.url
    setHdxLayerLoading(prev => ({ ...prev, [key]: true }))
    setHdxLayerErrors(prev => ({ ...prev, [key]: null }))
    try {
      let geojson

      if (hdxLayer.urlType === 'usgs-shakemap') {
        // USGS two-step: event detail → shakemap contour GeoJSON
        geojson = await fetchUSGSShakeMap(hdxLayer.url)

      } else if (hdxLayer.urlType === 'direct') {
        // Direct public URL (GitHub raw, etc.) — fetch blob, parse as file
        const blob = await fetchHDXResource(hdxLayer.url)
        const ext  = formatToExt(hdxLayer.format)
        const file = new File([blob], `${hdxLayer.name}.${ext}`, { type: blob.type })
        const result = await parseVectorFiles([file])
        geojson = result.geojson

      } else {
        // HDX resource with proxy fallback
        const blob = await fetchHDXResource(hdxLayer.url)
        const ext  = formatToExt(hdxLayer.format)
        const file = new File([blob], `${hdxLayer.name}.${ext}`, { type: blob.type })
        const result = await parseVectorFiles([file])
        geojson = result.geojson
      }

      addLayer(hdxLayer.name, geojson)
    } catch (e) {
      setHdxLayerErrors(prev => ({ ...prev, [key]: e.message }))
    } finally {
      setHdxLayerLoading(prev => ({ ...prev, [key]: false }))
    }
  }, [addLayer])

  // ── Load an OSM layer via Overpass API ───────────────────────────────────
  // Uses the event bbox; falls back to the current map viewport bounds.
  const handleLoadOSMLayer = useCallback(async (osmLayer) => {
    const key = osmLayer.id
    setOsmLoading(prev => ({ ...prev, [key]: true }))
    setOsmErrors(prev => ({ ...prev, [key]: null }))
    try {
      // Prefer the event bbox; fall back to current map view
      let bbox
      if (event?.bbox?.length === 4) {
        bbox = event.bbox // [west, south, east, north]
      } else {
        const b = mapRef.current?.getBounds()
        if (!b) throw new Error('Map not ready')
        bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]
      }

      const geojson = await fetchOSMLayer(bbox, osmLayer.filters, osmLayer.name)

      if (!geojson.features?.length) {
        throw new Error(`No ${osmLayer.name.toLowerCase()} found in this area`)
      }

      addLayer(`OSM · ${osmLayer.name}`, geojson, osmLayer.color)
    } catch (e) {
      setOsmErrors(prev => ({ ...prev, [key]: e.message }))
    } finally {
      setOsmLoading(prev => ({ ...prev, [key]: false }))
    }
  }, [event, addLayer])

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

  async function handleExportMap() {
    if (exporting) return
    setExportErr(null)

    // Determine which COG is currently being viewed
    const item = previewRequest?.item
      ?? selectedItems?.after
      ?? selectedItems?.before
      ?? null

    const slug     = (eventRef.current?.name ?? 'imagery').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_')
    const datePart = new Date().toISOString().slice(0, 10)
    const filename = `${slug}_${datePart}.png`

    if (!item?.cogUrl) {
      // No COG loaded — fall back to canvas screenshot of whatever is on screen
      const map = mapRef.current
      if (!map) return
      const capture = () => map.getCanvas().toBlob(blob => {
        if (!blob) return
        const url = URL.createObjectURL(blob)
        Object.assign(document.createElement('a'), { href: url, download: filename }).click()
        URL.revokeObjectURL(url)
      }, 'image/png')
      map.loaded() ? capture() : map.once('idle', capture)
      return
    }

    setExporting(true)
    try {
      await exportWithLayers({
        cogUrl:  item.cogUrl,
        layers:  uploadedLayersRef.current,
        filename,
        map:     mapRef.current,
      })
    } catch (err) {
      console.error('Export failed:', err)
      setExportErr('Export failed — try again')
    } finally {
      setExporting(false)
    }
  }

  function downloadLayer(layer) {
    const json = JSON.stringify(layer.geojson, null, 2)
    const blob = new Blob([json], { type: 'application/geo+json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `${layer.name.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_')}.geojson`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleColorChange(layerId, newColor) {
    const map = mapRef.current
    if (map) {
      try { map.setPaintProperty(`upload-fill-${layerId}`,   'fill-color',   newColor) } catch {}
      try { map.setPaintProperty(`upload-line-${layerId}`,   'line-color',   newColor) } catch {}
      try { map.setPaintProperty(`upload-circle-${layerId}`, 'circle-color', newColor) } catch {}
    }
    setUploadedLayers(prev => prev.map(l => l.id === layerId ? { ...l, color: newColor } : l))
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

      {/* Stack picker — appears at click point when 2+ images overlap */}
      {stackPicker && (
        <StackPicker
          x={stackPicker.x}
          y={stackPicker.y}
          items={stackPicker.items}
          onPreview={item => onItemClickRef.current?.(item)}
          onCompare={(before, after) => onSelectPairRef.current?.(before, after)}
          onClose={() => setStackPicker(null)}
        />
      )}

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
                ? formatPlatform(previewItem.platform)
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
              const key       = hdxLayer.url
              const isLoaded  = uploadedLayers.some(l => l.name === hdxLayer.name)
              const isLoading = hdxLayerLoading[key]
              const err       = hdxLayerErrors[key]
              const meta      = TYPE_META[hdxLayer.type] || { label: hdxLayer.type, color: '#6b7280' }
              return (
                <div key={key} className={styles.eventDataItem}>
                  <div className={styles.eventDataRow}>
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
                        className={`${styles.eventDataLoad} ${err ? styles.eventDataLoadRetry : ''}`}
                        disabled={!!isLoading}
                        onClick={() => handleLoadHdxLayer(hdxLayer)}
                        title={`Load from ${hdxLayer.source}`}
                      >
                        {isLoading ? <span className={styles.spinnerXs} /> : err ? 'Retry' : 'Load'}
                      </button>
                    )}
                  </div>
                  {err && (
                    <div className={styles.eventDataErrMsg}>{err}</div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* OSM infrastructure layers via Overpass API */}
        {event && (
          <div className={styles.eventDataSection}>
            <div className={styles.eventDataLabel}>
              OpenStreetMap
              <span className={styles.osmBadge}>Overpass</span>
            </div>
            {OSM_LAYERS.map(osmLayer => {
              const loaded  = uploadedLayers.some(l => l.name === `OSM · ${osmLayer.name}`)
              const loading = osmLoading[osmLayer.id]
              const err     = osmErrors[osmLayer.id]
              return (
                <div key={osmLayer.id} className={styles.eventDataItem}>
                  <div className={styles.eventDataRow}>
                    <span className={styles.osmIcon}>{osmLayer.icon}</span>
                    <span className={styles.eventDataName}>{osmLayer.name}</span>
                    {loaded ? (
                      <>
                        <span className={styles.eventDataLoaded}>✓</span>
                        <button
                          className={styles.layerDownload}
                          title="Download as GeoJSON"
                          onClick={() => {
                            const layer = uploadedLayers.find(l => l.name === `OSM · ${osmLayer.name}`)
                            if (layer) downloadLayer(layer)
                          }}
                        >
                          <DownloadIcon />
                        </button>
                      </>
                    ) : (
                      <button
                        className={`${styles.eventDataLoad} ${err ? styles.eventDataLoadRetry : ''}`}
                        disabled={!!loading}
                        onClick={() => handleLoadOSMLayer(osmLayer)}
                        title="Load from OpenStreetMap via Overpass API"
                      >
                        {loading ? <span className={styles.spinnerXs} /> : err ? 'Retry' : 'Load'}
                      </button>
                    )}
                  </div>
                  {err && <div className={styles.eventDataErrMsg}>{err}</div>}
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
                <label className={styles.layerSwatch} style={{ background: layer.color }} title="Change color">
                  <input
                    type="color"
                    value={layer.color}
                    onChange={e => handleColorChange(layer.id, e.target.value)}
                    className={styles.colorInput}
                  />
                </label>
                <button
                  className={`${styles.layerToggle} ${!layer.visible ? styles.layerToggleOff : ''}`}
                  onClick={() => toggleLayer(layer.id)}
                  title={layer.visible ? 'Hide layer' : 'Show layer'}
                >
                  <span className={styles.layerName}>{layer.name}</span>
                  <span className={styles.layerCount}>{layer.featureCount}</span>
                </button>
                <button className={styles.layerDownload} onClick={() => downloadLayer(layer)} title="Download as GeoJSON"><DownloadIcon /></button>
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
              setShowGDACS(false)   // mutual exclusion
            }}
            title="Search Humanitarian Data Exchange for datasets in this area"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            HDX
          </button>

          <button
            ref={gdacsBtnRef}
            className={`${styles.uploadBtn} ${showGDACS ? styles.uploadBtnActive : ''}`}
            onClick={() => {
              const rect = gdacsBtnRef.current?.getBoundingClientRect()
              setGDACSAnchorRect(rect ?? null)
              setShowGDACS(v => !v)
              setShowHDX(false)   // mutual exclusion
            }}
            title="Browse live disaster alerts from GDACS"
          >
            🚨 GDACS
          </button>

          <button
            className={`${styles.uploadBtn} ${exporting ? styles.uploadBtnBusy : ''}`}
            onClick={handleExportMap}
            disabled={exporting}
            title="Download full-resolution satellite image with vector layers composited on top"
          >
            {exporting ? <span className={styles.spinnerXs} /> : <DownloadIcon />}
            {exporting ? 'Exporting…' : 'Export View'}
          </button>
        </div>

        {exportErr && (
          <div className={styles.uploadError}>
            <span>{exportErr}</span>
            <button onClick={() => setExportErr(null)}>✕</button>
          </div>
        )}

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

      {/* GDACS alerts panel — stays open after adding layers */}
      {showGDACS && (
        <GDACSPanel
          anchorRect={gdacsAnchorRect}
          onAddLayer={(name, geojson, color) => addLayer(name, geojson, color)}
          onClose={() => setShowGDACS(false)}
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

// ─── Helper: build HTML for the feature-info popup ───────────────────────────

const OSM_LABELS = {
  amenity: 'Type', healthcare: 'Healthcare', 'healthcare:speciality': 'Speciality',
  social_facility: 'Facility', emergency: 'Emergency',
  phone: 'Phone', 'contact:phone': 'Phone', 'contact:mobile': 'Mobile',
  website: 'Website', 'contact:website': 'Website',
  opening_hours: 'Hours', operator: 'Operator', network: 'Network',
  capacity: 'Capacity', beds: 'Beds', description: 'Notes',
  wheelchair: 'Wheelchair', access: 'Access', ref: 'Ref', brand: 'Brand',
  'addr:street': 'Street', 'addr:city': 'City', 'addr:postcode': 'Postcode',
}

const OSM_PREFERRED_ORDER = [
  'amenity', 'healthcare', 'healthcare:speciality', 'social_facility', 'emergency',
  'operator', 'network', 'capacity', 'beds',
  'phone', 'contact:phone', 'contact:mobile', 'website', 'contact:website',
  'opening_hours', 'wheelchair', 'access', 'description', 'ref', 'brand',
]

function buildPopupHtml(props) {
  const isOSM = props.osm_id != null
  // Try common name fields; fall back to event title, id, or a generic label
  const name = String(
    props.name || props.Name || props.NAME ||
    props.title || props.amenity ||
    props.id   || 'Feature'
  )

  let rows = []

  if (isOSM) {
    const seen = new Set(['osm_id', 'osm_type', 'name', 'source', 'created_by',
      'fixme', 'building', 'addr:housenumber'])

    // Combine street address into one row
    if (props['addr:street']) {
      const num = props['addr:housenumber'] ? `${props['addr:housenumber']} ` : ''
      rows.push(['Address', `${num}${props['addr:street']}`])
      seen.add('addr:street')
      if (props['addr:city'])     { rows.push(['City',     props['addr:city']]);     seen.add('addr:city') }
      if (props['addr:postcode']) { rows.push(['Postcode', props['addr:postcode']]); seen.add('addr:postcode') }
    }

    // Preferred key order
    for (const key of OSM_PREFERRED_ORDER) {
      const val = props[key]
      if (seen.has(key) || !val || val === '' || val === 'no') continue
      seen.add(key)
      let display = String(val)
      if (key === 'phone' || key === 'contact:phone' || key === 'contact:mobile') {
        display = `<a href="tel:${display}" style="color:#0AAFB8">${display}</a>`
      } else if (key === 'website' || key === 'contact:website') {
        const href = display.startsWith('http') ? display : `https://${display}`
        display = `<a href="${href}" target="_blank" rel="noopener" style="color:#0AAFB8">${href.replace(/^https?:\/\//, '').replace(/\/$/, '')}</a>`
      }
      rows.push([OSM_LABELS[key] || key, display])
    }

    // Show ALL remaining tags — nothing hidden from the user
    for (const [k, v] of Object.entries(props)) {
      if (seen.has(k) || !v || String(v) === '') continue
      seen.add(k)
      rows.push([k, String(v)])
    }
  } else {
    // Generic GeoJSON (HDX, GDACS, uploads) — show every non-empty property
    for (const [k, v] of Object.entries(props)) {
      if (v == null || String(v) === '') continue
      const display = String(v)
      // Auto-link URLs
      if (display.startsWith('http')) {
        rows.push([k, `<a href="${display}" target="_blank" rel="noopener" style="color:#0AAFB8">${display}</a>`])
      } else {
        rows.push([k, display])
      }
    }
  }

  const tdStyle = (header) => [
    `color:${header ? '#9ca3af' : '#111827'}`,
    `font-size:${header ? '11' : '12'}px`,
    `padding:3px ${header ? '10' : '0'}px 3px 0`,
    `white-space:${header ? 'nowrap' : 'normal'}`,
    `word-break:${header ? 'normal' : 'break-all'}`,
    'vertical-align:top',
    'line-height:1.4',
  ].join(';')

  const tableHtml = rows.length
    ? `<table style="border-collapse:collapse;width:100%;margin-top:8px">${
        rows.map(([k, v], i) =>
          `<tr style="background:${i % 2 === 0 ? '#f9fafb' : '#fff'}">` +
          `<td style="${tdStyle(true)}">${k}</td>` +
          `<td style="${tdStyle(false)}">${v}</td>` +
          `</tr>`
        ).join('')
      }</table>`
    : ''

  const footer = isOSM
    ? `<div style="font-size:10px;color:#9ca3af;margin-top:6px;border-top:1px solid #f3f4f6;padding-top:4px">OSM ${props.osm_type || ''} · id ${props.osm_id}</div>`
    : ''

  return `<div style="font-family:system-ui,sans-serif;line-height:1.45;min-width:200px">
    <div style="font-weight:700;font-size:13px;padding-bottom:6px;border-bottom:1.5px solid #e5e7eb;color:#111827">${name}</div>
    ${tableHtml}${footer}
  </div>`
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
