import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, getUser } from '../api.js'
import AttendeePicker from '../components/AttendeePicker.jsx'

const MODES = ['Physical', 'Online', 'Hybrid']

export default function Dashboard() {
  const [meetings, setMeetings] = useState([])
  const [actions, setActions] = useState([])
  const [showNew, setShowNew] = useState(false)
  const [showContact, setShowContact] = useState(false)
  const user = getUser()
  const isManagement = ['Secretary', 'Admin'].includes(user.role)

  const load = () => {
    api('/meetings').then(setMeetings)
    api('/actions/mine').then(setActions)
  }
  useEffect(() => { load() }, [])

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Meeting register</h1>
          <p className="subtitle">{user.companyName}</p>
        </div>
        {isManagement && (
          <div className="head-actions">
            <button className="btn ghost" onClick={() => setShowContact(v => !v)}>Add contact</button>
            <button className="btn" onClick={() => setShowNew(v => !v)}>New meeting</button>
          </div>
        )}
      </div>

      {showContact && <QuickContactForm onDone={() => setShowContact(false)} />}
      {showNew && <NewMeetingForm onCreated={() => { setShowNew(false); load() }} onClose={() => setShowNew(false)} />}

      <div className="card table-wrap">
        <table>
          <thead>
            <tr><th>Docket</th><th>Title</th><th>When (local)</th><th>Mode</th><th>Attendees</th><th>Papers</th><th>Status</th></tr>
          </thead>
          <tbody>
            {meetings.map(m => (
              <tr key={m.id}>
                <td data-label="Docket"><Link to={`/meetings/${m.id}`} className={`docket ${m.minutesStatus === 'Finalized' ? 'docket-final' : ''}`}>{m.meetingCode}</Link></td>
                <td data-label="Title"><Link to={`/meetings/${m.id}`} className="hover-underline" style={{ color: 'inherit', textDecoration: 'none' }}>{m.title}</Link></td>
                <td data-label="When (local)">{new Date(m.scheduledAtUtc).toLocaleString()}</td>
                <td data-label="Mode">{m.mode}</td>
                <td data-label="Attendees">{m.attendeeCount}</td>
                <td data-label="Papers">{m.paperCount}</td>
                <td data-label="Status"><span className={`pill pill-${m.status.toLowerCase()}`}>{m.status}</span></td>
              </tr>
            ))}
            {meetings.length === 0 && <tr><td colSpan="7" style={{ color: 'var(--ink-soft)' }}>No meetings you attend yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <h2 style={{ marginTop: 32 }}>My open action points</h2>
      <div className="card table-wrap">
        <table>
          <thead><tr><th>Action</th><th>Due</th><th>Meeting</th><th></th></tr></thead>
          <tbody>
            {actions.map(a => (
              <tr key={a.id}>
                <td data-label="Action">{a.description}</td>
                <td data-label="Due">{a.dueDate ? new Date(a.dueDate).toLocaleDateString() : '—'}</td>
                <td data-label="Meeting" className="docket-sm">{a.meetingCode}</td>
                <td data-label=""><button className="btn small" onClick={async () => { await api(`/actions/${a.id}/complete`, { method: 'POST' }); load() }}>Mark complete</button></td>
              </tr>
            ))}
            {actions.length === 0 && <tr><td colSpan="4" style={{ color: 'var(--ink-soft)' }}>Nothing outstanding. Well done.</td></tr>}
          </tbody>
        </table>
      </div>
    </main>
  )
}

/** Quick-add form; the full CRUD board lives at /contacts. Posts to /api/contacts. */
function QuickContactForm({ onDone }) {
  const [form, setForm] = useState({ name: '', title: '', email: '', contactNumber: '' })
  const [error, setError] = useState('')
  const set = k => e => setForm({ ...form, [k]: e.target.value })

  async function submit(e) {
    e.preventDefault()
    setError('')
    try {
      await api('/contacts', { method: 'POST', body: JSON.stringify(form) })  // fixed path (was /users/contacts → 405)
      onDone()
    } catch (err) { setError(err.message) }
  }

  return (
    <form className="card form-card" onSubmit={submit}>
      <h3>Add external contact</h3>
      <p style={{ color: 'var(--ink-soft)', fontSize: '0.85rem', marginTop: 0 }}>
        Observers and advisers receive meeting email and secure links but can never sign in.
        Manage the full list on the <Link to="/contacts">contacts page</Link>.
      </p>
      <div className="grid2">
        <div><label>Name</label><input value={form.name} onChange={set('name')} required /></div>
        <div><label>Title</label><input value={form.title} onChange={set('title')} placeholder="Non-executive Director" /></div>
      </div>
      <div className="grid2">
        <div><label>Email</label><input type="email" value={form.email} onChange={set('email')} required /></div>
        <div><label>Contact number</label><input value={form.contactNumber} onChange={set('contactNumber')} /></div>
      </div>
      {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>{error}</p>}
      <div className="form-actions">
        <button type="button" className="btn ghost" onClick={onDone}>Cancel</button>
        <button className="btn">Save contact</button>
      </div>
    </form>
  )
}

function NewMeetingForm({ onCreated, onClose }) {
  const [directory, setDirectory] = useState([])
  const [form, setForm] = useState({
    title: '', type: 'Regular', mode: 'Physical', date: '', time: '10:00',
    durationMinutes: 120, location: '', videoLink: ''
  })
  const [attendees, setAttendees] = useState([])
  const [error, setError] = useState('')
  const nav = useNavigate()
  useEffect(() => { api('/auth/users').then(setDirectory) }, [])
  const set = k => e => setForm({ ...form, [k]: e.target.value })
  const showLocation = form.mode !== 'Online'
  const showVideo = form.mode !== 'Physical'

  async function submit(e) {
    e.preventDefault()
    setError('')
    try {
      const { id } = await api('/meetings', {
        method: 'POST',
        body: JSON.stringify({
          title: form.title, type: form.type, mode: form.mode,
          scheduledAtUtc: new Date(`${form.date}T${form.time}:00Z`).toISOString(),
          durationMinutes: Number(form.durationMinutes),
          location: showLocation ? form.location : '',
          videoLink: showVideo ? form.videoLink : null,
          attendees
        })
      })
      onCreated()
      nav(`/meetings/${id}`)
    } catch (err) { setError(err.message) }
  }

  return (
    <form className="card form-card" onSubmit={submit}>
      <h3>New meeting</h3>
      <div style={{ marginBottom: 12 }}>
        <label>Title</label>
        <input value={form.title} onChange={set('title')} required placeholder="Q3 Board Meeting" />
      </div>

      <label style={{ display: 'block', marginBottom: 4 }}>Meeting Type</label>
      <div className="selector-grid">
        {[
          { id: 'Regular', name: 'Regular', desc: 'Standard scheduled session' },
          { id: 'Special', name: 'Special', desc: 'Extraordinary / emergency' },
          { id: 'Annual', name: 'Annual', desc: 'Annual General Meeting' }
        ].map(t => (
          <div
            key={t.id}
            className={`selector-card ${form.type === t.id ? 'selected' : ''}`}
            onClick={() => setForm({ ...form, type: t.id })}
            role="button"
            tabIndex={0}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setForm({ ...form, type: t.id }) }}
          >
            <span className="selector-card-title">{t.name}</span>
            <span className="selector-card-desc">{t.desc}</span>
          </div>
        ))}
      </div>

      <div className="grid2">
        <div>
          <label>Mode</label>
          <select value={form.mode} onChange={set('mode')} style={{ padding: '0 8px' }}>
            <option>Physical</option>
            <option>Online</option>
            <option>Hybrid</option>
          </select>
        </div>
        <div>
          <label>Duration (minutes)</label>
          <input type="number" min="15" step="15" value={form.durationMinutes} onChange={set('durationMinutes')} />
        </div>
      </div>
      <div className="grid2">
        <div><label>Date (UTC)</label><input type="date" value={form.date} onChange={set('date')} required /></div>
        <div><label>Time (UTC)</label><input type="time" value={form.time} onChange={set('time')} required /></div>
      </div>
      {showLocation && (
        <div>
          <label>Location</label>
          <input value={form.location} onChange={set('location')} placeholder="Boardroom A" required={form.mode === 'Physical'} />
        </div>
      )}
      {showVideo && (
        <div>
          <label>Video link</label>
          <input type="url" value={form.videoLink} onChange={set('videoLink')} placeholder="https://zoom.us/j/…" required={form.mode === 'Online'} />
        </div>
      )}
      <label style={{ marginTop: 12 }}>Attendees <span style={{ color: 'var(--ink-soft)' }}>(one chair; you are added automatically)</span></label>
      <AttendeePicker directory={directory} value={attendees} onChange={setAttendees} />
      {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>{error}</p>}
      <div className="form-actions" style={{ flexWrap: 'wrap', gap: 10 }}>
        <button type="button" className="btn ghost" onClick={onClose}>Close</button>
        <button className="btn">Create meeting</button>
      </div>
    </form>
  )
}
