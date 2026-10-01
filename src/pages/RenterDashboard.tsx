import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/Auth'
import {
  addMonths,
  daysUntil,
  peso,
  todayISO,
  type Contract,
  type Cube,
  type Product,
  type Transaction,
} from '../lib/types'
import { expireContracts } from '../lib/maintenance'
import { uploadPublicImage } from '../lib/storage'
import { BUCKET_PRODUCT_IMAGES } from '../lib/supabase'

type ViewMode = 'display' | 'pickup' | 'cubes_contracts'

export default function RenterDashboard() {
  const { user } = useAuth()
  const [cubes, setCubes] = useState<Cube[]>([])
  const [contracts, setContracts] = useState<Contract[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(false)
  const [months, setMonths] = useState(1)
  const [busy, setBusy] = useState(false)
  const [activeTab, setActiveTab] = useState<ViewMode>('display')
  const [previewReceipt, setPreviewReceipt] = useState<string | null>(null)

  const [productForm, setProductForm] = useState({
    product_name: '',
    description: '',
    price: '',
    stock_quantity: '1',
    variant: '',
    image_url: '',
    cube_id: '',
  })

  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)

  async function load() {
    if (!user) return
    setLoading(true)
    await expireContracts()
    const [cRes, conRes, pRes, tRes] = await Promise.all([
      supabase.from('cubes').select('*').order('cube_number'),
      supabase.from('contracts').select('*, cubes(*)').eq('renter_id', user.user_id).order('end_date'),
      supabase.from('products').select('*, cubes(cube_number, type)').eq('renter_id', user.user_id),
      supabase
        .from('transactions')
        .select('*, products(*, cubes(cube_number, type))')
        .order('transaction_date', { ascending: false }),
    ])
    setLoading(false)
    if (!cRes.error) setCubes((cRes.data || []) as Cube[])
    if (!conRes.error) setContracts((conRes.data || []) as Contract[])
    if (!pRes.error) setProducts((pRes.data || []) as Product[])
    if (!tRes.error) {
      // Filter transactions belonging to this renter's products
      const myProds = (pRes.data || []) as Product[]
      const myProdIds = new Set(myProds.map((p) => p.product_id))
      const renterTx = ((tRes.data || []) as Transaction[]).filter((t) => t.product_id && myProdIds.has(t.product_id))
      setTransactions(renterTx)
    }
  }

  useEffect(() => { void load() }, [user])

  const myActiveCubeIds = useMemo(
    () => new Set(contracts.filter((c) => c.status === 'Active' || c.status === 'Pending').map((c) => c.cube_id)),
    [contracts],
  )

  const myCubes = useMemo(
    () => cubes.filter((c) => myActiveCubeIds.has(c.cube_id)),
    [cubes, myActiveCubeIds]
  )

  const displayProducts = useMemo(
    () => products.filter((p) => p.cubes?.type === 'Display'),
    [products]
  )

  const pickupProducts = useMemo(
    () => products.filter((p) => p.cubes?.type === 'Pick-up'),
    [products]
  )

  const displayTransactions = useMemo(
    () => transactions.filter((t) => t.products?.cubes?.type === 'Display'),
    [transactions]
  )

  const pickupTransactions = useMemo(
    () => transactions.filter((t) => t.products?.cubes?.type === 'Pick-up'),
    [transactions]
  )

  if (!user || user.role !== 'Renter') {
    return (
      <section>
        <div className="page-header">
          <div>
            <h1>Renter Workspace</h1>
            <p className="lede">This area is for Renter accounts. Please <Link to="/login">sign in</Link>.</p>
          </div>
        </div>
      </section>
    )
  }

  async function reserveCube(cube: Cube) {
    setBusy(true)
    const start = todayISO()
    const end = addMonths(start, months)
    const { error } = await supabase.from('contracts').insert([{
      renter_id: user!.user_id,
      cube_id: cube.cube_id,
      start_date: start,
      end_date: end,
      status: 'Pending',
    }])
    if (error) {
      setBusy(false)
      return alert(error.message)
    }
    await supabase.from('cubes').update({ status: 'Occupied' }).eq('cube_id', cube.cube_id)
    setBusy(false)
    alert(`Cube ${cube.cube_number} reserved (Pending contract until ${end}). Review in Contracts.`)
    void load()
  }

  async function extendContract(c: Contract, extraMonths: number) {
    const nextEnd = addMonths(c.end_date, extraMonths)
    const { error } = await supabase
      .from('contracts')
      .update({ end_date: nextEnd, status: 'Active' })
      .eq('contract_id', c.contract_id)
    if (error) return alert(error.message)
    alert(`Extended to ${nextEnd}`)
    void load()
  }

  async function activateContract(c: Contract) {
    const { error } = await supabase
      .from('contracts')
      .update({ status: 'Active' })
      .eq('contract_id', c.contract_id)
    if (error) return alert(error.message)
    void load()
  }

  async function addProduct() {
    if (!productForm.product_name || !productForm.price || !productForm.cube_id) {
      return alert('Name, price, and assigned cube are required.')
    }
    setBusy(true)

    let imageUrl = productForm.image_url || null
    if (imageFile) {
      const up = await uploadPublicImage(BUCKET_PRODUCT_IMAGES, imageFile, String(user!.user_id))
      if (up.error || !up.url) {
        setBusy(false)
        return alert('Image upload failed: ' + (up.error || 'unknown error'))
      }
      imageUrl = up.url
    }

    const { error } = await supabase.from('products').insert([{
      renter_id: user!.user_id,
      cube_id: Number(productForm.cube_id),
      product_name: productForm.product_name.trim(),
      description: productForm.description ? productForm.description.trim() : null,
      price: Number(productForm.price),
      stock_quantity: Number(productForm.stock_quantity || 1),
      variant: productForm.variant ? productForm.variant.trim() : null,
      image_url: imageUrl,
    }])
    setBusy(false)
    if (error) return alert(error.message)
    setProductForm({
      product_name: '',
      description: '',
      price: '',
      stock_quantity: '1',
      variant: '',
      image_url: '',
      cube_id: productForm.cube_id,
    })
    setImageFile(null)
    setImagePreview(null)
    void load()
  }

  function onProductImage(file: File | null) {
    setImageFile(file)
    if (!file) {
      setImagePreview(null)
      return
    }
    const reader = new FileReader()
    reader.onload = () => setImagePreview(String(reader.result || ''))
    reader.readAsDataURL(file)
  }

  const available = cubes.filter((c) => c.status === 'Available' && !c.deleted_at)
  const expiring = contracts.filter((c) => c.status === 'Active' && daysUntil(c.end_date) <= 7 && daysUntil(c.end_date) >= 0)

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>Renter Workspace</h1>
          <p className="lede">Manage your rented cubes, monitor Display product sales, and track customer Pick-up handovers.</p>
        </div>
      </div>

      {expiring.length > 0 && (
        <div className="alert warn" style={{ marginBottom: '1.5rem' }}>
          <strong>Near expiry</strong>
          <ul style={{ margin: '0.55rem 0 0', paddingLeft: 18 }}>
            {expiring.map((c) => (
              <li key={c.contract_id}>
                Cube {c.cubes?.cube_number}: {daysUntil(c.end_date)} day(s) left (ends {c.end_date})
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* DASHBOARD NAVIGATION TABS */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.75rem', borderBottom: '2px solid #efefef', paddingBottom: '0.5rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          className={activeTab === 'display' ? 'btn' : 'btn-ghost'}
          onClick={() => setActiveTab('display')}
        >
          🏬 Display Products & Sales ({displayProducts.length})
        </button>
        <button
          type="button"
          className={activeTab === 'pickup' ? 'btn' : 'btn-ghost'}
          onClick={() => setActiveTab('pickup')}
        >
          📦 Pick-up Items & Handovers ({pickupProducts.length})
        </button>
        <button
          type="button"
          className={activeTab === 'cubes_contracts' ? 'btn' : 'btn-ghost'}
          onClick={() => setActiveTab('cubes_contracts')}
        >
          🔑 My Cubes & Contracts ({contracts.length})
        </button>
      </div>

      {loading ? (
        <div className="empty" style={{ padding: '3rem' }}>Loading renter workspace…</div>
      ) : (
        <>
      {/* ════════════ TAB 1: DISPLAY PRODUCTS & SALES ════════════ */}
      {activeTab === 'display' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h2 style={{ margin: 0 }}>My Display Products</h2>
              <p className="muted" style={{ margin: '0.25rem 0 0' }}>Products showcased in your Display cubes. Track availability, variants, and online payment receipts.</p>
            </div>
          </div>

          {/* Product Cards */}
          <div className="grid" style={{ marginBottom: '2.5rem' }}>
            {displayProducts.map((p) => {
              const isAvailable = p.stock_quantity > 0
              return (
                <div className="card" key={p.product_id}>
                  <div className="card-media" style={{ background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {p.image_url ? (
                      <img src={p.image_url} alt={p.product_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div className="muted" style={{ fontSize: '0.8rem' }}>No Photo</div>
                    )}
                  </div>
                  <div className="card-body">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <h3>{p.product_name}</h3>
                      <span className={`status-pill ${isAvailable ? 'confirmed' : 'pending'}`}>
                        {isAvailable ? 'Available' : 'Sold Out'}
                      </span>
                    </div>
                    {p.description && <p className="muted" style={{ fontSize: '0.82rem', margin: '0.25rem 0' }}>{p.description}</p>}
                    <div className="price">{peso(p.price)}</div>
                    <div className="meta-line">
                      <span><strong>{p.stock_quantity}</strong> in stock</span>
                      <span>{p.variant ? `Variant: ${p.variant}` : 'Standard'}</span>
                      <span>Cube {p.cubes?.cube_number || '—'}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          {displayProducts.length === 0 && (
            <div className="empty" style={{ padding: '2rem', marginBottom: '2rem' }}>
              No display products listed yet. Add one below!
            </div>
          )}

          {/* Display Sales History */}
          <h2>Display Sales Transactions</h2>
          <p className="muted">Sales records for your display items, payment confirmation, and online payment receipts.</p>
          <div className="table-wrap" style={{ marginBottom: '2.5rem' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Variant</th>
                  <th>Date</th>
                  <th>Price</th>
                  <th>Payment Status</th>
                  <th>Receipt Proof</th>
                  <th>Processed By</th>
                </tr>
              </thead>
              <tbody>
                {displayTransactions.map((t) => (
                  <tr key={t.transaction_id}>
                    <td><strong>{t.products?.product_name || '—'}</strong></td>
                    <td>{t.products?.variant || 'Standard'}</td>
                    <td>{new Date(t.transaction_date).toLocaleString('en-PH')}</td>
                    <td>{peso(t.products?.price)}</td>
                    <td>
                      <span className={`status-pill ${t.payment_status === 'Paid' ? 'confirmed' : 'pending'}`}>
                        {t.payment_status}
                      </span>
                    </td>
                    <td>
                      {t.receipt_image_url ? (
                        <img
                          src={t.receipt_image_url}
                          alt="Receipt proof"
                          style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 4, cursor: 'pointer', border: '1px solid #ddd' }}
                          onClick={() => setPreviewReceipt(t.receipt_image_url)}
                          title="Click to zoom receipt"
                        />
                      ) : (
                        <span className="muted">Cash / None</span>
                      )}
                    </td>
                    <td>{t.users ? `${t.users.full_name} (${t.users.role})` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {displayTransactions.length === 0 && (
              <div className="empty" style={{ padding: '1.5rem' }}>No display sales records yet.</div>
            )}
          </div>
        </div>
      )}

      {/* ════════════ TAB 2: PICK-UP ITEMS & HANDOVERS ════════════ */}
      {activeTab === 'pickup' && (
        <div>
          <div style={{ marginBottom: '1rem' }}>
            <h2 style={{ margin: 0 }}>My Pick-up Products</h2>
            <p className="muted" style={{ margin: '0.25rem 0 0' }}>Items placed in Pick-up cubes waiting for buyers or authorized alternates to claim.</p>
          </div>

          {/* Product Cards */}
          <div className="grid" style={{ marginBottom: '2.5rem' }}>
            {pickupProducts.map((p) => (
              <div className="card" key={p.product_id}>
                <div className="card-media" style={{ background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {p.image_url ? (
                    <img src={p.image_url} alt={p.product_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div className="muted" style={{ fontSize: '0.8rem' }}>No Photo</div>
                  )}
                </div>
                <div className="card-body">
                  <h3>{p.product_name}</h3>
                  {p.description && <p className="muted" style={{ fontSize: '0.82rem', margin: '0.25rem 0' }}>{p.description}</p>}
                  <div className="price">{peso(p.price)}</div>
                  <div className="meta-line">
                    <span><strong>{p.stock_quantity}</strong> left</span>
                    <span>{p.variant ? `Variant: ${p.variant}` : 'Standard'}</span>
                    <span>Cube {p.cubes?.cube_number || '—'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {pickupProducts.length === 0 && (
            <div className="empty" style={{ padding: '2rem', marginBottom: '2rem' }}>
              No pick-up products listed yet.
            </div>
          )}

          {/* Pickup Transactions Table */}
          <h2>Pick-up Handovers & Status</h2>
          <p className="muted">Live status of customer pick-ups: whether waiting or picked-up, who claimed it, and payment proof.</p>
          <div className="table-wrap" style={{ marginBottom: '2.5rem' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Buyer Name</th>
                  <th>Authorized Alternate</th>
                  <th>Pickup Status</th>
                  <th>Payment Status</th>
                  <th>Receipt Proof</th>
                  <th>Notes</th>
                  <th>Date & Staff</th>
                </tr>
              </thead>
              <tbody>
                {pickupTransactions.map((t) => (
                  <tr key={t.transaction_id}>
                    <td>
                      <strong>{t.products?.product_name || '—'}</strong>
                      {t.products?.variant && <div className="muted" style={{ fontSize: '0.75rem' }}>{t.products.variant}</div>}
                    </td>
                    <td><strong>{t.buyer_name || '—'}</strong></td>
                    <td>{t.authorized_pickup_name || <span className="muted">—</span>}</td>
                    <td>
                      <span className={`status-pill ${t.pickup_status === 'Picked-up' ? 'confirmed' : 'pending'}`}>
                        {t.pickup_status || 'Waiting'}
                      </span>
                    </td>
                    <td>
                      <span className={`status-pill ${t.payment_status === 'Paid' ? 'confirmed' : 'pending'}`}>
                        {t.payment_status}
                      </span>
                    </td>
                    <td>
                      {t.receipt_image_url ? (
                        <img
                          src={t.receipt_image_url}
                          alt="Receipt proof"
                          style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 4, cursor: 'pointer', border: '1px solid #ddd' }}
                          onClick={() => setPreviewReceipt(t.receipt_image_url)}
                          title="Click to zoom receipt"
                        />
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td><div style={{ fontSize: '0.8rem', color: '#555' }}>{t.notes || '—'}</div></td>
                    <td>
                      <div style={{ fontSize: '0.8rem' }}>{new Date(t.transaction_date).toLocaleDateString('en-PH')}</div>
                      <div className="muted" style={{ fontSize: '0.75rem' }}>{t.users?.full_name || 'Staff'}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {pickupTransactions.length === 0 && (
              <div className="empty" style={{ padding: '1.5rem' }}>No pick-up transaction records yet.</div>
            )}
          </div>
        </div>
      )}

      {/* ════════════ ADD PRODUCT FORM (Visible on both display and pickup tabs) ════════════ */}
      {activeTab !== 'cubes_contracts' && (
        <div className="panel" style={{ marginBottom: '2.5rem' }}>
          <h2 style={{ marginTop: 0 }}>Add Product to Your Cubes</h2>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
            <div className="field">
              <label>Product Name *</label>
              <input value={productForm.product_name} onChange={(e) => setProductForm({ ...productForm, product_name: e.target.value })} />
            </div>
            <div className="field">
              <label>Price (₱) *</label>
              <input type="number" min="0" value={productForm.price} onChange={(e) => setProductForm({ ...productForm, price: e.target.value })} />
            </div>
            <div className="field">
              <label>Quantity *</label>
              <input type="number" min="0" value={productForm.stock_quantity} onChange={(e) => setProductForm({ ...productForm, stock_quantity: e.target.value })} />
            </div>
            <div className="field">
              <label>Variant / Shade</label>
              <input placeholder="e.g. Size M, Shade #2" value={productForm.variant} onChange={(e) => setProductForm({ ...productForm, variant: e.target.value })} />
            </div>
            <div className="field">
              <label>Assigned Cube *</label>
              <select value={productForm.cube_id} onChange={(e) => setProductForm({ ...productForm, cube_id: e.target.value })}>
                <option value="">Select your cube…</option>
                {myCubes.map((c) => (
                  <option key={c.cube_id} value={c.cube_id}>{c.cube_number} ({c.type})</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Photo</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => onProductImage(e.target.files?.[0] || null)}
              />
              {imagePreview && (
                <img
                  className="thumb"
                  src={imagePreview}
                  alt="Preview"
                  style={{ marginTop: 8, maxWidth: 100, maxHeight: 100, objectFit: 'cover', borderRadius: 4 }}
                />
              )}
            </div>
          </div>
          <div className="field" style={{ marginTop: '0.75rem' }}>
            <label>Description</label>
            <textarea rows={2} value={productForm.description} onChange={(e) => setProductForm({ ...productForm, description: e.target.value })} />
          </div>
          <button className="btn" type="button" disabled={busy} onClick={addProduct} style={{ marginTop: '0.5rem' }}>
            {busy ? 'Saving…' : 'List Product'}
          </button>
        </div>
      )}

      {/* ════════════ TAB 3: CUBES & CONTRACTS ════════════ */}
      {activeTab === 'cubes_contracts' && (
        <div>
          <h2>Available Cubes For Rent</h2>
          <div className="field" style={{ maxWidth: 220, marginBottom: '1rem' }}>
            <label>Reserve length (months)</label>
            <select value={months} onChange={(e) => setMonths(Number(e.target.value))}>
              {[1, 2, 3, 6, 12].map((m) => <option key={m} value={m}>{m} month(s)</option>)}
            </select>
          </div>

          <div className="grid" style={{ marginBottom: '2.5rem' }}>
            {available.map((c) => (
              <div className="card" key={c.cube_id}>
                {c.image_url && (
                  <div className="card-media" style={{ height: 160 }}>
                    <img src={c.image_url} alt={c.cube_number} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                )}
                <div className="card-body">
                  <h3>Cube {c.cube_number}</h3>
                  <div className="meta-line">
                    <span>{c.type} Cube</span>
                    <span className="badge ok">{c.status}</span>
                  </div>
                  {c.width_cm && c.height_cm && (
                    <div className="muted" style={{ fontSize: '0.8rem', marginTop: 4 }}>
                      Size: {c.width_cm} × {c.height_cm} cm
                    </div>
                  )}
                  <div className="price">{peso(c.price_per_month)}<span className="muted" style={{ fontSize: '0.85rem' }}> / mo</span></div>
                  <button className="btn" type="button" disabled={busy} onClick={() => reserveCube(c)} style={{ marginTop: '0.75rem', width: '100%' }}>
                    Reserve Cube
                  </button>
                </div>
              </div>
            ))}
          </div>
          {available.length === 0 && <div className="empty" style={{ padding: '2rem' }}>No available cubes right now.</div>}

          <h2>Your Active & Pending Contracts</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Cube</th>
                  <th>Type</th>
                  <th>Period</th>
                  <th>Days Left</th>
                  <th>Status</th>
                  <th className="no-print" style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((c) => {
                  const left = daysUntil(c.end_date)
                  return (
                    <tr key={c.contract_id}>
                      <td><strong>{c.cubes?.cube_number}</strong></td>
                      <td>{c.cubes?.type}</td>
                      <td>{c.start_date} → {c.end_date}</td>
                      <td>
                        <span className={`status-pill ${left <= 7 && left >= 0 ? 'pending' : left < 0 ? 'pending' : 'confirmed'}`}>
                          {left < 0 ? 'Expired' : `${left} day(s)`}
                        </span>
                      </td>
                      <td>{c.status}</td>
                      <td className="no-print" style={{ textAlign: 'right' }}>
                        <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                          {c.status === 'Pending' && (
                            <button className="btn-ghost" type="button" onClick={() => activateContract(c)}>Activate</button>
                          )}
                          {(c.status === 'Active' || c.status === 'Pending') && (
                            <>
                              <button className="btn" type="button" onClick={() => extendContract(c, 1)}>+1 mo</button>
                              <button className="btn-ghost" type="button" onClick={() => extendContract(c, 3)}>+3 mos</button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {contracts.length === 0 && <div className="empty" style={{ padding: '2rem' }}>No contracts on record.</div>}
          </div>
        </div>
      )}
        </>
      )}

      {/* RECEIPT ZOOM MODAL */}
      {previewReceipt && (
        <div className="modal-overlay" onClick={() => setPreviewReceipt(null)}>
          <div className="modal-card" style={{ maxWidth: 600, textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Receipt Proof</h3>
              <button className="modal-close" onClick={() => setPreviewReceipt(null)}>✕</button>
            </div>
            <img src={previewReceipt} alt="Receipt proof" style={{ maxWidth: '100%', maxHeight: '75vh', objectFit: 'contain', marginTop: 12 }} />
          </div>
        </div>
      )}
    </section>
  )
}
