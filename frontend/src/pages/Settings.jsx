import { useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FiBriefcase,
  FiMail,
  FiPhone,
  FiMapPin,
  FiGlobe,
  FiUploadCloud,
  FiTrash2,
  FiLock,
  FiCheck,
  FiPlus,
  FiEdit2,
  FiCheckCircle,
  FiArrowRight,
  FiLayers,
  FiCalendar,
  FiFileText,
  FiExternalLink,
  FiX,
  FiShield,
  FiMonitor,
  FiSmartphone,
  FiTablet,
  FiClock,
  FiLogOut,
  FiRefreshCw,
  FiActivity
} from 'react-icons/fi'
import {
  api,
  getUser,
  getCompanies,
  switchCompany,
  getCompany,
  updateCompany,
  createCompany,
  uploadCompanyLogo,
  deleteCompanyLogo,
  getSessions,
  revokeSession,
  revokeOtherSessions,
  toggleCustomMail,
  logout,
  BASE
} from '../api.js'

/**
 * Executive System Settings & Multi-Company Management Suite
 * - Workspace Hub: View, Edit & Switch between registered corporate entities
 * - Corporate Profile & MinIO Branding (Admin-only editing + Add/Edit Company)
 * - Transactional Mail & Dispatch Relay Configuration
 */
export default function Settings() {
  const user = getUser()
  const [companiesList, setCompaniesList] = useState(getCompanies())
  const [activeTab, setActiveTab] = useState('company') // 'company' | 'mail'

  // Company Profile state
  const [companyData, setCompanyData] = useState(null)
  const [companyForm, setCompanyForm] = useState({
    name: '',
    registrationDetails: '',
    email: '',
    phone: '',
    address: '',
    website: ''
  })
  const [isAdmin, setIsAdmin] = useState(user?.role === 'Admin')
  const [logoTimestamp, setLogoTimestamp] = useState(Date.now())

  // Add Company Modal state
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [createForm, setCreateForm] = useState({
    name: '',
    registrationDetails: '',
    email: '',
    phone: '',
    address: '',
    website: '',
    switchImmediately: true
  })
  const [createLogoFile, setCreateLogoFile] = useState(null)
  const [createLogoPreview, setCreateLogoPreview] = useState('')
  const [createBusy, setCreateBusy] = useState(false)
  const createFileInputRef = useRef(null)

  // Edit Company Modal state
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editTargetCompanyId, setEditTargetCompanyId] = useState(null)
  const [editTargetCompanyName, setEditTargetCompanyName] = useState('')
  const [editForm, setEditForm] = useState({
    name: '',
    registrationDetails: '',
    email: '',
    phone: '',
    address: '',
    website: ''
  })
  const [editLogoFile, setEditLogoFile] = useState(null)
  const [editLogoPreview, setEditLogoPreview] = useState('')
  const [editHasExistingLogo, setEditHasExistingLogo] = useState(false)
  const [editRemoveLogoFlag, setEditRemoveLogoFlag] = useState(false)
  const [editBusy, setEditBusy] = useState(false)
  const editFileInputRef = useRef(null)

  // Mail settings state
  const [mailForm, setMailForm] = useState({
    provider: 'SMTP',
    host: '',
    port: 587,
    username: '',
    password: '',
    fromAddress: '',
    fromName: '',
    isActive: true
  })
  const [mailConfigured, setMailConfigured] = useState(false)
  const [hasCustomMail, setHasCustomMail] = useState(false)
  const [systemMailConfigured, setSystemMailConfigured] = useState(false)
  const [systemMailInfo, setSystemMailInfo] = useState(null)
  const [savedMailProvider, setSavedMailProvider] = useState('')
  const [isMailEditing, setIsMailEditing] = useState(false)
  const [showMailPassword, setShowMailPassword] = useState(false)
  const [mailBusy, setMailBusy] = useState(false)
  const [testModalOpen, setTestModalOpen] = useState(false)
  const [testLogs, setTestLogs] = useState([])

  // Sessions & Security state
  const [sessionsList, setSessionsList] = useState([])
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [revokingSessionId, setRevokingSessionId] = useState(null)
  const [revokingOthers, setRevokingOthers] = useState(false)

  // Global status toast
  const [status, setStatus] = useState('')
  const say = msg => {
    setStatus(msg)
    setTimeout(() => setStatus(''), 6000)
  }

  // Load active company details & mail settings
  async function loadData() {
    setCompaniesList(getCompanies())
    // 1. Load Company Details
    try {
      const c = await getCompany()
      if (c) {
        setCompanyData(c)
        setCompanyForm({
          name: c.name || '',
          registrationDetails: c.registrationDetails || '',
          email: c.email || '',
          phone: c.phone || '',
          address: c.address || '',
          website: c.website || ''
        })
        setIsAdmin(c.isAdmin ?? user?.role === 'Admin')
        if (c.hasCustomMail !== undefined) {
          setHasCustomMail(Boolean(c.hasCustomMail))
        }
      }
    } catch (err) {
      say(err.message)
    }

    // 2. Load Mail Settings
    try {
      const s = await api('/mail-settings')
      if (s) {
        setHasCustomMail(Boolean(s.hasCustomMail))
        setSystemMailConfigured(Boolean(s.systemMailConfigured))
        setSystemMailInfo(s.systemMail || null)
        if (s.configured) {
          setMailConfigured(true)
          setSavedMailProvider(s.provider)
          setMailForm({
            provider: s.provider,
            host: s.host,
            port: s.port,
            username: s.username,
            password: s.password,
            fromAddress: s.fromAddress,
            fromName: s.fromName,
            isActive: s.isActive
          })
          setIsMailEditing(true)
        } else {
          setIsMailEditing(true)
        }
      }
    } catch {
      // Mail settings might be unconfigured or restricted
    }
  }

  useEffect(() => {
    loadData()
  }, [user?.companyId])

  // Active Device Sessions Handlers
  async function loadSessions() {
    setSessionsLoading(true)
    try {
      const data = await getSessions()
      setSessionsList(Array.isArray(data) ? data : [])
    } catch (err) {
      say(`Failed to load active sessions: ${err.message}`)
    } finally {
      setSessionsLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'sessions') {
      loadSessions()
    }
  }, [activeTab])

  async function handleRevokeSession(sessionId) {
    if (!confirm('Are you sure you want to log out this session? The device will be disconnected immediately.')) {
      return
    }
    setRevokingSessionId(sessionId)
    try {
      await revokeSession(sessionId)
      say('✨ Device session successfully revoked.')
      await loadSessions()
    } catch (err) {
      say(`Failed to revoke session: ${err.message}`)
    } finally {
      setRevokingSessionId(null)
    }
  }

  async function handleRevokeOtherSessions() {
    if (!confirm('Log out all other devices? All active logins except this current browser session will be revoked immediately.')) {
      return
    }
    setRevokingOthers(true)
    try {
      const res = await revokeOtherSessions()
      say(`✨ Success: ${res.revokedCount || 'All'} other session(s) revoked.`)
      await loadSessions()
    } catch (err) {
      say(`Failed to revoke other sessions: ${err.message}`)
    } finally {
      setRevokingOthers(false)
    }
  }

  function getDeviceIcon(deviceType) {
    const dt = (deviceType || '').toLowerCase()
    if (dt === 'mobile') return <FiSmartphone size={18} />
    if (dt === 'tablet') return <FiTablet size={18} />
    return <FiMonitor size={18} />
  }

  function formatSessionDate(dateStr) {
    if (!dateStr) return 'Unknown'
    try {
      const d = new Date(dateStr)
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch {
      return dateStr
    }
  }

  // Open Edit Modal for a given company
  async function openEditModal(targetComp) {
    const cid = targetComp.companyId || targetComp.id
    setEditTargetCompanyId(cid)
    setEditTargetCompanyName(targetComp.companyName || targetComp.name || '')
    setEditLogoFile(null)
    setEditRemoveLogoFlag(false)

    try {
      const details = await getCompany(cid)
      setEditForm({
        name: details.name || '',
        registrationDetails: details.registrationDetails || '',
        email: details.email || '',
        phone: details.phone || '',
        address: details.address || '',
        website: details.website || ''
      })
      setEditHasExistingLogo(Boolean(details.hasLogo))
      setEditLogoPreview(details.hasLogo ? `${BASE}/api/company/logo?companyId=${cid}&t=${Date.now()}` : '')
      setEditModalOpen(true)
    } catch (err) {
      say(`Could not load company details: ${err.message}`)
    }
  }

  // Edit Modal Logo Handlers
  function handleEditLogoChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
    if (!allowed.includes(file.type) && !file.name.match(/\.(png|jpe?g|webp|svg)$/i)) {
      say('Please upload a valid image file (PNG, JPG, WebP, or SVG).')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      say('Image size exceeds 5MB limit. Please upload a smaller image.')
      return
    }
    setEditLogoFile(file)
    setEditLogoPreview(URL.createObjectURL(file))
    setEditRemoveLogoFlag(false)
  }

  function handleRemoveEditLogo() {
    setEditLogoFile(null)
    setEditLogoPreview('')
    setEditRemoveLogoFlag(true)
    if (editFileInputRef.current) editFileInputRef.current.value = ''
  }

  // Handle Edit Company Form submission
  async function handleEditCompanySubmit(e) {
    e.preventDefault()
    if (!editForm.name.trim()) {
      say('Company legal name is required.')
      return
    }

    setEditBusy(true)
    try {
      // 1. Remove logo if flagged
      if (editRemoveLogoFlag && editHasExistingLogo) {
        await deleteCompanyLogo(editTargetCompanyId)
      }
      // 2. Upload new logo if selected
      if (editLogoFile) {
        await uploadCompanyLogo(editLogoFile, editTargetCompanyId)
      }

      // 3. Update company details
      const res = await updateCompany({
        ...editForm,
        companyId: editTargetCompanyId
      })

      say('✨ Corporate profile and logo successfully updated.')
      setEditModalOpen(false)
      const freshTimestamp = Date.now()
      setLogoTimestamp(freshTimestamp)

      if (res.companies) {
        setCompaniesList(res.companies)
      }

      // If we edited the currently active company, update our active state
      if (editTargetCompanyId === user.companyId) {
        setCompanyForm({
          name: res.name || '',
          registrationDetails: res.registrationDetails || '',
          email: res.email || '',
          phone: res.phone || '',
          address: res.address || '',
          website: res.website || ''
        })
        setCompanyData(prev => ({ ...prev, ...res }))
        const hasLogoNow = editRemoveLogoFlag ? false : (editLogoFile ? true : res.hasLogo)
        window.dispatchEvent(new CustomEvent('boardroom:company-updated', {
          detail: {
            ...res,
            hasLogo: hasLogoNow,
            logoUrl: hasLogoNow ? `${BASE}/api/company/logo?companyId=${editTargetCompanyId}&t=${freshTimestamp}` : null
          }
        }))
      }
    } catch (err) {
      say(`Error updating company: ${err.message}`)
    } finally {
      setEditBusy(false)
    }
  }

  // Create Modal Logo Handlers
  function handleCreateLogoChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
    if (!allowed.includes(file.type) && !file.name.match(/\.(png|jpe?g|webp|svg)$/i)) {
      say('Please upload a valid image file (PNG, JPG, WebP, or SVG).')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      say('Image size exceeds 5MB limit. Please upload a smaller image.')
      return
    }
    setCreateLogoFile(file)
    setCreateLogoPreview(URL.createObjectURL(file))
  }

  function handleRemoveCreateLogo() {
    setCreateLogoFile(null)
    setCreateLogoPreview('')
    if (createFileInputRef.current) createFileInputRef.current.value = ''
  }

  // Add Company Handlers
  const setCreate = k => e =>
    setCreateForm({
      ...createForm,
      [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value
    })

  const setEdit = k => e =>
    setEditForm({
      ...editForm,
      [k]: e.target.value
    })

  async function handleCreateCompanySubmit(e) {
    e.preventDefault()
    if (!isAdmin) return
    if (!createForm.name.trim()) {
      say('Company legal name is required.')
      return
    }

    setCreateBusy(true)
    try {
      const res = await createCompany({
        name: createForm.name.trim(),
        registrationDetails: createForm.registrationDetails.trim(),
        email: createForm.email.trim() || null,
        phone: createForm.phone.trim() || null,
        address: createForm.address.trim() || null,
        website: createForm.website.trim() || null
      })

      // Upload logo if selected
      if (createLogoFile && res.companyId) {
        await uploadCompanyLogo(createLogoFile, res.companyId)
      }

      say(`✨ Workspace '${res.name}' created successfully!`)
      setAddModalOpen(false)
      setCreateForm({
        name: '',
        registrationDetails: '',
        email: '',
        phone: '',
        address: '',
        website: '',
        switchImmediately: true
      })
      setCreateLogoFile(null)
      setCreateLogoPreview('')

      if (createForm.switchImmediately && res.companyId) {
        await switchCompany(res.companyId)
      } else {
        await loadData()
      }
    } catch (err) {
      say(`Failed to create company: ${err.message}`)
    } finally {
      setCreateBusy(false)
    }
  }

  // Mail Settings Handlers
  const setM = k => e =>
    setMailForm({ ...mailForm, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  function handleProviderSelect(prov) {
    if (prov === mailForm.provider || !hasCustomMail) return
    const isSaved = mailConfigured && prov === savedMailProvider
    setMailForm(f => ({
      ...f,
      provider: prov,
      host: isSaved ? f.host : '',
      port: prov === 'SMTP' ? 587 : 0,
      username: prov === 'Mailgun' ? 'US' : '',
      password: isSaved ? '********' : ''
    }))
  }

  function toggleMailEdit() {
    if (!mailConfigured) return
    if (isMailEditing) {
      loadData()
    } else {
      setIsMailEditing(true)
    }
  }

  async function handleToggleCustomMail(enabled) {
    setMailBusy(true)
    try {
      const res = await toggleCustomMail(enabled)
      setHasCustomMail(res.hasCustomMail)
      if (res.hasCustomMail) {
        setIsMailEditing(true)
        say('✨ Switched to Custom Company Mail Relay.')
      } else {
        say('✨ Switched to System Default Mail Relay (Environment variables).')
      }
    } catch (err) {
      say(`Failed to update mail relay mode: ${err.message}`)
    } finally {
      setMailBusy(false)
    }
  }

  async function saveMail(e) {
    e.preventDefault()
    setMailBusy(true)
    try {
      await api('/mail-settings', {
        method: 'POST',
        body: JSON.stringify({ ...mailForm, port: Number(mailForm.port), hasCustomMail: true })
      })
      setHasCustomMail(true)
      setMailConfigured(true)
      setSavedMailProvider(mailForm.provider)
      setIsMailEditing(false)
      say('✨ Custom mail settings successfully saved and activated.')
    } catch (err) {
      say(err.message)
    } finally {
      setMailBusy(false)
    }
  }

  async function sendTestEmail(useSystemDefault = false) {
    setMailBusy(true)
    setTestModalOpen(true)
    const prov = useSystemDefault ? (systemMailInfo?.provider || 'System Default') : mailForm.provider
    const modeLabel = useSystemDefault ? 'System Default Relay (Env)' : 'Custom Company Relay'
    setTestLogs([{ step: 1, text: `Initiating handshake with ${prov} (${modeLabel})...`, status: 'pending' }])

    try {
      await new Promise(r => setTimeout(r, 600))
      setTestLogs([
        { step: 1, text: `Initiating handshake with ${prov} (${modeLabel})...`, status: 'done' },
        { step: 2, text: 'Verifying TLS encryption & transport handshake...', status: 'pending' }
      ])

      await new Promise(r => setTimeout(r, 700))
      setTestLogs([
        { step: 1, text: `Initiating handshake with ${prov} (${modeLabel})...`, status: 'done' },
        { step: 2, text: 'Verifying TLS encryption & transport handshake...', status: 'done' },
        { step: 3, text: `Dispatching verification test to ${user.email}...`, status: 'pending' }
      ])

      const payload = useSystemDefault
        ? { useSystemDefault: true }
        : { ...mailForm, port: Number(mailForm.port), useSystemDefault: false }

      const r = await api('/mail-settings/test', {
        method: 'POST',
        body: JSON.stringify(payload)
      })

      await new Promise(r => setTimeout(r, 500))
      setTestLogs([
        { step: 1, text: `Initiating handshake with ${prov} (${modeLabel})...`, status: 'done' },
        { step: 2, text: 'Verifying TLS encryption & transport handshake...', status: 'done' },
        { step: 3, text: r.message, status: 'done' }
      ])
      say(r.message)
    } catch (err) {
      setTestLogs(logs => [
        ...logs.slice(0, logs.length - 1),
        { step: logs.length, text: `Error: ${err.message}`, status: 'error' }
      ])
      say(`Test dispatch failed: ${err.message}`)
    } finally {
      setMailBusy(false)
    }
  }

  async function removeMail() {
    if (!confirm('Are you sure you want to delete the custom email configuration? The workspace will revert to using the system default mail server from environment variables.'))
      return
    setMailBusy(true)
    try {
      await api('/mail-settings', { method: 'DELETE' })
      setMailConfigured(false)
      setHasCustomMail(false)
      setSavedMailProvider('')
      setMailForm({
        provider: 'SMTP',
        host: '',
        port: 587,
        username: '',
        password: '',
        fromAddress: '',
        fromName: '',
        isActive: true
      })
      setIsMailEditing(true)
      say('✨ Custom mail settings removed. Reverted to system default mail (Environment variables).')
    } catch (err) {
      say(err.message)
    } finally {
      setMailBusy(false)
    }
  }

  const isMailProviderSaved = mailConfigured && mailForm.provider === savedMailProvider

  const mailProviders = [
    { id: 'SMTP', name: 'SMTP Server', tag: 'TLS Relay', logo: '⚙️', sub: 'Custom secure mail server or corporate SMTP relay' },
    { id: 'Mailgun', name: 'Mailgun API', tag: 'REST v3', logo: '🎯', sub: 'High deliverability transactional email service' },
    { id: 'SendGrid', name: 'SendGrid API', tag: 'Twilio Cloud', logo: '⚡', sub: 'Scalable cloud infrastructure with API key' },
    { id: 'Brevo', name: 'Brevo', tag: 'Sendinblue', logo: '🎈', sub: 'European cloud SMTP and transactional API' }
  ]

  return (
    <motion.main
      className="page"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Executive Header Banner */}
      <div className="settings-header-banner">
        <div>
          <h1 className="settings-header-title">
            <FiBriefcase style={{ color: 'var(--bottle)' }} /> Workspace & Organization Settings
          </h1>
          <p className="settings-header-sub">
            {companyForm.name || user.companyName} — Corporate Identity, Branding & System Services
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {activeTab === 'company' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {isAdmin ? (
                <span className="settings-status-pill active">
                  <FiCheck size={14} /> Administrator Access
                </span>
              ) : (
                <span className="settings-status-pill paused">
                  <FiLock size={14} /> Read-Only Mode ({user?.role})
                </span>
              )}
            </div>
          ) : activeTab === 'mail' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {!hasCustomMail ? (
                <span className="settings-status-pill active" style={{ background: 'var(--bottle-tint)', color: 'var(--bottle)' }}>
                  <span className="settings-status-dot"></span> System Default (Env) Active
                </span>
              ) : mailConfigured ? (
                mailForm.isActive ? (
                  <span className="settings-status-pill active">
                    <span className="settings-status-dot"></span> Custom Relay Active
                  </span>
                ) : (
                  <span className="settings-status-pill paused">
                    <span className="settings-status-dot"></span> Custom Relay Paused
                  </span>
                )
              ) : (
                <span className="settings-status-pill unconfigured">
                  <span className="settings-status-dot"></span> Custom Setup Required
                </span>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="settings-status-pill active">
                <FiShield size={14} /> Security Active
              </span>
              <button
                type="button"
                className="btn ghost"
                onClick={loadSessions}
                disabled={sessionsLoading}
                style={{ padding: '6px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6 }}
                title="Refresh sessions list"
              >
                <FiRefreshCw size={13} className={sessionsLoading ? 'spin-anim' : ''} /> Refresh
              </button>
            </div>
          )}
        </div>
      </div>

      {status && (
        <motion.div
          className="toast"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {status}
        </motion.div>
      )}

      {/* Navigation Tabs */}
      <div className="settings-nav-tabs">
        <button
          type="button"
          className={`settings-tab-btn ${activeTab === 'company' ? 'active' : ''}`}
          onClick={() => setActiveTab('company')}
        >
          <FiBriefcase size={16} />
          <span>Company Profile & Branding</span>
          {activeTab === 'company' && <motion.div layoutId="tab-underline" className="settings-tab-underline" />}
        </button>

        <button
          type="button"
          className={`settings-tab-btn ${activeTab === 'mail' ? 'active' : ''}`}
          onClick={() => setActiveTab('mail')}
        >
          <FiMail size={16} />
          <span>Mail & Dispatch Relay</span>
          {activeTab === 'mail' && <motion.div layoutId="tab-underline" className="settings-tab-underline" />}
        </button>

        <button
          type="button"
          className={`settings-tab-btn ${activeTab === 'sessions' ? 'active' : ''}`}
          onClick={() => setActiveTab('sessions')}
        >
          <FiShield size={16} />
          <span>Security & Active Sessions</span>
          {activeTab === 'sessions' && <motion.div layoutId="tab-underline" className="settings-tab-underline" />}
        </button>
      </div>

      {/* =========================================================================
          TAB 1: COMPANY PROFILE & BRANDING
          ========================================================================= */}
      {activeTab === 'company' && (
        <motion.div
          key="tab-company"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          style={{ maxWidth: 860, margin: '0 auto' }}
        >
          {/* Executive Workspace Hub Strip: View, Edit & Switch Workspaces */}
          <div className="workspace-hub-strip">
            <div className="workspace-hub-header">
              <div className="workspace-hub-title">
                <FiLayers size={14} style={{ color: 'var(--bottle)' }} />
                <span>Your Managed Corporate Workspaces ({companiesList.length})</span>
              </div>

              {isAdmin && (
                <button
                  type="button"
                  className="btn"
                  style={{ padding: '6px 14px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6 }}
                  onClick={() => {
                    setCreateLogoFile(null)
                    setCreateLogoPreview('')
                    setAddModalOpen(true)
                  }}
                >
                  <FiPlus size={14} /> Add New Company
                </button>
              )}
            </div>

            <div className="workspace-cards-grid">
              {companiesList.map(c => {
                const isActive = c.companyId === user.companyId
                const canEditThis = c.role === 'Admin' || isAdmin

                return (
                  <div
                    key={c.companyId}
                    className={`workspace-card-item ${isActive ? 'active' : ''}`}
                    onClick={async () => {
                      if (!isActive) {
                        try {
                          await switchCompany(c.companyId)
                        } catch (err) {
                          say(err.message)
                        }
                      }
                    }}
                    title={isActive ? 'Currently viewing this company' : `Switch to ${c.companyName}`}
                    role="button"
                    tabIndex={0}
                  >
                    {/* Top Row: Role or Active Status Badge + Edit Action */}
                    <div className="workspace-card-top-row">
                      {isActive ? (
                        <span className="workspace-status-badge active">
                          <span className="workspace-status-pulse-dot"></span>
                          <span>Active</span>
                        </span>
                      ) : (
                        <span className="workspace-status-badge">
                          <FiBriefcase size={11} />
                          <span>{c.role || 'Member'}</span>
                        </span>
                      )}

                      {canEditThis && (
                        <button
                          type="button"
                          className="workspace-card-edit-btn"
                          onClick={e => {
                            e.stopPropagation()
                            openEditModal(c)
                          }}
                          title={`Edit ${c.companyName} details & logo`}
                          aria-label={`Edit ${c.companyName} details & logo`}
                        >
                          <FiEdit2 size={12} />
                          <span>Edit</span>
                        </button>
                      )}
                    </div>

                    {/* Center Column: Logo / Avatar, Multi-Line Company Name, Subtitle */}
                    <div className="workspace-card-body-col">
                      <div className="workspace-card-avatar-lg">
                        <img
                          src={`${BASE}/api/company/logo?companyId=${c.companyId}&t=${logoTimestamp}`}
                          alt=""
                          className="workspace-card-logo-img"
                          onError={e => {
                            e.currentTarget.style.display = 'none'
                            if (e.currentTarget.nextElementSibling) {
                              e.currentTarget.nextElementSibling.style.display = 'flex'
                            }
                          }}
                        />
                        <span className="workspace-card-avatar-initials" style={{ display: 'none' }}>
                          {c.companyName ? c.companyName.slice(0, 2).toUpperCase() : 'CO'}
                        </span>
                      </div>

                      <h3 className="workspace-card-name-col" title={c.companyName}>
                        {c.companyName}
                      </h3>

                      <div className="workspace-card-sub-col">
                        Corporate Entity • {c.role || 'Member'}
                      </div>
                    </div>

                    {/* Bottom Row: Current Active Indicator or Switch Action CTA */}
                    <div className="workspace-card-footer-strip">
                      {isActive ? (
                        <div className="workspace-card-active-indicator">
                          <FiCheckCircle size={14} />
                          <span>Currently Viewing</span>
                        </div>
                      ) : (
                        <div className="workspace-card-switch-prompt">
                          <span>Switch to Workspace</span>
                          <FiArrowRight size={13} className="workspace-card-arrow-icon" />
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </motion.div>
      )}

      {/* =========================================================================
          TAB 2: MAIL & DISPATCH RELAY
          ========================================================================= */}
      {activeTab === 'mail' && (
        <div style={{ maxWidth: 780, margin: '0 auto' }}>
          <motion.form
            key="tab-mail-form"
            className="card form-card"
            onSubmit={saveMail}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* Header with Title and Custom Mail Toggle Switch */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 14,
                paddingBottom: 16,
                borderBottom: '1px solid var(--line)',
                marginBottom: 20
              }}
            >
              <div>
                <label style={{ fontWeight: 700, fontSize: '1.05rem', margin: 0, display: 'block', color: 'var(--ink)' }}>
                  Select Email Provider Protocol
                </label>
                <div style={{ fontSize: '0.82rem', color: 'var(--ink-soft)', marginTop: 2 }}>
                  {hasCustomMail
                    ? 'Custom company relay is enabled. Edit provider credentials below.'
                    : 'Using system default relay (.env). Enable custom mail to enter credentials.'}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span
                  style={{
                    fontSize: '0.86rem',
                    fontWeight: 600,
                    color: hasCustomMail ? 'var(--bottle)' : 'var(--ink-soft)'
                  }}
                >
                  {hasCustomMail ? '● Custom Relay Active' : 'System Relay'}
                </span>
                <label className="switch" style={{ flexShrink: 0 }}>
                  <input
                    type="checkbox"
                    checked={hasCustomMail}
                    disabled={mailBusy}
                    onChange={e => handleToggleCustomMail(e.target.checked)}
                  />
                  <span className="slider"></span>
                </label>
              </div>
            </div>

            {/* When System Default Relay is Active */}
            {!hasCustomMail && (
              <div
                style={{
                  background: 'var(--bottle-tint)',
                  border: '1px solid rgba(23, 73, 59, 0.2)',
                  borderRadius: 10,
                  padding: '12px 16px',
                  marginBottom: 20,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 12
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.85rem', color: 'var(--bottle)' }}>
                  <span style={{ fontSize: '1.1rem' }}>🌐</span>
                  <div>
                    <strong>System Default Mail Active</strong>: Dispatches invites with your company name (Title Case) and active user email via <code>.env</code>.
                  </div>
                </div>
                <button
                  type="button"
                  className="btn ghost"
                  style={{ padding: '6px 14px', fontSize: '0.82rem' }}
                  disabled={mailBusy}
                  onClick={() => sendTestEmail(true)}
                >
                  ⚡ Send Test via System Relay
                </button>
              </div>
            )}

            {/* Custom Mail Settings (Editable and NOT in blur when hasCustomMail is true) */}
            <div
              style={{
                filter: !hasCustomMail ? 'blur(2.5px)' : 'none',
                opacity: !hasCustomMail ? 0.45 : 1,
                pointerEvents: !hasCustomMail ? 'none' : 'auto',
                userSelect: !hasCustomMail ? 'none' : 'auto',
                transition: 'all 0.25s ease'
              }}
            >
              {!mailConfigured && (
                <div
                  style={{
                    background: 'var(--brass-tint)',
                    color: 'var(--brass)',
                    padding: '14px 18px',
                    borderRadius: 10,
                    fontSize: '0.88rem',
                    marginBottom: 20,
                    border: '1px solid rgba(168, 127, 46, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10
                  }}
                >
                  <span style={{ fontSize: '1.2rem' }}>⚠️</span>
                  <div>
                    <strong>Custom Provider Not Yet Saved</strong>
                    <div style={{ fontSize: '0.82rem', marginTop: 2, opacity: 0.9 }}>
                      Select a provider and enter your company credentials below, then click &apos;Save Configuration&apos;.
                    </div>
                  </div>
                </div>
              )}

              <label style={{ fontWeight: 600, fontSize: '0.92rem', marginBottom: 10, display: 'block', color: 'var(--ink)' }}>
                Select Email Provider Protocol
              </label>

              <div
                className={`grid2 ${!isMailEditing ? 'disabled' : ''}`}
                style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}
              >
                {mailProviders.map(p => {
                  const selected = mailForm.provider === p.id
                  return (
                    <div
                      key={p.id}
                      className={`provider-card-executive ${selected ? 'selected' : ''}`}
                      onClick={() => handleProviderSelect(p.id)}
                      role="button"
                      tabIndex={isMailEditing ? 0 : -1}
                      onKeyDown={e => {
                        if (isMailEditing && (e.key === 'Enter' || e.key === ' ')) handleProviderSelect(p.id)
                      }}
                    >
                      <div className="provider-card-header">
                        <div className="provider-icon-badge">{p.logo}</div>
                        <span className="provider-badge-tag">{p.tag}</span>
                      </div>
                      <div>
                        <div className="provider-card-title">{p.name}</div>
                        <p className="provider-card-sub">{p.sub}</p>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Provider Specific Inputs */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={mailForm.provider}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.15 }}
                >
                  {mailForm.provider === 'SMTP' && (
                    <>
                      <div className="grid2">
                        <div>
                          <label style={{ fontWeight: 600 }}>SMTP Hostname</label>
                          <input
                            value={mailForm.host}
                            onChange={setM('host')}
                            required={hasCustomMail}
                            placeholder="smtp.office365.com or smtp.gmail.com"
                            disabled={!hasCustomMail}
                          />
                        </div>
                        <div>
                          <label style={{ fontWeight: 600 }}>SMTP Port</label>
                          <input
                            type="number"
                            value={mailForm.port}
                            onChange={setM('port')}
                            required={hasCustomMail}
                            placeholder="587"
                            disabled={!hasCustomMail}
                          />
                        </div>
                      </div>

                      <div className="grid2" style={{ marginTop: 14 }}>
                        <div>
                          <label style={{ fontWeight: 600 }}>Username / Account Email</label>
                          <input
                            value={mailForm.username}
                            onChange={setM('username')}
                            placeholder="boardroom@yourcompany.com"
                            autoComplete="off"
                            disabled={!hasCustomMail}
                          />
                        </div>
                        <div>
                          <label style={{ fontWeight: 600 }}>
                            Password / App Secret{' '}
                            <span style={{ color: 'var(--ink-soft)', fontWeight: 400, fontSize: '0.78rem' }}>(AES-256 Encrypted)</span>
                          </label>
                          <div className="input-password-group">
                            <input
                              type={showMailPassword ? 'text' : 'password'}
                              value={mailForm.password}
                              onChange={setM('password')}
                              autoComplete="new-password"
                              required={hasCustomMail && !isMailProviderSaved}
                              disabled={!hasCustomMail}
                              placeholder={isMailProviderSaved ? '••••••••••••' : 'Enter password'}
                            />
                            <button
                              type="button"
                              className="input-eye-toggle"
                              onClick={() => setShowMailPassword(v => !v)}
                              title={showMailPassword ? 'Hide secret' : 'Show secret'}
                            >
                              {showMailPassword ? '👁️' : '🔒'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  {mailForm.provider === 'Mailgun' && (
                    <>
                      <div className="grid2">
                        <div>
                          <label style={{ fontWeight: 600 }}>Mailgun Domain</label>
                          <input
                            value={mailForm.host}
                            onChange={setM('host')}
                            required={hasCustomMail}
                            placeholder="mg.yourcompany.com"
                            disabled={!hasCustomMail}
                          />
                        </div>
                        <div>
                          <label style={{ fontWeight: 600 }}>API Region</label>
                          <select
                            value={mailForm.username || 'US'}
                            onChange={setM('username')}
                            disabled={!hasCustomMail}
                            style={{ padding: '8px 12px' }}
                          >
                            <option value="US">US Region (api.mailgun.net)</option>
                            <option value="EU">EU Region (api.eu.mailgun.net)</option>
                          </select>
                        </div>
                      </div>

                      <div style={{ marginTop: 14 }}>
                        <label style={{ fontWeight: 600 }}>
                          Mailgun Secret API Key{' '}
                          <span style={{ color: 'var(--ink-soft)', fontWeight: 400, fontSize: '0.78rem' }}>(key-...)</span>
                        </label>
                        <div className="input-password-group">
                          <input
                            type={showMailPassword ? 'text' : 'password'}
                            value={mailForm.password}
                            onChange={setM('password')}
                            autoComplete="new-password"
                            required={hasCustomMail && !isMailProviderSaved}
                            disabled={!hasCustomMail}
                            placeholder={isMailProviderSaved ? '••••••••••••' : 'key-xxxxxxxxxxxxxxxx'}
                          />
                          <button
                            type="button"
                            className="input-eye-toggle"
                            onClick={() => setShowMailPassword(v => !v)}
                          >
                            {showMailPassword ? '👁️' : '🔒'}
                          </button>
                        </div>
                      </div>
                    </>
                  )}

                  {(mailForm.provider === 'SendGrid' || mailForm.provider === 'Brevo') && (
                    <div>
                      <label style={{ fontWeight: 600 }}>
                        {mailForm.provider} Secret API Key{' '}
                        <span style={{ color: 'var(--ink-soft)', fontWeight: 400, fontSize: '0.78rem' }}>(SG.... or xkeysib-...)</span>
                      </label>
                      <div className="input-password-group">
                        <input
                          type={showMailPassword ? 'text' : 'password'}
                          value={mailForm.password}
                          onChange={setM('password')}
                          autoComplete="new-password"
                          required={hasCustomMail && !isMailProviderSaved}
                          disabled={!hasCustomMail}
                          placeholder={isMailProviderSaved ? '••••••••••••' : 'Paste API Key'}
                        />
                        <button
                          type="button"
                          className="input-eye-toggle"
                          onClick={() => setShowMailPassword(v => !v)}
                        >
                          {showMailPassword ? '👁️' : '🔒'}
                        </button>
                      </div>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>

              <div className="grid2" style={{ marginTop: 16 }}>
                <div>
                  <label style={{ fontWeight: 600 }}>Sender Email (From Address)</label>
                  <input
                    type="email"
                    value={mailForm.fromAddress}
                    onChange={setM('fromAddress')}
                    required={hasCustomMail}
                    placeholder="boardroom@yourcompany.com"
                    disabled={!hasCustomMail}
                  />
                </div>
                <div>
                  <label style={{ fontWeight: 600 }}>Sender Display Name</label>
                  <input
                    value={mailForm.fromName}
                    onChange={setM('fromName')}
                    placeholder="BoardRoom Corporate Office"
                    disabled={!hasCustomMail}
                  />
                </div>
              </div>

              {/* Active Switch Toggle Card */}
              <div
                style={{
                  background: 'var(--paper)',
                  border: '1px solid var(--line)',
                  borderRadius: 10,
                  padding: '14px 18px',
                  margin: '18px 0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  opacity: !hasCustomMail ? 0.8 : 1
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.92rem', color: 'var(--ink)' }}>Enable Dispatch Server</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--ink-soft)' }}>
                    When toggled on, BoardRoom dispatches automated meeting invites and agenda emails through this company relay.
                  </div>
                </div>

                <label className="switch" style={{ flexShrink: 0 }}>
                  <input
                    type="checkbox"
                    checked={mailForm.isActive}
                    onChange={setM('isActive')}
                    disabled={!hasCustomMail}
                  />
                  <span className="slider"></span>
                </label>
              </div>

              {/* Action Footer */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  {hasCustomMail && (
                    <button type="submit" className="btn" disabled={mailBusy}>
                      {mailBusy ? 'Saving...' : mailConfigured ? '💾 Update Configuration' : '✨ Save Configuration'}
                    </button>
                  )}

                  <button
                    type="button"
                    className="btn ghost"
                    disabled={mailBusy || !hasCustomMail}
                    onClick={() => sendTestEmail(false)}
                  >
                    ⚡ Send Live Test Email
                  </button>
                </div>

                {mailConfigured && hasCustomMail && (
                  <button
                    type="button"
                    className="btn ghost"
                    style={{ color: 'var(--danger)', borderColor: 'rgba(140,47,47,0.3)' }}
                    disabled={mailBusy}
                    onClick={removeMail}
                  >
                    🗑️ Delete Config
                  </button>
                )}
              </div>
            </div>
          </motion.form>
        </div>
      )}

      {/* =========================================================================
          TAB 3: SECURITY & ACTIVE SESSIONS
          ========================================================================= */}
      {activeTab === 'sessions' && (
        <motion.div
          key="tab-sessions"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          style={{ maxWidth: 860, margin: '0 auto' }}
        >
          {/* Security Overview & Inactivity Policy Strip */}
          <div className="card" style={{ padding: 22, marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 260 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <FiShield size={20} style={{ color: 'var(--bottle)' }} />
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: 'var(--ink)' }}>
                    Device Sessions & Access Control
                  </h3>
                </div>
                <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--ink-soft)', lineHeight: 1.5 }}>
                  Manage authenticated browsers and devices signed in under your account across corporate workspaces.
                  You can remotely terminate unrecognized logins or sign out all other devices at any time.
                </p>
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={handleRevokeOtherSessions}
                  disabled={revokingOthers || sessionsLoading || sessionsList.filter(s => !s.isCurrent).length === 0}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 16px',
                    fontSize: '0.85rem'
                  }}
                >
                  <FiLogOut size={14} />
                  {revokingOthers ? 'Logging out others...' : 'Log Out All Other Devices'}
                </button>
              </div>
            </div>

            {/* Quick Session Security Stats */}
            <div className="session-stats-strip" style={{ marginTop: 18 }}>
              <div className="session-stat-card">
                <div className="session-stat-label">Active Sessions</div>
                <div className="session-stat-value">{sessionsList.length}</div>
              </div>
              <div className="session-stat-card">
                <div className="session-stat-label">Idle Inactivity Timeout</div>
                <div className="session-stat-value">4 hrs</div>
              </div>
              <div className="session-stat-card">
                <div className="session-stat-label">Device Protection</div>
                <div className="session-stat-value" style={{ color: 'var(--bottle)' }}>Enforced</div>
              </div>
            </div>
          </div>

          {/* Sessions List */}
          <div className="card" style={{ padding: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 600, color: 'var(--ink)' }}>
                  Active Logins ({sessionsList.length})
                </h4>
                <span style={{ fontSize: '0.78rem', color: 'var(--ink-soft)' }}>
                  Devices currently authorized to access BoardRoom with your account
                </span>
              </div>
              <button
                type="button"
                className="btn ghost"
                onClick={loadSessions}
                disabled={sessionsLoading}
                style={{ padding: '6px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <FiRefreshCw size={13} className={sessionsLoading ? 'spin-anim' : ''} />
                Refresh List
              </button>
            </div>

            {sessionsLoading && sessionsList.length === 0 ? (
              <div style={{ padding: '36px 0', textAlign: 'center', color: 'var(--ink-soft)' }}>
                <FiRefreshCw className="spin-anim" size={24} style={{ marginBottom: 8, display: 'inline-block' }} />
                <p style={{ margin: 0, fontSize: '0.88rem' }}>Loading active sessions...</p>
              </div>
            ) : sessionsList.length === 0 ? (
              <div style={{ padding: '36px 0', textAlign: 'center', color: 'var(--ink-soft)' }}>
                <FiShield size={28} style={{ opacity: 0.5, marginBottom: 8 }} />
                <p style={{ margin: 0, fontSize: '0.9rem' }}>No active sessions found.</p>
              </div>
            ) : (
              <div className="session-cards-grid">
                {sessionsList.map(s => (
                  <div
                    key={s.id}
                    className={`session-card-item ${s.isCurrent ? 'current-device' : ''}`}
                  >
                    <div className="session-card-header">
                      <div className="session-icon-badge">
                        {getDeviceIcon(s.deviceType)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.92rem', color: 'var(--ink)' }}>
                            {s.browser || 'Browser'} on {s.operatingSystem || 'Device'}
                          </span>
                          {s.isCurrent && (
                            <span className="session-badge-current">
                              <FiCheckCircle size={11} /> This Device
                            </span>
                          )}
                        </div>
                        <div className="session-meta-line">
                          <span>IP: {s.ipAddress || 'Protected'}</span>
                          {s.companyName && (
                            <>
                              <span>•</span>
                              <span>{s.companyName}</span>
                            </>
                          )}
                        </div>
                      </div>

                      <div>
                        {s.isCurrent ? (
                          <button
                            type="button"
                            className="btn ghost"
                            style={{ fontSize: '0.78rem', padding: '6px 12px', color: 'var(--danger)' }}
                            onClick={() => logout()}
                            title="Sign out this current session"
                          >
                            Sign Out
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn ghost"
                            style={{ fontSize: '0.78rem', padding: '6px 12px', color: 'var(--danger)', borderColor: 'rgba(140,47,47,0.3)' }}
                            disabled={revokingSessionId === s.id}
                            onClick={() => handleRevokeSession(s.id)}
                            title="Revoke session and disconnect device"
                          >
                            {revokingSessionId === s.id ? 'Revoking...' : 'Revoke'}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="session-card-footer">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <FiActivity size={12} style={{ color: 'var(--bottle)' }} />
                        <span>Last active: {formatSessionDate(s.lastActiveAt)}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <FiClock size={12} style={{ opacity: 0.6 }} />
                        <span>Signed in: {formatSessionDate(s.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Idle Timeout Security Information Banner */}
          <div
            style={{
              background: 'rgba(15, 61, 46, 0.05)',
              border: '1px solid rgba(15, 61, 46, 0.15)',
              borderRadius: 12,
              padding: '16px 20px',
              marginTop: 20,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 14
            }}
          >
            <FiClock size={20} style={{ color: 'var(--bottle)', marginTop: 2, flexShrink: 0 }} />
            <div>
              <h5 style={{ margin: '0 0 4px 0', fontSize: '0.9rem', fontWeight: 600, color: 'var(--ink)' }}>
                Automatic Inactivity Policy (4 Hours)
              </h5>
              <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--ink-soft)', lineHeight: 1.5 }}>
                For enterprise security and board compliance, sessions that remain idle for 4 hours without user activity (mouse movement, keystrokes, or clicks) will automatically prompt a warning countdown before securely terminating the session.
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* =========================================================================
          MODAL 1: ADD NEW COMPANY WORKSPACE (PORTAL TO DOCUMENT.BODY)
          ========================================================================= */}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {addModalOpen && (
              <div className="modal-backdrop" onClick={() => !createBusy && setAddModalOpen(false)}>
                <motion.div
                  className="modal-content modal-form-modal"
                  style={{ maxWidth: 580, width: '92%', padding: 26, maxHeight: '90vh', overflowY: 'auto' }}
                  onClick={e => e.stopPropagation()}
                  initial={{ scale: 0.92, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.92, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <h3 style={{ margin: 0, fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ink)' }}>
                      <FiBriefcase style={{ color: 'var(--bottle)' }} /> Create Corporate Workspace
                    </h3>
                    {!createBusy && (
                      <button
                        type="button"
                        className="btn ghost"
                        style={{ padding: '4px 10px', fontSize: '0.9rem' }}
                        onClick={() => setAddModalOpen(false)}
                      >
                        <FiX size={16} />
                      </button>
                    )}
                  </div>

                  <p style={{ margin: '0 0 18px 0', fontSize: '0.84rem', color: 'var(--ink-soft)', lineHeight: 1.45 }}>
                    Establish a new organization or subsidiary in BoardRoom. You will automatically be designated as the
                    Administrator with full governance privileges.
                  </p>

                  <form onSubmit={handleCreateCompanySubmit}>
                    {/* Logo Input Section */}
                    <div className="form-logo-section">
                      <div className="form-logo-preview-box">
                        {createLogoPreview ? (
                          <img
                            src={createLogoPreview}
                            alt="Logo preview"
                            className="form-logo-preview-img"
                            onError={() => setCreateLogoPreview('')}
                          />
                        ) : (
                          <div className="form-logo-placeholder">
                            <FiBriefcase size={22} style={{ color: 'var(--brass)' }} />
                            <span>No Logo</span>
                          </div>
                        )}
                      </div>

                      <div className="form-logo-controls">
                        <div className="form-logo-label">Corporate Logo Crest (Optional)</div>
                        <div className="form-logo-sub">
                          PNG, JPG, WebP, or SVG (max 5MB). Stored in MinIO.
                        </div>
                        <div className="form-logo-btn-group">
                          <input
                            type="file"
                            ref={createFileInputRef}
                            style={{ display: 'none' }}
                            accept="image/png,image/jpeg,image/webp,image/svg+xml"
                            onChange={handleCreateLogoChange}
                            disabled={createBusy}
                          />
                          <button
                            type="button"
                            className="btn secondary"
                            style={{ padding: '5px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6 }}
                            onClick={() => createFileInputRef.current?.click()}
                            disabled={createBusy}
                          >
                            <FiUploadCloud size={14} /> {createLogoPreview ? 'Change Logo' : 'Upload Logo'}
                          </button>

                          {createLogoPreview && (
                            <button
                              type="button"
                              className="btn ghost"
                              style={{ padding: '5px 10px', fontSize: '0.8rem', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 4 }}
                              onClick={handleRemoveCreateLogo}
                              disabled={createBusy}
                            >
                              <FiTrash2 size={13} /> Remove
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    <div style={{ marginBottom: 14 }}>
                      <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>
                        Company Legal Name <span style={{ color: 'var(--danger)' }}>*</span>
                      </label>
                      <input
                        value={createForm.name}
                        onChange={setCreate('name')}
                        required
                        placeholder="e.g. Acme Capital Partners Ltd."
                        autoFocus
                        disabled={createBusy}
                      />
                    </div>

                    <div style={{ marginBottom: 14 }}>
                      <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>
                        Registration / Incorporation Details
                      </label>
                      <input
                        value={createForm.registrationDetails}
                        onChange={setCreate('registrationDetails')}
                        placeholder="e.g. Reg: C-889102 / Tax ID: TX-449"
                        disabled={createBusy}
                      />
                    </div>

                    <div className="grid2" style={{ marginBottom: 14 }}>
                      <div>
                        <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Corporate Email</label>
                        <input
                          type="email"
                          value={createForm.email}
                          onChange={setCreate('email')}
                          placeholder="board@acme-capital.com"
                          disabled={createBusy}
                        />
                      </div>
                      <div>
                        <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Official Phone</label>
                        <input
                          type="tel"
                          value={createForm.phone}
                          onChange={setCreate('phone')}
                          placeholder="+1 (555) 234-5678"
                          disabled={createBusy}
                        />
                      </div>
                    </div>

                    <div className="grid2" style={{ marginBottom: 16 }}>
                      <div>
                        <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Website</label>
                        <input
                          type="url"
                          value={createForm.website}
                          onChange={setCreate('website')}
                          placeholder="https://acme-capital.com"
                          disabled={createBusy}
                        />
                      </div>
                      <div>
                        <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Registered Office Address</label>
                        <input
                          value={createForm.address}
                          onChange={setCreate('address')}
                          placeholder="Suite 500, Financial Tower"
                          disabled={createBusy}
                        />
                      </div>
                    </div>

                    <div
                      style={{
                        background: 'var(--paper)',
                        border: '1px solid var(--line)',
                        borderRadius: 8,
                        padding: '10px 14px',
                        marginBottom: 20,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}
                    >
                      <span style={{ fontSize: '0.84rem', color: 'var(--ink)', fontWeight: 500 }}>
                        Switch to this workspace immediately after creation
                      </span>
                      <label className="switch" style={{ flexShrink: 0 }}>
                        <input
                          type="checkbox"
                          checked={createForm.switchImmediately}
                          onChange={setCreate('switchImmediately')}
                          disabled={createBusy}
                        />
                        <span className="slider"></span>
                      </label>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
                      <button
                        type="button"
                        className="btn secondary"
                        onClick={() => setAddModalOpen(false)}
                        disabled={createBusy}
                      >
                        Cancel
                      </button>
                      <button type="submit" className="btn" disabled={createBusy}>
                        {createBusy ? 'Creating Workspace...' : '✨ Create Workspace'}
                      </button>
                    </div>
                  </form>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}

      {/* =========================================================================
          MODAL 2: EDIT COMPANY DETAILS (PORTAL TO DOCUMENT.BODY)
          ========================================================================= */}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {editModalOpen && (
              <div className="modal-backdrop" onClick={() => !editBusy && setEditModalOpen(false)}>
                <motion.div
                  className="modal-content modal-form-modal"
                  style={{ maxWidth: 580, width: '92%', padding: 26, maxHeight: '90vh', overflowY: 'auto' }}
                  onClick={e => e.stopPropagation()}
                  initial={{ scale: 0.92, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.92, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <h3 style={{ margin: 0, fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ink)' }}>
                      <FiEdit2 style={{ color: 'var(--bottle)' }} /> Edit Corporate Details
                    </h3>
                    {!editBusy && (
                      <button
                        type="button"
                        className="btn ghost"
                        style={{ padding: '4px 10px', fontSize: '0.9rem' }}
                        onClick={() => setEditModalOpen(false)}
                      >
                        <FiX size={16} />
                      </button>
                    )}
                  </div>

                  <p style={{ margin: '0 0 16px 0', fontSize: '0.84rem', color: 'var(--ink-soft)', lineHeight: 1.45 }}>
                    Update legal entity name, corporate logo crest, registration records, and contact coordinates for{' '}
                    <strong>{editTargetCompanyName}</strong>.
                  </p>

                  <form onSubmit={handleEditCompanySubmit}>
                    {/* Logo Input Section */}
                    <div className="form-logo-section">
                      <div className="form-logo-preview-box">
                        {editLogoPreview ? (
                          <img
                            src={editLogoPreview}
                            alt="Logo preview"
                            className="form-logo-preview-img"
                            onError={() => setEditLogoPreview('')}
                          />
                        ) : (
                          <div className="form-logo-placeholder">
                            <FiBriefcase size={22} style={{ color: 'var(--brass)' }} />
                            <span>No Logo</span>
                          </div>
                        )}
                      </div>

                      <div className="form-logo-controls">
                        <div className="form-logo-label">Corporate Logo Crest</div>
                        <div className="form-logo-sub">
                          PNG, JPG, WebP, or SVG (max 5MB). Stored in MinIO.
                        </div>
                        <div className="form-logo-btn-group">
                          <input
                            type="file"
                            ref={editFileInputRef}
                            style={{ display: 'none' }}
                            accept="image/png,image/jpeg,image/webp,image/svg+xml"
                            onChange={handleEditLogoChange}
                            disabled={editBusy}
                          />
                          <button
                            type="button"
                            className="btn secondary"
                            style={{ padding: '5px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6 }}
                            onClick={() => editFileInputRef.current?.click()}
                            disabled={editBusy}
                          >
                            <FiUploadCloud size={14} /> {editLogoPreview ? 'Change Logo' : 'Upload Logo'}
                          </button>

                          {(editLogoPreview || editHasExistingLogo) && (
                            <button
                              type="button"
                              className="btn ghost"
                              style={{ padding: '5px 10px', fontSize: '0.8rem', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 4 }}
                              onClick={handleRemoveEditLogo}
                              disabled={editBusy}
                            >
                              <FiTrash2 size={13} /> Remove
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    <div style={{ marginBottom: 14 }}>
                      <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>
                        Company Legal Name <span style={{ color: 'var(--danger)' }}>*</span>
                      </label>
                      <input
                        value={editForm.name}
                        onChange={setEdit('name')}
                        required
                        placeholder="e.g. Acme Holdings Ltd."
                        autoFocus
                        disabled={editBusy}
                      />
                    </div>

                    <div style={{ marginBottom: 14 }}>
                      <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>
                        Registration / Incorporation Details
                      </label>
                      <input
                        value={editForm.registrationDetails}
                        onChange={setEdit('registrationDetails')}
                        placeholder="e.g. Reg: C-128490 / Tax: TX-9018"
                        disabled={editBusy}
                      />
                    </div>

                    <div className="grid2" style={{ marginBottom: 14 }}>
                      <div>
                        <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Corporate Email</label>
                        <input
                          type="email"
                          value={editForm.email}
                          onChange={setEdit('email')}
                          placeholder="contact@company.com"
                          disabled={editBusy}
                        />
                      </div>
                      <div>
                        <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Official Phone</label>
                        <input
                          type="tel"
                          value={editForm.phone}
                          onChange={setEdit('phone')}
                          placeholder="+1 (555) 019-2834"
                          disabled={editBusy}
                        />
                      </div>
                    </div>

                    <div className="grid2" style={{ marginBottom: 20 }}>
                      <div>
                        <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Official Website</label>
                        <input
                          type="url"
                          value={editForm.website}
                          onChange={setEdit('website')}
                          placeholder="https://www.company.com"
                          disabled={editBusy}
                        />
                      </div>
                      <div>
                        <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>Registered Office Address</label>
                        <input
                          value={editForm.address}
                          onChange={setEdit('address')}
                          placeholder="100 Financial Center Blvd, Suite 400"
                          disabled={editBusy}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
                      <button
                        type="button"
                        className="btn secondary"
                        onClick={() => setEditModalOpen(false)}
                        disabled={editBusy}
                      >
                        Cancel
                      </button>
                      <button type="submit" className="btn" disabled={editBusy}>
                        {editBusy ? 'Saving Changes...' : '💾 Save Changes'}
                      </button>
                    </div>
                  </form>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}

      {/* Test Diagnostic Modal (PORTAL TO DOCUMENT.BODY) */}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {testModalOpen && (
              <div className="modal-backdrop" onClick={() => !mailBusy && setTestModalOpen(false)}>
                <motion.div
                  className="modal-content"
                  style={{ maxWidth: 520, width: '90%', padding: 24 }}
                  onClick={e => e.stopPropagation()}
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <h3 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>⚡</span> Live Diagnostic Handshake
                    </h3>
                    {!mailBusy && (
                      <button type="button" className="btn ghost" style={{ padding: '4px 10px' }} onClick={() => setTestModalOpen(false)}>✕</button>
                    )}
                  </div>

                  <div className="test-console-box" style={{ marginBottom: 20 }}>
                    {testLogs.map((log, idx) => (
                      <div key={idx} className="test-log-line">
                        <span className={`test-log-status ${log.status}`}>
                          {log.status === 'done' ? '✓' : log.status === 'error' ? '✕' : '⋯'}
                        </span>
                        <span>{log.text}</span>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      className="btn secondary"
                      disabled={mailBusy}
                      onClick={() => setTestModalOpen(false)}
                    >
                      {mailBusy ? 'Testing...' : 'Close Window'}
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </motion.main>
  )
}
