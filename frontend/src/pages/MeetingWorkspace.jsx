import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api, uploadPaper, getUser } from '../api.js'
import MinutesEditor from '../components/MinutesEditor.jsx'

export default function MeetingWorkspace() {
  const { id } = useParams()
  const [m, setM] = useState(null)
  const [users, setUsers] = useState([])
  const [tab, setTab] = useState('agenda')
  const [toast, setToast] = useState('')
  const [editingDetails, setEditingDetails] = useState(false)
  const canManage = ['Secretary', 'Admin'].includes(getUser()?.role)

  const load = () => api(`/meetings/${id}`).then(setM)
  useEffect(() => { load(); api('/auth/users').then(setUsers) }, [id])
  const say = msg => { setToast(msg); setTimeout(() => setToast(''), 4000) }

  if (!m) return <p>Loading…</p>
  const locked = m.minutesStatus === 'Finalized'
  const canEditDetails = canManage && m.status !== 'Completed' && !locked

  return (
    <>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className={`docket ${locked ? 'finalized' : ''}`}>{m.meetingCode}</span>
        <h1 style={{ margin: 0 }}>{m.title}</h1>
      </div>
      <p style={{ color: 'var(--ink-soft)', marginTop: 6 }}>
        {m.type} meeting · {new Date(m.scheduledAtUtc).toLocaleString()} · {m.location || 'No location set'} · {m.attendees.length} attendees
      </p>

      {canEditDetails && (
        <button className="btn secondary" style={{ marginRight: 10 }} onClick={() => setEditingDetails(v => !v)}>
          {editingDetails ? 'Close details' : 'Edit meeting details'}
        </button>
      )}
      {canEditDetails && editingDetails && (
        <MeetingDetailsForm m={m} users={users}
          onSaved={() => { setEditingDetails(false); load(); say(m.status === 'Scheduled' ? 'Meeting updated. Attendees have been emailed a revised notice.' : 'Meeting details saved.') }} />
      )}

      {canManage && m.status === 'Draft' && (
        <button className="btn brass" onClick={async () => {
          await api(`/meetings/${id}/send-invites`, { method: 'POST' })
          say('Invites are being emailed to all attendees with agenda, workspace link and calendar file.')
          load()
        }}>Send invites to attendees</button>
      )}
      {locked && <div className="locked-banner" style={{ marginTop: 12 }}>
        Minutes were finalized on {new Date(m.minutesFinalizedAt).toLocaleString()}. This record is locked.
      </div>}

      <div className="tabs" role="tablist">
        {['agenda', 'papers', 'minutes', 'actions'].map(t => (
          <button key={t} role="tab" className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {{ agenda: 'Agenda', papers: `Papers (${m.papers.length})`, minutes: 'Minutes', actions: `Action points (${m.actionPoints.length})` }[t]}
          </button>
        ))}
      </div>

      {tab === 'agenda' && (
        <AgendaTab
          key={`${m.id}:${m.agendaItems.map(a => a.id).join()}`}
          meetingId={m.id}
          initialItems={m.agendaItems}
          locked={locked || !canManage}
          onSaved={() => { load(); say('Agenda saved.') }}
        />
      )}
      {tab === 'papers' && <PapersTab m={m} canManage={canManage} onChanged={load} say={say} />}
      {tab === 'minutes' && (
        <>
          <MinutesEditor
            initialHtml={m.minutesHtml}
            agendaItems={m.agendaItems}
            users={users}
            locked={locked || !canManage}
            onSave={async html => { await api(`/meetings/${id}/minutes`, { method: 'PUT', body: JSON.stringify({ minutesHtml: html }) }); say('Minutes saved.') }}
            onCreateAction={async d => {
              await api('/actions', { method: 'POST', body: JSON.stringify({
                meetingId: id, agendaItemId: d.agendaItemId || null,
                description: d.description, assigneeId: d.assigneeId, dueDate: d.dueDate || null }) })
              say('Action point created. The assignee has been emailed.')
              load()
            }}
          />
          {canManage && !locked && (
            <div className="card" style={{ marginTop: 20, borderColor: 'var(--brass)' }}>
              <h3>Finalize minutes</h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--ink-soft)' }}>
                Finalizing locks the minutes permanently and automatically emails every attendee a
                read-only link with a summary of new action points.
              </p>
              <button className="btn brass" onClick={async () => {
                if (!confirm('Finalize the minutes? They cannot be edited afterwards, and all attendees will be emailed.')) return
                await api(`/meetings/${id}/minutes/finalize`, { method: 'POST' })
                say('Minutes finalized. Publication emails are on their way.')
                load()
              }}>Finalize and publish</button>
            </div>
          )}
        </>
      )}
      {tab === 'actions' && <ActionsTab m={m} onChanged={load} say={say} />}

      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  )
}

function AgendaTab({ meetingId, initialItems, locked, onSaved }) {
  const [items, setItems] = useState(initialItems.map(a => ({ ...a })))
  const [error, setError] = useState('')
  const set = (i, k, v) => setItems(p => p.map((it, idx) => idx === i ? { ...it, [k]: v } : it))
  const move = (i, d) => setItems(p => {
    const n = [...p]; const j = i + d
    if (j < 0 || j >= n.length) return p
    ;[n[i], n[j]] = [n[j], n[i]]
    return n
  })

  if (locked) {
    return (
      <div className="card">
        {items.length === 0 ? (
          <p style={{ color: 'var(--ink-soft)' }}>No agenda items yet.</p>
        ) : (
          <table className="plain" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--line)', textAlign: 'left' }}>
                <th style={{ padding: '10px 8px', width: '50px', color: 'var(--ink-soft)' }}>#</th>
                <th style={{ padding: '10px 8px' }}>Title</th>
                <th style={{ padding: '10px 8px', width: '180px' }}>Presenter</th>
                <th style={{ padding: '10px 8px', width: '100px', textAlign: 'right' }}>Duration</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={it.id || i} style={{ borderBottom: '1px solid var(--line)' }}>
                  <td style={{ padding: '12px 8px', fontFamily: 'IBM Plex Mono', color: 'var(--ink-soft)' }}>{i + 1}</td>
                  <td style={{ padding: '12px 8px', fontWeight: 500, color: 'var(--ink)' }}>{it.title || 'Untitled Item'}</td>
                  <td style={{ padding: '12px 8px', color: 'var(--ink-soft)' }}>
                    {it.presenter ? (
                      <span className="pill" style={{ background: '#f0f2f5', color: 'var(--ink-soft)', padding: '3px 8px', borderRadius: '4px' }}>
                        {it.presenter}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td style={{ padding: '12px 8px', textAlign: 'right', fontWeight: 600, color: 'var(--ink-soft)' }}>
                    {it.durationMinutes ? `${it.durationMinutes} min` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    )
  }

  return (
    <div className="card">
      {items.length === 0 && <p style={{ color: 'var(--ink-soft)', marginBottom: 14 }}>No agenda items yet. Click 'Add item' below to build the agenda.</p>}
      {items.map((it, i) => (
        <div key={it.id || i} style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontFamily: 'IBM Plex Mono', color: 'var(--ink-soft)', width: 24, fontWeight: 600 }}>{i + 1}.</span>
          <input
            value={it.title}
            placeholder="Item title"
            style={{ flex: 2 }}
            onChange={e => { setError(''); set(i, 'title', e.target.value) }}
            required
          />
          <input
            value={it.presenter || ''}
            placeholder="Presenter"
            style={{ flex: 1, minWidth: 140 }}
            onChange={e => set(i, 'presenter', e.target.value)}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="number"
              value={it.durationMinutes || ''}
              placeholder="min"
              style={{ width: 80, textAlign: 'right' }}
              onChange={e => set(i, 'durationMinutes', e.target.value ? +e.target.value : null)}
            />
            <span style={{ fontSize: '0.85rem', color: 'var(--ink-soft)' }}>min</span>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button type="button" className="btn secondary" style={{ padding: '6px 10px' }} onClick={() => move(i, -1)} aria-label="Move up">↑</button>
            <button type="button" className="btn secondary" style={{ padding: '6px 10px' }} onClick={() => move(i, 1)} aria-label="Move down">↓</button>
            <button type="button" className="btn secondary" style={{ padding: '6px 10px', color: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={() => setItems(p => p.filter((_, idx) => idx !== i))} aria-label="Remove">✕</button>
          </div>
        </div>
      ))}
      
      {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem', marginBottom: 12 }}>{error}</p>}

      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        <button className="btn secondary" onClick={() => setItems(p => [...p, { title: '', presenter: '', notesHtml: '' }])}>Add item</button>
        <button className="btn" onClick={async () => {
          if (items.some(it => !it.title || !it.title.trim())) {
            setError('Please provide a title for all agenda items before saving.')
            return
          }
          try {
            await api(`/meetings/${meetingId}/agenda`, {
              method: 'PUT',
              body: JSON.stringify(items.map((it, i) => ({
                id: it.id || null,
                title: it.title.trim(),
                sortOrder: i,
                durationMinutes: it.durationMinutes || null,
                presenter: it.presenter || '',
                notesHtml: it.notesHtml || ''
              })))
            })
            onSaved()
          } catch (err) {
            setError(err.message)
          }
        }}>Save agenda</button>
      </div>
    </div>
  )
}

function PapersTab({ m, canManage, onChanged, say }) {
  const [progress, setProgress] = useState(null)
  const [selected, setSelected] = useState({})

  const handleDownload = async (paperId, fileName) => {
    try {
      const authData = JSON.parse(sessionStorage.getItem('boardroom.auth') || 'null')
      const token = authData?.token
      const response = await fetch(`/api/papers/${paperId}/download`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      })
      if (!response.ok) throw new Error('Download failed')
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (e) {
      say('Error downloading paper: ' + e.message)
    }
  }

  async function pickFile(paperId, title) {
    const input = document.createElement('input')
    input.type = 'file'
    input.onchange = async () => {
      const file = input.files[0]
      if (!file) return
      setProgress(0)
      try {
        const res = await uploadPaper(file, {
          meetingId: m.id, paperId, title: title || file.name.replace(/\.[^.]+$/, '')
        }, setProgress)
        onChanged()
        if (res.promptToDistribute && confirm('Would you like to email the updated paper to the board now?')) {
          await api(`/papers/meetings/${m.id}/distribute`, { method: 'POST',
            body: JSON.stringify({ paperIds: [res.paperId], recipientUserIds: null }) })
          say('Distribution emails are being sent with secure download links.')
        }
      } catch (e) { say(e.message) }
      finally { setProgress(null) }
    }
    input.click()
  }

  const chosen = Object.entries(selected).filter(([, v]) => v).map(([k]) => k)

  return (
    <div className="card">
      {m.papers.length === 0 && <p style={{ color: 'var(--ink-soft)' }}>No board papers uploaded yet.</p>}
      {m.papers.length > 0 && (
        <table className="plain">
          <thead><tr>{canManage && <th></th>}<th>Paper</th><th>Version</th><th>Latest file</th><th></th></tr></thead>
          <tbody>
            {m.papers.map(p => {
              const v = p.versions[0]
              return (
                <tr key={p.id}>
                  {canManage && <td><input type="checkbox" style={{ width: 'auto' }} checked={!!selected[p.id]}
                    onChange={e => setSelected(s => ({ ...s, [p.id]: e.target.checked }))} /></td>}
                  <td>
                    <span
                      className="hover-underline"
                      style={{ cursor: 'pointer', fontWeight: 500, color: 'var(--bottle)' }}
                      onClick={() => handleDownload(p.id, v?.originalFileName || p.title)}
                    >
                      {p.title}
                    </span>
                  </td>
                  <td><span className="pill">v{p.currentVersion}</span></td>
                  <td className="meta">
                    {v ? (
                      <>
                        <span
                          className="hover-underline"
                          style={{ cursor: 'pointer', color: 'var(--ink)' }}
                          onClick={() => handleDownload(p.id, v.originalFileName)}
                        >
                          {v.originalFileName}
                        </span>
                        {` · ${(v.sizeBytes / 1048576).toFixed(1)} MB · ${new Date(v.uploadedAt).toLocaleDateString()}`}
                      </>
                    ) : (
                      'No file uploaded'
                    )}
                  </td>
                  <td>{canManage && <button className="btn secondary" onClick={() => pickFile(p.id, p.title)}>New version</button>}</td>
                </tr>)
            })}
          </tbody>
        </table>
      )}
      {progress !== null && <p>Uploading… {Math.round(progress * 100)}%</p>}
      {canManage && (
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button className="btn secondary" onClick={() => pickFile(null, '')} disabled={progress !== null}>Upload new paper</button>
          <button className="btn" disabled={chosen.length === 0} onClick={async () => {
            await api(`/papers/meetings/${m.id}/distribute`, { method: 'POST',
              body: JSON.stringify({ paperIds: chosen, recipientUserIds: null }) })
            say('Distribution emails are being sent with secure download links.')
            setSelected({})
          }}>Distribute papers ({chosen.length})</button>
        </div>
      )}
      <p style={{ fontSize: '0.8rem', color: 'var(--ink-soft)', marginTop: 12 }}>
        Large files upload in 5 MB chunks. Distribution emails contain metadata and personalized
        secure links only — never the documents themselves.
      </p>
    </div>
  )
}

function ActionsTab({ m, onChanged, say }) {
  const me = getUser()
  const today = new Date().toISOString().slice(0, 10)
  return (
    <div className="card">
      {m.actionPoints.length === 0 && <p style={{ color: 'var(--ink-soft)' }}>No action points. Create them from the minutes editor.</p>}
      {m.actionPoints.length > 0 && (
        <table className="plain">
          <thead><tr><th>Action</th><th>Assignee</th><th>Due</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {m.actionPoints.map(a => (
              <tr key={a.id}>
                <td>{a.description}</td>
                <td>{a.assigneeName}</td>
                <td>{a.dueDate || '—'}</td>
                <td><span className={`pill ${a.status === 'Completed' ? 'done' : (a.dueDate && a.dueDate < today ? 'overdue' : '')}`}>
                  {a.status === 'Completed' ? 'Completed' : (a.dueDate && a.dueDate < today ? 'Overdue' : 'Open')}</span></td>
                <td>{a.status !== 'Completed' && (a.assigneeId === me.id || ['Secretary', 'Admin'].includes(me.role)) &&
                  <button className="btn secondary" onClick={async () => {
                    await api(`/actions/${a.id}/complete`, { method: 'POST' })
                    say('Marked complete. The chair and secretary have been notified.')
                    onChanged()
                  }}>Mark complete</button>}</td>
              </tr>))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function MeetingDetailsForm({ m, users, onSaved }) {
  const d = new Date(m.scheduledAtUtc)
  const pad = n => String(n).padStart(2, '0')
  const [f, setF] = useState({
    title: m.title, type: m.type,
    date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`,
    durationMinutes: m.durationMinutes, location: m.location
  })
  const [attendees, setAttendees] = useState(() => Object.fromEntries(
    m.attendees.map(a => [a.userId, { selected: true, isChair: a.isChair }])))
  const [error, setError] = useState('')
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))

  async function submit(e) {
    e.preventDefault()
    setError('')
    const selected = Object.entries(attendees).filter(([, v]) => v.selected)
    if (!selected.length) return setError('Select at least one attendee.')
    try {
      await api(`/meetings/${m.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: f.title, type: f.type,
          scheduledAtUtc: new Date(`${f.date}T${f.time}:00Z`).toISOString(),
          durationMinutes: Number(f.durationMinutes), location: f.location,
          attendees: selected.map(([userId, v]) => ({ userId, isChair: !!v.isChair }))
        })
      })
      onSaved()
    } catch (err) { setError(err.message) }
  }

  return (
    <form className="card" style={{ marginTop: 12 }} onSubmit={submit}>
      <h3>Meeting details</h3>
      <div className="grid2">
        <div><label>Title</label><input value={f.title} onChange={e => set('title', e.target.value)} required /></div>
        <div><label>Type</label>
          <select value={f.type} onChange={e => set('type', e.target.value)}>
            <option>Regular</option><option>Special</option><option>Annual</option>
          </select></div>
        <div><label>Date (UTC)</label><input type="date" value={f.date} onChange={e => set('date', e.target.value)} required /></div>
        <div><label>Time (UTC)</label><input type="time" value={f.time} onChange={e => set('time', e.target.value)} required /></div>
        <div><label>Duration (minutes)</label><input type="number" min="15" value={f.durationMinutes} onChange={e => set('durationMinutes', e.target.value)} /></div>
        <div><label>Location</label><input value={f.location} onChange={e => set('location', e.target.value)} placeholder="Boardroom / video link" /></div>
      </div>
      <label>Attendees</label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 8 }}>
        {users.map(u => {
          const a = attendees[u.id] || {}
          const isSelected = !!a.selected
          const isChair = !!a.isChair
          const hasChair = Object.values(attendees).some(att => att.selected && att.isChair)
          const showChairOption = isSelected && (isChair || !hasChair)
          return (
            <div
              key={u.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                border: isSelected ? '1px solid var(--bottle)' : '1px solid var(--line)',
                borderRadius: 'var(--radius)',
                background: isSelected ? 'var(--bottle-tint)' : '#fff',
                fontSize: '0.9rem',
                transition: 'all 0.2s ease',
                gap: 12
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  style={{ width: 'auto', cursor: 'pointer', margin: 0 }}
                  onChange={e => {
                    const checked = e.target.checked
                    setAttendees(p => ({
                      ...p,
                      [u.id]: {
                        ...a,
                        selected: checked,
                        isChair: checked ? !!a.isChair : false
                      }
                    }))
                  }}
                />
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <div style={{ fontWeight: 500, color: 'var(--ink)' }}>{u.name}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--ink-soft)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {u.title || (u.isContact ? 'External Contact' : 'Staff')}
                  </div>
                </div>
              </div>

              {showChairOption && (
                <button
                  type="button"
                  onClick={() => setAttendees(p => ({ ...p, [u.id]: { ...a, isChair: !isChair } }))}
                  style={{
                    padding: '3px 8px',
                    fontSize: '0.72rem',
                    borderRadius: '4px',
                    border: '1px solid',
                    borderColor: isChair ? 'var(--brass)' : 'var(--line)',
                    background: isChair ? '#f5eedd' : 'transparent',
                    color: isChair ? 'var(--brass)' : 'var(--ink-soft)',
                    fontWeight: 600,
                    margin: 0,
                    cursor: 'pointer'
                  }}
                >
                  {isChair ? 'Chair ★' : 'Make Chair'}
                </button>
              )}
            </div>
          )
        })}
      </div>
      {error && <p style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>{error}</p>}
      <div style={{ display: 'flex', gap: 10, marginTop: 16, alignItems: 'center' }}>
        <button className="btn">Save changes</button>
        {m.status === 'Scheduled' && <span style={{ fontSize: '0.8rem', color: 'var(--ink-soft)' }}>
          Attendees will automatically receive an updated notice with a revised calendar file.</span>}
      </div>
    </form>
  )
}
