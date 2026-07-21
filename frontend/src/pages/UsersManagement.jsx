import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api, getUser } from '../api.js'

export default function UsersManagement() {
  const [users, setUsers] = useState([])
  const [selectedUser, setSelectedUser] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [search, setSearch] = useState('')
  const currentUser = getUser()

  useEffect(() => {
    loadUsers()
  }, [])

  async function loadUsers() {
    try {
      const list = await api('/users')
      setUsers(list)
    } catch (err) {
      setError('Failed to load users: ' + err.message)
    }
  }

  function handleSelectEdit(user) {
    setError('')
    setSuccess('')
    setSelectedUser({
      ...user,
      title: user.title || '',
      contactNumber: user.contactNumber || '',
      newPassword: '',
      confirmPassword: ''
    })
  }

  async function handleUpdate(e) {
    e.preventDefault()
    if (!selectedUser) return
    setError('')
    setSuccess('')
    setBusy(true)
    try {
      // Validate password change if the fields are filled
      if (selectedUser.newPassword || selectedUser.confirmPassword) {
        if (selectedUser.newPassword.length < 8) {
          setError('New password must be at least 8 characters.')
          setBusy(false)
          return
        }
        if (selectedUser.newPassword !== selectedUser.confirmPassword) {
          setError('Passwords do not match.')
          setBusy(false)
          return
        }
      }
      await api(`/users/${selectedUser.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: selectedUser.name,
          title: selectedUser.title,
          email: selectedUser.email,
          contactNumber: selectedUser.contactNumber,
          role: selectedUser.role,
          status: selectedUser.status,
          newPassword: selectedUser.newPassword || null
        })
      })
      setSuccess('User updated successfully.')
      setSelectedUser(null)
      loadUsers()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const filteredUsers = users.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    (u.title && u.title.toLowerCase().includes(search.toLowerCase()))
  )

  const getStatusBadgeStyle = (status) => {
    switch (status) {
      case 'Active':
        return { background: 'var(--bottle-tint)', color: 'var(--bottle)', border: '1px solid var(--bottle)' }
      case 'Suspended':
        return { background: '#f5eedd', color: 'var(--brass)', border: '1px solid var(--brass)' }
      case 'Fired':
        return { background: '#f9ebeb', color: 'var(--danger)', border: '1px solid var(--danger)' }
      default:
        return { background: '#eee', color: '#666', border: '1px solid #ccc' }
    }
  }

  return (
    <div className="shell">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0 }}>Company Directory & Users</h1>
          <p style={{ color: 'var(--ink-soft)', margin: 0 }}>
            Manage organization members, assign roles, and update account statuses
          </p>
        </div>
        <Link to="/" className="btn secondary">&larr; Back to Dashboard</Link>
      </div>

      <hr className="rule" style={{ border: 'none', borderTop: '1px solid var(--line)', marginBottom: 24 }} />

      {error && <div className="card" style={{ color: 'var(--danger)', borderColor: 'var(--danger)', padding: '12px 18px', marginBottom: 20 }}>{error}</div>}
      {success && <div className="card" style={{ color: 'var(--bottle)', borderColor: 'var(--bottle)', padding: '12px 18px', marginBottom: 20 }}>{success}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: selectedUser ? '1.2fr 1fr' : '1fr', gap: '24px', transition: 'all 0.3s ease' }}>
        {/* Left Column: Users list */}
        <div>
          <div className="card" style={{ marginBottom: 16, padding: '12px 16px' }}>
            <input
              type="text"
              placeholder="Search by name, email, or job title..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: '8px 12px' }}
            />
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#f5f5f3', borderBottom: '2px solid var(--line)' }}>
                  <th style={{ padding: '12px 16px', fontWeight: 600, fontSize: '0.85rem', color: 'var(--ink-soft)', textTransform: 'uppercase' }}>User / Contact</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, fontSize: '0.85rem', color: 'var(--ink-soft)', textTransform: 'uppercase' }}>Role</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, fontSize: '0.85rem', color: 'var(--ink-soft)', textTransform: 'uppercase' }}>Status</th>
                  <th style={{ padding: '12px 16px', fontWeight: 600, fontSize: '0.85rem', color: 'var(--ink-soft)', textTransform: 'uppercase', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan="4" style={{ padding: '24px', textAlign: 'center', color: 'var(--ink-soft)' }}>
                      No members found matching your search.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map(u => (
                    <tr key={u.id} style={{ borderBottom: '1px solid var(--line)' }}>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: 500 }}>{u.name}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--ink-soft)' }}>{u.email}</div>
                        {u.title && <div style={{ fontSize: '0.78rem', color: 'var(--brass)', fontStyle: 'italic' }}>{u.title}</div>}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '0.9rem' }}>
                        {u.isContact ? (
                          <span style={{ color: 'var(--ink-soft)', fontSize: '0.8rem' }}>External Contact</span>
                        ) : (
                          <strong>{u.role}</strong>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span
                          style={{
                            padding: '3px 8px',
                            fontSize: '0.72rem',
                            borderRadius: '4px',
                            fontWeight: 600,
                            display: 'inline-block',
                            ...getStatusBadgeStyle(u.status)
                          }}
                        >
                          {u.status}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <button
                          onClick={() => handleSelectEdit(u)}
                          className="btn secondary"
                          style={{ padding: '5px 10px', fontSize: '0.8rem' }}
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column: Edit panel */}
        {selectedUser && (
          <div>
            <div className="card" style={{ position: 'sticky', top: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifycontent: 'space-between', marginBottom: 12 }}>
                <h3 style={{ margin: 0 }}>Edit User Details</h3>
                <button
                  onClick={() => setSelectedUser(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: 'var(--ink-soft)' }}
                >
                  &times;
                </button>
              </div>

              <form onSubmit={handleUpdate}>
                <label>Name</label>
                <input
                  value={selectedUser.name}
                  onChange={e => setSelectedUser({ ...selectedUser, name: e.target.value })}
                  required
                />

                <label>Job Title</label>
                <input
                  value={selectedUser.title}
                  onChange={e => setSelectedUser({ ...selectedUser, title: e.target.value })}
                  placeholder="Director / Secretary"
                />

                <label>Email Address</label>
                <input
                  type="email"
                  value={selectedUser.email}
                  onChange={e => setSelectedUser({ ...selectedUser, email: e.target.value })}
                  required
                />

                <label>Contact Number</label>
                <input
                  value={selectedUser.contactNumber}
                  onChange={e => setSelectedUser({ ...selectedUser, contactNumber: e.target.value })}
                />

                {!selectedUser.isContact && (
                  <>
                    <label>System Role</label>
                    <select
                      value={selectedUser.role}
                      onChange={e => setSelectedUser({ ...selectedUser, role: e.target.value })}
                      disabled={selectedUser.id === currentUser?.id}
                    >
                      <option value="User">User</option>
                      <option value="Secretary">Secretary</option>
                      <option value="Admin">Admin</option>
                    </select>
                    {selectedUser.id === currentUser?.id && (
                      <p style={{ fontSize: '0.78rem', color: 'var(--ink-soft)', marginTop: 4 }}>
                        You cannot change your own role to prevent losing access.
                      </p>
                    )}

                    <hr style={{ border: 'none', borderTop: '1px solid var(--line)', margin: '14px 0 10px' }} />
                    <label style={{ fontWeight: 600, color: 'var(--ink-soft)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Change Password</label>
                    <p style={{ fontSize: '0.78rem', color: 'var(--ink-soft)', marginTop: 0, marginBottom: 8 }}>
                      Leave both fields empty to keep the current password unchanged.
                    </p>
                    <label>New Password</label>
                    <input
                      type="password"
                      value={selectedUser.newPassword}
                      onChange={e => setSelectedUser({ ...selectedUser, newPassword: e.target.value })}
                      placeholder="Minimum 8 characters"
                      autoComplete="new-password"
                    />
                    <label>Confirm New Password</label>
                    <input
                      type="password"
                      value={selectedUser.confirmPassword}
                      onChange={e => setSelectedUser({ ...selectedUser, confirmPassword: e.target.value })}
                      placeholder="Re-enter new password"
                      autoComplete="new-password"
                      style={{
                        borderColor: selectedUser.confirmPassword && selectedUser.newPassword !== selectedUser.confirmPassword
                          ? 'var(--danger)'
                          : undefined
                      }}
                    />
                    {selectedUser.confirmPassword && selectedUser.newPassword !== selectedUser.confirmPassword && (
                      <p style={{ fontSize: '0.78rem', color: 'var(--danger)', marginTop: 2 }}>Passwords do not match.</p>
                    )}
                  </>
                )}

                <label>Account Status</label>
                <select
                  value={selectedUser.status}
                  onChange={e => setSelectedUser({ ...selectedUser, status: e.target.value })}
                  disabled={selectedUser.id === currentUser?.id}
                >
                  <option value="Active">Active</option>
                  <option value="Suspended">Suspended</option>
                  <option value="Fired">Fired</option>
                </select>
                {selectedUser.id === currentUser?.id && (
                  <p style={{ fontSize: '0.78rem', color: 'var(--ink-soft)', marginTop: 4 }}>
                    You cannot suspend or deactivate your own account.
                  </p>
                )}

                <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                  <button type="submit" className="btn" style={{ flex: 1 }} disabled={busy}>
                    {busy ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedUser(null)}
                    className="btn secondary"
                    disabled={busy}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
