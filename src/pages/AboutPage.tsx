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
            <div style={{ display: 'inline-block', background: 'rgba(57, 181, 74, 0.1)', color: 'var(--accent)', fontWeight: 800, fontSize: '0.8rem', padding: '0.35rem 0.75rem', borderRadius: 999, marginBottom: '1rem', textTransform: 'uppercase' }}>
              📍 Physical Store Location
            </div>
            <h3 style={{ fontSize: '1.5rem', margin: '0 0 0.75rem' }}>TrackErentory Concept & Rental Hub</h3>
            <p style={{ color: '#444', lineHeight: 1.7, fontSize: '1rem', marginBottom: '1.25rem' }}>
              Unit 102, Ground Floor, Commercial Center Plaza,<br />
              Rizal Avenue, Metro Manila, Philippines
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.92rem', color: '#555' }}>
              <div>
                <strong>🕒 Operating Hours:</strong> Monday to Sunday, 9:00 AM – 8:00 PM
              </div>
              <div>
                <strong>📞 Contact Number:</strong> +63 917 123 4567 / (02) 8123 4567
              </div>
              <div>
                <strong>✉️ Email:</strong> support@trackerentory.com
              </div>
              <div>
                <strong>💬 Messenger / Socials:</strong> m.me/TrackErentoryOfficial
              </div>
            </div>

            <div style={{ marginTop: '1.5rem' }}>
              <a
                href="https://maps.google.com/?q=Manila+Philippines"
                target="_blank"
                rel="noreferrer"
                className="btn"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
              >
                🗺️ Open in Google Maps
              </a>
            </div>
          </div>

          <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid #e5e5e5', height: 320, background: '#eee' }}>
            <iframe
              title="TrackErentory Store Location"
              src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d123536.6534571932!2d120.94454029286064!3d14.596495713437597!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3397ca03571ec38b%3A0x69d1d5751069c11f!2sManila%2C%20Metro%20Manila!5e0!3m2!1sen!2sph!4v1700000000000!5m2!1sen!2sph"
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
