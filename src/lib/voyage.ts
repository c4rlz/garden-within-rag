// Voyage AI embeddings over its REST API. Used to embed written answers
// ("document") and, at question time, the question itself ("query").
const ENDPOINT = "https://api.voyageai.com/v1/embeddings";
const MODEL = "voyage-4";

// Matches answer_embeddings.embedding vector(1024) in db/schema.sql.
export const EMBEDDING_DIMENSIONS = 1024;

export type InputType = "document" | "query";

// A non-2xx reply. retryAfter is the Retry-After header in seconds, if Voyage sent one.
export class VoyageError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfter: number | null,
  ) {
    super(message);
  }
}

// Returns one vector per text, in the same order as texts.
export async function embed(texts: string[], inputType: InputType): Promise<number[][]> {
  const key = process.env.VOYAGE_API_KEY;
  if (!key) throw new Error("VOYAGE_API_KEY is not set. Add it to .env.local (see README → Sample data).");

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ input: texts, model: MODEL, input_type: inputType }),
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    const header = Number(res.headers.get("retry-after"));
    const retryAfter = res.headers.has("retry-after") && Number.isFinite(header) ? header : null;
    throw new VoyageError(`Voyage returned ${res.status}: ${body}`, res.status, retryAfter);
  }

  const json = (await res.json()) as { data?: { index: number; embedding: number[] }[] };
  const data = [...(json.data ?? [])].sort((a, b) => a.index - b.index);
  if (data.length !== texts.length) {
    throw new Error(`Voyage returned ${data.length} embeddings for ${texts.length} texts.`);
  }
  return data.map((d, i) => {
    if (d.index !== i || !Array.isArray(d.embedding) || d.embedding.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(`Voyage returned a bad embedding at position ${i}; expected ${EMBEDDING_DIMENSIONS} numbers.`);
    }
    return d.embedding;
  });
}
