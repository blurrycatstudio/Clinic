import { Mail, MapPin, Phone } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Card } from "@/components/ui/card"
import { useLang } from "@/lib/i18n"

export function DoctorProfileCard() {
  const { t } = useLang()

  return (
    <Card className="gap-0 rounded-2xl border p-5 shadow-none">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-heading text-base font-bold">{t.doctorTitle}</h2>
        <span className="cursor-pointer text-xs font-bold text-primary">{t.doctorEdit}</span>
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
          <Phone className="size-3.5 text-muted-foreground" strokeWidth={1.8} />
          +52 664 111 2222
        </div>
        <div className="flex items-center gap-2">
          <Mail className="size-3.5 text-muted-foreground" strokeWidth={1.8} />
          g.rodriguez@pediatraclinic.mx
        </div>
        <div className="flex items-center gap-2">
          <MapPin className="size-3.5 text-muted-foreground" strokeWidth={1.8} />
          {t.location}
        </div>
      </div>
      <div className="mt-3.5 rounded-[10px] bg-accent px-3.5 py-3">
        <p className="font-heading text-[12.5px] leading-relaxed text-accent-foreground italic">{t.doctorQuote}</p>
      </div>
    </Card>
  )
}
