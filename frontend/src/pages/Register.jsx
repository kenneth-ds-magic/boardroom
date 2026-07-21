import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

export default function Register() {
  const [f, setF] = useState({ companyName: '', registrationDetails: '',
    name: '', email: '', password: '', confirm: '', title: '', contactNumber: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const nav = useNavigate()
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (f.password !== f.confirm) return setError('Passwords do not match.')
    if (f.password.length < 8) return setError('Password must be at least 8 characters.')
    setBusy(true)
    try {
      const res = await fetch('api/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: f.companyName, registrationDetails: f.registrationDetails,
          name: f.name, email: f.email, password: f.password,
          title: f.title, contactNumber: f.contactNumber
        })
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Registration failed')
      nav('/login', { state: { registered: true } })
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  return (
    <div className="login-wrap">
      <div className="card login-card" style={{ width: 460 }}>
        <h1>Register a new company</h1>
        <p style={{ textAlign: 'center', color: 'var(--ink-soft)', marginTop: 0 }}>
          Create your organisation's minute book and its first administrator account
        </p>
        <hr className="rule" />
        <form onSubmit={submit}>
          <h3 style={{ marginTop: 0 }}>Company</h3>
          <label htmlFor="cname">Company name</label>
          <input id="cname" value={f.companyName} onChange={e => set('companyName', e.target.value)} required autoFocus />
          <label htmlFor="creg">Registration details (optional)</label>
          <input id="creg" value={f.registrationDetails} onChange={e => set('registrationDetails', e.target.value)}
                 placeholder="Registration number, jurisdiction…" />

          <h3 style={{ marginTop: 22 }}>Administrator account</h3>
          <div className="grid2">
            <div><label htmlFor="rname">Full name</label>
              <input id="rname" value={f.name} onChange={e => set('name', e.target.value)} required /></div>
            <div><label htmlFor="rtitle">Job title</label>
              <input id="rtitle" value={f.title} onChange={e => set('title', e.target.value)} placeholder="Company Secretary" /></div>
            <div><label htmlFor="remail">Email</label>
              <input id="remail" type="email" value={f.email} onChange={e => set('email', e.target.value)} required /></div>
            <div><label htmlFor="rphone">Contact number (optional)</label>
              <input id="rphone" value={f.contactNumber} onChange={e => set('contactNumber', e.target.value)} /></div>
            <div><label htmlFor="rpw">Password (8+ characters)</label>
              <input id="rpw" type="password" value={f.password} onChange={e => set('password', e.target.value)} required minLength={8} /></div>
            <div><label htmlFor="rpw2">Confirm password</label>
              <input id="rpw2" type="password" value={f.confirm} onChange={e => set('confirm', e.target.value)} required /></div>
          </div>

          {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>{error}</p>}
          <button className="btn" style={{ width: '100%', marginTop: 18 }} disabled={busy}>
            {busy ? 'Creating…' : 'Create company and account'}
          </button>
        </form>
        <p style={{ textAlign: 'center', fontSize: '0.85rem', marginTop: 16 }}>
          Already registered? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
