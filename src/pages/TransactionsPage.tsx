import { useEffect, useState, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Zap, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/Auth'
import { peso, type Product, type Transaction, type Cube, type UserRow, type Reservation, isReservationExpired } from '../lib/types'
import { uploadPublicImage } from '../lib/storage'
import { BUCKET_DOCUMENTS } from '../lib/supabase'
import { SkeletonTable } from '../components/Skeleton'
import { addPullOutItem } from '../lib/pull-out'

type FormState = {
  renter_id: string
  cube_id: string
  product_id: string
  product_name: string
  buyer_name: string
  authorized_pickup_name: string
  payment_status: 'Pending' | 'Paid'
  payment_method: 'Cash' | 'Online'
  pickup_status: 'Waiting' | 'Picked-up'
  quantity: string
  notes: string
  receipt_image_url: string
}

const emptyForm: FormState = {
  renter_id: '',
  cube_id: '',
  product_id: '',
  product_name: '',
  buyer_name: '',
  authorized_pickup_name: '',
  payment_status: 'Pending',
  payment_method: 'Cash',
  pickup_status: 'Waiting',
  quantity: '1',
  notes: '',
  receipt_image_url: '',
}

type Props = {
  defaultFilter?: 'All' | 'Display' | 'Pick-up'
  pageTitle?: string
}

export default function TransactionsPage({ defaultFilter = 'All', pageTitle }: Props) {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const [rows, setRows] = useState<Transaction[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [cubes, setCubes] = useState<Cube[]>([])
  const [renters, setRenters] = useState<UserRow[]>([])
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [selectedReservationId, setSelectedReservationId] = useState<string>('')
  const [form, setForm] = useState<FormState>(emptyForm)
  const [filter, setFilter] = useState<'All' | 'Display' | 'Pick-up'>(defaultFilter)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(false)
  const [previewReceipt, setPreviewReceipt] = useState<string | null>(null)

  // Pull Out Modal State
  const [pullOutTarget, setPullOutTarget] = useState<Transaction | null>(null)
  const [pullOutQty, setPullOutQty] = useState('1')
  const [pullOutReason, setPullOutReason] = useState('Unclaimed by buyer')
  const [pullOutNotes, setPullOutNotes] = useState('')

  // Update filter when prop changes
  useEffect(() => {
    setFilter(defaultFilter)
  }, [defaultFilter])

  async function load() {
    setLoading(true)
    const [tRes, pRes, cRes, rRes, resRes] = await Promise.all([
      supabase
        .from('transactions')
        .select('*, products(*, cubes(cube_number, type)), cubes(cube_number, type), users!processed_by(full_name, role)')
        .order('updated_at', { ascending: false }),
      supabase.from('products').select('*, cubes(cube_number, type)').order('product_name'),
      supabase.from('cubes').select('*').order('cube_number'),
      supabase.from('users').select('*').eq('role', 'Renter').order('full_name'),
      supabase
        .from('reservations')
        .select('*, products(*, cubes(cube_number, type)), cubes(cube_number, type), customer:users!customer_id(full_name, email, phone_number)')
        .in('status', ['Pending', 'Confirmed'])
        .order('expiry_time', { ascending: false }),
    ])
    setLoading(false)
    if (!tRes.error) setRows((tRes.data || []) as Transaction[])
    if (!pRes.error) setProducts((pRes.data || []) as Product[])
    if (!cRes.error) setCubes((cRes.data || []) as Cube[])
    if (!rRes.error) setRenters((rRes.data || []) as UserRow[])
    if (!resRes.error) {
      const resList = (resRes.data || []) as Reservation[]
      setReservations(resList)

      // Handle claimId from query parameter
      const queryClaimId = searchParams.get('claimId')
      if (queryClaimId) {
        const found = resList.find((r) => String(r.reservation_id) === queryClaimId)
        if (found) {
          applyReservationToForm(found)
        }
      }
    }
  }

  function applyReservationToForm(r: Reservation) {
    setSelectedReservationId(String(r.reservation_id))
    const p = r.products
    const prodName = p ? `${p.product_name}${p.variant ? ` (${p.variant})` : ''}` : ''
    setForm((prev) => ({
      ...prev,
      buyer_name: r.customer?.full_name || prev.buyer_name,
      product_id: p?.product_id ? String(p.product_id) : prev.product_id,
      product_name: prodName || prev.product_name,
      cube_id: p?.cube_id ? String(p.cube_id) : r.cube_id ? String(r.cube_id) : prev.cube_id,
      renter_id: p?.renter_id ? String(p.renter_id) : prev.renter_id,
      quantity: '1',
      pickup_status: 'Picked-up',
      payment_status: 'Paid',
    }))
  }

  useEffect(() => { void load() }, [searchParams])

  const renterMap = useMemo(() => {
    const map = new Map<number, string>()
    renters.forEach((r) => map.set(r.user_id, r.full_name))
    return map
  }, [renters])

  if (!user || (user.role !== 'Owner' && user.role !== 'Staff' && user.role !== 'Renter')) {
    return (
      <section>
        <div className="page-header">
          <div>
            <h1>Pickup / Display</h1>
            <p className="lede">Staff, Owner, or Renter access only. <Link to="/login">Sign in</Link></p>
          </div>
        </div>
      </section>
    )
  }

  const me = user

  // Filter products for the form based on selected renter or cube
  const availableFormProducts = products.filter((p) => {
    if (form.renter_id && p.renter_id !== Number(form.renter_id)) return false
    if (form.cube_id && p.cube_id !== Number(form.cube_id)) return false
    return true
  })

  function handleProductNameChange(productName: string) {
    const prod = availableFormProducts.find((candidate) =>
      `${candidate.product_name}${candidate.variant ? ` (${candidate.variant})` : ''}`.toLowerCase() === productName.trim().toLowerCase()
    )
    setForm((prev) => ({
      ...prev,
      product_name: productName,
      product_id: prod ? String(prod.product_id) : '',
      renter_id: prod?.renter_id ? String(prod.renter_id) : prev.renter_id,
      cube_id: prod?.cube_id ? String(prod.cube_id) : prev.cube_id,
    }))
  }

  async function saveNew() {
    if (!form.product_name.trim() || !form.buyer_name.trim()) return alert('Product and pickup name are required.')
    setBusy(true)
    const matchedProduct = products.find((product) => product.product_id === Number(form.product_id))
    const selectedCube = cubes.find((cube) => cube.cube_id === Number(form.cube_id || matchedProduct?.cube_id))
    if (selectedCube?.type === 'Pick-up' && !selectedReservationId) {
      setBusy(false)
      return alert('Pickup details must be submitted by the renter from their Pick-up dashboard. Staff only verifies/confirms at the counter.')
    }
    const quantity = Math.max(1, Number(form.quantity) || 1)
    if (matchedProduct && quantity > matchedProduct.stock_quantity) {
      setBusy(false)
      return alert(`Only ${matchedProduct.stock_quantity} unit(s) are available.`)
    }
    const { error } = await supabase.from('transactions').insert([{
      product_id: matchedProduct?.product_id || null,
      product_name: form.product_name.trim(),
      cube_id: Number(form.cube_id) || matchedProduct?.cube_id || null,
      renter_id: Number(form.renter_id) || matchedProduct?.renter_id || null,
      buyer_name: form.buyer_name.trim(),
      authorized_pickup_name: form.authorized_pickup_name.trim() || null,
      payment_status: form.payment_status,
      payment_method: form.payment_method,
      pickup_status: form.pickup_status,
      quantity,
      listed_quantity: matchedProduct?.stock_quantity ?? null,
      notes: form.notes.trim() || null,
      receipt_image_url: form.receipt_image_url.trim() || null,
      processed_by: me.user_id,
      updated_at: new Date().toISOString(),
    }])
    setBusy(false)
    if (error) return alert(error.message)

    if (form.payment_status === 'Paid' && matchedProduct) {
      const prod = matchedProduct
      if (prod && prod.stock_quantity > 0) {
        await supabase.from('products').update({ stock_quantity: Math.max(0, prod.stock_quantity - quantity) }).eq('product_id', prod.product_id)
      }
    }

    // Automatically mark customer reservation as Confirmed / Claimed
    if (selectedReservationId) {
      await supabase
        .from('reservations')
        .update({ status: 'Confirmed' })
        .eq('reservation_id', Number(selectedReservationId))
      setSelectedReservationId('')
    }

    setForm(emptyForm)
    void load()
  }

  async function updateRow(t: Transaction, patch: Partial<Transaction>) {
    setBusy(true)
    const { error } = await supabase
      .from('transactions')
      .update({
        ...patch,
        processed_by: me.user_id,
        updated_at: new Date().toISOString(),
      })
      .eq('transaction_id', t.transaction_id)

    // Deduct stock if payment was just verified as Paid
    if (patch.payment_status === 'Paid' && t.payment_status !== 'Paid' && t.product_id) {
      const prod = products.find((p) => p.product_id === t.product_id)
      if (prod && prod.stock_quantity > 0) {
        const qty = t.quantity || 1
        await supabase.from('products').update({ stock_quantity: Math.max(0, prod.stock_quantity - qty) }).eq('product_id', prod.product_id)
      }
    }

    setBusy(false)
    if (error) return alert(error.message)
    void load()
  }

  async function confirmTransaction(t: Transaction) {
    await updateRow(t, { payment_status: 'Paid', pickup_status: 'Picked-up' })
  }

  async function cancelTransaction(t: Transaction) {
    if (!window.confirm(`Are you sure you want to cancel this transaction for ${t.product_name || 'this item'}?`)) return
    setBusy(true)
    if (t.payment_status === 'Paid' && t.product_id) {
      const prod = products.find((p) => p.product_id === t.product_id)
      if (prod) {
        const qty = t.quantity || 1
        await supabase.from('products').update({ stock_quantity: prod.stock_quantity + qty }).eq('product_id', prod.product_id)
      }
    }
    const { error } = await supabase.from('transactions').delete().eq('transaction_id', t.transaction_id)
    setBusy(false)
    if (error) return alert(error.message)
    void load()
  }

  function openPickupPullOutModal(t: Transaction) {
    setPullOutTarget(t)
    setPullOutQty(String(t.quantity || 1))
    setPullOutReason('Unclaimed by buyer')
    setPullOutNotes('')
  }

  async function handleConfirmPickupPullOut() {
    if (!pullOutTarget) return
    const t = pullOutTarget
    const prod = t.products
    const renterId = prod?.renter_id || t.renter_id
    const rName = renterId ? renterMap.get(renterId) : '—'
    const cubeNum = prod?.cubes?.cube_number || t.cubes?.cube_number || ''
    const cubeType = prod?.cubes?.type || t.cubes?.type || 'Pick-up'
    const qtyToPull = Math.min(Math.max(1, parseInt(pullOutQty, 10) || 1), t.quantity || 1)
    const remainingQty = (t.quantity || 1) - qtyToPull

    setBusy(true)

    // 1. Record in pull out items
    await addPullOutItem({
      type: 'Pick-up',
      product_id: t.product_id,
      cube_id: t.cube_id || prod?.cube_id,
      renter_id: renterId,
      transaction_id: t.transaction_id,
      buyer_name: t.buyer_name,
      product_name: prod?.product_name || t.product_name || 'Pickup Item',
      price: Number(prod?.price || 0),
      quantity: qtyToPull,
      reason: pullOutReason,
      status: 'Pull Out',
      notes: pullOutNotes.trim() || null,
      pulled_out_by: user?.user_id,
      cubes: { cube_number: cubeNum, type: cubeType },
      renter: renterId ? { full_name: rName || 'Renter' } : null,
    })

    // 2. Update transaction
    if (remainingQty > 0) {
      // Partial pull out (e.g. 1 out of 3 dresses pulled out)
      await supabase
        .from('transactions')
        .update({
          quantity: remainingQty,
          notes: `${t.notes || ''} [Pulled out ${qtyToPull} item(s): ${pullOutReason}]`.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('transaction_id', t.transaction_id)
    } else {
      // Full pull out
      await supabase
        .from('transactions')
        .update({
          notes: `[PULLED OUT] ${t.notes || ''} (${pullOutReason})`.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('transaction_id', t.transaction_id)
    }

    setBusy(false)
    setPullOutTarget(null)
    void load()
  }

  async function onReceiptFile(file: File | null, onUrl: (url: string) => void) {
    if (!file) return
    const res = await uploadPublicImage(BUCKET_DOCUMENTS, file, 'receipts')
    if (res.url) {
      onUrl(res.url)
    } else {
      alert('Receipt upload failed: ' + (res.error || 'unknown') + '. You can paste a URL instead.')
    }
  }

  const visible = rows.filter((t) => {
    if (filter === 'All') return true
    return (t.products?.cubes?.type || t.cubes?.type) === filter
  }).sort((a, b) => new Date(b.updated_at || b.transaction_date).getTime() - new Date(a.updated_at || a.transaction_date).getTime())

  const computedTitle = pageTitle || (filter === 'Pick-up' ? 'Pickup Tracking' : filter === 'Display' ? 'Display Tracking' : 'Pickup & Display Tracking')

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>{computedTitle}</h1>
          <p className="lede">
            Track product handovers: product being left, renter, assigned cube, buyer name, authorized alternate, payments, and pickup verification.
          </p>
        </div>
      </div>

      {/* Pick-up details are entered only by renters. Counter roles update status below. */}
      {filter === 'Pick-up' && (
        <div className="panel no-print" style={{ marginBottom: '1.75rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '1rem 1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
            <span className="badge" style={{ background: '#0284c7', color: '#fff' }}>Counter Pickup Verification</span>
            <strong style={{ color: '#0f172a', fontSize: '0.95rem' }}>Renter-Submitted Handover Tracking</strong>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: '0.85rem', lineHeight: 1.5 }}>
            Pick-up products and claimant names are submitted by Renters from their dashboard. Counter staff and owners review claimant identity below, collect or verify payments, and click <strong>Verify Paid</strong> and <strong>Confirm Claimed</strong> to complete customer pickup.
          </p>
        </div>
      )}

      {/* Manual Entry Form only on generic/all view (Item 11: hidden on Display Tracking) */}
      {filter === 'All' && <div className="panel no-print" style={{ marginBottom: '2rem' }}>
        <h2 style={{ marginTop: 0 }}>Record New Transaction / Hand-over</h2>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          
          {/* RESERVATION QUICK SELECTOR */}
          {reservations.length > 0 && (
            <div className="field" style={{ gridColumn: '1 / -1', background: '#f8fafc', padding: '0.85rem', borderRadius: 8, border: '1px solid #cbd5e1' }}>
              <label style={{ fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Zap size={16} color="#0284c7" /> Auto-Fill from Customer Reservation
              </label>
              <select
                value={selectedReservationId}
                onChange={(e) => {
                  const rid = e.target.value
                  setSelectedReservationId(rid)
                  if (!rid) return
                  const found = reservations.find((r) => String(r.reservation_id) === rid)
                  if (found) applyReservationToForm(found)
                }}
              >
                <option value="">Select customer reservation (auto-fills Buyer Name, Product, Cube, Renter)…</option>
                {reservations
                  .filter((r) => !isReservationExpired(r))
                  .map((r) => (
                    <option key={r.reservation_id} value={r.reservation_id}>
                      {r.customer?.full_name || 'Customer'} — {r.products?.product_name || (r.cube_id ? `Cube #${r.cubes?.cube_number}` : 'Product')} {r.products?.variant ? `(${r.products.variant})` : ''} [{r.status}]
                    </option>
                  ))}
              </select>
            </div>
          )}

          {/* Renter selector */}
          <div className="field">
            <label>Renter Who Left It</label>
            <select
              value={form.renter_id}
              onChange={(e) => setForm({ ...form, renter_id: e.target.value })}
            >
              <option value="">Any / Filter by Renter…</option>
              {renters.map((r) => (
                <option key={r.user_id} value={r.user_id}>
                  {r.full_name}
                </option>
              ))}
            </select>
          </div>

          {/* Cube number selector */}
          <div className="field">
            <label>Cube Number</label>
            <select
              value={form.cube_id}
              onChange={(e) => setForm({ ...form, cube_id: e.target.value })}
            >
              <option value="">Any / Filter by Cube…</option>
              {cubes.map((c) => (
                <option key={c.cube_id} value={c.cube_id}>
                  {c.cube_number} ({c.type})
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Product Left *</label>
            <input
              list="tracking-products"
              value={form.product_name}
              onChange={(e) => handleProductNameChange(e.target.value)}
              placeholder="Type product name"
            />
            <datalist id="tracking-products">
              {availableFormProducts.map((p) => {
                const rName = p.renter_id ? renterMap.get(p.renter_id) : null
                return (
                  <option key={p.product_id} value={`${p.product_name}${p.variant ? ` (${p.variant})` : ''}`}>
                    {peso(p.price)} {rName ? `[${rName}]` : ''}
                  </option>
                )
              })}
            </datalist>
          </div>

          <div className="field">
            <label>Buyer Name *</label>
            <input
              placeholder="e.g. Maria Santos"
              value={form.buyer_name}
              onChange={(e) => setForm({ ...form, buyer_name: e.target.value })}
            />
          </div>

          <div className="field">
            <label>Authorized Alternate</label>
            <input
              placeholder="Person authorized to claim"
              value={form.authorized_pickup_name}
              onChange={(e) => setForm({ ...form, authorized_pickup_name: e.target.value })}
            />
          </div>

          <div className="field">
            <label>Payment Status</label>
            <select value={form.payment_status} onChange={(e) => setForm({ ...form, payment_status: e.target.value as 'Pending' | 'Paid' })}>
              <option value="Pending">Pending</option>
              <option value="Paid">Paid</option>
            </select>
          </div>

          <div className="field">
            <label>Payment Process</label>
            <select value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value as 'Cash' | 'Online' })}>
              <option value="Cash">Cash</option>
              <option value="Online">Online</option>
            </select>
          </div>

          <div className="field">
            <label>Quantity Purchased</label>
            <input type="number" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
          </div>

          <div className="field">
            <label>Pickup Status</label>
            <select value={form.pickup_status} onChange={(e) => setForm({ ...form, pickup_status: e.target.value as 'Waiting' | 'Picked-up' })}>
              <option value="Waiting">Waiting</option>
              <option value="Picked-up">Picked-up</option>
            </select>
          </div>

          {/* Conditional receipt upload for Online payments only */}
          {form.payment_method === 'Online' && (
            <div className="field">
              <label>Receipt Proof (Online Payment)</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => void onReceiptFile(e.target.files?.[0] || null, (url) => setForm({ ...form, receipt_image_url: url }))}
              />
            </div>
          )}
        </div>

        {form.payment_method === 'Online' && form.receipt_image_url && (
          <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <img src={form.receipt_image_url} alt="Receipt Preview" style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 6, border: '1px solid #ddd' }} />
            <span style={{ fontSize: '0.8rem', color: '#666' }}>Receipt attached</span>
          </div>
        )}

        <div className="field" style={{ marginTop: '1rem' }}>
          <label>Notes (e.g. special handling, time left, condition)</label>
          <textarea
            rows={2}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </div>

        <button className="btn" type="button" disabled={busy} onClick={saveNew} style={{ marginTop: '0.5rem' }}>
          {busy ? 'Saving…' : 'Save Record'}
        </button>
      </div>}

      {/* TRANSACTIONS TABLE */}
      {loading ? (
        <SkeletonTable rows={5} cols={filter === 'Display' ? 9 : filter === 'Pick-up' ? 9 : 8} />
      ) : filter === 'Display' ? (
        /* ══════════ DISPLAY TRACKING TABLE (Image 2) ══════════ */
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Buyer Name</th>
                <th>Product</th>
                <th>Price</th>
                <th>Quantity</th>
                <th>Renter Name</th>
                <th>Cube Number</th>
                <th>Payment Status</th>
                <th>Mode of Payment</th>
                <th className="no-print" style={{ textAlign: 'right' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((t) => {
                const prod = t.products
                const renterId = prod?.renter_id || t.renter_id
                const rName = renterId ? renterMap.get(renterId) : '—'
                const cubeNum = prod?.cubes?.cube_number || t.cubes?.cube_number || '—'
                const isConfirmed = t.pickup_status === 'Picked-up' && t.payment_status === 'Paid'

                return (
                  <tr key={t.transaction_id}>
                    <td><strong>{t.buyer_name || '—'}</strong></td>
                    <td>
                      <strong>{prod?.product_name || t.product_name || '—'}</strong>
                      {prod?.variant && <div className="muted" style={{ fontSize: '0.78rem' }}>Variant: {prod.variant}</div>}
                    </td>
                    <td>{peso(prod?.price)}</td>
                    <td>{t.quantity || 1}</td>
                    <td><strong>{rName}</strong></td>
                    <td>
                      <span className="badge info">{cubeNum}</span>
                    </td>
                    <td>
                      <span className={`status-pill ${t.payment_status === 'Paid' ? 'confirmed' : 'pending'}`}>
                        {t.payment_status}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <select
                          value={t.payment_method || 'Cash'}
                          onChange={(e) => void updateRow(t, { payment_method: e.target.value as 'Cash' | 'Online' })}
                          style={{ padding: '0.25rem 0.45rem', fontSize: '0.78rem', borderRadius: 6 }}
                        >
                          <option value="Cash">Cash</option>
                          <option value="Online">Online</option>
                        </select>
                        {t.payment_method === 'Online' && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {t.receipt_image_url ? (
                              <img
                                src={t.receipt_image_url}
                                alt="Receipt"
                                style={{ width: 34, height: 34, objectFit: 'cover', borderRadius: 4, cursor: 'pointer', border: '1px solid #cbd5e1' }}
                                onClick={() => setPreviewReceipt(t.receipt_image_url)}
                                title="Click to view receipt"
                              />
                            ) : null}
                            <label style={{ fontSize: '0.72rem', cursor: 'pointer', color: '#2563eb', textDecoration: 'underline' }}>
                              {t.receipt_image_url ? 'Change image' : 'Attach image'}
                              <input
                                type="file"
                                accept="image/*"
                                style={{ display: 'none' }}
                                onChange={(e) => void onReceiptFile(e.target.files?.[0] || null, (url) => void updateRow(t, { receipt_image_url: url, payment_method: 'Online' }))}
                              />
                            </label>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="no-print" style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                        {isConfirmed ? (
                          <span className="badge ok" style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem' }}>Confirmed</span>
                        ) : (
                          <button
                            className="btn"
                            type="button"
                            style={{ padding: '0.25rem 0.55rem', fontSize: '0.74rem', background: '#10b981', color: '#fff', border: 'none' }}
                            onClick={() => void confirmTransaction(t)}
                          >
                            Confirm
                          </button>
                        )}
                        <button
                          className="btn-ghost"
                          type="button"
                          style={{ padding: '0.25rem 0.55rem', fontSize: '0.74rem', color: '#dc2626' }}
                          onClick={() => void cancelTransaction(t)}
                        >
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {visible.length === 0 && <div className="empty" style={{ padding: '2rem' }}>No display tracking records found.</div>}
        </div>
      ) : filter === 'Pick-up' ? (
        /* ══════════ PICK UP TRACKING TABLE (Image 2) ══════════ */
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Buyer Name</th>
                <th>Product</th>
                <th>Product Info</th>
                <th>Price</th>
                <th>Renter Name</th>
                <th>Authorized Alternate</th>
                <th>Payment Status</th>
                <th>Mode of Payment</th>
                <th>Cube #</th>
                <th>Notes</th>
                <th className="no-print" style={{ textAlign: 'right' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((t) => {
                const prod = t.products
                const renterId = prod?.renter_id || t.renter_id
                const rName = renterId ? renterMap.get(renterId) : '—'
                const cubeNum = prod?.cubes?.cube_number || t.cubes?.cube_number || '—'
                const isPickedUp = t.pickup_status === 'Picked-up'
                const isPulledOut = Boolean(t.notes?.startsWith('[PULLED OUT]'))

                return (
                  <tr key={t.transaction_id}>
                    <td><strong>{t.buyer_name || '—'}</strong></td>
                    <td><strong>{prod?.product_name || t.product_name || '—'}</strong></td>
                    <td style={{ maxWidth: 200 }}>
                      <div style={{ fontSize: '0.82rem', color: '#444' }}>
                        {prod?.description || prod?.variant || t.notes || '—'}
                      </div>
                    </td>
                    <td>{peso(prod?.price)}</td>
                    <td><strong>{rName}</strong></td>
                    <td>{t.authorized_pickup_name || <span className="muted">—</span>}</td>
                    <td>
                      <span className={`status-pill ${t.payment_status === 'Paid' ? 'confirmed' : 'pending'}`}>
                        {t.payment_status}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <select
                          value={t.payment_method || 'Cash'}
                          onChange={(e) => void updateRow(t, { payment_method: e.target.value as 'Cash' | 'Online' })}
                          style={{ padding: '0.25rem 0.45rem', fontSize: '0.78rem', borderRadius: 6 }}
                        >
                          <option value="Cash">Cash</option>
                          <option value="Online">Online</option>
                        </select>
                        {t.payment_method === 'Online' && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {t.receipt_image_url ? (
                              <img
                                src={t.receipt_image_url}
                                alt="Receipt"
                                style={{ width: 34, height: 34, objectFit: 'cover', borderRadius: 4, cursor: 'pointer', border: '1px solid #cbd5e1' }}
                                onClick={() => setPreviewReceipt(t.receipt_image_url)}
                                title="Click to view receipt proof"
                              />
                            ) : null}
                            <label style={{ fontSize: '0.72rem', cursor: 'pointer', color: '#2563eb', textDecoration: 'underline' }}>
                              {t.receipt_image_url ? 'Change' : 'Attach'}
                              <input
                                type="file"
                                accept="image/*"
                                style={{ display: 'none' }}
                                onChange={(e) => void onReceiptFile(e.target.files?.[0] || null, (url) => void updateRow(t, { receipt_image_url: url, payment_method: 'Online' }))}
                              />
                            </label>
                          </div>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className="badge info">{cubeNum}</span>
                    </td>
                    <td style={{ maxWidth: 160 }}>
                      <span style={{ fontSize: '0.82rem', color: '#444' }}>{t.notes || '—'}</span>
                    </td>
                    <td className="no-print" style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                        {isPickedUp ? (
                          <span className="badge ok" style={{ fontSize: '0.74rem' }}>Picked Up</span>
                        ) : isPulledOut ? (
                          <span className="badge warn" style={{ fontSize: '0.74rem' }}>Pulled Out</span>
                        ) : (
                          <>
                            <button
                              className="btn"
                              type="button"
                              style={{ padding: '0.25rem 0.55rem', fontSize: '0.74rem', background: '#2563eb', color: '#fff', border: 'none' }}
                              onClick={() => void updateRow(t, { pickup_status: 'Picked-up', payment_status: 'Paid' })}
                            >
                              Mark Picked-up
                            </button>
                            <button
                              className="btn-ghost"
                              type="button"
                              style={{
                                padding: '0.25rem 0.55rem',
                                fontSize: '0.74rem',
                                color: '#b45309',
                                border: '1px solid #fde68a',
                                background: '#fffbeb',
                              }}
                              onClick={() => openPickupPullOutModal(t)}
                              title="Pull out unclaimed item"
                            >
                              Pull Out
                            </button>
                            <button
                              className="btn-ghost"
                              type="button"
                              style={{ padding: '0.25rem 0.55rem', fontSize: '0.74rem', color: '#dc2626' }}
                              onClick={() => void cancelTransaction(t)}
                            >
                              Cancel
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {visible.length === 0 && <div className="empty" style={{ padding: '2rem' }}>No pick-up tracking records found.</div>}
        </div>
      ) : (
        /* ══════════ GENERAL / MIXED FALLBACK TABLE ══════════ */
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Product & Details</th>
                <th>Renter</th>
                <th>Buyer / Alternate</th>
                <th>Payment</th>
                <th>Process / Qty</th>
                <th>Pickup Status</th>
                <th>Proof / Notes</th>
                <th>Processed by</th>
                <th className="no-print" style={{ textAlign: 'right' }}>Update</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((t) => {
                const prod = t.products
                const renterId = prod?.renter_id || t.renter_id
                const rName = renterId ? renterMap.get(renterId) : '—'
                return (
                  <tr key={t.transaction_id}>
                    <td>
                      <strong>{prod?.product_name || t.product_name || '—'}</strong>
                      {prod?.variant && <div className="muted" style={{ fontSize: '0.8rem' }}>Variant: {prod.variant}</div>}
                      <div className="muted" style={{ fontSize: '0.8rem' }}>
                        Cube: {prod?.cubes?.cube_number || t.cubes?.cube_number || '—'} ({prod?.cubes?.type || t.cubes?.type || '—'}) · {peso(prod?.price)}
                      </div>
                    </td>
                    <td><strong>{rName}</strong></td>
                    <td>
                      <div><strong>Buyer:</strong> {t.buyer_name || '—'}</div>
                      {t.authorized_pickup_name && (
                        <div className="muted" style={{ fontSize: '0.8rem' }}>
                          Alt: {t.authorized_pickup_name}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={`status-pill ${t.payment_status === 'Paid' ? 'confirmed' : 'pending'}`}>
                        {t.payment_status}
                      </span>
                    </td>
                    <td>{t.payment_method || 'Cash'} · {t.quantity || 1}</td>
                    <td>
                      <span className={`status-pill ${t.pickup_status === 'Picked-up' ? 'confirmed' : 'pending'}`}>
                        {t.pickup_status || 'Waiting'}
                      </span>
                    </td>
                    <td>
                      {t.receipt_image_url && (
                        <div style={{ marginBottom: 4 }}>
                          <img
                            src={t.receipt_image_url}
                            alt="Receipt"
                            style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 4, cursor: 'pointer', border: '1px solid #ddd' }}
                            onClick={() => setPreviewReceipt(t.receipt_image_url)}
                            title="Click to view receipt"
                          />
                        </div>
                      )}
                      <div style={{ fontSize: '0.82rem', color: '#444' }}>{t.notes || '—'}</div>
                    </td>
                    <td>
                      {t.users ? (
                        <div>
                          <strong>{t.users.full_name}</strong>
                          <div className="muted" style={{ fontSize: '0.74rem' }}>{t.users.role}</div>
                        </div>
                      ) : (
                        <span className="muted" style={{ fontSize: '0.8rem' }}>—</span>
                      )}
                    </td>
                    <td className="no-print" style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        {t.payment_status === 'Pending' && (
                          <button
                            className="btn"
                            type="button"
                            style={{ padding: '0.2rem 0.5rem', fontSize: '0.74rem', background: '#10b981', color: '#fff', border: 'none' }}
                            onClick={() => void updateRow(t, { payment_status: 'Paid' })}
                          >
                            Paid
                          </button>
                        )}
                        {t.pickup_status === 'Waiting' && (
                          <button
                            className="btn"
                            type="button"
                            style={{ padding: '0.2rem 0.5rem', fontSize: '0.74rem', background: '#2563eb', color: '#fff', border: 'none' }}
                            onClick={() => void updateRow(t, { pickup_status: 'Picked-up' })}
                          >
                            Claimed
                          </button>
                        )}
                        <button
                          className="btn-ghost"
                          type="button"
                          style={{ padding: '0.2rem 0.5rem', fontSize: '0.74rem', color: '#dc2626' }}
                          onClick={() => void cancelTransaction(t)}
                        >
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {visible.length === 0 && <div className="empty" style={{ padding: '2rem' }}>No records found.</div>}
        </div>
      )}

      {/* RECEIPT ZOOM MODAL */}
      {previewReceipt && (
        <div className="modal-overlay" onClick={() => setPreviewReceipt(null)}>
          <div className="modal-card" style={{ maxWidth: 600, textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Payment Receipt Proof</h3>
              <button className="modal-close" onClick={() => setPreviewReceipt(null)}><X size={18} /></button>
            </div>
            <img src={previewReceipt} alt="Receipt proof" style={{ maxWidth: '100%', maxHeight: '75vh', objectFit: 'contain', marginTop: 12 }} />
          </div>
        </div>
      )}

      {/* PULL OUT UNCLAIMED ITEM MODAL */}
      {pullOutTarget && (
        <div className="modal-overlay" onClick={() => !busy && setPullOutTarget(null)}>
          <div className="modal-card" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Pull Out Pickup Item</h3>
              <button className="modal-close" disabled={busy} onClick={() => setPullOutTarget(null)}>
                <X size={18} />
              </button>
            </div>
            <div style={{ padding: '0.75rem 0' }}>
              <div style={{ marginBottom: '0.75rem', background: '#f8fafc', padding: '0.75rem', borderRadius: 8 }}>
                <div style={{ fontWeight: 700, fontSize: '1rem', color: '#0f172a' }}>
                  {pullOutTarget.products?.product_name || pullOutTarget.product_name || 'Item'}
                </div>
                <div className="muted" style={{ fontSize: '0.82rem', marginTop: 2 }}>
                  Buyer: <strong>{pullOutTarget.buyer_name || '—'}</strong> · Renter:{' '}
                  <strong>
                    {pullOutTarget.products?.renter_id || pullOutTarget.renter_id
                      ? renterMap.get((pullOutTarget.products?.renter_id || pullOutTarget.renter_id)!) || '—'
                      : '—'}
                  </strong>
                </div>
                <div className="muted" style={{ fontSize: '0.82rem', marginTop: 2 }}>
                  Cube: <strong>{pullOutTarget.products?.cubes?.cube_number || pullOutTarget.cubes?.cube_number || '—'}</strong> · Available Qty:{' '}
                  <strong>{pullOutTarget.quantity || 1}</strong>
                </div>
              </div>

              <div className="field">
                <label>Quantity to Pull Out</label>
                <input
                  type="number"
                  min="1"
                  max={pullOutTarget.quantity || 1}
                  value={pullOutQty}
                  onChange={(e) => setPullOutQty(e.target.value)}
                  disabled={busy}
                />
                {(pullOutTarget.quantity || 1) > 1 && (
                  <div className="muted" style={{ fontSize: '0.75rem', marginTop: 2 }}>
                    If partial (e.g. 1 out of {pullOutTarget.quantity}), the remaining quantity stays available for buyer pickup.
                  </div>
                )}
              </div>

              <div className="field">
                <label>Reason for Pull Out</label>
                <select value={pullOutReason} onChange={(e) => setPullOutReason(e.target.value)} disabled={busy}>
                  <option value="Unclaimed by buyer">Unclaimed by buyer</option>
                  <option value="Contract Expired">Contract Expired</option>
                  <option value="Buyer cancelled / Did not claim">Buyer cancelled / Did not claim</option>
                  <option value="Renter requested pull out">Renter requested pull out</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div className="field">
                <label>Notes (optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Buyer only took remaining items"
                  value={pullOutNotes}
                  onChange={(e) => setPullOutNotes(e.target.value)}
                  disabled={busy}
                />
              </div>
            </div>

            <div className="row" style={{ justifyContent: 'flex-end', marginTop: '1rem', gap: '0.5rem' }}>
              <button className="btn-ghost" type="button" disabled={busy} onClick={() => setPullOutTarget(null)}>
                Cancel
              </button>
              <button
                className="btn"
                type="button"
                style={{ background: '#b45309', color: '#fff', border: 'none' }}
                disabled={busy}
                onClick={handleConfirmPickupPullOut}
              >
                {busy ? 'Processing…' : 'Confirm Pull Out'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
