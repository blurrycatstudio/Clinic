import type { ReactNode } from "react"
import { Outlet, useLocation } from "react-router-dom"
import { NavBar } from "./NavBar"
import { Sidebar } from "./Sidebar"
import { Topbar } from "./Topbar"

/** `children` lets a route render AppShell directly (e.g. Home, which picks its content before routing to a nested route); nested routes keep using the default `<Outlet />`. */
export function AppShell({ children }: { children?: ReactNode }) {
  const { pathname } = useLocation()

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background text-foreground">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar />
        <NavBar />
        {/* AppShell itself doesn't remount between nested routes (Patients -> WhatsApp -> ...
            all share this same <main> via Outlet), so its scroll position used to carry over
            from whatever page you were just on. Keying on the path forces a fresh scrollTop=0
            node on every navigation. */}
        <main key={pathname} className="flex-1 overflow-y-auto p-3 sm:p-5">
          {children ?? <Outlet />}
        </main>
      </div>
    </div>
  )
}
