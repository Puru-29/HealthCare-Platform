import { ArrowUpRight, HeartPulse } from 'lucide-react'
import { Link } from 'react-router-dom'

const CURRENT_YEAR = new Date().getFullYear()

const directoryLinks = [
  { label: 'Hospitals', to: '/hospitals' },
  { label: 'Doctors', to: '/doctors' },
  { label: 'Care guide', to: '/assistant' },
  { label: 'Insurance networks', to: '/insurance' },
  { label: 'Emergency information', to: '/emergency' },
]

export function SiteFooter() {
  return (
    <footer className="site-footer" id="contact">
      <div className="landing-container site-footer-main">
        <div className="site-footer-brand">
          <Link aria-label="CarePath home" className="site-brand" to="/">
            <span className="site-brand-mark"><HeartPulse aria-hidden="true" size={19} /></span>
            <span>carepath</span>
          </Link>
          <p>A clearer starting point for navigating healthcare in Sonipat, Haryana. Built to help you explore available information thoughtfully.</p>
        </div>
        <div className="site-footer-links">
          <p className="site-footer-heading">Explore CarePath</p>
          {directoryLinks.map((item) => (
            <Link key={item.to} to={item.to}>
              {item.label}<ArrowUpRight aria-hidden="true" size={13} />
            </Link>
          ))}
        </div>
        <div className="site-footer-contact">
          <p className="site-footer-heading">Get in touch</p>
          <p>Support contact details are not yet available. For provider information, please contact the hospital or insurer directly.</p>
          <Link to="/register">Create an account<ArrowUpRight aria-hidden="true" size={13} /></Link>
        </div>
      </div>
      <div className="site-footer-bottom">
        <div className="landing-container">
          <p>© {CURRENT_YEAR} CarePath. An early-stage healthcare platform.</p>
          <p>CarePath is not a medical provider or emergency service. For urgent help in India, call 112.</p>
        </div>
      </div>
    </footer>
  )
}
