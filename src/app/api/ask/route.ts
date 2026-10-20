import { answerQuestion } from "@/lib/answer";
import { askResponse, parseAskBody } from "@/lib/ask";

// POST { question } → the Answer, or { error } with a readable message.
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const parsed = parseAskBody(body);
  if ("error" in parsed) return Response.json(parsed, { status: 400 });

  const { status, body: result } = await askResponse(parsed.question, (q) => answerQuestion(q));
  return Response.json(result, { status });
}
