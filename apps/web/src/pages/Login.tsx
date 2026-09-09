import { useState, type FormEvent } from "react"
import { useNavigate } from "react-router-dom"
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient"
import { useLang } from "@/lib/i18n"
import doctorImg from "@/assests/drgamaliel.png"

/* ─── Inline SVG Icons ─── */

function HeartLogo() {
  return (
    <svg width="52" height="52" viewBox="0 0 52 52" fill="none">
      {/* Stethoscope tube forming a rounded square */}
      <rect x="4" y="4" width="44" height="44" rx="16" fill="none" stroke="#3E93A0" strokeWidth="3" />
      {/* Chestpiece */}
      <circle cx="40" cy="40" r="7" fill="none" stroke="#3E93A0" strokeWidth="3" />
      <circle cx="40" cy="40" r="2" fill="#3E93A0" />
      {/* Heart with EKG pulse */}
      <path
        d="M18 15.5c-1.3-1.6-3.3-2.5-5.3-2.1-2.7.5-4.5 2.9-4.1 5.6.4 3.2 3.8 6 9.4 9.9 5.6-3.9 9-6.7 9.4-9.9.4-2.7-1.4-5.1-4.1-5.6-2-.4-4 .5-5.3 2.1Z"
        fill="#E8546B"
      />
      <path d="M6 30h5l2-4.5 2.5 8 2.5-10 2 6.5h6" stroke="#3E93A0" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PersonIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="6.5" r="3.5" stroke="#94A3B8" strokeWidth="1.5" fill="none" />
      <path d="M3 17.5c0-3.866 3.134-7 7-7s7 3.134 7 7" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="4" y="8.5" width="12" height="9" rx="2" stroke="#94A3B8" strokeWidth="1.5" fill="none" />
      <path d="M6.5 8.5V6a3.5 3.5 0 1 1 7 0v2.5" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <circle cx="10" cy="13" r="1.2" fill="#94A3B8" />
    </svg>
  )
}

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M1.5 10s3.5-6 8.5-6 8.5 6 8.5 6-3.5 6-8.5 6-8.5-6-8.5-6Z" stroke="#94A3B8" strokeWidth="1.5" fill="none" />
        <circle cx="10" cy="10" r="2.8" stroke="#94A3B8" strokeWidth="1.5" fill="none" />
      </svg>
    )
  }
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M1.5 10s3.5-6 8.5-6 8.5 6 8.5 6-3.5 6-8.5 6-8.5-6-8.5-6Z" stroke="#94A3B8" strokeWidth="1.5" fill="none" />
      <circle cx="10" cy="10" r="2.8" stroke="#94A3B8" strokeWidth="1.5" fill="none" />
      <line x1="3" y1="3" x2="17" y2="17" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function GlobeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="9" r="7.5" stroke="#475569" strokeWidth="1.3" fill="none" />
      <ellipse cx="9" cy="9" rx="3.5" ry="7.5" stroke="#475569" strokeWidth="1.3" fill="none" />
      <line x1="1.5" y1="9" x2="16.5" y2="9" stroke="#475569" strokeWidth="1.3" />
    </svg>
  )
}

function ChevronDownIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M3 4.5 6 7.5 9 4.5" stroke="#475569" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function HeartOutlineSmall() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M8 14s-6-3.6-6-7.2c0-1.8 1.44-3.3 3.24-3.3 1.14 0 2.16.6 2.76 1.5.6-.9 1.62-1.5 2.76-1.5C12.56 3.5 14 5 14 6.8 14 10.4 8 14 8 14Z"
        fill="#E8546B"
      />
    </svg>
  )
}

function PeopleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
      <circle cx="8" cy="7" r="3" stroke="#1B3A5C" strokeWidth="1.4" fill="none" />
      <path d="M2 18c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="#1B3A5C" strokeWidth="1.4" strokeLinecap="round" fill="none" />
      <circle cx="15.5" cy="8" r="2.5" stroke="#1B3A5C" strokeWidth="1.4" fill="none" />
      <path d="M14 18c0-2.5 1.5-4.5 3.5-5.5" stroke="#1B3A5C" strokeWidth="1.4" strokeLinecap="round" fill="none" />
    </svg>
  )
}

function StarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <path
        d="M10 2l2.35 4.76L17.5 7.6l-3.75 3.66.89 5.17L10 13.97l-4.64 2.46.89-5.17L2.5 7.6l5.15-.84L10 2Z"
        fill="#F5A623"
      />
    </svg>
  )
}

function ArrowRightIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M7 4.5 11.5 9 7 13.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function SpinnerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="animate-spin">
      <circle cx="9" cy="9" r="7" stroke="white" strokeWidth="2" opacity="0.3" fill="none" />
      <path d="M16 9a7 7 0 0 0-7-7" stroke="white" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  )
}

/* ─── Scoped hover / focus styles (inline styles can't express pseudo-classes) ─── */

function LoginStyles() {
  return (
    <style>{`
      .login-page .input-wrap {
        transition: border-color .18s ease, box-shadow .18s ease;
      }
      .login-page input::placeholder {
        color: #94A3B8;
      }
      .login-page .eye-btn {
        transition: background .15s ease;
      }
      .login-page .eye-btn:hover {
        background: #F1F5F9;
      }
      .login-page .link-forgot {
        transition: opacity .15s ease;
      }
      .login-page .link-forgot:hover {
        opacity: 0.7;
        text-decoration: underline;
      }
      .login-page .remember-label {
        transition: color .15s ease;
      }
      .login-page .remember-label:hover {
        color: #1B3A5C;
      }
      .login-page .btn-signin {
        transition: transform .18s ease, box-shadow .18s ease, filter .18s ease;
      }
      .login-page .btn-signin:hover:not(:disabled) {
        transform: translateY(-2px);
        box-shadow: 0 14px 30px -6px rgba(232, 84, 107, 0.45);
        filter: brightness(1.04);
      }
      .login-page .btn-signin:active:not(:disabled) {
        transform: translateY(0);
        box-shadow: 0 6px 16px -4px rgba(232, 84, 107, 0.35);
      }
      .login-page .lang-btn {
        transition: background .15s ease, box-shadow .15s ease;
      }
      .login-page .lang-btn:hover {
        background: rgba(255,255,255,0.98);
        box-shadow: 0 4px 14px -4px rgba(0,0,0,0.15);
      }
      .login-page .lang-option {
        transition: background .12s ease;
      }
    `}</style>
  )
}

/* ─── Login Page ─── */

export default function Login() {
  const navigate = useNavigate()
  const { lang, setLang, t } = useLang()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [langOpen, setLangOpen] = useState(false)
  const [focusedField, setFocusedField] = useState<"email" | "password" | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!supabase) {
      setError("Supabase isn't configured yet — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.")
      return
    }
    setLoading(true)
    setError(null)
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (err) { setError(err.message); return }
    navigate("/", { replace: true })
  }

  return (
    <div className="login-page flex h-dvh w-full overflow-hidden" style={{ background: "#FAFBFD" }}>
      <LoginStyles />

      {/* ══════════ LEFT PANEL ══════════ */}
      <div className="relative flex h-full w-full flex-col lg:w-[52%]">

        {/* Scrollable content area */}
        <div className="flex flex-1 flex-col justify-between overflow-y-auto">

          {/* ── Top content block ── */}
          <div style={{ padding: "clamp(28px, 6vw, 40px) clamp(20px, 6vw, 60px) 0 clamp(20px, 6vw, 60px)" }}>

            {/* Logo + Brand */}
            <div className="flex items-center" style={{ gap: "14px" }}>
              <HeartLogo />
              <div>
                <div
                  style={{
                    fontSize: "22px",
                    fontWeight: 700,
                    lineHeight: 1.15,
                    color: "#1B3A5C",
                    fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
                    letterSpacing: "-0.01em",
                  }}
                >
                  {t.loginBrandName}
                </div>
                <div
                  style={{
                    fontSize: "14px",
                    fontWeight: 500,
                    lineHeight: 1.2,
                    color: "#1B3A5C",
                    fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
                    letterSpacing: "0.03em",
                  }}
                >
                  {t.loginBrandSpecialty}
                </div>
              </div>
            </div>

            {/* Tagline */}
            <div
              style={{
                marginTop: "14px",
                fontSize: "11px",
                fontWeight: 600,
                textTransform: "uppercase" as const,
                letterSpacing: "0.2em",
                color: "#6B8DB5",
              }}
            >
              {t.loginTagline}
            </div>

            {/* Welcome heading block */}
            <div style={{ marginTop: "48px" }}>
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  textTransform: "uppercase" as const,
                  letterSpacing: "0.22em",
                  color: "#1B3A5C",
                }}
              >
                {t.loginWelcomeBack}
              </div>
              <h1
                style={{
                  marginTop: "14px",
                  fontSize: "clamp(28px, 5.2vw, 42px)",
                  fontWeight: 700,
                  lineHeight: 1.12,
                  letterSpacing: "-0.02em",
                  color: "#0F1E2E",
                  fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
                }}
              >
                {t.loginHeadline1}
                <br />
                {t.loginHeadline2}
              </h1>
              <p
                style={{
                  marginTop: "16px",
                  fontSize: "15px",
                  lineHeight: 1.6,
                  color: "#5A6B7F",
                }}
              >
                {t.loginSubtext1}
                <br />
                {t.loginSubtext2}
              </p>
            </div>

            {/* ── Form ── */}
            <form
              onSubmit={handleSubmit}
              style={{
                marginTop: "32px",
                maxWidth: "420px",
                display: "flex",
                flexDirection: "column" as const,
                gap: "16px",
              }}
            >
              {/* Supabase warning */}
              {!isSupabaseConfigured && (
                <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {t.loginSupabaseWarning}
                </p>
              )}

              {/* Email input */}
              <div
                className="input-wrap"
                style={{
                  display: "flex",
                  alignItems: "center",
                  height: "48px",
                  borderRadius: "12px",
                  border: focusedField === "email" ? "1px solid #1B3A5C" : "1px solid #E0E5EC",
                  boxShadow: focusedField === "email" ? "0 0 0 3px rgba(27, 58, 92, 0.10)" : "none",
                  background: "white",
                  paddingLeft: "16px",
                  paddingRight: "16px",
                  gap: "12px",
                }}
              >
                <PersonIcon />
                <input
                  type="text"
                  placeholder={t.loginEmailPlaceholder}
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={() => setFocusedField("email")}
                  onBlur={() => setFocusedField(null)}
                  style={{
                    flex: 1,
                    height: "100%",
                    border: "none",
                    outline: "none",
                    background: "transparent",
                    fontSize: "14px",
                    color: "#1B3A5C",
                    fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
                  }}
                  className="placeholder-[#94A3B8]"
                />
              </div>

              {/* Password input */}
              <div
                className="input-wrap"
                style={{
                  display: "flex",
                  alignItems: "center",
                  height: "48px",
                  borderRadius: "12px",
                  border: focusedField === "password" ? "1px solid #1B3A5C" : "1px solid #E0E5EC",
                  boxShadow: focusedField === "password" ? "0 0 0 3px rgba(27, 58, 92, 0.10)" : "none",
                  background: "white",
                  paddingLeft: "16px",
                  paddingRight: "16px",
                  gap: "12px",
                }}
              >
                <LockIcon />
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder={t.loginPasswordPlaceholder}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setFocusedField("password")}
                  onBlur={() => setFocusedField(null)}
                  style={{
                    flex: 1,
                    height: "100%",
                    border: "none",
                    outline: "none",
                    background: "transparent",
                    fontSize: "14px",
                    color: "#1B3A5C",
                    fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
                  }}
                  className="placeholder-[#94A3B8]"
                />
                <button
                  type="button"
                  className="eye-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "4px",
                    borderRadius: "6px",
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                  }}
                  tabIndex={-1}
                >
                  <EyeIcon open={showPassword} />
                </button>
              </div>

              {/* Remember me + Forgot password */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <label className="remember-label" style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={() => setRememberMe(!rememberMe)}
                    style={{ width: "16px", height: "16px", cursor: "pointer", accentColor: "#1B3A5C" }}
                  />
                  <span style={{ fontSize: "13px", fontWeight: 500, color: "#3B4A5E" }}>
                    {t.loginRememberMe}
                  </span>
                </label>
                <button
                  type="button"
                  className="link-forgot"
                  style={{
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "#1B3A5C",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  {t.loginForgotPassword}
                </button>
              </div>

              {/* Error */}
              {error && (
                <p style={{ fontSize: "13px", color: "#DC2626", background: "#FEF2F2", padding: "8px 12px", borderRadius: "8px" }}>
                  {error}
                </p>
              )}

              {/* Sign In Button */}
              <button
                type="submit"
                disabled={loading}
                className="btn-signin"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  height: "50px",
                  borderRadius: "12px",
                  border: "none",
                  background: "linear-gradient(135deg, #E8546B 0%, #D64570 30%, #A25ACD 70%, #8B7FE8 100%)",
                  boxShadow: "0 8px 24px -4px rgba(232, 84, 107, 0.35)",
                  color: "white",
                  fontSize: "16px",
                  fontWeight: 700,
                  fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
                  cursor: loading ? "default" : "pointer",
                  opacity: loading ? 0.75 : 1,
                }}
              >
                {loading && <SpinnerIcon />}
                {loading ? t.loginSigningIn : t.loginSignIn}
                {!loading && <ArrowRightIcon />}
              </button>
            </form>
          </div>

          {/* ── Bottom trust badges with wave background ── */}
          <div className="relative" style={{ marginTop: "auto" }}>
            {/* Subtle wave behind badges */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ zIndex: 0 }}>
              <svg
                viewBox="0 0 600 100"
                fill="none"
                className="absolute bottom-0 w-full"
                preserveAspectRatio="none"
                style={{ height: "100%" }}
              >
                <path
                  d="M0 100V50C80 20 180 5 280 22C380 39 460 55 540 48C570 44 590 36 600 30V100H0Z"
                  fill="#E8F0FB"
                  fillOpacity="0.45"
                />
                <path
                  d="M0 100V70C100 48 200 38 300 50C400 62 480 72 560 66C580 64 595 58 600 54V100H0Z"
                  fill="#D6E6F8"
                  fillOpacity="0.25"
                />
              </svg>
            </div>

            <div
              className="relative"
              style={{
                display: "flex",
                flexWrap: "wrap" as const,
                alignItems: "flex-start",
                gap: "36px",
                padding: "36px clamp(20px, 6vw, 60px) 28px clamp(20px, 6vw, 60px)",
                zIndex: 1,
              }}
            >
              {/* Trusted Care */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                <div
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "50%",
                    background: "#FFF0F2",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <HeartOutlineSmall />
                </div>
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "#E8546B" }}>{t.loginTrustedCareTitle}</div>
                  <div style={{ fontSize: "11.5px", color: "#7A8A9E" }}>{t.loginTrustedCareSub}</div>
                </div>
              </div>

              {/* Happy Families */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                <div
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "50%",
                    background: "#EEF2F8",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <PeopleIcon />
                </div>
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "#1B3A5C" }}>{t.loginHappyFamiliesTitle}</div>
                  <div style={{ fontSize: "11.5px", color: "#7A8A9E" }}>{t.loginHappyFamiliesSub}</div>
                </div>
              </div>

              {/* Brighter Futures */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                <div
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "50%",
                    background: "#FFF8EB",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <StarIcon />
                </div>
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "#1B3A5C" }}>{t.loginBrighterFuturesTitle}</div>
                  <div style={{ fontSize: "11.5px", color: "#7A8A9E" }}>{t.loginBrighterFuturesSub}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════ RIGHT PANEL ══════════ */}
      <div className="relative hidden h-full lg:block lg:w-[48%]" style={{ padding: "24px 24px 24px 0" }}>
      <div
        className="relative h-full w-full overflow-hidden"
        style={{ borderRadius: "32px", boxShadow: "0 24px 60px -16px rgba(15,30,46,0.28)" }}
      >

        {/* Doctor image — full photo, object-position keeps the face/torso framed.
            The photo already has its own "34+ Years of Caring" card baked in near
            the bottom, so no duplicate card is drawn on top of it. */}
        <img
          src={doctorImg}
          alt="Dr. Gamaliel – Pediatrics"
          className="absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition: "50% 15%" }}
        />

        {/* EN Language Selector — top right */}
        <div className="absolute z-20" style={{ top: "24px", right: "24px" }}>
          <div className="relative">
            <button
              type="button"
              className="lang-btn"
              onClick={() => setLangOpen(!langOpen)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 14px",
                borderRadius: "999px",
                background: "rgba(255,255,255,0.85)",
                border: "1px solid rgba(255,255,255,0.6)",
                backdropFilter: "blur(8px)",
                fontSize: "13px",
                fontWeight: 600,
                color: "#475569",
                cursor: "pointer",
              }}
            >
              <GlobeIcon />
              <span>{lang.toUpperCase()}</span>
              <ChevronDownIcon />
            </button>
            {langOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setLangOpen(false)} />
                <div
                  className="absolute right-0 z-20 overflow-hidden rounded-lg border shadow-lg"
                  style={{ top: "calc(100% + 4px)", background: "white", borderColor: "#E5E7EB" }}
                >
                  <button
                    type="button"
                    onClick={() => { setLang("en"); setLangOpen(false) }}
                    className="flex w-full px-4 py-2 text-[13px] font-medium hover:bg-gray-50"
                    style={{ color: lang === "en" ? "#1B3A5C" : "#64748B", border: "none", background: "none", cursor: "pointer" }}
                  >
                    EN
                  </button>
                  <button
                    type="button"
                    onClick={() => { setLang("es"); setLangOpen(false) }}
                    className="flex w-full px-4 py-2 text-[13px] font-medium hover:bg-gray-50"
                    style={{ color: lang === "es" ? "#1B3A5C" : "#64748B", border: "none", background: "none", cursor: "pointer" }}
                  >
                    ES
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Yellow / cream decorative wave at bottom — height scales with the panel
            so it keeps clear of the source photo's lower edge at any viewport size */}
        <div className="pointer-events-none absolute bottom-0 left-0 right-0" style={{ zIndex: 5, height: "12%" }}>
          <svg
            viewBox="0 0 800 80"
            fill="none"
            className="absolute bottom-0 w-full"
            style={{ height: "100%" }}
            preserveAspectRatio="none"
          >
            <path
              d="M0 80V55C60 25 180 5 300 18C420 31 520 60 620 58C700 56 760 42 800 30V80H0Z"
              fill="#FFF3D0"
              fillOpacity="0.55"
            />
            <path
              d="M0 80V68C100 48 220 35 340 45C460 55 550 68 660 66C730 64 780 56 800 50V80H0Z"
              fill="#FFE8A0"
              fillOpacity="0.35"
            />
          </svg>
        </div>
      </div>
      </div>
    </div>
  )
}
