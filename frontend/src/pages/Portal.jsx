import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

/**
 * Landing page for personalized secure links from emails.
 * Paper links stream the file directly; meeting/minutes links render a read-only view.
 */
export default function Portal() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/portal/${token}`).then(async res => {
      const ct = res.headers.get('content-type') || ''
      if (!res.ok) throw new Error((await res.json()).error || 'Link invalid')
      if (!ct.includes('application/json')) {
        // It's a file download — re-navigate so the browser handles it
        window.location.href = `/api/portal/${token}`
        return
      }
      setData(await res.json())
    }).catch(e => setError(e.message))
  }, [token])

  if (error) return <div className="card"><h2>Link unavailable</h2><p>{error}</p></div>
  if (!data) return <p>Opening secure workspace…</p>

  const m = data.meeting
  return (
    <>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        <span className={`docket ${m.minutesStatus === 'Finalized' ? 'finalized' : ''}`}>{m.meetingCode}</span>
        <h1 style={{ margin: 0 }}>{m.title}</h1>
      </div>
      <p style={{ color: 'var(--ink-soft)' }}>
        {m.type} meeting · {new Date(m.scheduledAtUtc).toLocaleString()} · {m.location}
      </p>

      {data.kind === 'Minutes' || m.minutesStatus === 'Finalized' ? (
        <div className="card">
          <h2>Minutes {m.minutesStatus === 'Finalized' ? '(finalized record)' : '(draft)'}</h2>
          <div className="minutes-readonly" dangerouslySetInnerHTML={{ __html: m.minutesHtml || '<p>Minutes not yet recorded.</p>' }} />
        </div>
      ) : (
        <div className="card">
          <h2>Agenda</h2>
          <ol>{m.agendaItems.map(a => <li key={a.id}>{a.title}{a.presenter && ` — ${a.presenter}`}</li>)}</ol>
        </div>
      )}

      {m.actionPoints?.length > 0 && (
        <div className="card">
          <h2>Action points</h2>
          <table className="plain">
            <thead><tr><th>Action</th><th>Assignee</th><th>Due</th><th>Status</th></tr></thead>
            <tbody>{m.actionPoints.map(a => (
              <tr key={a.id}><td>{a.description}</td><td>{a.assigneeName}</td><td>{a.dueDate || '—'}</td><td>{a.status}</td></tr>))}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ fontSize: '0.8rem', color: 'var(--ink-soft)' }}>
        You're viewing this through a personal secure link. For full access, sign in to BoardRoom.
      </p>
    </>
  )
}
