import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, ChevronLeft, ChevronRight, Store, ArrowRight, Check } from 'lucide-react'
import { peso, type Product } from '../lib/types'

type Props = {
  product: Product | null
  isOpen: boolean
  onClose: () => void
  userRole?: string
  isReserved?: boolean
  availableCount?: number
  onReserve?: (productId: number, hours: number) => void
  onSignIn?: () => void
}

export default function ProductGalleryModal({
  product,
  isOpen,
  onClose,
  userRole,
  isReserved = false,
  availableCount,
  onReserve,
  onSignIn,
}: Props) {
  const [activeIdx, setActiveIdx] = useState(0)
  const [hours, setHours] = useState(2)
  const [isReserving, setIsReserving] = useState(false)
  const modalRef = useRef<HTMLDivElement>(null)

  // Focus modal card whenever opened
  useEffect(() => {
    if (isOpen) {
      modalRef.current?.focus()
    }
  }, [isOpen])

  // Reset active image when product changes
  useEffect(() => {
    setActiveIdx(0)
    setIsReserving(false)
  }, [product])

  // Keyboard navigation (Arrow keys + Escape)
  useEffect(() => {
    if (!isOpen || !product) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      const images = getImages(product)
      if (images.length > 1) {
        if (e.key === 'ArrowLeft') {
          setActiveIdx((prev) => (prev - 1 + images.length) % images.length)
        } else if (e.key === 'ArrowRight') {
          setActiveIdx((prev) => (prev + 1) % images.length)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, product, onClose])

  if (!isOpen || !product) return null

  function getImages(p: Product): string[] {
    const list: string[] = []
    if (p.image_urls && p.image_urls.length > 0) {
      list.push(...p.image_urls.filter(Boolean))
    }
    if (list.length === 0 && p.image_url) {
      list.push(p.image_url)
    }
    return list
  }

  const images = getImages(product)
  const count = availableCount ?? product.stock_quantity ?? 0
  const isSoldOut = isReserved || count <= 0

  return createPortal(
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100dvh',
        zIndex: 100000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        overflowY: 'auto',
        background: 'rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        className="modal-card product-gallery-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 880,
          width: '95vw',
          maxHeight: '92vh',
          padding: '1.75rem',
          borderRadius: 24,
          background: '#ffffff',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.28)',
          border: '1px solid #e5e7eb',
          margin: 'auto',
          outline: 'none',
        }}
      >
        {/* Header Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span className="badge" style={{ background: '#000000', color: '#ffffff', fontSize: '0.75rem' }}>
              Product Showcase
            </span>
            {product.category && (
              <span className="badge" style={{ background: '#e0e7ff', color: '#4338ca', fontSize: '0.75rem' }}>
                {product.category}
              </span>
            )}
          </div>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Close product gallery"
            style={{ width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #e5e7eb' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* 2-Column Responsive Body */}
        <div className="product-gallery-grid">
          {/* ── Left Column: Shopee-Style Photo Stage & Thumbnails ── */}
          <div className="product-gallery-visual">
            {/* Main Full-View Photo Stage */}
            <div
              className="product-gallery-stage"
              style={{
                position: 'relative',
                width: '100%',
                height: 380,
                background: '#ffffff',
                borderRadius: 16,
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid #e2e8f0',
              }}
            >
              {images.length > 0 ? (
                <img
                  src={images[Math.min(activeIdx, images.length - 1)]}
                  alt={`${product.product_name} angle ${activeIdx + 1}`}
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
              ) : (
                <div className="muted" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                  <Store size={38} style={{ opacity: 0.4 }} />
                  <span>No product photos available</span>
                </div>
              )}

              {/* Prev / Next Arrows */}
              {images.length > 1 && (
                <>
                  <button
                    type="button"
                    aria-label="Previous photo"
                    onClick={(e) => {
                      e.stopPropagation()
                      setActiveIdx((prev) => (prev - 1 + images.length) % images.length)
                    }}
                    style={{
                      position: 'absolute',
                      left: 10,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: 36,
                      height: 36,
                      borderRadius: '50%',
                      background: 'rgba(255, 255, 255, 0.92)',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                      border: '1px solid #e5e7eb',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <button
                    type="button"
                    aria-label="Next photo"
                    onClick={(e) => {
                      e.stopPropagation()
                      setActiveIdx((prev) => (prev + 1) % images.length)
                    }}
                    style={{
                      position: 'absolute',
                      right: 10,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: 36,
                      height: 36,
                      borderRadius: '50%',
                      background: 'rgba(255, 255, 255, 0.92)',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                      border: '1px solid #e5e7eb',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <ChevronRight size={20} />
                  </button>
                </>
              )}

              {/* Photo Counter Pill (Shopee style) */}
              {images.length > 1 && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: 12,
                    right: 12,
                    background: 'rgba(0, 0, 0, 0.65)',
                    color: '#ffffff',
                    padding: '0.2rem 0.65rem',
                    borderRadius: 999,
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                  }}
                >
                  {activeIdx + 1} / {images.length}
                </div>
              )}
            </div>

            {/* Shopee-style Horizontal Thumbnails Strip */}
            {images.length > 1 && (
              <div
                style={{
                  display: 'flex',
                  gap: '0.6rem',
                  marginTop: '0.85rem',
                  overflowX: 'auto',
                  paddingBottom: '0.25rem',
                }}
              >
                {images.map((img, i) => {
                  const isActive = i === activeIdx
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setActiveIdx(i)}
                      aria-label={`View shot ${i + 1}`}
                      style={{
                        padding: 0,
                        border: isActive ? '2px solid #000000' : '2px solid transparent',
                        borderRadius: 10,
                        overflow: 'hidden',
                        width: 62,
                        height: 62,
                        minWidth: 62,
                        background: '#f1f5f9',
                        cursor: 'pointer',
                        opacity: isActive ? 1 : 0.65,
                        transition: 'all 0.15s ease',
                        boxShadow: isActive ? '0 2px 8px rgba(0, 0, 0, 0.2)' : 'none',
                      }}
                    >
                      <img src={img} alt={`Thumbnail ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* ── Right Column: Product Information & Action ── */}
          <div className="product-gallery-details" style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            <div>
              <h2 style={{ margin: '0 0 0.35rem', fontSize: '1.45rem', lineHeight: 1.25, fontWeight: 900, color: '#0f172a' }}>
                {product.product_name}
              </h2>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center', marginTop: '0.35rem' }}>
                <span className={`status-pill ${isSoldOut ? 'pending' : 'confirmed'}`}>
                  {isSoldOut ? 'Reserved / Sold out' : `${count} available in stock`}
                </span>
                {product.variant && (
                  <span className="badge" style={{ fontSize: '0.75rem', background: '#f1f5f9', color: '#334155' }}>
                    Variant: {product.variant}
                  </span>
                )}
                {product.cubes && (
                  <span className="badge info" style={{ fontSize: '0.75rem' }}>
                    Cube #{product.cubes.cube_number} ({product.cubes.type})
                  </span>
                )}
              </div>
            </div>

            <div style={{ fontSize: '1.85rem', fontWeight: 900, color: '#000000', margin: '0.2rem 0' }}>
              {peso(product.price)}
            </div>

            {/* Description */}
            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '0.85rem' }}>
              <div className="muted" style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.35rem' }}>
                Product Description
              </div>
              <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.6, color: '#475569', whiteSpace: 'pre-wrap' }}>
                {product.description || 'No detailed description provided for this inventory item.'}
              </p>
            </div>

            {/* Reservation / Action Box */}
            <div
              style={{
                marginTop: 'auto',
                padding: '1rem',
                background: '#f8fafc',
                borderRadius: 14,
                border: '1px solid #e2e8f0',
              }}
            >
              {isSoldOut ? (
                <div style={{ textAlign: 'center', color: '#dc2626', fontWeight: 700, fontSize: '0.9rem' }}>
                  This item is currently sold out or has an active hold.
                </div>
              ) : !userRole ? (
                <div>
                  <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '0 0 0.75rem' }}>
                    Want to hold this item for store pick-up? Sign in with a Customer account to reserve.
                  </p>
                  <button
                    type="button"
                    className="btn"
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={() => {
                      onClose()
                      if (onSignIn) onSignIn()
                    }}
                  >
                    <span>Sign in to Reserve</span>
                    <ArrowRight size={16} />
                  </button>
                </div>
              ) : userRole === 'Customer' ? (
                isReserving ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div className="field no-gap" style={{ width: '100%' }}>
                      <label style={{ fontSize: '0.82rem', fontWeight: 800 }}>Choose validity length:</label>
                      <select
                        value={hours}
                        onChange={(e) => setHours(Number(e.target.value))}
                        style={{ marginTop: '0.25rem', padding: '0.55rem 0.85rem' }}
                      >
                        <option value={1}>1 hour hold</option>
                        <option value={2}>2 hours hold</option>
                        <option value={3}>3 hours hold</option>
                        <option value={4}>4 hours hold</option>
                      </select>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        type="button"
                        className="btn"
                        style={{ flex: 1, justifyContent: 'center' }}
                        onClick={() => {
                          if (onReserve) onReserve(product.product_id, hours)
                          onClose()
                        }}
                      >
                        <Check size={16} /> Confirm Reservation
                      </button>
                      <button
                        type="button"
                        className="btn-ghost"
                        style={{ padding: '0.55rem 1rem' }}
                        onClick={() => setIsReserving(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="btn"
                    style={{ width: '100%', justifyContent: 'center', padding: '0.85rem 1.25rem' }}
                    onClick={() => setIsReserving(true)}
                  >
                    <span>Reserve</span>
                    <ArrowRight size={16} />
                  </button>
                )
              ) : (
                <div style={{ fontSize: '0.85rem', color: '#64748b', textAlign: 'center' }}>
                  Logged in as <strong>{userRole}</strong>. Customer accounts reserve items for in-store pickup.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
