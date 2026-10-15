import { test } from "node:test";
import assert from "node:assert/strict";
import { cosineSimilarity, rankBySimilarity, TOP_MATCHES } from "../src/lib/search";

test("cosineSimilarity of identical, opposite and orthogonal vectors", () => {
  assert.equal(cosineSimilarity([1, 2, 3], [2, 4, 6]), 1);
  assert.equal(cosineSimilarity([1, 0], [-1, 0]), -1);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
});

test("cosineSimilarity is 0 for a zero vector and throws on mismatched lengths", () => {
  assert.equal(cosineSimilarity([0, 0], [1, 1]), 0);
  assert.throws(() => cosineSimilarity([1, 0], [1, 0, 0]), /length 2 and 3/);
});

const item = (id: string, entry_date: string, embedding: number[] | null) => ({ id, entry_date, embedding });

test("rankBySimilarity orders by score and skips rows without an embedding", () => {
  const rows = [
    item("far", "2026-09-01", [0, 1]),
    item("none", "2026-09-02", null),
    item("near", "2026-09-03", [1, 0.1]),
    item("mid", "2026-09-04", [1, 1]),
  ];
  const ranked = rankBySimilarity(rows, [1, 0], 10);
  assert.deepEqual(
    ranked.map((m) => m.row.id),
    ["near", "mid", "far"],
  );
  assert.ok(ranked[0].score > ranked[1].score);
});

test("rankBySimilarity caps at the limit, breaks ties by date and has no minimum score", () => {
  const rows = [
    item("later", "2026-09-05", [1, 0]),
    item("earlier", "2026-09-01", [1, 0]),
    item("opposite", "2026-09-02", [-1, 0]),
  ];
  assert.deepEqual(
    rankBySimilarity(rows, [1, 0], 2).map((m) => m.row.id),
    ["earlier", "later"],
  );
  const all = rankBySimilarity(rows, [1, 0], 3);
  assert.equal(all[2].row.id, "opposite");
  assert.equal(all[2].score, -1);
});

test("Claude gets the 12 best matches", () => {
  assert.equal(TOP_MATCHES, 12);
});
