import {
  Baby,
  Calendar,
  CreditCard,
  FileText,
  House,
  MessagesSquare,
  Phone,
  Settings,
  Syringe,
  BarChart3,
  MessageCircle,
  type LucideIcon,
} from "lucide-react"
import type { Strings } from "./i18n"

export type NavItem = {
  path: string
  labelKey: keyof Strings
  icon: LucideIcon
  badge?: number
}

export const NAV_ITEMS: NavItem[] = [
  { path: "/", labelKey: "navDashboard", icon: House },
  { path: "/appointments", labelKey: "navAppointments", icon: Calendar },
  { path: "/patients", labelKey: "navPatients", icon: Baby },
  { path: "/calls", labelKey: "navCalls", icon: Phone, badge: 3 },
  { path: "/whatsapp", labelKey: "navWhatsapp", icon: MessageCircle, badge: 7 },
  { path: "/messages", labelKey: "navMessages", icon: MessagesSquare },
  { path: "/records", labelKey: "navRecords", icon: FileText },
  { path: "/prescriptions", labelKey: "navPrescriptions", icon: Syringe },
  { path: "/invoices", labelKey: "navInvoices", icon: CreditCard },
  { path: "/reports", labelKey: "navReports", icon: BarChart3 },
  { path: "/settings", labelKey: "navSettings", icon: Settings },
]
