import { test } from "node:test";
import assert from "node:assert/strict";
import { cosineSimilarity } from "../src/lib/search";
import {
  clusterEntries,
  EXAMPLES_PER_THEME,
  hasProgress,
  isFlagged,
  isRecurring,
  linkedBlossomIds,
  pickExamples,
  RELATION_PROPS,
  THEME_SIMILARITY,
  type Cluster,
  type Clusterable,
} from "../src/lib/themes";

const item = (id: string, entry_date: string, embedding: number[]): Clusterable => ({ id, entry_date, embedding });

const ids = (clusters: Cluster<Clusterable>[]) => clusters.map((c) => c.members.map((m) => m.id));

test("two well-separated groups become two clusters, in date order", () => {
  const rows = [
    item("a1", "2026-09-01", [1, 0, 0]),
    item("b1", "2026-09-02", [0, 1, 0]),
    item("a2", "2026-09-03", [0.95, 0.1, 0]),
    item("b2", "2026-09-04", [0.1, 0.95, 0]),
    item("a3", "2026-09-05", [0.9, 0, 0.1]),
  ];
  const clusters = clusterEntries(rows);
  assert.deepEqual(ids(clusters), [["a1", "a2", "a3"], ["b1", "b2"]]);
  // The centroid is the mean of the members' vectors.
  assert.deepEqual(
    clusters[1].centroid.map((v) => Number(v.toFixed(3))),
    [0.05, 0.975, 0],
  );
});

test("a far-off vector becomes its own singleton cluster", () => {
  const rows = [
    item("a1", "2026-09-01", [1, 0, 0]),
    item("a2", "2026-09-02", [0.9, 0.1, 0]),
    item("far", "2026-09-03", [0, 0, 1]),
    item("a3", "2026-09-04", [1, 0.05, 0]),
  ];
  assert.deepEqual(ids(clusterEntries(rows)), [["a1", "a2", "a3"], ["far"]]);
});

test("a threshold just above a pair's similarity splits them, and just below joins them", () => {
  const rows = [item("x", "2026-09-01", [1, 0]), item("y", "2026-09-02", [1, 1])];
  const score = cosineSimilarity([1, 0], [1, 1]); // about 0.707
  assert.deepEqual(ids(clusterEntries(rows, score + 0.001)), [["x"], ["y"]]);
  assert.deepEqual(ids(clusterEntries(rows, score - 0.001)), [["x", "y"]]);
  // At the default threshold of 0.75 they stay apart.
  assert.equal(THEME_SIMILARITY, 0.75);
  assert.deepEqual(ids(clusterEntries(rows)), [["x"], ["y"]]);
});

test("the result doesn't depend on input order: rows go by date, then id", () => {
  const rows = [
    item("a", "2026-09-01", [1, 0]),
    item("b", "2026-09-02", [0.6, 0.8]), // 0.6 from a, 0.96 from c
    item("c", "2026-09-02", [0.8, 0.6]), // same date as b, so c comes after b by id
    item("d", "2026-09-03", [0, 1]),
  ];
  const expected = ids(clusterEntries(rows));
  for (const order of [[3, 2, 1, 0], [2, 0, 3, 1], [1, 3, 0, 2]]) {
    assert.deepEqual(ids(clusterEntries(order.map((i) => rows[i]))), expected);
  }
});

test("a row joins the cluster whose centroid is most similar", () => {
  const rows = [
    item("a", "2026-09-01", [1, 0]),
    item("b", "2026-09-02", [0, 1]),
    item("c", "2026-09-03", [0.6, 0.8]), // closer to b than a, and over 0.75
  ];
  assert.deepEqual(ids(clusterEntries(rows)), [["a"], ["b", "c"]]);
});

const cluster = (dates: string[]): Cluster<Clusterable> => ({
  members: dates.map((d, i) => item(`e${i}`, d, [1, 0])),
  centroid: [1, 0],
});

test("a theme recurs with 5 entries over 3 weeks", () => {
  // Weeks of Sep 7, Sep 14 and Sep 21.
  assert.equal(isRecurring(cluster(["2026-09-07", "2026-09-08", "2026-09-14", "2026-09-15", "2026-09-21"])), true);
});

test("4 entries don't recur, even over 4 weeks", () => {
  assert.equal(isRecurring(cluster(["2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28"])), false);
});

test("6 entries in 2 weeks don't recur", () => {
  const dates = ["2026-09-07", "2026-09-08", "2026-09-09", "2026-09-14", "2026-09-15", "2026-09-16"];
  assert.equal(isRecurring(cluster(dates)), false);
});

test("a Sunday Root counts in its Monday week", () => {
  // Sep 20 is a Sunday, in the week of Sep 14, so this is only 2 weeks.
  assert.equal(isRecurring(cluster(["2026-09-07", "2026-09-08", "2026-09-14", "2026-09-15", "2026-09-20"])), false);
  assert.equal(isRecurring(cluster(["2026-09-07", "2026-09-08", "2026-09-14", "2026-09-15", "2026-09-21"])), true);
});

test("linkedBlossomIds unions links through RELATION_PROPS, ignoring other properties and unknown Blossoms", () => {
  assert.deepEqual(RELATION_PROPS, ["Blossoms", "🌸 Blossom", "🌸 Priorities"]);
  const links = [
    { from_id: "s1", to_id: "b1", property: "Blossoms" },
    { from_id: "s2", to_id: "b1", property: "🌸 Blossom" },
    { from_id: "r1", to_id: "b2", property: "🌸 Priorities" },
    { from_id: "s1", to_id: "b3", property: "Related" }, // not a relation prop
    { from_id: "s2", to_id: "gone", property: "Blossoms" }, // not a known Blossom
    { from_id: "other", to_id: "b4", property: "Blossoms" }, // not in the theme
  ];
  assert.deepEqual(linkedBlossomIds(["s1", "s2", "r1"], links, ["b1", "b2", "b3", "b4"]), ["b1", "b2"]);
  assert.deepEqual(linkedBlossomIds(["s1"], [{ from_id: "s1", to_id: "b3", property: "Related" }], ["b3"]), []);
});

test("a theme with no linked Blossoms is flagged", () => {
  assert.equal(isFlagged([]), true);
});

test("a theme whose Blossoms are all at Seeds, or have no Status, is flagged", () => {
  assert.equal(isFlagged([{ status: "Seeds" }, { status: "Seeds" }]), true);
  assert.equal(isFlagged([{ status: null }]), true);
  assert.equal(hasProgress(null), false);
  assert.equal(hasProgress("Seeds"), false);
});

test("any one Blossom past Seeds means progress", () => {
  for (const status of ["Sprouts", "Bloomed", "Archived", "Blossoms"]) {
    assert.equal(hasProgress(status), true, status);
    assert.equal(isFlagged([{ status: "Seeds" }, { status }, { status: null }]), false, status);
  }
});

test("pickExamples returns at most 5 members, the closest to the centroid, in date order", () => {
  const members = [
    item("far1", "2026-09-01", [0.5, 0.5]),
    item("c1", "2026-09-02", [1, 0.01]),
    item("c2", "2026-09-03", [1, 0.02]),
    item("far2", "2026-09-04", [0.6, 0.5]),
    item("c3", "2026-09-05", [1, 0]),
    item("c4", "2026-09-06", [1, 0.03]),
    item("c5", "2026-09-07", [1, 0.04]),
  ];
  const picked = pickExamples({ members, centroid: [1, 0] });
  assert.equal(EXAMPLES_PER_THEME, 5);
  assert.deepEqual(picked.map((m) => m.id), ["c1", "c2", "c3", "c4", "c5"]);
  assert.deepEqual(pickExamples({ members: members.slice(0, 2), centroid: [1, 0] }).map((m) => m.id), ["far1", "c1"]);
});
