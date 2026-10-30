import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Printer, Download, X, ArrowUpDown } from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/Auth'
import { peso, addMonths, todayISO, type Contract, type Transaction, type Product } from '../lib/types'
import { extractPaymentsFromContracts } from '../lib/contract-meta'
import { SkeletonStat, SkeletonTable } from '../components/Skeleton'
import TablePagination, { DEFAULT_PAGE_SIZE } from '../components/TablePagination'

type ReportType = 'display' | 'pickup' | 'rental' | 'combined'
type DateFilterMode = 'all' | 'monthly' | 'daily' | 'yearly' | 'custom'
type DashboardSection = 'sales' | 'rentals'
const PAGE_SIZE = DEFAULT_PAGE_SIZE

export default function OwnerDashboard() {
  const { user } = useAuth()
  const [contracts, setContracts] = useState<Contract[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [renters, setRenters] = useState<{ user_id: number; full_name: string }[]>([])
  const [contractPayments, setContractPayments] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [month, setMonth] = useState<string>('all')
  const [selectedRenterFilter, setSelectedRenterFilter] = useState<string>('all')
  const [dashboardSection, setDashboardSection] = useState<DashboardSection>('sales')
  const [salesFilterType, setSalesFilterType] = useState<'All' | 'Display' | 'Pick-up'>('All')
  const [rentalFilterType, setRentalFilterType] = useState<'All' | 'Display' | 'Pick-up'>('All')
  const [rentalsPage, setRentalsPage] = useState(1)
  const [salesPage, setSalesPage] = useState(1)

  // Print Dialog State
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false)
  const [printReportType, setPrintReportType] = useState<ReportType>('rental')
  const [printDateMode, setPrintDateMode] = useState<DateFilterMode>('all')
  const [printMonth, setPrintMonth] = useState(() => todayISO().slice(0, 7))
  const [printDaily, setPrintDaily] = useState(() => todayISO())
  const [printYearly, setPrintYearly] = useState(() => todayISO().slice(0, 4))
  const [printStartDate, setPrintStartDate] = useState(() => todayISO())
  const [printEndDate, setPrintEndDate] = useState(() => todayISO())
  const [printRenterId, setPrintRenterId] = useState<string>('all')
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null)
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null)

  useEffect(() => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        const size = 256
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.drawImage(img, 0, 0, size, size)
          setLogoDataUrl(canvas.toDataURL('image/png'))
        }
      } catch (err) {
        console.warn('Could not rasterize logo for PDF preview', err)
      }
    }
    img.src = '/TrackErentory.svg'
  }, [])

  function getOrLoadLogoDataUrl(): Promise<string | null> {
    if (logoDataUrl) return Promise.resolve(logoDataUrl)
    return new Promise((resolve) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          const size = 256
          canvas.width = size
          canvas.height = size
          const ctx = canvas.getContext('2d')
          if (ctx) {
            ctx.drawImage(img, 0, 0, size, size)
            const d = canvas.toDataURL('image/png')
            setLogoDataUrl(d)
            resolve(d)
            return
          }
        } catch {
          // ignore
        }
        resolve(null)
      }
      img.onerror = () => resolve(null)
      img.src = '/TrackErentory.svg'
    })
  }

  function refreshData() {
    setLoading(true)
    void Promise.all([
      supabase.from('contracts').select('*, cubes(*), users!renter_id(user_id, full_name)'),
      supabase
        .from('transactions')
        .select('*, products(*, cubes(cube_number, type)), cubes(cube_number, type), users!processed_by(full_name, role)')
        .order('updated_at', { ascending: false }),
      supabase.from('users').select('user_id, full_name').eq('role', 'Renter').order('full_name'),
      supabase.from('contract_payments').select('*'),
    ]).then(([c, t, r, cp]) => {
      setLoading(false)
      const loadedContracts = (!c.error ? c.data || [] : []) as Contract[]
      setContracts(loadedContracts)
      if (!t.error) setTransactions((t.data || []) as Transaction[])
      if (!r.error) setRenters((r.data || []) as { user_id: number; full_name: string }[])
      const mergedPayments = extractPaymentsFromContracts(loadedContracts, !cp.error ? cp.data || [] : [])
      setContractPayments(mergedPayments)
    })
  }

  useEffect(() => {
    refreshData()
  }, [])

  // Sort states for active dashboard tables
  const [sortRentals, setSortRentals] = useState<{ col: string; dir: 'asc' | 'desc' }>({ col: 'renter', dir: 'asc' })
  const [sortMonthTx, setSortMonthTx] = useState<{ col: string; dir: 'asc' | 'desc' }>({ col: 'date', dir: 'desc' })

  function renderSortIndicator(currentCol: string, sortState: { col: string; dir: 'asc' | 'desc' }) {
    if (sortState.col !== currentCol) {
      return <ArrowUpDown size={12} style={{ opacity: 0.35, marginLeft: 4, verticalAlign: 'middle', display: 'inline' }} />
    }
    return <span style={{ marginLeft: 4, fontSize: '0.75rem' }}>{sortState.dir === 'asc' ? '▲' : '▼'}</span>
  }

  function toggleSort(
    state: { col: string; dir: 'asc' | 'desc' },
    setState: React.Dispatch<React.SetStateAction<{ col: string; dir: 'asc' | 'desc' }>>,
    col: string,
  ) {
    if (state.col === col) {
      setState({ col, dir: state.dir === 'asc' ? 'desc' : 'asc' })
    } else {
      setState({ col, dir: 'asc' })
    }
  }

  // Map of renter_id to full_name from contracts
  const renterMap = useMemo(() => {
    const map = new Map<number, string>()
    renters.forEach((r) => map.set(r.user_id, r.full_name))
    contracts.forEach((c) => {
      if (c.renter_id && c.users?.full_name) {
        map.set(c.renter_id, c.users.full_name)
      }
    })
    return map
  }, [renters, contracts])

  // Map of cube_id to active renter
  const cubeRenterMap = useMemo(() => {
    const map = new Map<number, { renter_id: number; name: string }>()
    contracts.forEach((c) => {
      if (c.cube_id && c.renter_id) {
        const name = c.users?.full_name || renterMap.get(c.renter_id) || `User #${c.renter_id}`
        map.set(c.cube_id, { renter_id: c.renter_id, name })
      }
    })
    return map
  }, [contracts, renterMap])

  // Helper to resolve transaction renter
  const getTxRenter = (t: Transaction) => {
    const p = t.products as
      | (Product & { cubes?: { cube_number?: string; type?: string } | null; renter_id?: number | null; cube_id?: number | null })
      | null
    if (t.renter_id && renterMap.has(t.renter_id)) {
      return { id: t.renter_id, name: renterMap.get(t.renter_id)! }
    }
    if (p?.renter_id && renterMap.has(p.renter_id)) {
      return { id: p.renter_id, name: renterMap.get(p.renter_id)! }
    }
    if (p?.cube_id && cubeRenterMap.has(p.cube_id)) {
      const cr = cubeRenterMap.get(p.cube_id)!
      return { id: cr.renter_id, name: cr.name }
    }
    return { id: null, name: 'Unknown Renter' }
  }

  // All paid rental installments across all active/expired contracts (including Month 1 Initial Advance)
  const allRentalSales = useMemo(() => {
    const results: Array<{
      key: string
      contract_id: number
      status: string
      renter_id: number | null
      renter: string
      cube: string | undefined
      type: string | undefined
      monthly: number
      period: string
      periodDates?: string
      periodMonthLabel?: string
      startDate: string
      endDate: string
      dueMonth: string
      paidMonth: string
      monthNumber: number
      totalMonths: number
      paymentMethod: string
    }> = []

    const liveOrPastContracts = contracts.filter((c) => c.status === 'Active' || c.status === 'Expired')

    for (const c of liveOrPastContracts) {
      if (!c.start_date || !c.end_date) continue

      const startD = new Date(c.start_date)
      const endD = new Date(c.end_date)
      const diffMonths = Math.max(1, Math.round((endD.getTime() - startD.getTime()) / (1000 * 60 * 60 * 24 * 30)))
      const renterName = c.users?.full_name || (c.renter_id ? renterMap.get(c.renter_id) : null) || `User #${c.renter_id}`
      const monthlyRate = Number(c.cubes?.price_per_month || 0)

      for (let m = 1; m <= diffMonths; m++) {
        const isMonth1 = m === 1
        const dueDate = isMonth1 ? c.start_date : addMonths(c.start_date, m - 1)
        const dueMonth = dueDate.slice(0, 7)

        const record = contractPayments.find(
          (p) => p.contract_id === c.contract_id && (p.month_number === m || p.month_index === m),
        )

        // Month 1 is paid upon opening (Initial Advance) for Active/Expired contracts.
        // Succeeding months (m > 1) are paid when marked Paid in Cube Payment.
        const isPaid =
          record?.payment_status === 'Paid' ||
          record?.status === 'Paid' ||
          (isMonth1 && (!record || record.payment_status === 'Paid' || record.status === 'Paid'))

        if (!isPaid) continue

        const paidMonth = (record?.paid_at || record?.payment_date || dueDate).slice(0, 7)
        const periodDates = `${c.start_date} to ${c.end_date}`
        const periodMonthLabel = `Month ${m} of ${diffMonths}${isMonth1 ? ' (Initial Advance)' : ''}`
        const periodLabel = `${periodDates}\n(${periodMonthLabel})`

        results.push({
          key: `${c.contract_id}-m${m}`,
          contract_id: c.contract_id,
          status: c.status,
          renter_id: c.renter_id,
          renter: renterName,
          cube: c.cubes?.cube_number,
          type: c.cubes?.type,
          monthly: monthlyRate,
          period: periodLabel,
          periodDates,
          periodMonthLabel,
          startDate: dueDate,
          endDate: c.end_date,
          dueMonth,
          paidMonth,
          monthNumber: m,
          totalMonths: diffMonths,
          paymentMethod: record?.payment_method || 'Cash',
        })
      }
    }

    return results
  }, [contracts, contractPayments, renterMap])

  const rentalSales = useMemo(() => {
    return allRentalSales.filter((r) => {
      if (selectedRenterFilter !== 'all' && r.renter_id !== Number(selectedRenterFilter)) {
        return false
      }
      if (month === 'all') return true
      if (r.dueMonth === month || r.paidMonth === month) return true
      // Also include Month 1 if the contract is currently active during the selected month
      if (r.monthNumber === 1 && r.status === 'Active' && r.startDate.slice(0, 7) <= month && r.endDate.slice(0, 7) >= month) {
        return true
      }
      return false
    })
  }, [allRentalSales, month, selectedRenterFilter])

  const rentalSalesSorted = useMemo(() => {
    const list = [...rentalSales]
    const { col, dir } = sortRentals
    list.sort((a, b) => {
      let vA: any = ''
      let vB: any = ''
      if (col === 'renter') {
        vA = a.renter
        vB = b.renter
      } else if (col === 'cube') {
        vA = a.cube || ''
        vB = b.cube || ''
      } else if (col === 'type') {
        vA = a.type || ''
        vB = b.type || ''
      } else if (col === 'monthly') {
        vA = a.monthly
        vB = b.monthly
      } else if (col === 'period') {
        vA = a.startDate
        vB = b.startDate
      } else if (col === 'status') {
        vA = a.status
        vB = b.status
      }
      if (vA < vB) return dir === 'asc' ? -1 : 1
      if (vA > vB) return dir === 'asc' ? 1 : -1
      return 0
    })
    return list
  }, [rentalSales, sortRentals])

  const rentalTotal = rentalSales.reduce((s, r) => s + r.monthly, 0)

  const monthTx = useMemo(() => {
    return transactions.filter((t) => {
      if (selectedRenterFilter !== 'all') {
        const r = getTxRenter(t)
        if (r.id !== Number(selectedRenterFilter)) return false
      }
      if (month === 'all') return true
      const txMonth = String(t.transaction_date || t.updated_at || '').slice(0, 7)
      return txMonth === month
    })
  }, [transactions, month, selectedRenterFilter, renterMap, cubeRenterMap])

  const monthTxSorted = useMemo(() => {
    const list = [...monthTx]
    const { col, dir } = sortMonthTx
    list.sort((a, b) => {
      let vA: any = ''
      let vB: any = ''
      if (col === 'date') {
        vA = new Date(a.updated_at || a.transaction_date).getTime()
        vB = new Date(b.updated_at || b.transaction_date).getTime()
      } else if (col === 'product') {
        vA = a.products?.product_name || a.product_name || ''
        vB = b.products?.product_name || b.product_name || ''
      } else if (col === 'cube') {
        vA = a.products?.cubes?.cube_number || a.cubes?.cube_number || ''
        vB = b.products?.cubes?.cube_number || b.cubes?.cube_number || ''
      } else if (col === 'renter') {
        vA = getTxRenter(a).name
        vB = getTxRenter(b).name
      } else if (col === 'amount') {
        vA = Number(a.products?.price || 0) * Number(a.quantity || 1)
        vB = Number(b.products?.price || 0) * Number(b.quantity || 1)
      } else if (col === 'payment') {
        vA = a.payment_status
        vB = b.payment_status
      } else if (col === 'processed') {
        vA = a.users?.full_name || ''
        vB = b.users?.full_name || ''
      }
      if (vA < vB) return dir === 'asc' ? -1 : 1
      if (vA > vB) return dir === 'asc' ? 1 : -1
      return 0
    })
    return list
  }, [monthTx, sortMonthTx])

  const isPaidTx = (t: Transaction) =>
    (t.payment_status === 'Paid' || t.pickup_status === 'Picked-up') && !t.notes?.startsWith('[PULLED OUT]')

  useEffect(() => setRentalsPage(1), [rentalFilterType, rentalSalesSorted])
  useEffect(() => setSalesPage(1), [salesFilterType, monthTxSorted])

  const byType = useMemo(() => {
    let display = 0
    let pickup = 0
    for (const t of monthTx) {
      if (!isPaidTx(t)) continue
      const amount = Number(t.products?.price || 0) * Number(t.quantity || 1)
      const type = t.products?.cubes?.type || t.cubes?.type || (t.authorized_pickup_name ? 'Pick-up' : 'Display')
      if (type === 'Pick-up') pickup += amount
      else display += amount
    }
    return { display, pickup, total: display + pickup }
  }, [monthTx])

  const filteredSalesTx = useMemo(() => {
    return monthTxSorted
      .filter((t) => !t.notes?.startsWith('[PULLED OUT]'))
      .filter((t) => {
        if (salesFilterType === 'All') return true
        const type = t.products?.cubes?.type || t.cubes?.type || (t.authorized_pickup_name ? 'Pick-up' : 'Display')
        return type === salesFilterType
      })
  }, [monthTxSorted, salesFilterType])

  const filteredRentals = useMemo(() => {
    return rentalSalesSorted.filter((r) => {
      if (rentalFilterType === 'All') return true
      return r.type === rentalFilterType
    })
  }, [rentalSalesSorted, rentalFilterType])

  const filteredRentersForReport = useMemo(() => {
    if (printReportType === 'display') {
      const ids = new Set(contracts.filter((c) => c.cubes?.type === 'Display').map((c) => c.renter_id))
      return renters.filter((r) => ids.has(r.user_id))
    }
    if (printReportType === 'pickup') {
      const ids = new Set(contracts.filter((c) => c.cubes?.type === 'Pick-up').map((c) => c.renter_id))
      return renters.filter((r) => ids.has(r.user_id))
    }
    return renters
  }, [printReportType, contracts, renters])

  const rentalsPageRows = filteredRentals.slice((rentalsPage - 1) * PAGE_SIZE, rentalsPage * PAGE_SIZE)
  const salesPageRows = filteredSalesTx.slice((salesPage - 1) * PAGE_SIZE, salesPage * PAGE_SIZE)

  // Filtered transactions & rentals for the printable report
  const printFilteredData = useMemo(() => {
    const matchesDate = (dateStr: string) => {
      if (printDateMode === 'all') return true
      if (!dateStr) return false
      const d = String(dateStr).slice(0, 10)
      if (printDateMode === 'daily') return d === printDaily
      if (printDateMode === 'monthly') return d.slice(0, 7) === printMonth
      if (printDateMode === 'yearly') return d.slice(0, 4) === printYearly
      if (printDateMode === 'custom') return d >= printStartDate && d <= printEndDate
      return true
    }

    let matchedRentals = allRentalSales.filter((r) => {
      if (printRenterId !== 'all' && r.renter_id !== Number(printRenterId)) return false
      if (printDateMode === 'all') return true
      return matchesDate(r.startDate) || matchesDate(r.paidMonth + '-01')
    })

    if (printReportType === 'rental') {
      const total = matchedRentals.reduce((acc, curr) => acc + curr.monthly, 0)
      return { list: matchedRentals, rentalList: matchedRentals, txList: [] as Transaction[], total, rentalTotal: total, txTotal: 0 }
    }

    const targetType = printReportType === 'display' ? 'Display' : printReportType === 'pickup' ? 'Pick-up' : 'All'
    let txList = transactions
      .filter((t) => {
        if (t.notes?.startsWith('[PULLED OUT]')) return false
        const dateMatch = matchesDate(t.transaction_date || t.updated_at || '')
        const cType = t.products?.cubes?.type || t.cubes?.type || 'Display'
        const typeMatch = targetType === 'All' ? true : cType === targetType
        return dateMatch && typeMatch
      })
      .sort((a, b) => new Date(b.updated_at || b.transaction_date).getTime() - new Date(a.updated_at || a.transaction_date).getTime())

    if (printRenterId !== 'all') {
      const rid = Number(printRenterId)
      txList = txList.filter((t) => getTxRenter(t).id === rid)
    }

    const txTotal = txList.reduce((acc, t) => {
      if (t.payment_status === 'Paid' || t.pickup_status === 'Picked-up') {
        return acc + Number(t.products?.price || 0) * Number(t.quantity || 1)
      }
      return acc
    }, 0)

    const rentalSubTotal = matchedRentals.reduce((acc, curr) => acc + curr.monthly, 0)

    if (printReportType === 'combined') {
      return {
        list: [...txList, ...matchedRentals],
        rentalList: matchedRentals,
        txList,
        total: txTotal + rentalSubTotal,
        rentalTotal: rentalSubTotal,
        txTotal,
      }
    }

    return {
      list: txList,
      rentalList: matchedRentals,
      txList,
      total: txTotal,
      rentalTotal: rentalSubTotal,
      txTotal,
    }
  }, [
    transactions,
    allRentalSales,
    printReportType,
    printDateMode,
    printMonth,
    printDaily,
    printYearly,
    printStartDate,
    printEndDate,
    printRenterId,
  ])

  const printPeriodLabel = useMemo(() => {
    if (printDateMode === 'all') return 'All Paid Records'
    if (printDateMode === 'daily') return `Daily: ${new Date(printDaily).toLocaleDateString('en-PH', { dateStyle: 'long' })}`
    if (printDateMode === 'monthly')
      return `Monthly: ${new Date(`${printMonth}-01`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`
    if (printDateMode === 'yearly') return `Yearly: ${printYearly}`
    if (printDateMode === 'custom') return `Custom Date Range: ${printStartDate} to ${printEndDate}`
    return 'All Paid Records'
  }, [printDateMode, printDaily, printMonth, printYearly, printStartDate, printEndDate])

  const selectedRenterName =
    printRenterId === 'all'
      ? 'All Renters'
      : renters.find((r) => r.user_id === Number(printRenterId))?.full_name || 'Selected Renter'

  function buildPrintableReportHtml() {
    const reportTitle =
      printReportType === 'display'
        ? 'DISPLAY SALES REPORT'
        : printReportType === 'pickup'
          ? 'PICK-UP SALES REPORT'
          : printReportType === 'combined'
            ? 'COMBINED SALES & CUBE RENTAL REPORT'
            : 'MONTHLY RENTAL PAYMENT REPORT'

    const rentalRowsHtml =
      printFilteredData.rentalList.length === 0
        ? `<tr><td colspan="5" style="text-align:center;padding:1.5rem;color:#6b7280;">No paid rental installments found for this selection.</td></tr>`
        : printFilteredData.rentalList
            .map(
              (r) => `
              <tr>
                <td style="text-align:left;">${r.renter}</td>
                <td style="text-align:center;">${r.cube ?? '—'}</td>
                <td style="text-align:center;">${r.type ?? '—'}</td>
                <td style="text-align:center;">
                  <div>${r.periodDates || r.period}</div>
                  ${r.periodMonthLabel ? `<div style="font-size:0.75rem;color:#555;">${r.periodMonthLabel} · ${r.paymentMethod}</div>` : ''}
                </td>
                <td style="text-align:right;">${peso(r.monthly)}</td>
              </tr>
            `,
            )
            .join('')

    const txRowsHtml =
      printFilteredData.txList.length === 0
        ? `<tr><td colspan="8" style="text-align:center;padding:1.5rem;color:#6b7280;">No product sales transactions found for this period.</td></tr>`
        : printFilteredData.txList
            .map((t) => {
              const renter = getTxRenter(t)
              const amt = Number(t.products?.price || 0) * Number(t.quantity || 1)
              const txDate = new Date(t.transaction_date).toLocaleDateString('en-PH')
              const processorName = t.users?.full_name || 'Staff'
              const paymentStr = t.payment_method || 'Cash'
              return `
                <tr>
                  <td style="text-align:left;">
                    <div>${t.products?.product_name || t.product_name || '—'}</div>
                    ${t.products?.variant ? `<div style="font-size:0.75rem;color:#555;">Variant: ${t.products.variant}</div>` : ''}
                  </td>
                  <td style="text-align:center;">${t.products?.cubes?.cube_number || t.cubes?.cube_number || '—'}</td>
                  <td style="text-align:center;">${renter.name}</td>
                  <td style="text-align:center;">${txDate}</td>
                  <td style="text-align:center;">${paymentStr}</td>
                  <td style="text-align:center;">${processorName}</td>
                  <td style="text-align:center;">${t.quantity || 1}</td>
                  <td style="text-align:right;">${peso(amt)}</td>
                </tr>
              `
            })
            .join('')

    const rentalTableMarkup = `
      <table>
        <thead>
          <tr>
            <th style="text-align:left;">renter</th>
            <th>cube no.</th>
            <th>type</th>
            <th>contract period / installment</th>
            <th style="text-align:right;">paid rent</th>
          </tr>
        </thead>
        <tbody>${rentalRowsHtml}</tbody>
        <tfoot>
          <tr>
            <td colspan="4">total paid cube rental income</td>
            <td style="text-align:right;">${peso(printFilteredData.rentalTotal)}</td>
          </tr>
        </tfoot>
      </table>
    `

    const txTableMarkup = `
      <table>
        <thead>
          <tr>
            <th style="text-align:left;">product</th>
            <th>cube</th>
            <th>renter</th>
            <th>date</th>
            <th>payment</th>
            <th>process</th>
            <th>qty</th>
            <th style="text-align:right;">total</th>
          </tr>
        </thead>
        <tbody>${txRowsHtml}</tbody>
        <tfoot>
          <tr>
            <td colspan="7">total product sales</td>
            <td style="text-align:right;">${peso(printFilteredData.txTotal)}</td>
          </tr>
        </tfoot>
      </table>
    `

    const tableMarkup =
      printReportType === 'rental'
        ? rentalTableMarkup
        : printReportType === 'combined'
          ? `<h3 style="margin:1rem 0 0.5rem;font-size:1rem;text-transform:uppercase;">1. Paid Cube Rental Payments</h3>
             ${rentalTableMarkup}
             <h3 style="margin:1.5rem 0 0.5rem;font-size:1rem;text-transform:uppercase;">2. Product Sales Transactions</h3>
             ${txTableMarkup}
             <div style="text-align:right;font-size:1.05rem;font-weight:700;margin-top:0.75rem;">
               COMBINED TOTAL: ${peso(printFilteredData.total)}
             </div>`
          : txTableMarkup

    return `<!doctype html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <title>${reportTitle}</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 15mm;
            }
            * {
              box-sizing: border-box;
            }
            body {
              margin: 0;
              padding: 2rem;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
              color: #000;
              background: #f8fafc;
            }
            .toolbar {
              display: flex;
              justify-content: flex-end;
              gap: 0.75rem;
              margin-bottom: 1.5rem;
              max-width: 960px;
              margin-left: auto;
              margin-right: auto;
            }
            .toolbar button {
              border: 1px solid #111827;
              background: #111827;
              color: white;
              padding: 0.6rem 1.1rem;
              border-radius: 6px;
              cursor: pointer;
              font-size: 0.9rem;
              font-weight: 500;
            }
            .toolbar button.secondary {
              background: white;
              color: #111827;
            }
            .report {
              background: #fff;
              border: 1px solid #e2e8f0;
              padding: 2.5rem;
              max-width: 960px;
              margin: 0 auto;
              box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
            }
            .report-header-brand {
              display: flex;
              align-items: center;
              gap: 0.85rem;
            }
            .brand-logo {
              height: 56px;
              width: 56px;
              object-fit: contain;
            }
            .brand-text-name {
              font-size: 1.5rem;
              font-weight: 700;
              letter-spacing: 0.05em;
              line-height: 1.15;
              text-transform: uppercase;
              color: #000;
            }
            .brand-text-sub {
              font-size: 1rem;
              color: #333;
              margin-top: 2px;
            }
            .report-title {
              text-align: center;
              font-size: 1.35rem;
              font-weight: 700;
              letter-spacing: 0.05em;
              text-transform: uppercase;
              margin: 1.75rem 0 1.25rem;
              color: #000;
            }
            .report-meta-row {
              display: flex;
              justify-content: space-between;
              align-items: center;
              font-size: 0.95rem;
              color: #000;
              margin-bottom: 0.65rem;
            }
            .report-hr {
              border: none;
              border-top: 2px solid #000;
              margin: 0 0 1.25rem;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              font-size: 0.88rem;
              margin-bottom: 1.5rem;
            }
            th, td {
              border: 1px solid #000;
              padding: 0.55rem 0.65rem;
              vertical-align: middle;
              background: #fff;
              color: #000;
            }
            th {
              font-weight: normal;
              text-align: center;
            }
            tfoot td {
              font-weight: normal;
            }
            .signatures-row {
              display: flex;
              justify-content: space-between;
              margin-top: 5rem;
              padding: 0 1.5rem;
            }
            .sig-group {
              display: flex;
              flex-direction: column;
              align-items: flex-start;
            }
            .sig-line {
              width: 190px;
              border-bottom: 1px solid #000;
              margin-bottom: 0.5rem;
            }
            .sig-text {
              font-size: 0.92rem;
              color: #000;
            }
            @media print {
              body {
                padding: 0;
                background: #fff;
              }
              .toolbar {
                display: none !important;
              }
              .report {
                border: none;
                box-shadow: none;
                padding: 0;
                max-width: 100%;
              }
            }
          </style>
        </head>
        <body>
          <div class="toolbar">
            <button type="button" onclick="window.print()">Print / Save as PDF</button>
            <button type="button" class="secondary" onclick="window.close()">Close</button>
          </div>

          <div class="report">
            <div class="report-header-brand">
              <img src="${window.location.origin}/TrackErentory.svg" alt="TrackErentory" class="brand-logo" />
              <div>
                <div class="brand-text-name">TRACKERENTORY</div>
                <div class="brand-text-sub">Arce Concept Store</div>
              </div>
            </div>

            <div class="report-title">${reportTitle}</div>

            <div class="report-meta-row">
              <div>period: ${printPeriodLabel}</div>
              <div style="text-align: center;">renter: ${selectedRenterName}</div>
              <div style="text-align: right;">date generated: ${new Date().toLocaleDateString('en-PH')}</div>
            </div>

            <hr class="report-hr" />

            ${tableMarkup}

            <div class="signatures-row">
              <div class="sig-group">
                <div class="sig-line"></div>
                <div class="sig-text">prepared by</div>
              </div>
              <div class="sig-group">
                <div class="sig-line"></div>
                <div class="sig-text">received/acknowledge by</div>
              </div>
            </div>
          </div>
        </body>
      </html>
    `
  }

  async function handleDownloadPdf() {
    setIsPrintModalOpen(false)
    const doc = new jsPDF()
    const logo = await getOrLoadLogoDataUrl()

    const reportTitle =
      printReportType === 'display'
        ? 'DISPLAY SALES REPORT'
        : printReportType === 'pickup'
          ? 'PICK-UP SALES REPORT'
          : printReportType === 'combined'
            ? 'COMBINED SALES & CUBE RENTAL REPORT'
            : 'MONTHLY RENTAL PAYMENT REPORT'

    if (logo) {
      try {
        doc.addImage(logo, 'PNG', 14, 10, 16, 16)
      } catch {
        // fallback
      }
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(16)
      doc.setTextColor(0, 0, 0)
      doc.text('TRACKERENTORY', 34, 17)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10.5)
      doc.setTextColor(40, 40, 40)
      doc.text('Arce Concept Store', 34, 23)
    } else {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(16)
      doc.setTextColor(0, 0, 0)
      doc.text('TRACKERENTORY', 14, 17)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10.5)
      doc.setTextColor(40, 40, 40)
      doc.text('Arce Concept Store', 14, 23)
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.setTextColor(0, 0, 0)
    doc.text(reportTitle, 105, 34, { align: 'center' })

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(0, 0, 0)
    doc.text(`period: ${printPeriodLabel}`, 14, 42)
    doc.text(`renter: ${selectedRenterName}`, 105, 42, { align: 'center' })
    doc.text(`date generated: ${new Date().toLocaleDateString('en-PH')}`, 196, 42, { align: 'right' })

    doc.setDrawColor(0, 0, 0)
    doc.setLineWidth(0.6)
    doc.line(14, 45, 196, 45)

    const formatPdfCurrency = (n: number | string | null | undefined) => {
      const num = typeof n === 'number' ? n : Number(n || 0)
      return 'P ' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    }

    let currentY = 48

    if (printReportType === 'rental' || printReportType === 'combined') {
      const rows = printFilteredData.rentalList.map((r) => [
        r.renter || '—',
        r.cube || '—',
        r.type || '—',
        r.periodMonthLabel ? `${r.periodDates}\n(${r.periodMonthLabel})` : r.periodDates || r.period,
        formatPdfCurrency(r.monthly),
      ])

      autoTable(doc, {
        startY: currentY,
        margin: { left: 14, right: 14 },
        tableWidth: 182,
        head: [['renter', 'cube no.', 'type', 'contract period / installment', 'paid rent']],
        body:
          rows.length === 0
            ? [
                [
                  {
                    content: 'No paid rental installments found for this selection.',
                    colSpan: 5,
                    styles: { halign: 'center', textColor: [120, 120, 120] },
                  },
                ],
              ]
            : rows,
        foot: [
          [
            { content: 'total paid rental income', colSpan: 4, styles: { halign: 'left', fontStyle: 'normal' } },
            { content: formatPdfCurrency(printFilteredData.rentalTotal), styles: { halign: 'right', fontStyle: 'normal' } },
          ],
        ],
        theme: 'grid',
        headStyles: {
          fillColor: [255, 255, 255],
          textColor: [0, 0, 0],
          fontStyle: 'normal',
          lineColor: [0, 0, 0],
          lineWidth: 0.2,
          halign: 'center',
        },
        bodyStyles: {
          lineColor: [0, 0, 0],
          lineWidth: 0.2,
          textColor: [0, 0, 0],
        },
        footStyles: {
          fillColor: [255, 255, 255],
          textColor: [0, 0, 0],
          fontStyle: 'normal',
          lineColor: [0, 0, 0],
          lineWidth: 0.2,
        },
        styles: { fontSize: 8.5, cellPadding: 2.2, overflow: 'linebreak', valign: 'middle', font: 'helvetica' },
        columnStyles: {
          0: { cellWidth: 44, halign: 'left' },
          1: { cellWidth: 18, halign: 'center' },
          2: { cellWidth: 20, halign: 'center' },
          3: { cellWidth: 68, halign: 'center' },
          4: { cellWidth: 32, halign: 'right' },
        },
      })
      currentY = ((doc as any).lastAutoTable?.finalY || currentY) + 10
    }

    if (printReportType !== 'rental') {
      const rows = printFilteredData.txList.map((t) => {
        const r = getTxRenter(t)
        const amt = Number(t.products?.price || 0) * Number(t.quantity || 1)
        const txDate = new Date(t.transaction_date).toLocaleDateString('en-PH')
        const processorName = t.users?.full_name || 'Staff'
        const paymentStr = t.payment_method || 'Cash'
        const prodName = t.products?.product_name || t.product_name || '—'
        const variantStr = t.products?.variant ? `\n(Variant: ${t.products.variant})` : ''
        return [
          `${prodName}${variantStr}`,
          t.products?.cubes?.cube_number || t.cubes?.cube_number || '—',
          r.name,
          txDate,
          paymentStr,
          processorName,
          String(t.quantity || 1),
          formatPdfCurrency(amt),
        ]
      })

      autoTable(doc, {
        startY: currentY,
        margin: { left: 14, right: 14 },
        tableWidth: 182,
        head: [['product', 'cube', 'renter', 'date', 'payment', 'process', 'qty', 'total']],
        body:
          rows.length === 0
            ? [
                [
                  {
                    content: 'No product sales transactions found for this period.',
                    colSpan: 8,
                    styles: { halign: 'center', textColor: [120, 120, 120] },
                  },
                ],
              ]
            : rows,
        foot: [
          [
            { content: 'total product sales', colSpan: 7, styles: { halign: 'left', fontStyle: 'normal' } },
            { content: formatPdfCurrency(printFilteredData.txTotal), styles: { halign: 'right', fontStyle: 'normal' } },
          ],
        ],
        theme: 'grid',
        headStyles: {
          fillColor: [255, 255, 255],
          textColor: [0, 0, 0],
          fontStyle: 'normal',
          lineColor: [0, 0, 0],
          lineWidth: 0.2,
          halign: 'center',
        },
        bodyStyles: {
          lineColor: [0, 0, 0],
          lineWidth: 0.2,
          textColor: [0, 0, 0],
        },
        footStyles: {
          fillColor: [255, 255, 255],
          textColor: [0, 0, 0],
          fontStyle: 'normal',
          lineColor: [0, 0, 0],
          lineWidth: 0.2,
        },
        styles: { fontSize: 8, cellPadding: 2.2, overflow: 'linebreak', valign: 'middle', font: 'helvetica' },
        columnStyles: {
          0: { cellWidth: 44, halign: 'left' },
          1: { cellWidth: 16, halign: 'center' },
          2: { cellWidth: 26, halign: 'center' },
          3: { cellWidth: 22, halign: 'center' },
          4: { cellWidth: 18, halign: 'center' },
          5: { cellWidth: 24, halign: 'center' },
          6: { cellWidth: 12, halign: 'center' },
          7: { cellWidth: 20, halign: 'right' },
        },
      })
    }

    let finalY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 35 : 200
    if (finalY > 265) {
      doc.addPage()
      finalY = 35
    }
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(0, 0, 0)

    doc.line(14, finalY, 64, finalY)
    doc.text('prepared by', 14, finalY + 6)

    doc.line(146, finalY, 196, finalY)
    doc.text('received/acknowledge by', 146, finalY + 6)

    if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl)
    setPdfPreviewUrl(String(doc.output('bloburl')))
  }

  function handleTriggerPrint() {
    setIsPrintModalOpen(false)

    const reportHtml = buildPrintableReportHtml()
    const reportWindow = window.open('', '_blank', 'width=1100,height=850')
    if (!reportWindow) {
      setTimeout(() => {
        window.print()
      }, 150)
      return
    }

    reportWindow.document.open()
    reportWindow.document.write(reportHtml)
    reportWindow.document.close()
    reportWindow.focus()
    setTimeout(() => {
      reportWindow.print()
    }, 350)
  }

  if (!user || user.role !== 'Owner') {
    return (
      <section>
        <div className="page-header">
          <div>
            <h1>Owner sales</h1>
            <p className="lede">
              Owner only. <Link to="/login">Sign in</Link>
            </p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section>
      {/* ════════════ ON-SCREEN DASHBOARD VIEW ════════════ */}
      <div className="no-print">
        <div className="page-header">
          <div>
            <h1>Owner sales & reports</h1>
            <p className="lede">
              Monthly cube rental payments (including Month 1 Initial Advance) and Display / Pick-up product sales.
            </p>
          </div>
          <div className="row">
            <button
              className="btn"
              type="button"
              onClick={() => {
                setPrintReportType(dashboardSection === 'rentals' ? 'rental' : 'combined')
                if (selectedRenterFilter !== 'all') setPrintRenterId(selectedRenterFilter)
                setIsPrintModalOpen(true)
              }}
            >
              <Printer size={16} /> Print Report
            </button>
          </div>
        </div>

        {/* Filter Bar: Month + Renter Filter */}
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          <div className="field" style={{ maxWidth: 220, margin: 0 }}>
            <label>Sales & reports month</label>
            <input type="month" value={month === 'all' ? '' : month} onChange={(e) => setMonth(e.target.value || 'all')} />
          </div>
          <button
            type="button"
            className={month === 'all' ? 'btn' : 'btn-ghost'}
            onClick={() => setMonth(month === 'all' ? todayISO().slice(0, 7) : 'all')}
            style={{ fontSize: '0.85rem', padding: '0.65rem 1rem' }}
          >
            {month === 'all' ? 'Showing All Paid Records (Click to Filter Month)' : 'Show All Time Records'}
          </button>

          <div className="field" style={{ minWidth: 240, margin: 0 }}>
            <label>Filter by Renter</label>
            <select
              value={selectedRenterFilter}
              onChange={(e) => setSelectedRenterFilter(e.target.value)}
              style={{ margin: 0 }}
            >
              <option value="all">All Renters ({renters.length})</option>
              {renters.map((r) => (
                <option key={r.user_id} value={r.user_id}>
                  {r.full_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* TOP LEVEL SECTIONS: Product Sales & Rental Income */}
        <div
          style={{
            display: 'flex',
            gap: '0.75rem',
            marginBottom: '1.25rem',
            borderBottom: '2px solid #e2e8f0',
            paddingBottom: '0.5rem',
          }}
        >
          <button
            type="button"
            className={dashboardSection === 'sales' ? 'btn' : 'btn-ghost'}
            style={{ fontSize: '0.95rem', padding: '0.5rem 1.25rem', fontWeight: 700 }}
            onClick={() => setDashboardSection('sales')}
          >
            Product Sales & Summary
          </button>
          <button
            type="button"
            className={dashboardSection === 'rentals' ? 'btn' : 'btn-ghost'}
            style={{ fontSize: '0.95rem', padding: '0.5rem 1.25rem', fontWeight: 700 }}
            onClick={() => setDashboardSection('rentals')}
          >
            Paid Cube Rental Income ({rentalSales.length})
          </button>
        </div>

        {/* SUB-PILLS: All | Display | Pick-up */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: '0.82rem', fontWeight: 600 }}>
            Filter by Cube Type:
          </span>
          {(['All', 'Display', 'Pick-up'] as const).map((t) => {
            const isActive = dashboardSection === 'sales' ? salesFilterType === t : rentalFilterType === t
            return (
              <button
                key={t}
                type="button"
                className={isActive ? 'btn' : 'btn-ghost'}
                style={{ fontSize: '0.8rem', padding: '0.35rem 0.85rem' }}
                onClick={() => {
                  if (dashboardSection === 'sales') setSalesFilterType(t)
                  else setRentalFilterType(t)
                }}
              >
                {t}
              </button>
            )
          })}
        </div>

        {loading ? (
          <>
            <div className="stat-grid">
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonStat key={i} />
              ))}
            </div>
            <SkeletonTable rows={4} cols={5} />
          </>
        ) : (
          <>
            {/* ════════════ PRODUCT SALES & COMBINED KPI VIEW ════════════ */}
            {dashboardSection === 'sales' && (
              <>
                <div className="stat-grid" style={{ marginBottom: '1.75rem' }}>
                  <div className="stat" style={{ borderLeft: '4px solid #16a34a' }}>
                    <div className="label">Total Revenue (Sales + Cube Rent)</div>
                    <div className="value">{peso(byType.total + rentalTotal)}</div>
                  </div>
                  <div
                    className="stat"
                    style={{ borderLeft: '4px solid #2563eb', cursor: 'pointer' }}
                    onClick={() => setDashboardSection('rentals')}
                    title="Click to view Paid Cube Rental details"
                  >
                    <div className="label">Paid Cube Rental Income</div>
                    <div className="value">{peso(rentalTotal)}</div>
                    <div className="muted" style={{ fontSize: '0.75rem', marginTop: 2 }}>
                      {rentalSales.length} paid month(s) (Month 1 + renewals)
                    </div>
                  </div>
                  <div className="stat">
                    <div className="label">Total Product Sales</div>
                    <div className="value">{peso(byType.total)}</div>
                    <div className="muted" style={{ fontSize: '0.75rem', marginTop: 2 }}>
                      Display: {peso(byType.display)} · Pick-up: {peso(byType.pickup)}
                    </div>
                  </div>
                  <div className="stat">
                    <div className="label">Completed Product Orders</div>
                    <div className="value">{monthTx.filter(isPaidTx).length}</div>
                  </div>
                </div>

                {/* If a specific Renter is selected or has paid cube rent, show their Paid Cube Rental summary right here too */}
                {selectedRenterFilter !== 'all' && rentalSales.length > 0 && (
                  <div
                    className="panel"
                    style={{
                      marginBottom: '1.75rem',
                      background: '#f0fdf4',
                      border: '1px solid #86efac',
                      padding: '1rem 1.25rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                      <div>
                        <strong style={{ color: '#166534', fontSize: '0.98rem' }}>
                          Paid Cube Rental for {renters.find((r) => r.user_id === Number(selectedRenterFilter))?.full_name}:{' '}
                          {peso(rentalTotal)}
                        </strong>
                        <div className="muted" style={{ fontSize: '0.82rem', color: '#15803d', marginTop: 2 }}>
                          Includes {rentalSales.length} paid cube rental installment(s) (Month 1 Initial Advance & marked paid months).
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn"
                        style={{ background: '#16a34a', color: '#fff', border: 'none', fontSize: '0.8rem', padding: '0.4rem 0.85rem' }}
                        onClick={() => setDashboardSection('rentals')}
                      >
                        View Cube Rental Breakdown →
                      </button>
                    </div>
                  </div>
                )}

                <h2>
                  Product Sales ({salesFilterType} Cubes · {month === 'all' ? 'All Time' : month})
                </h2>
                <p className="muted">Sales records for customer product purchases before releasing payout.</p>

                <div className="table-wrap" style={{ marginBottom: '2.5rem' }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort(sortMonthTx, setSortMonthTx, 'date')}>
                          Date {renderSortIndicator('date', sortMonthTx)}
                        </th>
                        <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort(sortMonthTx, setSortMonthTx, 'product')}>
                          Product {renderSortIndicator('product', sortMonthTx)}
                        </th>
                        <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort(sortMonthTx, setSortMonthTx, 'cube')}>
                          Cube / Type {renderSortIndicator('cube', sortMonthTx)}
                        </th>
                        <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort(sortMonthTx, setSortMonthTx, 'renter')}>
                          Renter {renderSortIndicator('renter', sortMonthTx)}
                        </th>
                        <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort(sortMonthTx, setSortMonthTx, 'amount')}>
                          Amount {renderSortIndicator('amount', sortMonthTx)}
                        </th>
                        <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort(sortMonthTx, setSortMonthTx, 'payment')}>
                          Payment {renderSortIndicator('payment', sortMonthTx)}
                        </th>
                        <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort(sortMonthTx, setSortMonthTx, 'processed')}>
                          Processed by {renderSortIndicator('processed', sortMonthTx)}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {salesPageRows.map((t) => {
                        const r = getTxRenter(t)
                        return (
                          <tr key={t.transaction_id}>
                            <td>
                              {new Date(t.updated_at || t.transaction_date).toLocaleString('en-PH')}
                              <div className="muted" style={{ fontSize: '0.72rem' }}>
                                Last action
                              </div>
                            </td>
                            <td>{t.products?.product_name || t.product_name}</td>
                            <td>
                              {t.products?.cubes?.cube_number || t.cubes?.cube_number || '—'} ·{' '}
                              {t.products?.cubes?.type || t.cubes?.type || '—'}
                            </td>
                            <td>{r.name}</td>
                            <td>{peso(Number(t.products?.price || 0) * Number(t.quantity || 1))}</td>
                            <td>
                              <span className={`status-pill ${t.payment_status === 'Paid' ? 'confirmed' : 'pending'}`}>
                                {t.payment_status}
                              </span>
                            </td>
                            <td>{t.users ? `${t.users.full_name} (${t.users.role})` : '—'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={4}>
                          <strong>Total ({salesFilterType} Product Sales)</strong>
                        </td>
                        <td colSpan={3}>
                          <strong>
                            {peso(
                              filteredSalesTx
                                .filter(isPaidTx)
                                .reduce((s, t) => s + Number(t.products?.price || 0) * Number(t.quantity || 1), 0),
                            )}
                          </strong>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <TablePagination page={salesPage} totalItems={filteredSalesTx.length} onPageChange={setSalesPage} />
                {filteredSalesTx.length === 0 && (
                  <div className="empty" style={{ marginBottom: '2.5rem' }}>
                    No product sales transactions found for this selection.
                    {rentalTotal > 0 && (
                      <div style={{ marginTop: 8 }}>
                        <button type="button" className="btn-ghost" onClick={() => setDashboardSection('rentals')}>
                          View Paid Cube Rental Income ({peso(rentalTotal)}) →
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* ════════════ RENTAL INCOME VIEW ════════════ */}
            {dashboardSection === 'rentals' && (
              <>
                <div className="stat-grid" style={{ marginBottom: '1.75rem' }}>
                  {rentalFilterType === 'All' ? (
                    <>
                      <div className="stat">
                        <div className="label">Total Paid Rental</div>
                        <div className="value">{peso(rentalTotal)}</div>
                      </div>
                      <div className="stat">
                        <div className="label">Display Cubes Rent</div>
                        <div className="value">
                          {peso(rentalSales.filter((r) => r.type === 'Display').reduce((s, r) => s + r.monthly, 0))}
                        </div>
                      </div>
                      <div className="stat">
                        <div className="label">Pick-up Cubes Rent</div>
                        <div className="value">
                          {peso(rentalSales.filter((r) => r.type === 'Pick-up').reduce((s, r) => s + r.monthly, 0))}
                        </div>
                      </div>
                      <div className="stat">
                        <div className="label">Paid Leased Cubes</div>
                        <div className="value">{new Set(rentalSales.map((r) => r.cube).filter(Boolean)).size}</div>
                      </div>
                    </>
                  ) : rentalFilterType === 'Display' ? (
                    <>
                      <div className="stat">
                        <div className="label">Display Cubes Rent</div>
                        <div className="value">
                          {peso(rentalSales.filter((r) => r.type === 'Display').reduce((s, r) => s + r.monthly, 0))}
                        </div>
                      </div>
                      <div className="stat">
                        <div className="label">Paid Display Cubes</div>
                        <div className="value">
                          {new Set(rentalSales.filter((r) => r.type === 'Display').map((r) => r.cube).filter(Boolean)).size}
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="stat">
                        <div className="label">Pick-up Cubes Rent</div>
                        <div className="value">
                          {peso(rentalSales.filter((r) => r.type === 'Pick-up').reduce((s, r) => s + r.monthly, 0))}
                        </div>
                      </div>
                      <div className="stat">
                        <div className="label">Paid Pick-up Cubes</div>
                        <div className="value">
                          {new Set(rentalSales.filter((r) => r.type === 'Pick-up').map((r) => r.cube).filter(Boolean)).size}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                <h2>
                  Paid Cube Rental Agreements ({rentalFilterType} Cubes · {month === 'all' ? 'All Time' : month})
                </h2>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort(sortRentals, setSortRentals, 'renter')}>
                          Renter {renderSortIndicator('renter', sortRentals)}
                        </th>
                        <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort(sortRentals, setSortRentals, 'cube')}>
                          Cube {renderSortIndicator('cube', sortRentals)}
                        </th>
                        <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort(sortRentals, setSortRentals, 'type')}>
                          Type {renderSortIndicator('type', sortRentals)}
                        </th>
                        <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort(sortRentals, setSortRentals, 'monthly')}>
                          Paid Rent {renderSortIndicator('monthly', sortRentals)}
                        </th>
                        <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort(sortRentals, setSortRentals, 'period')}>
                          Contract Period / Month {renderSortIndicator('period', sortRentals)}
                        </th>
                        <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort(sortRentals, setSortRentals, 'status')}>
                          Payment Status {renderSortIndicator('status', sortRentals)}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rentalsPageRows.map((r, i) => (
                        <tr key={`${r.key || r.cube}-${i}`}>
                          <td>
                            <strong>{r.renter}</strong>
                          </td>
                          <td>{r.cube}</td>
                          <td>{r.type}</td>
                          <td>
                            <strong>{peso(r.monthly)}</strong>
                          </td>
                          <td>
                            <div>{r.periodDates || r.period}</div>
                            {r.periodMonthLabel && (
                              <div className="muted" style={{ fontSize: '0.75rem' }}>
                                {r.periodMonthLabel} · {r.paymentMethod}
                              </div>
                            )}
                          </td>
                          <td>
                            <span className="badge ok" style={{ fontSize: '0.72rem' }}>
                              Paid
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={3}>
                          <strong>Total Paid Rental ({rentalFilterType})</strong>
                        </td>
                        <td colSpan={3}>
                          <strong>{peso(filteredRentals.reduce((s, r) => s + r.monthly, 0))}</strong>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <TablePagination page={rentalsPage} totalItems={filteredRentals.length} onPageChange={setRentalsPage} />
                {filteredRentals.length === 0 && (
                  <div className="empty" style={{ marginBottom: '2.5rem' }}>
                    No rental contracts found for this selection.
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* ════════════ PRINT REPORT DIALOG MODAL ════════════ */}
      {isPrintModalOpen && (
        <div className="modal-overlay no-print" onClick={() => setIsPrintModalOpen(false)}>
          <div className="modal-card" style={{ maxWidth: 540 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Generate & Print Report</h3>
              <button className="modal-close" onClick={() => setIsPrintModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
              <div className="field">
                <label>Report Type</label>
                <select
                  value={printReportType}
                  onChange={(e) => {
                    setPrintReportType(e.target.value as ReportType)
                  }}
                >
                  <option value="combined">Combined Sales & Cube Rental Report</option>
                  <option value="rental">Monthly Rental Payment Report (Cube Rent)</option>
                  <option value="display">Display Sales Report (Product Sales)</option>
                  <option value="pickup">Pick-up Sales Report (Product Sales)</option>
                </select>
              </div>

              <div className="field">
                <label>Date Filter Period</label>
                <select value={printDateMode} onChange={(e) => setPrintDateMode(e.target.value as DateFilterMode)}>
                  <option value="all">All Paid Records (Recommended)</option>
                  <option value="monthly">Monthly (Specific month)</option>
                  <option value="daily">Daily (Specific single date)</option>
                  <option value="yearly">Yearly (Full calendar year)</option>
                  <option value="custom">Custom Date Range (Start to End date)</option>
                </select>
              </div>

              {printDateMode === 'monthly' && (
                <div className="field">
                  <label>Select Month</label>
                  <input type="month" value={printMonth} onChange={(e) => setPrintMonth(e.target.value)} />
                </div>
              )}

              {printDateMode === 'daily' && (
                <div className="field">
                  <label>Select Date</label>
                  <input type="date" value={printDaily} onChange={(e) => setPrintDaily(e.target.value)} />
                </div>
              )}

              {printDateMode === 'yearly' && (
                <div className="field">
                  <label>Select Year</label>
                  <input
                    type="number"
                    min="2020"
                    max="2035"
                    value={printYearly}
                    onChange={(e) => setPrintYearly(e.target.value)}
                  />
                </div>
              )}

              {printDateMode === 'custom' && (
                <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div className="field">
                    <label>Start Date</label>
                    <input type="date" value={printStartDate} onChange={(e) => setPrintStartDate(e.target.value)} />
                  </div>
                  <div className="field">
                    <label>End Date</label>
                    <input type="date" value={printEndDate} onChange={(e) => setPrintEndDate(e.target.value)} />
                  </div>
                </div>
              )}

              <div className="field">
                <label>Renter Filter</label>
                <select value={printRenterId} onChange={(e) => setPrintRenterId(e.target.value)}>
                  <option value="all">All Renters ({filteredRentersForReport.length})</option>
                  {filteredRentersForReport.map((r) => (
                    <option key={r.user_id} value={r.user_id}>
                      {r.full_name} (#{r.user_id})
                    </option>
                  ))}
                </select>
              </div>

              <div className="alert info" style={{ fontSize: '0.85rem' }}>
                <div>
                  Preview summary: <strong>{printFilteredData.list.length} records</strong> found. Total:{' '}
                  <strong>{peso(printFilteredData.total)}</strong>
                </div>
                {(printReportType === 'display' || printReportType === 'pickup') &&
                  printFilteredData.txTotal === 0 &&
                  printFilteredData.rentalTotal > 0 && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #bae6fd' }}>
                      Note: Selected renter(s) have <strong>{peso(printFilteredData.rentalTotal)}</strong> in Paid Cube Rental
                      (Month 1 / Installments).{' '}
                      <button
                        type="button"
                        className="btn-ghost"
                        style={{ padding: '2px 8px', fontSize: '0.78rem', textDecoration: 'underline', color: '#0369a1' }}
                        onClick={() => setPrintReportType('rental')}
                      >
                        Switch to Monthly Rental Payment Report
                      </button>
                    </div>
                  )}
              </div>

              <div className="row" style={{ justifyContent: 'flex-end', marginTop: '1rem', gap: '0.6rem', flexWrap: 'wrap' }}>
                <button className="btn-ghost" type="button" onClick={() => setIsPrintModalOpen(false)}>
                  Cancel
                </button>
                <button
                  className="btn-ghost"
                  type="button"
                  onClick={handleTriggerPrint}
                  style={{ border: '1px solid #cbd5e1' }}
                  title="Open formatted print window"
                >
                  <Printer size={16} /> Print Report
                </button>
                <button className="btn" type="button" onClick={handleDownloadPdf} title="Download standalone PDF document">
                  <Download size={16} /> Preview PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {pdfPreviewUrl && (
        <div className="modal-overlay no-print" onClick={() => setPdfPreviewUrl(null)}>
          <div
            className="modal-card"
            style={{ maxWidth: 980, width: '96vw', height: '90vh', display: 'flex', flexDirection: 'column' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h3 style={{ margin: 0 }}>PDF Preview</h3>
                <p className="muted" style={{ margin: '0.2rem 0 0', fontSize: '.85rem' }}>
                  Review the report before downloading it.
                </p>
              </div>
              <button className="modal-close" onClick={() => setPdfPreviewUrl(null)}>
                <X size={18} />
              </button>
            </div>
            <iframe
              title="Report PDF preview"
              src={pdfPreviewUrl}
              style={{ flex: 1, width: '100%', border: '1px solid #e2e8f0', borderRadius: 8, marginTop: 12 }}
            />
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="btn-ghost" type="button" onClick={() => setPdfPreviewUrl(null)}>
                Back
              </button>
              <a
                className="btn"
                href={pdfPreviewUrl}
                download={`TrackErentory_${printReportType}_${todayISO()}.pdf`}
              >
                <Download size={16} /> Download PDF
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ════════════ DEDICATED PRINT DOCUMENT ════════════ */}
      <div id="owner-print-report" className="print-report-container">
        <div className="report-header-brand" style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <img
            src="/TrackErentory.svg"
            alt="TrackErentory"
            className="brand-logo"
            style={{ height: 56, width: 56, objectFit: 'contain' }}
          />
          <div>
            <div
              style={{
                fontSize: '1.5rem',
                fontWeight: 700,
                letterSpacing: '0.05em',
                lineHeight: 1.15,
                textTransform: 'uppercase',
                color: '#000',
              }}
            >
              TRACKERENTORY
            </div>
            <div style={{ fontSize: '1rem', color: '#333', marginTop: 2 }}>Arce Concept Store</div>
          </div>
        </div>

        <div
          style={{
            textAlign: 'center',
            fontSize: '1.35rem',
            fontWeight: 700,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            margin: '1.75rem 0 1.25rem',
            color: '#000',
          }}
        >
          {printReportType === 'display' && 'DISPLAY SALES REPORT'}
          {printReportType === 'pickup' && 'PICK-UP SALES REPORT'}
          {printReportType === 'rental' && 'MONTHLY RENTAL PAYMENT REPORT'}
          {printReportType === 'combined' && 'COMBINED SALES & CUBE RENTAL REPORT'}
        </div>

        <div
          className="print-report-meta"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '0.95rem',
            color: '#000',
            marginBottom: '0.65rem',
          }}
        >
          <span>period: {printPeriodLabel}</span>
          <span>renter: {selectedRenterName}</span>
          <span>date generated: {new Date().toLocaleDateString('en-PH')}</span>
        </div>

        <hr style={{ border: 'none', borderTop: '2px solid #000', margin: '0 0 1.25rem' }} />

        {(printReportType === 'rental' || printReportType === 'combined') && (
          <table
            className="print-table"
            style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem', marginBottom: '1.5rem' }}
          >
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>renter</th>
                <th>cube no.</th>
                <th>type</th>
                <th>contract period / installment</th>
                <th style={{ textAlign: 'right' }}>paid rent</th>
              </tr>
            </thead>
            <tbody>
              {printFilteredData.rentalList.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '1.5rem', color: '#6b7280' }}>
                    No paid rental contracts found for this selection.
                  </td>
                </tr>
              ) : (
                printFilteredData.rentalList.map((r, i) => (
                  <tr key={i}>
                    <td style={{ textAlign: 'left' }}>{r.renter}</td>
                    <td style={{ textAlign: 'center' }}>{r.cube}</td>
                    <td style={{ textAlign: 'center' }}>{r.type}</td>
                    <td style={{ textAlign: 'center' }}>
                      <div>{r.periodDates || r.period}</div>
                      {r.periodMonthLabel && (
                        <div style={{ fontSize: '0.75rem', color: '#555' }}>
                          {r.periodMonthLabel} · {r.paymentMethod}
                        </div>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>{peso(r.monthly)}</td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4}>total paid rental income</td>
                <td style={{ textAlign: 'right' }}>{peso(printFilteredData.rentalTotal)}</td>
              </tr>
            </tfoot>
          </table>
        )}

        {printReportType !== 'rental' && (
          <table
            className="print-table"
            style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem', marginBottom: '1.5rem' }}
          >
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>product</th>
                <th>cube</th>
                <th>renter</th>
                <th>date</th>
                <th>payment</th>
                <th>process</th>
                <th>qty</th>
                <th style={{ textAlign: 'right' }}>total</th>
              </tr>
            </thead>
            <tbody>
              {printFilteredData.txList.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '1.5rem', color: '#6b7280' }}>
                    No sales transactions found for this period.
                  </td>
                </tr>
              ) : (
                printFilteredData.txList.map((t) => {
                  const r = getTxRenter(t)
                  const amt = Number(t.products?.price || 0) * Number(t.quantity || 1)
                  const txDate = new Date(t.transaction_date).toLocaleDateString('en-PH')
                  const processorName = t.users?.full_name || 'Staff'
                  const paymentStr = t.payment_method || 'Cash'
                  return (
                    <tr key={t.transaction_id}>
                      <td style={{ textAlign: 'left' }}>
                        <div>{t.products?.product_name || t.product_name || '—'}</div>
                        {t.products?.variant && (
                          <div style={{ fontSize: '0.75rem', color: '#555' }}>Variant: {t.products.variant}</div>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {t.products?.cubes?.cube_number || t.cubes?.cube_number || '—'}
                      </td>
                      <td style={{ textAlign: 'center' }}>{r.name}</td>
                      <td style={{ textAlign: 'center' }}>{txDate}</td>
                      <td style={{ textAlign: 'center' }}>{paymentStr}</td>
                      <td style={{ textAlign: 'center' }}>{processorName}</td>
                      <td style={{ textAlign: 'center' }}>{t.quantity || 1}</td>
                      <td style={{ textAlign: 'right' }}>{peso(amt)}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={7}>total product sales</td>
                <td style={{ textAlign: 'right' }}>{peso(printFilteredData.txTotal)}</td>
              </tr>
            </tfoot>
          </table>
        )}

        <div
          className="print-report-signatures"
          style={{ display: 'flex', justifyContent: 'space-between', marginTop: '5rem', padding: '0 1.5rem' }}
        >
          <div>
            <div className="sig-line" style={{ width: 190, borderBottom: '1px solid #000', marginBottom: '0.5rem' }}></div>
            <div style={{ fontSize: '0.92rem', color: '#000' }}>prepared by</div>
          </div>
          <div>
            <div className="sig-line" style={{ width: 190, borderBottom: '1px solid #000', marginBottom: '0.5rem' }}></div>
            <div style={{ fontSize: '0.92rem', color: '#000' }}>received/acknowledge by</div>
          </div>
        </div>
      </div>
    </section>
  )
}
