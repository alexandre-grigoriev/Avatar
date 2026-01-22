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
  imgSrc,
  label,
  value,
  options,
  onChange,
}: {
  icon?: React.ReactNode;
  imgSrc?: string;
  label?: string;
  value: string;
  options: { id: string; name: string }[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const selectedOption = options.find((o) => o.id === value);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
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
        <div className="topSelectValue">{selectedOption?.name ?? "Select..."}</div>
        <ChevronDown className="topSelectChevron" />
      </button>
      {open && (
        <div className="topSelectDropdown">
          {options.map((o) => (
            <button
              key={o.id}
              className={cn("topSelectDropdownItem", o.id === value && "topSelectDropdownItemActive")}
              onClick={() => {
                onChange(o.id);
                setOpen(false);
              }}
            >
              {o.name}
            </button>
          ))}
        </div>
      )}
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
  onClose,
}: {
  open: boolean;
  onBeginOAuth: (provider: "google" | "azuread") => void;
  onEmailContinue: (email: string) => void;
  onClose?: () => void;
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
              {onClose && (
                <button className="authCloseBtn" onClick={onClose} title="Close">
                  <X className="h-5 w-5" />
                </button>
              )}

              <div className="authHeader">
                <div className="authTitle">Welcome</div>
                <div className="authSubtitle">Sign in to access chat and presentations</div>
              </div>

              <button className="authProviderBtn" onClick={() => onBeginOAuth("google")}>
                <svg className="authGoogleIcon" viewBox="0 0 24 24" width="20" height="20">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                <span>Log in with Google</span>
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
  const [mode, setMode] = useState<"new" | "existing">("existing");
  const [existingId, setExistingId] = useState(MOCK_PRESENTATIONS[0]?.id ?? "");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [lang, setLang] = useState(defaultLang);
  const [file, setFile] = useState<File | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [langDropdownOpen, setLangDropdownOpen] = useState(false);

  const selectedLang = useMemo(
    () => LANGS.find((l) => l.id === lang),
    [lang]
  );

  const selectedPresentation = useMemo(
    () => MOCK_PRESENTATIONS.find((p) => p.id === existingId),
    [existingId]
  );

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
              <button className="presCloseBtn" onClick={onClose} title="Close">
                <X className="h-5 w-5" />
              </button>

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
                <button
                  className={cn("presModeBtn", mode === "new" && "presModeBtnActive")}
                  onClick={() => setMode("new")}
                >
                  <span className="presModeBtnTitle">New presentation</span>
                  <span className="presModeBtnDesc">Upload and register a new presentation</span>
                </button>
              </div>

              <div className="presForm">
                {mode === "existing" && (
                  <>
                    <div className="presFieldRow">
                      <div className="presFieldLabel">Select a presentation</div>
                      <div className="presSelectWrap">
                        <button
                          className="presSelectBtn"
                          onClick={() => setDropdownOpen((v) => !v)}
                        >
                          <span>
                            {selectedPresentation?.name ?? "Select..."}{" "}
                            {selectedPresentation && <span className="presSelectLang">— {selectedPresentation.lang.toUpperCase()}</span>}
                          </span>
                          <ChevronDown className="h-4 w-4" />
                        </button>
                        {dropdownOpen && (
                          <div className="presDropdown">
                            {MOCK_PRESENTATIONS.map((p) => (
                              <button
                                key={p.id}
                                className={cn("presDropdownItem", p.id === existingId && "presDropdownItemActive")}
                                onClick={() => {
                                  setExistingId(p.id);
                                  setDropdownOpen(false);
                                }}
                              >
                                {p.name}-{p.lang.toUpperCase()}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {selectedPresentation && (
                      <div className="presPreviewCard">
                        <div className="presPreviewTitle">{selectedPresentation.name}</div>
                        <div className="presPreviewDesc">{selectedPresentation.description}</div>
                        <div className="presPreviewLang">Language: {selectedPresentation.lang.toUpperCase()}</div>
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
                        <button
                          className="presSelectBtn"
                          onClick={() => setLangDropdownOpen((v) => !v)}
                        >
                          <span>{selectedLang?.name ?? "Select language..."}</span>
                          <ChevronDown className="h-4 w-4" />
                        </button>
                        {langDropdownOpen && (
                          <div className="presDropdown">
                            {LANGS.map((l) => (
                              <button
                                key={l.id}
                                className={cn("presDropdownItem", l.id === lang && "presDropdownItemActive")}
                                onClick={() => {
                                  setLang(l.id);
                                  setLangDropdownOpen(false);
                                }}
                              >
                                {l.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="presFieldRow">
                      <div className="presFieldLabel">Upload presentation (PPT/PDF)</div>
                      <div className="presFileUpload">
                        <label className="presFileBtn">
                          Choose File
                          <input
                            type="file"
                            accept=".pdf,.ppt,.pptx"
                            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                            className="presFileInput"
                          />
                        </label>
                        <span className="presFileName">
                          {file ? file.name : "No file chosen"}
                        </span>
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="presFooter">
                <button className="presCancelBtn" onClick={onClose}>
                  Cancel
                </button>
                {mode === "existing" ? (
                  <button
                    className="presSubmitBtn"
                    onClick={() => {
                      if (!existingId) return;
                      onSelect({ mode: "existing", id: existingId });
                      onClose();
                    }}
                  >
                    Open
                  </button>
                ) : (
                  <button
                    className="presSubmitBtn"
                    onClick={() => {
                      if (!name.trim()) return;
                      onSelect({ mode: "new", name: name.trim(), description: description.trim(), lang, file });
                      onClose();
                    }}
                  >
                    Create
                  </button>
                )}
              </div>
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
}: {
  open: boolean;
  onClose: () => void;
  panelMode: "discussion" | "quiz";
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
          <div className="rightTitle">HORIBA Assistant</div>
          <div className="rightSub">{panelMode === "quiz" ? "Quiz" : "Discussion"}</div>
        </div>

        <button className="iconBtn" onClick={onClose} title="Close">
          <X className="h-4 w-4" />
        </button>
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
              <input
                className="chatInput"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => (e.key === "Enter" && input.trim() ? send() : null)}
                placeholder="Type your message..."
              />
              {input.trim() ? (
                <button className="chatInputIconBtn" onClick={send} title="Send">
                  <img src="/send.png" alt="Send" className="chatInputIcon" />
                </button>
              ) : (
                <button className="chatInputIconBtn" title="Voice">
                  <img src="/microphone.png" alt="Mic" className="chatInputIcon" />
                </button>
              )}
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

  const [rightPanelWidth, setRightPanelWidth] = useState(420);
  const isDragging = useRef(false);
  const mainGridRef = useRef<HTMLElement>(null);

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

  // Splitter drag handlers
  function handleSplitterMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      if (!isDragging.current || !mainGridRef.current) return;
      const gridRect = mainGridRef.current.getBoundingClientRect();
      const newWidth = gridRect.right - e.clientX;
      // Clamp between 300 and half of the screen
      const maxWidth = gridRect.width / 2;
      setRightPanelWidth(Math.max(300, Math.min(maxWidth, newWidth)));
    }

    function handleMouseUp() {
      if (isDragging.current) {
        isDragging.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    }

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  return (
    <div className="appRoot">
      {/* top header */}
      <header className="topBar">
        <div className="topBarInner">
          <div className="brandLeft">
            <img className="brandHoriba" src="/screen logo Horiba.png" alt="HORIBA" />
          </div>

          <div className="topControls">
            <TopSelect imgSrc="/person.png" value={avatar} options={AVATARS} onChange={setAvatar} />
            <TopSelect imgSrc="/language.png" value={lang} options={LANGS} onChange={setLang} />
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
      <main
        ref={mainGridRef}
        className={cn("mainGrid", rightOpen ? "gridWithRight" : "gridNoRight")}
        style={rightOpen ? { gridTemplateColumns: `1fr auto ${rightPanelWidth}px` } : undefined}
      >
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
                <div className="modeTabs">
                  <button
                    className={cn("modeTab", panelMode === "discussion" && "modeTabActive")}
                    onClick={openDiscussion}
                  >
                    <MessageSquare className="h-4 w-4" />
                    <span>Discussion</span>
                  </button>
                  <button
                    className={cn("modeTab", panelMode === "quiz" && "modeTabActive")}
                    onClick={openQuiz}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Quiz</span>
                  </button>
                </div>
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

        {/* splitter */}
        {rightOpen && (
          <div className="splitter" onMouseDown={handleSplitterMouseDown}>
            <div className="splitterLine" />
          </div>
        )}

        {/* right panel */}
        <ChatPanel
          open={rightOpen}
          onClose={() => setRightOpen(false)}
          panelMode={panelMode}
        />
      </main>

      <div className="footerNote">HORIBA FRANCE 2026. ALL RIGHTS RESERVED</div>

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
