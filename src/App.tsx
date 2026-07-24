import { Link, NavLink, Routes, Route, Navigate } from 'react-router-dom'
import './App.css'
import ProductsPage from './pages/ProductsPage'
import ReservationsPage from './pages/ReservationsPage'
import RenterDashboard from './pages/RenterDashboard'
import OwnerDashboard from './pages/OwnerDashboard'
import CubeManagement from './pages/CubeManagement'
import ContractsPage from './pages/ContractsPage'
import TransactionsPage from './pages/TransactionsPage'
import LoginPage from './pages/LoginPage'
import StaffManagement from './pages/StaffManagement'
import { AuthProvider, useAuth } from './context/Auth'
import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { daysUntil, type Contract } from './lib/types'
import { cancelExpiredReservations, expireContracts } from './lib/maintenance'

function App() {
  return (
    <AuthProvider>
      <InnerApp />
    </AuthProvider>
  )
}

function InnerApp() {
  const { user, loading, signOut } = useAuth()
  const [notices, setNotices] = useState<string[]>([])

  useEffect(() => {
    void cancelExpiredReservations()
    void expireContracts()
  }, [])

  useEffect(() => {
    if (!user || (user.role !== 'Renter' && user.role !== 'Owner')) {
      setNotices([])
      return
    }
    let q = supabase.from('contracts').select('*, cubes(*)').eq('status', 'Active')
    if (user.role === 'Renter') q = q.eq('renter_id', user.user_id)
    void q.then(({ data }) => {
      const msgs: string[] = []
      for (const c of (data || []) as Contract[]) {
        const left = daysUntil(c.end_date)
        if (left <= 7 && left >= 0) {
          msgs.push(
            `Contract for cube ${c.cubes?.cube_number ?? c.cube_id} expires in ${left} day(s) (${c.end_date}).`,
          )
        }
      }
      setNotices(msgs)
    })
  }, [user])

  if (loading) {
    return <div className="loading-screen">TrackErentory</div>
  }

  const role = user?.role

  return (
    <div className="app-shell">
      <nav className="top-nav">
        <Link to="/" className="brand">
          <img src="/TrackErentory.svg" alt="TrackErentory" className="brand-logo" />
          <span className="brand-text">Track<span>Erentory</span></span>
        </Link>
        <div className="nav-links">
          {(role === 'Customer' || !user) && <NavLink to="/">Products</NavLink>}
          {role === 'Customer' && <NavLink to="/reservations">Reservations</NavLink>}
          {role === 'Renter' && <NavLink to="/renter">Renter</NavLink>}
          {role === 'Renter' && <NavLink to="/contracts">Contracts</NavLink>}
          {(role === 'Staff' || role === 'Owner' || role === 'Renter') && (
            <NavLink to="/pickup">Pickup</NavLink>
          )}
          {role === 'Owner' && <NavLink to="/owner">Sales</NavLink>}
          {role === 'Owner' && <NavLink to="/staff">Staff</NavLink>}
          {role === 'Owner' && <NavLink to="/cubes">Cubes</NavLink>}
          {role === 'Owner' && <NavLink to="/contracts">Contracts</NavLink>}
        </div>
        <div className="nav-user">
          {user ? (
            <>
              <div className="nav-user-meta">
                <strong>{user.full_name}</strong>
                <span>{user.role}</span>
              </div>
              <button className="btn-ghost" type="button" onClick={() => signOut()}>Sign out</button>
            </>
          ) : (
            <Link className="btn" to="/login">Sign in</Link>
          )}
        </div>
      </nav>

      <main>
        {notices.length > 0 && (
          <div className="alert warn">
            <strong>Contract expiry notice</strong>
            <ul style={{ margin: '0.55rem 0 0', paddingLeft: 18 }}>
              {notices.map((n) => <li key={n}>{n}</li>)}
            </ul>
          </div>
        )}

        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<ProductsPage />} />
          <Route path="/reservations" element={<ReservationsPage />} />
          <Route path="/renter" element={<RenterDashboard />} />
          <Route path="/owner" element={<OwnerDashboard />} />
          <Route path="/cubes" element={<CubeManagement />} />
          <Route path="/contracts" element={<ContractsPage />} />
          <Route path="/pickup" element={<TransactionsPage />} />
          <Route path="/transactions" element={<Navigate to="/pickup" replace />} />
          <Route path="/staff" element={<StaffManagement />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
