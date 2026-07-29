import { useEffect, useState } from 'react'
import { api, getUser } from '../api.js'

/** Per-company SMTP and Transactional API configuration at /mail-settings (Admin only). */
export default function MailSettings() {
  const [form, setForm] = useState({
    provider: 'SMTP', host: '', port: 587, username: '', password: '',
    fromAddress: '', fromName: '', isActive: true
  })
  const [configured, setConfigured] = useState(false)
  const [savedProvider, setSavedProvider] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const user = getUser()

  const set = k => e => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  const say = msg => { setStatus(msg); setTimeout(() => setStatus(''), 7000) }

  async function load() {
    const s = await api('/mail-settings')
    if (s.configured) {
      setConfigured(true)
      setSavedProvider(s.provider)
      setForm({ provider: s.provider, host: s.host, port: s.port, username: s.username,
                password: s.password, fromAddress: s.fromAddress, fromName: s.fromName, isActive: s.isActive })
      setIsEditing(false)
    } else {
      setIsEditing(true)
    }
  }
  useEffect(() => { load().catch(e => say(e.message)) }, [])

  function handleProviderSelect(prov) {
    if (prov === form.provider) return
    const isSaved = configured && prov === savedProvider
    setForm(f => ({
      ...f,
      provider: prov,
      host: isSaved ? f.host : '',
      port: prov === 'SMTP' ? 587 : 0,
      username: prov === 'Mailgun' ? 'US' : '',
      password: isSaved ? '********' : ''
    }))
  }

  function toggleEdit() {
    if (!configured) return // Must be in edit mode if not configured yet
    if (isEditing) {
      // Cancel changes: reload saved settings
      load().catch(e => say(e.message))
    } else {
      setIsEditing(true)
    }
  }

  async function save(e) {
    e.preventDefault()
    setBusy(true)
    try {
      await api('/mail-settings', { method: 'POST', body: JSON.stringify({ ...form, port: Number(form.port) }) })
      say('Mail settings saved.')
      setConfigured(true)
      setSavedProvider(form.provider)
      setIsEditing(false)
    } catch (err) { say(err.message) }
    finally { setBusy(false) }
  }

  async function sendTest() {
    setBusy(true)
    try {
      const r = await api('/mail-settings/test', { method: 'POST', body: JSON.stringify({ ...form, port: Number(form.port) }) })
      say(r.message)
    } catch (err) { say(err.message) }
    finally { setBusy(false) }
  }

  async function remove() {
    if (!confirm('Delete the mail configuration? No meeting emails can be sent until a new one is saved.')) return
    setBusy(true)
    try {
      await api('/mail-settings', { method: 'DELETE' })
      setConfigured(false)
      setSavedProvider('')
      setForm({ provider: 'SMTP', host: '', port: 587, username: '', password: '', fromAddress: '', fromName: '', isActive: true })
      setIsEditing(true)
      say('Mail settings deleted.')
    } catch (err) { say(err.message) }
    finally { setBusy(false) }
  }

  const isProviderSaved = configured && form.provider === savedProvider

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Mail settings</h1>
          <p className="subtitle">{user.companyName} — configure how emails are sent to your board members</p>
        </div>
      </div>
      {status && <div className="toast">{status}</div>}

      <form className="card form-card" style={{ maxWidth: 640 }} onSubmit={save}>
        {configured && (
          <button
            type="button"
            className={`card-edit-btn ${isEditing ? 'active' : ''}`}
            onClick={toggleEdit}
            title={isEditing ? "Cancel edit and discard changes" : "Edit mail settings"}
            aria-label={isEditing ? "Cancel edit" : "Edit settings"}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              {isEditing ? (
                // Cancel (X) icon
                <path d="M18 6 6 18M6 6l12 12" />
              ) : (
                // Pencil icon
                <>
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z" />
                </>
              )}
            </svg>
          </button>
        )}

        {!configured && (
          <p style={{ background: 'var(--brass-tint, #f6efdf)', color: 'var(--brass)', padding: '10px 14px', borderRadius: 6, fontSize: '0.85rem', marginBottom: 16 }}>
            No mail server configured yet. Until an active configuration is saved, BoardRoom cannot
            send invitations, paper links or minutes to your board.
          </p>
        )}

        <label style={{ marginBottom: 8, display: 'block' }}>Email Provider</label>
        <div className={`provider-grid ${!isEditing ? 'disabled' : ''}`}>
          {[
            { id: 'SMTP', name: 'SMTP Server', logo: '⚙️' },
            { id: 'Mailgun', name: 'Mailgun', logo: '🎯' },
            { id: 'SendGrid', name: 'SendGrid', logo: '⚡' },
            { id: 'Brevo', name: 'Brevo', logo: '🎈' }
          ].map(p => (
            <div
              key={p.id}
              className={`provider-card ${form.provider === p.id ? 'selected' : ''}`}
              onClick={() => isEditing && handleProviderSelect(p.id)}
              role="button"
              tabIndex={isEditing ? 0 : -1}
              onKeyDown={e => { if (isEditing && (e.key === 'Enter' || e.key === ' ')) handleProviderSelect(p.id) }}
              aria-label={`Select ${p.name}`}
            >
              <span className="provider-logo">{p.logo}</span>
              <span className="provider-label">{p.name}</span>
            </div>
          ))}
        </div>

        {form.provider === 'SMTP' && (
          <>
            <div className="grid2">
              <div>
                <label>SMTP Host</label>
                <input value={form.host} onChange={set('host')} required placeholder="smtp.example.com" disabled={!isEditing} />
              </div>
              <div>
                <label>SMTP Port</label>
                <input type="number" value={form.port} onChange={set('port')} required placeholder="587" disabled={!isEditing} />
              </div>
            </div>
            <div className="grid2">
              <div>
                <label>Username</label>
                <input value={form.username} onChange={set('username')} autoComplete="off" disabled={!isEditing} />
              </div>
              <div>
                <label>Password <span style={{ color: 'var(--ink-soft)' }}>(stored encrypted; leave blank/masked to keep)</span></label>
                <input type="password" value={form.password} onChange={set('password')} autoComplete="new-password" required={!isProviderSaved} disabled={!isEditing} />
              </div>
            </div>
          </>
        )}

        {form.provider === 'Mailgun' && (
          <>
            <div className="grid2">
              <div>
                <label>Mailgun Domain</label>
                <input value={form.host} onChange={set('host')} required placeholder="mg.yourdomain.com" disabled={!isEditing} />
              </div>
              <div>
                <label>Region</label>
                <select value={form.username || 'US'} onChange={set('username')} style={{ padding: '0 8px' }} disabled={!isEditing}>
                  <option value="US">US Region</option>
                  <option value="EU">EU Region</option>
                </select>
              </div>
            </div>
            <label>Mailgun API Key <span style={{ color: 'var(--ink-soft)' }}>(stored encrypted; leave blank/masked to keep)</span></label>
            <input type="password" value={form.password} onChange={set('password')} autoComplete="new-password" required={!isProviderSaved} disabled={!isEditing} />
          </>
        )}

        {(form.provider === 'SendGrid' || form.provider === 'Brevo') && (
          <>
            <label>{form.provider} API Key <span style={{ color: 'var(--ink-soft)' }}>(stored encrypted; leave blank/masked to keep)</span></label>
            <input type="password" value={form.password} onChange={set('password')} autoComplete="new-password" required={!isProviderSaved} disabled={!isEditing} />
          </>
        )}

        <div className="grid2">
          <div>
            <label>Sender email (From address)</label>
            <input type="email" value={form.fromAddress} onChange={set('fromAddress')} required placeholder="boardroom@example.com" disabled={!isEditing} />
          </div>
          <div>
            <label>Sender name (From name)</label>
            <input value={form.fromName} onChange={set('fromName')} placeholder="BoardRoom" disabled={!isEditing} />
          </div>
        </div>

        <div className={`switch-container ${!isEditing ? 'disabled' : ''}`}>
          <label className="switch" aria-label="Toggle active status">
            <input type="checkbox" checked={form.isActive} onChange={set('isActive')} disabled={!isEditing} />
            <span className="slider"></span>
          </label>
          <span className="switch-text">Active — dispatch meeting email through this provider</span>
        </div>

        <div className="form-actions" style={{ flexWrap: 'wrap', gap: 10 }}>
          {isEditing && (
            <button className="btn" disabled={busy}>{configured ? 'Update settings' : 'Save settings'}</button>
          )}
          <button type="button" className="btn ghost" disabled={busy} onClick={sendTest}>Send test email</button>
          {configured && isEditing && (
            <button type="button" className="btn ghost" disabled={busy} onClick={remove}>Delete</button>
          )}
        </div>
        <p style={{ fontSize: '0.78rem', color: 'var(--ink-soft)', marginTop: 12 }}>
          The test performs a live handshake with your server and emails you — use it to verify
          credentials before saving. Remember SPF, DKIM and DMARC records for the from-domain.
        </p>
      </form>
    </main>
  )
}
