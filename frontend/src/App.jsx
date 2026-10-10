import { useCallback, useEffect, useState } from 'react'
import './App.css'

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '')
const PAGE_SIZE = 50
const SERVICES = [
  'payment-service',
  'auth-service',
  'api-gateway',
  'inventory-service',
  'notification-service',
]

function Icon({ name, size = 18 }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  }

  const paths = {
    activity: <><path d="M3 12h4l3-8 4 16 3-8h4" /></>,
    alert: <><path d="M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4m0 4h.01" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    pulse: <><path d="M3 12h3l3-7 4 14 3-7h5" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.6 9a7 7 0 0 1 11.6-2L20 12M4 12l2.8 5a7 7 0 0 0 11.6-2" /></>,
    plus: <><path d="M12 5v14m-7-7h14" /></>,
    chevron: <><path d="m9 18 6-6-6-6" /></>,
    server: <><rect x="3" y="4" width="18" height="7" rx="2" /><rect x="3" y="13" width="18" height="7" rx="2" /><path d="M7 7.5h.01M7 16.5h.01m4-9h6m-6 9h6" /></>,
    close: <><path d="m18 6-12 12M6 6l12 12" /></>,
    check: <><path d="m5 12 4 4L19 6" /></>,
    filter: <><path d="M4 7h16M7 12h10m-7 5h4" /></>,
  }

  return <svg {...common}>{paths[name]}</svg>
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date)
}

function localDateTimeValue(date = new Date()) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

function errorMessage(response, body) {
  if (body && typeof body.detail === 'string') return body.detail
  if (body && Array.isArray(body.detail)) return body.detail.map((item) => item.msg).join(', ')
  return `Request failed (${response.status} ${response.statusText})`
}

async function requestDashboardData({ activeTab, page, search }) {
  const endpoint = activeTab === 'anomalies' ? 'anomalies' : 'logs'
  const params = new URLSearchParams({
    limit: String(PAGE_SIZE),
    skip: String(page * PAGE_SIZE),
  })
  if (search.trim()) params.set('search', search.trim())

  const [recordsResponse, statsResponse] = await Promise.all([
    fetch(`${API_URL}/${endpoint}?${params}`),
    fetch(`${API_URL}/stats${search.trim() ? `?search=${encodeURIComponent(search.trim())}` : ''}`),
  ])
  const [records, stats] = await Promise.all([
    recordsResponse.json(),
    statsResponse.json(),
  ])
  if (!recordsResponse.ok) throw new Error(errorMessage(recordsResponse, records))
  if (!statsResponse.ok) throw new Error(errorMessage(statsResponse, stats))
  if (!Array.isArray(records) || typeof stats.total_logs !== 'number'
    || typeof stats.matching_logs !== 'number'
    || typeof stats.matching_anomalies !== 'number') {
    throw new Error('The API returned an unexpected response.')
  }
  return { records, stats }
}

function App() {
  const [logs, setLogs] = useState([])
  const [totalLogs, setTotalLogs] = useState(0)
  const [totalAnomalies, setTotalAnomalies] = useState(0)
  const [averageResponse, setAverageResponse] = useState(0)
  const [matchingLogs, setMatchingLogs] = useState(0)
  const [matchingAnomalies, setMatchingAnomalies] = useState(0)
  const [apiState, setApiState] = useState('checking')
  const [loadError, setLoadError] = useState('')
  const [activeTab, setActiveTab] = useState('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [form, setForm] = useState({
    timestamp: localDateTimeValue(),
    level: 'INFO',
    service: 'payment-service',
    message: '',
    response_time_ms: '250',
    status_code: '200',
  })

  const loadLogs = useCallback(async () => {
    setApiState('checking')
    setLoadError('')
    try {
      const data = await requestDashboardData({ activeTab, page, search })
      setLogs(data.records)
      setTotalLogs(data.stats.total_logs)
      setTotalAnomalies(data.stats.predicted_anomalies)
      setAverageResponse(data.stats.average_response_time_ms)
      setMatchingLogs(data.stats.matching_logs)
      setMatchingAnomalies(data.stats.matching_anomalies)
      setApiState('online')
    } catch (error) {
      setApiState('offline')
      setLoadError(error instanceof Error ? error.message : 'Could not connect to the API.')
    }
  }, [activeTab, page, search])

  useEffect(() => {
    let isActive = true
    requestDashboardData({ activeTab, page, search }).then((data) => {
      if (!isActive) return
      setLogs(data.records)
      setTotalLogs(data.stats.total_logs)
      setTotalAnomalies(data.stats.predicted_anomalies)
      setAverageResponse(data.stats.average_response_time_ms)
      setMatchingLogs(data.stats.matching_logs)
      setMatchingAnomalies(data.stats.matching_anomalies)
      setApiState('online')
    }).catch((error) => {
      if (!isActive) return
      setApiState('offline')
      setLoadError(error instanceof Error ? error.message : 'Could not connect to the API.')
    })
    return () => {
      isActive = false
    }
  }, [activeTab, page, search])

  const visibleLogs = logs
  const activeTotal = activeTab === 'anomalies' ? matchingAnomalies : matchingLogs
  const pageCount = Math.ceil(activeTotal / PAGE_SIZE)
  const anomalyRate = totalLogs ? ((totalAnomalies / totalLogs) * 100).toFixed(1) : '0.0'

  function updateForm(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }))
  }

  async function submitLog(event) {
    event.preventDefault()
    setIsSubmitting(true)
    setSubmitError('')
    setSuccessMessage('')
    try {
      const response = await fetch(`${API_URL}/logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          timestamp: new Date(form.timestamp).toISOString(),
          response_time_ms: Number(form.response_time_ms),
          status_code: Number(form.status_code),
        }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(errorMessage(response, body))
      setSuccessMessage(body.is_anomaly ? 'Log recorded — the model flagged it as anomalous.' : 'Log recorded — the model considers it normal.')
      setForm((current) => ({ ...current, message: '' }))
      await loadLogs()
      window.setTimeout(() => setSuccessMessage(''), 5000)
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Could not submit this log.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" aria-label="Signal home">
          <span className="brand-mark"><Icon name="activity" size={21} /></span>
          <span>signal<span className="brand-dot">.</span></span>
        </a>

        <div className="workspace-label">WORKSPACE</div>
        <nav className="nav-list" aria-label="Main navigation">
          <a className="nav-item selected" href="#overview"><span className="nav-icon"><Icon name="activity" /></span>Overview</a>
          <button className="nav-item" onClick={() => { setActiveTab('all'); setPage(0); document.getElementById('activity')?.scrollIntoView({ behavior: 'smooth' }) }}><span className="nav-icon"><Icon name="server" /></span>Log stream<span className="nav-count">{totalLogs}</span></button>
          <button className="nav-item" onClick={() => { setActiveTab('anomalies'); setPage(0); document.getElementById('activity')?.scrollIntoView({ behavior: 'smooth' }) }}><span className="nav-icon"><Icon name="alert" /></span>Anomalies<span className="nav-count alert-count">{totalAnomalies}</span></button>
        </nav>

        <div className="sidebar-bottom">
          <div className="model-card">
            <div className="model-card-top"><span className="model-icon"><Icon name="pulse" size={16} /></span><span className="model-live-dot" /> MODEL ACTIVE</div>
            <strong>Isolation Forest</strong>
            <span>Unsupervised detection</span>
          </div>
          <div className="sidebar-foot"><span className={`status-dot ${apiState}`} />API {apiState === 'online' ? 'connected' : apiState === 'checking' ? 'connecting' : 'disconnected'}</div>
        </div>
      </aside>

      <main className="main-content" id="overview">
        <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><Icon name="chevron" size={14} /><strong>Overview</strong></div>
          <div className="topbar-actions">
            <span className="environment-tag"><span className={`status-dot ${apiState}`} />{apiState === 'online' ? 'LIVE ENVIRONMENT' : apiState === 'checking' ? 'CONNECTING' : 'API OFFLINE'}</span>
            <button className="icon-button" onClick={loadLogs} title="Refresh data" aria-label="Refresh data"><Icon name="refresh" /></button>
            <button className="primary-button top-add" onClick={() => { setIsFormOpen(true); setSubmitError('') }}><Icon name="plus" size={16} /> Add log</button>
          </div>
        </header>

        <div className="page-content">
          <section className="page-heading">
            <div>
              <div className="eyebrow"><span className="eyebrow-line" /> MONITORING CENTER</div>
              <h1>Good afternoon<span className="heading-period">.</span></h1>
              <p className="subtitle">Your systems at a glance. Spot unusual activity before it becomes an incident.</p>
            </div>
            <div className="heading-date"><Icon name="clock" size={15} /> Updated {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
          </section>

          {loadError && (
            <div className="error-banner" role="alert">
              <Icon name="alert" size={18} />
              <div><strong>Couldn’t load your logs</strong><span>{loadError}. Make sure the API is running at {API_URL}.</span></div>
              <button className="text-button" onClick={loadLogs}>Try again</button>
            </div>
          )}

          <section className="stats-grid" aria-label="Log statistics">
            <article className="stat-card">
              <div className="stat-top"><span>Total logs</span><span className="stat-icon violet"><Icon name="server" /></span></div>
              <div className="stat-value">{totalLogs.toLocaleString()}</div>
              <div className="stat-foot"><span className="stat-caption">Records in database</span><span className="mini-bars" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></span></div>
            </article>
            <article className="stat-card">
              <div className="stat-top"><span>Anomalies detected</span><span className="stat-icon coral"><Icon name="alert" /></span></div>
              <div className="stat-value">{totalAnomalies.toLocaleString()}</div>
              <div className="stat-foot"><span className="stat-caption"><span className="inline-dot coral-dot" />{anomalyRate}% of all logs</span><span className="mini-bars coral-bars" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></span></div>
            </article>
            <article className="stat-card">
              <div className="stat-top"><span>Avg. response time</span><span className="stat-icon blue"><Icon name="clock" /></span></div>
              <div className="stat-value">{averageResponse.toLocaleString()}<small>ms</small></div>
              <div className="stat-foot"><span className="stat-caption">Across all log records</span><span className="mini-bars blue-bars" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></span></div>
            </article>
          </section>

          <section className="services-strip">
            <div className="services-title"><span className="services-pulse"><Icon name="pulse" size={16} /></span><div><strong>Service coverage</strong><span>Model-supported categories</span></div></div>
            <div className="service-items">
              {SERVICES.map((service) => <div className="service-item" key={service}><span className="service-health-dot" />{service}</div>)}
            </div>
            <div className="healthy-label">5 trained categories</div>
          </section>

          <section className="activity-panel" id="activity">
            <div className="panel-heading">
              <div><h2>Log activity</h2><p>Review recent events and investigate anomalies.</p></div>
              <button className="outline-button" onClick={loadLogs}><Icon name="refresh" size={15} /> Refresh</button>
            </div>
            <div className="table-toolbar">
              <div className="tabs" role="tablist" aria-label="Log filter">
                <button role="tab" aria-selected={activeTab === 'all'} className={activeTab === 'all' ? 'tab active' : 'tab'} onClick={() => { setActiveTab('all'); setPage(0) }}>All logs<span>{totalLogs}</span></button>
                <button role="tab" aria-selected={activeTab === 'anomalies'} className={activeTab === 'anomalies' ? 'tab active' : 'tab'} onClick={() => { setActiveTab('anomalies'); setPage(0) }}>Anomalies<span className="tab-alert">{totalAnomalies}</span></button>
              </div>
              <label className="search-box"><Icon name="search" size={16} /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(0) }} placeholder="Search logs..." /></label>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>EVENT</th><th>SERVICE</th><th>LEVEL</th><th>RESPONSE</th><th>STATUS</th><th>MODEL PREDICTION</th><th>GROUND TRUTH</th><th>TIME</th></tr></thead>
                <tbody>
                  {visibleLogs.map((log) => (
                    <tr key={log.id}>
                      <td><div className="event-cell"><span className={`event-indicator ${log.is_anomaly ? 'event-anomaly' : ''}`} /><div><strong>{log.message || 'Log event'}</strong><span>Event #{log.id}</span></div></div></td>
                      <td><span className="service-name">{log.service}</span></td>
                      <td><span className={`level-pill level-${String(log.level).toLowerCase()}`}>{log.level}</span></td>
                      <td className={Number(log.response_time_ms) > 1000 ? 'slow-response' : ''}>{Number(log.response_time_ms).toLocaleString()} <span className="unit">ms</span></td>
                      <td><span className={`http-code ${Number(log.status_code) >= 500 ? 'http-error' : Number(log.status_code) >= 400 ? 'http-warn' : ''}`}>{log.status_code}</span></td>
                      <td><span className={`prediction ${log.is_anomaly ? 'prediction-anomaly' : ''}`}><span />{Number(log.anomaly_score).toFixed(4)}</span></td>
                      <td>{log.ground_truth === null || log.ground_truth === undefined ? <span className="truth-unavailable">—</span> : <span className={`truth-pill ${log.ground_truth ? 'truth-anomaly' : 'truth-normal'}`}>{log.ground_truth ? 'Anomaly' : 'Normal'}</span>}</td>
                      <td className="time-cell">{formatDate(log.timestamp)}</td>
                    </tr>
                  ))}
                  {!visibleLogs.length && (
                    <tr><td colSpan="8"><div className="empty-state"><span className="empty-icon"><Icon name={search ? 'search' : activeTab === 'anomalies' ? 'check' : 'server'} size={22} /></span><strong>{search ? 'No matching logs' : activeTab === 'anomalies' ? 'No anomalies detected' : apiState === 'online' ? 'No logs yet' : 'Waiting for API connection'}</strong><span>{search ? 'Try a different search term.' : activeTab === 'anomalies' ? 'Your recent logs are looking normal.' : 'Submit a log event to see it appear here.'}</span></div></td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="table-footer"><span>Showing <strong>{activeTotal ? page * PAGE_SIZE + 1 : 0}–{page * PAGE_SIZE + visibleLogs.length}</strong> of <strong>{activeTotal.toLocaleString()}</strong> records</span><div className="pagination"><button className="page-button" disabled={page === 0} onClick={() => setPage((current) => Math.max(0, current - 1))}>Previous</button><span>Page {pageCount ? page + 1 : 0} of {pageCount}</span><button className="page-button" disabled={page + 1 >= pageCount} onClick={() => setPage((current) => current + 1)}>Next</button></div><span className="footer-live"><span className={`status-dot ${apiState}`} /> API-backed</span></div>
          </section>
          <footer className="page-footer"><span>Signal Log Monitor</span><span>Powered by Isolation Forest <span className="footer-separator">·</span> API {API_URL}</span></footer>
        </div>
      </main>

      {successMessage && <div className="toast success-toast" role="status"><span className="toast-check"><Icon name="check" size={16} /></span>{successMessage}<button onClick={() => setSuccessMessage('')} aria-label="Dismiss"><Icon name="close" size={15} /></button></div>}

      {isFormOpen && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsFormOpen(false) }}>
          <section className="log-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
            <div className="modal-header"><div><div className="eyebrow"><span className="eyebrow-line" /> NEW EVENT</div><h2 id="modal-title">Add a log entry</h2><p>Send an event through the anomaly detection model.</p></div><button className="icon-button" onClick={() => setIsFormOpen(false)} aria-label="Close dialog"><Icon name="close" /></button></div>
            <form onSubmit={submitLog}>
              <div className="form-grid">
                <label className="form-field full-field">Message<input name="message" value={form.message} onChange={updateForm} placeholder="e.g. Payment request timed out" /></label>
                <label className="form-field">Service<select name="service" value={form.service} onChange={updateForm}>{SERVICES.map((service) => <option key={service}>{service}</option>)}</select></label>
                <label className="form-field">Level<select name="level" value={form.level} onChange={updateForm}>{['INFO', 'WARNING', 'ERROR', 'CRITICAL'].map((level) => <option key={level}>{level}</option>)}</select></label>
                <label className="form-field">Response time (ms)<input name="response_time_ms" type="number" min="0" step="any" required value={form.response_time_ms} onChange={updateForm} /></label>
                <label className="form-field">HTTP status code<input name="status_code" type="number" min="100" max="599" required value={form.status_code} onChange={updateForm} /></label>
                <label className="form-field full-field">Timestamp<input name="timestamp" type="datetime-local" required value={form.timestamp} onChange={updateForm} /></label>
              </div>
              {submitError && <div className="form-error" role="alert"><Icon name="alert" size={16} />{submitError}</div>}
              <div className="modal-actions"><button type="button" className="cancel-button" onClick={() => setIsFormOpen(false)}>Cancel</button><button type="submit" className="primary-button" disabled={isSubmitting}><Icon name="plus" size={16} />{isSubmitting ? 'Analyzing…' : 'Submit log'}</button></div>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}

export default App
