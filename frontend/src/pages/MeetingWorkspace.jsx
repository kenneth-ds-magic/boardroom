import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api, getUser, uploadPaper, downloadPaper, uploadTempMinutesPdf } from '../api.js'
import MinutesEditor from '../components/MinutesEditor.jsx'
import AttendeePicker from '../components/AttendeePicker.jsx'

const MODES = ['Physical', 'Online', 'Hybrid']

export default function MeetingWorkspace() {
  const { id } = useParams()
  const [m, setM] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [tab, setTab] = useState('agenda')
  const [toast, setToast] = useState('')
  const [showEdit, setShowEdit] = useState(false)
  const user = getUser()
  const isManagement = ['Secretary', 'Admin'].includes(user.role)

  const load = () => api(`/meetings/${id}`).then(setM).catch(e => { setLoadError(e.message); setToast(e.message) })
  useEffect(() => { load() }, [id])
  if (loadError) return <main className="page"><div className="card" style={{ maxWidth: 500, margin: '40px auto', textAlign: 'center' }}><h3>Unable to load meeting</h3><p style={{ color: 'var(--ink-soft)' }}>{loadError}</p><button className="btn" onClick={load}>Retry</button></div></main>
  if (!m) return <main className="page"><p>Loading…</p></main>

  const finalized = m.minutesStatus === 'Finalized'
  const say = msg => { setToast(msg); setTimeout(() => setToast(''), 6000) }

  async function sendInvites() {
    try {
      await api(`/meetings/${id}/send-invites`, { method: 'POST' })
      say('Invitations emailed to all attendees with their personal secure links.')
      load()
    } catch (e) { say(e.message) }   // e.g. agenda-required 400 from the server
  }

  async function sendUpdates() {
    try {
      await api(`/meetings/${id}/send-updates`, { method: 'POST' })
      say('Revised notices and updated calendar files have been emailed to all attendees.')
    } catch (e) { say(e.message) }
  }

  return (
    <main className="page">
      {toast && <div className="toast no-print">{toast}</div>}

      <div className="screen-ui">
        <div className="page-head">
          <div className="meeting-header-main">
            <div className="meeting-header-badges">
              <span className={`docket ${finalized ? 'docket-final' : ''}`}>{m.meetingCode}</span>
              <span className={`pill pill-${m.status.toLowerCase()}`}>{m.status}</span>
            </div>
            <h1>{m.title}</h1>
            <div className="meeting-meta-bar">
              <span className="meta-item">{new Date(m.scheduledAtUtc).toLocaleString()}</span>
              <span className="meta-item">·</span>
              <span className="meta-item">{m.durationMinutes} min</span>
              <span className="meta-item">·</span>
              <span className="meta-item">{m.mode}{m.mode !== 'Online' && m.location ? `: ${m.location}` : ''}</span>
              {m.mode !== 'Physical' && m.videoLink && (
                <>
                  <span className="meta-item">·</span>
                  <a href={m.videoLink} target="_blank" rel="noreferrer" className="meta-link">Join online</a>
                </>
              )}
            </div>
          </div>
          {isManagement && !finalized && (
            <div className="head-actions">
              <button className="btn ghost" onClick={() => setShowEdit(v => !v)}>
                {showEdit ? 'Close details' : 'Edit meeting details'}
              </button>
              {m.status === 'Draft' && <button className="btn" onClick={sendInvites}>Send invites to attendees</button>}
              {m.status === 'Scheduled' && m.hasUnsentUpdates && <button className="btn" onClick={sendUpdates}>Email updates</button>}
            </div>
          )}
        </div>

        {showEdit && isManagement && !finalized && (
          <MeetingDetailsForm key={m.id + m.attendees.length} meeting={m}
            onSaved={() => { setShowEdit(false); load(); say(m.status === 'Scheduled' ? 'Details saved. You can email updates to the board when ready.' : 'Details saved.') }}
            onError={say} />
        )}

        <nav className="tabs no-print">
          {['agenda', 'papers', 'minutes', 'actions'].map(t => (
            <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
              {t === 'actions' ? 'Action points' : t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </nav>

        {tab === 'agenda' && <AgendaTab key={m.id + ':' + m.agendaItems.map(a => a.id).join(',')} meetingId={id} initialItems={m.agendaItems} editable={isManagement && !finalized} onSaved={() => { load(); say('Agenda saved.') }} attendees={m.attendees} />}
        {tab === 'papers' && <PapersTab meeting={m} editable={isManagement && !finalized} reload={load} say={say} />}
        {tab === 'minutes' && (
          <MinutesTab meeting={m} editable={isManagement && !finalized} reload={load} say={say} />
        )}
        {tab === 'actions' && <ActionsTab meeting={m} reload={load} />}
      </div>

      <PrintSheet meeting={m} companyName={user.companyName} />
    </main>
  )
}

/* ------------ Edit details (mode-aware, single-chair) ------------ */
function MeetingDetailsForm({ meeting, onSaved, onError }) {
  const [directory, setDirectory] = useState([])
  const dt = new Date(meeting.scheduledAtUtc)
  const [form, setForm] = useState({
    title: meeting.title, type: meeting.type, mode: meeting.mode,
    date: dt.toISOString().slice(0, 10), time: dt.toISOString().slice(11, 16),
    durationMinutes: meeting.durationMinutes, location: meeting.location || '', videoLink: meeting.videoLink || ''
  })
  const [attendees, setAttendees] = useState(
    meeting.attendees.map(a => ({ userId: a.userId, contactId: a.contactId, isChair: a.isChair }))
  )
  useEffect(() => { api('/auth/users').then(setDirectory) }, [])
  const set = k => e => setForm({ ...form, [k]: e.target.value })
  const showLocation = form.mode !== 'Online'
  const showVideo = form.mode !== 'Physical'

  async function submit(e) {
    e.preventDefault()
    try {
      await api(`/meetings/${meeting.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: form.title, type: form.type, mode: form.mode,
          scheduledAtUtc: new Date(`${form.date}T${form.time}:00Z`).toISOString(),
          durationMinutes: Number(form.durationMinutes),
          location: showLocation ? form.location : '',
          videoLink: showVideo ? form.videoLink : null,
          attendees
        })
      })
      onSaved()
    } catch (err) { onError(err.message) }
  }

  return (
    <form className="card form-card no-print" onSubmit={submit}>
      <h3>Edit meeting details</h3>
      <div className="grid2">
        <div><label>Title</label><input value={form.title} onChange={set('title')} required /></div>
        <div>
          <label>Type</label>
          <select value={form.type} onChange={set('type')}>
            <option>Regular</option><option>Special</option><option>Annual</option>
          </select>
        </div>
      </div>
      <div className="grid2">
        <div>
          <label>Mode</label>
          <select value={form.mode} onChange={set('mode')}>{MODES.map(x => <option key={x}>{x}</option>)}</select>
        </div>
        <div><label>Duration (minutes)</label><input type="number" min="15" step="15" value={form.durationMinutes} onChange={set('durationMinutes')} /></div>
      </div>
      <div className="grid2">
        <div><label>Date (UTC)</label><input type="date" value={form.date} onChange={set('date')} required /></div>
        <div><label>Time (UTC)</label><input type="time" value={form.time} onChange={set('time')} required /></div>
      </div>
      {showLocation && (
        <div><label>Location</label><input value={form.location} onChange={set('location')} required={form.mode === 'Physical'} /></div>
      )}
      {showVideo && (
        <div><label>Video link</label><input type="url" value={form.videoLink} onChange={set('videoLink')} placeholder="https://…" required={form.mode === 'Online'} /></div>
      )}
      <label style={{ marginTop: 12 }}>Attendees</label>
      <AttendeePicker directory={directory} value={attendees} onChange={setAttendees} />
      {meeting.status === 'Scheduled' && (
        <p style={{ fontSize: '0.8rem', color: 'var(--brass-dark, var(--brass))' }}>
          This meeting is announced — saving will automatically email every attendee an updated notice and calendar file.
        </p>
      )}
      <div className="form-actions"><button className="btn">Save changes</button></div>
    </form>
  )
}

/* ------------ Agenda ------------ */
function AgendaTab({ meetingId, initialItems, editable, onSaved, attendees }) {
  const [items, setItems] = useState(initialItems.map(a => ({ ...a })))
  const move = (i, d) => {
    const next = [...items]
    const j = i + d
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    setItems(next)
  }
  const set = (i, k) => e => {
    const next = [...items]
    next[i] = { ...next[i], [k]: e.target.value }
    setItems(next)
  }
  async function save() {
    await api(`/meetings/${meetingId}/agenda`, {
      method: 'PUT',
      body: JSON.stringify(items.map((a, i) => ({
        id: a.id || null, title: a.title, sortOrder: i,
        durationMinutes: a.durationMinutes ? Number(a.durationMinutes) : null,
        presenter: a.presenter || '', notesHtml: a.notesHtml || ''
      })))
    })
    onSaved()
  }

  return (
    <div className="card">
      {items.map((a, i) => (
        <div key={a.id || `new-${i}`} className="agenda-row">
          <span className="agenda-num">{i + 1}</span>
          {editable ? (
            <>
              <div className="agenda-edit-fields">
                <div className="agenda-edit-main">
                  <input className="agenda-input-title" value={a.title} onChange={set(i, 'title')} placeholder="Item title" />
                </div>
                <div className="agenda-edit-sub">
                  <input className="agenda-input-presenter" value={a.presenter || ''} onChange={set(i, 'presenter')} placeholder="Presenter" />
                  <div className="agenda-duration-wrap">
                    <input type="number" className="agenda-input-duration" value={a.durationMinutes || ''} onChange={set(i, 'durationMinutes')} placeholder="min" />
                  </div>
                </div>
              </div>
              <div className="agenda-item-actions">
                <button className="btn small ghost" type="button" onClick={() => move(i, -1)} title="Move up">↑</button>
                <button className="btn small ghost" type="button" onClick={() => move(i, 1)} title="Move down">↓</button>
                <button className="btn small ghost delete" type="button" onClick={() => setItems(items.filter((_, x) => x !== i))} title="Delete item" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    <line x1="10" y1="11" x2="10" y2="17"></line>
                    <line x1="14" y1="11" x2="14" y2="17"></line>
                  </svg>
                </button>
              </div>
            </>
          ) : (
            <div className="agenda-item-view">
              <span className="agenda-item-title">{a.title}</span>
              <div className="agenda-item-meta">
                {a.presenter && <em className="agenda-presenter-tag">— {a.presenter}</em>}
                {a.durationMinutes && <span className="pill">{a.durationMinutes} min</span>}
              </div>
            </div>
          )}
        </div>
      ))}
      {editable && (
        <div className="form-actions" style={{ justifyContent: 'space-between' }}>
          <button className="btn ghost" type="button"
            onClick={() => setItems([...items, { title: '', presenter: '', durationMinutes: '' }])}>+ Add item</button>
          <button className="btn" type="button" onClick={save}>Save agenda</button>
        </div>
      )}
      {!editable && items.length === 0 && <p style={{ color: 'var(--ink-soft)' }}>No agenda yet.</p>}
    </div>
  )
}

/* ------------ Papers (clickable, authenticated downloads) ------------ */
function PapersTab({ meeting, editable, reload, say }) {
  const [progress, setProgress] = useState(null)
  const [title, setTitle] = useState('')
  const [versionTarget, setVersionTarget] = useState('')
  const [sending, setSending] = useState(false)
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [paperToDelete, setPaperToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [selectedIds, setSelectedIds] = useState(() => new Set())

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === meeting.papers.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(meeting.papers.map(p => p.id)))
    }
  }

  async function sendEmailPapers() {
    if (selectedIds.size === 0) return
    setSending(true)
    try {
      await api(`/papers/meetings/${meeting.id}/email-attachments`, {
        method: 'POST',
        body: JSON.stringify({ paperIds: Array.from(selectedIds) })
      })
      say(`Email queued with ${selectedIds.size} selected paper(s) attached for all attendees.`)
    } catch (err) { say(err.message) }
    finally { setSending(false) }
  }

  async function onFile(e) {
    const file = e.target.files[0]
    if (!file) return
    try {
      await uploadPaper(file,
        { meetingId: meeting.id, paperId: versionTarget || null, title: title || file.name },
        setProgress)
      setProgress(null); setTitle(''); setVersionTarget('')
      reload()
      setShowSuccessModal(true)
    } catch (err) { setProgress(null); say(err.message) }
  }

  function grab(p) {
    const latest = p.versions[0]
    downloadPaper(p.id, latest ? latest.originalFileName : `${p.title}.bin`).catch(e => say(e.message))
  }

  async function confirmDeletePaper() {
    if (!paperToDelete) return
    setDeleting(true)
    try {
      await api(`/papers/${paperToDelete.id}`, { method: 'DELETE' })
      setPaperToDelete(null)
      reload()
      say('Board paper deleted.')
    } catch (err) {
      say(err.message)
      setPaperToDelete(null)
    } finally {
      setDeleting(false)
    }
  }

  const allSelected = meeting.papers.length > 0 && selectedIds.size === meeting.papers.length
  const noneSelected = selectedIds.size === 0

  return (
    <div className="card">
      <div className="paper-header-bar no-print">
        <div className="paper-header-title">
          <span className="paper-header-heading">Board papers</span>
          {meeting.papers.length > 0 && editable && (
            <label className="paper-select-all">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
              />
              <span>Select all ({selectedIds.size}/{meeting.papers.length})</span>
            </label>
          )}
        </div>
        {meeting.papers.length > 0 && editable && (
          <button
            type="button"
            className="btn small"
            onClick={sendEmailPapers}
            disabled={sending || noneSelected}
            title={noneSelected ? "Check at least one paper to enable emailing" : "Email selected papers to attendees"}
          >
            {sending ? 'Emailing papers...' : `Email papers (${selectedIds.size})`}
          </button>
        )}
      </div>
      {editable && (
        <div className="upload-panel no-print">
          <div className="grid2">
            <div>
              <label>Paper title</label>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Q3 Financial Report" />
            </div>
            <div>
              <label>New version of…</label>
              <select value={versionTarget} onChange={e => setVersionTarget(e.target.value)}>
                <option value="">— new paper —</option>
                {meeting.papers.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </div>
          </div>
          <input type="file" onChange={onFile} />
          {progress !== null && <progress value={progress} max="1" style={{ width: '100%' }} />}
          <p style={{ fontSize: '0.8rem', color: 'var(--ink-soft)' }}>
            Large files upload in chunks. Uploading onto an existing paper creates version v{'{n+1}'} and prompts to re-email the board.
          </p>
        </div>
      )}
      <ul className="paper-list">
        {meeting.papers.map(p => {
          const isChecked = selectedIds.has(p.id)
          const latest = p.versions[0]
          return (
            <li key={p.id} className="paper-item">
              {editable && (
                <div className="paper-checkbox-wrap">
                  <input
                    type="checkbox"
                    className="paper-checkbox"
                    checked={isChecked}
                    onChange={() => toggleSelect(p.id)}
                    aria-label={`Select ${p.title}`}
                  />
                </div>
              )}
              <div className="paper-details">
                <a className="hover-underline paper-title" href="#" onClick={e => { e.preventDefault(); grab(p) }}
                   title="Download latest version">
                  {p.title} <span className="pill">v{p.currentVersion}</span>
                </a>
                {latest && (
                  <div className="version-line" style={{ marginTop: 2 }}>
                    {latest.originalFileName} ({(latest.sizeBytes / 1e6).toFixed(1)} MB, {new Date(latest.uploadedAt).toLocaleDateString()})
                  </div>
                )}
              </div>
              {editable && (
                <button
                  type="button"
                  className="btn small ghost delete paper-delete-btn"
                  onClick={() => setPaperToDelete(p)}
                  title="Delete paper and all versions"
                  style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    <line x1="10" y1="11" x2="10" y2="17"></line>
                    <line x1="14" y1="11" x2="14" y2="17"></line>
                  </svg>
                </button>
              )}
            </li>
          )
        })}
        {meeting.papers.length === 0 && <p style={{ color: 'var(--ink-soft)' }}>No papers tabled yet.</p>}
      </ul>
      {showSuccessModal && (
        <div className="modal-backdrop">
          <div className="card modal-content" style={{ maxWidth: 400, textAlign: 'center', padding: '24px 30px' }}>
            <div style={{ fontSize: '2.5rem', color: 'var(--bottle)', marginBottom: 12 }}>✓</div>
            <h3 style={{ marginTop: 0 }}>Upload Successful</h3>
            <p style={{ color: 'var(--ink-soft)', fontSize: '0.9rem', marginBottom: 20 }}>
              The board paper has been successfully uploaded and added to the meeting workspace.
            </p>
            <button type="button" className="btn" style={{ width: '100%' }} onClick={() => setShowSuccessModal(false)}>
              Got it
            </button>
          </div>
        </div>
      )}
      {paperToDelete && (
        <div className="modal-backdrop">
          <div className="card modal-content" style={{ maxWidth: 400, textAlign: 'center', padding: '24px 30px' }}>
            <div style={{ fontSize: '2.5rem', color: '#dc2626', marginBottom: 12 }}>🗑️</div>
            <h3 style={{ marginTop: 0 }}>Delete Board Paper?</h3>
            <p style={{ color: 'var(--ink-soft)', fontSize: '0.9rem', marginBottom: 20 }}>
              Are you sure you want to delete <strong>"{paperToDelete.title}"</strong> and all of its uploaded versions? This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                className="btn ghost"
                style={{ flex: 1 }}
                onClick={() => setPaperToDelete(null)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn delete"
                style={{ flex: 1, background: '#dc2626', color: '#fff', borderColor: '#dc2626' }}
                onClick={confirmDeletePaper}
                disabled={deleting}
              >
                {deleting ? 'Deleting...' : 'Delete paper'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ------------ Minutes (with print) ------------ */
function MinutesTab({ meeting, editable, reload, say }) {
  const [members, setMembers] = useState([])
  const [downloading, setDownloading] = useState(false)
  const [showFinalizeModal, setShowFinalizeModal] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const finalized = meeting.minutesStatus === 'Finalized'
  // Assignees must be registered members (contacts cannot sign in to complete tasks).
  useEffect(() => { api('/auth/users').then(d => setMembers(d.filter(u => !u.isContact))) }, [])

  async function downloadPdf() {
    setDownloading(true)
    try {
      const html2pdf = (await import('html2pdf.js')).default;
      const element = document.querySelector('.print-sheet');
      if (!element) throw new Error('Print sheet not found');
      
      element.style.display = 'block';

      const opt = {
        margin:       0.5,
        filename:     `Minutes_${meeting.meetingCode}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true, logging: false },
        jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
      };

      try {
        await html2pdf().set(opt).from(element).save();
      } finally {
        element.style.display = '';
      }
    } catch (err) {
      say(`Failed to generate PDF: ${err.message}`)
    } finally {
      setDownloading(false)
    }
  }

  async function confirmFinalize() {
    setFinalizing(true)
    try {
      const html2pdf = (await import('html2pdf.js')).default;
      const element = document.querySelector('.print-sheet');
      if (element) {
        element.style.display = 'block';
        const opt = {
          margin:       0.5,
          filename:     `Minutes_${meeting.meetingCode}.pdf`,
          image:        { type: 'jpeg', quality: 0.98 },
          html2canvas:  { scale: 2, useCORS: true, logging: false },
          jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
        };
        try {
          const pdfBlob = await html2pdf().set(opt).from(element).output('blob');
          await uploadTempMinutesPdf(meeting.id, pdfBlob);
        } finally {
          element.style.display = '';
        }
      }

      await api(`/meetings/${meeting.id}/minutes/finalize`, { method: 'POST' })
      setShowFinalizeModal(false)
      reload()
      say('Minutes finalized. Publication emails with PDF attachments are on their way.')
    } catch (err) {
      say(err.message)
      setShowFinalizeModal(false)
    } finally {
      setFinalizing(false)
    }
  }
  return (
    <div className="card">
      {finalized && <p className="pill pill-completed" style={{ marginBottom: 12 }}>Finalized {new Date(meeting.minutesFinalizedAt).toLocaleString()} — locked</p>}
      <MinutesEditor
        initialHtml={meeting.minutesHtml}
        agendaItems={meeting.agendaItems}
        attendees={meeting.attendees}
        locked={!editable}
        onSave={async html => {
          await api(`/meetings/${meeting.id}/minutes`, { method: 'PUT', body: JSON.stringify({ minutesHtml: html }) });
          await reload();
          say('Minutes saved.');
        }}
        onCreateAction={async d => {
          await api('/actions', {
            method: 'POST',
            body: JSON.stringify({
              meetingId: meeting.id,
              agendaItemId: d.agendaItemId || null,
              description: d.description,
              assigneeId: d.assigneeUserId || null,
              contactId: d.assigneeContactId || null,
              dueDate: d.dueDate || null
            })
          })
          reload()
          say('Action point created — the assignee has been emailed.')
        }} />
      <div className="form-actions no-print" style={{ justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn ghost" type="button" onClick={downloadPdf} disabled={downloading}>
            {downloading ? 'Generating PDF...' : 'Download PDF 📄'}
          </button>
          <button className="btn ghost" type="button" onClick={() => window.print()}>Print 🖨️</button>
        </div>
        {editable && !finalized && <button className="btn" type="button" onClick={() => setShowFinalizeModal(true)}>Finalize and publish</button>}
      </div>

      {showFinalizeModal && (
        <div className="modal-backdrop">
          <div className="card modal-content" style={{ maxWidth: 400, textAlign: 'center', padding: '24px 30px' }}>
            <div style={{ fontSize: '2.5rem', color: 'var(--bottle)', marginBottom: 12 }}>📜</div>
            <h3 style={{ marginTop: 0 }}>Finalize & Publish Minutes</h3>
            <p style={{ color: 'var(--ink-soft)', fontSize: '0.9rem', marginBottom: 20 }}>
              Finalize the minutes? The record locks permanently and every attendee will be emailed the finalized minutes PDF.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                className="btn ghost"
                style={{ flex: 1 }}
                onClick={() => setShowFinalizeModal(false)}
                disabled={finalizing}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn"
                style={{ flex: 1 }}
                onClick={confirmFinalize}
                disabled={finalizing}
              >
                {finalizing ? 'Finalizing...' : 'Finalize & publish'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ------------ Actions ------------ */
function ActionsTab({ meeting, reload }) {
  const user = getUser()
  const isManagement = ['Secretary', 'Admin'].includes(user.role)
  return (
    <div className="card table-wrap">
      <table>
        <thead><tr><th>Action</th><th>Assignee</th><th>Due</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {meeting.actionPoints.map(a => (
            <tr key={a.id}>
              <td>{a.description}</td>
              <td>{a.assigneeName}</td>
              <td>{a.dueDate ? new Date(a.dueDate).toLocaleDateString() : '—'}</td>
              <td><span className={`pill pill-${a.status.toLowerCase()}`}>{a.status}</span></td>
              <td>
                {a.status !== 'Completed' && (a.assigneeId === user.id || isManagement) && (
                  <button className="btn small" onClick={async () => { await api(`/actions/${a.id}/complete`, { method: 'POST' }); reload() }}>Complete</button>
                )}
              </td>
            </tr>
          ))}
          {meeting.actionPoints.length === 0 && <tr><td colSpan="5" style={{ color: 'var(--ink-soft)' }}>No action points. Create them from the minutes editor.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

/* ------------ Print-only minute book sheet ------------ */
function PrintSheet({ meeting, companyName }) {
  const chair = meeting.attendees.find(a => a.isChair)
  return (
    <div className="print-sheet">
      <header>
        <p className="ps-company">{companyName}</p>
        <h1>{meeting.title}</h1>
        <p className="ps-docket">{meeting.meetingCode}</p>
        <p className="ps-meta">
          {new Date(meeting.scheduledAtUtc).toUTCString().replace('GMT', 'UTC')} · {meeting.type} meeting · {meeting.mode}
          <br />
          {meeting.mode !== 'Online' && meeting.location ? `Location: ${meeting.location}` : ''}
          {meeting.mode === 'Hybrid' ? ' · ' : ''}
          {meeting.mode !== 'Physical' && meeting.videoLink ? `Video link: ${meeting.videoLink}` : ''}
        </p>
      </header>

      <section>
        <h2>Attendees</h2>
        <ul>
          {meeting.attendees.map((a, i) => (
            <li key={i}>
              {a.name}
              {a.isChair ? ' — Chairperson' : ''}
              {a.isContact ? ` — ${a.title || ''}` : ''}
            </li>
          ))}
        </ul>
        {chair && <p className="ps-note">The meeting was chaired by {chair.name}.</p>}
      </section>

      <section>
        <h2>Minutes</h2>
        <div className="ps-minutes" dangerouslySetInnerHTML={{ __html: meeting.minutesHtml || '<p><em>No minutes recorded.</em></p>' }} />
      </section>

      {meeting.actionPoints.length > 0 && (
        <section>
          <h2>Appendix — Action points</h2>
          <table>
            <thead><tr><th>Action</th><th>Assignee</th><th>Due date</th></tr></thead>
            <tbody>
              {meeting.actionPoints.map(a => (
                <tr key={a.id}>
                  <td>{a.description}</td>
                  <td>{a.assigneeName}</td>
                  <td>{a.dueDate ? new Date(a.dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}
