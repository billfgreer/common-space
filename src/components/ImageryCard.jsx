import { useState } from 'react'
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
  // Clean up long platform strings
  return platform.replace('worldview-', 'WV-').replace('WorldView-', 'WV-')
}

export default function ImageryCard({
  item,
  timing,          // 'before' | 'after'
  selected,        // false | 'before' | 'after'
  overlapsSelected, // true | false | null
  onSelect,
  onMouseEnter,
  onMouseLeave,
  eventName,
}) {
  const initSource = item.thumbnailUrl ? 'thumbnail' : item.cogUrl ? 'cog' : 'none'
  const [thumbSource, setThumbSource] = useState(initSource)

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
  ].filter(Boolean).join(' ')

  function handleDownload(e) {
    e.stopPropagation()
    if (item.cogUrl) window.open(item.cogUrl, '_blank')
  }

  return (
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
        </div>
      </div>
    </div>
  )
}
