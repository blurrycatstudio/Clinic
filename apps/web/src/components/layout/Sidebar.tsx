import { NavLink } from "react-router-dom"
import { useLang } from "@/lib/i18n"
import { NAV_ITEMS } from "@/lib/nav"
import { cn } from "@/lib/utils"

export function Sidebar() {
  const { t } = useLang()
  const mainItems = NAV_ITEMS.filter((item) => item.path !== "/settings")
  const settingsItem = NAV_ITEMS.find((item) => item.path === "/settings")

  return (
    <aside className="hidden w-[72px] shrink-0 flex-col items-center border-r border-border/60 bg-white py-4 sm:flex">
      <nav className="flex flex-1 flex-col items-center gap-1.5">
        {mainItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === "/"}
            title={t[item.labelKey]}
            className={({ isActive }) =>
              cn(
                "relative flex size-11 shrink-0 items-center justify-center rounded-xl transition-colors",
                isActive ? "bg-[#EFF6FF] shadow-sm" : "hover:bg-[#F8FAFC]",
              )
            }
          >
            {({ isActive }) => (
              <>
                <item.icon
                  className="size-[19px]"
                  strokeWidth={2}
                  style={{ color: isActive ? "#2563EB" : item.iconColor }}
                />
                {item.badge ? (
                  <span
                    className="absolute top-0.5 right-0.5 flex size-3.5 items-center justify-center rounded-full text-[8px] font-bold text-white"
                    style={{ backgroundColor: item.badgeColor ?? "#2563EB" }}
                  >
                    {item.badge}
                  </span>
                ) : null}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {settingsItem && (
        <NavLink
          to={settingsItem.path}
          title={t[settingsItem.labelKey]}
          className={({ isActive }) =>
            cn(
              "flex size-11 shrink-0 items-center justify-center rounded-xl transition-colors",
              isActive ? "bg-[#EFF6FF] shadow-sm" : "hover:bg-[#F8FAFC]",
            )
          }
        >
          {({ isActive }) => (
            <settingsItem.icon
              className="size-[19px]"
              strokeWidth={2}
              style={{ color: isActive ? "#2563EB" : settingsItem.iconColor }}
            />
          )}
        </NavLink>
      )}
    </aside>
  )
}
