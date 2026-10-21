import { test } from "node:test";
import assert from "node:assert/strict";
import { cosineSimilarity, rankEntriesByAnswers, TOP_MATCHES } from "../src/lib/search";

test("cosineSimilarity of identical, opposite and orthogonal vectors", () => {
  assert.equal(cosineSimilarity([1, 2, 3], [2, 4, 6]), 1);
  assert.equal(cosineSimilarity([1, 0], [-1, 0]), -1);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
});

test("cosineSimilarity is 0 for a zero vector and throws on mismatched lengths", () => {
  assert.equal(cosineSimilarity([0, 0], [1, 1]), 0);
  assert.throws(() => cosineSimilarity([1, 0], [1, 0, 0]), /length 2 and 3/);
});

const entry = (id: string, entry_date: string, ...embeddings: (number[] | null)[]) => ({
  id,
  entry_date,
  answers: embeddings.map((embedding) => ({ embedding })),
});

test("rankEntriesByAnswers scores each entry by its closest answer, once per entry", () => {
  const rows = [
    entry("far", "2026-09-01", [0, 1], [-1, 0]),
    entry("none", "2026-09-02", null),
    entry("mixed", "2026-09-03", [0, 1], [1, 0.1], null), // its second answer is near
    entry("mid", "2026-09-04", [1, 1]),
    entry("empty", "2026-09-05"),
  ];
  const ranked = rankEntriesByAnswers(rows, [1, 0], 10);
  assert.deepEqual(
    ranked.map((m) => m.row.id),
    ["mixed", "mid", "far"],
  );
  assert.equal(ranked[0].score, cosineSimilarity([1, 0.1], [1, 0]));
  assert.equal(ranked[2].score, 0);
});

test("rankEntriesByAnswers caps at the limit, breaks ties by date and has no minimum score", () => {
  const rows = [
    entry("later", "2026-09-05", [1, 0]),
    entry("earlier", "2026-09-01", [0, 1], [1, 0]),
    entry("opposite", "2026-09-02", [-1, 0]),
  ];
  assert.deepEqual(
    rankEntriesByAnswers(rows, [1, 0], 2).map((m) => m.row.id),
    ["earlier", "later"],
  );
  const all = rankEntriesByAnswers(rows, [1, 0], 3);
  assert.equal(all[2].row.id, "opposite");
  assert.equal(all[2].score, -1);
});

test("Claude gets the 12 best matches", () => {
  assert.equal(TOP_MATCHES, 12);
});
