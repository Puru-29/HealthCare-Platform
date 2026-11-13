import { Link, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { useLocation } from 'react-router-dom'
import { SiteFooter } from './components/SiteFooter'
import { DashboardLayout } from './components/DashboardLayout'
import { SiteHeader } from './components/SiteHeader'
import { AssistantPage } from './pages/AssistantPage'
import { AccountPage } from './pages/AccountPage'
import { AppointmentsPage } from './pages/AppointmentsPage'
import { CareSearchPage } from './pages/CareSearchPage'
import { DoctorsPage } from './pages/DoctorsPage'
import { DoctorDetailsPage } from './pages/DoctorDetailsPage'
import { DashboardPage } from './pages/DashboardPage'
import { EmergencyPage } from './pages/EmergencyPage'
import { HospitalDetailsPage } from './pages/HospitalDetailsPage'
import { HospitalsPage } from './pages/HospitalsPage'
import { HomePage } from './pages/HomePage'
import { InsuranceAssistantPage } from './pages/InsuranceAssistantPage'
import { PatientServicesPage } from './pages/PatientServicesPage'
import { ProfilePage } from './pages/ProfilePage'
import { useAuth } from './auth/useAuth'

function ProtectedDashboard() {
  const location = useLocation()
  const { status, refresh } = useAuth()

  if (status === 'loading') {
    return <p className="mx-auto max-w-xl px-5 py-20 text-center" role="status">Checking your session…</p>
  }
  if (status === 'unavailable') {
    return (
      <section className="mx-auto max-w-xl px-5 py-20 text-center">
        <h1 className="text-xl font-semibold text-forest-950">Account service unavailable</h1>
        <p className="mt-2 text-sm text-ink-600">We could not verify your session.</p>
        <button className="glass-button glass-button-primary mt-5" onClick={() => void refresh()} type="button">
          Try again
        </button>
      </section>
    )
  }
  if (status === 'unauthenticated') {
    return <Navigate replace state={{ from: location }} to="/login" />
  }
  return <Outlet />
}

function App() {
  const location = useLocation()
  const isAdminRoute = location.pathname.startsWith('/admin')
  const isPatientRoute = location.pathname.startsWith('/dashboard')
  const isAccountRoute = location.pathname === '/login' || location.pathname === '/register'
  const showPublicChrome = !isAdminRoute && !isPatientRoute && !isAccountRoute

  return (
    <div className="app-shell text-ink-900">
      {showPublicChrome && <SiteHeader />}
      <main>
        <div className="route-transition" key={location.pathname}>
          <Routes>
            <Route path="/admin/*" element={<Navigate replace to="/" />} />
            <Route path="/login" element={<AccountPage mode="login" />} />
            <Route path="/register" element={<AccountPage mode="register" />} />
            <Route path="/dashboard" element={<ProtectedDashboard />}>
              <Route element={<DashboardLayout />}>
                <Route index element={<DashboardPage />} />
                <Route path="search" element={<CareSearchPage />} />
                <Route path="hospitals" element={<HospitalsPage basePath="/dashboard" />} />
                <Route path="hospitals/:hospitalId" element={<HospitalDetailsPage basePath="/dashboard" />} />
                <Route path="doctors" element={<DoctorsPage basePath="/dashboard" />} />
                <Route path="doctors/:doctorId" element={<DoctorDetailsPage basePath="/dashboard" />} />
                <Route path="appointments" element={<AppointmentsPage />} />
                <Route path="assistant" element={<AssistantPage basePath="/dashboard" />} />
                <Route path="emergency" element={<EmergencyPage basePath="/dashboard" />} />
                <Route path="ambulance" element={<PatientServicesPage section="ambulance" />} />
                <Route path="insurance" element={<InsuranceAssistantPage />} />
                <Route path="profile" element={<ProfilePage />} />
                <Route path="settings" element={<PatientServicesPage section="settings" />} />
              </Route>
            </Route>
            <Route path="/" element={<HomePage />} />
            <Route path="/hospitals" element={<HospitalsPage />} />
            <Route path="/hospitals/:hospitalId" element={<HospitalDetailsPage />} />
            <Route path="/doctors" element={<DoctorsPage />} />
            <Route path="/doctors/:doctorId" element={<DoctorDetailsPage />} />
            <Route path="/assistant" element={<AssistantPage />} />
            <Route path="/ai-assistant" element={<Navigate replace to="/assistant" />} />
            <Route path="/insurance" element={<InsuranceAssistantPage />} />
            <Route path="/insurance-assistant" element={<Navigate replace to="/insurance" />} />
            <Route path="/emergency" element={<EmergencyPage />} />
            <Route path="/ambulance" element={<Navigate replace to="/emergency" />} />
            <Route
              path="*"
              element={
                <section className="mx-auto max-w-3xl px-6 py-24 text-center">
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-forest-700">
                    Page not found
                  </p>
                  <h1 className="mt-4 text-4xl font-semibold tracking-tight">
                    Let’s get you back on track.
                  </h1>
                  <Link
                    className="mt-8 inline-flex rounded-full bg-forest-900 px-6 py-3 font-semibold text-white transition hover:bg-forest-800"
                    to="/"
                  >
                    Back to home
                  </Link>
                </section>
              }
            />
          </Routes>
        </div>
      </main>
      {showPublicChrome && <SiteFooter />}
    </div>
  )
}

export default App
