import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { BASE } from '../api.js'

export default function Register() {
  const [form, setForm] = useState({ companyName: '', registrationDetails: '', name: '', title: '', email: '', contactNumber: '', password: '' })
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
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
      const res = await fetch(`${BASE}/api/auth/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form)
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Registration failed')
      nav('/login', { state: { registered: true } })
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
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
        className="auth-card auth-card-register"
        style={{ maxWidth: 540 }}
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
          <p className="auth-subtitle">Register a new company workspace</p>
        </div>

        <div className="auth-form-scrollable">
          <form onSubmit={submit}>
            <div className="auth-field">
              <label>Company name</label>
              <div className="auth-input-wrapper">
                <input value={form.companyName} onChange={set('companyName')} placeholder="Acme Corporation Ltd" required autoFocus />
              </div>
            </div>

            <div className="auth-field">
              <label>Registration details <span style={{ color: 'var(--ink-soft)', fontWeight: 400 }}>(optional)</span></label>
              <div className="auth-input-wrapper">
                <input value={form.registrationDetails} onChange={set('registrationDetails')} placeholder="Company number, jurisdiction…" />
              </div>
            </div>

            <div className="grid2">
              <div className="auth-field">
                <label>Your name</label>
                <div className="auth-input-wrapper">
                  <input value={form.name} onChange={set('name')} placeholder="Jane Smith" required />
                </div>
              </div>
              <div className="auth-field">
                <label>Job title</label>
                <div className="auth-input-wrapper">
                  <input value={form.title} onChange={set('title')} placeholder="Corporate Secretary" />
                </div>
              </div>
            </div>

            <div className="grid2">
              <div className="auth-field">
                <label>Email address</label>
                <div className="auth-input-wrapper">
                  <input type="email" value={form.email} onChange={set('email')} placeholder="jane@company.com" required />
                </div>
              </div>
              <div className="auth-field">
                <label>Contact number</label>
                <div className="auth-input-wrapper">
                  <input value={form.contactNumber} onChange={set('contactNumber')} placeholder="+1 (555) 000-0000" />
                </div>
              </div>
            </div>

            <div className="grid2">
              <div className="auth-field">
                <label>Password <span style={{ color: 'var(--ink-soft)', fontWeight: 400 }}>(min 8)</span></label>
                <div className="auth-input-wrapper">
                  <input type={showPassword ? 'text' : 'password'} value={form.password} onChange={set('password')} required minLength={8} />
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
              <div className="auth-field">
                <label>Confirm password</label>
                <div className="auth-input-wrapper">
                  <input type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required minLength={8} />
                </div>
              </div>
            </div>

            <p style={{ fontSize: '0.8rem', color: 'var(--ink-soft)', marginTop: 4, lineHeight: 1.4 }}>
              💡 Already use BoardRoom? Enter your existing email and its current password — the new company will be added to your account as another workspace.
            </p>

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
                  Creating company…
                </>
              ) : (
                'Create company & account'
              )}
            </motion.button>
          </form>

          <div className="auth-footer">
            Already registered? <Link to="/login">Back to sign in</Link>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
