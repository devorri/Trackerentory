import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth, type AppUser } from '../context/Auth'
import { peso } from '../lib/types'

type StaffRow = AppUser & { password?: string }

export default function StaffManagement() {
  const { user } = useAuth()
  const [staff, setStaff] = useState<StaffRow[]>([])
  const [form, setForm] = useState({
    full_name: '',
    username: '',
    password: '',
    salary: '0',
  })

  async function refresh() {
    const { data } = await supabase
      .from('users')
      .select('user_id, full_name, role, status, salary, username')
      .eq('role', 'Staff')
      .order('full_name')
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
    if (!form.full_name || !form.username || !form.password) return alert('All fields required.')
    const { error } = await supabase.from('users').insert([{
      full_name: form.full_name,
      username: form.username,
      password: form.password,
      role: 'Staff',
      status: 'Active',
      salary: Number(form.salary || 0),
    }])
    if (error) return alert(error.message)
    setForm({ full_name: '', username: '', password: '', salary: '0' })
    void refresh()
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>Staff accounts</h1>
          <p className="lede">Track Active, On Leave, and Resigned staff — plus salary and account details.</p>
        </div>
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Create staff account</h2>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
          <div className="field">
            <label>Full name</label>
            <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </div>
          <div className="field">
            <label>Username</label>
            <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          </div>
          <div className="field">
            <label>Password</label>
            <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <div className="field">
            <label>Salary</label>
            <input type="number" value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} />
          </div>
        </div>
        <button className="btn" type="button" onClick={createStaff}>Create staff</button>
      </div>

      <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Username</th>
            <th>Status</th>
            <th>Salary</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {staff.map((u) => (
            <tr key={u.user_id}>
              <td>{u.full_name}</td>
              <td>{u.username}</td>
              <td>
                <span className={`badge ${u.status === 'Active' ? 'ok' : u.status === 'On Leave' ? 'warn' : 'bad'}`}>
                  {u.status}
                </span>
              </td>
              <td>{peso(u.salary)}</td>
              <td>
                <div className="row">
                  <button className="btn-ghost" type="button" onClick={() => updateStatus(u, 'Active')}>Active</button>
                  <button className="btn-ghost" type="button" onClick={() => updateStatus(u, 'On Leave')}>On Leave</button>
                  <button className="btn-ghost" type="button" onClick={() => updateStatus(u, 'Resigned')}>Resigned</button>
                  <button className="btn" type="button" onClick={() => updateSalary(u)}>Salary</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      {staff.length === 0 && <div className="empty" style={{ marginTop: '1rem' }}>No staff accounts yet.</div>}
    </section>
  )
}
