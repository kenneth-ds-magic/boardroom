import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, getUser } from '../api.js'

export default function Dashboard() {
  const [meetings, setMeetings] = useState([])
  const [users, setUsers] = useState([])
  const [creating, setCreating] = useState(false)
  const [addingContact, setAddingContact] = useState(false)
  const [addingUser, setAddingUser] = useState(false)
  const [myActions, setMyActions] = useState([])
  const canManage = ['Secretary', 'Admin'].includes(getUser()?.role)

  const load = () => {
    api('/meetings').then(setMeetings)
    api('/actions/mine').then(setMyActions)
  }
  const loadUsers = () => api('/auth/users').then(setUsers)
  useEffect(() => { load(); loadUsers() }, [])

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h1>Meeting register</h1>
        {canManage && <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn secondary" onClick={() => { setAddingUser(v => !v); setAddingContact(false); setCreating(false) }}>
            {addingUser ? 'Close' : 'Add user'}</button>
          <button className="btn secondary" onClick={() => { setAddingContact(v => !v); setAddingUser(false); setCreating(false) }}>
            {addingContact ? 'Close' : 'Add contact'}</button>
          <button className="btn" onClick={() => { setCreating(v => !v); setAddingUser(false); setAddingContact(false) }}>
            {creating ? 'Close' : 'New meeting'}</button>
        </div>}
      </div>

      {addingUser && <UserForm onSaved={() => { setAddingUser(false); loadUsers() }} />}
      {addingContact && <ContactForm onSaved={() => { setAddingContact(false); loadUsers() }} />}
      {creating && <NewMeetingForm users={users} onCreated={() => { setCreating(false); load() }} />}

      {meetings.length === 0 && !creating &&
        <div className="card">No meetings yet. {canManage ? 'Create the first entry in the register.' : 'You will receive an email when a meeting is scheduled.'}</div>}

      {meetings.map(m => (
        <Link key={m.id} className="meeting-row" to={`/meetings/${m.id}`}>
          <span className={`docket ${m.minutesStatus === 'Finalized' ? 'finalized' : ''}`}>{m.meetingCode}</span>
          <span className="title">{m.title}</span>
          <span className="meta">{new Date(m.scheduledAtUtc).toLocaleString()} · {m.attendeeCount} attendees · {m.paperCount} papers</span>
          <span className="pill">{m.minutesStatus === 'Finalized' ? 'Minutes finalized' : m.status}</span>
        </Link>
      ))}

      {myActions.length > 0 && <>
        <h2 style={{ marginTop: 36 }}>My open action points</h2>
        <div className="card">
          <table className="plain">
            <thead><tr><th>Action</th><th>Meeting</th><th>Due</th></tr></thead>
            <tbody>{myActions.map(a => (
              <tr key={a.id}>
                <td>{a.description}</td>
                <td><span className="docket">{a.meetingCode}</span></td>
                <td>{a.dueDate || '—'}</td>
              </tr>))}
            </tbody>
          </table>
        </div>
      </>}
    </>
  )
}

function ContactForm({ onSaved }) {
  const [f, setF] = useState({ name: '', title: '', email: '', contactNumber: '' })
  const [error, setError] = useState('')
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))

  async function submit(e) {
    e.preventDefault()
    setError('')
    try {
      await api('/contacts', { method: 'POST', body: JSON.stringify(f) })
      onSaved()
    } catch (err) { setError(err.message) }
  }

  return (
    <form className="card" onSubmit={submit}>
      <h3>Add external contact</h3>
      <p style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', marginTop: 4 }}>
        Contacts join your company directory: they can be selected as meeting attendees and receive
        all meeting emails (invites, papers, finalized minutes links), but they cannot sign in.
      </p>
      <div className="grid2">
        <div><label>Name</label><input value={f.name} onChange={e => set('name', e.target.value)} required /></div>
        <div><label>Title</label><input value={f.title} onChange={e => set('title', e.target.value)} placeholder="Non-executive Director" /></div>
        <div><label>Email</label><input type="email" value={f.email} onChange={e => set('email', e.target.value)} required /></div>
        <div><label>Contact number</label><input value={f.contactNumber} onChange={e => set('contactNumber', e.target.value)} /></div>
      </div>
      {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>{error}</p>}
      <button className="btn" style={{ marginTop: 16 }}>Save contact</button>
    </form>
  )
}

function UserForm({ onSaved }) {
  const [f, setF] = useState({ name: '', title: '', email: '', contactNumber: '', password: '', role: 'User' })
  const [error, setError] = useState('')
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (f.password.length < 8) return setError('Password must be at least 8 characters.')
    try {
      await api('/users', { method: 'POST', body: JSON.stringify(f) })
      onSaved()
    } catch (err) { setError(err.message) }
  }

  return (
    <form className="card" onSubmit={submit}>
      <h3>Add registered user</h3>
      <p style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', marginTop: 4 }}>
        Registered users can sign in using their email and password to access the meeting board.
      </p>
      <div className="grid2">
        <div><label>Name</label><input value={f.name} onChange={e => set('name', e.target.value)} required /></div>
        <div><label>Title</label><input value={f.title} onChange={e => set('title', e.target.value)} placeholder="Non-executive Director" /></div>
        <div><label>Email</label><input type="email" value={f.email} onChange={e => set('email', e.target.value)} required /></div>
        <div><label>Contact number</label><input value={f.contactNumber} onChange={e => set('contactNumber', e.target.value)} /></div>
        <div><label>Password (8+ characters)</label><input type="password" value={f.password} onChange={e => set('password', e.target.value)} required minLength={8} /></div>
        <div>
          <label>Role</label>
          <select value={f.role} onChange={e => set('role', e.target.value)}>
            <option value="User">User</option>
            <option value="Secretary">Secretary</option>
            <option value="Admin">Admin</option>
          </select>
        </div>
      </div>
      {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>{error}</p>}
      <button className="btn" style={{ marginTop: 16 }}>Save user</button>
    </form>
  )
}

function NewMeetingForm({ users, onCreated }) {
  const [f, setF] = useState({ title: '', type: 'Regular', date: '', time: '10:00', durationMinutes: 120, location: '' })
  const [attendees, setAttendees] = useState({}) // userId -> {selected, isChair}
  const [error, setError] = useState('')
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))

  async function submit(e) {
    e.preventDefault()
    const selected = Object.entries(attendees).filter(([, v]) => v.selected)
    if (!selected.length) return setError('Select at least one attendee.')
    try {
      await api('/meetings', {
        method: 'POST',
        body: JSON.stringify({
          title: f.title, type: f.type,
          scheduledAtUtc: new Date(`${f.date}T${f.time}:00Z`).toISOString(),
          durationMinutes: Number(f.durationMinutes), location: f.location,
          attendees: selected.map(([userId, v]) => ({ userId, isChair: !!v.isChair }))
        })
      })
      onCreated()
    } catch (err) { setError(err.message) }
  }

  return (
    <form className="card" onSubmit={submit}>
      <h3>New meeting</h3>
      <div className="grid2">
        <div><label>Title</label><input value={f.title} onChange={e => set('title', e.target.value)} required /></div>
        <div><label>Type</label>
          <select value={f.type} onChange={e => set('type', e.target.value)}>
            <option>Regular</option><option>Special</option><option>Annual</option>
          </select></div>
        <div><label>Date (UTC)</label><input type="date" value={f.date} onChange={e => set('date', e.target.value)} required /></div>
        <div><label>Time (UTC)</label><input type="time" value={f.time} onChange={e => set('time', e.target.value)} required /></div>
        <div><label>Duration (minutes)</label><input type="number" min="15" value={f.durationMinutes} onChange={e => set('durationMinutes', e.target.value)} /></div>
        <div><label>Location</label><input value={f.location} onChange={e => set('location', e.target.value)} placeholder="Boardroom / video link" /></div>
      </div>
      <label>Attendees</label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 8 }}>
        {users.map(u => {
          const a = attendees[u.id] || {}
          const isSelected = !!a.selected
          const isChair = !!a.isChair
          const hasChair = Object.values(attendees).some(att => att.selected && att.isChair)
          const showChairOption = isSelected && (isChair || !hasChair)
          return (
            <div
              key={u.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                border: isSelected ? '1px solid var(--bottle)' : '1px solid var(--line)',
                borderRadius: 'var(--radius)',
                background: isSelected ? 'var(--bottle-tint)' : '#fff',
                fontSize: '0.9rem',
                transition: 'all 0.2s ease',
                gap: 12
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  style={{ width: 'auto', cursor: 'pointer', margin: 0 }}
                  onChange={e => {
                    const checked = e.target.checked
                    setAttendees(p => ({
                      ...p,
                      [u.id]: {
                        ...a,
                        selected: checked,
                        isChair: checked ? !!a.isChair : false
                      }
                    }))
                  }}
                />
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <div style={{ fontWeight: 500, color: 'var(--ink)' }}>{u.name}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--ink-soft)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {u.title || (u.isContact ? 'External Contact' : 'Staff')}
                  </div>
                </div>
              </div>

              {showChairOption && (
                <button
                  type="button"
                  onClick={() => setAttendees(p => ({ ...p, [u.id]: { ...a, isChair: !isChair } }))}
                  style={{
                    padding: '3px 8px',
                    fontSize: '0.72rem',
                    borderRadius: '4px',
                    border: '1px solid',
                    borderColor: isChair ? 'var(--brass)' : 'var(--line)',
                    background: isChair ? '#f5eedd' : 'transparent',
                    color: isChair ? 'var(--brass)' : 'var(--ink-soft)',
                    fontWeight: 600,
                    margin: 0,
                    cursor: 'pointer'
                  }}
                >
                  {isChair ? 'Chair ★' : 'Make Chair'}
                </button>
              )}
            </div>
          )
        })}
      </div>
      {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>{error}</p>}
      <button className="btn" style={{ marginTop: 16 }}>Create meeting</button>
      <p style={{ fontSize: '0.8rem', color: 'var(--ink-soft)' }}>
        Creating the meeting assigns its docket number. Invites are sent from the workspace when you're ready.
      </p>
    </form>
  )
}
