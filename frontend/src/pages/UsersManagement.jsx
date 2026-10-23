import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { FiUserPlus, FiSearch, FiGrid, FiList, FiEdit2, FiMail, FiPhone, FiLock, FiCheckCircle, FiAlertCircle, FiX, FiUserCheck, FiUserX, FiShield } from 'react-icons/fi'
import { api, getUser } from '../api.js'

const ROLES = ['Admin', 'Secretary', 'User']
const STATUSES = ['Active', 'Suspended', 'Fired']

/** Company member management at /users (Secretary/Admin). */
export default function UsersManagement() {
  const [members, setMembers] = useState([])
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState('grid') // 'grid' | 'table'
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

  const stats = {
    total: members.length,
    admins: members.filter(m => m.role === 'Admin').length,
    active: members.filter(m => m.status === 'Active').length,
    restricted: members.filter(m => m.status !== 'Active').length
  }

  const getInitials = name => {
    if (!name) return '?'
    const parts = name.trim().split(/\s+/)
    return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : parts[0][0].toUpperCase()
  }

  const getRoleIcon = role => {
    if (role === 'Admin') return '👑'
    if (role === 'Secretary') return '📝'
    return '👤'
  }

  return (
    <motion.main
      className="page"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Header Banner */}
      <div className="page-head">
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>👥</span> Users & Workspace Members
          </h1>
          <p className="subtitle">{me.companyName} — Manage member accounts, role permissions, and workspace security</p>
        </div>
        <button
          className="btn"
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          onClick={() => setEditing('new')}
        >
          <FiUserPlus size={16} />
          <span>Add User</span>
        </button>
      </div>

      {error && (
        <motion.div
          className="toast"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {error}
        </motion.div>
      )}

      {/* Summary Stat Cards */}
      <div className="users-stats-grid">
        <div className="users-stat-card">
          <div className="users-stat-icon" style={{ background: 'var(--bottle-tint)', color: 'var(--bottle)' }}>
            👥
          </div>
          <div>
            <div className="users-stat-num">{stats.total}</div>
            <div className="users-stat-label">Total Members</div>
          </div>
        </div>

        <div className="users-stat-card">
          <div className="users-stat-icon" style={{ background: 'var(--brass-tint)', color: 'var(--brass)' }}>
            👑
          </div>
          <div>
            <div className="users-stat-num">{stats.admins}</div>
            <div className="users-stat-label">Admins & Executives</div>
          </div>
        </div>

        <div className="users-stat-card">
          <div className="users-stat-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
            <FiUserCheck size={20} />
          </div>
          <div>
            <div className="users-stat-num">{stats.active}</div>
            <div className="users-stat-label">Active Accounts</div>
          </div>
        </div>

        <div className="users-stat-card">
          <div className="users-stat-icon" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
            <FiUserX size={20} />
          </div>
          <div>
            <div className="users-stat-num">{stats.restricted}</div>
            <div className="users-stat-label">Restricted / Suspended</div>
          </div>
        </div>
      </div>

      {/* Search & View Mode Filter Bar */}
      <div className="users-filter-bar">
        <div className="users-search-input-wrap">
          <FiSearch className="users-search-icon" size={16} />
          <input
            type="text"
            className="users-search-input"
            placeholder="Search members by name, email, role, or title..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="users-view-toggle-group">
          <button
            type="button"
            className={`users-view-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
            onClick={() => setViewMode('grid')}
            title="Grid Card View"
          >
            <FiGrid size={15} />
            <span>Cards</span>
          </button>
          <button
            type="button"
            className={`users-view-toggle-btn ${viewMode === 'table' ? 'active' : ''}`}
            onClick={() => setViewMode('table')}
            title="Table List View"
          >
            <FiList size={15} />
            <span>Table</span>
          </button>
        </div>
      </div>

      {/* MEMBER GRID VIEW */}
      {viewMode === 'grid' && (
        <div className="users-grid-container">
          <AnimatePresence>
            {filtered.map(m => (
              <motion.div
                key={m.membershipId}
                className="user-card-executive"
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
              >
                <div className="user-card-top">
                  <div className="user-avatar-large">{getInitials(m.name)}</div>
                  <div className="user-card-meta">
                    <div className="user-card-name">
                      {m.name}
                      {m.userId === me.id && <span className="pill" style={{ fontSize: '0.68rem', padding: '1px 6px' }}>you</span>}
                    </div>
                    <div className="user-card-title">{m.title || 'Board Member'}</div>
                    <span className={`role-pill-executive ${m.role.toLowerCase()}`}>
                      {getRoleIcon(m.role)} {m.role}
                    </span>
                  </div>
                </div>

                <div className="user-card-contacts">
                  <a href={`mailto:${m.email}`} className="user-contact-item" title={m.email}>
                    <FiMail size={14} style={{ flexShrink: 0 }} />
                    <span>{m.email}</span>
                  </a>
                  {m.contactNumber ? (
                    <a href={`tel:${m.contactNumber}`} className="user-contact-item">
                      <FiPhone size={14} style={{ flexShrink: 0 }} />
                      <span>{m.contactNumber}</span>
                    </a>
                  ) : (
                    <span className="user-contact-item" style={{ opacity: 0.5 }}>
                      <FiPhone size={14} style={{ flexShrink: 0 }} />
                      <span>No phone specified</span>
                    </span>
                  )}
                </div>

                <div className="user-card-footer">
                  <span className={`status-badge-inline ${m.status.toLowerCase()}`}>
                    <span className="status-dot-mini"></span>
                    {m.status}
                  </span>

                  <button
                    type="button"
                    className="btn small ghost"
                    style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                    onClick={() => setEditing(m)}
                  >
                    <FiEdit2 size={13} />
                    <span>Edit Profile</span>
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {filtered.length === 0 && (
            <div style={{ gridColumn: '1 / -1', background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: '40px 20px', textAlign: 'center', color: 'var(--ink-soft)' }}>
              <div style={{ fontSize: '2rem', marginBottom: 8 }}>🔍</div>
              <div style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--ink)' }}>No workspace members found</div>
              <div style={{ fontSize: '0.85rem', marginTop: 4 }}>{search ? `No members match "${search}"` : 'No members configured yet.'}</div>
            </div>
          )}
        </div>
      )}

      {/* MEMBER TABLE VIEW */}
      {viewMode === 'table' && (
        <div className="card table-wrap" style={{ border: '1px solid var(--line)', borderRadius: 12, overflowX: 'auto' }}>
          <table className="desktop-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Email</th>
                <th>Title</th>
                <th>Role</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(m => (
                <tr key={m.membershipId} className={m.status !== 'Active' ? 'row-muted' : ''}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div className="attendee-avatar" style={{ background: 'var(--bottle)', color: '#fff' }}>{getInitials(m.name)}</div>
                      <div>
                        <strong>{m.name}</strong>
                        {m.userId === me.id && <span className="pill" style={{ marginLeft: 6 }}>you</span>}
                      </div>
                    </div>
                  </td>
                  <td><a href={`mailto:${m.email}`} style={{ color: 'var(--bottle)', fontWeight: 500 }}>{m.email}</a></td>
                  <td>{m.title || '—'}</td>
                  <td>
                    <span className={`role-pill-executive ${m.role.toLowerCase()}`}>
                      {getRoleIcon(m.role)} {m.role}
                    </span>
                  </td>
                  <td>
                    <span className={`status-badge-inline ${m.status.toLowerCase()}`}>
                      <span className="status-dot-mini"></span>
                      {m.status}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      className="btn small ghost"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      onClick={() => setEditing(m)}
                    >
                      <FiEdit2 size={13} /> Edit
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan="6" style={{ color: 'var(--ink-soft)', textAlign: 'center', padding: '32px 0' }}>
                    {search ? `No members match "${search}"` : 'No members yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Mobile Card List Fallback for Table View */}
          <div className="mobile-card-list">
            {filtered.map(m => (
              <div key={m.membershipId} className={`mobile-item-card ${m.status !== 'Active' ? 'muted-card' : ''}`}>
                <div className="mobile-item-header">
                  <div className="attendee-avatar" style={{ background: 'var(--bottle)', color: '#fff' }}>{getInitials(m.name)}</div>
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
                    <span className={`role-pill-executive ${m.role.toLowerCase()}`}>{getRoleIcon(m.role)} {m.role}</span>
                    <span className={`status-badge-inline ${m.status.toLowerCase()}`}><span className="status-dot-mini"></span>{m.status}</span>
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
      )}

      {/* MODAL SLIDE-OVER DRAWER FOR ADD / EDIT (RENDERED AT BODY LEVEL VIA PORTAL) */}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {editing === 'new' && (
              <div className="modal-backdrop" onClick={() => setEditing(null)}>
                <motion.div
                  className="modal-content modal-form-modal"
                  style={{ maxWidth: 540, width: '90%' }}
                  onClick={e => e.stopPropagation()}
                  initial={{ opacity: 0, scale: 0.94 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.94 }}
                  transition={{ duration: 0.2 }}
                >
                  <InviteForm onDone={() => { setEditing(null); load() }} onCancel={() => setEditing(null)} />
                </motion.div>
              </div>
            )}

            {editing && editing !== 'new' && (
              <div className="modal-backdrop" onClick={() => setEditing(null)}>
                <motion.div
                  className="modal-content modal-form-modal"
                  style={{ maxWidth: 540, width: '90%' }}
                  onClick={e => e.stopPropagation()}
                  initial={{ opacity: 0, scale: 0.94 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.94 }}
                  transition={{ duration: 0.2 }}
                >
                  <EditDrawer
                    membership={editing}
                    isSelf={editing.userId === me.id}
                    onDone={() => { setEditing(null); load() }}
                    onCancel={() => setEditing(null)}
                  />
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </motion.main>
  )
}

function InviteForm({ onDone, onCancel }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '', role: 'User', title: '', contactNumber: '' })
  const [error, setError] = useState('')
  const set = k => e => setForm({ ...form, [k]: e.target.value })

  const pwMismatch = form.confirmPassword.length > 0 && form.password !== form.confirmPassword
  const pwTooShort = form.password.length > 0 && form.password.length < 8
  const pwInvalid = pwMismatch || pwTooShort || (form.password.length > 0 && form.confirmPassword.length === 0)

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (pwInvalid) {
      setError('Fix the password fields before submitting.')
      return
    }
    try {
      const { confirmPassword, ...payload } = form
      await api('/users', { method: 'POST', body: JSON.stringify(payload) })
      onDone()
    } catch (err) { setError(err.message) }
  }

  return (
    <form onSubmit={submit} className="modal-form-layout">
      {/* PINNED HEADER */}
      <div className="modal-header">
        <h3 style={{ margin: 0, fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: 8 }}>
          <FiUserPlus style={{ color: 'var(--bottle)' }} /> Add Team Member
        </h3>
        <button
          type="button"
          className="modal-close-btn"
          aria-label="Close dialog"
          onClick={onCancel}
        >
          <FiX size={20} />
        </button>
      </div>

      {/* SCROLLABLE BODY */}
      <div className="modal-body">
        <p style={{ color: 'var(--ink-soft)', fontSize: '0.84rem', marginTop: 0, marginBottom: 4, lineHeight: 1.4 }}>
          If this email already holds a BoardRoom account, they are instantly added to your company workspace.
        </p>

        <div>
          <label style={{ fontWeight: 600 }}>Full Name</label>
          <input value={form.name} onChange={set('name')} required placeholder="e.g. Eleanor Vance" />
        </div>

        <div>
          <label style={{ fontWeight: 600 }}>Email Address</label>
          <input type="email" value={form.email} onChange={set('email')} required placeholder="eleanor@company.com" />
        </div>

        <div className="grid2">
          <div>
            <label style={{ fontWeight: 600 }}>
              Initial Password <span style={{ color: 'var(--ink-soft)', fontWeight: 400, fontSize: '0.78rem' }}>(min 8 chars)</span>
            </label>
            <input
              type="password"
              value={form.password}
              onChange={set('password')}
              minLength={8}
              className={pwTooShort ? 'input-error' : ''}
              placeholder="••••••••••••"
            />
            {pwTooShort && <p className="field-error" style={{ color: 'var(--danger)', fontSize: '0.78rem', marginTop: 2 }}>Must be at least 8 characters.</p>}
          </div>

          <div>
            <label style={{ fontWeight: 600 }}>Confirm Password</label>
            <input
              type="password"
              value={form.confirmPassword}
              onChange={set('confirmPassword')}
              className={pwMismatch ? 'input-error' : ''}
              placeholder="••••••••••••"
            />
            {pwMismatch && <p className="field-error" style={{ color: 'var(--danger)', fontSize: '0.78rem', marginTop: 2 }}>Passwords do not match.</p>}
            {!pwMismatch && form.confirmPassword.length > 0 && form.password === form.confirmPassword && (
              <p className="field-ok" style={{ color: '#10b981', fontSize: '0.78rem', marginTop: 2 }}>Passwords match ✓</p>
            )}
          </div>
        </div>

        <div className="grid2">
          <div>
            <label style={{ fontWeight: 600 }}>Role Permission</label>
            <select value={form.role} onChange={set('role')} style={{ padding: '8px 12px' }}>
              {ROLES.map(r => <option key={r} value={r}>{r === 'Admin' ? 'Admin' : r === 'Secretary' ? 'Secretary' : 'User'}</option>)}
            </select>
          </div>

          <div>
            <label style={{ fontWeight: 600 }}>Title / Designation</label>
            <input value={form.title} onChange={set('title')} placeholder="Managing Director" />
          </div>
        </div>

        <div>
          <label style={{ fontWeight: 600 }}>Contact Number</label>
          <input value={form.contactNumber} onChange={set('contactNumber')} placeholder="+1 (555) 019-2834" />
        </div>

        {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem', margin: 0 }}>⚠️ {error}</p>}
      </div>

      {/* PINNED FOOTER */}
      <div className="modal-footer">
        <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
        <button className="btn" disabled={pwInvalid}>Add Member</button>
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
    <form onSubmit={submit} className="modal-form-layout">
      {/* PINNED HEADER */}
      <div className="modal-header">
        <h3 style={{ margin: 0, fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: 8 }}>
          <FiEdit2 style={{ color: 'var(--bottle)' }} /> Edit {membership.name}
        </h3>
        <button
          type="button"
          className="modal-close-btn"
          aria-label="Close dialog"
          onClick={onCancel}
        >
          <FiX size={20} />
        </button>
      </div>

      {/* SCROLLABLE BODY */}
      <div className="modal-body">
        <div>
          <label style={{ fontWeight: 600 }}>Full Name</label>
          <input value={form.name} onChange={set('name')} required />
        </div>

        <div>
          <label style={{ fontWeight: 600 }}>Email Address</label>
          <input type="email" value={form.email} onChange={set('email')} required />
        </div>

        <div className="grid2">
          <div>
            <label style={{ fontWeight: 600 }}>Role</label>
            <select value={form.role} onChange={set('role')} disabled={isSelf} style={{ padding: '8px 12px' }}>
              {ROLES.map(r => <option key={r} value={r}>{r === 'Admin' ? 'Admin' : r === 'Secretary' ? 'Secretary' : 'User'}</option>)}
            </select>
          </div>

          <div>
            <label style={{ fontWeight: 600 }}>Status</label>
            <select value={form.status} onChange={set('status')} disabled={isSelf} style={{ padding: '8px 12px' }}>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        {isSelf && <p style={{ fontSize: '0.78rem', color: 'var(--ink-soft)', marginTop: -6 }}>You cannot alter your own active role or status.</p>}

        <div className="grid2">
          <div>
            <label style={{ fontWeight: 600 }}>Title</label>
            <input value={form.title} onChange={set('title')} />
          </div>

          <div>
            <label style={{ fontWeight: 600 }}>Contact Number</label>
            <input value={form.contactNumber} onChange={set('contactNumber')} />
          </div>
        </div>

        <fieldset className="pw-section" style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 14, background: 'var(--paper)', marginTop: 4 }}>
          <legend style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--bottle)', padding: '0 6px' }}>Reset Security Password</legend>
          <p style={{ fontSize: '0.78rem', color: 'var(--ink-soft)', margin: '0 0 10px' }}>
            Leave fields blank to retain current password.
          </p>

          <label style={{ fontWeight: 600 }}>New Password</label>
          <input
            type="password"
            value={pw.newPassword}
            minLength={8}
            onChange={e => setPw({ ...pw, newPassword: e.target.value })}
            className={pwTooShort ? 'input-error' : ''}
            autoComplete="new-password"
            placeholder="••••••••••••"
          />
          {pwTooShort && <p className="field-error">Must be at least 8 characters.</p>}

          <label style={{ fontWeight: 600, marginTop: 8 }}>Confirm New Password</label>
          <input
            type="password"
            value={pw.confirm}
            onChange={e => setPw({ ...pw, confirm: e.target.value })}
            className={pwMismatch ? 'input-error' : ''}
            autoComplete="new-password"
            placeholder="••••••••••••"
          />
          {pwMismatch && <p className="field-error">Passwords do not match.</p>}
          {!pwMismatch && pw.confirm.length > 0 && pw.newPassword === pw.confirm && (
            <p className="field-ok" style={{ color: '#10b981', fontSize: '0.8rem', marginTop: 4 }}>Passwords match ✓</p>
          )}
        </fieldset>

        {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem', margin: 0 }}>⚠️ {error}</p>}
      </div>

      {/* PINNED FOOTER */}
      <div className="modal-footer">
        <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
        <button className="btn" disabled={pwInvalid}>Save Changes</button>
      </div>
    </form>
  )
}
