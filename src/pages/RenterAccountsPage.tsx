import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search,
  Phone,
  Mail,
  Globe,
  ExternalLink,
  Clock,
  ArrowUpDown,
  Eye,
  Edit2,
  FileText,
  X,
  Check,
  Copy,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/Auth'
import {
  peso,
  daysUntil,
  isContractInGracePeriod,
  getGracePeriodDaysLeft,
  type Contract,
  type Cube,
} from '../lib/types'
import { SkeletonTable } from '../components/Skeleton'
import TablePagination, { DEFAULT_PAGE_SIZE } from '../components/TablePagination'

export type RenterUser = {
  user_id: number
  full_name: string
  username: string
  email: string | null
  phone_number: string | null
  social_link: string | null
  status: string
  role: string
  created_at?: string
}

export type RenterWithContract = {
  key: string
  user: RenterUser
  contract: Contract | null
  cube: Cube | null
  cubeType: 'Display' | 'Pick-up' | 'None'
  contractStatus: 'Active' | 'Pending' | 'Expiring Soon' | 'Expired' | 'No Contract'
  daysLeft: number | null
}

type CubeTypeFilter = 'All' | 'Display' | 'Pick-up'
type StatusFilter = 'all' | 'Active' | 'Pending' | 'Expiring Soon' | 'Expired' | 'None'
type SortField = 'name' | 'cube' | 'period' | 'status' | 'phone'

export default function RenterAccountsPage() {
  const { user } = useAuth()
  const nav = useNavigate()

  const [renters, setRenters] = useState<RenterUser[]>([])
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // Filters
  const [cubeTypeFilter, setCubeTypeFilter] = useState<CubeTypeFilter>('All')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  // Modals
  const [selectedRenter, setSelectedRenter] = useState<RenterWithContract | null>(null)
  const [editingRenter, setEditingRenter] = useState<RenterUser | null>(null)
  const [editForm, setEditForm] = useState({
    full_name: '',
    phone_number: '',
    social_link: '',
    email: '',
  })
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const isOwnerOrStaff = user?.role === 'Owner' || user?.role === 'Staff'

  async function loadData() {
    setLoading(true)
    const [rentersRes, contractsRes] = await Promise.all([
      supabase
        .from('users')
        .select('*')
        .eq('role', 'Renter')
        .order('full_name', { ascending: true }),
      supabase
        .from('contracts')
        .select('*, cubes(*), users!renter_id(*)')
        .order('end_date', { ascending: true }),
    ])

    setLoading(false)
    if (rentersRes.error) console.error('Renters error:', rentersRes.error)
    if (contractsRes.error) console.error('Contracts error:', contractsRes.error)

    const rawRenters = (rentersRes.data || []) as RenterUser[]
    const rawContracts = (contractsRes.data || []) as any[]

    // Merge any contract renters into the renters list so no one is missed
    const renterMap = new Map<number, RenterUser>()
    rawRenters.forEach((r) => renterMap.set(r.user_id, r))

    for (const c of rawContracts) {
      if (c.renter_id && c.users) {
        if (!renterMap.has(c.renter_id)) {
          renterMap.set(c.renter_id, {
            user_id: c.renter_id,
            full_name: c.users.full_name || `User #${c.renter_id}`,
            username: c.users.username || `renter_${c.renter_id}`,
            email: c.users.email || null,
            phone_number: c.users.phone_number || null,
            social_link: c.users.social_link || null,
            status: c.users.status || 'Active',
            role: c.users.role || 'Renter',
          })
        }
      }
    }

    setRenters(Array.from(renterMap.values()))
    setContracts(rawContracts as Contract[])
  }

  useEffect(() => {
    if (isOwnerOrStaff) {
      void loadData()
    }
  }, [user])

  // Build flattened list of renter accounts with their leased cubes
  const allRenterRows = useMemo<RenterWithContract[]>(() => {
    const rows: RenterWithContract[] = []

    for (const r of renters) {
      const userContracts = contracts.filter((c) => c.renter_id === r.user_id)

      if (userContracts.length === 0) {
        rows.push({
          key: `user-${r.user_id}-none`,
          user: r,
          contract: null,
          cube: null,
          cubeType: 'None',
          contractStatus: 'No Contract',
          daysLeft: null,
        })
      } else {
        for (const c of userContracts) {
          const cube = c.cubes || null
          const days = c.end_date ? daysUntil(c.end_date) : 0
          let status: RenterWithContract['contractStatus'] = 'No Contract'

          if (c.status === 'Pending') {
            status = 'Pending'
          } else if (c.status === 'Active') {
            if (days >= 0 && days <= 7) {
              status = 'Expiring Soon'
            } else if (days < 0) {
              status = 'Expired'
            } else {
              status = 'Active'
            }
          } else if (c.status === 'Expired') {
            status = 'Expired'
          }

          rows.push({
            key: `contract-${c.contract_id}`,
            user: r,
            contract: c,
            cube,
            cubeType: (cube?.type as 'Display' | 'Pick-up') || 'None',
            contractStatus: status,
            daysLeft: days,
          })
        }
      }
    }

    return rows
  }, [renters, contracts])

  // Filtering
  const filteredRows = useMemo(() => {
    return allRenterRows.filter((row) => {
      // 1. Cube Type Filter (Display vs Pick-up vs All)
      if (cubeTypeFilter === 'Display' && row.cubeType !== 'Display') return false
      if (cubeTypeFilter === 'Pick-up' && row.cubeType !== 'Pick-up') return false

      // 2. Status Filter
      if (statusFilter !== 'all') {
        if (statusFilter === 'Active' && row.contractStatus !== 'Active') return false
        if (statusFilter === 'Pending' && row.contractStatus !== 'Pending') return false
        if (statusFilter === 'Expiring Soon' && row.contractStatus !== 'Expiring Soon') return false
        if (statusFilter === 'Expired' && row.contractStatus !== 'Expired') return false
        if (statusFilter === 'None' && row.contractStatus !== 'No Contract') return false
      }

      // 3. Search query
      if (search.trim()) {
        const q = search.toLowerCase()
        const name = (row.user.full_name || '').toLowerCase()
        const username = (row.user.username || '').toLowerCase()
        const email = (row.user.email || '').toLowerCase()
        const phone = (row.user.phone_number || '').toLowerCase()
        const social = (row.user.social_link || '').toLowerCase()
        const cubeNum = (row.cube?.cube_number || '').toLowerCase()
        const cubeType = (row.cube?.type || '').toLowerCase()

        if (
          !name.includes(q) &&
          !username.includes(q) &&
          !email.includes(q) &&
          !phone.includes(q) &&
          !social.includes(q) &&
          !cubeNum.includes(q) &&
          !cubeType.includes(q)
        ) {
          return false
        }
      }

      return true
    })
  }, [allRenterRows, cubeTypeFilter, statusFilter, search])

  // Sorting
  const sortedRows = useMemo(() => {
    const list = [...filteredRows]
    list.sort((a, b) => {
      let vA = ''
      let vB = ''

      if (sortField === 'name') {
        vA = a.user.full_name.toLowerCase()
        vB = b.user.full_name.toLowerCase()
      } else if (sortField === 'cube') {
        vA = a.cube?.cube_number || 'ZZZ'
        vB = b.cube?.cube_number || 'ZZZ'
      } else if (sortField === 'period') {
        vA = a.contract?.end_date || '9999-99-99'
        vB = b.contract?.end_date || '9999-99-99'
      } else if (sortField === 'status') {
        vA = a.contractStatus
        vB = b.contractStatus
      } else if (sortField === 'phone') {
        vA = a.user.phone_number || ''
        vB = b.user.phone_number || ''
      }

      if (vA < vB) return sortDir === 'asc' ? -1 : 1
      if (vA > vB) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return list
  }, [filteredRows, sortField, sortDir])

  // Pagination
  useEffect(() => setPage(1), [cubeTypeFilter, statusFilter, search])
  const pagedRows = sortedRows.slice((page - 1) * DEFAULT_PAGE_SIZE, page * DEFAULT_PAGE_SIZE)

  // Counts for pills
  const counts = useMemo(() => {
    const displayCount = allRenterRows.filter((r) => r.cubeType === 'Display').length
    const pickupCount = allRenterRows.filter((r) => r.cubeType === 'Pick-up').length
    const pendingCount = allRenterRows.filter((r) => r.contractStatus === 'Pending').length
    const expiringCount = allRenterRows.filter((r) => r.contractStatus === 'Expiring Soon').length
    const activeCount = allRenterRows.filter((r) => r.contractStatus === 'Active' || r.contractStatus === 'Expiring Soon').length
    return {
      total: allRenterRows.length,
      display: displayCount,
      pickup: pickupCount,
      pending: pendingCount,
      expiring: expiringCount,
      active: activeCount,
    }
  }, [allRenterRows])

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  function renderSortIndicator(field: SortField) {
    if (sortField !== field) {
      return <ArrowUpDown size={12} style={{ opacity: 0.35, marginLeft: 4, display: 'inline', verticalAlign: 'middle' }} />
    }
    return <span style={{ marginLeft: 4, fontSize: '0.72rem' }}>{sortDir === 'asc' ? '▲' : '▼'}</span>
  }

  function handleCopy(text: string, key: string) {
    if (!text) return
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key)
      setTimeout(() => setCopiedKey(null), 2000)
    })
  }

  function openEditModal(u: RenterUser) {
    setEditingRenter(u)
    setEditForm({
      full_name: u.full_name || '',
      phone_number: u.phone_number || '',
      social_link: u.social_link || '',
      email: u.email || '',
    })
  }

  async function handleSaveContact() {
    if (!editingRenter) return
    setSaving(true)

    const { error } = await supabase
      .from('users')
      .update({
        phone_number: editForm.phone_number.trim() || null,
        social_link: editForm.social_link.trim() || null,
        email: editForm.email.trim() || null,
      })
      .eq('user_id', editingRenter.user_id)

    setSaving(false)
    if (error) {
      alert('Failed to update renter details: ' + error.message)
      return
    }

    alert('Renter contact details updated successfully!')
    setEditingRenter(null)
    void loadData()
  }

  if (!isOwnerOrStaff) {
    return (
      <section>
        <div className="page-header">
          <div>
            <h1>Renter Accounts</h1>
            <p className="lede">Access restricted. Owner or Staff only.</p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section>
      {/* ════════════ PAGE HEADER ════════════ */}
      <div className="page-header">
        <div>
          <h1>Renter Accounts</h1>
          <p className="lede">
            Directory of consignors and renters leasing Display and Pick-up cube spaces. View contact numbers, social media, assigned cubes, and validity.
          </p>
        </div>
        <div className="row">
          {isOwnerOrStaff && (
            <button className="btn" type="button" onClick={() => nav('/contracts')}>
              <FileText size={16} /> Manage Contracts
            </button>
          )}
        </div>
      </div>

      {/* ════════════ STAT CARDS ════════════ */}
      <div className="stat-grid" style={{ marginBottom: '1.75rem' }}>
        <div className="stat">
          <div className="label">Total Renters</div>
          <div className="value">{renters.length}</div>
        </div>
        <div className="stat">
          <div className="label">Display Cube Renters</div>
          <div className="value">{counts.display}</div>
        </div>
        <div className="stat">
          <div className="label">Pick-up Cube Renters</div>
          <div className="value">{counts.pickup}</div>
        </div>
        <div className="stat">
          <div className="label">Active Leases</div>
          <div className="value">{counts.active}</div>
        </div>
      </div>

      {/* ════════════ FILTERS & SEARCH ════════════ */}
      {/* 1. Primary Cube Type Tabs (Separate Display & Pick-up) */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="muted" style={{ fontSize: '0.82rem', fontWeight: 700, marginRight: '0.25rem' }}>
          Cube Type:
        </span>
        <button
          type="button"
          className={cubeTypeFilter === 'All' ? 'btn' : 'btn-ghost'}
          style={{ fontSize: '0.82rem', padding: '0.4rem 0.95rem' }}
          onClick={() => setCubeTypeFilter('All')}
        >
          All Renters ({allRenterRows.length})
        </button>
        <button
          type="button"
          className={cubeTypeFilter === 'Display' ? 'btn' : 'btn-ghost'}
          style={{ fontSize: '0.82rem', padding: '0.4rem 0.95rem' }}
          onClick={() => setCubeTypeFilter('Display')}
        >
          Display Renters ({counts.display})
        </button>
        <button
          type="button"
          className={cubeTypeFilter === 'Pick-up' ? 'btn' : 'btn-ghost'}
          style={{ fontSize: '0.82rem', padding: '0.4rem 0.95rem' }}
          onClick={() => setCubeTypeFilter('Pick-up')}
        >
          Pick-up Renters ({counts.pickup})
        </button>
      </div>

      {/* 2. Secondary Status Filter & Search Bar */}
      <div
        style={{
          display: 'flex',
          gap: '0.75rem',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          marginBottom: '1.25rem',
        }}
      >
        {/* Status Pills */}
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {(
            [
              { id: 'all', label: 'All Status' },
              { id: 'Active', label: 'Active' },
              { id: 'Pending', label: 'Pending Approval' },
              { id: 'Expiring Soon', label: 'Expiring Soon' },
              { id: 'Expired', label: 'Expired' },
            ] as const
          ).map((s) => (
            <button
              key={s.id}
              type="button"
              className={statusFilter === s.id ? 'btn' : 'btn-ghost'}
              style={{ fontSize: '0.78rem', padding: '0.3rem 0.75rem' }}
              onClick={() => setStatusFilter(s.id as StatusFilter)}
            >
              {s.id === 'Pending' && counts.pending > 0 ? `Pending Approval (${counts.pending})` : s.label}
            </button>
          ))}
        </div>

        {/* Search Bar */}
        <div style={{ position: 'relative', minWidth: 260, maxWidth: 360, flex: 1 }}>
          <Search size={15} color="#94a3b8" style={{ position: 'absolute', left: 11, top: 11 }} />
          <input
            type="text"
            placeholder="Search renter name, cube, phone, social…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: '2.2rem', margin: 0, height: 38, fontSize: '0.82rem' }}
          />
        </div>
      </div>

      {/* ════════════ RENTER DIRECTORY TABLE ════════════ */}
      {loading ? (
        <SkeletonTable rows={6} cols={6} />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('name')}>
                  Renter Name & Info {renderSortIndicator('name')}
                </th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('phone')}>
                  Contact & Social {renderSortIndicator('phone')}
                </th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('cube')}>
                  Assigned Cube & Type {renderSortIndicator('cube')}
                </th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('period')}>
                  Contract Period {renderSortIndicator('period')}
                </th>
                <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('status')}>
                  Status & Validity {renderSortIndicator('status')}
                </th>
                <th style={{ textAlign: 'right', minWidth: 120 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((r) => {
                const isPending = r.contractStatus === 'Pending'
                const isExpired = r.contractStatus === 'Expired'
                const isExpiringSoon = r.contractStatus === 'Expiring Soon'
                const isActive = r.contractStatus === 'Active'

                return (
                  <tr key={r.key}>
                    {/* 1. RENTER NAME & IDENTITY */}
                    <td>
                      <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#0f172a' }}>
                        {r.user.full_name}
                      </div>
                      <div className="muted" style={{ fontSize: '0.75rem', marginTop: 1 }}>
                        @{r.user.username}
                      </div>
                      {r.user.email && (
                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>
                          <a
                            href={`mailto:${r.user.email}`}
                            style={{ color: '#2563eb', textDecoration: 'none' }}
                            title="Send email"
                          >
                            {r.user.email}
                          </a>
                        </div>
                      )}
                    </td>

                    {/* 2. CONTACT NUMBER & SOCIAL MEDIA */}
                    <td>
                      {/* Phone Number */}
                      {r.user.phone_number ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <Phone size={13} color="#2563eb" />
                          <a
                            href={`tel:${r.user.phone_number}`}
                            style={{ fontWeight: 600, color: '#0f172a', textDecoration: 'none', fontSize: '0.84rem' }}
                            title="Click to call"
                          >
                            {r.user.phone_number}
                          </a>
                          <button
                            type="button"
                            className="btn-ghost"
                            style={{ padding: '1px 4px', fontSize: '0.68rem', color: '#64748b' }}
                            onClick={() => handleCopy(r.user.phone_number || '', `phone-${r.key}`)}
                            title="Copy phone number"
                          >
                            {copiedKey === `phone-${r.key}` ? <Check size={12} color="#16a34a" /> : <Copy size={12} />}
                          </button>
                        </div>
                      ) : (
                        <span className="muted" style={{ fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>
                          No contact number
                        </span>
                      )}

                      {/* Social Link */}
                      {r.user.social_link ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Globe size={13} color="#8b5cf6" />
                          {r.user.social_link.startsWith('http://') || r.user.social_link.startsWith('https://') ? (
                            <a
                              href={r.user.social_link}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                color: '#6d28d9',
                                textDecoration: 'underline',
                                fontSize: '0.78rem',
                                maxWidth: 160,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                              title={r.user.social_link}
                            >
                              {r.user.social_link.replace(/^https?:\/\/(www\.)?/, '')}
                            </a>
                          ) : (
                            <span style={{ fontSize: '0.78rem', color: '#6d28d9', fontWeight: 600 }}>
                              {r.user.social_link}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="muted" style={{ fontSize: '0.75rem' }}>
                          No social media
                        </span>
                      )}
                    </td>

                    {/* 3. ASSIGNED CUBE & TYPE */}
                    <td>
                      {r.cube ? (
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>
                            Cube {r.cube.cube_number}
                          </div>
                          <div style={{ marginTop: 3 }}>
                            <span
                              className={`badge ${r.cube.type === 'Pick-up' ? 'pickup' : 'info'}`}
                              style={{ fontSize: '0.7rem' }}
                            >
                              {r.cube.type || 'Display'} Cube
                            </span>
                          </div>
                          <div className="muted" style={{ fontSize: '0.75rem', marginTop: 2 }}>
                            {peso(r.cube.price_per_month)} / mo
                          </div>
                        </div>
                      ) : (
                        <span className="muted" style={{ fontSize: '0.8rem' }}>
                          — (No active cube)
                        </span>
                      )}
                    </td>

                    {/* 4. CONTRACT PERIOD */}
                    <td>
                      {r.contract ? (
                        <div>
                          <div style={{ fontSize: '0.84rem', fontWeight: 600, color: '#334155' }}>
                            {r.contract.start_date} → {r.contract.end_date}
                          </div>
                          <div className="muted" style={{ fontSize: '0.72rem', marginTop: 2 }}>
                            Agreement #{r.contract.contract_id}
                          </div>
                        </div>
                      ) : (
                        <span className="muted" style={{ fontSize: '0.8rem' }}>—</span>
                      )}
                    </td>

                    {/* 5. STATUS & VALIDITY */}
                    <td>
                      <div>
                        {/* Status Badge */}
                        <span
                          className={`badge ${
                            isActive
                              ? 'ok'
                              : isPending
                                ? 'info'
                                : isExpiringSoon
                                  ? 'warn'
                                  : isExpired
                                    ? 'bad'
                                    : 'muted'
                          }`}
                          style={{ fontSize: '0.74rem' }}
                        >
                          {r.contractStatus === 'Pending'
                            ? 'Pending Approval'
                            : r.contractStatus === 'Expiring Soon'
                              ? 'Expiring Soon'
                              : r.contractStatus === 'No Contract'
                                ? 'No Lease'
                                : r.contractStatus}
                        </span>

                        {/* Validity countdown */}
                        {r.contract && (
                          <div style={{ fontSize: '0.75rem', marginTop: 4 }}>
                            {isPending ? (
                              <span className="muted">Awaiting contract approval</span>
                            ) : r.daysLeft !== null ? (
                              r.daysLeft > 0 ? (
                                <span style={{ color: isExpiringSoon ? '#d97706' : '#16a34a', fontWeight: 600 }}>
                                  <Clock size={11} style={{ display: 'inline', marginRight: 3, verticalAlign: 'middle' }} />
                                  {r.daysLeft} day(s) left
                                </span>
                              ) : isContractInGracePeriod(r.contract) ? (
                                <span style={{ color: '#d97706', fontWeight: 700 }}>
                                  <Clock size={11} style={{ display: 'inline', marginRight: 3, verticalAlign: 'middle' }} />
                                  Waiting for Extension ({getGracePeriodDaysLeft(r.contract)}d left)
                                </span>
                              ) : r.daysLeft === 0 ? (
                                <span style={{ color: '#dc2626', fontWeight: 700 }}>Expires today!</span>
                              ) : (
                                <span style={{ color: '#dc2626', fontWeight: 600 }}>
                                  Expired {Math.abs(r.daysLeft)}d ago
                                </span>
                              )
                            ) : null}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* 6. ACTIONS */}
                    <td style={{ textAlign: 'right' }}>
                      <div className="row" style={{ justifyContent: 'flex-end', gap: '0.35rem' }}>
                        <button
                          type="button"
                          className="btn-ghost"
                          style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem' }}
                          onClick={() => setSelectedRenter(r)}
                          title="View complete renter details"
                        >
                          <Eye size={13} /> View
                        </button>
                        <button
                          type="button"
                          className="btn-ghost"
                          style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem' }}
                          onClick={() => openEditModal(r.user)}
                          title="Edit contact info"
                        >
                          <Edit2 size={13} /> Edit
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      <TablePagination page={page} totalItems={filteredRows.length} onPageChange={setPage} />

      {/* Empty State */}
      {!loading && filteredRows.length === 0 && (
        <div className="empty" style={{ marginTop: '1.5rem', padding: '3rem', textAlign: 'center' }}>
          No renter accounts found matching your selected filters.
        </div>
      )}

      {/* ════════════ RENTER DETAILS MODAL ════════════ */}
      {selectedRenter && (
        <div
          className="modal-overlay"
          onClick={() => setSelectedRenter(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
        >
          <div
            className="card"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 580,
              maxHeight: '90vh',
              overflowY: 'auto',
              borderRadius: 16,
              background: '#fff',
              padding: '1.75rem',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
            }}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800 }}>
                    {selectedRenter.user.full_name}
                  </h2>
                  <span className="badge ok" style={{ fontSize: '0.72rem' }}>Renter</span>
                </div>
                <div className="muted" style={{ fontSize: '0.8rem', marginTop: 2 }}>
                  Username: @{selectedRenter.user.username} · ID #{selectedRenter.user.user_id}
                </div>
              </div>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setSelectedRenter(null)}
                style={{ padding: '0.35rem', borderRadius: 8 }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Contact Information Card */}
            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 12,
                padding: '1rem 1.25rem',
                marginBottom: '1.25rem',
              }}
            >
              <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.92rem', fontWeight: 700, color: '#1e293b' }}>
                Contact & Social Media
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {/* Phone */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem' }}>
                    <Phone size={15} color="#2563eb" />
                    <span className="muted" style={{ minWidth: 70 }}>Phone:</span>
                    <strong>{selectedRenter.user.phone_number || '— Not provided'}</strong>
                  </div>
                  {selectedRenter.user.phone_number && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <a
                        href={`tel:${selectedRenter.user.phone_number}`}
                        className="btn-ghost"
                        style={{ padding: '2px 8px', fontSize: '0.75rem', textDecoration: 'none' }}
                      >
                        Call
                      </a>
                      <button
                        type="button"
                        className="btn-ghost"
                        style={{ padding: '2px 8px', fontSize: '0.75rem' }}
                        onClick={() => handleCopy(selectedRenter.user.phone_number || '', 'modal-phone')}
                      >
                        {copiedKey === 'modal-phone' ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Email */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem' }}>
                    <Mail size={15} color="#0891b2" />
                    <span className="muted" style={{ minWidth: 70 }}>Email:</span>
                    <strong>{selectedRenter.user.email || '— Not provided'}</strong>
                  </div>
                  {selectedRenter.user.email && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <a
                        href={`mailto:${selectedRenter.user.email}`}
                        className="btn-ghost"
                        style={{ padding: '2px 8px', fontSize: '0.75rem', textDecoration: 'none' }}
                      >
                        Email
                      </a>
                      <button
                        type="button"
                        className="btn-ghost"
                        style={{ padding: '2px 8px', fontSize: '0.75rem' }}
                        onClick={() => handleCopy(selectedRenter.user.email || '', 'modal-email')}
                      >
                        {copiedKey === 'modal-email' ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Social Link */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem' }}>
                    <Globe size={15} color="#8b5cf6" />
                    <span className="muted" style={{ minWidth: 70 }}>Social:</span>
                    {selectedRenter.user.social_link ? (
                      <span style={{ fontWeight: 600, color: '#6d28d9' }}>
                        {selectedRenter.user.social_link}
                      </span>
                    ) : (
                      <span className="muted">— None</span>
                    )}
                  </div>
                  {selectedRenter.user.social_link && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      {selectedRenter.user.social_link.startsWith('http') && (
                        <a
                          href={selectedRenter.user.social_link}
                          target="_blank"
                          rel="noreferrer"
                          className="btn-ghost"
                          style={{ padding: '2px 8px', fontSize: '0.75rem', textDecoration: 'none' }}
                        >
                          <ExternalLink size={12} /> Open
                        </a>
                      )}
                      <button
                        type="button"
                        className="btn-ghost"
                        style={{ padding: '2px 8px', fontSize: '0.75rem' }}
                        onClick={() => handleCopy(selectedRenter.user.social_link || '', 'modal-social')}
                      >
                        {copiedKey === 'modal-social' ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Assigned Cube Space & Agreement */}
            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 12,
                padding: '1rem 1.25rem',
                marginBottom: '1.5rem',
              }}
            >
              <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.92rem', fontWeight: 700, color: '#1e293b' }}>
                Assigned Cube & Contract Details
              </h3>
              {selectedRenter.cube ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span className="muted">Cube Number:</span>
                    <strong>Cube {selectedRenter.cube.cube_number}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span className="muted">Cube Type:</span>
                    <span className={`badge ${selectedRenter.cube.type === 'Pick-up' ? 'pickup' : 'info'}`}>
                      {selectedRenter.cube.type || 'Display'} Cube
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span className="muted">Monthly Rate:</span>
                    <strong>{peso(selectedRenter.cube.price_per_month)} / month</strong>
                  </div>
                  {selectedRenter.cube.location && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span className="muted">Cube Location:</span>
                      <span>{selectedRenter.cube.location}</span>
                    </div>
                  )}
                  {selectedRenter.contract && (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #cbd5e1', paddingTop: '0.5rem', marginTop: '0.2rem' }}>
                        <span className="muted">Contract Period:</span>
                        <strong>{selectedRenter.contract.start_date} → {selectedRenter.contract.end_date}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className="muted">Status & Validity:</span>
                        <div>
                          <span className={`badge ${selectedRenter.contractStatus === 'Active' ? 'ok' : selectedRenter.contractStatus === 'Pending' ? 'info' : 'warn'}`}>
                            {selectedRenter.contractStatus}
                          </span>
                          {selectedRenter.daysLeft !== null && (
                            <span style={{ marginLeft: 6, fontSize: '0.78rem', fontWeight: 600 }}>
                              ({selectedRenter.daysLeft > 0 ? `${selectedRenter.daysLeft} days remaining` : 'Expired'})
                            </span>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="muted" style={{ fontSize: '0.84rem' }}>
                  This renter does not have an active cube space lease agreement yet.
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  const u = selectedRenter.user
                  setSelectedRenter(null)
                  openEditModal(u)
                }}
              >
                <Edit2 size={14} /> Edit Contact Info
              </button>
              {selectedRenter.contract && isOwnerOrStaff && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setSelectedRenter(null)
                    nav('/contracts')
                  }}
                >
                  <FileText size={14} /> Open in Contracts
                </button>
              )}
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setSelectedRenter(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════ EDIT CONTACT MODAL ════════════ */}
      {editingRenter && (
        <div
          className="modal-overlay"
          onClick={() => setEditingRenter(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
        >
          <div
            className="card"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 480,
              borderRadius: 16,
              background: '#fff',
              padding: '1.75rem',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>
                Edit Renter Contact Info
              </h2>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setEditingRenter(null)}
                style={{ padding: '0.35rem', borderRadius: 8 }}
              >
                <X size={18} />
              </button>
            </div>

            <p className="muted" style={{ fontSize: '0.84rem', marginTop: 0, marginBottom: '1.25rem' }}>
              Update contact number and social media profile for <strong>{editingRenter.full_name}</strong>.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                void handleSaveContact()
              }}
            >
              <div className="field">
                <label>Contact Phone Number</label>
                <input
                  type="tel"
                  placeholder="e.g. 09171234567 or +63 917 123 4567"
                  value={editForm.phone_number}
                  onChange={(e) => setEditForm({ ...editForm, phone_number: e.target.value })}
                />
              </div>

              <div className="field">
                <label>Social Media (Facebook / Instagram / TikTok link)</label>
                <input
                  type="text"
                  placeholder="e.g. https://facebook.com/renter.store or @renter_ph"
                  value={editForm.social_link}
                  onChange={(e) => setEditForm({ ...editForm, social_link: e.target.value })}
                />
              </div>

              <div className="field">
                <label>Email Address</label>
                <input
                  type="email"
                  placeholder="renter@example.com"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                />
              </div>

              <div className="row" style={{ justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.5rem' }}>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setEditingRenter(null)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button type="submit" className="btn" disabled={saving}>
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  )
}
