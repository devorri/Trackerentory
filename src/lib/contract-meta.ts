import { supabase } from './supabase'
import { addMonths, DEFAULT_CONTRACT_TERMS, type Contract, type ContractExtension } from './types'

const META_REGEX = /\s*<!--TRK_META:([\s\S]*?)-->\s*$/

export type ContractMeta = {
  payments: any[]
  extensions: ContractExtension[]
}

export function stripContractMeta(rawText: string | null | undefined): string {
  if (!rawText) return DEFAULT_CONTRACT_TERMS
  const cleaned = rawText.replace(META_REGEX, '').trim()
  return cleaned || DEFAULT_CONTRACT_TERMS
}

export function parseContractMeta(rawText: string | null | undefined): ContractMeta {
  if (!rawText) return { payments: [], extensions: [] }
  const match = rawText.match(META_REGEX)
  if (!match || !match[1]) return { payments: [], extensions: [] }
  try {
    const parsed = JSON.parse(match[1])
    return {
      payments: Array.isArray(parsed?.payments) ? parsed.payments : [],
      extensions: Array.isArray(parsed?.extensions) ? parsed.extensions : [],
    }
  } catch {
    return { payments: [], extensions: [] }
  }
}

export function buildContractTextWithMeta(
  cleanTerms: string | null | undefined,
  meta: Partial<ContractMeta>,
): string {
  const base = stripContractMeta(cleanTerms)
  const payments = Array.isArray(meta.payments) ? meta.payments : []
  const extensions = Array.isArray(meta.extensions) ? meta.extensions : []
  if (payments.length === 0 && extensions.length === 0) {
    return base
  }
  return `${base}\n\n<!--TRK_META:${JSON.stringify({ payments, extensions })}-->`
}

export function extractPaymentsFromContracts(contracts: Contract[], dbPayments: any[] = []): any[] {
  const map = new Map<string, any>()

  for (const c of contracts) {
    const meta = parseContractMeta(c.contract_text)
    for (const p of meta.payments) {
      const mNum = p.month_number ?? p.month_index ?? 1
      const key = `${c.contract_id}-${mNum}`
      const dueDate = p.due_date || addMonths(c.start_date, mNum - 1)
      map.set(key, {
        ...p,
        contract_id: c.contract_id,
        renter_id: p.renter_id ?? c.renter_id,
        cube_id: p.cube_id ?? c.cube_id,
        month_number: mNum,
        due_date: dueDate,
        month_period: p.month_period || dueDate.slice(0, 7),
        payment_status: p.payment_status || p.status || 'Paid',
        status: p.payment_status || p.status || 'Paid',
      })
    }
  }

  for (const p of dbPayments) {
    const mNum = p.month_number ?? p.month_index ?? 1
    const key = `${p.contract_id}-${mNum}`
    map.set(key, {
      ...map.get(key),
      ...p,
      month_number: mNum,
      payment_status: p.payment_status || p.status || 'Paid',
      status: p.payment_status || p.status || 'Paid',
    })
  }

  return Array.from(map.values())
}

export function extractExtensionsFromContracts(
  contracts: Contract[],
  dbExtensions: ContractExtension[] = [],
): ContractExtension[] {
  const map = new Map<string, ContractExtension>()

  for (const c of contracts) {
    const meta = parseContractMeta(c.contract_text)
    for (const ext of meta.extensions) {
      const extId = ext.extension_id || Number(`${c.contract_id}01`)
      const key = `${c.contract_id}-${extId}`
      map.set(key, {
        ...ext,
        extension_id: extId,
        contract_id: c.contract_id,
        renter_id: ext.renter_id ?? c.renter_id,
        cube_id: ext.cube_id ?? c.cube_id,
        contracts: ext.contracts || c,
        cubes: ext.cubes || c.cubes || null,
        users: ext.users || (c.users as any) || null,
      })
    }
  }

  for (const ext of dbExtensions) {
    const c = contracts.find((item) => item.contract_id === ext.contract_id)
    const key = `${ext.contract_id}-${ext.extension_id}`
    map.set(key, {
      ...ext,
      contracts: ext.contracts || c || null,
      cubes: ext.cubes || c?.cubes || null,
      users: ext.users || (c?.users as any) || null,
    })
  }

  return Array.from(map.values()).sort((a, b) => {
    const tA = new Date(a.created_at || 0).getTime()
    const tB = new Date(b.created_at || 0).getTime()
    return tB - tA || b.extension_id - a.extension_id
  })
}

export async function saveContractPaymentInDb(
  contract: Contract,
  monthOrRecord:
    | number
    | {
        month_number: number
        due_date?: string
        amount: number
        payment_status: 'Pending' | 'Paid'
        payment_method: 'Cash' | 'Online'
        receipt_image_url?: string | null
        paid_at?: string | null
        processed_by?: number | null
      },
  paymentStatusArg?: 'Pending' | 'Paid',
  amountArg?: number,
  paymentMethodArg?: 'Cash' | 'Online',
  receiptImageUrlArg?: string | null,
  processedByArg?: number | null,
): Promise<any> {
  const nowIso = new Date().toISOString()
  const paymentRecord =
    typeof monthOrRecord === 'number'
      ? {
          month_number: monthOrRecord,
          due_date: addMonths(contract.start_date, Math.max(0, monthOrRecord - 1)),
          amount: Number(amountArg ?? contract.cubes?.price_per_month ?? 0),
          payment_status: paymentStatusArg || 'Paid',
          payment_method: paymentMethodArg || 'Cash',
          receipt_image_url: receiptImageUrlArg,
          paid_at: nowIso,
          processed_by: processedByArg ?? null,
        }
      : {
          ...monthOrRecord,
          due_date:
            monthOrRecord.due_date ||
            addMonths(contract.start_date, Math.max(0, monthOrRecord.month_number - 1)),
        }

  const mNum = paymentRecord.month_number

  // 1. Try saving to contract_payments table first
  try {
    const { data: existing } = await supabase
      .from('contract_payments')
      .select('payment_id')
      .eq('contract_id', contract.contract_id)
      .eq('month_number', mNum)
      .maybeSingle()

    if (existing?.payment_id) {
      await supabase
        .from('contract_payments')
        .update({
          payment_status: paymentRecord.payment_status,
          payment_method: paymentRecord.payment_method,
          receipt_image_url: paymentRecord.receipt_image_url ?? null,
          paid_at: paymentRecord.paid_at ?? nowIso,
          processed_by: paymentRecord.processed_by ?? null,
          updated_at: nowIso,
        })
        .eq('payment_id', existing.payment_id)
    } else {
      await supabase.from('contract_payments').insert([
        {
          contract_id: contract.contract_id,
          renter_id: contract.renter_id,
          cube_id: contract.cube_id,
          month_number: mNum,
          due_date: paymentRecord.due_date,
          amount: paymentRecord.amount,
          payment_status: paymentRecord.payment_status,
          payment_method: paymentRecord.payment_method,
          receipt_image_url: paymentRecord.receipt_image_url ?? null,
          paid_at: paymentRecord.paid_at ?? nowIso,
          processed_by: paymentRecord.processed_by ?? null,
        },
      ])
    }
  } catch {
    // Ignore if RLS blocks direct contract_payments insert; contract_text sync below guarantees persistence
  }

  // 2. Always sync into contracts.contract_text metadata in Supabase so it persists under anon RLS
  const { data: latestContract } = await supabase
    .from('contracts')
    .select('contract_text')
    .eq('contract_id', contract.contract_id)
    .maybeSingle()

  const rawText = latestContract?.contract_text ?? contract.contract_text
  const meta = parseContractMeta(rawText)
  const existingIdx = meta.payments.findIndex(
    (p) => (p.month_number ?? p.month_index ?? 1) === mNum,
  )

  const recordToSave = {
    ...(existingIdx >= 0 ? meta.payments[existingIdx] : {}),
    contract_id: contract.contract_id,
    renter_id: contract.renter_id,
    cube_id: contract.cube_id,
    month_number: mNum,
    due_date: paymentRecord.due_date,
    month_period: paymentRecord.due_date.slice(0, 7),
    amount: paymentRecord.amount,
    payment_status: paymentRecord.payment_status,
    status: paymentRecord.payment_status,
    payment_method: paymentRecord.payment_method,
    receipt_image_url:
      paymentRecord.receipt_image_url !== undefined
        ? paymentRecord.receipt_image_url
        : existingIdx >= 0
          ? meta.payments[existingIdx].receipt_image_url
          : null,
    paid_at: paymentRecord.paid_at ?? nowIso,
    processed_by: paymentRecord.processed_by ?? null,
    updated_at: nowIso,
  }

  if (existingIdx >= 0) {
    meta.payments[existingIdx] = recordToSave
  } else {
    meta.payments.push(recordToSave)
  }

  const nextContractText = buildContractTextWithMeta(rawText, meta)
  await supabase
    .from('contracts')
    .update({ contract_text: nextContractText })
    .eq('contract_id', contract.contract_id)

  return recordToSave
}

export async function saveContractExtensionInDb(
  contract: Contract,
  inputOrRenterId:
    | number
    | {
        renter_id: number
        cube_id: number | null
        requested_months: number
        notes: string | null
      },
  requestedMonthsArg?: number,
  notesArg?: string | null,
): Promise<ContractExtension> {
  const input =
    typeof inputOrRenterId === 'number'
      ? {
          renter_id: inputOrRenterId,
          cube_id: contract.cube_id,
          requested_months: requestedMonthsArg || 1,
          notes: notesArg ?? null,
        }
      : inputOrRenterId

  const nowIso = new Date().toISOString()
  let dbExtId: number | null = null

  // 1. Try inserting into contract_extensions table
  try {
    const { data, error } = await supabase
      .from('contract_extensions')
      .insert([
        {
          contract_id: contract.contract_id,
          renter_id: input.renter_id,
          cube_id: input.cube_id,
          requested_months: input.requested_months,
          notes: input.notes,
          status: 'Pending',
        },
      ])
      .select('extension_id')
      .maybeSingle()

    if (!error && data?.extension_id) {
      dbExtId = data.extension_id
    }
  } catch {
    // Fallback to contract_text metadata below
  }

  // 2. Always sync into contracts.contract_text metadata in Supabase
  const { data: latestContract } = await supabase
    .from('contracts')
    .select('contract_text')
    .eq('contract_id', contract.contract_id)
    .maybeSingle()

  const rawText = latestContract?.contract_text ?? contract.contract_text
  const meta = parseContractMeta(rawText)
  const extId = dbExtId || Date.now()

  const extRecord: ContractExtension = {
    extension_id: extId,
    contract_id: contract.contract_id,
    renter_id: input.renter_id,
    cube_id: input.cube_id,
    requested_months: input.requested_months,
    notes: input.notes,
    status: 'Pending',
    created_at: nowIso,
    updated_at: nowIso,
  }

  // Replace any existing Pending extension on this contract or append
  meta.extensions = [
    ...meta.extensions.filter((e) => e.status !== 'Pending'),
    extRecord,
  ]

  const nextContractText = buildContractTextWithMeta(rawText, meta)
  await supabase
    .from('contracts')
    .update({ contract_text: nextContractText })
    .eq('contract_id', contract.contract_id)

  return extRecord
}

export async function updateContractExtensionStatusInDb(
  extOrContract: ContractExtension | Contract,
  statusOrExtId: 'Approved' | 'Declined' | number,
  maybeStatus?: 'Approved' | 'Declined',
): Promise<void> {
  const nowIso = new Date().toISOString()
  const isThreeArg = typeof statusOrExtId === 'number'
  const contractId = extOrContract.contract_id
  const extensionId = isThreeArg
    ? statusOrExtId
    : (extOrContract as ContractExtension).extension_id
  const newStatus: 'Approved' | 'Declined' = isThreeArg
    ? maybeStatus || 'Approved'
    : (statusOrExtId as 'Approved' | 'Declined')

  try {
    await supabase
      .from('contract_extensions')
      .update({ status: newStatus, updated_at: nowIso })
      .eq('extension_id', extensionId)
  } catch {
    // Ignore if RLS blocks direct update
  }

  if (contractId) {
    const { data: latestContract } = await supabase
      .from('contracts')
      .select('contract_text')
      .eq('contract_id', contractId)
      .maybeSingle()

    if (latestContract) {
      const meta = parseContractMeta(latestContract.contract_text)
      meta.extensions = meta.extensions.map((item) =>
        item.extension_id === extensionId || item.status === 'Pending'
          ? { ...item, status: newStatus, updated_at: nowIso }
          : item,
      )
      const nextText = buildContractTextWithMeta(latestContract.contract_text, meta)
      await supabase
        .from('contracts')
        .update({ contract_text: nextText })
        .eq('contract_id', contractId)
    }
  }
}
