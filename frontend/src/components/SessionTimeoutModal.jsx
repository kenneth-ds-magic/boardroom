import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { FiShield, FiAlertTriangle, FiLogOut, FiRefreshCw } from 'react-icons/fi'
import { getUser, logout, api, BASE } from '../api.js'

// 4 hours total inactivity limit; show warning in last 2 minutes (120 seconds)
const INACTIVITY_TIMEOUT_MS = 4 * 60 * 60 * 1000 // 4 hours
const WARNING_WINDOW_MS = 2 * 60 * 1000          // 2 mins (120 secs)

export default function SessionTimeoutModal() {
  const [warningOpen, setWarningOpen] = useState(false)
  const [secondsRemaining, setSecondsRemaining] = useState(120)
  const lastActivityRef = useRef(Date.now())
  const countdownTimerRef = useRef(null)

  useEffect(() => {
    // Only track when authenticated
    if (!getUser()) return

    function resetActivity() {
      lastActivityRef.current = Date.now()
      if (warningOpen) {
        setWarningOpen(false)
      }
    }

    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart']
    const handleEvent = () => {
      // If warning modal is open, don't silently dismiss via micro mouse movement;
      // require explicit button interaction to keep the user aware
      if (!warningOpen) {
        lastActivityRef.current = Date.now()
      }
    }

    events.forEach(evt => window.addEventListener(evt, handleEvent, { passive: true }))

    const checkInterval = setInterval(() => {
      if (!getUser()) return
      const elapsed = Date.now() - lastActivityRef.current
      const timeLeft = INACTIVITY_TIMEOUT_MS - elapsed

      if (timeLeft <= 0) {
        // Expired!
        clearInterval(checkInterval)
        if (countdownTimerRef.current) clearInterval(countdownTimerRef.current)
        logout(true).finally(() => {
          window.location.href = `${BASE}/login?reason=timeout`
        })
      } else if (timeLeft <= WARNING_WINDOW_MS) {
        if (!warningOpen) {
          setWarningOpen(true)
        }
        setSecondsRemaining(Math.max(1, Math.ceil(timeLeft / 1000)))
      } else {
        if (warningOpen) {
          setWarningOpen(false)
        }
      }
    }, 1000)

    return () => {
      events.forEach(evt => window.removeEventListener(evt, handleEvent))
      clearInterval(checkInterval)
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current)
    }
  }, [warningOpen])

  async function handleStaySignedIn() {
    lastActivityRef.current = Date.now()
    setWarningOpen(false)
    try {
      // Touch session on server
      await api('/auth/sessions').catch(() => {})
    } catch {}
  }

  async function handleSignOutNow() {
    await logout()
    window.location.href = `${BASE}/login`
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {warningOpen && (
        <div className="modal-backdrop" style={{ zIndex: 99999 }}>
          <motion.div
            className="modal-content"
            style={{
              maxWidth: 460,
              width: '90%',
              padding: '24px 28px',
              borderRadius: 16,
              background: '#ffffff',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.25)',
              textAlign: 'center'
            }}
            initial={{ scale: 0.9, opacity: 0, y: 16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 16 }}
            transition={{ duration: 0.2 }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                background: 'rgba(168, 127, 46, 0.12)',
                color: 'var(--brass)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px auto',
                fontSize: '1.5rem'
              }}
            >
              <FiAlertTriangle />
            </div>

            <h3 style={{ margin: '0 0 8px 0', fontSize: '1.25rem', color: 'var(--ink)' }}>
              Session Timeout Warning
            </h3>

            <p style={{ margin: '0 0 18px 0', fontSize: '0.88rem', color: 'var(--ink-soft)', lineHeight: 1.5 }}>
              For corporate governance compliance and board confidentiality, inactive sessions are automatically locked.
            </p>

            <div
              style={{
                background: 'var(--paper)',
                border: '1px solid var(--line)',
                borderRadius: 10,
                padding: '12px 16px',
                marginBottom: 20,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10
              }}
            >
              <span style={{ fontSize: '0.84rem', color: 'var(--ink)' }}>Signing out in:</span>
              <span
                style={{
                  fontSize: '1.2rem',
                  fontWeight: 700,
                  fontVariantNumeric: 'tabular-nums',
                  color: secondsRemaining <= 30 ? 'var(--danger)' : 'var(--bottle)'
                }}
              >
                {secondsRemaining >= 60
                  ? `${Math.floor(secondsRemaining / 60)}m ${String(secondsRemaining % 60).padStart(2, '0')}s`
                  : `${secondsRemaining}s`}
              </span>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button
                type="button"
                className="btn secondary"
                onClick={handleSignOutNow}
                style={{ padding: '8px 18px', fontSize: '0.86rem', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <FiLogOut size={14} /> Sign out
              </button>
              <button
                type="button"
                className="btn"
                onClick={handleStaySignedIn}
                style={{ padding: '8px 22px', fontSize: '0.86rem', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <FiRefreshCw size={14} /> Stay signed in
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  )
}
