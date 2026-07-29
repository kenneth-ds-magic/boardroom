import { useEffect, useState } from 'react'
import { api, getUser } from '../api.js'

const ROLES = ['Admin', 'Secretary', 'User']
const STATUSES = ['Active', 'Suspended', 'Fired']

/** Company member management at /users (Secretary/Admin). */
export default function UsersManagement() {
  const [members, setMembers] = useState([])
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(null)   // null | 'new' | membership
  const [error, setError] = useState('')
  const me = getUser()

  const load = () => { api('/users').then(setMembers).catch(e => setError(e.message)) }
  useEffect(() => { load() }, [])

  const filtered = members.filter(m =>
    !search ||
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.email.toLowerCase().includes(search.toLowerCase()) ||
    m.role.toLowerCase().includes(search.toLowerCase()) ||
    (m.title && m.title.toLowerCase().includes(search.toLowerCase()))
  )

  const getInitials = name => {
    if (!name) return '?'
    const parts = name.trim().split(/\s+/)
    return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : parts[0][0].toUpperCase()
  }

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Users</h1>
          <p className="subtitle">{me.companyName} — registered members and their workspace roles</p>
        </div>
        <button className="btn" onClick={() => setEditing('new')}>+ Add user</button>
      </div>
      {error && <div className="toast">{error}</div>}

      <div className="search-bar-wrap" style={{ marginBottom: 16 }}>
        <input 
          type="text" 
          placeholder="Search members by name, email, role, or title..." 
          value={search} 
          onChange={e => setSearch(e.target.value)} 
          style={{ maxWidth: 360, width: '100%' }}
        />
      </div>

      <div className="split-layout">
        <div className="card table-wrap">
          {/* Desktop Table View */}
          <table className="desktop-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Email</th>
                <th>Title</th>
                <th>Role</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(m => (
                <tr key={m.membershipId} className={m.status !== 'Active' ? 'row-muted' : ''}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div className="attendee-avatar">{getInitials(m.name)}</div>
                      <div>
                        <strong>{m.name}</strong>
                        {m.userId === me.id && <span className="pill" style={{ marginLeft: 6 }}>you</span>}
                      </div>
                    </div>
                  </td>
                  <td><a href={`mailto:${m.email}`} style={{ color: 'var(--bottle)' }}>{m.email}</a></td>
                  <td>{m.title || '—'}</td>
                  <td><span className="pill">{m.role}</span></td>
                  <td><span className={`pill pill-${m.status.toLowerCase()}`}>{m.status}</span></td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn small ghost" onClick={() => setEditing(m)}>Edit</button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan="6" style={{ color: 'var(--ink-soft)', textAlign: 'center', padding: '24px 0' }}>
                    {search ? 'No members match your search.' : 'No members yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Mobile Card List View */}
          <div className="mobile-card-list">
            {filtered.map(m => (
              <div key={m.membershipId} className={`mobile-item-card ${m.status !== 'Active' ? 'muted-card' : ''}`}>
                <div className="mobile-item-header">
                  <div className="attendee-avatar">{getInitials(m.name)}</div>
                  <div className="mobile-item-titles">
                    <div className="mobile-item-name">
                      {m.name}
                      {m.userId === me.id && <span className="pill" style={{ marginLeft: 6 }}>you</span>}
                    </div>
                    <div className="mobile-item-role">{m.title || m.role}</div>
                  </div>
                  <div className="mobile-item-actions">
                    <button className="btn small ghost" onClick={() => setEditing(m)}>Edit</button>
                  </div>
                </div>
                <div className="mobile-item-body">
                  <div className="mobile-item-pills">
                    <span className="pill">{m.role}</span>
                    <span className={`pill pill-${m.status.toLowerCase()}`}>{m.status}</span>
                  </div>
                  <div className="mobile-item-field">
                    <span className="field-label">Email:</span>
                    <a href={`mailto:${m.email}`}>{m.email}</a>
                  </div>
                  {m.contactNumber && (
                    <div className="mobile-item-field">
                      <span className="field-label">Phone:</span>
                      <a href={`tel:${m.contactNumber}`}>{m.contactNumber}</a>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <p style={{ color: 'var(--ink-soft)', textAlign: 'center', padding: '20px 0' }}>
                {search ? 'No members match your search.' : 'No members yet.'}
              </p>
            )}
          </div>
        </div>

        {/* Modal / Side Panel Drawer */}
        {editing === 'new' && (
          <div className="modal-backdrop-responsive">
            <InviteForm onDone={() => { setEditing(null); load() }} onCancel={() => setEditing(null)} />
          </div>
        )}
        {editing && editing !== 'new' && (
          <div className="modal-backdrop-responsive">
            <EditDrawer 
              membership={editing} 
              isSelf={editing.userId === me.id}
              onDone={() => { setEditing(null); load() }} 
              onCancel={() => setEditing(null)} 
            />
          </div>
        )}
      </div>
    </main>
  )
}

function InviteForm({ onDone, onCancel }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'User', title: '', contactNumber: '' })
  const [error, setError] = useState('')
  const set = k => e => setForm({ ...form, [k]: e.target.value })

  async function submit(e) {
    e.preventDefault()
    setError('')
    try {
      await api('/users', { method: 'POST', body: JSON.stringify(form) })
      onDone()
    } catch (err) { setError(err.message) }
  }

  return (
    <form className="card form-card side-panel" onSubmit={submit}>
      <h3>Add user</h3>
      <p style={{ color: 'var(--ink-soft)', fontSize: '0.82rem', marginTop: 0 }}>
        If this email already has a BoardRoom account, they are simply added to your company —
        their existing password keeps working and the one below is ignored.
      </p>
      <label>Name</label>
      <input value={form.name} onChange={set('name')} required />
      <label>Email</label>
      <input type="email" value={form.email} onChange={set('email')} required />
      <label>Password <span style={{ color: 'var(--ink-soft)' }}>(min 8 — for brand-new accounts)</span></label>
      <input type="password" value={form.password} onChange={set('password')} minLength={8} />
      <div className="grid2">
        <div>
          <label>Role</label>
          <select value={form.role} onChange={set('role')}>{ROLES.map(r => <option key={r}>{r}</option>)}</select>
        </div>
        <div>
          <label>Title</label>
          <input value={form.title} onChange={set('title')} placeholder="Director" />
        </div>
      </div>
      <label>Contact number</label>
      <input value={form.contactNumber} onChange={set('contactNumber')} />
      {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>{error}</p>}
      <div className="form-actions">
        <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
        <button className="btn">Add user</button>
      </div>
    </form>
  )
}

function EditDrawer({ membership, isSelf, onDone, onCancel }) {
  const [form, setForm] = useState({
    name: membership.name, email: membership.email || '', role: membership.role, title: membership.title || '',
    status: membership.status, contactNumber: membership.contactNumber || ''
  })
  const [pw, setPw] = useState({ newPassword: '', confirm: '' })
  const [error, setError] = useState('')
  const set = k => e => setForm({ ...form, [k]: e.target.value })

  const pwMismatch = pw.confirm.length > 0 && pw.newPassword !== pw.confirm
  const pwTooShort = pw.newPassword.length > 0 && pw.newPassword.length < 8
  const pwInvalid = pwMismatch || pwTooShort || (pw.newPassword.length > 0 && pw.confirm.length === 0)

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (pwInvalid) { setError('Fix the password fields before saving.'); return }
    try {
      await api(`/users/${membership.membershipId}`, {
        method: 'PUT',
        body: JSON.stringify({ ...form, newPassword: pw.newPassword || null })
      })
      onDone()
    } catch (err) { setError(err.message) }
  }

  return (
    <form className="card form-card side-panel" onSubmit={submit}>
      <h3>Edit {membership.name}</h3>
      <label>Name</label>
      <input value={form.name} onChange={set('name')} required />
      <label>Email</label>
      <input type="email" value={form.email} onChange={set('email')} required />
      <div className="grid2">
        <div>
          <label>Role</label>
          <select value={form.role} onChange={set('role')} disabled={isSelf}>
            {ROLES.map(r => <option key={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label>Status</label>
          <select value={form.status} onChange={set('status')} disabled={isSelf}>
            {STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
      </div>
      {isSelf && <p style={{ fontSize: '0.78rem', color: 'var(--ink-soft)', marginTop: 4 }}>You cannot change your own role or status.</p>}
      <div className="grid2">
        <div>
          <label>Title</label>
          <input value={form.title} onChange={set('title')} />
        </div>
        <div>
          <label>Contact number</label>
          <input value={form.contactNumber} onChange={set('contactNumber')} />
        </div>
      </div>

      <fieldset className="pw-section">
        <legend>Change password</legend>
        <p style={{ fontSize: '0.78rem', color: 'var(--ink-soft)', margin: '0 0 8px' }}>
          Leave blank to keep the current password.
        </p>
        <label>New password <span style={{ color: 'var(--ink-soft)' }}>(min 8 characters)</span></label>
        <input type="password" value={pw.newPassword} minLength={8}
               onChange={e => setPw({ ...pw, newPassword: e.target.value })}
               className={pwTooShort ? 'input-error' : ''} autoComplete="new-password" />
        {pwTooShort && <p className="field-error">Must be at least 8 characters.</p>}
        <label>Confirm new password</label>
        <input type="password" value={pw.confirm}
               onChange={e => setPw({ ...pw, confirm: e.target.value })}
               className={pwMismatch ? 'input-error' : ''} autoComplete="new-password" />
        {pwMismatch && <p className="field-error">Passwords do not match.</p>}
        {!pwMismatch && pw.confirm.length > 0 && pw.newPassword === pw.confirm && (
          <p className="field-ok">Passwords match ✓</p>
        )}
      </fieldset>

      {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>{error}</p>}
      <div className="form-actions">
        <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
        <button className="btn" disabled={pwInvalid}>Save changes</button>
      </div>
    </form>
  )
}
