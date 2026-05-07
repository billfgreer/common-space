import { lazy, Suspense, useState, useCallback } from 'react'
import { HashRouter, Routes, Route, useParams, useNavigate, Navigate } from 'react-router-dom'
import Landing from './components/Landing.jsx'
import { EVENTS } from './lib/events.js'
import { loadCustomEvents, saveCustomEvent, deleteCustomEvent } from './lib/customEvents.js'

// Lazy-load heavy routes — MapLibre + geo parsers only load when actually needed.
const Results      = lazy(() => import('./components/Results.jsx'))
const Compare      = lazy(() => import('./components/Compare.jsx'))
const CreateEvent  = lazy(() => import('./components/CreateEvent.jsx'))

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

function LandingRoute({ allEvents, onDeleteCustom }) {
  const navigate = useNavigate()
  return (
    <Landing
      allEvents={allEvents}
      onSelectEvent={event => navigate(`/event/${event.id}`)}
      onCreateEvent={() => navigate('/create')}
      onDeleteCustom={onDeleteCustom}
    />
  )
}

function ResultsRoute({ allEvents }) {
  const { eventId } = useParams()
  const navigate    = useNavigate()
  const event       = allEvents.find(e => e.id === eventId)

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

function CompareRoute({ allEvents }) {
  const { eventId } = useParams()
  const navigate    = useNavigate()
  const event       = allEvents.find(e => e.id === eventId)

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

function CreateRoute({ onCreated }) {
  const navigate = useNavigate()
  return (
    <CreateEvent
      onBack={() => navigate('/')}
      onHome={() => navigate('/')}
      onCreated={event => {
        onCreated(event)
        navigate(`/event/${event.id}`)
      }}
    />
  )
}

// ─── App root ─────────────────────────────────────────────────────────────────

export default function App() {
  const [customEvents, setCustomEvents] = useState(() => loadCustomEvents())

  const handleCreated = useCallback((event) => {
    setCustomEvents(prev => [event, ...prev.filter(e => e.id !== event.id)])
  }, [])

  const handleDeleteCustom = useCallback((id) => {
    deleteCustomEvent(id)
    setCustomEvents(prev => prev.filter(e => e.id !== id))
  }, [])

  // Custom events first (most recent user-created), then static events
  const allEvents = [...customEvents, ...EVENTS]

  return (
    <div style={{ height: '100%', overflow: 'hidden' }}>
      <HashRouter>
        <Suspense fallback={<RouteLoading />}>
          <Routes>
            <Route path="/"
              element={<LandingRoute allEvents={allEvents} onDeleteCustom={handleDeleteCustom} />}
            />
            <Route path="/create"
              element={<CreateRoute onCreated={handleCreated} />}
            />
            <Route path="/event/:eventId"
              element={<ResultsRoute allEvents={allEvents} />}
            />
            <Route path="/compare/:eventId"
              element={<CompareRoute allEvents={allEvents} />}
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </HashRouter>
    </div>
  )
}
