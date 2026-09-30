import { useMemo, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/Auth'
import { type Reservation, peso } from '../lib/types'

type Product = {
  product_id: number
  product_name: string
  description?: string
  price?: number
  stock_quantity?: number
  variant?: string
  image_url?: string
}

const SAMPLE_IMAGES = [
  'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1572635196237-14b3f281503f?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1560343090-f0409e92791a?auto=format&fit=crop&w=800&q=80',
  'https://images.unsplash.com/photo-1583394838336-acd977736f90?auto=format&fit=crop&w=800&q=80',
]

const DEMO_PRODUCTS: Product[] = [
  {
    product_id: 101,
    product_name: 'Minimal Chronograph Watch',
    description: 'Sleek matte black analog wristwatch with genuine leather strap.',
    price: 3499,
    stock_quantity: 4,
    variant: 'Matte Black',
    image_url: SAMPLE_IMAGES[0],
  },
  {
    product_id: 102,
    product_name: 'Crimson Speed Runners',
    description: 'Lightweight breathable sports sneakers engineered for daily comfort.',
    price: 4899,
    stock_quantity: 2,
    variant: 'Size 42 / Red',
    image_url: SAMPLE_IMAGES[1],
  },
  {
    product_id: 103,
    product_name: 'Studio Wireless Headphones',
    description: 'Active noise-cancelling over-ear headphones with 40h battery life.',
    price: 6200,
    stock_quantity: 5,
    variant: 'Midnight Blue',
    image_url: SAMPLE_IMAGES[2],
  },
  {
    product_id: 104,
    product_name: 'Artisan Leather Tote Bag',
    description: 'Handcrafted full-grain leather shoulder bag with zipper closure.',
    price: 5299,
    stock_quantity: 3,
    variant: 'Tan Brown',
    image_url: SAMPLE_IMAGES[3],
  },
  {
    product_id: 105,
    product_name: 'Vintage Gold Polarized Shades',
    description: 'Classic UV400 protection retro sunglasses with metallic frame.',
    price: 1850,
    stock_quantity: 6,
    variant: 'Gold / Black',
    image_url: SAMPLE_IMAGES[4],
  },
  {
    product_id: 106,
    product_name: 'Retro 35mm Rangefinder Camera',
    description: 'Collectible analog film camera with 50mm f/1.8 prime lens.',
    price: 8900,
    stock_quantity: 1,
    variant: 'Silver Edition',
    image_url: SAMPLE_IMAGES[5],
  },
]

import { SkeletonCard } from '../components/Skeleton'

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
    if (pRes.error || !pRes.data || pRes.data.length === 0) {
      setProducts(DEMO_PRODUCTS)
    } else {
      setProducts(pRes.data)
    }
    if (!rRes.error) {
      setReservations(rRes.data || [])
    }
  }

  useEffect(() => {
    loadProducts()
  }, [])

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
      <div className="hero-strip">
        <h1>
          LET’S EXPLORE <span className="highlight">UNIQUE PRODUCTS</span> & CUBES.
        </h1>
        <p>Live inventory tracking for display items, pick-up reservations, and cube rentals!</p>
      </div>

      <h2>NEW ARRIVALS & PRODUCTS</h2>
      
      {loading ? (
        <div className="grid products-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : (
        <div className="grid products-grid">
        {products.map((p, idx) => {
          const reservedCount = reservationMap.get(p.product_id)?.length || 0
          const availableCount = Math.max((p.stock_quantity || 0) - reservedCount, 0)
          const nextExpiry = (reservationMap.get(p.product_id) || [])
            .map((r) => new Date(r.expiry_time).getTime())
            .sort((a, b) => a - b)[0]

          const displayImg = p.image_url || SAMPLE_IMAGES[idx % SAMPLE_IMAGES.length]

          return (
            <article key={p.product_id} className="card product-card">
              <div className="card-media">
                <img src={displayImg} alt={p.product_name} />
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
                  <p className="muted" style={{ fontSize: '0.88rem', lineHeight: 1.5 }}>
                    {p.description || 'A premium inventory item ready for reservation.'}
                  </p>
                </div>

                <div className="product-meta" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="product-price">{peso(p.price)}</span>
                  {reservedCount > 0 && <span className="muted" style={{ fontSize: '0.78rem' }}>{reservedCount} pending</span>}
                </div>

                <div className="card-actions" style={{ marginTop: '0.5rem' }}>
                  {user?.role === 'Customer' ? (
                    <button
                      className="btn"
                      style={{ width: '100%', justifyContent: 'space-between' }}
                      disabled={availableCount <= 0}
                      onClick={() => setReservingFor(p.product_id)}
                    >
                      <span>{availableCount > 0 ? 'Reserve Item' : 'Sold out'}</span>
                      <span>→</span>
                    </button>
                  ) : (
                    <button className="btn-ghost" disabled type="button" style={{ width: '100%', justifyContent: 'space-between' }}>
                      <span>Customer Only</span>
                      <span>→</span>
                    </button>
                  )}
                </div>

                {nextExpiry && (
                  <p className="muted text-note">
                    Expires {new Date(nextExpiry).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}

                {reservingFor === p.product_id && (
                  <div className="card-actions" style={{ flexDirection: 'column', gap: '0.5rem', background: '#f4f5f7', padding: '0.85rem', borderRadius: 14, marginTop: '0.5rem' }}>
                    <div className="field no-gap" style={{ width: '100%' }}>
                      <label className="muted" style={{ fontSize: '0.8rem', fontWeight: 700 }}>Validity length:</label>
                      <select value={hours} onChange={(e) => setHours(Number(e.target.value))}>
                        <option value={1}>1 hour</option>
                        <option value={2}>2 hours</option>
                        <option value={3}>3 hours</option>
                        <option value={4}>4 hours</option>
                      </select>
                    </div>
                    <div className="row" style={{ width: '100%' }}>
                      <button className="btn" style={{ flex: 1 }} onClick={() => createReservation(p.product_id)}>Confirm</button>
                      <button className="btn-ghost" style={{ flex: 1 }} onClick={() => setReservingFor(null)}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            </article>
          )
        })}
      </div>
      )}
    </section>
  )
}
