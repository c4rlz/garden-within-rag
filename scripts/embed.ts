// Embeds each written answer on its own into answer_embeddings with Voyage AI.
// Only runs on the sample database unless EMBED_REAL_JOURNAL=yes (see README → Privacy).
import { setTimeout as sleep } from "node:timers/promises";
import { datasetKind } from "../src/lib/dataset";
import { closeDb, db } from "../src/lib/db";
import { embedAll, embedPlanMessage, embedRefusal, pickAnswers, type AnswerItem } from "../src/lib/embed";
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

async function save(batch: AnswerItem[], vectors: number[][]): Promise<number> {
  // Matching on the entry's current answer skips one an ingest changed mid-run;
  // it stays unembedded and is picked up next time.
  const { rowCount } = await db().query(
    `insert into answer_embeddings (entry_id, prompt, content, embedding)
     select v.entry_id, v.prompt, v.content, v.embedding::vector
       from unnest($1::uuid[], $2::text[], $3::text[], $4::text[]) as v(entry_id, prompt, content, embedding)
       join entries e on e.id = v.entry_id
      where e.written ->> v.prompt = v.content
     on conflict (entry_id, prompt) do update set content = excluded.content, embedding = excluded.embedding`,
    [
      batch.map((a) => a.entry_id),
      batch.map((a) => a.prompt),
      batch.map((a) => a.content),
      vectors.map((v) => JSON.stringify(v)),
    ],
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
    const { rows: entries } = await db().query<{ id: string; written: Record<string, string> }>(
      "select id, written from entries where content <> ''",
    );
    const { rows: done } = await db().query<AnswerItem>("select entry_id, prompt, content from answer_embeddings");
    const plan = pickAnswers(entries, done);
    console.log(embedPlanMessage(plan));
    const embedded = await embedAll(plan.todo, { embed: embedWithRetry, save });
    console.log(`Embedded ${embedded} answers, ${plan.alreadyDone} already done.`);
  }
} finally {
  await closeDb();
}
