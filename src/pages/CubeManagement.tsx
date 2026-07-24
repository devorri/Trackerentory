import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/Auth'
import { type Cube, peso } from '../lib/types'

const initialForm = {
  cube_number: '',
  type: 'Display',
  price_per_month: '0',
  status: 'Available',
}

export default function CubeManagement() {
  const { user } = useAuth()
  const [cubes, setCubes] = useState<Cube[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(initialForm)
  const [editId, setEditId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState(initialForm)

  async function loadCubes() {
    setLoading(true)
    const { data, error } = await supabase.from('cubes').select('*').order('cube_number')
    setLoading(false)
    if (error) return alert(error.message)
    setCubes((data || []) as Cube[])
  }

  useEffect(() => {
    void loadCubes()
  }, [])

  async function createCube() {
    if (!form.cube_number || !form.price_per_month) {
      return alert('Cube number and price are required.')
    }
    setSaving(true)
    const { error } = await supabase.from('cubes').insert([{
      cube_number: form.cube_number,
      type: form.type as Cube['type'],
      price_per_month: Number(form.price_per_month),
      status: form.status as Cube['status'],
    }])
    setSaving(false)
    if (error) return alert(error.message)
    setForm(initialForm)
    await loadCubes()
  }

  async function saveCube() {
    if (!editId || !editForm.cube_number || !editForm.price_per_month) {
      return alert('Cube number and price are required.')
    }
    setSaving(true)
    const { error } = await supabase.from('cubes').update({
      cube_number: editForm.cube_number,
      type: editForm.type as Cube['type'],
      price_per_month: Number(editForm.price_per_month),
      status: editForm.status as Cube['status'],
    }).eq('cube_id', editId)
    setSaving(false)
    if (error) return alert(error.message)
    setEditId(null)
    setEditForm(initialForm)
    await loadCubes()
  }

  async function removeCube(cube_id: number) {
    if (!window.confirm('Delete this cube? This cannot be undone.')) return
    const { error } = await supabase.from('cubes').delete().eq('cube_id', cube_id)
    if (error) return alert(error.message)
    await loadCubes()
  }

  function beginEdit(cube: Cube) {
    setEditId(cube.cube_id)
    setEditForm({
      cube_number: cube.cube_number,
      type: cube.type,
      price_per_month: String(cube.price_per_month),
      status: cube.status,
    })
  }

  if (!user) {
    return (
      <section>
        <div className="page-header">
          <div>
            <h1>Cube management</h1>
            <p className="lede">Please <Link to="/login">sign in</Link> as Owner to manage cubes.</p>
          </div>
        </div>
      </section>
    )
  }

  if (user.role !== 'Owner') {
    return (
      <section>
        <div className="page-header">
          <div>
            <h1>Cube management</h1>
            <p className="lede">Owner only. <Link to="/login">Sign in</Link> with an Owner account.</p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>Cube management</h1>
          <p className="lede">Create, edit, and delete cubes directly from the app.</p>
        </div>
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>{editId ? 'Edit cube' : 'Add new cube'}</h2>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
          <div className="field">
            <label>Cube number</label>
            <input value={editId ? editForm.cube_number : form.cube_number} onChange={(e) => {
              if (editId) setEditForm({ ...editForm, cube_number: e.target.value })
              else setForm({ ...form, cube_number: e.target.value })
            }} />
          </div>
          <div className="field">
            <label>Type</label>
            <select value={editId ? editForm.type : form.type} onChange={(e) => {
              if (editId) setEditForm({ ...editForm, type: e.target.value as Cube['type'] })
              else setForm({ ...form, type: e.target.value as Cube['type'] })
            }}>
              <option value="Display">Display</option>
              <option value="Pick-up">Pick-up</option>
            </select>
          </div>
          <div className="field">
            <label>Price per month</label>
            <input type="number" min="0" value={editId ? editForm.price_per_month : form.price_per_month} onChange={(e) => {
              if (editId) setEditForm({ ...editForm, price_per_month: e.target.value })
              else setForm({ ...form, price_per_month: e.target.value })
            }} />
          </div>
          <div className="field">
            <label>Status</label>
            <select value={editId ? editForm.status : form.status} onChange={(e) => {
              if (editId) setEditForm({ ...editForm, status: e.target.value as Cube['status'] })
              else setForm({ ...form, status: e.target.value as Cube['status'] })
            }}>
              <option value="Available">Available</option>
              <option value="Occupied">Occupied</option>
            </select>
          </div>
        </div>
        <div className="row" style={{ marginTop: '1rem' }}>
          <button className="btn" type="button" disabled={saving} onClick={editId ? saveCube : createCube}>
            {saving ? 'Saving…' : editId ? 'Save changes' : 'Create cube'}
          </button>
          {editId && (
            <button className="btn-ghost" type="button" onClick={() => {
              setEditId(null)
              setEditForm(initialForm)
            }}>
              Cancel
            </button>
          )}
        </div>
      </div>

      <h2>Existing cubes</h2>
      {loading ? (
        <p className="muted">Loading cubes…</p>
      ) : cubes.length === 0 ? (
        <div className="empty">No cubes found yet. Add one above.</div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Cube</th>
                <th>Type</th>
                <th>Rent</th>
                <th>Status</th>
                <th className="no-print">Actions</th>
              </tr>
            </thead>
            <tbody>
              {cubes.map((cube) => (
                <tr key={cube.cube_id}>
                  <td>{cube.cube_number}</td>
                  <td>{cube.type}</td>
                  <td>{peso(cube.price_per_month)}</td>
                  <td>{cube.status}</td>
                  <td className="no-print">
                    <div className="row">
                      <button className="btn-ghost" type="button" onClick={() => beginEdit(cube)}>Edit</button>
                      <button className="btn" type="button" onClick={() => removeCube(cube.cube_id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
