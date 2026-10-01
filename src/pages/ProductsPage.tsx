import { useMemo, useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/Auth'
import { type Reservation, type Cube, peso } from '../lib/types'
import { SkeletonCard } from '../components/Skeleton'

type Product = {
  product_id: number
  product_name: string
  description?: string
  price?: number
  stock_quantity?: number
  variant?: string
  image_url?: string
  deleted_at?: string | null
}

export default function ProductsPage() {
  const { user } = useAuth()
  const nav = useNavigate()
  const [searchParams] = useSearchParams()
  const [products, setProducts] = useState<Product[]>([])
  const [cubes, setCubes] = useState<Cube[]>([])
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [loading, setLoading] = useState(false)
  const [reservingFor, setReservingFor] = useState<number | null>(null)
  const [reservingCube, setReservingCube] = useState<number | null>(null)
  const [hours, setHours] = useState<number>(1)
  const [cubeMonths, setCubeMonths] = useState<number>(1)
  const [tab, setTab] = useState<'products' | 'cubes'>('products')

  useEffect(() => {
    const reserveId = searchParams.get('reserve')
    const type = searchParams.get('type')
    if (reserveId && user) {
      if (type === 'cube') {
        setReservingCube(Number(reserveId))
        setTab('cubes')
      } else {
        setReservingFor(Number(reserveId))
        setTab('products')
      }
    }
  }, [searchParams, user])

  async function createReservation(product_id: number) {
    try {
      setLoading(true)
      if (!user) {
        nav(`/login?redirect=/${encodeURIComponent(`&reserve=${product_id}&type=product`)}`)
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

  async function createCubeReservation(cube_id: number) {
    try {
      setLoading(true)
      if (!user) {
        nav(`/login?redirect=/${encodeURIComponent(`&reserve=${cube_id}&type=cube`)}`)
        setLoading(false)
        return
      }
      if (user.role !== 'Customer' && user.role !== 'Renter') {
        alert('Only Customer or Renter accounts may reserve cubes.')
        setLoading(false)
        return
      }

      const expiry = new Date(Date.now() + cubeMonths * 30 * 24 * 60 * 60 * 1000).toISOString()
      const { error } = await supabase.from('reservations').insert([
        { cube_id, customer_id: user.user_id, expiry_time: expiry, hours_valid: cubeMonths * 720, status: 'Pending' },
      ])
      setLoading(false)
      if (error) return alert('Reservation failed: ' + error.message)
      alert('Cube reserved successfully! The owner will review your reservation.')
      setReservingCube(null)
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
    const [pRes, rRes, cRes] = await Promise.all([
      supabase.from('products').select('*').is('deleted_at', null),
      supabase.from('reservations').select('*, cubes(*)').eq('status', 'Pending'),
      supabase.from('cubes').select('*').is('deleted_at', null).order('cube_number'),
    ])
    setLoading(false)
    if (!pRes.error) {
      setProducts(pRes.data?.length ? pRes.data : [])
    }
    if (!rRes.error) {
      setReservations(rRes.data || [])
    }
    if (!cRes.error) {
      setCubes((cRes.data || []) as Cube[])
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

  const cubeReservationSet = useMemo(() => {
    const set = new Set<number>()
    for (const r of reservations) {
      if (r.cube_id) set.add(r.cube_id)
    }
    return set
  }, [reservations])

  const availableCubes = cubes.filter((c) => c.status === 'Available')

  function handleProductClick(productId: number) {
    if (!user) {
      nav(`/login?redirect=/`)
      return
    }
    if (user.role === 'Customer') {
      setReservingFor(productId)
    }
  }

  function handleCubeClick(cubeId: number) {
    if (!user) {
      nav(`/login?redirect=/`)
      return
    }
    if (user.role === 'Customer' || user.role === 'Renter') {
      setReservingCube(cubeId)
    }
  }

  return (
    <section>
      <div className="hero-strip">
        <h1>
          EXPLORE AVAILABLE <span className="highlight">PRODUCTS</span> AND RENTAL CUBES.
        </h1>
        <p>Live inventory tracking for display items, pick-up reservations, and cube rentals!</p>
      </div>

      {/* Tab toggle */}
      <div className="row" style={{ marginBottom: '1.25rem', gap: '0.5rem' }}>
        <button className={tab === 'products' ? 'btn' : 'btn-ghost'} type="button" onClick={() => setTab('products')}>
          Products
        </button>
        <button className={tab === 'cubes' ? 'btn' : 'btn-ghost'} type="button" onClick={() => setTab('cubes')}>
          Available Rental Cubes
        </button>
      </div>

      {/* ═══ PRODUCTS TAB ═══ */}
      {tab === 'products' && (
        <>
          <h2>NEW ARRIVALS & PRODUCTS</h2>
          {loading ? (
            <div className="grid products-grid">
              {Array.from({ length: 6 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="empty">No products available at this time.</div>
          ) : (
            <div className="grid products-grid">
              {products.map((p) => {
                const reservedCount = reservationMap.get(p.product_id)?.length || 0
                const availableCount = Math.max((p.stock_quantity || 0) - reservedCount, 0)
                const isFullyReserved = availableCount <= 0

                return (
                  <article
                    key={p.product_id}
                    className={`card product-card ${isFullyReserved ? 'reserved-card' : 'clickable-card'}`}
                    onClick={() => !isFullyReserved && handleProductClick(p.product_id)}
                    style={{ cursor: isFullyReserved ? 'not-allowed' : 'pointer', opacity: isFullyReserved ? 0.65 : 1 }}
                  >
                    <div
                      className="card-media"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: '#f4f5f7',
                      }}
                    >
                      {p.image_url ? (
                        <img src={p.image_url} alt={p.product_name} />
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', color: '#888' }}>
                          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                            <line x1="12" y1="22.08" x2="12" y2="12" />
                          </svg>
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            No Image Uploaded
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="card-body">
                      <div className="product-meta">
                        {isFullyReserved ? (
                          <span className="product-badge danger">Reserved / Sold out</span>
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
                        {isFullyReserved ? (
                          <button className="btn" disabled type="button" style={{ width: '100%', justifyContent: 'space-between' }}>
                            <span>Reserved / Sold out</span>
                            <span>✗</span>
                          </button>
                        ) : !user ? (
                          <button className="btn" type="button" style={{ width: '100%', justifyContent: 'space-between' }} onClick={(e) => { e.stopPropagation(); nav('/login?redirect=/') }}>
                            <span>Sign in to Reserve</span>
                            <span>→</span>
                          </button>
                        ) : user.role === 'Customer' ? (
                          <button
                            className="btn"
                            style={{ width: '100%', justifyContent: 'space-between' }}
                            onClick={(e) => { e.stopPropagation(); setReservingFor(p.product_id) }}
                          >
                            <span>Reserve Item</span>
                            <span>→</span>
                          </button>
                        ) : (
                          <button className="btn-ghost" disabled type="button" style={{ width: '100%', justifyContent: 'space-between' }}>
                            <span>Customer Only</span>
                            <span>→</span>
                          </button>
                        )}
                      </div>

                      {reservingFor === p.product_id && (
                        <div className="card-actions" style={{ flexDirection: 'column', gap: '0.5rem', background: '#f4f5f7', padding: '0.85rem', borderRadius: 14, marginTop: '0.5rem' }} onClick={(e) => e.stopPropagation()}>
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
        </>
      )}

      {/* ═══ CUBES TAB ═══ */}
      {tab === 'cubes' && (
        <>
          <h2>AVAILABLE RENTAL CUBES</h2>
          {loading ? (
            <div className="grid products-grid">
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : availableCubes.length === 0 ? (
            <div className="empty">No cubes available for rental at this time.</div>
          ) : (
            <div className="grid products-grid">
              {availableCubes.map((cube) => {
                const isReserved = cubeReservationSet.has(cube.cube_id) || cube.status === 'Occupied'

                return (
                  <article
                    key={cube.cube_id}
                    className={`card product-card ${isReserved ? 'reserved-card' : 'clickable-card'}`}
                    onClick={() => !isReserved && handleCubeClick(cube.cube_id)}
                    style={{ cursor: isReserved ? 'not-allowed' : 'pointer', opacity: isReserved ? 0.65 : 1 }}
                  >
                    <div
                      className="card-media"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: '#f4f5f7',
                      }}
                    >
                      {cube.image_url ? (
                        <img src={cube.image_url} alt={`Cube ${cube.cube_number}`} />
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', color: '#888' }}>
                          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                            <line x1="12" y1="22.08" x2="12" y2="12" />
                          </svg>
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Cube #{cube.cube_number}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="card-body">
                      <div className="product-meta">
                        <span className="product-badge">{cube.type}</span>
                        {isReserved ? (
                          <span className="product-badge danger">Reserved</span>
                        ) : (
                          <span className="product-badge" style={{ background: '#dcfce7', color: '#166534' }}>Available</span>
                        )}
                      </div>

                      <div className="product-summary">
                        <h3>Cube #{cube.cube_number}</h3>
                        {(cube.width_cm || cube.height_cm) && (
                          <p className="muted" style={{ fontSize: '0.88rem' }}>
                            Size: {cube.width_cm ?? '—'}cm × {cube.height_cm ?? '—'}cm
                          </p>
                        )}
                      </div>

                      <div className="product-meta" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="product-price">{peso(cube.price_per_month)}<span className="muted" style={{ fontSize: '0.78rem', fontWeight: 400 }}> / month</span></span>
                      </div>

                      <div className="card-actions" style={{ marginTop: '0.5rem' }}>
                        {isReserved ? (
                          <button className="btn" disabled type="button" style={{ width: '100%', justifyContent: 'space-between' }}>
                            <span>Reserved</span>
                            <span>✗</span>
                          </button>
                        ) : !user ? (
                          <button className="btn" type="button" style={{ width: '100%', justifyContent: 'space-between' }} onClick={(e) => { e.stopPropagation(); nav('/login?redirect=/') }}>
                            <span>Sign in to Reserve</span>
                            <span>→</span>
                          </button>
                        ) : (
                          <button
                            className="btn"
                            style={{ width: '100%', justifyContent: 'space-between' }}
                            onClick={(e) => { e.stopPropagation(); setReservingCube(cube.cube_id) }}
                          >
                            <span>Reserve Cube</span>
                            <span>→</span>
                          </button>
                        )}
                      </div>

                      {reservingCube === cube.cube_id && (
                        <div className="card-actions" style={{ flexDirection: 'column', gap: '0.5rem', background: '#f4f5f7', padding: '0.85rem', borderRadius: 14, marginTop: '0.5rem' }} onClick={(e) => e.stopPropagation()}>
                          <div className="field no-gap" style={{ width: '100%' }}>
                            <label className="muted" style={{ fontSize: '0.8rem', fontWeight: 700 }}>Rental duration:</label>
                            <select value={cubeMonths} onChange={(e) => setCubeMonths(Number(e.target.value))}>
                              {[1, 2, 3, 6, 12].map((m) => <option key={m} value={m}>{m} month(s)</option>)}
                            </select>
                          </div>
                          <div className="row" style={{ width: '100%' }}>
                            <button className="btn" style={{ flex: 1 }} onClick={() => createCubeReservation(cube.cube_id)}>Confirm</button>
                            <button className="btn-ghost" style={{ flex: 1 }} onClick={() => setReservingCube(null)}>Cancel</button>
                          </div>
                        </div>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </>
      )}
    </section>
  )
}
