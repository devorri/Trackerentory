import { MapPin, Clock, ExternalLink } from 'lucide-react'

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
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', marginBottom: '2.5rem' }}>
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
            Built-in email OTP two-way verification and secure role-based access control (Owner, Staff, Renter, Customer) ensure complete transparency and data integrity across every transaction.
          </p>
        </div>
      </div>

      {/* ════════════ STORE LOCATION & HOURS ════════════ */}
      <h2>VISIT OUR STORE LOCATION</h2>
      <div className="panel" style={{ padding: '2rem', marginBottom: '2.5rem' }}>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem', alignItems: 'center' }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: 'rgba(57, 181, 74, 0.1)', color: 'var(--accent)', fontWeight: 800, fontSize: '0.8rem', padding: '0.35rem 0.75rem', borderRadius: 999, marginBottom: '1rem', textTransform: 'uppercase' }}>
              <MapPin size={14} /> Physical Store Location
            </div>
            <h3 style={{ fontSize: '1.5rem', margin: '0 0 0.75rem' }}>TrackErentory</h3>
            <p style={{ color: '#444', lineHeight: 1.7, fontSize: '1rem', marginBottom: '1.25rem' }}>
              Osmeña Drive, Poblacion, Kidapawan City, North Cotabato
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.92rem', color: '#555' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <Clock size={16} /> <strong>Operating Hours:</strong> Monday to Saturday, 9 AM - 8PM
              </div>
            </div>

            <div style={{ marginTop: '1.5rem' }}>
              <a
                href="https://maps.google.com/?q=Osme%C3%B1a+Drive,+Poblacion,+Kidapawan+City,+North+Cotabato"
                target="_blank"
                rel="noreferrer"
                className="btn"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
              >
                <ExternalLink size={16} /> Open in Google Maps
              </a>
            </div>
          </div>

          <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid #e5e5e5', height: 320, background: '#eee' }}>
            <iframe
              title="TrackErentory Store Location"
              src="https://www.google.com/maps?q=Osme%C3%B1a%20Drive%2C%20Poblacion%2C%20Kidapawan%20City%2C%20North%20Cotabato&output=embed"
              width="100%"
              height="100%"
              style={{ border: 0 }}
              allowFullScreen={false}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            ></iframe>
          </div>
        </div>
      </div>
    </section>
  )
}
