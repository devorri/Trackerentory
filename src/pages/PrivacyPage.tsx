import { Link } from 'react-router-dom'

export default function PrivacyPage() {
  return (
    <section>
      <div className="hero-strip">
        <h1>
          PRIVACY <span className="highlight">POLICY</span>.
        </h1>
        <p>
          Learn how TrackErentory collects, uses, protects, and handles your personal information, contact numbers, authentication OTPs, and transaction data.
        </p>
      </div>

      <div className="panel" style={{ padding: '2.5rem', lineHeight: 1.8, color: '#333' }}>
        <p className="muted" style={{ fontSize: '0.85rem' }}>
          Last updated: October 2026
        </p>

        <h2 style={{ marginTop: '1.5rem', color: '#000' }}>1. Information We Collect</h2>
        <p>
          We collect information necessary to provide seamless retail cube rental, product reservations, and inventory auditing:
        </p>
        <ul style={{ paddingLeft: '1.5rem' }}>
          <li>
            <strong>Account Credentials:</strong> Full name, username, email address, encrypted password, and designated role (Owner, Staff, Renter, Customer).
          </li>
          <li>
            <strong>Contact Details:</strong> Phone numbers and social media / Messenger profile links for staff and renters to facilitate quick communication.
          </li>
          <li>
            <strong>Authentication Data:</strong> One-Time Passwords (OTP) generated for two-factor authentication, account creation, and password recovery.
          </li>
          <li>
            <strong>Transaction & Order Details:</strong> Reservation records, buyer names, authorized pickup personnel, payment statuses, and uploaded receipt images.
          </li>
          <li>
            <strong>Inventory & Space Records:</strong> Cube dimensions, photographs, product listings, pricing, and stock history.
          </li>
        </ul>

        <h2 style={{ marginTop: '1.5rem', color: '#000' }}>2. How We Use Your Information</h2>
        <p>
          The personal data collected is utilized solely for lawful operational purposes:
        </p>
        <ul style={{ paddingLeft: '1.5rem' }}>
          <li>Authenticating your identity securely during sign-in using 2FA OTP codes.</li>
          <li>Facilitating reservation confirmations and preventing double-booking of rental cubes and products.</li>
          <li>Enabling staff to verify the identity of individuals claiming items in pick-up cubes.</li>
          <li>Generating monthly sales summaries and rental payout reports for store owners and renters.</li>
          <li>Notifying renters when physical cube rental agreements are nearing expiration.</li>
        </ul>

        <h2 style={{ marginTop: '1.5rem', color: '#000' }}>3. Data Protection & Security</h2>
        <p>
          We employ enterprise-grade security protocols:
        </p>
        <ul style={{ paddingLeft: '1.5rem' }}>
          <li>All network communications between client devices and database servers are encrypted using TLS/HTTPS.</li>
          <li>OTPs are time-limited (expiring within 10 minutes) and invalidated immediately after a single use.</li>
          <li>Database tables utilize Row-Level Security (RLS) policies to ensure that renters and customers can only access their authorized records.</li>
          <li>Sensitive files such as payment receipts and contract documents are stored in secure cloud buckets with strict access policies.</li>
        </ul>

        <h2 style={{ marginTop: '1.5rem', color: '#000' }}>4. Third-Party Sharing</h2>
        <p>
          TrackErentory does <strong>not sell, rent, or trade</strong> your personal information to third-party marketing companies. Data is shared strictly with:
        </p>
        <ul style={{ paddingLeft: '1.5rem' }}>
          <li>Authorized physical store personnel responsible for dispensing reserved merchandise.</li>
          <li>Transactional email gateways (such as Resend or Supabase Auth) solely to dispatch authentication OTPs and system notifications.</li>
        </ul>

        <h2 style={{ marginTop: '1.5rem', color: '#000' }}>5. User Rights & Data Deletion</h2>
        <p>
          You have the right to review the information stored in your account, update your contact details, or request account closure. If you wish to delete your account or retrieve historical sales receipts, please contact the store administrator at support@trackerentory.com or consult our <Link to="/about" style={{ color: 'var(--accent)', fontWeight: 700 }}>About page</Link>.
        </p>
      </div>
    </section>
  )
}
