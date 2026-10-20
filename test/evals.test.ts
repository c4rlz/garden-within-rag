import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { Citation } from "../src/lib/answer";
import { addDays, parseDateRange } from "../src/lib/dates";
import {
  anyFailed,
  checkAnswer,
  evalRefusal,
  evalToday,
  formatResult,
  formatTotal,
  resolveKeys,
  runEvals,
  sampleEntryIds,
  sampleUrls,
  type EvalCase,
  type EvalFile,
} from "../src/lib/evals";
import { flattenProperty } from "../src/lib/notion";
import { readSampleDataset, shiftDataset, uuidFromKey } from "../src/lib/sample";
import { routeByRules } from "../src/lib/router";

const A = uuidFromKey("seed:2025-12-29");
const B = uuidFromKey("seed:2025-12-30");
const C = uuidFromKey("root:2025-12-29");
const OTHER = uuidFromKey("seed:2025-06-01");

const urls = new Map([A, B, C, OTHER].map((id) => [`https://sample.invalid/${id}`, id]));
const ALL = [A, B, C, OTHER];
const cite = (...ids: string[]): Citation[] =>
  ids.map((id, i) => ({ n: i + 1, label: "Daily Seed", date: "2025-12-29", url: `https://sample.invalid/${id}` }));

const lookup: EvalCase = {
  type: "Lookup",
  question: "What did I say I could let go of last week?",
  cites: { from: ["seed:2025-12-29", "seed:2025-12-30", "root:2025-12-29"], atLeast: 2, only: true },
  facts: [{ anyOf: ["delayed train", "to-do list", "calling home"], atLeast: 2 }, { anyOf: ["guilt"] }],
};

// ---- checkAnswer ----

test("an answer citing enough expected entries with every fact passes", () => {
  const result = checkAnswer(
    lookup,
    { answer: "The Delayed Train [1], the TO-DO LIST [2] and guilt about calling home [3].", citations: cite(A, B, C) },
    urls,
    ALL,
  );
  assert.deepEqual(result, { pass: true, problems: [] });
});

test("too few expected citations fail and say how many", () => {
  const result = checkAnswer(lookup, { answer: "delayed train, to-do list, guilt [1]", citations: cite(A) }, urls, ALL);
  assert.equal(result.pass, false);
  assert.deepEqual(result.problems, ["cited 1 of the expected entries, needed 2"]);
});

test("a citation outside an only pool fails", () => {
  const result = checkAnswer(lookup, { answer: "delayed train, to-do list, guilt", citations: cite(A, B, OTHER) }, urls, ALL);
  assert.deepEqual(result.problems, ["cited 1 entry outside the expected set"]);
});

test("a url that isn't a sample page counts as outside the pool", () => {
  const stray: Citation = { n: 3, label: "Daily Seed", date: "2025-12-29", url: "https://example.com/x" };
  const result = checkAnswer(lookup, { answer: "delayed train, to-do list, guilt", citations: [...cite(A, B), stray] }, urls, ALL);
  assert.deepEqual(result.problems, ["cited 1 entry outside the expected set"]);
});

test("missing facts and too few anyOf matches fail, naming the fact", () => {
  const result = checkAnswer(lookup, { answer: "Only the delayed train.", citations: cite(A, B) }, urls, ALL);
  assert.equal(result.pass, false);
  assert.deepEqual(result.problems, [
    "missing fact: 2 of delayed train, to-do list, calling home (found 1)",
    "missing fact: one of guilt",
  ]);
});

test("citing the same entry twice counts once", () => {
  const result = checkAnswer(lookup, { answer: "delayed train, to-do list, guilt", citations: cite(A, A) }, urls, ALL);
  assert.deepEqual(result.problems, ["cited 1 of the expected entries, needed 2"]);
});

test("with no pool, any sample entry counts", () => {
  const monthly: EvalCase = { type: "Over time", question: "What was each month's tone?", cites: { atLeast: 3 }, facts: [{ anyOf: ["overwhelmed"] }] };
  assert.equal(checkAnswer(monthly, { answer: "Overwhelmed in spring.", citations: cite(A, C, OTHER) }, urls, ALL).pass, true);
  const short = checkAnswer(monthly, { answer: "Overwhelmed in spring.", citations: cite(A) }, urls, ALL);
  assert.deepEqual(short.problems, ["cited 1 of the expected entries, needed 3"]);
});

test("with only false, citations outside the pool are allowed", () => {
  const themes: EvalCase = { ...lookup, cites: { from: ["seed:2025-12-29"], atLeast: 1, only: false }, facts: [] };
  assert.equal(checkAnswer(themes, { answer: "", citations: cite(A, OTHER) }, urls, ALL).pass, true);
});

// ---- runEvals and output ----

const cases: EvalCase[] = Array.from({ length: 7 }, (_, i) => ({
  type: "Lookup",
  question: `Question ${i + 1}`,
  cites: { atLeast: 1 },
  facts: [{ anyOf: ["yes"] }],
}));

test("every case is reported, a throw fails only its case, and the total counts passes", async () => {
  const asked: string[] = [];
  const seen: string[] = [];
  const results = await runEvals(
    cases,
    async (question) => {
      asked.push(question);
      if (question === "Question 3") throw new Error("Voyage returned 500");
      return { answer: question === "Question 5" ? "no" : "yes", citations: cite(A) };
    },
    urls,
    ALL,
    (r) => seen.push(r.case.question),
  );

  assert.deepEqual(asked, cases.map((c) => c.question));
  assert.deepEqual(seen, asked);
  assert.deepEqual(results.map((r) => r.pass), [true, true, false, true, false, true, true]);
  assert.deepEqual(results[2].problems, ["error: Voyage returned 500"]);
  assert.equal(formatTotal(results), "5/7 passed");
  assert.equal(anyFailed(results), true);
  assert.equal(anyFailed(results.filter((r) => r.pass)), false);
});

test("each result prints PASS or FAIL with the type, question and problems", () => {
  assert.equal(formatResult({ case: lookup, pass: true, problems: [] }), `PASS  Lookup: ${lookup.question}`);
  assert.equal(
    formatResult({ case: lookup, pass: false, problems: ["missing fact: one of guilt"] }),
    `FAIL  Lookup: ${lookup.question}\n      missing fact: one of guilt`,
  );
});

// ---- Refusal ----

test("only the sample database with every entry embedded may be evaluated", () => {
  assert.equal(evalRefusal("sample"), null);
  assert.equal(evalRefusal("sample", 0), null);
  assert.match(evalRefusal(null) ?? "", /isn't marked as sample data/);
  assert.match(evalRefusal(null, 0) ?? "", /Nothing was sent/);
  assert.match(evalRefusal("sample", 12) ?? "", /12 entries .*no embedding.*\n.*npm run embed/);
});

// ---- The fixed today ----

test("last week is the final week of sample data however far the dates moved", async () => {
  const dataset = await readSampleDataset();
  assert.equal(evalToday(0, dataset), "2026-01-05");

  for (const weeks of [0, 1, 41, 93]) {
    const today = evalToday(weeks, dataset);
    assert.equal(today, addDays("2026-01-05", weeks * 7));
    const shifted = shiftDataset(dataset, weeks);
    const range = parseDateRange("What did I say I could let go of last week?", today)!;
    const inRange = shifted.seeds.filter((p) => {
      const d = flattenProperty(p.properties.Date) as string;
      return d >= range.from && d <= range.to;
    });
    const keys = resolveKeys({ ...lookup, cites: { from: Array.from({ length: 7 }, (_, i) => `seed:${addDays("2025-12-29", i)}`), atLeast: 1 } });
    assert.deepEqual(inRange.map((p) => p.id).sort(), [...keys].sort(), `shifted ${weeks} weeks`);
  }
});

// ---- sample/evals.json ----

const BRIEF: [string, string][] = [
  ["Lookup", "What did I say I could let go of last week?"],
  ["Filter", "What was going on during the weeks I felt Overwhelmed?"],
  ["Filter + meaning", "What has my body been asking for on Tired days?"],
  ["Relation", "How has my morning meditation intention actually gone?"],
  ["Over time", "What have been the biggest changes in priorities?"],
  ["Over time", "What recurring themes haven't I made progress on?"],
  ["Over time", "What was each month's tone?"],
];

test("sample/evals.json holds the brief's seven questions, every key names a sample entry, and each routes by rules", async () => {
  const file: EvalFile = JSON.parse(await readFile(new URL("../sample/evals.json", import.meta.url), "utf8"));
  const dataset = await readSampleDataset();
  const entries = new Set(sampleEntryIds(dataset));
  assert.equal(sampleUrls(dataset).size, dataset.seeds.length + dataset.roots.length + dataset.blossoms.length);

  assert.deepEqual(file.cases.map((c) => [c.type, c.question]), BRIEF);
  for (const c of file.cases) {
    resolveKeys(c).forEach((id, i) => assert.ok(entries.has(id), `${c.question}: ${c.cites.from![i]}`));
    assert.ok(c.cites.atLeast >= 1, c.question);
    assert.ok(c.facts.length >= 1, c.question);
    for (const fact of c.facts) assert.ok((fact.atLeast ?? 1) <= fact.anyOf.length, c.question);

    const route = routeByRules(c.question);
    assert.ok(route, c.question);
    assert.equal(route.type, c.type.toLowerCase(), c.question);
  }
});
