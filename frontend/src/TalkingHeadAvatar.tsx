import React, { useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";

const TTS_API_KEY = import.meta.env.VITE_TTS_API_KEY ?? "AIzaSyB4xEOzhBfuIO33fhaqxeQRXXCaiy7ZuFY";

const AVATAR_CONFIG: Record<string, Record<string, { url: string; ttsLang: string; ttsVoice: string; lipsyncLang: string }>> = {
  alan: {
    en: { url: "/talking_heads/avatars/men.glb",   ttsLang: "en-GB", ttsVoice: "en-GB-Standard-B", lipsyncLang: "en" },
    fr: { url: "/talking_heads/avatars/men.glb",   ttsLang: "fr-FR", ttsVoice: "fr-FR-Standard-B", lipsyncLang: "fr" },
    ar: { url: "/talking_heads/avatars/men.glb",   ttsLang: "ar-XA", ttsVoice: "ar-XA-Wavenet-C",  lipsyncLang: "ar" },
    ja: { url: "/talking_heads/avatars/men.glb",   ttsLang: "ja-JP", ttsVoice: "ja-JP-Standard-C", lipsyncLang: "ja" },
    zh: { url: "/talking_heads/avatars/men.glb",   ttsLang: "cmn-CN", ttsVoice: "cmn-CN-Wavenet-B", lipsyncLang: "zh" },
    ru: { url: "/talking_heads/avatars/men.glb",   ttsLang: "ru-RU", ttsVoice: "ru-RU-Standard-B", lipsyncLang: "ru" },
  },
  ada: {
    en: { url: "/talking_heads/avatars/women.glb", ttsLang: "en-GB", ttsVoice: "en-GB-Standard-A", lipsyncLang: "en" },
    fr: { url: "/talking_heads/avatars/women.glb", ttsLang: "fr-FR", ttsVoice: "fr-FR-Standard-A", lipsyncLang: "fr" },
    ar: { url: "/talking_heads/avatars/women.glb", ttsLang: "ar-XA", ttsVoice: "ar-XA-Standard-A", lipsyncLang: "ar" },
    ja: { url: "/talking_heads/avatars/women.glb", ttsLang: "ja-JP", ttsVoice: "ja-JP-Standard-A", lipsyncLang: "ja" },
    zh: { url: "/talking_heads/avatars/women.glb", ttsLang: "cmn-CN", ttsVoice: "cmn-CN-Wavenet-A", lipsyncLang: "zh" },
    ru: { url: "/talking_heads/avatars/women.glb", ttsLang: "ru-RU", ttsVoice: "ru-RU-Standard-A", lipsyncLang: "ru" },
  },
};

// Load TalkingHead via a native <script type="module"> tag so Vite never
// tries to bundle/analyze the file sitting in /public.
const GLOBAL_KEY = "__TalkingHeadClass__";
let _loadPromise: Promise<any> | null = null;

function loadTalkingHead(): Promise<any> {
  if ((window as any)[GLOBAL_KEY]) return Promise.resolve((window as any)[GLOBAL_KEY]);
  if (_loadPromise) return _loadPromise;

  _loadPromise = new Promise((resolve, reject) => {
    // Use top-level await + try/catch inside the inline module so errors
    // are dispatched as a custom event (onerror doesn't fire for inline modules).
    const script = document.createElement("script");
    script.type = "module";
    script.textContent = `
      try {
        const { TalkingHead } = await import("/talking_heads/modules/talkinghead.mjs");
        window["${GLOBAL_KEY}"] = TalkingHead;
        window.dispatchEvent(new CustomEvent("${GLOBAL_KEY}:ready"));
      } catch (e) {
        window.dispatchEvent(new CustomEvent("${GLOBAL_KEY}:error", { detail: String(e) }));
      }
    `;
    window.addEventListener(`${GLOBAL_KEY}:ready`, () => resolve((window as any)[GLOBAL_KEY]), { once: true });
    window.addEventListener(`${GLOBAL_KEY}:error`, (e: any) => {
      _loadPromise = null; // allow retry
      reject(new Error(e.detail));
    }, { once: true });
    script.addEventListener("error", (e) => { _loadPromise = null; reject(e); });
    document.head.appendChild(script);
  });

  return _loadPromise;
}

export interface TalkingHeadAvatarHandle {
  speak: (text: string) => void;
  stopSpeaking: () => void;
  waitUntilDone: () => Promise<void>;
  setView: (view: "full" | "upper" | "mid" | "head") => void;
}

interface Props {
  avatar: string;
  lang: string;
}

const TalkingHeadAvatar = forwardRef<TalkingHeadAvatarHandle, Props>(function TalkingHeadAvatar({ avatar, lang }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<any>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [loadingText, setLoadingText] = useState("Loading Avatar...");

  useImperativeHandle(ref, () => ({
    speak(text: string) {
      headRef.current?.speakText(text);
    },
    stopSpeaking() {
      headRef.current?.stopSpeaking?.();
    },
    setView(view: "full" | "upper" | "mid" | "head") {
      headRef.current?.setView(view);
    },
    waitUntilDone() {
      // Only resolves when head is loaded AND has finished speaking.
      // Never resolves immediately while head is null (prevents instant slide skip).
      return new Promise<void>((resolve) => {
        const check = () => {
          const h = headRef.current;
          if (h && h.speechQueue?.length === 0 && !h.isAudioPlaying) {
            resolve();
          } else {
            setTimeout(check, 500);
          }
        };
        check();
      });
    },
  }));

  useEffect(() => {
    if (!containerRef.current) return;

    const cfg = AVATAR_CONFIG[avatar]?.[lang] ?? AVATAR_CONFIG.alan.en;
    let cancelled = false;

    setStatus("loading");
    setLoadingText("Loading Avatar...");

    // Destroy previous head if any
    if (headRef.current) {
      try { headRef.current.stop(); } catch {}
      headRef.current = null;
    }
    // Clear the container
    if (containerRef.current) containerRef.current.innerHTML = "";

    (async () => {
      try {
        const TalkingHead = await loadTalkingHead();
        if (cancelled) return;

        const head = new TalkingHead(containerRef.current, {
          ttsEndpoint: "https://texttospeech.googleapis.com/v1beta1/text:synthesize",
          ttsApikey: TTS_API_KEY,
          lipsyncModules: [cfg.lipsyncLang],
          cameraView: "upper",
        });
        headRef.current = head;

        await head.showAvatar(
          { url: cfg.url, body: "F", avatarMood: "neutral", ttsLang: cfg.ttsLang, ttsVoice: cfg.ttsVoice, lipsyncLang: cfg.lipsyncLang },
          (ev: ProgressEvent) => {
            if (ev.lengthComputable) {
              const pct = Math.min(100, Math.round((ev.loaded / ev.total) * 100));
              setLoadingText(`Loading Avatar ${pct}%`);
            }
          }
        );

        if (!cancelled) setStatus("ready");
      } catch (err) {
        if (!cancelled) {
          setStatus("error");
          const msg = err instanceof Error ? err.message : String(err);
          setLoadingText(`Avatar error: ${msg}`);
          console.error("TalkingHead error:", err);
        }
      }
    })();

    const onVisibility = () => {
      if (document.visibilityState === "visible") headRef.current?.start();
      else headRef.current?.stop();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      try { headRef.current?.stop(); } catch {}
    };
  }, [avatar, lang]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      {status !== "ready" && (
        <div
          style={{
            position: "absolute", inset: 0, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.85)",
          }}
        >
          {status === "loading" && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
              <div className="avatarSpinner" />
              <div style={{ fontSize: 14, color: "#555" }}>{loadingText}</div>
            </div>
          )}
          {status === "error" && (
            <div style={{ color: "#c00", fontSize: 14, textAlign: "center", padding: "0 16px" }}>{loadingText}</div>
          )}
        </div>
      )}
    </div>
  );
});

export default TalkingHeadAvatar;
