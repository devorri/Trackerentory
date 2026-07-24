import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/Auth'
import { peso, type Product, type Transaction } from '../lib/types'
import { uploadPublicImage } from '../lib/storage'
import { BUCKET_DOCUMENTS } from '../lib/supabase'

type FormState = {
  product_id: string
  buyer_name: string
  authorized_pickup_name: string
  payment_status: 'Pending' | 'Paid'
  notes: string
  receipt_image_url: string
}

const emptyForm: FormState = {
  product_id: '',
  buyer_name: '',
  authorized_pickup_name: '',
  payment_status: 'Pending',
  notes: '',
  receipt_image_url: '',
}

export default function TransactionsPage() {
  const { user } = useAuth()
  const [rows, setRows] = useState<Transaction[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [form, setForm] = useState<FormState>(emptyForm)
  const [filter, setFilter] = useState<'All' | 'Display' | 'Pick-up'>('All')
  const [busy, setBusy] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)

  async function load() {
    const [tRes, pRes] = await Promise.all([
      supabase
        .from('transactions')
        .select('*, products(*, cubes(cube_number, type)), users!processed_by(full_name, role)')
        .order('transaction_date', { ascending: false }),
      supabase.from('products').select('*, cubes(cube_number, type)').order('product_name'),
    ])
    if (!tRes.error) setRows((tRes.data || []) as Transaction[])
    if (!pRes.error) setProducts((pRes.data || []) as Product[])
  }

  useEffect(() => { void load() }, [])

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

  async function saveNew() {
    if (!form.product_id || !form.buyer_name) return alert('Product and pickup name are required.')
    setBusy(true)
    const { error } = await supabase.from('transactions').insert([{
      product_id: Number(form.product_id),
      buyer_name: form.buyer_name,
      authorized_pickup_name: form.authorized_pickup_name || null,
      payment_status: form.payment_status,
      notes: form.notes || null,
      receipt_image_url: form.receipt_image_url || null,
      processed_by: me.user_id,
    }])
    setBusy(false)
    if (error) return alert(error.message)
    if (form.payment_status === 'Paid') {
      const prod = products.find((p) => p.product_id === Number(form.product_id))
      if (prod && prod.stock_quantity > 0) {
        await supabase.from('products').update({ stock_quantity: prod.stock_quantity - 1 }).eq('product_id', prod.product_id)
      }
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
      })
      .eq('transaction_id', t.transaction_id)
    setBusy(false)
    if (error) return alert(error.message)
    setEditId(null)
    void load()
  }

  async function onReceiptFile(file: File | null, onUrl: (url: string) => void) {
    if (!file) return
    const up = await uploadPublicImage(BUCKET_DOCUMENTS, file)
    if (up.url) {
      onUrl(up.url)
      return
    }
    alert('Receipt upload failed: ' + (up.error || 'unknown') + '. You can paste a URL instead.')
  }

  const visible = rows.filter((t) => {
    if (filter === 'All') return true
    return t.products?.cubes?.type === filter
  })

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>Pickup / Display</h1>
          <p className="lede">
            Track pickups: payment, who will pick up, authorized alternate, notes, receipt proof, and who processed each record.
          </p>
        </div>
      </div>

      <div className="row no-print" style={{ marginBottom: 12 }}>
        {(['All', 'Pick-up', 'Display'] as const).map((f) => (
          <button
            key={f}
            type="button"
            className={filter === f ? 'btn' : 'btn-ghost'}
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="panel no-print">
        <h2 style={{ marginTop: 0 }}>New pickup record</h2>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
          <div className="field">
            <label>Product</label>
            <select value={form.product_id} onChange={(e) => setForm({ ...form, product_id: e.target.value })}>
              <option value="">Select…</option>
              {products.map((p) => (
                <option key={p.product_id} value={p.product_id}>
                  {p.product_name} ({p.cubes?.type || 'no cube'}) — {peso(p.price)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Pickup name</label>
            <input value={form.buyer_name} onChange={(e) => setForm({ ...form, buyer_name: e.target.value })} />
          </div>
          <div className="field">
            <label>Authorized alternate</label>
            <input value={form.authorized_pickup_name} onChange={(e) => setForm({ ...form, authorized_pickup_name: e.target.value })} />
          </div>
          <div className="field">
            <label>Payment</label>
            <select value={form.payment_status} onChange={(e) => setForm({ ...form, payment_status: e.target.value as 'Pending' | 'Paid' })}>
              <option value="Pending">Pending</option>
              <option value="Paid">Paid</option>
            </select>
          </div>
          <div className="field">
            <label>Receipt image URL</label>
            <input value={form.receipt_image_url} onChange={(e) => setForm({ ...form, receipt_image_url: e.target.value })} />
          </div>
          <div className="field">
            <label>Or upload receipt</label>
            <input type="file" accept="image/*" onChange={(e) => void onReceiptFile(e.target.files?.[0] || null, (url) => setForm({ ...form, receipt_image_url: url }))} />
          </div>
        </div>
        <div className="field">
          <label>Notes (pickup / display)</label>
          <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <button className="btn" type="button" disabled={busy} onClick={saveNew}>Save transaction</button>
      </div>

      <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Product / Cube</th>
            <th>Pickup</th>
            <th>Authorized</th>
            <th>Payment</th>
            <th>Notes / Receipt</th>
            <th>Processed by</th>
            <th className="no-print">Update</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((t) => (
            <tr key={t.transaction_id}>
              <td>
                <strong>{t.products?.product_name}</strong>
                <div className="muted">{t.products?.cubes?.cube_number} · {t.products?.cubes?.type || '—'}</div>
                <div className="muted">{new Date(t.transaction_date).toLocaleString()}</div>
              </td>
              <td>{t.buyer_name || '—'}</td>
              <td>{t.authorized_pickup_name || '—'}</td>
              <td>
                <span className={`badge ${t.payment_status === 'Paid' ? 'ok' : 'warn'}`}>{t.payment_status}</span>
              </td>
              <td>
                <div>{t.notes || '—'}</div>
                {t.receipt_image_url && (
                  <a href={t.receipt_image_url} target="_blank" rel="noreferrer">
                    <img className="thumb" style={{ maxWidth: 120, marginTop: 6 }} src={t.receipt_image_url} alt="receipt" />
                  </a>
                )}
              </td>
              <td>
                {t.users ? `${t.users.full_name} (${t.users.role})` : '—'}
              </td>
              <td className="no-print">
                {editId === t.transaction_id ? (
                  <EditInline
                    t={t}
                    busy={busy}
                    onCancel={() => setEditId(null)}
                    onSave={(patch) => updateRow(t, patch)}
                    onFile={(file, cb) => void onReceiptFile(file, cb)}
                  />
                ) : (
                  <div className="row">
                    <button className="btn-ghost" type="button" onClick={() => setEditId(t.transaction_id)}>Edit</button>
                    {t.payment_status !== 'Paid' && (
                      <button className="btn" type="button" onClick={() => updateRow(t, { payment_status: 'Paid' })}>Mark paid</button>
                    )}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      {visible.length === 0 && <div className="empty" style={{ marginTop: '1rem' }}>No transactions yet.</div>}
    </section>
  )
}

function EditInline({
  t,
  busy,
  onCancel,
  onSave,
  onFile,
}: {
  t: Transaction
  busy: boolean
  onCancel: () => void
  onSave: (patch: Partial<Transaction>) => void
  onFile: (file: File | null, cb: (url: string) => void) => void
}) {
  const [buyer_name, setBuyer] = useState(t.buyer_name || '')
  const [authorized_pickup_name, setAuth] = useState(t.authorized_pickup_name || '')
  const [payment_status, setPay] = useState<'Pending' | 'Paid'>(t.payment_status)
  const [notes, setNotes] = useState(t.notes || '')
  const [receipt_image_url, setReceipt] = useState(t.receipt_image_url || '')

  return (
    <div className="stack">
      <input placeholder="Pickup name" value={buyer_name} onChange={(e) => setBuyer(e.target.value)} />
      <input placeholder="Authorized alternate" value={authorized_pickup_name} onChange={(e) => setAuth(e.target.value)} />
      <select value={payment_status} onChange={(e) => setPay(e.target.value as 'Pending' | 'Paid')}>
        <option value="Pending">Pending</option>
        <option value="Paid">Paid</option>
      </select>
      <textarea placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <input placeholder="Receipt URL" value={receipt_image_url} onChange={(e) => setReceipt(e.target.value)} />
      <input type="file" accept="image/*" onChange={(e) => onFile(e.target.files?.[0] || null, setReceipt)} />
      <div className="row">
        <button
          className="btn"
          type="button"
          disabled={busy}
          onClick={() => onSave({ buyer_name, authorized_pickup_name, payment_status, notes, receipt_image_url })}
        >
          Save
        </button>
        <button className="btn-ghost" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
