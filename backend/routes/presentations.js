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
router.post("/api/quiz/send-results", requireAuth, express.json(), async (req, res) => {
  const { to, subject, text } = req.body;
  if (!to || !subject || !text) return res.status(400).json({ error: "to, subject, text required" });
  try {
    await transporter.sendMail({ from: SMTP_FROM, to, subject, text });
    res.json({ ok: true });
  } catch (e) {
    console.error("Quiz results mail error:", e.message);
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
