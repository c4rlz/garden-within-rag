// Decisions for npm run embed, kept free of I/O so they can be tested.
import type { InputType } from "./voyage";

// Voyage allows up to 1000 inputs per request; 64 keeps each request well
// under its per-request token cap too.
export const BATCH_SIZE = 64;

// Why embedding must not run, or null if it may. Only the sample database is
// embedded unless EMBED_REAL_JOURNAL is exactly "yes".
export function embedRefusal(kind: "sample" | null, env: Record<string, string | undefined> = process.env): string | null {
  if (kind === "sample" || env.EMBED_REAL_JOURNAL === "yes") return null;
  return [
    "Refusing to embed: this database isn't marked as sample data. Nothing was sent.",
    "Embedding sends written answers to Voyage AI, which may train on them unless your account has opted out.",
    "See README → Privacy before setting EMBED_REAL_JOURNAL=yes.",
    "To embed the sample instead: DATABASE_URL=postgres:///garden_within_sample npm run embed",
  ].join("\n");
}

// One written answer. content is the answer text alone, without its prompt
// label: every answer to a prompt shares the label, so including it would
// group answers by template instead of by topic.
export interface AnswerItem {
  entry_id: string;
  prompt: string;
  content: string;
}

export interface AnswerPlan {
  todo: AnswerItem[];
  alreadyDone: number;
  entries: number; // distinct entries in todo
}

// Splits each entry's written answers into one item per prompt, and keeps the
// ones with no embedding for their current text. Whitespace-only answers are skipped.
export function pickAnswers(entries: { id: string; written: Record<string, string> }[], done: AnswerItem[]): AnswerPlan {
  const embedded = new Map(done.map((d) => [`${d.entry_id}\n${d.prompt}`, d.content]));
  const todo: AnswerItem[] = [];
  let alreadyDone = 0;
  for (const entry of entries) {
    for (const [prompt, content] of Object.entries(entry.written)) {
      if (content.trim() === "") continue;
      if (embedded.get(`${entry.id}\n${prompt}`) === content) alreadyDone++;
      else todo.push({ entry_id: entry.id, prompt, content });
    }
  }
  return { todo, alreadyDone, entries: new Set(todo.map((a) => a.entry_id)).size };
}

function count(n: number, one: string, many: string): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

// Printed before the first batch is sent.
export function embedPlanMessage(plan: AnswerPlan): string {
  const done = `${plan.alreadyDone.toLocaleString("en-US")} already done`;
  if (plan.todo.length === 0) return `Nothing to embed (${done}).`;
  const answers = count(plan.todo.length, "answer", "answers");
  return `Embedding ${answers} from ${count(plan.entries, "entry", "entries")} (${done}). Sending to Voyage AI…`;
}

export function batches<T>(items: T[], size: number): T[][] {
  if (!(size >= 1)) throw new Error(`Batch size must be at least 1, not ${size}.`);
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// Embeds content batch by batch, saving each before sending the next, so a
// failure keeps every batch already done. Returns how many were saved.
export async function embedAll<T extends { content: string }>(
  todo: T[],
  opts: {
    embed: (texts: string[], inputType: InputType) => Promise<number[][]>;
    save: (batch: T[], vectors: number[][]) => Promise<number>; // returns how many rows were saved
    batchSize?: number;
  },
): Promise<number> {
  let done = 0;
  for (const batch of batches(todo, opts.batchSize ?? BATCH_SIZE)) {
    const vectors = await opts.embed(batch.map((e) => e.content), "document");
    done += await opts.save(batch, vectors);
  }
  return done;
}
