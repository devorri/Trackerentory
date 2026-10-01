import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth, type AppUser } from '../context/Auth'
import { peso } from '../lib/types'
import PasswordInput from '../components/PasswordInput'
import { SkeletonTable } from '../components/Skeleton'

type StaffRow = AppUser & {
  password?: string
  phone_number?: string | null
  social_link?: string | null
}

export default function StaffManagement() {
  const { user } = useAuth()
  const [staff, setStaff] = useState<StaffRow[]>([])
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    full_name: '',
    username: '',
    password: '',
    salary: '0',
    phone_number: '',
    social_link: '',
  })

  async function refresh() {
    setLoading(true)
    const { data } = await supabase
      .from('users')
      .select('user_id, full_name, role, status, salary, username, phone_number, social_link')
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

  async function updateSalary(u: StaffRow) {
    const s = prompt('New salary', String(u.salary || 0))
    if (s == null) return
    const { error } = await supabase.from('users').update({ salary: Number(s) }).eq('user_id', u.user_id)
    if (error) return alert(error.message)
    void refresh()
  }

  async function createStaff() {
    if (!form.full_name || !form.username || !form.password) return alert('Full name, username, and password required.')
    const { error } = await supabase.from('users').insert([{
      full_name: form.full_name.trim(),
      username: form.username.trim(),
      password: form.password,
      role: 'Staff',
      status: 'Active',
      salary: Number(form.salary || 0),
      phone_number: form.phone_number.trim() || null,
      social_link: form.social_link.trim() || null,
    }])
    if (error) return alert(error.message)
    setForm({ full_name: '', username: '', password: '', salary: '0', phone_number: '', social_link: '' })
    void refresh()
  }

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

      <h2>Current staff</h2>
      {loading ? (
        <SkeletonTable rows={3} cols={7} />
      ) : (
        <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Username</th>
              <th>Phone</th>
              <th>Social Link</th>
              <th>Status</th>
              <th>Salary</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.user_id}>
                <td><strong>{s.full_name}</strong></td>
                <td>{s.username}</td>
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
                  <button className="btn-ghost" type="button" onClick={() => updateSalary(s)}>Edit salary</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
      {staff.length === 0 && !loading && <div className="empty">No staff accounts.</div>}
    </section>
  )
}
