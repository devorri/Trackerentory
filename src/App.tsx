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
import AboutPage from './pages/AboutPage'
import ServicesPage from './pages/ServicesPage'
import OwnerProductsPage from './pages/OwnerProductsPage'
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
  const [promoEmail, setPromoEmail] = useState('')

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
  const isAdmin = role === 'Owner' || role === 'Staff'

  // ════════════ ADMIN / OWNER LEFT SIDEBAR LAYOUT ════════════
  if (isAdmin) {
    return (
      <div className="admin-shell">
        <aside className="admin-sidebar">
          <Link to={role === 'Owner' ? '/owner' : '/pickup'} className="admin-sidebar-brand">
            <img src="/TrackErentory.svg" alt="TrackErentory" className="brand-logo" />
            <span>Track<span>Erentory</span></span>
          </Link>

          <div className="admin-nav-group">
            <div className="admin-nav-label">Management</div>
            {role === 'Owner' && (
              <NavLink to="/owner" className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}>
                Sales & Reports
              </NavLink>
            )}
            {(role === 'Owner' || role === 'Staff') && (
              <NavLink to="/pickup" className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}>
                Pickup Tracking
              </NavLink>
            )}
            {(role === 'Owner' || role === 'Staff') && (
              <NavLink to="/owner-products" className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}>
                Products Management
              </NavLink>
            )}
            {role === 'Owner' && (
              <NavLink to="/cubes" className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}>
                Cube Management
              </NavLink>
            )}
            {role === 'Owner' && (
              <NavLink to="/contracts" className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}>
                Contracts
              </NavLink>
            )}
            {role === 'Owner' && (
              <NavLink to="/staff" className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}>
                Staff Accounts
              </NavLink>
            )}
          </div>

          <div className="admin-user-card">
            <div className="admin-user-info">
              <strong>{user?.full_name || 'Admin'}</strong>
              <span>{user?.role || 'Owner'} Dashboard</span>
            </div>
            <button className="btn-ghost" style={{ width: '100%', justifyContent: 'center' }} type="button" onClick={() => signOut()}>
              Sign Out
            </button>
          </div>
        </aside>

        <main className="admin-main">
          {notices.length > 0 && (
            <div className="alert warn">
              <strong>Contract expiry notice</strong>
              <ul style={{ margin: '0.55rem 0 0', paddingLeft: 18 }}>
                {notices.map((n) => <li key={n}>{n}</li>)}
              </ul>
            </div>
          )}

          <Routes>
            <Route path="/owner" element={<OwnerDashboard />} />
            <Route path="/owner-products" element={<OwnerProductsPage />} />
            <Route path="/cubes" element={<CubeManagement />} />
            <Route path="/contracts" element={<ContractsPage />} />
            <Route path="/pickup" element={<TransactionsPage />} />
            <Route path="/staff" element={<StaffManagement />} />
            <Route path="*" element={<Navigate to={role === 'Owner' ? '/owner' : '/pickup'} replace />} />
          </Routes>
        </main>
      </div>
    )
  }

  // ════════════ PUBLIC / STOREFRONT / RENTER LAYOUT ════════════
  return (
    <div className="app-shell">
      <nav className="top-nav">
        <Link to="/" className="brand">
          <img src="/TrackErentory.svg" alt="TrackErentory" className="brand-logo" />
          <span className="brand-text">Track<span>Erentory</span></span>
        </Link>
        <div className="nav-links">
          <NavLink to="/">Catalogue</NavLink>
          <NavLink to="/services">Services</NavLink>
          <NavLink to="/about">About</NavLink>
          {role === 'Customer' && <NavLink to="/reservations">Reservations</NavLink>}
          {role === 'Renter' && <NavLink to="/renter">Renter</NavLink>}
          {role === 'Renter' && <NavLink to="/contracts">Contracts</NavLink>}
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
          <Route path="/services" element={<ServicesPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/reservations" element={<ReservationsPage />} />
          <Route path="/renter" element={<RenterDashboard />} />
          <Route path="/contracts" element={<ContractsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>

        {/* Promo Community Banner */}
        <section className="promo-banner no-print">
          <h2>Join Rental Community To Get Monthly Updates</h2>
          <p>Type your email down below and stay updated with available display & pick-up cubes!</p>
          <form className="promo-form" onSubmit={(e) => {
            e.preventDefault()
            if (promoEmail) {
              alert('Thank you for subscribing!')
              setPromoEmail('')
            }
          }}>
            <input
              type="email"
              placeholder="Add your email here"
              value={promoEmail}
              onChange={(e) => setPromoEmail(e.target.value)}
              required
            />
            <button type="submit">SEND</button>
          </form>
        </section>
      </main>

      {/* Solid Black Editorial Footer */}
      <footer className="site-footer no-print">
        <div className="footer-grid">
          <div>
            <div className="footer-brand">TrackErentory</div>
            <p className="footer-desc">
              Complete inventory and cube rental management platform for owners, renters, staff, and customers.
            </p>
          </div>
          <div className="footer-col">
            <h4>Company</h4>
            <ul>
              <li><Link to="/">Catalogue</Link></li>
              <li><Link to="/services">Services</Link></li>
              <li><Link to="/about">About Us</Link></li>
            </ul>
          </div>
          <div className="footer-col">
            <h4>Quick Link</h4>
            <ul>
              <li><Link to="/reservations">Reservations</Link></li>
              <li><Link to="/contracts">Contracts</Link></li>
              <li><Link to="/login">Account Sign In</Link></li>
            </ul>
          </div>
          <div className="footer-col">
            <h4>Legal</h4>
            <ul>
              <li><a href="#terms">Terms & Conditions</a></li>
              <li><a href="#privacy">Privacy Policy</a></li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <div>© {new Date().getFullYear()} TrackErentory. All rights reserved.</div>
          <div>Smart Inventory & Cube Rental System</div>
        </div>
      </footer>
    </div>
  )
}

export default App
