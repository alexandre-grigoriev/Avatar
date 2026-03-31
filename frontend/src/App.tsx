import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import TalkingHeadAvatar, { type TalkingHeadAvatarHandle } from "./TalkingHeadAvatar";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, LogOut, CheckCircle2 } from "lucide-react";
import "./App.css";
import { type Presentation } from "./services/gemini";
import { type SlideData } from "./types";
import { AVATARS, LANGS, LANG_TO_LONG, LONG_TO_LANG } from "./constants";
import { cn, UserStatusIcon } from "./utils";
import { TopSelect } from "./components/ui/TopSelect";
import { ModeTabs } from "./components/ui/ModeTabs";
import { Card } from "./components/ui/Card";
import { AuthDialog } from "./components/auth/AuthDialog";
import { QuizGenerationDialog } from "./components/quiz/QuizGenerationDialog";
import { AddPdfDialog } from "./components/knowledge-base/AddPdfDialog";
import { PresentationDialog } from "./components/presentations/PresentationDialog";
import { CreatePresentationDialog } from "./components/presentations/CreatePresentationDialog";
import { EditPresentationDialog } from "./components/presentations/EditPresentationDialog";
import { SlideViewport } from "./components/presentations/SlideViewport";
import { ChatPanel } from "./components/chat/ChatPanel";

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
  const [createPresDialogOpen, setCreatePresDialogOpen] = useState(false);
  const [editPresDialogOpen, setEditPresDialogOpen] = useState(false);
  const [addPdfOpen, setAddPdfOpen] = useState(false);
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

  const presentationContent = useMemo(() => {
    if (!slides.length) return "";
    return slides.map((s, i) => `[Slide ${i + 1}]\n${s.paragraphs.join("\n")}`).join("\n\n");
  }, [slides]);

  const [isSpeaking, setIsSpeaking] = useState(false);
  const handleSpeak = useCallback((text: string) => {
    setIsSpeaking(true);
    avatarRef.current?.speak(text);
    avatarRef.current?.waitUntilDone().then(() => setIsSpeaking(false));
  }, []);
  const handleStopSpeaking = useCallback(() => { setIsSpeaking(false); avatarRef.current?.stopSpeaking(); }, []);
  const handleWaitUntilDone = useCallback(() => avatarRef.current?.waitUntilDone() ?? Promise.resolve(), []);

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
  }, [quizEnabled]);

  const [verifiedBanner, setVerifiedBanner] = useState(false);

  useEffect(() => {
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
        if (res.ok) { setUser(await res.json()); setAuthOpen(false); }
        else { setUser(null); setAuthOpen(true); }
      } catch {
        if (!cancelled) { setUser(null); setAuthOpen(true); }
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    fetch("/api/list-presentations", { credentials: "include" })
      .then((r) => r.json())
      .then((data: Presentation[]) => { if (Array.isArray(data)) setPresentations(data); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!userMenuOpen) return;
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setUserMenuOpen(false);
    }
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [userMenuOpen]);

  useEffect(() => {
    if (view === "presentation" && !activePresentationName) setPresentationDialogOpen(true);
  }, [view, activePresentationName]);

  async function loadPresentation(name: string, langOverride?: string) {
    try {
      const longLang = LANG_TO_LONG[langOverride ?? lang] ?? langOverride ?? "english";
      const res = await fetch(
        `/api/presentation-data?file_name=${encodeURIComponent(name)}&language=${encodeURIComponent(longLang)}`,
        { credentials: "include" }
      );
      const data = await res.json();
      if (data.error) { console.warn("Presentation data error:", data.error); setSlides([]); return; }
      const rawSlides: Record<string, unknown> = data.slides ?? data;
      let qEnabled = data.quizEnabled !== false;
      const slideEntries = Object.entries(rawSlides).filter(([, v]) => {
        if (Array.isArray(v) && v[0]?.length === 1 && /^quiz:(YES|NO)$/i.test(v[0][0])) {
          qEnabled = /^quiz:YES$/i.test(v[0][0]);
          return false;
        }
        return true;
      });
      setQuizEnabled(qEnabled);
      if (!qEnabled && panelMode === "quiz") setPanelMode("discussion");
      const slideArr: SlideData[] = slideEntries.map(([, v]) => ({
        paragraphs: (v as [string[], string])[0],
        image: (v as [string[], string])[1],
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

  function openDiscussion() { setRightOpen(true); setPanelMode("discussion"); }
  function openQuiz()       { setRightOpen(true); setPanelMode("quiz"); }

  async function handleLangChange(newLang: string) {
    if (view !== "presentation" || !activePresentationName) { setLang(newLang); return; }
    const longLang = LANG_TO_LONG[newLang] ?? newLang;
    try {
      const res = await fetch(`/uploads/${encodeURIComponent(activePresentationName)}/content_${longLang}.txt`, { method: "HEAD" });
      if (res.ok) { setLang(newLang); loadPresentation(activePresentationName, newLang); }
    } catch { /* stay on current language */ }
  }

  function handleViewChange(newView: "chat" | "presentation") {
    setView(newView);
    if (!rightOpen) setRightOpen(true);
  }

  function handleStartPresentation(name: string) {
    setActivePresentationName(name);
    setView("presentation");
    const presLang = LONG_TO_LANG[presentations.find((p) => p.name === name)?.language ?? ""] ?? lang;
    if (presLang !== lang) setLang(presLang);
    loadPresentation(name, presLang);
  }

  function handleContinuePresentation() { handlePlayingChange(true, "manual"); }

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
      setRightPanelWidth(Math.max(300, Math.min(rect.width / 2, rect.right - e.clientX)));
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
      <header className="topBar">
        <div className="topBarInner">
          <div className="brandLeft">
            <img className="brandHoriba" src="/screen logo Horiba.png" alt="HORIBA" />
          </div>

          <div className="topControls">
            <TopSelect imgSrc="/person.png" value={avatar} options={AVATARS} onChange={setAvatar} />
            <TopSelect imgSrc="/language.png" value={lang} options={LANGS} onChange={handleLangChange} />
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
                    <>
                      {(user.role === "admin" || user.role === "contributor") && (
                        <>
                          <button className="ghostBtn w-full" style={{ justifyContent: "flex-start" }}
                            onClick={() => { setCreatePresDialogOpen(true); setUserMenuOpen(false); }}>
                            +  Create presentation...
                          </button>
                          <button className="ghostBtn w-full" style={{ justifyContent: "flex-start" }}
                            onClick={() => { setEditPresDialogOpen(true); setUserMenuOpen(false); }}>
                            ✎  Edit presentations...
                          </button>
                        </>
                      )}
                      {user.role === "admin" && (
                        <button className="ghostBtn w-full" style={{ justifyContent: "flex-start" }}
                          onClick={() => { setAddPdfOpen(true); setUserMenuOpen(false); }}>
                          ⊕  Knowledge base…
                        </button>
                      )}
                      <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "5px 0" }} />
                      <button className="ghostBtn w-full"
                        onClick={async () => {
                          try { await fetch("/api/auth/logout", { method: "POST", credentials: "include" }); } catch {}
                          setUser(null); setAuthOpen(true); setUserMenuOpen(false);
                        }}
                      >
                        <LogOut className="h-4 w-4" /> Sign out
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <main
        ref={mainGridRef}
        className={cn("mainGrid", rightOpen ? "gridWithRight" : "gridNoRight")}
        style={rightOpen ? { gridTemplateColumns: `1fr auto ${rightPanelWidth}px` } : undefined}
      >
        <Card className="leftCard" ref={leftCardRef}>
          {(!isPresentationPlaying || view === "chat") && (
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
                    <button className={cn("modeTab", panelMode === "discussion" && "modeTabActive")} onClick={openDiscussion}>Discussion</button>
                    <button className={cn("modeTab", panelMode === "quiz" && "modeTabActive")} onClick={openQuiz}
                      disabled={!quizEnabled} style={!quizEnabled ? { opacity: 0.4, cursor: "not-allowed" } : undefined}>
                      Quiz
                    </button>
                  </div>
                </div>
              ) : view === "chat" ? (
                <div className="leftHeaderBtns">
                  {!rightOpen && <button className="ghostBtn" onClick={openDiscussion}>Chat</button>}
                  {isSpeaking && (
                    <button className="avatarStopBtn" onClick={handleStopSpeaking} title="Stop speaking">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
                    </button>
                  )}
                </div>
              ) : null}
            </div>
          )}

          <div className="leftBody" style={{ position: "relative" }}>
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
            <div
              className={view === "presentation" && !isPresentationPlaying ? "avatarOverlay" : view === "chat" ? "avatarStage" : undefined}
              style={isPresentationPlaying ? avatarPlayingStyle : undefined}
            >
              <TalkingHeadAvatar ref={avatarRef} avatar={avatar} lang={lang} />
            </div>
          </div>
        </Card>

        {rightOpen && (
          <div className="splitter" onMouseDown={handleSplitterMouseDown}>
            <div className="splitterLine" />
          </div>
        )}

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

      <EditPresentationDialog
        open={editPresDialogOpen}
        onClose={() => {
          setEditPresDialogOpen(false);
          fetch("/api/list-presentations", { credentials: "include" })
            .then(r => r.json()).then((data: Presentation[]) => { if (Array.isArray(data)) setPresentations(data); }).catch(() => {});
        }}
        userRole={user?.role ?? "user"}
        defaultLang={lang}
      />

      <CreatePresentationDialog
        open={createPresDialogOpen}
        onClose={() => setCreatePresDialogOpen(false)}
        onQuizReady={(presName, presLang) => setQuizGenDialog({ presName, presLang })}
        defaultLang={lang}
        onImported={(name, presLang) => {
          setActivePresentationName(name);
          setView("presentation");
          fetch("/api/list-presentations", { credentials: "include" })
            .then(r => r.json())
            .then((data: Presentation[]) => { if (Array.isArray(data)) setPresentations(data); })
            .catch(() => {})
            .finally(() => loadPresentation(name, presLang));
        }}
      />

      {addPdfOpen && <AddPdfDialog open={addPdfOpen} onClose={() => setAddPdfOpen(false)} />}

      <PresentationDialog
        open={presentationDialogOpen}
        onClose={() => { setPresentationDialogOpen(false); if (!activePresentationName) setView("chat"); }}
        presentations={presentations}
        onSelect={(name) => loadPresentation(name)}
      />

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
        onBeginOAuth={() => {
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
