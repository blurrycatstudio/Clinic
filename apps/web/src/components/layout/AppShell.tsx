import type { ReactNode } from "react"
import { Outlet } from "react-router-dom"
import { NavBar } from "./NavBar"
import { Sidebar } from "./Sidebar"
import { Topbar } from "./Topbar"

/** `children` lets a route render AppShell directly (e.g. Home, which picks its content before routing to a nested route); nested routes keep using the default `<Outlet />`. */
export function AppShell({ children }: { children?: ReactNode }) {
  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background text-foreground">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar />
        <NavBar />
        <main className="flex-1 overflow-y-auto p-3 sm:p-5">
          {children ?? <Outlet />}
        </main>
      </div>
    </div>
  )
}
