import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
} from "lucide-react";
import "./App.css";
import {
  sendToGemini,
  classifyIntent,
  type ChatMessage,
  type Presentation,
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

const LANG_NAMES: Record<string, string> = { en: "English", fr: "French", ar: "Arabic" };
const LANG_TO_LONG: Record<string, string> = { en: "english", fr: "french", ar: "arabic" };

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

function Card({ children, className }: any) {
  return <div className={cn("cardLite", className)}>{children}</div>;
}

// ─── AuthDialog ───────────────────────────────────────────────────────────────
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
                onClick={() => { const v = email.trim(); if (v) onEmailContinue(v); }}
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

// ─── PresentationDialog ───────────────────────────────────────────────────────
function PresentationDialog({
  open,
  onClose,
  onSelect,
  defaultLang,
  presentations,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (payload:
    | { mode: "existing"; name: string }
    | { mode: "new"; name: string; description: string; lang: string; file?: File | null }
  ) => void;
  defaultLang: string;
  presentations: Presentation[];
}) {
  const [mode, setMode] = useState<"new" | "existing">("existing");
  const [existingName, setExistingName] = useState(presentations[0]?.name ?? "");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [lang, setLang] = useState(defaultLang);
  const [file, setFile] = useState<File | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [langDropdownOpen, setLangDropdownOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setLang(defaultLang);
      if (presentations.length) setExistingName(presentations[0].name);
    }
  }, [open, defaultLang, presentations]);

  const selectedPresentation = useMemo(
    () => presentations.find((p) => p.name === existingName),
    [existingName, presentations]
  );
  const selectedLang = useMemo(() => LANGS.find((l) => l.id === lang), [lang]);

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
                      <div className="presFieldLabel">Upload presentation (images/PDF)</div>
                      <div className="presFileUpload">
                        <label className="presFileBtn">
                          Choose File
                          <input
                            type="file"
                            accept=".pdf,.ppt,.pptx,image/*"
                            multiple
                            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                            className="presFileInput"
                          />
                        </label>
                        <span className="presFileName">{file ? file.name : "No file chosen"}</span>
                      </div>
                    </div>
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
                    disabled={!name.trim()}
                    onClick={() => {
                      if (name.trim()) {
                        onSelect({ mode: "new", name: name.trim(), description: description.trim(), lang, file });
                        onClose();
                      }
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

// ─── SlideViewport ────────────────────────────────────────────────────────────
function SlideViewport({
  slides,
  presentationName,
  onEnd,
  onSpeak,
  onStopSpeaking,
  onWaitUntilDone,
}: {
  slides: SlideData[];
  presentationName: string;
  onEnd: () => void;
  onSpeak: (text: string) => void;
  onStopSpeaking: () => void;
  onWaitUntilDone: () => Promise<void>;
}) {
  const [page, setPage] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const isPlayingRef = useRef(false);
  const total = slides.length;

  // Keep ref in sync so the async play loop can read current value
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  // Reset to first slide when presentation changes
  useEffect(() => {
    setPage(0);
    setIsPlaying(false);
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
        setIsPlaying(false);
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
      <div className="slideCanvas">
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
                setIsPlaying(false);
                onStopSpeaking();
              } else {
                if (page >= total - 1) {
                  setPage(0);
                }
                setIsPlaying(true);
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
              <button key={o.id} onClick={() => setAns(o.id)} className={cn("quizOption", selected && "quizOptionSelected")}>
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
        {ans && <div className="mt-3 text-xs text-gray-600">Running the safety checklist reduces incidents and ensures correct setup.</div>}
      </div>
      <div className="quizFooter">
        <button className="ghostBtn">Previous</button>
        <button className="blueBtn">Next</button>
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
    const welcome = `Hello! I'm your AI assistant. I answer in ${LANG_NAMES[lang] ?? "English"} only. How can I help you?`;
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
        const welcome = `Hello! I'm your AI assistant. I answer in ${LANG_NAMES[lang] ?? "English"} only. How can I help you?`;
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
          { role: "assistant", text: `Starting presentation: "${name}"`, isAction: true },
        ]);
        setIsThinking(false);
        onStartPresentation(name);
        return;
      }

      if (intent.type === "continue_presentation") {
        setMessages((m) => [
          ...m,
          { role: "assistant", text: "Resuming presentation...", isAction: true },
        ]);
        setIsThinking(false);
        onContinuePresentation();
        return;
      }

      if (intent.type === "change_view_chat") {
        setMessages((m) => [
          ...m,
          { role: "assistant", text: "Switching to chat mode.", isAction: true },
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
        { role: "assistant", text: "Sorry, I encountered an error. Please try again." },
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
          <QuizWidget />
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
  const [user, setUser] = useState<null | { name: string; email: string; provider: string }>(null);
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
  const [activePresentationName, setActivePresentationName] = useState<string | null>(null);
  const [activePresentationLabel, setActivePresentationLabel] = useState("No presentation selected");

  const [presentations, setPresentations] = useState<Presentation[]>([]);
  const [slides, setSlides] = useState<SlideData[]>([]);
  const [, setIsPlayingPresentation] = useState(false);

  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  const avatarName = useMemo(() => AVATARS.find((a) => a.id === avatar)?.name ?? "Avatar", [avatar]);
  const avatarRef = useRef<TalkingHeadAvatarHandle>(null);

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

  // ── Session check ──
  useEffect(() => {
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
  async function loadPresentation(name: string) {
    try {
      const longLang = LANG_TO_LONG[lang] ?? "english";
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
      const slideArr: SlideData[] = Object.values(data).map((v: any) => ({
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

  function handleViewChange(newView: "chat" | "presentation") {
    setView(newView);
    if (!rightOpen) setRightOpen(true);
  }

  function handleStartPresentation(name: string) {
    setView("presentation");
    loadPresentation(name);
  }

  function handleContinuePresentation() {
    setIsPlayingPresentation(true);
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
            <TopSelect imgSrc="/assets/language.png" value={lang} options={LANGS} onChange={setLang} />
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
                  <div className="text-[14px] font-bold text-gray-400 mt-1">{getUserStatus(user?.email)}</div>
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
                  >
                    Quiz
                  </button>
                </div>
              </div>
            ) : (
              !rightOpen && (
                <div className="leftHeaderBtns">
                  <button className="ghostBtn" onClick={openDiscussion}>Chat</button>
                </div>
              )
            )}
          </div>

          <div className="leftBody" style={{ position: "relative" }}>
            {/* Slides — only visible in presentation view */}
            {view === "presentation" && (
              <SlideViewport
                slides={slides}
                presentationName={activePresentationName ?? ""}
                onEnd={openQuiz}
                onSpeak={handleSpeak}
                onStopSpeaking={handleStopSpeaking}
                onWaitUntilDone={handleWaitUntilDone}
              />
            )}
            {/* Avatar — always mounted; overlay in presentation mode, full-size in chat mode */}
            <div className={view === "presentation" ? "avatarOverlay" : "avatarStage"}>
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
          onStartPresentation={handleStartPresentation}
          onContinuePresentation={handleContinuePresentation}
          onSwitchToChat={() => handleViewChange("chat")}
        />
      </main>

      <div className="footerNote">HORIBA FRANCE 2026. ALL RIGHTS RESERVED</div>

      <PresentationDialog
        open={presentationDialogOpen}
        onClose={() => setPresentationDialogOpen(false)}
        defaultLang={lang}
        presentations={presentations}
        onSelect={(payload) => {
          if (payload.mode === "existing") {
            loadPresentation(payload.name);
          } else {
            // New presentation: just set label for now — backend upload not yet wired
            setActivePresentationName(payload.name);
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
          console.log("email auth start", email);
        }}
      />
    </div>
  );
}
