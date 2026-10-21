// Checks for npm run eval, kept free of I/O so they can be tested. The cases
// live in sample/evals.json and name entries by their sample generator keys.
import type { Answer } from "./answer";
import { addDays, startOfWeek } from "./dates";
import { flattenProperty } from "./notion";
import { uuidFromKey, type SampleDataset } from "./sample";

export interface EvalCase {
  type: string; // the brief's type, e.g. "Filter + meaning"
  question: string;
  cites: {
    from?: string[]; // keys like "seed:2025-12-29"; left out, any sample Seed or Root counts
    atLeast: number; // distinct entries from the pool that must be cited
    only?: boolean; // every citation must come from the pool
  };
  facts: { anyOf: string[]; atLeast?: number }[]; // case-insensitive substrings of the answer
}

export interface EvalFile {
  note: string;
  cases: EvalCase[];
}

export interface EvalResult {
  case: EvalCase;
  pass: boolean;
  problems: string[];
}

// Page url to page id. Loading moves dates but not urls, so this is read from
// sample/garden.json rather than the database.
export function sampleUrls(dataset: SampleDataset): Map<string, string> {
  return new Map([...dataset.seeds, ...dataset.roots, ...dataset.blossoms].map((page) => [page.url, page.id]));
}

// The ids of every sample Seed and Root, the pool when a case names none.
export function sampleEntryIds(dataset: SampleDataset): string[] {
  return [...dataset.seeds, ...dataset.roots].map((page) => page.id);
}

export function resolveKeys(c: EvalCase): string[] {
  return (c.cites.from ?? []).map(uuidFromKey);
}

// The cited entries, each once. A url that isn't a sample page stays as the url.
export function citedIds(answer: Pick<Answer, "citations">, urlToId: Map<string, string>): string[] {
  return [...new Set(answer.citations.map((c) => urlToId.get(c.url) ?? c.url))];
}

function plural(n: number, word: string, many = `${word}s`): string {
  return `${n} ${n === 1 ? word : many}`;
}

export function checkAnswer(
  c: EvalCase,
  answer: Pick<Answer, "answer" | "citations">,
  urlToId: Map<string, string>,
  allEntries: string[],
): { pass: boolean; problems: string[] } {
  const problems: string[] = [];
  const pool = new Set(c.cites.from ? resolveKeys(c) : allEntries);
  const cited = citedIds(answer, urlToId);

  const inPool = cited.filter((id) => pool.has(id)).length;
  if (inPool < c.cites.atLeast) {
    problems.push(`cited ${inPool} of the expected entries, needed ${c.cites.atLeast}`);
  }
  const outside = cited.length - inPool;
  if (c.cites.only && outside > 0) problems.push(`cited ${plural(outside, "entry", "entries")} outside the expected set`);

  const text = answer.answer.toLowerCase();
  for (const fact of c.facts) {
    const needed = fact.atLeast ?? 1;
    const found = fact.anyOf.filter((s) => text.includes(s.toLowerCase())).length;
    if (found >= needed) continue;
    problems.push(
      needed === 1
        ? `missing fact: one of ${fact.anyOf.join(", ")}`
        : `missing fact: ${needed} of ${fact.anyOf.join(", ")} (found ${found})`,
    );
  }

  return { pass: problems.length === 0, problems };
}

// Asks every case in order. A thrown error fails that case and the rest still run.
export async function runEvals(
  cases: EvalCase[],
  ask: (question: string) => Promise<Pick<Answer, "answer" | "citations">>,
  urlToId: Map<string, string>,
  allEntries: string[],
  onResult: (result: EvalResult) => void = () => {},
): Promise<EvalResult[]> {
  const results: EvalResult[] = [];
  for (const c of cases) {
    let result: EvalResult;
    try {
      result = { case: c, ...checkAnswer(c, await ask(c.question), urlToId, allEntries) };
    } catch (err) {
      result = { case: c, pass: false, problems: [`error: ${err instanceof Error ? err.message : String(err)}`] };
    }
    onResult(result);
    results.push(result);
  }
  return results;
}

export function formatResult(r: EvalResult): string {
  return [`${r.pass ? "PASS" : "FAIL"}  ${r.case.type}: ${r.case.question}`, ...r.problems.map((p) => `      ${p}`)].join("\n");
}

export function formatTotal(results: EvalResult[]): string {
  return `${results.filter((r) => r.pass).length}/${results.length} passed`;
}

export function anyFailed(results: EvalResult[]): boolean {
  return results.some((r) => !r.pass);
}

// Why the evals must not run, or null if they may. They only run on the sample
// database, and only once every entry with writing is embedded, so nothing is
// sent to Claude or Voyage for a run that can't pass.
export function evalRefusal(kind: "sample" | null, unembedded = 0): string | null {
  if (kind !== "sample") {
    return [
      "Refusing to run the evals: this database isn't marked as sample data. Nothing was sent.",
      "The expected results only hold for the sample. Load it with npm run sample:load (see README → Sample data).",
    ].join("\n");
  }
  if (unembedded > 0) {
    return [
      `Refusing to run the evals: ${plural(unembedded, "entry", "entries")} with writing ${unembedded === 1 ? "has" : "have"} no embedding yet. Nothing was sent.`,
      "Run DATABASE_URL=postgres:///garden_within_sample npm run embed first.",
    ].join("\n");
  }
  return null;
}

// The day the evals treat as today: the Monday after the newest sample Seed,
// moved by the weeks the loader shifted. Then "last week" is always the final
// week of data, whatever weekday the sample was loaded on.
export function evalToday(shiftWeeks: number, dataset: SampleDataset): string {
  const newest = dataset.seeds
    .map((page) => (page.properties.Date ? flattenProperty(page.properties.Date) : null))
    .filter((d): d is string => typeof d === "string")
    .sort()
    .at(-1);
  if (!newest) throw new Error("The sample dataset has no dated Seeds.");
  return addDays(startOfWeek(newest.slice(0, 10)), 7 + shiftWeeks * 7);
}
