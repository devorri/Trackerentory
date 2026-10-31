import { useEffect, useState, useMemo } from 'react'
import { Navigate } from 'react-router-dom'
import {
  Search,
  Phone,
  ExternalLink,
  Copy,
  Check,
  AlertCircle,
  Trash2,
  PackageMinus,
  ArrowUpDown,
} from 'lucide-react'
import { useAuth } from '../context/Auth'
import { supabase } from '../lib/supabase'
import { peso, isContractInGracePeriod, type PullOutItem, type Contract, type Product, type Transaction } from '../lib/types'
import { fetchPullOutItems, updatePullOutItemStatus, deletePullOutItem, addPullOutItem } from '../lib/pull-out'
import { SkeletonTable } from '../components/Skeleton'
import ConfirmModal from '../components/ConfirmModal'
import TablePagination, { DEFAULT_PAGE_SIZE } from '../components/TablePagination'

export default function PullOutItemsPage() {
  const { user } = useAuth()
  const role = user?.role

  // Only Owner and Staff have full administrative access.
  // If a Renter visits /pull-out, route them seamlessly to their dedicated Renter Workspace section.
  if (role !== 'Owner' && role !== 'Staff') {
    if (role === 'Renter') {
      return <Navigate to="/renter?section=pull-out-items" replace />
    }
    return <Navigate to="/" replace />
  }

  const [activeTab, setActiveTab] = useState<'Display' | 'Pick-up'>('Display')
  const [statusFilter, setStatusFilter] = useState<string>('All')
  const [items, setItems] = useState<PullOutItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [copiedId, setCopiedId] = useState<string | number | null>(null)
  const [busy, setBusy] = useState(false)
  const [page, setPage] = useState(1)
  const [sortConfig, setSortConfig] = useState<{ col: string; dir: 'asc' | 'desc' }>({ col: 'date', dir: 'desc' })

  // Expired contract scanning
  const [expiredContracts, setExpiredContracts] = useState<Contract[]>([])
  const [allProducts, setAllProducts] = useState<Product[]>([])
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([])
  const [selectedDisplayProductMap, setSelectedDisplayProductMap] = useState<Record<number, string>>({})
  const [selectedPickupTxMap, setSelectedPickupTxMap] = useState<Record<number, string>>({})

  // Contact Renter Modal
  const [contactModalItem, setContactModalItem] = useState<PullOutItem | null>(null)

  // Confirm delete or return
  const [confirmModal, setConfirmModal] = useState<{
    title: string
    message: string
    confirmText?: string
    isDanger?: boolean
    onConfirm: () => void
  } | null>(null)

  async function loadData() {
    setLoading(true)
    const [pullOutRes, contractRes, prodRes, txRes] = await Promise.all([
      fetchPullOutItems(),
      supabase
        .from('contracts')
        .select('*, cubes(cube_number, type), users:users!renter_id(full_name, phone_number, social_link, username)')
        .order('end_date', { ascending: false }),
      supabase.from('products').select('*, cubes(cube_number, type), renter:users!renter_id(full_name, phone_number, social_link, username)'),
      supabase.from('transactions').select('*, cubes(cube_number, type), products(*), users!renter_id(full_name, phone_number, social_link)'),
    ])

    setLoading(false)
    if (pullOutRes.data) {
      setItems(pullOutRes.data)
    }
    if (contractRes.data) {
      const today = new Date().toISOString().slice(0, 10)
      const expired = (contractRes.data as Contract[]).filter(
        (c) =>
          (c.status === 'Expired' || (c.end_date && c.end_date < today && c.status !== 'Pending')) &&
          !isContractInGracePeriod(c)
      )
      setExpiredContracts(expired)
    }
    if (prodRes.data) {
      setAllProducts((prodRes.data || []) as Product[])
    }
    if (txRes.data) {
      setAllTransactions((txRes.data || []) as Transaction[])
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  // Expired contracts with items that should be pulled out
  const expiredDisplayAlerts = useMemo(() => {
    const alerts: Array<{ contract: Contract; products: Product[] }> = []
    for (const c of expiredContracts) {
      if (c.cubes?.type !== 'Display') continue
      const prods = allProducts.filter((p) => p.cube_id === c.cube_id && !p.deleted_at && p.stock_quantity > 0)
      if (prods.length > 0) {
        alerts.push({ contract: c, products: prods })
      }
    }
    return alerts
  }, [expiredContracts, allProducts])

  const expiredPickupAlerts = useMemo(() => {
    const alerts: Array<{ contract: Contract; transactions: Transaction[] }> = []
    for (const c of expiredContracts) {
      if (c.cubes?.type !== 'Pick-up') continue
      const txs = allTransactions.filter(
        (t) =>
          (t.cube_id === c.cube_id || t.products?.cube_id === c.cube_id) &&
          t.pickup_status === 'Waiting' &&
          !t.notes?.startsWith('[PULLED OUT]')
      )
      if (txs.length > 0) {
        alerts.push({ contract: c, transactions: txs })
      }
    }
    return alerts
  }, [expiredContracts, allTransactions])

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

  // Filtered and sorted list
  const filteredItems = useMemo(() => {
    let list = items.filter((item) => item.type === activeTab)

    if (statusFilter !== 'All') {
      list = list.filter((item) => item.status === statusFilter)
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      list = list.filter((item) => {
        const pName = (item.product_name || '').toLowerCase()
        const bName = (item.buyer_name || '').toLowerCase()
        const rName = (item.renter?.full_name || '').toLowerCase()
        const cNum = (item.cubes?.cube_number || '').toLowerCase()
        const reason = (item.reason || '').toLowerCase()
        const notes = (item.notes || '').toLowerCase()
        return pName.includes(q) || bName.includes(q) || rName.includes(q) || cNum.includes(q) || reason.includes(q) || notes.includes(q)
      })
    }

    const { col, dir } = sortConfig
    list.sort((a, b) => {
      let vA: any = ''
      let vB: any = ''
      if (col === 'buyer') { vA = (a.buyer_name || '').toLowerCase(); vB = (b.buyer_name || '').toLowerCase() }
      else if (col === 'product') { vA = (a.product_name || '').toLowerCase(); vB = (b.product_name || '').toLowerCase() }
      else if (col === 'price') { vA = Number(a.price || 0); vB = Number(b.price || 0) }
      else if (col === 'quantity') { vA = Number(a.quantity || 0); vB = Number(b.quantity || 0) }
      else if (col === 'renter') { vA = (a.renter?.full_name || '').toLowerCase(); vB = (b.renter?.full_name || '').toLowerCase() }
      else if (col === 'cube') { vA = (a.cubes?.cube_number || '').toLowerCase(); vB = (b.cubes?.cube_number || '').toLowerCase() }
      else if (col === 'status') { vA = (a.status || '').toLowerCase(); vB = (b.status || '').toLowerCase() }
      else if (col === 'date') { vA = new Date(a.pulled_out_at || a.created_at || 0).getTime(); vB = new Date(b.pulled_out_at || b.created_at || 0).getTime() }

      if (vA < vB) return dir === 'asc' ? -1 : 1
      if (vA > vB) return dir === 'asc' ? 1 : -1
      return 0
    })

    return list
  }, [items, activeTab, statusFilter, searchQuery, sortConfig])

  // Reset page when tab/status/search changes
  useEffect(() => {
    setPage(1)
  }, [activeTab, statusFilter, searchQuery])

  const paginatedItems = useMemo(() => {
    return filteredItems.slice((page - 1) * DEFAULT_PAGE_SIZE, page * DEFAULT_PAGE_SIZE)
  }, [filteredItems, page])

  const displayCount = useMemo(() => items.filter((i) => i.type === 'Display').length, [items])
  const pickupCount = useMemo(() => items.filter((i) => i.type === 'Pick-up').length, [items])

  async function handleMarkReturned(item: PullOutItem) {
    setBusy(true)
    const newStatus = item.status === 'Returned to Renter' ? 'Pull Out' : 'Returned to Renter'
    await updatePullOutItemStatus(item.pull_out_id, newStatus)
    setBusy(false)
    void loadData()
  }

  async function handleDelete(item: PullOutItem) {
    setConfirmModal({
      title: 'Delete Pull Out Record',
      message: `Are you sure you want to remove the pull out record for "${item.product_name}"?`,
      confirmText: 'Delete Record',
      isDanger: true,
      onConfirm: async () => {
        setBusy(true)
        await deletePullOutItem(item.pull_out_id)
        setBusy(false)
        setConfirmModal(null)
        void loadData()
      },
    })
  }

  async function handlePullOutExpiredDisplayProduct(p: Product, c: Contract) {
    setBusy(true)
    await addPullOutItem({
      type: 'Display',
      product_id: p.product_id,
      cube_id: p.cube_id,
      renter_id: p.renter_id || c.renter_id,
      product_name: p.product_name,
      price: p.price,
      quantity: p.stock_quantity,
      reason: 'Contract Expired - Display Pull Out',
      status: 'Pull Out',
      pulled_out_by: user?.user_id,
      cubes: p.cubes ? { cube_number: p.cubes.cube_number, type: p.cubes.type } : null,
      renter: p.renter ? { full_name: p.renter.full_name, phone_number: (p.renter as any).phone_number, social_link: (p.renter as any).social_link } : null,
    })
    // Deduct / clear stock
    await supabase.from('products').update({ stock_quantity: 0 }).eq('product_id', p.product_id)
    setBusy(false)
    void loadData()
  }

  async function handlePullOutExpiredPickupTx(t: Transaction, c: Contract) {
    setBusy(true)
    await addPullOutItem({
      type: 'Pick-up',
      product_id: t.product_id,
      cube_id: t.cube_id || c.cube_id,
      renter_id: t.renter_id || c.renter_id,
      transaction_id: t.transaction_id,
      buyer_name: t.buyer_name,
      product_name: t.products?.product_name || t.product_name || 'Pickup Item',
      price: t.products?.price || 0,
      quantity: t.quantity || 1,
      reason: 'Contract Expired - Unclaimed by Buyer',
      status: 'Pull Out',
      pulled_out_by: user?.user_id,
      cubes: t.cubes ? { cube_number: t.cubes.cube_number, type: t.cubes.type } : null,
      renter: t.renter_id ? { full_name: (t.users as any)?.full_name || 'Renter' } : null,
    })
    await supabase.from('transactions').update({ notes: `[PULLED OUT] Contract Expired` }).eq('transaction_id', t.transaction_id)
    setBusy(false)
    void loadData()
  }

  async function handlePullOutAllExpiredDisplayProducts(products: Product[], c: Contract) {
    setBusy(true)
    for (const p of products) {
      await addPullOutItem({
        type: 'Display',
        product_id: p.product_id,
        cube_id: p.cube_id,
        renter_id: p.renter_id || c.renter_id,
        product_name: p.product_name,
        price: p.price,
        quantity: p.stock_quantity,
        reason: 'Contract Expired - Display Pull Out',
        status: 'Pull Out',
        pulled_out_by: user?.user_id,
        cubes: p.cubes ? { cube_number: p.cubes.cube_number, type: p.cubes.type } : null,
        renter: p.renter ? { full_name: p.renter.full_name, phone_number: (p.renter as any).phone_number, social_link: (p.renter as any).social_link } : null,
      })
      await supabase.from('products').update({ stock_quantity: 0 }).eq('product_id', p.product_id)
    }
    setBusy(false)
    void loadData()
  }

  async function handlePullOutAllExpiredPickupTxs(transactions: Transaction[], c: Contract) {
    setBusy(true)
    for (const t of transactions) {
      await addPullOutItem({
        type: 'Pick-up',
        product_id: t.product_id,
        cube_id: t.cube_id || c.cube_id,
        renter_id: t.renter_id || c.renter_id,
        transaction_id: t.transaction_id,
        buyer_name: t.buyer_name,
        product_name: t.products?.product_name || t.product_name || 'Pickup Item',
        price: t.products?.price || 0,
        quantity: t.quantity || 1,
        reason: 'Contract Expired - Unclaimed by Buyer',
        status: 'Pull Out',
        pulled_out_by: user?.user_id,
        cubes: t.cubes ? { cube_number: t.cubes.cube_number, type: t.cubes.type } : null,
        renter: t.renter_id ? { full_name: (t.users as any)?.full_name || 'Renter' } : null,
      })
      await supabase.from('transactions').update({ notes: `[PULLED OUT] Contract Expired` }).eq('transaction_id', t.transaction_id)
    }
    setBusy(false)
    void loadData()
  }

  function copyMessageText(item: PullOutItem) {
    const rName = item.renter?.full_name || 'Renter'
    const cNum = item.cubes?.cube_number || 'assigned cube'
    const text = `Hi ${rName}, this is TrackErentory. Please be informed that your item "${item.product_name}" (Qty: ${item.quantity}, Cube: ${cNum}) is ready for pull out at the store due to: ${item.reason}. Kindly visit the store or contact us to collect your items. Thank you!`
    void navigator.clipboard.writeText(text)
    setCopiedId(item.pull_out_id)
    setTimeout(() => setCopiedId(null), 2500)
  }

  return (
    <section>
      {/* PAGE HEADER */}
      <div className="page-header" style={{ marginBottom: '1.25rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <PackageMinus size={28} style={{ color: '#0f172a' }} />
            <h1 style={{ margin: 0 }}>Pull Out Items</h1>
          </div>
          <p className="lede" style={{ margin: '0.35rem 0 0' }}>
            Manage items awaiting pull out from expired contracts and unclaimed buyer pickups. Pulled out items do not reflect in sales and reports.
          </p>
        </div>
      </div>

      {/* TABS */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', borderBottom: '2px solid #efefef', paddingBottom: '0.5rem' }}>
        <button
          type="button"
          className={activeTab === 'Display' ? 'btn' : 'btn-ghost'}
          onClick={() => setActiveTab('Display')}
        >
          Display Pull Outs ({displayCount})
        </button>
        <button
          type="button"
          className={activeTab === 'Pick-up' ? 'btn' : 'btn-ghost'}
          onClick={() => setActiveTab('Pick-up')}
        >
          Pick-up Pull Outs ({pickupCount})
        </button>
      </div>

      {/* EXPIRED CONTRACT ALERT BANNERS */}
      {activeTab === 'Display' && expiredDisplayAlerts.length > 0 && (
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: 14,
            padding: '1.1rem 1.25rem',
            marginBottom: '1.25rem',
            display: 'block',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: '0.65rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: '#0f172a', fontSize: '0.92rem' }}>
              <AlertCircle size={17} style={{ color: '#475569' }} />
              <span>Expired Display Contracts with Remaining Products ({expiredDisplayAlerts.length})</span>
            </div>
            <span className="muted" style={{ fontSize: '0.82rem' }}>Pull out these items to clear cube space</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {expiredDisplayAlerts.map(({ contract, products }) => (
              <div
                key={contract.contract_id}
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  padding: '0.65rem 0.9rem',
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  alignItems: 'center',
                  gap: '1rem',
                }}
              >
                <div style={{ fontSize: '0.88rem', minWidth: 0 }}>
                  <strong>Cube {contract.cubes?.cube_number || contract.cube_id}</strong> ·{' '}
                  <span className="muted">Renter: {contract.users?.full_name || 'Renter'}</span> ·{' '}
                  <span style={{ color: '#475569', fontWeight: 600 }}>
                    {products.length} product(s) ({products.reduce((acc, p) => acc + p.stock_quantity, 0)} pcs remaining)
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'nowrap', flexShrink: 0 }}>
                  <select
                    value={selectedDisplayProductMap[contract.contract_id] ?? (products.length === 1 ? String(products[0].product_id) : '')}
                    onChange={(e) =>
                      setSelectedDisplayProductMap((prev) => ({
                        ...prev,
                        [contract.contract_id]: e.target.value,
                      }))
                    }
                    style={{
                      width: 250,
                      height: 34,
                      padding: '0 0.65rem',
                      borderRadius: 8,
                      border: '1px solid #cbd5e1',
                      fontSize: '0.82rem',
                      background: '#ffffff',
                      color: '#0f172a',
                      cursor: 'pointer',
                      boxSizing: 'border-box',
                    }}
                  >
                    <option value="">Select product to pull out...</option>
                    {products.length > 1 && (
                      <option value="all">
                        Pull Out All ({products.reduce((acc, p) => acc + p.stock_quantity, 0)} pcs)
                      </option>
                    )}
                    {products.map((p) => (
                      <option key={p.product_id} value={String(p.product_id)}>
                        {p.product_name} ({p.stock_quantity} pcs)
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn"
                    type="button"
                    style={{
                      width: 90,
                      height: 34,
                      padding: 0,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.82rem',
                      background: '#000000',
                      color: '#fff',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                      borderRadius: 8,
                      boxSizing: 'border-box',
                    }}
                    disabled={
                      busy ||
                      !(selectedDisplayProductMap[contract.contract_id] ?? (products.length === 1 ? String(products[0].product_id) : ''))
                    }
                    onClick={() => {
                      const sel = selectedDisplayProductMap[contract.contract_id] ?? (products.length === 1 ? String(products[0].product_id) : '')
                      if (sel === 'all') {
                        void handlePullOutAllExpiredDisplayProducts(products, contract)
                      } else {
                        const targetProd = products.find((p) => String(p.product_id) === sel)
                        if (targetProd) void handlePullOutExpiredDisplayProduct(targetProd, contract)
                      }
                    }}
                  >
                    Pull Out
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'Pick-up' && expiredPickupAlerts.length > 0 && (
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: 14,
            padding: '1.1rem 1.25rem',
            marginBottom: '1.25rem',
            display: 'block',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: '0.65rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: '#0f172a', fontSize: '0.92rem' }}>
              <AlertCircle size={17} style={{ color: '#475569' }} />
              <span>Expired Pick-up Contracts with Unclaimed Items ({expiredPickupAlerts.length})</span>
            </div>
            <span className="muted" style={{ fontSize: '0.82rem' }}>Move unclaimed buyer orders to pull out</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {expiredPickupAlerts.map(({ contract, transactions }) => (
              <div
                key={contract.contract_id}
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  padding: '0.65rem 0.9rem',
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  alignItems: 'center',
                  gap: '1rem',
                }}
              >
                <div style={{ fontSize: '0.88rem', minWidth: 0 }}>
                  <strong>Cube {contract.cubes?.cube_number || contract.cube_id}</strong> ·{' '}
                  <span className="muted">Renter: {contract.users?.full_name || 'Renter'}</span> ·{' '}
                  <span style={{ color: '#475569', fontWeight: 600 }}>{transactions.length} unclaimed item(s)</span>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'nowrap', flexShrink: 0 }}>
                  <select
                    value={selectedPickupTxMap[contract.contract_id] ?? (transactions.length === 1 ? String(transactions[0].transaction_id) : '')}
                    onChange={(e) =>
                      setSelectedPickupTxMap((prev) => ({
                        ...prev,
                        [contract.contract_id]: e.target.value,
                      }))
                    }
                    style={{
                      width: 250,
                      height: 34,
                      padding: '0 0.65rem',
                      borderRadius: 8,
                      border: '1px solid #cbd5e1',
                      fontSize: '0.82rem',
                      background: '#ffffff',
                      color: '#0f172a',
                      cursor: 'pointer',
                      boxSizing: 'border-box',
                    }}
                  >
                    <option value="">Select item to pull out...</option>
                    {transactions.length > 1 && (
                      <option value="all">
                        Pull Out All ({transactions.length} items)
                      </option>
                    )}
                    {transactions.map((t) => (
                      <option key={t.transaction_id} value={String(t.transaction_id)}>
                        {t.product_name || 'Item'} (Buyer: {t.buyer_name || '—'})
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn"
                    type="button"
                    style={{
                      width: 90,
                      height: 34,
                      padding: 0,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.82rem',
                      background: '#000000',
                      color: '#fff',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                      borderRadius: 8,
                      boxSizing: 'border-box',
                    }}
                    disabled={
                      busy ||
                      !(selectedPickupTxMap[contract.contract_id] ?? (transactions.length === 1 ? String(transactions[0].transaction_id) : ''))
                    }
                    onClick={() => {
                      const sel = selectedPickupTxMap[contract.contract_id] ?? (transactions.length === 1 ? String(transactions[0].transaction_id) : '')
                      if (sel === 'all') {
                        void handlePullOutAllExpiredPickupTxs(transactions, contract)
                      } else {
                        const targetTx = transactions.find((t) => String(t.transaction_id) === sel)
                        if (targetTx) void handlePullOutExpiredPickupTx(targetTx, contract)
                      }
                    }}
                  >
                    Pull Out
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CONTROLS TOOLBAR */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          marginBottom: '1.25rem',
        }}
      >
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span className="muted" style={{ fontSize: '0.85rem', fontWeight: 600 }}>Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                padding: '0.45rem 0.85rem',
                borderRadius: 8,
                border: '1px solid #cbd5e1',
                fontSize: '0.88rem',
                background: '#fff',
                cursor: 'pointer',
              }}
            >
              <option value="All">All Statuses ({items.filter((i) => i.type === activeTab).length})</option>
              <option value="Pull Out">Pull Out</option>
              <option value="Returned to Renter">Returned to Renter</option>
            </select>
          </div>
          <span className="muted" style={{ fontSize: '0.85rem' }}>
            Showing <strong>{filteredItems.length}</strong> items
          </span>
        </div>

        {/* SEARCH BAR */}
        <div style={{ position: 'relative', width: '100%', maxWidth: '380px' }}>
          <Search
            size={16}
            style={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#94a3b8',
            }}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search product, renter, buyer, cube..."
            style={{
              paddingLeft: 36,
              paddingRight: searchQuery ? 32 : 12,
              borderRadius: 8,
              border: '1px solid #cbd5e1',
              width: '100%',
              fontSize: '0.88rem',
            }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute',
                right: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#94a3b8',
                fontSize: '0.85rem',
              }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* TABLE */}
      {loading ? (
        <SkeletonTable rows={5} cols={activeTab === 'Pick-up' ? 9 : 8} />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                {activeTab === 'Pick-up' && (
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('buyer')}>
                    Buyer Name {renderSortIndicator('buyer')}
                  </th>
                )}
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('product')}>
                  Product {renderSortIndicator('product')}
                </th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('price')}>
                  Price {renderSortIndicator('price')}
                </th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('quantity')}>
                  Qty {renderSortIndicator('quantity')}
                </th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('renter')}>
                  Renter Name {renderSortIndicator('renter')}
                </th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('cube')}>
                  Cube Number {renderSortIndicator('cube')}
                </th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('date')}>
                  Date Pulled Out {renderSortIndicator('date')}
                </th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('status')}>
                  Status {renderSortIndicator('status')}
                </th>
                <th className="no-print" style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedItems.map((item) => {
                const isReturned = item.status === 'Returned to Renter'
                const rName = item.renter?.full_name || '—'
                const cNum = item.cubes?.cube_number || (item.cube_id ? `Cube #${item.cube_id}` : '—')
                const dateStr = item.pulled_out_at
                  ? new Date(item.pulled_out_at).toLocaleDateString('en-PH', { dateStyle: 'medium' })
                  : '—'

                return (
                  <tr key={item.pull_out_id} style={{ opacity: isReturned ? 0.65 : 1 }}>
                    {activeTab === 'Pick-up' && (
                      <td>
                        <strong>{item.buyer_name || <span className="muted">—</span>}</strong>
                      </td>
                    )}

                    <td>
                      <strong>{item.product_name}</strong>
                      {item.reason && (
                        <div className="muted" style={{ fontSize: '0.75rem', marginTop: 2 }}>
                          Reason: {item.reason}
                        </div>
                      )}
                      {item.notes && (
                        <div className="muted" style={{ fontSize: '0.74rem', fontStyle: 'italic' }}>
                          Note: {item.notes}
                        </div>
                      )}
                    </td>

                    <td>{peso(item.price)}</td>

                    <td>
                      <span style={{ fontWeight: 700 }}>{item.quantity}</span>
                    </td>

                    <td>
                      <div>
                        <strong>{rName}</strong>
                        {item.renter?.username && (
                          <div className="muted" style={{ fontSize: '0.74rem' }}>
                            @{item.renter.username}
                          </div>
                        )}
                        {(item.renter?.phone_number || item.renter?.social_link) && (
                          <button
                            type="button"
                            className="btn-ghost"
                            style={{
                              padding: '0.1rem 0.4rem',
                              fontSize: '0.72rem',
                              marginTop: 3,
                              color: '#475569',
                              border: '1px solid #e2e8f0',
                              height: 'auto',
                              gap: 3,
                            }}
                            onClick={() => setContactModalItem(item)}
                          >
                            <Phone size={11} /> Contact Info
                          </button>
                        )}
                      </div>
                    </td>

                    <td>
                      <span className="badge" style={{ background: '#f1f5f9', color: '#0f172a', border: '1px solid #e2e8f0', fontSize: '0.75rem' }}>{cNum}</span>
                    </td>

                    <td>
                      <span className="muted" style={{ fontSize: '0.85rem' }}>{dateStr}</span>
                    </td>

                    <td>
                      <span
                        className="badge"
                        style={{
                          background: isReturned ? '#f1f5f9' : '#f8fafc',
                          color: isReturned ? '#64748b' : '#0f172a',
                          border: '1px solid #e2e8f0',
                          fontWeight: 700,
                          fontSize: '0.74rem',
                          padding: '0.2rem 0.55rem',
                        }}
                      >
                        {item.status || 'Pull Out'}
                      </span>
                    </td>

                    <td className="no-print" style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                        <button
                          type="button"
                          className="btn-ghost"
                          style={{
                            padding: '0.25rem 0.55rem',
                            fontSize: '0.74rem',
                            color: '#0f172a',
                            border: '1px solid #cbd5e1',
                            background: '#ffffff',
                          }}
                          disabled={busy}
                          onClick={() => void handleMarkReturned(item)}
                          title={isReturned ? 'Mark back as Pull Out' : 'Mark item as collected by Renter'}
                        >
                          {isReturned ? 'Re-open' : 'Mark Returned'}
                        </button>
                        <button
                          type="button"
                          className="btn-ghost"
                          style={{
                            padding: '0.25rem 0.55rem',
                            fontSize: '0.74rem',
                            color: '#0f172a',
                            border: '1px solid #cbd5e1',
                            background: '#ffffff',
                          }}
                          onClick={() => copyMessageText(item)}
                          title="Copy ready-to-send message for renter"
                        >
                          {copiedId === item.pull_out_id ? <Check size={12} /> : <Copy size={12} />}
                          {copiedId === item.pull_out_id ? 'Copied' : 'Message'}
                        </button>
                        <button
                          type="button"
                          className="btn-ghost"
                          style={{ padding: '0.25rem 0.45rem', fontSize: '0.74rem', color: '#64748b', border: '1px solid #e2e8f0', background: '#ffffff' }}
                          disabled={busy}
                          onClick={() => void handleDelete(item)}
                          title="Delete record"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {filteredItems.length === 0 && (
            <div className="empty" style={{ padding: '2.5rem' }}>
              <p style={{ margin: 0, fontWeight: 600, color: '#64748b' }}>
                {searchQuery
                  ? `No pull out items match "${searchQuery}".`
                  : `No ${activeTab.toLowerCase()} items currently in pull out.`}
              </p>
              <p style={{ margin: '0.4rem 0 0', fontSize: '0.85rem', color: '#94a3b8' }}>
                {activeTab === 'Display'
                  ? 'Display products can be pulled out from Products Management or when display contracts expire.'
                  : 'Unclaimed buyer items can be pulled out from Pickup Tracking or when pickup contracts expire.'}
              </p>
            </div>
          )}

          {filteredItems.length > 0 && (
            <TablePagination
              page={page}
              totalItems={filteredItems.length}
              pageSize={DEFAULT_PAGE_SIZE}
              onPageChange={setPage}
            />
          )}
        </div>
      )}

      {/* CONTACT RENTER MODAL */}
      {contactModalItem && (
        <div className="modal-overlay" onClick={() => setContactModalItem(null)}>
          <div className="modal-card" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Contact Renter for Pull Out</h3>
              <button className="modal-close" onClick={() => setContactModalItem(null)}>✕</button>
            </div>
            <div style={{ padding: '1rem 0' }}>
              <div style={{ marginBottom: '1rem' }}>
                <span className="muted" style={{ fontSize: '0.8rem' }}>Renter Name</span>
                <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>
                  {contactModalItem.renter?.full_name || 'Renter'}
                </div>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <span className="muted" style={{ fontSize: '0.8rem' }}>Contact Number</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                  <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                    {contactModalItem.renter?.phone_number || 'No contact number on file'}
                  </span>
                  {contactModalItem.renter?.phone_number && (
                    <a
                      href={`tel:${contactModalItem.renter.phone_number}`}
                      className="btn"
                      style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', textDecoration: 'none' }}
                    >
                      Call / SMS
                    </a>
                  )}
                </div>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <span className="muted" style={{ fontSize: '0.8rem' }}>Social Media Link</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                  {contactModalItem.renter?.social_link ? (
                    <a
                      href={contactModalItem.renter.social_link.startsWith('http') ? contactModalItem.renter.social_link : `https://${contactModalItem.renter.social_link}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: '#2563eb', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    >
                      {contactModalItem.renter.social_link} <ExternalLink size={14} />
                    </a>
                  ) : (
                    <span className="muted">No social media link provided</span>
                  )}
                </div>
              </div>

              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155' }}>Ready-to-Send Template:</span>
                  <button
                    type="button"
                    className="btn-ghost"
                    style={{ padding: '0.15rem 0.45rem', fontSize: '0.75rem', color: '#2563eb' }}
                    onClick={() => copyMessageText(contactModalItem)}
                  >
                    {copiedId === contactModalItem.pull_out_id ? <Check size={12} /> : <Copy size={12} />}
                    {copiedId === contactModalItem.pull_out_id ? 'Copied!' : 'Copy Template'}
                  </button>
                </div>
                <p style={{ margin: 0, fontSize: '0.82rem', color: '#475569', lineHeight: 1.45 }}>
                  "Hi {contactModalItem.renter?.full_name || 'Renter'}, this is TrackErentory. Please be informed that your item "{contactModalItem.product_name}" (Qty: {contactModalItem.quantity}, Cube: {contactModalItem.cubes?.cube_number || 'assigned cube'}) is ready for pull out at the store due to: {contactModalItem.reason}. Kindly visit the store or contact us to collect your items. Thank you!"
                </p>
              </div>
            </div>
            <div className="modal-footer" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={() => setContactModalItem(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM MODAL */}
      {confirmModal && (
        <ConfirmModal
          isOpen={true}
          title={confirmModal.title}
          message={confirmModal.message}
          confirmText={confirmModal.confirmText || 'Confirm'}
          isDanger={confirmModal.isDanger}
          onConfirm={confirmModal.onConfirm}
          onCancel={() => setConfirmModal(null)}
        />
      )}
    </section>
  )
}
