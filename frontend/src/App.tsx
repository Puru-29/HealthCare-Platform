import { lazy, Suspense } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useParams } from 'react-router'
import { AppLayout } from './components/Layout'
import { Aurora, Spinner } from './components/ui'
import { AppointmentsPage } from './pages/AppointmentsPage'
import { AssistantPage } from './pages/AssistantPage'
import { DashboardPage } from './pages/DashboardPage'
import { HospitalDetailPage } from './pages/HospitalDetailPage'
import { HospitalsPage } from './pages/HospitalsPage'
import { InsurancePage } from './pages/InsurancePage'
import { LandingPage } from './pages/LandingPage'
import { LoginPage } from './pages/LoginPage'
import { LogoutPage } from './pages/LogoutPage'
import { ProfilePage } from './pages/ProfilePage'
import { SosHubPage, SosPage } from './pages/SosPage'

// Hospital- and driver-side screens load on demand; patients never download them.
const ConsoleDashboard = lazy(() => import('./pages/console/ConsoleDashboard').then((m) => ({ default: m.ConsoleDashboard })))
const DriverPage = lazy(() => import('./pages/driver/DriverPage').then((m) => ({ default: m.DriverPage })))

/** Old addresses (before the /app move) keep working. */
function MovedTo({ to }: { to: string }) {
  const params = useParams()
  const { search } = useLocation()
  const target = to.replace(/:(\w+)/g, (_, k: string) => encodeURIComponent(params[k] ?? ''))
  return <Navigate to={target + search} replace />
}

function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center p-6 text-center">
      <Aurora />
      <div className="glass rounded-[28px] p-8">
        <p className="heading text-2xl">Page not found</p>
        <p className="mt-2 text-ink-2">In an emergency call <a className="font-bold text-brand" href="tel:112">112</a>.</p>
        <Link to="/app" className="btn-primary mt-5">Go to dashboard</Link>
      </div>
    </div>
  )
}

export function App() {
  return (
    <Routes>
      <Route index element={<LandingPage />} />
      <Route path="login" element={<LoginPage />} />
      <Route path="logout" element={<LogoutPage />} />

      <Route path="app" element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="sos" element={<SosHubPage />} />
        <Route path="sos/:id" element={<SosPage />} />
        <Route path="guide" element={<AssistantPage />} />
        <Route path="hospitals" element={<HospitalsPage />} />
        <Route path="hospitals/:id" element={<HospitalDetailPage />} />
        <Route path="insurance" element={<InsurancePage />} />
        <Route path="appointments" element={<AppointmentsPage />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>

      <Route path="console" element={<Suspense fallback={<Spinner />}><ConsoleDashboard /></Suspense>} />
      <Route path="console/login" element={<Navigate to="/login?tab=staff" replace />} />
      <Route path="driver/:token" element={<Suspense fallback={<Spinner />}><DriverPage /></Suspense>} />

      <Route path="assistant" element={<MovedTo to="/app/guide" />} />
      <Route path="hospitals" element={<MovedTo to="/app/hospitals" />} />
      <Route path="hospitals/:id" element={<MovedTo to="/app/hospitals/:id" />} />
      <Route path="insurance" element={<MovedTo to="/app/insurance" />} />
      <Route path="appointments" element={<MovedTo to="/app/appointments" />} />
      <Route path="profile" element={<MovedTo to="/app/profile" />} />
      <Route path="sos/:id" element={<MovedTo to="/app/sos/:id" />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
