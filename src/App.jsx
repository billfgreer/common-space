import { lazy, Suspense } from 'react'
import { HashRouter, Routes, Route, useParams, useNavigate, Navigate } from 'react-router-dom'
import Landing from './components/Landing.jsx'
import { EVENTS } from './lib/events.js'

// Lazy-load heavy routes — MapLibre + geo parsers only load when actually needed.
// Landing is eager because it's the entry point and has no heavy dependencies.
const Results = lazy(() => import('./components/Results.jsx'))
const Compare = lazy(() => import('./components/Compare.jsx'))

// Minimal skeleton shown while the lazy chunk is fetching
function RouteLoading() {
  return (
    <div style={{
      height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'system-ui, sans-serif', fontSize: 13, color: '#6b7280',
    }}>
      Loading…
    </div>
  )
}

// ─── Route components ──────────────────────────────────────────────────────────

function LandingRoute() {
  const navigate = useNavigate()
  return <Landing onSelectEvent={event => navigate(`/event/${event.id}`)} />
}

function ResultsRoute() {
  const { eventId } = useParams()
  const navigate    = useNavigate()
  const event       = EVENTS.find(e => e.id === eventId)

  if (!event) return <Navigate to="/" replace />

  function handleCompare(beforeItem, afterItem, ev) {
    sessionStorage.setItem(`compare:${ev.id}`, JSON.stringify({ before: beforeItem, after: afterItem }))
    navigate(`/compare/${ev.id}`)
  }

  return (
    <Results
      event={event}
      onBack={() => navigate('/')}
      onHome={() => navigate('/')}
      onCompare={handleCompare}
    />
  )
}

function CompareRoute() {
  const { eventId } = useParams()
  const navigate    = useNavigate()
  const event       = EVENTS.find(e => e.id === eventId)

  if (!event) return <Navigate to="/" replace />

  const stored = sessionStorage.getItem(`compare:${eventId}`)
  let items = stored ? JSON.parse(stored) : null
  if (items) {
    const revive = item => item
      ? { ...item, datetime: item.datetime ? new Date(item.datetime) : null }
      : null
    items = { before: revive(items.before), after: revive(items.after) }
  }

  if (!items?.before || !items?.after) {
    return <Navigate to={`/event/${eventId}`} replace />
  }

  return (
    <Compare
      beforeItem={items.before}
      afterItem={items.after}
      event={event}
      onBack={() => navigate(`/event/${eventId}`)}
      onHome={() => navigate('/')}
    />
  )
}

// ─── App root ─────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <div style={{ height: '100%', overflow: 'hidden' }}>
      <HashRouter>
        <Suspense fallback={<RouteLoading />}>
          <Routes>
            <Route path="/"                    element={<LandingRoute />} />
            <Route path="/event/:eventId"      element={<ResultsRoute />} />
            <Route path="/compare/:eventId"    element={<CompareRoute />} />
            <Route path="*"                    element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </HashRouter>
    </div>
  )
}
