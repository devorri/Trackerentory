import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Store,
  Package,
  KeyRound,
  X,
  Plus,
  Search,
  BarChart3,
  FileText,
  CalendarCheck,
  RotateCcw,
  Trash2,
} from 'lucide-react'
import ProductGalleryModal from '../components/ProductGalleryModal'
import ConfirmModal from '../components/ConfirmModal'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/Auth'
import {
  addMonths,
  daysUntil,
  peso,
  todayISO,
  isReservationExpired,
  parseReservationExpiry,
  type Contract,
  type Cube,
  type Product,
  type Transaction,
  type Reservation,
  type ContractExtension,
  DEFAULT_PRODUCT_CATEGORIES,
  DEFAULT_CONTRACT_TERMS,
} from '../lib/types'
import { expireContracts, cancelExpiredReservations } from '../lib/maintenance'
import { uploadPublicImage } from '../lib/storage'
import { BUCKET_DOCUMENTS, BUCKET_PRODUCT_IMAGES } from '../lib/supabase'
import { SkeletonTable } from '../components/Skeleton'

type RenterSection =
  | 'add-product'
  | 'product-reservations'
  | 'pickup-tracking'
  | 'my-cube-contract'
  | 'product-management'
  | 'income'

export default function RenterDashboard() {
  const { user, signOut } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  const [cubes, setCubes] = useState<Cube[]>([])
  const [contracts, setContracts] = useState<Contract[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [extensionRequests, setExtensionRequests] = useState<ContractExtension[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false)

  // Active section (synced with URL ?section=)
  const paramSection = searchParams.get('section') as RenterSection | null
  const [activeSection, setActiveSection] = useState<RenterSection>(() => {
    const valid: RenterSection[] = [
      'add-product',
      'product-reservations',
      'pickup-tracking',
      'my-cube-contract',
      'product-management',
      'income',
    ]
    if (paramSection && valid.includes(paramSection)) return paramSection
    return 'add-product'
  })

  function handleSectionChange(sec: RenterSection) {
    setActiveSection(sec)
    setSearchParams({ section: sec })
  }

  // ════════════ MODALS STATE ════════════
  const [previewReceipt, setPreviewReceipt] = useState<string | null>(null)
  const [galleryProduct, setGalleryProduct] = useState<Product | null>(null)
  const [viewingContract, setViewingContract] = useState<Contract | null>(null)
  const [extendingContract, setExtendingContract] = useState<Contract | null>(null)
  const [extensionMonths, setExtensionMonths] = useState<number>(1)
  const [extensionNotes, setExtensionNotes] = useState<string>('')
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [editingPickupTransaction, setEditingPickupTransaction] = useState<Transaction | null>(null)
  const [editPickupForm, setEditPickupForm] = useState({
    product_name: '',
    product_info: '',
    price: '',
    buyer_name: '',
    authorized_alternate: '',
    notes: '',
  })
  const [contractTab, setContractTab] = useState<'active' | 'extension' | 'expired'>('active')

  // ════════════ ADD PRODUCT DUAL FORM (Image 2) ════════════
  const [addProductType, setAddProductType] = useState<'display' | 'pickup'>('display')
  const [displayForm, setDisplayForm] = useState({
    product_name: '',
    price: '',
    quantity: '1',
    variant: '',
    category: '',
    description: '',
    cube_id: '',
  })
  const [displayImages, setDisplayImages] = useState<File[]>([])
  const [displayImagePreviews, setDisplayImagePreviews] = useState<string[]>([])

  const [pickupForm, setPickupForm] = useState({
    product: '',
    product_info: '',
    price: '',
    buyer_name: '',
    authorized_alternate: '',
    payment_status: 'Pending' as 'Pending' | 'Paid',
    payment_method: 'Cash' as 'Cash' | 'Online',
    cube_id: '',
    notes: '',
  })
  const [pickupReceiptFile, setPickupReceiptFile] = useState<File | null>(null)
  const [pickupReceiptPreview, setPickupReceiptPreview] = useState<string | null>(null)

  // Edit Product Modal Form
  const [editProductForm, setEditProductForm] = useState({
    product_name: '',
    description: '',
    price: '',
    stock_quantity: '1',
    variant: '',
    category: '',
    cube_id: '',
  })

  // ════════════ SUB-FILTERS & SEARCH ════════════
  const [reservationStatusFilter, setReservationStatusFilter] = useState<'All' | 'Pending' | 'Confirmed' | 'Cancelled' | 'Expired'>('All')
  const [reservationSearch, setReservationSearch] = useState('')
  const [pickupSearch, setPickupSearch] = useState('')
  const [pickupStatusFilter, setPickupStatusFilter] = useState<'All' | 'Waiting' | 'Picked-up'>('All')

  const [pmTab, setPmTab] = useState<'active' | 'trash'>('active')
  const [pmSearch, setPmSearch] = useState('')
  const [pmCategory, setPmCategory] = useState('All')

  // ════════════ DATA LOADING ════════════
  async function load(silent = false) {
    if (!user) return
    if (!silent) setLoading(true)
    if (!silent) {
      await expireContracts()
      await cancelExpiredReservations()
    }

    const [cRes, conRes, pRes, tRes, rRes, extRes] = await Promise.all([
      supabase.from('cubes').select('*').order('cube_number'),
      supabase.from('contracts').select('*, cubes(*)').eq('renter_id', user.user_id).order('end_date'),
      supabase.from('products').select('*, cubes(cube_number, type)').eq('renter_id', user.user_id),
      supabase
        .from('transactions')
        .select('*, products(*, cubes(cube_number, type)), cubes(cube_number, type), users!processed_by(full_name, role)')
        .order('updated_at', { ascending: false }),
      supabase
        .from('reservations')
        .select('*, products(*, cubes(*)), cubes(*), customer:users!customer_id(full_name, email, phone_number)')
        .order('expiry_time', { ascending: false }),
      supabase
        .from('contract_extensions')
        .select('*, contracts(*, cubes(*)), cubes(*)')
        .eq('renter_id', user.user_id)
        .order('created_at', { ascending: false }),
    ])

    if (!silent) setLoading(false)
    if (!cRes.error) setCubes((cRes.data || []) as Cube[])
    if (!conRes.error) setContracts((conRes.data || []) as Contract[])
    if (!pRes.error) setProducts((pRes.data || []) as Product[])
    if (!extRes.error && extRes.data) setExtensionRequests(extRes.data as ContractExtension[])

    if (!tRes.error) {
      const myProds = (pRes.data || []) as Product[]
      const myProdIds = new Set(myProds.map((p) => p.product_id))
      const renterTx = ((tRes.data || []) as Transaction[]).filter(
        (t) => (t.product_id && myProdIds.has(t.product_id)) || t.renter_id === user.user_id,
      )
      setTransactions(renterTx)
    }

    if (!rRes.error) {
      const myProds = (pRes.data || []) as Product[]
      const myProdIds = new Set(myProds.map((p) => p.product_id))
      const renterRes = ((rRes.data || []) as Reservation[]).filter(
        (r) => r.product_id && myProdIds.has(r.product_id),
      )
      setReservations(renterRes)
    }
  }

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(true), 15000)
    return () => window.clearInterval(timer)
  }, [user])

  // Renter's assigned active / pending cubes
  const myActiveCubes = useMemo(() => {
    const activeCubeIds = new Set(
      contracts
        .filter((c) => c.status === 'Active' || c.status === 'Pending')
        .map((c) => c.cube_id)
        .filter(Boolean),
    )
    return cubes.filter((c) => activeCubeIds.has(c.cube_id))
  }, [contracts, cubes])

  const myDisplayCubes = useMemo(() => myActiveCubes.filter((c) => c.type === 'Display'), [myActiveCubes])
  const myPickupCubes = useMemo(() => myActiveCubes.filter((c) => c.type === 'Pick-up'), [myActiveCubes])

  // Set default cube_id for forms
  useEffect(() => {
    if (!displayForm.cube_id && myDisplayCubes.length > 0) {
      setDisplayForm((prev) => ({ ...prev, cube_id: String(myDisplayCubes[0].cube_id) }))
    }
    if (!pickupForm.cube_id && myPickupCubes.length > 0) {
      setPickupForm((prev) => ({ ...prev, cube_id: String(myPickupCubes[0].cube_id) }))
    }
  }, [myDisplayCubes, myPickupCubes])

  // Active vs Trash products
  const activeProducts = useMemo(() => products.filter((p) => !p.deleted_at), [products])
  const trashProducts = useMemo(() => products.filter((p) => Boolean(p.deleted_at)), [products])

  const existingCategories = useMemo(() => {
    return Array.from(new Set(products.map((p) => p.category?.trim()).filter(Boolean) as string[])).sort()
  }, [products])

  const categorizedContracts = useMemo(() => {
    const activeList: Contract[] = []
    const extensionList: Contract[] = []
    const expiredList: Contract[] = []

    contracts.forEach((c) => {
      const daysLeft = daysUntil(c.end_date)
      const hasPendingExtension = extensionRequests.some(
        (ext) => ext.contract_id === c.contract_id && ext.status === 'Pending',
      )

      if (c.status === 'Active' && daysLeft >= 0) {
        activeList.push(c)
      } else if ((daysLeft < 0 && daysLeft >= -3) || (hasPendingExtension && c.status !== 'Active')) {
        extensionList.push(c)
      } else {
        expiredList.push(c)
      }
    })

    return { activeList, extensionList, expiredList }
  }, [contracts, extensionRequests])

  // ════════════ ADD PRODUCT HANDLERS ════════════
  function handleDisplayPhotoFiles(files: FileList | null) {
    const list = Array.from(files || [])
    setDisplayImages(list)
    const previews = list.map((file) => URL.createObjectURL(file))
    setDisplayImagePreviews(previews)
  }

  async function handleAddDisplayProduct(e: React.FormEvent) {
    e.preventDefault()
    if (!displayForm.product_name.trim() || !displayForm.price || !displayForm.cube_id) {
      return alert('Product Name, Price, and Assigned Cube are required.')
    }
    setBusy(true)

    let imageUrls: string[] = []
    if (displayImages.length > 0) {
      const uploads = await Promise.all(
        displayImages.map((f) => uploadPublicImage(BUCKET_PRODUCT_IMAGES, f, String(user!.user_id))),
      )
      const err = uploads.find((u) => u.error || !u.url)
      if (err) {
        setBusy(false)
        return alert('Failed uploading photos: ' + (err.error || 'unknown error'))
      }
      imageUrls = uploads.map((u) => u.url!)
    }

    const { error } = await supabase.from('products').insert([
      {
        renter_id: user!.user_id,
        cube_id: Number(displayForm.cube_id),
        product_name: displayForm.product_name.trim(),
        price: Number(displayForm.price),
        stock_quantity: Math.max(1, Number(displayForm.quantity) || 1),
        variant: displayForm.variant.trim() || null,
        category: displayForm.category.trim() || null,
        description: displayForm.description.trim() || null,
        image_url: imageUrls[0] || null,
        image_urls: imageUrls,
      },
    ])

    setBusy(false)
    if (error) return alert('Failed adding display product: ' + error.message)

    alert('Product added for display successfully!')
    setDisplayForm({
      product_name: '',
      price: '',
      quantity: '1',
      variant: '',
      category: '',
      description: '',
      cube_id: myDisplayCubes[0] ? String(myDisplayCubes[0].cube_id) : '',
    })
    setDisplayImages([])
    setDisplayImagePreviews([])
    void load()
    handleSectionChange('product-management')
  }

  async function handleAddPickupProduct(e: React.FormEvent) {
    e.preventDefault()
    if (!pickupForm.product.trim() || !pickupForm.price || !pickupForm.buyer_name.trim() || !pickupForm.cube_id) {
      return alert('Product Name, Price, Buyer Name, and Assigned Cube are required.')
    }
    setBusy(true)

    let receiptUrl: string | null = null
    if (pickupReceiptFile) {
      const up = await uploadPublicImage(BUCKET_DOCUMENTS, pickupReceiptFile, 'receipts')
      if (up.url) receiptUrl = up.url
    }

    // 1. Create product row
    const { data: prodData, error: prodErr } = await supabase
      .from('products')
      .insert([
        {
          renter_id: user!.user_id,
          cube_id: Number(pickupForm.cube_id),
          product_name: pickupForm.product.trim(),
          description: pickupForm.product_info.trim() || null,
          price: Number(pickupForm.price),
          stock_quantity: 1,
        },
      ])
      .select('product_id')
      .single()

    if (prodErr || !prodData) {
      setBusy(false)
      return alert('Failed creating pick-up item: ' + (prodErr?.message || 'unknown error'))
    }

    // 2. Create handover tracking record
    const { error: txErr } = await supabase.from('transactions').insert([
      {
        product_id: prodData.product_id,
        product_name: pickupForm.product.trim(),
        cube_id: Number(pickupForm.cube_id),
        renter_id: user!.user_id,
        buyer_name: pickupForm.buyer_name.trim(),
        authorized_pickup_name: pickupForm.authorized_alternate.trim() || null,
        payment_status: pickupForm.payment_status,
        payment_method: pickupForm.payment_method,
        pickup_status: 'Waiting',
        quantity: 1,
        notes: pickupForm.notes.trim() || null,
        receipt_image_url: receiptUrl,
        processed_by: null,
        transaction_date: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ])

    setBusy(false)
    if (txErr) return alert('Failed creating pick-up tracking record: ' + txErr.message)

    alert('Product added for pick-up and registered in Pick-up Tracking!')
    setPickupForm({
      product: '',
      product_info: '',
      price: '',
      buyer_name: '',
      authorized_alternate: '',
      payment_status: 'Pending',
      payment_method: 'Cash',
      cube_id: myPickupCubes[0] ? String(myPickupCubes[0].cube_id) : '',
      notes: '',
    })
    setPickupReceiptFile(null)
    setPickupReceiptPreview(null)
    void load()
    handleSectionChange('pickup-tracking')
  }

  async function saveEditedPickupTransaction() {
    if (!editingPickupTransaction) return
    if (!editPickupForm.product_name.trim() || !editPickupForm.buyer_name.trim()) {
      return alert('Product name and buyer name are required.')
    }
    setBusy(true)
    const { error: txErr } = await supabase
      .from('transactions')
      .update({
        product_name: editPickupForm.product_name.trim(),
        buyer_name: editPickupForm.buyer_name.trim(),
        authorized_pickup_name: editPickupForm.authorized_alternate.trim() || null,
        notes: editPickupForm.notes.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('transaction_id', editingPickupTransaction.transaction_id)

    if (editingPickupTransaction.product_id) {
      await supabase
        .from('products')
        .update({
          product_name: editPickupForm.product_name.trim(),
          description: editPickupForm.product_info.trim() || null,
          price: Number(editPickupForm.price) || 0,
        })
        .eq('product_id', editingPickupTransaction.product_id)
    }

    setBusy(false)
    if (txErr) return alert('Failed updating parcel: ' + txErr.message)
    setEditingPickupTransaction(null)
    void load()
  }

  // ════════════ EXTENSION REQUEST (Only when expired) ════════════
  async function submitExtensionRequest() {
    if (!extendingContract) return
    setBusy(true)
    try {
      const { error } = await supabase.from('contract_extensions').insert([
        {
          contract_id: extendingContract.contract_id,
          renter_id: user!.user_id,
          cube_id: extendingContract.cube_id,
          requested_months: extensionMonths,
          notes: extensionNotes.trim() || null,
          status: 'Pending',
        },
      ])

      if (error) {
        // Fallback: create pending contract row
        console.warn('Fallback to pending contract row:', error.message)
        const start = extendingContract.end_date > todayISO() ? extendingContract.end_date : todayISO()
        await supabase.from('contracts').insert([
          {
            renter_id: user!.user_id,
            cube_id: extendingContract.cube_id,
            start_date: start,
            end_date: addMonths(start, extensionMonths),
            status: 'Pending',
            contract_text: `Extension request: +${extensionMonths} month(s). Notes: ${extensionNotes}`,
          },
        ])
      }
      setBusy(false)
      alert('Extension request submitted! The store owner will review and create your new contract.')
      setExtendingContract(null)
      setExtensionNotes('')
      void load()
    } catch (err) {
      setBusy(false)
      console.error(err)
      alert('Failed submitting extension request.')
    }
  }

  // ════════════ PRODUCT MANAGEMENT ACTIONS ════════════
  async function saveEditedProduct() {
    if (!editingProduct) return
    setBusy(true)
    const { error } = await supabase
      .from('products')
      .update({
        product_name: editProductForm.product_name.trim(),
        description: editProductForm.description.trim() || null,
        price: Number(editProductForm.price),
        stock_quantity: Number(editProductForm.stock_quantity || 1),
        variant: editProductForm.variant.trim() || null,
        category: editProductForm.category.trim() || null,
        cube_id: Number(editProductForm.cube_id) || editingProduct.cube_id,
      })
      .eq('product_id', editingProduct.product_id)

    setBusy(false)
    if (error) return alert(error.message)
    setEditingProduct(null)
    void load()
  }

  async function softDeleteProduct(productId: number) {
    if (!window.confirm('Move this product to Trash? You can restore it anytime.')) return
    setBusy(true)
    const { error } = await supabase
      .from('products')
      .update({ deleted_at: new Date().toISOString() })
      .eq('product_id', productId)
    setBusy(false)
    if (error) return alert(error.message)
    void load()
  }

  async function restoreProduct(productId: number) {
    setBusy(true)
    const { error } = await supabase.from('products').update({ deleted_at: null }).eq('product_id', productId)
    setBusy(false)
    if (error) return alert(error.message)
    void load()
  }

  async function permanentDeleteProduct(productId: number) {
    if (!window.confirm('Permanently delete this product? This action cannot be undone.')) return
    setBusy(true)
    const { error } = await supabase.from('products').delete().eq('product_id', productId)
    setBusy(false)
    if (error) return alert(error.message)
    void load()
  }

  // ════════════ INCOME TOTALS ════════════
  const completedSales = useMemo(() => {
    return transactions.filter((t) => t.payment_status === 'Paid')
  }, [transactions])

  const totalEarned = useMemo(() => {
    return completedSales.reduce((sum, t) => sum + Number(t.products?.price || 0) * Number(t.quantity || 1), 0)
  }, [completedSales])

  const pendingProductResCount = useMemo(() => {
    return reservations.filter((r) => r.status === 'Pending' && !isReservationExpired(r)).length
  }, [reservations])

  const waitingPickupsCount = useMemo(() => {
    return transactions.filter(
      (t) => (t.products?.cubes?.type === 'Pick-up' || t.cubes?.type === 'Pick-up') && t.pickup_status === 'Waiting',
    ).length
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

  return (
    <div className="renter-shell">
      {/* ════════════ SIDE PANEL (Image 3) ════════════ */}
      <aside className="renter-sidebar no-print">
        <div className="renter-sidebar-header">
          <h3>TrackErentory</h3>
          <span>Renter Workspace</span>
          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#111827', marginTop: 4 }}>
            {user.full_name}
          </div>
        </div>

        <nav className="renter-nav-list">
          <button
            type="button"
            className={`renter-nav-btn ${activeSection === 'add-product' ? 'active' : ''}`}
            onClick={() => handleSectionChange('add-product')}
          >
            <Plus size={18} />
            <span>Add Product</span>
          </button>

          <button
            type="button"
            className={`renter-nav-btn ${activeSection === 'product-reservations' ? 'active' : ''}`}
            onClick={() => handleSectionChange('product-reservations')}
          >
            <CalendarCheck size={18} />
            <span style={{ flex: 1 }}>Product Reservations</span>
            {pendingProductResCount > 0 && (
              <span className="badge warn" style={{ fontSize: '0.68rem', padding: '0.1rem 0.45rem' }}>
                {pendingProductResCount}
              </span>
            )}
          </button>

          <button
            type="button"
            className={`renter-nav-btn ${activeSection === 'pickup-tracking' ? 'active' : ''}`}
            onClick={() => handleSectionChange('pickup-tracking')}
          >
            <Package size={18} />
            <span style={{ flex: 1 }}>Pick-up Tracking</span>
            {waitingPickupsCount > 0 && (
              <span className="badge info" style={{ fontSize: '0.68rem', padding: '0.1rem 0.45rem' }}>
                {waitingPickupsCount}
              </span>
            )}
          </button>

          <button
            type="button"
            className={`renter-nav-btn ${activeSection === 'my-cube-contract' ? 'active' : ''}`}
            onClick={() => handleSectionChange('my-cube-contract')}
          >
            <KeyRound size={18} />
            <span>My Cube and Contract</span>
          </button>

          <button
            type="button"
            className={`renter-nav-btn ${activeSection === 'product-management' ? 'active' : ''}`}
            onClick={() => handleSectionChange('product-management')}
          >
            <Store size={18} />
            <span>Product Management</span>
          </button>

          <button
            type="button"
            className={`renter-nav-btn ${activeSection === 'income' ? 'active' : ''}`}
            onClick={() => handleSectionChange('income')}
          >
            <BarChart3 size={18} />
            <span>Income</span>
          </button>
        </nav>

        <div style={{ marginTop: 'auto', paddingTop: '1.25rem', borderTop: '1px solid #e5e7eb' }}>
          <button
            type="button"
            className="btn-ghost"
            style={{ width: '100%', justifyContent: 'center', color: '#dc2626' }}
            onClick={() => setShowSignOutConfirm(true)}
          >
            Sign Out
          </button>
        </div>
      </aside>

      {/* ════════════ MAIN CONTENT AREA ════════════ */}
      <main className="renter-main">
        {/* ────────────────────────────────────────────────────────
            SECTION 1: ADD PRODUCT (Image 2)
           ──────────────────────────────────────────────────────── */}
        {activeSection === 'add-product' && (
          <div>
            <div className="page-header" style={{ marginBottom: '1.5rem' }}>
              <div>
                <h1>Add Product</h1>
                <p className="lede">
                  Add products to display inside your rented cubes, or log packages left at the store for customer pick-up.
                </p>
              </div>
            </div>

            {/* Sub-tabs for Add Product */}
            <div style={{ display: 'flex', gap: '0.65rem', marginBottom: '1.5rem', borderBottom: '2px solid #efefef', paddingBottom: '0.5rem' }}>
              <button
                type="button"
                className={addProductType === 'display' ? 'btn' : 'btn-ghost'}
                onClick={() => setAddProductType('display')}
              >
                Add Product for Display
              </button>
              <button
                type="button"
                className={addProductType === 'pickup' ? 'btn' : 'btn-ghost'}
                onClick={() => setAddProductType('pickup')}
              >
                Add Product for Pick-up
              </button>
            </div>

            {/* FORM A: ADD PRODUCT FOR DISPLAY (Image 2) */}
            {addProductType === 'display' && (
              <div className="panel" style={{ maxWidth: 720 }}>
                <h3 style={{ margin: '0 0 1rem' }}>Display Product Details</h3>
                {myDisplayCubes.length === 0 ? (
                  <div className="alert warn" style={{ marginBottom: '1.25rem' }}>
                    You currently have no active <strong>Display Cubes</strong>. You can reserve one in the{' '}
                    <Link to="/" style={{ fontWeight: 700, textDecoration: 'underline' }}>Catalogue</Link> or wait for owner approval.
                  </div>
                ) : null}

                <form onSubmit={handleAddDisplayProduct}>
                  <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                    <div className="field">
                      <label>Product Name *</label>
                      <input
                        placeholder="e.g. Glad2Glow Lip Serum"
                        value={displayForm.product_name}
                        onChange={(e) => setDisplayForm({ ...displayForm, product_name: e.target.value })}
                        required
                      />
                    </div>

                    <div className="field">
                      <label>Price (₱) *</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="120.00"
                        value={displayForm.price}
                        onChange={(e) => setDisplayForm({ ...displayForm, price: e.target.value })}
                        required
                      />
                    </div>

                    <div className="field">
                      <label>Quantity *</label>
                      <input
                        type="number"
                        min="1"
                        value={displayForm.quantity}
                        onChange={(e) => setDisplayForm({ ...displayForm, quantity: e.target.value })}
                        required
                      />
                    </div>

                    <div className="field">
                      <label>Variant / Shade</label>
                      <input
                        placeholder="e.g. Berry Pink, Shade 02, Large"
                        value={displayForm.variant}
                        onChange={(e) => setDisplayForm({ ...displayForm, variant: e.target.value })}
                      />
                    </div>

                    <div className="field">
                      <label>Category</label>
                      <input
                        list="display-categories"
                        placeholder="Select or enter category"
                        value={displayForm.category}
                        onChange={(e) => setDisplayForm({ ...displayForm, category: e.target.value })}
                      />
                      <datalist id="display-categories">
                        {DEFAULT_PRODUCT_CATEGORIES.map((cat) => (
                          <option key={cat} value={cat} />
                        ))}
                      </datalist>
                    </div>

                    <div className="field">
                      <label>Assigned Cube *</label>
                      <select
                        value={displayForm.cube_id}
                        onChange={(e) => setDisplayForm({ ...displayForm, cube_id: e.target.value })}
                        required
                      >
                        <option value="">Select your display cube…</option>
                        {myDisplayCubes.map((c) => (
                          <option key={c.cube_id} value={c.cube_id}>
                            Cube #{c.cube_number} ({peso(c.price_per_month)}/mo)
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="field" style={{ marginTop: '1rem' }}>
                    <label>Description</label>
                    <textarea
                      rows={3}
                      placeholder="Product benefits, ingredients, or notes for browsing customers…"
                      value={displayForm.description}
                      onChange={(e) => setDisplayForm({ ...displayForm, description: e.target.value })}
                    />
                  </div>

                  {/* Photo uploads */}
                  <div className="field" style={{ marginTop: '1rem' }}>
                    <label>Product Photos</label>
                    <input type="file" accept="image/*" multiple onChange={(e) => handleDisplayPhotoFiles(e.target.files)} />
                    {displayImagePreviews.length > 0 && (
                      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
                        {displayImagePreviews.map((src, i) => (
                          <img key={i} src={src} alt="Preview" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, border: '1px solid #cbd5e1' }} />
                        ))}
                      </div>
                    )}
                  </div>

                  <button className="btn" type="submit" disabled={busy || myDisplayCubes.length === 0} style={{ marginTop: '1.25rem' }}>
                    {busy ? 'Saving…' : 'Save Display Product'}
                  </button>
                </form>
              </div>
            )}

            {/* FORM B: ADD PRODUCT FOR PICKUP (Image 2) */}
            {addProductType === 'pickup' && (
              <div className="panel" style={{ maxWidth: 720 }}>
                <h3 style={{ margin: '0 0 1rem' }}>Pick-up Item Handover Details</h3>
                {myPickupCubes.length === 0 ? (
                  <div className="alert warn" style={{ marginBottom: '1.25rem' }}>
                    You currently have no active <strong>Pick-up Cubes</strong>. You can reserve one in the{' '}
                    <Link to="/?type=cube" style={{ fontWeight: 700, textDecoration: 'underline' }}>Catalogue</Link> or wait for owner approval.
                  </div>
                ) : null}

                <form onSubmit={handleAddPickupProduct}>
                  <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                    <div className="field">
                      <label>Product *</label>
                      <input
                        placeholder="e.g. Floral Summer Dress"
                        value={pickupForm.product}
                        onChange={(e) => setPickupForm({ ...pickupForm, product: e.target.value })}
                        required
                      />
                    </div>

                    <div className="field">
                      <label>Price (₱) *</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="450.00"
                        value={pickupForm.price}
                        onChange={(e) => setPickupForm({ ...pickupForm, price: e.target.value })}
                        required
                      />
                    </div>

                    <div className="field">
                      <label>Buyer Name *</label>
                      <input
                        placeholder="Name of customer claiming this item"
                        value={pickupForm.buyer_name}
                        onChange={(e) => setPickupForm({ ...pickupForm, buyer_name: e.target.value })}
                        required
                      />
                    </div>

                    <div className="field">
                      <label>Authorized Alternate</label>
                      <input
                        placeholder="Alternate person authorized to claim"
                        value={pickupForm.authorized_alternate}
                        onChange={(e) => setPickupForm({ ...pickupForm, authorized_alternate: e.target.value })}
                      />
                    </div>

                    <div className="field">
                      <label>Payment Status</label>
                      <select
                        value={pickupForm.payment_status}
                        onChange={(e) => setPickupForm({ ...pickupForm, payment_status: e.target.value as 'Pending' | 'Paid' })}
                      >
                        <option value="Pending">Pending (to be collected at counter)</option>
                        <option value="Paid">Paid (already paid online)</option>
                      </select>
                    </div>

                    <div className="field">
                      <label>Payment Method</label>
                      <select
                        value={pickupForm.payment_method}
                        onChange={(e) => setPickupForm({ ...pickupForm, payment_method: e.target.value as 'Cash' | 'Online' })}
                      >
                        <option value="Cash">Cash</option>
                        <option value="Online">Online / GCash / Transfer</option>
                      </select>
                    </div>

                    <div className="field">
                      <label>Cube # *</label>
                      <select
                        value={pickupForm.cube_id}
                        onChange={(e) => setPickupForm({ ...pickupForm, cube_id: e.target.value })}
                        required
                      >
                        <option value="">Select your pick-up cube…</option>
                        {myPickupCubes.map((c) => (
                          <option key={c.cube_id} value={c.cube_id}>
                            Cube #{c.cube_number} ({peso(c.price_per_month)}/mo)
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="field" style={{ marginTop: '1rem' }}>
                    <label>Product Info (Item details, size, shade)</label>
                    <textarea
                      rows={2}
                      placeholder="Size M, color beige, live stream item #4…"
                      value={pickupForm.product_info}
                      onChange={(e) => setPickupForm({ ...pickupForm, product_info: e.target.value })}
                    />
                  </div>

                  <div className="field" style={{ marginTop: '1rem' }}>
                    <label>Notes (e.g. handle with care, buyer phone, claim date)</label>
                    <textarea
                      rows={2}
                      placeholder="Additional notes for store staff at the counter…"
                      value={pickupForm.notes}
                      onChange={(e) => setPickupForm({ ...pickupForm, notes: e.target.value })}
                    />
                  </div>

                  {pickupForm.payment_method === 'Online' && (
                    <div className="field" style={{ marginTop: '1rem' }}>
                      <label>Receipt Proof (Online Payment)</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null
                          setPickupReceiptFile(file)
                          if (file) setPickupReceiptPreview(URL.createObjectURL(file))
                        }}
                      />
                      {pickupReceiptPreview && (
                        <div style={{ marginTop: '0.5rem' }}>
                          <img src={pickupReceiptPreview} alt="Receipt Preview" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: '1px solid #cbd5e1' }} />
                        </div>
                      )}
                    </div>
                  )}

                  <button className="btn" type="submit" disabled={busy || myPickupCubes.length === 0} style={{ marginTop: '1.25rem' }}>
                    {busy ? 'Submitting…' : 'Submit Pick-up Record'}
                  </button>
                </form>
              </div>
            )}
          </div>
        )}

        {/* ────────────────────────────────────────────────────────
            SECTION 2: PRODUCT RESERVATIONS (Image 3)
           ──────────────────────────────────────────────────────── */}
        {activeSection === 'product-reservations' && (
          <div>
            <div className="page-header">
              <div>
                <h1>Product Reservations</h1>
                <p className="lede">
                  Live tracking of customer reservations placed on your display items. Shows pending holds, confirmed sales, cancellations, and expirations.
                </p>
              </div>
            </div>

            {/* Filter toolbar */}
            <div style={{ display: 'flex', gap: '0.65rem', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {(['All', 'Pending', 'Confirmed', 'Cancelled', 'Expired'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    className={reservationStatusFilter === st ? 'btn' : 'btn-ghost'}
                    style={{ fontSize: '0.82rem', padding: '0.4rem 0.8rem' }}
                    onClick={() => setReservationStatusFilter(st)}
                  >
                    {st}
                  </button>
                ))}
              </div>

              <div style={{ position: 'relative', minWidth: 220 }}>
                <Search size={15} color="#94a3b8" style={{ position: 'absolute', left: 10, top: 11 }} />
                <input
                  type="text"
                  placeholder="Search reservation…"
                  value={reservationSearch}
                  onChange={(e) => setReservationSearch(e.target.value)}
                  style={{ paddingLeft: '2.1rem', margin: 0, height: 38, fontSize: '0.82rem' }}
                />
              </div>
            </div>

            {/* Reservations Table */}
            {loading ? (
              <SkeletonTable rows={5} cols={6} />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Variant</th>
                      <th>Customer / Buyer</th>
                      <th>Price</th>
                      <th>Validity / Expiry</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reservations
                      .filter((r) => {
                        const expired = isReservationExpired(r)
                        if (reservationStatusFilter === 'Pending') {
                          if (r.status !== 'Pending' || expired) return false
                        } else if (reservationStatusFilter === 'Confirmed') {
                          if (r.status !== 'Confirmed') return false
                        } else if (reservationStatusFilter === 'Cancelled') {
                          if (r.status !== 'Cancelled') return false
                        } else if (reservationStatusFilter === 'Expired') {
                          if (!expired && r.status !== 'Cancelled') return false
                        }
                        if (reservationSearch.trim()) {
                          const q = reservationSearch.toLowerCase()
                          const pName = r.products?.product_name?.toLowerCase() || ''
                          const cName = r.customer?.full_name?.toLowerCase() || ''
                          if (!pName.includes(q) && !cName.includes(q)) return false
                        }
                        return true
                      })
                      .map((r) => {
                        const expired = isReservationExpired(r)
                        const hoursLeft = Math.max(0, Math.ceil((parseReservationExpiry(r.expiry_time).getTime() - Date.now()) / (1000 * 60 * 60)))
                        return (
                          <tr key={r.reservation_id}>
                            <td>
                              <strong>{r.products?.product_name || 'Product'}</strong>
                              {r.products?.cubes && (
                                <div className="muted" style={{ fontSize: '0.78rem' }}>
                                  Cube #{r.products.cubes.cube_number}
                                </div>
                              )}
                            </td>
                            <td>{r.products?.variant || <span className="muted">—</span>}</td>
                            <td>
                              <strong>{r.customer?.full_name || 'Customer'}</strong>
                              {r.customer?.phone_number && (
                                <div className="muted" style={{ fontSize: '0.75rem' }}>{r.customer.phone_number}</div>
                              )}
                            </td>
                            <td>{peso(r.products?.price)}</td>
                            <td>
                              {r.status === 'Confirmed' ? (
                                <span className="badge ok">Claimed / Purchased</span>
                              ) : expired ? (
                                <span className="badge bad">Expired hold</span>
                              ) : (
                                <span className="badge warn">{hoursLeft} hour(s) left</span>
                              )}
                            </td>
                            <td>
                              <span
                                className={`status-pill ${
                                  r.status === 'Confirmed' ? 'confirmed' : expired || r.status === 'Cancelled' ? 'cancelled' : 'pending'
                                }`}
                              >
                                {expired ? 'Expired' : r.status}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
                {reservations.length === 0 && (
                  <div className="empty" style={{ padding: '2rem' }}>No customer reservations placed yet.</div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ────────────────────────────────────────────────────────
            SECTION 3: PICK-UP TRACKING (Image 3)
           ──────────────────────────────────────────────────────── */}
        {activeSection === 'pickup-tracking' && (
          <div>
            <div className="page-header">
              <div>
                <h1>Pick-up Tracking</h1>
                <p className="lede">
                  Status of products and customer packages handed over to the store for buyer counter pick-up.
                </p>
              </div>
              <button className="btn" type="button" onClick={() => handleSectionChange('add-product')}>
                + New Pick-up Parcel
              </button>
            </div>

            {/* Filter Toolbar */}
            <div style={{ display: 'flex', gap: '0.65rem', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {(['All', 'Waiting', 'Picked-up'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    className={pickupStatusFilter === st ? 'btn' : 'btn-ghost'}
                    style={{ fontSize: '0.82rem', padding: '0.4rem 0.8rem' }}
                    onClick={() => setPickupStatusFilter(st)}
                  >
                    {st === 'All' ? 'All Hand-overs' : st === 'Waiting' ? 'Waiting for Buyer' : 'Claimed / Picked Up'}
                  </button>
                ))}
              </div>

              <div style={{ position: 'relative', minWidth: 220 }}>
                <Search size={15} color="#94a3b8" style={{ position: 'absolute', left: 10, top: 11 }} />
                <input
                  type="text"
                  placeholder="Search buyer, item…"
                  value={pickupSearch}
                  onChange={(e) => setPickupSearch(e.target.value)}
                  style={{ paddingLeft: '2.1rem', margin: 0, height: 38, fontSize: '0.82rem' }}
                />
              </div>
            </div>

            {/* Table */}
            {loading ? (
              <SkeletonTable rows={5} cols={8} />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Buyer Name</th>
                      <th>Product</th>
                      <th>Product Info</th>
                      <th>Price</th>
                      <th>Authorized Alternate</th>
                      <th>Payment Status</th>
                      <th>Cube #</th>
                      <th>Notes</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions
                      .filter((t) => {
                        const isPickup = (t.products?.cubes?.type || t.cubes?.type) === 'Pick-up'
                        if (!isPickup) return false
                        if (pickupStatusFilter !== 'All' && t.pickup_status !== pickupStatusFilter) return false
                        if (pickupSearch.trim()) {
                          const q = pickupSearch.toLowerCase()
                          const bName = t.buyer_name?.toLowerCase() || ''
                          const pName = (t.products?.product_name || t.product_name || '').toLowerCase()
                          if (!bName.includes(q) && !pName.includes(q)) return false
                        }
                        return true
                      })
                      .map((t) => {
                        const prod = t.products
                        const cubeNum = prod?.cubes?.cube_number || t.cubes?.cube_number || '—'
                        return (
                          <tr key={t.transaction_id}>
                            <td><strong>{t.buyer_name || '—'}</strong></td>
                            <td><strong>{prod?.product_name || t.product_name || '—'}</strong></td>
                            <td>
                              <span style={{ fontSize: '0.82rem', color: '#444' }}>
                                {prod?.description || prod?.variant || '—'}
                              </span>
                            </td>
                            <td>{peso(prod?.price)}</td>
                            <td>{t.authorized_pickup_name || <span className="muted">—</span>}</td>
                            <td>
                              <span className={`status-pill ${t.payment_status === 'Paid' ? 'confirmed' : 'pending'}`}>
                                {t.payment_status}
                              </span>
                              {t.receipt_image_url && (
                                <div style={{ marginTop: 4 }}>
                                  <img
                                    src={t.receipt_image_url}
                                    alt="Receipt"
                                    style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 4, cursor: 'pointer', border: '1px solid #cbd5e1' }}
                                    onClick={() => setPreviewReceipt(t.receipt_image_url)}
                                    title="Click to view receipt"
                                  />
                                </div>
                              )}
                            </td>
                            <td><span className="badge info">{cubeNum}</span></td>
                            <td><span style={{ fontSize: '0.82rem', color: '#555' }}>{t.notes || '—'}</span></td>
                            <td>
                              {t.pickup_status === 'Picked-up' ? (
                                <span className="badge ok">Claimed</span>
                              ) : (
                                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                  <span className="badge warn">Waiting for Buyer</span>
                                  <button
                                    type="button"
                                    className="btn-ghost"
                                    style={{ padding: '0.2rem 0.5rem', fontSize: '0.72rem', border: '1px solid #cbd5e1' }}
                                    onClick={() => {
                                      setEditingPickupTransaction(t)
                                      setEditPickupForm({
                                        product_name: t.products?.product_name || t.product_name || '',
                                        product_info: t.products?.description || '',
                                        price: String(t.products?.price || 0),
                                        buyer_name: t.buyer_name || '',
                                        authorized_alternate: t.authorized_pickup_name || '',
                                        notes: t.notes || '',
                                      })
                                    }}
                                  >
                                    Edit
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
                {transactions.filter((t) => (t.products?.cubes?.type || t.cubes?.type) === 'Pick-up').length === 0 && (
                  <div className="empty" style={{ padding: '2rem' }}>No pick-up products logged yet.</div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ────────────────────────────────────────────────────────
            SECTION 4: MY CUBE AND CONTRACT (Image 3 & 4)
           ──────────────────────────────────────────────────────── */}
        {activeSection === 'my-cube-contract' && (
          <div>
            <div className="page-header">
              <div>
                <h1>My Cubes & Lease Contracts</h1>
                <p className="lede">
                  Overview of your rented cubes, terms agreed upon with the store owner, and contract renewal options.
                </p>
              </div>
            </div>

            {/* 3 TABS: Active, Extension, Expired (Item 18 & 19) */}
            <div style={{ display: 'flex', gap: '0.65rem', marginBottom: '1.25rem', borderBottom: '2px solid #efefef', paddingBottom: '0.5rem' }}>
              <button
                type="button"
                className={contractTab === 'active' ? 'btn' : 'btn-ghost'}
                onClick={() => setContractTab('active')}
              >
                Active Cubes ({categorizedContracts.activeList.length})
              </button>
              <button
                type="button"
                className={contractTab === 'extension' ? 'btn' : 'btn-ghost'}
                onClick={() => setContractTab('extension')}
              >
                Extension (Grace Period) ({categorizedContracts.extensionList.length})
              </button>
              <button
                type="button"
                className={contractTab === 'expired' ? 'btn' : 'btn-ghost'}
                onClick={() => setContractTab('expired')}
              >
                Expired & Released ({categorizedContracts.expiredList.length})
              </button>
            </div>

            {contracts.length === 0 ? (
              <div className="empty" style={{ padding: '2.5rem', textAlign: 'center' }}>
                <p>You do not have any registered cube rental contracts yet.</p>
                <Link to="/" className="btn" style={{ marginTop: '0.5rem' }}>Browse and Reserve a Cube</Link>
              </div>
            ) : (
              <div>
                {contractTab === 'extension' && categorizedContracts.extensionList.length > 0 && (
                  <div className="panel" style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: '0.85rem 1.25rem', marginBottom: '1.25rem' }}>
                    <strong style={{ color: '#92400e', fontSize: '0.9rem' }}>3-Day Grace Period for Contract Extension</strong>
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.82rem', color: '#78350f' }}>
                      Cubes in this tab are recently expired. You have a 3-day grace period to request an extension before the space is automatically cleared and released back to available status for other renters.
                    </p>
                  </div>
                )}

                {contractTab === 'expired' && categorizedContracts.expiredList.length > 0 && (
                  <div className="panel" style={{ background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 8, padding: '0.85rem 1.25rem', marginBottom: '1.25rem' }}>
                    <strong style={{ color: '#991b1b', fontSize: '0.9rem' }}>Expired & Space Released</strong>
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.82rem', color: '#7f1d1d' }}>
                      These lease contracts have exceeded the 3-day grace period without an approved renewal. The cube space has been marked Available in the store catalogue.
                    </p>
                  </div>
                )}

                {(() => {
                  const list = contractTab === 'active'
                    ? categorizedContracts.activeList
                    : contractTab === 'extension'
                    ? categorizedContracts.extensionList
                    : categorizedContracts.expiredList

                  if (list.length === 0) {
                    return (
                      <div className="empty" style={{ padding: '2.5rem', textAlign: 'center' }}>
                        No contracts in the {contractTab} tab.
                      </div>
                    )
                  }

                  return (
                    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
                      {list.map((c) => {
                        const daysLeft = daysUntil(c.end_date)
                        const isExpired = c.status === 'Expired' || daysLeft < 0
                        const hasPendingExtension = extensionRequests.some(
                          (ext) => ext.contract_id === c.contract_id && ext.status === 'Pending',
                        )

                        return (
                          <div
                            key={c.contract_id}
                            className="card"
                            style={{
                              padding: '1.5rem',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '0.85rem',
                              borderLeft: contractTab === 'expired' ? '4px solid #dc2626' : contractTab === 'extension' ? '4px solid #f59e0b' : '4px solid #16a34a',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <strong style={{ fontSize: '1.2rem' }}>Cube #{c.cubes?.cube_number || c.cube_id}</strong>
                              <span className={`status-pill ${c.status === 'Active' ? 'confirmed' : isExpired ? 'cancelled' : 'pending'}`}>
                                {isExpired ? (contractTab === 'expired' ? 'Released' : 'Grace Period') : c.status}
                              </span>
                            </div>

                            <div className="muted" style={{ fontSize: '0.88rem' }}>
                              Type: <strong>{c.cubes?.type}</strong> • Rate: <strong>{peso(c.cubes?.price_per_month)} / mo</strong>
                            </div>

                            {c.cubes?.location && (
                              <div className="muted" style={{ fontSize: '0.82rem' }}>
                                Location: {c.cubes.location}
                              </div>
                            )}

                            <div style={{ fontSize: '0.85rem', background: '#f8fafc', padding: '0.65rem 0.85rem', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                              <div><strong>Agreement #{c.contract_id}</strong></div>
                              <div className="muted" style={{ marginTop: 2 }}>
                                {c.start_date} → {c.end_date} ({daysLeft >= 0 ? `${daysLeft} day(s) left` : `${Math.abs(daysLeft)} day(s) expired`})
                              </div>
                            </div>

                            {/* Action buttons */}
                            <div style={{ display: 'flex', gap: '0.65rem', marginTop: 'auto', paddingTop: '0.75rem', borderTop: '1px solid #f0f0f0', alignItems: 'center', justifyContent: 'space-between' }}>
                              <button
                                type="button"
                                className="btn-ghost"
                                style={{ fontSize: '0.8rem', padding: '0.35rem 0.65rem' }}
                                onClick={() => setViewingContract(c)}
                              >
                                <FileText size={14} /> View Agreement
                              </button>

                              {contractTab === 'extension' ? (
                                hasPendingExtension ? (
                                  <span className="badge warn" style={{ fontSize: '0.75rem' }}>
                                    Extension Requested
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    className="btn"
                                    style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem', background: '#16a34a' }}
                                    onClick={() => {
                                      setExtendingContract(c)
                                      setExtensionMonths(1)
                                      setExtensionNotes('')
                                    }}
                                  >
                                    + Request Extension
                                  </button>
                                )
                              ) : contractTab === 'expired' ? (
                                <span className="badge bad" style={{ fontSize: '0.75rem' }}>
                                  Expired & Released
                                </span>
                              ) : (
                                <span className="badge ok" style={{ fontSize: '0.75rem' }}>
                                  {daysLeft} days active
                                </span>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}
              </div>
            )}
          </div>
        )}

        {/* ────────────────────────────────────────────────────────
            SECTION 5: PRODUCT MANAGEMENT (Image 3)
           ──────────────────────────────────────────────────────── */}
        {activeSection === 'product-management' && (
          <div>
            <div className="page-header">
              <div>
                <h1>Product Management</h1>
                <p className="lede">
                  Manage product details, prices, inventory levels, or restore deleted items from your trash folder.
                </p>
              </div>
              <button className="btn" type="button" onClick={() => handleSectionChange('add-product')}>
                + Add New Product
              </button>
            </div>

            {/* Active vs Trash tabs */}
            <div style={{ display: 'flex', gap: '0.65rem', marginBottom: '1.25rem', borderBottom: '2px solid #efefef', paddingBottom: '0.5rem' }}>
              <button
                type="button"
                className={pmTab === 'active' ? 'btn' : 'btn-ghost'}
                onClick={() => setPmTab('active')}
              >
                Active Products ({activeProducts.length})
              </button>
              <button
                type="button"
                className={pmTab === 'trash' ? 'btn' : 'btn-ghost'}
                onClick={() => setPmTab('trash')}
                style={{ color: pmTab === 'trash' ? '#fff' : '#b00020' }}
              >
                <Trash2 size={15} /> Trash ({trashProducts.length})
              </button>
            </div>

            {/* Search & Category toolbar */}
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flex: 1, minWidth: 240, maxWidth: 380 }}>
                <Search size={16} className="muted" />
                <input
                  type="text"
                  placeholder="Search product, category, or cube…"
                  value={pmSearch}
                  onChange={(e) => setPmSearch(e.target.value)}
                  style={{ margin: 0, padding: '0.5rem 0.85rem', fontSize: '0.85rem' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase' }}>Category:</label>
                <select
                  value={pmCategory}
                  onChange={(e) => setPmCategory(e.target.value)}
                  style={{ margin: 0, padding: '0.45rem 0.75rem', fontSize: '0.85rem' }}
                >
                  <option value="All">All Categories</option>
                  {existingCategories.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Products Table */}
            {loading ? (
              <SkeletonTable rows={5} cols={7} />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: 60 }}>Image</th>
                      <th>Product Name</th>
                      <th>Assigned Cube</th>
                      <th>Price</th>
                      <th>Stock</th>
                      <th>Category</th>
                      <th>Variant</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(pmTab === 'active' ? activeProducts : trashProducts)
                      .filter((p) => {
                        if (pmCategory !== 'All' && (p.category?.trim() || '') !== pmCategory) return false
                        if (pmSearch.trim()) {
                          const q = pmSearch.toLowerCase()
                          const name = p.product_name.toLowerCase()
                          const cat = (p.category || '').toLowerCase()
                          const cube = (p.cubes?.cube_number || '').toLowerCase()
                          if (!name.includes(q) && !cat.includes(q) && !cube.includes(q)) return false
                        }
                        return true
                      })
                      .map((p) => (
                        <tr key={p.product_id}>
                          <td style={{ cursor: 'pointer' }} onClick={() => setGalleryProduct(p)}>
                            {p.image_url ? (
                              <img src={p.image_url} alt={p.product_name} style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 4 }} />
                            ) : (
                              <div style={{ width: 44, height: 44, background: '#f0f0f0', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', color: '#888' }}>
                                No pic
                              </div>
                            )}
                          </td>
                          <td>
                            <strong>{p.product_name}</strong>
                            {p.description && <div className="muted" style={{ fontSize: '0.78rem' }}>{p.description}</div>}
                          </td>
                          <td>
                            {p.cubes ? <span className="badge info">{p.cubes.cube_number} ({p.cubes.type})</span> : '—'}
                          </td>
                          <td>{peso(p.price)}</td>
                          <td>
                            <span style={{ fontWeight: 700, color: p.stock_quantity > 0 ? '#16a34a' : '#dc2626' }}>
                              {p.stock_quantity}
                            </span>
                          </td>
                          <td>{p.category || '—'}</td>
                          <td>{p.variant || '—'}</td>
                          <td style={{ textAlign: 'right' }}>
                            {pmTab === 'active' ? (
                              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                <button
                                  type="button"
                                  className="btn-ghost"
                                  style={{ padding: '0.25rem 0.55rem', fontSize: '0.75rem' }}
                                  onClick={() => {
                                    setEditingProduct(p)
                                    setEditProductForm({
                                      product_name: p.product_name,
                                      description: p.description || '',
                                      price: String(p.price),
                                      stock_quantity: String(p.stock_quantity),
                                      variant: p.variant || '',
                                      category: p.category || '',
                                      cube_id: String(p.cube_id || ''),
                                    })
                                  }}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="btn-ghost"
                                  style={{ padding: '0.25rem 0.55rem', fontSize: '0.75rem', color: '#dc2626' }}
                                  onClick={() => void softDeleteProduct(p.product_id)}
                                >
                                  Trash
                                </button>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                <button
                                  type="button"
                                  className="btn"
                                  style={{ padding: '0.25rem 0.55rem', fontSize: '0.75rem', background: '#16a34a' }}
                                  onClick={() => void restoreProduct(p.product_id)}
                                >
                                  <RotateCcw size={12} /> Restore
                                </button>
                                <button
                                  type="button"
                                  className="btn-ghost"
                                  style={{ padding: '0.25rem 0.55rem', fontSize: '0.75rem', color: '#dc2626' }}
                                  onClick={() => void permanentDeleteProduct(p.product_id)}
                                >
                                  Delete
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ────────────────────────────────────────────────────────
            SECTION 6: INCOME (Image 3)
           ──────────────────────────────────────────────────────── */}
        {activeSection === 'income' && (
          <div>
            <div className="page-header">
              <div>
                <h1>Income & Sales Breakdown</h1>
                <p className="lede">
                  Summary of your completed orders and confirmed customer purchases. Confirmed reservations and paid transactions automatically calculate your total earnings.
                </p>
              </div>
            </div>

            {/* Metric KPI cards */}
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.75rem' }}>
              <div className="panel" style={{ padding: '1.25rem', borderLeft: '4px solid #16a34a' }}>
                <div className="muted" style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase' }}>
                  Total Completed Earnings
                </div>
                <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#16a34a', marginTop: '0.35rem' }}>
                  {peso(totalEarned)}
                </div>
              </div>

              <div className="panel" style={{ padding: '1.25rem', borderLeft: '4px solid #2563eb' }}>
                <div className="muted" style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase' }}>
                  Completed Orders
                </div>
                <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#2563eb', marginTop: '0.35rem' }}>
                  {completedSales.length}
                </div>
              </div>
            </div>

            {/* Completed Orders Table */}
            <h3 style={{ margin: '0 0 0.85rem' }}>Completed Order History</h3>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Product</th>
                    <th>Buyer Name</th>
                    <th>Qty</th>
                    <th>Unit Price</th>
                    <th>Total Earned</th>
                    <th>Payment Method</th>
                  </tr>
                </thead>
                <tbody>
                  {completedSales.map((t) => {
                    const price = Number(t.products?.price || 0)
                    const qty = Number(t.quantity || 1)
                    return (
                      <tr key={t.transaction_id}>
                        <td>{new Date(t.transaction_date).toLocaleDateString()}</td>
                        <td>
                          <strong>{t.products?.product_name || t.product_name || 'Product'}</strong>
                          {t.products?.variant && <div className="muted" style={{ fontSize: '0.78rem' }}>{t.products.variant}</div>}
                        </td>
                        <td>{t.buyer_name || '—'}</td>
                        <td>{qty}</td>
                        <td>{peso(price)}</td>
                        <td><strong>{peso(price * qty)}</strong></td>
                        <td>
                          <span className="badge ok">{t.payment_method || 'Cash'}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {completedSales.length === 0 && (
                <div className="empty" style={{ padding: '2rem' }}>No completed orders recorded yet.</div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ════════════ MODAL: REQUEST CUBE EXTENSION ════════════ */}
      {extendingContract && (
        <div className="modal-overlay" onClick={() => setExtendingContract(null)}>
          <div className="modal-card" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Request Cube Extension</h3>
              <button className="modal-close" onClick={() => setExtendingContract(null)}><X size={18} /></button>
            </div>
            <p className="muted" style={{ fontSize: '0.88rem', margin: '0 0 1rem' }}>
              Your contract for <strong>Cube #{extendingContract.cubes?.cube_number || extendingContract.cube_id}</strong> has expired. Submit an extension request to the store owner to renew your lease agreement.
            </p>

            <div className="field">
              <label>Extension Length</label>
              <select
                value={extensionMonths}
                onChange={(e) => setExtensionMonths(Number(e.target.value))}
              >
                <option value={1}>+1 Month Extension ({peso((extendingContract.cubes?.price_per_month || 0) * 1)})</option>
                <option value={2}>+2 Months Extension ({peso((extendingContract.cubes?.price_per_month || 0) * 2)})</option>
                <option value={3}>+3 Months Extension ({peso((extendingContract.cubes?.price_per_month || 0) * 3)})</option>
                <option value={6}>+6 Months Extension ({peso((extendingContract.cubes?.price_per_month || 0) * 6)})</option>
              </select>
            </div>

            <div className="field" style={{ marginTop: '0.85rem' }}>
              <label>Notes to Owner (Optional)</label>
              <textarea
                rows={3}
                placeholder="Message regarding your extension or payment arrangement…"
                value={extensionNotes}
                onChange={(e) => setExtensionNotes(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
              <button className="btn" type="button" disabled={busy} onClick={submitExtensionRequest} style={{ flex: 1 }}>
                {busy ? 'Submitting…' : 'Submit Extension Request'}
              </button>
              <button className="btn-ghost" type="button" onClick={() => setExtendingContract(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════ MODAL: VIEW CONTRACT AGREEMENT ════════════ */}
      {viewingContract && (
        <div className="modal-overlay" onClick={() => setViewingContract(null)}>
          <div className="modal-card" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Cube Lease Agreement #{viewingContract.contract_id}</h3>
              <button className="modal-close" onClick={() => setViewingContract(null)}><X size={18} /></button>
            </div>
            <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: 8, margin: '1rem 0' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.88rem' }}>
                <div><strong>Assigned Space:</strong> Cube #{viewingContract.cubes?.cube_number}</div>
                <div><strong>Type:</strong> {viewingContract.cubes?.type}</div>
                <div><strong>Monthly Rate:</strong> {peso(viewingContract.cubes?.price_per_month)}</div>
                <div><strong>Duration:</strong> {viewingContract.start_date} → {viewingContract.end_date}</div>
              </div>
            </div>
            <h4>Terms & Conditions</h4>
            <div style={{ maxHeight: 220, overflowY: 'auto', background: '#fff', border: '1px solid #e2e8f0', padding: '0.85rem', borderRadius: 8, fontSize: '0.82rem', whiteSpace: 'pre-wrap', color: '#444' }}>
              {viewingContract.contract_text || DEFAULT_CONTRACT_TERMS}
            </div>
            <div style={{ marginTop: '1.25rem', textAlign: 'right' }}>
              <button className="btn" type="button" onClick={() => setViewingContract(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════ MODAL: EDIT PRODUCT ════════════ */}
      {editingProduct && (
        <div className="modal-overlay" onClick={() => setEditingProduct(null)}>
          <div className="modal-card" style={{ maxWidth: 540 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Edit Product</h3>
              <button className="modal-close" onClick={() => setEditingProduct(null)}><X size={18} /></button>
            </div>
            <div className="field">
              <label>Product Name</label>
              <input
                value={editProductForm.product_name}
                onChange={(e) => setEditProductForm({ ...editProductForm, product_name: e.target.value })}
              />
            </div>
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.75rem' }}>
              <div className="field">
                <label>Price (₱)</label>
                <input
                  type="number"
                  step="0.01"
                  value={editProductForm.price}
                  onChange={(e) => setEditProductForm({ ...editProductForm, price: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Stock Quantity</label>
                <input
                  type="number"
                  value={editProductForm.stock_quantity}
                  onChange={(e) => setEditProductForm({ ...editProductForm, stock_quantity: e.target.value })}
                />
              </div>
            </div>
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.75rem' }}>
              <div className="field">
                <label>Variant / Shade</label>
                <input
                  value={editProductForm.variant}
                  onChange={(e) => setEditProductForm({ ...editProductForm, variant: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Category</label>
                <input
                  value={editProductForm.category}
                  onChange={(e) => setEditProductForm({ ...editProductForm, category: e.target.value })}
                />
              </div>
            </div>
            <div className="field" style={{ marginTop: '0.75rem' }}>
              <label>Description</label>
              <textarea
                rows={2}
                value={editProductForm.description}
                onChange={(e) => setEditProductForm({ ...editProductForm, description: e.target.value })}
              />
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
              <button className="btn" type="button" disabled={busy} onClick={saveEditedProduct} style={{ flex: 1 }}>
                {busy ? 'Saving…' : 'Save Changes'}
              </button>
              <button className="btn-ghost" type="button" onClick={() => setEditingProduct(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════ MODAL: EDIT PICK-UP PARCEL ════════════ */}
      {editingPickupTransaction && (
        <div className="modal-overlay" onClick={() => setEditingPickupTransaction(null)}>
          <div className="modal-card" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Edit Pick-up Parcel</h3>
              <button className="modal-close" onClick={() => setEditingPickupTransaction(null)}><X size={18} /></button>
            </div>
            <div className="field">
              <label>Product Name *</label>
              <input
                value={editPickupForm.product_name}
                onChange={(e) => setEditPickupForm({ ...editPickupForm, product_name: e.target.value })}
                placeholder="Product name"
              />
            </div>
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.75rem' }}>
              <div className="field">
                <label>Price (₱) *</label>
                <input
                  type="number"
                  step="0.01"
                  value={editPickupForm.price}
                  onChange={(e) => setEditPickupForm({ ...editPickupForm, price: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Buyer Name *</label>
                <input
                  value={editPickupForm.buyer_name}
                  onChange={(e) => setEditPickupForm({ ...editPickupForm, buyer_name: e.target.value })}
                  placeholder="Buyer name"
                />
              </div>
            </div>
            <div className="field" style={{ marginTop: '0.75rem' }}>
              <label>Authorized Alternate Claimant</label>
              <input
                value={editPickupForm.authorized_alternate}
                onChange={(e) => setEditPickupForm({ ...editPickupForm, authorized_alternate: e.target.value })}
                placeholder="Person authorized to claim (optional)"
              />
            </div>
            <div className="field" style={{ marginTop: '0.75rem' }}>
              <label>Product Info</label>
              <textarea
                rows={2}
                value={editPickupForm.product_info}
                onChange={(e) => setEditPickupForm({ ...editPickupForm, product_info: e.target.value })}
                placeholder="Size, shade, specifications…"
              />
            </div>
            <div className="field" style={{ marginTop: '0.75rem' }}>
              <label>Notes</label>
              <textarea
                rows={2}
                value={editPickupForm.notes}
                onChange={(e) => setEditPickupForm({ ...editPickupForm, notes: e.target.value })}
                placeholder="Special notes for counter staff…"
              />
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
              <button className="btn" type="button" disabled={busy} onClick={saveEditedPickupTransaction} style={{ flex: 1 }}>
                {busy ? 'Saving…' : 'Save Changes'}
              </button>
              <button className="btn-ghost" type="button" onClick={() => setEditingPickupTransaction(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════ RECEIPT ZOOM MODAL ════════════ */}
      {previewReceipt && (
        <div className="modal-overlay" onClick={() => setPreviewReceipt(null)}>
          <div className="modal-card" style={{ maxWidth: 600, textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Payment Proof</h3>
              <button className="modal-close" onClick={() => setPreviewReceipt(null)}><X size={18} /></button>
            </div>
            <img src={previewReceipt} alt="Receipt proof" style={{ maxWidth: '100%', maxHeight: '75vh', objectFit: 'contain', marginTop: 12 }} />
          </div>
        </div>
      )}

      {/* ════════════ GALLERY MODAL ════════════ */}
      {galleryProduct && (
        <ProductGalleryModal isOpen={Boolean(galleryProduct)} product={galleryProduct} onClose={() => setGalleryProduct(null)} />
      )}

      {/* ════════════ SIGN OUT CONFIRM MODAL ════════════ */}
      <ConfirmModal
        isOpen={showSignOutConfirm}
        title="Sign Out"
        message="Are you sure you want to sign out of your Renter account?"
        confirmText="Sign Out"
        cancelText="Stay Signed In"
        isDanger={true}
        onConfirm={() => {
          setShowSignOutConfirm(false)
          signOut()
        }}
        onCancel={() => setShowSignOutConfirm(false)}
      />
    </div>
  )
}
