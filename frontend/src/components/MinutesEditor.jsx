import { useEffect, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'

/**
 * Rich-text minutes editor. The secretary can insert agenda item headings,
 * take notes under them, and raise action points directly from the editor
 * (selected text becomes the action description).
 */
export default function MinutesEditor({ initialHtml, agendaItems, users, onSave, onCreateAction, locked }) {
  const [dirty, setDirty] = useState(false)
  const [actionDraft, setActionDraft] = useState(null) // {description, assigneeId, dueDate, agendaItemId}

  const editor = useEditor({
    extensions: [StarterKit, Placeholder.configure({ placeholder: 'Minutes of the meeting…' })],
    content: initialHtml || '',
    editable: !locked,
    onUpdate: () => setDirty(true)
  })

  useEffect(() => { editor?.setEditable(!locked) }, [locked, editor])
  if (!editor) return null

  const B = ({ label, on, run, title }) => (
    <button type="button" title={title || label} className={on ? 'on' : ''} onClick={run} disabled={locked}>{label}</button>
  )

  function insertAgendaItem(item) {
    editor.chain().focus().insertContent(
      `<h3>${item.sortOrder + 1}. ${item.title}</h3><p></p>`).run()
  }

  function startAction() {
    const { from, to } = editor.state.selection
    const selected = editor.state.doc.textBetween(from, to, ' ')
    setActionDraft({ description: selected || '', assigneeId: '', dueDate: '', agendaItemId: '' })
  }

  async function saveAction() {
    if (!actionDraft.description || !actionDraft.assigneeId) return
    await onCreateAction(actionDraft)
    editor.chain().focus().insertContent(
      `<p><strong>ACTION:</strong> ${actionDraft.description}</p>`).run()
    setActionDraft(null)
  }

  return (
    <div>
      {!locked && (
        <div className="editor-toolbar" role="toolbar" aria-label="Formatting">
          <B label="B" title="Bold" on={editor.isActive('bold')} run={() => editor.chain().focus().toggleBold().run()} />
          <B label="I" title="Italic" on={editor.isActive('italic')} run={() => editor.chain().focus().toggleItalic().run()} />
          <B label="H2" on={editor.isActive('heading', { level: 2 })} run={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
          <B label="H3" on={editor.isActive('heading', { level: 3 })} run={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} />
          <B label="• List" on={editor.isActive('bulletList')} run={() => editor.chain().focus().toggleBulletList().run()} />
          <B label="1. List" on={editor.isActive('orderedList')} run={() => editor.chain().focus().toggleOrderedList().run()} />
          <B label="❝" title="Blockquote" on={editor.isActive('blockquote')} run={() => editor.chain().focus().toggleBlockquote().run()} />
          <span style={{ width: 12 }} />
          {agendaItems?.length > 0 && (
            <select style={{ width: 'auto', padding: '3px 6px', fontSize: '0.85rem' }}
              value="" onChange={e => { const it = agendaItems.find(a => a.id === e.target.value); if (it) insertAgendaItem(it) }}>
              <option value="">Insert agenda item…</option>
              {agendaItems.map((a, i) => <option key={a.id} value={a.id}>{i + 1}. {a.title}</option>)}
            </select>
          )}
          <button type="button" className="on" style={{ marginLeft: 'auto' }} onClick={startAction}>+ Action point</button>
        </div>
      )}

      <EditorContent editor={editor} className={locked ? 'minutes-readonly' : ''} />

      {!locked && (
        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          <button className="btn" disabled={!dirty}
            onClick={async () => { await onSave(editor.getHTML()); setDirty(false) }}>
            Save minutes
          </button>
          {dirty && <span style={{ alignSelf: 'center', fontSize: '0.82rem', color: 'var(--ink-soft)' }}>Unsaved changes</span>}
        </div>
      )}

      {actionDraft && (
        <div className="card" style={{ marginTop: 14, borderColor: 'var(--bottle)' }}>
          <h3>New action point</h3>
          <label>Description</label>
          <input value={actionDraft.description} onChange={e => setActionDraft(d => ({ ...d, description: e.target.value }))} />
          <div className="grid2">
            <div>
              <label>Assignee (registered users only)</label>
              <select value={actionDraft.assigneeId} onChange={e => setActionDraft(d => ({ ...d, assigneeId: e.target.value }))}>
                <option value="">Choose…</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div>
              <label>Due date</label>
              <input type="date" value={actionDraft.dueDate} onChange={e => setActionDraft(d => ({ ...d, dueDate: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button className="btn" onClick={saveAction} disabled={!actionDraft.description || !actionDraft.assigneeId}>
              Create and notify assignee
            </button>
            <button className="btn secondary" onClick={() => setActionDraft(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
