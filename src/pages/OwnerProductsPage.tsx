import { useEffect, useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Trash2, RotateCcw, X, ArrowUpDown } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/Auth'
import { peso, type Cube, type Product } from '../lib/types'
import { SkeletonTable } from '../components/Skeleton'
import { uploadPublicImage } from '../lib/storage'
import { BUCKET_PRODUCT_IMAGES } from '../lib/supabase'

import ConfirmModal from '../components/ConfirmModal'

export default function OwnerProductsPage() {
  const { user } = useAuth()
  const [products, setProducts] = useState<Product[]>([])
  const [cubes, setCubes] = useState<Cube[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [tab, setTab] = useState<'active' | 'trash'>('active')
  const [confirmAction, setConfirmAction] = useState<{
    title: string
    message: string
    confirmText?: string
    isDanger?: boolean
    onConfirm: () => void
  } | null>(null)

  const [form, setForm] = useState({
    product_name: '',
    description: '',
    price: '',
    stock_quantity: '1',
    variant: '',
    category: '',
    cube_id: '',
  })

  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imageFiles, setImageFiles] = useState<File[]>([])
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null)
  const [currentImageUrls, setCurrentImageUrls] = useState<string[]>([])

  async function load() {
    setLoading(true)
    const [pRes, cRes] = await Promise.all([
      supabase.from('products').select('*, cubes(cube_number, type)').order('product_name'),
      supabase.from('cubes').select('*').order('cube_number'),
    ])
    setLoading(false)
    if (!pRes.error) setProducts((pRes.data || []) as Product[])
    if (!cRes.error) setCubes((cRes.data || []) as Cube[])
  }

  useEffect(() => {
    void load()
  }, [])

  const activeProducts = useMemo(() => products.filter((p) => !p.deleted_at), [products])
  const trashProducts = useMemo(() => products.filter((p) => Boolean(p.deleted_at)), [products])

  function openAddModal() {
    resetForm()
    setIsModalOpen(true)
  }

  function openEditModal(p: Product) {
    setEditId(p.product_id)
    setForm({
      product_name: p.product_name,
      description: p.description || '',
      price: String(p.price || 0),
      stock_quantity: String(p.stock_quantity || 1),
      variant: p.variant || '',
      category: p.category || '',
      cube_id: String(p.cube_id || ''),
    })
    setCurrentImageUrl(p.image_url || null)
    setCurrentImageUrls(p.image_urls?.length ? p.image_urls : p.image_url ? [p.image_url] : [])
    setImageFile(null)
    setImageFiles([])
    setImagePreview(null)
    setIsModalOpen(true)
  }

  function resetForm() {
    setEditId(null)
    setForm({
      product_name: '',
      description: '',
      price: '',
      stock_quantity: '1',
      variant: '',
      category: '',
      cube_id: '',
    })
    setImageFile(null)
    setImageFiles([])
    setImagePreview(null)
    setCurrentImageUrl(null)
    setCurrentImageUrls([])
  }

  function closeModal() {
    setIsModalOpen(false)
    resetForm()
  }

  async function saveProduct() {
    if (!form.product_name || !form.price || !form.cube_id) {
      return alert('Product name, price, and assigned cube are required.')
    }
    setBusy(true)

    let finalImageUrl = currentImageUrl
    if (imageFile) {
      const up = await uploadPublicImage(BUCKET_PRODUCT_IMAGES, imageFile, String(user?.user_id || 'admin'))
      if (up.error || !up.url) {
        setBusy(false)
        return alert('Image upload failed: ' + (up.error || 'unknown error'))
      }
      finalImageUrl = up.url
    }
    const extraUploads = await Promise.all(imageFiles.slice(imageFile ? 1 : 0).map((file) => uploadPublicImage(BUCKET_PRODUCT_IMAGES, file, String(user?.user_id || 'admin'))))
    const uploadError = extraUploads.find((upload) => upload.error || !upload.url)
    if (uploadError) {
      setBusy(false)
      return alert('One or more product photos could not be uploaded.')
    }
    const imageUrls = [...currentImageUrls, ...extraUploads.map((upload) => upload.url!)]
    if (finalImageUrl && !imageUrls.includes(finalImageUrl)) imageUrls.unshift(finalImageUrl)

    const payload = {
      product_name: form.product_name.trim(),
      description: form.description ? form.description.trim() : null,
      price: Number(form.price),
      stock_quantity: Number(form.stock_quantity || 1),
      variant: form.variant ? form.variant.trim() : null,
      category: form.category ? form.category.trim() : null,
      image_url: finalImageUrl || null,
      image_urls: imageUrls,
      cube_id: Number(form.cube_id),
    }

    if (editId) {
      const { error } = await supabase
        .from('products')
        .update(payload)
        .eq('product_id', editId)
      setBusy(false)
      if (error) return alert(error.message)
    } else {
      const { error } = await supabase.from('products').insert([
        {
          ...payload,
          renter_id: user?.user_id,
        },
      ])
      setBusy(false)
      if (error) return alert(error.message)
    }

    closeModal()
    void load()
  }

  // Soft delete: move to trash
  function moveToTrash(productId: number) {
    setConfirmAction({
      title: 'Move Product to Trash',
      message: 'Move this product to Trash? You can recover it anytime from the Trash tab.',
      confirmText: 'Move to Trash',
      isDanger: true,
      onConfirm: async () => {
        setConfirmAction(null)
        setBusy(true)
        const { error } = await supabase
          .from('products')
          .update({ deleted_at: new Date().toISOString() })
          .eq('product_id', productId)
        setBusy(false)
        if (error) return alert(error.message)
        void load()
      },
    })
  }

  // Restore from trash
  async function restoreProduct(productId: number) {
    setBusy(true)
    const { error } = await supabase
      .from('products')
      .update({ deleted_at: null })
      .eq('product_id', productId)
    setBusy(false)
    if (error) return alert(error.message)
    void load()
  }

  // Permanently delete from database
  function permanentDelete(productId: number) {
    setConfirmAction({
      title: 'Delete Product Permanently',
      message: 'Delete this product permanently? This cannot be undone.',
      confirmText: 'Delete Permanently',
      isDanger: true,
      onConfirm: async () => {
        setConfirmAction(null)
        setBusy(true)
        const { error } = await supabase.from('products').delete().eq('product_id', productId)
        setBusy(false)
        if (error) return alert(error.message)
        void load()
      },
    })
  }

  function onImageFile(file: File | null) {
    setImageFile(file)
    if (!file) {
      setImagePreview(null)
      return
    }
    const reader = new FileReader()
    reader.onload = () => setImagePreview(String(reader.result || ''))
    reader.readAsDataURL(file)
  }

  function onImageFiles(files: FileList | null) {
    const selected = Array.from(files || [])
    setImageFiles(selected)
    if (selected[0]) onImageFile(selected[0])
  }

  const categories = useMemo(() => Array.from(new Set(products.map((p) => p.category?.trim()).filter(Boolean) as string[])).sort(), [products])

  const [sortConfig, setSortConfig] = useState<{ col: string; dir: 'asc' | 'desc' }>({ col: 'name', dir: 'asc' })

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

  const displayedList = useMemo(() => {
    const list = [...(tab === 'active' ? activeProducts : trashProducts)]
    const { col, dir } = sortConfig
    list.sort((a, b) => {
      let vA: any = ''
      let vB: any = ''
      if (col === 'name') { vA = a.product_name; vB = b.product_name }
      else if (col === 'cube') { vA = a.cubes?.cube_number || ''; vB = b.cubes?.cube_number || '' }
      else if (col === 'price') { vA = Number(a.price || 0); vB = Number(b.price || 0) }
      else if (col === 'stock') { vA = Number(a.stock_quantity || 0); vB = Number(b.stock_quantity || 0) }
      if (vA < vB) return dir === 'asc' ? -1 : 1
      if (vA > vB) return dir === 'asc' ? 1 : -1
      return 0
    })
    return list
  }, [tab, activeProducts, trashProducts, sortConfig])

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>Product Management</h1>
          <p className="lede">Manage product inventory, pricing, stock levels, assigned cubes, and trash recovery.</p>
        </div>
        <button className="btn" type="button" onClick={openAddModal}>
          + Add New Product
        </button>
      </div>

      {/* TABS */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', borderBottom: '2px solid #efefef', paddingBottom: '0.5rem' }}>
        <button
          type="button"
          className={tab === 'active' ? 'btn' : 'btn-ghost'}
          onClick={() => setTab('active')}
        >
          Active Products ({activeProducts.length})
        </button>
        <button
          type="button"
          className={tab === 'trash' ? 'btn' : 'btn-ghost'}
          onClick={() => setTab('trash')}
          style={{ color: tab === 'trash' ? '#fff' : '#b00020' }}
        >
          <Trash2 size={16} /> Trash ({trashProducts.length})
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <SkeletonTable rows={6} cols={6} />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 80 }}>Image</th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('name')}>
                  Product Name {renderSortIndicator('name')}
                </th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('cube')}>
                  Assigned Cube {renderSortIndicator('cube')}
                </th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('price')}>
                  Price {renderSortIndicator('price')}
                </th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('stock')}>
                  Stock {renderSortIndicator('stock')}
                </th>
                <th>Category</th>
                <th>Variant / Details</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayedList.map((p) => (
                <tr key={p.product_id}>
                  <td>
                    {p.image_url ? (
                      <img
                        src={p.image_url}
                        alt={p.product_name}
                        style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 4 }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 48,
                          height: 48,
                          background: '#f0f0f0',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: 4,
                          fontSize: '0.7rem',
                          color: '#888',
                        }}
                      >
                        No pic
                      </div>
                    )}
                  </td>
                  <td>
                    <strong>{p.product_name}</strong>
                    {p.description && (
                      <div className="muted" style={{ fontSize: '0.8rem', marginTop: 2 }}>
                        {p.description}
                      </div>
                    )}
                  </td>
                  <td>
                    {p.cubes ? (
                      <span className="badge info">
                        {p.cubes.cube_number} ({p.cubes.type})
                      </span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>{peso(p.price)}</td>
                  <td>
                    <span
                      style={{
                        fontWeight: 700,
                        color: p.stock_quantity <= 0 ? 'var(--danger, #e53935)' : 'inherit',
                      }}
                    >
                      {p.stock_quantity}
                    </span>
                  </td>
                  <td>{p.category || '—'}</td>
                  <td>{p.variant || '—'}</td>
                  <td style={{ textAlign: 'right' }}>
                    {tab === 'trash' ? (
                      <div className="row" style={{ justifyContent: 'flex-end', gap: '0.5rem' }}>
                        <button
                          className="btn-ghost"
                          type="button"
                          disabled={busy}
                          onClick={() => restoreProduct(p.product_id)}
                        >
                          <RotateCcw size={14} /> Restore
                        </button>
                        <button
                          className="btn-ghost"
                          style={{ color: '#b00020' }}
                          type="button"
                          disabled={busy}
                          onClick={() => permanentDelete(p.product_id)}
                        >
                          Delete Forever
                        </button>
                      </div>
                    ) : (
                      <div className="row" style={{ justifyContent: 'flex-end', gap: '0.5rem' }}>
                        <button
                          className="btn-ghost"
                          type="button"
                          onClick={() => openEditModal(p)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn-ghost"
                          style={{ color: '#b00020' }}
                          type="button"
                          disabled={busy}
                          onClick={() => moveToTrash(p.product_id)}
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
          {displayedList.length === 0 && (
            <div className="empty" style={{ padding: '2rem' }}>
              {tab === 'trash' ? 'Trash is empty.' : 'No active products found.'}
            </div>
          )}
        </div>
      )}

      {/* MODAL */}
      {isModalOpen &&
        createPortal(
          <div className="modal-overlay" onClick={closeModal}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>{editId ? 'Edit Product' : 'Add New Product'}</h3>
                <button className="modal-close" onClick={closeModal}>
                  <X size={18} />
                </button>
              </div>

              <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
                <div className="field">
                  <label>Product Name *</label>
                  <input
                    value={form.product_name}
                    onChange={(e) => setForm({ ...form, product_name: e.target.value })}
                    placeholder="e.g. Vintage Sunglasses"
                    required
                  />
                </div>

                <div className="field">
                  <label>Assigned Cube *</label>
                  <select
                    value={form.cube_id}
                    onChange={(e) => setForm({ ...form, cube_id: e.target.value })}
                    required
                  >
                    <option value="">Select a cube…</option>
                    {cubes.map((c) => (
                      <option key={c.cube_id} value={c.cube_id}>
                        {c.cube_number} ({c.type}) — {c.status}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label>Price (₱) *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                    placeholder="0.00"
                    required
                  />
                </div>

                <div className="field">
                  <label>Stock Quantity *</label>
                  <input
                    type="number"
                    min="0"
                    value={form.stock_quantity}
                    onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })}
                    required
                  />
                </div>

                <div className="field">
                  <label>Variant / Shade</label>
                  <input
                    value={form.variant}
                    onChange={(e) => setForm({ ...form, variant: e.target.value })}
                    placeholder="e.g. Matte Black / 01 Fair"
                  />
                </div>

                <div className="field">
                  <label>Category</label>
                  <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                    <option value="">Select an existing category…</option>
                    {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                  </select>
                </div>

                <div className="field" style={{ gridColumn: 'span 2' }}>
                  <label>Description</label>
                  <textarea
                    rows={3}
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Brief description of the item…"
                  />
                </div>

                <div className="field" style={{ gridColumn: 'span 2' }}>
                  <label>Product Photos</label>
                  <input type="file" accept="image/*" multiple onChange={(e) => onImageFiles(e.target.files)} />
                  {(imagePreview || currentImageUrl) && (
                    <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <img
                        src={imagePreview || currentImageUrl || ''}
                        alt="Preview"
                        style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 4, border: '1px solid #ddd' }}
                      />
                      <span className="muted" style={{ fontSize: '0.8rem' }}>{imageFiles.length ? `${imageFiles.length} new photo(s) selected` : 'Current saved photos'}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="row" style={{ justifyContent: 'flex-end', marginTop: '1.5rem', gap: '0.5rem' }}>
                <button className="btn-ghost" type="button" onClick={closeModal}>
                  Cancel
                </button>
                <button className="btn" type="button" disabled={busy} onClick={saveProduct}>
                  {busy ? 'Saving…' : editId ? 'Save Changes' : 'Create Product'}
                </button>
              </div>
            </div>
          </div>,
          document.body
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
