import { Link } from 'react-router-dom'

export default function AboutPage() {
  return (
    <section>
      <div className="hero-strip">
        <h1>
          ABOUT <span className="highlight">TRACKERENTORY</span> SYSTEM.
        </h1>
        <p>
          Empowering physical shop owners, cube renters, and shoppers with real-time inventory management, automated reservations, and seamless pick-up tracking.
        </p>
      </div>

      <h2>OUR MISSION & VISION</h2>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        <div className="panel">
          <h3 style={{ fontSize: '1.4rem', marginBottom: '0.75rem' }}>Simplified Cube Rentals</h3>
          <p className="muted" style={{ lineHeight: 1.7 }}>
            TrackErentory revolutionizes physical retail micro-spaces by enabling store owners to manage cube availability, calculate rental income, and automate contract expiration notifications for renters.
          </p>
        </div>

        <div className="panel">
          <h3 style={{ fontSize: '1.4rem', marginBottom: '0.75rem' }}>Real-time Pick-up Tracking</h3>
          <p className="muted" style={{ lineHeight: 1.7 }}>
            Never lose track of customer orders again. Our system monitors customer reservations, authorized alternate pickup individuals, payment status, and staff processing records in real-time.
          </p>
        </div>

        <div className="panel">
          <h3 style={{ fontSize: '1.4rem', marginBottom: '0.75rem' }}>Automated Verification</h3>
          <p className="muted" style={{ lineHeight: 1.7 }}>
            Built-in email OTP verification and secure role-based access control (Owner, Staff, Renter, Customer) ensure complete transparency and data integrity across every transaction.
          </p>
        </div>
      </div>

      <div style={{ background: '#f4f5f7', borderRadius: 28, padding: '3rem 2rem', textAlign: 'center', marginTop: '2rem' }}>
        <h2 style={{ marginTop: 0 }}>READY TO GROW YOUR RENTAL BUSINESS?</h2>
        <p className="muted" style={{ maxWidth: 500, margin: '0.5rem auto 1.5rem' }}>
          Join hundreds of micro-retailers managing their products and cube spaces effortlessly.
        </p>
        <Link to="/login" className="btn">GET STARTED NOW</Link>
      </div>
    </section>
  )
}
