import { useState, useEffect } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import {
  generateQuizQuestions,
  translateQuizQuestions,
  type QuizQuestion,
} from "../../services/gemini";
import { LANG_TO_LONG } from "../../constants";
import { cn } from "../../utils";

function convertJsonQuestions(raw: Array<{ question: string; type: string; choices: string[]; correctAnswers: number[] }>): QuizQuestion[] {
  return raw.map((q) => {
    const options = q.choices.map((label, i) => ({ id: String.fromCharCode(97 + i), label }));
    const correct = q.correctAnswers.map((i) => options[i].id);
    return { question: q.question, options, correct, explanation: "", type: q.type === "multiple" ? "multiple" : "single" };
  });
}

export function QuizWidget({
  presentationContent, presentationName, lang, userName, userEmail,
}: {
  presentationContent: string;
  presentationName: string;
  lang: string;
  userName?: string;
  userEmail?: string;
}) {
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string[]>>({});
  const [validated, setValidated] = useState<Record<number, boolean>>({});
  const [sendTo, setSendTo] = useState("alexandre.grigoriev@horiba.com");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!presentationContent && !presentationName) return;
    setLoading(true);
    setIdx(0);
    setAnswers({});
    setValidated({});
    setSubmitted(false);
    (async () => {
      try {
        if (presentationName) {
          const langFile = LANG_TO_LONG[lang] ?? lang;
          const base = `/uploads/${encodeURIComponent(presentationName)}`;

          const res1 = await fetch(`${base}/question_${langFile}.json`);
          if (res1.ok) {
            const data = await res1.json();
            if (Array.isArray(data.questions) && data.questions.length > 0) {
              if (data.sendto) setSendTo(data.sendto);
              setQuestions(convertJsonQuestions(data.questions));
              return;
            }
          }

          const res2 = await fetch(`${base}/question.json`);
          if (res2.ok) {
            const data = await res2.json();
            if (Array.isArray(data.questions) && data.questions.length > 0) {
              if (data.sendto) setSendTo(data.sendto);
              let qs = convertJsonQuestions(data.questions);
              if (lang !== "en") qs = await translateQuizQuestions(qs, lang);
              setQuestions(qs);
              return;
            }
          }
        }

        if (presentationContent) {
          const qs = await generateQuizQuestions(presentationContent, lang);
          setQuestions(qs);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, [presentationContent, presentationName, lang]);

  const toggleAnswer = (qIdx: number, optId: string, multiple: boolean) => {
    setAnswers((prev) => {
      const cur = prev[qIdx] ?? [];
      if (multiple) {
        return { ...prev, [qIdx]: cur.includes(optId) ? cur.filter((id) => id !== optId) : [...cur, optId] };
      }
      return { ...prev, [qIdx]: [optId] };
    });
  };

  const handleSubmit = async () => {
    let score = 0;
    const lines: string[] = [
      `Quiz Results — ${presentationName}`,
      `Date: ${new Date().toLocaleString()}`,
      ...(userName ? [`User: ${userName}`] : []),
      ...(userEmail ? [`Email: ${userEmail}`] : []),
      "",
    ];
    questions.forEach((q, i) => {
      const selected = answers[i] ?? [];
      const isCorrect = q.correct.length === selected.length && q.correct.every((c) => selected.includes(c));
      if (isCorrect) score++;
      const selLabels = selected.map((id) => q.options.find((o) => o.id === id)?.label ?? id).join(", ");
      const corLabels = q.correct.map((id) => q.options.find((o) => o.id === id)?.label ?? id).join(", ");
      lines.push(`Q${i + 1}: ${q.question}`, `  Answer: ${selLabels || "(none)"}`, `  Correct: ${corLabels} ${isCorrect ? "✓" : "✗"}`, "");
    });
    lines.push(`Score: ${score} / ${questions.length}`);

    const to = sendTo || "alexandre.grigoriev@horiba.com";
    await fetch("/api/quiz/send-results", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, subject: `Quiz Results — ${presentationName}`, text: lines.join("\n") }),
    });
    setSubmitted(true);
  };

  if (loading) return (
    <div className="quizWrap" style={{ alignItems: "center", justifyContent: "center", display: "flex", flex: 1 }}>
      <div className="avatarSpinner" />
    </div>
  );

  if (submitted) return (
    <div className="quizWrap" style={{ alignItems: "center", justifyContent: "center", display: "flex", flex: 1 }}>
      <div style={{ color: "#111827", fontSize: 14, textAlign: "center", padding: "0 24px", lineHeight: 1.6 }}>
        <CheckCircle2 className="h-6 w-6 text-green-600" style={{ margin: "0 auto 12px" }} />
        Results sent! Thank you for completing the quiz.
      </div>
    </div>
  );

  if (!questions.length) return (
    <div className="quizWrap" style={{ alignItems: "center", justifyContent: "center", display: "flex", flex: 1 }}>
      <div style={{ color: "#6b7280", fontSize: 14, textAlign: "center", padding: "0 16px" }}>
        No quiz available. Complete a presentation first.
      </div>
    </div>
  );

  const q = questions[idx];
  const isLast = idx === questions.length - 1;
  const isMultiple = q.type === "multiple";
  const selectedIds = answers[idx] ?? [];
  const isValidated = isMultiple ? !!validated[idx] : selectedIds.length > 0;
  const showResult = isValidated;

  return (
    <div className="quizWrap">
      <div className="quizHeader">
        <div className="font-semibold">Quiz</div>
        <div className="text-xs text-gray-500">{idx + 1} / {questions.length}</div>
      </div>
      <div className="quizCard">
        <div className="text-sm font-medium">{q.question}</div>
        {isMultiple && <div className="text-xs text-gray-400 mt-1">Select all that apply</div>}
        <div className="mt-3 grid gap-2">
          {q.options.map((o) => {
            const selected = selectedIds.includes(o.id);
            const isCorrect = q.correct.includes(o.id);
            return (
              <button key={o.id} onClick={() => !isValidated && toggleAnswer(idx, o.id, isMultiple)} className={cn("quizOption", selected && "quizOptionSelected")} style={isValidated ? { cursor: "default" } : undefined}>
                <div className="flex items-center justify-between">
                  <div className="text-sm">{o.label}</div>
                  {showResult && (isCorrect ? (
                    <CheckCircle2 size={22} style={{ color: "#16a34a", flexShrink: 0 }} />
                  ) : selected ? (
                    <XCircle size={22} style={{ color: "#dc2626", flexShrink: 0 }} />
                  ) : null)}
                </div>
              </button>
            );
          })}
        </div>
        {showResult && q.explanation && <div className="mt-3 text-xs text-gray-600">{q.explanation}</div>}
      </div>
      <div className="quizFooter">
        <button className="ghostBtn" disabled={idx === 0} onClick={() => setIdx((i) => i - 1)}>Previous</button>
        {isMultiple && !isValidated
          ? <button className="blueBtn" disabled={selectedIds.length === 0} onClick={() => setValidated((v) => ({ ...v, [idx]: true }))}>Validate</button>
          : isLast
            ? <button className="blueBtn" onClick={handleSubmit}>Submit</button>
            : <button className="blueBtn" onClick={() => setIdx((i) => i + 1)}>Next</button>
        }
      </div>
    </div>
  );
}
