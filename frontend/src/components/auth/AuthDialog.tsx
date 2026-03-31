import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Mail, Eye, EyeOff } from "lucide-react";

type AuthScreen = "signin" | "register" | "inbox" | "ldap";

function PasswordInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <input
        className="authInput" type={show ? "text" : "password"} value={value}
        onChange={e => onChange(e.target.value)} placeholder={placeholder ?? "Password"} style={{ paddingRight: 40 }}
      />
      <button type="button" onClick={() => setShow(s => !s)} tabIndex={-1}
        style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#9ca3af", padding: 2 }}>
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

export function AuthDialog({ open, onBeginOAuth, onSuccess, onClose }: {
  open: boolean;
  onBeginOAuth: (provider: "google") => void;
  onSuccess: () => void;
  onClose?: () => void;
}) {
  const [screen, setScreen]     = useState<AuthScreen>("signin");
  const [email, setEmail]       = useState("");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState("");
  const [resent, setResent]     = useState(false);
  const [linked, setLinked]     = useState(false);
  const [ldapUser, setLdapUser] = useState("");

  useEffect(() => {
    if (open) { setScreen("signin"); setEmail(""); setNickname(""); setPassword(""); setConfirm(""); setError(""); setUnverifiedEmail(""); setResent(false); setLinked(false); setLdapUser(""); }
  }, [open]);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      const res  = await fetch("/api/auth/login", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim(), password }) });
      const data = await res.json();
      if (res.ok) onSuccess();
      else if (data.code === "unverified") { setUnverifiedEmail(email.trim()); setError(data.error); }
      else if (data.code === "google_account") { setScreen("signin"); setTimeout(() => setError(data.error), 50); }
      else setError(data.error || "Sign in failed");
    } catch { setError("Network error. Please try again."); }
    finally { setLoading(false); }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault(); setError("");
    if (password !== confirm) { setError("Passwords do not match"); return; }
    if (password.length < 8)  { setError("Password must be at least 8 characters"); return; }
    setLoading(true);
    try {
      const res  = await fetch("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim(), password, name: nickname.trim() || undefined }) });
      const data = await res.json();
      if (res.ok && data.linked) { setScreen("signin"); setLinked(true); }
      else if (res.ok) setScreen("inbox");
      else setError(data.error || "Registration failed");
    } catch { setError("Network error. Please try again."); }
    finally { setLoading(false); }
  }

  async function handleLdapLogin(e: React.FormEvent) {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      const res  = await fetch("/api/auth/ldap", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: ldapUser.trim(), password }) });
      const data = await res.json();
      if (res.ok) onSuccess();
      else setError(data.error || "Authentication failed");
    } catch { setError("Network error. Please try again."); }
    finally { setLoading(false); }
  }

  async function handleResend() {
    setResent(false);
    try { await fetch("/api/auth/resend-verification", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: unverifiedEmail || email.trim() }) }); setResent(true); } catch {}
  }

  const GoogleBtn = () => (
    <button className="authProviderBtn" type="button" onClick={() => onBeginOAuth("google")}>
      <svg className="authGoogleIcon" viewBox="0 0 24 24" width="20" height="20">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
      </svg>
      <span>Continue with Google</span>
    </button>
  );

  const WindowsBtn = () => (
    <button className="authProviderBtn" type="button" onClick={() => { setScreen("ldap"); setError(""); setPassword(""); }}>
      <svg viewBox="0 0 24 24" width="20" height="20">
        <path fill="#00adef" d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.551H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/>
      </svg>
      <span>Windows / HORIBA account</span>
    </button>
  );

  const Divider = () => (
    <div className="authOrRow"><div className="authOrLine" /><div className="authOrText">OR</div><div className="authOrLine" /></div>
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="modalOverlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="modalBackdrop" onClick={onClose} />
          <motion.div initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.98 }} transition={{ duration: 0.2 }} className="authCardWrap">
            <div className="authCard">
              {onClose && <button className="authCloseBtn" onClick={onClose} title="Close"><X className="h-5 w-5" /></button>}

              {screen === "signin" && (
                <form onSubmit={handleSignIn}>
                  <div className="authHeader"><div className="authTitle">Welcome back</div><div className="authSubtitle">Sign in to access AVATAR Platform</div></div>
                  <WindowsBtn /><GoogleBtn /><Divider />
                  <div className="authField"><div className="authLabel">Email</div><input className="authInput" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" required autoFocus /></div>
                  <div className="authField"><div className="authLabel">Password</div><PasswordInput value={password} onChange={setPassword} /></div>
                  {linked && !error && <div className="authSuccess">Password added! You can now sign in with email or Google.</div>}
                  {error && (
                    <div className="authError">{error}
                      {unverifiedEmail && <span> <button type="button" className="authLink" onClick={handleResend} disabled={resent}>{resent ? "Email sent ✓" : "Resend verification email"}</button></span>}
                    </div>
                  )}
                  <button className="authContinue" type="submit" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</button>
                  <div className="authFooter">No account yet? <button type="button" className="authLink" onClick={() => { setScreen("register"); setError(""); }}>Create one</button></div>
                </form>
              )}

              {screen === "register" && (
                <form onSubmit={handleRegister}>
                  <div className="authHeader"><div className="authTitle">Create account</div><div className="authSubtitle">Register with your email address</div></div>
                  <WindowsBtn /><GoogleBtn /><Divider />
                  <div className="authField"><div className="authLabel">Nickname <span style={{ color: "#9ca3af", fontWeight: 400 }}>(display name)</span></div><input className="authInput" type="text" value={nickname} onChange={e => setNickname(e.target.value)} placeholder="How should we call you?" autoFocus /></div>
                  <div className="authField"><div className="authLabel">Email</div><input className="authInput" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" required /></div>
                  <div className="authField"><div className="authLabel">Password <span style={{ color: "#9ca3af", fontWeight: 400 }}>(min. 8 characters)</span></div><PasswordInput value={password} onChange={setPassword} placeholder="Choose a password" /></div>
                  <div className="authField"><div className="authLabel">Confirm password</div><PasswordInput value={confirm} onChange={setConfirm} placeholder="Repeat your password" /></div>
                  {error && <div className="authError">{error}</div>}
                  <button className="authContinue" type="submit" disabled={loading}>{loading ? "Sending…" : "Create account"}</button>
                  <div className="authFooter">Already have an account? <button type="button" className="authLink" onClick={() => { setScreen("signin"); setError(""); }}>Sign in</button></div>
                </form>
              )}

              {screen === "ldap" && (
                <form onSubmit={handleLdapLogin}>
                  <div className="authHeader"><div className="authTitle">Windows account</div><div className="authSubtitle">Sign in with your HORIBA credentials</div></div>
                  <div className="authField"><div className="authLabel">Username</div><input className="authInput" type="text" value={ldapUser} onChange={e => setLdapUser(e.target.value)} placeholder="firstname.lastname" required autoFocus autoComplete="username" /></div>
                  <div className="authField"><div className="authLabel">Password</div><PasswordInput value={password} onChange={setPassword} placeholder="Windows password" /></div>
                  {error && <div className="authError">{error}</div>}
                  <button className="authContinue" type="submit" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</button>
                  <div className="authFooter"><button type="button" className="authLink" onClick={() => { setScreen("signin"); setError(""); }}>Back</button></div>
                </form>
              )}

              {screen === "inbox" && (
                <div className="authInbox">
                  <div className="authInboxIcon"><Mail className="h-8 w-8" /></div>
                  <div className="authTitle" style={{ marginTop: 16 }}>Check your inbox</div>
                  <p className="authSubtitle" style={{ marginTop: 8 }}>We sent a confirmation link to<br /><strong>{email}</strong></p>
                  <p style={{ fontSize: 13, color: "#9ca3af", marginTop: 16, lineHeight: 1.6, textAlign: "center" }}>The link is valid for <strong>30 minutes</strong>.<br />After clicking it, come back here to sign in.</p>
                  <div className="authFooter" style={{ marginTop: 24 }}>Didn&apos;t receive it? <button type="button" className="authLink" onClick={handleResend} disabled={resent}>{resent ? "Email resent ✓" : "Resend"}</button></div>
                  <div className="authFooter"><button type="button" className="authLink" onClick={() => { setScreen("signin"); setError(""); }}>Back to sign in</button></div>
                </div>
              )}

              <div className="authLegal">
                <span className="authLegalLink">Terms of Service</span><span className="authLegalDot"> · </span><span className="authLegalLink">Privacy Policy</span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
