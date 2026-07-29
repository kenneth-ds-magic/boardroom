/**
 * Attendee cards with single-chair selection.
 * value: [{ userId, contactId, isChair }] — polymorphic (exactly one id set per entry).
 * directory: entries from GET /api/auth/users ({ userId, contactId, name, title, role, isContact }).
 */
export default function AttendeePicker({ directory, value, onChange }) {
  const keyOf = d => d.isContact ? `c:${d.contactId}` : `u:${d.userId}`
  const entryFor = d => value.find(a => d.isContact ? a.contactId === d.contactId : a.userId === d.userId)
  const chairTaken = value.some(a => a.isChair)

  function getInitials(name) {
    if (!name) return '?'
    const parts = name.trim().split(/\s+/)
    if (parts.length === 1) return parts[0].substring(0, 2)
    return (parts[0][0] + parts[parts.length - 1][0]).substring(0, 2)
  }

  function toggle(d) {
    const existing = entryFor(d)
    if (existing) onChange(value.filter(a => a !== existing))
    else onChange([...value, { userId: d.isContact ? null : d.userId, contactId: d.isContact ? d.contactId : null, isChair: false }])
  }

  function setChair(d, isChair) {
    onChange(value.map(a => {
      const mine = d.isContact ? a.contactId === d.contactId : a.userId === d.userId
      return { ...a, isChair: mine ? isChair : false }   // single-chair constraint
    }))
  }

  return (
    <div className="attendee-cards">
      {directory.map(d => {
        const entry = entryFor(d)
        const selected = !!entry
        return (
          <div key={keyOf(d)} className={`attendee-card ${selected ? 'selected' : ''}`}>
            <label className="attendee-main">
              <input type="checkbox" checked={selected} onChange={() => toggle(d)} style={{ marginRight: 6 }} />
              <span className="attendee-avatar">{getInitials(d.name)}</span>
              <div className="attendee-info">
                <span className="attendee-name">
                  {d.name}
                  {d.isContact && <span className="pill pill-contact">external contact</span>}
                </span>
                <span className="attendee-sub">{d.title || d.role}</span>
              </div>
            </label>
            {selected && (
              entry.isChair ? (
                <button type="button" className="chair-btn is-chair" onClick={() => setChair(d, false)}
                        title="Click to unset chair">Chair ★</button>
              ) : !chairTaken ? (
                <button type="button" className="chair-btn" onClick={() => setChair(d, true)}>Make chair</button>
              ) : null
            )}
          </div>
        )
      })}
      {directory.length === 0 && <p style={{ color: 'var(--ink-soft)', fontSize: '0.85rem' }}>No directory entries yet.</p>}
    </div>
  )
}
