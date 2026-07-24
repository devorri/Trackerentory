import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/Auth'
import { type Reservation } from '../lib/types'
import { cancelExpiredReservations } from '../lib/maintenance'

export default function ReservationsPage() {
  const { user } = useAuth()
  const [rows, setRows] = useState<Reservation[]>([])
  const [loading, setLoading] = useState(false)

  async function load() {
    if (!user) return
    setLoading(true)
    await cancelExpiredReservations()
    const { data, error } = await supabase
      .from('reservations')
      .select('*, products(*)')
      .eq('customer_id', user.user_id)
      .order('expiry_time', { ascending: false })
    setLoading(false)
    if (error) console.error(error)
    else setRows((data || []) as Reservation[])
  }

  useEffect(() => { void load() }, [user])

  if (!user) {
    return (
      <section>
        <div className="page-header">
          <div>
            <h1>My reservations</h1>
            <p className="lede">Please <Link to="/login">sign in</Link> as a Customer.</p>
          </div>
        </div>
      </section>
    )
  }

  if (user.role !== 'Customer') {
    return (
      <section>
        <div className="page-header">
          <div>
            <h1>My reservations</h1>
            <p className="lede">Product reservations are for Customer accounts.</p>
          </div>
        </div>
      </section>
    )
  }

  async function cancel(id: number) {
    const { error } = await supabase.from('reservations').update({ status: 'Cancelled' }).eq('reservation_id', id)
    if (error) return alert(error.message)
    void load()
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>My reservations</h1>
          <p className="lede">If you don’t pick up before expiry, the reservation cancels automatically.</p>
        </div>
      </div>

      {loading && <p className="muted">Loading…</p>}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Validity</th>
              <th>Status</th>
              <th>Expires</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const expired = r.status === 'Pending' && new Date(r.expiry_time).getTime() < Date.now()
              const hoursLeft = Math.max(
                0,
                Math.ceil((new Date(r.expiry_time).getTime() - Date.now()) / (1000 * 60 * 60)),
              )
              return (
                <tr key={r.reservation_id}>
                  <td>{r.products?.product_name || r.product_id}</td>
                  <td>{r.hours_valid} hour(s)</td>
                  <td>
                    <span className={`badge ${r.status === 'Cancelled' || expired ? 'bad' : r.status === 'Confirmed' ? 'ok' : 'warn'}`}>
                      {expired ? 'Expired' : r.status}
                    </span>
                  </td>
                  <td>{new Date(r.expiry_time).toLocaleString()} ({expired ? 'Expired' : `${hoursLeft}h left`})</td>
                  <td>
                    {r.status === 'Pending' && !expired && (
                      <button className="btn-ghost" type="button" onClick={() => cancel(r.reservation_id)}>Cancel</button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {!loading && rows.length === 0 && <div className="empty" style={{ marginTop: '1rem' }}>No reservations yet.</div>}
    </section>
  )
}
