const BASE = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')

let auth = JSON.parse(sessionStorage.getItem('boardroom.auth') || 'null')

export function getUser() { return auth?.user || null }
export function getCompanies() { return auth?.companies || [] }
export function logout() { auth = null; sessionStorage.removeItem('boardroom.auth') }

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
  auth = { token: data.token, user: data.user, companies: pending.companies }
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
  auth = { ...auth, token: data.token, user: data.user }
  persist()
  window.location.href = `${BASE}/`   // reload dashboard/state under the new company context
}

export async function api(path, options = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(auth ? { Authorization: `Bearer ${auth.token}` } : {}),
      ...options.headers
    }
  })
  if (res.status === 401) { logout(); window.location.href = `${BASE}/login`; return }
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Request failed (${res.status})`)
  const text = await res.text()
  return text ? JSON.parse(text) : null
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
