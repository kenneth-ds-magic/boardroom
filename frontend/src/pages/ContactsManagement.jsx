import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'

export default function ContactsManagement() {
  const [contacts, setContacts] = useState([])
  const [selectedContact, setSelectedContact] = useState(null)
  const [newContact, setNewContact] = useState({ name: '', title: '', email: '', contactNumber: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    loadContacts()
  }, [])

  async function loadContacts() {
    try {
      const list = await api('/contacts')
      setContacts(list)
    } catch (err) {
      setError('Failed to load contacts: ' + err.message)
    }
  }

  function handleSelectEdit(contact) {
    setError('')
    setSuccess('')
    setSelectedContact({
      ...contact,
      title: contact.title || '',
      email: contact.email || '',
      contactNumber: contact.contactNumber || ''
    })
  }

  async function handleCreate(e) {
    e.preventDefault()
    if (!newContact.name.trim()) return
    setError('')
    setSuccess('')
    setBusy(true)
    try {
      await api('/contacts', {
        method: 'POST',
        body: JSON.stringify(newContact)
      })
      setSuccess('External contact added successfully.')
      setNewContact({ name: '', title: '', email: '', contactNumber: '' })
      loadContacts()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleUpdate(e) {
    e.preventDefault()
    if (!selectedContact) return
    setError('')
    setSuccess('')
    setBusy(true)
    try {
      await api(`/contacts/${selectedContact.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: selectedContact.name,
          title: selectedContact.title,
          email: selectedContact.email,
          contactNumber: selectedContact.contactNumber
        })
      })
      setSuccess('Contact updated successfully.')
      setSelectedContact(null)
      loadContacts()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(contactId) {
    if (!confirm('Are you sure you want to delete this contact?')) return
    setError('')
    setSuccess('')
    setBusy(true)
    try {
      await api(`/contacts/${contactId}`, { method: 'DELETE' })
      setSuccess('Contact deleted successfully.')
      if (selectedContact?.id === contactId) setSelectedContact(null)
      loadContacts()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const filteredContacts = contacts.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.email && c.email.toLowerCase().includes(search.toLowerCase())) ||
    (c.title && c.title.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div className="shell">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0 }}>External Contacts</h1>
          <p style={{ color: 'var(--ink-soft)', margin: 0 }}>
            Manage external advisors, auditors, and board observers who attend meetings
          </p>
        </div>
        <Link to="/" className="btn secondary">&larr; Back to Dashboard</Link>
      </div>

      <hr className="rule" style={{ border: 'none', borderTop: '1px solid var(--line)', marginBottom: 24 }} />

      {error && <div className="card" style={{ color: 'var(--danger)', borderColor: 'var(--danger)', padding: '12px 18px', marginBottom: 20 }}>{error}</div>}
      {success && <div className="card" style={{ color: 'var(--bottle)', borderColor: 'var(--bottle)', padding: '12px 18px', marginBottom: 20 }}>{success}</div>}

      <div className="grid2" style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr', gap: 24, alignItems: 'start' }}>
        {/* Left column: Contact directory */}
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <input
              type="text"
              placeholder="Search contacts by name, email or title..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>

          <div className="card">
            {filteredContacts.length === 0 ? (
              <p style={{ color: 'var(--ink-soft)', textAlign: 'center', padding: '24px 0' }}>No external contacts found.</p>
            ) : (
              <table className="plain" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Title</th>
                    <th>Email Address</th>
                    <th>Contact Number</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredContacts.map(c => (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 600 }}>{c.name}</td>
                      <td>{c.title || <span style={{ color: 'var(--ink-soft)', fontStyle: 'italic' }}>None</span>}</td>
                      <td>{c.email || <span style={{ color: 'var(--ink-soft)', fontStyle: 'italic' }}>No email (no notifications)</span>}</td>
                      <td>{c.contactNumber || <span style={{ color: 'var(--ink-soft)', fontStyle: 'italic' }}>—</span>}</td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button
                          className="btn secondary"
                          style={{ padding: '4px 8px', fontSize: '0.8rem', marginRight: 6 }}
                          onClick={() => handleSelectEdit(c)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn secondary"
                          style={{ padding: '4px 8px', fontSize: '0.8rem', color: 'var(--danger)', borderColor: 'var(--danger)' }}
                          onClick={() => handleDelete(c.id)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right column: Create or Edit panel */}
        <div>
          {selectedContact ? (
            <form className="card" onSubmit={handleUpdate}>
              <h3>Edit Contact</h3>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Name *</label>
                <input
                  value={selectedContact.name}
                  onChange={e => setSelectedContact({ ...selectedContact, name: e.target.value })}
                  required
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Job Title / Role</label>
                <input
                  value={selectedContact.title}
                  onChange={e => setSelectedContact({ ...selectedContact, title: e.target.value })}
                  placeholder="e.g. Legal Advisor"
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Email Address</label>
                <input
                  type="email"
                  value={selectedContact.email}
                  onChange={e => setSelectedContact({ ...selectedContact, email: e.target.value })}
                  placeholder="e.g. contact@example.com"
                  style={{ width: '100%' }}
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--ink-soft)' }}>
                  If left empty, this contact will not receive automated email invitations or paper distributions.
                </span>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Contact Number</label>
                <input
                  value={selectedContact.contactNumber}
                  onChange={e => setSelectedContact({ ...selectedContact, contactNumber: e.target.value })}
                  placeholder="e.g. +1 555-0199"
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn" disabled={busy}>Save Changes</button>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => setSelectedContact(null)}
                  disabled={busy}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <form className="card" onSubmit={handleCreate}>
              <h3>Add External Contact</h3>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Name *</label>
                <input
                  value={newContact.name}
                  onChange={e => setNewContact({ ...newContact, name: e.target.value })}
                  required
                  placeholder="Contact name"
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Job Title / Role</label>
                <input
                  value={newContact.title}
                  onChange={e => setNewContact({ ...newContact, title: e.target.value })}
                  placeholder="e.g. Legal Advisor"
                  style={{ width: '100%' }}
                />
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Email Address</label>
                <input
                  type="email"
                  value={newContact.email}
                  onChange={e => setNewContact({ ...newContact, email: e.target.value })}
                  placeholder="e.g. contact@example.com"
                  style={{ width: '100%' }}
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--ink-soft)' }}>
                  If left empty, this contact will not receive automated email invitations or paper distributions.
                </span>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>Contact Number</label>
                <input
                  value={newContact.contactNumber}
                  onChange={e => setNewContact({ ...newContact, contactNumber: e.target.value })}
                  placeholder="e.g. +1 555-0199"
                  style={{ width: '100%' }}
                />
              </div>

              <button className="btn" disabled={busy}>Add Contact</button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
