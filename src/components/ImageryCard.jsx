import { useState } from 'react'
import { createPortal } from 'react-dom'
import { cogThumbnailTileUrl } from '../lib/titiler.js'
import styles from './ImageryCard.module.css'

const CloudIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>
  </svg>
)

const DownloadIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
)

function formatDate(date) {
  if (!date) return 'Unknown date'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatPlatform(platform) {
  return platform.replace('worldview-', 'WV-').replace('WorldView-', 'WV-')
}

function MetaModal({ item, onClose }) {
  const raw = item.raw || {}
  const props = raw.properties || {}
  const assets = raw.assets || {}

  const rows = [
    ['ID', item.id],
    ['Date', item.datetime?.toISOString()],
    ['Platform', props.platform],
    ['Instrument', props.instruments?.join(', ')],
    ['Cloud Cover', item.cloudCover != null ? `${item.cloudCover}%` : null],
    ['GSD', item.gsd ? `${item.gsd} m` : null],
    ['BBox', item.bbox?.map(n => n.toFixed(5)).join(', ')],
    ['Collection', raw.collection],
    ['Processing level', props['processing:level']],
    ['Off-nadir', props['view:off_nadir'] != null ? `${props['view:off_nadir']}°` : null],
    ['Sun elevation', props['view:sun_elevation'] != null ? `${props['view:sun_elevation']}°` : null],
    ['Sun azimuth', props['view:sun_azimuth'] != null ? `${props['view:sun_azimuth']}°` : null],
  ].filter(([, v]) => v != null && v !== '')

  const assetRows = Object.entries(assets)

  return createPortal(
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>STAC Metadata</span>
          <button className={styles.modalClose} onClick={onClose}>✕</button>
        </div>
        <div className={styles.modalBody}>
          <table className={styles.metaTable}>
            <tbody>
              {rows.map(([k, v]) => (
                <tr key={k}>
                  <td className={styles.metaKey}>{k}</td>
                  <td className={styles.metaVal}>{String(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {assetRows.length > 0 && (
            <>
              <div className={styles.metaSectionLabel}>Assets</div>
              <table className={styles.metaTable}>
                <tbody>
                  {assetRows.map(([k, asset]) => (
                    <tr key={k}>
                      <td className={styles.metaKey}>{k}</td>
                      <td className={styles.metaVal}>
                        {asset.href?.startsWith('http') || asset.href?.startsWith('s3://')
                          ? <a href={asset.href} target="_blank" rel="noreferrer" style={{color:'var(--cyan)'}}>{asset.href}</a>
                          : asset.href || '—'}
                        {asset.type && <span style={{color:'var(--ink-soft)',marginLeft:6}}>{asset.type}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <div className={styles.metaSectionLabel}>Raw JSON</div>
          <pre className={styles.rawJson}>{JSON.stringify(raw, null, 2)}</pre>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default function ImageryCard({
  item,
  timing,           // 'before' | 'after'
  selected,         // false | 'before' | 'after'
  overlapsSelected, // true | false | null
  isBestPair,       // true | undefined
  onSelect,
  onMouseEnter,
  onMouseLeave,
}) {
  const initSource = item.thumbnailUrl ? 'thumbnail' : item.cogUrl ? 'cog' : 'none'
  const [thumbSource, setThumbSource] = useState(initSource)
  const [showMeta, setShowMeta] = useState(false)

  const thumbSrc = thumbSource === 'thumbnail' ? item.thumbnailUrl
                 : thumbSource === 'cog'       ? cogThumbnailTileUrl(item.cogUrl, item.bbox)
                 : null

  function handleThumbError() {
    if (thumbSource === 'thumbnail' && item.cogUrl) setThumbSource('cog')
    else setThumbSource('none')
  }

  const cardClass = [
    styles.card,
    selected === 'before' ? styles.selectedBefore : '',
    selected === 'after'  ? styles.selectedAfter  : '',
    isBestPair && !selected ? styles.bestPairCard : '',
  ].filter(Boolean).join(' ')

  function handleDownload(e) {
    e.stopPropagation()
    if (item.cogUrl) window.open(item.cogUrl, '_blank')
  }

  return (
    <>
      <div
        className={cardClass}
        onClick={() => onSelect(item, timing)}
        onMouseEnter={() => onMouseEnter?.(item)}
        onMouseLeave={() => onMouseLeave?.()}
      >
        {/* Thumbnail */}
        <div className={styles.thumb}>
          {thumbSrc ? (
            <img
              src={thumbSrc}
              alt={`${timing} imagery`}
              className={styles.thumbImg}
              onError={handleThumbError}
            />
          ) : (
            <div className={styles.thumbPlaceholder} />
          )}
          <span className={`${styles.badge} ${timing === 'before' ? styles.badgeBefore : styles.badgeAfter}`}>
            {timing}
          </span>
        </div>

        {/* Body */}
        <div className={styles.body}>
          <div className={styles.top}>
            <div>
              <div className={styles.date}>{formatDate(item.datetime)}</div>
              <div className={styles.platform}>{formatPlatform(item.platform)}</div>
            </div>
            {item.cloudCover !== null && (
              <div className={styles.cloud}>
                <CloudIcon />
                {Math.round(item.cloudCover)}%
              </div>
            )}
          </div>

          <div className={styles.actions}>
            <button
              className={styles.actionDownload}
              onClick={handleDownload}
              title="Download COG asset"
            >
              <DownloadIcon /> Download
            </button>
            <button
              className={`${styles.actionCompare} ${selected ? styles.actionCompareActive : ''}`}
              onClick={e => { e.stopPropagation(); onSelect(item, timing) }}
            >
              {selected ? '✓ Selected' : overlapsSelected === true ? '✓ Same area' : 'Compare'}
            </button>
            <button
              className={`${styles.actionDownload} ${styles.actionInfo}`}
              onClick={e => { e.stopPropagation(); setShowMeta(true) }}
              title="View STAC metadata"
            >
              Info
            </button>
          </div>
        </div>
      </div>

      {showMeta && <MetaModal item={item} onClose={() => setShowMeta(false)} />}
    </>
  )
}
