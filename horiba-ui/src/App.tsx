import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  MessageSquare,
  MonitorPlay,
  Mic,
  Send,
  Settings,
  PanelRightOpen,
  PanelRightClose,
  Play,
  SkipBack,
  SkipForward,
  CheckCircle2,
  XCircle,
  UserRound,
  LogOut,
} from "lucide-react";

// NOTE:
// - This is a UI/UX skeleton (single-file) meant to be dropped into a React + Tailwind project.
// - Replace mock data + handlers with your app state (avatars, languages, slide engine, LLM, TTS, etc.).
// - Branding is applied via CSS variables (HORIBA theme tokens). Adjust to official brand palette.
import "./App.css";

const AVATARS = [
  { id: "alan", name: "Alan" },
  { id: "ada", name: "Ada" },
  // future: more
];

const LANGS = [
  { id: "en", name: "English" },
  { id: "fr", name: "Français" },
  { id: "ar", name: "العربية" },
  // future: more
];

const VIEWS = [
  { id: "chat", name: "Chat", icon: MessageSquare },
  { id: "presentation", name: "Presentation", icon: MonitorPlay },
];

const MOCK_PRESENTATIONS = [
  { id: "roadmap_ia_2026", name: "Roadmap IA 2026", lang: "fr", description: "AI Lab roadmap" },
  { id: "safety_intro", name: "Safety onboarding", lang: "en", description: "Safety for interns" },
  { id: "qc_basics", name: "QC Basics", lang: "fr", description: "Quality control overview" },
];

function cn(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

function Select({ label, value, options, onChange }: any) {
  return (
    <div className="flex-items-center">
      <span className="text-label hidden sm:block">{label}</span>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="select-base"
        >
          {options.map((o: any) => (
            <option key={o.id} value={o.id} className="bg-[#0B0F14]">
              {o.name}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/70 pointer-events-none" />
      </div>
    </div>
  );
}

function PillTabs({ value, items, onChange }: any) {
  return (
    <div className="pill-tab-container">
      {items.map((t: any) => {
        const Icon = t.icon;
        const active = value === t.id;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={cn(
              "pill-tab",
              active ? "pill-tab-active" : "pill-tab-inactive"
            )}
          >
            <Icon className="h-4 w-4" />
            <span className="hidden sm:block">{t.name}</span>
          </button>
        );
      })}
    </div>
  );
}

function Card({ children, className }: any) {
  return (
    <div className={cn("card", className)}>
      {children}
    </div>
  );
}

function AuthDialog({
  open,
  onClose,
  onBeginOAuth,
  onEmailContinue,
}: {
  open: boolean;
  onClose?: () => void;
  onBeginOAuth: (provider: "google" | "azuread") => void;
  onEmailContinue: (email: string) => void;
}) {
  const [email, setEmail] = useState("");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose?.();
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[90]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" />
          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className="absolute left-1/2 top-1/2 w-[min(520px,92vw)] -translate-x-1/2 -translate-y-1/2"
          >
            <Card className="overflow-hidden">
              <div className="card-header p-5">
                <div className="text-white text-xl font-semibold">Welcome</div>
                <div className="text-subtitle mt-1">Sign in to access chat and presentations</div>
              </div>

              <div className="p-5 grid gap-3">
                <button
                  onClick={() => onBeginOAuth("google")}
                  className="btn-secondary w-full rounded-2xl py-3 flex-center gap-2"
                >
                  <span className="inline-block h-5 w-5 rounded-full bg-white/20" />
                  <span className="font-medium">Continue with Google</span>
                </button>

                <button
                  onClick={() => onBeginOAuth("azuread")}
                  className="btn-secondary w-full rounded-2xl py-3 flex-center gap-2"
                >
                  <span className="inline-block h-5 w-5 rounded-full bg-white/20" />
                  <span className="font-medium">Continue with Azure AD</span>
                </button>

                <div className="flex items-center gap-3 py-1">
                  <div className="h-px flex-1 bg-white/10" />
                  <div className="text-xs text-white/60">OR</div>
                  <div className="h-px flex-1 bg-white/10" />
                </div>

                <div className="grid gap-2">
                  <div className="text-label">Email</div>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email address"
                    className="input-base"
                  />
                </div>

                <button
                  onClick={() => {
                    const v = email.trim();
                    if (!v) return;
                    onEmailContinue(v);
                  }}
                  className="btn-primary w-full rounded-2xl py-3"
                >
                  Continue with email
                </button>

                <div className="text-xs text-white/60 text-center">
                  Don’t have an account? <span className="text-white underline">Sign up</span>
                </div>
              </div>

              <div className="px-5 pb-5 text-[11px] text-white/45 text-center">Terms of Service · Privacy Policy</div>
            </Card>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function PresentationDialog({
  open,
  onClose,
  onSelect,
  defaultLang,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (payload:
    | { mode: "existing"; id: string }
    | {
        mode: "new";
        name: string;
        description: string;
        lang: string;
        file?: File | null;
      }) => void;
  defaultLang: string;
}) {
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [existingId, setExistingId] = useState(MOCK_PRESENTATIONS[0]?.id ?? "");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [lang, setLang] = useState("");
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    if (!open) return;
    setLang(defaultLang);
  }, [open, defaultLang]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[80]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className="absolute left-1/2 top-1/2 w-[min(920px,92vw)] -translate-x-1/2 -translate-y-1/2"
          >
            <Card className="overflow-hidden">
              <div className="card-header">
                <div className="flex-between">
                  <div>
                    <div className="text-title">Presentation options</div>
                    <div className="text-xs text-white/80">Select an existing deck or create a new one</div>
                  </div>
                  <button onClick={onClose} className="btn-icon">
                    Close
                  </button>
                </div>
              </div>

              <div className="p-5 grid gap-5">
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={() => setMode("existing")}
                    className={cn(
                      "flex-1 rounded-2xl border px-4 py-3 text-left",
                      mode === "existing"
                        ? "border-[var(--brand)] bg-[var(--brand)]/15"
                        : "border-white/10 bg-white/5 hover:bg-white/10"
                    )}
                  >
                    <div className="text-white font-medium">Existing presentation</div>
                    <div className="text-white/60 text-xs mt-1">Pick from the library</div>
                  </button>
                  <button
                    onClick={() => setMode("new")}
                    className={cn(
                      "flex-1 rounded-2xl border px-4 py-3 text-left",
                      mode === "new"
                        ? "border-[var(--brand)] bg-[var(--brand)]/15"
                        : "border-white/10 bg-white/5 hover:bg-white/10"
                    )}
                  >
                    <div className="text-white font-medium">New presentation</div>
                    <div className="text-white/60 text-xs mt-1">Upload and register a new deck</div>
                  </button>
                </div>

                {mode === "existing" ? (
                  <div className="grid gap-3">
                    <div className="text-label">Select a presentation</div>
                    <select
                      value={existingId}
                      onChange={(e) => setExistingId(e.target.value)}
                      className="input-base"
                    >
                      {MOCK_PRESENTATIONS.map((p) => (
                        <option key={p.id} value={p.id} className="bg-[#0B0F14]">
                          {p.name} — {p.lang.toUpperCase()}
                        </option>
                      ))}
                    </select>
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      {(() => {
                        const p = MOCK_PRESENTATIONS.find((x) => x.id === existingId);
                        if (!p) return <div className="text-white/60 text-sm">No selection</div>;
                        return (
                          <div className="grid gap-1">
                            <div className="text-white font-semibold">{p.name}</div>
                            <div className="text-white/60 text-sm">{p.description}</div>
                            <div className="text-white/50 text-xs">Language: {p.lang.toUpperCase()}</div>
                          </div>
                        );
                      })()}
                    </div>

                    <div className="flex items-center justify-end gap-2">
                      <button onClick={onClose} className="btn-secondary">
                        Cancel
                      </button>
                      <button
                        onClick={() => {
                          if (!existingId) return;
                          onSelect({ mode: "existing", id: existingId });
                          onClose();
                        }}
                        className="btn-primary"
                      >
                        Open
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-3">
                    <div className="grid gap-2">
                      <div className="text-label">Presentation name</div>
                      <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Enter new presentation name"
                        className="input-base"
                      />
                    </div>

                    <div className="grid gap-2">
                      <div className="text-label">Description</div>
                      <input
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Enter description"
                        className="input-base"
                      />
                    </div>

                    <div className="grid gap-2">
                      <div className="text-label">Presentation language</div>
                      <select
                        value={lang}
                        onChange={(e) => setLang(e.target.value)}
                        className="input-base"
                      >
                        {LANGS.map((l) => (
                          <option key={l.id} value={l.id} className="bg-[#0B0F14]">
                            {l.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid gap-2">
                      <div className="text-label">Upload deck (PPT/PDF)</div>
                      <input
                        type="file"
                        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                        className="block w-full text-sm text-white/70 file:mr-4 file:rounded-xl file:border-0 file:bg-white/10 file:px-4 file:py-2 file:text-white file:hover:bg-white/15"
                      />
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2">
                      <button onClick={onClose} className="btn-secondary">
                        Cancel
                      </button>
                      <button
                        onClick={() => {
                          if (!name.trim()) return;
                          onSelect({ mode: "new", name: name.trim(), description: description.trim(), lang, file });
                          onClose();
                        }}
                        className="btn-primary"
                      >
                        Create
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function SlideViewport({ onEnd }: { onEnd: () => void }) {
  const [page, setPage] = useState(1);
  const total = 18;

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 rounded-2xl overflow-hidden border border-white/10 bg-black/30">
        {/* Replace with your real slide renderer */}
        <div className="h-full w-full grid place-items-center">
          <div className="text-center">
            <div className="text-white/80 text-sm">Slide {page} / {total}</div>
            <div className="mt-3 text-2xl font-semibold text-white">Presentation canvas</div>
            <div className="mt-2 text-white/60 max-w-md">
              Drop your PPT/PDF renderer here. Keep it full-bleed and let the right panel handle chat/quiz.
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex-items-center gap-3">
        <button
          className="btn-icon"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          <SkipBack className="h-4 w-4" />
        </button>
        <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full bg-[var(--brand)]"
            style={{ width: `${(page / total) * 100}%` }}
          />
        </div>
        <button
          className="btn-icon"
          onClick={() => setPage((p) => Math.min(total, p + 1))}
        >
          <SkipForward className="h-4 w-4" />
        </button>

        <button
          className="btn-primary flex-items-center"
          onClick={() => {
            if (page === total) onEnd();
            else setPage(total);
          }}
          title="Jump to end (demo)"
        >
          <Play className="h-4 w-4" />
          {page === total ? "Stop" : "Play"}
        </button>
      </div>

      <div className="mt-3 text-xs text-white/50">
        Tip: In presentation mode, keep chat visible for questions; at the end, open Quiz in the right panel.
      </div>
    </div>
  );
}

function AvatarStage({ avatarName }: { avatarName: string }) {
  return (
    <Card className="h-full p-4">
      <div className="flex-between">
        <div>
          <div className="text-title">Avatar Stage</div>
          <div className="text-white/60 text-sm">Current: {avatarName}</div>
        </div>
        <button className="btn-icon">
          <Settings className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-4 h-[calc(100%-56px)] rounded-2xl overflow-hidden border border-white/10 bg-gradient-to-b from-white/5 to-black/30">
        {/* Replace with your WebGL / video / 3D avatar component */}
        <div className="h-full w-full grid place-items-center">
          <div className="text-center">
            <div className="text-3xl font-semibold text-white">{avatarName}</div>
            <div className="mt-2 text-white/60 max-w-md">
              Place the 3D avatar canvas here. Consider subtle idle animations + lip-sync overlay.
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function ChatPanel({ mode, quizOpen, setQuizOpen }: any) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<any[]>([
    {
      role: "assistant",
      text: "Hello! I'm your AI assistant. Ask me a question or start a presentation.",
    },
  ]);

  function send() {
    const v = input.trim();
    if (!v) return;
    setMessages((m) => [...m, { role: "user", text: v }]);
    setInput("");
    // TODO: call your backend, stream tokens, tool calls, etc.
    setTimeout(() => {
      setMessages((m) => [...m, { role: "assistant", text: "(demo) Received. I can also render UI widgets for forms/quizzes." }]);
    }, 350);
  }

  return (
    <Card className="h-full flex flex-col overflow-hidden">
      <div className="card-header">
        <div className="flex-between">
          <div>
            <div className="text-title">Horiba Assistant</div>
            <div className="text-xs text-white/80">{mode === "presentation" ? "Presentation companion" : "Chat"}</div>
          </div>
          <div className="flex-items-center">
            <button
              className={cn(
                "rounded-xl px-3 py-2 text-sm border",
                quizOpen
                  ? "bg-white text-black border-white"
                  : "bg-white/10 text-white border-white/20 hover:bg-white/15"
              )}
              onClick={() => setQuizOpen((v: boolean) => !v)}
              title="Quiz"
            >
              Quiz
            </button>
            <button className="btn-icon">
              <Settings className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 p-4 overflow-auto space-y-3">
        {messages.map((m, idx) => (
          <div
            key={idx}
            className={cn(
              "max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
              m.role === "user"
                ? "ml-auto bg-white/10 text-white border border-white/10"
                : "mr-auto bg-black/30 text-white/90 border border-white/10"
            )}
          >
            {m.text}
          </div>
        ))}
      </div>

      <AnimatePresence initial={false}>
        {quizOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 240, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="border-t border-white/10 bg-black/20 overflow-hidden"
          >
            <QuizWidget />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="p-3 border-t border-white/10 bg-black/20">
        <div className="flex-items-center">
          <button className="btn-icon" title="Voice">
            <Mic className="h-4 w-4" />
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => (e.key === "Enter" ? send() : null)}
            placeholder="Type your message…"
            className="input-base flex-1 rounded-xl"
          />
          <button onClick={send} className="btn-primary px-4 py-3 flex-items-center">
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </Card>
  );
}

function QuizWidget() {
  // This is intentionally simple.
  // In production: render A2UI JSON widgets (forms, multiple-choice, sliders) in this space.
  const [ans, setAns] = useState<string | null>(null);
  const correct = "b";

  return (
    <div className="p-4">
      <div className="flex-between">
        <div>
          <div className="text-title">Quick quiz</div>
          <div className="text-white/60 text-xs">(demo) After presentation end</div>
        </div>
        <div className="text-xs text-white/60">1 / 5</div>
      </div>

      <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="text-white/90 text-sm">
          What should you do before starting a measurement?
        </div>
        <div className="mt-3 grid gap-2">
          {[
            { id: "a", label: "Skip the checklist" },
            { id: "b", label: "Run the safety checklist" },
            { id: "c", label: "Disable alarms" },
          ].map((o) => {
            const selected = ans === o.id;
            const show = ans != null;
            const isCorrect = o.id === correct;
            return (
              <button
                key={o.id}
                onClick={() => setAns(o.id)}
                className={cn(
                  "text-left rounded-xl px-3 py-3 border",
                  selected ? "border-[var(--brand)] bg-[var(--brand)]/15" : "border-white/10 bg-black/20 hover:bg-white/5"
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="text-white/90 text-sm">{o.label}</div>
                  {show && (isCorrect ? (
                    <CheckCircle2 className="h-4 w-4 text-white" />
                  ) : selected ? (
                    <XCircle className="h-4 w-4 text-white/80" />
                  ) : null)}
                </div>
              </button>
            );
          })}
        </div>

        {ans && (
          <div className="mt-3 text-xs text-white/70">
            Feedback: Running the safety checklist reduces incidents and ensures correct setup.
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center justify-end gap-2">
        <button className="btn-secondary">
          Previous
        </button>
        <button className="btn-primary">
          Next
        </button>
      </div>
    </div>
  );
}

export default function HoribaAIAgentUI() {
  const [user, setUser] = useState<null | { name: string; email: string; provider: "email" | "google" | "azuread" }>(null);
  const [authOpen, setAuthOpen] = useState(true);
  const [authLoading, setAuthLoading] = useState(true);

  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  const [avatar, setAvatar] = useState("alan");
  const [lang, setLang] = useState("fr");
  const [view, setView] = useState("presentation");
  const [rightOpen, setRightOpen] = useState(true);
  const [quizOpen, setQuizOpen] = useState(false);

  const [presentationDialogOpen, setPresentationDialogOpen] = useState(false);
  const [activePresentationId, setActivePresentationId] = useState<string | null>(null);
  const [activePresentationLabel, setActivePresentationLabel] = useState<string>("No presentation selected");

  // Session-cookie auth: check current session on mount.
  // Expected backend endpoints (adjust paths to your backend):
  // - GET  /api/auth/me                -> 200 {name,email,provider} or 401
  // - GET  /auth/google/login?returnTo -> redirects to Google OAuth, sets session cookie
  // - GET  /auth/azuread/login?returnTo-> redirects to Azure AD, sets session cookie
  // - POST /api/auth/logout            -> clears session cookie
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          setUser(data);
          setAuthOpen(false);
        } else {
          setUser(null);
          setAuthOpen(true);
        }
      } catch {
        if (!cancelled) {
          setUser(null);
          setAuthOpen(true);
        }
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Close user menu on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!userMenuOpen) return;
      const target = e.target as Node;
      if (userMenuRef.current && !userMenuRef.current.contains(target)) {
        setUserMenuOpen(false);
      }
    }
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [userMenuOpen]);

  // Auto-prompt selection when entering presentation mode without an active deck
  useEffect(() => {
    if (view === "presentation" && !activePresentationId) {
      setPresentationDialogOpen(true);
    }
  }, [view, activePresentationId]);

  const avatarName = useMemo(
    () => AVATARS.find((a) => a.id === avatar)?.name ?? "Avatar",
    [avatar]
  );

  return (
    <div className="min-h-screen bg-[var(--bg)] text-white">
      <div className="min-h-screen app-background">
        {/* Top App Bar */}
        <header className="sticky top-0 z-50 border-b border-white/10 bg-black/35 backdrop-blur">
          <div className="mx-auto max-w-[1600px] px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-9 w-21 rounded-2xl bg-gradient-to-br from-[var(--brand)] to-[var(--brand2)] grid place-items-center font-bold">
                HORIBA
              </div>
              <div className="hidden md:block">
                <div className="text-sm font-semibold">HORIBA FRANCE • AI LAB</div>
                <div className="text-xs text-white/60">Chat • Presentation • Quiz</div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Select label="Person" value={avatar} options={AVATARS} onChange={setAvatar} />
              <Select label="Language" value={lang} options={LANGS} onChange={setLang} />
              <PillTabs value={view} items={VIEWS} onChange={setView} />

              {/* User menu (top-right) */}
              <div className="relative" ref={userMenuRef}>
                <button
                  className="rounded-full border border-white/10 bg-white/5 hover:bg-white/10 px-3 py-2 text-white/85 flex items-center gap-2"
                  onClick={() => setUserMenuOpen((v) => !v)}
                  title={user ? user.email : "Sign in"}
                >
                  <div className="h-7 w-7 rounded-full bg-white/10 grid place-items-center">
                    <UserRound className="h-4 w-4" />
                  </div>
                  <div className="hidden lg:block leading-tight">
                    <div className="text-xs font-medium">{user ? user.name : "Guest"}</div>
                    <div className="text-[11px] text-white/60">{user ? user.email : "Not signed in"}</div>
                  </div>
                  <ChevronDown className="h-4 w-4 text-white/70 hidden lg:block" />
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-[280px] rounded-2xl border border-white/10 bg-[#0B0F14]/95 backdrop-blur shadow-[0_20px_60px_rgba(0,0,0,0.55)] overflow-hidden">
                    <div className="p-4 border-b border-white/10">
                      <div className="text-white font-semibold">{user ? user.name : "Guest"}</div>
                      <div className="text-white/60 text-xs mt-1">{user ? user.email : "Please sign in"}</div>
                      {user && (
                        <div className="text-white/50 text-[11px] mt-1">Provider: {user.provider}</div>
                      )}
                    </div>
                    <div className="p-2">
                      {!user ? (
                        <button
                          onClick={() => {
                            setAuthOpen(true);
                            setUserMenuOpen(false);
                          }}
                          className="btn-primary w-full"
                        >
                          Sign in
                        </button>
                      ) : (
                        <button
                          onClick={async () => {
                            try {
                              await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
                            } catch {}
                            setUser(null);
                            setAuthOpen(true);
                            setUserMenuOpen(false);
                          }}
                          className="btn-secondary w-full flex-center gap-2"
                        >
                          <LogOut className="h-4 w-4" />
                          Sign out
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <button
                className="btn-icon"
                onClick={() => setRightOpen((v) => !v)}
                title={rightOpen ? "Hide side panel" : "Show side panel"}
              >
                {rightOpen ? (
                  <PanelRightClose className="h-4 w-4" />
                ) : (
                  <PanelRightOpen className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="mx-auto max-w-[1600px] px-4 py-5">
          <div
            className={cn(
              "grid gap-5",
              rightOpen ? "grid-cols-1 lg:grid-cols-[1fr_420px]" : "grid-cols-1"
            )}
          >
            {/* Left: main canvas */}
            <div className="min-h-[calc(100vh-140px)]">
              <AnimatePresence mode="wait" initial={false}>
                {view === "chat" ? (
                  <motion.div
                    key="chat"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.22 }}
                    className="h-full"
                  >
                    <AvatarStage avatarName={avatarName} />
                  </motion.div>
                ) : (
                  <motion.div
                    key="presentation"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.22 }}
                    className="h-full"
                  >
                    <Card className="h-full p-4">
                      <div className="flex-between gap-3">
                        <div>
                          <div className="text-title">Presentation</div>
                          <div className="text-white/60 text-sm">{activePresentationLabel}</div>
                        </div>
                        <div className="flex-items-center">
                          <button
                            className="btn-secondary flex-items-center"
                            onClick={() => setPresentationDialogOpen(true)}
                            title="Select presentation"
                          >
                            <MonitorPlay className="h-4 w-4" />
                            Select
                          </button>
                          <button
                            className="btn-secondary flex-items-center"
                            onClick={() => setQuizOpen(true)}
                            title="Open quiz"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            Quiz
                          </button>
                        </div>
                      </div>
                      <div className="mt-4 h-[calc(100%-56px)]">
                        <SlideViewport
                          onEnd={() => {
                            setQuizOpen(true);
                          }}
                        />
                      </div>
                    </Card>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Right: chat/quiz panel */}
            {rightOpen && (
              <div className="min-h-[calc(100vh-140px)]">
                <ChatPanel mode={view} quizOpen={quizOpen} setQuizOpen={setQuizOpen} />
              </div>
            )}
          </div>

          <div className="mt-5 text-xs text-white/50">
            HORIBA FRANCE © 2026. ALL RIGHTS RESERVED.
          </div>
          <PresentationDialog
            open={presentationDialogOpen}
            onClose={() => setPresentationDialogOpen(false)}
            defaultLang={lang}
            onSelect={(payload) => {
              if (payload.mode === "existing") {
                const p = MOCK_PRESENTATIONS.find((x) => x.id === payload.id);
                setActivePresentationId(payload.id);
                setActivePresentationLabel(p ? `${p.name} — ${p.lang.toUpperCase()}` : "Presentation selected");
              } else {
                // In production: upload file + create presentation on backend, then set returned id.
                const createdId = "new_" + payload.name.toLowerCase().split(" ").join("_");
                setActivePresentationId(createdId);
                setActivePresentationLabel(`${payload.name} — ${payload.lang.toUpperCase()}`);
              }
            }}
          />

          <AuthDialog
            open={!authLoading && authOpen && !user}
            onBeginOAuth={(provider) => {
              const returnTo = encodeURIComponent(window.location.href);
              window.location.href =
                provider === "google"
                  ? `/auth/google/login?returnTo=${returnTo}`
                  : `/auth/azuread/login?returnTo=${returnTo}`;
            }}
            onEmailContinue={(email) => {
              // If you support email magic-link / OTP, trigger it here.
              // Example: POST /api/auth/email/start {email}
              // Keep the dialog open until backend confirms.
              console.log("email auth start", email);
            }}
          />
        </main>
      </div>
    </div>
  );
}
