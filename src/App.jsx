import { useState } from 'react'
import Landing from './components/Landing.jsx'
import Results  from './components/Results.jsx'
import Compare  from './components/Compare.jsx'

export default function App() {
  const [screen, setScreen]             = useState('landing')  // landing | results | compare
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [compareItems, setCompareItems]   = useState({ before: null, after: null })

  function handleSelectEvent(event) {
    setSelectedEvent(event)
    setScreen('results')
  }

  function handleCompare(beforeItem, afterItem, event) {
    setCompareItems({ before: beforeItem, after: afterItem })
    setScreen('compare')
  }

  return (
    <div style={{ height: '100%', overflow: 'hidden' }}>
      {screen === 'landing' && (
        <Landing onSelectEvent={handleSelectEvent} />
      )}
      {screen === 'results' && (
        <Results
          event={selectedEvent}
          onBack={() => setScreen('landing')}
          onHome={() => setScreen('landing')}
          onCompare={handleCompare}
        />
      )}
      {screen === 'compare' && (
        <Compare
          beforeItem={compareItems.before}
          afterItem={compareItems.after}
          event={selectedEvent}
          onBack={() => setScreen('results')}
          onHome={() => setScreen('landing')}
        />
      )}
    </div>
  )
}
