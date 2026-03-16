const GEMINI_API_KEY =
  import.meta.env.VITE_GEMINI_API_KEY ?? "AIzaSyAjoLdBfnbTrKzz2JOzmMNqdLoCT03AHXY";
const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

export interface Presentation {
  name: string;
  description: string;
  language: string;
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
  const langName = { en: "English", fr: "French", ar: "Arabic" }[lang] ?? "English";
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
  const langName = { en: "English", fr: "French", ar: "Arabic" }[lang] ?? "English";

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

/** Send a message to Gemini and return the AI response */
export async function sendToGemini(
  message: string,
  history: ChatMessage[],
  presentations: Presentation[],
  presentationContent: string
): Promise<string> {
  const pList = presentations
    .map((p) => `• ${p.name} (${p.language}): ${p.description}`)
    .join("\n");

  let system = "You are a smart assistant for HORIBA. Be concise and helpful.\n";
  if (pList) system += `Available presentations:\n${pList}\n`;
  if (presentationContent)
    system += `Current presentation content:\n${presentationContent}\n`;
  system += "Answer only based on the provided context.\n\n";

  const conv = [...history, { role: "user" as const, text: message }]
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.text}`)
    .join("\n");

  return callGemini(system + conv + "\nAssistant:");
}
