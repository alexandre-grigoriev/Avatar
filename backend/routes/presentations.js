/**
 * routes/presentations.js — presentation import, content, quiz, metadata, languages
 */
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import { exec } from "child_process";
import { promisify } from "util";
import JSZip from "jszip";
import { UPLOADS_DIR, requireAuth, requireContributor } from "../shared.js";
import { transporter, SMTP_FROM } from "../email.js";

const __filename  = fileURLToPath(import.meta.url);
const __dirname   = path.dirname(__filename);
const execAsync   = promisify(exec);

export const router = express.Router();

const upload      = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });
const PPTX_SCRIPT = path.join(__dirname, "../pptx_import.py");
const PYTHON      = process.env.PYTHON_BIN
  ? path.resolve(__dirname, "..", process.env.PYTHON_BIN)
  : "python";

// ── Helpers ───────────────────────────────────────────────────────────────────
async function pptxImport(pptxBuffer, outDir, W = 1920, H = 1080) {
  const tmpPptx = path.join(outDir, "_upload.pptx");
  fs.writeFileSync(tmpPptx, pptxBuffer);
  try {
    const { stdout } = await execAsync(`"${PYTHON}" "${PPTX_SCRIPT}" "${tmpPptx}" "${outDir}" ${W} ${H}`, { timeout: 300000 });
    return JSON.parse(stdout.trim());
  } finally {
    if (fs.existsSync(tmpPptx)) fs.unlinkSync(tmpPptx);
  }
}

function buildContentFile(notes, images, quizEnabled = false) {
  const count  = Math.max(notes.length, images.length);
  const blocks = [];
  for (let i = 0; i < count; i++) {
    const lines = [];
    if (notes[i])  lines.push(notes[i]);
    if (images[i]) lines.push(`image:${images[i]}`);
    blocks.push(lines.join("\n"));
  }
  return blocks.join("\n-------\n") + `\n-------\nquiz:${quizEnabled ? "YES" : "NO"}`;
}

function readFilesJson() {
  const p = path.join(UPLOADS_DIR, "files.json");
  try { return JSON.parse(fs.readFileSync(p, "utf-8")); } catch { return { files: [] }; }
}
function writeFilesJson(data) {
  fs.writeFileSync(path.join(UPLOADS_DIR, "files.json"), JSON.stringify(data, null, 2));
}

// ── Public routes (no auth) ───────────────────────────────────────────────────
router.get("/api/list-presentations", (req, res) => {
  try { res.json(readFilesJson().files || []); } catch { res.json([]); }
});

router.get("/api/presentation-data", (req, res) => {
  const { file_name, language } = req.query;
  if (!file_name) return res.status(400).json({ error: "Missing file_name" });
  const safeName = path.basename(String(file_name));
  const filePath = path.join(UPLOADS_DIR, safeName, `content_${language}.txt`);
  if (!fs.existsSync(filePath)) return res.status(500).json({ error: `Could not find content in ${language}` });
  const blocks = fs.readFileSync(filePath, "utf-8").split("-------").map(b => b.trim()).filter(Boolean);
  let quizEnabled = true;
  const result    = {};
  let slideIndex  = 0;
  for (const block of blocks) {
    const m = block.match(/^quiz:(YES|NO)$/i);
    if (m) { quizEnabled = m[1].toUpperCase() === "YES"; continue; }
    slideIndex++;
    const lines = block.split("\n").map(l => l.trim()).filter(Boolean);
    result[slideIndex.toString()] = [
      lines.filter(l => !l.startsWith("image:")),
      (lines.find(l => l.startsWith("image:")) || "").replace("image:", "").trim(),
    ];
  }
  res.json({ slides: result, quizEnabled });
});

// ── Import ────────────────────────────────────────────────────────────────────
router.post("/api/presentations/import",
  requireAuth, requireContributor,
  upload.fields([{ name: "pptx", maxCount: 1 }]),
  async (req, res) => {
    const { name, description, language } = req.body;
    if (!name?.trim())          return res.status(400).json({ error: "Name is required" });
    if (!req.files?.pptx?.[0]) return res.status(400).json({ error: "PPTX file is required" });
    const safeName = name.trim();
    const outDir   = path.join(UPLOADS_DIR, safeName);
    fs.mkdirSync(outDir, { recursive: true });
    try {
      const longLang       = language || "english";
      const { images, notes } = await pptxImport(req.files.pptx[0].buffer, outDir);
      fs.writeFileSync(path.join(outDir, `content_${longLang}.txt`), buildContentFile(notes, images), "utf-8");
      const filesData = readFilesJson();
      filesData.files = filesData.files.filter(f => f.name !== safeName);
      filesData.files.push({ name: safeName, description: description?.trim() || "", language: longLang, createdBy: req.session.user.id });
      writeFilesJson(filesData);
      res.json({ ok: true, slides: images.length, notes: notes.filter(Boolean).length, images, name: safeName, language: longLang });
    } catch (e) {
      console.error("Import error:", e);
      res.status(500).json({ error: "Import failed: " + e.message });
    }
  }
);

// ── Notes ─────────────────────────────────────────────────────────────────────
router.patch("/api/presentations/:name/notes", requireAuth, requireContributor, express.json(), async (req, res) => {
  const { name } = req.params;
  const { notes, language } = req.body;
  if (!Array.isArray(notes) || !language) return res.status(400).json({ error: "notes[] and language required" });
  const contentPath = path.join(UPLOADS_DIR, name, `content_${language}.txt`);
  if (!fs.existsSync(contentPath)) return res.status(404).json({ error: "Content file not found" });
  const blocks    = fs.readFileSync(contentPath, "utf-8").split("\n-------\n");
  const quizBlock = blocks[blocks.length - 1];
  const rebuilt   = blocks.slice(0, -1).map((block, i) => {
    const lines = block.split("\n").filter(l => l.startsWith("image:") || l.startsWith("quiz:"));
    if (notes[i]) lines.unshift(notes[i]);
    return lines.join("\n");
  });
  fs.writeFileSync(contentPath, rebuilt.join("\n-------\n") + "\n-------\n" + quizBlock, "utf-8");
  res.json({ ok: true });
});

// ── Quiz ──────────────────────────────────────────────────────────────────────
router.post("/api/quiz/send-results", express.json(), async (req, res) => {
  const { to, subject, text } = req.body;
  if (!to || !subject || !text) return res.status(400).json({ error: "to, subject, text required" });
  console.log(`── Quiz results email → ${to}`);
  try {
    await transporter.sendMail({ from: SMTP_FROM, to, subject, text });
    console.log(`✓ Quiz results email sent to ${to}`);
    res.json({ ok: true });
  } catch (e) {
    console.error(`✗ Quiz results email FAILED (to: ${to}):`, e.message);
    res.status(500).json({ error: "Failed to send email: " + e.message });
  }
});

router.post("/api/presentations/:name/quiz", requireAuth, requireContributor, express.json(), (req, res) => {
  const { name } = req.params;
  const { questions, sendto } = req.body;
  if (!Array.isArray(questions)) return res.status(400).json({ error: "questions[] required" });
  const presDir = path.join(UPLOADS_DIR, name);
  if (!fs.existsSync(presDir)) return res.status(404).json({ error: "Presentation not found" });
  fs.writeFileSync(path.join(presDir, "question.json"), JSON.stringify({ sendto: sendto || "", questions }, null, 2), "utf-8");
  for (const file of fs.readdirSync(presDir)) {
    if (/^content_.+\.txt$/.test(file)) {
      const p = path.join(presDir, file);
      fs.writeFileSync(p, fs.readFileSync(p, "utf-8").replace(/quiz:NO\s*$/, "quiz:YES"), "utf-8");
    }
  }
  res.json({ ok: true });
});

router.patch("/api/presentations/:name/quiz/sendto", requireAuth, requireContributor, express.json(), (req, res) => {
  const name = decodeURIComponent(req.params.name);
  const { sendto } = req.body;
  if (sendto === undefined) return res.status(400).json({ error: "sendto required" });
  const qPath = path.join(UPLOADS_DIR, name, "question.json");
  if (!fs.existsSync(qPath)) return res.status(404).json({ error: "No quiz for this presentation" });
  try {
    const data = JSON.parse(fs.readFileSync(qPath, "utf-8"));
    data.sendto = sendto;
    fs.writeFileSync(qPath, JSON.stringify(data, null, 2));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Management ────────────────────────────────────────────────────────────────
router.get("/api/my-presentations", requireAuth, (req, res) => {
  try {
    const all = readFilesJson().files ?? [];
    if (req.session.user.role === "admin") return res.json(all);
    return res.json(all.filter(f => f.createdBy === req.session.user.id));
  } catch { res.json([]); }
});

router.patch("/api/presentations/:name/metadata", requireAuth, requireContributor, express.json(), (req, res) => {
  const oldName = decodeURIComponent(req.params.name);
  const { name: newName, description } = req.body;
  try {
    const filesData = readFilesJson();
    const idx = filesData.files.findIndex(f => f.name === oldName);
    if (idx === -1) return res.status(404).json({ error: "Presentation not found" });
    const entry = filesData.files[idx];
    if (req.session.user.role !== "admin" && entry.createdBy !== req.session.user.id) return res.status(403).json({ error: "Not authorized" });
    const safeName = (newName ?? oldName).trim();
    if (safeName !== oldName) {
      const oldDir = path.join(UPLOADS_DIR, oldName);
      const newDir = path.join(UPLOADS_DIR, safeName);
      if (fs.existsSync(oldDir)) fs.renameSync(oldDir, newDir);
    }
    filesData.files[idx] = { ...entry, name: safeName, description: description ?? entry.description };
    writeFilesJson(filesData);
    res.json({ ok: true, name: safeName });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/api/presentations/:name/language", requireAuth, requireContributor, express.json(), (req, res) => {
  const name = decodeURIComponent(req.params.name);
  const { lang } = req.body;
  if (!lang) return res.status(400).json({ error: "lang required" });
  try {
    const filesData = readFilesJson();
    const entry = filesData.files.find(f => f.name === name);
    if (!entry) return res.status(404).json({ error: "Presentation not found" });
    if (req.session.user.role !== "admin" && entry.createdBy !== req.session.user.id) return res.status(403).json({ error: "Not authorized" });
    const langs = entry.language.split(",").map(l => l.trim()).filter(Boolean);
    if (!langs.includes(lang)) { langs.push(lang); entry.language = langs.join(", "); }
    writeFilesJson(filesData);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put("/api/presentations/:name/content/:lang", requireAuth, requireContributor, express.json(), (req, res) => {
  const name = decodeURIComponent(req.params.name);
  const { lang } = req.params;
  const { content } = req.body;
  if (typeof content !== "string") return res.status(400).json({ error: "content string required" });
  const presDir = path.join(UPLOADS_DIR, name);
  if (!fs.existsSync(presDir)) return res.status(404).json({ error: "Presentation not found" });
  const entry = readFilesJson().files.find(f => f.name === name);
  if (entry && req.session.user.role !== "admin" && entry.createdBy !== req.session.user.id) return res.status(403).json({ error: "Not authorized" });
  try {
    fs.writeFileSync(path.join(presDir, `content_${lang}.txt`), content, "utf-8");
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put("/api/presentations/:name/quiz/:lang", requireAuth, requireContributor, express.json(), (req, res) => {
  const name = decodeURIComponent(req.params.name);
  const { lang } = req.params;
  const presDir = path.join(UPLOADS_DIR, name);
  if (!fs.existsSync(presDir)) return res.status(404).json({ error: "Presentation not found" });
  const entry = readFilesJson().files.find(f => f.name === name);
  if (entry && req.session.user.role !== "admin" && entry.createdBy !== req.session.user.id) return res.status(403).json({ error: "Not authorized" });
  try {
    const fileName = lang === "default" ? "question.json" : `question_${lang}.json`;
    fs.writeFileSync(path.join(presDir, fileName), JSON.stringify(req.body, null, 2), "utf-8");
    for (const file of fs.readdirSync(presDir)) {
      if (/^content_.+\.txt$/.test(file)) {
        const p = path.join(presDir, file);
        fs.writeFileSync(p, fs.readFileSync(p, "utf-8").replace(/quiz:NO\s*$/, "quiz:YES"), "utf-8");
      }
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete("/api/presentations/:name", requireAuth, requireContributor, async (req, res) => {
  const name = decodeURIComponent(req.params.name);
  const presDir = path.join(UPLOADS_DIR, name);
  const filesData = readFilesJson();
  const entry = filesData.files.find(f => f.name === name);
  if (!entry) return res.status(404).json({ error: "Not found in registry" });
  if (req.session.user.role !== "admin" && entry.createdBy !== req.session.user.id) return res.status(403).json({ error: "Not authorized" });
  try {
    if (fs.existsSync(presDir)) fs.rmSync(presDir, { recursive: true, force: true });
    filesData.files = filesData.files.filter(f => f.name !== name);
    writeFilesJson(filesData);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete("/api/presentations/:name/language/:lang", requireAuth, requireContributor, async (req, res) => {
  const name = decodeURIComponent(req.params.name);
  const lang = req.params.lang;
  const presDir = path.join(UPLOADS_DIR, name);
  if (!fs.existsSync(presDir)) return res.status(404).json({ error: "Presentation not found" });
  const filesData = readFilesJson();
  const entry = filesData.files.find(f => f.name === name);
  if (!entry) return res.status(404).json({ error: "Not found in registry" });
  if (req.session.user.role !== "admin" && entry.createdBy !== req.session.user.id) return res.status(403).json({ error: "Not authorized" });
  const langs = entry.language.split(",").map(l => l.trim()).filter(Boolean);
  if (langs[0] === lang) return res.status(400).json({ error: "Cannot remove primary language" });
  try {
    for (const f of [`content_${lang}.txt`, `question_${lang}.json`]) {
      const p = path.join(presDir, f);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
    entry.language = langs.filter(l => l !== lang).join(", ");
    writeFilesJson(filesData);
    res.json({ ok: true, language: entry.language });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── SCORM Export ──────────────────────────────────────────────────────────────

const TTS_VOICES_SCORM = {
  english:    { lang: "en-GB",  voice: "en-GB-Standard-B",  rate: 1.0 },
  french:     { lang: "fr-FR",  voice: "fr-FR-Standard-B",  rate: 1.0 },
  spanish:    { lang: "es-ES",  voice: "es-ES-Standard-B",  rate: 1.0 },
  portuguese: { lang: "pt-PT",  voice: "pt-PT-Standard-B",  rate: 1.0 },
  arabic:     { lang: "ar-XA",  voice: "ar-XA-Wavenet-C",   rate: 1.0 },
  japanese:   { lang: "ja-JP",  voice: "ja-JP-Standard-C",  rate: 1.3 },
  chinese:    { lang: "cmn-CN", voice: "cmn-CN-Wavenet-B",  rate: 1.0 },
  russian:    { lang: "ru-RU",  voice: "ru-RU-Standard-B",  rate: 1.0 },
};

router.get("/api/presentations/:name/export-scorm", requireAuth, async (req, res) => {
  const name        = decodeURIComponent(req.params.name);
  const lang        = String(req.query.lang || "english").toLowerCase();
  const autoAdvance = req.query.autoAdvance === "1";
  const TTS_KEY     = process.env.TTS_API_KEY;
  if (!TTS_KEY) return res.status(500).json({ error: "TTS_API_KEY not configured on the server" });

  const presDir     = path.join(UPLOADS_DIR, name);
  const contentPath = path.join(presDir, `content_${lang}.txt`);
  if (!fs.existsSync(contentPath)) return res.status(404).json({ error: `No content for language: ${lang}` });

  // Parse slides
  const blocks    = fs.readFileSync(contentPath, "utf-8").split("-------").map(b => b.trim()).filter(Boolean);
  const rawSlides = [];
  let quizEnabled = false;
  for (const block of blocks) {
    const m = block.match(/^quiz:(YES|NO)$/i);
    if (m) { quizEnabled = m[1].toUpperCase() === "YES"; continue; }
    const lines     = block.split("\n").map(l => l.trim()).filter(Boolean);
    const textLines = lines.filter(l => !l.startsWith("image:"));
    const image     = (lines.find(l => l.startsWith("image:")) || "").replace("image:", "").trim();
    rawSlides.push({ text: textLines.join("\n"), image });
  }

  // Read quiz
  let quiz = null;
  if (quizEnabled) {
    const entry       = readFilesJson().files.find(f => f.name === name);
    const primaryLang = entry?.language.split(",")[0].trim();
    const qFiles      = lang === primaryLang ? ["question.json"] : [`question_${lang}.json`, "question.json"];
    for (const qf of qFiles) {
      const qp = path.join(presDir, qf);
      if (fs.existsSync(qp)) { quiz = JSON.parse(fs.readFileSync(qp, "utf-8")); break; }
    }
  }

  // Generate MP3 audio for each slide via Google TTS
  const voice        = TTS_VOICES_SCORM[lang] || TTS_VOICES_SCORM.english;
  const audioBuffers = [];
  for (const slide of rawSlides) {
    const ttsText = slide.text.replace(/\n/g, " ").trim();
    if (!ttsText) { audioBuffers.push(null); continue; }
    try {
      const r    = await fetch(`https://texttospeech.googleapis.com/v1beta1/text:synthesize?key=${TTS_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input:       { text: ttsText },
          voice:       { languageCode: voice.lang, name: voice.voice },
          audioConfig: { audioEncoding: "MP3", speakingRate: voice.rate },
        }),
      });
      const data = await r.json();
      audioBuffers.push(data.audioContent ? Buffer.from(data.audioContent, "base64") : null);
    } catch { audioBuffers.push(null); }
  }

  // Build ZIP
  const zip       = new JSZip();
  const slideData = rawSlides.map((s, i) => ({
    text:  s.text,
    image: s.image ? `images/${s.image}` : null,
    audio: audioBuffers[i] ? `audio/slide_${String(i + 1).padStart(2, "0")}.mp3` : null,
  }));

  for (let i = 0; i < rawSlides.length; i++) {
    if (audioBuffers[i])   zip.file(`audio/slide_${String(i + 1).padStart(2, "0")}.mp3`, audioBuffers[i]);
    if (rawSlides[i].image) {
      const imgPath = path.join(presDir, rawSlides[i].image);
      if (fs.existsSync(imgPath)) zip.file(`images/${rawSlides[i].image}`, fs.readFileSync(imgPath));
    }
  }

  zip.file("scorm.js",        buildScormJs());
  zip.file("index.html",      buildScormHtml(name, slideData, quiz?.questions || null, autoAdvance));
  zip.file("imsmanifest.xml", buildScormManifest(name, rawSlides, audioBuffers));

  const buf      = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  const safeName = name.replace(/[^\w-]/g, "_");
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${safeName}_${lang}.zip"`);
  res.send(buf);
});

function buildScormJs() {
  return `(function(){
  var api=null;
  function find(w){var t=0;while(w.API==null&&w.parent&&w.parent!==w&&t++<10)w=w.parent;return w.API||null;}
  window.addEventListener('load',function(){try{api=find(window);if(api){api.LMSInitialize('');api.LMSSetValue('cmi.core.lesson_status','incomplete');api.LMSCommit('');}}catch(e){}});
  window.scormFinish=function(score){try{if(!api)return;if(score!=null){api.LMSSetValue('cmi.core.score.raw',String(Math.round(score)));api.LMSSetValue('cmi.core.score.min','0');api.LMSSetValue('cmi.core.score.max','100');api.LMSSetValue('cmi.core.lesson_status',score>=70?'passed':'failed');}else{api.LMSSetValue('cmi.core.lesson_status','completed');}api.LMSCommit('');api.LMSFinish('');}catch(e){}};
  window.addEventListener('beforeunload',function(){try{if(api)api.LMSFinish('');}catch(e){}});
})();`;
}

function buildScormManifest(name, rawSlides, audioBuffers) {
  const safeId = name.replace(/[^a-zA-Z0-9]/g, "_");
  const files  = ['<file href="index.html"/>', '<file href="scorm.js"/>'];
  rawSlides.forEach((s, i) => {
    if (audioBuffers[i]) files.push(`<file href="audio/slide_${String(i + 1).padStart(2, "0")}.mp3"/>`);
    if (s.image)         files.push(`<file href="images/${s.image}"/>`);
  });
  const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="AVATAR_${safeId}" version="1.0"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd
                      http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">
  <metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata>
  <organizations default="ORG-1">
    <organization identifier="ORG-1">
      <title>${esc(name)}</title>
      <item identifier="ITEM-1" identifierref="RES-1"><title>${esc(name)}</title></item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="RES-1" type="webcontent" adlcp:scormtype="sco" href="index.html">
      ${files.join("\n      ")}
    </resource>
  </resources>
</manifest>`;
}

function buildScormHtml(presName, slides, questions, autoAdvance = false) {
  const esc       = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const safeTitle = esc(presName);
  // Escape </script> inside embedded JSON to prevent HTML parser from closing the tag early
  const slidesJson = JSON.stringify(slides).replace(/<\/script>/gi, "<\\/script>");
  const quizJson   = questions ? JSON.stringify(questions).replace(/<\/script>/gi, "<\\/script>") : "null";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${safeTitle}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Inter,system-ui,Arial,sans-serif;background:#0f172a;color:#f1f5f9;height:100vh;display:flex;flex-direction:column;overflow:hidden}
header{background:#1e293b;border-bottom:1px solid #334155;padding:10px 20px;display:flex;align-items:center;gap:12px;flex-shrink:0}
.logo{font-size:13px;font-weight:700;color:#60a5fa;letter-spacing:1px;flex-shrink:0}
.pres-title{font-size:13px;color:#94a3b8;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.counter{font-size:12px;color:#64748b;flex-shrink:0}
.prog-bar{height:3px;background:#1e293b;flex-shrink:0}
.prog-fill{height:100%;background:#3b82f6;transition:width .3s}
main{flex:1;overflow:hidden;display:flex}
#slide-view,#quiz-view,#done-view{width:100%;display:flex;flex-direction:column}
/* Slides */
.slide-body{flex:1;display:flex;align-items:stretch;overflow:hidden;gap:0}
.slide-img-col{flex:0 0 58%;display:flex;align-items:center;justify-content:center;overflow:hidden;background:#111827;padding:16px}
.slide-img-col img{max-width:100%;max-height:100%;object-fit:contain;border-radius:6px}
.slide-txt-col{flex:1;overflow-y:auto;padding:24px 20px;display:flex;align-items:center}
.slide-txt{font-size:15px;line-height:1.75;color:#e2e8f0}
.slide-txt p{margin-bottom:.6em}
.slide-txt p:last-child{margin-bottom:0}
.no-image .slide-body{justify-content:center}
.no-image .slide-txt-col{max-width:700px;margin:auto;padding:40px}
.slide-body.hide-text .slide-txt-col{display:none}
.slide-body.hide-text .slide-img-col{flex:1;max-width:100%}
.btn-txt{background:#334155;color:#94a3b8;border:none;border-radius:6px;padding:7px 14px;font-size:13px;cursor:pointer;transition:all .15s}
.btn-txt.off{opacity:.4}.btn-txt:hover{background:#475569;color:#f1f5f9}
#start-overlay{position:fixed;inset:0;background:rgba(15,23,42,.75);display:flex;align-items:center;justify-content:center;z-index:999;cursor:pointer}
.start-btn{background:#3b82f6;color:#fff;border:none;border-radius:10px;padding:18px 40px;font-size:20px;font-weight:600;cursor:pointer;box-shadow:0 4px 24px rgba(59,130,246,.4)}
.btn-pp{background:#334155;color:#f1f5f9;border:none;border-radius:6px;padding:7px 14px;font-size:13px;cursor:pointer;transition:background .15s;min-width:90px}
.btn-pp:hover{background:#475569}
/* Nav */
.nav{background:#1e293b;border-top:1px solid #334155;padding:10px 20px;display:flex;align-items:center;gap:10px;flex-shrink:0}
.btn{padding:7px 18px;border-radius:6px;border:none;font-size:13px;font-weight:500;cursor:pointer;transition:background .15s}
.btn-p{background:#3b82f6;color:#fff}.btn-p:hover:not(:disabled){background:#2563eb}.btn-p:disabled{opacity:.4;cursor:default}
.btn-s{background:#334155;color:#94a3b8}.btn-s:hover{background:#475569;color:#f1f5f9}
.btn-g{background:none;border:none;color:#64748b;font-size:12px;cursor:pointer;padding:4px 8px}.btn-g:hover{color:#94a3b8}
.spacer{flex:1}
.aud-ind{font-size:12px;color:#64748b;display:flex;align-items:center;gap:5px}
.aud-dot{width:7px;height:7px;border-radius:50%;background:#3b82f6;animation:pulse 1s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
/* Quiz */
.quiz-body{flex:1;overflow-y:auto;padding:32px;max-width:700px;margin:0 auto;width:100%}
.q-num{font-size:12px;color:#64748b;margin-bottom:6px}
.q-text{font-size:18px;font-weight:600;color:#f1f5f9;margin-bottom:20px;line-height:1.45}
.opts{display:flex;flex-direction:column;gap:8px}
.opt{display:flex;align-items:flex-start;gap:10px;padding:12px 14px;border-radius:8px;border:1.5px solid #334155;cursor:pointer;transition:all .15s;background:#1e293b;user-select:none}
.opt:hover{border-color:#3b82f6;background:#1e3a5f}
.opt.sel{border-color:#3b82f6;background:#1e3a5f}
.opt.ok{border-color:#22c55e;background:#14532d;cursor:default}
.opt.bad{border-color:#ef4444;background:#450a0a;cursor:default}
.opt.missed{border-color:#22c55e;background:#14532d;opacity:.65;cursor:default}
.opt-mark{width:18px;height:18px;border-radius:50%;border:2px solid #475569;flex-shrink:0;margin-top:1px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700}
.opt-mark.sel{border-color:#3b82f6;background:#3b82f6}
.opt-mark.ok{border-color:#22c55e;background:#22c55e}
.opt-mark.bad{border-color:#ef4444;background:#ef4444}
.opt-lbl{font-size:14px;color:#e2e8f0}
/* Done */
.done-body{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px;text-align:center}
.done-icon{font-size:56px;margin-bottom:20px}
.done-title{font-size:26px;font-weight:700;margin-bottom:10px}
.done-sub{font-size:16px;color:#94a3b8}
</style>
</head>
<body>
<header>
  <div class="logo">HORIBA</div>
  <div class="pres-title">${safeTitle}</div>
  <div class="counter" id="ctr"></div>
</header>
<div class="prog-bar"><div class="prog-fill" id="prog" style="width:0%"></div></div>
<main>
  <div id="slide-view">
    <div class="slide-body" id="slide-body"></div>
    <div class="nav">
      <button class="btn btn-s" id="sprev" onclick="prevSlide()">&#8592; Previous</button>
      <button class="btn-pp" id="spp" onclick="togglePlayPause()" style="display:none">⏸ Pause</button>
      <button class="btn-g" id="sskip" onclick="skipAudio()" style="display:none">Skip</button>
      <div class="spacer"></div>
      <button class="btn-txt" id="txt-toggle" onclick="toggleText()">&#128196; Text</button>
      <button class="btn btn-p" id="snext" onclick="nextSlide()">Next &#8594;</button>
    </div>
  </div>
  <div id="quiz-view" style="display:none;flex-direction:column">
    <div class="quiz-body" id="quiz-body"></div>
    <div class="nav">
      <button class="btn btn-s" id="qprev" onclick="prevQ()">&#8592; Previous</button>
      <div class="spacer"></div>
      <button class="btn btn-p" id="qnext">Next &#8594;</button>
    </div>
  </div>
  <div id="done-view" style="display:none;flex-direction:column">
    <div class="done-body" id="done-body"></div>
  </div>
</main>
<audio id="aud" style="display:none"></audio>
<div id="start-overlay" style="display:none" onclick="dismissOverlay()">
  <button class="start-btn">&#9654; Click to start</button>
</div>
<script src="scorm.js"></script>
<script>
var SLIDES=${slidesJson};
var QUIZ=${quizJson};
var cur=0,audioOk=false,answers=[],validated=[],qi=0,textVisible=true;

function dismissOverlay(){
  var overlay=document.getElementById('start-overlay');
  overlay.style.display='none';
  var a=document.getElementById('aud');
  if(overlay._pending&&a.src){
    a.play().then(function(){document.getElementById('spp').style.display='';document.getElementById('spp').textContent='⏸ Pause';}).catch(function(){audioOk=true;document.getElementById('snext').disabled=false;});
  }
}

function toggleText(){
  textVisible=!textVisible;
  document.getElementById('slide-body').classList.toggle('hide-text',!textVisible);
  var btn=document.getElementById('txt-toggle');
  btn.classList.toggle('off',!textVisible);
  btn.title=textVisible?'Hide narration text':'Show narration text';
}

function h(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

function setProgress(pct){document.getElementById('prog').style.width=pct+'%';}

function showSlide(){
  var s=SLIDES[cur],tot=SLIDES.length;
  document.getElementById('ctr').textContent='Slide '+(cur+1)+' / '+tot;
  setProgress(((cur+1)/tot)*(QUIZ?80:100));

  var hasImg=!!s.image,hasTxt=!!s.text;
  var body=document.getElementById('slide-body');
  body.className='slide-body'+(hasImg?'':' no-image')+(textVisible?'':' hide-text');
  var html='';
  if(hasImg) html+='<div class="slide-img-col"><img src="'+h(s.image)+'" alt="Slide '+(cur+1)+'"></div>';
  if(hasTxt) html+='<div class="slide-txt-col"><div class="slide-txt"><p>'+h(s.text).replace(/\\n/g,'</p><p>')+'</p></div></div>';
  body.innerHTML=html;

  document.getElementById('sprev').disabled=(cur===0);
  audioOk=!s.audio;
  var isLast=(cur===SLIDES.length-1);
  document.getElementById('snext').disabled=(!audioOk&&isLast);
  document.getElementById('snext').textContent=isLast&&QUIZ?'Start Quiz ➤':(isLast?'Finish':'Next →');
  document.getElementById('sskip').style.display=s.audio?'':'none';
  document.getElementById('spp').style.display=s.audio?'':'none';
  document.getElementById('spp').textContent='⏸ Pause';

  if(s.audio){
    var a=document.getElementById('aud');
    a.src=s.audio;
    a.onended=function(){audioOk=true;document.getElementById('spp').style.display='none';document.getElementById('sskip').style.display='none';document.getElementById('snext').disabled=false;${autoAdvance ? "setTimeout(nextSlide,800);" : ""}};
    a.onerror=function(){audioOk=true;document.getElementById('spp').style.display='none';document.getElementById('sskip').style.display='none';document.getElementById('snext').disabled=false;};
    a.play().then(function(){}).catch(function(){
      document.getElementById('spp').style.display='none';
      var overlay=document.getElementById('start-overlay');
      if(overlay){overlay.style.display='flex';overlay._pending=true;}
      else{audioOk=true;document.getElementById('snext').disabled=false;}
    });
  }
}

function togglePlayPause(){
  var a=document.getElementById('aud'),btn=document.getElementById('spp');
  if(a.paused){a.play();btn.textContent='⏸ Pause';}
  else{a.pause();btn.textContent='▶ Resume';}
}

function skipAudio(){
  var a=document.getElementById('aud');a.pause();
  audioOk=true;
  document.getElementById('spp').style.display='none';
  document.getElementById('sskip').style.display='none';
  document.getElementById('snext').disabled=false;
}
function prevSlide(){if(cur>0){stopAud();cur--;showSlide();}}
function nextSlide(){
  stopAud();
  if(cur<SLIDES.length-1){cur++;showSlide();}
  else if(QUIZ){startQuiz();}
  else{showDone(null);}
}
function stopAud(){var a=document.getElementById('aud');a.pause();a.src='';}

function startQuiz(){
  document.getElementById('slide-view').style.display='none';
  document.getElementById('quiz-view').style.display='flex';
  answers=QUIZ.map(function(){return[];});
  validated=QUIZ.map(function(){return false;});
  qi=0;showQ();
}

function showQ(){
  var q=QUIZ[qi],tot=QUIZ.length,sel=answers[qi],done=validated[qi];
  document.getElementById('ctr').textContent='Question '+(qi+1)+' / '+tot;
  setProgress(80+((qi+1)/tot)*20);

  var html='<div class="q-num">Question '+(qi+1)+' of '+tot+'</div>';
  html+='<div class="q-text">'+h(q.question)+'</div><div class="opts">';
  q.choices.forEach(function(c,ci){
    var isSel=sel.indexOf(ci)>=0,isCorr=q.correctAnswers.indexOf(ci)>=0;
    var cls='opt',mc='opt-mark',mk='';
    if(done){
      if(isSel&&isCorr){cls+=' ok';mc+=' ok';mk='&#10003;';}
      else if(isSel&&!isCorr){cls+=' bad';mc+=' bad';mk='&#10007;';}
      else if(!isSel&&isCorr){cls+=' missed';mc+=' ok';mk='&#10003;';}
    } else if(isSel){cls+=' sel';mc+=' sel';mk='&#9679;';}
    html+='<div class="'+cls+'" onclick="pickOpt('+ci+')"><div class="'+mc+'">'+mk+'</div><div class="opt-lbl">'+h(c)+'</div></div>';
  });
  html+='</div>';
  document.getElementById('quiz-body').innerHTML=html;

  document.getElementById('qprev').disabled=(qi===0);
  var nb=document.getElementById('qnext');
  var isLast=(qi===QUIZ.length-1);
  if(done&&isLast){nb.textContent='Finish';nb.onclick=finishQuiz;}
  else if(done){nb.textContent='Next →';nb.onclick=nextQ;}
  else if(q.type==='multiple'){nb.textContent='Validate';nb.onclick=validateQ;}
  else{nb.textContent='Next →';nb.onclick=nextQ;nb.disabled=sel.length===0;}
}

function pickOpt(ci){
  if(validated[qi])return;
  var q=QUIZ[qi],sel=answers[qi];
  if(q.type==='single'){
    answers[qi]=[ci];
    validateQ();
  } else {
    var idx=sel.indexOf(ci);
    if(idx>=0)sel.splice(idx,1);else sel.push(ci);
    showQ();
  }
}
function validateQ(){validated[qi]=true;showQ();}
function prevQ(){if(qi>0){qi--;showQ();}}
function nextQ(){if(!validated[qi])validateQ();if(qi<QUIZ.length-1){qi++;showQ();}else finishQuiz();}

function finishQuiz(){
  var correct=0;
  QUIZ.forEach(function(q,i){
    var sel=answers[i];
    if(q.correctAnswers.length===sel.length&&q.correctAnswers.every(function(a){return sel.indexOf(a)>=0;}))correct++;
  });
  showDone(Math.round(correct/QUIZ.length*100),correct,QUIZ.length);
}

function showDone(score,correct,total){
  document.getElementById('slide-view').style.display='none';
  document.getElementById('quiz-view').style.display='none';
  document.getElementById('done-view').style.display='flex';
  setProgress(100);
  document.getElementById('ctr').textContent='';
  var icon,title,sub;
  if(score===null){icon='&#9989;';title='Presentation Complete';sub='Thank you for watching.';}
  else if(score>=70){icon='&#127942;';title='Well done!';sub='Score: '+score+'% ('+correct+' / '+total+' correct)';}
  else{icon='&#128218;';title='Keep practising!';sub='Score: '+score+'% ('+correct+' / '+total+' correct)';}
  document.getElementById('done-body').innerHTML='<div class="done-icon">'+icon+'</div><div class="done-title">'+title+'</div><div class="done-sub">'+sub+'</div>';
  if(typeof scormFinish==='function')scormFinish(score);
}

showSlide();
</script>
</body>
</html>`;
}
