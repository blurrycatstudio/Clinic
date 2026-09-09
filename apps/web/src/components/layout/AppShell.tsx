import { Outlet } from "react-router-dom"
import { NavBar } from "./NavBar"
import { Sidebar } from "./Sidebar"
import { Topbar } from "./Topbar"

export function AppShell() {
  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background text-foreground">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar />
        <NavBar />
        <main className="flex-1 overflow-y-auto p-3 sm:p-5">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
