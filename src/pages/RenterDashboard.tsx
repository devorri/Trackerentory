import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Store, Package, KeyRound, X, ArrowUpDown } from 'lucide-react'
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
import { BUCKET_DOCUMENTS, BUCKET_PRODUCT_IMAGES } from '../lib/supabase'

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
    category: '',
    image_url: '',
    cube_id: '',
    buyer_name: '',
    authorized_pickup_name: '',
    payment_status: 'Pending' as 'Pending' | 'Paid',
    payment_method: 'Cash' as 'Cash' | 'Online',
    pickup_notes: '',
  })

  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [pickupReceiptFile, setPickupReceiptFile] = useState<File | null>(null)
  const [pickupReceiptPreview, setPickupReceiptPreview] = useState<string | null>(null)

  // Edit Handover Modal State
  const [editingTx, setEditingTx] = useState<Transaction | null>(null)
  const [editTxForm, setEditTxForm] = useState({
    buyer_name: '',
    authorized_pickup_name: '',
    payment_status: 'Pending' as 'Pending' | 'Paid',
    payment_method: 'Cash' as 'Cash' | 'Online',
    notes: '',
  })
  const [editTxReceiptFile, setEditTxReceiptFile] = useState<File | null>(null)

  // New Handover for existing pick-up product Modal State
  const [isNewHandoverModalOpen, setIsNewHandoverModalOpen] = useState(false)
  const [newHandoverForm, setNewHandoverForm] = useState({
    product_id: '',
    buyer_name: '',
    authorized_pickup_name: '',
    quantity: '1',
    payment_status: 'Pending' as 'Pending' | 'Paid',
    payment_method: 'Cash' as 'Cash' | 'Online',
    notes: '',
  })
  const [newHandoverReceiptFile, setNewHandoverReceiptFile] = useState<File | null>(null)

  async function load(silent = false) {
    if (!user) return
    if (!silent) setLoading(true)
    if (!silent) await expireContracts()
    const [cRes, conRes, pRes, tRes] = await Promise.all([
      supabase.from('cubes').select('*').order('cube_number'),
      supabase.from('contracts').select('*, cubes(*)').eq('renter_id', user.user_id).order('end_date'),
      supabase.from('products').select('*, cubes(cube_number, type)').eq('renter_id', user.user_id),
      supabase
        .from('transactions')
        .select('*, products(*, cubes(cube_number, type)), users!processed_by(full_name, role)')
        .order('transaction_date', { ascending: false }),
    ])
      if (!silent) setLoading(false)
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

  useEffect(() => {
    void load()
    const refreshTimer = window.setInterval(() => void load(true), 15000)
    return () => window.clearInterval(refreshTimer)
  }, [user])

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

  const hasDisplayCube = myCubes.some((cube) => cube.type === 'Display')
  const hasPickupCube = myCubes.some((cube) => cube.type === 'Pick-up')
  const visibleTab = activeTab === 'display' && !hasDisplayCube && hasPickupCube
    ? 'pickup'
    : activeTab === 'pickup' && !hasPickupCube && hasDisplayCube
      ? 'display'
      : activeTab

  const [sortDisplayTx, setSortDisplayTx] = useState<{ col: string; dir: 'asc' | 'desc' }>({ col: 'date', dir: 'desc' })
  const [sortPickupTx, setSortPickupTx] = useState<{ col: string; dir: 'asc' | 'desc' }>({ col: 'date', dir: 'desc' })
  const [sortContracts, setSortContracts] = useState<{ col: string; dir: 'asc' | 'desc' }>({ col: 'days', dir: 'asc' })

  function renderSortIndicator(currentCol: string, sortState: { col: string; dir: 'asc' | 'desc' }) {
    if (sortState.col !== currentCol) {
      return <ArrowUpDown size={12} style={{ opacity: 0.35, marginLeft: 4, verticalAlign: 'middle', display: 'inline' }} />
    }
    return <span style={{ marginLeft: 4, fontSize: '0.72rem' }}>{sortState.dir === 'asc' ? '▲' : '▼'}</span>
  }

  function toggleSort(state: { col: string; dir: 'asc' | 'desc' }, setState: React.Dispatch<React.SetStateAction<{ col: string; dir: 'asc' | 'desc' }>>, col: string) {
    if (state.col === col) {
      setState({ col, dir: state.dir === 'asc' ? 'desc' : 'asc' })
    } else {
      setState({ col, dir: 'asc' })
    }
  }

  const displayTransactions = useMemo(() => {
    const list = transactions.filter((t) => t.products?.cubes?.type === 'Display')
    const { col, dir } = sortDisplayTx
    list.sort((a, b) => {
      let vA: any = ''
      let vB: any = ''
      if (col === 'product') { vA = a.products?.product_name || ''; vB = b.products?.product_name || '' }
      else if (col === 'variant') { vA = a.products?.variant || ''; vB = b.products?.variant || '' }
      else if (col === 'date') { vA = new Date(a.transaction_date).getTime(); vB = new Date(b.transaction_date).getTime() }
      else if (col === 'price') { vA = Number(a.products?.price || 0); vB = Number(b.products?.price || 0) }
      else if (col === 'payment') { vA = a.payment_status; vB = b.payment_status }
      else if (col === 'qty') { vA = Number(a.quantity || 1); vB = Number(b.quantity || 1) }
      if (vA < vB) return dir === 'asc' ? -1 : 1
      if (vA > vB) return dir === 'asc' ? 1 : -1
      return 0
    })
    return list
  }, [transactions, sortDisplayTx])

  const pickupTransactions = useMemo(() => {
    const list = transactions.filter((t) => t.products?.cubes?.type === 'Pick-up')
    const { col, dir } = sortPickupTx
    list.sort((a, b) => {
      let vA: any = ''
      let vB: any = ''
      if (col === 'product') { vA = a.products?.product_name || a.product_name || ''; vB = b.products?.product_name || b.product_name || '' }
      else if (col === 'buyer') { vA = a.buyer_name || ''; vB = b.buyer_name || '' }
      else if (col === 'pickup') { vA = a.pickup_status || ''; vB = b.pickup_status || '' }
      else if (col === 'payment') { vA = a.payment_status; vB = b.payment_status }
      else if (col === 'date') { vA = new Date(a.updated_at || a.transaction_date).getTime(); vB = new Date(b.updated_at || b.transaction_date).getTime() }
      if (vA < vB) return dir === 'asc' ? -1 : 1
      if (vA > vB) return dir === 'asc' ? 1 : -1
      return 0
    })
    return list
  }, [transactions, sortPickupTx])

  const contractsSorted = useMemo(() => {
    const list = [...contracts]
    const { col, dir } = sortContracts
    list.sort((a, b) => {
      let vA: any = ''
      let vB: any = ''
      if (col === 'cube') { vA = a.cubes?.cube_number || ''; vB = b.cubes?.cube_number || '' }
      else if (col === 'type') { vA = a.cubes?.type || ''; vB = b.cubes?.type || '' }
      else if (col === 'period') { vA = a.end_date || ''; vB = b.end_date || '' }
      else if (col === 'days') { vA = daysUntil(a.end_date); vB = daysUntil(b.end_date) }
      else if (col === 'status') { vA = a.status; vB = b.status }
      if (vA < vB) return dir === 'asc' ? -1 : 1
      if (vA > vB) return dir === 'asc' ? 1 : -1
      return 0
    })
    return list
  }, [contracts, sortContracts])

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

    // Also record in reservations table for tracking
    const expiry = new Date(Date.now() + months * 30 * 24 * 60 * 60 * 1000).toISOString()
    await supabase.from('reservations').insert([{
      cube_id: cube.cube_id,
      customer_id: user!.user_id,
      expiry_time: expiry,
      hours_valid: months * 720,
      status: 'Pending',
    }])

    await supabase.from('cubes').update({ status: 'Occupied' }).eq('cube_id', cube.cube_id)
    setBusy(false)
    alert(`Cube ${cube.cube_number} reserved! Your agreement request is now Pending Owner approval.`)
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

    const selectedCube = myCubes.find((cube) => cube.cube_id === Number(productForm.cube_id))
    if (selectedCube?.type === 'Pick-up' && !productForm.buyer_name.trim()) {
      return alert('Buyer Name is required for pick-up items so staff can verify the claimant.')
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

    const { data: createdProduct, error } = await supabase.from('products').insert([{
      renter_id: user!.user_id,
      cube_id: Number(productForm.cube_id),
      product_name: productForm.product_name.trim(),
      description: productForm.description ? productForm.description.trim() : null,
      price: Number(productForm.price),
      stock_quantity: Number(productForm.stock_quantity || 1),
      variant: productForm.variant ? productForm.variant.trim() : null,
      category: productForm.category ? productForm.category.trim() : null,
      image_url: imageUrl,
    }]).select('product_id').single()

    if (error) {
      setBusy(false)
      return alert(error.message)
    }

    if (selectedCube?.type === 'Pick-up' && createdProduct) {
      let pickupReceiptUrl = null
      if (pickupReceiptFile) {
        const up = await uploadPublicImage(BUCKET_DOCUMENTS, pickupReceiptFile, 'receipts')
        if (up.url) pickupReceiptUrl = up.url
      }

      const { error: trackingError } = await supabase.from('transactions').insert([{
        product_id: createdProduct.product_id,
        product_name: `${productForm.product_name.trim()}${productForm.variant ? ` (${productForm.variant.trim()})` : ''}`,
        cube_id: selectedCube.cube_id,
        renter_id: user!.user_id,
        buyer_name: productForm.buyer_name.trim(),
        authorized_pickup_name: productForm.authorized_pickup_name.trim() || null,
        payment_status: productForm.payment_status,
        payment_method: productForm.payment_method,
        pickup_status: 'Waiting',
        quantity: Math.min(Number(productForm.stock_quantity || 1), 1),
        listed_quantity: Number(productForm.stock_quantity || 1),
        notes: productForm.pickup_notes.trim() || productForm.description.trim() || null,
        receipt_image_url: pickupReceiptUrl,
        processed_by: user!.user_id,
        updated_at: new Date().toISOString(),
      }])
      if (trackingError) alert(`Product saved, but pickup tracking could not be created: ${trackingError.message}`)
    }

    setBusy(false)
    setProductForm({
      product_name: '',
      description: '',
      price: '',
      stock_quantity: '1',
      variant: '',
      category: '',
      image_url: '',
      cube_id: productForm.cube_id,
      buyer_name: '',
      authorized_pickup_name: '',
      payment_status: 'Pending',
      payment_method: 'Cash',
      pickup_notes: '',
    })
    setImageFile(null)
    setImagePreview(null)
    setPickupReceiptFile(null)
    setPickupReceiptPreview(null)
    alert(selectedCube?.type === 'Pick-up' ? 'Pick-up item and claimant details saved! Staff will confirm when claimed.' : 'Product listed successfully!')
    void load()
  }

  async function addNewHandover() {
    if (!newHandoverForm.product_id || !newHandoverForm.buyer_name.trim()) {
      return alert('Please select a product and enter the buyer name.')
    }
    const prod = pickupProducts.find((p) => p.product_id === Number(newHandoverForm.product_id))
    if (!prod) return alert('Selected product not found.')
    const qty = Math.max(1, Number(newHandoverForm.quantity || 1))
    if (qty > prod.stock_quantity) {
      return alert(`Cannot allocate ${qty} unit(s). Only ${prod.stock_quantity} left in stock.`)
    }
    setBusy(true)

    let receiptUrl = null
    if (newHandoverReceiptFile) {
      const up = await uploadPublicImage(BUCKET_DOCUMENTS, newHandoverReceiptFile, 'receipts')
      if (up.url) receiptUrl = up.url
    }

    const { error } = await supabase.from('transactions').insert([{
      product_id: prod.product_id,
      product_name: `${prod.product_name}${prod.variant ? ` (${prod.variant})` : ''}`,
      cube_id: prod.cube_id,
      renter_id: user!.user_id,
      buyer_name: newHandoverForm.buyer_name.trim(),
      authorized_pickup_name: newHandoverForm.authorized_pickup_name.trim() || null,
      payment_status: newHandoverForm.payment_status,
      payment_method: newHandoverForm.payment_method,
      pickup_status: 'Waiting',
      quantity: qty,
      listed_quantity: prod.stock_quantity,
      receipt_image_url: receiptUrl,
      notes: newHandoverForm.notes.trim() || null,
      processed_by: user!.user_id,
      updated_at: new Date().toISOString(),
    }])

    setBusy(false)
    if (error) return alert('Failed to create handover record: ' + error.message)
    setIsNewHandoverModalOpen(false)
    setNewHandoverForm({
      product_id: '',
      buyer_name: '',
      authorized_pickup_name: '',
      quantity: '1',
      payment_status: 'Pending',
      payment_method: 'Cash',
      notes: '',
    })
    setNewHandoverReceiptFile(null)
    alert('Pick-up handover entry created! Staff will confirm when claimed.')
    void load()
  }

  function openEditTx(t: Transaction) {
    setEditingTx(t)
    setEditTxForm({
      buyer_name: t.buyer_name || '',
      authorized_pickup_name: t.authorized_pickup_name || '',
      payment_status: t.payment_status === 'Paid' ? 'Paid' : 'Pending',
      payment_method: t.payment_method === 'Online' ? 'Online' : 'Cash',
      notes: t.notes || '',
    })
    setEditTxReceiptFile(null)
  }

  async function updateHandover() {
    if (!editingTx) return
    if (!editTxForm.buyer_name.trim()) return alert('Buyer name cannot be empty.')
    setBusy(true)

    let receiptUrl = editingTx.receipt_image_url
    if (editTxReceiptFile) {
      const up = await uploadPublicImage(BUCKET_DOCUMENTS, editTxReceiptFile, 'receipts')
      if (up.url) receiptUrl = up.url
    }

    const { error } = await supabase.from('transactions').update({
      buyer_name: editTxForm.buyer_name.trim(),
      authorized_pickup_name: editTxForm.authorized_pickup_name.trim() || null,
      payment_status: editTxForm.payment_status,
      payment_method: editTxForm.payment_method,
      receipt_image_url: receiptUrl,
      notes: editTxForm.notes.trim() || null,
      updated_at: new Date().toISOString(),
    }).eq('transaction_id', editingTx.transaction_id)

    setBusy(false)
    if (error) return alert('Failed to update: ' + error.message)
    setEditingTx(null)
    setEditTxReceiptFile(null)
    alert('Pick-up handover details updated successfully!')
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

  async function uploadPickupReceipt(transaction: Transaction, file: File | null) {
    if (!file) return
    const upload = await uploadPublicImage(BUCKET_DOCUMENTS, file, 'receipts')
    if (!upload.url) return alert('Receipt upload failed: ' + (upload.error || 'unknown error'))
    const { error } = await supabase
      .from('transactions')
      .update({ receipt_image_url: upload.url, payment_method: 'Online', processed_by: user!.user_id, updated_at: new Date().toISOString() })
      .eq('transaction_id', transaction.transaction_id)
    if (error) return alert(error.message)
    void load()
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
        {hasDisplayCube && <button
          type="button"
          className={visibleTab === 'display' ? 'btn' : 'btn-ghost'}
          onClick={() => setActiveTab('display')}
        >
          <Store size={16} /> Display Products & Sales ({displayProducts.length})
        </button>}
        {hasPickupCube && <button
          type="button"
          className={visibleTab === 'pickup' ? 'btn' : 'btn-ghost'}
          onClick={() => setActiveTab('pickup')}
        >
          <Package size={16} /> Pick-up Items & Handovers ({pickupProducts.length})
        </button>}
        <button
          type="button"
          className={visibleTab === 'cubes_contracts' ? 'btn' : 'btn-ghost'}
          onClick={() => setActiveTab('cubes_contracts')}
        >
          <KeyRound size={16} /> My Cubes & Contracts ({contracts.length})
        </button>
      </div>

      {loading ? (
        <div className="empty" style={{ padding: '3rem' }}>Loading renter workspace…</div>
      ) : (
        <>
      {/* ════════════ TAB 1: DISPLAY PRODUCTS & SALES ════════════ */}
      {visibleTab === 'display' && (
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
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort(sortDisplayTx, setSortDisplayTx, 'product')}>
                    Product {renderSortIndicator('product', sortDisplayTx)}
                  </th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort(sortDisplayTx, setSortDisplayTx, 'variant')}>
                    Variant {renderSortIndicator('variant', sortDisplayTx)}
                  </th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort(sortDisplayTx, setSortDisplayTx, 'date')}>
                    Date {renderSortIndicator('date', sortDisplayTx)}
                  </th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort(sortDisplayTx, setSortDisplayTx, 'price')}>
                    Price {renderSortIndicator('price', sortDisplayTx)}
                  </th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort(sortDisplayTx, setSortDisplayTx, 'payment')}>
                    Payment Status {renderSortIndicator('payment', sortDisplayTx)}
                  </th>
                  <th>Payment Process</th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort(sortDisplayTx, setSortDisplayTx, 'qty')}>
                    Quantity {renderSortIndicator('qty', sortDisplayTx)}
                  </th>
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
                    <td>{t.payment_method || 'Cash'}</td>
                    <td>{t.quantity || 1}</td>
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
      {visibleTab === 'pickup' && (
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginTop: '1.5rem', marginBottom: '0.5rem' }}>
            <div>
              <h2 style={{ margin: 0 }}>Pick-up Handovers & Status</h2>
              <p className="muted" style={{ margin: '0.25rem 0 0' }}>Live status of customer pick-ups: whether waiting or picked-up, who claimed it, and payment proof.</p>
            </div>
            {pickupProducts.length > 0 && (
              <button
                className="btn"
                type="button"
                onClick={() => {
                  setNewHandoverForm({
                    product_id: String(pickupProducts[0].product_id),
                    buyer_name: '',
                    authorized_pickup_name: '',
                    quantity: '1',
                    payment_status: 'Pending',
                    payment_method: 'Cash',
                    notes: '',
                  })
                  setNewHandoverReceiptFile(null)
                  setIsNewHandoverModalOpen(true)
                }}
              >
                + Add Buyer / Pick-up Entry
              </button>
            )}
          </div>
          <div className="table-wrap" style={{ marginBottom: '2.5rem' }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort(sortPickupTx, setSortPickupTx, 'product')}>
                    Product {renderSortIndicator('product', sortPickupTx)}
                  </th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort(sortPickupTx, setSortPickupTx, 'buyer')}>
                    Buyer Name {renderSortIndicator('buyer', sortPickupTx)}
                  </th>
                  <th>Authorized Alternate</th>
                  <th>Quantity left</th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort(sortPickupTx, setSortPickupTx, 'pickup')}>
                    Pickup Status {renderSortIndicator('pickup', sortPickupTx)}
                  </th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort(sortPickupTx, setSortPickupTx, 'payment')}>
                    Payment Status {renderSortIndicator('payment', sortPickupTx)}
                  </th>
                  <th>Receipt Proof</th>
                  <th>Notes</th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort(sortPickupTx, setSortPickupTx, 'date')}>
                    Date & Staff {renderSortIndicator('date', sortPickupTx)}
                  </th>
                  <th className="no-print" style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pickupTransactions.map((t) => (
                  <tr key={t.transaction_id}>
                    <td>
                      <strong>{t.products?.product_name || t.product_name || '—'}</strong>
                      {t.products?.variant && <div className="muted" style={{ fontSize: '0.75rem' }}>{t.products.variant}</div>}
                    </td>
                    <td><strong>{t.buyer_name || '—'}</strong></td>
                    <td>{t.authorized_pickup_name || <span className="muted">—</span>}</td>
                    <td>{t.listed_quantity ?? t.products?.stock_quantity ?? '—'}</td>
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
                      <input
                        className="no-print"
                        type="file"
                        accept="image/*"
                        aria-label="Upload payment receipt"
                        onChange={(event) => void uploadPickupReceipt(t, event.target.files?.[0] || null)}
                        style={{ display: 'block', maxWidth: 150, marginTop: 6, fontSize: '0.75rem' }}
                      />
                    </td>
                    <td><div style={{ fontSize: '0.8rem', color: '#555' }}>{t.notes || '—'}</div></td>
                    <td>
                      <div style={{ fontSize: '0.8rem' }}>Updated {new Date(t.updated_at || t.transaction_date).toLocaleString('en-PH')}</div>
                      <div className="muted" style={{ fontSize: '0.75rem' }}>{t.users?.full_name || 'Renter'}</div>
                    </td>
                    <td className="no-print" style={{ textAlign: 'right' }}>
                      {t.pickup_status === 'Picked-up' ? (
                        <span className="badge ok" style={{ fontSize: '0.75rem' }}>Completed</span>
                      ) : (
                        <button
                          className="btn-ghost"
                          type="button"
                          style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem' }}
                          onClick={() => openEditTx(t)}
                        >
                          Edit Info
                        </button>
                      )}
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
      {visibleTab !== 'cubes_contracts' && (
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
              <label>Category (e.g. Perfumes, Dresses)</label>
              <input
                list="renter-categories"
                placeholder="Type or select category"
                value={productForm.category}
                onChange={(e) => setProductForm({ ...productForm, category: e.target.value })}
              />
              <datalist id="renter-categories">
                <option value="Perfumes" />
                <option value="Dresses" />
                <option value="Cosmetics & Skincare" />
                <option value="Accessories" />
                <option value="Footwear" />
                <option value="Food & Treats" />
                <option value="Others" />
              </datalist>
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

          {/* Conditional Pick-up Handover & Claimant Details */}
          {myCubes.find((c) => String(c.cube_id) === String(productForm.cube_id))?.type === 'Pick-up' && (
            <div style={{ marginTop: '1.25rem', marginBottom: '1rem', padding: '1rem', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                <span className="badge" style={{ background: '#0284c7', color: '#fff' }}>Pick-up Cube</span>
                <h3 style={{ margin: 0, fontSize: '1rem', color: '#0f172a' }}>Handover & Claimant Information</h3>
              </div>
              <p className="muted" style={{ fontSize: '0.82rem', marginTop: 0, marginBottom: '1rem' }}>
                Specify the customer and authorized alternate who will claim this item. Staff will verify claimant and payment at the counter.
              </p>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                <div className="field">
                  <label>Buyer / Customer Name *</label>
                  <input
                    placeholder="e.g. Maria Santos"
                    value={productForm.buyer_name}
                    onChange={(e) => setProductForm({ ...productForm, buyer_name: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Authorized Alternate Claimant</label>
                  <input
                    placeholder="e.g. Juan Santos (relative / courier)"
                    value={productForm.authorized_pickup_name}
                    onChange={(e) => setProductForm({ ...productForm, authorized_pickup_name: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Payment Status</label>
                  <select
                    value={productForm.payment_status}
                    onChange={(e) => setProductForm({ ...productForm, payment_status: e.target.value as 'Pending' | 'Paid' })}
                  >
                    <option value="Pending">Pending Payment (Collect at counter)</option>
                    <option value="Paid">Paid (Paid online to renter - staff verifies)</option>
                  </select>
                </div>
                <div className="field">
                  <label>Payment Method</label>
                  <select
                    value={productForm.payment_method}
                    onChange={(e) => setProductForm({ ...productForm, payment_method: e.target.value as 'Cash' | 'Online' })}
                  >
                    <option value="Cash">Cash</option>
                    <option value="Online">GCash / Maya / Online</option>
                  </select>
                </div>
                <div className="field">
                  <label>Payment Receipt Proof (if Paid)</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null
                      setPickupReceiptFile(file)
                      if (file) {
                        const r = new FileReader()
                        r.onload = () => setPickupReceiptPreview(String(r.result || ''))
                        r.readAsDataURL(file)
                      } else {
                        setPickupReceiptPreview(null)
                      }
                    }}
                  />
                  {pickupReceiptPreview && (
                    <img
                      src={pickupReceiptPreview}
                      alt="Receipt preview"
                      style={{ marginTop: 6, maxWidth: 90, maxHeight: 90, objectFit: 'cover', borderRadius: 4 }}
                    />
                  )}
                </div>
              </div>
              <div className="field" style={{ marginTop: '0.75rem' }}>
                <label>Notes / Instructions for Staff</label>
                <input
                  placeholder="e.g. Paid via GCash ref #1234, or claimant will show student ID"
                  value={productForm.pickup_notes}
                  onChange={(e) => setProductForm({ ...productForm, pickup_notes: e.target.value })}
                />
              </div>
            </div>
          )}

          <button className="btn" type="button" disabled={busy} onClick={addProduct} style={{ marginTop: '0.5rem' }}>
            {busy ? 'Saving…' : 'List Product'}
          </button>
        </div>
      )}

      {/* ════════════ TAB 3: CUBES & CONTRACTS ════════════ */}
      {visibleTab === 'cubes_contracts' && (
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
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort(sortContracts, setSortContracts, 'cube')}>
                    Cube {renderSortIndicator('cube', sortContracts)}
                  </th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort(sortContracts, setSortContracts, 'type')}>
                    Type {renderSortIndicator('type', sortContracts)}
                  </th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort(sortContracts, setSortContracts, 'period')}>
                    Period {renderSortIndicator('period', sortContracts)}
                  </th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort(sortContracts, setSortContracts, 'days')}>
                    Days Left {renderSortIndicator('days', sortContracts)}
                  </th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort(sortContracts, setSortContracts, 'status')}>
                    Status {renderSortIndicator('status', sortContracts)}
                  </th>
                  <th className="no-print" style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {contractsSorted.map((c) => {
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
              <button className="modal-close" onClick={() => setPreviewReceipt(null)}><X size={18} /></button>
            </div>
            <img src={previewReceipt} alt="Receipt proof" style={{ maxWidth: '100%', maxHeight: '75vh', objectFit: 'contain', marginTop: 12 }} />
          </div>
        </div>
      )}

      {/* NEW HANDOVER ENTRY MODAL (FOR MULTIPLE BUYERS / EXISTING PRODUCTS) */}
      {isNewHandoverModalOpen && (
        <div className="modal-overlay" onClick={() => setIsNewHandoverModalOpen(false)}>
          <div className="modal-card" style={{ maxWidth: 540 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>+ Add Pick-up Entry / Buyer</h3>
              <button className="modal-close" onClick={() => setIsNewHandoverModalOpen(false)}><X size={18} /></button>
            </div>
            <p className="muted" style={{ fontSize: '0.85rem', marginTop: 0 }}>
              Add another buyer or claimant for your existing stock in Pick-up cubes. Staff will verify them when claiming.
            </p>
            <div className="grid" style={{ gridTemplateColumns: '1fr', gap: '0.85rem' }}>
              <div className="field">
                <label>Select Pick-up Product *</label>
                <select
                  value={newHandoverForm.product_id}
                  onChange={(e) => setNewHandoverForm({ ...newHandoverForm, product_id: e.target.value })}
                >
                  <option value="">Select product…</option>
                  {pickupProducts.map((p) => (
                    <option key={p.product_id} value={p.product_id}>
                      {p.product_name} {p.variant ? `(${p.variant})` : ''} — {p.stock_quantity} in stock ({peso(p.price)})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid" style={{ gridTemplateColumns: '2fr 1fr', gap: '0.85rem' }}>
                <div className="field">
                  <label>Buyer / Customer Name *</label>
                  <input
                    placeholder="e.g. Juan dela Cruz"
                    value={newHandoverForm.buyer_name}
                    onChange={(e) => setNewHandoverForm({ ...newHandoverForm, buyer_name: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Quantity *</label>
                  <input
                    type="number"
                    min="1"
                    value={newHandoverForm.quantity}
                    onChange={(e) => setNewHandoverForm({ ...newHandoverForm, quantity: e.target.value })}
                  />
                </div>
              </div>
              <div className="field">
                <label>Authorized Alternate Claimant (Optional)</label>
                <input
                  placeholder="e.g. Maria Santos (relative / courier)"
                  value={newHandoverForm.authorized_pickup_name}
                  onChange={(e) => setNewHandoverForm({ ...newHandoverForm, authorized_pickup_name: e.target.value })}
                />
              </div>
              <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                <div className="field">
                  <label>Payment Status</label>
                  <select
                    value={newHandoverForm.payment_status}
                    onChange={(e) => setNewHandoverForm({ ...newHandoverForm, payment_status: e.target.value as 'Pending' | 'Paid' })}
                  >
                    <option value="Pending">Pending Payment (Collect at counter)</option>
                    <option value="Paid">Paid (Paid online to renter)</option>
                  </select>
                </div>
                <div className="field">
                  <label>Payment Method</label>
                  <select
                    value={newHandoverForm.payment_method}
                    onChange={(e) => setNewHandoverForm({ ...newHandoverForm, payment_method: e.target.value as 'Cash' | 'Online' })}
                  >
                    <option value="Cash">Cash</option>
                    <option value="Online">GCash / Maya / Online</option>
                  </select>
                </div>
              </div>
              <div className="field">
                <label>Payment Receipt Proof (if Paid)</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setNewHandoverReceiptFile(e.target.files?.[0] || null)}
                />
              </div>
              <div className="field">
                <label>Notes / Claimant Instructions</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Reference code, note on who is authorized to claim"
                  value={newHandoverForm.notes}
                  onChange={(e) => setNewHandoverForm({ ...newHandoverForm, notes: e.target.value })}
                />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.25rem' }}>
              <button className="btn-ghost" type="button" onClick={() => setIsNewHandoverModalOpen(false)}>Cancel</button>
              <button className="btn" type="button" disabled={busy} onClick={addNewHandover}>
                {busy ? 'Saving…' : 'Save Pick-up Entry'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT HANDOVER ENTRY MODAL */}
      {editingTx && (
        <div className="modal-overlay" onClick={() => setEditingTx(null)}>
          <div className="modal-card" style={{ maxWidth: 540 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Edit Pick-up Entry: {editingTx.products?.product_name || editingTx.product_name}</h3>
              <button className="modal-close" onClick={() => setEditingTx(null)}><X size={18} /></button>
            </div>
            <p className="muted" style={{ fontSize: '0.85rem', marginTop: 0 }}>
              Update the customer, authorized claimant, or payment details for this pick-up item.
            </p>
            <div className="grid" style={{ gridTemplateColumns: '1fr', gap: '0.85rem' }}>
              <div className="field">
                <label>Buyer / Customer Name *</label>
                <input
                  placeholder="e.g. Juan dela Cruz"
                  value={editTxForm.buyer_name}
                  onChange={(e) => setEditTxForm({ ...editTxForm, buyer_name: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Authorized Alternate Claimant</label>
                <input
                  placeholder="e.g. Maria Santos (relative / courier)"
                  value={editTxForm.authorized_pickup_name}
                  onChange={(e) => setEditTxForm({ ...editTxForm, authorized_pickup_name: e.target.value })}
                />
              </div>
              <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                <div className="field">
                  <label>Payment Status</label>
                  <select
                    value={editTxForm.payment_status}
                    onChange={(e) => setEditTxForm({ ...editTxForm, payment_status: e.target.value as 'Pending' | 'Paid' })}
                  >
                    <option value="Pending">Pending Payment (Collect at counter)</option>
                    <option value="Paid">Paid (Paid online to renter)</option>
                  </select>
                </div>
                <div className="field">
                  <label>Payment Method</label>
                  <select
                    value={editTxForm.payment_method}
                    onChange={(e) => setEditTxForm({ ...editTxForm, payment_method: e.target.value as 'Cash' | 'Online' })}
                  >
                    <option value="Cash">Cash</option>
                    <option value="Online">GCash / Maya / Online</option>
                  </select>
                </div>
              </div>
              <div className="field">
                <label>Update Receipt Proof (Optional)</label>
                {editingTx.receipt_image_url && (
                  <div style={{ marginBottom: 6 }}>
                    <img
                      src={editingTx.receipt_image_url}
                      alt="Current receipt"
                      style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 4, border: '1px solid #ddd' }}
                    />
                    <span className="muted" style={{ fontSize: '0.75rem', marginLeft: 8 }}>Current receipt uploaded</span>
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setEditTxReceiptFile(e.target.files?.[0] || null)}
                />
              </div>
              <div className="field">
                <label>Notes / Claimant Instructions</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Reference code, note on claimant"
                  value={editTxForm.notes}
                  onChange={(e) => setEditTxForm({ ...editTxForm, notes: e.target.value })}
                />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.25rem' }}>
              <button className="btn-ghost" type="button" onClick={() => setEditingTx(null)}>Cancel</button>
              <button className="btn" type="button" disabled={busy} onClick={updateHandover}>
                {busy ? 'Saving…' : 'Update Handover Info'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
