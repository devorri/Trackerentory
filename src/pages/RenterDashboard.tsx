import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Store,
  Package,
  KeyRound,
  X,
  ArrowUpDown,
  Plus,
  Search,
  BarChart3,
  ExternalLink,
  FileText,
  ChevronDown,
  ChevronUp,
  Camera,
} from 'lucide-react'
import ProductGalleryModal from '../components/ProductGalleryModal'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/Auth'
import {
  addMonths,
  daysUntil,
  peso,
  type Contract,
  type Cube,
  type Product,
  type Transaction,
  DEFAULT_PRODUCT_CATEGORIES,
} from '../lib/types'
import { expireContracts } from '../lib/maintenance'
import { uploadPublicImage } from '../lib/storage'
import { BUCKET_DOCUMENTS, BUCKET_PRODUCT_IMAGES } from '../lib/supabase'
import TablePagination, { DEFAULT_PAGE_SIZE } from '../components/TablePagination'
import { SkeletonStat } from '../components/Skeleton'

type ViewTab = 'overview' | 'display' | 'pickup' | 'cubes_contracts'

export default function RenterDashboard() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  const [cubes, setCubes] = useState<Cube[]>([])
  const [contracts, setContracts] = useState<Contract[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [showOverviewStats, setShowOverviewStats] = useState(true)

  // Tab State (synced with URL ?tab=)
  const paramTab = searchParams.get('tab') as ViewTab | null
  const [activeTab, setActiveTab] = useState<ViewTab>(() => {
    if (paramTab === 'display' || paramTab === 'pickup' || paramTab === 'cubes_contracts') {
      return paramTab
    }
    return 'overview'
  })

  useEffect(() => {
    if (paramTab && (paramTab === 'overview' || paramTab === 'display' || paramTab === 'pickup' || paramTab === 'cubes_contracts')) {
      setActiveTab(paramTab)
    }
  }, [paramTab])

  function handleTabChange(tab: ViewTab) {
    setActiveTab(tab)
    setSearchParams(tab === 'overview' ? {} : { tab })
  }

  // Modals state
  const [isAddProductModalOpen, setIsAddProductModalOpen] = useState(false)
  const [previewReceipt, setPreviewReceipt] = useState<string | null>(null)
  const [isNewHandoverModalOpen, setIsNewHandoverModalOpen] = useState(false)
  const [editingTx, setEditingTx] = useState<Transaction | null>(null)

  // Sub-view filters & pagination
  const [displaySubView, setDisplaySubView] = useState<'products' | 'sales'>('products')
  const [displaySearch, setDisplaySearch] = useState('')
  const [displayStockFilter, setDisplayStockFilter] = useState<'all' | 'in_stock' | 'sold_out'>('all')
  const [displayCategoryFilter, setDisplayCategoryFilter] = useState('All')
  const [displaySalesFilter, setDisplaySalesFilter] = useState<'all' | 'Paid' | 'Pending'>('all')
  const [displayProductsPage, setDisplayProductsPage] = useState(1)
  const [displaySalesPage, setDisplaySalesPage] = useState(1)

  const [pickupSearch, setPickupSearch] = useState('')
  const [pickupStatusFilter, setPickupStatusFilter] = useState<'all' | 'Waiting' | 'Picked-up'>('all')
  const [pickupPage, setPickupPage] = useState(1)

  // Product Form State
  const [productForm, setProductForm] = useState({
    product_name: '',
    description: '',
    price: '',
    stock_quantity: '1',
    variant: '',
    category: '',
    image_url: '',
    cube_id: '',
    buyer_name: '',
    authorized_pickup_name: '',
    payment_status: 'Pending' as 'Pending' | 'Paid',
    payment_method: 'Cash' as 'Cash' | 'Online',
    pickup_notes: '',
  })
  const [imageFiles, setImageFiles] = useState<File[]>([])
  const [imagePreviews, setImagePreviews] = useState<string[]>([])
  const [galleryProduct, setGalleryProduct] = useState<Product | null>(null)
  const [pickupReceiptFile, setPickupReceiptFile] = useState<File | null>(null)
  const [pickupReceiptPreview, setPickupReceiptPreview] = useState<string | null>(null)

  // Edit Handover Form State
  const [editTxForm, setEditTxForm] = useState({
    buyer_name: '',
    authorized_pickup_name: '',
    payment_status: 'Pending' as 'Pending' | 'Paid',
    payment_method: 'Cash' as 'Cash' | 'Online',
    notes: '',
  })
  const [editTxReceiptFile, setEditTxReceiptFile] = useState<File | null>(null)

  // New Handover Form State
  const [newHandoverForm, setNewHandoverForm] = useState({
    product_id: '',
    buyer_name: '',
    authorized_pickup_name: '',
    quantity: '1',
    payment_status: 'Pending' as 'Pending' | 'Paid',
    payment_method: 'Cash' as 'Cash' | 'Online',
    notes: '',
  })
  const [newHandoverReceiptFile, setNewHandoverReceiptFile] = useState<File | null>(null)

  // Sorting
  const [sortDisplayTx, setSortDisplayTx] = useState<{ col: string; dir: 'asc' | 'desc' }>({ col: 'date', dir: 'desc' })
  const [sortPickupTx, setSortPickupTx] = useState<{ col: string; dir: 'asc' | 'desc' }>({ col: 'date', dir: 'desc' })
  const [sortContracts, setSortContracts] = useState<{ col: string; dir: 'asc' | 'desc' }>({ col: 'days', dir: 'asc' })

  // Data Loading
  async function load(silent = false) {
    if (!user) return
    if (!silent) setLoading(true)
    if (!silent) await expireContracts()
    const [cRes, conRes, pRes, tRes] = await Promise.all([
      supabase.from('cubes').select('*').order('cube_number'),
      supabase.from('contracts').select('*, cubes(*)').eq('renter_id', user.user_id).order('end_date'),
      supabase.from('products').select('*, cubes(cube_number, type)').eq('renter_id', user.user_id),
      supabase
        .from('transactions')
        .select('*, products(*, cubes(cube_number, type)), users!processed_by(full_name, role)')
        .order('updated_at', { ascending: false }),
    ])
    if (!silent) setLoading(false)
    if (!cRes.error) setCubes((cRes.data || []) as Cube[])
    if (!conRes.error) setContracts((conRes.data || []) as Contract[])
    if (!pRes.error) setProducts((pRes.data || []) as Product[])
    if (!tRes.error) {
      const myProds = (pRes.data || []) as Product[]
      const myProdIds = new Set(myProds.map((p) => p.product_id))
      const renterTx = ((tRes.data || []) as Transaction[]).filter((t) => t.product_id && myProdIds.has(t.product_id))
      setTransactions(renterTx)
    }
  }

  useEffect(() => {
    void load()
    const refreshTimer = window.setInterval(() => void load(true), 15000)
    return () => window.clearInterval(refreshTimer)
  }, [user])

  const myActiveCubeIds = useMemo(
    () => new Set(contracts.filter((c) => c.status === 'Active' || c.status === 'Pending').map((c) => c.cube_id)),
    [contracts],
  )

  const myCubes = useMemo(
    () => cubes.filter((c) => myActiveCubeIds.has(c.cube_id)),
    [cubes, myActiveCubeIds],
  )

  const displayProducts = useMemo(
    () => products.filter((p) => p.cubes?.type === 'Display'),
    [products],
  )

  const pickupProducts = useMemo(
    () => products.filter((p) => p.cubes?.type === 'Pick-up'),
    [products],
  )

  const categories = useMemo(() => {
    const existing = products.map((p) => p.category?.trim()).filter(Boolean) as string[]
    return Array.from(new Set([...DEFAULT_PRODUCT_CATEGORIES, ...existing])).sort()
  }, [products])

  const existingCategories = useMemo(() => {
    return Array.from(new Set(products.map((p) => p.category?.trim()).filter(Boolean) as string[])).sort()
  }, [products])

  // Key KPI stats
  const displaySalesTotal = useMemo(() => {
    return transactions
      .filter((t) => t.products?.cubes?.type === 'Display' && t.payment_status === 'Paid')
      .reduce((sum, t) => sum + Number(t.products?.price || 0) * Number(t.quantity || 1), 0)
  }, [transactions])

  const pickupSalesTotal = useMemo(() => {
    return transactions
      .filter((t) => t.products?.cubes?.type === 'Pick-up' && t.payment_status === 'Paid')
      .reduce((sum, t) => sum + Number(t.products?.price || 0) * Number(t.quantity || 1), 0)
  }, [transactions])

  const totalEarnings = displaySalesTotal + pickupSalesTotal

  const waitingPickupsCount = useMemo(() => {
    return transactions.filter(
      (t) => t.products?.cubes?.type === 'Pick-up' && (t.pickup_status === 'Waiting' || !t.pickup_status),
    ).length
  }, [transactions])

  const expiring = useMemo(
    () => contracts.filter((c) => c.status === 'Active' && daysUntil(c.end_date) <= 7 && daysUntil(c.end_date) >= 0),
    [contracts],
  )

  // Auto-set cube_id when opening product modal
  useEffect(() => {
    if (isAddProductModalOpen && !productForm.cube_id && myCubes.length > 0) {
      setProductForm((prev) => ({ ...prev, cube_id: String(myCubes[0].cube_id) }))
    }
  }, [isAddProductModalOpen, myCubes, productForm.cube_id])

  // Sort indicators
  function renderSortIndicator(currentCol: string, sortState: { col: string; dir: 'asc' | 'desc' }) {
    if (sortState.col !== currentCol) {
      return <ArrowUpDown size={12} style={{ opacity: 0.35, marginLeft: 4, verticalAlign: 'middle', display: 'inline' }} />
    }
    return <span style={{ marginLeft: 4, fontSize: '0.72rem' }}>{sortState.dir === 'asc' ? '▲' : '▼'}</span>
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

  // Filtered & Sorted Display Transactions
  const displayTransactions = useMemo(() => {
    let list = transactions.filter((t) => t.products?.cubes?.type === 'Display')
    if (displaySalesFilter !== 'all') {
      list = list.filter((t) => t.payment_status === displaySalesFilter)
    }
    if (displaySearch.trim()) {
      const q = displaySearch.toLowerCase()
      list = list.filter((t) =>
        (t.products?.product_name || '').toLowerCase().includes(q) ||
        (t.products?.variant || '').toLowerCase().includes(q)
      )
    }
    const { col, dir } = sortDisplayTx
    list.sort((a, b) => {
      let vA: any = ''
      let vB: any = ''
      if (col === 'product') { vA = a.products?.product_name || ''; vB = b.products?.product_name || '' }
      else if (col === 'variant') { vA = a.products?.variant || ''; vB = b.products?.variant || '' }
      else if (col === 'date') { vA = new Date(a.transaction_date).getTime(); vB = new Date(b.transaction_date).getTime() }
      else if (col === 'price') { vA = Number(a.products?.price || 0); vB = Number(b.products?.price || 0) }
      else if (col === 'payment') { vA = a.payment_status; vB = b.payment_status }
      else if (col === 'qty') { vA = Number(a.quantity || 1); vB = Number(b.quantity || 1) }
      if (vA < vB) return dir === 'asc' ? -1 : 1
      if (vA > vB) return dir === 'asc' ? 1 : -1
      return 0
    })
    return list
  }, [transactions, sortDisplayTx, displaySalesFilter, displaySearch])

  // Filtered Display Products
  const filteredDisplayProducts = useMemo(() => {
    let list = displayProducts
    if (displayStockFilter === 'in_stock') {
      list = list.filter((p) => p.stock_quantity > 0)
    } else if (displayStockFilter === 'sold_out') {
      list = list.filter((p) => p.stock_quantity <= 0)
    }
    if (displayCategoryFilter !== 'All') {
      list = list.filter((p) => (p.category?.trim() || '') === displayCategoryFilter)
    }
    if (displaySearch.trim()) {
      const q = displaySearch.toLowerCase()
      list = list.filter((p) =>
        p.product_name.toLowerCase().includes(q) ||
        (p.variant || '').toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q)
      )
    }
    return list
  }, [displayProducts, displayStockFilter, displayCategoryFilter, displaySearch])

  // Filtered & Sorted Pickup Transactions
  const pickupTransactions = useMemo(() => {
    let list = transactions.filter((t) => t.products?.cubes?.type === 'Pick-up')
    if (pickupStatusFilter !== 'all') {
      list = list.filter((t) => {
        const s = t.pickup_status || 'Waiting'
        return s === pickupStatusFilter
      })
    }
    if (pickupSearch.trim()) {
      const q = pickupSearch.toLowerCase()
      list = list.filter((t) =>
        (t.products?.product_name || t.product_name || '').toLowerCase().includes(q) ||
        (t.buyer_name || '').toLowerCase().includes(q) ||
        (t.authorized_pickup_name || '').toLowerCase().includes(q)
      )
    }
    const { col, dir } = sortPickupTx
    list.sort((a, b) => {
      let vA: any = ''
      let vB: any = ''
      if (col === 'product') { vA = a.products?.product_name || a.product_name || ''; vB = b.products?.product_name || b.product_name || '' }
      else if (col === 'buyer') { vA = a.buyer_name || ''; vB = b.buyer_name || '' }
      else if (col === 'pickup') { vA = a.pickup_status || ''; vB = b.pickup_status || '' }
      else if (col === 'payment') { vA = a.payment_status; vB = b.payment_status }
      else if (col === 'date') { vA = new Date(a.updated_at || a.transaction_date).getTime(); vB = new Date(b.updated_at || b.transaction_date).getTime() }
      if (vA < vB) return dir === 'asc' ? -1 : 1
      if (vA > vB) return dir === 'asc' ? 1 : -1
      return 0
    })
    return list
  }, [transactions, sortPickupTx, pickupStatusFilter, pickupSearch])

  // Sorted Contracts
  const contractsSorted = useMemo(() => {
    const list = [...contracts]
    const { col, dir } = sortContracts
    list.sort((a, b) => {
      let vA: any = ''
      let vB: any = ''
      if (col === 'cube') { vA = a.cubes?.cube_number || ''; vB = b.cubes?.cube_number || '' }
      else if (col === 'type') { vA = a.cubes?.type || ''; vB = b.cubes?.type || '' }
      else if (col === 'period') { vA = a.end_date || ''; vB = b.end_date || '' }
      else if (col === 'days') { vA = daysUntil(a.end_date); vB = daysUntil(b.end_date) }
      else if (col === 'status') { vA = a.status; vB = b.status }
      if (vA < vB) return dir === 'asc' ? -1 : 1
      if (vA > vB) return dir === 'asc' ? 1 : -1
      return 0
    })
    return list
  }, [contracts, sortContracts])

  // Recent 6 transactions for Overview
  const recentTransactions = useMemo(() => {
    return [...transactions]
      .sort((a, b) => new Date(b.updated_at || b.transaction_date).getTime() - new Date(a.updated_at || a.transaction_date).getTime())
      .slice(0, 6)
  }, [transactions])

  if (!user || user.role !== 'Renter') {
    return (
      <section>
        <div className="panel" style={{ textAlign: 'center', padding: '3.5rem 1.5rem', maxWidth: 520, margin: '3rem auto' }}>
          <Store size={44} style={{ color: '#000000', marginBottom: '1rem' }} />
          <h2 style={{ margin: '0 0 0.5rem' }}>Renter Portal Access</h2>
          <p className="muted" style={{ margin: '0 0 1.5rem' }}>
            This workspace is reserved for authorized Renter accounts to manage cubes, inventory, and pick-up handovers.
          </p>
          <Link to="/login?redirect=/renter" className="btn" style={{ width: '100%' }}>
            Sign In to Renter Workspace
          </Link>
        </div>
      </section>
    )
  }

  // Contract actions
  async function extendContract(c: Contract, extraMonths: number) {
    const nextEnd = addMonths(c.end_date, extraMonths)
    const { error } = await supabase
      .from('contracts')
      .update({ end_date: nextEnd, status: 'Active' })
      .eq('contract_id', c.contract_id)
    if (error) return alert(error.message)
    alert(`Contract for Cube ${c.cubes?.cube_number || c.cube_id} extended to ${nextEnd}!`)
    void load()
  }

  async function activateContract(c: Contract) {
    const { error } = await supabase
      .from('contracts')
      .update({ status: 'Active' })
      .eq('contract_id', c.contract_id)
    if (error) return alert(error.message)
    void load()
  }

  // Add Product action
  async function addProduct() {
    if (!productForm.product_name || !productForm.price || !productForm.cube_id) {
      return alert('Product Name, Price, and Assigned Cube are required.')
    }

    const selectedCube = myCubes.find((cube) => cube.cube_id === Number(productForm.cube_id))
    const isPickup = selectedCube?.type === 'Pick-up'
    if (isPickup && !productForm.buyer_name.trim()) {
      return alert('Buyer / Customer Name is required for pick-up items so staff can verify the claimant at the counter.')
    }

    setBusy(true)

    let imageUrls: string[] = []
    if (imageFiles.length > 0) {
      const extraUploads = await Promise.all(
        imageFiles.map((file) => uploadPublicImage(BUCKET_PRODUCT_IMAGES, file, String(user!.user_id)))
      )
      const uploadError = extraUploads.find((upload) => upload.error || !upload.url)
      if (uploadError) {
        setBusy(false)
        return alert('One or more product photos could not be uploaded.')
      }
      imageUrls = extraUploads.map((upload) => upload.url!)
    }
    const primaryUrl = imageUrls[0] || productForm.image_url || null

    const { data: createdProduct, error } = await supabase
      .from('products')
      .insert([{
        renter_id: user!.user_id,
        cube_id: Number(productForm.cube_id),
        product_name: productForm.product_name.trim(),
        description: productForm.description ? productForm.description.trim() : null,
        price: Number(productForm.price),
        stock_quantity: Number(productForm.stock_quantity || 1),
        variant: productForm.variant ? productForm.variant.trim() : null,
        category: productForm.category ? productForm.category.trim() : null,
        image_url: primaryUrl,
        image_urls: imageUrls,
      }])
      .select('product_id')
      .single()

    if (error) {
      setBusy(false)
      return alert(error.message)
    }

    if (isPickup && createdProduct) {
      let pickupReceiptUrl = null
      if (pickupReceiptFile) {
        const up = await uploadPublicImage(BUCKET_DOCUMENTS, pickupReceiptFile, 'receipts')
        if (up.url) pickupReceiptUrl = up.url
      }

      const { error: trackingError } = await supabase.from('transactions').insert([{
        product_id: createdProduct.product_id,
        product_name: `${productForm.product_name.trim()}${productForm.variant ? ` (${productForm.variant.trim()})` : ''}`,
        cube_id: Number(productForm.cube_id),
        renter_id: user!.user_id,
        buyer_name: productForm.buyer_name.trim(),
        authorized_pickup_name: productForm.authorized_pickup_name.trim() || null,
        payment_status: productForm.payment_status,
        payment_method: productForm.payment_method,
        pickup_status: 'Waiting',
        quantity: Math.min(Number(productForm.stock_quantity || 1), 1),
        listed_quantity: Number(productForm.stock_quantity || 1),
        notes: productForm.pickup_notes.trim() || productForm.description.trim() || null,
        receipt_image_url: pickupReceiptUrl,
        processed_by: user!.user_id,
        updated_at: new Date().toISOString(),
      }])
      if (trackingError) alert(`Product saved, but pickup tracking could not be created: ${trackingError.message}`)
    }

    setBusy(false)
    setIsAddProductModalOpen(false)
    setProductForm({
      product_name: '',
      description: '',
      price: '',
      stock_quantity: '1',
      variant: '',
      category: '',
      image_url: '',
      cube_id: productForm.cube_id,
      buyer_name: '',
      authorized_pickup_name: '',
      payment_status: 'Pending',
      payment_method: 'Cash',
      pickup_notes: '',
    })
    setImageFiles([])
    setImagePreviews([])
    setPickupReceiptFile(null)
    setPickupReceiptPreview(null)
    alert(isPickup ? 'Pick-up item and claimant recorded! Counter staff can now verify this item.' : 'Product listed successfully!')
    void load()
  }

  // Add New Handover Entry for Existing Product
  async function addNewHandover() {
    if (!newHandoverForm.product_id || !newHandoverForm.buyer_name.trim()) {
      return alert('Please select a product and enter the buyer name.')
    }
    const prod = pickupProducts.find((p) => p.product_id === Number(newHandoverForm.product_id))
    if (!prod) return alert('Selected product not found.')
    const qty = Math.max(1, Number(newHandoverForm.quantity || 1))
    if (qty > prod.stock_quantity) {
      return alert(`Cannot allocate ${qty} unit(s). Only ${prod.stock_quantity} left in stock.`)
    }
    setBusy(true)

    let receiptUrl = null
    if (newHandoverReceiptFile) {
      const up = await uploadPublicImage(BUCKET_DOCUMENTS, newHandoverReceiptFile, 'receipts')
      if (up.url) receiptUrl = up.url
    }

    const { error } = await supabase.from('transactions').insert([{
      product_id: prod.product_id,
      product_name: `${prod.product_name}${prod.variant ? ` (${prod.variant})` : ''}`,
      cube_id: prod.cube_id,
      renter_id: user!.user_id,
      buyer_name: newHandoverForm.buyer_name.trim(),
      authorized_pickup_name: newHandoverForm.authorized_pickup_name.trim() || null,
      payment_status: newHandoverForm.payment_status,
      payment_method: newHandoverForm.payment_method,
      pickup_status: 'Waiting',
      quantity: qty,
      listed_quantity: prod.stock_quantity,
      receipt_image_url: receiptUrl,
      notes: newHandoverForm.notes.trim() || null,
      processed_by: user!.user_id,
      updated_at: new Date().toISOString(),
    }])

    setBusy(false)
    if (error) return alert('Failed to create handover record: ' + error.message)
    setIsNewHandoverModalOpen(false)
    setNewHandoverForm({
      product_id: '',
      buyer_name: '',
      authorized_pickup_name: '',
      quantity: '1',
      payment_status: 'Pending',
      payment_method: 'Cash',
      notes: '',
    })
    setNewHandoverReceiptFile(null)
    alert('Pick-up handover entry added! Staff can verify the buyer upon pickup.')
    void load()
  }

  // Edit Handover
  function openEditTx(t: Transaction) {
    setEditingTx(t)
    setEditTxForm({
      buyer_name: t.buyer_name || '',
      authorized_pickup_name: t.authorized_pickup_name || '',
      payment_status: t.payment_status === 'Paid' ? 'Paid' : 'Pending',
      payment_method: t.payment_method === 'Online' ? 'Online' : 'Cash',
      notes: t.notes || '',
    })
    setEditTxReceiptFile(null)
  }

  async function updateHandover() {
    if (!editingTx) return
    if (!editTxForm.buyer_name.trim()) return alert('Buyer name cannot be empty.')
    setBusy(true)

    let receiptUrl = editingTx.receipt_image_url
    if (editTxReceiptFile) {
      const up = await uploadPublicImage(BUCKET_DOCUMENTS, editTxReceiptFile, 'receipts')
      if (up.url) receiptUrl = up.url
    }

    const { error } = await supabase.from('transactions').update({
      buyer_name: editTxForm.buyer_name.trim(),
      authorized_pickup_name: editTxForm.authorized_pickup_name.trim() || null,
      payment_status: editTxForm.payment_status,
      payment_method: editTxForm.payment_method,
      receipt_image_url: receiptUrl,
      notes: editTxForm.notes.trim() || null,
      updated_at: new Date().toISOString(),
    }).eq('transaction_id', editingTx.transaction_id)

    setBusy(false)
    if (error) return alert('Failed to update: ' + error.message)
    setEditingTx(null)
    setEditTxReceiptFile(null)
    alert('Pick-up handover details updated successfully!')
    void load()
  }

  // Inline receipt upload
  async function uploadPickupReceipt(transaction: Transaction, file: File | null) {
    if (!file) return
    const upload = await uploadPublicImage(BUCKET_DOCUMENTS, file, 'receipts')
    if (!upload.url) return alert('Receipt upload failed: ' + (upload.error || 'unknown error'))
    const { error } = await supabase
      .from('transactions')
      .update({ receipt_image_url: upload.url, payment_method: 'Online', processed_by: user!.user_id, updated_at: new Date().toISOString() })
      .eq('transaction_id', transaction.transaction_id)
    if (error) return alert(error.message)
    void load()
  }

  function onProductImages(files: FileList | null) {
    if (!files || files.length === 0) return
    const incoming = Array.from(files)
    setImageFiles((prev) => [...prev, ...incoming])
    incoming.forEach((file) => {
      const reader = new FileReader()
      reader.onload = () => {
        setImagePreviews((prev) => [...prev, String(reader.result || '')])
      }
      reader.readAsDataURL(file)
    })
  }

  function removeProductImage(index: number) {
    setImageFiles((prev) => prev.filter((_, i) => i !== index))
    setImagePreviews((prev) => prev.filter((_, i) => i !== index))
  }

  const selectedCubeForAdd = myCubes.find((c) => String(c.cube_id) === String(productForm.cube_id))
  const isSelectedCubePickup = selectedCubeForAdd?.type === 'Pick-up'

  return (
    <section>
      {/* ════════════ PAGE HEADER ════════════ */}
      <div className="page-header" style={{ marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            Renter Workspace
          </h1>
          <p className="lede">
            Overview of your rented cubes, monitor sales earnings, and track live counter customer pick-up handovers.
          </p>
        </div>
        <div className="row" style={{ gap: '0.65rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn"
            onClick={() => setIsAddProductModalOpen(true)}
          >
            <Plus size={16} /> Add Product
          </button>
          {pickupProducts.length > 0 && (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setNewHandoverForm({
                  product_id: String(pickupProducts[0].product_id),
                  buyer_name: '',
                  authorized_pickup_name: '',
                  quantity: '1',
                  payment_status: 'Pending',
                  payment_method: 'Cash',
                  notes: '',
                })
                setNewHandoverReceiptFile(null)
                setIsNewHandoverModalOpen(true)
              }}
            >
              <Package size={16} /> Add Pick-up Entry
            </button>
          )}
        </div>
      </div>

      {/* ════════════ EXPIRY NOTICE BANNER ════════════ */}
      {expiring.length > 0 && (
        <div className="alert warn" style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <strong>Contract Expiry Notice</strong>
            <ul style={{ margin: '0.35rem 0 0', paddingLeft: 18, fontSize: '0.88rem' }}>
              {expiring.map((c) => (
                <li key={c.contract_id}>
                  Cube #{c.cubes?.cube_number} ({c.cubes?.type}): {daysUntil(c.end_date)} day(s) left (ends {c.end_date})
                </li>
              ))}
            </ul>
          </div>
          <div className="row" style={{ gap: '0.5rem' }}>
            {expiring.map((c) => (
              <button
                key={c.contract_id}
                type="button"
                className="btn"
                style={{ padding: '0.4rem 0.85rem', fontSize: '0.82rem' }}
                onClick={() => extendContract(c, 1)}
              >
                +1 Mo (Cube {c.cubes?.cube_number})
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ════════════ KPI STAT CARDS COLLAPSIBLE DROPDOWN & 1-ROW GRID ════════════ */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showOverviewStats ? '0.65rem' : '0' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#666666', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Overview & Metrics
          </span>
          <button
            type="button"
            className="btn-ghost"
            style={{ padding: '0.25rem 0.75rem', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', borderRadius: 999 }}
            onClick={() => setShowOverviewStats(!showOverviewStats)}
            aria-label={showOverviewStats ? 'Hide overview metrics' : 'Show overview metrics'}
          >
            {showOverviewStats ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            <span>{showOverviewStats ? 'Hide Overview' : 'Show Overview'}</span>
          </button>
        </div>

        {showOverviewStats && (
          loading ? (
            <div className="renter-stat-grid">
              {Array.from({ length: 5 }).map((_, i) => (
                <SkeletonStat key={i} />
              ))}
            </div>
          ) : (
            <div className="renter-stat-grid">
              <div className="stat" style={{ padding: '1.1rem 1.15rem' }}>
                <div className="label" style={{ fontSize: '0.72rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Total Sales Earnings</div>
                <div className="value" style={{ fontSize: '1.65rem' }}>{peso(totalEarnings)}</div>
                <div className="muted" style={{ fontSize: '0.72rem', marginTop: '0.2rem', whiteSpace: 'nowrap' }}>
                  Display + Pick-up collected
                </div>
              </div>
              <div className="stat" style={{ padding: '1.1rem 1.15rem' }}>
                <div className="label" style={{ fontSize: '0.72rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Display Cube Sales</div>
                <div className="value" style={{ fontSize: '1.65rem' }}>{peso(displaySalesTotal)}</div>
                <div className="muted" style={{ fontSize: '0.72rem', marginTop: '0.2rem', whiteSpace: 'nowrap' }}>
                  {displayTransactions.filter((t) => t.payment_status === 'Paid').length} paid transaction(s)
                </div>
              </div>
              <div className="stat" style={{ padding: '1.1rem 1.15rem' }}>
                <div className="label" style={{ fontSize: '0.72rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Pick-up Sales</div>
                <div className="value" style={{ fontSize: '1.65rem' }}>{peso(pickupSalesTotal)}</div>
                <div className="muted" style={{ fontSize: '0.72rem', marginTop: '0.2rem', whiteSpace: 'nowrap' }}>
                  {transactions.filter((t) => t.products?.cubes?.type === 'Pick-up' && t.payment_status === 'Paid').length} paid item(s)
                </div>
              </div>
              <div className="stat" style={{ padding: '1.1rem 1.15rem' }}>
                <div className="label" style={{ fontSize: '0.72rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Rented Cubes</div>
                <div className="value" style={{ fontSize: '1.65rem' }}>{myCubes.length}</div>
                <div className="muted" style={{ fontSize: '0.72rem', marginTop: '0.2rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={myCubes.map((c) => `#${c.cube_number}`).join(', ')}>
                  {myCubes.map((c) => `#${c.cube_number}`).join(', ') || 'None'}
                </div>
              </div>
              <div className="stat" style={{ padding: '1.1rem 1.15rem' }}>
                <div className="label" style={{ fontSize: '0.72rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Waiting Pick-ups</div>
                <div className="value" style={{ fontSize: '1.65rem', color: waitingPickupsCount > 0 ? '#b45309' : '#000000' }}>
                  {waitingPickupsCount}
                </div>
                <div className="muted" style={{ fontSize: '0.72rem', marginTop: '0.2rem', whiteSpace: 'nowrap' }}>
                  Awaiting counter release
                </div>
              </div>
            </div>
          )
        )}
      </div>

      {/* ════════════ DASHBOARD SECTION NAVIGATION (ADMIN STYLE) ════════════ */}
      <nav aria-label="Renter sections" className="report-section-nav no-print">
        <button
          type="button"
          className={activeTab === 'overview' ? 'active' : ''}
          onClick={() => handleTabChange('overview')}
        >
          <BarChart3 size={15} style={{ verticalAlign: 'middle', marginRight: 4 }} />
          Overview & Quick Actions
        </button>
        <button
          type="button"
          className={activeTab === 'display' ? 'active' : ''}
          onClick={() => handleTabChange('display')}
        >
          <Store size={15} style={{ verticalAlign: 'middle', marginRight: 4 }} />
          Display Products & Sales ({displayProducts.length})
        </button>
        <button
          type="button"
          className={activeTab === 'pickup' ? 'active' : ''}
          onClick={() => handleTabChange('pickup')}
        >
          <Package size={15} style={{ verticalAlign: 'middle', marginRight: 4 }} />
          Pick-up Tracking & Handovers ({pickupTransactions.length})
          {waitingPickupsCount > 0 && (
            <span className="badge warn" style={{ marginLeft: 6, fontSize: '0.7rem', padding: '0.1rem 0.4rem' }}>
              {waitingPickupsCount} waiting
            </span>
          )}
        </button>
        <button
          type="button"
          className={activeTab === 'cubes_contracts' ? 'active' : ''}
          onClick={() => handleTabChange('cubes_contracts')}
        >
          <KeyRound size={15} style={{ verticalAlign: 'middle', marginRight: 4 }} />
          My Cubes & Contracts ({contracts.length})
        </button>
      </nav>

      {/* ════════════ TAB 1: OVERVIEW & QUICK ACTIONS ════════════ */}
      {activeTab === 'overview' && (
        <div>
          {/* Quick Actions Row */}
          <div className="panel" style={{ padding: '1.25rem 1.5rem', marginBottom: '2rem' }}>
            <h3 style={{ margin: '0 0 0.85rem', fontSize: '1rem', fontWeight: 800 }}>Quick Actions</h3>
            <div style={{ display: 'flex', gap: '0.85rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn"
                onClick={() => setIsAddProductModalOpen(true)}
              >
                <Plus size={16} /> List New Product
              </button>
              {pickupProducts.length > 0 && (
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => {
                    setNewHandoverForm({
                      product_id: String(pickupProducts[0].product_id),
                      buyer_name: '',
                      authorized_pickup_name: '',
                      quantity: '1',
                      payment_status: 'Pending',
                      payment_method: 'Cash',
                      notes: '',
                    })
                    setNewHandoverReceiptFile(null)
                    setIsNewHandoverModalOpen(true)
                  }}
                >
                  <Package size={16} /> Add Pick-up Entry
                </button>
              )}
              <Link to="/contracts" className="btn-ghost">
                <FileText size={16} /> View Contracts Hub
              </Link>
              <Link to="/" className="btn-ghost">
                <ExternalLink size={16} /> Browse Available Cubes
              </Link>
            </div>
          </div>

          {/* Rented Cubes Summary */}
          <div style={{ marginBottom: '2.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div>
                <h2 style={{ margin: 0 }}>Rented Cubes Status</h2>
                <p className="muted" style={{ margin: '0.2rem 0 0' }}>Current lease status, days until renewal, and monthly rates.</p>
              </div>
              <button type="button" className="btn-ghost" style={{ fontSize: '0.82rem' }} onClick={() => handleTabChange('cubes_contracts')}>
                Manage All Contracts →
              </button>
            </div>
            {myCubes.length === 0 ? (
              <div className="empty" style={{ padding: '2.5rem', textAlign: 'center' }}>
                <p>You have no active cube rentals yet.</p>
                <Link to="/" className="btn" style={{ marginTop: '0.5rem' }}>Reserve a Cube in Catalogue</Link>
              </div>
            ) : (
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem', marginBottom: 0 }}>
                {contracts.map((c) => {
                  const left = daysUntil(c.end_date)
                  const isExpiringSoon = left <= 7 && left >= 0
                  return (
                    <div key={c.contract_id} className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong style={{ fontSize: '1.1rem' }}>Cube #{c.cubes?.cube_number}</strong>
                        <span className={`status-pill ${c.status === 'Active' ? 'confirmed' : 'pending'}`}>
                          {c.status}
                        </span>
                      </div>
                      <div className="muted" style={{ fontSize: '0.82rem' }}>
                        Type: <strong>{c.cubes?.type}</strong> • {peso(c.cubes?.price_per_month)} / mo
                      </div>
                      <div style={{ fontSize: '0.82rem' }}>
                        <span>Lease: {c.start_date} → {c.end_date}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: '0.5rem', borderTop: '1px solid #f0f0f0' }}>
                        <span className={`badge ${isExpiringSoon ? 'warn' : 'info'}`} style={{ fontSize: '0.75rem' }}>
                          {left < 0 ? 'Expired' : `${left} day(s) left`}
                        </span>
                        {(c.status === 'Active' || c.status === 'Pending') && (
                          <button
                            type="button"
                            className="btn-ghost"
                            style={{ padding: '0.25rem 0.65rem', fontSize: '0.78rem' }}
                            onClick={() => extendContract(c, 1)}
                          >
                            +1 Mo
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Recent Activity Feed */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
              <div>
                <h2 style={{ margin: 0 }}>Recent Sales & Handovers</h2>
                <p className="muted" style={{ margin: '0.2rem 0 0' }}>Latest customer transactions and counter pick-ups.</p>
              </div>
            </div>
            {recentTransactions.length === 0 ? (
              <div className="empty" style={{ padding: '2rem' }}>No recent activity records yet.</div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Type</th>
                      <th>Date</th>
                      <th>Amount</th>
                      <th>Payment</th>
                      <th>Claim / Status</th>
                      <th>Receipt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentTransactions.map((t) => {
                      const isPickup = (t.products?.cubes?.type || t.cubes?.type) === 'Pick-up'
                      const amt = Number(t.products?.price || 0) * Number(t.quantity || 1)
                      return (
                        <tr key={t.transaction_id}>
                          <td>
                            <strong>{t.products?.product_name || t.product_name || '—'}</strong>
                            {t.products?.variant && <div className="muted" style={{ fontSize: '0.75rem' }}>{t.products.variant}</div>}
                          </td>
                          <td>
                            <span className="badge" style={{ fontSize: '0.72rem' }}>{isPickup ? 'Pick-up' : 'Display'}</span>
                          </td>
                          <td>{new Date(t.transaction_date).toLocaleDateString('en-PH')}</td>
                          <td>{peso(amt)}</td>
                          <td>
                            <span className={`status-pill ${t.payment_status === 'Paid' ? 'confirmed' : 'pending'}`}>
                              {t.payment_status}
                            </span>
                          </td>
                          <td>
                            {isPickup ? (
                              <div>
                                <span className={`status-pill ${t.pickup_status === 'Picked-up' ? 'confirmed' : 'pending'}`}>
                                  {t.pickup_status || 'Waiting'}
                                </span>
                                {t.buyer_name && <div className="muted" style={{ fontSize: '0.72rem' }}>{t.buyer_name}</div>}
                              </div>
                            ) : (
                              <span className="muted">Display Sale</span>
                            )}
                          </td>
                          <td>
                            {t.receipt_image_url ? (
                              <img
                                src={t.receipt_image_url}
                                alt="Receipt"
                                style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 4, cursor: 'pointer', border: '1px solid #ddd' }}
                                onClick={() => setPreviewReceipt(t.receipt_image_url)}
                                title="Zoom receipt"
                              />
                            ) : (
                              <span className="muted" style={{ fontSize: '0.75rem' }}>None</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════ TAB 2: DISPLAY PRODUCTS & SALES ════════════ */}
      {activeTab === 'display' && (
        <div>
          {/* Sub Navigation Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                className={displaySubView === 'products' ? 'btn' : 'btn-ghost'}
                style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}
                onClick={() => setDisplaySubView('products')}
              >
                Products Grid ({displayProducts.length})
              </button>
              <button
                type="button"
                className={displaySubView === 'sales' ? 'btn' : 'btn-ghost'}
                style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}
                onClick={() => setDisplaySubView('sales')}
              >
                Sales History ({displayTransactions.length})
              </button>
            </div>
            <button
              type="button"
              className="btn"
              style={{ fontSize: '0.85rem' }}
              onClick={() => {
                const dCube = myCubes.find((c) => c.type === 'Display')
                if (dCube) setProductForm((prev) => ({ ...prev, cube_id: String(dCube.cube_id) }))
                setIsAddProductModalOpen(true)
              }}
            >
              <Plus size={15} /> Add Display Product
            </button>
          </div>

          {/* ── Subview A: Display Products Grid ── */}
          {displaySubView === 'products' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 240, maxWidth: 400 }}>
                  <Search size={16} className="muted" />
                  <input
                    type="text"
                    placeholder="Search product name, variant, or category…"
                    value={displaySearch}
                    onChange={(e) => {
                      setDisplaySearch(e.target.value)
                      setDisplayProductsPage(1)
                    }}
                    style={{ margin: 0, padding: '0.5rem 0.85rem', fontSize: '0.88rem' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <select
                    value={displayCategoryFilter}
                    onChange={(e) => {
                      setDisplayCategoryFilter(e.target.value)
                      setDisplayProductsPage(1)
                    }}
                    style={{ margin: 0, padding: '0.35rem 0.75rem', fontSize: '0.78rem', height: 32 }}
                  >
                    <option value="All">All Categories ({displayProducts.length})</option>
                    {existingCategories.map((cat) => {
                      const count = displayProducts.filter((p) => p.category?.trim() === cat).length
                      return (
                        <option key={cat} value={cat}>
                          {cat} ({count})
                        </option>
                      )
                    })}
                  </select>
                  {(['all', 'in_stock', 'sold_out'] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={displayStockFilter === s ? 'btn' : 'btn-ghost'}
                      style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem' }}
                      onClick={() => {
                        setDisplayStockFilter(s)
                        setDisplayProductsPage(1)
                      }}
                    >
                      {s === 'all' ? 'All Stock' : s === 'in_stock' ? 'In Stock' : 'Sold Out'}
                    </button>
                  ))}
                </div>
              </div>

              {filteredDisplayProducts.length === 0 ? (
                <div className="empty" style={{ padding: '3rem', textAlign: 'center' }}>
                  <p>No display products match your search or filter.</p>
                  <button
                    type="button"
                    className="btn"
                    style={{ marginTop: '0.5rem' }}
                    onClick={() => setIsAddProductModalOpen(true)}
                  >
                    + Add New Display Product
                  </button>
                </div>
              ) : (
                <>
                  <div className="grid">
                    {filteredDisplayProducts
                      .slice((displayProductsPage - 1) * DEFAULT_PAGE_SIZE, displayProductsPage * DEFAULT_PAGE_SIZE)
                      .map((p) => {
                        const isAvailable = p.stock_quantity > 0
                        return (
                          <div
                            className="card"
                            key={p.product_id}
                            style={{ cursor: 'pointer' }}
                            onClick={() => setGalleryProduct(p)}
                          >
                            <div className="card-media" style={{ background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                              {p.image_url ? (
                                <img src={p.image_url} alt={p.product_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              ) : (
                                <div className="muted" style={{ fontSize: '0.8rem' }}>No Photo</div>
                              )}
                              {((p.image_urls && p.image_urls.length > 1) || (p.image_urls && p.image_urls.length === 1 && p.image_url)) && (
                                <span
                                  style={{
                                    position: 'absolute',
                                    top: 8,
                                    right: 8,
                                    background: 'rgba(0, 0, 0, 0.72)',
                                    color: '#fff',
                                    fontSize: '0.72rem',
                                    fontWeight: 600,
                                    padding: '2px 7px',
                                    borderRadius: 12,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    backdropFilter: 'blur(4px)',
                                  }}
                                >
                                  <Camera size={11} /> {(p.image_urls?.length || 1)} shots
                                </span>
                              )}
                            </div>
                            <div className="card-body">
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <h3 style={{ margin: 0 }}>{p.product_name}</h3>
                                <span className={`status-pill ${isAvailable ? 'confirmed' : 'pending'}`}>
                                  {isAvailable ? `${p.stock_quantity} In Stock` : 'Sold Out'}
                                </span>
                              </div>
                              {p.description && <p className="muted" style={{ fontSize: '0.82rem', margin: '0.2rem 0 0' }}>{p.description}</p>}
                              <div className="price" style={{ margin: '0.4rem 0' }}>{peso(p.price)}</div>
                              <div className="meta-line" style={{ marginTop: 'auto' }}>
                                <span>{p.variant ? `Variant: ${p.variant}` : 'Standard'}</span>
                                <span>Cube #{p.cubes?.cube_number || '—'}</span>
                                {p.category && <span>{p.category}</span>}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                  </div>
                  <TablePagination
                    page={displayProductsPage}
                    totalItems={filteredDisplayProducts.length}
                    pageSize={DEFAULT_PAGE_SIZE}
                    onPageChange={setDisplayProductsPage}
                  />
                </>
              )}
            </div>
          )}

          {/* ── Subview B: Display Sales Transactions ── */}
          {displaySubView === 'sales' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 220, maxWidth: 380 }}>
                  <Search size={16} className="muted" />
                  <input
                    type="text"
                    placeholder="Search sales transactions…"
                    value={displaySearch}
                    onChange={(e) => {
                      setDisplaySearch(e.target.value)
                      setDisplaySalesPage(1)
                    }}
                    style={{ margin: 0, padding: '0.5rem 0.85rem', fontSize: '0.88rem' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  {(['all', 'Paid', 'Pending'] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={displaySalesFilter === s ? 'btn' : 'btn-ghost'}
                      style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem' }}
                      onClick={() => {
                        setDisplaySalesFilter(s)
                        setDisplaySalesPage(1)
                      }}
                    >
                      {s === 'all' ? 'All Payments' : s}
                    </button>
                  ))}
                </div>
              </div>

              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort(sortDisplayTx, setSortDisplayTx, 'product')}>
                        Product {renderSortIndicator('product', sortDisplayTx)}
                      </th>
                      <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort(sortDisplayTx, setSortDisplayTx, 'variant')}>
                        Variant {renderSortIndicator('variant', sortDisplayTx)}
                      </th>
                      <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort(sortDisplayTx, setSortDisplayTx, 'date')}>
                        Date {renderSortIndicator('date', sortDisplayTx)}
                      </th>
                      <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort(sortDisplayTx, setSortDisplayTx, 'price')}>
                        Unit Price {renderSortIndicator('price', sortDisplayTx)}
                      </th>
                      <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort(sortDisplayTx, setSortDisplayTx, 'qty')}>
                        Qty {renderSortIndicator('qty', sortDisplayTx)}
                      </th>
                      <th>Total</th>
                      <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort(sortDisplayTx, setSortDisplayTx, 'payment')}>
                        Payment Status {renderSortIndicator('payment', sortDisplayTx)}
                      </th>
                      <th>Payment Method</th>
                      <th>Receipt Proof</th>
                      <th>Staff</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayTransactions
                      .slice((displaySalesPage - 1) * DEFAULT_PAGE_SIZE, displaySalesPage * DEFAULT_PAGE_SIZE)
                      .map((t) => {
                        const total = Number(t.products?.price || 0) * Number(t.quantity || 1)
                        return (
                          <tr key={t.transaction_id}>
                            <td><strong>{t.products?.product_name || '—'}</strong></td>
                            <td>{t.products?.variant || 'Standard'}</td>
                            <td>{new Date(t.transaction_date).toLocaleString('en-PH')}</td>
                            <td>{peso(t.products?.price)}</td>
                            <td>{t.quantity || 1}</td>
                            <td><strong>{peso(total)}</strong></td>
                            <td>
                              <span className={`status-pill ${t.payment_status === 'Paid' ? 'confirmed' : 'pending'}`}>
                                {t.payment_status}
                              </span>
                            </td>
                            <td>{t.payment_method || 'Cash'}</td>
                            <td>
                              {t.receipt_image_url ? (
                                <img
                                  src={t.receipt_image_url}
                                  alt="Receipt proof"
                                  style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 4, cursor: 'pointer', border: '1px solid #ddd' }}
                                  onClick={() => setPreviewReceipt(t.receipt_image_url)}
                                  title="Click to zoom receipt"
                                />
                              ) : (
                                <span className="muted">None</span>
                              )}
                            </td>
                            <td>{t.users ? `${t.users.full_name}` : '—'}</td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
                {displayTransactions.length === 0 && (
                  <div className="empty" style={{ padding: '2rem' }}>No display sales records match this criteria.</div>
                )}
              </div>
              <TablePagination
                page={displaySalesPage}
                totalItems={displayTransactions.length}
                pageSize={DEFAULT_PAGE_SIZE}
                onPageChange={setDisplaySalesPage}
              />
            </div>
          )}
        </div>
      )}

      {/* ════════════ TAB 3: PICK-UP ITEMS & HANDOVERS ════════════ */}
      {activeTab === 'pickup' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h2 style={{ margin: 0 }}>Pick-up Tracking & Handovers</h2>
              <p className="muted" style={{ margin: '0.2rem 0 0' }}>
                Items placed in Pick-up cubes. Staff verify customer claimants and confirm payments at the counter.
              </p>
            </div>
            {pickupProducts.length > 0 && (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setNewHandoverForm({
                    product_id: String(pickupProducts[0].product_id),
                    buyer_name: '',
                    authorized_pickup_name: '',
                    quantity: '1',
                    payment_status: 'Pending',
                    payment_method: 'Cash',
                    notes: '',
                  })
                  setNewHandoverReceiptFile(null)
                  setIsNewHandoverModalOpen(true)
                }}
              >
                <Plus size={16} /> Add Pick-up Entry
              </button>
            )}
          </div>

          {/* Search & Status Filters */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 220, maxWidth: 380 }}>
              <Search size={16} className="muted" />
              <input
                type="text"
                placeholder="Search buyer name, alternate, or product…"
                value={pickupSearch}
                onChange={(e) => {
                  setPickupSearch(e.target.value)
                  setPickupPage(1)
                }}
                style={{ margin: 0, padding: '0.5rem 0.85rem', fontSize: '0.88rem' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              {(['all', 'Waiting', 'Picked-up'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  className={pickupStatusFilter === s ? 'btn' : 'btn-ghost'}
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem' }}
                  onClick={() => {
                    setPickupStatusFilter(s)
                    setPickupPage(1)
                  }}
                >
                  {s === 'all' ? 'All Handovers' : s === 'Waiting' ? 'Waiting Claim' : 'Picked-up'}
                </button>
              ))}
            </div>
          </div>

          {/* Live Handover Table */}
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort(sortPickupTx, setSortPickupTx, 'product')}>
                    Product {renderSortIndicator('product', sortPickupTx)}
                  </th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort(sortPickupTx, setSortPickupTx, 'buyer')}>
                    Buyer Name {renderSortIndicator('buyer', sortPickupTx)}
                  </th>
                  <th>Authorized Alternate</th>
                  <th>Qty</th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort(sortPickupTx, setSortPickupTx, 'pickup')}>
                    Pickup Status {renderSortIndicator('pickup', sortPickupTx)}
                  </th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort(sortPickupTx, setSortPickupTx, 'payment')}>
                    Payment Status {renderSortIndicator('payment', sortPickupTx)}
                  </th>
                  <th>Receipt Proof</th>
                  <th>Notes</th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort(sortPickupTx, setSortPickupTx, 'date')}>
                    Updated {renderSortIndicator('date', sortPickupTx)}
                  </th>
                  <th className="no-print" style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pickupTransactions
                  .slice((pickupPage - 1) * DEFAULT_PAGE_SIZE, pickupPage * DEFAULT_PAGE_SIZE)
                  .map((t) => (
                    <tr key={t.transaction_id}>
                      <td>
                        <strong>{t.products?.product_name || t.product_name || '—'}</strong>
                        {t.products?.variant && <div className="muted" style={{ fontSize: '0.75rem' }}>{t.products.variant}</div>}
                      </td>
                      <td><strong>{t.buyer_name || '—'}</strong></td>
                      <td>{t.authorized_pickup_name || <span className="muted">—</span>}</td>
                      <td>{t.quantity ?? 1}</td>
                      <td>
                        <span className={`status-pill ${t.pickup_status === 'Picked-up' ? 'confirmed' : 'pending'}`}>
                          {t.pickup_status || 'Waiting'}
                        </span>
                      </td>
                      <td>
                        <span className={`status-pill ${t.payment_status === 'Paid' ? 'confirmed' : 'pending'}`}>
                          {t.payment_status}
                        </span>
                      </td>
                      <td>
                        {t.receipt_image_url ? (
                          <img
                            src={t.receipt_image_url}
                            alt="Receipt proof"
                            style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 4, cursor: 'pointer', border: '1px solid #ddd' }}
                            onClick={() => setPreviewReceipt(t.receipt_image_url)}
                            title="Click to zoom receipt"
                          />
                        ) : (
                          <span className="muted">—</span>
                        )}
                        <input
                          className="no-print"
                          type="file"
                          accept="image/*"
                          aria-label="Upload payment receipt"
                          onChange={(event) => void uploadPickupReceipt(t, event.target.files?.[0] || null)}
                          style={{ display: 'block', maxWidth: 140, marginTop: 4, fontSize: '0.72rem' }}
                        />
                      </td>
                      <td><div style={{ fontSize: '0.78rem', color: '#555', maxWidth: 160 }}>{t.notes || '—'}</div></td>
                      <td>
                        <div style={{ fontSize: '0.78rem' }}>{new Date(t.updated_at || t.transaction_date).toLocaleString('en-PH')}</div>
                        <div className="muted" style={{ fontSize: '0.72rem' }}>{t.users?.full_name || 'Staff'}</div>
                      </td>
                      <td className="no-print" style={{ textAlign: 'right' }}>
                        {t.pickup_status === 'Picked-up' ? (
                          <span className="badge ok" style={{ fontSize: '0.75rem' }}>Completed</span>
                        ) : (
                          <button
                            className="btn-ghost"
                            type="button"
                            style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem' }}
                            onClick={() => openEditTx(t)}
                          >
                            Edit Info
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {pickupTransactions.length === 0 && (
              <div className="empty" style={{ padding: '2rem' }}>No pick-up transaction records found.</div>
            )}
          </div>
          <TablePagination
            page={pickupPage}
            totalItems={pickupTransactions.length}
            pageSize={DEFAULT_PAGE_SIZE}
            onPageChange={setPickupPage}
          />

          {/* Pick-up Inventory Stock Cards */}
          <div style={{ marginTop: '2.5rem' }}>
            <h3 style={{ margin: '0 0 0.85rem' }}>Pick-up Cube Inventory</h3>
            <div className="grid">
              {pickupProducts.map((p) => (
                <div
                  className="card"
                  key={p.product_id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setGalleryProduct(p)}
                >
                  <div className="card-media" style={{ background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                    {p.image_url ? (
                      <img src={p.image_url} alt={p.product_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div className="muted" style={{ fontSize: '0.8rem' }}>No Photo</div>
                    )}
                    {((p.image_urls && p.image_urls.length > 1) || (p.image_urls && p.image_urls.length === 1 && p.image_url)) && (
                      <span
                        style={{
                          position: 'absolute',
                          top: 8,
                          right: 8,
                          background: 'rgba(0, 0, 0, 0.72)',
                          color: '#fff',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          padding: '2px 7px',
                          borderRadius: 12,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          backdropFilter: 'blur(4px)',
                        }}
                      >
                        <Camera size={11} /> {(p.image_urls?.length || 1)} shots
                      </span>
                    )}
                  </div>
                  <div className="card-body">
                    <h3 style={{ margin: 0 }}>{p.product_name}</h3>
                    {p.description && <p className="muted" style={{ fontSize: '0.82rem', margin: '0.2rem 0 0' }}>{p.description}</p>}
                    <div className="price" style={{ margin: '0.4rem 0' }}>{peso(p.price)}</div>
                    <div className="meta-line">
                      <span><strong>{p.stock_quantity}</strong> available</span>
                      <span>{p.variant ? `Variant: ${p.variant}` : 'Standard'}</span>
                      <span>Cube #{p.cubes?.cube_number || '—'}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {pickupProducts.length === 0 && (
              <div className="empty" style={{ padding: '1.5rem' }}>No pick-up products listed yet.</div>
            )}
          </div>
        </div>
      )}

      {/* ════════════ TAB 4: MY CUBES & CONTRACTS ════════════ */}
      {activeTab === 'cubes_contracts' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h2 style={{ margin: 0 }}>Your Active & Pending Contracts</h2>
              <p className="muted" style={{ margin: '0.2rem 0 0' }}>
                Manage your cube leases, renew active agreements, or reserve additional cubes.
              </p>
            </div>
            <Link to="/" className="btn">
              <Plus size={16} /> Reserve Another Cube
            </Link>
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort(sortContracts, setSortContracts, 'cube')}>
                    Cube {renderSortIndicator('cube', sortContracts)}
                  </th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort(sortContracts, setSortContracts, 'type')}>
                    Type {renderSortIndicator('type', sortContracts)}
                  </th>
                  <th>Monthly Rate</th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort(sortContracts, setSortContracts, 'period')}>
                    Period {renderSortIndicator('period', sortContracts)}
                  </th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort(sortContracts, setSortContracts, 'days')}>
                    Days Left {renderSortIndicator('days', sortContracts)}
                  </th>
                  <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort(sortContracts, setSortContracts, 'status')}>
                    Status {renderSortIndicator('status', sortContracts)}
                  </th>
                  <th className="no-print" style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {contractsSorted.map((c) => {
                  const left = daysUntil(c.end_date)
                  return (
                    <tr key={c.contract_id}>
                      <td><strong>Cube #{c.cubes?.cube_number}</strong></td>
                      <td>
                        <span className="badge" style={{ fontSize: '0.75rem' }}>{c.cubes?.type}</span>
                      </td>
                      <td>{peso(c.cubes?.price_per_month)}</td>
                      <td>{c.start_date} → {c.end_date}</td>
                      <td>
                        <span className={`status-pill ${left <= 7 && left >= 0 ? 'pending' : left < 0 ? 'pending' : 'confirmed'}`}>
                          {left < 0 ? 'Expired' : `${left} day(s)`}
                        </span>
                      </td>
                      <td>
                        <span className={`status-pill ${c.status === 'Active' ? 'confirmed' : 'pending'}`}>
                          {c.status}
                        </span>
                      </td>
                      <td className="no-print" style={{ textAlign: 'right' }}>
                        <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                          {c.status === 'Pending' && (
                            <button className="btn-ghost" type="button" onClick={() => activateContract(c)}>Activate</button>
                          )}
                          {(c.status === 'Active' || c.status === 'Pending') && (
                            <>
                              <button className="btn" type="button" style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }} onClick={() => extendContract(c, 1)}>+1 mo</button>
                              <button className="btn-ghost" type="button" style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }} onClick={() => extendContract(c, 3)}>+3 mos</button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {contracts.length === 0 && (
              <div className="empty" style={{ padding: '3rem', textAlign: 'center' }}>
                <p>No contracts found on record.</p>
                <Link to="/" className="btn" style={{ marginTop: '0.5rem' }}>Browse Catalogue & Reserve Cube</Link>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════ MODAL 1: ADD PRODUCT (ORGANIZED DIALOG) ════════════ */}
      {isAddProductModalOpen && (
        <div className="modal-overlay" onClick={() => setIsAddProductModalOpen(false)}>
          <div className="modal-card" style={{ maxWidth: 620 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>List New Product in Rented Cubes</h3>
              <button className="modal-close" onClick={() => setIsAddProductModalOpen(false)}><X size={18} /></button>
            </div>

            {isSelectedCubePickup && (
              <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '0.75rem 0.9rem', marginBottom: '1rem', fontSize: '0.84rem', color: '#0369a1' }}>
                <strong>Pick-up Cube Selected:</strong> Please provide claimant details below so staff can verify the buyer upon release at the counter.
              </div>
            )}

            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.85rem' }}>
              <div className="field">
                <label>Product Name *</label>
                <input
                  placeholder="e.g. Handmade Ceramic Mug"
                  value={productForm.product_name}
                  onChange={(e) => setProductForm({ ...productForm, product_name: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Price (₱) *</label>
                <input
                  type="number"
                  min="0"
                  placeholder="0.00"
                  value={productForm.price}
                  onChange={(e) => setProductForm({ ...productForm, price: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Quantity *</label>
                <input
                  type="number"
                  min="1"
                  value={productForm.stock_quantity}
                  onChange={(e) => setProductForm({ ...productForm, stock_quantity: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Variant / Shade (Optional)</label>
                <input
                  placeholder="e.g. Large / Warm Ivory"
                  value={productForm.variant}
                  onChange={(e) => setProductForm({ ...productForm, variant: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Assigned Cube *</label>
                <select
                  value={productForm.cube_id}
                  onChange={(e) => setProductForm({ ...productForm, cube_id: e.target.value })}
                >
                  <option value="">Select your cube…</option>
                  {myCubes.map((c) => (
                    <option key={c.cube_id} value={c.cube_id}>
                      Cube #{c.cube_number} ({c.type})
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <label>Category</label>
                  <span className="muted" style={{ fontSize: '0.75rem' }}>Pick or type new</span>
                </div>
                <input
                  list="renter-category-options"
                  placeholder="e.g. Cosmetics & Skincare"
                  value={productForm.category}
                  onChange={(e) => setProductForm({ ...productForm, category: e.target.value })}
                />
                <datalist id="renter-category-options">
                  {categories.map((category) => (
                    <option key={category} value={category} />
                  ))}
                </datalist>
              </div>
            </div>

            <div className="field" style={{ marginTop: '0.75rem' }}>
              <label>Description</label>
              <textarea
                rows={2}
                placeholder="Product description, materials, or features…"
                value={productForm.description}
                onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
              />
            </div>

            <div className="field" style={{ marginTop: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                <label style={{ margin: 0 }}>Product Photos (Gallery / Multiple Angles)</label>
                <span className="muted" style={{ fontSize: '0.75rem' }}>
                  {imageFiles.length > 0 ? `${imageFiles.length} photo(s) selected` : 'Select 1 or more photos'}
                </span>
              </div>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => onProductImages(e.target.files)}
              />
              {imagePreviews.length > 0 && (
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: 8 }}>
                  {imagePreviews.map((preview, idx) => (
                    <div
                      key={idx}
                      style={{
                        position: 'relative',
                        width: 72,
                        height: 72,
                        borderRadius: 6,
                        overflow: 'hidden',
                        border: idx === 0 ? '2px solid #000' : '1px solid #ddd',
                        background: '#f8fafc',
                      }}
                    >
                      <img
                        src={preview}
                        alt={`Preview ${idx + 1}`}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                      {idx === 0 && (
                        <span
                          style={{
                            position: 'absolute',
                            bottom: 2,
                            left: 2,
                            right: 2,
                            fontSize: '0.62rem',
                            fontWeight: 700,
                            background: 'rgba(0,0,0,0.75)',
                            color: '#fff',
                            textAlign: 'center',
                            borderRadius: 2,
                            padding: '1px 0',
                          }}
                        >
                          Cover
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => removeProductImage(idx)}
                        style={{
                          position: 'absolute',
                          top: 2,
                          right: 2,
                          width: 18,
                          height: 18,
                          borderRadius: '50%',
                          background: 'rgba(0,0,0,0.75)',
                          color: '#fff',
                          border: 'none',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.75rem',
                          lineHeight: 1,
                          padding: 0,
                        }}
                        title="Remove photo"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Conditional Pick-up Claimant Details */}
            {isSelectedCubePickup && (
              <div style={{ marginTop: '1.25rem', padding: '1rem', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.92rem', color: '#0f172a' }}>
                  Counter Claimant Information
                </h4>
                <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
                  <div className="field">
                    <label>Buyer / Customer Name *</label>
                    <input
                      placeholder="e.g. Maria Santos"
                      value={productForm.buyer_name}
                      onChange={(e) => setProductForm({ ...productForm, buyer_name: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label>Authorized Alternate Claimant</label>
                    <input
                      placeholder="e.g. Courier or relative"
                      value={productForm.authorized_pickup_name}
                      onChange={(e) => setProductForm({ ...productForm, authorized_pickup_name: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label>Payment Status</label>
                    <select
                      value={productForm.payment_status}
                      onChange={(e) => setProductForm({ ...productForm, payment_status: e.target.value as 'Pending' | 'Paid' })}
                    >
                      <option value="Pending">Pending Payment (Collect at counter)</option>
                      <option value="Paid">Paid (Paid online to renter)</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Payment Method</label>
                    <select
                      value={productForm.payment_method}
                      onChange={(e) => setProductForm({ ...productForm, payment_method: e.target.value as 'Cash' | 'Online' })}
                    >
                      <option value="Cash">Cash</option>
                      <option value="Online">GCash / Maya / Online</option>
                    </select>
                  </div>
                </div>

                <div className="field" style={{ marginTop: '0.75rem' }}>
                  <label>Payment Receipt Proof (if Paid)</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0] || null
                      setPickupReceiptFile(file)
                      if (file) {
                        const r = new FileReader()
                        r.onload = () => setPickupReceiptPreview(String(r.result || ''))
                        r.readAsDataURL(file)
                      } else {
                        setPickupReceiptPreview(null)
                      }
                    }}
                  />
                  {pickupReceiptPreview && (
                    <img
                      src={pickupReceiptPreview}
                      alt="Receipt preview"
                      style={{ marginTop: 6, maxWidth: 80, maxHeight: 80, objectFit: 'cover', borderRadius: 4 }}
                    />
                  )}
                </div>

                <div className="field" style={{ marginTop: '0.75rem' }}>
                  <label>Notes / Instructions for Staff</label>
                  <input
                    placeholder="e.g. Paid online, claimant will show ID"
                    value={productForm.pickup_notes}
                    onChange={(e) => setProductForm({ ...productForm, pickup_notes: e.target.value })}
                  />
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem', marginTop: '1.5rem' }}>
              <button className="btn-ghost" type="button" onClick={() => setIsAddProductModalOpen(false)}>
                Cancel
              </button>
              <button className="btn" type="button" disabled={busy} onClick={addProduct}>
                {busy ? 'Saving…' : 'List Product'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════ MODAL 2: NEW HANDOVER ENTRY ════════════ */}
      {isNewHandoverModalOpen && (
        <div className="modal-overlay" onClick={() => setIsNewHandoverModalOpen(false)}>
          <div className="modal-card" style={{ maxWidth: 540 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>+ Add Pick-up Entry / Buyer</h3>
              <button className="modal-close" onClick={() => setIsNewHandoverModalOpen(false)}><X size={18} /></button>
            </div>
            <p className="muted" style={{ fontSize: '0.85rem', marginTop: 0 }}>
              Add a customer claimant record for your existing stock in Pick-up cubes.
            </p>
            <div className="grid" style={{ gridTemplateColumns: '1fr', gap: '0.85rem' }}>
              <div className="field">
                <label>Select Pick-up Product *</label>
                <select
                  value={newHandoverForm.product_id}
                  onChange={(e) => setNewHandoverForm({ ...newHandoverForm, product_id: e.target.value })}
                >
                  <option value="">Select product…</option>
                  {pickupProducts.map((p) => (
                    <option key={p.product_id} value={p.product_id}>
                      {p.product_name} {p.variant ? `(${p.variant})` : ''} — {p.stock_quantity} in stock ({peso(p.price)})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid" style={{ gridTemplateColumns: '2fr 1fr', gap: '0.85rem' }}>
                <div className="field">
                  <label>Buyer / Customer Name *</label>
                  <input
                    placeholder="e.g. Juan dela Cruz"
                    value={newHandoverForm.buyer_name}
                    onChange={(e) => setNewHandoverForm({ ...newHandoverForm, buyer_name: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Quantity *</label>
                  <input
                    type="number"
                    min="1"
                    value={newHandoverForm.quantity}
                    onChange={(e) => setNewHandoverForm({ ...newHandoverForm, quantity: e.target.value })}
                  />
                </div>
              </div>
              <div className="field">
                <label>Authorized Alternate Claimant (Optional)</label>
                <input
                  placeholder="e.g. Maria Santos (relative / courier)"
                  value={newHandoverForm.authorized_pickup_name}
                  onChange={(e) => setNewHandoverForm({ ...newHandoverForm, authorized_pickup_name: e.target.value })}
                />
              </div>
              <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                <div className="field">
                  <label>Payment Status</label>
                  <select
                    value={newHandoverForm.payment_status}
                    onChange={(e) => setNewHandoverForm({ ...newHandoverForm, payment_status: e.target.value as 'Pending' | 'Paid' })}
                  >
                    <option value="Pending">Pending Payment (Collect at counter)</option>
                    <option value="Paid">Paid (Paid online to renter)</option>
                  </select>
                </div>
                <div className="field">
                  <label>Payment Method</label>
                  <select
                    value={newHandoverForm.payment_method}
                    onChange={(e) => setNewHandoverForm({ ...newHandoverForm, payment_method: e.target.value as 'Cash' | 'Online' })}
                  >
                    <option value="Cash">Cash</option>
                    <option value="Online">GCash / Maya / Online</option>
                  </select>
                </div>
              </div>
              <div className="field">
                <label>Payment Receipt Proof (if Paid)</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setNewHandoverReceiptFile(e.target.files?.[0] || null)}
                />
              </div>
              <div className="field">
                <label>Notes / Claimant Instructions</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Reference code, claimant will show ID"
                  value={newHandoverForm.notes}
                  onChange={(e) => setNewHandoverForm({ ...newHandoverForm, notes: e.target.value })}
                />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.25rem' }}>
              <button className="btn-ghost" type="button" onClick={() => setIsNewHandoverModalOpen(false)}>Cancel</button>
              <button className="btn" type="button" disabled={busy} onClick={addNewHandover}>
                {busy ? 'Saving…' : 'Save Pick-up Entry'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════ MODAL 3: EDIT HANDOVER ENTRY ════════════ */}
      {editingTx && (
        <div className="modal-overlay" onClick={() => setEditingTx(null)}>
          <div className="modal-card" style={{ maxWidth: 540 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Edit Pick-up Entry: {editingTx.products?.product_name || editingTx.product_name}</h3>
              <button className="modal-close" onClick={() => setEditingTx(null)}><X size={18} /></button>
            </div>
            <p className="muted" style={{ fontSize: '0.85rem', marginTop: 0 }}>
              Update customer, authorized claimant, or payment details for this item.
            </p>
            <div className="grid" style={{ gridTemplateColumns: '1fr', gap: '0.85rem' }}>
              <div className="field">
                <label>Buyer / Customer Name *</label>
                <input
                  placeholder="e.g. Juan dela Cruz"
                  value={editTxForm.buyer_name}
                  onChange={(e) => setEditTxForm({ ...editTxForm, buyer_name: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Authorized Alternate Claimant</label>
                <input
                  placeholder="e.g. Maria Santos (relative / courier)"
                  value={editTxForm.authorized_pickup_name}
                  onChange={(e) => setEditTxForm({ ...editTxForm, authorized_pickup_name: e.target.value })}
                />
              </div>
              <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                <div className="field">
                  <label>Payment Status</label>
                  <select
                    value={editTxForm.payment_status}
                    onChange={(e) => setEditTxForm({ ...editTxForm, payment_status: e.target.value as 'Pending' | 'Paid' })}
                  >
                    <option value="Pending">Pending Payment (Collect at counter)</option>
                    <option value="Paid">Paid (Paid online to renter)</option>
                  </select>
                </div>
                <div className="field">
                  <label>Payment Method</label>
                  <select
                    value={editTxForm.payment_method}
                    onChange={(e) => setEditTxForm({ ...editTxForm, payment_method: e.target.value as 'Cash' | 'Online' })}
                  >
                    <option value="Cash">Cash</option>
                    <option value="Online">GCash / Maya / Online</option>
                  </select>
                </div>
              </div>
              <div className="field">
                <label>Update Receipt Proof (Optional)</label>
                {editingTx.receipt_image_url && (
                  <div style={{ marginBottom: 6 }}>
                    <img
                      src={editingTx.receipt_image_url}
                      alt="Current receipt"
                      style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 4, border: '1px solid #ddd' }}
                    />
                    <span className="muted" style={{ fontSize: '0.75rem', marginLeft: 8 }}>Current receipt uploaded</span>
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setEditTxReceiptFile(e.target.files?.[0] || null)}
                />
              </div>
              <div className="field">
                <label>Notes / Claimant Instructions</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Reference code, note on claimant"
                  value={editTxForm.notes}
                  onChange={(e) => setEditTxForm({ ...editTxForm, notes: e.target.value })}
                />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.25rem' }}>
              <button className="btn-ghost" type="button" onClick={() => setEditingTx(null)}>Cancel</button>
              <button className="btn" type="button" disabled={busy} onClick={updateHandover}>
                {busy ? 'Saving…' : 'Update Handover Info'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════ MODAL 4: RECEIPT PROOF ZOOM ════════════ */}
      {previewReceipt && (
        <div className="modal-overlay" onClick={() => setPreviewReceipt(null)}>
          <div className="modal-card" style={{ maxWidth: 580, textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Receipt Proof</h3>
              <button className="modal-close" onClick={() => setPreviewReceipt(null)}><X size={18} /></button>
            </div>
            <img
              src={previewReceipt}
              alt="Receipt proof"
              style={{ maxWidth: '100%', maxHeight: '75vh', objectFit: 'contain', marginTop: 12, borderRadius: 8 }}
            />
          </div>
        </div>
      )}

      {/* ════════════ MODAL 5: PRODUCT GALLERY MODAL ════════════ */}
      <ProductGalleryModal
        product={galleryProduct}
        isOpen={Boolean(galleryProduct)}
        onClose={() => setGalleryProduct(null)}
        userRole="Renter"
      />
    </section>
  )
}
