// ─── Geographic ───────────────────────────────────────────────────────────────

/** Web Mercator tile URL for an ESRI World Imagery tile at a given center + zoom */
export function esriTileUrl(center, zoom) {
  const [lng, lat] = center
  const n = Math.pow(2, zoom)
  const x = Math.floor((lng + 180) / 360 * n)
  const latRad = lat * Math.PI / 180
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n)
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${y}/${x}`
}

// ─── Formatting ───────────────────────────────────────────────────────────────

/** Normalise satellite platform names to short display labels */
export function formatPlatform(platform) {
  if (!platform) return ''
  return platform
    .replace(/worldview-/i, 'WV-')
    .replace(/WorldView-/i, 'WV-')
}

/** Format a Date or ISO string to a human-readable date */
export function formatDate(date) {
  if (!date) return '—'
  const d = date instanceof Date ? date : new Date(date)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Short date: "Sep 2023" */
export function shortDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

/** Format large numbers with K/M suffix */
export function fmtNum(n) {
  if (!n) return null
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`
  return `${n}`
}

/** Format a USD million amount as "$1.2B" or "$300M" */
export function fmtCost(usdM) {
  if (!usdM) return null
  if (usdM >= 1_000) return `$${(usdM / 1_000).toFixed(1).replace(/\.0$/, '')}B`
  return `$${usdM}M`
}

// ─── Impact scoring ───────────────────────────────────────────────────────────

/**
 * Weighted human-impact score for sorting events.
 * Deaths count most (×100), then displaced (×0.05), homes (×5), cost (×0.5).
 */
export function impactScore(event) {
  const i = event.impact
  if (!i) return 0
  return i.deaths * 100 + i.displaced * 0.05 + i.homesDestroyed * 5 + i.costUSD * 0.5
}

/**
 * Returns the single most alarming impact stat for display on cards.
 * Returns { label, value, red } or null.
 */
export function topStat(impact) {
  if (!impact) return null
  if (impact.deaths > 0)         return { label: 'lives lost',  value: fmtNum(impact.deaths),        red: true  }
  if (impact.displaced > 0)      return { label: 'displaced',   value: fmtNum(impact.displaced),     red: false }
  if (impact.homesDestroyed > 0) return { label: 'homes lost',  value: fmtNum(impact.homesDestroyed), red: false }
  if (impact.costUSD > 0)        return { label: 'est. damage', value: fmtCost(impact.costUSD),       red: false }
  return null
}
