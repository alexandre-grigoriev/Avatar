import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, X } from "lucide-react";
import { summarizeSlideImage } from "../../services/gemini";
import { LANGS, LANG_TO_LONG } from "../../constants";
import { cn } from "../../utils";

export function CreatePresentationDialog({
  open, onClose, onImported, onQuizReady, defaultLang,
}: {
  open: boolean;
  onClose: () => void;
  onImported: (name: string, lang: string) => void;
  onQuizReady: (presName: string, presLang: string) => void;
  defaultLang: string;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [lang, setLang] = useState(defaultLang);
  const [pptxFile, setPptxFile] = useState<File | null>(null);
  const [pdfFile, setPdfFile]   = useState<File | null>(null);
  const [langDropdownOpen, setLangDropdownOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [showSummarizeConfirm, setShowSummarizeConfirm] = useState(false);

  useEffect(() => {
    if (open) {
      setLang(defaultLang); setName(""); setDescription("");
      setPptxFile(null); setPdfFile(null); setImportError(""); setShowSummarizeConfirm(false);
    }
  }, [open, defaultLang]);

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
      const res  = await fetch("/api/presentations/import", { method: "POST", credentials: "include", body: form });
      const text = await res.text();
      const data = (() => { try { return JSON.parse(text); } catch { return { error: text || "Import failed" }; } })();
      if (!res.ok) { setImportError(data.error || "Import failed"); return; }

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
            method: "PATCH", credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ notes, language: longLang }),
          });
        } catch (geminiErr: unknown) {
          setImportError("Slides imported, but Gemini summarization failed: " + (geminiErr instanceof Error ? geminiErr.message : "unknown error"));
        }
      }

      onClose();
      onImported(data.name ?? name.trim(), longLang);
      onQuizReady(data.name ?? name.trim(), longLang);
    } catch (e: unknown) { setImportError((e instanceof Error ? e.message : null) ?? "Network error. Please try again."); }
    finally { setImporting(false); }
  }

  const selectedLang = useMemo(() => LANGS.find(l => l.id === lang), [lang]);

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
                <div className="presModalTitle">New presentation</div>
                <div className="presModalSubtitle">Upload and register a new presentation</div>
              </div>
              <div className="presForm">
                <div className="presFieldRow">
                  <div className="presFieldLabel">Presentation name</div>
                  <input className="presFieldInput" value={name} onChange={e => setName(e.target.value)} placeholder="Enter presentation name" />
                </div>
                <div className="presFieldRow">
                  <div className="presFieldLabel">Description</div>
                  <input className="presFieldInput" value={description} onChange={e => setDescription(e.target.value)} placeholder="Enter description" />
                </div>
                <div className="presFieldRow">
                  <div className="presFieldLabel">Presentation language</div>
                  <div className="presSelectWrap">
                    <button className="presSelectBtn" onClick={() => setLangDropdownOpen(v => !v)}>
                      <span>{selectedLang?.name ?? "Select language..."}</span>
                      <ChevronDown className="h-4 w-4" />
                    </button>
                    {langDropdownOpen && (
                      <div className="presDropdown">
                        {LANGS.map(l => (
                          <button key={l.id} className={cn("presDropdownItem", l.id === lang && "presDropdownItemActive")}
                            onClick={() => { setLang(l.id); setLangDropdownOpen(false); }}>
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
                    <label className="presFileBtn">Choose PDF<input type="file" accept=".pdf" onChange={e => setPdfFile(e.target.files?.[0] ?? null)} className="presFileInput" /></label>
                    <span className="presFileName">{pdfFile ? pdfFile.name : "No file chosen"}</span>
                  </div>
                </div>
                <div className="presFieldRow">
                  <div className="presFieldLabel">PPTX file <span style={{color:"#6b7280",fontWeight:400}}>(optional — for slide notes)</span></div>
                  <div className="presFileUpload">
                    <label className="presFileBtn">Choose PPTX<input type="file" accept=".pptx,.ppt" onChange={e => setPptxFile(e.target.files?.[0] ?? null)} className="presFileInput" /></label>
                    <span className="presFileName">{pptxFile ? pptxFile.name : "No file chosen"}</span>
                  </div>
                </div>
                {importError && <div className="authError" style={{marginTop:8}}>{importError}</div>}
              </div>
              <div className="presFooter">
                <button className="presCancelBtn" onClick={onClose}>Cancel</button>
                <button className="presSubmitBtn" disabled={!name.trim() || !pdfFile || importing}
                  onClick={() => pptxFile ? doImport("none") : setShowSummarizeConfirm(true)}>
                  {importing ? "Importing…" : "Import"}
                </button>
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
            <motion.div initial={{ opacity: 0, y: 10, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.97 }} transition={{ duration: 0.18 }}
              style={{ position: "relative", zIndex: 301, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: "32px 28px", width: 420, maxWidth: "90vw", boxShadow: "0 40px 80px rgba(0,0,0,0.18)" }}
            >
              <div style={{ fontWeight: 700, fontSize: 17, color: "#111827", marginBottom: 10 }}>No PPTX file selected</div>
              <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 24, lineHeight: 1.6 }}>
                Would you like Google Gemini to analyse each slide image and generate spoken notes automatically?
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <button className="presSubmitBtn" onClick={() => doImport("gemini")}>Yes — generate notes with Gemini</button>
                <button className="presCancelBtn" onClick={() => doImport("none")}>No — import without notes</button>
                <button className="presCancelBtn" onClick={() => setShowSummarizeConfirm(false)}>Cancel</button>
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
