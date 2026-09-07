import { Outlet } from "react-router-dom"
import { NavBar } from "./NavBar"
import { Topbar } from "./Topbar"

export function AppShell() {
  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-background text-foreground">
      <Topbar />
      <NavBar />
      <main className="flex-1 overflow-y-auto p-3 sm:p-5">
        <Outlet />
      </main>
    </div>
  )
}
