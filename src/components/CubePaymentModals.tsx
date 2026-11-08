import { useState } from 'react'
import { X, Upload, CreditCard } from 'lucide-react'
import { peso, type Contract, type ContractPayment } from '../lib/types'
import {
  buildPaymentSchedule,
  paymentStatusBadge,
  submitOnlinePayment,
  type CubePaymentRow,
} from '../lib/cube-payments'

/* ─────────────────────────────────────────────────────────────
   Renter: Pay Online (reference number + receipt attachment)
   ───────────────────────────────────────────────────────────── */
export function PayOnlineModal({
  row,
  onClose,
  onSubmitted,
}: {
  row: CubePaymentRow
  onClose: () => void
  onSubmitted: () => void
}) {
  const [reference, setReference] = useState(row.status === 'For Verification' ? row.referenceNumber || '' : '')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setError(null)
    if (!reference.trim()) return setError('Please enter the reference number.')
    if (!file) return setError('Please attach the receipt / proof of payment.')
    setSaving(true)
    const err = await submitOnlinePayment(row, reference, file)
    setSaving(false)
    if (err) return setError(err)
    onSubmitted()
  }

  const c = row.contract
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 520, width: '100%', maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header" style={{ marginBottom: '1rem' }}>
          <div>
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <CreditCard size={18} /> Pay Online
            </h3>
            <span className="muted" style={{ fontSize: '0.85rem' }}>
              Agreement #{c.contract_id} · Cube #{c.cubes?.cube_number || c.cube_id}
            </span>
          </div>
          <button className="modal-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '0.85rem 1rem', marginBottom: '1rem', fontSize: '0.88rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="muted">Payment for</span>
            <strong>
              Month {row.monthIndex} of {row.totalMonths}
            </strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <span className="muted">Due date</span>
            <strong>{row.dueDate}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <span className="muted">Amount to pay</span>
            <strong style={{ color: '#16a34a', fontSize: '1.05rem' }}>{peso(row.amount)}</strong>
          </div>
        </div>

        {row.notes && row.status === 'Pending' && (
          <div className="alert" style={{ background: '#fee2e2', color: '#991b1b', padding: '0.6rem 0.85rem', fontSize: '0.82rem', marginBottom: '0.85rem' }}>
            {row.notes}. Please submit a valid payment again.
          </div>
        )}

        <div className="field">
          <label>Reference Number</label>
          <input
            type="text"
            value={reference}
            placeholder="e.g. GCash / bank transfer reference no."
            onChange={(e) => setReference(e.target.value)}
            maxLength={60}
          />
        </div>

        <div className="field">
          <label>Attach Receipt (proof of payment)</label>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              border: '1px dashed #93c5fd',
              background: '#eff6ff',
              color: '#1d4ed8',
              borderRadius: 10,
              padding: preview ? '0.5rem' : '1.1rem',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.85rem',
            }}
          >
            {preview ? (
              <img src={preview} alt="Receipt preview" style={{ maxHeight: 220, maxWidth: '100%', borderRadius: 8, objectFit: 'contain' }} />
            ) : (
              <>
                <Upload size={16} /> Choose receipt image
              </>
            )}
            <input
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0] || null
                setFile(f)
                setPreview(f ? URL.createObjectURL(f) : null)
              }}
            />
          </label>
          {file && (
            <span className="muted" style={{ fontSize: '0.75rem' }}>
              {file.name} · click the image to change
            </span>
          )}
        </div>

        {error && (
          <div style={{ color: '#b91c1c', fontSize: '0.82rem', marginBottom: '0.75rem', whiteSpace: 'pre-wrap' }}>{error}</div>
        )}

        <p className="muted" style={{ fontSize: '0.78rem', margin: '0 0 1rem' }}>
          The Owner or Staff will verify your reference number and receipt before marking this payment as Paid.
        </p>

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button type="button" className="btn-ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="btn" onClick={() => void submit()} disabled={saving}>
            {saving ? 'Submitting…' : 'Submit Payment'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────
   Shared cube payment table (contract #, renter, cube, rate,
   lease period, month, mode of payment, status)
   ───────────────────────────────────────────────────────────── */
export function CubePaymentTable({
  contracts,
  payments,
  renterName,
  onPayOnline,
  onViewReceipt,
}: {
  contracts: Contract[]
  payments: ContractPayment[]
  renterName: string
  onPayOnline?: (row: CubePaymentRow) => void
  onViewReceipt?: (url: string) => void
}) {
  const rows = contracts.filter((c) => c.contract_id > 0).flatMap((c) => buildPaymentSchedule(c, payments))

  if (rows.length === 0) {
    return <div className="empty" style={{ padding: '2rem', textAlign: 'center' }}>No cube payments to show yet.</div>
  }

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Contract #</th>
            <th>Renter</th>
            <th>Assigned Cube</th>
            <th>Monthly Rate</th>
            <th>Lease Period</th>
            <th>Month</th>
            <th>Mode of Payment</th>
            <th>Status</th>
            {onPayOnline && <th style={{ textAlign: 'right' }}>Action</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const c = row.contract
            return (
              <tr key={row.key}>
                <td>
                  <strong>#{c.contract_id}</strong>
                </td>
                <td>{renterName}</td>
                <td>
                  <span className="badge pickup">
                    Cube #{c.cubes?.cube_number || c.cube_id} ({c.cubes?.type || '—'})
                  </span>
                </td>
                <td>{peso(c.cubes?.price_per_month)}</td>
                <td style={{ fontSize: '0.82rem' }}>
                  {c.start_date} → {c.end_date}
                </td>
                <td>
                  <strong>
                    Month {row.monthIndex} of {row.totalMonths}
                  </strong>
                  <div className="muted" style={{ fontSize: '0.72rem' }}>Due {row.dueDate}</div>
                </td>
                <td>
                  <span className={`badge ${row.method === 'Online' ? 'pickup' : 'ok'}`}>{row.method}</span>
                  {row.method === 'Online' && row.referenceNumber && (
                    <div style={{ fontSize: '0.74rem', marginTop: 3 }}>
                      Ref: <strong>{row.referenceNumber}</strong>
                    </div>
                  )}
                  {row.method === 'Online' && row.receiptUrl && onViewReceipt && (
                    <button
                      type="button"
                      className="btn-ghost"
                      style={{ fontSize: '0.7rem', padding: '1px 6px', marginTop: 3 }}
                      onClick={() => onViewReceipt(row.receiptUrl as string)}
                    >
                      View receipt
                    </button>
                  )}
                </td>
                <td>
                  <span className={`badge ${paymentStatusBadge(row.status)}`}>{row.status}</span>
                  {row.status === 'Pending' && row.notes && (
                    <div style={{ fontSize: '0.7rem', color: '#b91c1c', marginTop: 3, maxWidth: 180 }}>{row.notes}</div>
                  )}
                </td>
                {onPayOnline && (
                  <td style={{ textAlign: 'right' }}>
                    {row.status === 'Paid' ? (
                      <span className="muted" style={{ fontSize: '0.78rem' }}>—</span>
                    ) : (
                      <button
                        type="button"
                        className={row.status === 'For Verification' ? 'btn-ghost' : 'btn'}
                        style={{ fontSize: '0.76rem', padding: '0.3rem 0.65rem' }}
                        onClick={() => onPayOnline(row)}
                      >
                        {row.status === 'For Verification' ? 'Resubmit' : 'Pay Online'}
                      </button>
                    )}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────
   Renter: View Payment (per contract)
   ───────────────────────────────────────────────────────────── */
export function ViewPaymentModal({
  contract,
  payments,
  renterName,
  onClose,
  onPayOnline,
  onViewReceipt,
}: {
  contract: Contract
  payments: ContractPayment[]
  renterName: string
  onClose: () => void
  onPayOnline: (row: CubePaymentRow) => void
  onViewReceipt: (url: string) => void
}) {
  const rows = buildPaymentSchedule(contract, payments)
  const paid = rows.filter((r) => r.status === 'Paid').reduce((s, r) => s + r.amount, 0)
  const balance = rows.filter((r) => r.status !== 'Paid').reduce((s, r) => s + r.amount, 0)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 980, width: '100%', maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header" style={{ marginBottom: '1rem' }}>
          <div>
            <h3 style={{ margin: 0 }}>Cube Payment · Agreement #{contract.contract_id}</h3>
            <span className="muted" style={{ fontSize: '0.85rem' }}>
              Cube #{contract.cubes?.cube_number || contract.cube_id} · {contract.start_date} → {contract.end_date}
            </span>
          </div>
          <button className="modal-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <div className="panel" style={{ padding: '0.75rem 1rem', flex: 1, minWidth: 150 }}>
            <div className="muted" style={{ fontSize: '0.74rem', fontWeight: 700, textTransform: 'uppercase' }}>Total Paid</div>
            <div style={{ fontWeight: 800, fontSize: '1.2rem', color: '#16a34a' }}>{peso(paid)}</div>
          </div>
          <div className="panel" style={{ padding: '0.75rem 1rem', flex: 1, minWidth: 150 }}>
            <div className="muted" style={{ fontSize: '0.74rem', fontWeight: 700, textTransform: 'uppercase' }}>Remaining Balance</div>
            <div style={{ fontWeight: 800, fontSize: '1.2rem', color: balance > 0 ? '#b45309' : '#16a34a' }}>{peso(balance)}</div>
          </div>
        </div>

        <CubePaymentTable
          contracts={[contract]}
          payments={payments}
          renterName={renterName}
          onPayOnline={onPayOnline}
          onViewReceipt={onViewReceipt}
        />
      </div>
    </div>
  )
}

/** Simple full-size receipt viewer. */
export function ReceiptPreviewModal({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1200 }}>
      <div className="modal-card" style={{ maxWidth: 640, width: '100%' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header" style={{ marginBottom: '0.75rem' }}>
          <h3 style={{ margin: 0 }}>Proof of Payment</h3>
          <button className="modal-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <img src={url} alt="Payment receipt" style={{ width: '100%', maxHeight: '70vh', objectFit: 'contain', borderRadius: 8, background: '#f8fafc' }} />
        <div style={{ textAlign: 'right', marginTop: '0.75rem' }}>
          <a href={url} target="_blank" rel="noreferrer" className="btn-ghost">
            Open in new tab
          </a>
        </div>
      </div>
    </div>
  )
}
