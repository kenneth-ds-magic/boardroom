export const BASE = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')

let auth = JSON.parse(sessionStorage.getItem('boardroom.auth') || 'null')

export function getUser() { return auth?.user || null }
export function getCompanies() { return auth?.companies || [] }
export function getSessionId() { return auth?.sessionId || null }

export async function logout(skipServer = false) {
  if (!skipServer && auth?.token) {
    try {
      await fetch(`${BASE}/api/auth/logout`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${auth.token}`,
          'Content-Type': 'application/json'
        }
      }).catch(() => {})
    } catch {}
  }
  auth = null
  sessionStorage.removeItem('boardroom.auth')
}

function persist() { sessionStorage.setItem('boardroom.auth', JSON.stringify(auth)) }

/** Step 1: verify credentials. Returns { user, companies, selectToken } — no workspace JWT yet. */
export async function login(email, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  })
  if (!res.ok) throw new Error((await res.json()).error || 'Sign-in failed')
  return res.json()
}

/** Step 2: exchange the credential proof for a workspace JWT bound to one company. */
export async function selectWorkspace(pending, companyId) {
  const res = await fetch(`${BASE}/api/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pending.selectToken || auth?.token}` },
    body: JSON.stringify({ userId: pending.user.id, companyId })
  })
  if (!res.ok) throw new Error((await res.json()).error || 'Could not enter workspace')
  const data = await res.json()
  auth = { token: data.token, user: data.user, companies: pending.companies, sessionId: data.sessionId }
  persist()
  return data.user
}

/** Header switcher: swap to another company without signing out, then reload state. */
export async function switchCompany(companyId) {
  if (!auth) return
  const res = await fetch(`${BASE}/api/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
    body: JSON.stringify({ userId: auth.user.id, companyId })
  })
  if (!res.ok) throw new Error((await res.json()).error || 'Could not switch workspace')
  const data = await res.json()
  auth = { ...auth, token: data.token, user: data.user, sessionId: data.sessionId || auth.sessionId }
  persist()
  const path = window.location.pathname
  if (path.includes('/meetings/')) {
    window.location.href = `${BASE}/`
  } else {
    window.location.reload()
  }
}

export async function api(path, options = {}) {
  const isPostOrPut = options.method === 'POST' || options.method === 'PUT'
  const headers = {
    ...(isPostOrPut ? { 'Content-Type': 'application/json' } : {}),
    ...(auth ? { Authorization: `Bearer ${auth.token}` } : {}),
    ...options.headers
  }
  const body = options.body !== undefined ? options.body : (isPostOrPut ? '{}' : undefined)
  const res = await fetch(`${BASE}/api${path}`, {
    ...options,
    headers,
    body
  })
  if (res.status === 401) {
    let errJson = {}
    try { errJson = await res.json() } catch {}
    await logout(true)
    const errText = errJson?.error || ''
    const reason = errText.includes('revoked') ? 'revoked' : (errText.includes('expired') ? 'expired' : 'unauthorized')
    window.location.href = `${BASE}/login?reason=${reason}`
    return
  }
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Request failed (${res.status})`)
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

/** List active authenticated device sessions */
export async function getSessions() {
  return api('/auth/sessions')
}

/** Revoke a specific device session */
export async function revokeSession(sessionId) {
  return api(`/auth/sessions/${sessionId}/revoke`, { method: 'POST' })
}

/** Revoke all other device sessions */
export async function revokeOtherSessions() {
  return api('/auth/sessions/revoke-others', { method: 'POST' })
}

/** Authenticated paper download: fetch as blob with the JWT header, then trigger save. */
export async function downloadPaper(paperId, fileName) {
  const res = await fetch(`${BASE}/api/papers/${paperId}/download`, {
    headers: { Authorization: `Bearer ${auth.token}` }
  })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Download failed')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName || 'paper'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

const CHUNK = 5 * 1024 * 1024 // 5 MB

/** Chunked upload: start session, PUT chunks, complete. onProgress(0..1). */
export async function uploadPaper(file, { meetingId, paperId, agendaItemId, title }, onProgress) {
  const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK))
  const { sessionId } = await api('/papers/uploads/start', {
    method: 'POST',
    body: JSON.stringify({ fileName: file.name, totalSizeBytes: file.size, totalChunks })
  })
  for (let i = 0; i < totalChunks; i++) {
    const blob = file.slice(i * CHUNK, Math.min(file.size, (i + 1) * CHUNK))
    const res = await fetch(`${BASE}/api/papers/uploads/${sessionId}/chunks/${i}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/octet-stream' },
      body: blob
    })
    if (!res.ok) throw new Error(`Chunk ${i + 1}/${totalChunks} failed`)
    onProgress?.((i + 1) / totalChunks)
  }
  return api('/papers/uploads/complete', {
    method: 'POST',
    body: JSON.stringify({ sessionId, meetingId, paperId, agendaItemId, title })
  })
}

/** Upload rendered minutes PDF blob temporarily before finalization. */
export async function uploadTempMinutesPdf(meetingId, pdfBlob) {
  if (!auth?.token) throw new Error('Not authenticated')
  const formData = new FormData()
  formData.append('file', pdfBlob, `Minutes_${meetingId}.pdf`)
  const res = await fetch(`${BASE}/api/meetings/${meetingId}/minutes/temp-pdf`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${auth.token}` },
    body: formData
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    let errJson = {}
    try { errJson = JSON.parse(errText) } catch {}
    throw new Error(errJson.error || errText || `Upload temp PDF failed (${res.status})`)
  }
}

/** Get active company details & branding info (or for a specified company). */
export async function getCompany(companyId) {
  return api(companyId ? `/company?companyId=${companyId}` : '/company')
}

/** Toggle between company custom mail relay and system default mail relay (Environment variables) */
export async function toggleCustomMail(hasCustomMail) {
  return api('/mail-settings/toggle-custom', {
    method: 'POST',
    body: JSON.stringify({ hasCustomMail })
  })
}


/** Update active company details (Admin only). */
export async function updateCompany(data) {
  return api('/company', {
    method: 'PUT',
    body: JSON.stringify(data)
  })
}

/** Create a new company workspace (Admin only). */
export async function createCompany(data) {
  const res = await api('/company', {
    method: 'POST',
    body: JSON.stringify(data)
  })
  if (res.companies && auth) {
    auth = { ...auth, companies: res.companies }
    persist()
  }
  return res
}


/** Upload company logo to MinIO object storage (Admin only). */
export async function uploadCompanyLogo(file, companyId) {
  if (!auth?.token) throw new Error('Not authenticated')
  const formData = new FormData()
  formData.append('file', file)
  const q = companyId ? `?companyId=${encodeURIComponent(companyId)}` : ''
  const res = await fetch(`${BASE}/api/company/logo${q}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${auth.token}` },
    body: formData
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    let errJson = {}
    try { errJson = JSON.parse(errText) } catch {}
    throw new Error(errJson.error || errText || `Upload logo failed (${res.status})`)
  }
  return res.json()
}

/** Remove company logo from MinIO (Admin only). */
export async function deleteCompanyLogo(companyId) {
  const q = companyId ? `?companyId=${encodeURIComponent(companyId)}` : ''
  return api(`/company/logo${q}`, {
    method: 'DELETE'
  })
}

