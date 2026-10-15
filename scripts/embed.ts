// Embeds written answers into entries.embedding with Voyage AI. Only runs on the
// sample database unless EMBED_REAL_JOURNAL=yes (see README → Privacy).
import { setTimeout as sleep } from "node:timers/promises";
import { datasetKind } from "../src/lib/dataset";
import { closeDb, db } from "../src/lib/db";
import { embedAll, embedRefusal, pickEntries, type EmbedRow } from "../src/lib/embed";
import { embed, VoyageError, type InputType } from "../src/lib/voyage";

const RATE_LIMIT_RETRIES = 3;
const RATE_LIMIT_WAIT_SECONDS = 20;

// Accounts without a payment method have very low rate limits, so on a 429
// wait and retry the same batch a few times before giving up.
async function embedWithRetry(texts: string[], inputType: InputType): Promise<number[][]> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await embed(texts, inputType);
    } catch (err) {
      if (!(err instanceof VoyageError) || err.status !== 429 || attempt >= RATE_LIMIT_RETRIES) throw err;
      const seconds = err.retryAfter ?? RATE_LIMIT_WAIT_SECONDS;
      console.log(`Rate limited by Voyage; waiting ${seconds}s (retry ${attempt + 1} of ${RATE_LIMIT_RETRIES}).`);
      await sleep(seconds * 1000);
    }
  }
}

async function save(batch: EmbedRow[], vectors: number[][]): Promise<number> {
  // Matching on content skips an entry an ingest changed mid-run; it stays null
  // and is picked up next time.
  const { rowCount } = await db().query(
    `update entries e set embedding = v.embedding::vector
     from unnest($1::uuid[], $2::text[], $3::text[]) as v(id, embedding, content)
     where e.id = v.id and e.content = v.content`,
    [batch.map((e) => e.id), vectors.map((v) => JSON.stringify(v)), batch.map((e) => e.content)],
  );
  return rowCount ?? 0;
}

try {
  // Decided before any entry is read, so a refusal sends nothing.
  const refusal = embedRefusal(await datasetKind());
  if (refusal) {
    console.error(refusal);
    process.exitCode = 1;
  } else {
    const { rows } = await db().query<EmbedRow>(
      "select id, content, embedding is not null as embedded from entries where content <> ''",
    );
    const { todo, alreadyDone } = pickEntries(rows);
    const embedded = await embedAll(todo, { embed: embedWithRetry, save });
    console.log(`Embedded ${embedded} entries, ${alreadyDone} already done.`);
  }
} finally {
  await closeDb();
}
