import { useState, useCallback } from 'react'
import Header from './Header.jsx'
import { EVENT_TYPES, saveCustomEvent, autoGradient, geocodeLocation } from '../lib/customEvents.js'
import styles from './CreateEvent.module.css'

const STEPS = ['Type & Details', 'Impact Data', 'Data Sources']

const LAYER_TYPES = [
  { value: 'admin',      label: 'Admin Boundaries' },
  { value: 'damage',     label: 'Damage Assessment' },
  { value: 'flood',      label: 'Flood Extent'      },
  { value: 'shakemap',   label: 'ShakeMap'          },
  { value: 'buildings',  label: 'Buildings'         },
  { value: 'roads',      label: 'Roads'             },
  { value: 'population', label: 'Population'        },
  { value: 'other',      label: 'Other'             },
]

function ProgressBar({ step }) {
  return (
    <div className={styles.progress}>
      {STEPS.map((label, i) => (
        <>
          <div
            key={i}
            className={[
              styles.step,
              i === step ? styles.stepActive : '',
              i < step  ? styles.stepDone   : '',
            ].join(' ')}
          >
            <span className={styles.stepNum}>{i < step ? '✓' : i + 1}</span>
            {label}
          </div>
          {i < STEPS.length - 1 && (
            <div className={`${styles.stepLine} ${i < step ? styles.stepLineDone : ''}`} key={`line-${i}`} />
          )}
        </>
      ))}
    </div>
  )
}

// ─── Step 1: Type + Core Details ──────────────────────────────────────────────
function Step1({ data, onChange }) {
  const [geocoding, setGeocoding] = useState(false)
  const [geocoded, setGeocoded]   = useState(null)

  async function handleLocationBlur() {
    if (!data.location || data.center) return
    setGeocoding(true)
    const result = await geocodeLocation(data.location)
    setGeocoding(false)
    if (result) {
      setGeocoded(result)
      onChange({
        center: result.center,
        zoom:   result.zoom,
        bbox:   result.bbox,
      })
    }
  }

  return (
    <>
      <div className={styles.stepTitle}>What type of event is this?</div>
      <div className={styles.stepSubtitle}>Choose the disaster type and fill in the basic details.</div>

      <div className={styles.typeGrid}>
        {EVENT_TYPES.map(t => (
          <button
            key={t.type}
            className={[styles.typeBtn, data.type === t.type ? styles.typeBtnActive : ''].join(' ')}
            onClick={() => onChange({ type: t.type, emoji: t.emoji })}
          >
            <span className={styles.typeEmoji}>{t.emoji}</span>
            <span className={styles.typeLabel}>{t.label}</span>
          </button>
        ))}
      </div>

      <div className={styles.formGroup}>
        <label className={styles.label}>Event Name <span style={{ color: '#ef4444' }}>*</span></label>
        <input
          className={styles.input}
          placeholder="e.g. Morocco Earthquake 2023"
          value={data.name}
          onChange={e => onChange({ name: e.target.value })}
        />
      </div>

      <div className={styles.formGroup}>
        <label className={styles.label}>Location <span style={{ color: '#ef4444' }}>*</span></label>
        <input
          className={styles.input}
          placeholder="e.g. Marrakech, Morocco"
          value={data.location}
          onChange={e => onChange({ location: e.target.value, center: null, bbox: null })}
          onBlur={handleLocationBlur}
        />
        {geocoding && (
          <div className={styles.geocodeStatus}>
            <span className={styles.geocodeDot} style={{ background: '#f59e0b' }} />
            Locating…
          </div>
        )}
        {geocoded && data.center && (
          <div className={styles.geocodeStatus}>
            <span className={styles.geocodeDot} />
            Located at {data.center[1].toFixed(3)}°, {data.center[0].toFixed(3)}°
          </div>
        )}
        <div className={styles.hint}>Used to center the map. Will be geocoded automatically.</div>
      </div>

      <div className={styles.formGroup}>
        <label className={styles.label}>Event Date <span className={styles.optional}>optional</span></label>
        <input
          className={styles.input}
          type="date"
          value={data.eventDate || ''}
          onChange={e => onChange({ eventDate: e.target.value || null })}
        />
        <div className={styles.hint}>Used to separate before / after imagery.</div>
      </div>
    </>
  )
}

// ─── Step 2: Impact Data ───────────────────────────────────────────────────────
function Step2({ data, onChange }) {
  const imp = data.impact || {}
  function setImpact(field, val) {
    onChange({ impact: { ...imp, [field]: val ? Number(val) : 0 } })
  }

  return (
    <>
      <div className={styles.stepTitle}>Impact Data</div>
      <div className={styles.stepSubtitle}>
        Add known impact statistics. All fields are optional — you can update them later.
      </div>

      <div className={styles.impactGrid}>
        <div className={styles.formGroup}>
          <label className={styles.label}>Deaths</label>
          <input className={styles.input} type="number" min="0" placeholder="0"
            value={imp.deaths || ''} onChange={e => setImpact('deaths', e.target.value)} />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label}>Displaced</label>
          <input className={styles.input} type="number" min="0" placeholder="0"
            value={imp.displaced || ''} onChange={e => setImpact('displaced', e.target.value)} />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label}>Homes Destroyed</label>
          <input className={styles.input} type="number" min="0" placeholder="0"
            value={imp.homesDestroyed || ''} onChange={e => setImpact('homesDestroyed', e.target.value)} />
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label}>Est. Cost (USD M)</label>
          <input className={styles.input} type="number" min="0" placeholder="0"
            value={imp.costUSD || ''} onChange={e => setImpact('costUSD', e.target.value)} />
        </div>
      </div>

      <div className={styles.formGroup}>
        <label className={styles.label}>Description <span className={styles.optional}>optional</span></label>
        <textarea
          className={styles.input}
          style={{ resize: 'vertical', minHeight: 80 }}
          placeholder="Brief description of the event, its causes, and affected areas…"
          value={data.description || ''}
          onChange={e => onChange({ description: e.target.value })}
        />
      </div>
    </>
  )
}

// ─── Step 3: Data Sources ──────────────────────────────────────────────────────
function Step3({ data, onChange }) {
  function addDataset() {
    onChange({
      hdxLayers: [
        ...(data.hdxLayers || []),
        { name: '', url: '', type: 'admin', format: 'GeoJSON', urlType: 'direct', source: 'Custom' },
      ]
    })
  }

  function updateDataset(i, field, value) {
    const layers = [...(data.hdxLayers || [])]
    layers[i] = { ...layers[i], [field]: value }
    onChange({ hdxLayers: layers })
  }

  function removeDataset(i) {
    const layers = [...(data.hdxLayers || [])]
    layers.splice(i, 1)
    onChange({ hdxLayers: layers })
  }

  return (
    <>
      <div className={styles.stepTitle}>Add Data Sources</div>
      <div className={styles.stepSubtitle}>
        Link imagery and vector datasets. Everything is optional — you can add data after saving.
      </div>

      <div className={styles.sectionLabel}>Imagery</div>

      <div className={styles.formGroup}>
        <label className={styles.label}>STAC Catalog URL <span className={styles.optional}>optional</span></label>
        <input
          className={styles.input}
          placeholder="https://…/collection.json"
          value={data.catalogUrl || ''}
          onChange={e => onChange({ catalogUrl: e.target.value || null })}
        />
        <div className={styles.hint}>
          Link a public STAC catalog (e.g. Maxar Open Data, Planet Open CA, Umbra Open SAR).
          The app will stream available imagery automatically.
        </div>
      </div>

      <div className={styles.sectionLabel} style={{ marginTop: 24 }}>
        Vector Datasets
      </div>

      <div className={styles.datasetList}>
        {(data.hdxLayers || []).map((ds, i) => (
          <div key={i} className={styles.datasetRow}>
            <div className={styles.datasetInputs}>
              <input
                className={styles.datasetInput}
                placeholder="Dataset name"
                value={ds.name}
                onChange={e => updateDataset(i, 'name', e.target.value)}
              />
              <input
                className={styles.datasetInput}
                placeholder="URL (GeoJSON, KML, etc.)"
                value={ds.url}
                onChange={e => updateDataset(i, 'url', e.target.value)}
              />
              <select
                className={styles.datasetInput}
                style={{ cursor: 'pointer' }}
                value={ds.type}
                onChange={e => updateDataset(i, 'type', e.target.value)}
              >
                {LAYER_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <button className={styles.datasetRemove} onClick={() => removeDataset(i)} title="Remove">✕</button>
          </div>
        ))}
      </div>

      <button className={styles.addDatasetBtn} onClick={addDataset}>
        + Add vector dataset
      </button>
    </>
  )
}

// ─── CreateEvent ───────────────────────────────────────────────────────────────
export default function CreateEvent({ onBack, onHome, onCreated }) {
  const [step, setStep]     = useState(0)
  const [error, setError]   = useState(null)
  const [saving, setSaving] = useState(false)
  const [data, setData]     = useState({
    type:      'Earthquake',
    emoji:     '🌍',
    name:      '',
    location:  '',
    eventDate: null,
    center:    null,
    zoom:      9,
    bbox:      null,
    catalogUrl: null,
    hdxLayers:  [],
    impact:     { deaths: 0, displaced: 0, homesDestroyed: 0, costUSD: 0 },
    description: '',
  })

  const update = useCallback((patch) => {
    setData(prev => ({ ...prev, ...patch }))
    setError(null)
  }, [])

  function validate() {
    if (!data.name.trim())     return 'Event name is required.'
    if (!data.location.trim()) return 'Location is required.'
    return null
  }

  function handleNext() {
    if (step === 0) {
      const err = validate()
      if (err) { setError(err); return }
    }
    setError(null)
    setStep(s => s + 1)
  }

  async function handleSave() {
    const err = validate()
    if (err) { setError(err); return }

    setSaving(true)
    try {
      // If we still don't have coordinates, geocode now
      let finalData = { ...data }
      if (!finalData.center && finalData.location) {
        const geo = await geocodeLocation(finalData.location)
        if (geo) {
          finalData.center = geo.center
          finalData.zoom   = geo.zoom
          finalData.bbox   = geo.bbox
        } else {
          finalData.center = [0, 20]
          finalData.zoom   = 3
        }
      }
      if (!finalData.center) finalData.center = [0, 20]

      // Clean up empty datasets
      finalData.hdxLayers = (finalData.hdxLayers || []).filter(d => d.name.trim() && d.url.trim())

      // Build the final event object
      const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      const event = {
        id,
        name:           finalData.name.trim(),
        location:       finalData.location.trim(),
        eventDate:      finalData.eventDate || null,
        type:           finalData.type,
        emoji:          finalData.emoji,
        center:         finalData.center,
        zoom:           finalData.zoom,
        bbox:           finalData.bbox,
        catalogUrl:     finalData.catalogUrl?.trim() || null,
        imageCount:     0,
        thumbGradient:  autoGradient(finalData.type),
        impact:         finalData.impact,
        hdxLayers:      finalData.hdxLayers,
        description:    finalData.description?.trim() || null,
        isCustom:       true,
      }

      saveCustomEvent(event)
      onCreated(event)
    } catch (e) {
      setError('Failed to save event. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.screen}>
      <Header
        event={{ name: 'New Event' }}
        onBack={onBack}
        backLabel="All Events"
        onHome={onHome}
      />
      <ProgressBar step={step} />

      <div className={styles.body}>
        {error && <div className={styles.error}>{error}</div>}

        {step === 0 && <Step1 data={data} onChange={update} />}
        {step === 1 && <Step2 data={data} onChange={update} />}
        {step === 2 && <Step3 data={data} onChange={update} />}
      </div>

      <div className={styles.footer}>
        <button
          className={styles.backBtn}
          onClick={step === 0 ? onBack : () => setStep(s => s - 1)}
        >
          ← {step === 0 ? 'Cancel' : 'Back'}
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {step === 1 && (
            <button className={styles.skipBtn} onClick={() => setStep(2)}>Skip</button>
          )}
          {step < 2 ? (
            <button className={styles.nextBtn} onClick={handleNext}>
              Next →
            </button>
          ) : (
            <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Create Event'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
