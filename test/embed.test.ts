import { test } from "node:test";
import assert from "node:assert/strict";
import { batches, embedAll, embedPlanMessage, embedRefusal, pickAnswers } from "../src/lib/embed";

test("the sample database may be embedded", () => {
  assert.equal(embedRefusal("sample", {}), null);
});

test("any other database is refused with a reason that points to the README", () => {
  const message = embedRefusal(null, {});
  assert.ok(message);
  assert.match(message, /Voyage/);
  assert.match(message, /README/);
});

test("EMBED_REAL_JOURNAL=yes allows the real journal", () => {
  assert.equal(embedRefusal(null, { EMBED_REAL_JOURNAL: "yes" }), null);
});

test("only exactly yes counts", () => {
  for (const value of ["true", "1", "YES", "", " yes"]) {
    assert.ok(embedRefusal(null, { EMBED_REAL_JOURNAL: value }), value);
  }
});

const entry = (id: string, written: Record<string, string>) => ({ id, written });
const done = (entry_id: string, prompt: string, content: string) => ({ entry_id, prompt, content });

test("each written answer is picked on its own, without its prompt label, skipping blank ones", () => {
  const plan = pickAnswers(
    [
      entry("a", { "What wants clarity?": "Why I scroll at night.", "What can I let go of?": "Guilt." }),
      entry("b", {}),
      entry("c", { "Highlights": "  \n\t" }),
      entry("d", { "Highlights": "A walk.", "Insights": "Rest helps." }),
    ],
    [],
  );
  assert.deepEqual(plan.todo, [
    { entry_id: "a", prompt: "What wants clarity?", content: "Why I scroll at night." },
    { entry_id: "a", prompt: "What can I let go of?", content: "Guilt." },
    { entry_id: "d", prompt: "Highlights", content: "A walk." },
    { entry_id: "d", prompt: "Insights", content: "Rest helps." },
  ]);
  assert.equal(plan.alreadyDone, 0);
  assert.equal(plan.entries, 2);
});

test("answers already embedded with the same text are skipped, and changed ones picked again", () => {
  const plan = pickAnswers(
    [
      entry("a", { p1: "same", p2: "changed now" }),
      entry("b", { p1: "done too" }),
    ],
    [done("a", "p1", "same"), done("a", "p2", "before"), done("b", "p1", "done too"), done("gone", "p1", "x")],
  );
  assert.deepEqual(plan.todo, [{ entry_id: "a", prompt: "p2", content: "changed now" }]);
  assert.equal(plan.alreadyDone, 2);
  assert.equal(plan.entries, 1);
});

test("nothing is picked when every answer is already embedded", () => {
  const plan = pickAnswers([entry("a", { p: "x" }), entry("b", {})], [done("a", "p", "x")]);
  assert.deepEqual(plan.todo, []);
  assert.equal(plan.alreadyDone, 1);
  assert.equal(plan.entries, 0);
});

test("the plan message says how many answers and entries before anything is sent", () => {
  const todo = Array.from({ length: 1612 }, (_, i) => done(`e${i % 427}`, `p${i}`, "x"));
  assert.equal(
    embedPlanMessage({ todo, alreadyDone: 0, entries: 427 }),
    "Embedding 1,612 answers from 427 entries (0 already done). Sending to Voyage AI…",
  );
  assert.equal(
    embedPlanMessage({ todo: [done("a", "p", "x")], alreadyDone: 3, entries: 1 }),
    "Embedding 1 answer from 1 entry (3 already done). Sending to Voyage AI…",
  );
  assert.equal(embedPlanMessage({ todo: [], alreadyDone: 1200, entries: 0 }), "Nothing to embed (1,200 already done).");
});

test("batches split items in order, none larger than the size", () => {
  const items = Array.from({ length: 10 }, (_, i) => i);
  assert.deepEqual(batches(items, 5), [[0, 1, 2, 3, 4], [5, 6, 7, 8, 9]]);
  assert.deepEqual(batches(items, 4), [[0, 1, 2, 3], [4, 5, 6, 7], [8, 9]]);
  assert.deepEqual(batches([], 4), []);
  for (const size of [1, 3, 7, 64]) {
    const out = batches(items, size);
    assert.ok(out.every((b) => b.length >= 1 && b.length <= size));
    assert.deepEqual(out.flat(), items);
  }
});

test("each batch is saved before the next is sent, with content as documents", async () => {
  const todo = ["a", "b", "c", "d", "e"].map((id) => done(id, "p", `text ${id}`));
  const log: string[] = [];
  const embedded = await embedAll(todo, {
    batchSize: 2,
    embed: async (texts, inputType) => {
      log.push(`embed ${inputType} ${texts.join(",")}`);
      return texts.map(() => [0]);
    },
    save: async (batch, vectors) => {
      assert.equal(vectors.length, batch.length);
      log.push(`save ${batch.map((r) => r.entry_id).join(",")}`);
      return batch.length;
    },
  });
  assert.equal(embedded, 5);
  assert.deepEqual(log, [
    "embed document text a,text b",
    "save a,b",
    "embed document text c,text d",
    "save c,d",
    "embed document text e",
    "save e",
  ]);
});

test("a failed batch keeps the batches already saved", async () => {
  const todo = ["a", "b", "c", "d"].map((id) => done(id, "p", id));
  const saved: string[] = [];
  let calls = 0;
  await assert.rejects(
    embedAll(todo, {
      batchSize: 2,
      embed: async (texts) => {
        if (++calls === 2) throw new Error("Voyage returned 500");
        return texts.map(() => [0]);
      },
      save: async (batch) => {
        saved.push(...batch.map((r) => r.entry_id));
        return batch.length;
      },
    }),
    /500/,
  );
  assert.deepEqual(saved, ["a", "b"]);
});

test("nothing is sent when there is nothing to embed", async () => {
  let calls = 0;
  const embedded = await embedAll([], {
    embed: async () => {
      calls++;
      return [];
    },
    save: async () => 0,
  });
  assert.equal(embedded, 0);
  assert.equal(calls, 0);
});
