import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Package,
  Box,
  CalendarCheck,
  Search,
  Clock,
  ArrowUpDown,
  AlertTriangle,
  CheckCircle2,
  X,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/Auth'
import {
  type Reservation,
  type Cube,
  type Product,
  type Contract,
  isReservationExpired,
  getReservationHoursLeft,
  parseReservationExpiry,
  peso,
  todayISO,
  addMonths,
} from '../lib/types'
import { cancelExpiredReservations, expireContracts } from '../lib/maintenance'
import { saveContractPaymentInDb } from '../lib/contract-meta'
import { SkeletonTable } from '../components/Skeleton'
import TablePagination, { DEFAULT_PAGE_SIZE } from '../components/TablePagination'

type TypeFilter = 'all' | 'products' | 'cubes'
type StatusFilter = 'all' | 'Pending' | 'Confirmed' | 'Cancelled'
type SortMode =
  | 'expiry_asc'
  | 'expiry_desc'
  | 'price_desc'
  | 'price_asc'
  | 'name_asc'
  | 'name_desc'
  | 'customer_asc'
  | 'customer_desc'
  | 'cube_asc'
  | 'cube_desc'
  | 'status_asc'
  | 'status_desc'
  | 'type_asc'
  | 'type_desc'

export default function ReservationsPage() {
  const { user } = useAuth()
  const [rows, setRows] = useState<Reservation[]>([])
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)

  // Filters & sorting
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [cubeTypeFilter, setCubeTypeFilter] = useState<'all' | 'Display' | 'Pick-up'>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortMode, setSortMode] = useState<SortMode>('expiry_asc')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  function toggleSortCol(ascMode: SortMode, descMode: SortMode) {
    setSortMode((prev) => (prev === ascMode ? descMode : ascMode))
  }

  function renderSortIndicator(ascMode: SortMode, descMode: SortMode) {
    if (sortMode === ascMode) return <span style={{ marginLeft: 4, fontSize: '0.72rem' }}>▲</span>
    if (sortMode === descMode) return <span style={{ marginLeft: 4, fontSize: '0.72rem' }}>▼</span>
    return <ArrowUpDown size={12} style={{ opacity: 0.35, marginLeft: 4, verticalAlign: 'middle', display: 'inline' }} />
  }

  async function load() {
    if (!user) return
    setLoading(true)
    await Promise.all([cancelExpiredReservations(), expireContracts()])

    const [resQuery, conQuery, cubeQuery, prodQuery, userQuery] = await Promise.all([
      supabase.from('reservations').select('*').order('expiry_time', { ascending: false }),
      supabase.from('contracts').select('*').order('contract_id', { ascending: false }),
      supabase.from('cubes').select('*'),
      supabase.from('products').select('*'),
      supabase.from('users').select('*'),
    ])
    setLoading(false)

    const cubeMap = new Map<number, Cube>()
    for (const c of (cubeQuery.data || []) as Cube[]) {
      cubeMap.set(c.cube_id, c)
    }

    const prodMap = new Map<number, Product>()
    for (const p of (prodQuery.data || []) as Product[]) {
      prodMap.set(p.product_id, {
        ...p,
        cubes: p.cube_id ? cubeMap.get(p.cube_id) || null : null,
      })
    }

    const userMap = new Map<number, { full_name: string; email?: string; phone_number?: string }>()
    for (const u of (userQuery.data || []) as any[]) {
      userMap.set(u.user_id, {
        full_name: u.full_name,
        email: u.email,
        phone_number: u.phone_number,
      })
    }

    const rawContracts = (conQuery.data || []) as Contract[]
    const reservations: Reservation[] = ((resQuery.data || []) as any[]).map((r) => {
      const prod = r.product_id ? prodMap.get(r.product_id) || null : null
      const cube = r.cube_id ? cubeMap.get(r.cube_id) || null : prod?.cubes || null
      const cust = r.customer_id ? userMap.get(r.customer_id) : undefined
      return {
        ...r,
        products: prod,
        cubes: cube,
        customer: cust,
      } as Reservation
    })

    // Sync cube reservation rows with contracts and synthesize missing Pending cube reservation entries from contracts
    for (const r of reservations) {
      if (r.cube_id && !r.product_id) {
        const matchingContract = rawContracts.find(
          (c) => c.cube_id === r.cube_id && c.renter_id === r.customer_id,
        )
        if (matchingContract) {
          ;(r as any).contract_id = matchingContract.contract_id
          if (matchingContract.status === 'Active' && r.status === 'Pending') {
            r.status = 'Confirmed'
          } else if (matchingContract.status === 'Expired' && r.status === 'Pending') {
            r.status = 'Cancelled'
          }
        }
      }
    }

    for (const c of rawContracts) {
      if (!c.cube_id || c.status !== 'Pending') continue
      const alreadyExists = reservations.some(
        (r) =>
          !r.product_id &&
          r.cube_id === c.cube_id &&
          r.customer_id === c.renter_id &&
          r.status === 'Pending',
      )
      if (!alreadyExists) {
        const createdMs = c.created_at ? new Date(c.created_at).getTime() : Date.now()
        const endD = new Date(createdMs + 4 * 60 * 60 * 1000)
        reservations.push({
          reservation_id: -Number(c.contract_id),
          product_id: null,
          cube_id: c.cube_id,
          customer_id: c.renter_id || undefined,
          expiry_time: endD.toISOString(),
          hours_valid: 4,
          status: 'Pending',
          cubes: cubeMap.get(c.cube_id) || null,
          customer: c.renter_id ? userMap.get(c.renter_id) : undefined,
          ...({ contract_id: c.contract_id, start_date: c.start_date, end_date: c.end_date } as any),
        })
      }
    }

    const visible =
      user.role === 'Customer'
        ? reservations.filter((r) => r.customer_id === user.user_id)
        : user.role === 'Renter'
          ? reservations.filter((r) => r.products?.renter_id === user.user_id || r.customer_id === user.user_id)
          : reservations

    setRows(visible)
  }

  useEffect(() => {
    void load()
  }, [user])

  if (!user) {
    return (
      <section>
        <div className="page-header">
          <div>
            <h1>My reservations</h1>
            <p className="lede">Please <Link to="/login">sign in</Link> as a Customer or Renter.</p>
          </div>
        </div>
      </section>
    )
  }

  if (!['Customer', 'Renter', 'Owner', 'Staff'].includes(user.role)) {
    return (
      <section>
        <div className="page-header">
          <div>
            <h1>Reservations</h1>
            <p className="lede">You do not have access to reservations.</p>
          </div>
        </div>
      </section>
    )
  }

  const isStaffOrOwner = user.role === 'Owner' || user.role === 'Staff'

  // Actions for Product Reservations
  async function cancelProductReservation(id: number) {
    setBusyId(id)
    const { error } = await supabase.from('reservations').update({ status: 'Cancelled' }).eq('reservation_id', id)
    setBusyId(null)
    if (error) return alert(error.message)
    void load()
  }

  async function confirmProductReservation(r: Reservation) {
    if (!r.product_id) return
    setBusyId(r.reservation_id)
    try {
      const prod = r.products
      const currentStock = Number(prod?.stock_quantity ?? 0)
      if (prod && currentStock <= 0) {
        setBusyId(null)
        return alert(`"${prod.product_name}" is already out of stock (Sold Out).`)
      }

      // 1. Mark reservation as Confirmed
      const { error: resErr } = await supabase
        .from('reservations')
        .update({ status: 'Confirmed' })
        .eq('reservation_id', r.reservation_id)
      if (resErr) throw resErr

      // 2. Record Paid & Picked-up sale transaction in public.transactions
      const prodName = prod
        ? `${prod.product_name}${prod.variant ? ` (${prod.variant})` : ''}`
        : `Product #${r.product_id}`
      const { error: txErr } = await supabase.from('transactions').insert([
        {
          product_id: r.product_id,
          product_name: prodName,
          cube_id: prod?.cube_id || r.cube_id || null,
          renter_id: prod?.renter_id || null,
          buyer_name: r.customer?.full_name || 'Reserved Customer',
          payment_status: 'Paid',
          payment_method: 'Cash',
          pickup_status: 'Picked-up',
          quantity: 1,
          listed_quantity: prod?.stock_quantity ?? 1,
          notes: `Confirmed from Customer Reservation #${r.reservation_id}`,
          processed_by: user?.user_id || null,
          updated_at: new Date().toISOString(),
        },
      ])
      if (txErr) throw txErr

      // 3. Deduct stock_quantity on public.products so Catalogue & Product Management show Sold
      if (prod && currentStock > 0) {
        await supabase
          .from('products')
          .update({ stock_quantity: Math.max(0, currentStock - 1) })
          .eq('product_id', r.product_id)
      }

      setBusyId(null)
      alert(`Customer reservation for "${prodName}" confirmed as Sold & Paid!`)
      void load()
    } catch (err) {
      setBusyId(null)
      console.error(err)
      alert(err instanceof Error ? err.message : 'Failed to confirm product reservation.')
    }
  }

  async function approveCubeReservation(r: Reservation) {
    if (!r.cube_id || !r.customer_id) return
    setBusyId(r.reservation_id)
    try {
      let activeContract: Contract | null = null
      const contractId = (r as any).contract_id || (r.reservation_id < 0 ? Math.abs(r.reservation_id) : null)
      if (contractId) {
        const { data: updatedCon, error: conErr } = await supabase
          .from('contracts')
          .update({ status: 'Active' })
          .eq('contract_id', contractId)
          .select('*')
          .single()
        if (conErr) throw conErr
        activeContract = updatedCon as Contract
      } else {
        const { data: existingPending } = await supabase
          .from('contracts')
          .select('*')
          .eq('cube_id', r.cube_id)
          .eq('renter_id', r.customer_id)
          .eq('status', 'Pending')
          .limit(1)
        if (existingPending && existingPending.length > 0) {
          const { data: updatedCon, error: conErr } = await supabase
            .from('contracts')
            .update({ status: 'Active' })
            .eq('contract_id', existingPending[0].contract_id)
            .select('*')
            .single()
          if (conErr) throw conErr
          activeContract = updatedCon as Contract
        } else {
          const start = todayISO()
          const end = addMonths(start, 1)
          const { data: insCon, error: insErr } = await supabase
            .from('contracts')
            .insert([
              {
                renter_id: r.customer_id,
                cube_id: r.cube_id,
                start_date: start,
                end_date: end,
                status: 'Active',
              },
            ])
            .select('*')
            .single()
          if (insErr) throw insErr
          activeContract = insCon as Contract
        }
      }

      if (activeContract) {
        const monthlyRate = Number(r.cubes?.price_per_month || 0)
        await saveContractPaymentInDb(activeContract, 1, 'Paid', monthlyRate, 'Cash')
      }

      if (r.reservation_id > 0) {
        await supabase.from('reservations').update({ status: 'Confirmed' }).eq('reservation_id', r.reservation_id)
      }
      await supabase
        .from('reservations')
        .update({ status: 'Confirmed' })
        .eq('cube_id', r.cube_id)
        .eq('customer_id', r.customer_id)
        .eq('status', 'Pending')

      // Mark cube as Occupied so it is removed from the Catalogue
      await supabase.from('cubes').update({ status: 'Occupied' }).eq('cube_id', r.cube_id)

      setBusyId(null)
      alert(`Cube #${r.cubes?.cube_number || r.cube_id} reservation approved, Month 1 marked Paid, and rental contract activated!`)
      void load()
    } catch (err) {
      setBusyId(null)
      console.error(err)
      alert(err instanceof Error ? err.message : 'Failed to approve cube reservation.')
    }
  }

  async function cancelCubeReservation(r: Reservation) {
    setBusyId(r.reservation_id)
    try {
      if (r.reservation_id > 0) {
        await supabase.from('reservations').update({ status: 'Cancelled' }).eq('reservation_id', r.reservation_id)
      }
      const contractId = (r as any).contract_id || (r.reservation_id < 0 ? Math.abs(r.reservation_id) : null)
      if (contractId) {
        await supabase.from('contracts').delete().eq('contract_id', contractId).eq('status', 'Pending')
      }
      if (r.cube_id && r.customer_id) {
        await supabase.from('contracts').delete().eq('cube_id', r.cube_id).eq('renter_id', r.customer_id).eq('status', 'Pending')
        await supabase
          .from('reservations')
          .update({ status: 'Cancelled' })
          .eq('cube_id', r.cube_id)
          .eq('customer_id', r.customer_id)
          .eq('status', 'Pending')
      }
      if (r.cube_id) {
        await supabase.from('cubes').update({ status: 'Available' }).eq('cube_id', r.cube_id)
      }
      setBusyId(null)
      alert('Cube reservation request cancelled and cube returned to Available.')
      void load()
    } catch (err) {
      setBusyId(null)
      console.error(err)
      alert(err instanceof Error ? err.message : 'Failed to cancel cube reservation.')
    }
  }

  // Counts for tabs
  const counts = useMemo(() => {
    const productCount = rows.filter((r) => Boolean(r.product_id)).length
    const cubeCount = rows.filter((r) => Boolean(r.cube_id) && !r.product_id).length
    const pendingCount = rows.filter((r) => r.status === 'Pending' && !isReservationExpired(r)).length
    const displayCount = rows.filter((r) => r.cubes?.type === 'Display' || r.products?.cubes?.type === 'Display').length
    const pickupCount = rows.filter((r) => r.cubes?.type === 'Pick-up' || r.products?.cubes?.type === 'Pick-up').length
    return {
      all: rows.length,
      products: productCount,
      cubes: cubeCount,
      pending: pendingCount,
      display: displayCount,
      pickup: pickupCount,
    }
  }, [rows])

  // Filtered and sorted rows
  const filteredRows = useMemo(() => {
    return rows
      .filter((r) => {
        // Type filter (Product vs Cube)
        const isCube = Boolean(r.cube_id) && !r.product_id
        const isProduct = Boolean(r.product_id)
        if (typeFilter === 'products' && !isProduct) return false
        if (typeFilter === 'cubes' && !isCube) return false

        // Cube Type filter (Display vs Pick-up)
        if (cubeTypeFilter !== 'all') {
          const cType = r.cubes?.type || r.products?.cubes?.type
          if (cType !== cubeTypeFilter) return false
        }

        // Status filter
        const expired = isReservationExpired(r)
        if (statusFilter === 'Pending') {
          if (r.status !== 'Pending' || expired) return false
        } else if (statusFilter === 'Confirmed') {
          if (r.status !== 'Confirmed') return false
        } else if (statusFilter === 'Cancelled') {
          if (r.status !== 'Cancelled' && !expired) return false
        }

        // Search query
        if (search.trim()) {
          const q = search.toLowerCase()
          const pName = r.products?.product_name?.toLowerCase() || ''
          const cNum = (r.cubes?.cube_number || r.products?.cubes?.cube_number || '').toLowerCase()
          const custName = r.customer?.full_name?.toLowerCase() || ''
          const custEmail = r.customer?.email?.toLowerCase() || ''
          const matches =
            pName.includes(q) || cNum.includes(q) || custName.includes(q) || custEmail.includes(q)
          if (!matches) return false
        }

        return true
      })
      .sort((a, b) => {
        const aExp = parseReservationExpiry(a.expiry_time).getTime()
        const bExp = parseReservationExpiry(b.expiry_time).getTime()
        const aPrice = a.products?.price || a.cubes?.price_per_month || 0
        const bPrice = b.products?.price || b.cubes?.price_per_month || 0
        const aName = a.products?.product_name || a.cubes?.cube_number || ''
        const bName = b.products?.product_name || b.cubes?.cube_number || ''
        const aCust = a.customer?.full_name || ''
        const bCust = b.customer?.full_name || ''
        const aCube = a.products?.cubes?.cube_number || a.cubes?.cube_number || ''
        const bCube = b.products?.cubes?.cube_number || b.cubes?.cube_number || ''
        const aStatus = a.status || ''
        const bStatus = b.status || ''
        const aType = a.cube_id && !a.product_id ? 'Cube' : 'Product'
        const bType = b.cube_id && !b.product_id ? 'Cube' : 'Product'

        const aPending = a.status === 'Pending' && !isReservationExpired(a) ? 0 : 1
        const bPending = b.status === 'Pending' && !isReservationExpired(b) ? 0 : 1

        if (sortMode === 'expiry_asc') {
          if (aPending !== bPending) return aPending - bPending
          return aExp - bExp
        }
        if (sortMode === 'expiry_desc') return bExp - aExp
        if (sortMode === 'price_desc') return bPrice - aPrice
        if (sortMode === 'price_asc') return aPrice - bPrice
        if (sortMode === 'name_asc') return aName.localeCompare(bName)
        if (sortMode === 'name_desc') return bName.localeCompare(aName)
        if (sortMode === 'customer_asc') return aCust.localeCompare(bCust)
        if (sortMode === 'customer_desc') return bCust.localeCompare(aCust)
        if (sortMode === 'cube_asc') return aCube.localeCompare(bCube)
        if (sortMode === 'cube_desc') return bCube.localeCompare(aCube)
        if (sortMode === 'status_asc') return aStatus.localeCompare(bStatus)
        if (sortMode === 'status_desc') return bStatus.localeCompare(aStatus)
        if (sortMode === 'type_asc') return aType.localeCompare(bType)
        if (sortMode === 'type_desc') return bType.localeCompare(aType)
        return 0
      })
  }, [rows, typeFilter, cubeTypeFilter, statusFilter, sortMode, search])

  useEffect(() => {
    setPage(1)
  }, [typeFilter, statusFilter, sortMode, search])

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(filteredRows.length / DEFAULT_PAGE_SIZE))
    if (page > totalPages) {
      setPage(totalPages)
    }
  }, [filteredRows.length, page])

  const pagedRows = useMemo(() => {
    const start = (page - 1) * DEFAULT_PAGE_SIZE
    return filteredRows.slice(start, start + DEFAULT_PAGE_SIZE)
  }, [filteredRows, page])

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>{isStaffOrOwner ? 'Cube Reservations Management' : user.role === 'Customer' ? 'My Product Reservations' : 'Reservations Hub'}</h1>
          <p className="lede">
            {user.role === 'Owner'
              ? 'Review and approve renter cube reservations and confirm customer product reservations.'
              : user.role === 'Staff'
              ? 'View and monitor incoming cube reservations and customer product reservations (View-only UI).'
              : user.role === 'Customer'
              ? 'Manage your reserved shop products before their hold timer expires.'
              : 'Review and track customer product reservations and your cube rental reservations.'}
          </p>
        </div>
        {counts.pending > 0 && isStaffOrOwner && (
          <div
            className="panel"
            style={{
              padding: '0.65rem 1.1rem',
              margin: 0,
              background: '#fef3c7',
              border: '1px solid #f59e0b',
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
            }}
          >
            <AlertTriangle size={18} color="#b45309" />
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#92400e' }}>
              {counts.pending} reservation(s) awaiting confirmation
            </span>
            <Link
              to="/contracts"
              className="btn"
              style={{
                marginLeft: 'auto',
                fontSize: '0.78rem',
                padding: '0.3rem 0.75rem',
                background: '#b45309',
                color: '#fff',
                border: 'none',
                textDecoration: 'none',
              }}
            >
              Review Contracts →
            </Link>
          </div>
        )}
      </div>

      {/* ── Type Filter Tabs (Visible to all roles) ── */}
      <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          className={typeFilter === 'all' ? 'btn' : 'btn-ghost'}
          onClick={() => { setTypeFilter('all'); setPage(1) }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.88rem' }}
        >
          <CalendarCheck size={16} /> All Reservations ({counts.all})
        </button>
        {user.role !== 'Customer' && (
          <button
            type="button"
            className={typeFilter === 'cubes' ? 'btn' : 'btn-ghost'}
            onClick={() => { setTypeFilter('cubes'); setPage(1) }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.88rem' }}
          >
            <Box size={16} /> Cube Reservations ({counts.cubes})
          </button>
        )}
        <button
          type="button"
          className={typeFilter === 'products' ? 'btn' : 'btn-ghost'}
          onClick={() => { setTypeFilter('products'); setPage(1) }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.88rem' }}
        >
          <Package size={16} /> Product Reservations ({counts.products})
        </button>
      </div>

      {/* ── Filter & Search Toolbar ── */}
      <div
        className="row no-print"
        style={{
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.25rem',
          gap: '1rem',
          flexWrap: 'wrap',
        }}
      >
        {/* Status Filter Buttons & Cube Type Pills */}
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            {(['all', 'Pending', 'Confirmed', 'Cancelled'] as StatusFilter[]).map((st) => (
              <button
                key={st}
                type="button"
                className={statusFilter === st ? 'btn' : 'btn-ghost'}
                style={{ fontSize: '0.82rem', padding: '0.4rem 0.8rem' }}
                onClick={() => { setStatusFilter(st); setPage(1) }}
              >
                {st === 'all'
                  ? 'All Status'
                  : st === 'Cancelled'
                  ? 'Cancelled / Expired'
                  : st === 'Pending' && counts.pending > 0
                  ? `Pending (${counts.pending})`
                  : st}
              </button>
            ))}
          </div>

          {/* Cube Type pills right beside status buttons for instant access */}
          <div style={{ display: 'inline-flex', gap: '0.25rem', alignItems: 'center', background: '#f1f5f9', padding: '3px 5px', borderRadius: 8 }}>
            {(['all', 'Display', 'Pick-up'] as const).map((ct) => (
              <button
                key={ct}
                type="button"
                style={{
                  fontSize: '0.78rem',
                  padding: '0.28rem 0.65rem',
                  borderRadius: 6,
                  border: 'none',
                  background: cubeTypeFilter === ct ? '#0f172a' : 'transparent',
                  color: cubeTypeFilter === ct ? '#ffffff' : '#64748b',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
                onClick={() => { setCubeTypeFilter(ct); setPage(1) }}
              >
                {ct === 'all' ? 'All' : ct}
              </button>
            ))}
          </div>
        </div>

        {/* Sort & Search Controls */}
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Sorting Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <ArrowUpDown size={15} color="#666" />
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              style={{ padding: '0.45rem 0.75rem', fontSize: '0.82rem', borderRadius: 8, height: 38 }}
            >
              <option value="expiry_asc">Expiry: Soonest First</option>
              <option value="expiry_desc">Expiry: Latest First</option>
              <option value="price_desc">Price / Rate: High to Low</option>
              <option value="price_asc">Price / Rate: Low to High</option>
              <option value="name_asc">Name: A to Z</option>
              <option value="name_desc">Name: Z to A</option>
              <option value="customer_asc">Customer: A to Z</option>
              <option value="customer_desc">Customer: Z to A</option>
            </select>
          </div>

          {/* Search Box */}
          <div style={{ position: 'relative', minWidth: 220 }}>
            <Search size={15} color="#94a3b8" style={{ position: 'absolute', left: 10, top: 11 }} />
            <input
              type="text"
              placeholder="Search product, cube, customer…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: '2.1rem', margin: 0, height: 38, fontSize: '0.82rem' }}
            />
          </div>
        </div>
      </div>

      {loading ? (
        <SkeletonTable rows={5} cols={8} />
      ) : (
        <div className="table-wrap">
          <table className="table reservations-table">
            <thead>
              <tr>
                <th style={{ width: 105, cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSortCol('type_asc', 'type_desc')}>
                  Type {renderSortIndicator('type_asc', 'type_desc')}
                </th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSortCol('name_asc', 'name_desc')}>
                  Reservation Item / Cube {renderSortIndicator('name_asc', 'name_desc')}
                </th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSortCol('customer_asc', 'customer_desc')}>
                  Customer / Renter {renderSortIndicator('customer_asc', 'customer_desc')}
                </th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSortCol('cube_asc', 'cube_desc')}>
                  Assigned Cube {renderSortIndicator('cube_asc', 'cube_desc')}
                </th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSortCol('price_asc', 'price_desc')}>
                  Price / Rate {renderSortIndicator('price_asc', 'price_desc')}
                </th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSortCol('expiry_asc', 'expiry_desc')}>
                  Validity / Expiry {renderSortIndicator('expiry_asc', 'expiry_desc')}
                </th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSortCol('status_asc', 'status_desc')}>
                  Status {renderSortIndicator('status_asc', 'status_desc')}
                </th>
                <th style={{ textAlign: 'right', minWidth: 180 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((r) => {
                const isCube = Boolean(r.cube_id) && !r.product_id
                const expired = isReservationExpired(r)
                const hoursLeft = getReservationHoursLeft(r)
                const expiryDate = parseReservationExpiry(r.expiry_time)
                const isPending = r.status === 'Pending' && !expired
                const isBusy = busyId === r.reservation_id

                return (
                  <tr key={r.reservation_id}>
                    {/* TYPE PILL */}
                    <td>
                      {isCube ? (
                        <span
                          className="badge"
                          style={{
                            background: '#ede9fe',
                            color: '#6d28d9',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            fontSize: '0.72rem',
                          }}
                        >
                          <Box size={12} /> Cube Space
                        </span>
                      ) : (
                        <span
                          className="badge info"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            fontSize: '0.72rem',
                          }}
                        >
                          <Package size={12} /> Product
                        </span>
                      )}
                    </td>

                    {/* ITEM / CUBE DETAILS */}
                    <td>
                      {isCube ? (
                        <div>
                          <strong>Cube {r.cubes?.cube_number || `#${r.cube_id}`}</strong>
                          <div style={{ marginTop: 2 }}>
                            <span
                              className={`badge ${r.cubes?.type === 'Pick-up' ? 'pickup' : 'info'}`}
                              style={{ fontSize: '0.68rem' }}
                            >
                              {r.cubes?.type || 'Standard'} Cube
                            </span>
                          </div>
                          {r.cubes?.location && (
                            <div className="muted" style={{ fontSize: '0.75rem', marginTop: 2 }}>
                              Location: {r.cubes.location}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div>
                          <strong>{r.products?.product_name || `Product #${r.product_id}`}</strong>
                          {r.products?.variant && (
                            <div className="muted" style={{ fontSize: '0.75rem' }}>
                              Variant: {r.products.variant}
                            </div>
                          )}
                          {r.products?.category && (
                            <span
                              className="badge info"
                              style={{ fontSize: '0.68rem', marginTop: '0.2rem' }}
                            >
                              {r.products.category}
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* CUSTOMER / RENTER INFO */}
                    <td>
                      <div style={{ fontWeight: 600 }}>{r.customer?.full_name || '—'}</div>
                      {r.customer?.email && (
                        <div className="muted" style={{ fontSize: '0.76rem' }}>
                          {r.customer.email}
                        </div>
                      )}
                      {r.customer?.phone_number && (
                        <div className="muted" style={{ fontSize: '0.76rem' }}>
                          {r.customer.phone_number}
                        </div>
                      )}
                    </td>

                    {/* ASSIGNED CUBE */}
                    <td>
                      {isCube ? (
                        <span>— (Direct Cube)</span>
                      ) : (
                        <div>
                          <strong>{r.products?.cubes?.cube_number || r.cubes?.cube_number || '—'}</strong>
                          {r.products?.cubes?.type && (
                            <div className="muted" style={{ fontSize: '0.75rem' }}>
                              {r.products.cubes.type}
                            </div>
                          )}
                        </div>
                      )}
                    </td>

                    {/* PRICE / MONTHLY RATE */}
                    <td>
                      {isCube ? (
                        <div>
                          <strong>{r.cubes?.price_per_month ? peso(r.cubes.price_per_month) : '—'}</strong>
                          <span className="muted" style={{ fontSize: '0.72rem' }}> / mo</span>
                        </div>
                      ) : (
                        <div>
                          <strong>{r.products ? peso(r.products.price) : '—'}</strong>
                        </div>
                      )}
                    </td>

                    {/* VALIDITY / EXPIRY */}
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <Clock size={13} color="#64748b" />
                        <span>{expiryDate.toLocaleString('en-PH')}</span>
                      </div>
                      <div className="muted" style={{ fontSize: '0.75rem', marginTop: 2 }}>
                        {expired ? (
                          <span style={{ color: '#dc2626', fontWeight: 600 }}>(Expired)</span>
                        ) : (
                          <span>
                            {hoursLeft > 24 ? `${Math.ceil(hoursLeft / 24)}d left` : `${hoursLeft}h left`} ({r.hours_valid ? `${r.hours_valid}h limit` : '1h limit'})
                          </span>
                        )}
                      </div>
                    </td>

                    {/* STATUS BADGE */}
                    <td>
                      <span
                        className={`badge ${
                          r.status === 'Cancelled' || expired
                            ? 'bad'
                            : r.status === 'Confirmed'
                              ? 'ok'
                              : 'warn'
                        }`}
                        style={{ fontSize: '0.75rem' }}
                      >
                        {expired
                          ? 'Expired'
                          : r.status === 'Pending'
                            ? isCube
                              ? 'Pending Approval'
                              : 'Reserved (Pending Claim)'
                            : r.status === 'Confirmed' && !isCube
                              ? 'Sold / Claimed'
                              : r.status}
                      </span>
                    </td>

                    {/* ACTIONS */}
                    <td style={{ textAlign: 'right' }}>
                      <div className="row" style={{ justifyContent: 'flex-end', gap: '0.4rem' }}>
                        {user.role === 'Owner' ? (
                          isCube && isPending ? (
                            <>
                              <button
                                className="btn"
                                type="button"
                                disabled={isBusy}
                                onClick={() => void approveCubeReservation(r)}
                                style={{
                                  padding: '0.35rem 0.65rem',
                                  fontSize: '0.78rem',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.3rem',
                                  background: '#16a34a',
                                  color: '#fff',
                                  border: 'none',
                                }}
                                title="Approve cube reservation & activate contract"
                              >
                                <CheckCircle2 size={14} /> Approve
                              </button>
                              <button
                                className="btn-ghost"
                                type="button"
                                disabled={isBusy}
                                onClick={() => void cancelCubeReservation(r)}
                                style={{
                                  padding: '0.35rem 0.65rem',
                                  fontSize: '0.78rem',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.3rem',
                                  color: '#dc2626',
                                }}
                                title="Decline cube reservation & release cube"
                              >
                                <X size={14} /> Decline
                              </button>
                            </>
                          ) : !isCube && isPending ? (
                            <>
                              <button
                                className="btn"
                                type="button"
                                disabled={isBusy}
                                onClick={() => void confirmProductReservation(r)}
                                style={{
                                  padding: '0.35rem 0.65rem',
                                  fontSize: '0.78rem',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.3rem',
                                  background: '#16a34a',
                                  color: '#fff',
                                  border: 'none',
                                }}
                                title="Confirm customer paid and claimed product"
                              >
                                <CheckCircle2 size={14} /> Confirm Sold
                              </button>
                              <button
                                className="btn-ghost"
                                type="button"
                                disabled={isBusy}
                                onClick={() => void cancelProductReservation(r.reservation_id)}
                                style={{
                                  padding: '0.35rem 0.65rem',
                                  fontSize: '0.78rem',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.3rem',
                                  color: '#dc2626',
                                }}
                                title="Cancel product reservation & return to Available"
                              >
                                <X size={14} /> Cancel
                              </button>
                            </>
                          ) : (
                            <span className="muted" style={{ fontSize: '0.78rem' }}>
                              {r.status === 'Confirmed' ? (isCube ? 'Approved' : 'Sold / Claimed') : '—'}
                            </span>
                          )
                        ) : user.role === 'Staff' ? (
                          <span
                            className="badge"
                            style={{
                              background: '#f1f5f9',
                              color: '#64748b',
                              fontSize: '0.72rem',
                              fontWeight: 600,
                              padding: '0.25rem 0.55rem',
                              border: '1px solid #e2e8f0',
                            }}
                            title="Staff account is in monitoring / view-only mode"
                          >
                            View Only
                          </span>
                        ) : isCube ? (
                          isPending ? (
                            <button
                              className="btn-ghost"
                              type="button"
                              disabled={isBusy}
                              onClick={() => void cancelCubeReservation(r)}
                              style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem' }}
                            >
                              Cancel Request
                            </button>
                          ) : (
                            <span className="muted" style={{ fontSize: '0.78rem' }}>—</span>
                          )
                        ) : user.role === 'Customer' && isPending ? (
                          <button
                            className="btn-ghost"
                            type="button"
                            disabled={isBusy}
                            onClick={() => void cancelProductReservation(r.reservation_id)}
                            style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem' }}
                          >
                            Cancel
                          </button>
                        ) : (
                          <span className="muted" style={{ fontSize: '0.78rem' }}>—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <TablePagination page={page} totalItems={filteredRows.length} onPageChange={setPage} />
        </div>
      )}

      {!loading && filteredRows.length === 0 && (
        <div className="empty" style={{ marginTop: '1rem', padding: '2.5rem', textAlign: 'center' }}>
          No {typeFilter === 'all' ? '' : typeFilter === 'products' ? 'product ' : 'cube '}
          reservations found matching the selected criteria.
        </div>
      )}
    </section>
  )
}
