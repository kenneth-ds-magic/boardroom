import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FiUserPlus,
  FiSearch,
  FiGrid,
  FiList,
  FiEdit2,
  FiTrash2,
  FiMail,
  FiPhone,
  FiX,
  FiUsers,
  FiBriefcase,
  FiCheckCircle
} from 'react-icons/fi'
import { api, getUser } from '../api.js'

/**
 * Company External Contacts & Observers Management at /contacts.
 * Matches the executive design system and ergonomics of UsersManagement.
 */
export default function ContactsManagement() {
  const [contacts, setContacts] = useState([])
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState('grid') // 'grid' | 'table'
  const [editing, setEditing] = useState(null) // null | 'new' | contact object
  const [contactToDelete, setContactToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const user = getUser()
  const canEdit = ['Secretary', 'Admin'].includes(user?.role)

  const load = () => {
    api('/contacts')
      .then(setContacts)
      .catch(e => setError(e.message))
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = contacts.filter(c =>
    !search ||
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.email.toLowerCase().includes(search.toLowerCase()) ||
    (c.title && c.title.toLowerCase().includes(search.toLowerCase())) ||
    (c.contactNumber && c.contactNumber.includes(search))
  )

  const stats = {
    total: contacts.length,
    titled: contacts.filter(c => c.title && c.title.trim().length > 0).length,
    withPhone: contacts.filter(c => c.contactNumber && c.contactNumber.trim().length > 0).length
  }

  const getInitials = name => {
    if (!name) return '?'
    const parts = name.trim().split(/\s+/)
    return parts.length >= 2
      ? (parts[0][0] + parts[1][0]).toUpperCase()
      : parts[0][0].toUpperCase()
  }

  async function confirmDelete() {
    if (!contactToDelete) return
    setDeleting(true)
    setError('')
    try {
      await api(`/contacts/${contactToDelete.id}`, { method: 'DELETE' })
      setContactToDelete(null)
      load()
    } catch (e) {
      setError(e.message)
      setContactToDelete(null)
    } finally {
      setDeleting(false)
    }
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
            <span>👥</span> External Contacts & Observers
          </h1>
          <p className="subtitle">
            {user?.companyName} — Advisers, observers, and legal counsel receiving board notices and papers via personal secure links
          </p>
        </div>
        {canEdit && (
          <button
            className="btn"
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
            onClick={() => setEditing('new')}
          >
            <FiUserPlus size={16} />
            <span>Add Contact</span>
          </button>
        )}
      </div>

      {/* Animated Error/Toast Message */}
      <AnimatePresence>
        {error && (
          <motion.div
            className="toast"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Summary Stat Cards Grid */}
      <div className="users-stats-grid">
        <div className="users-stat-card">
          <div className="users-stat-icon" style={{ background: 'var(--bottle-tint)', color: 'var(--bottle)' }}>
            <FiUsers size={20} />
          </div>
          <div>
            <div className="users-stat-num">{stats.total}</div>
            <div className="users-stat-label">Total Contacts</div>
          </div>
        </div>

        <div className="users-stat-card">
          <div className="users-stat-icon" style={{ background: 'var(--brass-tint)', color: 'var(--brass)' }}>
            <FiBriefcase size={20} />
          </div>
          <div>
            <div className="users-stat-num">{stats.titled}</div>
            <div className="users-stat-label">Advisers & Specialists</div>
          </div>
        </div>

        <div className="users-stat-card">
          <div className="users-stat-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
            <FiPhone size={20} />
          </div>
          <div>
            <div className="users-stat-num">{stats.withPhone}</div>
            <div className="users-stat-label">Phone Listed</div>
          </div>
        </div>

        <div className="users-stat-card">
          <div className="users-stat-icon" style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>
            <FiCheckCircle size={20} />
          </div>
          <div>
            <div className="users-stat-num">{stats.total}</div>
            <div className="users-stat-label">Mailable Recipients</div>
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
            placeholder="Search contacts by name, email, title, or phone..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              style={{
                position: 'absolute',
                right: 12,
                background: 'transparent',
                border: 'none',
                color: 'var(--ink-soft)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center'
              }}
              title="Clear search"
            >
              <FiX size={15} />
            </button>
          )}
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

      {/* CONTACTS GRID CARD VIEW */}
      {viewMode === 'grid' && (
        <div className="users-grid-container">
          <AnimatePresence>
            {filtered.map(c => (
              <motion.div
                key={c.id}
                className="user-card-executive"
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
              >
                <div className="user-card-top">
                  <div
                    className="user-avatar-large"
                    style={{
                      background: 'linear-gradient(135deg, #1e3a34 0%, #0d231e 100%)',
                      color: 'var(--brass)'
                    }}
                  >
                    {getInitials(c.name)}
                  </div>
                  <div className="user-card-meta">
                    <div className="user-card-name">{c.name}</div>
                    <div className="user-card-title">{c.title || 'External Observer'}</div>
                    <span className="role-pill-executive contact">
                      <FiBriefcase size={12} /> Contact
                    </span>
                  </div>
                </div>

                <div className="user-card-contacts">
                  <a href={`mailto:${c.email}`} className="user-contact-item" title={`Email ${c.email}`}>
                    <FiMail size={14} style={{ flexShrink: 0 }} />
                    <span>{c.email}</span>
                  </a>
                  {c.contactNumber ? (
                    <a href={`tel:${c.contactNumber}`} className="user-contact-item" title={`Call ${c.contactNumber}`}>
                      <FiPhone size={14} style={{ flexShrink: 0 }} />
                      <span>{c.contactNumber}</span>
                    </a>
                  ) : (
                    <span className="user-contact-item" style={{ opacity: 0.5 }}>
                      <FiPhone size={14} style={{ flexShrink: 0 }} />
                      <span>No phone specified</span>
                    </span>
                  )}
                </div>

                <div className="user-card-footer">
                  <span className="status-badge-inline active" title="Included in company attendee directory">
                    <span className="status-dot-mini"></span>
                    Directory Active
                  </span>

                  {canEdit && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button
                        type="button"
                        className="btn small ghost"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
                        onClick={() => setEditing(c)}
                        title="Edit contact details"
                      >
                        <FiEdit2 size={13} />
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        className="btn small ghost delete"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
                        onClick={() => setContactToDelete(c)}
                        title="Remove contact"
                      >
                        <FiTrash2 size={13} />
                        <span>Delete</span>
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {filtered.length === 0 && (
            <div
              style={{
                gridColumn: '1 / -1',
                background: '#fff',
                border: '1px solid var(--line)',
                borderRadius: 12,
                padding: '40px 20px',
                textAlign: 'center',
                color: 'var(--ink-soft)'
              }}
            >
              <div style={{ fontSize: '2rem', marginBottom: 8 }}>🔍</div>
              <div style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--ink)' }}>
                No external contacts found
              </div>
              <div style={{ fontSize: '0.85rem', marginTop: 4 }}>
                {search ? `No contacts match "${search}"` : 'No contacts configured yet.'}
              </div>
            </div>
          )}
        </div>
      )}

      {/* CONTACTS TABLE VIEW */}
      {viewMode === 'table' && (
        <div
          className="card table-wrap"
          style={{ border: '1px solid var(--line)', borderRadius: 12, overflowX: 'auto' }}
        >
          <table className="desktop-table">
            <thead>
              <tr>
                <th>Contact</th>
                <th>Title / Designation</th>
                <th>Email Address</th>
                <th>Phone Number</th>
                <th>Type</th>
                {canEdit && <th style={{ textAlign: 'right' }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div
                        className="attendee-avatar"
                        style={{
                          background: 'linear-gradient(135deg, #1e3a34 0%, #0d231e 100%)',
                          color: 'var(--brass)',
                          fontWeight: 700
                        }}
                      >
                        {getInitials(c.name)}
                      </div>
                      <div>
                        <strong>{c.name}</strong>
                      </div>
                    </div>
                  </td>
                  <td>{c.title || '—'}</td>
                  <td>
                    <a href={`mailto:${c.email}`} style={{ color: 'var(--bottle)', fontWeight: 500 }}>
                      {c.email}
                    </a>
                  </td>
                  <td>
                    {c.contactNumber ? (
                      <a href={`tel:${c.contactNumber}`} style={{ color: 'inherit' }}>
                        {c.contactNumber}
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    <span className="role-pill-executive contact">
                      <FiBriefcase size={12} /> Contact
                    </span>
                  </td>
                  {canEdit && (
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button
                        type="button"
                        className="btn small ghost"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginRight: 6 }}
                        onClick={() => setEditing(c)}
                      >
                        <FiEdit2 size={13} /> Edit
                      </button>
                      <button
                        type="button"
                        className="btn small ghost delete"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        onClick={() => setContactToDelete(c)}
                      >
                        <FiTrash2 size={13} /> Delete
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={canEdit ? 6 : 5}
                    style={{ color: 'var(--ink-soft)', textAlign: 'center', padding: '32px 0' }}
                  >
                    {search ? `No contacts match "${search}"` : 'No contacts added yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Mobile Card List Fallback for Table View */}
          <div className="mobile-card-list">
            {filtered.map(c => (
              <div key={c.id} className="mobile-item-card">
                <div className="mobile-item-header">
                  <div
                    className="attendee-avatar"
                    style={{ background: 'var(--bottle)', color: 'var(--brass)' }}
                  >
                    {getInitials(c.name)}
                  </div>
                  <div className="mobile-item-titles">
                    <div className="mobile-item-name">{c.name}</div>
                    <div className="mobile-item-role">{c.title || 'External Contact'}</div>
                  </div>
                  {canEdit && (
                    <div className="mobile-item-actions">
                      <button className="btn small ghost" onClick={() => setEditing(c)}>
                        Edit
                      </button>
                      <button className="btn small ghost delete" onClick={() => setContactToDelete(c)}>
                        Delete
                      </button>
                    </div>
                  )}
                </div>
                <div className="mobile-item-body">
                  <div className="mobile-item-pills">
                    <span className="role-pill-executive contact">
                      <FiBriefcase size={12} /> Contact
                    </span>
                    <span className="status-badge-inline active">
                      <span className="status-dot-mini"></span> Active
                    </span>
                  </div>
                  <div className="mobile-item-field">
                    <span className="field-label">Email:</span>
                    <a href={`mailto:${c.email}`}>{c.email}</a>
                  </div>
                  {c.contactNumber && (
                    <div className="mobile-item-field">
                      <span className="field-label">Phone:</span>
                      <a href={`tel:${c.contactNumber}`}>{c.contactNumber}</a>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <p style={{ color: 'var(--ink-soft)', textAlign: 'center', padding: '20px 0' }}>
                {search ? 'No contacts match your search.' : 'No contacts yet.'}
              </p>
            )}
          </div>
        </div>
      )}

      {/* MODAL DIALOGS WITH ANIMATEPRESENCE (RENDERED AT BODY LEVEL VIA PORTAL) */}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {/* ADD CONTACT MODAL */}
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
                  <ContactFormModal
                    contact={null}
                    onDone={() => {
                      setEditing(null)
                      load()
                    }}
                    onCancel={() => setEditing(null)}
                  />
                </motion.div>
              </div>
            )}

            {/* EDIT CONTACT MODAL */}
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
                  <ContactFormModal
                    contact={editing}
                    onDone={() => {
                      setEditing(null)
                      load()
                    }}
                    onCancel={() => setEditing(null)}
                  />
                </motion.div>
              </div>
            )}

            {/* DELETE CONFIRMATION MODAL */}
            {contactToDelete && (
              <div className="modal-backdrop" onClick={() => setContactToDelete(null)}>
                <motion.div
                  className="modal-content modal-dialog-confirm"
                  style={{ maxWidth: 440, width: '90%', textAlign: 'center', padding: '28px 24px' }}
                  onClick={e => e.stopPropagation()}
                  initial={{ opacity: 0, scale: 0.94 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.94 }}
                  transition={{ duration: 0.2 }}
                >
                  <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🗑️</div>
                  <h3 style={{ marginTop: 0, fontSize: '1.25rem' }}>Delete External Contact?</h3>
                  <p style={{ color: 'var(--ink-soft)', fontSize: '0.9rem', marginBottom: 24, lineHeight: 1.5 }}>
                    Are you sure you want to remove <strong>"{contactToDelete.name}"</strong>? They will be permanently removed from this company's directory and will no longer be selectable for meetings or receive board materials.
                  </p>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <button
                      type="button"
                      className="btn ghost"
                      style={{ flex: 1 }}
                      onClick={() => setContactToDelete(null)}
                      disabled={deleting}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn delete"
                      style={{ flex: 1, background: '#dc2626', color: '#fff', borderColor: '#dc2626' }}
                      onClick={confirmDelete}
                      disabled={deleting}
                    >
                      {deleting ? 'Deleting...' : 'Delete Contact'}
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </motion.main>
  )
}

/**
 * High-polish modal form for creating or editing external contacts.
 * Built with fixed header, scrollable body, and pinned footer for mobile ergonomics.
 */
function ContactFormModal({ contact, onDone, onCancel }) {
  const [form, setForm] = useState({
    name: contact?.name || '',
    title: contact?.title || '',
    email: contact?.email || '',
    contactNumber: contact?.contactNumber || ''
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = k => e => setForm({ ...form, [k]: e.target.value })

  async function submit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (contact) {
        await api(`/contacts/${contact.id}`, { method: 'PUT', body: JSON.stringify(form) })
      } else {
        await api('/contacts', { method: 'POST', body: JSON.stringify(form) })
      }
      onDone()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="modal-form-layout">
      {/* PINNED MODAL HEADER */}
      <div className="modal-header">
        <h3 style={{ margin: 0, fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: 8 }}>
          {contact ? (
            <>
              <FiEdit2 style={{ color: 'var(--bottle)' }} /> Edit {contact.name}
            </>
          ) : (
            <>
              <FiUserPlus style={{ color: 'var(--bottle)' }} /> Add External Contact
            </>
          )}
        </h3>
        <button
          type="button"
          className="modal-close-btn"
          aria-label="Close dialog"
          onClick={onCancel}
          disabled={busy}
        >
          <FiX size={20} />
        </button>
      </div>

      {/* SCROLLABLE MODAL BODY */}
      <div className="modal-body">
        <p style={{ color: 'var(--ink-soft)', fontSize: '0.84rem', marginTop: 0, marginBottom: 4, lineHeight: 1.4 }}>
          External contacts receive meeting invites, agenda notices, and board packs via personal secure links. They do not hold passwords or sign in.
        </p>

        <div>
          <label style={{ fontWeight: 600 }}>Full Name</label>
          <input
            value={form.name}
            onChange={set('name')}
            required
            placeholder="e.g. Jonathan Hastings"
            disabled={busy}
            autoFocus
          />
        </div>

        <div>
          <label style={{ fontWeight: 600 }}>Title / Designation</label>
          <input
            value={form.title}
            onChange={set('title')}
            placeholder="e.g. Legal Adviser, Board Observer, Auditor"
            disabled={busy}
          />
        </div>

        <div>
          <label style={{ fontWeight: 600 }}>Email Address</label>
          <input
            type="email"
            value={form.email}
            onChange={set('email')}
            required
            placeholder="e.g. j.hastings@firm.com"
            disabled={busy}
          />
        </div>

        <div>
          <label style={{ fontWeight: 600 }}>Contact Phone Number</label>
          <input
            type="tel"
            value={form.contactNumber}
            onChange={set('contactNumber')}
            placeholder="e.g. +1 (555) 019-2834"
            disabled={busy}
          />
        </div>

        {error && (
          <p style={{ color: 'var(--danger)', fontSize: '0.85rem', margin: 0 }}>
            ⚠️ {error}
          </p>
        )}
      </div>

      {/* PINNED MODAL FOOTER */}
      <div className="modal-footer">
        <button type="button" className="btn ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button className="btn" disabled={busy}>
          {busy ? (contact ? 'Saving...' : 'Adding...') : (contact ? 'Save Changes' : 'Save Contact')}
        </button>
      </div>
    </form>
  )
}
