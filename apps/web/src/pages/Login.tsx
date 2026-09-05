import { useState, type FormEvent } from "react"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient"

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!supabase) {
      setError("Supabase isn't configured yet — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.")
      return
    }
    setLoading(true)
    setError(null)
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (signInError) {
      setError(signInError.message)
      return
    }
    navigate("/", { replace: true })
  }

  return (
    <div className="flex h-screen w-full items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm rounded-2xl border p-7 shadow-none">
        <h1 className="font-heading text-xl font-bold">VidaClinic Staff Login</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">Sign in to manage appointments, patients, and WhatsApp conversations.</p>

        {!isSupabaseConfigured && (
          <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Supabase Auth isn't configured yet. Set <code>VITE_SUPABASE_URL</code> and{" "}
            <code>VITE_SUPABASE_ANON_KEY</code> in <code>pediatra-clinic/.env.local</code>.
          </p>
        )}

        <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-3.5">
          <div>
            <label className="mb-1.5 block text-xs font-bold">Email</label>
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-9" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold">Password</label>
            <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="h-9" />
          </div>
          {error && <p className="text-xs font-medium text-destructive">{error}</p>}
          <Button type="submit" disabled={loading} className="mt-1.5 rounded-lg font-bold">
            {loading ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </Card>
    </div>
  )
}
