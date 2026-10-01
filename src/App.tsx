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
import TermsPage from './pages/TermsPage'
import PrivacyPage from './pages/PrivacyPage'
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [adminSidebarOpen, setAdminSidebarOpen] = useState(false)

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

  // ════════════ ADMIN / OWNER / STAFF LEFT SIDEBAR LAYOUT ════════════
  if (isAdmin) {
    return (
      <div className="admin-shell">
        {/* Mobile Admin Header */}
        <header className="admin-mobile-header no-print">
          <button
            type="button"
            className="hamburger-btn"
            onClick={() => setAdminSidebarOpen(!adminSidebarOpen)}
            aria-label="Toggle navigation menu"
          >
            ☰
          </button>
          <div className="admin-sidebar-brand" style={{ padding: 0 }}>
            <img src="/TrackErentory.svg" alt="TrackErentory" className="brand-logo" />
            <span>Track<span>Erentory</span></span>
          </div>
          <span className="badge info" style={{ fontSize: '0.75rem' }}>{role}</span>
        </header>

        {/* Sidebar Overlay on mobile */}
        {adminSidebarOpen && (
          <div
            className="admin-sidebar-overlay no-print"
            onClick={() => setAdminSidebarOpen(false)}
          />
        )}

        <aside className={`admin-sidebar ${adminSidebarOpen ? 'open' : ''}`}>
          <Link
            to={role === 'Owner' ? '/owner' : '/pickup'}
            className="admin-sidebar-brand"
            onClick={() => setAdminSidebarOpen(false)}
          >
            <img src="/TrackErentory.svg" alt="TrackErentory" className="brand-logo" />
            <span>Track<span>Erentory</span></span>
          </Link>

          <div className="admin-nav-group">
            <div className="admin-nav-label">Management</div>
            {role === 'Owner' && (
              <NavLink
                to="/owner"
                className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}
                onClick={() => setAdminSidebarOpen(false)}
              >
                📊 Sales & Reports
              </NavLink>
            )}
            <NavLink
              to="/pickup"
              className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}
              onClick={() => setAdminSidebarOpen(false)}
            >
              📦 Pickup Tracking
            </NavLink>
            <NavLink
              to="/display-tracking"
              className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}
              onClick={() => setAdminSidebarOpen(false)}
            >
              🏬 Display Tracking
            </NavLink>
            <NavLink
              to="/owner-products"
              className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}
              onClick={() => setAdminSidebarOpen(false)}
            >
              🏷️ Products Management
            </NavLink>
            <NavLink
              to="/cubes"
              className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}
              onClick={() => setAdminSidebarOpen(false)}
            >
              🧊 Cube Management
            </NavLink>
            {role === 'Owner' && (
              <NavLink
                to="/contracts"
                className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}
                onClick={() => setAdminSidebarOpen(false)}
              >
                📜 Contracts
              </NavLink>
            )}
            {role === 'Owner' && (
              <NavLink
                to="/staff"
                className={({ isActive }) => `admin-nav-item ${isActive ? 'active' : ''}`}
                onClick={() => setAdminSidebarOpen(false)}
              >
                👥 Staff Accounts
              </NavLink>
            )}
          </div>

          <div className="admin-user-card">
            <div className="admin-user-info">
              <strong>{user?.full_name || 'Admin'}</strong>
              <span>{user?.role || 'Staff'} Dashboard</span>
            </div>
            <button
              className="btn-ghost"
              style={{ width: '100%', justifyContent: 'center' }}
              type="button"
              onClick={() => signOut()}
            >
              Sign Out
            </button>
          </div>
        </aside>

        <main className="admin-main">
          {notices.length > 0 && (
            <div className="alert warn no-print">
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
            <Route path="/pickup" element={<TransactionsPage defaultFilter="Pick-up" pageTitle="Pickup Tracking" />} />
            <Route path="/display-tracking" element={<TransactionsPage defaultFilter="Display" pageTitle="Display Tracking" />} />
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
        <Link to="/" className="brand" onClick={() => setMobileMenuOpen(false)}>
          <img src="/TrackErentory.svg" alt="TrackErentory" className="brand-logo" />
          <span className="brand-text">Track<span>Erentory</span></span>
        </Link>

        {/* Mobile Hamburger Button */}
        <button
          type="button"
          className="hamburger-btn no-print"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle Navigation"
        >
          {mobileMenuOpen ? '✕' : '☰'}
        </button>

        <div className={`nav-links ${mobileMenuOpen ? 'mobile-open' : ''}`}>
          <NavLink to="/" onClick={() => setMobileMenuOpen(false)}>Catalogue</NavLink>
          <NavLink to="/services" onClick={() => setMobileMenuOpen(false)}>Services</NavLink>
          <NavLink to="/about" onClick={() => setMobileMenuOpen(false)}>About</NavLink>
          {role === 'Customer' && <NavLink to="/reservations" onClick={() => setMobileMenuOpen(false)}>Reservations</NavLink>}
          {role === 'Renter' && <NavLink to="/renter" onClick={() => setMobileMenuOpen(false)}>Renter</NavLink>}
          {role === 'Renter' && <NavLink to="/contracts" onClick={() => setMobileMenuOpen(false)}>Contracts</NavLink>}
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
          <div className="alert warn no-print">
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
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/reservations" element={<ReservationsPage />} />
          <Route path="/renter" element={<RenterDashboard />} />
          <Route path="/contracts" element={<ContractsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
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
              <li><Link to="/terms">Terms & Conditions</Link></li>
              <li><Link to="/privacy">Privacy Policy</Link></li>
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
