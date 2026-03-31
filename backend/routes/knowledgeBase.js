/**
 * routes/knowledgeBase.js — Graph RAG knowledge base endpoints
 */
import express from "express";
import multer from "multer";
import { requireAuth, requireAdmin } from "../shared.js";
import { ingestDocument, searchKnowledgeBase, translateChunks, listDocuments, deleteDocument, getDriver } from "../kb.js";

export const router = express.Router();

const kbUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.post("/api/knowledge-base/upload", requireAuth, requireAdmin, kbUpload.single("pdf"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "PDF file required" });
  try {
    const filename = Buffer.from(req.file.originalname, "latin1").toString("utf8");
    const documentDate = req.body.documentDate?.trim() || null;
    const result = await ingestDocument({ buffer: req.file.buffer, filename, uploadedBy: req.session.user.id, documentDate });
    res.json({ ok: true, ...result });
  } catch (e) {
    console.error("[KB] Ingest error:", e);
    res.status(500).json({ error: e.message });
  }
});

router.get("/api/knowledge-base/documents", requireAuth, async (_req, res) => {
  try { res.json(await listDocuments()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete("/api/knowledge-base/documents/:id", requireAuth, requireAdmin, async (req, res) => {
  try { await deleteDocument(req.params.id); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete("/api/knowledge-base/reset", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const session = getDriver().session();
    try {
      await session.run("MATCH (n:KBDocument)-[:HAS_CHUNK]->(c:KBChunk) DETACH DELETE c");
      await session.run("MATCH (e:KBEntity) WHERE NOT (()-[:MENTIONS]->(e)) DETACH DELETE e");
      await session.run("MATCH (d:KBDocument) DETACH DELETE d");
    } finally { await session.close(); }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/api/knowledge-base/search", requireAuth, express.json(), async (req, res) => {
  const { query, lang } = req.body;
  if (!query) return res.status(400).json({ error: "query required" });
  try {
    const results    = await searchKnowledgeBase(query);
    const translated = await translateChunks(results, lang ?? "fr");
    const chunks  = translated.map(c => c.text);
    const seen    = new Map();
    for (const c of translated) {
      if (c.filename && !seen.has(c.filename)) seen.set(c.filename, c.documentDate ?? null);
    }
    const sources = [...seen.entries()].map(([filename, documentDate]) => ({ filename, documentDate }));
    res.json({ chunks, sources });
  } catch (e) {
    console.error("[KB] Search error:", e);
    res.json({ chunks: [] });
  }
});
