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
