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

export type EmbedRow = { id: string; content: string; embedded: boolean };

// Entries with writing and no embedding yet, plus how many with writing already have one.
export function pickEntries<T extends EmbedRow>(rows: T[]): { todo: T[]; alreadyDone: number } {
  const written = rows.filter((r) => r.content.trim() !== "");
  return { todo: written.filter((r) => !r.embedded), alreadyDone: written.filter((r) => r.embedded).length };
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
