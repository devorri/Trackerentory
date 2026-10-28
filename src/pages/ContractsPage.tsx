import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  FileText,
  Plus,
  Search,
  Printer,
  Edit3,
  X,
  AlertTriangle,
  CheckCircle2,
  ArrowUpDown,
  Upload,
} from 'lucide-react'
import { supabase, BUCKET_DOCUMENTS } from '../lib/supabase'
import { uploadPublicImage } from '../lib/storage'
import { useAuth } from '../context/Auth'
import { addMonths, daysUntil, peso, todayISO, type Contract, type Cube, type ContractExtension } from '../lib/types'
import { SkeletonTable } from '../components/Skeleton'
import TablePagination, { DEFAULT_PAGE_SIZE } from '../components/TablePagination'
import ConfirmModal from '../components/ConfirmModal'

const DEFAULT_TERMS = `1. Renter may place products in the assigned Display or Pick-up cube only.
2. Monthly rental fee is due as agreed; Owner reserves the right to withhold renter payouts until sales inventory records match.
3. Contract may be extended from the Renter dashboard before the expiration date.
4. Upon expiry without approved extension, the cube shall automatically return to Available status.
5. Both parties may print and sign this agreement as a legally binding physical hard copy.`

type FilterStatus = 'All' | 'Active' | 'Expiring Soon' | 'Pending' | 'Expired' | 'Extension Requests' | 'Cube Payment'

export default function ContractsPage() {
  const { user } = useAuth()
  const [contracts, setContracts] = useState<Contract[]>([])
  const [cubes, setCubes] = useState<Cube[]>([])
  const [renters, setRenters] = useState<{ user_id: number; full_name: string; email?: string; phone_number?: string }[]>([])
  const [extensionRequests, setExtensionRequests] = useState<ContractExtension[]>([])
  const [approvingExtensionId, setApprovingExtensionId] = useState<number | null>(null)
  const [ownerName, setOwnerName] = useState('Arce Concept Boutique')
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('All')
  const [page, setPage] = useState(1)

  // Modals state
  const [viewingContract, setViewingContract] = useState<Contract | null>(null)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [editingContract, setEditingContract] = useState<Contract | null>(null)
  const [declineTarget, setDeclineTarget] = useState<Contract | null>(null)
  const [saving, setSaving] = useState(false)
  const [expireExistingContract, setExpireExistingContract] = useState(false)

  // Contract Payments state (for Cube Payment multi-month tracking)
  const [contractPayments, setContractPayments] = useState<any[]>([])
  const [paymentMopMap, setPaymentMopMap] = useState<Record<string, 'Cash' | 'Online'>>({})
  const [paymentReceiptMap, setPaymentReceiptMap] = useState<Record<string, string>>({})
  const [uploadingReceiptKey, setUploadingReceiptKey] = useState<string | null>(null)
  const [previewReceipt, setPreviewReceipt] = useState<string | null>(null)

  // Form states
  const [createForm, setCreateForm] = useState({
    cube_id: '',
    renter_id: '',
    start_date: todayISO(),
    end_date: addMonths(todayISO(), 1),
    status: 'Active' as Contract['status'],
    contract_text: DEFAULT_TERMS,
  })

  const activeContractOnCube = useMemo(() => {
    if (!createForm.cube_id) return null
    return contracts.find(
      (c) => c.cube_id === Number(createForm.cube_id) && (c.status === 'Active' || c.status === 'Pending')
    )
  }, [contracts, createForm.cube_id])

  const [editForm, setEditForm] = useState({
    cube_id: '',
    renter_id: '',
    start_date: '',
    end_date: '',
    status: 'Active' as Contract['status'],
    contract_text: '',
  })

  async function load() {
    setLoading(true)
    let q = supabase
      .from('contracts')
      .select('*, cubes(*), users!renter_id(full_name, email, phone_number)')
      .order('created_at', { ascending: false })

    if (user?.role === 'Renter') {
      q = q.eq('renter_id', user.user_id)
    }

    const [cRes, cubeRes, renterRes, ownerRes] = await Promise.all([
      q,
      supabase.from('cubes').select('*').order('cube_number'),
      supabase.from('users').select('user_id, full_name, email, phone_number').eq('role', 'Renter').order('full_name'),
      supabase.from('users').select('full_name').eq('role', 'Owner').limit(1).maybeSingle(),
    ])

    setLoading(false)

    if (!cRes.error) {
      setContracts((cRes.data || []) as Contract[])
    }
    if (!cubeRes.error) {
      setCubes((cubeRes.data || []) as Cube[])
    }
    if (!renterRes.error) {
      setRenters(renterRes.data || [])
    }
    if (!ownerRes.error && ownerRes.data?.full_name) setOwnerName(ownerRes.data.full_name)

    try {
      let extQuery = supabase
        .from('contract_extensions')
        .select('*, contracts(*, cubes(*)), cubes(*), users!renter_id(full_name, email, phone_number)')
        .order('created_at', { ascending: false })
      if (user?.role === 'Renter') {
        extQuery = extQuery.eq('renter_id', user.user_id)
      }
      const { data: extData, error: extErr } = await extQuery
      if (!extErr && extData) {
        setExtensionRequests(extData as ContractExtension[])
      }
    } catch {
      // table might not exist yet
    }

    try {
      const { data: payData, error: payErr } = await supabase.from('contract_payments').select('*')
      if (!payErr && payData) {
        setContractPayments(payData)
        const initialReceipts: Record<string, string> = {}
        const initialMops: Record<string, 'Cash' | 'Online'> = {}
        for (const p of payData) {
          const mNum = p.month_number ?? p.month_index
          if (mNum) {
            const k = `${p.contract_id}-${mNum}`
            if (p.receipt_image_url) initialReceipts[k] = p.receipt_image_url
            if (p.payment_method) initialMops[k] = p.payment_method as 'Cash' | 'Online'
          }
        }
        setPaymentReceiptMap((prev) => ({ ...initialReceipts, ...prev }))
        setPaymentMopMap((prev) => ({ ...initialMops, ...prev }))
      }
    } catch {
      // fallback
    }
  }

  useEffect(() => {
    void load()
  }, [user])

  const isOwner = user?.role === 'Owner'
  const isRenter = user?.role === 'Renter'

  if (!user || (!isOwner && !isRenter)) {
    return (
      <section>
        <div className="page-header">
          <div>
            <h1>Contracts</h1>
            <p className="lede">
              Owner or Renter access only. <Link to="/login">Sign in here</Link>
            </p>
          </div>
        </div>
      </section>
    )
  }

  // Quick duration helper for new contracts
  function applyDuration(months: number) {
    setCreateForm({
      ...createForm,
      end_date: addMonths(createForm.start_date || todayISO(), months),
    })
  }

  async function handleCreateContract() {
    if (!createForm.cube_id || !createForm.start_date || !createForm.end_date) {
      alert('Please fill out the cube and dates.')
      return
    }
    const renterId = isRenter ? user.user_id : Number(createForm.renter_id)
    if (!renterId) {
      alert('Please select a renter.')
      return
    }

    const cubeIdNum = Number(createForm.cube_id)
    const existingLive = contracts.find(
      (c) => c.cube_id === cubeIdNum && (c.status === 'Active' || c.status === 'Pending')
    )

    if (existingLive && !approvingExtensionId && !expireExistingContract) {
      const renterName = (existingLive.users as any)?.full_name || 'the current renter'
      const ok = window.confirm(
        `Cube already has a live agreement (#${existingLive.contract_id}) for ${renterName}.\n\nDo you want to expire the previous agreement and activate this new contract?`
      )
      if (!ok) return
    }

    setSaving(true)

    // Expire any existing live contract on this cube first so unique constraint 'contracts_one_live_contract_per_cube' is preserved
    if (existingLive) {
      const { error: expireError } = await supabase
        .from('contracts')
        .update({ status: 'Expired' })
        .eq('contract_id', existingLive.contract_id)

      if (expireError) {
        setSaving(false)
        alert('Failed to archive previous active agreement: ' + expireError.message)
        return
      }
    }

    const { error } = await supabase.from('contracts').insert([{
      renter_id: renterId,
      cube_id: cubeIdNum,
      start_date: createForm.start_date,
      end_date: createForm.end_date,
      status: createForm.status,
      contract_text: createForm.contract_text || DEFAULT_TERMS,
    }])

    if (error) {
      setSaving(false)
      if (error.message.includes('contracts_one_live_contract_per_cube')) {
        alert('This cube space already has an active or pending contract. Please expire or resolve the previous agreement first.')
      } else {
        alert('Error creating contract: ' + error.message)
      }
      return
    }

    // Set cube to Occupied if status is Active
    if (createForm.status === 'Active') {
      await supabase.from('cubes').update({ status: 'Occupied' }).eq('cube_id', cubeIdNum)
    }

    if (approvingExtensionId) {
      try {
        await supabase
          .from('contract_extensions')
          .update({ status: 'Approved' })
          .eq('extension_id', approvingExtensionId)
      } catch (e) {
        console.warn(e)
      }
      setApprovingExtensionId(null)
    }

    setSaving(false)
    setIsCreateModalOpen(false)
    setExpireExistingContract(false)
    void load()
  }

  function handleApproveExtension(ext: ContractExtension) {
    setApprovingExtensionId(ext.extension_id)
    setExpireExistingContract(true)
    const prevEnd = ext.contracts?.end_date || todayISO()
    const start = prevEnd > todayISO() ? prevEnd : todayISO()
    const end = addMonths(start, ext.requested_months || 1)
    setCreateForm({
      cube_id: String(ext.cube_id || ''),
      renter_id: String(ext.renter_id || ''),
      start_date: start,
      end_date: end,
      status: 'Active',
      contract_text: DEFAULT_TERMS,
    })
    setIsCreateModalOpen(true)
  }

  async function handleDeclineExtension(ext: ContractExtension) {
    if (!window.confirm('Are you sure you want to decline this cube extension request?')) return
    setSaving(true)
    try {
      await supabase.from('contract_extensions').update({ status: 'Declined' }).eq('extension_id', ext.extension_id)
    } catch (err) {
      console.error(err)
    }
    setSaving(false)
    void load()
  }

  function openEditModal(c: Contract) {
    setEditingContract(c)
    setEditForm({
      cube_id: String(c.cube_id || ''),
      renter_id: String(c.renter_id || ''),
      start_date: c.start_date,
      end_date: c.end_date,
      status: c.status,
      contract_text: c.contract_text || DEFAULT_TERMS,
    })
  }

  async function handleSaveEdit() {
    if (!editingContract) return
    setSaving(true)

    const { error } = await supabase
      .from('contracts')
      .update({
        cube_id: Number(editForm.cube_id) || editingContract.cube_id,
        renter_id: Number(editForm.renter_id) || editingContract.renter_id,
        start_date: editForm.start_date,
        end_date: editForm.end_date,
        status: editForm.status,
        contract_text: editForm.contract_text || null,
      })
      .eq('contract_id', editingContract.contract_id)

    setSaving(false)
    if (error) {
      if (error.message.includes('contracts_one_live_contract_per_cube')) {
        alert('Cannot activate this contract: The assigned cube already has another live agreement.')
      } else {
        alert('Error updating contract: ' + error.message)
      }
      return
    }

    setEditingContract(null)
    if (viewingContract?.contract_id === editingContract.contract_id) {
      setViewingContract(null)
    }
    void load()
  }

  async function handleUploadCubePaymentReceipt(c: Contract, monthIndex: number, file: File | null) {
    if (!file) return
    const key = `${c.contract_id}-${monthIndex}`
    setUploadingReceiptKey(key)

    const upload = await uploadPublicImage(BUCKET_DOCUMENTS, file, 'cube-payments')
    setUploadingReceiptKey(null)

    if (upload.error || !upload.url) {
      alert('Failed to upload receipt: ' + (upload.error || 'unknown error'))
      return
    }

    const receiptUrl = upload.url
    setPaymentReceiptMap((prev) => ({ ...prev, [key]: receiptUrl }))
    setPaymentMopMap((prev) => ({ ...prev, [key]: 'Online' }))

    const existing = contractPayments.find(
      (p) => p.contract_id === c.contract_id && (p.month_number === monthIndex || p.month_index === monthIndex)
    )

    if (existing?.payment_id) {
      const { error } = await supabase
        .from('contract_payments')
        .update({
          receipt_image_url: receiptUrl,
          payment_method: 'Online',
          updated_at: new Date().toISOString(),
        })
        .eq('payment_id', existing.payment_id)

      if (error) {
        console.warn('Error saving receipt to existing payment:', error)
      } else {
        setContractPayments((prev) =>
          prev.map((p) =>
            p.payment_id === existing.payment_id
              ? { ...p, receipt_image_url: receiptUrl, payment_method: 'Online' }
              : p
          )
        )
      }
    }
  }

  async function markMonthPaid(c: Contract, monthIndex: number) {
    const key = `${c.contract_id}-${monthIndex}`
    const mop = paymentMopMap[key] || 'Cash'
    const receiptUrl = paymentReceiptMap[key] || null

    if (mop === 'Online' && !receiptUrl) {
      const proceed = window.confirm(
        'You selected Online payment but have not attached a receipt proof yet.\n\nDo you want to proceed and mark as Paid anyway, or cancel to attach the receipt image first?'
      )
      if (!proceed) return
    }

    setSaving(true)
    const dueDate = addMonths(c.start_date, monthIndex - 1)
    const existing = contractPayments.find(
      (p) => p.contract_id === c.contract_id && (p.month_number === monthIndex || p.month_index === monthIndex)
    )

    try {
      if (existing?.payment_id) {
        const { error } = await supabase
          .from('contract_payments')
          .update({
            payment_status: 'Paid',
            status: 'Paid',
            payment_method: mop,
            receipt_image_url: receiptUrl || existing.receipt_image_url || null,
            paid_at: new Date().toISOString(),
            payment_date: new Date().toISOString(),
            processed_by: user?.user_id,
            updated_at: new Date().toISOString(),
          })
          .eq('payment_id', existing.payment_id)

        if (!error) {
          setContractPayments((prev) =>
            prev.map((p) =>
              p.payment_id === existing.payment_id
                ? {
                    ...p,
                    payment_status: 'Paid',
                    status: 'Paid',
                    payment_method: mop,
                    receipt_image_url: receiptUrl || existing.receipt_image_url || null,
                    paid_at: new Date().toISOString(),
                  }
                : p
            )
          )
        }
      } else {
        const insertPayload: any = {
          contract_id: c.contract_id,
          renter_id: c.renter_id,
          cube_id: c.cube_id,
          month_number: monthIndex,
          due_date: dueDate,
          amount: c.cubes?.price_per_month || 0,
          payment_status: 'Paid',
          payment_method: mop,
          receipt_image_url: receiptUrl || null,
          paid_at: new Date().toISOString(),
          processed_by: user?.user_id,
        }

        let { data, error } = await supabase
          .from('contract_payments')
          .insert([insertPayload])
          .select()

        if (error && (error.message.includes('month_number') || error.message.includes('payment_status'))) {
          delete insertPayload.month_number
          delete insertPayload.payment_status
          insertPayload.month_index = monthIndex
          insertPayload.status = 'Paid'
          insertPayload.payment_date = new Date().toISOString()
          const retry = await supabase.from('contract_payments').insert([insertPayload]).select()
          data = retry.data
          error = retry.error
        }

        if (error) {
          console.warn('contract_payments insert error, updating local state:', error)
          setContractPayments((prev) => [
            ...prev.filter((p) => !(p.contract_id === c.contract_id && (p.month_number === monthIndex || p.month_index === monthIndex))),
            {
              contract_id: c.contract_id,
              renter_id: c.renter_id,
              cube_id: c.cube_id,
              month_number: monthIndex,
              due_date: dueDate,
              amount: c.cubes?.price_per_month || 0,
              payment_status: 'Paid',
              status: 'Paid',
              payment_method: mop,
              receipt_image_url: receiptUrl || null,
              paid_at: new Date().toISOString(),
            },
          ])
        } else if (data && data[0]) {
          setContractPayments((prev) => [
            ...prev.filter((p) => !(p.contract_id === c.contract_id && (p.month_number === monthIndex || p.month_index === monthIndex))),
            data[0],
          ])
        }
      }
    } catch (err) {
      console.error(err)
    }

    setSaving(false)
    void load()
  }

  // Segregate Renters into Display vs Pick-up
  const displayRenters = useMemo(() => {
    const displayRenterIds = new Set(
      contracts.filter((c) => c.cubes?.type === 'Display').map((c) => c.renter_id)
    )
    return renters.filter((r) => displayRenterIds.has(r.user_id))
  }, [contracts, renters])

  const pickupRenters = useMemo(() => {
    const pickupRenterIds = new Set(
      contracts.filter((c) => c.cubes?.type === 'Pick-up').map((c) => c.renter_id)
    )
    return renters.filter((r) => pickupRenterIds.has(r.user_id))
  }, [contracts, renters])

  const otherRenters = useMemo(() => {
    const existingIds = new Set(contracts.map((c) => c.renter_id))
    return renters.filter((r) => !existingIds.has(r.user_id))
  }, [contracts, renters])

  async function handleApprovePending(c: Contract) {
    setSaving(true)
    const { error } = await supabase.from('contracts').update({ status: 'Active' }).eq('contract_id', c.contract_id)
    if (error) {
      setSaving(false)
      return alert('Error approving contract: ' + error.message)
    }
    if (c.cube_id) {
      await supabase.from('cubes').update({ status: 'Occupied' }).eq('cube_id', c.cube_id)
      if (c.renter_id) {
        await supabase
          .from('reservations')
          .update({ status: 'Confirmed' })
          .eq('cube_id', c.cube_id)
          .eq('customer_id', c.renter_id)
          .eq('status', 'Pending')
      }
    }
    setSaving(false)
    alert(`Contract #${c.contract_id} approved and activated!`)
    void load()
  }

  async function confirmDeclineContract() {
    if (!declineTarget) return
    const c = declineTarget
    setDeclineTarget(null)
    setSaving(true)
    const { error } = await supabase.from('contracts').delete().eq('contract_id', c.contract_id)
    if (error) {
      setSaving(false)
      return alert('Error declining contract: ' + error.message)
    }
    if (c.cube_id) {
      await supabase.from('cubes').update({ status: 'Available' }).eq('cube_id', c.cube_id)
      if (c.renter_id) {
        await supabase
          .from('reservations')
          .update({ status: 'Cancelled' })
          .eq('cube_id', c.cube_id)
          .eq('customer_id', c.renter_id)
          .eq('status', 'Pending')
      }
    }
    setSaving(false)
    void load()
  }

  // Print agreement in formal document format
  function printAgreement(c: Contract) {
    // A hidden frame keeps printing inside the application and avoids relying
    // on a browser pop-up window, which is commonly blocked on mobile.
    const printFrame = document.createElement('iframe')
    printFrame.title = 'Rental agreement print preview'
    printFrame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
    document.body.appendChild(printFrame)
    const printWindow = printFrame.contentWindow
    if (!printWindow) {
      printFrame.remove()
      alert('The agreement could not be prepared for printing. Please try again.')
      return
    }

    const renterName = (c.users as any)?.full_name || `User #${c.renter_id}`
    const cubeNum = c.cubes?.cube_number || `#${c.cube_id}`
    const cubeType = c.cubes?.type || 'Standard Cube'
    const cubePrice = c.cubes?.price_per_month ? peso(c.cubes.price_per_month) : '₱0.00'
    const daysLeft = daysUntil(c.end_date)
    const terms = c.contract_text || DEFAULT_TERMS

    const html = `<!doctype html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <title>Cube Rental Agreement - #${c.contract_id}</title>
          <style>
            @page { margin: 20mm; size: A4; }
            * { box-sizing: border-box; }
            body {
              margin: 0;
              font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif;
              color: #1e293b;
              background: #fff;
              line-height: 1.6;
              font-size: 13.5px;
            }
            .paper {
              max-width: 800px;
              margin: 0 auto;
              padding: 2.5rem;
              border: 1px solid #cbd5e1;
            }
            .header-bar {
              border-bottom: 3px double #0f172a;
              padding-bottom: 1.25rem;
              margin-bottom: 1.5rem;
              text-align: center;
            }
            .brand-title {
              font-size: 24px;
              font-weight: 900;
              letter-spacing: 1.5px;
              text-transform: uppercase;
              color: #0f172a;
              margin: 0;
            }
            .brand-sub {
              font-size: 11px;
              color: #64748b;
              text-transform: uppercase;
              letter-spacing: 2px;
              margin-top: 4px;
            }
            .doc-title {
              font-size: 18px;
              font-weight: 800;
              margin-top: 1.2rem;
              text-align: center;
              letter-spacing: 0.5px;
            }
            .meta-grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 1.25rem;
              background: #f8fafc;
              border: 1px solid #e2e8f0;
              padding: 1.2rem;
              border-radius: 8px;
              margin-bottom: 1.5rem;
            }
            .meta-item { margin-bottom: 0.35rem; }
            .meta-label { font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 700; }
            .meta-value { font-size: 14px; font-weight: 600; color: #0f172a; }
            .section-title {
              font-size: 13px;
              font-weight: 800;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              color: #0f172a;
              border-bottom: 1px solid #e2e8f0;
              padding-bottom: 0.35rem;
              margin-top: 1.5rem;
              margin-bottom: 0.75rem;
            }
            .terms-body {
              white-space: pre-wrap;
              line-height: 1.8;
              color: #334155;
              background: #fafafa;
              padding: 1rem 1.25rem;
              border-left: 3px solid #0f172a;
              border-radius: 4px;
              font-size: 13px;
            }
            .signature-grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 3rem;
              margin-top: 3.5rem;
              padding-top: 1rem;
            }
            .sig-block {
              text-align: center;
            }
            .sig-line {
              border-bottom: 1.5px solid #0f172a;
              height: 48px;
              margin-bottom: 8px;
            }
            .sig-name { font-weight: 700; font-size: 14px; }
            .sig-role { font-size: 12px; color: #64748b; }
            @media print {
              body { padding: 0; }
              .paper { border: none; padding: 0; max-width: none; }
            }
          </style>
        </head>
        <body>
          <div class="paper">
            <div class="header-bar">
              <div class="brand-title">Arce Concept Boutique</div>
              <div class="brand-sub">Cube Rental</div>
              <div class="doc-title">Arce Concept Boutique Rental Agreement</div>
            </div>

            <div class="meta-grid">
              <div>
                <div class="meta-item">
                  <div class="meta-label">Contract Identification</div>
                  <div class="meta-value">Agreement #${c.contract_id} (${c.status})</div>
                </div>
                <div class="meta-item">
                  <div class="meta-label">Lessee / Cube Renter</div>
                  <div class="meta-value">${renterName}</div>
                </div>
                <div class="meta-item">
                  <div class="meta-label">Lessor / Store Owner</div>
                  <div class="meta-value">${ownerName}</div>
                </div>
              </div>
              <div>
                <div class="meta-item">
                  <div class="meta-label">Assigned Cube Space</div>
                  <div class="meta-value">Cube ${cubeNum} · ${cubeType}</div>
                </div>
                <div class="meta-item">
                  <div class="meta-label">Monthly Rental Rate</div>
                  <div class="meta-value">${cubePrice} / month</div>
                </div>
                <div class="meta-item">
                  <div class="meta-label">Lease Duration</div>
                  <div class="meta-value">${c.start_date} to ${c.end_date} (${daysLeft >= 0 ? `${daysLeft} days left` : 'Expired'})</div>
                </div>
              </div>
            </div>

            <div class="section-title">Terms, Conditions & Consignment Guidelines</div>
            <div class="terms-body">${terms}</div>

            <div class="signature-grid">
              <div class="sig-block">
                <div class="sig-line"></div>
                <div class="sig-name">${ownerName}</div>
                <div class="sig-role">Authorized Owner Signature</div>
              </div>
              <div class="sig-block">
                <div class="sig-line"></div>
                <div class="sig-name">${renterName}</div>
                <div class="sig-role">Lessee / Renter Signature</div>
              </div>
            </div>
          </div>
        </body>
      </html>`

    printWindow.document.open()
    printWindow.document.write(html)
    printWindow.document.close()
    setTimeout(() => {
      printWindow.focus()
      printWindow.print()
      window.setTimeout(() => printFrame.remove(), 1_000)
    }, 400)
  }

  // Sorting State
  // Newly requested/reserved cubes belong at the top by default.
  const [sortConfig, setSortConfig] = useState<{ col: string; dir: 'asc' | 'desc' }>({ col: 'created', dir: 'desc' })

  function renderSortIndicator(col: string) {
    if (sortConfig.col !== col) {
      return <ArrowUpDown size={12} style={{ opacity: 0.35, marginLeft: 4, verticalAlign: 'middle', display: 'inline' }} />
    }
    return <span style={{ marginLeft: 4, fontSize: '0.72rem' }}>{sortConfig.dir === 'asc' ? '▲' : '▼'}</span>
  }

  function toggleSort(col: string) {
    if (sortConfig.col === col) {
      setSortConfig({ col, dir: sortConfig.dir === 'asc' ? 'desc' : 'asc' })
    } else {
      setSortConfig({ col, dir: 'asc' })
    }
  }

  // Filtered, searched, and sorted data
  const filteredContracts = useMemo(() => {
    const list = contracts.filter((c) => {
      const renterName = (c.users as any)?.full_name || ''
      const cubeNum = c.cubes?.cube_number || ''
      const contractId = String(c.contract_id)
      const q = search.toLowerCase()

      const matchesSearch =
        renterName.toLowerCase().includes(q) ||
        cubeNum.toLowerCase().includes(q) ||
        contractId.includes(q)

      if (!matchesSearch) return false

      const days = daysUntil(c.end_date)
      if (filterStatus === 'Active') return c.status === 'Active' && days > 7
      if (filterStatus === 'Expiring Soon') return c.status === 'Active' && days >= 0 && days <= 7
      if (filterStatus === 'Pending') return c.status === 'Pending'
      if (filterStatus === 'Expired') return c.status === 'Expired' || days < 0

      return true
    })

    const { col, dir } = sortConfig
    list.sort((a, b) => {
      let vA: any = ''
      let vB: any = ''
      if (col === 'contract') {
        vA = a.contract_id
        vB = b.contract_id
      } else if (col === 'renter') {
        vA = (a.users as any)?.full_name || ''
        vB = (b.users as any)?.full_name || ''
      } else if (col === 'cube') {
        vA = a.cubes?.cube_number || ''
        vB = b.cubes?.cube_number || ''
      } else if (col === 'rate') {
        vA = a.cubes?.price_per_month || 0
        vB = b.cubes?.price_per_month || 0
      } else if (col === 'period') {
        vA = a.end_date || ''
        vB = b.end_date || ''
      } else if (col === 'created') {
        vA = a.created_at || a.contract_id
        vB = b.created_at || b.contract_id
      } else if (col === 'status') {
        vA = a.status || ''
        vB = b.status || ''
      }
      if (vA < vB) return dir === 'asc' ? -1 : 1
      if (vA > vB) return dir === 'asc' ? 1 : -1
      return 0
    })

    return list
  }, [contracts, search, filterStatus, sortConfig])

  useEffect(() => setPage(1), [search, filterStatus, sortConfig, contracts])
  const pagedContracts = filteredContracts.slice((page - 1) * DEFAULT_PAGE_SIZE, page * DEFAULT_PAGE_SIZE)

  // Summary Metrics
  const metrics = useMemo(() => {
    const total = contracts.length
    const active = contracts.filter((c) => c.status === 'Active' && daysUntil(c.end_date) > 7).length
    const pending = contracts.filter((c) => c.status === 'Pending').length
    const expiring = contracts.filter((c) => c.status === 'Active' && daysUntil(c.end_date) >= 0 && daysUntil(c.end_date) <= 7).length
    const expired = contracts.filter((c) => c.status === 'Expired' || daysUntil(c.end_date) < 0).length
    const monthlyIncome = contracts
      .filter((c) => c.status === 'Active')
      .reduce((sum, c) => sum + (c.cubes?.price_per_month || 0), 0)

    return { total, active, pending, expiring, expired, monthlyIncome }
  }, [contracts])

  return (
    <section>
      {/* ── Page Header ── */}
      <div className="page-header">
        <div>
          <h1>Contracts Management</h1>
          <p className="lede">
            Oversee cube rental agreements, track active durations, edit lease conditions, and generate printable hard copies.
          </p>
        </div>
        {isOwner && (
          <div className="row no-print">
            <button
              className="btn"
              type="button"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}
              onClick={() => setIsCreateModalOpen(true)}
            >
              <Plus size={18} /> New Contract
            </button>
          </div>
        )}
      </div>

      {/* ── Summary Stats (Item 20: 3 cards removed) ── */}
      <div className="grid no-print" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.75rem' }}>
        <div className="panel" style={{ padding: '1.15rem' }}>
          <div className="muted" style={{ fontSize: '0.82rem', fontWeight: 700, textTransform: 'uppercase' }}>Total Agreements</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, marginTop: '0.3rem' }}>{metrics.total}</div>
        </div>
        <div className="panel" style={{ padding: '1.15rem', borderLeft: '4px solid #16a34a' }}>
          <div className="muted" style={{ fontSize: '0.82rem', fontWeight: 700, textTransform: 'uppercase' }}>Active Contracts</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#16a34a', marginTop: '0.3rem' }}>{metrics.active}</div>
        </div>
        <div className="panel" style={{ padding: '1.15rem', borderLeft: '4px solid #dc2626' }}>
          <div className="muted" style={{ fontSize: '0.82rem', fontWeight: 700, textTransform: 'uppercase' }}>Expired</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#dc2626', marginTop: '0.3rem' }}>{metrics.expired}</div>
        </div>
      </div>

      {/* ── Filter & Search Toolbar ── */}
      <div className="row no-print" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', gap: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          {(['All', 'Active', 'Expiring Soon', 'Pending', 'Expired'] as FilterStatus[]).map((st) => (
            <button
              key={st}
              type="button"
              className={filterStatus === st ? 'btn' : 'btn-ghost'}
              style={{ fontSize: '0.85rem', padding: '0.45rem 0.9rem' }}
              onClick={() => setFilterStatus(st)}
            >
              {st}
            </button>
          ))}
          {isOwner && (
            <>
              <button
                type="button"
                className={filterStatus === 'Extension Requests' ? 'btn' : 'btn-ghost'}
                style={{ fontSize: '0.85rem', padding: '0.45rem 0.9rem' }}
                onClick={() => setFilterStatus('Extension Requests')}
              >
                Extension Requests {extensionRequests.filter((e) => e.status === 'Pending').length > 0 && `(${extensionRequests.filter((e) => e.status === 'Pending').length})`}
              </button>
              <button
                type="button"
                className={filterStatus === 'Cube Payment' ? 'btn' : 'btn-ghost'}
                style={{ fontSize: '0.85rem', padding: '0.45rem 0.9rem' }}
                onClick={() => setFilterStatus('Cube Payment')}
              >
                Cube Payment
              </button>
            </>
          )}
        </div>

        <div style={{ position: 'relative', minWidth: 260 }}>
          <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: 12, top: 12 }} />
          <input
            type="text"
            placeholder="Search renter, cube, ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: '2.4rem', margin: 0, height: 40 }}
          />
        </div>
      </div>

      {/* ── Contracts / Extension Requests Table ── */}
      {loading ? (
        <SkeletonTable rows={5} cols={7} />
      ) : filterStatus === 'Extension Requests' ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Renter</th>
                <th>Assigned Cube</th>
                <th>Expired Lease Period</th>
                <th>Requested Duration</th>
                <th>Submitted Date</th>
                <th>Notes</th>
                <th>Status</th>
                <th style={{ textAlign: 'right', minWidth: 160 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {extensionRequests.map((ext) => {
                const prevContract = ext.contracts
                const renterName = (ext.users as any)?.full_name || 'Renter'
                const cubeNum = ext.cubes?.cube_number || prevContract?.cubes?.cube_number || '—'
                return (
                  <tr key={ext.extension_id}>
                    <td>
                      <strong>{renterName}</strong>
                      {(ext.users as any)?.email && <div className="muted" style={{ fontSize: '0.78rem' }}>{(ext.users as any).email}</div>}
                    </td>
                    <td>
                      <span className="badge info">Cube #{cubeNum}</span>
                    </td>
                    <td>
                      {prevContract ? (
                        <div>
                          <span>{prevContract.start_date} → {prevContract.end_date}</span>
                          <div className="muted" style={{ fontSize: '0.75rem', color: '#dc2626' }}>Expired</div>
                        </div>
                      ) : '—'}
                    </td>
                    <td>
                      <strong>+{ext.requested_months} Month{ext.requested_months > 1 ? 's' : ''}</strong>
                    </td>
                    <td>{ext.created_at ? new Date(ext.created_at).toLocaleDateString() : '—'}</td>
                    <td>
                      <span style={{ fontSize: '0.82rem', color: '#555' }}>{ext.notes || '—'}</span>
                    </td>
                    <td>
                      <span className={`status-pill ${ext.status === 'Approved' ? 'confirmed' : ext.status === 'Declined' ? 'cancelled' : 'pending'}`}>
                        {ext.status}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {ext.status === 'Pending' ? (
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            className="btn"
                            style={{ padding: '0.3rem 0.65rem', fontSize: '0.78rem', background: '#16a34a', color: '#fff', border: 'none' }}
                            onClick={() => handleApproveExtension(ext)}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="btn-ghost"
                            style={{ padding: '0.3rem 0.65rem', fontSize: '0.78rem', color: '#dc2626' }}
                            onClick={() => void handleDeclineExtension(ext)}
                          >
                            Decline
                          </button>
                        </div>
                      ) : (
                        <span className="muted" style={{ fontSize: '0.8rem' }}>Resolved</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {extensionRequests.length === 0 && <div className="empty" style={{ padding: '2rem' }}>No extension requests submitted yet.</div>}
        </div>
      ) : filterStatus === 'Cube Payment' ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Contract #</th>
                <th>Renter</th>
                <th>Assigned Cube</th>
                <th>Monthly Rate</th>
                <th>Lease Period</th>
                <th>Installment / Month</th>
                <th>Payment Status</th>
                <th>Mode of Payment</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {contracts
                .filter((c) => {
                  if (!search.trim()) return true
                  const q = search.toLowerCase()
                  const rName = ((c.users as any)?.full_name || '').toLowerCase()
                  const cubeNum = (c.cubes?.cube_number || '').toLowerCase()
                  return rName.includes(q) || cubeNum.includes(q) || String(c.contract_id).includes(q)
                })
                .flatMap((c) => {
                  const startD = new Date(c.start_date)
                  const endD = new Date(c.end_date)
                  const diffMonths = Math.max(1, Math.round((endD.getTime() - startD.getTime()) / (1000 * 60 * 60 * 24 * 30)))
                  const renterName = (c.users as any)?.full_name || 'Renter'
                  const cubeNum = c.cubes?.cube_number || `#${c.cube_id}`
                  const cubeType = c.cubes?.type || '—'
                  const rate = c.cubes?.price_per_month || 0

                  return Array.from({ length: diffMonths }, (_, i) => {
                    const monthIndex = i + 1
                    const isMonth1 = monthIndex === 1
                    const record = contractPayments.find(
                      (p) => p.contract_id === c.contract_id && (p.month_number === monthIndex || p.month_index === monthIndex)
                    )
                    const isPaid = (record?.payment_status === 'Paid' || record?.status === 'Paid') || (isMonth1 && !record)
                    const key = `${c.contract_id}-${monthIndex}`
                    const mop = record?.payment_method || paymentMopMap[key] || 'Cash'
                    const receiptUrl = record?.receipt_image_url || paymentReceiptMap[key] || null
                    const isUploading = uploadingReceiptKey === key

                    return (
                      <tr key={`${c.contract_id}-m${monthIndex}`}>
                        <td><strong>#{c.contract_id}</strong></td>
                        <td><strong>{renterName}</strong></td>
                        <td>
                          <span className="badge info">Cube #{cubeNum} ({cubeType})</span>
                        </td>
                        <td>{peso(rate)}</td>
                        <td>
                          <span style={{ fontSize: '0.82rem' }}>{c.start_date} → {c.end_date}</span>
                        </td>
                        <td>
                          <strong>Month {monthIndex} of {diffMonths}</strong>
                          {isMonth1 && <span className="muted" style={{ fontSize: '0.72rem', display: 'block' }}>Initial Advance</span>}
                        </td>
                        <td>
                          <span className={`status-pill ${isPaid ? 'confirmed' : 'pending'}`}>
                            {isPaid ? 'Paid' : 'Pending'}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 140 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              {isPaid ? (
                                <span className={`badge ${mop === 'Online' ? 'info' : 'ok'}`} style={{ fontWeight: 700 }}>
                                  {mop}
                                </span>
                              ) : (
                                <select
                                  value={mop}
                                  onChange={(e) => {
                                    const nextMop = e.target.value as 'Cash' | 'Online'
                                    setPaymentMopMap((prev) => ({ ...prev, [key]: nextMop }))
                                  }}
                                  style={{ padding: '0.22rem 0.5rem', fontSize: '0.78rem', borderRadius: 6, fontWeight: 600 }}
                                >
                                  <option value="Cash">Cash</option>
                                  <option value="Online">Online</option>
                                </select>
                              )}

                              {isPaid && isOwner && (
                                <button
                                  type="button"
                                  className="btn-ghost"
                                  style={{ fontSize: '0.68rem', padding: '1px 5px', color: '#64748b' }}
                                  onClick={() => {
                                    const nextMop = mop === 'Cash' ? 'Online' : 'Cash'
                                    setPaymentMopMap((prev) => ({ ...prev, [key]: nextMop }))
                                    if (record?.payment_id) {
                                      void supabase
                                        .from('contract_payments')
                                        .update({ payment_method: nextMop, updated_at: new Date().toISOString() })
                                        .eq('payment_id', record.payment_id)
                                        .then(() => void load())
                                    }
                                  }}
                                  title="Change mode of payment"
                                >
                                  Edit
                                </button>
                              )}
                            </div>

                            {/* Online Receipt Attachment / Preview */}
                            {mop === 'Online' && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                                {receiptUrl ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <img
                                      src={receiptUrl}
                                      alt="Payment Receipt"
                                      style={{
                                        width: 34,
                                        height: 34,
                                        objectFit: 'cover',
                                        borderRadius: 4,
                                        cursor: 'pointer',
                                        border: '1px solid #cbd5e1',
                                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                                      }}
                                      onClick={() => setPreviewReceipt(receiptUrl)}
                                      title="Click to view full receipt"
                                    />
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                      <label
                                        style={{
                                          fontSize: '0.7rem',
                                          cursor: isUploading ? 'not-allowed' : 'pointer',
                                          color: '#2563eb',
                                          textDecoration: 'underline',
                                          fontWeight: 600,
                                        }}
                                      >
                                        {isUploading ? 'Uploading…' : 'Change image'}
                                        <input
                                          type="file"
                                          accept="image/*"
                                          style={{ display: 'none' }}
                                          disabled={isUploading}
                                          onChange={(e) => {
                                            const f = e.target.files?.[0] || null
                                            void handleUploadCubePaymentReceipt(c, monthIndex, f)
                                            e.target.value = ''
                                          }}
                                        />
                                      </label>
                                      <button
                                        type="button"
                                        className="btn-ghost"
                                        style={{ fontSize: '0.68rem', padding: 0, color: '#0284c7', textAlign: 'left', fontWeight: 600 }}
                                        onClick={() => setPreviewReceipt(receiptUrl)}
                                      >
                                        View
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <label
                                    style={{
                                      fontSize: '0.72rem',
                                      cursor: isUploading ? 'not-allowed' : 'pointer',
                                      color: '#2563eb',
                                      textDecoration: 'underline',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 4,
                                      fontWeight: 600,
                                      background: '#eff6ff',
                                      padding: '3px 8px',
                                      borderRadius: 6,
                                      border: '1px dashed #93c5fd',
                                    }}
                                  >
                                    <Upload size={12} />
                                    {isUploading ? 'Uploading…' : 'Attach image'}
                                    <input
                                      type="file"
                                      accept="image/*"
                                      style={{ display: 'none' }}
                                      disabled={isUploading}
                                      onChange={(e) => {
                                        const f = e.target.files?.[0] || null
                                        void handleUploadCubePaymentReceipt(c, monthIndex, f)
                                        e.target.value = ''
                                      }}
                                    />
                                  </label>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {isPaid ? (
                            <span className="badge ok" style={{ fontSize: '0.74rem' }}>Paid</span>
                          ) : (
                            <button
                              className="btn"
                              type="button"
                              style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', background: '#16a34a', color: '#fff', border: 'none' }}
                              onClick={() => void markMonthPaid(c, monthIndex)}
                            >
                              Mark as Paid
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })
                })}
            </tbody>
          </table>
          {contracts.length === 0 && <div className="empty" style={{ padding: '2rem' }}>No contracts registered for cube payment tracking.</div>}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 110, cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('contract')}>
                  Contract {renderSortIndicator('contract')}
                </th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('renter')}>
                  Renter {renderSortIndicator('renter')}
                </th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('cube')}>
                  Assigned Cube {renderSortIndicator('cube')}
                </th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('rate')}>
                  Monthly Rate {renderSortIndicator('rate')}
                </th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('period')}>
                  Period {renderSortIndicator('period')}
                </th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('status')}>
                  Status & Validity {renderSortIndicator('status')}
                </th>
                <th style={{ textAlign: 'right', minWidth: 160 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pagedContracts.map((c) => {
                const daysLeft = daysUntil(c.end_date)
                const isExpiringSoon = c.status === 'Active' && daysLeft >= 0 && daysLeft <= 7
                const isPast = c.status === 'Expired' || daysLeft < 0

                return (
                  <tr key={c.contract_id}>
                    <td>
                      <strong>#{c.contract_id}</strong>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{(c.users as any)?.full_name || `Renter #${c.renter_id}`}</div>
                      {(c.users as any)?.email && <div className="muted" style={{ fontSize: '0.78rem' }}>{(c.users as any).email}</div>}
                      {(c.users as any)?.phone_number && <div className="muted" style={{ fontSize: '0.78rem' }}>{(c.users as any).phone_number}</div>}
                    </td>
                    <td>
                      <strong>Cube {c.cubes?.cube_number || `#${c.cube_id}`}</strong>
                      {c.cubes?.type && (
                        <div style={{ marginTop: 2 }}>
                          <span className={`badge ${c.cubes.type === 'Pick-up' ? 'pickup' : 'info'}`} style={{ fontSize: '0.72rem' }}>
                            {c.cubes.type}
                          </span>
                        </div>
                      )}
                    </td>
                    <td>
                      <strong>{c.cubes?.price_per_month ? peso(c.cubes.price_per_month) : '—'}</strong>
                      <span className="muted" style={{ fontSize: '0.75rem' }}> / mo</span>
                    </td>
                    <td>
                      <div>{c.start_date}</div>
                      <div className="muted" style={{ fontSize: '0.78rem' }}>to {c.end_date}</div>
                    </td>
                    <td>
                      {isExpiringSoon ? (
                        <span className="badge warn" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                          <AlertTriangle size={12} /> {daysLeft}d left (Expiring)
                        </span>
                      ) : isPast ? (
                        <span className="badge bad">Expired</span>
                      ) : c.status === 'Active' ? (
                        <span className="badge ok" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                          <CheckCircle2 size={12} /> Active ({daysLeft}d left)
                        </span>
                      ) : (
                        <span className="badge info">{c.status}</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="row" style={{ justifyContent: 'flex-end', gap: '0.4rem' }}>
                        {isOwner && c.status === 'Pending' && (
                          <>
                            <button
                              className="btn"
                              type="button"
                              style={{ padding: '0.35rem 0.65rem', fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                              onClick={() => void handleApprovePending(c)}
                              title="Approve and activate contract"
                            >
                              <CheckCircle2 size={14} /> Approve
                            </button>
                            <button
                              className="btn-ghost"
                              type="button"
                              style={{ padding: '0.35rem 0.65rem', fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: '#dc2626' }}
                              onClick={() => setDeclineTarget(c)}
                              title="Decline reservation & release cube"
                            >
                              <X size={14} /> Decline
                            </button>
                          </>
                        )}
                        <button
                          className="btn-ghost"
                          type="button"
                          style={{ padding: '0.35rem 0.65rem', fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                          onClick={() => setViewingContract(c)}
                        >
                          <FileText size={14} /> View Agreement
                        </button>
                        {isOwner && (
                          <button
                            className="btn-ghost"
                            type="button"
                            style={{ padding: '0.35rem 0.65rem', fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                            onClick={() => openEditModal(c)}
                          >
                            <Edit3 size={14} /> Edit
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <TablePagination page={page} totalItems={filteredContracts.length} onPageChange={setPage} />

          {filteredContracts.length === 0 && (
            <div className="empty" style={{ padding: '3rem 1.5rem' }}>
              No rental contracts match the selected filter.
            </div>
          )}
        </div>
      )}

      {/* ════════════ VIEW & PRINT AGREEMENT MODAL ════════════ */}
      {viewingContract && (
        <div className="modal-overlay" onClick={() => setViewingContract(null)}>
          <div
            className="modal-card"
            style={{ maxWidth: 760, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header" style={{ marginBottom: '1rem' }}>
              <div>
                <h3 style={{ margin: 0 }}>Rental Agreement #{viewingContract.contract_id}</h3>
                <span className="muted" style={{ fontSize: '0.85rem' }}>
                  Cube {viewingContract.cubes?.cube_number || `#${viewingContract.cube_id}`} · Status: {viewingContract.status}
                </span>
              </div>
              <button className="modal-close" onClick={() => setViewingContract(null)}>
                <X size={18} />
              </button>
            </div>

            {/* Document Paper Container */}
            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                borderRadius: 12,
                padding: '1.75rem',
                color: '#1e293b',
              }}
            >
              <div style={{ textAlign: 'center', borderBottom: '2px solid #e2e8f0', paddingBottom: '1rem', marginBottom: '1.25rem' }}>
                <h2 style={{ margin: 0, fontSize: '1.3rem', letterSpacing: '0.5px' }}>Arce Concept Boutique Rental Agreement</h2>
                <div style={{ fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', marginTop: 4 }}>
                  Arce Concept Boutique
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
                <div style={{ background: '#fff', padding: '0.85rem', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Lessor / Owner</div>
                  <div style={{ fontWeight: 700, marginTop: 2 }}>{ownerName}</div>
                  <div className="muted" style={{ fontSize: '0.82rem' }}>Store Owner</div>
                </div>

                <div style={{ background: '#fff', padding: '0.85rem', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Lessee / Renter</div>
                  <div style={{ fontWeight: 700, marginTop: 2 }}>
                    {(viewingContract.users as any)?.full_name || `User #${viewingContract.renter_id}`}
                  </div>
                  <div className="muted" style={{ fontSize: '0.82rem' }}>
                    {(viewingContract.users as any)?.phone_number || (viewingContract.users as any)?.email || 'Registered Renter'}
                  </div>
                </div>
              </div>

              <div style={{ background: '#fff', padding: '1rem', borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: '1.25rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem' }}>
                  <div>
                    <span className="muted" style={{ fontSize: '0.75rem' }}>Cube Number</span>
                    <div style={{ fontWeight: 700 }}>Cube {viewingContract.cubes?.cube_number || `#${viewingContract.cube_id}`}</div>
                  </div>
                  <div>
                    <span className="muted" style={{ fontSize: '0.75rem' }}>Cube Type</span>
                    <div style={{ fontWeight: 700 }}>{viewingContract.cubes?.type || 'Standard'}</div>
                  </div>
                  <div>
                    <span className="muted" style={{ fontSize: '0.75rem' }}>Monthly Rate</span>
                    <div style={{ fontWeight: 700, color: '#16a34a' }}>
                      {viewingContract.cubes?.price_per_month ? peso(viewingContract.cubes.price_per_month) : '₱0.00'}
                    </div>
                  </div>
                  <div>
                    <span className="muted" style={{ fontSize: '0.75rem' }}>Term Validity</span>
                    <div style={{ fontWeight: 700 }}>
                      {viewingContract.start_date} → {viewingContract.end_date}
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.4rem', color: '#0f172a' }}>
                  Terms & Conditions
                </div>
                <div
                  style={{
                    background: '#fff',
                    padding: '1rem 1.25rem',
                    borderRadius: 8,
                    border: '1px solid #e2e8f0',
                    fontSize: '0.88rem',
                    lineHeight: 1.7,
                    whiteSpace: 'pre-wrap',
                    color: '#334155',
                  }}
                >
                  {viewingContract.contract_text || DEFAULT_TERMS}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginTop: '2.5rem', textAlign: 'center' }}>
                <div>
                  <div style={{ borderBottom: '1.5px solid #64748b', height: 35, marginBottom: 6 }}></div>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>Store Owner / Representative</div>
                  <div className="muted" style={{ fontSize: '0.75rem' }}>Authorized Signature</div>
                </div>
                <div>
                  <div style={{ borderBottom: '1.5px solid #64748b', height: 35, marginBottom: 6 }}></div>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>
                    {(viewingContract.users as any)?.full_name || `Renter #${viewingContract.renter_id}`}
                  </div>
                  <div className="muted" style={{ fontSize: '0.75rem' }}>Lessee Signature</div>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: '1.25rem', gap: '0.75rem' }}>
              <button className="btn-ghost" type="button" onClick={() => setViewingContract(null)}>
                Close
              </button>
              {isOwner && (
                <button
                  className="btn-ghost"
                  type="button"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                  onClick={() => {
                    openEditModal(viewingContract)
                    setViewingContract(null)
                  }}
                >
                  <Edit3 size={15} /> Edit Terms
                </button>
              )}
              <button
                className="btn"
                type="button"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                onClick={() => printAgreement(viewingContract)}
              >
                <Printer size={16} /> Print Hard Copy
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════ CREATE CONTRACT MODAL ════════════ */}
      {isCreateModalOpen && (
        <div className="modal-overlay" onClick={() => setIsCreateModalOpen(false)}>
          <div className="modal-card" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ margin: 0 }}>Create New Cube Rental Contract</h3>
              <button className="modal-close" onClick={() => setIsCreateModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
              {isOwner && (
                <div className="field">
                  <label>Assign to Renter *</label>
                  <select
                    value={createForm.renter_id}
                    onChange={(e) => setCreateForm({ ...createForm, renter_id: e.target.value })}
                  >
                    <option value="">Select registered renter…</option>
                    <optgroup label="Display Cubes Renters">
                      {displayRenters.map((r) => (
                        <option key={`disp-${r.user_id}`} value={r.user_id}>
                          {r.full_name} {r.email ? `(${r.email})` : ''}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Pick-up Cubes Renters">
                      {pickupRenters.map((r) => (
                        <option key={`pick-${r.user_id}`} value={r.user_id}>
                          {r.full_name} {r.email ? `(${r.email})` : ''}
                        </option>
                      ))}
                    </optgroup>
                    {otherRenters.length > 0 && (
                      <optgroup label="New / Other Renters">
                        {otherRenters.map((r) => (
                          <option key={`oth-${r.user_id}`} value={r.user_id}>
                            {r.full_name} {r.email ? `(${r.email})` : ''}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>
              )}

              <div className="field">
                <label>Select Cube Space *</label>
                <select
                  value={createForm.cube_id}
                  onChange={(e) => {
                    setCreateForm({ ...createForm, cube_id: e.target.value })
                    setExpireExistingContract(false)
                  }}
                >
                  <option value="">Choose a cube…</option>
                  <optgroup label="Display Cubes">
                    {cubes.filter((c) => c.type === 'Display').map((c) => (
                      <option key={c.cube_id} value={c.cube_id}>
                        Cube {c.cube_number} ({peso(c.price_per_month)}/mo)
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Pick-up Cubes">
                    {cubes.filter((c) => c.type === 'Pick-up').map((c) => (
                      <option key={c.cube_id} value={c.cube_id}>
                        Cube {c.cube_number} ({peso(c.price_per_month)}/mo)
                      </option>
                    ))}
                  </optgroup>
                </select>

                {activeContractOnCube && (
                  <div
                    style={{
                      padding: '0.75rem 1rem',
                      borderRadius: 10,
                      border: '1px solid #f59e0b',
                      background: '#fffbeb',
                      marginTop: '0.6rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.35rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, color: '#92400e', fontSize: '0.88rem' }}>
                      <AlertTriangle size={16} />
                      <span>Cube currently has a live agreement ({activeContractOnCube.status})</span>
                    </div>
                    <div style={{ fontSize: '0.82rem', color: '#78350f', lineHeight: 1.4 }}>
                      Currently leased to <strong>{(activeContractOnCube.users as any)?.full_name || 'Renter'}</strong> under Contract #{activeContractOnCube.contract_id} (valid until {activeContractOnCube.end_date}).
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.2rem', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700, color: '#92400e' }}>
                      <input
                        type="checkbox"
                        checked={expireExistingContract}
                        onChange={(e) => setExpireExistingContract(e.target.checked)}
                      />
                      Expire previous agreement (#{activeContractOnCube.contract_id}) to activate this new contract
                    </label>
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="field">
                  <label>Start Date *</label>
                  <input
                    type="date"
                    value={createForm.start_date}
                    onChange={(e) => setCreateForm({ ...createForm, start_date: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>End Date *</label>
                  <input
                    type="date"
                    value={createForm.end_date}
                    onChange={(e) => setCreateForm({ ...createForm, end_date: e.target.value })}
                  />
                </div>
              </div>

              {/* Quick duration presets */}
              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                <span className="muted" style={{ fontSize: '0.8rem', fontWeight: 600 }}>Quick term:</span>
                {[1, 3, 6, 12].map((m) => (
                  <button
                    key={m}
                    type="button"
                    className="btn-ghost"
                    style={{ padding: '0.2rem 0.6rem', fontSize: '0.78rem' }}
                    onClick={() => applyDuration(m)}
                  >
                    +{m} {m === 1 ? 'Month' : 'Months'}
                  </button>
                ))}
              </div>

              <div className="field">
                <label>Initial Status</label>
                <select
                  value={createForm.status}
                  onChange={(e) => setCreateForm({ ...createForm, status: e.target.value as Contract['status'] })}
                >
                  <option value="Active">Active</option>
                  <option value="Pending">Pending</option>
                </select>
              </div>

              <div className="field">
                <label>Agreement Terms & Clauses</label>
                <textarea
                  rows={6}
                  value={createForm.contract_text}
                  onChange={(e) => setCreateForm({ ...createForm, contract_text: e.target.value })}
                />
              </div>

              <div className="row" style={{ justifyContent: 'flex-end', marginTop: '0.75rem', gap: '0.75rem' }}>
                <button className="btn-ghost" type="button" onClick={() => setIsCreateModalOpen(false)}>
                  Cancel
                </button>
                <button className="btn" type="button" disabled={saving} onClick={handleCreateContract}>
                  {saving ? 'Creating…' : 'Create Contract'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════ EDIT CONTRACT MODAL ════════════ */}
      {editingContract && (
        <div className="modal-overlay" onClick={() => setEditingContract(null)}>
          <div className="modal-card" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ margin: 0 }}>Edit Contract #{editingContract.contract_id}</h3>
              <button className="modal-close" onClick={() => setEditingContract(null)}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="field">
                  <label>Contract Status</label>
                  <select
                    value={editForm.status}
                    onChange={(e) => setEditForm({ ...editForm, status: e.target.value as Contract['status'] })}
                  >
                    <option value="Active">Active</option>
                    <option value="Pending">Pending</option>
                    <option value="Expired">Expired</option>
                  </select>
                </div>

                <div className="field">
                  <label>Assigned Cube</label>
                  <select
                    value={editForm.cube_id}
                    onChange={(e) => setEditForm({ ...editForm, cube_id: e.target.value })}
                  >
                    {cubes.map((c) => (
                      <option key={c.cube_id} value={c.cube_id}>
                        Cube {c.cube_number} · {c.type} ({peso(c.price_per_month)}/mo)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {isOwner && (
                <div className="field">
                  <label>Assigned Renter</label>
                  <select
                    value={editForm.renter_id}
                    onChange={(e) => setEditForm({ ...editForm, renter_id: e.target.value })}
                  >
                    {renters.map((r) => (
                      <option key={r.user_id} value={r.user_id}>
                        {r.full_name} (#{r.user_id})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="field">
                  <label>Commencement (Start)</label>
                  <input
                    type="date"
                    value={editForm.start_date}
                    onChange={(e) => setEditForm({ ...editForm, start_date: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Expiration (End)</label>
                  <input
                    type="date"
                    value={editForm.end_date}
                    onChange={(e) => setEditForm({ ...editForm, end_date: e.target.value })}
                  />
                </div>
              </div>

              <div className="field">
                <label>Editable Agreement Terms</label>
                <textarea
                  rows={8}
                  value={editForm.contract_text}
                  onChange={(e) => setEditForm({ ...editForm, contract_text: e.target.value })}
                />
              </div>

              <div className="row" style={{ justifyContent: 'flex-end', marginTop: '0.75rem', gap: '0.75rem' }}>
                <button className="btn-ghost" type="button" onClick={() => setEditingContract(null)}>
                  Cancel
                </button>
                <button className="btn" type="button" disabled={saving} onClick={handleSaveEdit}>
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Decline Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(declineTarget)}
        title="Decline Contract Agreement"
        message={declineTarget ? `Are you sure you want to decline contract #${declineTarget.contract_id}? The cube will return to Available.` : ''}
        confirmText="Decline Contract"
        cancelText="Cancel"
        isDanger={true}
        onConfirm={confirmDeclineContract}
        onCancel={() => setDeclineTarget(null)}
      />

      {/* RECEIPT ZOOM / PREVIEW MODAL */}
      {previewReceipt && (
        <div className="modal-overlay" onClick={() => setPreviewReceipt(null)} style={{ zIndex: 100002 }}>
          <div className="modal-card" style={{ maxWidth: 620, textAlign: 'center', background: '#fff' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>Payment Receipt Proof</h3>
              <button className="modal-close" onClick={() => setPreviewReceipt(null)}>
                <X size={18} />
              </button>
            </div>
            <div style={{ padding: '1rem', background: '#f8fafc', borderRadius: 8, margin: '1rem 0' }}>
              <img
                src={previewReceipt}
                alt="Receipt proof"
                style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <a
                href={previewReceipt}
                target="_blank"
                rel="noreferrer"
                className="btn-ghost"
                style={{ fontSize: '0.85rem' }}
              >
                Open in new tab
              </a>
              <button
                type="button"
                className="btn"
                onClick={() => setPreviewReceipt(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
