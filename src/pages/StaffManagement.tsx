import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth, type AppUser } from '../context/Auth'
import { peso } from '../lib/types'
import PasswordInput from '../components/PasswordInput'
import { SkeletonTable } from '../components/Skeleton'

type StaffRow = AppUser & {
  phone_number?: string | null
  social_link?: string | null
  deleted_at?: string | null
}

export default function StaffManagement() {
  const { user } = useAuth()
  const [staff, setStaff] = useState<StaffRow[]>([])
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<'active' | 'trash'>('active')
  const [editing, setEditing] = useState<StaffRow | null>(null)
  const [editForm, setEditForm] = useState({
    full_name: '',
    username: '',
    email: '',
    salary: '0',
    phone_number: '',
    social_link: '',
  })
  const [form, setForm] = useState({
    full_name: '',
    username: '',
    password: '',
    email: '',
    salary: '0',
    phone_number: '',
    social_link: '',
  })

  async function refresh() {
    setLoading(true)
    const { data } = await supabase
      .from('users')
      .select('user_id, full_name, role, status, salary, username, email, phone_number, social_link, deleted_at')
      .eq('role', 'Staff')
      .order('full_name')
    setLoading(false)
    setStaff((data || []) as StaffRow[])
  }

  useEffect(() => { void refresh() }, [])

  if (!user || user.role !== 'Owner') {
    return (
      <section>
        <div className="page-header">
          <div>
            <h1>Staff</h1>
            <p className="lede">Owner only. <Link to="/login">Sign in</Link></p>
          </div>
        </div>
      </section>
    )
  }

  async function updateStatus(u: StaffRow, status: string) {
    const { error } = await supabase.from('users').update({ status }).eq('user_id', u.user_id)
    if (error) return alert(error.message)
    void refresh()
  }

  function beginEdit(u: StaffRow) {
    setEditing(u)
    setEditForm({
      full_name: u.full_name,
      username: u.username,
      email: u.email || '',
      salary: String(u.salary || 0),
      phone_number: u.phone_number || '',
      social_link: u.social_link || '',
    })
  }

  async function saveEdit() {
    if (!editing || !editForm.full_name.trim() || !editForm.username.trim() || !editForm.email.trim()) {
      return alert('Name, username, and email are required.')
    }
    const { error } = await supabase.from('users').update({
      full_name: editForm.full_name.trim(),
      username: editForm.username.trim(),
      email: editForm.email.trim(),
      salary: Number(editForm.salary || 0),
      phone_number: editForm.phone_number.trim() || null,
      social_link: editForm.social_link.trim() || null,
    }).eq('user_id', editing.user_id)
    if (error) return alert(error.message)
    setEditing(null)
    void refresh()
  }

  async function moveToTrash(u: StaffRow) {
    if (!window.confirm(`Move ${u.full_name} to Trash?`)) return
    const { error } = await supabase.from('users').update({ deleted_at: new Date().toISOString() }).eq('user_id', u.user_id)
    if (error) return alert(error.message)
    void refresh()
  }

  async function restore(u: StaffRow) {
    const { error } = await supabase.from('users').update({ deleted_at: null }).eq('user_id', u.user_id)
    if (error) return alert(error.message)
    void refresh()
  }

  async function deletePermanently(u: StaffRow) {
    if (!window.confirm(`Permanently delete ${u.full_name}? This cannot be undone.`)) return
    const { error } = await supabase.from('users').delete().eq('user_id', u.user_id)
    if (error) return alert(error.message)
    void refresh()
  }

  async function createStaff() {
    if (!form.full_name || !form.username || !form.password || !form.email) return alert('Full name, username, email, and password required.')
    const { error } = await supabase.from('users').insert([{
      full_name: form.full_name.trim(),
      username: form.username.trim(),
      password: form.password,
      email: form.email.trim(),
      role: 'Staff',
      status: 'Active',
      salary: Number(form.salary || 0),
      phone_number: form.phone_number.trim() || null,
      social_link: form.social_link.trim() || null,
    }])
    if (error) return alert(error.message)
    setForm({ full_name: '', username: '', password: '', email: '', salary: '0', phone_number: '', social_link: '' })
    void refresh()
  }

  const displayedStaff = staff.filter((member) => tab === 'trash' ? Boolean(member.deleted_at) : !member.deleted_at)

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>Staff accounts</h1>
          <p className="lede">Track Active, On Leave, and Resigned staff — plus salary, phone numbers, and social contact details.</p>
        </div>
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Create staff account</h2>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem' }}>
          <div className="field">
            <label>Full name</label>
            <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </div>
          <div className="field">
            <label>Username</label>
            <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          </div>
          <div className="field">
            <label>Email for OTP</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <PasswordInput label="Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <div className="field">
            <label>Salary (₱)</label>
            <input type="number" value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} />
          </div>
          <div className="field">
            <label>Phone Number</label>
            <input
              placeholder="e.g. 0917-123-4567"
              value={form.phone_number}
              onChange={(e) => setForm({ ...form, phone_number: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Social / Messenger</label>
            <input
              placeholder="e.g. fb.com/username"
              value={form.social_link}
              onChange={(e) => setForm({ ...form, social_link: e.target.value })}
            />
          </div>
        </div>
        <button className="btn" type="button" style={{ marginTop: 16 }} onClick={createStaff}>Create staff</button>
      </div>

      <div className="row" style={{ margin: '1.5rem 0 1rem' }}>
        <button className={tab === 'active' ? 'btn' : 'btn-ghost'} type="button" onClick={() => setTab('active')}>
          Current staff ({staff.filter((member) => !member.deleted_at).length})
        </button>
        <button className={tab === 'trash' ? 'btn' : 'btn-ghost'} type="button" onClick={() => setTab('trash')}>
          Trash ({staff.filter((member) => member.deleted_at).length})
        </button>
      </div>
      {loading ? (
        <SkeletonTable rows={3} cols={7} />
      ) : (
        <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Username</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Social Link</th>
              <th>Status</th>
              <th>Salary</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {displayedStaff.map((s) => (
              <tr key={s.user_id}>
                <td><strong>{s.full_name}</strong></td>
                <td>{s.username}</td>
                <td>{s.email || '—'}</td>
                <td>{s.phone_number || <span className="muted">—</span>}</td>
                <td>
                  {s.social_link ? (
                    <a
                      href={s.social_link.startsWith('http') ? s.social_link : `https://${s.social_link}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'var(--accent)', textDecoration: 'underline' }}
                    >
                      {s.social_link}
                    </a>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td>
                  <select
                    value={s.status || 'Active'}
                    onChange={(e) => updateStatus(s, e.target.value)}
                  >
                    <option value="Active">Active</option>
                    <option value="On Leave">On Leave</option>
                    <option value="Resigned">Resigned</option>
                  </select>
                </td>
                <td>{peso(s.salary)}</td>
                <td>
                  {tab === 'trash' ? (
                    <div className="row">
                      <button className="btn-ghost" type="button" onClick={() => restore(s)}>Restore</button>
                      <button className="btn-ghost" type="button" onClick={() => void deletePermanently(s)}>Delete</button>
                    </div>
                  ) : (
                    <div className="row">
                      <button className="btn-ghost" type="button" onClick={() => beginEdit(s)}>Edit</button>
                      <button className="btn-ghost" type="button" onClick={() => void moveToTrash(s)}>Trash</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
      {displayedStaff.length === 0 && !loading && <div className="empty">{tab === 'trash' ? 'Trash is empty.' : 'No staff accounts.'}</div>}

      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit staff account</h2>
              <button className="modal-close" type="button" onClick={() => setEditing(null)}>×</button>
            </div>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
              <div className="field"><label>Full name</label><input value={editForm.full_name} onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })} /></div>
              <div className="field"><label>Username</label><input value={editForm.username} onChange={(e) => setEditForm({ ...editForm, username: e.target.value })} /></div>
              <div className="field"><label>Email for OTP</label><input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} /></div>
              <div className="field"><label>Salary</label><input type="number" value={editForm.salary} onChange={(e) => setEditForm({ ...editForm, salary: e.target.value })} /></div>
              <div className="field"><label>Phone</label><input value={editForm.phone_number} onChange={(e) => setEditForm({ ...editForm, phone_number: e.target.value })} /></div>
              <div className="field"><label>Social link</label><input value={editForm.social_link} onChange={(e) => setEditForm({ ...editForm, social_link: e.target.value })} /></div>
            </div>
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button className="btn-ghost" type="button" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn" type="button" onClick={() => void saveEdit()}>Save changes</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
