import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  UserRound,
  LogOut,
  X,
  MonitorPlay,
  MessageSquare,
  CheckCircle2,
  Send,
  Mic,
  Settings,
  Play,
  SkipBack,
  SkipForward,
  XCircle,
} from "lucide-react";
import "./App.css";

const AVATARS = [
  { id: "alan", name: "Alan" },
  { id: "ada", name: "Ada" },
];

const LANGS = [
  { id: "en", name: "English" },
  { id: "fr", name: "French" },
  { id: "ar", name: "Arabic" },
];

const MOCK_PRESENTATIONS = [
  { id: "roadmap_ia_2026", name: "Roadmap IA 2026", lang: "fr", description: "AI Lab roadmap" },
  { id: "safety_intro", name: "Safety onboarding", lang: "en", description: "Safety for interns" },
  { id: "qc_basics", name: "QC Basics", lang: "fr", description: "Quality control overview" },
];

function cn(...classes: Array<string | false | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}

function TopSelect({
  icon,
  label,
  value,
  options,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  options: { id: string; name: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="topSelect">
      <div className="topSelectIcon">{icon}</div>
      <div className="topSelectLabel">{label}:</div>
      <div className="topSelectControl">
        <select value={value} onChange={(e) => onChange(e.target.value)} className="topSelectNative">
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <ChevronDown className="topSelectChevron" />
      </div>
    </div>
  );
}

function ModeTabs({ view, setView }: { view: "chat" | "presentation"; setView: (v: "chat" | "presentation") => void }) {
  return (
    <div className="modeTabs">
      <button className={cn("modeTab", view === "chat" && "modeTabActive")} onClick={() => setView("chat")}>
        <MessageSquare className="h-4 w-4" />
        <span>Chat</span>
      </button>
      <button
        className={cn("modeTab", view === "presentation" && "modeTabActive")}
        onClick={() => setView("presentation")}
      >
        <MonitorPlay className="h-4 w-4" />
        <span>Presentation</span>
      </button>
    </div>
  );
}

function Card({ children, className }: any) {
  return <div className={cn("cardLite", className)}>{children}</div>;
}

/** screen base 7 style (white card, Google/Email, close X) */
function AuthDialog({
  open,
  onBeginOAuth,
  onEmailContinue,
}: {
  open: boolean;
  onBeginOAuth: (provider: "google" | "azuread") => void;
  onEmailContinue: (email: string) => void;
}) {
  const [email, setEmail] = useState("");

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="modalOverlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="modalBackdrop" />
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className="authCardWrap"
          >
            <div className="authCard">
              <div className="authCloseHint" />

              <div className="authTitle">Welcome to</div>
              <div className="authBrand">Horiba Avatar</div>

              <button className="authProviderBtn" onClick={() => onBeginOAuth("google")}>
                <span className="authProviderIcon" />
                <span>Log in with Google</span>
                <span className="authBadge">Last used</span>
              </button>

              <button className="authProviderBtn" onClick={() => onBeginOAuth("azuread")}>
                <span className="authProviderIcon" />
                <span>Log in with Azure AD</span>
              </button>

              <div className="authOrRow">
                <div className="authOrLine" />
                <div className="authOrText">OR</div>
                <div className="authOrLine" />
              </div>

              <div className="authField">
                <div className="authLabel">Email</div>
                <input
                  className="authInput"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email address"
                />
              </div>

              <button
                className="authContinue"
                onClick={() => {
                  const v = email.trim();
                  if (!v) return;
                  onEmailContinue(v);
                }}
              >
                Continue
              </button>

              <div className="authFooter">
                Don&apos;t have an account? <span className="authLink">Sign up</span>
              </div>

              <div className="authLegal">Terms of Service and Privacy Policy.</div>
            </div>
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
    | { mode: "new"; name: string; description: string; lang: string; file?: File | null }) => void;
  defaultLang: string;
}) {
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [existingId, setExistingId] = useState(MOCK_PRESENTATIONS[0]?.id ?? "");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [lang, setLang] = useState(defaultLang);
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    if (!open) return;
    setLang(defaultLang);
  }, [open, defaultLang]);

  return (
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
              <div className="presModalHeader">
                <div className="presModalTitle">Presentation Options</div>
              </div>

              <div className="presModeRow">
                <label className="radioRow">
                  <input type="radio" checked={mode === "new"} onChange={() => setMode("new")} />
                  <span>New Presentation</span>
                </label>
                <label className="radioRow">
                  <input type="radio" checked={mode === "existing"} onChange={() => setMode("existing")} />
                  <span>Existing Presentation</span>
                </label>
              </div>

              <div className="presForm">
                <div className="fieldRow">
                  <div className="fieldLabel">Presentation name</div>
                  <input
                    className="fieldInput"
                    value={mode === "new" ? name : existingId}
                    onChange={(e) => (mode === "new" ? setName(e.target.value) : setExistingId(e.target.value))}
                    placeholder={mode === "new" ? "Enter new presentation name" : ""}
                    list={mode === "existing" ? "presentations-list" : undefined}
                  />
                  <datalist id="presentations-list">
                    {MOCK_PRESENTATIONS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </datalist>
                </div>

                {mode === "new" && (
                  <>
                    <div className="fieldRow">
                      <div className="fieldLabel">Description</div>
                      <input
                        className="fieldInput"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Enter description"
                      />
                    </div>

                    <div className="fieldRow">
                      <div className="fieldLabel">Presentation Language</div>
                      <select className="fieldInput" value={lang} onChange={(e) => setLang(e.target.value)}>
                        {LANGS.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="fieldRow">
                      <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                    </div>

                    <button
                      className="blueBtn"
                      onClick={() => {
                        if (!name.trim()) return;
                        onSelect({ mode: "new", name: name.trim(), description: description.trim(), lang, file });
                        onClose();
                      }}
                    >
                      Upload
                    </button>
                  </>
                )}

                {mode === "existing" && (
                  <button
                    className="blueBtn"
                    onClick={() => {
                      if (!existingId) return;
                      onSelect({ mode: "existing", id: existingId });
                      onClose();
                    }}
                  >
                    Open
                  </button>
                )}
              </div>

              <button className="modalCloseWide" onClick={onClose}>
                Close
              </button>
            </div>
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
    <div className="slideWrap">
      <div className="slideCanvas">
        <div className="slidePlaceholder">
          <div className="text-sm text-gray-600">Slide {page} of {total}</div>
          <div className="text-2xl font-semibold mt-2">Presentation canvas</div>
          <div className="text-sm text-gray-500 mt-2 max-w-md">
            Plug your PPT/PDF renderer here.
          </div>
        </div>
      </div>

      <div className="slideControls">
        <button className="iconBtn" onClick={() => setPage((p) => Math.max(1, p - 1))}>
          <SkipBack className="h-4 w-4" />
        </button>

        <div className="progressBar">
          <div className="progressFill" style={{ width: `${(page / total) * 100}%` }} />
        </div>

        <button className="iconBtn" onClick={() => setPage((p) => Math.min(total, p + 1))}>
          <SkipForward className="h-4 w-4" />
        </button>

        <button
          className="playBtn"
          onClick={() => {
            if (page === total) onEnd();
            else setPage(total);
          }}
        >
          <Play className="h-4 w-4" />
          <span>{page === total ? "Stop" : "Play"}</span>
        </button>
      </div>
    </div>
  );
}

function QuizWidget() {
  const [ans, setAns] = useState<string | null>(null);
  const correct = "b";
  return (
    <div className="quizWrap">
      <div className="quizHeader">
        <div>
          <div className="font-semibold">Quiz</div>
          <div className="text-xs text-gray-500">After presentation end</div>
        </div>
        <div className="text-xs text-gray-500">1 / 5</div>
      </div>

      <div className="quizCard">
        <div className="text-sm font-medium">What should you do before starting a measurement?</div>
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
                className={cn("quizOption", selected && "quizOptionSelected")}
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm">{o.label}</div>
                  {show && (isCorrect ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : selected ? (
                    <XCircle className="h-4 w-4 text-red-600" />
                  ) : null)}
                </div>
              </button>
            );
          })}
        </div>

        {ans && (
          <div className="mt-3 text-xs text-gray-600">
            Feedback: Running the safety checklist reduces incidents and ensures correct setup.
          </div>
        )}
      </div>

      <div className="quizFooter">
        <button className="ghostBtn">Previous</button>
        <button className="blueBtn">Next</button>
      </div>
    </div>
  );
}

function ChatPanel({
  open,
  onClose,
  panelMode,
  setPanelMode,
}: {
  open: boolean;
  onClose: () => void;
  panelMode: "discussion" | "quiz";
  setPanelMode: (m: "discussion" | "quiz") => void;
}) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<any[]>([
    { role: "assistant", text: "Hello! I’m your assistant. Ask a question anytime." },
  ]);

  function send() {
    const v = input.trim();
    if (!v) return;
    setMessages((m) => [...m, { role: "user", text: v }]);
    setInput("");
    setTimeout(() => {
      setMessages((m) => [...m, { role: "assistant", text: "(demo) Received." }]);
    }, 250);
  }

  if (!open) return null;

  return (
    <Card className="rightCard">
      <div className="rightHeader">
        <div>
          <div className="font-semibold">Horiba Assistant</div>
          <div className="text-xs text-gray-500">{panelMode === "quiz" ? "Quiz" : "Discussion"}</div>
        </div>

        <div className="rightHeaderBtns">
          <button
            className={cn("smallTabBtn", panelMode === "discussion" && "smallTabBtnActive")}
            onClick={() => setPanelMode("discussion")}
          >
            Discussion
          </button>
          <button className={cn("smallTabBtn", panelMode === "quiz" && "smallTabBtnActive")} onClick={() => setPanelMode("quiz")}>
            Quiz
          </button>
          <button className="iconBtn" onClick={onClose} title="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="rightBody">
        {panelMode === "quiz" ? (
          <QuizWidget />
        ) : (
          <>
            <div className="chatScroll">
              {messages.map((m, i) => (
                <div key={i} className={cn("msgRow", m.role === "user" ? "msgRowUser" : "msgRowAsst")}>
                  <div className="msgMeta">
                    <span className="msgRole">{m.role === "user" ? "YOU" : "ASSISTANT"}</span>
                    <span className="msgTime">{new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  <div className={cn("msgBubble", m.role === "user" ? "msgBubbleUser" : "msgBubbleAsst")}>
                    {m.text}
                  </div>
                </div>
              ))}
            </div>

            <div className="chatInputRow">
              <button className="iconBtn" title="Voice">
                <Mic className="h-4 w-4" />
              </button>
              <input
                className="chatInput"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => (e.key === "Enter" ? send() : null)}
                placeholder="Type your message..."
              />
              <button className="blueBtn" onClick={send}>
                <Send className="h-4 w-4" />
              </button>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

export default function App() {
  // auth session cookie (Google OAuth + Azure AD)
  const [user, setUser] = useState<null | { name: string; email: string; provider: "google" | "azuread" | "email" }>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authOpen, setAuthOpen] = useState(false);

  const [avatar, setAvatar] = useState("alan");
  const [lang, setLang] = useState("fr");
  const [view, setView] = useState<"chat" | "presentation">("presentation");

  const [rightOpen, setRightOpen] = useState(true);
  const [panelMode, setPanelMode] = useState<"discussion" | "quiz">("discussion");

  const [presentationDialogOpen, setPresentationDialogOpen] = useState(false);
  const [activePresentationId, setActivePresentationId] = useState<string | null>(null);
  const [activePresentationLabel, setActivePresentationLabel] = useState<string>("No presentation selected");

  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  const avatarName = useMemo(() => AVATARS.find((a) => a.id === avatar)?.name ?? "Avatar", [avatar]);

  // session check
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

  // close menu on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!userMenuOpen) return;
      const t = e.target as Node;
      if (userMenuRef.current && !userMenuRef.current.contains(t)) setUserMenuOpen(false);
    }
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [userMenuOpen]);

  // prompt presentation selection automatically in Presentation mode
  useEffect(() => {
    if (view === "presentation" && !activePresentationId) setPresentationDialogOpen(true);
  }, [view, activePresentationId]);

  // Discussion button behavior: open chat panel WITHOUT changing mode (your requirement)
  function openDiscussion() {
    setRightOpen(true);
    setPanelMode("discussion");
  }
  function openQuiz() {
    setRightOpen(true);
    setPanelMode("quiz");
  }

  return (
    <div className="appRoot">
      {/* top header */}
      <header className="topBar">
        <div className="topBarInner">
          <div className="brandLeft">
            {/* Put real files in /public */}
            <img className="brandHoriba" src="/horiba-logo.svg" alt="HORIBA" onError={(e) => ((e.currentTarget.style.display = "none"))} />
            <img className="brandLab" src="/ai-lab-logo.svg" alt="AI LAB" onError={(e) => ((e.currentTarget.style.display = "none"))} />
          </div>

          <div className="topControls">
            <TopSelect icon={<UserRound className="h-4 w-4" />} label="Person" value={avatar} options={AVATARS} onChange={setAvatar} />
            <TopSelect icon={<span className="globeDot" />} label="Language" value={lang} options={LANGS} onChange={setLang} />
            <ModeTabs view={view} setView={setView} />
          </div>

          <div className="topRight" ref={userMenuRef}>
            <button className="userBtn" onClick={() => setUserMenuOpen((v) => !v)} title={user?.email ?? "Sign in"}>
              <span className="userAvatar">
                <UserRound className="h-4 w-4" />
              </span>
              <span className="userText">
                <span className="userName">{user?.name ?? "Guest"}</span>
                <span className="userEmail">{user?.email ?? "Not signed in"}</span>
              </span>
              <ChevronDown className="h-4 w-4 text-gray-600" />
            </button>

            {userMenuOpen && (
              <div className="userMenu">
                <div className="userMenuTop">
                  <div className="font-semibold">{user?.name ?? "Guest"}</div>
                  <div className="text-xs text-gray-500">{user?.email ?? "Please sign in"}</div>
                  {user && <div className="text-[11px] text-gray-400 mt-1">Provider: {user.provider}</div>}
                </div>

                <div className="userMenuActions">
                  {!user ? (
                    <button className="blueBtn w-full" onClick={() => setAuthOpen(true)}>
                      Sign in
                    </button>
                  ) : (
                    <button
                      className="ghostBtn w-full"
                      onClick={async () => {
                        try {
                          await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
                        } catch {}
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

      {/* main content */}
      <main className={cn("mainGrid", rightOpen ? "gridWithRight" : "gridNoRight")}>
        {/* left area */}
        <Card className="leftCard">
          <div className="leftHeader">
            <div>
              <div className="leftTitle">{view === "presentation" ? "Presentation" : "Avatar"}</div>
              <div className="leftSub">
                {view === "presentation" ? activePresentationLabel : `Person: ${avatarName}`}
              </div>
            </div>

            {view === "presentation" ? (
              <div className="leftHeaderBtns">
                <button className="ghostBtn" onClick={() => setPresentationDialogOpen(true)}>
                  Select...
                </button>
                <button className="ghostBtn" onClick={openDiscussion}>
                  Discussion
                </button>
                <button className="ghostBtn" onClick={openQuiz}>
                  Quiz
                </button>
              </div>
            ) : (
              <div className="leftHeaderBtns">
                <button className="ghostBtn" onClick={openDiscussion}>
                  Discussion
                </button>
              </div>
            )}

            <button className="iconBtn" onClick={() => setRightOpen((v) => !v)} title={rightOpen ? "Hide panel" : "Show panel"}>
              {rightOpen ? <X className="h-4 w-4" /> : <Settings className="h-4 w-4" />}
            </button>
          </div>

          <div className="leftBody">
            {view === "presentation" ? (
              <SlideViewport
                onEnd={() => {
                  // end of presentation => open quiz in right panel
                  openQuiz();
                }}
              />
            ) : (
              <div className="avatarStage">
                {/* Plug your real 3D avatar canvas here */}
                <div className="avatarPlaceholder">
                  <div className="text-3xl font-semibold">{avatarName}</div>
                  <div className="text-sm text-gray-500 mt-2">3D avatar canvas placeholder</div>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* right panel */}
        <ChatPanel
          open={rightOpen}
          onClose={() => setRightOpen(false)}
          panelMode={panelMode}
          setPanelMode={setPanelMode}
        />

        <div className="footerNote">HORIBA FRANCE 2026. ALL RIGHTS RESERVED</div>
      </main>

      <PresentationDialog
        open={presentationDialogOpen}
        onClose={() => setPresentationDialogOpen(false)}
        defaultLang={lang}
        onSelect={(payload) => {
          if (payload.mode === "existing") {
            const p = MOCK_PRESENTATIONS.find((x) => x.id === payload.id);
            setActivePresentationId(payload.id);
            setActivePresentationLabel(p ? `${p.name}` : "Presentation selected");
          } else {
            const createdId = "new_" + payload.name.toLowerCase().split(" ").join("_");
            setActivePresentationId(createdId);
            setActivePresentationLabel(payload.name);
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
          // optional magic link endpoint
          // fetch("/api/auth/email/start", {method:"POST", credentials:"include", headers:{'Content-Type':'application/json'}, body: JSON.stringify({email})})
          console.log("email auth start", email);
        }}
      />
    </div>
  );
}
