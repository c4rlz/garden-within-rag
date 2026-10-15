import { test } from "node:test";
import assert from "node:assert/strict";
import { answerFilter, answerQuestion, citationsFrom, filterPrompt, weeksOf, type Answer, type Row } from "../src/lib/answer";

const TODAY = "2026-10-14";

const row = (id: string, source: "seed" | "root", entry_date: string, content = `${id} text`, tones: string[] = []): Row => ({
  id,
  source,
  title: id,
  entry_date,
  tones,
  status: null,
  url: `https://notion.so/${id}`,
  content,
});

test("weeksOf puts a Sunday Root in its own Monday-to-Sunday week", () => {
  assert.deepEqual(weeksOf([{ entry_date: "2026-09-20" }]), [{ from: "2026-09-14", to: "2026-09-20" }]);
});

test("weeksOf removes duplicate weeks, sorts them and skips null dates", () => {
  const weeks = weeksOf([
    { entry_date: "2026-10-04" },
    { entry_date: null },
    { entry_date: "2026-09-16" },
    { entry_date: "2026-09-20" },
  ]);
  assert.deepEqual(weeks, [
    { from: "2026-09-14", to: "2026-09-20" },
    { from: "2026-09-28", to: "2026-10-04" },
  ]);
});

test("filterPrompt names the tone, the weeks, the numbered entries and the question", () => {
  const rows = [row("a", "seed", "2026-09-15", "felt rushed"), row("b", "root", "2026-09-20", "a heavy week", ["Overwhelmed"])];
  const prompt = filterPrompt("Overwhelmed", weeksOf(rows), rows, "What was going on?", TODAY);
  assert.match(prompt, /Today is 2026-10-14/);
  assert.match(prompt, /the 1 week you felt Overwhelmed: week of 2026-09-14\./);
  assert.match(prompt, /\[1\] Daily Seed · [^\n]+\nfelt rushed/);
  assert.match(prompt, /\[2\] Weekly Root · [^\n]+Tone \/ Feeling: Overwhelmed\na heavy week/);
  assert.match(prompt, /Question: What was going on\?$/);
});

test("citationsFrom maps [n] to rows in order and ignores numbers out of range", () => {
  const rows = [row("a", "seed", "2026-09-15"), row("b", "root", "2026-09-20")];
  assert.deepEqual(citationsFrom("x [2] y [1][2] z [0] [3]", rows), [
    { n: 1, label: "Daily Seed", date: "2026-09-15", url: "https://notion.so/a" },
    { n: 2, label: "Weekly Root", date: "2026-09-20", url: "https://notion.so/b" },
  ]);
});

const failingComplete = async (): Promise<string> => {
  throw new Error("complete should not be called");
};

test("with no Roots of that tone, Claude isn't called and the answer names the tone", async () => {
  const result = await answerFilter("What was going on when I felt Tender?", "Tender", TODAY, {
    complete: failingComplete,
    rootsWithTone: async () => [],
    seedsInWeeks: async () => assert.fail("seedsInWeeks should not be called"),
  });
  assert.match(result.answer, /Tender/);
  assert.deepEqual(result.citations, []);
  assert.equal(result.range, null);
});

test("a tone filter sends the Roots and their weeks' Seeds to Claude, with citations", async () => {
  const roots = [
    row("r1", "root", "2026-09-20", "launch week", ["Overwhelmed"]),
    row("r2", "root", "2026-10-04", "", ["Overwhelmed"]), // counted as a week, not sent
  ];
  const seeds = [row("s1", "seed", "2026-09-15", "so much to do"), row("s2", "seed", "2026-09-29", "boxes everywhere")];
  let weekStarts: string[] = [];
  let prompt = "";

  const result = await answerFilter("What was going on during the weeks I felt Overwhelmed?", "Overwhelmed", TODAY, {
    complete: async (_system, p) => {
      prompt = p;
      return "You were launching [1][3] and moving [9].";
    },
    rootsWithTone: async (tone) => (tone === "Overwhelmed" ? roots : []),
    seedsInWeeks: async (starts) => {
      weekStarts = starts;
      return seeds;
    },
  });

  assert.deepEqual(weekStarts, ["2026-09-14", "2026-09-28"]);
  assert.equal(result.filter, "Weeks you felt Overwhelmed: 2 weeks");
  assert.equal(result.range, null);
  assert.equal(result.entriesConsidered, 3);
  assert.doesNotMatch(prompt, /r2 text/);
  // Sorted by date: s1 (09-15), r1 (09-20), s2 (09-29).
  assert.deepEqual(result.citations, [
    { n: 1, label: "Daily Seed", date: "2026-09-15", url: "https://notion.so/s1" },
    { n: 3, label: "Daily Seed", date: "2026-09-29", url: "https://notion.so/s2" },
  ]);
});

test("weeks with the tone but no writing don't call Claude", async () => {
  const result = await answerFilter("What was going on?", "Restless", TODAY, {
    complete: failingComplete,
    rootsWithTone: async () => [row("r", "root", "2026-09-20", "", ["Restless"])],
    seedsInWeeks: async () => [],
  });
  assert.equal(result.filter, "Weeks you felt Restless: 1 week");
  assert.equal(result.entriesConsidered, 0);
});

const stubAnswer = (question: string, answer: string): Answer => ({
  question,
  range: null,
  filter: null,
  answer,
  citations: [],
  entriesConsidered: 0,
});

function stubDeps() {
  const calls: string[] = [];
  return {
    calls,
    deps: {
      classify: async () => {
        calls.push("classify");
        return "none";
      },
      answerLookup: async (q: string, today: string) => {
        calls.push(`lookup ${today}`);
        return stubAnswer(q, "lookup");
      },
      answerFilter: async (q: string, tone: string) => {
        calls.push(`filter ${tone}`);
        return stubAnswer(q, "filter");
      },
    },
  };
}

test("lookup questions still go to answerLookup", async () => {
  const { calls, deps } = stubDeps();
  const result = await answerQuestion("What did I say I could let go of last week?", TODAY, deps);
  assert.equal(result.answer, "lookup");
  assert.deepEqual(calls, [`lookup ${TODAY}`]);
});

test("tone questions go to answerFilter with the template's spelling", async () => {
  const { calls, deps } = stubDeps();
  await answerQuestion("What was going on during the weeks I felt overwhelmed?", TODAY, deps);
  assert.deepEqual(calls, ["filter Overwhelmed"]);
});

test("types not built yet say so without calling any answerer or Claude", async () => {
  const cases: [string, RegExp][] = [
    ["What has my body been asking for on Tired days?", /Energy Tone aren't supported yet/],
    ["How has my morning meditation intention actually gone?", /Blossom has gone aren't supported yet/],
    ["What was each month's tone?", /change over time aren't supported yet/],
  ];
  for (const [question, message] of cases) {
    const { calls, deps } = stubDeps();
    const result = await answerQuestion(question, TODAY, deps);
    assert.match(result.answer, message);
    assert.deepEqual(result.citations, []);
    assert.deepEqual(calls, [], question);
  }
});

test("a question Claude can't place is not supported", async () => {
  const { calls, deps } = stubDeps();
  const result = await answerQuestion("What keeps me going?", TODAY, deps);
  assert.match(result.answer, /isn't supported yet/);
  assert.deepEqual(calls, ["classify"]);
});

test("a filter classification with no tone asks for one", async () => {
  const { calls, deps } = stubDeps();
  deps.classify = async () => "filter";
  const result = await answerQuestion("What were my rough weeks like?", TODAY, deps);
  assert.match(result.answer, /Name a Tone \/ Feeling/);
  assert.deepEqual(calls, []);
});
