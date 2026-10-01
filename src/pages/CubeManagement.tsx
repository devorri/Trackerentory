import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/Auth'
import { type Cube, peso } from '../lib/types'
import { SkeletonTable } from '../components/Skeleton'
import { uploadPublicImage } from '../lib/storage'
import { BUCKET_PRODUCT_IMAGES } from '../lib/supabase'

type Tab = 'Display' | 'Pick-up' | 'Trash'

const initialForm = {
  cube_number: '',
  location: '',
  type: 'Display' as 'Display' | 'Pick-up',
  price_per_month: '0',
  status: 'Available' as 'Available' | 'Occupied',
  width_cm: '',
  height_cm: '',
  image_url: '',
}

export default function CubeManagement() {
  const { user } = useAuth()
  const [cubes, setCubes] = useState<Cube[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [currentTab, setCurrentTab] = useState<Tab>('Display')

  // Create form
  const [form, setForm] = useState(initialForm)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)

  // Edit modal
  const [editId, setEditId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState(initialForm)
  const [editImageFile, setEditImageFile] = useState<File | null>(null)
  const [editImagePreview, setEditImagePreview] = useState<string | null>(null)

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

  const activeCubes = useMemo(() => cubes.filter((c) => !c.deleted_at), [cubes])
  const trashCubes = useMemo(() => cubes.filter((c) => Boolean(c.deleted_at)), [cubes])

  const displayCubes = useMemo(() => activeCubes.filter((c) => c.type === 'Display'), [activeCubes])
  const pickupCubes = useMemo(() => activeCubes.filter((c) => c.type === 'Pick-up'), [activeCubes])

  async function createCube() {
    if (!form.cube_number || !form.price_per_month) {
      return alert('Cube number and price are required.')
    }
    setSaving(true)

    let finalImageUrl = form.image_url
    if (imageFile) {
      const up = await uploadPublicImage(BUCKET_PRODUCT_IMAGES, imageFile, 'cubes')
      if (up.error || !up.url) {
        setSaving(false)
        return alert('Image upload failed: ' + (up.error || 'unknown error'))
      }
      finalImageUrl = up.url
    }

    const { error } = await supabase.from('cubes').insert([{
      cube_number: form.cube_number.trim(),
      location: form.location.trim() || null,
      type: form.type,
      price_per_month: Number(form.price_per_month),
      status: form.status,
      width_cm: form.width_cm ? Number(form.width_cm) : null,
      height_cm: form.height_cm ? Number(form.height_cm) : null,
      image_url: finalImageUrl || null,
    }])
    setSaving(false)
    if (error) return alert(error.message)

    setForm(initialForm)
    setImageFile(null)
    setImagePreview(null)
    await loadCubes()
  }

  function beginEdit(cube: Cube) {
    setEditId(cube.cube_id)
    setEditForm({
      cube_number: cube.cube_number,
      location: cube.location || '',
      type: cube.type,
      price_per_month: String(cube.price_per_month),
      status: cube.status,
      width_cm: cube.width_cm ? String(cube.width_cm) : '',
      height_cm: cube.height_cm ? String(cube.height_cm) : '',
      image_url: cube.image_url || '',
    })
    setEditImageFile(null)
    setEditImagePreview(cube.image_url || null)
  }

  async function saveCube() {
    if (!editId || !editForm.cube_number || !editForm.price_per_month) {
      return alert('Cube number and price are required.')
    }
    setSaving(true)

    let finalImageUrl = editForm.image_url
    if (editImageFile) {
      const up = await uploadPublicImage(BUCKET_PRODUCT_IMAGES, editImageFile, 'cubes')
      if (up.error || !up.url) {
        setSaving(false)
        return alert('Image upload failed: ' + (up.error || 'unknown error'))
      }
      finalImageUrl = up.url
    }

    const { error } = await supabase.from('cubes').update({
      cube_number: editForm.cube_number.trim(),
      location: editForm.location.trim() || null,
      type: editForm.type,
      price_per_month: Number(editForm.price_per_month),
      status: editForm.status,
      width_cm: editForm.width_cm ? Number(editForm.width_cm) : null,
      height_cm: editForm.height_cm ? Number(editForm.height_cm) : null,
      image_url: finalImageUrl || null,
    }).eq('cube_id', editId)

    setSaving(false)
    if (error) return alert(error.message)
    setEditId(null)
    setEditForm(initialForm)
    setEditImageFile(null)
    setEditImagePreview(null)
    await loadCubes()
  }

  // Soft delete: move to trash
  async function moveToTrash(cube_id: number) {
    if (!window.confirm('Move this cube to Trash?')) return
    const { error } = await supabase
      .from('cubes')
      .update({ deleted_at: new Date().toISOString() })
      .eq('cube_id', cube_id)
    if (error) return alert(error.message)
    await loadCubes()
  }

  // Restore from trash
  async function restoreFromTrash(cube_id: number) {
    const { error } = await supabase
      .from('cubes')
      .update({ deleted_at: null })
      .eq('cube_id', cube_id)
    if (error) return alert(error.message)
    await loadCubes()
  }

  // Permanent delete
  async function permanentDelete(cube_id: number) {
    if (!window.confirm('Permanently delete this cube? This cannot be undone.')) return
    const { error } = await supabase.from('cubes').delete().eq('cube_id', cube_id)
    if (error) return alert(error.message)
    await loadCubes()
  }

  if (!user || (user.role !== 'Owner' && user.role !== 'Staff')) {
    return (
      <section>
        <div className="page-header">
          <div>
            <h1>Cube management</h1>
            <p className="lede">Staff and Owner access only. Please <Link to="/login">sign in</Link>.</p>
          </div>
        </div>
      </section>
    )
  }

  const currentList = currentTab === 'Display'
    ? displayCubes
    : currentTab === 'Pick-up'
      ? pickupCubes
      : trashCubes

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>Cube Management</h1>
          <p className="lede">Manage display and pick-up cubes, dimensions, images, rental pricing, and trash recovery.</p>
        </div>
      </div>

      {/* CREATE CUBE PANEL */}
      <div className="panel" style={{ marginBottom: '2rem' }}>
        <h2 style={{ marginTop: 0 }}>Add New Cube</h2>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
          <div className="field">
            <label>Cube Number / Identifier</label>
            <input
              placeholder="e.g. C-101"
              value={form.cube_number}
              onChange={(e) => setForm({ ...form, cube_number: e.target.value })}
            />
          </div>

          <div className="field">
            <label>Type</label>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as 'Display' | 'Pick-up' })}
            >
              <option value="Display">Display</option>
              <option value="Pick-up">Pick-up</option>
            </select>
          </div>

          <div className="field">
            <label>Location</label>
            <input
              placeholder="e.g. Front display area"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
            />
          </div>

          <div className="field">
            <label>Monthly Rent (₱)</label>
            <input
              type="number"
              min="0"
              value={form.price_per_month}
              onChange={(e) => setForm({ ...form, price_per_month: e.target.value })}
            />
          </div>

          <div className="field">
            <label>Status</label>
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as 'Available' | 'Occupied' })}
            >
              <option value="Available">Available</option>
              <option value="Occupied">Occupied</option>
            </select>
          </div>

          <div className="field">
            <label>Width (cm)</label>
            <input
              type="number"
              placeholder="e.g. 40"
              value={form.width_cm}
              onChange={(e) => setForm({ ...form, width_cm: e.target.value })}
            />
          </div>

          <div className="field">
            <label>Height (cm)</label>
            <input
              type="number"
              placeholder="e.g. 40"
              value={form.height_cm}
              onChange={(e) => setForm({ ...form, height_cm: e.target.value })}
            />
          </div>

          <div className="field" style={{ gridColumn: 'span 2' }}>
            <label>Cube Photo</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) {
                  setImageFile(f)
                  setImagePreview(URL.createObjectURL(f))
                }
              }}
            />
            {imagePreview && (
              <div style={{ marginTop: '0.5rem' }}>
                <img src={imagePreview} alt="Preview" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 6, border: '1px solid #ddd' }} />
              </div>
            )}
          </div>
        </div>

        <div style={{ marginTop: '1.25rem' }}>
          <button className="btn" type="button" disabled={saving} onClick={createCube}>
            {saving ? 'Creating…' : 'Create Cube'}
          </button>
        </div>
      </div>

      {/* SECTION TABS */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', borderBottom: '2px solid #efefef', paddingBottom: '0.5rem' }}>
        <button
          type="button"
          className={currentTab === 'Display' ? 'btn' : 'btn-ghost'}
          onClick={() => setCurrentTab('Display')}
        >
          Display Cubes ({displayCubes.length})
        </button>
        <button
          type="button"
          className={currentTab === 'Pick-up' ? 'btn' : 'btn-ghost'}
          onClick={() => setCurrentTab('Pick-up')}
        >
          Pick-up Cubes ({pickupCubes.length})
        </button>
        <button
          type="button"
          className={currentTab === 'Trash' ? 'btn' : 'btn-ghost'}
          onClick={() => setCurrentTab('Trash')}
          style={{ color: currentTab === 'Trash' ? '#fff' : '#b00020' }}
        >
          🗑️ Trash ({trashCubes.length})
        </button>
      </div>

      {/* CUBES TABLE */}
      {loading ? (
        <SkeletonTable rows={4} cols={7} />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 70 }}>Image</th>
                <th>Cube No.</th>
                <th>Location</th>
                <th>Type</th>
                <th>Dimensions</th>
                <th>Monthly Rent</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {currentList.map((c) => (
                <tr key={c.cube_id}>
                  <td>
                    {c.image_url ? (
                      <img
                        src={c.image_url}
                        alt={c.cube_number}
                        style={{ width: 50, height: 50, objectFit: 'cover', borderRadius: 6, border: '1px solid #eee' }}
                      />
                    ) : (
                      <div style={{ width: 50, height: 50, background: '#f5f5f5', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', color: '#999' }}>
                        No pic
                      </div>
                    )}
                  </td>
                  <td><strong>{c.cube_number}</strong></td>
                  <td>{c.location || '—'}</td>
                  <td>{c.type}</td>
                  <td>
                    {c.width_cm && c.height_cm ? `${c.width_cm} × ${c.height_cm} cm` : '—'}
                  </td>
                  <td>{peso(c.price_per_month)}</td>
                  <td>
                    <span className={`status-pill ${c.status === 'Available' ? 'confirmed' : 'pending'}`}>
                      {c.status}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {currentTab === 'Trash' ? (
                      <div className="row" style={{ justifyContent: 'flex-end', gap: '0.5rem' }}>
                        <button className="btn-ghost" type="button" onClick={() => restoreFromTrash(c.cube_id)}>
                          ♻️ Restore
                        </button>
                        <button
                          className="btn-ghost"
                          style={{ color: '#b00020' }}
                          type="button"
                          onClick={() => permanentDelete(c.cube_id)}
                        >
                          Delete Forever
                        </button>
                      </div>
                    ) : (
                      <div className="row" style={{ justifyContent: 'flex-end', gap: '0.5rem' }}>
                        <button className="btn-ghost" type="button" onClick={() => beginEdit(c)}>
                          Edit
                        </button>
                        <button
                          className="btn-ghost"
                          style={{ color: '#b00020' }}
                          type="button"
                          onClick={() => moveToTrash(c.cube_id)}
                        >
                          🗑️ Trash
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {currentList.length === 0 && (
            <div className="empty" style={{ padding: '2rem' }}>
              {currentTab === 'Trash' ? 'Trash is empty.' : `No ${currentTab} cubes found.`}
            </div>
          )}
        </div>
      )}

      {/* EDIT MODAL */}
      {editId && (
        <div className="modal-overlay" onClick={() => setEditId(null)}>
          <div className="modal-card" style={{ maxWidth: 540 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Edit Cube #{editForm.cube_number}</h3>
              <button className="modal-close" onClick={() => setEditId(null)}>✕</button>
            </div>

            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
              <div className="field">
                <label>Cube Number</label>
                <input
                  value={editForm.cube_number}
                  onChange={(e) => setEditForm({ ...editForm, cube_number: e.target.value })}
                />
              </div>

              <div className="field">
                <label>Type</label>
                <select
                  value={editForm.type}
                  onChange={(e) => setEditForm({ ...editForm, type: e.target.value as 'Display' | 'Pick-up' })}
                >
                  <option value="Display">Display</option>
                  <option value="Pick-up">Pick-up</option>
                </select>
              </div>

              <div className="field">
                <label>Location</label>
                <input
                  placeholder="e.g. Front display area"
                  value={editForm.location}
                  onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                />
              </div>

              <div className="field">
                <label>Monthly Rent (₱)</label>
                <input
                  type="number"
                  min="0"
                  value={editForm.price_per_month}
                  onChange={(e) => setEditForm({ ...editForm, price_per_month: e.target.value })}
                />
              </div>

              <div className="field">
                <label>Status</label>
                <select
                  value={editForm.status}
                  onChange={(e) => setEditForm({ ...editForm, status: e.target.value as 'Available' | 'Occupied' })}
                >
                  <option value="Available">Available</option>
                  <option value="Occupied">Occupied</option>
                </select>
              </div>

              <div className="field">
                <label>Width (cm)</label>
                <input
                  type="number"
                  value={editForm.width_cm}
                  onChange={(e) => setEditForm({ ...editForm, width_cm: e.target.value })}
                />
              </div>

              <div className="field">
                <label>Height (cm)</label>
                <input
                  type="number"
                  value={editForm.height_cm}
                  onChange={(e) => setEditForm({ ...editForm, height_cm: e.target.value })}
                />
              </div>

              <div className="field" style={{ gridColumn: 'span 2' }}>
                <label>Update Photo</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) {
                      setEditImageFile(f)
                      setEditImagePreview(URL.createObjectURL(f))
                    }
                  }}
                />
                {editImagePreview && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <img src={editImagePreview} alt="Preview" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 6, border: '1px solid #ddd' }} />
                  </div>
                )}
              </div>
            </div>

            <div className="row" style={{ justifyContent: 'flex-end', marginTop: '1.5rem', gap: '0.5rem' }}>
              <button className="btn-ghost" type="button" onClick={() => setEditId(null)}>Cancel</button>
              <button className="btn" type="button" disabled={saving} onClick={saveCube}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
