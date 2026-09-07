import { DoctorProfileCard } from "@/components/dashboard/DoctorProfileCard"
import { useLang } from "@/lib/i18n"

export default function Settings() {
  const { t } = useLang()

  return (
    <div>
      <div className="mb-5.5">
        <h1 className="font-heading text-[27px] font-bold">{t.profilePageTitle}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t.profilePageSub}</p>
      </div>

      <div className="w-full max-w-100">
        <DoctorProfileCard />
      </div>
    </div>
  )
}
