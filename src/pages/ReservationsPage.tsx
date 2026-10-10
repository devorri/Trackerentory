import { useEffect, useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Package,
  Box,
  CalendarCheck,
  Search,
  CheckCircle2,
  XCircle,
  FileText,
  Clock,
  ArrowUpDown,
  AlertTriangle,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/Auth'
import {
  type Reservation,
  isReservationExpired,
  getReservationHoursLeft,
  parseReservationExpiry,
  peso,
  todayISO,
  addMonths,
} from '../lib/types'
import { cancelExpiredReservations } from '../lib/maintenance'
import { SkeletonTable } from '../components/Skeleton'

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
  const nav = useNavigate()
  const [rows, setRows] = useState<Reservation[]>([])
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)

  // Filters & sorting
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortMode, setSortMode] = useState<SortMode>('expiry_asc')
  const [search, setSearch] = useState('')

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
    await cancelExpiredReservations()
    const { data, error } = await supabase
      .from('reservations')
      .select('*, products(*, cubes(*)), cubes(*), customer:users!customer_id(full_name, email, phone_number)')
      .order('expiry_time', { ascending: false })
    setLoading(false)
    if (error) {
      console.error(error)
    } else {
      const reservations = (data || []) as Reservation[]
      const visible =
        user.role === 'Customer'
          ? reservations.filter((r) => r.customer_id === user.user_id)
          : user.role === 'Renter'
            ? reservations.filter((r) => r.products?.renter_id === user.user_id || r.customer_id === user.user_id)
            : reservations
      setRows(visible)
    }
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
    setBusyId(r.reservation_id)
    const { error: resErr } = await supabase.from('reservations').update({ status: 'Confirmed' }).eq('reservation_id', r.reservation_id)
    if (resErr) {
      setBusyId(null)
      return alert('Failed to confirm: ' + resErr.message)
    }

    // Automatically record sale in transactions so it reflects in Owner and Renter sales
    if (r.product_id) {
      const prodName = r.products
        ? `${r.products.product_name}${r.products.variant ? ` (${r.products.variant})` : ''}`
        : 'Product'

      const { error: txErr } = await supabase.from('transactions').insert([
        {
          product_id: r.product_id,
          product_name: prodName,
          cube_id: r.products?.cube_id || r.cube_id || null,
          renter_id: r.products?.renter_id || null,
          buyer_name: r.customer?.full_name || 'Customer',
          payment_status: 'Paid',
          payment_method: 'Cash',
          pickup_status: 'Picked-up',
          quantity: 1,
          listed_quantity: r.products?.stock_quantity ?? null,
          transaction_date: new Date().toISOString(),
          processed_by: user?.user_id || null,
          updated_at: new Date().toISOString(),
        },
      ])

      if (txErr) {
        console.error('Transaction insert error:', txErr)
      }

      if (r.products && r.products.stock_quantity > 0) {
        await supabase
          .from('products')
          .update({ stock_quantity: Math.max(0, r.products.stock_quantity - 1) })
          .eq('product_id', r.product_id)
      }
    }

    setBusyId(null)
    alert('Product reservation confirmed and payment recorded in Sales!')
    void load()
  }

  // Actions for Cube Reservations (Contracts)
  async function approveCubeReservation(r: Reservation) {
    if (!r.cube_id) return
    setBusyId(r.reservation_id)

    // 1. Mark reservation Confirmed
    const { error: resErr } = await supabase
      .from('reservations')
      .update({ status: 'Confirmed' })
      .eq('reservation_id', r.reservation_id)

    if (resErr) {
      setBusyId(null)
      return alert('Failed to confirm cube reservation: ' + resErr.message)
    }

    // 2. Ensure contract is Active
    const { data: existingContracts } = await supabase
      .from('contracts')
      .select('*')
      .eq('cube_id', r.cube_id)
      .eq('renter_id', r.customer_id)

    const pendingContract = existingContracts?.find((c) => c.status === 'Pending')
    if (pendingContract) {
      await supabase.from('contracts').update({ status: 'Active' }).eq('contract_id', pendingContract.contract_id)
    } else if (!existingContracts || existingContracts.length === 0) {
      const start = todayISO()
      const months = Math.max(1, Math.round((r.hours_valid || 720) / 720))
      const end = addMonths(start, months)
      await supabase.from('contracts').insert([
        {
          renter_id: r.customer_id,
          cube_id: r.cube_id,
          start_date: start,
          end_date: end,
          status: 'Active',
          contract_text: null,
        },
      ])
    }

    // 3. Mark cube as Occupied
    await supabase.from('cubes').update({ status: 'Occupied' }).eq('cube_id', r.cube_id)

    setBusyId(null)
    alert(`Cube ${r.cubes?.cube_number || r.cube_id} reservation approved and contract activated!`)
    void load()
  }

  async function cancelCubeReservation(r: Reservation) {
    if (!confirm(`Are you sure you want to cancel reservation for Cube ${r.cubes?.cube_number || r.cube_id}?`)) {
      return
    }
    setBusyId(r.reservation_id)

    // Cancel reservation
    await supabase.from('reservations').update({ status: 'Cancelled' }).eq('reservation_id', r.reservation_id)

    // Delete or cancel any pending contract for this cube & renter
    if (r.cube_id) {
      if (r.customer_id) {
        await supabase
          .from('contracts')
          .delete()
          .eq('cube_id', r.cube_id)
          .eq('renter_id', r.customer_id)
          .eq('status', 'Pending')
      }
      // Set cube back to Available
      await supabase.from('cubes').update({ status: 'Available' }).eq('cube_id', r.cube_id)
    }

    setBusyId(null)
    alert('Cube reservation cancelled. Cube is now Available again.')
    void load()
  }

  // Counts for tabs
  const counts = useMemo(() => {
    const productCount = rows.filter((r) => Boolean(r.product_id)).length
    const cubeCount = rows.filter((r) => Boolean(r.cube_id) && !r.product_id).length
    const pendingCount = rows.filter((r) => r.status === 'Pending' && !isReservationExpired(r)).length
    return { all: rows.length, products: productCount, cubes: cubeCount, pending: pendingCount }
  }, [rows])

  // Filtered and sorted rows
  const filteredRows = useMemo(() => {
    return rows
      .filter((r) => {
        // Type filter
        const isCube = Boolean(r.cube_id) && !r.product_id
        const isProduct = Boolean(r.product_id)
        if (typeFilter === 'products' && !isProduct) return false
        if (typeFilter === 'cubes' && !isCube) return false

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
          const cNum = r.cubes?.cube_number?.toLowerCase() || ''
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

        if (sortMode === 'expiry_asc') return aExp - bExp
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
  }, [rows, typeFilter, statusFilter, sortMode, search])

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>{user.role === 'Customer' ? 'My Reservations' : 'Reservations Hub'}</h1>
          <p className="lede">
            {user.role === 'Customer'
              ? 'Manage your reserved shop products and cube rental reservations before they expire.'
              : 'Review and confirm product customer reservations, or approve cube rental reservations for contracts.'}
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
              {counts.pending} reservation(s) awaiting approval
            </span>
          </div>
        )}
      </div>

      {/* ── Type Filter Tabs (Separating Products vs Cubes) ── */}
      <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          className={typeFilter === 'all' ? 'btn' : 'btn-ghost'}
          onClick={() => setTypeFilter('all')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.88rem' }}
        >
          <CalendarCheck size={16} /> All Reservations ({counts.all})
        </button>
        <button
          type="button"
          className={typeFilter === 'products' ? 'btn' : 'btn-ghost'}
          onClick={() => setTypeFilter('products')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.88rem' }}
        >
          <Package size={16} /> Product Reservations ({counts.products})
        </button>
        <button
          type="button"
          className={typeFilter === 'cubes' ? 'btn' : 'btn-ghost'}
          onClick={() => setTypeFilter('cubes')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.88rem' }}
        >
          <Box size={16} /> Cube Reservations ({counts.cubes})
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
        {/* Status Filter Buttons */}
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          {(['all', 'Pending', 'Confirmed', 'Cancelled'] as StatusFilter[]).map((st) => (
            <button
              key={st}
              type="button"
              className={statusFilter === st ? 'btn' : 'btn-ghost'}
              style={{ fontSize: '0.82rem', padding: '0.4rem 0.8rem' }}
              onClick={() => setStatusFilter(st)}
            >
              {st === 'all' ? 'All Status' : st === 'Cancelled' ? 'Cancelled / Expired' : st}
            </button>
          ))}
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
        <SkeletonTable rows={5} cols={7} />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 120, cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSortCol('type_asc', 'type_desc')}>
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
                <th style={{ textAlign: 'right', minWidth: 160 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r) => {
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
                            {hoursLeft > 24 ? `${Math.ceil(hoursLeft / 24)}d left` : `${hoursLeft}h left`} ({r.hours_valid ? `${r.hours_valid}h` : '1h'})
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
                        {expired ? 'Expired' : r.status === 'Pending' ? 'Pending Approval' : r.status}
                      </span>
                    </td>

                    {/* ACTIONS */}
                    <td style={{ textAlign: 'right' }}>
                      <div className="row" style={{ justifyContent: 'flex-end', gap: '0.4rem' }}>
                        {/* ── CUBE RESERVATION ACTIONS (CONTRACTS) ── */}
                        {isCube ? (
                          <>
                            {isStaffOrOwner && isPending && (
                              <>
                                <button
                                  className="btn"
                                  type="button"
                                  disabled={isBusy}
                                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                                  onClick={() => void approveCubeReservation(r)}
                                  title="Approve reservation and activate rental contract"
                                >
                                  <CheckCircle2 size={14} /> Approve Contract
                                </button>
                                <button
                                  className="btn-ghost"
                                  type="button"
                                  disabled={isBusy}
                                  style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem', color: '#dc2626' }}
                                  onClick={() => void cancelCubeReservation(r)}
                                  title="Cancel reservation and free up cube"
                                >
                                  <XCircle size={14} /> Reject
                                </button>
                              </>
                            )}

                            {isStaffOrOwner && r.status === 'Confirmed' && (
                              <button
                                className="btn-ghost"
                                type="button"
                                style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                                onClick={() => nav('/contracts')}
                              >
                                <FileText size={14} /> View in Contracts
                              </button>
                            )}

                            {!isStaffOrOwner && isPending && (
                              <button
                                className="btn-ghost"
                                type="button"
                                disabled={isBusy}
                                onClick={() => void cancelCubeReservation(r)}
                                style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem' }}
                              >
                                Cancel Request
                              </button>
                            )}
                          </>
                        ) : (
                          /* ── PRODUCT RESERVATION ACTIONS (CASHIER / STORE CLAIM) ── */
                          <>
                            {/* Customer Cancel action */}
                            {user.role === 'Customer' && isPending && (
                              <button
                                className="btn-ghost"
                                type="button"
                                disabled={isBusy}
                                onClick={() => void cancelProductReservation(r.reservation_id)}
                                style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem' }}
                              >
                                Cancel
                              </button>
                            )}

                            {/* Staff / Owner Actions */}
                            {isStaffOrOwner && isPending && (
                              <>
                                <button
                                  className="btn"
                                  type="button"
                                  disabled={isBusy}
                                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                                  onClick={() => void confirmProductReservation(r)}
                                >
                                  Confirm
                                </button>
                                <button
                                  className="btn-ghost"
                                  type="button"
                                  disabled={isBusy}
                                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                                  onClick={() => nav(`/pickup?claimId=${r.reservation_id}`)}
                                >
                                  Claim & Pay
                                </button>
                              </>
                            )}

                            {isStaffOrOwner && r.status === 'Confirmed' && (
                              <button
                                className="btn-ghost"
                                type="button"
                                style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                                onClick={() => nav(`/pickup?claimId=${r.reservation_id}`)}
                              >
                                Process in Cashier
                              </button>
                            )}
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
