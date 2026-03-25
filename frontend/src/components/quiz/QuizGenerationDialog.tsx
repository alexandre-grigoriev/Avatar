import { useState } from "react";
import { motion } from "framer-motion";
import { generateQuizFile } from "../../services/gemini";

export function QuizGenerationDialog({ presName, presLang, onClose, onQuizSaved }: {
  presName: string; presLang: string; onClose: () => void; onQuizSaved?: () => void;
}) {
  const [step, setStep]   = useState<"ask" | "form" | "generating" | "done">("ask");
  const [count, setCount] = useState(5);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  async function generate() {
    setStep("generating"); setError("");
    try {
      const contentRes = await fetch(`/uploads/${encodeURIComponent(presName)}/content_${presLang}.txt`);
      const content    = await contentRes.text();
      const questions  = await generateQuizFile(content, presLang, count);
      if (!questions.length) throw new Error("Gemini returned no questions");
      const saveRes = await fetch(`/api/presentations/${encodeURIComponent(presName)}/quiz`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions, sendto: email }),
      });
      if (!saveRes.ok) { const d = await saveRes.json().catch(() => ({})); throw new Error(d.error || `Save failed: ${saveRes.status}`); }
      setStep("done");
      onQuizSaved?.();
    } catch (e: unknown) { setError((e instanceof Error ? e.message : null) ?? "Generation failed"); setStep("form"); }
  }

  const dialogStyle: React.CSSProperties = {
    position: "relative", zIndex: 301, background: "#fff", border: "1px solid #e5e7eb",
    borderRadius: 16, padding: "32px 28px", width: 440, maxWidth: "90vw",
    boxShadow: "0 40px 80px rgba(0,0,0,0.18)", color: "#111827",
  };

  return (
    <motion.div className="modalOverlay" style={{ zIndex: 300 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="modalBackdrop" onClick={onClose} />
      <motion.div initial={{ opacity: 0, y: 10, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.18 }} style={dialogStyle}>
        {step === "ask" && (<>
          <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 10 }}>Generate a quiz?</div>
          <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 24, lineHeight: 1.6 }}>Would you like Gemini to generate quiz questions for <strong style={{ color: "#111827" }}>{presName}</strong>?</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button className="presSubmitBtn" onClick={() => setStep("form")}>Yes — generate quiz</button>
            <button className="presCancelBtn" onClick={onClose}>Skip</button>
          </div>
        </>)}
        {step === "form" && (<>
          <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 20 }}>Quiz settings</div>
          <div className="presFieldRow" style={{ marginBottom: 16 }}>
            <div className="presFieldLabel">Number of questions</div>
            <input type="number" min={1} max={30} value={count} onChange={e => setCount(Math.max(1, Math.min(30, Number(e.target.value))))} className="presFieldInput" style={{ width: 100 }} />
          </div>
          <div className="presFieldRow" style={{ marginBottom: 16 }}>
            <div className="presFieldLabel">Reviewer e-mail <span style={{ color: "#6b7280", fontWeight: 400 }}>(optional)</span></div>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="reviewer@example.com" className="presFieldInput" />
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
          <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 10 }}>Quiz saved!</div>
          <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 24, lineHeight: 1.6 }}>
            {count} questions generated.{email ? <> Quiz results will be reviewed by <strong style={{ color: "#111827" }}>{email}</strong>.</> : <> No reviewer email set.</>}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end" }}><button className="presSubmitBtn" onClick={onClose}>Close</button></div>
        </>)}
      </motion.div>
    </motion.div>
  );
}
