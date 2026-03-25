import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, X } from "lucide-react";
import { translateContent, translateQuizFileQuestions, type Presentation } from "../../services/gemini";
import { cn } from "../../utils";

const LANG_LONG_DISPLAY: Record<string, string> = { english: "English", french: "French", arabic: "Arabic", japanese: "Japanese", chinese: "Chinese", russian: "Russian" };
const ALL_LONG_LANGS = ["english", "french", "japanese", "chinese", "russian", "arabic"];

function EditSelectDropdown({ items, selected, onSelect }: { items: Presentation[]; selected: Presentation | null; onSelect: (p: Presentation) => void; }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="presSelectWrap">
      <button className="presSelectBtn" onClick={() => setOpen(v => !v)}>
        <span>
          {selected?.name ?? "Select..."}
          {selected && <span className="presSelectLang"> — {selected.language.toUpperCase()}</span>}
        </span>
        <ChevronDown className="h-4 w-4" />
      </button>
      {open && (
        <div className="presDropdown">
          {items.map(p => (
            <button key={p.name}
              className={cn("presDropdownItem", p.name === selected?.name && "presDropdownItemActive")}
              onClick={() => { onSelect(p); setOpen(false); }}>
              {p.name} — {p.language.toUpperCase()}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function EditPresentationDialog({ open, onClose, userRole, defaultLang }: {
  open: boolean; onClose: () => void; userRole: string; defaultLang: string;
}) {
  const [step, setStep] = useState<"select" | "edit">("select");
  const [myPres, setMyPres] = useState<Presentation[]>([]);
  const [selected, setSelected] = useState<Presentation | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [hasQuiz, setHasQuiz] = useState(false);
  const [addLangOpen, setAddLangOpen] = useState(false);
  const [newLang, setNewLang] = useState("");
  const [translateOpt, setTranslateOpt] = useState<"gemini" | "blank">("gemini");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const [savedMeta, setSavedMeta] = useState(false);

  // userRole and defaultLang are available for future use
  void userRole; void defaultLang;

  useEffect(() => {
    if (open) {
      setStep("select"); setError(""); setAddLangOpen(false); setSelected(null);
      fetch("/api/my-presentations", { credentials: "include" })
        .then(r => r.json()).then((data: Presentation[]) => { setMyPres(data); if (data.length) setSelected(data[0]); }).catch(() => {});
    }
  }, [open]);

  async function selectPres(p: Presentation) {
    setSelected(p); setEditName(p.name); setEditDesc(p.description);
    setError(""); setAddLangOpen(false); setAddError("");
    const qRes = await fetch(`/uploads/${encodeURIComponent(p.name)}/question.json`, { method: "HEAD" });
    setHasQuiz(qRes.ok);
    setStep("edit");
  }

  async function saveMetadata() {
    if (!selected) return;
    setSaving(true); setError("");
    const res = await fetch(`/api/presentations/${encodeURIComponent(selected.name)}/metadata`, {
      method: "PATCH", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName, description: editDesc }),
    });
    setSaving(false);
    if (res.ok) {
      const data = await res.json();
      const updated = { ...selected, name: data.name, description: editDesc };
      setSelected(updated);
      const listRes = await fetch("/api/my-presentations", { credentials: "include" });
      if (listRes.ok) setMyPres(await listRes.json());
      setSavedMeta(true);
      setTimeout(() => setSavedMeta(false), 3000);
    } else setError("Failed to save");
  }

  function downloadFile(url: string, filename: string) {
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  }

  async function uploadContent(lang: string, file: File) {
    if (!selected) return;
    const text = await file.text();
    const res = await fetch(`/api/presentations/${encodeURIComponent(selected.name)}/content/${lang}`, {
      method: "PUT", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: text }),
    });
    if (!res.ok) setError("Failed to upload content file");
  }

  async function uploadQuiz(lang: string, file: File) {
    if (!selected) return;
    const text = await file.text();
    const data = JSON.parse(text);
    const primaryLang = selected.language.split(",")[0].trim();
    const targetLang = lang === primaryLang ? "default" : lang;
    const res = await fetch(`/api/presentations/${encodeURIComponent(selected.name)}/quiz/${targetLang}`, {
      method: "PUT", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) setError("Failed to upload quiz file");
  }

  async function doRemoveLanguage(lang: string) {
    if (!selected) return;
    if (!confirm(`Remove "${LANG_LONG_DISPLAY[lang] ?? lang}" and its files from this presentation?`)) return;
    const res = await fetch(`/api/presentations/${encodeURIComponent(selected.name)}/language/${encodeURIComponent(lang)}`, {
      method: "DELETE", credentials: "include",
    });
    if (!res.ok) { setError("Failed to remove language"); return; }
    const data = await res.json();
    setMyPres(prev => prev.map(p => p.name === selected.name ? { ...p, language: data.language } : p));
    setSelected(s => s ? { ...s, language: data.language } : s);
  }

  async function doAddLanguage() {
    if (!selected || !newLang) return;
    setAdding(true); setAddError("");
    try {
      const sourceLang = selected.language.split(",")[0].trim();
      const contentRes = await fetch(`/uploads/${encodeURIComponent(selected.name)}/content_${sourceLang}.txt`);
      if (!contentRes.ok) throw new Error("Could not fetch source content");
      const sourceContent = await contentRes.text();

      let finalContent: string;
      if (translateOpt === "gemini") {
        finalContent = await translateContent(sourceContent, sourceLang, newLang);
      } else {
        const blocks = sourceContent.split("-------").map(b => b.trim()).filter(Boolean);
        finalContent = blocks.map(block => {
          const lines = block.split("\n").map(l => l.trim()).filter(Boolean);
          const image = lines.find(l => l.startsWith("image:")) ?? "";
          const quiz  = lines.find(l => /^quiz:/i.test(l)) ?? "";
          if (quiz && !image) return quiz;
          return ["No slide notes", image, quiz].filter(Boolean).join("\n");
        }).join("\n-------\n");
      }

      await fetch(`/api/presentations/${encodeURIComponent(selected.name)}/content/${newLang}`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: finalContent }),
      });

      if (translateOpt === "gemini" && hasQuiz) {
        const quizRes = await fetch(`/uploads/${encodeURIComponent(selected.name)}/question.json`);
        if (quizRes.ok) {
          const quizData = await quizRes.json();
          const translatedQs = await translateQuizFileQuestions(quizData.questions, newLang);
          await fetch(`/api/presentations/${encodeURIComponent(selected.name)}/quiz/${newLang}`, {
            method: "PUT", credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ questions: translatedQs, sendto: quizData.sendto ?? "" }),
          });
        }
      }

      await fetch(`/api/presentations/${encodeURIComponent(selected.name)}/language`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang: newLang }),
      });

      const listRes = await fetch("/api/my-presentations", { credentials: "include" });
      if (listRes.ok) {
        const list = await listRes.json();
        setMyPres(list);
        const upd = list.find((p: Presentation) => p.name === selected.name);
        if (upd) setSelected(upd);
      }
      setAddLangOpen(false); setNewLang("");
    } catch (e: unknown) {
      setAddError((e instanceof Error ? e.message : null) ?? "Failed to add language");
    } finally { setAdding(false); }
  }

  const presentLangs = selected ? selected.language.split(",").map(l => l.trim()).filter(Boolean) : [];
  const availLangs = ALL_LONG_LANGS.filter(l => !presentLangs.includes(l));

  if (!open) return null;
  return createPortal(
    <div className="modalOverlay" style={{ zIndex: 200 }}>
      <div className="modalBackdrop" onClick={onClose} />
      <div className="presModalWrap">
      <div className="presModal" style={{ maxHeight: "85vh", overflowY: "auto" }}>
        <button className="presCloseBtn" onClick={onClose} title="Close"><X className="h-5 w-5" /></button>

        {step === "select" ? (
          <>
            <div className="presModalHeader" style={{ paddingBottom: 0 }}>
              <div className="presModalTitle">Edit presentation</div>
              <div className="presModalSubtitle">Select a presentation to edit</div>
            </div>
            <div className="presForm">
              <div className="presFieldRow">
                <div className="presFieldLabel">Select a presentation</div>
                {myPres.length === 0 ? (
                  <div className="text-sm text-gray-400 italic">No presentations available</div>
                ) : (
                  <EditSelectDropdown items={myPres} selected={selected} onSelect={p => setSelected(p)} />
                )}
              </div>
              {selected && (
                <div className="presPreviewCard">
                  <div className="presPreviewTitle">{selected.name}</div>
                  <div className="presPreviewDesc">{selected.description}</div>
                  <div className="presPreviewLang">Language: {selected.language.toUpperCase()}</div>
                </div>
              )}
            </div>
            <div className="presFooter">
              <button className="presCancelBtn" onClick={onClose}>Cancel</button>
              <button className="presSubmitBtn" disabled={!selected}
                onClick={() => { if (selected) selectPres(selected); }}>
                Edit
              </button>
            </div>
          </>
        ) : selected ? (
          <>
            <button onClick={() => setStep("select")} className="presBackBtn">
              <ChevronDown style={{ transform: "rotate(90deg)" }} className="h-4 w-4" /> Back to list
            </button>
            <div className="presModalHeader">
              <div className="presModalTitle">Edit: {selected.name}</div>
              <div className="presModalSubtitle">Edit presentation metadata and language settings</div>
            </div>
            <div className="presForm">
              <div className="presFieldRow">
                <div className="presFieldLabel">Presentation name</div>
                <input className="presFieldInput" value={editName} onChange={e => setEditName(e.target.value)} />
              </div>
              <div className="presFieldRow">
                <div className="presFieldLabel">Description</div>
                <input className="presFieldInput" value={editDesc} onChange={e => setEditDesc(e.target.value)} />
              </div>
              <button className="presSubmitBtn" onClick={saveMetadata} disabled={saving} style={{ alignSelf: "flex-start" }}>
                {saving ? "Saving…" : "Save metadata"}
              </button>
              {savedMeta && <div style={{ marginTop: 4, fontSize: 12, color: "#16a34a" }}>Metadata saved</div>}
              {error && <div className="authError" style={{ marginTop: 4 }}>{error}</div>}

              <hr className="presModalDivider" />

              <div className="presFieldLabel" style={{ marginBottom: 10 }}>Languages</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {presentLangs.map((lang, i) => {
                  const isPrimary = i === 0;
                  const quizFile  = isPrimary ? "question.json" : `question_${lang}.json`;
                  const presEnc   = encodeURIComponent(selected.name);
                  return (
                    <div key={lang} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "10px 14px", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8 }}>
                      <span style={{ fontWeight: 600, minWidth: 80, fontSize: 16 }}>{LANG_LONG_DISPLAY[lang] ?? lang}</span>
                      <button className="presSubmitBtn" onClick={() => downloadFile(`/uploads/${presEnc}/content_${lang}.txt`, `content_${lang}.txt`)}>↓ Content</button>
                      <label className="presSubmitBtn" style={{ cursor: "pointer" }}>
                        ↑ Content<input type="file" accept=".txt" style={{ display: "none" }} onChange={async e => { if (e.target.files?.[0]) { await uploadContent(lang, e.target.files[0]); e.target.value = ""; } }} />
                      </label>
                      {hasQuiz && <>
                        <button className="presSubmitBtn" style={{ marginLeft: 20 }} onClick={() => downloadFile(`/uploads/${presEnc}/${quizFile}`, quizFile)}>↓ Quiz</button>
                        <label className="presSubmitBtn" style={{ cursor: "pointer" }}>
                          ↑ Quiz<input type="file" accept=".json" style={{ display: "none" }} onChange={async e => { if (e.target.files?.[0]) { await uploadQuiz(lang, e.target.files[0]); e.target.value = ""; } }} />
                        </label>
                      </>}
                      {!isPrimary && (
                        <button onClick={() => doRemoveLanguage(lang)} title="Remove language"
                          style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", padding: "2px 6px", color: "#9ca3af", fontSize: 18, lineHeight: 1, borderRadius: 4, display: "flex", alignItems: "center" }}
                          onMouseEnter={e => (e.currentTarget.style.color = "#ef4444")}
                          onMouseLeave={e => (e.currentTarget.style.color = "#9ca3af")}>✕</button>
                      )}
                    </div>
                  );
                })}
              </div>

              {availLangs.length > 0 && !addLangOpen && (
                <button className="presSubmitBtn" style={{ alignSelf: "flex-start", marginTop: 12 }}
                  onClick={() => { setAddLangOpen(true); setNewLang(availLangs[0]); setTranslateOpt("gemini"); setAddError(""); }}>
                  + Add language
                </button>
              )}
              {addLangOpen && (
                <div style={{ border: "1.5px solid #e5e7eb", borderRadius: 10, padding: 20, marginTop: 12, background: "#f9fafb" }}>
                  <div className="presFieldLabel" style={{ marginBottom: 12 }}>Add language</div>
                  <div className="presFieldRow">
                    <div className="presFieldLabel">Language</div>
                    <select className="presFieldInput" value={newLang} onChange={e => setNewLang(e.target.value)}>
                      {availLangs.map(l => <option key={l} value={l}>{LANG_LONG_DISPLAY[l] ?? l}</option>)}
                    </select>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                      <input type="radio" checked={translateOpt === "gemini"} onChange={() => setTranslateOpt("gemini")} />
                      Translate from {LANG_LONG_DISPLAY[presentLangs[0]] ?? presentLangs[0]} using Gemini
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                      <input type="radio" checked={translateOpt === "blank"} onChange={() => setTranslateOpt("blank")} />
                      Create blank content (I'll upload it later)
                    </label>
                  </div>
                  {addError && <div className="authError" style={{ marginBottom: 10 }}>{addError}</div>}
                  <div style={{ display: "flex", gap: 10 }}>
                    <button className="presSubmitBtn" onClick={doAddLanguage} disabled={adding}>
                      {adding ? (translateOpt === "gemini" ? "Translating…" : "Adding…") : "Add"}
                    </button>
                    <button className="presCancelBtn" onClick={() => setAddLangOpen(false)} disabled={adding}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>
      </div>
    </div>,
    document.body
  );
}
