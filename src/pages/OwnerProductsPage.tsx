import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/Auth'
import { peso, type Cube, type Product } from '../lib/types'
import { SkeletonTable } from '../components/Skeleton'
import { uploadPublicImage } from '../lib/storage'
import { BUCKET_PRODUCT_IMAGES } from '../lib/supabase'

export default function OwnerProductsPage() {
  const { user } = useAuth()
  const [products, setProducts] = useState<Product[]>([])
  const [cubes, setCubes] = useState<Cube[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const [form, setForm] = useState({
    product_name: '',
    description: '',
    price: '',
    stock_quantity: '1',
    variant: '',
    cube_id: '',
  })

  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null)

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
      cube_id: String(p.cube_id || ''),
    })
    setCurrentImageUrl(p.image_url || null)
    setImageFile(null)
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
      cube_id: '',
    })
    setImageFile(null)
    setImagePreview(null)
    setCurrentImageUrl(null)
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
      console.log('[saveProduct] Uploading image file:', imageFile.name)
      const up = await uploadPublicImage(BUCKET_PRODUCT_IMAGES, imageFile, String(user?.user_id || 'admin'))
      console.log('[saveProduct] Upload result:', up)
      if (up.error || !up.url) {
        setBusy(false)
        return alert('Image upload failed: ' + (up.error || 'unknown error'))
      }
      finalImageUrl = up.url
    }

    console.log('[saveProduct] finalImageUrl to save:', finalImageUrl)

    const payload = {
      product_name: form.product_name,
      description: form.description || null,
      price: Number(form.price),
      stock_quantity: Number(form.stock_quantity || 1),
      variant: form.variant || null,
      image_url: finalImageUrl || null,
      cube_id: Number(form.cube_id),
    }

    if (editId) {
      console.log('[saveProduct] UPDATE product_id:', editId, 'payload:', payload)
      const { data, error } = await supabase
        .from('products')
        .update(payload)
        .eq('product_id', editId)
        .select()
      console.log('[saveProduct] UPDATE response data:', data, 'error:', error)
      setBusy(false)
      if (error) return alert(error.message)
    } else {
      console.log('[saveProduct] INSERT payload:', { ...payload, renter_id: user?.user_id })
      const { data, error } = await supabase.from('products').insert([
        {
          ...payload,
          renter_id: user?.user_id,
        },
      ]).select()
      console.log('[saveProduct] INSERT response data:', data, 'error:', error)
      setBusy(false)
      if (error) return alert(error.message)
    }

    closeModal()
    void load()
  }


  async function deleteProduct(productId: number) {
    if (!window.confirm('Are you sure you want to delete this product?')) return
    setBusy(true)
    const { error } = await supabase.from('products').delete().eq('product_id', productId)
    setBusy(false)
    if (error) return alert(error.message)
    void load()
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

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>Product Management</h1>
          <p className="lede">Manage product inventory, pricing, stock levels, and assigned cube spaces.</p>
        </div>
        <button className="btn" type="button" onClick={openAddModal}>
          + Add New Product
        </button>
      </div>

      {/* Linear Scrollable Table */}
      {loading ? (
        <SkeletonTable rows={6} cols={6} />
      ) : products.length === 0 ? (
        <div className="empty">
          <p>No products added yet.</p>
          <button className="btn" style={{ marginTop: '1rem' }} type="button" onClick={openAddModal}>
            + Add First Product
          </button>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: '60px' }}>Item</th>
                <th>Product Name</th>
                <th>Assigned Cube</th>
                <th>Price</th>
                <th>Stock</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                return (
                  <tr key={p.product_id}>
                    <td>
                      {p.image_url ? (
                        <img src={p.image_url} alt={p.product_name} className="table-thumb" />
                      ) : (
                        <div
                          className="table-thumb"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: '#f4f5f7',
                            borderRadius: '10px',
                            color: '#888',
                          }}
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                            <line x1="12" y1="22.08" x2="12" y2="12" />
                          </svg>
                        </div>
                      )}
                    </td>
                    <td>
                      <strong style={{ color: '#000', fontSize: '0.95rem' }}>{p.product_name}</strong>
                      {p.variant && (
                        <div className="muted" style={{ fontSize: '0.78rem', marginTop: '2px' }}>
                          Variant: {p.variant}
                        </div>
                      )}
                    </td>
                    <td>
                      <span style={{ fontWeight: 700, color: '#111' }}>
                        Cube #{p.cubes?.cube_number || p.cube_id}
                      </span>
                      {p.cubes?.type && (
                        <span className="muted" style={{ fontSize: '0.78rem', marginLeft: '0.35rem' }}>
                          ({p.cubes.type})
                        </span>
                      )}
                    </td>
                    <td>
                      <strong style={{ color: '#16a34a', fontSize: '1rem' }}>{peso(p.price)}</strong>
                    </td>
                    <td>
                      <span className={`badge ${p.stock_quantity <= 0 ? 'bad' : 'ok'}`}>
                        {p.stock_quantity <= 0 ? 'Out of Stock' : `${p.stock_quantity} in stock`}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="row" style={{ justifyContent: 'flex-end', gap: '0.4rem' }}>
                        <button
                          className="btn-ghost"
                          style={{ padding: '0.4rem 0.85rem', fontSize: '0.82rem' }}
                          type="button"
                          onClick={() => openEditModal(p)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn"
                          style={{
                            padding: '0.4rem 0.85rem',
                            fontSize: '0.82rem',
                            background: '#fee2e2',
                            color: '#b91c1c',
                            boxShadow: 'none',
                          }}
                          type="button"
                          onClick={() => deleteProduct(p.product_id)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Product Add / Edit Modal Popup */}
      {isModalOpen &&
        createPortal(
          <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
            <div className="modal-dialog">
              <div className="modal-header">
                <h2>{editId ? 'Edit Product' : 'Add New Product'}</h2>
                <button className="modal-close" type="button" onClick={closeModal}>
                  ✕
                </button>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  void saveProduct()
                }}
              >
                <div className="field">
                  <label>Product Name *</label>
                  <input
                    required
                    value={form.product_name}
                    onChange={(e) => setForm({ ...form, product_name: e.target.value })}
                    placeholder="e.g. Leather Wallet"
                  />
                </div>

                <div className="row" style={{ gap: '1rem' }}>
                  <div className="field" style={{ flex: 1 }}>
                    <label>Price (₱) *</label>
                    <input
                      required
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.price}
                      onChange={(e) => setForm({ ...form, price: e.target.value })}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="field" style={{ flex: 1 }}>
                    <label>Stock Quantity</label>
                    <input
                      type="number"
                      min="0"
                      value={form.stock_quantity}
                      onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })}
                    />
                  </div>
                </div>

                <div className="row" style={{ gap: '1rem' }}>
                  <div className="field" style={{ flex: 1 }}>
                    <label>Variant / Shade</label>
                    <input
                      value={form.variant}
                      onChange={(e) => setForm({ ...form, variant: e.target.value })}
                      placeholder="e.g. Matte Black / Large"
                    />
                  </div>
                  <div className="field" style={{ flex: 1 }}>
                    <label>Assigned Cube *</label>
                    <select
                      required
                      value={form.cube_id}
                      onChange={(e) => setForm({ ...form, cube_id: e.target.value })}
                    >
                      <option value="">Select cube…</option>
                      {cubes.map((c) => (
                        <option key={c.cube_id} value={c.cube_id}>
                          Cube #{c.cube_number} ({c.type})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* File Upload Dropzone */}
                <div className="field">
                  <label>Product Image</label>
                  <div
                    className="file-dropzone"
                    onClick={() => document.getElementById('modal-image-input')?.click()}
                  >
                    <input
                      id="modal-image-input"
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={(e) => onImageFile(e.target.files?.[0] || null)}
                    />
                    {imagePreview || currentImageUrl ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                        <img
                          src={imagePreview || currentImageUrl || ''}
                          alt="Preview"
                          style={{ width: '80px', height: '80px', borderRadius: '12px', objectFit: 'cover' }}
                        />
                        <span style={{ fontSize: '0.82rem', color: '#16a34a', fontWeight: 700 }}>
                          {imageFile ? `Selected: ${imageFile.name}` : 'Click to change image'}
                        </span>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0' }}>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#666' }}>
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="17 8 12 3 7 8" />
                          <line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                        <strong style={{ fontSize: '0.9rem', color: '#000' }}>Choose image file to upload</strong>
                        <p className="muted" style={{ fontSize: '0.78rem', margin: 0 }}>
                          PNG, JPG, or WEBP up to 5MB
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="field">
                  <label>Description</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Details, specifications, features…"
                  />
                </div>

                <div className="row" style={{ justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                  <button className="btn-ghost" type="button" onClick={closeModal}>
                    Cancel
                  </button>
                  <button className="btn" type="submit" disabled={busy}>
                    {busy ? 'Saving…' : editId ? 'Save Changes' : 'Create Product'}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}
    </section>
  )
}

