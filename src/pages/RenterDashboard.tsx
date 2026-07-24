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
} from '../lib/types'
import { expireContracts } from '../lib/maintenance'
import { uploadPublicImage } from '../lib/storage'
import { BUCKET_PRODUCT_IMAGES } from '../lib/supabase'

export default function RenterDashboard() {
  const { user } = useAuth()
  const [cubes, setCubes] = useState<Cube[]>([])
  const [contracts, setContracts] = useState<Contract[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [months, setMonths] = useState(1)
  const [busy, setBusy] = useState(false)
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

  const myActiveCubeIds = useMemo(
    () => new Set(contracts.filter((c) => c.status === 'Active' || c.status === 'Pending').map((c) => c.cube_id)),
    [contracts],
  )

  async function load() {
    if (!user) return
    await expireContracts()
    const [cRes, conRes, pRes] = await Promise.all([
      supabase.from('cubes').select('*').order('cube_number'),
      supabase.from('contracts').select('*, cubes(*)').eq('renter_id', user.user_id).order('end_date'),
      supabase.from('products').select('*, cubes(cube_number, type)').eq('renter_id', user.user_id),
    ])
    if (!cRes.error) setCubes((cRes.data || []) as Cube[])
    if (!conRes.error) setContracts((conRes.data || []) as Contract[])
    if (!pRes.error) setProducts((pRes.data || []) as Product[])
  }

  useEffect(() => { void load() }, [user])

  if (!user) {
    return (
      <section>
        <div className="page-header">
          <div>
            <h1>Renter</h1>
            <p className="lede">Please <Link to="/login">sign in</Link> as a Renter.</p>
          </div>
        </div>
      </section>
    )
  }

  if (user.role !== 'Renter') {
    return (
      <section>
        <div className="page-header">
          <div>
            <h1>Renter</h1>
            <p className="lede">This area is for Renter accounts.</p>
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
    alert(`Cube ${cube.cube_number} reserved (Pending contract until ${end}). Open Contracts to review/print.`)
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
      return alert('Name, price, and cube are required.')
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
      product_name: productForm.product_name,
      description: productForm.description || null,
      price: Number(productForm.price),
      stock_quantity: Number(productForm.stock_quantity || 1),
      variant: productForm.variant || null,
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

  const available = cubes.filter((c) => c.status === 'Available')
  const expiring = contracts.filter((c) => c.status === 'Active' && daysUntil(c.end_date) <= 7 && daysUntil(c.end_date) >= 0)

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>Renter workspace</h1>
          <p className="lede">Reserve Display / Pick-up cubes, track contract days left, and list products in your cubes.</p>
        </div>
      </div>

      {expiring.length > 0 && (
        <div className="alert warn">
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

      <h2>Available cubes</h2>
      <div className="field" style={{ maxWidth: 220 }}>
        <label>Reserve length (months)</label>
        <select value={months} onChange={(e) => setMonths(Number(e.target.value))}>
          {[1, 2, 3, 6, 12].map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      <div className="grid">
        {available.map((c) => (
          <div className="card" key={c.cube_id}>
            <div className="card-body">
              <h3>{c.cube_number}</h3>
              <div className="meta-line">
                <span>{c.type}</span>
                <span className="badge ok">{c.status}</span>
              </div>
              <div className="price">{peso(c.price_per_month)}<span className="muted" style={{ fontSize: '0.85rem', fontFamily: 'var(--font-body)' }}> / month</span></div>
              <button className="btn" type="button" disabled={busy} onClick={() => reserveCube(c)} style={{ marginTop: '0.5rem' }}>
                Reserve cube
              </button>
            </div>
          </div>
        ))}
      </div>
      {available.length === 0 && <div className="empty">No available cubes right now.</div>}

      <h2>Your contracts</h2>
      <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Cube</th>
            <th>Type</th>
            <th>Period</th>
            <th>Days left</th>
            <th>Status</th>
            <th className="no-print">Actions</th>
          </tr>
        </thead>
        <tbody>
          {contracts.map((c) => {
            const left = daysUntil(c.end_date)
            return (
              <tr key={c.contract_id}>
                <td>{c.cubes?.cube_number}</td>
                <td>{c.cubes?.type}</td>
                <td>{c.start_date} → {c.end_date}</td>
                <td>
                  <span className={`badge ${left <= 7 && left >= 0 ? 'warn' : left < 0 ? 'bad' : 'ok'}`}>
                    {left < 0 ? 'Expired' : `${left} day(s)`}
                  </span>
                </td>
                <td>{c.status}</td>
                <td className="no-print">
                  <div className="row">
                    {c.status === 'Pending' && (
                      <button className="btn-ghost" type="button" onClick={() => activateContract(c)}>Activate</button>
                    )}
                    {(c.status === 'Active' || c.status === 'Pending') && (
                      <>
                        <button className="btn" type="button" onClick={() => extendContract(c, 1)}>+1 month</button>
                        <button className="btn-ghost" type="button" onClick={() => extendContract(c, 3)}>+3 months</button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      </div>

      <h2>Your products in cubes</h2>
      <div className="panel">
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
          <div className="field">
            <label>Name</label>
            <input value={productForm.product_name} onChange={(e) => setProductForm({ ...productForm, product_name: e.target.value })} />
          </div>
          <div className="field">
            <label>Price</label>
            <input type="number" value={productForm.price} onChange={(e) => setProductForm({ ...productForm, price: e.target.value })} />
          </div>
          <div className="field">
            <label>Stock</label>
            <input type="number" value={productForm.stock_quantity} onChange={(e) => setProductForm({ ...productForm, stock_quantity: e.target.value })} />
          </div>
          <div className="field">
            <label>Variant</label>
            <input value={productForm.variant} onChange={(e) => setProductForm({ ...productForm, variant: e.target.value })} />
          </div>
          <div className="field">
            <label>Cube</label>
            <select value={productForm.cube_id} onChange={(e) => setProductForm({ ...productForm, cube_id: e.target.value })}>
              <option value="">Select…</option>
              {cubes.filter((c) => myActiveCubeIds.has(c.cube_id)).map((c) => (
                <option key={c.cube_id} value={c.cube_id}>{c.cube_number} ({c.type})</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Product image</label>
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
                style={{ marginTop: 8, maxWidth: 160 }}
              />
            )}
          </div>
          <div className="field">
            <label>Or image URL (optional)</label>
            <input
              value={productForm.image_url}
              onChange={(e) => setProductForm({ ...productForm, image_url: e.target.value })}
              placeholder="https://…"
            />
          </div>
        </div>
        <div className="field">
          <label>Description</label>
          <textarea value={productForm.description} onChange={(e) => setProductForm({ ...productForm, description: e.target.value })} />
        </div>
        <button className="btn" type="button" disabled={busy} onClick={addProduct}>Add product</button>
      </div>

      <div className="grid">
        {products.map((p) => (
          <div className="card" key={p.product_id}>
            <div className="card-media">
              <img src={p.image_url || 'https://placehold.co/600x600/dfe6e1/3d4a42?text=No+Image'} alt={p.product_name} />
            </div>
            <div className="card-body">
              <h3>{p.product_name}</h3>
              <p className="muted">{p.description}</p>
              <div className="price">{peso(p.price)}</div>
              <div className="meta-line">
                <span>{p.stock_quantity} left</span>
                <span>{p.variant || 'Standard'}</span>
                <span>{p.cubes?.cube_number} · {p.cubes?.type}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
