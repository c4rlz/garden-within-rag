// The landing page's ask box: request checks, error mapping and citation
// splitting. Only types come from answer.ts, so the client component can
// import answerParts without bundling the database and Claude code.
import type { Answer, Citation } from "./answer";

export const MAX_QUESTION_LENGTH = 500;

export function parseAskBody(body: unknown): { question: string } | { error: string } {
  const question = typeof body === "object" && body !== null ? (body as { question?: unknown }).question : undefined;
  if (typeof question !== "string" || question.trim() === "") return { error: "Type a question first." };
  const trimmed = question.trim();
  if (trimmed.length > MAX_QUESTION_LENGTH) return { error: `Keep questions under ${MAX_QUESTION_LENGTH} characters.` };
  return { question: trimmed };
}

// The browser only sees the error's first line. The rest (such as Claude
// Code's stderr) is logged on the server.
export async function askResponse(
  question: string,
  ask: (question: string) => Promise<Answer>,
): Promise<{ status: number; body: Answer | { error: string } }> {
  try {
    return { status: 200, body: await ask(question) };
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : String(err);
    return { status: 500, body: { error: message.split("\n")[0].trim() || "Something went wrong answering that." } };
  }
}

export type AnswerPart = { text: string } | { cite: Citation };

// Splits the answer at its [n] markers. A marker with no matching citation
// stays as text, the same rule citationsFrom uses.
export function answerParts(answer: string, citations: Citation[]): AnswerPart[] {
  const byN = new Map(citations.map((c) => [c.n, c]));
  const parts: AnswerPart[] = [];
  let text = "";
  for (const [i, piece] of answer.split(/\[(\d+)\]/).entries()) {
    // split puts the captured numbers at the odd indexes.
    const cite = i % 2 === 1 ? byN.get(Number(piece)) : undefined;
    if (cite) {
      if (text) parts.push({ text });
      text = "";
      parts.push({ cite });
    } else {
      text += i % 2 === 1 ? `[${piece}]` : piece;
    }
  }
  if (text || parts.length === 0) parts.push({ text });
  return parts;
}

// Splits text at **bold** markers, which Claude and the month and theme
// headings use. An unpaired ** stays as text.
export function boldParts(text: string): { text: string; bold: boolean }[] {
  return text
    .split(/\*\*(\S(?:.*?\S)?)\*\*/)
    .map((piece, i) => ({ text: piece, bold: i % 2 === 1 }))
    .filter((part) => part.text !== "");
}
