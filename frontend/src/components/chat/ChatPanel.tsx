import { useState, useEffect, useCallback, useRef } from "react";
import { X, Mic } from "lucide-react";
import { Card } from "../ui/Card";
import { QuizWidget } from "../quiz/QuizWidget";
import { sendToGemini, classifyIntent, type ChatMessage, type Presentation } from "../../services/gemini";
import { useSpeechRecognition } from "../../hooks/useSpeechRecognition";
import { cn, t } from "../../utils";

export function ChatPanel({
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

  useEffect(() => {
    const welcome = t(lang).welcome;
    const welcomeMsg = { role: "assistant" as const, text: welcome };
    setMessages([welcomeMsg]);
    setHistory([{ role: "assistant", text: welcome }]);
  }, [lang]);

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
        setMessages((m) => [...m, { role: "assistant", text: t(lang).startPresentation(name), isAction: true }]);
        setIsThinking(false);
        onStartPresentation(name);
        return;
      }

      if (intent.type === "continue_presentation") {
        setMessages((m) => [...m, { role: "assistant", text: t(lang).resuming, isAction: true }]);
        setIsThinking(false);
        onContinuePresentation();
        return;
      }

      if (intent.type === "change_view_chat") {
        setMessages((m) => [...m, { role: "assistant", text: t(lang).switchingChat, isAction: true }]);
        setIsThinking(false);
        onSwitchToChat();
        return;
      }

      const newHistory: ChatMessage[] = [...history, { role: "user", text: v }];
      const response = await sendToGemini(v, newHistory, presentations, presentationContent, lang);
      const botMsg = { role: "assistant" as const, text: response };
      setMessages((m) => [...m, botMsg]);
      setHistory([...newHistory, { role: "assistant", text: response }]);
      onStopSpeaking();
      onSpeak(response);
    } catch {
      setMessages((m) => [...m, { role: "assistant", text: t(lang).error }]);
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
                  <img src="/send.png" alt="Send" className="chatInputIcon" />
                </button>
              ) : (
                <button
                  className={cn("chatInputIconBtn", speech.isRecording && "chatMicRecording")}
                  title={speech.supported ? (speech.isRecording ? "Release to send" : "Hold to speak") : "Voice not supported"}
                  onPointerDown={(e) => { e.preventDefault(); onStopSpeaking(); speech.start((text) => send(text)); }}
                  onPointerUp={(e) => { e.preventDefault(); speech.stop(); }}
                  onPointerLeave={(e) => { e.preventDefault(); if (speech.isRecording) speech.stop(); }}
                  onPointerCancel={(e) => { e.preventDefault(); if (speech.isRecording) speech.stop(); }}
                  disabled={!speech.supported}
                >
                  {speech.isRecording ? (
                    <Mic className="chatInputIcon" style={{ color: "#e53e3e" }} />
                  ) : (
                    <img src="/microphone.png" alt="Mic" className="chatInputIcon" />
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
