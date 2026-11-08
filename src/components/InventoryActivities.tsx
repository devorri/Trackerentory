import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, PackageCheck, PackagePlus, PackageMinus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { peso, todayISO, type StockMovement } from '../lib/types'
import { SkeletonTable } from './Skeleton'
import TablePagination, { DEFAULT_PAGE_SIZE } from './TablePagination'

type Period = 'daily' | 'monthly' | 'yearly' | 'custom'
type MovementView = 'Stock In' | 'Stock Out'

type Props = {
  /** When set, only this renter's products are shown (renter dashboard). */
  renterId?: number
  /** Total number of active products in scope (shown in the first card). */
  totalProducts: number
  /** Search text and category filter shared with the products toolbar. */
  search: string
  category: string
}

function localDate(iso: string) {
  return new Date(`${iso}T00:00:00`)
}

/** Returns [from, to) for the chosen period, in the visitor's local time. */
function periodRange(period: Period, day: string, month: string, year: string, from: string, to: string): [Date, Date] {
  if (period === 'daily') {
    const start = localDate(day || todayISO())
    const end = new Date(start)
    end.setDate(end.getDate() + 1)
    return [start, end]
  }
  if (period === 'monthly') {
    const [y, m] = (month || todayISO().slice(0, 7)).split('-').map(Number)
    return [new Date(y, m - 1, 1), new Date(y, m, 1)]
  }
  if (period === 'yearly') {
    const y = Number(year) || new Date().getFullYear()
    return [new Date(y, 0, 1), new Date(y + 1, 0, 1)]
  }
  const start = localDate(from || todayISO())
  const end = localDate(to || from || todayISO())
  end.setDate(end.getDate() + 1)
  return start <= end ? [start, end] : [end, start]
}

function formatDateTime(iso: string) {
  const d = new Date(iso)
  return {
    date: d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: '2-digit' }),
    time: d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }),
  }
}

export default function InventoryActivities({ renterId, totalProducts, search, category }: Props) {
  const [movements, setMovements] = useState<(StockMovement & { products?: any })[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [view, setView] = useState<MovementView>('Stock In')
  const [period, setPeriod] = useState<Period>('daily')
  const [day, setDay] = useState(todayISO())
  const [month, setMonth] = useState(todayISO().slice(0, 7))
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [from, setFrom] = useState(todayISO())
  const [to, setTo] = useState(todayISO())
  const [page, setPage] = useState(1)

  const [rangeStart, rangeEnd] = useMemo(
    () => periodRange(period, day, month, year, from, to),
    [period, day, month, year, from, to],
  )

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setLoadError(null)
      let q = supabase
        .from('stock_movements')
        .select(
          '*, products(product_name, variant, image_url, image_urls, stock_quantity, category, deleted_at), cubes(cube_number, type), renter:users!renter_id(user_id, full_name, username)',
        )
        .gte('created_at', rangeStart.toISOString())
        .lt('created_at', rangeEnd.toISOString())
        .order('created_at', { ascending: false })
      if (renterId) q = q.eq('renter_id', renterId)
      const { data, error } = await q
      if (cancelled) return
      setLoading(false)
      if (error) {
        setMovements([])
        setLoadError(
          /stock_movements/i.test(error.message)
            ? 'Inventory activity log is not set up yet. Run supabase/migrations/018_payments_agreement_inventory.sql in the Supabase SQL Editor.'
            : error.message,
        )
        return
      }
      setMovements((data || []) as any)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [renterId, rangeStart, rangeEnd])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return movements.filter((m) => {
      const cat = (m.products?.category || '').trim()
      if (category !== 'All') {
        if (category === 'Uncategorized' ? cat !== '' : cat !== category) return false
      }
      if (!q) return true
      return [m.product_name, m.variant, cat, m.cubes?.cube_number, m.renter?.full_name, m.renter?.username]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    })
  }, [movements, search, category])

  const totalIn = filtered.filter((m) => m.movement_type === 'Stock In').reduce((s, m) => s + m.quantity, 0)
  const totalOut = filtered.filter((m) => m.movement_type === 'Stock Out').reduce((s, m) => s + m.quantity, 0)
  const rows = filtered.filter((m) => m.movement_type === view)

  useEffect(() => setPage(1), [view, period, day, month, year, from, to, search, category])
  const paged = rows.slice((page - 1) * DEFAULT_PAGE_SIZE, page * DEFAULT_PAGE_SIZE)

  const isIn = view === 'Stock In'
  const periodBtn = (p: Period, label: string) => (
    <button
      key={p}
      type="button"
      className={period === p ? 'btn' : 'btn-ghost'}
      style={{ fontSize: '0.82rem', padding: '0.4rem 1rem', borderRadius: 999 }}
      onClick={() => setPeriod(p)}
    >
      {label}
    </button>
  )

  const cardStyle = { padding: '1rem 1.15rem', display: 'flex', alignItems: 'center', gap: '0.85rem' } as const
  const years = Array.from({ length: 6 }, (_, i) => String(new Date().getFullYear() - i))

  return (
    <div>
      {/* Summary cards + stock in/out selector */}
      <div
        className="grid"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.25rem', alignItems: 'stretch' }}
      >
        <div className="panel" style={cardStyle}>
          <PackageCheck size={26} color="#0f172a" />
          <div>
            <div className="muted" style={{ fontSize: '0.76rem', fontWeight: 700, textTransform: 'uppercase' }}>Total Products</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800 }}>{totalProducts}</div>
          </div>
        </div>
        <div className="panel" style={{ ...cardStyle, borderLeft: '4px solid #16a34a' }}>
          <PackagePlus size={26} color="#16a34a" />
          <div>
            <div className="muted" style={{ fontSize: '0.76rem', fontWeight: 700, textTransform: 'uppercase' }}>Total Stock In</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#16a34a' }}>{totalIn}</div>
          </div>
        </div>
        <div className="panel" style={{ ...cardStyle, borderLeft: '4px solid #dc2626' }}>
          <PackageMinus size={26} color="#dc2626" />
          <div>
            <div className="muted" style={{ fontSize: '0.76rem', fontWeight: 700, textTransform: 'uppercase' }}>Total Stock Out</div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#dc2626' }}>{totalOut}</div>
          </div>
        </div>
        <div className="panel" style={{ ...cardStyle, flexDirection: 'column', alignItems: 'stretch', justifyContent: 'center', gap: 6 }}>
          <label className="muted" style={{ fontSize: '0.76rem', fontWeight: 700, textTransform: 'uppercase', margin: 0 }}>Show</label>
          <select value={view} onChange={(e) => setView(e.target.value as MovementView)} style={{ margin: 0 }}>
            <option value="Stock In">Stock In</option>
            <option value="Stock Out">Stock Out</option>
          </select>
        </div>
      </div>

      {/* Period filter */}
      <div className="panel" style={{ padding: '0.9rem 1rem', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
          {periodBtn('daily', 'Daily')}
          {periodBtn('monthly', 'Monthly')}
          {periodBtn('yearly', 'Yearly')}
          {periodBtn('custom', 'Custom')}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          <CalendarDays size={18} className="muted" />
          {period === 'daily' && (
            <input type="date" value={day} onChange={(e) => setDay(e.target.value)} style={{ margin: 0, maxWidth: 200 }} />
          )}
          {period === 'monthly' && (
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ margin: 0, maxWidth: 200 }} />
          )}
          {period === 'yearly' && (
            <select value={year} onChange={(e) => setYear(e.target.value)} style={{ margin: 0, maxWidth: 160 }}>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          )}
          {period === 'custom' && (
            <>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ margin: 0, maxWidth: 180 }} />
              <span className="muted">to</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ margin: 0, maxWidth: 180 }} />
            </>
          )}
          <span className="muted" style={{ fontSize: '0.8rem' }}>
            {rangeStart.toLocaleDateString('en-PH')} – {new Date(rangeEnd.getTime() - 1).toLocaleDateString('en-PH')}
          </span>
        </div>
      </div>

      <h3 style={{ margin: '0 0 0.75rem', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className={`badge ${isIn ? 'ok' : 'bad'}`}>{view}</span>
        <span className="muted" style={{ fontSize: '0.85rem', fontWeight: 500 }}>
          {rows.length} record(s)
        </span>
      </h3>

      {loading ? (
        <SkeletonTable rows={5} cols={9} />
      ) : loadError ? (
        <div className="alert" style={{ background: '#fef3c7', color: '#92400e' }}>{loadError}</div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th style={{ width: 64 }}>Image</th>
                <th>Product Name</th>
                {!renterId && <th>Renter</th>}
                <th>Cube</th>
                <th>Price</th>
                <th>Variant / Details</th>
                <th title={isIn ? 'Stock on hand before this stock in' : 'Stock left after this stock out'}>Remaining</th>
                <th>{isIn ? 'Qty. In' : 'Qty. Out'}</th>
                <th title={isIn ? 'Stock on hand after this stock in' : 'Stock on hand before this stock out'}>Total Product Qty</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((m) => {
                const dt = formatDateTime(m.created_at)
                const img = m.image_url || m.products?.image_url || m.products?.image_urls?.[0] || null
                const remaining = isIn ? m.previous_quantity : m.new_quantity
                const total = isIn ? m.new_quantity : m.previous_quantity
                return (
                  <tr key={m.movement_id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{dt.date}</div>
                      <div className="muted" style={{ fontSize: '0.75rem' }}>{dt.time}</div>
                    </td>
                    <td>
                      {img ? (
                        <img src={img} alt={m.product_name} style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6, border: '1px solid #e2e8f0' }} />
                      ) : (
                        <div style={{ width: 44, height: 44, borderRadius: 6, background: '#f1f5f9' }} />
                      )}
                    </td>
                    <td>
                      <strong>{m.product_name}</strong>
                      {m.products?.deleted_at && <div className="muted" style={{ fontSize: '0.72rem' }}>In trash</div>}
                    </td>
                    {!renterId && <td>{m.renter?.full_name || '—'}</td>}
                    <td>{m.cubes ? `${m.cubes.cube_number} (${m.cubes.type})` : '—'}</td>
                    <td>{peso(m.unit_price)}</td>
                    <td style={{ fontSize: '0.84rem' }}>{m.variant || '—'}</td>
                    <td>{remaining}</td>
                    <td>
                      <strong style={{ color: isIn ? '#16a34a' : '#dc2626' }}>
                        {isIn ? '+' : '−'}
                        {m.quantity}
                      </strong>
                    </td>
                    <td>
                      <strong>{total}</strong>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <TablePagination page={page} totalItems={rows.length} onPageChange={setPage} />
          {rows.length === 0 && (
            <div className="empty" style={{ padding: '2rem' }}>
              No {view.toLowerCase()} activity for the selected period.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
