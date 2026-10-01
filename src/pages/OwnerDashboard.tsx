import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/Auth'
import { peso, type Contract, type Transaction, type Product } from '../lib/types'
import { SkeletonStat, SkeletonTable } from '../components/Skeleton'

type ReportType = 'display' | 'pickup' | 'rental'

export default function OwnerDashboard() {
  const { user } = useAuth()
  const [contracts, setContracts] = useState<Contract[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [renters, setRenters] = useState<{ user_id: number; full_name: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7))

  // Print Dialog State
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false)
  const [printReportType, setPrintReportType] = useState<ReportType>('display')
  const [printMonth, setPrintMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [printRenterId, setPrintRenterId] = useState<string>('all')

  useEffect(() => {
    setLoading(true)
    void Promise.all([
      supabase.from('contracts').select('*, cubes(*), users!renter_id(user_id, full_name)'),
      supabase.from('transactions').select('*, products(*, cubes(cube_number, type)), cubes(cube_number, type), users!processed_by(full_name, role)'),
      supabase.from('users').select('user_id, full_name').eq('role', 'Renter').order('full_name'),
    ]).then(([c, t, r]) => {
      setLoading(false)
      if (!c.error) setContracts((c.data || []) as Contract[])
      if (!t.error) setTransactions((t.data || []) as Transaction[])
      if (!r.error) setRenters((r.data || []) as { user_id: number; full_name: string }[])
    })
  }, [])

  // Map of renter_id to full_name from contracts
  const renterMap = useMemo(() => {
    const map = new Map<number, string>()
    renters.forEach((r) => map.set(r.user_id, r.full_name))
    contracts.forEach((c) => {
      if (c.renter_id && c.users?.full_name) {
        map.set(c.renter_id, c.users.full_name)
      }
    })
    return map
  }, [renters, contracts])

  // Map of cube_id to active renter
  const cubeRenterMap = useMemo(() => {
    const map = new Map<number, { renter_id: number; name: string }>()
    contracts.forEach((c) => {
      if (c.cube_id && c.renter_id) {
        const name = c.users?.full_name || renterMap.get(c.renter_id) || `User #${c.renter_id}`
        map.set(c.cube_id, { renter_id: c.renter_id, name })
      }
    })
    return map
  }, [contracts, renterMap])

  const rentalSales = useMemo(() => {
    return contracts
      .filter((c) => c.status === 'Active' || c.status === 'Pending')
      .map((c) => ({
        renter_id: c.renter_id,
        renter: c.users?.full_name || (c.renter_id ? renterMap.get(c.renter_id) : null) || `User #${c.renter_id}`,
        cube: c.cubes?.cube_number,
        type: c.cubes?.type,
        monthly: Number(c.cubes?.price_per_month || 0),
        period: `${c.start_date} → ${c.end_date}`,
      }))
  }, [contracts, renterMap])

  const rentalTotal = rentalSales.reduce((s, r) => s + r.monthly, 0)

  const monthTx = useMemo(() => {
    return transactions.filter((t) => String(t.transaction_date || '').startsWith(month))
  }, [transactions, month])

  const byType = useMemo(() => {
    let display = 0
    let pickup = 0
    for (const t of monthTx) {
      if (t.payment_status !== 'Paid') continue
      const amount = Number(t.products?.price || 0) * Number(t.quantity || 1)
      const type = t.products?.cubes?.type || t.cubes?.type
      if (type === 'Display') display += amount
      else if (type === 'Pick-up') pickup += amount
    }
    return { display, pickup, total: display + pickup }
  }, [monthTx])

  // Helper to resolve transaction renter
  const getTxRenter = (t: Transaction) => {
    const p = t.products as (Product & { cubes?: { cube_number?: string; type?: string } | null; renter_id?: number | null; cube_id?: number | null }) | null
    if (t.renter_id && renterMap.has(t.renter_id)) {
      return { id: t.renter_id, name: renterMap.get(t.renter_id)! }
    }
    if (p?.renter_id && renterMap.has(p.renter_id)) {
      return { id: p.renter_id, name: renterMap.get(p.renter_id)! }
    }
    if (p?.cube_id && cubeRenterMap.has(p.cube_id)) {
      const cr = cubeRenterMap.get(p.cube_id)!
      return { id: cr.renter_id, name: cr.name }
    }
    return { id: null, name: 'Unknown Renter' }
  }

  // Filtered transactions for the printable report
  const printFilteredData = useMemo(() => {
    if (printReportType === 'rental') {
      let filtered = rentalSales
      if (printRenterId !== 'all') {
        const rid = Number(printRenterId)
        filtered = filtered.filter((r) => r.renter_id === rid)
      }
      const total = filtered.reduce((acc, curr) => acc + curr.monthly, 0)
      return { list: filtered, total }
    }

    // Display or Pick-up report
    const targetType = printReportType === 'display' ? 'Display' : 'Pick-up'
    let list = transactions.filter((t) => {
      const dateMatch = String(t.transaction_date || '').startsWith(printMonth)
      const typeMatch = (t.products?.cubes?.type || t.cubes?.type) === targetType
      return dateMatch && typeMatch
    })

    if (printRenterId !== 'all') {
      const rid = Number(printRenterId)
      list = list.filter((t) => {
        const r = getTxRenter(t)
        return r.id === rid
      })
    }

    const total = list.reduce((acc, t) => {
      if (t.payment_status === 'Paid') {
        return acc + Number(t.products?.price || 0) * Number(t.quantity || 1)
      }
      return acc
    }, 0)

    return { list, total }
  }, [transactions, rentalSales, printReportType, printMonth, printRenterId])

  function handleTriggerPrint() {
    setIsPrintModalOpen(false)
    // Small timeout to allow modal state to close before triggering browser print
    setTimeout(() => {
      window.print()
    }, 150)
  }

  if (!user || user.role !== 'Owner') {
    return (
      <section>
        <div className="page-header">
          <div>
            <h1>Owner sales</h1>
            <p className="lede">Owner only. <Link to="/login">Sign in</Link></p>
          </div>
        </div>
      </section>
    )
  }

  const selectedRenterName = printRenterId === 'all'
    ? 'All Renters'
    : (renters.find((r) => r.user_id === Number(printRenterId))?.full_name || 'Selected Renter')

  const monthLabel = new Date(`${printMonth}-01`).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })

  return (
    <section>
      {/* ════════════ ON-SCREEN DASHBOARD VIEW ════════════ */}
      <div className="no-print">
        <div className="page-header">
          <div>
            <h1>Owner sales & reports</h1>
            <p className="lede">Monthly rental income and Display / Pick-up product sales before releasing payouts to renters.</p>
          </div>
          <div className="row">
            <button className="btn" type="button" onClick={() => setIsPrintModalOpen(true)}>
              🖨️ Print report
            </button>
          </div>
        </div>

        <div className="field" style={{ maxWidth: 220 }}>
          <label>Product sales month</label>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>

        {loading ? (
          <>
            <div className="stat-grid">
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonStat key={i} />
              ))}
            </div>
            <SkeletonTable rows={4} cols={5} />
          </>
        ) : (
          <>
            <div className="stat-grid">
              <div className="stat">
                <div className="label">Monthly rental</div>
                <div className="value">{peso(rentalTotal)}</div>
              </div>
              <div className="stat">
                <div className="label">Display sales</div>
                <div className="value">{peso(byType.display)}</div>
              </div>
              <div className="stat">
                <div className="label">Pick-up sales</div>
                <div className="value">{peso(byType.pickup)}</div>
              </div>
              <div className="stat">
                <div className="label">Product total</div>
                <div className="value">{peso(byType.total)}</div>
              </div>
            </div>

            <h2>Monthly rental payments</h2>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Renter</th>
                    <th>Cube</th>
                    <th>Type</th>
                    <th>Monthly rent</th>
                    <th>Contract period</th>
                  </tr>
                </thead>
                <tbody>
                  {rentalSales.map((r, i) => (
                    <tr key={`${r.cube}-${i}`}>
                      <td>{r.renter}</td>
                      <td>{r.cube}</td>
                      <td>{r.type}</td>
                      <td>{peso(r.monthly)}</td>
                      <td>{r.period}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3}><strong>Total rental income</strong></td>
                    <td colSpan={2}><strong>{peso(rentalTotal)}</strong></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <h2>Display / Pick-up sales ({month})</h2>
            <p className="muted">Use this to match renter records before releasing money.</p>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Product</th>
                    <th>Cube / Type</th>
                    <th>Renter</th>
                    <th>Amount</th>
                    <th>Payment</th>
                    <th>Processed by</th>
                  </tr>
                </thead>
                <tbody>
                  {monthTx.map((t) => {
                    const r = getTxRenter(t)
                    return (
                      <tr key={t.transaction_id}>
                        <td>{new Date(t.transaction_date).toLocaleString()}</td>
                        <td>{t.products?.product_name}</td>
                        <td>{t.products?.cubes?.cube_number} · {t.products?.cubes?.type || '—'}</td>
                        <td>{r.name}</td>
                        <td>{peso(t.products?.price)}</td>
                        <td>
                          <span className={`status-pill ${t.payment_status === 'Paid' ? 'confirmed' : 'pending'}`}>
                            {t.payment_status}
                          </span>
                        </td>
                        <td>{t.users ? `${t.users.full_name} (${t.users.role})` : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4}><strong>Paid Display</strong></td>
                    <td colSpan={3}><strong>{peso(byType.display)}</strong></td>
                  </tr>
                  <tr>
                    <td colSpan={4}><strong>Paid Pick-up</strong></td>
                    <td colSpan={3}><strong>{peso(byType.pickup)}</strong></td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {monthTx.length === 0 && <div className="empty">No transactions this month.</div>}
          </>
        )}
      </div>

      {/* ════════════ PRINT REPORT DIALOG MODAL ════════════ */}
      {isPrintModalOpen && (
        <div className="modal-overlay no-print" onClick={() => setIsPrintModalOpen(false)}>
          <div className="modal-card" style={{ maxWidth: 540 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Generate & Print Report</h3>
              <button className="modal-close" onClick={() => setIsPrintModalOpen(false)}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
              <div className="field">
                <label>Report Type</label>
                <select
                  value={printReportType}
                  onChange={(e) => setPrintReportType(e.target.value as ReportType)}
                >
                  <option value="display">Display Sales Report (Monthly display transactions)</option>
                  <option value="pickup">Pick-up Sales Report (Monthly pick-up transactions)</option>
                  <option value="rental">Monthly Rental Payment Report (Cube rental income only)</option>
                </select>
              </div>

              {printReportType !== 'rental' && (
                <div className="field">
                  <label>Select Month</label>
                  <input
                    type="month"
                    value={printMonth}
                    onChange={(e) => setPrintMonth(e.target.value)}
                  />
                </div>
              )}

              <div className="field">
                <label>Renter Filter</label>
                <select
                  value={printRenterId}
                  onChange={(e) => setPrintRenterId(e.target.value)}
                >
                  <option value="all">All Renters</option>
                  {renters.map((r) => (
                    <option key={r.user_id} value={r.user_id}>
                      {r.full_name} (#{r.user_id})
                    </option>
                  ))}
                </select>
              </div>

              <div className="alert info" style={{ fontSize: '0.85rem' }}>
                Preview summary: <strong>{printFilteredData.list.length} records</strong> found.
                Total: <strong>{peso(printFilteredData.total)}</strong>
              </div>

              <div className="row" style={{ justifyContent: 'flex-end', marginTop: '1rem' }}>
                <button className="btn-ghost" type="button" onClick={() => setIsPrintModalOpen(false)}>
                  Cancel
                </button>
                <button className="btn" type="button" onClick={handleTriggerPrint}>
                  🖨️ Print Now
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════ DEDICATED PRINT DOCUMENT ════════════ */}
      <div id="owner-print-report" className="print-report-container">
        <div className="print-report-header">
          <h2>TrackErentory</h2>
          <h3>
            {printReportType === 'display' && 'Display Sales Report'}
            {printReportType === 'pickup' && 'Pick-up Sales Report'}
            {printReportType === 'rental' && 'Monthly Rental Payment Report'}
          </h3>
          <div className="print-report-meta">
            <span><strong>Period:</strong> {printReportType === 'rental' ? 'Active Contracts' : monthLabel}</span>
            <span><strong>Renter:</strong> {selectedRenterName}</span>
            <span><strong>Date Generated:</strong> {new Date().toLocaleDateString('en-PH')}</span>
          </div>
        </div>

        {printReportType === 'rental' ? (
          <table className="print-table">
            <thead>
              <tr>
                <th>Renter</th>
                <th>Cube No.</th>
                <th>Type</th>
                <th>Contract Period</th>
                <th style={{ textAlign: 'right' }}>Monthly Rent</th>
              </tr>
            </thead>
            <tbody>
              {(printFilteredData.list as typeof rentalSales).map((r, i) => (
                <tr key={i}>
                  <td>{r.renter}</td>
                  <td>{r.cube}</td>
                  <td>{r.type}</td>
                  <td>{r.period}</td>
                  <td style={{ textAlign: 'right' }}>{peso(r.monthly)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4}><strong>Total Rental Income</strong></td>
                <td style={{ textAlign: 'right' }}><strong>{peso(printFilteredData.total)}</strong></td>
              </tr>
            </tfoot>
          </table>
        ) : (
          <table className="print-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Cube</th>
                <th>Renter</th>
                <th>Date</th>
                <th>Payment</th>
                <th>Process</th>
                <th>Qty</th>
                <th style={{ textAlign: 'right' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {(printFilteredData.list as Transaction[]).map((t) => {
                const r = getTxRenter(t)
                return (
                  <tr key={t.transaction_id}>
                    <td>
                      <strong>{t.products?.product_name || t.product_name || '—'}</strong>
                      {t.products?.variant && <div style={{ fontSize: '0.75rem', color: '#555' }}>Variant: {t.products.variant}</div>}
                    </td>
                    <td>{t.products?.cubes?.cube_number || t.cubes?.cube_number || '—'}</td>
                    <td>{r.name}</td>
                    <td>{new Date(t.transaction_date).toLocaleDateString('en-PH')}</td>
                    <td>{t.payment_status}</td>
                    <td>{t.payment_method || 'Cash'}</td>
                    <td>{t.quantity || 1}</td>
                    <td style={{ textAlign: 'right' }}>{peso(Number(t.products?.price || 0) * Number(t.quantity || 1))}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={7}><strong>Overall Total ({printMonth})</strong></td>
                <td style={{ textAlign: 'right' }}><strong>{peso(printFilteredData.total)}</strong></td>
              </tr>
            </tfoot>
          </table>
        )}

        <div className="print-report-signatures">
          <div>
            <div className="sig-line"></div>
            <div>Prepared By (Owner)</div>
          </div>
          <div>
            <div className="sig-line"></div>
            <div>Received / Acknowledged By</div>
          </div>
        </div>
      </div>
    </section>
  )
}
