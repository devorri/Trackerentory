import { supabase } from './supabase'
import { isReservationExpired, isContractInGracePeriod, todayISO, daysUntil } from './types'

/**
 * Cancel Pending reservations (both Product and Cube reservations) whose hour time limit has expired.
 * If a Cube reservation expires unpaid/unconfirmed, also remove its Pending contract and return the cube to Available.
 */
export async function cancelExpiredReservations() {
  try {
    const { data: pendingRes } = await supabase
      .from('reservations')
      .select('reservation_id, product_id, cube_id, customer_id, expiry_time, status')
      .eq('status', 'Pending')

    const expiredList = (pendingRes || []).filter((r) => isReservationExpired(r))
    if (expiredList.length === 0) return

    const expiredIds = expiredList.map((r) => r.reservation_id)
    await supabase
      .from('reservations')
      .update({ status: 'Cancelled' })
      .in('reservation_id', expiredIds)

    // For expired cube reservations, clean up their Pending contract and release cube if not actively leased
    const expiredCubeRes = expiredList.filter((r) => r.cube_id && !r.product_id)
    for (const r of expiredCubeRes) {
      if (!r.cube_id) continue
      if (r.customer_id) {
        await supabase
          .from('contracts')
          .delete()
          .eq('cube_id', r.cube_id)
          .eq('renter_id', r.customer_id)
          .eq('status', 'Pending')
      } else {
        await supabase
          .from('contracts')
          .delete()
          .eq('cube_id', r.cube_id)
          .eq('status', 'Pending')
      }

      // Check if cube has any Active or Grace-Period contract before marking Available
      const { data: cubeContracts } = await supabase
        .from('contracts')
        .select('contract_id, status, end_date, contract_text')
        .eq('cube_id', r.cube_id)

      const hasLiveOrGrace = (cubeContracts || []).some(
        (c) =>
          (c.status === 'Active' && daysUntil(c.end_date) >= 0) ||
          isContractInGracePeriod(c),
      )

      if (!hasLiveOrGrace) {
        await supabase
          .from('cubes')
          .update({ status: 'Available' })
          .eq('cube_id', r.cube_id)
      }
    }
  } catch (err) {
    console.warn('cancelExpiredReservations error:', err)
  }
}

/**
 * Mark Active contracts past end_date as Expired.
 * Cubes stay Occupied during the 3-day extension grace period and automatically return to Available once the 3-day grace period passes without renewal.
 */
export async function expireContracts() {
  try {
    const today = todayISO()
    await supabase
      .from('contracts')
      .update({ status: 'Expired' })
      .eq('status', 'Active')
      .lt('end_date', today)

    // Release cubes whose contracts are past the 3-day grace period and have no active/pending/grace-period contract
    const [{ data: occupiedCubes }, { data: allContracts }] = await Promise.all([
      supabase.from('cubes').select('cube_id, status').eq('status', 'Occupied').is('deleted_at', null),
      supabase.from('contracts').select('contract_id, cube_id, status, end_date, contract_text'),
    ])

    if (!occupiedCubes || !allContracts) return

    for (const cube of occupiedCubes) {
      const cubeCons = allContracts.filter((c) => c.cube_id === cube.cube_id)
      if (cubeCons.length === 0) continue

      const isStillHeld = cubeCons.some(
        (c) =>
          c.status === 'Pending' ||
          (c.status === 'Active' && daysUntil(c.end_date) >= 0) ||
          isContractInGracePeriod(c),
      )

      if (!isStillHeld) {
        await supabase.from('cubes').update({ status: 'Available' }).eq('cube_id', cube.cube_id)
      }
    }
  } catch (err) {
    console.warn('expireContracts error:', err)
  }
}
