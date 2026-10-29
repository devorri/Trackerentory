import { useMemo, useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { X, ArrowRight, Search, ChevronLeft, ChevronRight, Camera, CheckCircle2, Box } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/Auth'
import { type Reservation, type Cube, type Product, type Contract, peso, isReservationExpired, todayISO, addMonths, daysUntil } from '../lib/types'
import { cancelExpiredReservations, expireContracts } from '../lib/maintenance'
import { SkeletonCard } from '../components/Skeleton'
import ProductGalleryModal from '../components/ProductGalleryModal'

export default function ProductsPage() {
  const { user } = useAuth()
  const nav = useNavigate()
  const [searchParams] = useSearchParams()
  const [products, setProducts] = useState<Product[]>([])
  const [cubes, setCubes] = useState<Cube[]>([])
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(false)
  const [reservingFor, setReservingFor] = useState<number | null>(null)
  const [reservingCube, setReservingCube] = useState<number | null>(null)
  const [hours, setHours] = useState<number>(1)
  const [cubeMonths, setCubeMonths] = useState<number>(1)
  const [tab, setTab] = useState<'products' | 'cubes'>('products')
  const [selectedCategory, setSelectedCategory] = useState<string>('All')
  const [search, setSearch] = useState('')
  const [activeImage, setActiveImage] = useState<Record<number, number>>({})
  const [galleryProduct, setGalleryProduct] = useState<Product | null>(null)
  const [galleryCube, setGalleryCube] = useState<Cube | null>(null)
  const [activeCubeImageIndex, setActiveCubeImageIndex] = useState(0)
  const [reservedModalOpen, setReservedModalOpen] = useState(false)

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

  async function createReservation(product_id: number, reservationHours?: number) {
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

      const activeHours = reservationHours ?? hours
      const { error } = await supabase.rpc('reserve_product_for_customer', {
        p_product_id: product_id,
        p_customer_id: user.user_id,
        p_hours: activeHours,
      })
      setLoading(false)
      if (error) return alert('Reservation failed: ' + error.message)
      setReservingFor(null)
      setReservedModalOpen(true)
      await loadProducts()
    } catch (err) {
      setLoading(false)
      console.error(err)
      alert(err instanceof Error ? err.message : 'Reservation failed.')
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

      await Promise.all([expireContracts(), cancelExpiredReservations()])

      const { data: existing, error: existingError } = await supabase
        .from('contracts')
        .select('*')
        .eq('cube_id', cube_id)
        .in('status', ['Pending', 'Active'])
      if (existingError) throw existingError

      const liveContracts = (existing || []).filter((c: any) => {
        if (c.status === 'Pending') return true
        if (c.status === 'Active') return daysUntil(c.end_date) >= 0
        return false
      })

      if (liveContracts.length > 0) {
        setLoading(false)
        await loadProducts()
        return alert('This cube already has a pending or active rental agreement.')
      }

      // 1. Create pending contract record for Contracts Management & Renter Pending List
      const start = todayISO()
      const end = addMonths(start, cubeMonths)
      let { error: contractError } = await supabase.from('contracts').insert([
        {
          renter_id: user.user_id,
          cube_id,
          start_date: start,
          end_date: end,
          status: 'Pending',
          contract_text: null,
        },
      ])
      if (contractError && contractError.message.includes('contract_text')) {
        const retry = await supabase.from('contracts').insert([
          {
            renter_id: user.user_id,
            cube_id,
            start_date: start,
            end_date: end,
            status: 'Pending',
          },
        ])
        contractError = retry.error
      }
      if (contractError) throw contractError

      // 2. Also insert into reservations table (with fallback if hours_valid or cube_id column is absent)
      const expiry = new Date(Date.now() + cubeMonths * 30 * 24 * 60 * 60 * 1000).toISOString()
      const { error: resError } = await supabase.from('reservations').insert([
        { cube_id, customer_id: user.user_id, expiry_time: expiry, hours_valid: cubeMonths * 720, status: 'Pending' },
      ])
      if (resError) {
        const { error: fallbackResError } = await supabase.from('reservations').insert([
          { cube_id, customer_id: user.user_id, expiry_time: expiry, status: 'Pending' },
        ])
        if (fallbackResError) {
          console.warn('Reservations table cube insert fallback:', fallbackResError.message)
        }
      }

      // Keep cube status as Available while contract is Pending so it stays in the Catalogue with a "Reserved" badge
      await supabase.from('cubes').update({ status: 'Available' }).eq('cube_id', cube_id)

      setLoading(false)
      alert('Cube reserved successfully! Your reservation is now in Pending awaiting approval.')
      setReservingCube(null)
      await loadProducts()
    } catch (err) {
      setLoading(false)
      console.error(err)
      alert(err instanceof Error ? err.message : 'Cube reservation failed.')
    }
  }

  async function loadProducts() {
    setLoading(true)
    await Promise.all([expireContracts(), cancelExpiredReservations()])
    const [pRes, rRes, cRes, conRes] = await Promise.all([
      supabase.from('products').select('*, cubes(cube_number, type, status)').is('deleted_at', null).order('created_at', { ascending: false }),
      supabase.from('reservations').select('*, cubes(*)').in('status', ['Pending', 'Confirmed']),
      supabase.from('cubes').select('*').is('deleted_at', null).order('cube_number'),
      supabase.from('contracts').select('*').in('status', ['Pending', 'Active']),
    ])
    setLoading(false)
    if (!pRes.error) {
      const allProds = (pRes.data || []) as (Product & { cubes?: Cube | null })[]
      // Strictly exclude products from Pick-up cubes. Catalogue is for Display products only!
      const displayOnly = allProds.filter((p) => {
        const cType = p.cubes?.type
        if (cType === 'Pick-up') return false
        return true
      })
      setProducts(displayOnly)
    } else {
      const pFallback = await supabase.from('products').select('*, cubes(cube_number, type, status)').order('product_id', { ascending: false })
      if (!pFallback.error) {
        const allProds = (pFallback.data || []) as (Product & { cubes?: Cube | null })[]
        setProducts(allProds.filter((p) => !p.deleted_at && p.cubes?.type !== 'Pick-up'))
      }
    }
    if (!rRes.error) {
      setReservations(rRes.data || [])
    } else {
      const rFallback = await supabase.from('reservations').select('*').in('status', ['Pending', 'Confirmed'])
      if (!rFallback.error) {
        setReservations((rFallback.data || []) as Reservation[])
      }
    }
    if (!cRes.error) {
      setCubes((cRes.data || []) as Cube[])
    } else {
      const cFallback = await supabase.from('cubes').select('*').order('cube_number')
      if (!cFallback.error) {
        setCubes(((cFallback.data || []) as Cube[]).filter((c) => !c.deleted_at))
      }
    }
    if (!conRes.error) {
      setContracts((conRes.data || []) as Contract[])
    }
  }

  useEffect(() => {
    loadProducts()
  }, [])

  const reservationMap = useMemo(() => {
    const map = new Map<number, Reservation[]>()
    for (const r of reservations) {
      if (r.product_id && !isReservationExpired(r)) {
        const list = map.get(r.product_id) || []
        list.push(r)
        map.set(r.product_id, list)
      }
    }
    return map
  }, [reservations])

  const categories = useMemo(() => {
    const set = new Set<string>()
    products.forEach((p) => {
      if (p.category && p.category.trim()) {
        set.add(p.category.trim())
      }
    })
    return ['All', ...Array.from(set).sort()]
  }, [products])

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase()
    return products.filter((p) => {
      const categoryMatch = selectedCategory === 'All' || (p.category || 'General').toLowerCase() === selectedCategory.toLowerCase()
      const searchMatch = !query || [p.product_name, p.description, p.variant, p.category].some((value) => value?.toLowerCase().includes(query))
      return categoryMatch && searchMatch
    })
  }, [products, selectedCategory, search])

  // Cubes with an Active (approved & non-expired) contract must be removed from the Catalogue
  const activeContractCubeIds = useMemo(() => {
    const set = new Set<number>()
    for (const c of contracts) {
      if (c.cube_id && c.status === 'Active' && daysUntil(c.end_date) >= 0) {
        set.add(c.cube_id)
      }
    }
    return set
  }, [contracts])

  // Cubes with a Pending reservation or Pending contract stay in Catalogue with a "Reserved" badge
  const cubeReservationSet = useMemo(() => {
    const set = new Set<number>()
    for (const r of reservations) {
      if (r.cube_id && !r.product_id && r.status === 'Pending' && !isReservationExpired(r)) {
        set.add(r.cube_id)
      }
    }
    for (const c of contracts) {
      if (c.cube_id && c.status === 'Pending') {
        set.add(c.cube_id)
      }
    }
    return set
  }, [reservations, contracts])

  const availableCubes = useMemo(() => {
    return cubes.filter((c) => {
      // Remove cubes that already have an active/approved contract
      if (activeContractCubeIds.has(c.cube_id)) return false
      // Keep cubes that are reserved (pending approval) so they display as "Reserved" in the Catalogue
      if (cubeReservationSet.has(c.cube_id)) return true
      // Otherwise only show Available cubes
      return c.status === 'Available'
    })
  }, [cubes, activeContractCubeIds, cubeReservationSet])

  function handleProductClick(p: Product) {
    setGalleryProduct(p)
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
            <h2 style={{ margin: 0 }}>NEW ARRIVALS & PRODUCTS</h2>
            <div className="field no-gap" style={{ minWidth: 'min(100%, 260px)' }}>
              <label htmlFor="catalog-search" className="sr-only">Search catalogue</label>
              <div style={{ position: 'relative' }}>
                <Search size={16} aria-hidden="true" style={{ position: 'absolute', left: 10, top: 11, color: '#64748b' }} />
                <input id="catalog-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search catalogue" style={{ paddingLeft: 34 }} />
              </div>
            </div>
            {categories.length > 1 && (
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <span className="muted" style={{ fontSize: '0.82rem', fontWeight: 600, marginRight: '0.25rem' }}>Category:</span>
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    className={selectedCategory === cat ? 'btn' : 'btn-ghost'}
                    style={{ padding: '0.3rem 0.75rem', fontSize: '0.82rem', borderRadius: '20px' }}
                    onClick={() => setSelectedCategory(cat)}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}
          </div>

          {loading ? (
            <div className="grid products-grid">
              {Array.from({ length: 6 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="empty">No products found in category &quot;{selectedCategory}&quot;.</div>
          ) : (
            <div className="grid products-grid">
              {filteredProducts.map((p) => {
                const reservedCount = reservationMap.get(p.product_id)?.length || 0
                const availableCount = Math.max((p.stock_quantity || 0) - reservedCount, 0)
                const isFullyReserved = availableCount <= 0

                return (
                  <article
                    key={p.product_id}
                    className={`card product-card ${isFullyReserved ? 'reserved-card' : 'clickable-card'}`}
                    onClick={() => handleProductClick(p)}
                    style={{ cursor: 'pointer', opacity: isFullyReserved ? 0.7 : 1 }}
                  >
                    <div
                      className="card-media"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: '#f4f5f7',
                        position: 'relative',
                      }}
                    >
                      {(p.image_urls?.length || p.image_url) ? (
                        <>
                          {(() => {
                            const images = p.image_urls?.length ? p.image_urls : [p.image_url!]
                            const index = Math.min(activeImage[p.product_id] || 0, images.length - 1)
                            return <img src={images[index]} alt={`${p.product_name} photo ${index + 1}`} />
                          })()}
                          {(p.image_urls?.length || 0) > 1 && (
                            <>
                              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 8 }}>
                                <button type="button" className="btn-ghost" aria-label="Previous product photo" onClick={(e) => { e.stopPropagation(); setActiveImage((current) => ({ ...current, [p.product_id]: ((current[p.product_id] || 0) - 1 + p.image_urls!.length) % p.image_urls!.length })) }}><ChevronLeft size={16} /></button>
                                <button type="button" className="btn-ghost" aria-label="Next product photo" onClick={(e) => { e.stopPropagation(); setActiveImage((current) => ({ ...current, [p.product_id]: ((current[p.product_id] || 0) + 1) % p.image_urls!.length })) }}><ChevronRight size={16} /></button>
                              </div>
                              <div style={{ position: 'absolute', bottom: 8, right: 8, background: 'rgba(0,0,0,0.72)', color: '#fff', fontSize: '0.72rem', fontWeight: 800, padding: '2px 8px', borderRadius: 999, display: 'flex', alignItems: 'center', gap: 4, pointerEvents: 'none' }}>
                                <Camera size={12} /> {p.image_urls!.length} shots
                              </div>
                            </>
                          )}
                        </>
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
                        {p.category && (
                          <span className="product-badge" style={{ background: '#e0e7ff', color: '#4338ca' }}>
                            {p.category}
                          </span>
                        )}
                      </div>

                      <div className="product-summary">
                        <h3>{p.product_name}</h3>
                        <p className="muted" style={{ fontSize: '0.88rem', lineHeight: 1.5 }}>
                          {p.description || 'A premium inventory item ready for reservation.'}
                        </p>
                      </div>

                      <div className="product-meta" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="product-price">{peso(p.price)}</span>
                        {reservedCount > 0 && <span className="muted" style={{ fontSize: '0.78rem' }}>{reservedCount} reserved</span>}
                      </div>

                      <div className="card-actions" style={{ marginTop: '0.5rem' }}>
                        {isFullyReserved ? (
                          <button className="btn" disabled type="button" style={{ width: '100%', justifyContent: 'space-between' }}>
                            <span>Reserved / Sold out</span>
                            <X size={16} />
                          </button>
                        ) : !user ? (
                          <button className="btn" type="button" style={{ width: '100%', justifyContent: 'space-between' }} onClick={(e) => { e.stopPropagation(); nav('/login?redirect=/') }}>
                            <span>Sign in to Reserve</span>
                            <ArrowRight size={16} />
                          </button>
                        ) : user.role === 'Customer' ? (
                          <button
                            className="btn"
                            style={{ width: '100%', justifyContent: 'space-between' }}
                            onClick={(e) => { e.stopPropagation(); setReservingFor(p.product_id) }}
                          >
                            <span>Reserve</span>
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
                const isReserved = cubeReservationSet.has(cube.cube_id)

                return (
                  <article
                    key={cube.cube_id}
                    className={`card product-card ${isReserved ? 'reserved-card' : 'clickable-card'}`}
                    onClick={() => !isReserved && handleCubeClick(cube.cube_id)}
                    style={{ cursor: isReserved ? 'not-allowed' : 'pointer', opacity: isReserved ? 0.65 : 1 }}
                  >
                    <div
                      className="card-media"
                      onClick={(e) => {
                        e.stopPropagation()
                        setActiveCubeImageIndex(0)
                        setGalleryCube(cube)
                      }}
                      title="Click to view cube picture"
                      style={{
                        position: 'relative',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: '#f4f5f7',
                        cursor: 'zoom-in',
                      }}
                    >
                      {cube.image_url ? (
                        <>
                          <img src={cube.image_url} alt={`Cube ${cube.cube_number}`} />
                          {((cube as any).image_urls?.length || 0) > 1 && (
                            <span
                              className="photo-badge-main"
                              style={{
                                top: 8,
                                right: 8,
                                bottom: 'auto',
                                left: 'auto',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                                background: 'rgba(0,0,0,0.7)',
                              }}
                            >
                              <Camera size={11} /> {(cube as any).image_urls.length} shots
                            </span>
                          )}
                        </>
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
                            <X size={16} />
                          </button>
                        ) : !user ? (
                          <button className="btn" type="button" style={{ width: '100%', justifyContent: 'space-between' }} onClick={(e) => { e.stopPropagation(); nav('/login?redirect=/') }}>
                            <span>Sign in to Reserve</span>
                            <ArrowRight size={16} />
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
      {/* Shopee-Style Product Gallery Modal */}
      <ProductGalleryModal
        product={galleryProduct}
        isOpen={Boolean(galleryProduct)}
        onClose={() => setGalleryProduct(null)}
        userRole={user?.role}
        availableCount={
          galleryProduct
            ? Math.max((galleryProduct.stock_quantity || 0) - (reservationMap.get(galleryProduct.product_id)?.length || 0), 0)
            : 0
        }
        isReserved={
          galleryProduct
            ? Math.max((galleryProduct.stock_quantity || 0) - (reservationMap.get(galleryProduct.product_id)?.length || 0), 0) <= 0
            : false
        }
        onReserve={(pid, h) => {
          setHours(h)
          createReservation(pid, h)
        }}
        onSignIn={() => nav('/login?redirect=/')}
      />

      {/* Reservation Confirmed Modal Pop-up */}
      {reservedModalOpen && (
        <div
          className="modal-overlay"
          onClick={() => setReservedModalOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100001,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.25rem',
            background: 'rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(4px)',
          }}
        >
          <div
            className="modal-card"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 440,
              width: '92vw',
              padding: '2rem 1.75rem',
              borderRadius: 24,
              background: '#ffffff',
              boxShadow: '0 25px 60px rgba(0, 0, 0, 0.28)',
              border: '1px solid #e2e8f0',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '1.25rem',
            }}
          >
            <div
              style={{
                width: 62,
                height: 62,
                borderRadius: '50%',
                background: 'rgba(16, 185, 129, 0.12)',
                color: '#10b981',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <CheckCircle2 size={34} />
            </div>

            <div>
              <h3 style={{ fontSize: '1.3rem', fontWeight: 800, margin: '0 0 0.5rem', color: '#0f172a' }}>
                Reservation Confirmed!
              </h3>
              <p style={{ margin: 0, fontSize: '0.96rem', color: '#475569', lineHeight: 1.6 }}>
                Your product has been reserved! Claim it before the reservation period expires.
              </p>
            </div>

            <button
              type="button"
              className="btn"
              style={{ width: '100%', justifyContent: 'center', padding: '0.8rem 1.25rem', fontSize: '0.95rem', fontWeight: 700 }}
              onClick={() => setReservedModalOpen(false)}
            >
              Okay
            </button>
          </div>
        </div>
      )}

      {/* ═══ CUBE IMAGE / DETAILS PREVIEW MODAL (Item 24) ═══ */}
      {galleryCube && (
        <div
          className="modal-overlay"
          onClick={() => setGalleryCube(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.25rem',
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(5px)',
          }}
        >
          <div
            className="modal-card"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 620,
              width: '95vw',
              borderRadius: 24,
              background: '#ffffff',
              boxShadow: '0 25px 60px rgba(0, 0, 0, 0.35)',
              border: '1px solid #e2e8f0',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              maxHeight: '90vh',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1.5rem', borderBottom: '1px solid #e2e8f0' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>Cube #{galleryCube.cube_number}</h3>
                {cubeReservationSet.has(galleryCube.cube_id) ? (
                  <span className="badge danger" style={{ marginTop: 4, fontSize: '0.72rem' }}>
                    {galleryCube.type} Cube • Reserved
                  </span>
                ) : (
                  <span className="badge" style={{ background: '#dcfce7', color: '#166534', marginTop: 4, fontSize: '0.72rem' }}>
                    {galleryCube.type} Cube • Available
                  </span>
                )}
              </div>
              <button
                type="button"
                className="btn-ghost"
                style={{ padding: '0.35rem', borderRadius: '50%' }}
                onClick={() => setGalleryCube(null)}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '1.5rem', overflowY: 'auto' }}>
              {(() => {
                const cubeImages: string[] = (galleryCube as any).image_urls?.length
                  ? (galleryCube as any).image_urls
                  : galleryCube.image_url
                  ? [galleryCube.image_url]
                  : []
                const currentImg = cubeImages[activeCubeImageIndex] || cubeImages[0]

                return (
                  <div>
                    <div
                      style={{
                        position: 'relative',
                        width: '100%',
                        height: 320,
                        borderRadius: 16,
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                        marginBottom: cubeImages.length > 1 ? '0.75rem' : '1.25rem',
                      }}
                    >
                      {currentImg ? (
                        <img
                          src={currentImg}
                          alt={`Cube ${galleryCube.cube_number}`}
                          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                        />
                      ) : (
                        <div style={{ textAlign: 'center', color: '#94a3b8' }}>
                          <Box size={56} style={{ margin: '0 auto 0.5rem', opacity: 0.6 }} />
                          <p style={{ margin: 0, fontWeight: 600 }}>No custom image uploaded for this cube</p>
                        </div>
                      )}

                      {cubeImages.length > 1 && (
                        <>
                          <button
                            type="button"
                            className="btn-ghost"
                            onClick={() => setActiveCubeImageIndex((i) => (i - 1 + cubeImages.length) % cubeImages.length)}
                            style={{
                              position: 'absolute',
                              left: 10,
                              top: '50%',
                              transform: 'translateY(-50%)',
                              background: 'rgba(255,255,255,0.9)',
                              borderRadius: '50%',
                              width: 36,
                              height: 36,
                              padding: 0,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                            }}
                            aria-label="Previous image"
                          >
                            <ChevronLeft size={20} />
                          </button>
                          <button
                            type="button"
                            className="btn-ghost"
                            onClick={() => setActiveCubeImageIndex((i) => (i + 1) % cubeImages.length)}
                            style={{
                              position: 'absolute',
                              right: 10,
                              top: '50%',
                              transform: 'translateY(-50%)',
                              background: 'rgba(255,255,255,0.9)',
                              borderRadius: '50%',
                              width: 36,
                              height: 36,
                              padding: 0,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                            }}
                            aria-label="Next image"
                          >
                            <ChevronRight size={20} />
                          </button>
                        </>
                      )}
                    </div>

                    {cubeImages.length > 1 && (
                      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', overflowX: 'auto', paddingBottom: 4 }}>
                        {cubeImages.map((src: string, idx: number) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setActiveCubeImageIndex(idx)}
                            style={{
                              width: 60,
                              height: 60,
                              padding: 0,
                              border: idx === activeCubeImageIndex ? '2px solid #000' : '1px solid #cbd5e1',
                              borderRadius: 8,
                              overflow: 'hidden',
                              background: '#fff',
                              cursor: 'pointer',
                              flexShrink: 0,
                            }}
                          >
                            <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })()}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.85rem', background: '#f8fafc', padding: '1rem', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                <div>
                  <div className="muted" style={{ fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 700 }}>Rate / Month</div>
                  <strong style={{ fontSize: '1.1rem', color: '#0f172a' }}>{peso(galleryCube.price_per_month)}</strong>
                </div>
                <div>
                  <div className="muted" style={{ fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 700 }}>Cube Type</div>
                  <strong style={{ fontSize: '1rem', color: '#0f172a' }}>{galleryCube.type}</strong>
                </div>
                {(galleryCube.width_cm || galleryCube.height_cm) && (
                  <div>
                    <div className="muted" style={{ fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 700 }}>Dimensions</div>
                    <strong style={{ fontSize: '1rem', color: '#0f172a' }}>{galleryCube.width_cm ?? '—'}cm × {galleryCube.height_cm ?? '—'}cm</strong>
                  </div>
                )}
                {galleryCube.location && (
                  <div>
                    <div className="muted" style={{ fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 700 }}>Location</div>
                    <strong style={{ fontSize: '1rem', color: '#0f172a' }}>{galleryCube.location}</strong>
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', padding: '1rem 1.5rem', borderTop: '1px solid #e2e8f0', background: '#ffffff', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setGalleryCube(null)}
              >
                Close
              </button>
              {cubeReservationSet.has(galleryCube.cube_id) ? (
                <button type="button" className="btn" disabled>
                  Reserved
                </button>
              ) : (
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    const cId = galleryCube.cube_id
                    setGalleryCube(null)
                    handleCubeClick(cId)
                  }}
                >
                  Reserve Cube #{galleryCube.cube_number}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
