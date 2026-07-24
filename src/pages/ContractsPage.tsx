import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/Auth'
import { daysUntil, peso, type Contract, type Cube } from '../lib/types'

export default function ContractsPage() {
  const { user } = useAuth()
  const [contracts, setContracts] = useState<Contract[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [cubes, setCubes] = useState<Cube[]>([])
  const [form, setForm] = useState({
    cube_id: '',
    start_date: '',
    end_date: '',
    renter_id: '',
  })

  async function load() {
    let q = supabase.from('contracts').select('*, cubes(*), users!renter_id(full_name)').order('end_date', { ascending: false })
    if (user?.role === 'Renter') q = q.eq('renter_id', user.user_id)
    const [cRes, cubeRes] = await Promise.all([
      q,
      supabase.from('cubes').select('*'),
    ])
    if (!cRes.error) {
      const list = (cRes.data || []) as Contract[]
      setContracts(list)
      if (!selectedId && list[0]) setSelectedId(list[0].contract_id)
    }
    if (!cubeRes.error) setCubes((cubeRes.data || []) as Cube[])
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

  async function createContract() {
    if (!form.cube_id || !form.start_date || !form.end_date) return alert('Cube and dates required.')
    const renterId = me.role === 'Renter' ? me.user_id : Number(form.renter_id)
    if (!renterId) return alert('Renter user_id required.')
    const { error } = await supabase.from('contracts').insert([{
      renter_id: renterId,
      cube_id: Number(form.cube_id),
      start_date: form.start_date,
      end_date: form.end_date,
      status: 'Pending',
    }])
    if (error) return alert(error.message)
    await supabase.from('cubes').update({ status: 'Occupied' }).eq('cube_id', Number(form.cube_id))
    void load()
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <h1>Contracts</h1>
          <p className="lede">Read the agreement, fill details, then print a hard copy.</p>
        </div>
        <button className="btn no-print" type="button" onClick={() => window.print()}>Print contract</button>
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
                  onClick={() => setSelectedId(c.contract_id)}
                >
                  {c.cubes?.cube_number} · {c.status}
                  <div className="muted" style={{ fontSize: '0.8rem' }}>{c.start_date} → {c.end_date}</div>
                </button>
              </li>
            ))}
          </ul>

          <div className="panel" style={{ marginTop: 16 }}>
            <h2 style={{ marginTop: 0, fontSize: '1rem' }}>Fill new contract</h2>
            {me.role === 'Owner' && (
              <div className="field">
                <label>Renter user_id</label>
                <input value={form.renter_id} onChange={(e) => setForm({ ...form, renter_id: e.target.value })} />
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
          {selected ? (
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
              <ol>
                <li>Renter may place products in the assigned Display or Pick-up cube only.</li>
                <li>Monthly rental is due as agreed; Owner may withhold renter payouts until sales records match.</li>
                <li>Contract may be extended from the Renter dashboard before expiry.</li>
                <li>Upon expiry without extension, the cube returns to Available.</li>
                <li>Both parties may print this page as a hard copy for signing.</li>
              </ol>
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
          ) : (
            <div className="empty">Select a contract to read.</div>
          )}
        </div>
      </div>
    </section>
  )
}
