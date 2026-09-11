import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { BrowserRouter, Route, Routes } from "react-router-dom"
import { AppShell } from "@/components/layout/AppShell"
import { ProtectedRoute } from "@/components/layout/ProtectedRoute"
import { AuthProvider } from "@/lib/useAuth"
import { LanguageProvider } from "@/lib/i18n"
import { ToastProvider } from "@/lib/toast"
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

const queryClient = new QueryClient()

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
                <Route element={<AppShell />}>
                  <Route path="/" element={<Dashboard />} />
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
