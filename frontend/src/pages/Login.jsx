import { useState } from 'react'
import { Link, useLocation, useNavigate, Navigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { login, selectWorkspace, getUser, BASE } from '../api.js'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(null)   // { user, companies, selectToken }
  const [busy, setBusy] = useState(false)
  const location = useLocation()
  const registered = location.state?.registered
  const searchParams = new URLSearchParams(location.search)
  const reason = searchParams.get('reason')

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
        window.location.href = `${BASE}/`
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
      window.location.href = `${BASE}/`
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  const getCompanyInitials = name => {
    if (!name) return 'BR'
    const parts = name.trim().split(/\s+/)
    return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase()
  }

  return (
    <div className="auth-container">
      {/* Ambient Animated Glow Orbs */}
      <motion.div 
        className="auth-glow-orb-1"
        animate={{
          scale: [1, 1.15, 1],
          opacity: [0.15, 0.25, 0.15]
        }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div 
        className="auth-glow-orb-2"
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.3, 0.45, 0.3]
        }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Main Glassmorphic Auth Card */}
      <motion.div 
        className="auth-card"
        initial={{ opacity: 0, y: 30, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="auth-header">
          <motion.div 
            className="auth-logo-badge"
            initial={{ scale: 0, rotate: -15 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.1 }}
          >
            🏛️
          </motion.div>
          <h1 className="auth-title">
            Board<span style={{ color: 'var(--brass)' }}>Room</span>
          </h1>
          <p className="auth-subtitle">The company minute book & governance portal</p>
        </div>

        <AnimatePresence mode="wait">
          {pending ? (
            <motion.div
              key="workspace-selection"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <p style={{ textAlign: 'center', color: 'var(--ink-soft)', fontSize: '0.92rem', margin: '0 0 16px' }}>
                Welcome back, <strong>{pending.user.name.split(' ')[0]}</strong>. Choose a workspace to enter:
              </p>

              <div className="auth-workspace-list">
                {pending.companies.map((c, i) => (
                  <motion.button
                    key={c.companyId}
                    type="button"
                    className="auth-workspace-card"
                    disabled={busy}
                    onClick={() => enter(c.companyId)}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.08 }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className="auth-workspace-info">
                      <div className="auth-workspace-avatar">{getCompanyInitials(c.companyName)}</div>
                      <div>
                        <div className="auth-workspace-name">{c.companyName}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--ink-soft)' }}>Workspace Member</div>
                      </div>
                    </div>
                    <span className="pill">{c.role}</span>
                  </motion.button>
                ))}
              </div>

              {error && (
                <div className="auth-banner auth-banner-error">
                  <span>⚠️</span>
                  <div>{error}</div>
                </div>
              )}

              <p style={{ textAlign: 'center', fontSize: '0.86rem', marginTop: 20 }}>
                <a href="#" onClick={e => { e.preventDefault(); setPending(null); setError('') }} style={{ color: 'var(--bottle)', fontWeight: 600 }}>
                  ← Use a different account
                </a>
              </p>
            </motion.div>
          ) : (
            <motion.form
              key="login-form"
              onSubmit={submit}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
            >
              {registered && (
                <motion.div 
                  className="auth-banner auth-banner-success"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                >
                  <span>✓</span>
                  <div>Company registered successfully. Sign in to enter your new workspace.</div>
                </motion.div>
              )}

              {reason === 'timeout' && (
                <motion.div 
                  className="auth-banner auth-banner-error"
                  style={{ background: 'rgba(168, 127, 46, 0.1)', borderColor: 'rgba(168, 127, 46, 0.35)', color: 'var(--brass)' }}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                >
                  <span>⏱️</span>
                  <div>Your session expired due to inactivity. Please sign in to resume.</div>
                </motion.div>
              )}

              {reason === 'revoked' && (
                <motion.div 
                  className="auth-banner auth-banner-error"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                >
                  <span>🔒</span>
                  <div>This device session was revoked or signed out. Please sign in again.</div>
                </motion.div>
              )}

              <div className="auth-field">
                <label htmlFor="email">Email address</label>
                <div className="auth-input-wrapper">
                  <input
                    id="email"
                    type="email"
                    placeholder="name@company.com"
                    value={email}
                    onChange={e => { setEmail(e.target.value); if (error) setError(''); }}
                    required
                    autoFocus
                  />
                </div>
              </div>

              <div className="auth-field">
                <label htmlFor="pw">Password</label>
                <div className="auth-input-wrapper">
                  <input
                    id="pw"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={e => { setPassword(e.target.value); if (error) setError(''); }}
                    required
                    minLength={8}
                  />
                  <button
                    type="button"
                    className="auth-pw-toggle"
                    onClick={() => setShowPassword(v => !v)}
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? '👁️' : '🔒'}
                  </button>
                </div>
              </div>

              {error && (
                <motion.div 
                  className="auth-banner auth-banner-error"
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <span>⚠️</span>
                  <div>{error}</div>
                </motion.div>
              )}

              <motion.button
                type="submit"
                className="auth-btn-primary"
                disabled={busy}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
              >
                {busy ? (
                  <>
                    <motion.span
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      style={{ display: 'inline-block' }}
                    >
                      ⏳
                    </motion.span>
                    Signing in…
                  </>
                ) : (
                  'Sign in'
                )}
              </motion.button>

              <div className="auth-footer">
                New here? <Link to="/register">Register a new company</Link>
              </div>
            </motion.form>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
