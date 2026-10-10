import { useEffect } from 'react'
import { AlertTriangle, Info } from 'lucide-react'

type ConfirmModalProps = {
  isOpen: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  isDanger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDanger = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        onCancel()
      }
    }
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown)
    }
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onCancel])

  if (!isOpen) return null

  return (
    <div
      className="modal-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '1rem',
        animation: 'fadeIn 0.15s ease-out',
      }}
      onClick={onCancel}
    >
      <div
        className="modal-card"
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          maxWidth: '440px',
          width: '100%',
          padding: '1.75rem',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          border: '1px solid #e2e8f0',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '1rem' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              background: isDanger ? '#fee2e2' : '#e0e7ff',
              color: isDanger ? '#dc2626' : '#4f46e5',
              fontSize: '1.25rem',
            }}
          >
            {isDanger ? <AlertTriangle size={22} color="#dc2626" /> : <Info size={22} color="#4f46e5" />}
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#0f172a' }}>
              {title}
            </h3>
            <p style={{ margin: '0.4rem 0 0', fontSize: '0.92rem', color: '#64748b', lineHeight: 1.5 }}>
              {message}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
          <button
            type="button"
            className="btn-ghost"
            onClick={onCancel}
            style={{
              padding: '0.55rem 1.1rem',
              borderRadius: '8px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              padding: '0.55rem 1.25rem',
              borderRadius: '8px',
              fontWeight: 600,
              cursor: 'pointer',
              border: 'none',
              background: isDanger ? '#dc2626' : 'var(--accent, #6366f1)',
              color: '#ffffff',
              transition: 'opacity 0.15s ease',
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
