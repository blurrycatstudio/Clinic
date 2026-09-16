import {
  Baby,
  Calendar,
  CreditCard,
  FileText,
  House,
  // MessagesSquare, // Messages nav — disabled for now
  // Phone, // Voice Calls nav — disabled for now
  Settings,
  Syringe,
  BarChart3,
  MessageCircle,
  type LucideIcon,
} from "lucide-react"
import type { Strings } from "./i18n"
import homeIcon3d from "@/assests/Home-button.jpeg"
import scheduleIcon3d from "@/assests/Schedule-button.png"
import patientsIcon3d from "@/assests/Patient-icons.png"
import recordsIcon3d from "@/assests/Records-button.png"
import whatsappIcon3d from "@/assests/Whatsapp-button.png"

export type NavItem = {
  path: string
  labelKey: keyof Strings
  icon: LucideIcon
  iconColor: string
  badge?: number
  badgeColor?: string
  /** Shown in the primary mobile tab bar. Everything else moves under "More" on small screens. */
  mobilePrimary?: boolean
  /** 3D rendered icon shown instead of `icon` on the desktop Sidebar rail specifically
   * (see Sidebar.tsx) — other nav surfaces (NavBar's inline pills) stay on the plain
   * Lucide glyph since these images don't read well shrunk down that small. */
  image3d?: string
}

export const NAV_ITEMS: NavItem[] = [
  { path: "/", labelKey: "navDashboard", icon: House, iconColor: "#2563EB", mobilePrimary: true, image3d: homeIcon3d },
  { path: "/appointments", labelKey: "navAppointments", icon: Calendar, iconColor: "#F97316", mobilePrimary: true, image3d: scheduleIcon3d },
  { path: "/patients", labelKey: "navPatients", icon: Baby, iconColor: "#16A34A", mobilePrimary: true, image3d: patientsIcon3d },
  // Voice Calls — disabled for now, uncomment to bring back.
  // { path: "/calls", labelKey: "navCalls", icon: Phone, iconColor: "#16A34A", badge: 3, badgeColor: "#F97316" },
  {
    path: "/whatsapp",
    labelKey: "navWhatsapp",
    icon: MessageCircle,
    iconColor: "#25D366",
    badge: 7,
    badgeColor: "#16A34A",
    mobilePrimary: true,
    image3d: whatsappIcon3d,
  },
  // Messages — disabled for now, uncomment to bring back.
  // { path: "/messages", labelKey: "navMessages", icon: MessagesSquare, iconColor: "#3B82F6" },
  { path: "/records", labelKey: "navRecords", icon: FileText, iconColor: "#EA580C", image3d: recordsIcon3d },
  { path: "/prescriptions", labelKey: "navPrescriptions", icon: Syringe, iconColor: "#EC4899" },
  { path: "/invoices", labelKey: "navInvoices", icon: CreditCard, iconColor: "#16A34A" },
  { path: "/reports", labelKey: "navReports", icon: BarChart3, iconColor: "#6366F1" },
  { path: "/settings", labelKey: "navSettings", icon: Settings, iconColor: "#94A3B8" },
]
