import { supabase } from './supabase'

/** Cancel Pending reservations whose expiry_time has passed. */
export async function cancelExpiredReservations() {
  const now = new Date().toISOString()
  await supabase
    .from('reservations')
    .update({ status: 'Cancelled' })
    .eq('status', 'Pending')
    .lt('expiry_time', now)
}

/** Mark Active contracts past end_date as Expired. */
export async function expireContracts() {
  const today = new Date().toISOString().slice(0, 10)
  await supabase
    .from('contracts')
    .update({ status: 'Expired' })
    .eq('status', 'Active')
    .lt('end_date', today)
}
