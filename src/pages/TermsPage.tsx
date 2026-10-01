import { Link } from 'react-router-dom'

export default function TermsPage() {
  return (
    <section>
      <div className="hero-strip">
        <h1>
          TERMS & <span className="highlight">CONDITIONS</span>.
        </h1>
        <p>
          Please review the terms and rules governing the use of TrackErentory cube rental, product listings, reservations, and inventory management services.
        </p>
      </div>

      <div className="panel" style={{ padding: '2.5rem', lineHeight: 1.8, color: '#333' }}>
        <p className="muted" style={{ fontSize: '0.85rem' }}>
          Last updated: October 2026
        </p>

        <h2 style={{ marginTop: '1.5rem', color: '#000' }}>1. Agreement to Terms</h2>
        <p>
          By accessing or using the TrackErentory platform, physical cube rental spaces, product catalog, and reservation system, you agree to be bound by these Terms and Conditions. If you do not agree with any part of these terms, you may not use our services.
        </p>

        <h2 style={{ marginTop: '1.5rem', color: '#000' }}>2. Role-Based Account Responsibilities</h2>
        <p>
          TrackErentory operates with specialized account tiers: <strong>Owner</strong>, <strong>Staff</strong>, <strong>Renter</strong>, and <strong>Customer</strong>.
        </p>
        <ul style={{ paddingLeft: '1.5rem' }}>
          <li>
            <strong>Account Security:</strong> You are responsible for safeguarding your login credentials. Two-Factor Authentication (2FA) via email OTP is required to protect your account.
          </li>
          <li>
            <strong>Password Standards:</strong> All passwords must contain at least 8 characters, including uppercase, lowercase, numbers, and special symbols.
          </li>
          <li>
            <strong>Accurate Information:</strong> Users agree to provide truthful and up-to-date contact information, including active email addresses and mobile numbers.
          </li>
        </ul>

        <h2 style={{ marginTop: '1.5rem', color: '#000' }}>3. Cube Rental Agreements & Tenancy</h2>
        <p>
          Renters lease designated physical cubes (Display or Pick-up) within the physical store under agreed contract terms:
        </p>
        <ul style={{ paddingLeft: '1.5rem' }}>
          <li>
            <strong>Display Cubes:</strong> Dedicated spaces for displaying merchandise for direct customer inspection and over-the-counter sales.
          </li>
          <li>
            <strong>Pick-up Cubes:</strong> Secured holding cubicles for pre-arranged customer collection, alternate claim authorization, and parcels.
          </li>
          <li>
            <strong>Contract Expiry & Renewal:</strong> Renters must renew contracts prior to the expiration date. Unrenewed cubes may be released to the public catalogue after a grace period.
          </li>
          <li>
            <strong>Rental Fees:</strong> Monthly rental payments are due in advance according to the contracted rate.
          </li>
        </ul>

        <h2 style={{ marginTop: '1.5rem', color: '#000' }}>4. Product Listings & Prohibited Items</h2>
        <p>
          Renters and store managers must ensure all items placed in cubes comply with local laws and platform standards. The following items are strictly prohibited:
        </p>
        <ul style={{ paddingLeft: '1.5rem' }}>
          <li>Illegal substances, narcotics, or unlicensed pharmaceuticals.</li>
          <li>Weapons, explosives, flammable, or hazardous chemicals.</li>
          <li>Counterfeit goods, pirated merchandise, or stolen property.</li>
          <li>Perishable food items that are prone to spoilage without refrigeration.</li>
        </ul>

        <h2 style={{ marginTop: '1.5rem', color: '#000' }}>5. Product Reservations & Pickups</h2>
        <p>
          Customers may reserve available products or cubes through our online catalogue:
        </p>
        <ul style={{ paddingLeft: '1.5rem' }}>
          <li>
            <strong>Reservation Validity:</strong> Reservations are valid for a specified window (typically 24 hours). Items not claimed within this period automatically return to available stock.
          </li>
          <li>
            <strong>Exclusivity:</strong> Items with active reservations are locked and cannot be reserved or claimed by other shoppers.
          </li>
          <li>
            <strong>Authorized Alternate:</strong> For pick-up cubes, the designated buyer may authorize an alternate individual to claim the goods upon verification.
          </li>
        </ul>

        <h2 style={{ marginTop: '1.5rem', color: '#000' }}>6. Sales Records, Payouts & Receipts</h2>
        <p>
          Store owners and staff track product sales and payments daily. For online or bank transfer payments, valid receipt images must be attached. Payouts to renters are calculated against verified sales records and matched before release.
        </p>

        <h2 style={{ marginTop: '1.5rem', color: '#000' }}>7. Limitation of Liability</h2>
        <p>
          While TrackErentory and physical store management implement security measures (CCTV, staff supervision, and digital tracking), store owners are not liable for losses resulting from force majeure, natural disasters, or customer negligence.
        </p>

        <h2 style={{ marginTop: '1.5rem', color: '#000' }}>8. Contact & Disputes</h2>
        <p>
          For questions regarding these Terms or to resolve tenancy disputes, please visit our <Link to="/about" style={{ color: 'var(--accent)', fontWeight: 700 }}>About page</Link> or contact management directly at support@trackerentory.com.
        </p>
      </div>
    </section>
  )
}
