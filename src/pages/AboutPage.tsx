import { MapPin, Clock, ExternalLink, BookmarkCheck, Video, ShoppingBag, Store, UserCheck, Info } from 'lucide-react'

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

      {/* ════════════ PRODUCT RESERVATION HIGHLIGHT ════════════ */}
      <h2>PRODUCT RESERVATION</h2>
      <div
        className="panel"
        style={{
          padding: '2rem',
          marginBottom: '2.5rem',
          background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
          border: '1px solid #e2e8f0',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1.25rem', flexWrap: 'wrap' }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 14,
              background: '#000000',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <BookmarkCheck size={26} />
          </div>
          <div style={{ flex: 1, minWidth: 'min(100%, 280px)' }}>
            <span
              style={{
                display: 'inline-block',
                background: '#e0e7ff',
                color: '#4338ca',
                fontWeight: 800,
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                padding: '0.25rem 0.65rem',
                borderRadius: 999,
                marginBottom: '0.5rem',
              }}
            >
              Online Store Feature
            </span>
            <h3 style={{ fontSize: '1.5rem', margin: '0 0 0.5rem', color: '#0f172a' }}>
              Reserve Your Desired Product Online
            </h3>
            <p style={{ fontSize: '1.08rem', color: '#334155', fontWeight: 600, lineHeight: 1.6, margin: '0 0 1rem' }}>
              &ldquo;Reserve your desired product online and claim it in-store within the specified time limit.&rdquo;
            </p>
            <p className="muted" style={{ lineHeight: 1.7, margin: 0 }}>
              Browse real-time products displayed in physical rental cubes from home. Customer accounts can lock an item with a 1-to-4 hour hold to ensure it won&apos;t be sold to walk-in shoppers while you travel to the store to claim it.
            </p>
          </div>
        </div>
      </div>

      {/* ════════════ HOW PICK-UP WORKS GUIDE ════════════ */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h2>HOW PICK-UP WORKS</h2>
        <span className="muted" style={{ fontSize: '0.88rem', fontWeight: 600 }}>
          Counter Handover & Claiming Workflow
        </span>
      </div>

      <div style={{ marginBottom: '2.5rem' }}>
        <p className="muted" style={{ lineHeight: 1.6, marginTop: 0, marginBottom: '1.5rem' }}>
          A secure physical drop-off and pickup counter designed for online live sellers, social media merchants, and pre-ordered products.
        </p>

        {/* 4 Steps Grid */}
        <div
          className="grid"
          style={{
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '1.25rem',
            marginBottom: '1.5rem',
          }}
        >
          {/* Step 1 */}
          <div
            className="panel"
            style={{
              padding: '1.5rem',
              display: 'flex',
              flexDirection: 'column',
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              position: 'relative',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <span
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: '50%',
                  background: '#000000',
                  color: '#ffffff',
                  fontWeight: 900,
                  fontSize: '0.9rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                1
              </span>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: '#f1f5f9',
                  color: '#0f172a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Video size={18} />
              </div>
            </div>
            <h3 style={{ fontSize: '1.15rem', margin: '0 0 0.4rem', fontWeight: 800 }}>Renter Online Sale</h3>
            <span className="muted" style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.6rem' }}>
              On-Hand Inventory
            </span>
            <p className="muted" style={{ fontSize: '0.88rem', lineHeight: 1.65, margin: 0 }}>
              The renter sells items on-hand (via Facebook live, TikTok, social media posts, or direct messages) such as clothes, bags, shoes, accessories, or snacks. The item is currently with the seller and not yet at the physical store.
            </p>
          </div>

          {/* Step 2 */}
          <div
            className="panel"
            style={{
              padding: '1.5rem',
              display: 'flex',
              flexDirection: 'column',
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              position: 'relative',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <span
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: '50%',
                  background: '#000000',
                  color: '#ffffff',
                  fontWeight: 900,
                  fontSize: '0.9rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                2
              </span>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: '#fef3c7',
                  color: '#b45309',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ShoppingBag size={18} />
              </div>
            </div>
            <h3 style={{ fontSize: '1.15rem', margin: '0 0 0.4rem', fontWeight: 800 }}>Buyer Mines Item</h3>
            <span className="muted" style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.6rem' }}>
              Direct Agreement
            </span>
            <p className="muted" style={{ fontSize: '0.88rem', lineHeight: 1.65, margin: 0 }}>
              The customer mines or orders the item directly with the renter. The renter and buyer agree on in-store pick-up as the handover option.
            </p>
          </div>

          {/* Step 3 */}
          <div
            className="panel"
            style={{
              padding: '1.5rem',
              display: 'flex',
              flexDirection: 'column',
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              position: 'relative',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <span
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: '50%',
                  background: '#000000',
                  color: '#ffffff',
                  fontWeight: 900,
                  fontSize: '0.9rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                3
              </span>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: '#e0e7ff',
                  color: '#4338ca',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Store size={18} />
              </div>
            </div>
            <h3 style={{ fontSize: '1.15rem', margin: '0 0 0.4rem', fontWeight: 800 }}>Renter Store Drop-off</h3>
            <span className="muted" style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.6rem' }}>
              Cube / Counter Handover
            </span>
            <p className="muted" style={{ fontSize: '0.88rem', lineHeight: 1.65, margin: 0 }}>
              The renter visits TrackErentory, leaves the labeled package in their assigned rental cube, and logs the customer name, price, alternate claimer, and payment details in the system.
            </p>
          </div>

          {/* Step 4 */}
          <div
            className="panel"
            style={{
              padding: '1.5rem',
              display: 'flex',
              flexDirection: 'column',
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              position: 'relative',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <span
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: '50%',
                  background: '#000000',
                  color: '#ffffff',
                  fontWeight: 900,
                  fontSize: '0.9rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                4
              </span>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: '#dcfce7',
                  color: '#15803d',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <UserCheck size={18} />
              </div>
            </div>
            <h3 style={{ fontSize: '1.15rem', margin: '0 0 0.4rem', fontWeight: 800 }}>Buyer Claims In-Store</h3>
            <span className="muted" style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.6rem' }}>
              Counter Claim & Release
            </span>
            <p className="muted" style={{ fontSize: '0.88rem', lineHeight: 1.65, margin: 0 }}>
              The buyer visits the physical store, states their name or authorized alternate, settles any pending payment with store staff, and claims their package safely!
            </p>
          </div>
        </div>

        {/* Important Notes Callout Panel */}
        <div
          style={{
            padding: '1.35rem 1.75rem',
            borderRadius: 16,
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '1rem',
          }}
        >
          <div style={{ color: '#0ea5e9', marginTop: 3 }}>
            <Info size={22} />
          </div>
          <div style={{ fontSize: '0.9rem', lineHeight: 1.7, color: '#475569' }}>
            <strong style={{ color: '#0f172a', display: 'block', marginBottom: '0.25rem' }}>
              Key Operational Guidelines for Pick-up Items:
            </strong>
            <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
              <li>
                <strong>Not on Retail Display:</strong> Pick-up products are kept safely in the renter&apos;s assigned cube or staff holding area solely for the designated buyer, rather than open retail display.
              </li>
              <li>
                <strong>No System Account Required for Buyers:</strong> Buyers purchase directly from the renter outside the system. Store staff track their pickup using the buyer name and authorized alternate recorded by the renter.
              </li>
              <li>
                <strong>Versatile Inventory:</strong> Perfect for clothes, pre-ordered food and snacks, custom shoes, accessories, or baked items.
              </li>
            </ul>
          </div>
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
              Osmeña Drive, Poblacion, Kidapawan City, North Cotabato. Besides J&T and near Convenience Store.
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
