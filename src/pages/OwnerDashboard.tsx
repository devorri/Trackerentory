import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Printer, Download, X, ArrowUpDown } from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/Auth'
import { peso, type Contract, type Transaction, type Product } from '../lib/types'
import { SkeletonStat, SkeletonTable } from '../components/Skeleton'
import TablePagination, { DEFAULT_PAGE_SIZE } from '../components/TablePagination'

type ReportType = 'display' | 'pickup' | 'rental'
type DateFilterMode = 'monthly' | 'daily' | 'yearly' | 'custom'
type DashboardSection = 'sales' | 'rentals'
const PAGE_SIZE = DEFAULT_PAGE_SIZE

export default function OwnerDashboard() {
  const { user } = useAuth()
  const [contracts, setContracts] = useState<Contract[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [renters, setRenters] = useState<{ user_id: number; full_name: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [dashboardSection, setDashboardSection] = useState<DashboardSection>('sales')
  const [salesFilterType, setSalesFilterType] = useState<'All' | 'Display' | 'Pick-up'>('All')
  const [rentalFilterType, setRentalFilterType] = useState<'All' | 'Display' | 'Pick-up'>('All')
  const [rentalsPage, setRentalsPage] = useState(1)
  const [salesPage, setSalesPage] = useState(1)

  // Print Dialog State
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false)
  const [printReportType, setPrintReportType] = useState<ReportType>('display')
  const [printDateMode, setPrintDateMode] = useState<DateFilterMode>('monthly')
  const [printMonth, setPrintMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [printDaily, setPrintDaily] = useState(() => new Date().toISOString().slice(0, 10))
  const [printYearly, setPrintYearly] = useState(() => String(new Date().getFullYear()))
  const [printStartDate, setPrintStartDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [printEndDate, setPrintEndDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [printRenterId, setPrintRenterId] = useState<string>('all')
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null)

  function refreshData() {
    setLoading(true)
    void Promise.all([
      supabase.from('contracts').select('*, cubes(*), users!renter_id(user_id, full_name)'),
      supabase.from('transactions').select('*, products(*, cubes(cube_number, type)), cubes(cube_number, type), users!processed_by(full_name, role)').order('updated_at', { ascending: false }),
      supabase.from('users').select('user_id, full_name').eq('role', 'Renter').order('full_name'),
    ]).then(([c, t, r]) => {
      setLoading(false)
      if (!c.error) setContracts((c.data || []) as Contract[])
      if (!t.error) setTransactions((t.data || []) as Transaction[])
      if (!r.error) setRenters((r.data || []) as { user_id: number; full_name: string }[])
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

  function toggleSort(state: { col: string; dir: 'asc' | 'desc' }, setState: React.Dispatch<React.SetStateAction<{ col: string; dir: 'asc' | 'desc' }>>, col: string) {
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

  const rentalSales = useMemo(() => {
    return contracts
      .filter((c) => c.status === 'Active' || c.status === 'Pending')
      .map((c) => ({
        contract_id: c.contract_id,
        status: c.status,
        renter_id: c.renter_id,
        renter: c.users?.full_name || (c.renter_id ? renterMap.get(c.renter_id) : null) || `User #${c.renter_id}`,
        cube: c.cubes?.cube_number,
        type: c.cubes?.type,
        monthly: Number(c.cubes?.price_per_month || 0),
        period: `${c.start_date} → ${c.end_date}`,
        startDate: c.start_date,
      }))
  }, [contracts, renterMap])

  const rentalSalesSorted = useMemo(() => {
    const list = [...rentalSales]
    const { col, dir } = sortRentals
    list.sort((a, b) => {
      let vA: any = ''
      let vB: any = ''
      if (col === 'renter') { vA = a.renter; vB = b.renter }
      else if (col === 'cube') { vA = a.cube || ''; vB = b.cube || '' }
      else if (col === 'type') { vA = a.type || ''; vB = b.type || '' }
      else if (col === 'monthly') { vA = a.monthly; vB = b.monthly }
      else if (col === 'period') { vA = a.startDate; vB = b.startDate }
      else if (col === 'status') { vA = a.status; vB = b.status }
      if (vA < vB) return dir === 'asc' ? -1 : 1
      if (vA > vB) return dir === 'asc' ? 1 : -1
      return 0
    })
    return list
  }, [rentalSales, sortRentals])

  const rentalTotal = rentalSales
    .filter((r) => r.status === 'Active')
    .reduce((s, r) => s + r.monthly, 0)

  const monthTx = useMemo(() => {
    return transactions.filter((t) => {
      if (month === 'all') return true
      return String(t.transaction_date || '').startsWith(month)
    })
  }, [transactions, month])

  const monthTxSorted = useMemo(() => {
    const list = [...monthTx]
    const { col, dir } = sortMonthTx
    list.sort((a, b) => {
      let vA: any = ''
      let vB: any = ''
      if (col === 'date') { vA = new Date(a.updated_at || a.transaction_date).getTime(); vB = new Date(b.updated_at || b.transaction_date).getTime() }
      else if (col === 'product') { vA = a.products?.product_name || a.product_name || ''; vB = b.products?.product_name || b.product_name || '' }
      else if (col === 'cube') { vA = a.products?.cubes?.cube_number || a.cubes?.cube_number || ''; vB = b.products?.cubes?.cube_number || b.cubes?.cube_number || '' }
      else if (col === 'renter') { vA = getTxRenter(a).name; vB = getTxRenter(b).name }
      else if (col === 'amount') { vA = Number(a.products?.price || 0) * Number(a.quantity || 1); vB = Number(b.products?.price || 0) * Number(b.quantity || 1) }
      else if (col === 'payment') { vA = a.payment_status; vB = b.payment_status }
      else if (col === 'processed') { vA = a.users?.full_name || ''; vB = b.users?.full_name || '' }
      if (vA < vB) return dir === 'asc' ? -1 : 1
      if (vA > vB) return dir === 'asc' ? 1 : -1
      return 0
    })
    return list
  }, [monthTx, sortMonthTx])


  const isPaidTx = (t: Transaction) => t.payment_status === 'Paid' || t.pickup_status === 'Picked-up'

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
    return monthTxSorted.filter((t) => {
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
      const ids = new Set(
        contracts.filter((c) => c.cubes?.type === 'Display').map((c) => c.renter_id)
      )
      return renters.filter((r) => ids.has(r.user_id))
    }
    if (printReportType === 'pickup') {
      const ids = new Set(
        contracts.filter((c) => c.cubes?.type === 'Pick-up').map((c) => c.renter_id)
      )
      return renters.filter((r) => ids.has(r.user_id))
    }
    return renters
  }, [printReportType, contracts, renters])

  const rentalsPageRows = filteredRentals.slice((rentalsPage - 1) * PAGE_SIZE, rentalsPage * PAGE_SIZE)
  const salesPageRows = filteredSalesTx.slice((salesPage - 1) * PAGE_SIZE, salesPage * PAGE_SIZE)

  // Helper to resolve transaction renter
  const getTxRenter = (t: Transaction) => {
    const p = t.products as (Product & { cubes?: { cube_number?: string; type?: string } | null; renter_id?: number | null; cube_id?: number | null }) | null
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

  // Filtered transactions for the printable report
  const printFilteredData = useMemo(() => {
    if (printReportType === 'rental') {
      let filtered = rentalSales
      if (printRenterId !== 'all') {
        const rid = Number(printRenterId)
        filtered = filtered.filter((r) => r.renter_id === rid)
      }
      const total = filtered.reduce((acc, curr) => acc + curr.monthly, 0)
      return { list: filtered, total }
    }

    // Match transaction date according to selected date mode
    const matchesDate = (dateStr: string) => {
      if (!dateStr) return false
      const d = String(dateStr).slice(0, 10)
      if (printDateMode === 'daily') return d === printDaily
      if (printDateMode === 'monthly') return d.slice(0, 7) === printMonth
      if (printDateMode === 'yearly') return d.slice(0, 4) === printYearly
      if (printDateMode === 'custom') return d >= printStartDate && d <= printEndDate
      return true
    }

    // Display or Pick-up report
    const targetType = printReportType === 'display' ? 'Display' : 'Pick-up'
    let list = transactions.filter((t) => {
      const dateMatch = matchesDate(t.transaction_date)
      const typeMatch = (t.products?.cubes?.type || t.cubes?.type) === targetType
      return dateMatch && typeMatch
    }).sort((a, b) => new Date(b.updated_at || b.transaction_date).getTime() - new Date(a.updated_at || a.transaction_date).getTime())

    if (printRenterId !== 'all') {
      const rid = Number(printRenterId)
      list = list.filter((t) => {
        const r = getTxRenter(t)
        return r.id === rid
      })
    }

    const total = list.reduce((acc, t) => {
      if (t.payment_status === 'Paid') {
        return acc + Number(t.products?.price || 0) * Number(t.quantity || 1)
      }
      return acc
    }, 0)

    return { list, total }
  }, [transactions, rentalSales, printReportType, printDateMode, printMonth, printDaily, printYearly, printStartDate, printEndDate, printRenterId])

  const printPeriodLabel = useMemo(() => {
    if (printReportType === 'rental') return 'Active Rental Contracts'
    if (printDateMode === 'daily') return `Daily: ${new Date(printDaily).toLocaleDateString('en-PH', { dateStyle: 'long' })}`
    if (printDateMode === 'monthly') return `Monthly: ${new Date(`${printMonth}-01`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`
    if (printDateMode === 'yearly') return `Yearly: ${printYearly}`
    if (printDateMode === 'custom') return `Custom Date Range: ${printStartDate} to ${printEndDate}`
    return printMonth
  }, [printReportType, printDateMode, printDaily, printMonth, printYearly, printStartDate, printEndDate])

  function buildPrintableReportHtml() {
    const reportTitle = printReportType === 'display'
      ? 'Display Sales Report'
      : printReportType === 'pickup'
        ? 'Pick-up Sales Report'
        : 'Monthly Rental Payment Report'

    const rowsHtml = printReportType === 'rental'
      ? (printFilteredData.list.length === 0
          ? `<tr><td colspan="5" style="text-align:center;padding:1.5rem;color:#6b7280;">No rental contracts found for this selection.</td></tr>`
          : (printFilteredData.list as typeof rentalSales).map((r) => `
              <tr>
                <td>${r.renter}</td>
                <td>${r.cube ?? '—'}</td>
                <td>${r.type ?? '—'}</td>
                <td>${r.period}</td>
                <td style="text-align:right;">${peso(r.monthly)}</td>
              </tr>
            `).join('')
        )
      : (printFilteredData.list.length === 0
          ? `<tr><td colspan="8" style="text-align:center;padding:1.5rem;color:#6b7280;">No sales transactions found for this period.</td></tr>`
          : (printFilteredData.list as Transaction[]).map((t) => {
              const renter = getTxRenter(t)
              return `
                <tr>
                  <td><strong>${t.products?.product_name || t.product_name || '—'}</strong>${t.products?.variant ? `<div style="font-size:0.75rem;color:#555;">Variant: ${t.products.variant}</div>` : ''}</td>
                  <td>${t.products?.cubes?.cube_number || t.cubes?.cube_number || '—'}</td>
                  <td>${renter.name}</td>
                  <td>${new Date(t.transaction_date).toLocaleDateString('en-PH')}</td>
                  <td>${t.payment_status}</td>
                  <td>${t.payment_method || 'Cash'}</td>
                  <td>${t.quantity || 1}</td>
                  <td style="text-align:right;">${peso(Number(t.products?.price || 0) * Number(t.quantity || 1))}</td>
                </tr>
              `
            }).join('')
        )

    const tableMarkup = printReportType === 'rental'
      ? `
        <table>
          <thead>
            <tr>
              <th>Renter</th>
              <th>Cube No.</th>
              <th>Type</th>
              <th>Contract Period</th>
              <th style="text-align:right;">Monthly Rent</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
          <tfoot>
            <tr>
              <td colspan="4"><strong>Total Rental Income</strong></td>
              <td style="text-align:right;"><strong>${peso(printFilteredData.total)}</strong></td>
            </tr>
          </tfoot>
        </table>
      `
      : `
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Cube</th>
              <th>Renter</th>
              <th>Date</th>
              <th>Payment</th>
              <th>Process</th>
              <th>Qty</th>
              <th style="text-align:right;">Total</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
          <tfoot>
            <tr>
              <td colspan="7"><strong>Overall Total (${printPeriodLabel})</strong></td>
              <td style="text-align:right;"><strong>${peso(printFilteredData.total)}</strong></td>
            </tr>
          </tfoot>
        </table>
      `

    return `<!doctype html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <title>${reportTitle}</title>
          <style>
            body {
              margin: 0;
              padding: 2rem 1.5rem;
              font-family: Arial, Helvetica, sans-serif;
              color: #111827;
              background: #fff;
            }
            .toolbar {
              display: flex;
              justify-content: flex-end;
              gap: 0.75rem;
              margin-bottom: 1rem;
            }
            .toolbar button {
              border: 1px solid #111827;
              background: #111827;
              color: white;
              padding: 0.65rem 1rem;
              border-radius: 8px;
              cursor: pointer;
              font-size: 0.9rem;
            }
            .toolbar button.secondary {
              background: white;
              color: #111827;
            }
            .report {
              border: 1px solid #d1d5db;
              padding: 1.5rem;
              max-width: 1100px;
              margin: 0 auto;
            }
            .header {
              text-align: center;
              border-bottom: 2px solid #111827;
              padding-bottom: 1rem;
              margin-bottom: 1.5rem;
            }
            .header h1 {
              margin: 0 0 0.25rem;
              font-size: 1.8rem;
              letter-spacing: 0.04em;
              text-transform: uppercase;
            }
            .header h2 {
              margin: 0;
              font-size: 1.2rem;
              color: #374151;
            }
            .meta {
              display: flex;
              justify-content: space-between;
              gap: 1rem;
              font-size: 0.82rem;
              margin-top: 0.75rem;
              flex-wrap: wrap;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              font-size: 0.9rem;
            }
            th, td {
              border: 1px solid #374151;
              padding: 0.6rem 0.7rem;
              vertical-align: top;
            }
            th {
              background: #e5e7eb;
              text-transform: uppercase;
              font-size: 0.78rem;
            }
            tfoot td {
              background: #f9fafb;
              font-weight: 700;
            }
            .signatures {
              display: flex;
              justify-content: space-between;
              margin-top: 3rem;
              gap: 2rem;
            }
            .sig-line {
              width: 180px;
              border-bottom: 1px solid #111827;
              margin-bottom: 0.5rem;
            }
            @media print {
              .toolbar { display: none !important; }
              body { padding: 0; }
              .report { border: none; max-width: none; }
            }
          </style>
        </head>
        <body>
          <div class="toolbar">
            <button type="button" onclick="window.print()">Print / Save as PDF</button>
            <button type="button" class="secondary" onclick="window.close()">Close</button>
          </div>

          <div class="report">
            <div class="header">
              <h1 style="margin: 0 0 0.25rem; font-size: 1.6rem; letter-spacing: 0.05em; text-transform: uppercase;">Arce Concept Boutique</h1>
              <div style="font-size: 0.85rem; color: #64748b; margin-top: 2px;">TrackErentory • Cube Rental & Retail Management</div>
              <h2 style="margin: 0.75rem 0 0; font-size: 1.15rem; color: #1e293b;">${reportTitle}</h2>
              <div class="meta">
                <span><strong>Period:</strong> ${printPeriodLabel}</span>
                <span><strong>Renter:</strong> ${selectedRenterName}</span>
                <span><strong>Date Generated:</strong> ${new Date().toLocaleDateString('en-PH')}</span>
              </div>
            </div>

            ${tableMarkup}

            <div class="signatures">
              <div>
                <div class="sig-line"></div>
                <div>Prepared By (Owner)</div>
              </div>
              <div>
                <div class="sig-line"></div>
                <div>Received / Acknowledged By</div>
              </div>
            </div>
          </div>
        </body>
      </html>
    `
  }

  function handleDownloadPdf() {
    setIsPrintModalOpen(false)
    const doc = new jsPDF()

    const reportTitle = printReportType === 'display'
      ? 'Display Sales Report'
      : printReportType === 'pickup'
        ? 'Pick-up Sales Report'
        : 'Monthly Rental Payment Report'

    // Header Branding
    doc.setFontSize(18)
    doc.setTextColor(30, 41, 59)
    doc.text('Arce Concept Boutique', 14, 18)

    doc.setFontSize(9)
    doc.setTextColor(100, 116, 139)
    doc.text('TrackErentory • Cube Rental & Retail Management', 14, 23)

    doc.setFontSize(12)
    doc.setTextColor(51, 65, 85)
    doc.text(reportTitle, 14, 30)

    // Meta details
    doc.setFontSize(8.5)
    doc.setTextColor(100, 116, 139)
    doc.text(`Period: ${printPeriodLabel}`, 14, 37)
    doc.text(`Renter: ${selectedRenterName}`, 14, 42)
    doc.text(`Date Generated: ${new Date().toLocaleDateString('en-PH')}`, 14, 47)

    if (printReportType === 'rental') {
      const rows = (printFilteredData.list as typeof rentalSales).map((r) => [
        r.renter,
        r.cube || '—',
        r.type || '—',
        r.period,
        peso(r.monthly),
      ])

      autoTable(doc, {
        startY: 52,
        head: [['Renter', 'Cube No.', 'Type', 'Contract Period', 'Monthly Rent']],
        body: rows,
        foot: [['Total Rental Income', '', '', '', peso(printFilteredData.total)]],
        theme: 'striped',
        headStyles: { fillColor: [45, 55, 72], textColor: 255 },
        footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
        styles: { fontSize: 8.5 },
        columnStyles: { 4: { halign: 'right' } },
      })
    } else {
      const rows = (printFilteredData.list as Transaction[]).map((t) => {
        const r = getTxRenter(t)
        const amt = Number(t.products?.price || 0) * Number(t.quantity || 1)
        return [
          t.products?.product_name || t.product_name || '—',
          t.products?.cubes?.cube_number || t.cubes?.cube_number || '—',
          r.name,
          new Date(t.transaction_date).toLocaleDateString('en-PH'),
          t.payment_status,
          t.payment_method || 'Cash',
          String(t.quantity || 1),
          peso(amt),
        ]
      })

      autoTable(doc, {
        startY: 52,
        head: [['Product', 'Cube', 'Renter', 'Date', 'Payment', 'Process', 'Qty', 'Total']],
        body: rows,
        foot: [[`Overall Total (${printPeriodLabel})`, '', '', '', '', '', '', peso(printFilteredData.total)]],
        theme: 'striped',
        headStyles: { fillColor: [45, 55, 72], textColor: 255 },
        footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
        styles: { fontSize: 8 },
        columnStyles: { 7: { halign: 'right' } },
      })
    }

    // Signatures block
    const finalY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 25 : 200
    doc.setFontSize(8.5)
    doc.setTextColor(30, 41, 59)
    doc.line(14, finalY, 74, finalY)
    doc.text('Prepared By (Owner)', 14, finalY + 6)

    doc.line(136, finalY, 196, finalY)
    doc.text('Received / Acknowledged By', 136, finalY + 6)

    if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl)
    setPdfPreviewUrl(String(doc.output('bloburl')))
  }

  function handleTriggerPrint() {
    setIsPrintModalOpen(false)

    const reportHtml = buildPrintableReportHtml()
    const reportWindow = window.open('', '_blank', 'width=1100,height=850')
    if (!reportWindow) {
      // Fallback: If pop-ups are blocked, use standard window.print()
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
            <p className="lede">Owner only. <Link to="/login">Sign in</Link></p>
          </div>
        </div>
      </section>
    )
  }

  const selectedRenterName = printRenterId === 'all'
    ? 'All Renters'
    : (renters.find((r) => r.user_id === Number(printRenterId))?.full_name || 'Selected Renter')

  return (
    <section>
      {/* ════════════ ON-SCREEN DASHBOARD VIEW ════════════ */}
      <div className="no-print">
        <div className="page-header">
          <div>
            <h1>Owner sales & reports</h1>
            <p className="lede">Monthly rental income and Display / Pick-up product sales before releasing payouts to renters.</p>
          </div>
          <div className="row">
            <button className="btn" type="button" onClick={() => setIsPrintModalOpen(true)}>
              <Printer size={16} /> Print Report
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          <div className="field" style={{ maxWidth: 220, margin: 0 }}>
            <label>Product sales month</label>
            <input type="month" value={month === 'all' ? '' : month} onChange={(e) => setMonth(e.target.value || 'all')} />
          </div>
          <button
            type="button"
            className={month === 'all' ? 'btn' : 'btn-ghost'}
            onClick={() => setMonth(month === 'all' ? new Date().toISOString().slice(0, 7) : 'all')}
            style={{ fontSize: '0.85rem', padding: '0.65rem 1rem' }}
          >
            {month === 'all' ? 'Filter by Selected Month' : 'Show All Time Sales'}
          </button>
        </div>

        {/* TOP LEVEL SECTIONS: Product Sales & Rental Income */}
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', borderBottom: '2px solid #e2e8f0', paddingBottom: '0.5rem' }}>
          <button
            type="button"
            className={dashboardSection === 'sales' ? 'btn' : 'btn-ghost'}
            style={{ fontSize: '0.95rem', padding: '0.5rem 1.25rem', fontWeight: 700 }}
            onClick={() => setDashboardSection('sales')}
          >
            Product Sales
          </button>
          <button
            type="button"
            className={dashboardSection === 'rentals' ? 'btn' : 'btn-ghost'}
            style={{ fontSize: '0.95rem', padding: '0.5rem 1.25rem', fontWeight: 700 }}
            onClick={() => setDashboardSection('rentals')}
          >
            Rental Income
          </button>
        </div>

        {/* SUB-PILLS: All | Display | Pick-up */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', alignItems: 'center' }}>
          <span className="muted" style={{ fontSize: '0.82rem', fontWeight: 600 }}>Filter by Cube Type:</span>
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
            {/* ════════════ PRODUCT SALES VIEW ════════════ */}
            {dashboardSection === 'sales' && (
              <>
                <div className="stat-grid" style={{ marginBottom: '1.75rem' }}>
                  {salesFilterType === 'All' ? (
                    <>
                      <div className="stat">
                        <div className="label">Total Product Sales</div>
                        <div className="value">{peso(byType.total)}</div>
                      </div>
                      <div className="stat">
                        <div className="label">Display Cube Sales</div>
                        <div className="value">{peso(byType.display)}</div>
                      </div>
                      <div className="stat">
                        <div className="label">Pick-up Cube Sales</div>
                        <div className="value">{peso(byType.pickup)}</div>
                      </div>
                      <div className="stat">
                        <div className="label">Completed Orders</div>
                        <div className="value">{monthTx.filter(isPaidTx).length}</div>
                      </div>
                    </>
                  ) : salesFilterType === 'Display' ? (
                    <>
                      <div className="stat">
                        <div className="label">Display Cube Sales</div>
                        <div className="value">{peso(byType.display)}</div>
                      </div>
                      <div className="stat">
                        <div className="label">Items Sold</div>
                        <div className="value">
                          {monthTx
                            .filter((t) => isPaidTx(t) && (t.products?.cubes?.type || t.cubes?.type) !== 'Pick-up')
                            .reduce((s, t) => s + (t.quantity || 1), 0)}
                        </div>
                      </div>
                      <div className="stat">
                        <div className="label">Display Consignors</div>
                        <div className="value">
                          {new Set(
                            monthTx
                              .filter((t) => (t.products?.cubes?.type || t.cubes?.type) !== 'Pick-up')
                              .map((t) => getTxRenter(t).id)
                              .filter(Boolean)
                          ).size}
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="stat">
                        <div className="label">Pick-up Sales</div>
                        <div className="value">{peso(byType.pickup)}</div>
                      </div>
                      <div className="stat">
                        <div className="label">Parcels Picked Up</div>
                        <div className="value">
                          {monthTx.filter((t) => isPaidTx(t) && (t.products?.cubes?.type || t.cubes?.type) === 'Pick-up').length}
                        </div>
                      </div>
                      <div className="stat">
                        <div className="label">Pick-up Consignors</div>
                        <div className="value">
                          {new Set(
                            monthTx
                              .filter((t) => (t.products?.cubes?.type || t.cubes?.type) === 'Pick-up')
                              .map((t) => getTxRenter(t).id)
                              .filter(Boolean)
                          ).size}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                <h2>Product Sales ({salesFilterType} Cubes · {month === 'all' ? 'All Time' : month})</h2>
                <p className="muted">Sales records for customer purchases before releasing payout.</p>

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
                              <div className="muted" style={{ fontSize: '0.72rem' }}>Last action</div>
                            </td>
                            <td>{t.products?.product_name || t.product_name}</td>
                            <td>{t.products?.cubes?.cube_number || t.cubes?.cube_number || '—'} · {t.products?.cubes?.type || t.cubes?.type || '—'}</td>
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
                        <td colSpan={4}><strong>Total ({salesFilterType} Sales)</strong></td>
                        <td colSpan={3}>
                          <strong>
                            {peso(
                              filteredSalesTx
                                .filter(isPaidTx)
                                .reduce((s, t) => s + Number(t.products?.price || 0) * Number(t.quantity || 1), 0)
                            )}
                          </strong>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <TablePagination page={salesPage} totalItems={filteredSalesTx.length} onPageChange={setSalesPage} />
                {filteredSalesTx.length === 0 && <div className="empty" style={{ marginBottom: '2.5rem' }}>No product sales transactions found for this selection.</div>}
              </>
            )}

            {/* ════════════ RENTAL INCOME VIEW ════════════ */}
            {dashboardSection === 'rentals' && (
              <>
                <div className="stat-grid" style={{ marginBottom: '1.75rem' }}>
                  {rentalFilterType === 'All' ? (
                    <>
                      <div className="stat">
                        <div className="label">Total Monthly Rental</div>
                        <div className="value">{peso(rentalTotal)}</div>
                      </div>
                      <div className="stat">
                        <div className="label">Display Cubes Rent</div>
                        <div className="value">
                          {peso(
                            rentalSales
                              .filter((r) => r.status === 'Active' && r.type === 'Display')
                              .reduce((s, r) => s + r.monthly, 0)
                          )}
                        </div>
                      </div>
                      <div className="stat">
                        <div className="label">Pick-up Cubes Rent</div>
                        <div className="value">
                          {peso(
                            rentalSales
                              .filter((r) => r.status === 'Active' && r.type === 'Pick-up')
                              .reduce((s, r) => s + r.monthly, 0)
                          )}
                        </div>
                      </div>
                      <div className="stat">
                        <div className="label">Active Leased Cubes</div>
                        <div className="value">{contracts.filter((c) => c.status === 'Active').length}</div>
                      </div>
                    </>
                  ) : rentalFilterType === 'Display' ? (
                    <>
                      <div className="stat">
                        <div className="label">Display Cubes Rent</div>
                        <div className="value">
                          {peso(
                            rentalSales
                              .filter((r) => r.status === 'Active' && r.type === 'Display')
                              .reduce((s, r) => s + r.monthly, 0)
                          )}
                        </div>
                      </div>
                      <div className="stat">
                        <div className="label">Active Display Cubes</div>
                        <div className="value">
                          {contracts.filter((c) => c.status === 'Active' && c.cubes?.type === 'Display').length}
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="stat">
                        <div className="label">Pick-up Cubes Rent</div>
                        <div className="value">
                          {peso(
                            rentalSales
                              .filter((r) => r.status === 'Active' && r.type === 'Pick-up')
                              .reduce((s, r) => s + r.monthly, 0)
                          )}
                        </div>
                      </div>
                      <div className="stat">
                        <div className="label">Active Pick-up Cubes</div>
                        <div className="value">
                          {contracts.filter((c) => c.status === 'Active' && c.cubes?.type === 'Pick-up').length}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                <h2>Monthly Rental Agreements ({rentalFilterType} Cubes)</h2>
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
                          Monthly Rent {renderSortIndicator('monthly', sortRentals)}
                        </th>
                        <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort(sortRentals, setSortRentals, 'period')}>
                          Contract Period {renderSortIndicator('period', sortRentals)}
                        </th>
                        <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort(sortRentals, setSortRentals, 'status')}>
                          Status {renderSortIndicator('status', sortRentals)}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rentalsPageRows.map((r, i) => (
                        <tr key={`${r.cube}-${i}`}>
                          <td>{r.renter}</td>
                          <td>{r.cube}</td>
                          <td>{r.type}</td>
                          <td>{peso(r.monthly)}</td>
                          <td>{r.period}</td>
                          <td>
                            <span
                              className={`badge ${r.status === 'Active' ? 'ok' : 'warn'}`}
                              style={{ fontSize: '0.72rem' }}
                            >
                              {r.status === 'Pending' ? 'Pending Approval' : r.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={3}><strong>Active Rental Income ({rentalFilterType})</strong></td>
                        <td colSpan={3}>
                          <strong>
                            {peso(
                              filteredRentals
                                .filter((r) => r.status === 'Active')
                                .reduce((s, r) => s + r.monthly, 0)
                            )}
                          </strong>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <TablePagination page={rentalsPage} totalItems={filteredRentals.length} onPageChange={setRentalsPage} />
                {filteredRentals.length === 0 && <div className="empty" style={{ marginBottom: '2.5rem' }}>No rental contracts found for this selection.</div>}
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
              <button className="modal-close" onClick={() => setIsPrintModalOpen(false)}><X size={18} /></button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
              <div className="field">
                <label>Report Type</label>
                <select
                  value={printReportType}
                  onChange={(e) => {
                    setPrintReportType(e.target.value as ReportType)
                    setPrintRenterId('all')
                  }}
                >
                  <option value="display">Display Sales Report</option>
                  <option value="pickup">Pick-up Sales Report</option>
                  <option value="rental">Monthly Rental Payment Report</option>
                </select>
              </div>

              {printReportType !== 'rental' && (
                <>
                  <div className="field">
                    <label>Date Filter Period</label>
                    <select
                      value={printDateMode}
                      onChange={(e) => setPrintDateMode(e.target.value as DateFilterMode)}
                    >
                      <option value="monthly">Monthly (e.g. 2026-10)</option>
                      <option value="daily">Daily (Specific single date)</option>
                      <option value="yearly">Yearly (Full calendar year)</option>
                      <option value="custom">Custom Date Range (Start to End date)</option>
                    </select>
                  </div>

                  {printDateMode === 'monthly' && (
                    <div className="field">
                      <label>Select Month</label>
                      <input
                        type="month"
                        value={printMonth}
                        onChange={(e) => setPrintMonth(e.target.value)}
                      />
                    </div>
                  )}

                  {printDateMode === 'daily' && (
                    <div className="field">
                      <label>Select Date</label>
                      <input
                        type="date"
                        value={printDaily}
                        onChange={(e) => setPrintDaily(e.target.value)}
                      />
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
                        <input
                          type="date"
                          value={printStartDate}
                          onChange={(e) => setPrintStartDate(e.target.value)}
                        />
                      </div>
                      <div className="field">
                        <label>End Date</label>
                        <input
                          type="date"
                          value={printEndDate}
                          onChange={(e) => setPrintEndDate(e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                </>
              )}

              <div className="field">
                <label>Renter Filter</label>
                <select
                  value={printRenterId}
                  onChange={(e) => setPrintRenterId(e.target.value)}
                >
                  <option value="all">All Renters ({filteredRentersForReport.length})</option>
                  {filteredRentersForReport.map((r) => (
                    <option key={r.user_id} value={r.user_id}>
                      {r.full_name} (#{r.user_id})
                    </option>
                  ))}
                </select>
              </div>

              <div className="alert info" style={{ fontSize: '0.85rem' }}>
                Preview summary: <strong>{printFilteredData.list.length} records</strong> found.
                Total: <strong>{peso(printFilteredData.total)}</strong>
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
                <button
                  className="btn"
                  type="button"
                  onClick={handleDownloadPdf}
                  title="Download standalone PDF document"
                >
                  <Download size={16} /> Preview PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {pdfPreviewUrl && (
        <div className="modal-overlay no-print" onClick={() => setPdfPreviewUrl(null)}>
          <div className="modal-card" style={{ maxWidth: 980, width: '96vw', height: '90vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div><h3 style={{ margin: 0 }}>PDF Preview</h3><p className="muted" style={{ margin: '0.2rem 0 0', fontSize: '.85rem' }}>Review the report before downloading it.</p></div>
              <button className="modal-close" onClick={() => setPdfPreviewUrl(null)}><X size={18} /></button>
            </div>
            <iframe title="Report PDF preview" src={pdfPreviewUrl} style={{ flex: 1, width: '100%', border: '1px solid #e2e8f0', borderRadius: 8, marginTop: 12 }} />
            <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="btn-ghost" type="button" onClick={() => setPdfPreviewUrl(null)}>Back</button>
              <a className="btn" href={pdfPreviewUrl} download={`TrackErentory_${printReportType}_${new Date().toISOString().slice(0, 10)}.pdf`}><Download size={16} /> Download PDF</a>
            </div>
          </div>
        </div>
      )}

      {/* ════════════ DEDICATED PRINT DOCUMENT ════════════ */}
      <div id="owner-print-report" className="print-report-container">
        <div className="print-report-header">
          <h2 style={{ margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Arce Concept Boutique</h2>
          <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: 2 }}>TrackErentory • Cube Rental & Retail Management</div>
          <h3 style={{ margin: '0.75rem 0 0' }}>
            {printReportType === 'display' && 'Display Sales Report'}
            {printReportType === 'pickup' && 'Pick-up Sales Report'}
            {printReportType === 'rental' && 'Monthly Rental Payment Report'}
          </h3>
          <div className="print-report-meta">
            <span><strong>Period:</strong> {printPeriodLabel}</span>
            <span><strong>Renter:</strong> {selectedRenterName}</span>
            <span><strong>Date Generated:</strong> {new Date().toLocaleDateString('en-PH')}</span>
          </div>
        </div>

        {printReportType === 'rental' ? (
          <table className="print-table">
            <thead>
              <tr>
                <th>Renter</th>
                <th>Cube No.</th>
                <th>Type</th>
                <th>Contract Period</th>
                <th style={{ textAlign: 'right' }}>Monthly Rent</th>
              </tr>
            </thead>
            <tbody>
              {printFilteredData.list.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '1.5rem', color: '#6b7280' }}>
                    No rental contracts found for this selection.
                  </td>
                </tr>
              ) : (
                (printFilteredData.list as typeof rentalSales).map((r, i) => (
                  <tr key={i}>
                    <td>{r.renter}</td>
                    <td>{r.cube}</td>
                    <td>{r.type}</td>
                    <td>{r.period}</td>
                    <td style={{ textAlign: 'right' }}>{peso(r.monthly)}</td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4}><strong>Total Rental Income</strong></td>
                <td style={{ textAlign: 'right' }}><strong>{peso(printFilteredData.total)}</strong></td>
              </tr>
            </tfoot>
          </table>
        ) : (
          <table className="print-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Cube</th>
                <th>Renter</th>
                <th>Date</th>
                <th>Payment</th>
                <th>Process</th>
                <th>Qty</th>
                <th style={{ textAlign: 'right' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {printFilteredData.list.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '1.5rem', color: '#6b7280' }}>
                    No sales transactions found for this period.
                  </td>
                </tr>
              ) : (
                (printFilteredData.list as Transaction[]).map((t) => {
                  const r = getTxRenter(t)
                  return (
                    <tr key={t.transaction_id}>
                      <td>
                        <strong>{t.products?.product_name || t.product_name || '—'}</strong>
                        {t.products?.variant && <div style={{ fontSize: '0.75rem', color: '#555' }}>Variant: {t.products.variant}</div>}
                      </td>
                      <td>{t.products?.cubes?.cube_number || t.cubes?.cube_number || '—'}</td>
                      <td>{r.name}</td>
                      <td>{new Date(t.transaction_date).toLocaleDateString('en-PH')}</td>
                      <td>{t.payment_status}</td>
                      <td>{t.payment_method || 'Cash'}</td>
                      <td>{t.quantity || 1}</td>
                      <td style={{ textAlign: 'right' }}>{peso(Number(t.products?.price || 0) * Number(t.quantity || 1))}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={7}><strong>Overall Total ({printPeriodLabel})</strong></td>
                <td style={{ textAlign: 'right' }}><strong>{peso(printFilteredData.total)}</strong></td>
              </tr>
            </tfoot>
          </table>
        )}

        <div className="print-report-signatures">
          <div>
            <div className="sig-line"></div>
            <div>Prepared By (Owner)</div>
          </div>
          <div>
            <div className="sig-line"></div>
            <div>Received / Acknowledged By</div>
          </div>
        </div>
      </div>
    </section>
  )
}
