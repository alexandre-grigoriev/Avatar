import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "../../utils";

interface KBDocument { id: string; filename: string; lang: string; summary: string; chunkCount: number; uploadedAt: string; documentDate?: string; }

export function AddPdfDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<"add" | "docs" | "manage">("add");
  const [resetting, setResetting] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [documentDate, setDocumentDate] = useState("");
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
    if (open) { setFile(null); setDocumentDate(""); setError(""); setSuccess(""); setTab("add"); setResetConfirm(false); loadDocs(); }
  }, [open]);

  async function doReset() {
    setResetting(true);
    try {
      await fetch("/api/knowledge-base/reset", { method: "DELETE", credentials: "include" });
      setDocs([]);
      setResetConfirm(false);
    } catch { setError("Reset failed"); }
    finally { setResetting(false); }
  }

  async function doUpload() {
    if (!file) return;
    setUploading(true); setError(""); setSuccess("");
    try {
      const form = new FormData();
      form.append("pdf", file);
      if (documentDate) form.append("documentDate", documentDate);
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

              <div className="kbTabs">
                <button className={cn("kbTab", tab === "add" && "kbTabActive")} onClick={() => { setTab("add"); setError(""); setSuccess(""); }}>Add PDF</button>
                <button className={cn("kbTab", tab === "docs" && "kbTabActive")} onClick={() => { setTab("docs"); setError(""); setSuccess(""); setFile(null); setDocumentDate(""); loadDocs(); }}>
                  Documents{docs.length > 0 ? ` (${docs.length})` : ""}
                </button>
                <button className={cn("kbTab", tab === "manage" && "kbTabActive")} onClick={() => { setTab("manage"); setError(""); setSuccess(""); setResetConfirm(false); }}>Management</button>
              </div>

              {tab === "add" && (
                <>
                  <div className="presForm" style={{ marginTop: 16 }}>
                    <div className="presFieldRow">
                      <div className="presFieldLabel">PDF file <span style={{ color: "#ef4444", fontWeight: 700 }}>*</span></div>
                      <div className="presFileUpload">
                        <label className="presFileBtn">
                          Choose PDF
                          <input type="file" accept=".pdf" className="presFileInput" onChange={e => {
                            const f = e.target.files?.[0] ?? null;
                            setFile(f);
                            if (f) setDocumentDate(new Date(f.lastModified).toISOString().slice(0, 10));
                            setError(""); setSuccess("");
                          }} />
                        </label>
                        <span className="presFileName">{file ? file.name : "No file chosen"}</span>
                      </div>
                    </div>
                    <div className="presFieldRow">
                      <div className="presFieldLabel">Document date <span style={{ color: "#9ca3af", fontWeight: 400, fontSize: 12 }}>(optional)</span></div>
                      <input className="presFieldInput" type="date" value={documentDate} onChange={e => setDocumentDate(e.target.value)} />
                    </div>
                    {error && <div className="authError" style={{ marginTop: 8 }}>{error}</div>}
                    {success && <div style={{ fontSize: 13, color: "#16a34a", marginTop: 8 }}>{success}</div>}
                    {uploading && <div style={{ fontSize: 13, color: "#6b7280", marginTop: 8 }}>Ingesting document — extracting text, enriching chunks and building graph… this may take a minute.</div>}
                  </div>
                  <div className="presFooter">
                    <button className="presCancelBtn" onClick={onClose}>Cancel</button>
                    <button className="presSubmitBtn" disabled={!file || uploading} onClick={doUpload}>
                      {uploading ? "Processing…" : "Upload & ingest"}
                    </button>
                  </div>
                </>
              )}

              {tab === "manage" && (
                <>
                  <div className="presForm" style={{ marginTop: 16 }}>
                    {!resetConfirm ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        <div style={{ fontSize: 14, color: "#374151" }}>
                          Reset will permanently delete all documents and their chunks from the knowledge base.
                        </div>
                        <button className="presSubmitBtn" style={{ background: "#ef4444", alignSelf: "flex-start" }}
                          onClick={() => setResetConfirm(true)}>
                          Reset knowledge base
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "#dc2626" }}>
                          Do you really want to reset the knowledge base? All documents will be lost!
                        </div>
                        <div style={{ display: "flex", gap: 10 }}>
                          <button className="presSubmitBtn" style={{ background: "#ef4444" }} disabled={resetting}
                            onClick={doReset}>
                            {resetting ? "Resetting…" : "Yes, delete all"}
                          </button>
                          <button className="presCancelBtn" onClick={() => setResetConfirm(false)}>No, cancel</button>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="presFooter">
                    <button className="presCancelBtn" onClick={onClose}>Close</button>
                  </div>
                </>
              )}

              {tab === "docs" && (
                <>
                  <div className="presForm" style={{ maxHeight: 360, overflowY: "auto", marginTop: 16 }}>
                    {docs.length === 0 ? (
                      <div style={{ fontSize: 13, color: "#9ca3af", fontStyle: "italic" }}>No documents yet.</div>
                    ) : docs.map(doc => (
                      <div key={doc.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 14px", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, marginBottom: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{doc.filename}</div>
                          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{doc.chunkCount} chunks · {doc.lang.toUpperCase()}{doc.documentDate ? ` · ${doc.documentDate}` : ""}</div>
                          {doc.summary && <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 4, lineHeight: 1.4 }}>{doc.summary.slice(0, 120)}{doc.summary.length > 120 ? "…" : ""}</div>}
                        </div>
                        <button onClick={() => doDelete(doc)} disabled={deleting === doc.id} title="Remove"
                          style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 6px", color: "#9ca3af", fontSize: 18, lineHeight: 1, flexShrink: 0 }}
                          onMouseEnter={e => (e.currentTarget.style.color = "#ef4444")}
                          onMouseLeave={e => (e.currentTarget.style.color = "#9ca3af")}>✕</button>
                      </div>
                    ))}
                  </div>
                  <div className="presFooter">
                    <button className="presCancelBtn" onClick={onClose}>Close</button>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
