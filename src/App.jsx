import { HashRouter, Routes, Route, useParams, useNavigate, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import Landing from './components/Landing.jsx'
import Results  from './components/Results.jsx'
import Compare  from './components/Compare.jsx'
import { EVENTS } from './lib/events.js'

// ─── Route components ──────────────────────────────────────────────────────────

function LandingRoute() {
  const navigate = useNavigate()
  return <Landing onSelectEvent={event => navigate(`/event/${event.id}`)} />
}

function ResultsRoute() {
  const { eventId } = useParams()
  const navigate    = useNavigate()
  const event       = EVENTS.find(e => e.id === eventId)

  // If the event slug is unknown, send back home
  if (!event) return <Navigate to="/" replace />

  function handleCompare(beforeItem, afterItem, ev) {
    // Store before/after item data in sessionStorage so Compare can retrieve it
    // without putting large JSON blobs in the URL
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

  // Retrieve the before/after items stored when Compare was triggered
  const stored = sessionStorage.getItem(`compare:${eventId}`)
  const items  = stored ? JSON.parse(stored) : null

  if (!items?.before || !items?.after) {
    // No data — fall back to the results page for this event
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
        <Routes>
          <Route path="/"                    element={<LandingRoute />} />
          <Route path="/event/:eventId"      element={<ResultsRoute />} />
          <Route path="/compare/:eventId"    element={<CompareRoute />} />
          <Route path="*"                    element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </div>
  )
}
