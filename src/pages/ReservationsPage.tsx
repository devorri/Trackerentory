import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/Auth'
import { type Reservation } from '../lib/types'
import { cancelExpiredReservations } from '../lib/maintenance'

import { SkeletonTable } from '../components/Skeleton'

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
      .select('*, products(*, cubes(*)), cubes(*), customer:users!customer_id(full_name, email, phone_number)')
      .order('expiry_time', { ascending: false })
    setLoading(false)
    if (error) console.error(error)
    else {
      const reservations = (data || []) as Reservation[]
      const visible = user.role === 'Customer'
        ? reservations.filter((reservation) => reservation.customer_id === user.user_id)
        : user.role === 'Renter'
          ? reservations.filter((reservation) => reservation.products?.renter_id === user.user_id)
          : reservations
      setRows(visible)
    }
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

  async function cancel(id: number) {
    const { error } = await supabase.from('reservations').update({ status: 'Cancelled' }).eq('reservation_id', id)
    if (error) return alert(error.message)
    void load()
  }

  return (
    <section>
      <div className="page-header">
        <div>
            <h1>{user.role === 'Customer' ? 'My reservations' : 'Product reservations'}</h1>
            <p className="lede">{user.role === 'Customer' ? 'If you don’t pick up before expiry, the reservation cancels automatically.' : 'Review reserved products, customer details, and assigned cubes.'}</p>
        </div>
      </div>

      {loading ? (
        <SkeletonTable rows={4} cols={5} />
      ) : (
        <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Customer</th>
              <th>Cube</th>
              <th>Price</th>
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
                  <td>
                    <strong>{r.products?.product_name || (r.cube_id ? `Cube ${r.cubes?.cube_number || r.cube_id}` : r.product_id)}</strong>
                    {r.products?.variant && <div className="muted">{r.products.variant}</div>}
                  </td>
                  <td>
                    {r.customer?.full_name || '—'}
                    {r.customer?.email && <div className="muted">{r.customer.email}</div>}
                    {r.customer?.phone_number && <div className="muted">{r.customer.phone_number}</div>}
                  </td>
                  <td>{r.products?.cubes?.cube_number || r.cubes?.cube_number || '—'}</td>
                  <td>{r.products ? `₱${Number(r.products.price || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : '—'}</td>
                  <td>{r.hours_valid} hour(s)</td>
                  <td>
                    <span className={`badge ${r.status === 'Cancelled' || expired ? 'bad' : r.status === 'Confirmed' ? 'ok' : 'warn'}`}>
                      {expired ? 'Expired' : r.status}
                    </span>
                  </td>
                  <td>{new Date(r.expiry_time).toLocaleString()} ({expired ? 'Expired' : `${hoursLeft}h left`})</td>
                  <td>
                    {user.role === 'Customer' && r.status === 'Pending' && !expired && (
                      <button className="btn-ghost" type="button" onClick={() => cancel(r.reservation_id)}>Cancel</button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      )}
      {!loading && rows.length === 0 && <div className="empty" style={{ marginTop: '1rem' }}>No reservations yet.</div>}
    </section>
  )
}
