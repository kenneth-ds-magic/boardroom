import { useState } from 'react'
import { Link, useLocation, useNavigate, Navigate } from 'react-router-dom'
import { login, selectWorkspace, getUser } from '../api.js'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(null)   // { user, companies, selectToken }
  const [busy, setBusy] = useState(false)
  const nav = useNavigate()
  const registered = useLocation().state?.registered

  if (getUser()) {
    return <Navigate to="/" replace />
  }

  async function submit(e) {
    e.preventDefault()
    setError(''); setBusy(true)
    try {
      const result = await login(email, password)
      if (result.companies.length === 1) {
        // Single workspace: enter it automatically.
        await selectWorkspace(result, result.companies[0].companyId)
        window.location.href = '/'
      } else {
        setPending(result)   // multiple workspaces: let the user choose
      }
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  async function enter(companyId) {
    setError(''); setBusy(true)
    try {
      await selectWorkspace(pending, companyId)
      window.location.href = '/'
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  if (pending) {
    const firstName = pending.user.name.split(' ')[0]
    return (
      <div className="login-wrap">
        <div className="card login-card">
          <h1>Board<span style={{ color: 'var(--brass)' }}>Room</span></h1>
          <p style={{ textAlign: 'center', color: 'var(--ink-soft)', marginTop: 0 }}>
            Welcome back, {firstName}. Choose a workspace to enter:
          </p>
          <hr className="rule" />
          <div style={{ display: 'grid', gap: 10 }}>
            {pending.companies.map(c => (
              <button key={c.companyId} className="btn workspace-choice" disabled={busy}
                      onClick={() => enter(c.companyId)}>
                {c.companyName} <span style={{ opacity: 0.75 }}>({c.role})</span>
              </button>
            ))}
          </div>
          {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>{error}</p>}
          <p style={{ textAlign: 'center', fontSize: '0.85rem', marginTop: 16 }}>
            <a href="#" onClick={e => { e.preventDefault(); setPending(null); setError('') }}>Use a different account</a>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="login-wrap">
      <div className="card login-card">
        <h1>Board<span style={{ color: 'var(--brass)' }}>Room</span></h1>
        <p style={{ textAlign: 'center', color: 'var(--ink-soft)', marginTop: 0 }}>The company minute book</p>
        <hr className="rule" />
        {registered && <p style={{ background: 'var(--bottle-tint)', color: 'var(--bottle)', padding: '8px 12px', borderRadius: 6, fontSize: '0.85rem' }}>Company registered. Sign in to enter your new workspace.</p>}
        <form onSubmit={submit}>
          <label htmlFor="email">Email</label>
          <input id="email" type="email" value={email} onChange={e => { setEmail(e.target.value); if (error) setError(''); }} required autoFocus />
          <label htmlFor="pw">Password</label>
          <input id="pw" type="password" value={password} onChange={e => { setPassword(e.target.value); if (error) setError(''); }} required minLength={8} />
          {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>{error}</p>}
          <button className="btn" style={{ width: '100%', marginTop: 18 }} disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p style={{ textAlign: 'center', fontSize: '0.85rem', marginTop: 16 }}>
          New here? <Link to="/register">Register a new company</Link>
        </p>
      </div>
    </div>
  )
}
