import { lazy, Suspense } from 'react'
import { Link, Route, Routes } from 'react-router'
import { PatientLayout } from './components/Layout'
import { Spinner } from './components/ui'
import { AppointmentsPage } from './pages/AppointmentsPage'
import { AssistantPage } from './pages/AssistantPage'
import { HomePage } from './pages/HomePage'
import { HospitalDetailPage } from './pages/HospitalDetailPage'
import { HospitalsPage } from './pages/HospitalsPage'
import { InsurancePage } from './pages/InsurancePage'
import { ProfilePage } from './pages/ProfilePage'
import { SosPage } from './pages/SosPage'

// Hospital- and driver-side screens load on demand; patients never download them.
const ConsoleDashboard = lazy(() => import('./pages/console/ConsoleDashboard').then((m) => ({ default: m.ConsoleDashboard })))
const ConsoleLogin = lazy(() => import('./pages/console/ConsoleLogin').then((m) => ({ default: m.ConsoleLogin })))
const DriverPage = lazy(() => import('./pages/driver/DriverPage').then((m) => ({ default: m.DriverPage })))

export function App() {
  return (
    <Routes>
      <Route element={<PatientLayout />}>
        <Route index element={<HomePage />} />
        <Route path="sos/:id" element={<SosPage />} />
        <Route path="assistant" element={<AssistantPage />} />
        <Route path="hospitals" element={<HospitalsPage />} />
        <Route path="hospitals/:id" element={<HospitalDetailPage />} />
        <Route path="insurance" element={<InsurancePage />} />
        <Route path="appointments" element={<AppointmentsPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="*" element={<div className="py-16 text-center"><p className="text-lg font-semibold">Page not found</p><Link to="/" className="text-brand underline">Go home</Link></div>} />
      </Route>
      <Route path="console/login" element={<Suspense fallback={<Spinner />}><ConsoleLogin /></Suspense>} />
      <Route path="console" element={<Suspense fallback={<Spinner />}><ConsoleDashboard /></Suspense>} />
      <Route path="driver/:token" element={<Suspense fallback={<Spinner />}><DriverPage /></Suspense>} />
    </Routes>
  )
}
