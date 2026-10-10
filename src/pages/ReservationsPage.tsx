import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/Auth'
import { type Reservation, isReservationExpired, getReservationHoursLeft, parseReservationExpiry, peso } from '../lib/types'
import { cancelExpiredReservations } from '../lib/maintenance'

import { SkeletonTable } from '../components/Skeleton'

export default function ReservationsPage() {
  const { user } = useAuth()
  const nav = useNavigate()
  const [rows, setRows] = useState<Reservation[]>([])
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)

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
    setBusyId(id)
    const { error } = await supabase.from('reservations').update({ status: 'Cancelled' }).eq('reservation_id', id)
    setBusyId(null)
    if (error) return alert(error.message)
    void load()
  }

  async function confirmReservation(id: number) {
    setBusyId(id)
    const { error } = await supabase.from('reservations').update({ status: 'Confirmed' }).eq('reservation_id', id)
    setBusyId(null)
    if (error) return alert('Failed to confirm: ' + error.message)
    alert('Reservation confirmed successfully!')
    void load()
  }

  const isStaffOrOwner = user.role === 'Owner' || user.role === 'Staff'

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>{user.role === 'Customer' ? 'My reservations' : 'Product & Cube Reservations'}</h1>
          <p className="lede">
            {user.role === 'Customer'
              ? 'If you don’t pick up before expiry, the reservation cancels automatically.'
              : 'Review and confirm customer reservations, or immediately process claim and cashier payment.'}
          </p>
        </div>
      </div>

      {loading ? (
        <SkeletonTable rows={4} cols={5} />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Product / Cube</th>
                <th>Customer</th>
                <th>Assigned Cube</th>
                <th>Price</th>
                <th>Validity</th>
                <th>Status</th>
                <th>Expires</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const expired = isReservationExpired(r)
                const hoursLeft = getReservationHoursLeft(r)
                const expiryDate = parseReservationExpiry(r.expiry_time)
                const isPending = r.status === 'Pending' && !expired
                const isBusy = busyId === r.reservation_id

                return (
                  <tr key={r.reservation_id}>
                    <td>
                      <strong>
                        {r.products?.product_name || (r.cube_id ? `Cube ${r.cubes?.cube_number || r.cube_id}` : `Product #${r.product_id}`)}
                      </strong>
                      {r.products?.variant && <div className="muted">{r.products.variant}</div>}
                      {r.products?.category && (
                        <span className="badge info" style={{ fontSize: '0.72rem', marginTop: '0.2rem' }}>
                          {r.products.category}
                        </span>
                      )}
                    </td>
                    <td>
                      {r.customer?.full_name || '—'}
                      {r.customer?.email && <div className="muted">{r.customer.email}</div>}
                      {r.customer?.phone_number && <div className="muted">{r.customer.phone_number}</div>}
                    </td>
                    <td>{r.products?.cubes?.cube_number || r.cubes?.cube_number || '—'}</td>
                    <td>{r.products ? peso(r.products.price) : r.cubes ? `${peso(r.cubes.price_per_month)}/mo` : '—'}</td>
                    <td>{r.hours_valid ? `${r.hours_valid} hr(s)` : '1 hr'}</td>
                    <td>
                      <span className={`badge ${r.status === 'Cancelled' || expired ? 'bad' : r.status === 'Confirmed' ? 'ok' : 'warn'}`}>
                        {expired ? 'Expired' : r.status}
                      </span>
                    </td>
                    <td>
                      {expiryDate.toLocaleString('en-PH')}
                      <div className="muted" style={{ fontSize: '0.75rem' }}>
                        {expired ? '(Expired)' : `${hoursLeft}h left`}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="row" style={{ justifyContent: 'flex-end', gap: '0.4rem' }}>
                        {/* Customer Cancel action */}
                        {user.role === 'Customer' && isPending && (
                          <button
                            className="btn-ghost"
                            type="button"
                            disabled={isBusy}
                            onClick={() => cancel(r.reservation_id)}
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
                              style={{ padding: '0.35rem 0.75rem', fontSize: '0.82rem' }}
                              onClick={() => confirmReservation(r.reservation_id)}
                            >
                              Confirm
                            </button>
                            <button
                              className="btn-ghost"
                              type="button"
                              disabled={isBusy}
                              style={{ padding: '0.35rem 0.75rem', fontSize: '0.82rem' }}
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
                            style={{ padding: '0.35rem 0.75rem', fontSize: '0.82rem' }}
                            onClick={() => nav(`/pickup?claimId=${r.reservation_id}`)}
                          >
                            Process in Cashier
                          </button>
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
      {!loading && rows.length === 0 && <div className="empty" style={{ marginTop: '1rem' }}>No reservations yet.</div>}
    </section>
  )
}

