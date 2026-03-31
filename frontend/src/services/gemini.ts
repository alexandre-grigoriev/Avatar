const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY ?? "";
const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

export interface Presentation {
  name: string;
  description: string;
  language: string;
  createdBy?: string;
}

export type IntentType =
  | "answer_question"
  | "clear_chat"
  | "run_presentation"
  | "continue_presentation"
  | "change_view_chat";

export interface Intent {
  type: IntentType;
  value?: string; // presentation name when type === "run_presentation"
}

/** Summarize a slide image (base64 JPEG) in the given language */
export async function summarizeSlideImage(base64: string, language: string): Promise<string> {
  const langName = { english: "English", french: "French", arabic: "Arabic", japanese: "Japanese", chinese: "Chinese", russian: "Russian" }[language] ?? "English";
  const body = {
    contents: [{
      parts: [
        { inlineData: { mimeType: "image/jpeg", data: base64 } },
        { text: `You are a presentation narrator preparing spoken text for this slide in ${langName}.

Extract ONLY the essential business or educational message of this slide.

Rules:
- Write in ${langName} as natural spoken text (2-5 sentences)
- Focus on facts, concepts, obligations, processes, or key points
- IGNORE completely: background colors, fonts, logos, graphic design, layout, decorative elements
- IGNORE completely: copyright notices, legal mentions, company branding, dates
- IGNORE completely: slide numbers or titles that are just section headers with no content
- If the slide is only a title or transition slide with no real content, write a single short sentence introducing the topic
- If the slide is a closing/thank-you slide (contains words like "thank you", "merci", "شكراً", "gracias", "danke", "ありがとう", "ありがとうございます", "谢谢", "感谢", "спасибо", or similar in any language, or shows appreciation symbols), output ONLY a single closing sentence in ${langName} thanking the audience for their attention — nothing else
- Do NOT say "this slide shows" or "we can see" — speak directly as the narrator` },
      ],
    }],
  };
  const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Gemini Vision error: ${res.status} ${errText}`);
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
}

async function callGemini(prompt: string): Promise<string> {
  const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  if (!res.ok) throw new Error(`Gemini error: ${res.status}`);
  const data = await res.json();
  return data.candidates[0].content.parts[0].text;
}

/** Classify user message into an action intent */
export async function classifyIntent(
  message: string,
  presentations: Presentation[]
): Promise<Intent> {
  if (!presentations.length) return { type: "answer_question" };

  const pList = presentations
    .map((p) => `Name: "${p.name}", Language: ${p.language}, Description: ${p.description}`)
    .join("\n");

  const prompt = `Available presentations:\n${pList}\n\nClassify this user message into exactly one action:
- clear_chat: user wants to clear or reset the conversation
- run_presentation: user wants to start a specific named presentation (extract the exact name from the list)
- continue_presentation: user wants to continue or resume a paused presentation
- change_view_chat: user wants to leave presentation mode and return to simple chat
- answer_question: user is asking a question or anything else

Reply ONLY with valid JSON (no markdown, no explanation):
{"message_type":"<action>","value":"<presentation name or none>"}

User message: ${message}`;

  try {
    const text = await callGemini(prompt);
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      const type: IntentType = parsed.message_type ?? "answer_question";
      return { type, value: parsed.value ?? "" };
    }
  } catch {
    // fall through
  }
  return { type: "answer_question" };
}

export interface QuizQuestion {
  question: string;
  options: { id: string; label: string }[];
  correct: string[];          // always an array; single-choice has one element
  explanation: string;
  type: "single" | "multiple";
}

/** Generate quiz questions from presentation content */
export async function generateQuizQuestions(
  content: string,
  lang: string,
  count = 5
): Promise<QuizQuestion[]> {
  const langName = { en: "English", fr: "French", ar: "Arabic", ja: "Japanese", zh: "Chinese", ru: "Russian" }[lang] ?? "English";
  const prompt = `You are a quiz generator. Based on the following presentation content, generate exactly ${count} multiple-choice questions in ${langName}.

Presentation content:
${content}

Rules:
- Each question must have exactly 3 options labeled "a", "b", "c"
- Only one option is correct
- Provide a short explanation for the correct answer
- Write everything in ${langName}
- Reply ONLY with valid JSON array, no markdown, no extra text

Format:
[{"question":"...","options":[{"id":"a","label":"..."},{"id":"b","label":"..."},{"id":"c","label":"..."}],"correct":"a","explanation":"..."}]`;

  try {
    const text = await callGemini(prompt);
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      // Normalize: correct may be string from Gemini, wrap in array
      const parsed = JSON.parse(match[0]) as Array<Omit<QuizQuestion, "correct" | "type"> & { correct: string | string[] }>;
      return parsed.map((q) => ({
        ...q,
        correct: Array.isArray(q.correct) ? q.correct : [q.correct],
        type: "single" as const,
      }));
    }
  } catch {
    // fall through
  }
  return [];
}

/** Translate quiz questions to a target language */
export async function translateQuizQuestions(
  questions: QuizQuestion[],
  lang: string
): Promise<QuizQuestion[]> {
  const langName = { en: "English", fr: "French", ar: "Arabic", ja: "Japanese", zh: "Chinese", ru: "Russian" }[lang] ?? "English";

  // Only send translatable text; keep structural fields (correct, type, ids) intact
  const texts = questions.map((q) => ({
    q: q.question,
    o: q.options.map((opt) => opt.label),
    e: q.explanation,
  }));

  const prompt = `Translate to ${langName}. Reply ONLY with a JSON array, no markdown, no extra text. Keep the exact same structure with fields "q", "o" (array), "e".\n\n${JSON.stringify(texts)}`;
  try {
    const text = await callGemini(prompt);
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      const translated: Array<{ q: string; o: string[]; e: string }> = JSON.parse(match[0]);
      return questions.map((q, i) => ({
        ...q,
        question: translated[i]?.q ?? q.question,
        options: q.options.map((opt, j) => ({ ...opt, label: translated[i]?.o[j] ?? opt.label })),
        explanation: translated[i]?.e ?? q.explanation,
      }));
    }
  } catch {
    // fall through — return originals
  }
  return questions;
}

export interface QuizFileQuestion {
  question: string;
  type: "single" | "multiple";
  choices: string[];
  correctAnswers: number[];
}

/** Generate quiz questions in the question.json file format */
export async function generateQuizFile(
  content: string,
  lang: string,
  count: number
): Promise<QuizFileQuestion[]> {
  const langName = { english: "English", french: "French", arabic: "Arabic", japanese: "Japanese", chinese: "Chinese", russian: "Russian" }[lang] ?? "English";
  const prompt = `Generate exactly ${count} multiple-choice quiz questions in ${langName} based on this presentation content.

Presentation content:
${content}

Rules:
- Mix of "single" (one correct answer) and "multiple" (2-3 correct answers) question types
- Each question has exactly 4 choices
- For "single": correctAnswers has exactly 1 index
- For "multiple": correctAnswers has 2 or 3 indices
- correctAnswers contains 0-based indices of correct choices
- Base questions strictly on the content above
- Write everything in ${langName}
- Reply ONLY with a valid JSON array, no markdown, no extra text

Format:
[{"question":"...","type":"single","choices":["...","...","...","..."],"correctAnswers":[1]},{"question":"...","type":"multiple","choices":["...","...","...","..."],"correctAnswers":[0,2]}]`;

  try {
    const text = await callGemini(prompt);
    const match = text.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]) as QuizFileQuestion[];
  } catch {}
  return [];
}

/** Translate quiz questions in the question.json file format (choices[] / correctAnswers[]) */
export async function translateQuizFileQuestions(
  questions: QuizFileQuestion[],
  toLang: string
): Promise<QuizFileQuestion[]> {
  const LANG_NAMES: Record<string, string> = {
    english: "English", french: "French", arabic: "Arabic", japanese: "Japanese", chinese: "Chinese", russian: "Russian",
    en: "English", fr: "French", ar: "Arabic", ja: "Japanese", zh: "Chinese", ru: "Russian",
  };
  const tgt = LANG_NAMES[toLang] ?? toLang;
  const texts = questions.map(q => ({ q: q.question, c: q.choices }));
  const prompt = `Translate to ${tgt}. Reply ONLY with a JSON array, no markdown. Keep structure with fields "q" (string) and "c" (array of strings).\n\n${JSON.stringify(texts)}`;
  try {
    const result = await callGemini(prompt);
    const match = result.match(/\[[\s\S]*\]/);
    if (match) {
      const translated: Array<{ q: string; c: string[] }> = JSON.parse(match[0]);
      return questions.map((q, i) => ({
        ...q,
        question: translated[i]?.q ?? q.question,
        choices: q.choices.map((ch, j) => translated[i]?.c?.[j] ?? ch),
      }));
    }
  } catch {}
  return questions;
}

/** Translate a full slide content file from one language to another */
export async function translateContent(content: string, fromLang: string, toLang: string): Promise<string> {
  const LANG_NAMES: Record<string, string> = {
    english: "English", french: "French", arabic: "Arabic", japanese: "Japanese", chinese: "Chinese", russian: "Russian",
    en: "English", fr: "French", ar: "Arabic", ja: "Japanese", zh: "Chinese", ru: "Russian",
  };
  const src = LANG_NAMES[fromLang] ?? fromLang;
  const tgt = LANG_NAMES[toLang] ?? toLang;
  const SLIDE_SEP = "<<<SLIDE>>>";

  const rawBlocks = content.split("-------").map(b => b.trim()).filter(Boolean);
  if (!rawBlocks.length) return content;

  const textParts: string[] = [];
  const structLines: string[] = [];
  for (const block of rawBlocks) {
    const lines = block.split("\n").map(l => l.trim()).filter(Boolean);
    const image = lines.find(l => l.startsWith("image:")) ?? "";
    const quiz  = lines.find(l => /^quiz:/i.test(l)) ?? "";
    const text  = lines.filter(l => !l.startsWith("image:") && !/^quiz:/i.test(l)).join("\n");
    textParts.push(text || "");
    structLines.push([image, quiz].filter(Boolean).join("\n"));
  }

  const combined = textParts.join(`\n${SLIDE_SEP}\n`);
  const prompt = `Translate these presentation slide texts from ${src} to ${tgt}.
Slides are separated by "${SLIDE_SEP}". Return ONLY the translated slides in the same order, separated by "${SLIDE_SEP}".
Keep "No slide notes" untranslated. No explanations or extra text.

${combined}`;

  try {
    const result = await callGemini(prompt);
    const translated = result.split(SLIDE_SEP).map(s => s.trim());
    return rawBlocks.map((_, i) => {
      const text   = translated[i] ?? textParts[i];
      const struct = structLines[i];
      return [text, struct].filter(Boolean).join("\n");
    }).join("\n-------\n");
  } catch {
    return content;
  }
}

interface KBSource { filename: string; documentDate: string | null; }

/** Fetch relevant knowledge base chunks for a query (Graph RAG retrieval) */
async function fetchKnowledgeBaseContext(message: string, lang: string): Promise<{ context: string; sources: KBSource[] }> {
  try {
    const res = await fetch("/api/knowledge-base/search", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: message, lang }),
    });
    if (!res.ok) return { context: "", sources: [] };
    const data = await res.json();
    if (!Array.isArray(data.chunks) || !data.chunks.length) return { context: "", sources: [] };
    const sources: KBSource[] = Array.isArray(data.sources) ? data.sources : [];
    const context = data.chunks.map((c: string, i: number) => `[source ${i + 1}] ${c}`).join("\n---\n");
    return { context, sources };
  } catch {
    return { context: "", sources: [] };
  }
}

/** Send a message to Gemini and return the AI response */
export async function sendToGemini(
  message: string,
  history: ChatMessage[],
  presentations: Presentation[],
  presentationContent: string,
  lang = "fr"
): Promise<string> {
  const pList = presentations
    .map((p) => `• ${p.name} (${p.language}): ${p.description}`)
    .join("\n");

  // Fetch knowledge base context in parallel with building the prompt
  const { context: kbContext, sources: kbSources } = await fetchKnowledgeBaseContext(message, lang);

  let system = "You are a smart assistant for HORIBA. Be concise and helpful. Format your answers using markdown (use **bold**, bullet lists, etc.) when appropriate.\n";
  if (pList) system += `Available presentations:\n${pList}\n`;
  if (presentationContent)
    system += `Current presentation content:\n${presentationContent}\n`;
  if (kbContext) {
    system += `\nKnowledge base context (HR documents — use this as primary source):\n${kbContext}\n`;
    if (kbSources.length) {
      const srcList = kbSources.map((s, i) => `[${i + 1}] "${s.filename}"${s.documentDate ? ` (${s.documentDate})` : ""}`).join(", ");
      system += `Source documents: ${srcList}\n`;
      system += `When referencing information from the knowledge base, cite the source document by name and date if available (e.g. "selon ${kbSources[0].filename}${kbSources[0].documentDate ? ` du ${kbSources[0].documentDate}` : ""}"). `;
    }
    system += "If the answer is in the knowledge base context, base your answer strictly on it. ";
    system += "If not found, say so clearly rather than guessing.\n";
  }
  system += "Answer only based on the provided context.\n\n";

  const conv = [...history, { role: "user" as const, text: message }]
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.text}`)
    .join("\n");

  return callGemini(system + conv + "\nAssistant:");
}
