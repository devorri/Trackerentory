export type Role = 'Owner' | 'Staff' | 'Renter' | 'Customer'

export type UserRow = {
  user_id: number
  full_name: string
  role: Role
  status: string | null
  salary: number | null
  username: string
}

export type Cube = {
  cube_id: number
  cube_number: string
  type: 'Display' | 'Pick-up'
  price_per_month: number
  status: 'Available' | 'Occupied'
}

export type Product = {
  product_id: number
  renter_id: number | null
  cube_id: number | null
  product_name: string
  description: string | null
  price: number
  stock_quantity: number
  variant: string | null
  image_url: string | null
  cubes?: Pick<Cube, 'cube_number' | 'type'> | null
}

export type Reservation = {
  reservation_id: number
  product_id: number | null
  customer_id: number | null
  expiry_time: string
  hours_valid: number
  status: 'Pending' | 'Confirmed' | 'Cancelled'
  products?: Product | null
}

export type Contract = {
  contract_id: number
  renter_id: number | null
  cube_id: number | null
  start_date: string
  end_date: string
  status: 'Active' | 'Expired' | 'Pending'
  cubes?: Cube | null
  users?: { full_name: string } | null
}

export type Transaction = {
  transaction_id: number
  product_id: number | null
  buyer_name: string | null
  authorized_pickup_name: string | null
  payment_status: 'Pending' | 'Paid'
  receipt_image_url: string | null
  notes: string | null
  transaction_date: string
  processed_by: number | null
  products?: (Product & { cubes?: Cube | null }) | null
  users?: { full_name: string; role: Role } | null
}

export function daysUntil(dateStr: string): number {
  const end = new Date(dateStr)
  end.setHours(23, 59, 59, 999)
  const ms = end.getTime() - Date.now()
  return Math.ceil(ms / (1000 * 60 * 60 * 24))
}

export function peso(n: number | null | undefined) {
  return `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function addMonths(isoDate: string, months: number): string {
  const d = new Date(isoDate)
  d.setMonth(d.getMonth() + months)
  return d.toISOString().slice(0, 10)
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10)
}
