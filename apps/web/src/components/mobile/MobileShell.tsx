import type { ReactNode } from "react"
import { ChevronLeft, House, Calendar, Baby, MessageCircle, FileText, Bell } from "lucide-react"
import { NavLink, useNavigate } from "react-router-dom"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { useLang } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const TABS = [
  { path: "/mobile/dashboard", labelKey: "mobileNavDashboard" as const, icon: House },
  { path: "/mobile/schedule", labelKey: "mobileNavSchedule" as const, icon: Calendar },
  { path: "/patients", labelKey: "mobileNavPatients" as const, icon: Baby },
  { path: "/whatsapp", labelKey: "mobileNavMessages" as const, icon: MessageCircle },
  { path: "/records", labelKey: "mobileNavRecords" as const, icon: FileText },
]

/**
 * Shared shell for the mobile-first screens: a centered phone-width column
 * with a top header and bottom tab bar, so these routes look like a phone
 * screen even in a desktop browser. Deliberately separate from AppShell —
 * the desktop sidebar/topbar/navbar are untouched.
 */
export function MobileShell({
  children,
  title,
  onBack,
}: {
  children: ReactNode
  /** When set (together with onBack), shows a back-arrow header instead of the default doctor identity header. */
  title?: string
  onBack?: () => void
}) {
  const { t } = useLang()
  const navigate = useNavigate()

  return (
    <div className="min-h-dvh bg-[#F8FAFC]">
      <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-[#F8FAFC]">
        <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border/60 bg-white px-4">
          {onBack ? (
            <>
              <button
                onClick={() => (onBack ? onBack() : navigate(-1))}
                aria-label="Back"
                className="flex size-8 shrink-0 items-center justify-center rounded-full hover:bg-muted"
              >
                <ChevronLeft className="size-5" strokeWidth={2.2} />
              </button>
              <h1 className="flex-1 truncate text-center font-heading text-[15px] font-bold">{title}</h1>
              <div className="size-8 shrink-0" />
            </>
          ) : (
            <>
              <div className="flex min-w-0 items-center gap-2.5">
                <Avatar className="size-8.5 shrink-0">
                  <AvatarFallback className="bg-gradient-to-br from-primary to-sidebar text-[11px] font-bold text-primary-foreground">
                    GR
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-bold">Dr. Gamaliel Rodríguez</div>
                  <div className="truncate text-[11px] text-muted-foreground">{t.doctorSpecialty}</div>
                </div>
              </div>
              <button aria-label="Notifications" className="flex size-8 shrink-0 items-center justify-center rounded-full hover:bg-muted">
                <Bell className="size-[18px] text-muted-foreground" strokeWidth={1.8} />
              </button>
            </>
          )}
        </header>

        <main className="flex-1 overflow-y-auto pb-[calc(4.25rem+env(safe-area-inset-bottom))]">{children}</main>

        <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[430px] border-t border-border/60 bg-white pb-[env(safe-area-inset-bottom)]">
          <div className="flex h-16 items-center justify-around px-1">
            {TABS.map((tab) => (
              <NavLink
                key={tab.path}
                to={tab.path}
                className={({ isActive }) =>
                  cn(
                    "flex flex-1 flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 text-[10.5px] font-semibold transition-colors",
                    isActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
                  )
                }
              >
                <tab.icon className="size-5" strokeWidth={2} />
                <span className="truncate">{t[tab.labelKey]}</span>
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    </div>
  )
}
