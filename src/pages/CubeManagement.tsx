import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Trash2, RotateCcw, X, ArrowUpDown } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/Auth'
import { type Cube, peso } from '../lib/types'
import { SkeletonTable } from '../components/Skeleton'
import TablePagination, { DEFAULT_PAGE_SIZE } from '../components/TablePagination'
import { uploadPublicImage } from '../lib/storage'
import { BUCKET_PRODUCT_IMAGES } from '../lib/supabase'

import ConfirmModal from '../components/ConfirmModal'

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
  const [confirmAction, setConfirmAction] = useState<{
    title: string
    message: string
    confirmText?: string
    isDanger?: boolean
    onConfirm: () => void
  } | null>(null)

  // Create form
  const [form, setForm] = useState(initialForm)
  const [cubeImages, setCubeImages] = useState<File[]>([])
  const [cubeImagePreviews, setCubeImagePreviews] = useState<string[]>([])

  // Edit modal
  const [editId, setEditId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState(initialForm)
  const [editExistingUrls, setEditExistingUrls] = useState<string[]>([])
  const [editNewFiles, setEditNewFiles] = useState<File[]>([])
  const [editNewPreviews, setEditNewPreviews] = useState<string[]>([])

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

  function handleCubeFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    const list = Array.from(files)
    setCubeImages((prev) => [...prev, ...list])
    const previews = list.map((f) => URL.createObjectURL(f))
    setCubeImagePreviews((prev) => [...prev, ...previews])
  }

  function removeCreateCubePhoto(index: number) {
    if (cubeImagePreviews[index]) {
      URL.revokeObjectURL(cubeImagePreviews[index])
    }
    setCubeImages((prev) => prev.filter((_, i) => i !== index))
    setCubeImagePreviews((prev) => prev.filter((_, i) => i !== index))
  }

  function handleEditCubeFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    const list = Array.from(files)
    setEditNewFiles((prev) => [...prev, ...list])
    const previews = list.map((f) => URL.createObjectURL(f))
    setEditNewPreviews((prev) => [...prev, ...previews])
  }

  function removeEditExistingCubePhoto(index: number) {
    setEditExistingUrls((prev) => prev.filter((_, i) => i !== index))
  }

  function removeEditNewCubePhoto(index: number) {
    if (editNewPreviews[index]) {
      URL.revokeObjectURL(editNewPreviews[index])
    }
    setEditNewFiles((prev) => prev.filter((_, i) => i !== index))
    setEditNewPreviews((prev) => prev.filter((_, i) => i !== index))
  }

  async function createCube() {
    if (!form.cube_number || !form.price_per_month) {
      return alert('Cube number and price are required.')
    }
    setSaving(true)

    let uploadedUrls: string[] = []
    if (cubeImages.length > 0) {
      const uploads = await Promise.all(
        cubeImages.map((f) => uploadPublicImage(BUCKET_PRODUCT_IMAGES, f, 'cubes'))
      )
      const err = uploads.find((u) => u.error || !u.url)
      if (err) {
        setSaving(false)
        return alert('Image upload failed: ' + (err.error || 'unknown error'))
      }
      uploadedUrls = uploads.map((u) => u.url!)
    }
    const finalImageUrl = uploadedUrls[0] || form.image_url || null

    let insertPayload: any = {
      cube_number: form.cube_number.trim(),
      location: form.location.trim() || null,
      type: form.type,
      price_per_month: Number(form.price_per_month),
      status: form.status,
      width_cm: form.width_cm ? Number(form.width_cm) : null,
      height_cm: form.height_cm ? Number(form.height_cm) : null,
      image_url: finalImageUrl,
      image_urls: uploadedUrls,
    }

    let { error } = await supabase.from('cubes').insert([insertPayload])
    if (error && error.message.includes('image_urls')) {
      delete insertPayload.image_urls
      const retry = await supabase.from('cubes').insert([insertPayload])
      error = retry.error
    }

    setSaving(false)
    if (error) return alert(error.message)

    setForm(initialForm)
    setCubeImages([])
    setCubeImagePreviews([])
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
    const existing = (cube as any).image_urls?.length
      ? (cube as any).image_urls
      : cube.image_url
      ? [cube.image_url]
      : []
    setEditExistingUrls(existing)
    setEditNewFiles([])
    setEditNewPreviews([])
  }

  async function saveCube() {
    if (!editId || !editForm.cube_number || !editForm.price_per_month) {
      return alert('Cube number and price are required.')
    }
    setSaving(true)

    let uploadedUrls: string[] = []
    if (editNewFiles.length > 0) {
      const uploads = await Promise.all(
        editNewFiles.map((f) => uploadPublicImage(BUCKET_PRODUCT_IMAGES, f, 'cubes'))
      )
      const err = uploads.find((u) => u.error || !u.url)
      if (err) {
        setSaving(false)
        return alert('Image upload failed: ' + (err.error || 'unknown error'))
      }
      uploadedUrls = uploads.map((u) => u.url!)
    }
    const finalUrls = [...editExistingUrls, ...uploadedUrls]
    const finalImageUrl = finalUrls[0] || null

    let updatePayload: any = {
      cube_number: editForm.cube_number.trim(),
      location: editForm.location.trim() || null,
      type: editForm.type,
      price_per_month: Number(editForm.price_per_month),
      status: editForm.status,
      width_cm: editForm.width_cm ? Number(editForm.width_cm) : null,
      height_cm: editForm.height_cm ? Number(editForm.height_cm) : null,
      image_url: finalImageUrl,
      image_urls: finalUrls,
    }

    let { error } = await supabase.from('cubes').update(updatePayload).eq('cube_id', editId)
    if (error && error.message.includes('image_urls')) {
      delete updatePayload.image_urls
      const retry = await supabase.from('cubes').update(updatePayload).eq('cube_id', editId)
      error = retry.error
    }

    setSaving(false)
    if (error) return alert(error.message)
    setEditId(null)
    setEditForm(initialForm)
    setEditExistingUrls([])
    setEditNewFiles([])
    setEditNewPreviews([])
    await loadCubes()
  }

  // Soft delete: move to trash
  function moveToTrash(cube_id: number) {
    setConfirmAction({
      title: 'Move Cube to Trash',
      message: 'Are you sure you want to move this cube to Trash?',
      confirmText: 'Move to Trash',
      isDanger: true,
      onConfirm: async () => {
        setConfirmAction(null)
        const { error } = await supabase
          .from('cubes')
          .update({ deleted_at: new Date().toISOString() })
          .eq('cube_id', cube_id)
        if (error) return alert(error.message)
        await loadCubes()
      },
    })
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
  function permanentDelete(cube_id: number) {
    setConfirmAction({
      title: 'Delete Cube Permanently',
      message: 'Permanently delete this cube? This cannot be undone.',
      confirmText: 'Delete Permanently',
      isDanger: true,
      onConfirm: async () => {
        setConfirmAction(null)
        const { error } = await supabase.from('cubes').delete().eq('cube_id', cube_id)
        if (error) return alert(error.message)
        await loadCubes()
      },
    })
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

  const [sortConfig, setSortConfig] = useState<{ col: string; dir: 'asc' | 'desc' }>({ col: 'number', dir: 'asc' })
  const [page, setPage] = useState(1)

  function renderSortIndicator(col: string) {
    if (sortConfig.col !== col) {
      return <ArrowUpDown size={12} style={{ opacity: 0.35, marginLeft: 4, verticalAlign: 'middle', display: 'inline' }} />
    }
    return <span style={{ marginLeft: 4, fontSize: '0.72rem' }}>{sortConfig.dir === 'asc' ? '▲' : '▼'}</span>
  }

  function toggleSort(col: string) {
    if (sortConfig.col === col) {
      setSortConfig({ col, dir: sortConfig.dir === 'asc' ? 'desc' : 'asc' })
    } else {
      setSortConfig({ col, dir: 'asc' })
    }
  }

  const currentList = useMemo(() => {
    const list = [...(currentTab === 'Display' ? displayCubes : currentTab === 'Pick-up' ? pickupCubes : trashCubes)]
    const { col, dir } = sortConfig
    list.sort((a, b) => {
      let vA: any = ''
      let vB: any = ''
      if (col === 'number') { vA = a.cube_number; vB = b.cube_number }
      else if (col === 'location') { vA = a.location || ''; vB = b.location || '' }
      else if (col === 'type') { vA = a.type || ''; vB = b.type || '' }
      else if (col === 'dimensions') { vA = (a.width_cm || 0) * (a.height_cm || 0); vB = (b.width_cm || 0) * (b.height_cm || 0) }
      else if (col === 'price') { vA = Number(a.price_per_month || 0); vB = Number(b.price_per_month || 0) }
      else if (col === 'status') { vA = a.status || ''; vB = b.status || '' }
      if (vA < vB) return dir === 'asc' ? -1 : 1
      if (vA > vB) return dir === 'asc' ? 1 : -1
      return 0
    })
    return list
  }, [currentTab, displayCubes, pickupCubes, trashCubes, sortConfig])

  useEffect(() => setPage(1), [currentTab, sortConfig, displayCubes, pickupCubes, trashCubes])
  const pagedCubes = currentList.slice((page - 1) * DEFAULT_PAGE_SIZE, page * DEFAULT_PAGE_SIZE)

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
            <label>Cube Photos (Can select multiple)</label>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => {
                handleCubeFiles(e.target.files)
                e.target.value = ''
              }}
            />
            {cubeImagePreviews.length > 0 && (
              <div className="photo-preview-grid">
                {cubeImagePreviews.map((src, i) => (
                  <div key={i} className="photo-preview-item" title="Cube photo">
                    <img src={src} alt={`Cube shot ${i + 1}`} />
                    <button
                      type="button"
                      className="photo-remove-btn"
                      onClick={() => removeCreateCubePhoto(i)}
                      title="Remove photo"
                      aria-label="Remove photo"
                    >
                      <X size={12} strokeWidth={2.5} />
                    </button>
                    {i === 0 && <span className="photo-badge-main">Cover</span>}
                  </div>
                ))}
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
          <Trash2 size={16} /> Trash ({trashCubes.length})
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
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('number')}>
                  Cube No. {renderSortIndicator('number')}
                </th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('location')}>
                  Location {renderSortIndicator('location')}
                </th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('type')}>
                  Type {renderSortIndicator('type')}
                </th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('dimensions')}>
                  Dimensions {renderSortIndicator('dimensions')}
                </th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('price')}>
                  Monthly Rent {renderSortIndicator('price')}
                </th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('status')}>
                  Status {renderSortIndicator('status')}
                </th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pagedCubes.map((c) => (
                <tr key={c.cube_id}>
                  <td>
                    {(() => {
                      const displayImg = c.image_url || (c.image_urls && c.image_urls[0])
                      const totalShots = (c.image_urls && c.image_urls.length > 0) ? c.image_urls.length : (c.image_url ? 1 : 0)
                      return displayImg ? (
                        <div style={{ position: 'relative', width: 50, height: 50, display: 'inline-block' }}>
                          <img
                            src={displayImg}
                            alt={c.cube_number}
                            style={{ width: 50, height: 50, objectFit: 'cover', borderRadius: 6, border: '1px solid #eee' }}
                          />
                          {totalShots > 1 && (
                            <span
                              style={{
                                position: 'absolute',
                                bottom: 2,
                                right: 2,
                                background: 'rgba(15, 23, 42, 0.85)',
                                color: '#fff',
                                fontSize: '0.62rem',
                                fontWeight: 700,
                                padding: '1px 4px',
                                borderRadius: 4,
                                lineHeight: 1.2,
                              }}
                              title={`${totalShots} photos`}
                            >
                              {totalShots}
                            </span>
                          )}
                        </div>
                      ) : (
                        <div style={{ width: 50, height: 50, background: '#f5f5f5', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', color: '#999' }}>
                          No pic
                        </div>
                      )
                    })()}
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
                          <RotateCcw size={14} /> Restore
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
                          <Trash2 size={14} /> Trash
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <TablePagination page={page} totalItems={currentList.length} onPageChange={setPage} />
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
              <button className="modal-close" onClick={() => setEditId(null)}><X size={18} /></button>
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
                <label>Cube Photos (Can select multiple)</label>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => {
                    handleEditCubeFiles(e.target.files)
                    e.target.value = ''
                  }}
                />
                {(editExistingUrls.length > 0 || editNewPreviews.length > 0) && (
                  <div className="photo-preview-grid">
                    {editExistingUrls.map((src, i) => (
                      <div key={`exist-${i}`} className="photo-preview-item" title="Saved photo">
                        <img src={src} alt={`Saved photo ${i + 1}`} />
                        <button
                          type="button"
                          className="photo-remove-btn"
                          onClick={() => removeEditExistingCubePhoto(i)}
                          title="Remove photo"
                          aria-label="Remove photo"
                        >
                          <X size={12} strokeWidth={2.5} />
                        </button>
                        {i === 0 && <span className="photo-badge-main">Cover</span>}
                      </div>
                    ))}
                    {editNewPreviews.map((src, i) => (
                      <div key={`new-${i}`} className="photo-preview-item" title="New photo">
                        <img src={src} alt={`New upload ${i + 1}`} />
                        <button
                          type="button"
                          className="photo-remove-btn"
                          onClick={() => removeEditNewCubePhoto(i)}
                          title="Remove photo"
                          aria-label="Remove photo"
                        >
                          <X size={12} strokeWidth={2.5} />
                        </button>
                        {editExistingUrls.length === 0 && i === 0 && (
                          <span className="photo-badge-main">Cover</span>
                        )}
                      </div>
                    ))}
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

      {confirmAction && (
        <ConfirmModal
          isOpen={true}
          title={confirmAction.title}
          message={confirmAction.message}
          confirmText={confirmAction.confirmText || 'Confirm'}
          isDanger={confirmAction.isDanger ?? true}
          onConfirm={confirmAction.onConfirm}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </section>
  )
}
