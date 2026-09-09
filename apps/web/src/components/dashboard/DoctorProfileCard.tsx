import { useState } from "react"
import { LogOut, Mail, MapPin, Phone } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Card } from "@/components/ui/card"
import { useLang } from "@/lib/i18n"
import { useToast } from "@/lib/toast"
import { supabase } from "@/lib/supabaseClient"

export function DoctorProfileCard() {
  const { t } = useLang()
  const toast = useToast()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [phone, setPhone] = useState("+52 664 111 2222")
  const [email, setEmail] = useState("g.rodriguez@pediatraclinic.mx")

  async function handleLogout() {
    if (supabase) await supabase.auth.signOut()
    navigate("/login", { replace: true })
  }

  return (
    <Card className="gap-0 rounded-2xl border p-5 shadow-none">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-heading text-base font-bold">{t.doctorTitle}</h2>
        <button
          onClick={() => {
            if (editing) toast("Profile updated")
            setEditing((v) => !v)
          }}
          className="cursor-pointer text-xs font-bold text-primary"
        >
          {editing ? "Save" : t.doctorEdit}
        </button>
      </div>
      <div className="mb-3.5 flex items-center gap-3">
        <Avatar className="size-14.5">
          <AvatarFallback className="bg-gradient-to-br from-primary to-sidebar text-lg font-bold text-primary-foreground">
            GR
          </AvatarFallback>
        </Avatar>
        <div>
          <div className="text-[15px] font-bold">Dr. Gamaliel Rodríguez</div>
          <div className="text-[12.5px] text-muted-foreground">{t.doctorSpecialty}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">{t.doctorLicense}</div>
        </div>
      </div>
      <div className="flex flex-col gap-2 text-[12.5px] text-foreground">
        <div className="flex items-center gap-2">
          <Phone className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.8} />
          {editing ? (
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className="flex-1 rounded-md border px-2 py-1 text-[12.5px] outline-none focus-visible:border-ring" />
          ) : (
            phone
          )}
        </div>
        <div className="flex items-center gap-2">
          <Mail className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.8} />
          {editing ? (
            <input value={email} onChange={(e) => setEmail(e.target.value)} className="flex-1 rounded-md border px-2 py-1 text-[12.5px] outline-none focus-visible:border-ring" />
          ) : (
            email
          )}
        </div>
        <div className="flex items-center gap-2">
          <MapPin className="size-3.5 text-muted-foreground" strokeWidth={1.8} />
          {t.location}
        </div>
      </div>
      <div className="mt-3.5 rounded-[10px] bg-accent px-3.5 py-3">
        <p className="font-heading text-[12.5px] leading-relaxed text-accent-foreground italic">{t.doctorQuote}</p>
      </div>
      <button
        onClick={handleLogout}
        className="mt-3.5 flex w-full items-center justify-center gap-2 rounded-lg border border-destructive/30 px-3.5 py-2 text-[12.5px] font-bold text-destructive hover:bg-destructive/10"
      >
        <LogOut className="size-3.5" strokeWidth={1.8} />
        {t.logoutMenuItem}
      </button>
    </Card>
  )
}
