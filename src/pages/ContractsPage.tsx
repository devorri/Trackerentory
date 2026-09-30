import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/Auth'
import { daysUntil, peso, type Contract, type Cube } from '../lib/types'

const DEFAULT_TERMS = `1. Renter may place products in the assigned Display or Pick-up cube only.
2. Monthly rental is due as agreed; Owner may withhold renter payouts until sales records match.
3. Contract may be extended from the Renter dashboard before expiry.
4. Upon expiry without extension, the cube returns to Available.
5. Both parties may print this page as a hard copy for signing.`

export default function ContractsPage() {
  const { user } = useAuth()
  const [contracts, setContracts] = useState<Contract[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [cubes, setCubes] = useState<Cube[]>([])
  const [renters, setRenters] = useState<{ user_id: number; full_name: string }[]>([])
  const [form, setForm] = useState({
    cube_id: '',
    start_date: '',
    end_date: '',
    renter_id: '',
  })

  // Edit state
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({
    start_date: '',
    end_date: '',
    status: '' as Contract['status'] | '',
    cube_id: '',
    renter_id: '',
    contract_text: '',
  })
  const [saving, setSaving] = useState(false)

  async function load() {
    let q = supabase.from('contracts').select('*, cubes(*), users!renter_id(full_name)').order('end_date', { ascending: false })
    if (user?.role === 'Renter') q = q.eq('renter_id', user.user_id)
    const [cRes, cubeRes, renterRes] = await Promise.all([
      q,
      supabase.from('cubes').select('*'),
      supabase.from('users').select('user_id, full_name').eq('role', 'Renter'),
    ])
    if (!cRes.error) {
      const list = (cRes.data || []) as Contract[]
      setContracts(list)
      if (!selectedId && list[0]) setSelectedId(list[0].contract_id)
    }
    if (!cubeRes.error) setCubes((cubeRes.data || []) as Cube[])
    if (!renterRes.error) setRenters(renterRes.data || [])
  }

  useEffect(() => { void load() }, [user])

  const selected = contracts.find((c) => c.contract_id === selectedId) || null

  if (!user || (user.role !== 'Owner' && user.role !== 'Renter')) {
    return (
      <section>
        <div className="page-header">
          <div>
            <h1>Contracts</h1>
            <p className="lede">Owner / Renter only. <Link to="/login">Sign in</Link></p>
          </div>
        </div>
      </section>
    )
  }

  const me = user
  const isOwner = me.role === 'Owner'

  async function createContract() {
    if (!form.cube_id || !form.start_date || !form.end_date) return alert('Cube and dates required.')
    const renterId = me.role === 'Renter' ? me.user_id : Number(form.renter_id)
    if (!renterId) return alert('Renter is required.')
    const { error } = await supabase.from('contracts').insert([{
      renter_id: renterId,
      cube_id: Number(form.cube_id),
      start_date: form.start_date,
      end_date: form.end_date,
      status: 'Pending',
      contract_text: DEFAULT_TERMS,
    }])
    if (error) return alert(error.message)
    await supabase.from('cubes').update({ status: 'Occupied' }).eq('cube_id', Number(form.cube_id))
    void load()
  }

  function beginEdit(c: Contract) {
    setEditing(true)
    setEditForm({
      start_date: c.start_date,
      end_date: c.end_date,
      status: c.status,
      cube_id: String(c.cube_id || ''),
      renter_id: String(c.renter_id || ''),
      contract_text: c.contract_text || DEFAULT_TERMS,
    })
  }

  async function saveEdit() {
    if (!selected) return
    setSaving(true)
    const { error } = await supabase
      .from('contracts')
      .update({
        start_date: editForm.start_date,
        end_date: editForm.end_date,
        status: editForm.status as Contract['status'],
        cube_id: Number(editForm.cube_id) || selected.cube_id,
        renter_id: Number(editForm.renter_id) || selected.renter_id,
        contract_text: editForm.contract_text || null,
      })
      .eq('contract_id', selected.contract_id)
    setSaving(false)
    if (error) return alert(error.message)
    setEditing(false)
    void load()
  }

  function cancelEdit() {
    setEditing(false)
  }

  function getContractTerms(c: Contract): string {
    return c.contract_text || DEFAULT_TERMS
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>Contracts</h1>
          <p className="lede">Read the agreement, fill details, then print a hard copy.</p>
        </div>
        <div className="row no-print">
          {isOwner && selected && !editing && (
            <button className="btn-ghost" type="button" onClick={() => beginEdit(selected)}>Edit contract</button>
          )}
          <button className="btn no-print" type="button" onClick={() => window.print()}>Print contract</button>
        </div>
      </div>

      <div className="split">
        <div className="no-print">
          <h2>List</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {contracts.map((c) => (
              <li key={c.contract_id} style={{ marginBottom: 6 }}>
                <button
                  type="button"
                  className={selectedId === c.contract_id ? 'btn' : 'btn-ghost'}
                  style={{ width: '100%', textAlign: 'left' }}
                  onClick={() => { setSelectedId(c.contract_id); setEditing(false) }}
                >
                  {c.cubes?.cube_number} · {c.status}
                  <div className="muted" style={{ fontSize: '0.8rem' }}>{c.start_date} → {c.end_date}</div>
                </button>
              </li>
            ))}
          </ul>

          <div className="panel" style={{ marginTop: 16 }}>
            <h2 style={{ marginTop: 0, fontSize: '1rem' }}>Fill new contract</h2>
            {isOwner && (
              <div className="field">
                <label>Renter</label>
                <select value={form.renter_id} onChange={(e) => setForm({ ...form, renter_id: e.target.value })}>
                  <option value="">Select renter…</option>
                  {renters.map((r) => (
                    <option key={r.user_id} value={r.user_id}>{r.full_name} (#{r.user_id})</option>
                  ))}
                </select>
              </div>
            )}
            <div className="field">
              <label>Cube</label>
              <select value={form.cube_id} onChange={(e) => setForm({ ...form, cube_id: e.target.value })}>
                <option value="">Select…</option>
                {cubes.map((c) => (
                  <option key={c.cube_id} value={c.cube_id}>
                    {c.cube_number} · {c.type} · {peso(c.price_per_month)}/mo · {c.status}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Start</label>
              <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            </div>
            <div className="field">
              <label>End</label>
              <input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
            </div>
            <button className="btn" type="button" onClick={createContract}>Save contract</button>
          </div>
        </div>

        <div>
          {selected && !editing ? (
            <article className="contract-doc" id="contract-print">
              <h2 style={{ textAlign: 'center', marginTop: 0 }}>Cube Rental Agreement</h2>
              <p><strong>Contract No:</strong> {selected.contract_id}</p>
              <p><strong>Status:</strong> {selected.status}</p>
              <p>
                This agreement is entered into between <strong>TrackErentory (Owner)</strong> and
                the Renter <strong>{selected.users?.full_name || `User #${selected.renter_id}`}</strong>.
              </p>
              <p>
                The Renter shall lease Cube <strong>{selected.cubes?.cube_number}</strong>
                ({selected.cubes?.type}) at a monthly rate of{' '}
                <strong>{peso(selected.cubes?.price_per_month)}</strong>.
              </p>
              <p>
                <strong>Term:</strong> from <strong>{selected.start_date}</strong> to{' '}
                <strong>{selected.end_date}</strong>
                {' '}({daysUntil(selected.end_date) >= 0 ? `${daysUntil(selected.end_date)} day(s) remaining` : 'expired'}).
              </p>
              <div style={{ whiteSpace: 'pre-wrap', marginTop: '1rem', lineHeight: 1.8 }}>
                {getContractTerms(selected)}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 48 }}>
                <div>
                  <p>________________________</p>
                  <p>Owner signature</p>
                </div>
                <div>
                  <p>________________________</p>
                  <p>Renter signature</p>
                  <p>{selected.users?.full_name}</p>
                </div>
              </div>
            </article>
          ) : selected && editing ? (
            <div className="contract-edit-panel panel no-print">
              <h2 style={{ marginTop: 0 }}>Edit Contract #{selected.contract_id}</h2>
              <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                <div className="field">
                  <label>Status</label>
                  <select value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value as Contract['status'] })}>
                    <option value="Pending">Pending</option>
                    <option value="Active">Active</option>
                    <option value="Expired">Expired</option>
                  </select>
                </div>
                <div className="field">
                  <label>Cube</label>
                  <select value={editForm.cube_id} onChange={(e) => setEditForm({ ...editForm, cube_id: e.target.value })}>
                    {cubes.map((c) => (
                      <option key={c.cube_id} value={c.cube_id}>{c.cube_number} · {c.type}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Start date</label>
                  <input type="date" value={editForm.start_date} onChange={(e) => setEditForm({ ...editForm, start_date: e.target.value })} />
                </div>
                <div className="field">
                  <label>End date</label>
                  <input type="date" value={editForm.end_date} onChange={(e) => setEditForm({ ...editForm, end_date: e.target.value })} />
                </div>
              </div>
              {isOwner && (
                <div className="field">
                  <label>Renter</label>
                  <select value={editForm.renter_id} onChange={(e) => setEditForm({ ...editForm, renter_id: e.target.value })}>
                    {renters.map((r) => (
                      <option key={r.user_id} value={r.user_id}>{r.full_name} (#{r.user_id})</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="field">
                <label>Contract terms (editable)</label>
                <textarea
                  value={editForm.contract_text}
                  onChange={(e) => setEditForm({ ...editForm, contract_text: e.target.value })}
                  rows={10}
                />
              </div>
              <div className="row">
                <button className="btn" type="button" disabled={saving} onClick={saveEdit}>
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
                <button className="btn-ghost" type="button" onClick={cancelEdit}>Cancel</button>
              </div>
            </div>
          ) : (
            <div className="empty">Select a contract to read.</div>
          )}
        </div>
      </div>
    </section>
  )
}
