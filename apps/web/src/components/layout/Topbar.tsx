import { Bell, ChevronDown, Moon, Search, Sun } from "lucide-react"
import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import { useLang } from "@/lib/i18n"
import { cn } from "@/lib/utils"

function useDarkMode() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"))

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark)
  }, [dark])

  return { dark, toggle: () => setDark((v) => !v) }
}

export function Topbar() {
  const { lang, setLang, t } = useLang()
  const navigate = useNavigate()
  const { dark, toggle } = useDarkMode()

  return (
    <header className="flex h-[74px] shrink-0 items-center gap-4 border-b bg-card px-8">
      <div className="relative max-w-[460px] flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={t.searchPlaceholder}
          className="rounded-full border-none bg-muted pr-16 pl-10 text-[13.5px] shadow-none"
        />
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 rounded-md border border-border bg-card px-1.5 py-0.5 text-[10.5px] font-semibold text-muted-foreground">
          {t.searchShortcut}
        </span>
      </div>
      <div className="flex-1" />

      <button
        onClick={toggle}
        className="flex size-9.5 items-center justify-center rounded-[10px] hover:bg-muted"
        aria-label="Toggle dark mode"
      >
        {dark ? (
          <Moon className="size-[19px] text-foreground" strokeWidth={1.8} />
        ) : (
          <Sun className="size-[19px] text-foreground" strokeWidth={1.8} />
        )}
      </button>

      <button className="relative flex size-9.5 items-center justify-center rounded-[10px] hover:bg-muted">
        <Bell className="size-[19px] text-foreground" strokeWidth={1.8} />
        <span className="absolute top-1.5 right-1.5 size-2 rounded-full border-2 border-card bg-destructive" />
      </button>

      <div className="flex items-center gap-0.5 rounded-full bg-muted p-[3px]">
        {(["en", "es"] as const).map((code) => (
          <button
            key={code}
            onClick={() => setLang(code)}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors",
              lang === code ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {code === "en" ? "EN" : "ES-MX"}
          </button>
        ))}
      </div>

      <button
        onClick={() => navigate("/settings")}
        className="flex items-center gap-2.5 hover:opacity-80"
      >
        <Avatar className="size-9.5">
          <AvatarFallback className="bg-gradient-to-br from-primary to-sidebar text-[13px] font-bold text-primary-foreground">
            GR
          </AvatarFallback>
        </Avatar>
        <div className="leading-tight">
          <div className="text-[13.5px] font-bold">Dr. Gamaliel</div>
          <div className="text-[11.5px] text-muted-foreground">{t.doctorSpecialtyShort}</div>
        </div>
        <ChevronDown className="size-3.5 text-foreground" />
      </button>
    </header>
  )
}
