export type Role = 'Owner' | 'Staff' | 'Renter' | 'Customer'

export type UserRow = {
  user_id: number
  full_name: string
  role: Role
  status: string | null
  salary: number | null
  username: string
  email: string | null
  phone_number: string | null
  social_link: string | null
}

export type Cube = {
  cube_id: number
  cube_number: string
  location: string | null
  type: 'Display' | 'Pick-up'
  price_per_month: number
  status: 'Available' | 'Occupied'
  image_url: string | null
  image_urls?: string[] | null
  width_cm: number | null
  height_cm: number | null
  deleted_at: string | null
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
  category?: string | null
  image_url: string | null
  image_urls?: string[] | null
  deleted_at: string | null
  created_at?: string
  cubes?: Pick<Cube, 'cube_number' | 'type' | 'location'> | null
  renter?: Pick<UserRow, 'user_id' | 'full_name' | 'username'> | null
}

export type Reservation = {
  reservation_id: number
  product_id: number | null
  cube_id: number | null
  customer_id: number | null
  expiry_time: string
  hours_valid: number | null
  status: 'Pending' | 'Confirmed' | 'Cancelled'
  products?: Product | null
  cubes?: Cube | null
  customer?: Pick<UserRow, 'full_name' | 'email' | 'phone_number'> | null
}

export type Contract = {
  contract_id: number
  renter_id: number | null
  cube_id: number | null
  start_date: string
  end_date: string
  status: 'Active' | 'Expired' | 'Pending'
  contract_text: string | null
  created_at?: string
  cubes?: Cube | null
  users?: { full_name: string; email?: string; phone_number?: string } | null
}

export type ContractExtension = {
  extension_id: number
  contract_id: number | null
  renter_id: number | null
  cube_id: number | null
  requested_months: number
  notes: string | null
  status: 'Pending' | 'Approved' | 'Declined'
  created_at?: string
  updated_at?: string
  contracts?: Contract | null
  cubes?: Cube | null
  users?: { full_name: string; email?: string; phone_number?: string } | null
}

export type ContractPayment = {
  payment_id: number
  contract_id: number
  renter_id: number | null
  cube_id: number | null
  month_number: number
  due_date: string
  amount: number
  payment_status: 'Pending' | 'Paid'
  payment_method: 'Cash' | 'Online' | null
  receipt_image_url: string | null
  paid_at: string | null
  processed_by: number | null
  notes: string | null
  created_at?: string
  updated_at?: string
  contracts?: Contract | null
  cubes?: Cube | null
  users?: { full_name: string } | null
  processor?: { full_name: string; role: Role } | null
}

export type Transaction = {
  transaction_id: number
  product_id: number | null
  product_name: string | null
  cube_id: number | null
  renter_id: number | null
  buyer_name: string | null
  authorized_pickup_name: string | null
  payment_status: 'Pending' | 'Paid'
  payment_method: 'Cash' | 'Online'
  quantity: number
  listed_quantity: number | null
  pickup_status: 'Waiting' | 'Picked-up'
  receipt_image_url: string | null
  notes: string | null
  transaction_date: string
  updated_at: string | null
  processed_by: number | null
  products?: (Product & { cubes?: Cube | null }) | null
  cubes?: Pick<Cube, 'cube_number' | 'type' | 'location'> | null
  users?: { full_name: string; role: Role } | null
}

export type PullOutItem = {
  pull_out_id: number | string
  type: 'Display' | 'Pick-up'
  product_id?: number | null
  cube_id?: number | null
  renter_id?: number | null
  transaction_id?: number | null
  buyer_name?: string | null
  product_name: string
  price: number
  quantity: number
  reason: string
  status: string
  notes?: string | null
  pulled_out_by?: number | null
  pulled_out_at: string
  created_at?: string
  cubes?: { cube_number: string; type: string } | null
  renter?: { full_name: string; phone_number?: string | null; social_link?: string | null; username?: string | null } | null
}

export type OtpCode = {
  id: number
  user_id: number | null
  email: string
  code: string
  purpose: 'verify' | 'forgot_password' | 'create_account' | 'login'
  expires_at: string
  used: boolean
}

export function daysUntil(dateStr: string): number {
  if (!dateStr) return 0
  const targetStr = String(dateStr).slice(0, 10)
  const todayStr = todayISO()
  const [ty, tm, td] = targetStr.split('-').map(Number)
  const [cy, cm, cd] = todayStr.split('-').map(Number)
  if (!ty || !tm || !td) return 0
  const targetMs = Date.UTC(ty, tm - 1, td)
  const todayMs = Date.UTC(cy, cm - 1, cd)
  return Math.round((targetMs - todayMs) / (1000 * 60 * 60 * 24))
}

/** Check if a contract is in its 3-day post-expiration grace period (waiting for extension) */
export function isContractInGracePeriod(c: { status: string; end_date: string; contract_text?: string | null }): boolean {
  if (!c || c.status === 'Pending') return false
  if (c.contract_text && c.contract_text.includes('<!--TRK_META:')) {
    const match = c.contract_text.match(/<!--TRK_META:([\s\S]*?)-->\s*$/)
    if (match && match[1]) {
      try {
        const parsed = JSON.parse(match[1])
        if (Array.isArray(parsed?.extensions) && parsed.extensions.some((e: any) => e.status === 'Approved')) {
          return false
        }
      } catch {
        // ignore
      }
    }
  }
  const d = daysUntil(c.end_date)
  if (c.status === 'Active' && d >= 0) return false
  return (c.status === 'Expired' && d <= 0 && d >= -3) || (d < 0 && d >= -3)
}

/** Remaining days (1 to 3) to request an extension during the 3-day grace period */
export function getGracePeriodDaysLeft(c: { status: string; end_date: string }): number {
  if (!isContractInGracePeriod(c)) return 0
  const d = daysUntil(c.end_date)
  if (d >= -1) return 3
  if (d === -2) return 2
  if (d === -3) return 1
  return 0
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
  // Date inputs represent the visitor's calendar date, not UTC. Using
  // toISOString here can shift the displayed date by a day in PH/Asia time.
  const d = new Date()
  const offset = d.getTimezoneOffset() * 60_000
  return new Date(d.getTime() - offset).toISOString().slice(0, 10)
}

/** Safely parse expiry_time from PostgreSQL timestamp without timezone into proper Date */
export function parseReservationExpiry(dateStr: string | null | undefined): Date {
  if (!dateStr) return new Date(0)
  if (!dateStr.endsWith('Z') && !/[+-]\d{2}(:?\d{2})?$/.test(dateStr)) {
    return new Date(dateStr.replace(' ', 'T') + 'Z')
  }
  return new Date(dateStr)
}

/** Check if a pending reservation has truly expired */
export function isReservationExpired(r: { status: string; expiry_time: string }): boolean {
  if (r.status !== 'Pending') return false
  return parseReservationExpiry(r.expiry_time).getTime() < Date.now()
}

/** Compute remaining hours for a reservation */
export function getReservationHoursLeft(r: { expiry_time: string }): number {
  const diff = parseReservationExpiry(r.expiry_time).getTime() - Date.now()
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60)))
}

export const DEFAULT_PRODUCT_CATEGORIES = [
  'Cosmetics & Skincare',
  'Fashion & Apparel',
  'Accessories & Jewelry',
  'Food & Snacks',
  'Toys & Collectibles',
  'Crafts & Handcrafted',
  'Electronics & Gadgets',
  'Stationery & Stickers',
  'Health & Wellness',
] as const

export const DEFAULT_CONTRACT_TERMS = `1. Renter may place products in the assigned Display or Pick-up cube only.
2. Monthly rental fee is due as agreed; Owner reserves the right to withhold renter payouts until sales inventory records match.
3. Contract may be extended from the Renter dashboard within the 3-day grace period following expiration.
4. Upon expiry without approved extension after 3 days, the cube shall automatically return to Available status for other consignors.
5. Both parties may print and sign this agreement as a legally binding physical hard copy.`
