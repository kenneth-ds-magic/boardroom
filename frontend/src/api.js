let auth = JSON.parse(sessionStorage.getItem('boardroom.auth') || 'null')

export function getUser() { return auth?.user || null }
export function logout() { auth = null; sessionStorage.removeItem('boardroom.auth') }

export async function login(email, password) {
  const res = await fetch('/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  })
  if (!res.ok) throw new Error((await res.json()).error || 'Sign-in failed')
  auth = await res.json()
  sessionStorage.setItem('boardroom.auth', JSON.stringify(auth))
  return auth.user
}

export async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(auth ? { Authorization: `Bearer ${auth.token}` } : {}),
      ...options.headers
    }
  })
  if (res.status === 401) { logout(); location.href = '/login'; return }
  if (!res.ok) {
    let msg = `Request failed (${res.status})`
    try {
      const data = await res.json()
      if (data.error) {
        msg = data.error
      } else if (data.errors) {
        const firstErr = Object.values(data.errors)[0]
        if (firstErr && firstErr.length) {
          msg = firstErr[0]
        } else if (data.title) {
          msg = data.title
        }
      } else if (data.title) {
        msg = data.title
      }
    } catch (_) {}
    throw new Error(msg)
  }
  const text = await res.text()
  return text ? JSON.parse(text) : null
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
    const res = await fetch(`/api/papers/uploads/${sessionId}/chunks/${i}`, {
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
