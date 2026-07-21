import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Link, useNavigate, Navigate } from 'react-router-dom'
import Login from './pages/Login.jsx'
import Register from './pages/Register.jsx'
import Dashboard from './pages/Dashboard.jsx'
import MeetingWorkspace from './pages/MeetingWorkspace.jsx'
import Portal from './pages/Portal.jsx'
import UsersManagement from './pages/UsersManagement.jsx'
import ContactsManagement from './pages/ContactsManagement.jsx'
import { getUser, logout } from './api.js'
import './styles.css'

function Shell({ children }) {
  const user = getUser()
  const nav = useNavigate()
  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="brand">
            Board<span>Room</span> · Minute Book
            {user?.companyName && <span style={{ color: 'var(--ink-soft)', fontWeight: 400, marginLeft: 8 }}>&middot; {user.companyName}</span>}
          </div>
        </Link>
        {user && (
          <div className="who">
            {user.role === 'Admin' && (
              <>
                <Link to="/users" style={{ marginRight: 12 }}>Manage users</Link>
                {' · '}
              </>
            )}
            {user.name} ({user.role}) ·{' '}
            <a href="#" onClick={e => { e.preventDefault(); logout(); nav('/login') }}>Sign out</a>
          </div>
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
        <Route path="/contacts" element={<RequireAuth><Shell><ContactsManagement /></Shell></RequireAuth>} />
        <Route path="/meetings/:id" element={<RequireAuth><Shell><MeetingWorkspace /></Shell></RequireAuth>} />
        <Route path="/users" element={<RequireAuth><Shell><UsersManagement /></Shell></RequireAuth>} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)
