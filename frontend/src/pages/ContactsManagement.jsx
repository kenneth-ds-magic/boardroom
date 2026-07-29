import { useEffect, useState } from 'react'
import { api, getUser } from '../api.js'

/** Full CRUD board for external contacts at /contacts. */
export default function ContactsManagement() {
  const [contacts, setContacts] = useState([])
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(null)   // null | 'new' | contact object
  const [error, setError] = useState('')
  const user = getUser()
  const canEdit = ['Secretary', 'Admin'].includes(user.role)

  const load = () => { api('/contacts').then(setContacts).catch(e => setError(e.message)) }
  useEffect(() => { load() }, [])

  async function remove(c) {
    if (!confirm(`Delete contact ${c.name}? They will no longer be selectable for meetings.`)) return
    try { await api(`/contacts/${c.id}`, { method: 'DELETE' }); load() }
    catch (e) { setError(e.message) }
  }

  const filtered = contacts.filter(c => 
    !search || 
    c.name.toLowerCase().includes(search.toLowerCase()) || 
    c.email.toLowerCase().includes(search.toLowerCase()) || 
    (c.title && c.title.toLowerCase().includes(search.toLowerCase()))
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
          <h1>External contacts</h1>
          <p className="subtitle">{user.companyName} — observers and advisers who receive meeting email but cannot sign in</p>
        </div>
        {canEdit && (
          <button className="btn" onClick={() => setEditing('new')}>
            + Add contact
          </button>
        )}
      </div>
      {error && <div className="toast">{error}</div>}

      <div className="search-bar-wrap" style={{ marginBottom: 16 }}>
        <input 
          type="text" 
          placeholder="Search contacts by name, email, or title..." 
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
                <th>Contact</th>
                <th>Title</th>
                <th>Email</th>
                <th>Phone</th>
                {canEdit && <th></th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div className="attendee-avatar">{getInitials(c.name)}</div>
                      <strong>{c.name}</strong>
                    </div>
                  </td>
                  <td>{c.title || '—'}</td>
                  <td><a href={`mailto:${c.email}`} style={{ color: 'var(--bottle)' }}>{c.email}</a></td>
                  <td>{c.contactNumber ? <a href={`tel:${c.contactNumber}`} style={{ color: 'inherit' }}>{c.contactNumber}</a> : '—'}</td>
                  {canEdit && (
                    <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                      <button className="btn small ghost" onClick={() => setEditing(c)}>Edit</button>{' '}
                      <button className="btn small ghost" onClick={() => remove(c)}>Delete</button>
                    </td>
                  )}
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan="5" style={{ color: 'var(--ink-soft)', textAlign: 'center', padding: '24px 0' }}>
                    {search ? 'No contacts match your search.' : 'No contacts yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Mobile Card List View */}
          <div className="mobile-card-list">
            {filtered.map(c => (
              <div key={c.id} className="mobile-item-card">
                <div className="mobile-item-header">
                  <div className="attendee-avatar">{getInitials(c.name)}</div>
                  <div className="mobile-item-titles">
                    <div className="mobile-item-name">{c.name}</div>
                    <div className="mobile-item-role">{c.title || 'External Contact'}</div>
                  </div>
                  {canEdit && (
                    <div className="mobile-item-actions">
                      <button className="btn small ghost" onClick={() => setEditing(c)}>Edit</button>
                      <button className="btn small ghost" onClick={() => remove(c)}>Delete</button>
                    </div>
                  )}
                </div>
                <div className="mobile-item-body">
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

        {/* Modal / Side Panel Drawer */}
        {editing && canEdit && (
          <div className="modal-backdrop-responsive">
            <ContactForm 
              contact={editing === 'new' ? null : editing}
              onDone={() => { setEditing(null); load() }}
              onCancel={() => setEditing(null)} 
            />
          </div>
        )}
      </div>
    </main>
  )
}

function ContactForm({ contact, onDone, onCancel }) {
  const [form, setForm] = useState({
    name: contact?.name || '', title: contact?.title || '',
    email: contact?.email || '', contactNumber: contact?.contactNumber || ''
  })
  const [error, setError] = useState('')
  const set = k => e => setForm({ ...form, [k]: e.target.value })

  async function submit(e) {
    e.preventDefault()
    setError('')
    try {
      if (contact) await api(`/contacts/${contact.id}`, { method: 'PUT', body: JSON.stringify(form) })
      else await api('/contacts', { method: 'POST', body: JSON.stringify(form) })
      onDone()
    } catch (err) { setError(err.message) }
  }

  return (
    <form className="card form-card side-panel" onSubmit={submit}>
      <h3>{contact ? `Edit ${contact.name}` : 'Add external contact'}</h3>
      <label>Name</label>
      <input value={form.name} onChange={set('name')} required />
      <label>Title</label>
      <input value={form.title} onChange={set('title')} placeholder="Non-executive Director" />
      <label>Email</label>
      <input type="email" value={form.email} onChange={set('email')} required />
      <label>Contact number</label>
      <input value={form.contactNumber} onChange={set('contactNumber')} />
      {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>{error}</p>}
      <div className="form-actions">
        <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
        <button className="btn">{contact ? 'Save changes' : 'Save contact'}</button>
      </div>
    </form>
  )
}
