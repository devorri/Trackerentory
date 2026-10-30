import { useEffect, useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Trash2, RotateCcw, X, ArrowUpDown, Camera, Search } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/Auth'
import { peso, type Cube, type Product, DEFAULT_PRODUCT_CATEGORIES } from '../lib/types'
import { SkeletonTable } from '../components/Skeleton'
import { uploadPublicImage } from '../lib/storage'
import { BUCKET_PRODUCT_IMAGES } from '../lib/supabase'
import { addPullOutItem } from '../lib/pull-out'

import ConfirmModal from '../components/ConfirmModal'
import ProductGalleryModal from '../components/ProductGalleryModal'

export default function OwnerProductsPage() {
  const { user } = useAuth()
  const [galleryProduct, setGalleryProduct] = useState<Product | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [cubes, setCubes] = useState<Cube[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [tab, setTab] = useState<'active' | 'trash'>('active')
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [confirmAction, setConfirmAction] = useState<{
    title: string
    message: string
    confirmText?: string
    isDanger?: boolean
    onConfirm: () => void
  } | null>(null)

  // Pull out state
  const [pullOutProduct, setPullOutProduct] = useState<Product | null>(null)
  const [pullOutQty, setPullOutQty] = useState('1')
  const [pullOutReason, setPullOutReason] = useState('Contract Expired')
  const [pullOutNotes, setPullOutNotes] = useState('')

  const [form, setForm] = useState({
    product_name: '',
    description: '',
    price: '',
    stock_quantity: '1',
    variant: '',
    category: '',
    cube_id: '',
  })

  const [imageFiles, setImageFiles] = useState<File[]>([])
  const [newImagePreviews, setNewImagePreviews] = useState<string[]>([])
  const [currentImageUrls, setCurrentImageUrls] = useState<string[]>([])

  async function load() {
    setLoading(true)
    const [pRes, cRes] = await Promise.all([
      supabase.from('products').select('*, cubes(cube_number, type), renter:users!renter_id(user_id, full_name, username)').order('product_name'),
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
    setCurrentImageUrls(p.image_urls?.length ? p.image_urls : p.image_url ? [p.image_url] : [])
    setImageFiles([])
    setNewImagePreviews([])
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
    setImageFiles([])
    setNewImagePreviews([])
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

    let uploadedUrls: string[] = []
    if (imageFiles.length > 0) {
      const uploads = await Promise.all(
        imageFiles.map((file) => uploadPublicImage(BUCKET_PRODUCT_IMAGES, file, String(user?.user_id || 'admin')))
      )
      const uploadError = uploads.find((upload) => upload.error || !upload.url)
      if (uploadError) {
        setBusy(false)
        return alert('One or more product photos could not be uploaded.')
      }
      uploadedUrls = uploads.map((upload) => upload.url!)
    }
    const finalImageUrls = [...currentImageUrls, ...uploadedUrls]
    const finalImageUrl = finalImageUrls[0] || null

    const payload = {
      product_name: form.product_name.trim(),
      description: form.description ? form.description.trim() : null,
      price: Number(form.price),
      stock_quantity: Number(form.stock_quantity || 1),
      variant: form.variant ? form.variant.trim() : null,
      category: form.category ? form.category.trim() : null,
      image_url: finalImageUrl,
      image_urls: finalImageUrls,
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

  function onImageFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    const selected = Array.from(files)
    setImageFiles((prev) => [...prev, ...selected])
    const previews = selected.map((f) => URL.createObjectURL(f))
    setNewImagePreviews((prev) => [...prev, ...previews])
  }

  function removeExistingImage(index: number) {
    setCurrentImageUrls((prev) => prev.filter((_, i) => i !== index))
  }

  function removeNewImage(index: number) {
    if (newImagePreviews[index]) {
      URL.revokeObjectURL(newImagePreviews[index])
    }
    setImageFiles((prev) => prev.filter((_, i) => i !== index))
    setNewImagePreviews((prev) => prev.filter((_, i) => i !== index))
  }

  function openDisplayPullOutModal(p: Product) {
    setPullOutProduct(p)
    setPullOutQty(String(p.stock_quantity > 0 ? p.stock_quantity : 1))
    setPullOutReason('Contract Expired')
    setPullOutNotes('')
  }

  async function confirmDisplayPullOut() {
    if (!pullOutProduct) return
    const p = pullOutProduct
    const qtyToPull = Math.max(1, Math.min(parseInt(pullOutQty, 10) || 1, p.stock_quantity || 1))
    const remaining = Math.max(0, (p.stock_quantity || 1) - qtyToPull)

    setBusy(true)
    await addPullOutItem({
      type: 'Display',
      product_id: p.product_id,
      cube_id: p.cube_id,
      renter_id: p.renter_id,
      product_name: p.product_name,
      price: p.price,
      quantity: qtyToPull,
      reason: pullOutReason,
      status: 'Pull Out',
      notes: pullOutNotes.trim() || null,
      pulled_out_by: user?.user_id,
      cubes: p.cubes ? { cube_number: p.cubes.cube_number, type: p.cubes.type } : null,
      renter: p.renter ? { full_name: p.renter.full_name, phone_number: (p.renter as any).phone_number, social_link: (p.renter as any).social_link } : null,
    })

    // Deduct stock in products table
    await supabase.from('products').update({ stock_quantity: remaining }).eq('product_id', p.product_id)

    setBusy(false)
    setPullOutProduct(null)
    void load()
  }

  const categories = useMemo(() => {
    const existing = products.map((p) => p.category?.trim()).filter(Boolean) as string[]
    return Array.from(new Set([...DEFAULT_PRODUCT_CATEGORIES, ...existing])).sort()
  }, [products])

  const existingCategories = useMemo(() => {
    return Array.from(new Set(products.map((p) => p.category?.trim()).filter(Boolean) as string[])).sort()
  }, [products])

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
    let list = [...(tab === 'active' ? activeProducts : trashProducts)]
    if (selectedCategoryFilter !== 'All') {
      if (selectedCategoryFilter === 'Uncategorized') {
        list = list.filter((p) => !p.category || !p.category.trim())
      } else {
        list = list.filter((p) => (p.category?.trim() || '') === selectedCategoryFilter)
      }
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      list = list.filter((p) =>
        p.product_name.toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q) ||
        (p.variant || '').toLowerCase().includes(q) ||
        (p.cubes?.cube_number || '').toLowerCase().includes(q) ||
        (p.renter?.full_name || '').toLowerCase().includes(q) ||
        (p.renter?.username || '').toLowerCase().includes(q)
      )
    }
    const { col, dir } = sortConfig
    list.sort((a, b) => {
      let vA: any = ''
      let vB: any = ''
      if (col === 'name') { vA = a.product_name; vB = b.product_name }
      else if (col === 'cube') { vA = a.cubes?.cube_number || ''; vB = b.cubes?.cube_number || '' }
      else if (col === 'renter') { vA = a.renter?.full_name || ''; vB = b.renter?.full_name || '' }
      else if (col === 'price') { vA = Number(a.price || 0); vB = Number(b.price || 0) }
      else if (col === 'stock') { vA = Number(a.stock_quantity || 0); vB = Number(b.stock_quantity || 0) }
      else if (col === 'category') { vA = a.category || ''; vB = b.category || '' }
      if (vA < vB) return dir === 'asc' ? -1 : 1
      if (vA > vB) return dir === 'asc' ? 1 : -1
      return 0
    })
    return list
  }, [tab, activeProducts, trashProducts, sortConfig, selectedCategoryFilter, searchQuery])

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

      {/* SEARCH & CATEGORY FILTER TOOLBAR */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flex: 1, minWidth: 260, maxWidth: 420 }}>
          <Search size={16} className="muted" />
          <input
            type="text"
            placeholder="Search product, category, cube, or renter name…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ margin: 0, padding: '0.5rem 0.85rem', fontSize: '0.88rem' }}
          />
          {searchQuery && (
            <button
              type="button"
              className="btn-ghost"
              style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
              onClick={() => setSearchQuery('')}
            >
              Clear
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: '0.8rem', fontWeight: 800, margin: 0, textTransform: 'uppercase', color: '#555', letterSpacing: '0.04em' }}>
            Category Filter:
          </label>
          <select
            value={selectedCategoryFilter}
            onChange={(e) => setSelectedCategoryFilter(e.target.value)}
            style={{ margin: 0, padding: '0.45rem 0.85rem', fontSize: '0.85rem', minWidth: 180 }}
          >
            <option value="All">All Categories ({tab === 'active' ? activeProducts.length : trashProducts.length})</option>
            {existingCategories.map((cat) => {
              const currentList = tab === 'active' ? activeProducts : trashProducts
              const count = currentList.filter((p) => p.category?.trim() === cat).length
              return (
                <option key={cat} value={cat}>
                  {cat} ({count})
                </option>
              )
            })}
            <option value="Uncategorized">
              Uncategorized ({(tab === 'active' ? activeProducts : trashProducts).filter((p) => !p.category?.trim()).length})
            </option>
          </select>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <SkeletonTable rows={6} cols={7} />
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
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('renter')}>
                  Renter {renderSortIndicator('renter')}
                </th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('price')}>
                  Price {renderSortIndicator('price')}
                </th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('stock')}>
                  Stock {renderSortIndicator('stock')}
                </th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('category')}>
                  Category {renderSortIndicator('category')}
                </th>
                <th>Variant / Details</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayedList.map((p) => (
                <tr key={p.product_id}>
                  <td style={{ cursor: 'pointer' }} onClick={() => setGalleryProduct(p)} title="Click to view product shots">
                    <div style={{ position: 'relative', width: 48, height: 48 }}>
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
                      {((p.image_urls && p.image_urls.length > 1) || (p.image_urls && p.image_urls.length === 1 && p.image_url)) && (
                        <span
                          style={{
                            position: 'absolute',
                            bottom: 1,
                            right: 1,
                            background: 'rgba(0,0,0,0.75)',
                            color: '#fff',
                            fontSize: '0.6rem',
                            fontWeight: 700,
                            padding: '1px 3px',
                            borderRadius: 3,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 2,
                          }}
                        >
                          <Camera size={9} /> {p.image_urls?.length || 1}
                        </span>
                      )}
                    </div>
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
                  <td>
                    {p.renter?.full_name ? (
                      <div>
                        <strong>{p.renter.full_name}</strong>
                        {p.renter.username && (
                          <div className="muted" style={{ fontSize: '0.74rem' }}>
                            @{p.renter.username}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>{peso(p.price)}</td>
                  <td>
                    {p.stock_quantity > 0 ? (
                      <span style={{ fontWeight: 700, color: '#16a34a' }}>
                        {p.stock_quantity} Available
                      </span>
                    ) : (
                      <span className="badge bad" style={{ fontSize: '0.72rem' }}>
                        Sold Out (0)
                      </span>
                    )}
                  </td>
                  <td>
                    {p.category ? (
                      <span
                        className="badge"
                        style={{
                          background: '#f1f5f9',
                          color: '#1e293b',
                          fontSize: '0.74rem',
                          fontWeight: 700,
                          letterSpacing: '0.02em',
                        }}
                      >
                        {p.category}
                      </span>
                    ) : (
                      <span className="muted" style={{ fontSize: '0.82rem' }}>—</span>
                    )}
                  </td>
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
                      <div className="row" style={{ justifyContent: 'flex-end', gap: '0.4rem', flexWrap: 'nowrap' }}>
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
                        <button
                          className="btn-ghost"
                          style={{
                            color: '#b45309',
                            border: '1px solid #fde68a',
                            background: '#fffbeb',
                            padding: '0.2rem 0.55rem',
                            fontSize: '0.75rem',
                          }}
                          type="button"
                          disabled={busy}
                          onClick={() => openDisplayPullOutModal(p)}
                          title="Pull out this item from cube"
                        >
                          Pull Out
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
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <label>Category</label>
                    <span className="muted" style={{ fontSize: '0.75rem' }}>Pick or type new</span>
                  </div>
                  <input
                    list="category-options"
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    placeholder="e.g. Cosmetics & Skincare"
                  />
                  <datalist id="category-options">
                    {categories.map((category) => (
                      <option key={category} value={category} />
                    ))}
                  </datalist>
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
                  <label>Product Photos (Can select multiple)</label>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => {
                      onImageFiles(e.target.files)
                      e.target.value = ''
                    }}
                  />
                  {(currentImageUrls.length > 0 || newImagePreviews.length > 0) && (
                    <div className="photo-preview-grid">
                      {/* Existing saved photos */}
                      {currentImageUrls.map((src, i) => (
                        <div key={`exist-${i}`} className="photo-preview-item" title="Saved photo">
                          <img src={src} alt={`Saved photo ${i + 1}`} />
                          <button
                            type="button"
                            className="photo-remove-btn"
                            onClick={() => removeExistingImage(i)}
                            title="Remove photo"
                            aria-label="Remove photo"
                          >
                            <X size={12} strokeWidth={2.5} />
                          </button>
                          {i === 0 && <span className="photo-badge-main">Cover</span>}
                        </div>
                      ))}
                      {/* Newly selected photos */}
                      {newImagePreviews.map((src, i) => (
                        <div key={`new-${i}`} className="photo-preview-item" title="Newly selected photo">
                          <img src={src} alt={`New upload ${i + 1}`} />
                          <button
                            type="button"
                            className="photo-remove-btn"
                            onClick={() => removeNewImage(i)}
                            title="Remove photo"
                            aria-label="Remove photo"
                          >
                            <X size={12} strokeWidth={2.5} />
                          </button>
                          {currentImageUrls.length === 0 && i === 0 && (
                            <span className="photo-badge-main">Cover</span>
                          )}
                        </div>
                      ))}
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

      <ProductGalleryModal
        product={galleryProduct}
        isOpen={Boolean(galleryProduct)}
        onClose={() => setGalleryProduct(null)}
        userRole="Owner"
      />

      {pullOutProduct && createPortal(
        <div className="modal-overlay" onClick={() => !busy && setPullOutProduct(null)}>
          <div className="modal-card" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Pull Out Display Item</h3>
              <button className="modal-close" disabled={busy} onClick={() => setPullOutProduct(null)}>✕</button>
            </div>
            <div style={{ padding: '0.75rem 0' }}>
              <div style={{ marginBottom: '0.75rem', background: '#f8fafc', padding: '0.75rem', borderRadius: 8 }}>
                <div style={{ fontWeight: 700, fontSize: '1rem', color: '#0f172a' }}>{pullOutProduct.product_name}</div>
                <div className="muted" style={{ fontSize: '0.82rem', marginTop: 2 }}>
                  Cube: <strong>{pullOutProduct.cubes?.cube_number || '—'}</strong> · Renter: <strong>{pullOutProduct.renter?.full_name || '—'}</strong>
                </div>
                <div className="muted" style={{ fontSize: '0.82rem', marginTop: 2 }}>
                  Current In-Store Stock: <strong>{pullOutProduct.stock_quantity}</strong> · Price: {peso(pullOutProduct.price)}
                </div>
              </div>

              <div className="field">
                <label>Quantity to Pull Out</label>
                <input
                  type="number"
                  min="1"
                  max={Math.max(1, pullOutProduct.stock_quantity)}
                  value={pullOutQty}
                  onChange={(e) => setPullOutQty(e.target.value)}
                  disabled={busy}
                />
              </div>

              <div className="field">
                <label>Reason for Pull Out</label>
                <select
                  value={pullOutReason}
                  onChange={(e) => setPullOutReason(e.target.value)}
                  disabled={busy}
                >
                  <option value="Contract Expired">Contract Expired</option>
                  <option value="Unsold Display / Consignor Pull Out">Unsold Display / Consignor Pull Out</option>
                  <option value="Renter Request">Renter Request</option>
                  <option value="Damaged / Defective">Damaged / Defective</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div className="field">
                <label>Notes (optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Renter will pick up on Friday"
                  value={pullOutNotes}
                  onChange={(e) => setPullOutNotes(e.target.value)}
                  disabled={busy}
                />
              </div>
            </div>

            <div className="row" style={{ justifyContent: 'flex-end', marginTop: '1rem', gap: '0.5rem' }}>
              <button className="btn-ghost" type="button" disabled={busy} onClick={() => setPullOutProduct(null)}>
                Cancel
              </button>
              <button
                className="btn"
                type="button"
                style={{ background: '#b45309', color: '#fff' }}
                disabled={busy}
                onClick={confirmDisplayPullOut}
              >
                {busy ? 'Processing…' : 'Confirm Pull Out'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </section>
  )
}
