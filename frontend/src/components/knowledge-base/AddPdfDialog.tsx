import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

interface KBDocument { id: string; filename: string; lang: string; summary: string; chunkCount: number; uploadedAt: string; }

export function AddPdfDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [docs, setDocs] = useState<KBDocument[]>([]);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function loadDocs() {
    try {
      const res = await fetch("/api/knowledge-base/documents", { credentials: "include" });
      if (res.ok) setDocs(await res.json());
    } catch {}
  }

  useEffect(() => {
    if (open) { setFile(null); setError(""); setSuccess(""); loadDocs(); }
  }, [open]);

  async function doUpload() {
    if (!file) return;
    setUploading(true); setError(""); setSuccess("");
    try {
      const form = new FormData();
      form.append("pdf", file);
      const res = await fetch("/api/knowledge-base/upload", { method: "POST", credentials: "include", body: form });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? "Upload failed"); }
      const data = await res.json();
      setSuccess(`"${data.filename}" ingested — ${data.chunkCount} chunks created.`);
      setFile(null);
      loadDocs();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function doDelete(doc: KBDocument) {
    if (!confirm(`Remove "${doc.filename}" from the knowledge base?`)) return;
    setDeleting(doc.id);
    try {
      await fetch(`/api/knowledge-base/documents/${doc.id}`, { method: "DELETE", credentials: "include" });
      setDocs(d => d.filter(x => x.id !== doc.id));
    } catch { setError("Failed to delete document"); }
    finally { setDeleting(null); }
  }

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
                <div className="presModalTitle">Knowledge base — HR documents</div>
                <div className="presModalSubtitle">Upload PDF documents to enrich the assistant's knowledge</div>
              </div>
              <div className="presForm">
                <div className="presFieldRow">
                  <div className="presFieldLabel">Add PDF</div>
                  <label className="presSubmitBtn" style={{ cursor: "pointer", alignSelf: "flex-start" }}>
                    {file ? file.name : "Choose PDF…"}
                    <input type="file" accept=".pdf" style={{ display: "none" }} onChange={e => { setFile(e.target.files?.[0] ?? null); setError(""); setSuccess(""); }} />
                  </label>
                </div>
                {error && <div className="authError">{error}</div>}
                {success && <div style={{ fontSize: 13, color: "#16a34a" }}>{success}</div>}
                {uploading && <div style={{ fontSize: 13, color: "#6b7280" }}>Ingesting document — extracting text, enriching chunks and building graph… this may take a minute.</div>}
                <div style={{ display: "flex", gap: 10 }}>
                  <button className="presSubmitBtn" onClick={doUpload} disabled={!file || uploading}>
                    {uploading ? "Processing…" : "Upload & ingest"}
                  </button>
                </div>

                {docs.length > 0 && (
                  <>
                    <hr className="presModalDivider" style={{ marginTop: 20 }} />
                    <div className="presFieldLabel" style={{ marginBottom: 8 }}>Documents in knowledge base ({docs.length})</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {docs.map(doc => (
                        <div key={doc.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 14px", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{doc.filename}</div>
                            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{doc.chunkCount} chunks · {doc.lang.toUpperCase()}</div>
                            {doc.summary && <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4, lineHeight: 1.4 }}>{doc.summary.slice(0, 120)}{doc.summary.length > 120 ? "…" : ""}</div>}
                          </div>
                          <button onClick={() => doDelete(doc)} disabled={deleting === doc.id} title="Remove from knowledge base"
                            style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 6px", color: "#9ca3af", fontSize: 18, lineHeight: 1, flexShrink: 0 }}
                            onMouseEnter={e => (e.currentTarget.style.color = "#ef4444")}
                            onMouseLeave={e => (e.currentTarget.style.color = "#9ca3af")}>✕</button>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                {docs.length === 0 && !uploading && (
                  <div style={{ fontSize: 13, color: "#9ca3af", fontStyle: "italic" }}>No documents yet.</div>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
