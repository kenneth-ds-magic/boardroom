import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

export default function Register() {
  const [form, setForm] = useState({ companyName: '', registrationDetails: '', name: '', title: '', email: '', contactNumber: '', password: '' })
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const nav = useNavigate()
  const set = k => e => setForm({ ...form, [k]: e.target.value })

  async function submit(e) {
    e.preventDefault()
    if (form.password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    setError(''); setBusy(true)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form)
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Registration failed')
      nav('/login', { state: { registered: true } })
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  return (
    <div className="login-wrap">
      <div className="card login-card" style={{ maxWidth: 520 }}>
        <h1>Board<span style={{ color: 'var(--brass)' }}>Room</span></h1>
        <p style={{ textAlign: 'center', color: 'var(--ink-soft)', marginTop: 0 }}>Register a new company</p>
        <hr className="rule" />
        <form onSubmit={submit}>
          <label>Company name</label>
          <input value={form.companyName} onChange={set('companyName')} required />
          <label>Registration details <span style={{ color: 'var(--ink-soft)' }}>(optional)</span></label>
          <input value={form.registrationDetails} onChange={set('registrationDetails')} placeholder="Company number, jurisdiction…" />
          <div className="grid2">
            <div>
              <label>Your name</label>
              <input value={form.name} onChange={set('name')} required />
            </div>
            <div>
              <label>Job title</label>
              <input value={form.title} onChange={set('title')} placeholder="Administrator" />
            </div>
          </div>
          <div className="grid2">
            <div>
              <label>Email</label>
              <input type="email" value={form.email} onChange={set('email')} required />
            </div>
            <div>
              <label>Contact number</label>
              <input value={form.contactNumber} onChange={set('contactNumber')} />
            </div>
          </div>
          <div className="grid2">
            <div>
              <label>Password <span style={{ color: 'var(--ink-soft)' }}>(min 8)</span></label>
              <input type="password" value={form.password} onChange={set('password')} required minLength={8} />
            </div>
            <div>
              <label>Confirm password</label>
              <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required minLength={8} />
            </div>
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--ink-soft)' }}>
            Already use BoardRoom? Enter your existing email and its current password — the new
            company is added to your account as another workspace.
          </p>
          {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>{error}</p>}
          <button className="btn" style={{ width: '100%', marginTop: 12 }} disabled={busy}>
            {busy ? 'Creating…' : 'Create company and account'}
          </button>
        </form>
        <p style={{ textAlign: 'center', fontSize: '0.85rem', marginTop: 16 }}>
          <Link to="/login">Back to sign in</Link>
        </p>
      </div>
    </div>
  )
}
