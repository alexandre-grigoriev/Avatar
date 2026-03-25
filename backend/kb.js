/**
 * kb.js — Graph RAG knowledge base service
 *
 * Strategy:
 *  - Documents stored in French (primary HR language)
 *  - Each chunk is LLM-enriched (self-contained, pronouns resolved) + entity-extracted in ONE Gemini call
 *  - Embeddings computed on enriched text (text-embedding-004, 768 dims, multilingual)
 *  - At query time: 4 parallel retrieval strategies merged + scored
 *  - Retrieved French chunks translated on-the-fly to user language before Gemini chat
 */

import neo4j from "neo4j-driver";
import pdfParse from "pdf-parse";
import crypto from "crypto";

const GEMINI_KEY  = process.env.GEMINI_API_KEY;
const EMBED_URL   = "https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent";
const GEMINI_URL  = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

// ── Neo4j connection ───────────────────────────────────────────────────────────

let _driver = null;

export function getDriver() {
  if (!_driver) {
    if (!process.env.NEO4J_URI) throw new Error("NEO4J_URI not configured");
    _driver = neo4j.driver(
      process.env.NEO4J_URI,
      neo4j.auth.basic(
        process.env.NEO4J_USER     || "neo4j",
        process.env.NEO4J_PASSWORD || "password"
      )
    );
  }
  return _driver;
}

export async function closeDriver() {
  if (_driver) { await _driver.close(); _driver = null; }
}

/** Run a Cypher query and return records */
async function cypher(query, params = {}) {
  const session = getDriver().session();
  try {
    const result = await session.run(query, params);
    return result.records;
  } finally {
    await session.close();
  }
}

// ── Neo4j schema init ──────────────────────────────────────────────────────────

export async function initKnowledgeBase() {
  try {
    // Constraints
    await cypher("CREATE CONSTRAINT kb_doc_id IF NOT EXISTS FOR (d:KBDocument) REQUIRE d.id IS UNIQUE");
    await cypher("CREATE CONSTRAINT kb_chunk_id IF NOT EXISTS FOR (c:KBChunk) REQUIRE c.id IS UNIQUE");
    await cypher("CREATE CONSTRAINT kb_entity_key IF NOT EXISTS FOR (e:KBEntity) REQUIRE e.key IS UNIQUE");

    // Vector indexes (Neo4j 5.x)
    await cypher(`
      CREATE VECTOR INDEX kb_chunk_embedding IF NOT EXISTS
      FOR (c:KBChunk) ON (c.embedding)
      OPTIONS { indexConfig: { \`vector.dimensions\`: 768, \`vector.similarity_function\`: 'cosine' } }
    `).catch(() => {}); // ignore if already exists with different config

    await cypher(`
      CREATE VECTOR INDEX kb_entity_embedding IF NOT EXISTS
      FOR (e:KBEntity) ON (e.embedding)
      OPTIONS { indexConfig: { \`vector.dimensions\`: 768, \`vector.similarity_function\`: 'cosine' } }
    `).catch(() => {});

    console.log("[KB] Neo4j schema ready");
  } catch (e) {
    console.error("[KB] Schema init error:", e.message);
  }
}

// ── Gemini helpers ─────────────────────────────────────────────────────────────

async function embed(text) {
  const res = await fetch(`${EMBED_URL}?key=${GEMINI_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "models/text-embedding-004", content: { parts: [{ text }] } }),
  });
  if (!res.ok) throw new Error(`Embedding error: ${res.status}`);
  const data = await res.json();
  return data.embedding.values; // float[768]
}

async function callGemini(prompt) {
  const res = await fetch(`${GEMINI_URL}?key=${GEMINI_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  if (!res.ok) throw new Error(`Gemini error: ${res.status}`);
  const data = await res.json();
  return data.candidates[0].content.parts[0].text;
}

// ── Text chunking ──────────────────────────────────────────────────────────────

const CHUNK_SIZE    = 500; // tokens ≈ chars/4, we use words as proxy
const CHUNK_OVERLAP = 50;

function chunkText(text) {
  const words  = text.split(/\s+/).filter(Boolean);
  const chunks = [];
  let i = 0;
  while (i < words.length) {
    chunks.push(words.slice(i, i + CHUNK_SIZE).join(" "));
    i += CHUNK_SIZE - CHUNK_OVERLAP;
  }
  return chunks;
}

// ── LLM enrichment + entity extraction (single Gemini call per chunk) ──────────

async function enrichChunk(rawChunk, docSummary, prevChunk, index, total, filename) {
  const prompt = `Tu traites un extrait de document RH "${filename}".
Résumé du document : ${docSummary}
Extrait précédent : ${prevChunk || "(début du document)"}
Extrait ${index + 1}/${total} :
${rawChunk}

Effectue les deux tâches suivantes et réponds UNIQUEMENT avec du JSON valide, sans markdown :
{
  "enriched": "version réécrite, autonome et factuelle de l'extrait (résous tous les pronoms, rends les faits implicites explicites, ajoute le contexte du document en préfixe, conserve exactement les chiffres/dates/termes techniques)",
  "entities": [
    { "name": "nom en français", "key": "clé_canonique_anglais_snake_case", "type": "entitlement|obligation|contract_type|process|document|role|condition|organization|other", "description": "courte description en français" }
  ],
  "relations": [
    { "from": "clé_canonique", "relation": "requires|leads_to|part_of|applies_to|defines|replaces|references", "to": "clé_canonique" }
  ]
}`;

  try {
    const text = await callGemini(prompt);
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch (e) {
    console.warn(`[KB] Enrich chunk ${index} failed:`, e.message);
  }
  // Fallback: return raw chunk as enriched, no entities
  return { enriched: rawChunk, entities: [], relations: [] };
}

async function summarizeDocument(text, filename) {
  const sample = text.slice(0, 3000);
  const prompt = `Résume en 3 phrases ce document RH intitulé "${filename}". Réponds uniquement avec le résumé, sans introduction.\n\n${sample}`;
  try { return await callGemini(prompt); } catch { return ""; }
}

// ── Ingestion ──────────────────────────────────────────────────────────────────

export async function ingestDocument({ buffer, filename, uploadedBy }) {
  const docId = crypto.randomUUID();

  // 1. Extract text from PDF
  let fullText;
  try {
    const parsed = await pdfParse(buffer);
    fullText = parsed.text;
  } catch (e) {
    throw new Error(`PDF parse failed: ${e.message}`);
  }
  if (!fullText?.trim()) throw new Error("No text extracted from PDF");

  // 2. Detect language (assume french, check for english)
  const lang = /\b(the|and|is|are|this|that|with|for)\b/i.test(fullText.slice(0, 500)) ? "en" : "fr";

  // 3. Get document summary (used as context for enrichment)
  const summary = await summarizeDocument(fullText, filename);

  // 4. Chunk text
  const rawChunks = chunkText(fullText);

  // 5. Create Document node
  await cypher(`
    CREATE (d:KBDocument {
      id: $id, filename: $filename, lang: $lang,
      summary: $summary, uploadedBy: $uploadedBy,
      uploadedAt: datetime(), chunkCount: $chunkCount
    })
  `, { id: docId, filename, lang, summary, uploadedBy, chunkCount: rawChunks.length });

  // 6. Process chunks sequentially (to have prevChunk context)
  const chunkIds = [];
  for (let i = 0; i < rawChunks.length; i++) {
    const prevChunk = i > 0 ? rawChunks[i - 1].slice(-200) : null;
    const { enriched, entities, relations } = await enrichChunk(
      rawChunks[i], summary, prevChunk, i, rawChunks.length, filename
    );

    // Embed enriched text
    const embedding = await embed(enriched);
    const chunkId   = `${docId}_chunk_${i}`;
    chunkIds.push(chunkId);

    // Create Chunk node
    await cypher(`
      MATCH (d:KBDocument { id: $docId })
      CREATE (c:KBChunk {
        id: $chunkId, index: $index,
        text_original: $original,
        text_enriched: $enriched,
        embedding: $embedding
      })
      CREATE (d)-[:HAS_CHUNK]->(c)
    `, { docId, chunkId, index: i, original: rawChunks[i], enriched, embedding });

    // Link sequential chunks
    if (i > 0) {
      await cypher(`
        MATCH (prev:KBChunk { id: $prevId }), (curr:KBChunk { id: $currId })
        CREATE (prev)-[:NEXT]->(curr)
      `, { prevId: chunkIds[i - 1], currId: chunkId });
    }

    // Upsert entities + link to chunk
    for (const entity of entities) {
      if (!entity.key) continue;
      const entityEmbed = await embed(`${entity.name}: ${entity.description}`);
      await cypher(`
        MERGE (e:KBEntity { key: $key })
        ON CREATE SET e.name = $name, e.type = $type, e.description = $description, e.embedding = $embedding
        ON MATCH SET e.name = coalesce(e.name, $name)
        WITH e
        MATCH (c:KBChunk { id: $chunkId })
        MERGE (c)-[:MENTIONS]->(e)
      `, { key: entity.key, name: entity.name, type: entity.type, description: entity.description, embedding: entityEmbed, chunkId });
    }

    // Create relationships between entities
    for (const rel of relations) {
      if (!rel.from || !rel.to) continue;
      await cypher(`
        MATCH (a:KBEntity { key: $from }), (b:KBEntity { key: $to })
        MERGE (a)-[:RELATED_TO { relation: $relation }]->(b)
      `, { from: rel.from, to: rel.to, relation: rel.relation });
    }

    console.log(`[KB] Chunk ${i + 1}/${rawChunks.length} processed`);
  }

  return { docId, filename, lang, chunkCount: rawChunks.length, summary };
}

// ── Retrieval ──────────────────────────────────────────────────────────────────

export async function searchKnowledgeBase(query, topK = 6) {
  const queryEmbedding = await embed(query);

  // Run all 4 strategies in parallel
  const [s1, s2, s3] = await Promise.all([
    // Strategy 1: vector search on chunks
    cypher(`
      CALL db.index.vector.queryNodes('kb_chunk_embedding', $k, $emb)
      YIELD node AS c, score
      RETURN c.id AS id, c.text_original AS text, score, 'chunk_vector' AS strategy
    `, { k: topK, emb: queryEmbedding }).catch(() => []),

    // Strategy 2: vector search on entities → get their chunks
    cypher(`
      CALL db.index.vector.queryNodes('kb_entity_embedding', 5, $emb)
      YIELD node AS e, score
      MATCH (c:KBChunk)-[:MENTIONS]->(e)
      RETURN DISTINCT c.id AS id, c.text_original AS text, score * 0.9 AS score, 'entity_vector' AS strategy
    `, { emb: queryEmbedding }).catch(() => []),

    // Strategy 3: graph traversal — entities related to top entities
    cypher(`
      CALL db.index.vector.queryNodes('kb_entity_embedding', 3, $emb)
      YIELD node AS e
      MATCH (e)-[:RELATED_TO*1..2]-(related:KBEntity)
      MATCH (c:KBChunk)-[:MENTIONS]->(related)
      RETURN DISTINCT c.id AS id, c.text_original AS text, 0.6 AS score, 'graph_traversal' AS strategy
    `, { emb: queryEmbedding }).catch(() => []),
  ]);

  // Merge results, keep highest score per chunk id
  const scoreMap = new Map();
  for (const records of [s1, s2, s3]) {
    for (const r of records) {
      const id    = r.get("id");
      const score = r.get("score");
      const text  = r.get("text");
      if (!scoreMap.has(id) || scoreMap.get(id).score < score) {
        scoreMap.set(id, { id, text, score });
      }
    }
  }

  // Sort by score, take top-K
  const topChunks = [...scoreMap.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  // Strategy 4: expand with NEXT/PREV neighbors (sequential context)
  const expanded = new Map();
  for (const chunk of topChunks) {
    expanded.set(chunk.id, chunk);
    const neighbors = await cypher(`
      MATCH (c:KBChunk { id: $id })
      OPTIONAL MATCH (prev:KBChunk)-[:NEXT]->(c)
      OPTIONAL MATCH (c)-[:NEXT]->(next:KBChunk)
      RETURN prev.text_original AS prevText, next.text_original AS nextText
    `, { id: chunk.id }).catch(() => []);
    if (neighbors[0]) {
      const prev = neighbors[0].get("prevText");
      const next = neighbors[0].get("nextText");
      if (prev) expanded.set(`${chunk.id}_prev`, { text: prev, score: chunk.score * 0.7 });
      if (next) expanded.set(`${chunk.id}_next`, { text: next, score: chunk.score * 0.7 });
    }
  }

  return [...expanded.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, topK + 2)
    .map(c => c.text)
    .filter(Boolean);
}

// ── Translation ────────────────────────────────────────────────────────────────

const LANG_NAMES = {
  en: "English", fr: "French", ar: "Arabic",
  ja: "Japanese", zh: "Chinese", ru: "Russian",
};

export async function translateChunks(chunks, targetLang) {
  if (targetLang === "fr" || !chunks.length) return chunks;
  const langName = LANG_NAMES[targetLang] ?? targetLang;
  const joined   = chunks.map((c, i) => `[${i}] ${c}`).join("\n---\n");
  const prompt   = `Translate the following HR document excerpts to ${langName}.
Keep all names, numbers, dates, legal terms, and article references exactly as-is.
Return ONLY the translated excerpts in the same [N] format, separated by ---.

${joined}`;
  try {
    const result = await callGemini(prompt);
    const parts  = result.split(/\n?---\n?/);
    return parts.map(p => p.replace(/^\[\d+\]\s*/, "").trim()).filter(Boolean);
  } catch {
    return chunks; // fallback: return untranslated
  }
}

// ── Document management ────────────────────────────────────────────────────────

export async function listDocuments() {
  const records = await cypher(`
    MATCH (d:KBDocument)
    RETURN d.id AS id, d.filename AS filename, d.lang AS lang,
           d.summary AS summary, d.uploadedAt AS uploadedAt,
           d.uploadedBy AS uploadedBy, d.chunkCount AS chunkCount
    ORDER BY d.uploadedAt DESC
  `);
  return records.map(r => ({
    id:          r.get("id"),
    filename:    r.get("filename"),
    lang:        r.get("lang"),
    summary:     r.get("summary"),
    uploadedAt:  r.get("uploadedAt"),
    uploadedBy:  r.get("uploadedBy"),
    chunkCount:  neo4j.integer.toNumber(r.get("chunkCount") ?? 0),
  }));
}

export async function deleteDocument(docId) {
  // Delete chunks (and their MENTIONS/NEXT edges), then the document
  await cypher(`
    MATCH (d:KBDocument { id: $id })-[:HAS_CHUNK]->(c:KBChunk)
    DETACH DELETE c
  `, { id: docId });
  await cypher(`MATCH (d:KBDocument { id: $id }) DETACH DELETE d`, { id: docId });

  // Clean up orphan entities (not mentioned by any remaining chunk)
  await cypher(`
    MATCH (e:KBEntity)
    WHERE NOT (()-[:MENTIONS]->(e))
    DETACH DELETE e
  `);
}
