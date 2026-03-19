import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import TalkingHeadAvatar, { type TalkingHeadAvatarHandle } from "./TalkingHeadAvatar";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  LogOut,
  X,
  CheckCircle2,
  XCircle,
  Shield,
  Building2,
  Star,
  User,
  Mic,
  Mail,
  Eye,
  EyeOff,
} from "lucide-react";
import "./App.css";
import {
  sendToGemini,
  classifyIntent,
  generateQuizQuestions,
  translateQuizQuestions,
  summarizeSlideImage,
  generateQuizFile,
  type ChatMessage,
  type Presentation,
  type QuizQuestion,
} from "./services/gemini";
import { useSpeechRecognition } from "./hooks/useSpeechRecognition";

// ─── Types ────────────────────────────────────────────────────────────────────
interface SlideData {
  paragraphs: string[];
  image: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const AVATARS = [
  { id: "alan", name: "Alan" },
  { id: "ada", name: "Ada" },
];

const LANGS = [
  { id: "en", name: "English" },
  { id: "fr", name: "French" },
  { id: "ar", name: "Arabic" },
];

const LANG_TO_LONG: Record<string, string> = { en: "english", fr: "french", ar: "arabic" };
const LONG_TO_LANG: Record<string, string> = { english: "en", french: "fr", arabic: "ar" };

const UI_STRINGS: Record<string, {
  welcome: string;
  startPresentation: (name: string) => string;
  resuming: string;
  switchingChat: string;
  error: string;
}> = {
  en: {
    welcome: "Hello! I'm your HORIBA assistant. How can I help you?",
    startPresentation: (name) => `Starting presentation: "${name}"`,
    resuming: "Resuming presentation...",
    switchingChat: "Switching to chat mode.",
    error: "Sorry, I encountered an error. Please try again.",
  },
  fr: {
    welcome: "Bonjour\u00a0! Je suis votre assistant HORIBA. Comment puis-je vous aider\u00a0?",
    startPresentation: (name) => `Démarrage de la présentation\u00a0: «\u00a0${name}\u00a0»`,
    resuming: "Reprise de la présentation...",
    switchingChat: "Passage en mode discussion.",
    error: "Désolé, une erreur s'est produite. Veuillez réessayer.",
  },
  ar: {
    welcome: "مرحباً! أنا مساعدك في HORIBA. كيف يمكنني مساعدتك؟",
    startPresentation: (name) => `بدء العرض التقديمي: "${name}"`,
    resuming: "استئناف العرض التقديمي...",
    switchingChat: "التبديل إلى وضع المحادثة.",
    error: "عذراً، حدث خطأ. يرجى المحاولة مرة أخرى.",
  },
};
const t = (lang: string) => UI_STRINGS[lang] ?? UI_STRINGS.en;

const ADMIN_EMAILS = ["alexandre.grigoriev@gmail.com", "alexandre.grigoriev@horiba.com"];
const TRUSTED_USERS: string[] = [];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getUserStatus(email: string | undefined): string {
  if (!email) return "Guest";
  const e = email.toLowerCase();
  if (ADMIN_EMAILS.includes(e)) return "Admin";
  if (e.endsWith("@horiba.com")) return "HORIBA user";
  if (TRUSTED_USERS.includes(e)) return "Trusted user";
  return "Guest";
}

function UserStatusIcon({ email, className }: { email: string | undefined; className?: string }) {
  switch (getUserStatus(email)) {
    case "Admin":        return <Shield className={className} />;
    case "HORIBA user":  return <Building2 className={className} />;
    case "Trusted user": return <Star className={className} />;
    default:             return <User className={className} />;
  }
}

function cn(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

// ─── TopSelect ────────────────────────────────────────────────────────────────
function TopSelect({
  imgSrc,
  icon,
  label,
  value,
  options,
  onChange,
}: {
  imgSrc?: string;
  icon?: React.ReactNode;
  label?: string;
  value: string;
  options: { id: string; name: string }[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.id === value);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div className="topSelectWrap" ref={wrapRef}>
      <button className="topSelectBtn" onClick={() => setOpen((v) => !v)}>
        {imgSrc ? (
          <img src={imgSrc} alt="" className="topSelectImg" />
        ) : icon ? (
          <div className="topSelectIcon">{icon}</div>
        ) : null}
        {label && <div className="topSelectLabel">{label}:</div>}
        <div className="topSelectValue">{selected?.name ?? "Select..."}</div>
        <ChevronDown className="topSelectChevron" />
      </button>
      {open && (
        <div className="topSelectDropdown">
          {options.map((o) => (
            <button
              key={o.id}
              className={cn("topSelectDropdownItem", o.id === value && "topSelectDropdownItemActive")}
              onClick={() => { onChange(o.id); setOpen(false); }}
            >
              {o.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── ModeTabs ─────────────────────────────────────────────────────────────────
function ModeTabs({
  view,
  setView,
}: {
  view: "chat" | "presentation";
  setView: (v: "chat" | "presentation") => void;
}) {
  return (
    <div className="modeTabs">
      <button
        className={cn("modeTab", view === "presentation" && "modeTabActive")}
        onClick={() => setView("presentation")}
      >
        Presentation
      </button>
      <button
        className={cn("modeTab", view === "chat" && "modeTabActive")}
        onClick={() => setView("chat")}
      >
        Chat
      </button>
    </div>
  );
}

const Card = React.forwardRef<HTMLDivElement, { children: React.ReactNode; className?: string }>(
  function Card({ children, className }, ref) {
    return <div ref={ref} className={cn("cardLite", className)}>{children}</div>;
  }
);

// ─── AuthDialog ───────────────────────────────────────────────────────────────
type AuthScreen = "signin" | "register" | "inbox";

function PasswordInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <input
        className="authInput"
        type={show ? "text" : "password"}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? "Password"}
        style={{ paddingRight: 40 }}
      />
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#9ca3af", padding: 2 }}
        tabIndex={-1}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function AuthDialog({
  open,
  onBeginOAuth,
  onSuccess,
  onClose,
}: {
  open: boolean;
  onBeginOAuth: (provider: "google") => void;
  onSuccess: () => void;
  onClose?: () => void;
}) {
  const [screen, setScreen]   = useState<AuthScreen>("signin");
  const [email, setEmail]     = useState("");
  const [nickname, setNickname] = useState("");
  const [password, setPassword]   = useState("");
  const [confirm, setConfirm]     = useState("");
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState("");
  const [resent, setResent]   = useState(false);
  const [linked, setLinked]   = useState(false);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) { setScreen("signin"); setEmail(""); setNickname(""); setPassword(""); setConfirm(""); setError(""); setUnverifiedEmail(""); setResent(false); setLinked(false); }
  }, [open]);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json();
      if (res.ok) { onSuccess(); }
      else if (data.code === "unverified") { setUnverifiedEmail(email.trim()); setError(data.error); }
      else if (data.code === "google_account") { setError(""); setScreen("signin"); setTimeout(() => setError(data.error), 50); }
      else setError(data.error || "Sign in failed");
    } catch { setError("Network error. Please try again."); }
    finally { setLoading(false); }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) { setError("Passwords do not match"); return; }
    if (password.length < 8)  { setError("Password must be at least 8 characters"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password, name: nickname.trim() || undefined }),
      });
      const data = await res.json();
      if (res.ok && data.linked) { setScreen("signin"); setLinked(true); }
      else if (res.ok) { setScreen("inbox"); }
      else setError(data.error || "Registration failed");
    } catch { setError("Network error. Please try again."); }
    finally { setLoading(false); }
  }

  async function handleResend() {
    setResent(false);
    try {
      await fetch("/api/auth/resend-verification", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: unverifiedEmail || email.trim() }),
      });
      setResent(true);
    } catch { /* silent */ }
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

  const Divider = () => (
    <div className="authOrRow">
      <div className="authOrLine" /><div className="authOrText">OR</div><div className="authOrLine" />
    </div>
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="modalOverlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="modalBackdrop" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className="authCardWrap"
          >
            <div className="authCard">
              {onClose && (
                <button className="authCloseBtn" onClick={onClose} title="Close"><X className="h-5 w-5" /></button>
              )}

              {/* ── Sign In ── */}
              {screen === "signin" && (
                <form onSubmit={handleSignIn}>
                  <div className="authHeader">
                    <div className="authTitle">Welcome back</div>
                    <div className="authSubtitle">Sign in to access AVATAR Platform</div>
                  </div>
                  <GoogleBtn />
                  <Divider />
                  <div className="authField">
                    <div className="authLabel">Email</div>
                    <input className="authInput" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" required autoFocus />
                  </div>
                  <div className="authField">
                    <div className="authLabel">Password</div>
                    <PasswordInput value={password} onChange={setPassword} />
                  </div>
                  {linked && !error && (
                    <div className="authSuccess">Password added! You can now sign in with email or Google.</div>
                  )}
                  {error && (
                    <div className="authError">
                      {error}
                      {unverifiedEmail && (
                        <span>
                          {" "}
                          <button type="button" className="authLink" onClick={handleResend} disabled={resent}>
                            {resent ? "Email sent ✓" : "Resend verification email"}
                          </button>
                        </span>
                      )}
                    </div>
                  )}
                  <button className="authContinue" type="submit" disabled={loading}>
                    {loading ? "Signing in…" : "Sign in"}
                  </button>
                  <div className="authFooter">
                    No account yet?{" "}
                    <button type="button" className="authLink" onClick={() => { setScreen("register"); setError(""); }}>Create one</button>
                  </div>
                </form>
              )}

              {/* ── Register ── */}
              {screen === "register" && (
                <form onSubmit={handleRegister}>
                  <div className="authHeader">
                    <div className="authTitle">Create account</div>
                    <div className="authSubtitle">Register with your email address</div>
                  </div>
                  <GoogleBtn />
                  <Divider />
                  <div className="authField">
                    <div className="authLabel">Nickname <span style={{ color: "#9ca3af", fontWeight: 400 }}>(display name)</span></div>
                    <input className="authInput" type="text" value={nickname} onChange={e => setNickname(e.target.value)} placeholder="How should we call you?" autoFocus />
                  </div>
                  <div className="authField">
                    <div className="authLabel">Email</div>
                    <input className="authInput" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" required />
                  </div>
                  <div className="authField">
                    <div className="authLabel">Password <span style={{ color: "#9ca3af", fontWeight: 400 }}>(min. 8 characters)</span></div>
                    <PasswordInput value={password} onChange={setPassword} placeholder="Choose a password" />
                  </div>
                  <div className="authField">
                    <div className="authLabel">Confirm password</div>
                    <PasswordInput value={confirm} onChange={setConfirm} placeholder="Repeat your password" />
                  </div>
                  {error && <div className="authError">{error}</div>}
                  <button className="authContinue" type="submit" disabled={loading}>
                    {loading ? "Sending…" : "Create account"}
                  </button>
                  <div className="authFooter">
                    Already have an account?{" "}
                    <button type="button" className="authLink" onClick={() => { setScreen("signin"); setError(""); }}>Sign in</button>
                  </div>
                </form>
              )}

              {/* ── Check inbox ── */}
              {screen === "inbox" && (
                <div className="authInbox">
                  <div className="authInboxIcon"><Mail className="h-8 w-8" /></div>
                  <div className="authTitle" style={{ marginTop: 16 }}>Check your inbox</div>
                  <p className="authSubtitle" style={{ marginTop: 8 }}>
                    We sent a confirmation link to<br />
                    <strong>{email}</strong>
                  </p>
                  <p style={{ fontSize: 13, color: "#9ca3af", marginTop: 16, lineHeight: 1.6, textAlign: "center" }}>
                    The link is valid for <strong>30 minutes</strong>.<br />
                    After clicking it, come back here to sign in.
                  </p>
                  <div className="authFooter" style={{ marginTop: 24 }}>
                    Didn&apos;t receive it?{" "}
                    <button type="button" className="authLink" onClick={handleResend} disabled={resent}>
                      {resent ? "Email resent ✓" : "Resend"}
                    </button>
                  </div>
                  <div className="authFooter">
                    <button type="button" className="authLink" onClick={() => { setScreen("signin"); setError(""); }}>Back to sign in</button>
                  </div>
                </div>
              )}

              <div className="authLegal">
                <span className="authLegalLink">Terms of Service</span>
                <span className="authLegalDot"> · </span>
                <span className="authLegalLink">Privacy Policy</span>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── QuizGenerationDialog ─────────────────────────────────────────────────────
function QuizGenerationDialog({
  presName, presLang, onClose, onQuizSaved,
}: { presName: string; presLang: string; onClose: () => void; onQuizSaved?: () => void }) {
  const [step, setStep]           = useState<"ask" | "form" | "generating" | "done">("ask");
  const [count, setCount]         = useState(5);
  const [email, setEmail]         = useState("");
  const [error, setError]         = useState("");

  async function generate() {
    setStep("generating"); setError("");
    try {
      const contentRes  = await fetch(`/uploads/${encodeURIComponent(presName)}/content_${presLang}.txt`);
      const content     = await contentRes.text();
      const questions   = await generateQuizFile(content, presLang, count);
      if (!questions.length) throw new Error("Gemini returned no questions");
      const saveRes = await fetch(`/api/presentations/${encodeURIComponent(presName)}/quiz`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions, sendto: email }),
      });
      if (!saveRes.ok) { const d = await saveRes.json().catch(() => ({})); throw new Error(d.error || `Save failed: ${saveRes.status}`); }
      setStep("done");
      onQuizSaved?.();
    } catch (e: unknown) {
      setError((e instanceof Error ? e.message : null) ?? "Generation failed");
      setStep("form");
    }
  }

  const dialogStyle: React.CSSProperties = {
    position: "relative", zIndex: 301,
    background: "#fff", border: "1px solid #e5e7eb",
    borderRadius: 16, padding: "32px 28px", width: 440, maxWidth: "90vw",
    boxShadow: "0 40px 80px rgba(0,0,0,0.18)",
    color: "#111827",
  };

  return (
    <motion.div className="modalOverlay" style={{ zIndex: 300 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="modalBackdrop" onClick={onClose} />
      <motion.div initial={{ opacity: 0, y: 10, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.18 }} style={dialogStyle}>

        {step === "ask" && (<>
          <div style={{ fontWeight: 700, fontSize: 17, color: "#111827", marginBottom: 10 }}>Generate a quiz?</div>
          <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 24, lineHeight: 1.6 }}>
            Would you like Gemini to generate quiz questions for <strong style={{ color: "#111827" }}>{presName}</strong>?
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button className="presSubmitBtn" onClick={() => setStep("form")}>Yes — generate quiz</button>
            <button className="presCancelBtn" onClick={onClose}>Skip</button>
          </div>
        </>)}

        {step === "form" && (<>
          <div style={{ fontWeight: 700, fontSize: 17, color: "#111827", marginBottom: 20 }}>Quiz settings</div>
          <div className="presFieldRow" style={{ marginBottom: 16 }}>
            <div className="presFieldLabel">Number of questions</div>
            <input
              type="number" min={1} max={30} value={count}
              onChange={e => setCount(Math.max(1, Math.min(30, Number(e.target.value))))}
              className="presFieldInput" style={{ width: 100 }}
            />
          </div>
          <div className="presFieldRow" style={{ marginBottom: 16 }}>
            <div className="presFieldLabel">Reviewer e-mail <span style={{ color: "#6b7280", fontWeight: 400 }}>(optional)</span></div>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="reviewer@example.com"
              className="presFieldInput"
            />
          </div>
          {error && <div className="authError" style={{ marginBottom: 12 }}>{error}</div>}
          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <button className="presSubmitBtn" style={{ flex: 1 }} onClick={generate}>Generate</button>
            <button className="presCancelBtn" style={{ flex: 1 }} onClick={onClose}>Skip</button>
          </div>
        </>)}

        {step === "generating" && (
          <div style={{ textAlign: "center", padding: "16px 0" }}>
            <div style={{ fontSize: 15, color: "#6b7280", marginBottom: 12 }}>Generating {count} questions with Gemini…</div>
            <div className="presFieldLabel" style={{ color: "#478cd0" }}>Please wait</div>
          </div>
        )}

        {step === "done" && (<>
          <div style={{ fontWeight: 700, fontSize: 17, color: "#111827", marginBottom: 10 }}>Quiz saved!</div>
          <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 24, lineHeight: 1.6 }}>
            {count} questions generated.
            {email
              ? <> Quiz results will be reviewed by <strong style={{ color: "#111827" }}>{email}</strong>.</>
              : <> No reviewer email set.</>
            }
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button className="presSubmitBtn" onClick={onClose}>Close</button>
          </div>
        </>)}

      </motion.div>
    </motion.div>
  );
}

// ─── PresentationDialog ───────────────────────────────────────────────────────
function PresentationDialog({
  open,
  onClose,
  onSelect,
  onQuizReady,
  defaultLang,
  presentations,
  isAdmin,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (payload:
    | { mode: "existing"; name: string }
    | { mode: "new"; name: string; description: string; lang: string; file?: File | null }
  ) => void;
  onQuizReady: (presName: string, presLang: string) => void;
  defaultLang: string;
  presentations: Presentation[];
  isAdmin: boolean;
}) {
  const [mode, setMode] = useState<"new" | "existing">("existing");
  const [existingName, setExistingName] = useState(presentations[0]?.name ?? "");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [lang, setLang] = useState(defaultLang);
  const [pptxFile, setPptxFile] = useState<File | null>(null);
  const [pdfFile, setPdfFile]   = useState<File | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [langDropdownOpen, setLangDropdownOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [showSummarizeConfirm, setShowSummarizeConfirm] = useState(false);

  useEffect(() => {
    if (open) {
      setLang(defaultLang);
      if (presentations.length) setExistingName(presentations[0].name);
      setPptxFile(null); setPdfFile(null); setImportError(""); setShowSummarizeConfirm(false);
    }
  }, [open, defaultLang, presentations]);

  async function doImport(summarize: "gemini" | "none") {
    if (!name.trim() || !pdfFile) return;
    setShowSummarizeConfirm(false);
    setImporting(true); setImportError("");
    try {
      const form = new FormData();
      form.append("name", name.trim());
      form.append("description", description.trim());
      const longLang = LANG_TO_LONG[lang] ?? "english";
      form.append("language", longLang);
      form.append("pdf", pdfFile);
      if (pptxFile) form.append("pptx", pptxFile);
      else form.append("summarize", "none"); // always use "none" on backend; Gemini runs here
      const res  = await fetch("/api/presentations/import", { method: "POST", credentials: "include", body: form });
      const text = await res.text();
      const data = (() => { try { return JSON.parse(text); } catch { return { error: text || "Import failed" }; } })();
      if (!res.ok) { setImportError(data.error || "Import failed"); return; }

      // Gemini summarization — best-effort, never blocks quiz dialog
      if (summarize === "gemini" && data.images?.length) {
        const presName = data.name ?? name.trim();
        try {
          const notes: string[] = [];

          async function slideToJpegBase64(imgUrl: string): Promise<string> {
            const imgRes = await fetch(imgUrl);
            const blob   = await imgRes.blob();
            const bmp    = await createImageBitmap(blob);
            const maxW = 1280, maxH = 720;
            const scale = Math.min(maxW / bmp.width, maxH / bmp.height, 1);
            const w = Math.round(bmp.width * scale);
            const h = Math.round(bmp.height * scale);
            const canvas = document.createElement("canvas");
            canvas.width = w; canvas.height = h;
            canvas.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
            return new Promise<string>((resolve) => {
              canvas.toBlob((b) => {
                const reader = new FileReader();
                reader.onload = () => resolve((reader.result as string).split(",")[1]);
                reader.readAsDataURL(b!);
              }, "image/jpeg", 0.82);
            });
          }

          for (const img of data.images as string[]) {
            const base64  = await slideToJpegBase64(`/uploads/${encodeURIComponent(presName)}/${img}`);
            const summary = await summarizeSlideImage(base64, longLang);
            notes.push(summary);
          }
          await fetch(`/api/presentations/${encodeURIComponent(presName)}/notes`, {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ notes, language: longLang }),
          });
        } catch (geminiErr: unknown) {
          // Summarization failed — show warning but still proceed to quiz dialog
          setImportError("Slides imported, but Gemini summarization failed: " + (geminiErr instanceof Error ? geminiErr.message : "unknown error"));
        }
      }

      onSelect({ mode: "new", name: name.trim(), description: description.trim(), lang });
      onClose();
      onQuizReady(data.name ?? name.trim(), longLang);
    } catch (e: unknown) { setImportError((e instanceof Error ? e.message : null) ?? "Network error. Please try again."); }
    finally  { setImporting(false); }
  }

  function handleImport() {
    if (!name.trim() || !pdfFile) return;
    if (!pptxFile) {
      setShowSummarizeConfirm(true);
    } else {
      doImport("none");
    }
  }

  const selectedPresentation = useMemo(
    () => presentations.find((p) => p.name === existingName),
    [existingName, presentations]
  );
  const selectedLang = useMemo(() => LANGS.find((l) => l.id === lang), [lang]);

  return (
    <>
    <AnimatePresence>
      {open && (
        <motion.div className="modalOverlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="modalBackdrop" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.985 }}
            transition={{ duration: 0.2 }}
            className="presModalWrap"
          >
            <div className="presModal">
              <button className="presCloseBtn" onClick={onClose} title="Close"><X className="h-5 w-5" /></button>
              <div className="presModalHeader">
                <div className="presModalTitle">Presentation options</div>
                <div className="presModalSubtitle">Select an existing presentation or create a new one</div>
              </div>
              <div className="presModeRow">
                <button
                  className={cn("presModeBtn", mode === "existing" && "presModeBtnActive")}
                  onClick={() => setMode("existing")}
                >
                  <span className="presModeBtnTitle">Existing presentation</span>
                  <span className="presModeBtnDesc">Pick from the library</span>
                </button>
                {isAdmin && (
                  <button
                    className={cn("presModeBtn", mode === "new" && "presModeBtnActive")}
                    onClick={() => setMode("new")}
                  >
                    <span className="presModeBtnTitle">New presentation</span>
                    <span className="presModeBtnDesc">Upload and register a new presentation</span>
                  </button>
                )}
              </div>

              <div className="presForm">
                {mode === "existing" && (
                  <>
                    <div className="presFieldRow">
                      <div className="presFieldLabel">Select a presentation</div>
                      {presentations.length === 0 ? (
                        <div className="text-sm text-gray-400 italic">No presentations available</div>
                      ) : (
                        <div className="presSelectWrap">
                          <button className="presSelectBtn" onClick={() => setDropdownOpen((v) => !v)}>
                            <span>
                              {selectedPresentation?.name ?? "Select..."}
                              {selectedPresentation && (
                                <span className="presSelectLang"> — {selectedPresentation.language.toUpperCase()}</span>
                              )}
                            </span>
                            <ChevronDown className="h-4 w-4" />
                          </button>
                          {dropdownOpen && (
                            <div className="presDropdown">
                              {presentations.map((p) => (
                                <button
                                  key={p.name}
                                  className={cn("presDropdownItem", p.name === existingName && "presDropdownItemActive")}
                                  onClick={() => { setExistingName(p.name); setDropdownOpen(false); }}
                                >
                                  {p.name} — {p.language.toUpperCase()}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    {selectedPresentation && (
                      <div className="presPreviewCard">
                        <div className="presPreviewTitle">{selectedPresentation.name}</div>
                        <div className="presPreviewDesc">{selectedPresentation.description}</div>
                        <div className="presPreviewLang">Language: {selectedPresentation.language.toUpperCase()}</div>
                      </div>
                    )}
                  </>
                )}

                {mode === "new" && (
                  <>
                    <div className="presFieldRow">
                      <div className="presFieldLabel">Presentation name</div>
                      <input
                        className="presFieldInput"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Enter new presentation name"
                      />
                    </div>
                    <div className="presFieldRow">
                      <div className="presFieldLabel">Description</div>
                      <input
                        className="presFieldInput"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Enter description"
                      />
                    </div>
                    <div className="presFieldRow">
                      <div className="presFieldLabel">Presentation language</div>
                      <div className="presSelectWrap">
                        <button className="presSelectBtn" onClick={() => setLangDropdownOpen((v) => !v)}>
                          <span>{selectedLang?.name ?? "Select language..."}</span>
                          <ChevronDown className="h-4 w-4" />
                        </button>
                        {langDropdownOpen && (
                          <div className="presDropdown">
                            {LANGS.map((l) => (
                              <button
                                key={l.id}
                                className={cn("presDropdownItem", l.id === lang && "presDropdownItemActive")}
                                onClick={() => { setLang(l.id); setLangDropdownOpen(false); }}
                              >
                                {l.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="presFieldRow">
                      <div className="presFieldLabel">PDF file <span style={{color:"#ef4444",fontWeight:700}}>*</span> <span style={{color:"#6b7280",fontWeight:400}}>(slides exported from PowerPoint)</span></div>
                      <div className="presFileUpload">
                        <label className="presFileBtn">
                          Choose PDF
                          <input type="file" accept=".pdf" onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)} className="presFileInput" />
                        </label>
                        <span className="presFileName">{pdfFile ? pdfFile.name : "No file chosen"}</span>
                      </div>
                    </div>
                    <div className="presFieldRow">
                      <div className="presFieldLabel">PPTX file <span style={{color:"#6b7280",fontWeight:400}}>(optional — for slide notes)</span></div>
                      <div className="presFileUpload">
                        <label className="presFileBtn">
                          Choose PPTX
                          <input type="file" accept=".pptx,.ppt" onChange={(e) => setPptxFile(e.target.files?.[0] ?? null)} className="presFileInput" />
                        </label>
                        <span className="presFileName">{pptxFile ? pptxFile.name : "No file chosen"}</span>
                      </div>
                    </div>
                    {importError && <div className="authError" style={{marginTop:8}}>{importError}</div>}
                  </>
                )}
              </div>

              <div className="presFooter">
                <button className="presCancelBtn" onClick={onClose}>Cancel</button>
                {mode === "existing" ? (
                  <button
                    className="presSubmitBtn"
                    disabled={!existingName}
                    onClick={() => { if (existingName) { onSelect({ mode: "existing", name: existingName }); onClose(); } }}
                  >
                    Open
                  </button>
                ) : (
                  <button
                    className="presSubmitBtn"
                    disabled={!name.trim() || !pdfFile || importing}
                    onClick={handleImport}
                  >
                    {importing ? "Importing…" : "Import"}
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>

    {createPortal(
      <AnimatePresence>
        {showSummarizeConfirm && (
          <motion.div className="modalOverlay" style={{ zIndex: 300 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="modalBackdrop" onClick={() => setShowSummarizeConfirm(false)} />
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.97 }}
              transition={{ duration: 0.18 }}
              style={{
                position: "relative", zIndex: 301,
                background: "#fff", border: "1px solid #e5e7eb",
                borderRadius: 16, padding: "32px 28px", width: 420, maxWidth: "90vw",
                boxShadow: "0 40px 80px rgba(0,0,0,0.18)",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 17, color: "#111827", marginBottom: 10 }}>
                No PPTX file selected
              </div>
              <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 24, lineHeight: 1.6 }}>
                Would you like Google Gemini to analyse each slide image and generate spoken notes automatically?
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <button className="presSubmitBtn" onClick={() => doImport("gemini")}>
                  Yes — generate notes with Gemini
                </button>
                <button className="presCancelBtn" onClick={() => doImport("none")}>
                  No — import without notes
                </button>
                <button className="presCancelBtn" onClick={() => setShowSummarizeConfirm(false)}>
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>,
      document.body
    )}
    </>
  );
}

// ─── SlideViewport ────────────────────────────────────────────────────────────
function SlideViewport({
  slides,
  presentationName,
  onEnd,
  onSpeak,
  onStopSpeaking,
  onWaitUntilDone,
  onPlayingChange,
  avatarHidden,
}: {
  slides: SlideData[];
  presentationName: string;
  onEnd: () => void;
  onSpeak: (text: string) => void;
  onStopSpeaking: () => void;
  onWaitUntilDone: () => Promise<void>;
  onPlayingChange?: (playing: boolean, reason: "manual" | "end") => void;
  avatarHidden?: boolean;
}) {
  const [page, setPage] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const isPlayingRef = useRef(false);
  const total = slides.length;

  // Keep ref in sync so the async play loop can read current value
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  function changePlayState(value: boolean, reason: "manual" | "end" = "manual") {
    setIsPlaying(value);
    onPlayingChange?.(value, reason);
  }

  // Reset to first slide when presentation changes
  useEffect(() => {
    setPage(0);
    changePlayState(false, "manual");
  }, [presentationName]);

  // Speak slide content only when playing and page changes
  useEffect(() => {
    if (!isPlaying) return;
    const slide = slides[page];
    if (!slide) return;
    onStopSpeaking();
    slide.paragraphs.forEach((p) => onSpeak(p));
  }, [page, slides, isPlaying]);

  // Auto-advance loop when playing
  useEffect(() => {
    if (!isPlaying || total === 0) return;
    let cancelled = false;

    (async () => {
      await onWaitUntilDone();
      if (cancelled || !isPlayingRef.current) return;
      if (page < total - 1) {
        setPage((p) => p + 1);
      } else {
        changePlayState(false, "end");
        onEnd();
      }
    })();

    return () => { cancelled = true; };
  }, [isPlaying, page, total]);

  const slide = slides[page];

  function goTo(idx: number) {
    onStopSpeaking();
    setPage(Math.max(0, Math.min(total - 1, idx)));
  }

  return (
    <div className="slideWrap">
      <div className={`slideCanvas${avatarHidden ? " slideCanvasExpanded" : ""}`}>
        {slide ? (
          <img
            src={`/uploads/${encodeURIComponent(presentationName)}/${encodeURIComponent(slide.image)}`}
            alt={`Slide ${page + 1}`}
            className="slideImg"
          />
        ) : (
          <div className="slidePlaceholder">
            <div className="text-sm text-gray-600">No slides loaded</div>
            <div className="text-2xl font-semibold mt-2">Select a presentation</div>
            <div className="text-sm text-gray-500 mt-2 max-w-md">
              Use the Select button or ask the assistant to start a presentation.
            </div>
          </div>
        )}
      </div>

      <div className="slideControlsWrapper">
        <div className="slideControlsTop">
          <button className="slideControlBtn" onClick={() => goTo(0)} title="Go to start" disabled={total === 0}>
            <img src="/assets/start.png" alt="Start" className="slideControlIcon" />
          </button>
          <button className="slideControlBtn" onClick={() => goTo(page - 1)} title="Previous slide" disabled={page === 0 || total === 0}>
            <img src="/assets/left.png" alt="Previous" className="slideControlIconLarge" />
          </button>

          <div className="progressBar">
            <div className="progressFill" style={{ width: total ? `${((page + 1) / total) * 100}%` : "0%" }} />
            <div className="progressText">{total ? `${page + 1} of ${total}` : "—"}</div>
          </div>

          <button className="slideControlBtn" onClick={() => goTo(page + 1)} title="Next slide" disabled={page >= total - 1 || total === 0}>
            <img src="/assets/right.png" alt="Next" className="slideControlIconLarge" />
          </button>
          <button className="slideControlBtn" onClick={() => goTo(total - 1)} title="Go to end" disabled={total === 0}>
            <img src="/assets/end.png" alt="End" className="slideControlIcon" />
          </button>
        </div>

        <div className="slideControlsBottom">
          <button
            className="slideControlBtn"
            disabled={total === 0}
            onClick={() => {
              if (isPlaying) {
                changePlayState(false, "manual");
                onStopSpeaking();
              } else {
                if (page >= total - 1) {
                  setPage(0);
                }
                changePlayState(true);
              }
            }}
            title={isPlaying ? "Stop" : "Play"}
          >
            <img
              src={isPlaying ? "/assets/stop.png" : "/assets/play.png"}
              alt={isPlaying ? "Stop" : "Play"}
              className="slideControlIcon"
            />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── QuizWidget ───────────────────────────────────────────────────────────────
function convertJsonQuestions(raw: Array<{ question: string; type: string; choices: string[]; correctAnswers: number[] }>): QuizQuestion[] {
  return raw.map((q) => {
    const options = q.choices.map((label, i) => ({ id: String.fromCharCode(97 + i), label }));
    const correct = q.correctAnswers.map((i) => options[i].id);
    return { question: q.question, options, correct, explanation: "", type: q.type === "multiple" ? "multiple" : "single" };
  });
}

function QuizWidget({
  presentationContent, presentationName, lang, userName, userEmail,
}: {
  presentationContent: string;
  presentationName: string;
  lang: string;
  userName?: string;
  userEmail?: string;
}) {
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string[]>>({});
  const [validated, setValidated] = useState<Record<number, boolean>>({});
  const [sendTo, setSendTo] = useState("alexandre.grigoriev@horiba.com");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!presentationContent && !presentationName) return;
    setLoading(true);
    setIdx(0);
    setAnswers({});
    setValidated({});
    setSubmitted(false);
    (async () => {
      try {
        if (presentationName) {
          const langFile = LANG_TO_LONG[lang] ?? lang; // e.g. "french"
          const base = `/uploads/${encodeURIComponent(presentationName)}`;

          // 1. Try language-specific file (question_french.json etc.) — no translation needed
          const res1 = await fetch(`${base}/question_${langFile}.json`);
          if (res1.ok) {
            const data = await res1.json();
            if (Array.isArray(data.questions) && data.questions.length > 0) {
              if (data.sendto) setSendTo(data.sendto);
              setQuestions(convertJsonQuestions(data.questions));
              return;
            }
          }

          // 2. Try default question.json and translate if needed
          const res2 = await fetch(`${base}/question.json`);
          if (res2.ok) {
            const data = await res2.json();
            if (Array.isArray(data.questions) && data.questions.length > 0) {
              if (data.sendto) setSendTo(data.sendto);
              let qs = convertJsonQuestions(data.questions);
              if (lang !== "en") qs = await translateQuizQuestions(qs, lang);
              setQuestions(qs);
              return;
            }
          }
        }

        // 3. Fall back to Gemini generation from presentation content
        if (presentationContent) {
          const qs = await generateQuizQuestions(presentationContent, lang);
          setQuestions(qs);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, [presentationContent, presentationName, lang]);

  const toggleAnswer = (qIdx: number, optId: string, multiple: boolean) => {
    setAnswers((prev) => {
      const cur = prev[qIdx] ?? [];
      if (multiple) {
        return { ...prev, [qIdx]: cur.includes(optId) ? cur.filter((id) => id !== optId) : [...cur, optId] };
      }
      return { ...prev, [qIdx]: [optId] };
    });
  };

  const handleSubmit = async () => {
    let score = 0;
    const lines: string[] = [
      `Quiz Results — ${presentationName}`,
      `Date: ${new Date().toLocaleString()}`,
      ...(userName ? [`User: ${userName}`] : []),
      ...(userEmail ? [`Email: ${userEmail}`] : []),
      "",
    ];
    questions.forEach((q, i) => {
      const selected = answers[i] ?? [];
      const isCorrect = q.correct.length === selected.length && q.correct.every((c) => selected.includes(c));
      if (isCorrect) score++;
      const selLabels = selected.map((id) => q.options.find((o) => o.id === id)?.label ?? id).join(", ");
      const corLabels = q.correct.map((id) => q.options.find((o) => o.id === id)?.label ?? id).join(", ");
      lines.push(`Q${i + 1}: ${q.question}`, `  Answer: ${selLabels || "(none)"}`, `  Correct: ${corLabels} ${isCorrect ? "✓" : "✗"}`, "");
    });
    lines.push(`Score: ${score} / ${questions.length}`);

    const to = sendTo || "alexandre.grigoriev@horiba.com";
    await fetch("/api/quiz/send-results", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to,
        subject: `Quiz Results — ${presentationName}`,
        text: lines.join("\n"),
      }),
    });
    setSubmitted(true);
  };

  if (loading) return (
    <div className="quizWrap" style={{ alignItems: "center", justifyContent: "center", display: "flex", flex: 1 }}>
      <div className="avatarSpinner" />
    </div>
  );

  if (submitted) return (
    <div className="quizWrap" style={{ alignItems: "center", justifyContent: "center", display: "flex", flex: 1 }}>
      <div style={{ color: "#111827", fontSize: 14, textAlign: "center", padding: "0 24px", lineHeight: 1.6 }}>
        <CheckCircle2 className="h-8 w-8 text-green-600" style={{ margin: "0 auto 12px" }} />
        Results sent! Thank you for completing the quiz.
      </div>
    </div>
  );

  if (!questions.length) return (
    <div className="quizWrap" style={{ alignItems: "center", justifyContent: "center", display: "flex", flex: 1 }}>
      <div style={{ color: "#6b7280", fontSize: 14, textAlign: "center", padding: "0 16px" }}>
        No quiz available. Complete a presentation first.
      </div>
    </div>
  );

  const q = questions[idx];
  const isLast = idx === questions.length - 1;
  const isMultiple = q.type === "multiple";
  const selectedIds = answers[idx] ?? [];
  const isValidated = isMultiple ? !!validated[idx] : selectedIds.length > 0;
  const showResult = isValidated;

  return (
    <div className="quizWrap">
      <div className="quizHeader">
        <div className="font-semibold">Quiz</div>
        <div className="text-xs text-gray-500">{idx + 1} / {questions.length}</div>
      </div>
      <div className="quizCard">
        <div className="text-sm font-medium">{q.question}</div>
        {isMultiple && <div className="text-xs text-gray-400 mt-1">Select all that apply</div>}
        <div className="mt-3 grid gap-2">
          {q.options.map((o) => {
            const selected = selectedIds.includes(o.id);
            const isCorrect = q.correct.includes(o.id);
            return (
              <button key={o.id} onClick={() => !isValidated && toggleAnswer(idx, o.id, isMultiple)} className={cn("quizOption", selected && "quizOptionSelected")} style={isValidated ? { cursor: "default" } : undefined}>
                <div className="flex items-center justify-between">
                  <div className="text-sm">{o.label}</div>
                  {showResult && (isCorrect ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : selected ? (
                    <XCircle className="h-4 w-4 text-red-600" />
                  ) : null)}
                </div>
              </button>
            );
          })}
        </div>
        {showResult && q.explanation && <div className="mt-3 text-xs text-gray-600">{q.explanation}</div>}
      </div>
      <div className="quizFooter">
        <button className="ghostBtn" disabled={idx === 0} onClick={() => setIdx((i) => i - 1)}>Previous</button>
        {isMultiple && !isValidated
          ? <button className="blueBtn" disabled={selectedIds.length === 0} onClick={() => setValidated((v) => ({ ...v, [idx]: true }))}>Validate</button>
          : isLast
            ? <button className="blueBtn" onClick={handleSubmit}>Submit</button>
            : <button className="blueBtn" onClick={() => setIdx((i) => i + 1)}>Next</button>
        }
      </div>
    </div>
  );
}

// ─── ChatPanel ────────────────────────────────────────────────────────────────
function ChatPanel({
  open,
  onClose,
  panelMode,
  lang,
  onSpeak,
  onStopSpeaking,
  presentations,
  presentationContent,
  presentationName,
  userName,
  userEmail,
  onStartPresentation,
  onContinuePresentation,
  onSwitchToChat,
}: {
  open: boolean;
  onClose: () => void;
  panelMode: "discussion" | "quiz";
  lang: string;
  onSpeak: (text: string) => void;
  onStopSpeaking: () => void;
  presentations: Presentation[];
  presentationContent: string;
  presentationName: string;
  userName?: string;
  userEmail?: string;
  onStartPresentation: (name: string) => void;
  onContinuePresentation: () => void;
  onSwitchToChat: () => void;
}) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; text: string; isAction?: boolean }[]>([]);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const speech = useSpeechRecognition(lang);

  // Welcome message resets when language changes
  useEffect(() => {
    const welcome = t(lang).welcome;
    const welcomeMsg = { role: "assistant" as const, text: welcome };
    setMessages([welcomeMsg]);
    setHistory([{ role: "assistant", text: welcome }]);
  }, [lang]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isThinking]);

  const send = useCallback(async (text?: string) => {
    const v = (text ?? input).trim();
    if (!v || isThinking) return;
    setInput("");

    const userMsg = { role: "user" as const, text: v };
    setMessages((m) => [...m, userMsg]);
    setIsThinking(true);

    try {
      const intent = await classifyIntent(v, presentations);

      if (intent.type === "clear_chat") {
        const welcome = t(lang).welcome;
        setMessages([{ role: "assistant", text: welcome }]);
        setHistory([{ role: "assistant", text: welcome }]);
        setIsThinking(false);
        return;
      }

      if (intent.type === "run_presentation" && intent.value) {
        const match = presentations.find(
          (p) => p.name.toLowerCase() === intent.value!.toLowerCase()
        ) ?? presentations.find(
          (p) => p.name.toLowerCase().includes(intent.value!.toLowerCase())
        );
        const name = match?.name ?? intent.value;
        setMessages((m) => [
          ...m,
          { role: "assistant", text: t(lang).startPresentation(name), isAction: true },
        ]);
        setIsThinking(false);
        onStartPresentation(name);
        return;
      }

      if (intent.type === "continue_presentation") {
        setMessages((m) => [
          ...m,
          { role: "assistant", text: t(lang).resuming, isAction: true },
        ]);
        setIsThinking(false);
        onContinuePresentation();
        return;
      }

      if (intent.type === "change_view_chat") {
        setMessages((m) => [
          ...m,
          { role: "assistant", text: t(lang).switchingChat, isAction: true },
        ]);
        setIsThinking(false);
        onSwitchToChat();
        return;
      }

      // answer_question
      const newHistory: ChatMessage[] = [...history, { role: "user", text: v }];
      const response = await sendToGemini(v, newHistory, presentations, presentationContent);
      const botMsg = { role: "assistant" as const, text: response };
      setMessages((m) => [...m, botMsg]);
      setHistory([...newHistory, { role: "assistant", text: response }]);
      onStopSpeaking();
      onSpeak(response);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "assistant", text: t(lang).error },
      ]);
    } finally {
      setIsThinking(false);
    }
  }, [input, isThinking, lang, history, presentations, presentationContent, onSpeak, onStopSpeaking, onStartPresentation, onContinuePresentation, onSwitchToChat]);

  if (!open) return null;

  return (
    <Card className="rightCard">
      <div className="rightHeader">
        <div>
          <div className="rightTitle">HORIBA Assistant</div>
          <div className="rightSub">{panelMode === "quiz" ? "Quiz" : "Discussion"}</div>
        </div>
        <button className="iconBtn" onClick={onClose} title="Close">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="rightBody">
        {panelMode === "quiz" ? (
          <QuizWidget presentationContent={presentationContent} presentationName={presentationName} lang={lang} userName={userName} userEmail={userEmail} />
        ) : (
          <>
            <div className="chatScroll" ref={scrollRef}>
              {messages.map((m, i) => (
                <div key={i} className={cn("msgRow", m.role === "user" ? "msgRowUser" : "msgRowAsst")}>
                  <div className="msgMeta">
                    <span className="msgRole">{m.role === "user" ? "YOU" : "ASSISTANT"}</span>
                    <span className="msgTime">
                      {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <div className={cn(
                    "msgBubble",
                    m.role === "user" ? "msgBubbleUser" : "msgBubbleAsst",
                    m.isAction && "msgBubbleAction"
                  )}>
                    {m.text}
                  </div>
                </div>
              ))}
              {isThinking && (
                <div className="msgRow msgRowAsst">
                  <div className="msgMeta"><span className="msgRole">ASSISTANT</span></div>
                  <div className="msgBubble msgBubbleAsst msgBubbleThinking">
                    <span className="thinkingDot" /><span className="thinkingDot" /><span className="thinkingDot" />
                  </div>
                </div>
              )}
            </div>

            <div className="chatInputRow">
              <input
                className="chatInput"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && input.trim()) send(); }}
                placeholder="Type your message..."
                disabled={isThinking}
              />
              {input.trim() ? (
                <button className="chatInputIconBtn" onClick={() => send()} title="Send" disabled={isThinking}>
                  <img src="/assets/send.png" alt="Send" className="chatInputIcon" />
                </button>
              ) : (
                <button
                  className={cn("chatInputIconBtn", speech.isRecording && "chatMicRecording")}
                  title={speech.supported ? (speech.isRecording ? "Release to send" : "Hold to speak") : "Voice not supported"}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    onStopSpeaking();
                    speech.start((text) => send(text));
                  }}
                  onPointerUp={(e) => { e.preventDefault(); speech.stop(); }}
                  onPointerLeave={(e) => { e.preventDefault(); if (speech.isRecording) speech.stop(); }}
                  onPointerCancel={(e) => { e.preventDefault(); if (speech.isRecording) speech.stop(); }}
                  disabled={!speech.supported}
                >
                  {speech.isRecording ? (
                    <Mic className="chatInputIcon" style={{ color: "#e53e3e" }} />
                  ) : (
                    <img src="/assets/microphone.png" alt="Mic" className="chatInputIcon" />
                  )}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState<null | { id: string; name: string; email: string; picture?: string; role: "admin" | "contributor" | "user"; provider: string }>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authOpen, setAuthOpen] = useState(false);

  const [avatar, setAvatar] = useState("alan");
  const [lang, setLang] = useState("fr");
  const [view, setView] = useState<"chat" | "presentation">("presentation");

  const [rightOpen, setRightOpen] = useState(true);
  const [panelMode, setPanelMode] = useState<"discussion" | "quiz">("discussion");
  const [quizEnabled, setQuizEnabled] = useState(true);

  const [rightPanelWidth, setRightPanelWidth] = useState(420);
  const isDragging = useRef(false);
  const mainGridRef = useRef<HTMLElement>(null);

  const [presentationDialogOpen, setPresentationDialogOpen] = useState(false);
  const [quizGenDialog, setQuizGenDialog] = useState<{ presName: string; presLang: string } | null>(null);
  const [activePresentationName, setActivePresentationName] = useState<string | null>(null);
  const [activePresentationLabel, setActivePresentationLabel] = useState("No presentation selected");

  const [presentations, setPresentations] = useState<Presentation[]>([]);
  const [slides, setSlides] = useState<SlideData[]>([]);
  const [isPresentationPlaying, setIsPresentationPlaying] = useState(false);

  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  const avatarName = useMemo(() => AVATARS.find((a) => a.id === avatar)?.name ?? "Avatar", [avatar]);
  const avatarRef = useRef<TalkingHeadAvatarHandle>(null);
  const leftCardRef = useRef<HTMLDivElement>(null);

  // Build presentation text context for Gemini
  const presentationContent = useMemo(() => {
    if (!slides.length) return "";
    return slides
      .map((s, i) => `[Slide ${i + 1}]\n${s.paragraphs.join("\n")}`)
      .join("\n\n");
  }, [slides]);

  // ── Avatar speak helpers ──
  const handleSpeak = useCallback((text: string) => {
    avatarRef.current?.speak(text);
  }, []);

  const handleStopSpeaking = useCallback(() => {
    avatarRef.current?.stopSpeaking();
  }, []);

  const handleWaitUntilDone = useCallback(() => {
    return avatarRef.current?.waitUntilDone() ?? Promise.resolve();
  }, []);

  const [avatarPlayingStyle, setAvatarPlayingStyle] = useState<React.CSSProperties>({});

  useLayoutEffect(() => {
    if (!isPresentationPlaying || view !== "presentation") {
      setAvatarPlayingStyle({});
      return;
    }
    const update = () => {
      if (!leftCardRef.current) return;
      const card = leftCardRef.current.getBoundingClientRect();
      setAvatarPlayingStyle({
        position: "fixed",
        top: card.top + 10,
        left: card.right - 180,
        width: 170,
        height: 220,
        zIndex: 30,
        overflow: "hidden",
        borderRadius: "12px",
        boxShadow: "0 4px 20px rgba(0,0,0,0.18)",
      });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [isPresentationPlaying, view]);

  const handlePlayingChange = useCallback((playing: boolean, reason: "manual" | "end") => {
    setIsPresentationPlaying(playing);
    if (playing) {
      setRightOpen(false);
    } else {
      if (reason === "end") {
        setRightOpen(true);
        setPanelMode(quizEnabled ? "quiz" : "discussion");
      } else {
        setRightOpen(true);
        setPanelMode("discussion");
      }
    }
  }, []);

  const [verifiedBanner, setVerifiedBanner] = useState(false);

  // ── Session check + ?verified=1 detection ──
  useEffect(() => {
    // Check if arriving from email verification link
    const params = new URLSearchParams(window.location.search);
    if (params.get("verified") === "1") {
      setVerifiedBanner(true);
      window.history.replaceState({}, "", window.location.pathname);
      setTimeout(() => setVerifiedBanner(false), 6000);
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        if (cancelled) return;
        if (res.ok) {
          setUser(await res.json());
          setAuthOpen(false);
        } else {
          setUser(null);
          setAuthOpen(true);
        }
      } catch {
        if (!cancelled) { setUser(null); setAuthOpen(true); }
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Load presentations list ──
  useEffect(() => {
    fetch("/api/list-presentations", { credentials: "include" })
      .then((r) => r.json())
      .then((data: Presentation[]) => { if (Array.isArray(data)) setPresentations(data); })
      .catch(() => {});
  }, []);

  // ── Close user menu on outside click ──
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!userMenuOpen) return;
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node))
        setUserMenuOpen(false);
    }
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [userMenuOpen]);

  // ── Auto-open presentation dialog when switching to presentation mode ──
  useEffect(() => {
    if (view === "presentation" && !activePresentationName) setPresentationDialogOpen(true);
  }, [view, activePresentationName]);

  // ── Load slide data from API ──
  async function loadPresentation(name: string, langOverride?: string) {
    try {
      // Accept both short ("fr") and long ("french") lang override
      const longLang = LANG_TO_LONG[langOverride ?? lang] ?? langOverride ?? "english";
      const res = await fetch(
        `/api/presentation-data?file_name=${encodeURIComponent(name)}&language=${encodeURIComponent(longLang)}`,
        { credentials: "include" }
      );
      const data = await res.json();
      if (data.error) {
        console.warn("Presentation data error:", data.error);
        setSlides([]);
        return;
      }
      // New backend returns { slides, quizEnabled }; old backend returns flat slide map
      const rawSlides: Record<string, any> = data.slides ?? data;
      // Detect quiz flag — either from new backend field OR from a standalone "quiz:..." slide block
      let qEnabled = data.quizEnabled !== false;
      const slideEntries = Object.entries(rawSlides).filter(([, v]: [string, any]) => {
        if (Array.isArray(v) && v[0]?.length === 1 && /^quiz:(YES|NO)$/i.test(v[0][0])) {
          qEnabled = /^quiz:YES$/i.test(v[0][0]);
          return false; // exclude this pseudo-slide
        }
        return true;
      });
      setQuizEnabled(qEnabled);
      if (!qEnabled && panelMode === "quiz") setPanelMode("discussion");
      const slideArr: SlideData[] = slideEntries.map(([, v]: [string, any]) => ({
        paragraphs: v[0] as string[],
        image: v[1] as string,
      }));
      setSlides(slideArr);
      setActivePresentationName(name);
      setActivePresentationLabel(name);
      setView("presentation");
      if (!rightOpen) setRightOpen(true);
    } catch {
      setSlides([]);
    }
  }

  // ── Presentation panel actions ──
  function openDiscussion() { setRightOpen(true); setPanelMode("discussion"); }
  function openQuiz()       { setRightOpen(true); setPanelMode("quiz"); }

  async function handleLangChange(newLang: string) {
    if (view !== "presentation" || !activePresentationName) {
      setLang(newLang);
      return;
    }
    // Presentation mode: verify content file exists for the requested language
    const longLang = LANG_TO_LONG[newLang] ?? newLang;
    try {
      const res = await fetch(
        `/uploads/${encodeURIComponent(activePresentationName)}/content_${longLang}.txt`,
        { method: "HEAD" }
      );
      if (res.ok) {
        setLang(newLang);
        loadPresentation(activePresentationName, newLang);
      }
      // else: silently stay on current language — TopSelect value={lang} auto-reverts
    } catch {
      // network error: stay on current language
    }
  }

  function handleViewChange(newView: "chat" | "presentation") {
    setView(newView);
    if (!rightOpen) setRightOpen(true);
  }

  function handleStartPresentation(name: string) {
    setActivePresentationName(name);
    setView("presentation");
    // Auto-set language to match the presentation's primary language
    const presLang = LONG_TO_LANG[presentations.find((p) => p.name === name)?.language ?? ""] ?? lang;
    if (presLang !== lang) setLang(presLang);
    loadPresentation(name, presLang);
  }

  function handleContinuePresentation() {
    handlePlayingChange(true, "manual");
  }

  // ── Splitter drag ──
  function handleSplitterMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!isDragging.current || !mainGridRef.current) return;
      const rect = mainGridRef.current.getBoundingClientRect();
      const newW = rect.right - e.clientX;
      setRightPanelWidth(Math.max(300, Math.min(rect.width / 2, newW)));
    }
    function onUp() {
      if (isDragging.current) {
        isDragging.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, []);

  return (
    <div className="appRoot">
      {/* ── Top header ── */}
      <header className="topBar">
        <div className="topBarInner">
          <div className="brandLeft">
            <img className="brandHoriba" src="/assets/screen logo Horiba.png" alt="HORIBA" />
          </div>

          <div className="topControls">
            <TopSelect imgSrc="/assets/person.png" value={avatar} options={AVATARS} onChange={setAvatar} />
            <TopSelect imgSrc="/assets/language.png" value={lang} options={LANGS} onChange={handleLangChange} />
            <ModeTabs view={view} setView={handleViewChange} />
          </div>

          <div className="topRight" ref={userMenuRef}>
            <button className="userBtn" onClick={() => setUserMenuOpen((v) => !v)} title={user?.email ?? "Sign in"}>
              <span className="userAvatar">
                <UserStatusIcon email={user?.email} className="h-5 w-5" />
              </span>
              <span className="userText">
                <span className="userName">{user?.name ?? "Guest"}</span>
                <span className="userEmail">{user?.email ?? ""}</span>
              </span>
              <ChevronDown className="h-4 w-4 text-gray-600" />
            </button>

            {userMenuOpen && (
              <div className="userMenu">
                <div className="userMenuTop">
                  <div className="font-semibold">{user?.name ?? "Guest"}</div>
                  <div className="text-[13px] text-gray-500">{user?.email ?? "Please sign in"}</div>
                  {user?.role && (
                    <div className="userRoleBadge" data-role={user.role}>
                      {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                    </div>
                  )}
                </div>
                <div className="userMenuActions">
                  {!user ? (
                    <button className="blueBtn w-full" onClick={() => setAuthOpen(true)}>Sign in</button>
                  ) : (
                    <button
                      className="ghostBtn w-full"
                      onClick={async () => {
                        try { await fetch("/api/auth/logout", { method: "POST", credentials: "include" }); } catch {}
                        setUser(null);
                        setAuthOpen(true);
                        setUserMenuOpen(false);
                      }}
                    >
                      <LogOut className="h-4 w-4" /> Sign out
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Main grid ── */}
      <main
        ref={mainGridRef}
        className={cn("mainGrid", rightOpen ? "gridWithRight" : "gridNoRight")}
        style={rightOpen ? { gridTemplateColumns: `1fr auto ${rightPanelWidth}px` } : undefined}
      >
        {/* Left panel */}
        <Card className="leftCard" ref={leftCardRef}>
          {!isPresentationPlaying && (
            <div className="leftHeader">
              <div>
                <div className="leftTitle">{view === "presentation" ? "Presentation" : "Avatar"}</div>
                <div className="leftSub">
                  {view === "presentation" ? activePresentationLabel : `Person: ${avatarName}`}
                </div>
              </div>

              {view === "presentation" ? (
                <div className="leftHeaderBtns">
                  <button className="ghostBtn" onClick={() => setPresentationDialogOpen(true)}>Select...</button>
                  <div className="modeTabs">
                    <button
                      className={cn("modeTab", panelMode === "discussion" && "modeTabActive")}
                      onClick={openDiscussion}
                    >
                      Discussion
                    </button>
                    <button
                      className={cn("modeTab", panelMode === "quiz" && "modeTabActive")}
                      onClick={openQuiz}
                      disabled={!quizEnabled}
                      style={!quizEnabled ? { opacity: 0.4, cursor: "not-allowed" } : undefined}
                    >
                      Quiz
                    </button>
                  </div>
                </div>
              ) : view === "chat" && !rightOpen ? (
                <div className="leftHeaderBtns">
                  <button className="ghostBtn" onClick={openDiscussion}>Chat</button>
                </div>
              ) : null}
            </div>
          )}

          <div className="leftBody" style={{ position: "relative" }}>
            {/* Slides — only visible in presentation view */}
            {view === "presentation" && (
              <SlideViewport
                slides={slides}
                presentationName={activePresentationName ?? ""}
                onEnd={quizEnabled ? openQuiz : openDiscussion}
                onSpeak={handleSpeak}
                onStopSpeaking={handleStopSpeaking}
                onWaitUntilDone={handleWaitUntilDone}
                onPlayingChange={handlePlayingChange}
                avatarHidden={isPresentationPlaying}
              />
            )}
            {/* Avatar — always mounted; overlay in presentation mode, full-size in chat mode */}
            <div
              className={view === "presentation" && !isPresentationPlaying ? "avatarOverlay" : view === "chat" ? "avatarStage" : undefined}
              style={isPresentationPlaying ? avatarPlayingStyle : undefined}
            >
              <TalkingHeadAvatar ref={avatarRef} avatar={avatar} lang={lang} />
            </div>
          </div>
        </Card>

        {/* Splitter */}
        {rightOpen && (
          <div className="splitter" onMouseDown={handleSplitterMouseDown}>
            <div className="splitterLine" />
          </div>
        )}

        {/* Right panel */}
        <ChatPanel
          open={rightOpen}
          onClose={() => setRightOpen(false)}
          panelMode={panelMode}
          lang={lang}
          onSpeak={handleSpeak}
          onStopSpeaking={handleStopSpeaking}
          presentations={presentations}
          presentationContent={presentationContent}
          presentationName={activePresentationName ?? ""}
          userName={user?.name ?? user?.email}
          userEmail={user?.email}
          onStartPresentation={handleStartPresentation}
          onContinuePresentation={handleContinuePresentation}
          onSwitchToChat={() => handleViewChange("chat")}
        />
      </main>

      <div className="footerNote">HORIBA FRANCE 2026. ALL RIGHTS RESERVED</div>

      {quizGenDialog && (
        <QuizGenerationDialog
          presName={quizGenDialog.presName}
          presLang={quizGenDialog.presLang}
          onClose={() => setQuizGenDialog(null)}
          onQuizSaved={() => { setQuizGenDialog(null); loadPresentation(quizGenDialog.presName); }}
        />
      )}

      <PresentationDialog
        open={presentationDialogOpen}
        onClose={() => {
          setPresentationDialogOpen(false);
          if (!activePresentationName) setView("chat");
        }}
        onQuizReady={(presName, presLang) => setQuizGenDialog({ presName, presLang })}
        defaultLang={lang}
        presentations={presentations}
        isAdmin={user?.role === "admin"}
        onSelect={(payload) => {
          if (payload.mode === "existing") {
            loadPresentation(payload.name);
          } else {
            // Set name eagerly so onClose doesn't switch back to chat
            setActivePresentationName(payload.name);
            setView("presentation");
            // Reload list then load slides
            fetch("/api/list-presentations", { credentials: "include" })
              .then((r) => r.json())
              .then((data: Presentation[]) => { if (Array.isArray(data)) setPresentations(data); })
              .catch(() => {})
              .finally(() => loadPresentation(payload.name, payload.lang));
          }
        }}
      />

      {/* Email verified banner */}
      <AnimatePresence>
        {verifiedBanner && (
          <motion.div
            initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 9999,
              background: "#16a34a", color: "#fff", padding: "12px 24px", borderRadius: 10,
              fontSize: 14, fontWeight: 600, boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
              display: "flex", alignItems: "center", gap: 8 }}
          >
            <CheckCircle2 className="h-4 w-4" />
            Email confirmed! You can now sign in.
          </motion.div>
        )}
      </AnimatePresence>

      <AuthDialog
        open={!authLoading && authOpen && !user}
        onBeginOAuth={(provider) => {
          window.location.href = `/auth/google/login?returnTo=${encodeURIComponent(window.location.href)}`;
        }}
        onSuccess={() => {
          fetch("/api/auth/me", { credentials: "include" })
            .then(r => r.ok ? r.json() : null)
            .then(u => { if (u) { setUser(u); setAuthOpen(false); } });
        }}
      />
    </div>
  );
}
