import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { login } from '../api.js'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const nav = useNavigate()
  const registered = useLocation().state?.registered

  async function submit(e) {
    e.preventDefault()
    setError('')
    try { await login(email, password); nav('/') }
    catch (err) { setError(err.message) }
  }

  return (
    <div className="login-wrap">
      <div className="card login-card">
        <h1>Board<span style={{ color: 'var(--brass)' }}>Room</span></h1>
        <p style={{ textAlign: 'center', color: 'var(--ink-soft)', marginTop: 0 }}>The company minute book</p>
        <hr className="rule" />
        {registered && <p style={{ background: "var(--bottle-tint)", color: "var(--bottle)", padding: "8px 12px", borderRadius: 6, fontSize: "0.85rem" }}>Company registered. Sign in with your new administrator account.</p>}
        <form onSubmit={submit}>
          <label htmlFor="email">Email</label>
          <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
          <label htmlFor="pw">Password</label>
          <input id="pw" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
          {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>{error}</p>}
          <button className="btn" style={{ width: '100%', marginTop: 18 }}>Sign in</button>
        </form>
        <p style={{ textAlign: 'center', fontSize: '0.85rem', marginTop: 16 }}>
          New here? <Link to="/register">Register a new company</Link>
        </p>
      </div>
    </div>
  )
}
