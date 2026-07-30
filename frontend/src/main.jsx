import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Link, useNavigate, Navigate } from 'react-router-dom'
import Login from './pages/Login.jsx'
import Register from './pages/Register.jsx'
import Dashboard from './pages/Dashboard.jsx'
import MeetingWorkspace from './pages/MeetingWorkspace.jsx'
import ContactsManagement from './pages/ContactsManagement.jsx'
import UsersManagement from './pages/UsersManagement.jsx'
import MailSettings from './pages/MailSettings.jsx'
import Portal from './pages/Portal.jsx'
import { getUser, getCompanies, switchCompany, logout, BASE } from './api.js'
import './styles.css'

function Shell({ children }) {
  const user = getUser()
  const companies = getCompanies()
  const nav = useNavigate()
  const isManagement = ['Secretary', 'Admin'].includes(user?.role)

  async function onSwitch(e) {
    const companyId = e.target.value
    if (!companyId || companyId === user.companyId) return
    try { await switchCompany(companyId) } catch (err) { alert(err.message) }
  }

  return (
    <div className="shell">
      <header className="topbar no-print">
        <div className="topbar-left">
          <Link to="/" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="brand">Board<span>Room</span></div>
          </Link>
          {user && companies.length > 1 ? (
            <select className="company-switcher" value={user.companyId} onChange={onSwitch}
                    aria-label="Switch company workspace">
              {companies.map(c => (
                <option key={c.companyId} value={c.companyId}>{c.companyName} ({c.role})</option>
              ))}
            </select>
          ) : user && (
            <span className="company-name">{user.companyName}</span>
          )}
        </div>
        {user && (
          <nav className="topbar-links">
            <Link to="/contacts">Manage contacts</Link>
            {isManagement && <Link to="/users">Manage users</Link>}
            {user.role === 'Admin' && <Link to="/mail-settings">Mail settings</Link>}
            <span className="who">{user.name} ({user.role})</span>
            <a href="#" onClick={e => { e.preventDefault(); logout(); window.location.href = `${BASE}/login` }}>Sign out</a>
          </nav>
        )}
      </header>
      {children}
    </div>
  )
}

function RequireAuth({ children }) {
  return getUser() ? children : <Navigate to="/login" replace />
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename="/boardroom">
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/portal/:token" element={<Shell><Portal /></Shell>} />
        <Route path="/" element={<RequireAuth><Shell><Dashboard /></Shell></RequireAuth>} />
        <Route path="/meetings/:id" element={<RequireAuth><Shell><MeetingWorkspace /></Shell></RequireAuth>} />
        <Route path="/contacts" element={<RequireAuth><Shell><ContactsManagement /></Shell></RequireAuth>} />
        <Route path="/users" element={<RequireAuth><Shell><UsersManagement /></Shell></RequireAuth>} />
        <Route path="/mail-settings" element={<RequireAuth><Shell><MailSettings /></Shell></RequireAuth>} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)
