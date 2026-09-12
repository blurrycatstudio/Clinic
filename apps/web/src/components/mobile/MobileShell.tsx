import { useMemo, useState, type ReactNode } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Dialog } from "radix-ui"
import { ChevronLeft, House, Calendar, Baby, MessageCircle, FileText, Bell, CalendarPlus, X, LogOut } from "lucide-react"
import { NavLink, useNavigate } from "react-router-dom"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PhoneInput } from "@/components/ui/phone-input"
import { useLang } from "@/lib/i18n"
import { api } from "@/lib/api"
import { useToast } from "@/lib/toast"
import { cn } from "@/lib/utils"
import { supabase } from "@/lib/supabaseClient"
import { toDateParam, toDisplayAppointment, type ApiAppointment } from "@/lib/appointments"

// All five point within /mobile/* — tabs used to jump out to the desktop AppShell pages
// (/patients, /whatsapp, /records), which don't render this bar, so it looked like the
// bottom toolbar "disappeared" the moment you tapped one.
const TABS = [
  { path: "/mobile/dashboard", labelKey: "mobileNavDashboard" as const, icon: House },
  { path: "/mobile/schedule", labelKey: "mobileNavSchedule" as const, icon: Calendar },
  { path: "/mobile/patients", labelKey: "mobileNavPatients" as const, icon: Baby },
  { path: "/mobile/messages", labelKey: "mobileNavMessages" as const, icon: MessageCircle },
  { path: "/mobile/records", labelKey: "mobileNavRecords" as const, icon: FileText },
]

/** Mobile-styled bottom sheet for booking a new appointment, reachable from the toolbar's "+" button on every mobile screen. */
function NewAppointmentSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t } = useLang()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [fullName, setFullName] = useState("")
  const [phone, setPhone] = useState("")
  const [reason, setReason] = useState("")
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [time, setTime] = useState("09:00")

  function resetForm() {
    setFullName("")
    setPhone("")
    setReason("")
    setDate(new Date().toISOString().slice(0, 10))
    setTime("09:00")
  }

  const createMutation = useMutation({
    mutationFn: (input: { fullName: string; phone: string; reason: string; startsAtIso: string }) =>
      api.post("/appointments", { patientFullName: input.fullName, patientPhoneE164: input.phone, reason: input.reason, startsAtIso: input.startsAtIso }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] })
      toast(t.mobileApptCreated)
      resetForm()
      onOpenChange(false)
    },
    onError: (err: unknown) => toast(err instanceof Error ? err.message : t.mobileApptCreateFailed),
  })

  function handleSave() {
    if (!fullName.trim() || !phone.trim() || !date || !time) return
    createMutation.mutate({ fullName: fullName.trim(), phone: phone.trim(), reason, startsAtIso: new Date(`${date}T${time}:00`).toISOString() })
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[85vh] w-full max-w-[430px] overflow-y-auto rounded-t-3xl border-t border-border bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl">
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="font-heading text-lg font-bold">{t.apptsNewModalTitle}</Dialog.Title>
            <Dialog.Close className="flex size-8 items-center justify-center rounded-full border border-border hover:bg-muted">
              <X className="size-4" strokeWidth={2} />
            </Dialog.Close>
          </div>
          <div className="flex flex-col gap-3.5">
            <div>
              <label className="mb-1.5 block text-xs font-bold">{t.apptsNewModalPatient}</label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name" className="h-10" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold">{t.mobileApptPhone}</label>
              <PhoneInput value={phone} onChange={setPhone} placeholder="664 123 4567" className="h-10" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-bold">{t.apptsNewModalDate}</label>
                <Input type="date" className="h-10" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold">{t.apptsNewModalTime}</label>
                <Input type="time" className="h-10" value={time} onChange={(e) => setTime(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold">{t.apptsNewModalNotes}</label>
              <textarea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t.apptsNewModalNotesPh}
                className="w-full resize-none rounded-xl border border-border bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            </div>
          </div>
          <Button
            onClick={handleSave}
            disabled={!fullName.trim() || !phone.trim() || createMutation.isPending}
            className="mt-5 w-full rounded-xl font-bold"
          >
            {t.apptsNewModalSave}
          </Button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/**
 * Shared shell for the mobile-first screens: a centered phone-width column
 * with a top header and bottom tab bar, so these routes look like a phone
 * screen even in a desktop browser. Deliberately separate from AppShell —
 * the desktop sidebar/topbar/navbar are untouched.
 */
/** Left-hand drawer opened from the header's doctor identity ("profile") — surfaces every mobile section plus sign out. */
function ProfileSidebar({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t, lang, setLang } = useLang()
  const navigate = useNavigate()

  async function handleLogout() {
    if (supabase) await supabase.auth.signOut()
    onOpenChange(false)
    navigate("/login", { replace: true })
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-y-0 left-0 z-50 flex w-[82%] max-w-[320px] flex-col bg-white pb-[env(safe-area-inset-bottom)] shadow-2xl outline-none">
          <div className="flex items-center gap-2.5 border-b border-border/60 px-4 py-4">
            <Avatar className="size-10 shrink-0">
              <AvatarFallback
                className="text-[12px] font-bold text-white"
                style={{ background: "linear-gradient(135deg, #FB923C 0%, #EC4899 55%, #A855F7 100%)" }}
              >
                GR
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <Dialog.Title className="truncate text-[13.5px] font-bold">Dr. Gamaliel Rodríguez</Dialog.Title>
              <div className="truncate text-[11px] text-muted-foreground">{t.doctorSpecialty}</div>
            </div>
            <Dialog.Close className="flex size-8 shrink-0 items-center justify-center rounded-full hover:bg-muted">
              <X className="size-4" strokeWidth={2} />
            </Dialog.Close>
          </div>

          <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
            {TABS.map((tab) => (
              <NavLink
                key={tab.path}
                to={tab.path}
                onClick={() => onOpenChange(false)}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13.5px] font-semibold transition-colors",
                    isActive ? "bg-[#FDF0F5] text-[#DB2777]" : "text-foreground hover:bg-muted",
                  )
                }
              >
                <tab.icon className="size-[18px]" strokeWidth={2} />
                {t[tab.labelKey]}
              </NavLink>
            ))}
          </nav>

          <div className="flex flex-col gap-3 border-t border-border/60 p-3">
            <div className="flex items-center gap-1 self-start rounded-full bg-[#F1F5F9] p-[3px]">
              {(["en", "es"] as const).map((code) => (
                <button
                  key={code}
                  onClick={() => setLang(code)}
                  className={cn(
                    "rounded-full px-3 py-1 text-[11px] font-bold transition-colors",
                    lang === code ? "bg-[#A855F7] text-white shadow-sm" : "text-[#64748B] hover:text-foreground",
                  )}
                >
                  {code === "en" ? "EN" : "ES"}
                </button>
              ))}
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13.5px] font-bold text-destructive hover:bg-destructive/10"
            >
              <LogOut className="size-[18px]" strokeWidth={2} />
              {t.logoutMenuItem}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export function MobileShell({
  children,
  title,
  onBack,
  dark,
}: {
  children: ReactNode
  /** When set (together with onBack), shows a back-arrow header instead of the default doctor identity header. */
  title?: string
  onBack?: () => void
  /** WhatsApp-style dark header, for the chat thread screen — only meaningful together with onBack. */
  dark?: boolean
}) {
  const { t, lang, setLang } = useLang()
  const navigate = useNavigate()
  const [newApptOpen, setNewApptOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const today = toDateParam(new Date())
  const { data: todayData } = useQuery({
    queryKey: ["appointments", "today", today],
    queryFn: () => api.get<{ rows: ApiAppointment[]; count: number }>(`/appointments?date=${today}&limit=100`),
    refetchInterval: 10_000,
  })

  const pendingToday = useMemo(
    () =>
      (todayData?.rows ?? [])
        .map(toDisplayAppointment)
        .filter((a) => a.status === "statusPending")
        .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()),
    [todayData],
  )

  return (
    // h-dvh + overflow-hidden (not min-h-dvh) so this is a fixed-height frame — <main> below
    // is then the one thing that actually scrolls internally, instead of the whole window
    // growing past the viewport and carrying its scroll position between screens.
    <div className="h-dvh overflow-hidden bg-[#FFF8F5]">
      <div className="mx-auto flex h-dvh w-full max-w-[430px] flex-col overflow-hidden bg-[#FFF8F5]">
        <header
          className={cn(
            "sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between gap-2 border-b px-4",
            dark ? "border-[#2a3942] bg-[#202c33]" : "border-border/60 bg-white",
          )}
        >
          {onBack ? (
            <>
              <button
                onClick={() => (onBack ? onBack() : navigate(-1))}
                aria-label="Back"
                className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", dark ? "hover:bg-[#2a3942]" : "hover:bg-muted")}
              >
                <ChevronLeft className={cn("size-5", dark && "text-[#e9edef]")} strokeWidth={2.2} />
              </button>
              <h1 className={cn("flex-1 truncate text-center font-heading text-[15px] font-bold", dark && "text-[#e9edef]")}>{title}</h1>
              <div className="size-8 shrink-0" />
            </>
          ) : (
            <>
              <button onClick={() => setSidebarOpen(true)} className="flex min-w-0 items-center gap-2.5 rounded-lg text-left">
                <Avatar className="size-8.5 shrink-0">
                  <AvatarFallback
                    className="text-[11px] font-bold text-white"
                    style={{ background: "linear-gradient(135deg, #FB923C 0%, #EC4899 55%, #A855F7 100%)" }}
                  >
                    GR
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-bold">Dr. Gamaliel Rodríguez</div>
                  <div className="truncate text-[11px] text-muted-foreground">{t.doctorSpecialty}</div>
                </div>
              </button>
              <div className="flex shrink-0 items-center gap-1 rounded-full bg-[#FDF0F5] p-[3px]">
                {(["en", "es"] as const).map((code) => (
                  <button
                    key={code}
                    onClick={() => setLang(code)}
                    className={cn(
                      "rounded-full px-2 py-1 text-[10.5px] font-bold transition-colors",
                      lang === code ? "bg-[#A855F7] text-white shadow-sm" : "text-[#B4839A] hover:text-foreground",
                    )}
                  >
                    {code === "en" ? "EN" : "ES"}
                  </button>
                ))}
              </div>
              <div className="relative shrink-0">
                <button
                  onClick={() => setNotifOpen((v) => !v)}
                  aria-label={t.mobileNotifications}
                  className="relative flex size-8 shrink-0 items-center justify-center rounded-full hover:bg-muted"
                >
                  <Bell className="size-[18px] text-muted-foreground" strokeWidth={1.8} />
                  {pendingToday.length > 0 && (
                    <span className="absolute top-1 right-1 size-2 rounded-full border-2 border-white bg-destructive" />
                  )}
                </button>
                {notifOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
                    <div className="absolute top-full right-0 z-50 mt-2 max-h-80 w-72 overflow-y-auto rounded-xl border border-border bg-white p-1.5 shadow-atelier-elevated">
                      <div className="px-2 py-1.5 text-xs font-bold text-muted-foreground uppercase">{t.mobileNotifications}</div>
                      {pendingToday.length === 0 ? (
                        <div className="px-2.5 py-4 text-center text-[12.5px] text-muted-foreground">{t.mobileNotificationsEmpty}</div>
                      ) : (
                        <div className="flex flex-col divide-y divide-border">
                          {pendingToday.map((a) => (
                            <button
                              key={a.id}
                              onClick={() => {
                                setNotifOpen(false)
                                navigate(`/mobile/consultation/${a.id}`)
                              }}
                              className="flex w-full items-center gap-2.5 px-2 py-2.5 text-left hover:bg-muted"
                            >
                              <Avatar className="size-8 shrink-0">
                                <AvatarFallback style={{ background: a.color }} className="text-[10.5px] font-bold text-white">
                                  {a.initials}
                                </AvatarFallback>
                              </Avatar>
                              <span className="min-w-0 flex-1">
                                <span className="flex items-center justify-between gap-2">
                                  <span className="truncate text-[12.5px] font-bold">{a.child}</span>
                                  <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground">{a.time}</span>
                                </span>
                                <span className="block truncate text-[11px] text-muted-foreground">{t.mobileNotificationsPending}</span>
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </header>

        <main className="flex-1 overflow-y-auto pb-[calc(4.25rem+env(safe-area-inset-bottom))]">{children}</main>

        <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[430px] pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
          <div className="mx-3 flex h-16 items-center justify-around rounded-[26px] border border-[#F1E4E4] bg-white px-1 shadow-[0_-6px_24px_-8px_rgba(190,80,120,0.18)]">
            {TABS.slice(0, 2).map((tab) => (
              <NavLink
                key={tab.path}
                to={tab.path}
                className={({ isActive }) =>
                  cn(
                    "flex flex-1 flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 text-[10.5px] font-semibold transition-colors",
                    isActive ? "text-[#DB2777]" : "text-muted-foreground hover:text-foreground",
                  )
                }
              >
                <tab.icon className="size-5" strokeWidth={2} />
                <span className="truncate">{t[tab.labelKey]}</span>
              </NavLink>
            ))}

            <button
              onClick={() => setNewApptOpen(true)}
              aria-label={t.mobileNavAddAppt}
              title={t.mobileNavAddAppt}
              className="flex flex-1 flex-col items-center justify-center gap-1"
            >
              <span
                className="flex size-11 -translate-y-3.5 items-center justify-center rounded-full text-white shadow-[0_8px_16px_-4px_rgba(219,39,119,0.55)]"
                style={{ background: "linear-gradient(135deg, #FB923C 0%, #EC4899 55%, #A855F7 100%)" }}
              >
                <CalendarPlus className="size-5" strokeWidth={2.2} />
              </span>
              <span className="-mt-2 truncate text-[10.5px] font-semibold text-muted-foreground">{t.mobileNavAdd}</span>
            </button>

            {TABS.slice(2).map((tab) => (
              <NavLink
                key={tab.path}
                to={tab.path}
                className={({ isActive }) =>
                  cn(
                    "flex flex-1 flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 text-[10.5px] font-semibold transition-colors",
                    isActive ? "text-[#DB2777]" : "text-muted-foreground hover:text-foreground",
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

      <NewAppointmentSheet open={newApptOpen} onOpenChange={setNewApptOpen} />
      <ProfileSidebar open={sidebarOpen} onOpenChange={setSidebarOpen} />
    </div>
  )
}
