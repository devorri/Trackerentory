import { Link } from 'react-router-dom'

export default function ServicesPage() {
  const services = [
    {
      title: 'Cube Rental Management',
      badge: 'For Owners & Renters',
      desc: 'Browse available Pick-up & Display cubes, check monthly rental rates, reserve spaces for 1–12 months, and receive automated contract expiration notices.',
      link: '/cubes',
      action: 'Explore Cubes',
    },
    {
      title: 'Product Catalog & Reservations',
      badge: 'For Customers',
      desc: 'Discover products with live stock counts, variants, and high-res photos. Reserve items online with custom 1–4 hour validity before store pick-up.',
      link: '/',
      action: 'Browse Products',
    },
    {
      title: 'Pick-up & Payment Tracking',
      badge: 'For Staff & Owners',
      desc: 'Monitor product pick-ups, track payment statuses (Pending / Paid), record authorized alternate pick-up persons, and upload receipt proof.',
      link: '/pickup',
      action: 'View Pickups',
    },
    {
      title: 'Monthly Sales & Income Reports',
      badge: 'For Owners',
      desc: 'Generate monthly breakdown reports for rental income, Display product sales, and Pick-up product sales before issuing renter payouts.',
      link: '/owner',
      action: 'View Sales',
    },
  ]

  return (
    <section>
      <div className="hero-strip">
        <h1>
          OUR <span className="highlight">PREMIUM SERVICES</span> & SOLUTIONS.
        </h1>
        <p>
          End-to-end management solutions tailored for physical store owners, cube renters, and retail shoppers.
        </p>
      </div>

      <h2>SERVICES WE OFFER</h2>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))' }}>
        {services.map((s, i) => (
          <div className="card" key={i} style={{ padding: '1.75rem', justifyContent: 'space-between' }}>
            <div>
              <span className="product-badge" style={{ marginBottom: '0.75rem' }}>{s.badge}</span>
              <h3 style={{ fontSize: '1.35rem', margin: '0.5rem 0' }}>{s.title}</h3>
              <p className="muted" style={{ lineHeight: 1.6, marginBottom: '1.5rem' }}>{s.desc}</p>
            </div>
            <div>
              <Link to={s.link} className="btn-ghost" style={{ width: '100%', justifyContent: 'space-between' }}>
                <span>{s.action}</span>
                <span>→</span>
              </Link>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
