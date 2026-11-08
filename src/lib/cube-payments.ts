import { supabase, BUCKET_DOCUMENTS } from './supabase'
import { uploadPublicImage } from './storage'
import { addMonths, type Contract, type ContractPayment } from './types'
import { buildContractTextWithMeta, parseContractMeta } from './contract-meta'

/**
 * Cube rental payment helpers shared by the Owner/Staff Contracts page and the
 * Renter "My Cube & Contract" section.
 *
 * Payment states:
 *  - Pending          → not yet paid (default mode of payment is Cash)
 *  - For Verification → renter paid online and submitted a reference number + receipt;
 *                       waiting for Owner/Staff to confirm
 *  - Paid             → confirmed by Owner/Staff (cash received or online payment verified)
 */
export type CubePaymentStatus = 'Pending' | 'For Verification' | 'Paid'

export type CubePaymentRow = {
  key: string
  contract: Contract
  monthIndex: number
  totalMonths: number
  dueDate: string
  amount: number
  record: ContractPayment | null
  status: CubePaymentStatus
  method: 'Cash' | 'Online'
  referenceNumber: string | null
  receiptUrl: string | null
  submittedAt: string | null
  paidAt: string | null
  notes: string | null
}

export function contractMonths(c: Pick<Contract, 'start_date' | 'end_date'>): number {
  const startD = new Date(c.start_date)
  const endD = new Date(c.end_date)
  return Math.max(1, Math.round((endD.getTime() - startD.getTime()) / (1000 * 60 * 60 * 24 * 30)))
}

function stamp(p: any): number {
  return new Date(p?.updated_at || p?.paid_at || p?.submitted_at || p?.created_at || 0).getTime()
}

/**
 * Finds the month's payment record. Payments are saved both in the contract_payments table and
 * (as an RLS-safe fallback) inside contracts.contract_text metadata — the most recently updated wins.
 */
function findRecord(payments: ContractPayment[], contract: Contract, monthIndex: number): ContractPayment | null {
  const sameMonth = (p: any) => (p.month_number ?? p.month_index ?? 1) === monthIndex
  const fromList = payments.filter((p) => p.contract_id === contract.contract_id && sameMonth(p))
  const fromMeta = parseContractMeta(contract.contract_text)
    .payments.filter(sameMonth)
    .map((p: any) => ({
      ...p,
      contract_id: contract.contract_id,
      month_number: monthIndex,
      payment_status: p.payment_status || p.status || 'Paid',
    }))
  const all = [...fromList, ...fromMeta] as ContractPayment[]
  if (all.length === 0) return null
  const best = all.reduce((a, b) => (stamp(b) > stamp(a) ? b : a))
  const withId = fromList.find((p) => p.payment_id)
  return withId && !best.payment_id ? { ...best, payment_id: withId.payment_id } : best
}

export function resolveStatus(record: ContractPayment | null, contract: Contract, monthIndex: number): CubePaymentStatus {
  if (record) {
    const raw = record.payment_status || (record as any).status
    if (raw === 'Paid') return 'Paid'
    if (raw === 'For Verification') return 'For Verification'
    // Legacy rows: an online payment with a reference number that was not yet confirmed
    if (record.payment_method === 'Online' && record.reference_number) return 'For Verification'
    return 'Pending'
  }
  // Legacy behaviour: month 1 of an already-approved contract was collected as the initial advance
  if (monthIndex === 1 && contract.status !== 'Pending') return 'Paid'
  return 'Pending'
}

export function buildPaymentSchedule(contract: Contract, payments: ContractPayment[]): CubePaymentRow[] {
  const totalMonths = contractMonths(contract)
  const rate = Number(contract.cubes?.price_per_month || 0)
  return Array.from({ length: totalMonths }, (_, i) => {
    const monthIndex = i + 1
    const record = findRecord(payments, contract, monthIndex)
    const status = resolveStatus(record, contract, monthIndex)
    return {
      key: `${contract.contract_id}-${monthIndex}`,
      contract,
      monthIndex,
      totalMonths,
      dueDate: record?.due_date || addMonths(contract.start_date, monthIndex - 1),
      amount: Number(record?.amount ?? rate),
      record,
      status,
      method: (record?.payment_method as 'Cash' | 'Online') || 'Cash',
      referenceNumber: record?.reference_number || null,
      receiptUrl: record?.receipt_image_url || null,
      submittedAt: record?.submitted_at || null,
      paidAt: record?.paid_at || null,
      notes: record?.notes || null,
    }
  })
}

export async function loadContractPayments(renterId?: number): Promise<ContractPayment[]> {
  let q = supabase.from('contract_payments').select('*').order('payment_id', { ascending: true })
  if (renterId) q = q.eq('renter_id', renterId)
  const { data, error } = await q
  if (error) {
    console.warn('contract_payments load error:', error.message)
    return []
  }
  return (data || []) as ContractPayment[]
}

function missingColumnHint(message: string) {
  if (/reference_number|submitted_at|For Verification|payment_status_check/i.test(message)) {
    return `${message}\n\nPlease run supabase/migrations/018_payments_agreement_inventory.sql in the Supabase SQL Editor first.`
  }
  return message
}

/**
 * Saves a single month payment. Writes to the contract_payments table when allowed, and always
 * mirrors the record into contracts.contract_text metadata (same pattern as contract-meta.ts),
 * so the payment persists even if RLS or a not-yet-run migration blocks the table write.
 */
async function upsertPayment(row: CubePaymentRow, patch: Record<string, unknown>) {
  const now = new Date().toISOString()
  const c = row.contract
  const full = {
    contract_id: c.contract_id,
    renter_id: c.renter_id,
    cube_id: c.cube_id,
    month_number: row.monthIndex,
    due_date: row.dueDate,
    amount: row.amount,
    ...patch,
    updated_at: now,
  } as Record<string, unknown>

  // 1. contract_payments table
  let dbError: string | null = null
  try {
    const { error } = await supabase.from('contract_payments').upsert([full], { onConflict: 'contract_id,month_number' })
    if (error) dbError = error.message
  } catch (e: any) {
    dbError = e?.message || 'contract_payments write failed'
  }

  // 2. contract_text metadata (fallback / mirror)
  let metaError: string | null = null
  try {
    const { data: latest, error: readErr } = await supabase
      .from('contracts')
      .select('contract_text')
      .eq('contract_id', c.contract_id)
      .maybeSingle()
    if (readErr) throw readErr
    const rawText = latest?.contract_text ?? c.contract_text
    const meta = parseContractMeta(rawText)
    const idx = meta.payments.findIndex((p: any) => (p.month_number ?? p.month_index ?? 1) === row.monthIndex)
    const rec = { ...(idx >= 0 ? meta.payments[idx] : {}), ...full, status: full.payment_status }
    if (idx >= 0) meta.payments[idx] = rec
    else meta.payments.push(rec)
    const { error: updErr } = await supabase
      .from('contracts')
      .update({ contract_text: buildContractTextWithMeta(rawText, meta) })
      .eq('contract_id', c.contract_id)
    if (updErr) throw updErr
  } catch (e: any) {
    metaError = e?.message || 'contract update failed'
  }

  if (dbError && metaError) return missingColumnHint(dbError)
  if (dbError) console.warn('contract_payments write skipped (saved in contract metadata instead):', dbError)
  return null
}

/** Renter: pay a month online by submitting a reference number and receipt image. */
export async function submitOnlinePayment(row: CubePaymentRow, referenceNumber: string, receipt: File) {
  const ref = referenceNumber.trim()
  if (!ref) return 'Please enter the reference number of your online payment.'
  if (!receipt) return 'Please attach the receipt / proof of payment.'
  if (row.contract.contract_id <= 0) return 'Your reservation is still syncing. Please refresh the page and try again.'

  const upload = await uploadPublicImage(BUCKET_DOCUMENTS, receipt, 'cube-payments')
  if (upload.error || !upload.url) return 'Failed to upload receipt: ' + (upload.error || 'unknown error')

  return upsertPayment(row, {
    payment_status: 'For Verification',
    payment_method: 'Online',
    reference_number: ref,
    receipt_image_url: upload.url,
    submitted_at: new Date().toISOString(),
    paid_at: null,
    notes: null,
  })
}

/** Owner/Staff: confirm an online payment or record a cash payment as Paid. */
export async function confirmPayment(row: CubePaymentRow, processedBy: number | undefined) {
  return upsertPayment(row, {
    payment_status: 'Paid',
    payment_method: row.status === 'For Verification' ? 'Online' : row.method || 'Cash',
    paid_at: new Date().toISOString(),
    processed_by: processedBy ?? null,
  })
}

/** Owner/Staff: reject an online payment so the renter can resubmit (or pay cash). */
export async function rejectPayment(row: CubePaymentRow, reason: string, processedBy: number | undefined) {
  return upsertPayment(row, {
    payment_status: 'Pending',
    payment_method: 'Cash',
    reference_number: null,
    receipt_image_url: null,
    submitted_at: null,
    processed_by: processedBy ?? null,
    notes: `Online payment rejected${reason.trim() ? `: ${reason.trim()}` : ''}`,
  })
}

/** CSS badge modifier for a payment status (badge ok / pickup / warn). */
export function paymentStatusBadge(status: CubePaymentStatus) {
  if (status === 'Paid') return 'ok'
  if (status === 'For Verification') return 'pickup'
  return 'warn'
}
