import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/Auth'
import { peso, type Contract, type Transaction } from '../lib/types'

export default function OwnerDashboard() {
  const { user } = useAuth()
  const [contracts, setContracts] = useState<Contract[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7))

  useEffect(() => {
    void Promise.all([
      supabase.from('contracts').select('*, cubes(*), users!renter_id(full_name)'),
      supabase.from('transactions').select('*, products(*, cubes(cube_number, type)), users!processed_by(full_name, role)'),
    ]).then(([c, t]) => {
      if (!c.error) setContracts((c.data || []) as Contract[])
      if (!t.error) setTransactions((t.data || []) as Transaction[])
    })
  }, [])

  const rentalSales = useMemo(() => {
    return contracts
      .filter((c) => c.status === 'Active' || c.status === 'Pending')
      .map((c) => ({
        renter: c.users?.full_name || `User #${c.renter_id}`,
        cube: c.cubes?.cube_number,
        type: c.cubes?.type,
        monthly: Number(c.cubes?.price_per_month || 0),
        period: `${c.start_date} → ${c.end_date}`,
      }))
  }, [contracts])

  const rentalTotal = rentalSales.reduce((s, r) => s + r.monthly, 0)

  const monthTx = useMemo(() => {
    return transactions.filter((t) => String(t.transaction_date || '').startsWith(month))
  }, [transactions, month])

  const byType = useMemo(() => {
    let display = 0
    let pickup = 0
    for (const t of monthTx) {
      if (t.payment_status !== 'Paid') continue
      const amount = Number(t.products?.price || 0)
      if (t.products?.cubes?.type === 'Display') display += amount
      else if (t.products?.cubes?.type === 'Pick-up') pickup += amount
    }
    return { display, pickup, total: display + pickup }
  }, [monthTx])

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

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>Owner sales & reports</h1>
          <p className="lede">Monthly rental income and Display / Pick-up product sales before releasing payouts to renters.</p>
        </div>
        <div className="row no-print">
          <button className="btn" type="button" onClick={() => window.print()}>Print report</button>
        </div>
      </div>

      <div className="field no-print" style={{ maxWidth: 220 }}>
        <label>Product sales month</label>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
      </div>

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
            <th>Amount</th>
            <th>Payment</th>
            <th>Processed by</th>
          </tr>
        </thead>
        <tbody>
          {monthTx.map((t) => (
            <tr key={t.transaction_id}>
              <td>{new Date(t.transaction_date).toLocaleString()}</td>
              <td>{t.products?.product_name}</td>
              <td>{t.products?.cubes?.cube_number} · {t.products?.cubes?.type || '—'}</td>
              <td>{peso(t.products?.price)}</td>
              <td>{t.payment_status}</td>
              <td>{t.users ? `${t.users.full_name} (${t.users.role})` : '—'}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3}><strong>Paid Display</strong></td>
            <td colSpan={3}><strong>{peso(byType.display)}</strong></td>
          </tr>
          <tr>
            <td colSpan={3}><strong>Paid Pick-up</strong></td>
            <td colSpan={3}><strong>{peso(byType.pickup)}</strong></td>
          </tr>
        </tfoot>
      </table>
      </div>
      {monthTx.length === 0 && <div className="empty">No transactions this month.</div>}
    </section>
  )
}
