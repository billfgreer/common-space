import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { searchHDX, fetchHDXResource, formatToExt } from '../lib/hdx.js'
import { parseVectorFiles } from '../lib/vectorParse.js'
import styles from './HDXPanel.module.css'

const HDX_LOGO_URL   = 'https://data.humdata.org/images/icons/hdx-logo-dark-smaller.png'
const EMDAT_ORG_SLUG = 'cred-crunch'   // CRED publishes EM-DAT datasets to HDX under this org

function formatSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024)        return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function FormatBadge({ fmt }) {
  const f = (fmt || '').toLowerCase()
  const color = f.includes('geo') || f === 'json' ? '#22c55e'
              : f === 'kml' || f === 'kmz'        ? '#3b82f6'
              : f.includes('shape') || f === 'shp' || f === 'zip' ? '#f59e0b'
              : f === 'gpx'                        ? '#8b5cf6'
              : '#6b7280'
  return (
    <span className={styles.fmtBadge} style={{ background: `${color}22`, color, borderColor: `${color}55` }}>
      {fmt}
    </span>
  )
}

export default function HDXPanel({ anchorRect, bounds, eventName, onAdd, onClose }) {
  const [source, setSource]             = useState('hdx')  // 'hdx' | 'emdat'
  const [query, setQuery]               = useState(eventName || '')
  const [results, setResults]           = useState(null)
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState(null)
  const [loadingId, setLoadingId]       = useState(null)  // resource.id being fetched
  const [resourceErrors, setResourceErrors] = useState({})
  const inputRef = useRef(null)

  // Auto-search on mount using current map bounds + event name
  useEffect(() => {
    runSearch(eventName || '', 'hdx')
    inputRef.current?.focus()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-search when source tab changes
  useEffect(() => {
    runSearch(query, source)
  }, [source]) // eslint-disable-line react-hooks/exhaustive-deps

  async function runSearch(q, src = source) {
    setLoading(true)
    setError(null)
    setResults(null)
    try {
      const bbox = bounds
        ? [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()]
        : null

      const isEmdat = src === 'emdat'
      const res = await searchHDX({
        bbox:         isEmdat ? null : bbox,  // EM-DAT datasets are global — skip bbox filter
        query:        q,
        rows:         30,
        organization: isEmdat ? EMDAT_ORG_SLUG : undefined,
        allFormats:   isEmdat,                // show CSV/XLSX for EM-DAT
      })
      setResults(res)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleLoad(resource, datasetTitle) {
    setLoadingId(resource.id)
    setResourceErrors(prev => ({ ...prev, [resource.id]: null }))
    try {
      const blob = await fetchHDXResource(resource.url)
      const ext  = formatToExt(resource.format)
      const name = (resource.name || datasetTitle).replace(/\.[^.]+$/, '')
      const file = new File([blob], `${name}.${ext}`, { type: blob.type })
      const { name: layerName, geojson } = await parseVectorFiles([file])
      onAdd(layerName, geojson)
    } catch (e) {
      setResourceErrors(prev => ({ ...prev, [resource.id]: e.message }))
    } finally {
      setLoadingId(null)
    }
  }

  // Position panel above the anchor button, aligned to its left edge
  const panelStyle = anchorRect ? {
    position: 'fixed',
    left:     Math.max(8, anchorRect.left),
    bottom:   window.innerHeight - anchorRect.top + 8,
    maxHeight: Math.min(520, anchorRect.top - 20),
  } : {}

  const panel = (
    <div className={styles.panel} style={panelStyle}>

      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <img src={HDX_LOGO_URL} alt="HDX" className={styles.hdxLogo} onError={e => e.target.style.display='none'} />
          <span className={styles.title}>Humanitarian Data Exchange</span>
        </div>
        <button className={styles.closeBtn} onClick={onClose}>✕</button>
      </div>

      {/* Source tabs */}
      <div className={styles.sourceRow}>
        <button
          className={[styles.sourceTab, source === 'hdx' ? styles.sourceTabActive : ''].filter(Boolean).join(' ')}
          onClick={() => setSource('hdx')}
        >
          HDX
        </button>
        <button
          className={[styles.sourceTab, source === 'emdat' ? styles.sourceTabActive : ''].filter(Boolean).join(' ')}
          onClick={() => setSource('emdat')}
        >
          EM-DAT
        </button>
      </div>

      {/* Search */}
      <div className={styles.searchRow}>
        <input
          ref={inputRef}
          className={styles.searchInput}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && runSearch(query)}
          placeholder={source === 'emdat' ? 'Filter EM-DAT datasets…' : 'Keyword filter (or leave blank for extent only)…'}
        />
        <button
          className={styles.searchBtn}
          onClick={() => runSearch(query)}
          disabled={loading}
        >
          {loading ? '…' : 'Search'}
        </button>
      </div>

      {/* Scope note */}
      <div className={styles.scopeNote}>
        {source === 'emdat'
          ? '◉ EM-DAT datasets from CRED via HDX'
          : bounds
          ? '◉ Filtered to current map view'
          : '◎ No map bounds — searching globally'}
      </div>

      {/* Body */}
      <div className={styles.body}>

        {source === 'emdat' && !loading && !error && (
          <p className={styles.emdatNote}>
            Most EM-DAT datasets are tabular (CSV/XLSX). For the full interactive database visit{' '}
            <a href="https://emdat.be" target="_blank" rel="noreferrer">emdat.be</a>.
          </p>
        )}

        {loading && (
          <div className={styles.loadingState}>
            <div className={styles.spinner} />
            {source === 'emdat' ? 'Searching EM-DAT…' : 'Searching HDX…'}
          </div>
        )}

        {error && (
          <div className={styles.errorState}>
            <strong>Search failed</strong><br />{error}
          </div>
        )}

        {results && results.datasets.length === 0 && !loading && (
          <div className={styles.emptyState}>
            No geospatial datasets found for this area.<br />
            Try zooming out or clearing the keyword.
          </div>
        )}

        {results && results.datasets.length > 0 && (
          <>
            <div className={styles.resultCount}>
              {results.total} datasets · showing {results.datasets.length} with geo resources
            </div>

            {results.datasets.map(ds => (
              <div key={ds.id} className={styles.dataset}>
                <div className={styles.dsHeader}>
                  <a
                    href={ds.hdxUrl}
                    target="_blank"
                    rel="noreferrer"
                    className={styles.dsTitle}
                    title={ds.title}
                  >
                    {ds.title}
                  </a>
                  {ds.location && <span className={styles.dsLocation}>{ds.location}</span>}
                </div>
                {ds.notes && <p className={styles.dsNotes}>{ds.notes}…</p>}

                <div className={styles.resources}>
                  {ds.resources.map(r => (
                    <div key={r.id} className={styles.resource}>
                      <div className={styles.resourceMeta}>
                        <FormatBadge fmt={r.format} />
                        <span className={styles.resourceName}>{r.name}</span>
                        {r.size > 0 && <span className={styles.resourceSize}>{formatSize(r.size)}</span>}
                      </div>
                      {resourceErrors[r.id] && (
                        <div className={styles.resourceError}>{resourceErrors[r.id]}</div>
                      )}
                      {r.canAdd !== false ? (
                        <button
                          className={styles.addBtn}
                          onClick={() => handleLoad(r, ds.title)}
                          disabled={!!loadingId}
                          title="Fetch and add to map"
                        >
                          {loadingId === r.id ? (
                            <><span className={styles.spinnerSm} /> Loading…</>
                          ) : '+ Add to Map'}
                        </button>
                      ) : (
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noreferrer"
                          className={styles.downloadChip}
                          title="Download dataset"
                        >
                          ↓ Download
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Footer */}
      <div className={styles.footer}>
        {source === 'emdat' ? (
          <>
            Data from{' '}
            <a href="https://emdat.be" target="_blank" rel="noreferrer">CRED/EM-DAT</a>
            {' '}via HDX · CC BY 4.0
          </>
        ) : (
          <>
            Data from{' '}
            <a href="https://data.humdata.org" target="_blank" rel="noreferrer">data.humdata.org</a>
            {' '}· CC licenses may apply
          </>
        )}
      </div>
    </div>
  )

  return createPortal(panel, document.body)
}
