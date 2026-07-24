import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/Auth'
import { type Reservation } from '../lib/types'

type Product = {
  product_id: number
  product_name: string
  description?: string
  price?: number
  stock_quantity?: number
  variant?: string
  image_url?: string
}

export default function ProductsPage() {
  const { user } = useAuth()
  const [products, setProducts] = useState<Product[]>([])
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [loading, setLoading] = useState(false)
  const [reservingFor, setReservingFor] = useState<number | null>(null)
  const [hours, setHours] = useState<number>(1)

  async function createReservation(product_id: number) {
    try {
      setLoading(true)
      if (!user) {
        alert('Please sign in to reserve')
        setLoading(false)
        return
      }
      if (user.role !== 'Customer') {
        alert('Only Customer accounts may reserve products.')
        setLoading(false)
        return
      }

      const expiry = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
      const { error } = await supabase.from('reservations').insert([
        { product_id, customer_id: user.user_id, expiry_time: expiry, hours_valid: hours, status: 'Pending' },
      ])
      setLoading(false)
      if (error) return alert('Reservation failed: ' + error.message)
      alert('Reserved successfully')
      setReservingFor(null)
      await loadProducts()
    } catch (err: any) {
      setLoading(false)
      console.error(err)
      alert(err.message)
    }
  }

  async function loadProducts() {
    setLoading(true)
    await supabase.from('reservations').update({ status: 'Cancelled' }).eq('status', 'Pending').lt('expiry_time', new Date().toISOString())
    const [pRes, rRes] = await Promise.all([
      supabase.from('products').select('*'),
      supabase.from('reservations').select('*').eq('status', 'Pending'),
    ])
    setLoading(false)
    if (pRes.error) {
      console.error(pRes.error)
    } else {
      setProducts(pRes.data || [])
    }
    if (rRes.error) {
      console.error(rRes.error)
    } else {
      setReservations(rRes.data || [])
    }
  }

  const reservationMap = useMemo(() => {
    const map = new Map<number, Reservation[]>()
    for (const r of reservations) {
      if (r.product_id) {
        const list = map.get(r.product_id) || []
        list.push(r)
        map.set(r.product_id, list)
      }
    }
    return map
  }, [reservations])

  return (
    <section>
      <h1>Products</h1>
      {loading && <p>Loading...</p>}
      <div className="grid products-grid">
        {products.map((p) => {
          const reservedCount = reservationMap.get(p.product_id)?.length || 0
          const availableCount = Math.max((p.stock_quantity || 0) - reservedCount, 0)
          const nextExpiry = (reservationMap.get(p.product_id) || [])
            .map((r) => new Date(r.expiry_time).getTime())
            .sort((a, b) => a - b)[0]

          return (
            <article key={p.product_id} className="card product-card">
              <div className="card-media">
                <img src={p.image_url || '/placeholder.png'} alt={p.product_name} />
              </div>
              <div className="card-body">
                <div className="product-meta">
                  {availableCount === 0 ? (
                    <span className="product-badge danger">Sold out</span>
                  ) : (
                    <span className="product-badge">{availableCount} left</span>
                  )}
                  <span className="product-badge">{p.variant || 'Standard'}</span>
                </div>
                <div className="product-summary">
                  <h3>{p.product_name}</h3>
                  <p className="muted">{p.description || 'A premium inventory item ready for reservation.'}</p>
                </div>
                <div className="product-meta">
                  <span className="product-price">₱{p.price}</span>
                  {reservedCount > 0 && <span>{reservedCount} reservation(s) pending</span>}
                </div>
                <div className="card-actions">
                  {user?.role === 'Customer' ? (
                    <button className="btn" disabled={availableCount <= 0} onClick={() => setReservingFor(p.product_id)}>
                      {availableCount > 0 ? 'Reserve' : 'Sold out'}
                    </button>
                  ) : (
                    <button className="btn-ghost" disabled type="button">
                      Customer only
                    </button>
                  )}
                </div>
                {nextExpiry && (
                  <p className="muted text-note">
                    Next reservation expires {new Date(nextExpiry).toLocaleString()}
                  </p>
                )}
                {reservingFor === p.product_id && (
                  <div className="card-actions">
                    <div className="field no-gap" style={{ flex: 1 }}>
                      <label className="muted">Hours valid:</label>
                      <select value={hours} onChange={(e) => setHours(Number(e.target.value))}>
                        <option value={1}>1</option>
                        <option value={2}>2</option>
                        <option value={3}>3</option>
                        <option value={4}>4</option>
                      </select>
                    </div>
                    <button className="btn" onClick={() => createReservation(p.product_id)}>Confirm</button>
                    <button className="btn-ghost" onClick={() => setReservingFor(null)}>Cancel</button>
                  </div>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
