import React, { useState, useRef, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Link, useNavigate, Navigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FiCalendar,
  FiUsers,
  FiShield,
  FiSettings,
  FiBriefcase,
  FiChevronDown,
  FiCheck,
  FiLogOut
} from 'react-icons/fi'
import Login from './pages/Login.jsx'
import Register from './pages/Register.jsx'
import Dashboard from './pages/Dashboard.jsx'
import MeetingWorkspace from './pages/MeetingWorkspace.jsx'
import ContactsManagement from './pages/ContactsManagement.jsx'
import UsersManagement from './pages/UsersManagement.jsx'
import Settings from './pages/Settings.jsx'
import Portal from './pages/Portal.jsx'
import SessionTimeoutModal from './components/SessionTimeoutModal.jsx'
import { getUser, getCompanies, switchCompany, logout, BASE, api } from './api.js'
import './styles.css'

function Shell({ children }) {
  const user = getUser()
  const companies = getCompanies()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [companyDropdownOpen, setCompanyDropdownOpen] = useState(false)
  const [companyLogo, setCompanyLogo] = useState(null)
  const [currentCompanyName, setCurrentCompanyName] = useState(user?.companyName || '')
  const companyDropdownRef = useRef(null)
  const isManagement = ['Secretary', 'Admin'].includes(user?.role)

  useEffect(() => {
    function handleClickOutside(event) {
      if (companyDropdownRef.current && !companyDropdownRef.current.contains(event.target)) {
        setCompanyDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!user) return
    async function fetchBrand() {
      try {
        const comp = await api('/company')
        if (comp) {
          if (comp.name) setCurrentCompanyName(comp.name)
          if (comp.hasLogo) {
            const cid = comp.id || user.companyId
            const url = comp.logoUrl
              ? `${BASE}${comp.logoUrl}`
              : `${BASE}/api/company/logo?companyId=${cid}&t=${Date.now()}`
            setCompanyLogo(url)
          } else {
            setCompanyLogo(null)
          }
        }
      } catch {}
    }
    fetchBrand()

    function handleBrandUpdate(e) {
      if (e.detail?.name) setCurrentCompanyName(e.detail.name)
      if (e.detail?.hasLogo !== undefined) {
        if (e.detail.hasLogo) {
          const cid = e.detail.companyId || e.detail.id || user.companyId
          const url = e.detail.logoUrl
            ? `${BASE}${e.detail.logoUrl}`
            : `${BASE}/api/company/logo?companyId=${cid}&t=${Date.now()}`
          setCompanyLogo(url)
        } else {
          setCompanyLogo(null)
        }
      } else {
        fetchBrand()
      }
    }
    window.addEventListener('boardroom:company-updated', handleBrandUpdate)
    return () => window.removeEventListener('boardroom:company-updated', handleBrandUpdate)
  }, [user?.companyId])


  const getInitials = name => {
    if (!name) return '?'
    const parts = name.trim().split(/\s+/)
    return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase()
  }

  const isActive = path => {
    if (path === '/') return location.pathname === '/'
    return location.pathname.startsWith(path)
  }

  return (
    <div>
      <header className="topbar-glass no-print">
        <div className="topbar-inner">
          {/* Brand & Workspace Switcher Group */}
          <div className="topbar-brand-group">
            <Link to="/" className="topbar-brand-link" title="BoardRoom Home">
              <div className="topbar-brand-icon" aria-hidden="true">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 21h18M3 10h18M5 10v11M19 10v11M9 10v11M15 10v11M12 3l9 7H3l9-7z" />
                </svg>
              </div>
              <div className="topbar-brand-text">
                Board<span>Room</span>
              </div>
            </Link>

            {user && <div className="topbar-divider" />}

            {user && companies.length > 1 ? (
              <div className="company-switcher-container" ref={companyDropdownRef}>
                <button
                  type="button"
                  className="company-switcher-btn"
                  onClick={() => setCompanyDropdownOpen(v => !v)}
                  aria-expanded={companyDropdownOpen}
                  aria-haspopup="true"
                  title="Switch workspace"
                >
                  {companyLogo && (
                    <img
                      src={companyLogo}
                      alt="Logo"
                      className="topbar-company-logo"
                      onError={() => setCompanyLogo(null)}
                    />
                  )}
                  <span className="company-btn-name">{currentCompanyName}</span>
                  <FiChevronDown
                    size={13}
                    className={`company-btn-chevron ${companyDropdownOpen ? 'rotated' : ''}`}
                  />
                </button>

                <AnimatePresence>
                  {companyDropdownOpen && (
                    <motion.div
                      className="company-dropdown-menu"
                      initial={{ opacity: 0, y: 6, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 6, scale: 0.98 }}
                      transition={{ duration: 0.15 }}
                    >
                      <div className="company-dropdown-header">Switch Workspace</div>
                      {companies.map(c => {
                        const isCurrent = c.companyId === user.companyId
                        return (
                          <button
                            key={c.companyId}
                            type="button"
                            className={`company-dropdown-item ${isCurrent ? 'active' : ''}`}
                            onClick={async () => {
                              setCompanyDropdownOpen(false)
                              if (!isCurrent) {
                                try {
                                  await switchCompany(c.companyId)
                                } catch (err) {
                                  alert(err.message)
                                }
                              }
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div className="company-item-avatar">
                                <img
                                  src={`${BASE}/api/company/logo?companyId=${c.companyId}`}
                                  alt=""
                                  className="company-item-logo-img"
                                  onError={e => {
                                    e.currentTarget.style.display = 'none'
                                    if (e.currentTarget.nextElementSibling) {
                                      e.currentTarget.nextElementSibling.style.display = 'flex'
                                    }
                                  }}
                                />
                                <span className="company-item-avatar-initials" style={{ display: 'none' }}>
                                  {c.companyName.slice(0, 2).toUpperCase()}
                                </span>
                              </div>
                              <div>
                                <div className="company-item-name">{c.companyName}</div>
                                <div className="company-item-role">{c.role}</div>
                              </div>
                            </div>
                            {isCurrent && <FiCheck size={16} className="company-item-check" />}
                          </button>
                        )
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : user && (
              <div className="company-badge-wrap" title="Current company workspace">
                {companyLogo && (
                  <img
                    src={companyLogo}
                    alt="Logo"
                    className="topbar-company-logo"
                    onError={() => setCompanyLogo(null)}
                  />
                )}
                <span className="company-badge-name">
                  {currentCompanyName}
                </span>
              </div>
            )}
          </div>

          {user && (
            <>
              {/* Desktop Centered Nav Links */}
              <nav className="topbar-nav" aria-label="Main application navigation">
                <Link to="/" className={`nav-link-item ${isActive('/') ? 'active' : ''}`}>
                  <FiCalendar size={15} />
                  <span>Meetings</span>
                </Link>
                <Link to="/contacts" className={`nav-link-item ${isActive('/contacts') ? 'active' : ''}`}>
                  <FiUsers size={15} />
                  <span>Contacts</span>
                </Link>
                {isManagement && (
                  <Link to="/users" className={`nav-link-item ${isActive('/users') ? 'active' : ''}`}>
                    <FiShield size={15} />
                    <span>Users</span>
                  </Link>
                )}
                {isManagement && (
                  <Link
                    to="/settings"
                    className={`nav-link-item ${
                      isActive('/settings') || isActive('/mail-settings') ? 'active' : ''
                    }`}
                  >
                    <FiSettings size={15} />
                    <span>Settings</span>
                  </Link>
                )}
              </nav>

              {/* Desktop User Profile Badge */}
              <div className="user-profile-badge desktop-only">
                <div className="user-avatar-circle" title={user.name}>
                  {getInitials(user.name)}
                </div>
                <div className="user-info-text">
                  <div className="user-name-text">{user.name}</div>
                  <span className={`user-role-pill ${user.role.toLowerCase()}`}>
                    {user.role}
                  </span>
                </div>
                <button
                  type="button"
                  className="signout-btn"
                  onClick={async () => {
                    await logout()
                    window.location.href = `${BASE}/login`
                  }}
                  title="Sign out of workspace"
                  aria-label="Sign out of workspace"
                >
                  <FiLogOut size={15} />
                </button>
              </div>

              {/* Mobile Hamburger Toggle */}
              <button
                type="button"
                className="mobile-nav-toggle"
                onClick={() => setMobileOpen(v => !v)}
                aria-label="Toggle navigation menu"
              >
                {mobileOpen ? '✕' : '☰'}
              </button>
            </>
          )}
        </div>

        {/* Mobile Nav Drawer */}
        <AnimatePresence>
          {user && mobileOpen && (
            <motion.div
              className="mobile-nav-drawer"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  paddingBottom: 10,
                  borderBottom: '1px solid var(--line)'
                }}
              >
                <div className="user-avatar-circle">{getInitials(user.name)}</div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{user.name}</div>
                  <span className={`user-role-pill ${user.role.toLowerCase()}`}>{user.role}</span>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 4 }}>
                <Link
                  to="/"
                  onClick={() => setMobileOpen(false)}
                  className={`nav-link-item ${isActive('/') ? 'active' : ''}`}
                >
                  <FiCalendar size={16} />
                  <span>Meetings Dashboard</span>
                </Link>
                <Link
                  to="/contacts"
                  onClick={() => setMobileOpen(false)}
                  className={`nav-link-item ${isActive('/contacts') ? 'active' : ''}`}
                >
                  <FiUsers size={16} />
                  <span>Manage Contacts</span>
                </Link>
                {isManagement && (
                  <Link
                    to="/users"
                    onClick={() => setMobileOpen(false)}
                    className={`nav-link-item ${isActive('/users') ? 'active' : ''}`}
                  >
                    <FiShield size={16} />
                    <span>Manage Users</span>
                  </Link>
                )}
                {isManagement && (
                  <Link
                    to="/settings"
                    onClick={() => setMobileOpen(false)}
                    className={`nav-link-item ${
                      isActive('/settings') || isActive('/mail-settings') ? 'active' : ''
                    }`}
                  >
                    <FiSettings size={16} />
                    <span>Settings</span>
                  </Link>
                )}
                <button
                  type="button"
                  className="signout-btn"
                  style={{
                    justifyContent: 'flex-start',
                    marginTop: 8,
                    padding: '8px 12px',
                    gap: 8,
                    width: 'auto',
                    borderRadius: 8
                  }}
                  onClick={async () => {
                    await logout()
                    window.location.href = `${BASE}/login`
                  }}
                >
                  <FiLogOut size={16} />
                  <span>Sign out of workspace</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <SessionTimeoutModal />
      <div className="shell">{children}</div>
    </div>
  )
}


function RequireAuth({ children }) {
  return getUser() ? children : <Navigate to="/login" replace />
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/portal/:token" element={<Shell><Portal /></Shell>} />
        <Route path="/" element={<RequireAuth><Shell><Dashboard /></Shell></RequireAuth>} />
        <Route path="/meetings/:id" element={<RequireAuth><Shell><MeetingWorkspace /></Shell></RequireAuth>} />
        <Route path="/contacts" element={<RequireAuth><Shell><ContactsManagement /></Shell></RequireAuth>} />
        <Route path="/users" element={<RequireAuth><Shell><UsersManagement /></Shell></RequireAuth>} />
        <Route path="/mail-settings" element={<RequireAuth><Shell><Settings /></Shell></RequireAuth>} />
        <Route path="/settings" element={<RequireAuth><Shell><Settings /></Shell></RequireAuth>} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)

