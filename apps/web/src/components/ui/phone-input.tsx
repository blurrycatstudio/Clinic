import * as React from "react"
import { Popover } from "radix-ui"
import { ChevronDown } from "lucide-react"
import { cn } from "cn"

export type Country = { iso: string; dial: string; flag: string; name: string }

export const COUNTRIES: Country[] = [
  { iso: "MX", dial: "+52", flag: "🇲🇽", name: "Mexico" },
  { iso: "US", dial: "+1", flag: "🇺🇸", name: "United States" },
  { iso: "CA", dial: "+1", flag: "🇨🇦", name: "Canada" },
  { iso: "ES", dial: "+34", flag: "🇪🇸", name: "Spain" },
  { iso: "AR", dial: "+54", flag: "🇦🇷", name: "Argentina" },
  { iso: "CO", dial: "+57", flag: "🇨🇴", name: "Colombia" },
  { iso: "BR", dial: "+55", flag: "🇧🇷", name: "Brazil" },
  { iso: "CL", dial: "+56", flag: "🇨🇱", name: "Chile" },
  { iso: "PE", dial: "+51", flag: "🇵🇪", name: "Peru" },
  { iso: "GT", dial: "+502", flag: "🇬🇹", name: "Guatemala" },
  { iso: "IN", dial: "+91", flag: "🇮🇳", name: "India" },
  { iso: "GB", dial: "+44", flag: "🇬🇧", name: "United Kingdom" },
  { iso: "FR", dial: "+33", flag: "🇫🇷", name: "France" },
  { iso: "DE", dial: "+49", flag: "🇩🇪", name: "Germany" },
  { iso: "PT", dial: "+351", flag: "🇵🇹", name: "Portugal" },
  { iso: "AU", dial: "+61", flag: "🇦🇺", name: "Australia" },
]

const DIALS_BY_LENGTH = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length)

/** Splits a stored "+52 664 123 4567" style value into its country + local-number parts. */
function parseValue(value: string): { country: Country; local: string } {
  const trimmed = value.trim()
  const match = DIALS_BY_LENGTH.find((c) => trimmed.startsWith(c.dial))
  if (match) return { country: match, local: trimmed.slice(match.dial.length).trim() }
  return { country: COUNTRIES[0], local: trimmed }
}

/**
 * Phone number field with a country-code + flag picker, matching the pattern used
 * everywhere (dropdown of dial codes, flag shown) instead of a bare free-text field.
 * `value`/`onChange` still carry the full "+<dial> <local>" string so callers that
 * store a plain E.164-ish string don't need to change.
 */
export function PhoneInput({
  value,
  onChange,
  placeholder,
  className,
  inputClassName,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  inputClassName?: string
}) {
  const [open, setOpen] = React.useState(false)
  const { country, local } = parseValue(value)

  function setCountry(next: Country) {
    onChange(local ? `${next.dial}${local}` : "")
    setOpen(false)
  }

  function setLocal(next: string) {
    const digits = next.replace(/\s+/g, "")
    onChange(digits ? `${country.dial}${digits}` : "")
  }

  return (
    <div className={cn("flex h-10 items-stretch overflow-hidden rounded-lg border border-input bg-transparent focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50", className)}>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button
            type="button"
            className="flex shrink-0 items-center gap-1 border-r border-input px-2.5 text-sm hover:bg-muted"
          >
            <span className="text-base leading-none">{country.flag}</span>
            <span className="font-medium">{country.dial}</span>
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={4}
            className="z-50 max-h-64 w-56 overflow-y-auto overscroll-contain rounded-lg border border-border bg-popover p-1 shadow-lg"
            onWheel={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
          >
            {COUNTRIES.map((c) => (
              <button
                key={c.iso}
                type="button"
                onClick={() => setCountry(c)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
              >
                <span className="text-base leading-none">{c.flag}</span>
                <span className="flex-1 truncate">{c.name}</span>
                <span className="text-muted-foreground">{c.dial}</span>
              </button>
            ))}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      <input
        type="tel"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "min-w-0 flex-1 bg-transparent px-2.5 py-1 text-base outline-none placeholder:text-muted-foreground md:text-sm",
          inputClassName,
        )}
      />
    </div>
  )
}
