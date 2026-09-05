import { Sun } from "lucide-react"
import { useLang } from "@/lib/i18n"

export function HeroBanner() {
  const { t } = useLang()

  return (
    <div className="relative mb-5.5 h-72 w-full overflow-hidden rounded-3xl bg-[#e7f2ec]">
      <div className="absolute top-5 right-5 w-64 rounded-2xl border border-black/5 bg-white/95 p-4 shadow-lg backdrop-blur-sm">
        <div className="flex items-center gap-1.5 text-[13.5px] font-bold">
          <Sun className="size-4 text-[#c2882c]" strokeWidth={2} />
          {t.dateLine}
        </div>
        <div className="mt-1 pl-5.5 text-[12px] text-muted-foreground">{t.location}</div>
        <div className="mt-1.5 flex items-center gap-1.5 pl-5.5 text-[13px] font-bold text-[#c2882c]">
          <Sun className="size-3.5" strokeWidth={2} />
          {t.weather}
        </div>
      </div>

      <div className="absolute right-5 bottom-5 w-64 rounded-2xl border border-black/5 bg-accent/95 p-4 shadow-lg backdrop-blur-sm">
        <p className="font-heading text-[15px] leading-snug font-bold text-[#1d5c33]">{t.heroQuote}</p>
      </div>
    </div>
  )
}
