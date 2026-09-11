import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"
import { AppShell } from "@/components/layout/AppShell"
import { ProtectedRoute } from "@/components/layout/ProtectedRoute"
import { AuthProvider } from "@/lib/useAuth"
import { LanguageProvider } from "@/lib/i18n"
import { ToastProvider } from "@/lib/toast"
import { useIsMobileViewport } from "@/hooks/useIsMobileViewport"
import Login from "@/pages/Login"
import Dashboard from "@/pages/Dashboard"
import WhatsAppPage from "@/pages/WhatsAppPage"
import Prescriptions from "@/pages/Prescriptions"
import Settings from "@/pages/Settings"
import Appointments from "@/pages/Appointments"
import Patients from "@/pages/Patients"
// import VoiceCalls from "@/pages/VoiceCalls" // Voice Calls — disabled for now, uncomment to bring back.
// import Messages from "@/pages/Messages" // Messages — disabled for now, uncomment to bring back.
import MedicalRecords from "@/pages/MedicalRecords"
import Invoices from "@/pages/Invoices"
import Reports from "@/pages/Reports"
import MobileDashboard from "@/pages/mobile/MobileDashboard"
import MobileSchedule from "@/pages/mobile/MobileSchedule"
import MobileConsultation from "@/pages/mobile/MobileConsultation"
import MobileRecord from "@/pages/mobile/MobileRecord"

const queryClient = new QueryClient()

/** Root route: sends phone-width viewports straight to the mobile-first dashboard instead of the desktop layout, live on resize. */
function Home() {
  const isMobile = useIsMobileViewport()
  if (isMobile) return <Navigate to="/mobile/dashboard" replace />
  return (
    <AppShell>
      <Dashboard />
    </AppShell>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <LanguageProvider>
        <ToastProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route element={<ProtectedRoute />}>
                <Route path="/" element={<Home />} />
                <Route element={<AppShell />}>
                  <Route path="/appointments" element={<Appointments />} />
                  <Route path="/patients" element={<Patients />} />
                  {/* <Route path="/calls" element={<VoiceCalls />} /> */}
                  <Route path="/whatsapp" element={<WhatsAppPage />} />
                  {/* <Route path="/messages" element={<Messages />} /> */}
                  <Route path="/records" element={<MedicalRecords />} />
                  <Route path="/prescriptions" element={<Prescriptions />} />
                  <Route path="/invoices" element={<Invoices />} />
                  <Route path="/reports" element={<Reports />} />
                  <Route path="/settings" element={<Settings />} />
                </Route>
                {/* New mobile-first routes: full-bleed, no desktop AppShell. */}
                <Route path="/mobile/dashboard" element={<MobileDashboard />} />
                <Route path="/mobile/schedule" element={<MobileSchedule />} />
                <Route path="/mobile/consultation/:appointmentId" element={<MobileConsultation />} />
                <Route path="/mobile/records/:patientId" element={<MobileRecord />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </ToastProvider>
        </LanguageProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}

export default App
