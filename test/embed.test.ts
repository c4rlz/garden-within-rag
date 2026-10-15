import { test } from "node:test";
import assert from "node:assert/strict";
import { batches, embedAll, embedRefusal, pickEntries } from "../src/lib/embed";

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

const row = (id: string, content: string, embedded = false) => ({ id, content, embedded });

test("entries with writing and no embedding are picked", () => {
  const { todo, alreadyDone } = pickEntries([
    row("a", "Seed\nfelt calm"),
    row("b", ""),
    row("c", "  \n\t"),
    row("d", "Root\nlet go", true),
    row("e", "Blossom\nidea"),
  ]);
  assert.deepEqual(todo.map((r) => r.id), ["a", "e"]);
  assert.equal(alreadyDone, 1);
});

test("nothing is picked when every entry is already embedded", () => {
  const { todo, alreadyDone } = pickEntries([row("a", "x", true), row("b", "y", true), row("c", "")]);
  assert.deepEqual(todo, []);
  assert.equal(alreadyDone, 2);
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
  const todo = ["a", "b", "c", "d", "e"].map((id) => row(id, `text ${id}`));
  const log: string[] = [];
  const embedded = await embedAll(todo, {
    batchSize: 2,
    embed: async (texts, inputType) => {
      log.push(`embed ${inputType} ${texts.join(",")}`);
      return texts.map(() => [0]);
    },
    save: async (batch, vectors) => {
      assert.equal(vectors.length, batch.length);
      log.push(`save ${batch.map((r) => r.id).join(",")}`);
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
  const todo = ["a", "b", "c", "d"].map((id) => row(id, id));
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
        saved.push(...batch.map((r) => r.id));
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
