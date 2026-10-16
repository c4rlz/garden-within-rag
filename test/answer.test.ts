import { test } from "node:test";
import assert from "node:assert/strict";
import {
  answerFilter,
  answerFilterMeaning,
  answerMonthlyTone,
  answerPriorities,
  answerQuestion,
  answerRelation,
  answerThemes,
  biggestChanges,
  citationsFrom,
  filterPrompt,
  linkedEntryIds,
  monthLabel,
  monthlyToneCounts,
  parseBlossomReply,
  parseMonthSummaries,
  parseThemeSummaries,
  pickBlossom,
  priorityChanges,
  priorityTimeline,
  priorityWeeks,
  scoreBlossoms,
  spreadPick,
  titleWords,
  weeksOf,
  type Answer,
  type EmbeddedRow,
  type Link,
  type PriorityChange,
  type Row,
} from "../src/lib/answer";
import { addDays } from "../src/lib/dates";
import { ENERGY_TONES } from "../src/lib/router";
import { VoyageError } from "../src/lib/voyage";

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
      answerFilterMeaning: async (q: string, tone: string) => {
        calls.push(`filter + meaning ${tone}`);
        return stubAnswer(q, "filter + meaning");
      },
      answerRelation: async (q: string, today: string) => {
        calls.push(`relation ${today}`);
        return stubAnswer(q, "relation");
      },
      answerPriorities: async (q: string, today: string) => {
        calls.push(`priorities ${today}`);
        return stubAnswer(q, "priorities");
      },
      answerMonthlyTone: async (q: string, today: string) => {
        calls.push(`monthly tone ${today}`);
        return stubAnswer(q, "monthly tone");
      },
      answerThemes: async (q: string, today: string) => {
        calls.push(`themes ${today}`);
        return stubAnswer(q, "themes");
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

test("an over-time question with no sub-type says so without calling any answerer or Claude", async () => {
  const { calls, deps } = stubDeps();
  const result = await answerQuestion("How have I changed over time?", TODAY, deps);
  assert.match(result.answer, /change over time aren't supported yet/);
  assert.deepEqual(result.citations, []);
  assert.deepEqual(calls, []);
});

test("theme questions go to answerThemes", async () => {
  const { calls, deps } = stubDeps();
  const result = await answerQuestion("What recurring themes haven't I made progress on?", TODAY, deps);
  assert.equal(result.answer, "themes");
  assert.deepEqual(calls, [`themes ${TODAY}`]);
});

test("a question Claude classifies as over time, with no sub-type, isn't supported yet", async () => {
  const { calls, deps } = stubDeps();
  deps.classify = async () => "over time";
  const result = await answerQuestion("What keeps me going?", TODAY, deps);
  assert.match(result.answer, /change over time aren't supported yet/);
  assert.deepEqual(calls, []);
});

test("monthly tone questions go to answerMonthlyTone", async () => {
  const { calls, deps } = stubDeps();
  const result = await answerQuestion("What was each month's tone?", TODAY, deps);
  assert.equal(result.answer, "monthly tone");
  assert.deepEqual(calls, [`monthly tone ${TODAY}`]);
});

test("priority questions go to answerPriorities", async () => {
  const { calls, deps } = stubDeps();
  const result = await answerQuestion("What have been the biggest changes in priorities?", TODAY, deps);
  assert.equal(result.answer, "priorities");
  assert.deepEqual(calls, [`priorities ${TODAY}`]);
});

test("relation questions go to answerRelation", async () => {
  const { calls, deps } = stubDeps();
  const result = await answerQuestion("How has my morning meditation intention actually gone?", TODAY, deps);
  assert.equal(result.answer, "relation");
  assert.deepEqual(calls, [`relation ${TODAY}`]);
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

test("Energy Tone questions go to answerFilterMeaning with the template's spelling", async () => {
  const { calls, deps } = stubDeps();
  const result = await answerQuestion("What has my body been asking for on Tired days?", TODAY, deps);
  assert.equal(result.answer, "filter + meaning");
  assert.deepEqual(calls, ["filter + meaning Tired"]);
});

test("a filter + meaning classification with no tone lists the Energy Tones", async () => {
  const { calls, deps } = stubDeps();
  deps.classify = async () => "filter + meaning";
  const result = await answerQuestion("What did my body need on rough days?", TODAY, deps);
  assert.equal(result.answer, `Name an Energy Tone to filter by: ${ENERGY_TONES.join(", ")}.`);
  assert.deepEqual(calls, []);
});

const seed = (id: string, entry_date: string, embedding: number[] | null, content = `${id} text`): EmbeddedRow => ({
  ...row(id, "seed", entry_date, content, ["Tired"]),
  embedding,
});

const failingEmbed = async (): Promise<number[]> => {
  throw new Error("embedQuery should not be called");
};

test("filter + meaning filters first, then embeds the question, then ranks and asks Claude", async () => {
  const calls: string[] = [];
  let prompt = "";
  const seeds = [
    seed("far", "2026-09-01", [0, 1]),
    seed("near", "2026-09-10", [1, 0]),
    seed("mid", "2026-09-05", [1, 1]),
  ];
  const question = "What has my body been asking for on Tired days?";

  const result = await answerFilterMeaning(question, "Tired", TODAY, {
    seedsWithEnergyTone: async (tone) => {
      calls.push(`filter ${tone}`);
      return seeds;
    },
    queryRefusal: async () => {
      calls.push("refusal");
      return null;
    },
    embedQuery: async (q) => {
      calls.push(`embed ${q}`);
      return [1, 0];
    },
    complete: async (_system, p) => {
      calls.push("complete");
      prompt = p;
      return "Rest [1] and walks [3].";
    },
  });

  assert.deepEqual(calls, ["filter Tired", "refusal", `embed ${question}`, "complete"]);
  assert.equal(result.filter, "Days you felt Tired: 3 days, 3 searched");
  assert.equal(result.entriesConsidered, 3);
  assert.match(prompt, /the 3 days you felt Tired\. These are the 3 entries/);
  // Shown and cited in date order: far (09-01), mid (09-05), near (09-10).
  assert.ok(prompt.indexOf("far text") < prompt.indexOf("mid text"));
  assert.ok(prompt.indexOf("mid text") < prompt.indexOf("near text"));
  assert.deepEqual(result.citations, [
    { n: 1, label: "Daily Seed", date: "2026-09-01", url: "https://notion.so/far" },
    { n: 3, label: "Daily Seed", date: "2026-09-10", url: "https://notion.so/near" },
  ]);
  assert.doesNotMatch(result.answer, /searched/);
});

test("filter + meaning sends Claude only the 12 closest entries", async () => {
  // s00 is closest to [1, 0]; each later one points further away.
  const seeds = Array.from({ length: 15 }, (_, i) =>
    seed(`s${String(i).padStart(2, "0")}`, `2026-08-${String(i + 1).padStart(2, "0")}`, [1, i]),
  );
  let prompt = "";
  const result = await answerFilterMeaning("What did I need?", "Tired", TODAY, {
    seedsWithEnergyTone: async () => seeds,
    queryRefusal: async () => null,
    embedQuery: async () => [1, 0],
    complete: async (_system, p) => {
      prompt = p;
      return "ok";
    },
  });
  assert.equal(result.entriesConsidered, 12);
  assert.match(prompt, /s11 text/);
  for (const id of ["s12", "s13", "s14"]) assert.doesNotMatch(prompt, new RegExp(`${id} text`));
});

test("filter + meaning with no matching days calls neither Voyage nor Claude", async () => {
  const result = await answerFilterMeaning("What did I need on Low days?", "Low", TODAY, {
    seedsWithEnergyTone: async () => [],
    queryRefusal: async () => assert.fail("queryRefusal should not be called"),
    embedQuery: failingEmbed,
    complete: failingComplete,
  });
  assert.equal(result.filter, "Days you felt Low: 0 days");
  assert.equal(result.answer, "You didn't have any days where you felt Low.");
  assert.deepEqual(result.citations, []);
});

test("filter + meaning with no embeddings says semantic search isn't set up, sending nothing", async () => {
  const result = await answerFilterMeaning("What did I need?", "Tired", TODAY, {
    seedsWithEnergyTone: async () => [seed("a", "2026-09-01", null), seed("b", "2026-09-02", null), seed("c", "2026-09-03", null, "")],
    queryRefusal: async () => assert.fail("queryRefusal should not be called"),
    embedQuery: failingEmbed,
    complete: failingComplete,
  });
  assert.equal(result.filter, "Days you felt Tired: 3 days, 0 searched");
  assert.match(result.answer, /Semantic search isn't set up for this database/);
  assert.equal(result.entriesConsidered, 0);
});

test("filter + meaning on a database that refuses embedding gives the not-set-up answer", async () => {
  const result = await answerFilterMeaning("What did I need?", "Tired", TODAY, {
    seedsWithEnergyTone: async () => [seed("a", "2026-09-01", [1, 0])],
    queryRefusal: async () => "Refusing to embed",
    embedQuery: failingEmbed,
    complete: failingComplete,
  });
  assert.equal(result.filter, "Days you felt Tired: 1 day, 0 searched");
  assert.match(result.answer, /Semantic search isn't set up for this database/);
});

test("filter + meaning on days with no writing doesn't call Voyage or Claude", async () => {
  const result = await answerFilterMeaning("What did I need?", "Gentle", TODAY, {
    seedsWithEnergyTone: async () => [seed("a", "2026-09-01", null, "")],
    queryRefusal: async () => assert.fail("queryRefusal should not be called"),
    embedQuery: failingEmbed,
    complete: failingComplete,
  });
  assert.equal(result.filter, "Days you felt Gentle: 1 day, 0 searched");
  assert.match(result.answer, /didn't write any Seeds/);
});

test("partly embedded: searches only the embedded entries and says how many weren't searched", async () => {
  let prompt = "";
  const result = await answerFilterMeaning("What did I need?", "Tired", TODAY, {
    seedsWithEnergyTone: async () => [
      seed("e1", "2026-09-01", [1, 0]),
      seed("u1", "2026-09-02", null),
      seed("e2", "2026-09-03", [0, 1]),
      seed("u2", "2026-09-04", null),
      seed("e3", "2026-09-05", [1, 1]),
      seed("blank", "2026-09-06", null, ""), // a day, but not unsearched
    ],
    queryRefusal: async () => null,
    embedQuery: async () => [1, 0],
    complete: async (_system, p) => {
      prompt = p;
      return "Sleep [1].";
    },
  });
  assert.equal(result.filter, "Days you felt Tired: 6 days, 3 searched");
  assert.match(result.answer, /^Sleep \[1\]\.\n\n2 of these days weren't searched because they aren't embedded yet/);
  assert.doesNotMatch(prompt, /u1 text|u2 text/);
  assert.equal(result.entriesConsidered, 3);
});

test("a Voyage failure gives a short message and doesn't call Claude", async () => {
  const deps = (err: Error) => ({
    seedsWithEnergyTone: async () => [seed("a", "2026-09-01", [1, 0])],
    queryRefusal: async () => null,
    embedQuery: async (): Promise<number[]> => {
      throw err;
    },
    complete: failingComplete,
  });

  const voyage = await answerFilterMeaning("q", "Tired", TODAY, deps(new VoyageError("Voyage returned 500: boom", 500, null)));
  assert.equal(voyage.answer, "Semantic search failed: Voyage returned 500. Try again in a moment.");
  assert.deepEqual(voyage.citations, []);

  const missingKey = await answerFilterMeaning("q", "Tired", TODAY, deps(new Error("VOYAGE_API_KEY is not set. Add it to .env.local.")));
  assert.equal(missingKey.answer, "VOYAGE_API_KEY is not set. Add it to .env.local.");
  assert.doesNotMatch(missingKey.answer, /\n\s+at /);
});

const blossom = (id: string, title: string, content = "", status: string | null = "In progress"): Row => ({
  id,
  source: "blossom",
  title,
  entry_date: "2026-08-01",
  tones: [],
  status,
  url: `https://notion.so/${id}`,
  content,
});

const MEDITATION = blossom("b-med", "Sample: Start mornings with 5 minute meditation", "Five quiet minutes first.");
const WALKS = blossom("b-walk", "Sample: Walk after dinner");
const READING = blossom("b-read", "Sample: Read before bed");

test("titleWords ignores Sample:, case, common words and a simple plural s", () => {
  assert.deepEqual(titleWords("Sample: Start Mornings with 5 minute meditation"), new Set(["start", "morning", "5", "minute", "meditation"]));
  assert.deepEqual(titleWords("How has my morning meditation intention actually gone?"), new Set(["morning", "meditation"]));
  assert.deepEqual(titleWords("less stress"), new Set(["less", "stress"]));
});

test("scoreBlossoms counts shared words, highest first", () => {
  const scored = scoreBlossoms("How has my morning meditation intention actually gone?", [WALKS, MEDITATION, READING]);
  assert.equal(scored[0].row, MEDITATION);
  assert.equal(scored[0].score, 2);
  assert.deepEqual(scored.slice(1).map((s) => s.score), [0, 0]);
  assert.equal(pickBlossom(scored, "How has my morning meditation intention actually gone?"), MEDITATION);
});

test("pickBlossom gives up on a tie or a zero score", () => {
  assert.equal(pickBlossom(scoreBlossoms("How are my walks going?", [WALKS, blossom("b2", "Walk the dog")]), "How are my walks going?"), null);
  assert.equal(pickBlossom(scoreBlossoms("How is yoga going?", [WALKS, READING]), "How is yoga going?"), null);
});

test("pickBlossom leaves a weak one-word overlap to Claude", () => {
  const bread = blossom("b3", "Sample: Learn to bake bread");
  const question = "How has my intention to learn underwater basket weaving gone?";
  assert.equal(pickBlossom(scoreBlossoms(question, [bread, WALKS]), question), null);
});

test("parseBlossomReply accepts a listed title with or without Sample:, and nothing else", () => {
  const blossoms = [MEDITATION, WALKS];
  assert.equal(parseBlossomReply(' "Walk after dinner." ', blossoms), WALKS);
  assert.equal(parseBlossomReply("sample: walk after dinner", blossoms), WALKS);
  assert.equal(parseBlossomReply("none", blossoms), null);
  assert.equal(parseBlossomReply("Walk after lunch", blossoms), null);
});

test("linkedEntryIds reads every Seed and Root link, not the Blossom's 25-item list", () => {
  const seedIds = Array.from({ length: 30 }, (_, i) => `s${i}`);
  const links: Link[] = [
    // The Blossom's own back-relation, cut off at 25 by Notion.
    ...seedIds.slice(0, 25).map((id) => ({ from_id: "b-med", to_id: id, property: "🌱 Daily Seeds" })),
    { from_id: "b-med", to_id: "r1", property: "🌿 Weekly Roots" },
    // Each Seed's own list is complete.
    ...seedIds.map((id) => ({ from_id: id, to_id: "b-med", property: "Blossoms" })),
    { from_id: "r1", to_id: "b-med", property: "🌸 Blossom" },
    { from_id: "r1", to_id: "b-med", property: "🌸 Priorities" },
    { from_id: "r2", to_id: "b-med", property: "🌸 Priorities" },
    // Links to another Blossom.
    { from_id: "s99", to_id: "b-walk", property: "Blossoms" },
    { from_id: "r3", to_id: "b-walk", property: "🌸 Blossom" },
  ];
  const ids = linkedEntryIds(links, "b-med");
  assert.equal(ids.length, 32);
  assert.deepEqual(new Set(ids), new Set([...seedIds, "r1", "r2"]));
});

function relationDeps() {
  return {
    complete: failingComplete,
    allBlossoms: async () => [MEDITATION, WALKS, READING],
    linksTo: async (): Promise<Link[]> => assert.fail("linksTo should not be called"),
    entriesByIds: async (): Promise<Row[]> => assert.fail("entriesByIds should not be called"),
  };
}

test("a relation question sends the Blossom and its written linked entries to Claude, with citations", async () => {
  let system = "";
  let prompt = "";
  let askedIds: string[] = [];
  const linked = [
    row("s2", "seed", "2026-09-07", "sat for five minutes"),
    row("r1", "root", "2026-09-07", "meditated most days"),
    row("s1", "seed", "2026-09-02", "skipped it"),
    row("s3", "seed", "2026-09-10", ""), // counted, not sent
  ];

  const result = await answerRelation("How has my morning meditation intention actually gone?", TODAY, {
    ...relationDeps(),
    complete: async (s, p) => {
      system = s;
      prompt = p;
      return "It started rough [2] but settled [3][4], as you hoped [1].";
    },
    linksTo: async (id) => [
      { from_id: "s1", to_id: id, property: "Blossoms" },
      { from_id: "s2", to_id: id, property: "Blossoms" },
      { from_id: "s3", to_id: id, property: "Blossoms" },
      { from_id: "r1", to_id: id, property: "🌸 Blossom" },
      { from_id: "r1", to_id: id, property: "🌸 Priorities" },
    ],
    entriesByIds: async (ids) => {
      askedIds = ids;
      return linked;
    },
  });

  assert.deepEqual(askedIds, ["s1", "s2", "s3", "r1"]);
  assert.match(system, /Cite every claim/);
  assert.equal(result.filter, "Linked to Sample: Start mornings with 5 minute meditation: 4 entries");
  assert.equal(result.entriesConsidered, 4);
  assert.match(prompt, /\[1\] Blossom · [^\n]+Status: In progress\nFive quiet minutes first\./);
  // Date order, ties by source: s1 (09-02), r1 (root, 09-07), s2 (seed, 09-07).
  assert.match(prompt, /\[2\] Daily Seed[^\n]+\nskipped it/);
  assert.match(prompt, /\[3\] Weekly Root[^\n]+\nmeditated most days/);
  assert.match(prompt, /\[4\] Daily Seed[^\n]+\nsat for five minutes/);
  assert.doesNotMatch(prompt, /\[5\]/);
  assert.match(prompt, /Question: How has my morning meditation intention actually gone\?$/);
  assert.deepEqual(result.citations, [
    { n: 1, label: "Blossom", date: "2026-08-01", url: "https://notion.so/b-med" },
    { n: 2, label: "Daily Seed", date: "2026-09-02", url: "https://notion.so/s1" },
    { n: 3, label: "Weekly Root", date: "2026-09-07", url: "https://notion.so/r1" },
    { n: 4, label: "Daily Seed", date: "2026-09-07", url: "https://notion.so/s2" },
  ]);
});

test("with a tie, Claude picks the Blossom from the titles", async () => {
  const calls: string[] = [];
  const result = await answerRelation("How have my walks gone?", TODAY, {
    ...relationDeps(),
    allBlossoms: async () => [WALKS, blossom("b-dog", "Walk the dog")],
    complete: async (_s, p) => {
      if (p.startsWith("Blossoms:")) {
        calls.push("choose");
        assert.equal(p, "Blossoms:\nSample: Walk after dinner\nWalk the dog\n\nQuestion: How have my walks gone?");
        return "Walk the dog";
      }
      calls.push("answer");
      return "Good [2].";
    },
    linksTo: async (id) => [{ from_id: "s1", to_id: id, property: "Blossoms" }],
    entriesByIds: async () => [row("s1", "seed", "2026-09-02", "long walk")],
  });
  assert.deepEqual(calls, ["choose", "answer"]);
  assert.equal(result.filter, "Linked to Walk the dog: 1 entry");
});

test("when Claude says none after a tie, the closest titles are named and no answer is asked for", async () => {
  let completeCalls = 0;
  const result = await answerRelation("How have my walks gone?", TODAY, {
    ...relationDeps(),
    allBlossoms: async () => [WALKS, blossom("b-dog", "Walk the dog"), READING],
    complete: async () => {
      completeCalls++;
      return "none";
    },
  });
  assert.equal(completeCalls, 1);
  assert.equal(result.answer, "I couldn't find a Blossom matching that. Closest: Sample: Walk after dinner, Walk the dog.");
  assert.equal(result.filter, null);
  assert.deepEqual(result.citations, []);
});

test("closest matches stop at 3", async () => {
  const result = await answerRelation("How have my walks gone?", TODAY, {
    ...relationDeps(),
    allBlossoms: async () => ["a", "b", "c", "d"].map((id) => blossom(id, `Walk ${id}`)),
    complete: async () => "none",
  });
  assert.equal(result.answer, "I couldn't find a Blossom matching that. Closest: Walk a, Walk b, Walk c.");
});

test("with no word overlap and Claude saying none, no closest matches are invented", async () => {
  const result = await answerRelation("How has yoga gone?", TODAY, { ...relationDeps(), complete: async () => "none" });
  assert.equal(result.answer, "No Blossom matched that question.");
});

test("with no Blossoms at all, Claude isn't called", async () => {
  const result = await answerRelation("How has my meditation gone?", TODAY, { ...relationDeps(), allBlossoms: async () => [] });
  assert.equal(result.answer, "You don't have any Blossoms yet.");
});

test("a Blossom with nothing linked doesn't call Claude", async () => {
  const result = await answerRelation("How has my morning meditation gone?", TODAY, {
    ...relationDeps(),
    linksTo: async () => [],
    entriesByIds: async () => [],
  });
  assert.equal(result.filter, "Linked to Sample: Start mornings with 5 minute meditation: 0 entries");
  assert.equal(result.answer, 'Nothing is linked to "Sample: Start mornings with 5 minute meditation" yet.');
});

test("linked entries with no writing don't call Claude", async () => {
  const result = await answerRelation("How has my morning meditation gone?", TODAY, {
    ...relationDeps(),
    linksTo: async (id) => [
      { from_id: "s1", to_id: id, property: "Blossoms" },
      { from_id: "s2", to_id: id, property: "Blossoms" },
    ],
    entriesByIds: async () => [row("s1", "seed", "2026-09-01", ""), row("s2", "seed", "2026-09-02", "")],
  });
  assert.equal(result.filter, "Linked to Sample: Start mornings with 5 minute meditation: 2 entries");
  assert.equal(result.answer, '2 entries are linked to "Sample: Start mornings with 5 minute meditation", but none have writing.');
  assert.equal(result.entriesConsidered, 0);
});

const PA = blossom("pa", "Alpha");
const PB = blossom("pb", "Bravo");
const PC = blossom("pc", "Charlie");
const PD = blossom("pd", "Delta");
const PRIORITY_BLOSSOMS = [PA, PB, PC, PD];

const priorities = (rootId: string, ...ids: string[]): Link[] =>
  ids.map((to_id) => ({ from_id: rootId, to_id, property: "🌸 Priorities" }));

const sorted = (ids: Iterable<string>) => [...ids].sort();

// One Root per entry, linked to the listed Blossoms.
function weeksFrom(spec: [string, string[]][]) {
  const roots = spec.map(([date], i) => row(`r${i}`, "root", date));
  const links = spec.flatMap(([, ids], i) => priorities(`r${i}`, ...ids));
  return priorityWeeks(roots, links, PRIORITY_BLOSSOMS);
}

const summary = (changes: PriorityChange[]) =>
  changes.map((c) => ({ week: c.week.from, added: sorted(c.added), dropped: sorted(c.dropped), size: c.size }));

test("priorityWeeks merges two Roots in one week and sorts weeks by date", () => {
  const roots = [row("r3", "root", "2026-09-21"), row("r1", "root", "2026-09-07"), row("r2", "root", "2026-09-09")];
  const links = [...priorities("r3", "pc"), ...priorities("r1", "pa"), ...priorities("r2", "pb")];
  assert.deepEqual(
    priorityWeeks(roots, links, PRIORITY_BLOSSOMS).map((w) => [w.from, w.to, w.roots.map((r) => r.id), sorted(w.priorities)]),
    [
      ["2026-09-07", "2026-09-13", ["r1", "r2"], ["pa", "pb"]],
      ["2026-09-21", "2026-09-27", ["r3"], ["pc"]],
    ],
  );
});

test("priorityWeeks skips Roots with no priorities and ignores unknown Blossoms, other properties and non-Roots", () => {
  const roots = [row("r1", "root", "2026-09-07"), row("r2", "root", "2026-09-14"), row("r3", "root", "2026-09-21")];
  const links: Link[] = [
    ...priorities("r1", "pa", "gone"),
    { from_id: "r2", to_id: "pb", property: "🌸 Blossom" },
    ...priorities("s1", "pc"), // a Seed, not one of the Roots
    ...priorities("r3", "gone"),
  ];
  assert.deepEqual(
    priorityWeeks(roots, links, PRIORITY_BLOSSOMS).map((w) => [w.from, sorted(w.priorities)]),
    [["2026-09-07", ["pa"]]],
  );
});

test("priorityChanges treats the first week as the baseline and computes added and dropped", () => {
  const weeks = weeksFrom([
    ["2026-09-07", ["pa", "pb"]],
    ["2026-09-14", ["pb", "pc", "pd"]],
  ]);
  assert.deepEqual(summary(priorityChanges(weeks)), [{ week: "2026-09-14", added: ["pc", "pd"], dropped: ["pa"], size: 3 }]);
});

test("priorityChanges compares across a missing week and an empty Root, and leaves out unchanged weeks", () => {
  const roots = [
    row("r1", "root", "2026-09-07"),
    row("r2", "root", "2026-09-14"), // no priorities: not "dropped everything"
    row("r3", "root", "2026-09-28"), // 09-21 has no Root at all
    row("r4", "root", "2026-10-05"), // same as r3
  ];
  const links = [...priorities("r1", "pa"), ...priorities("r3", "pa", "pb"), ...priorities("r4", "pa", "pb")];
  const weeks = priorityWeeks(roots, links, PRIORITY_BLOSSOMS);
  assert.deepEqual(summary(priorityChanges(weeks)), [{ week: "2026-09-28", added: ["pb"], dropped: [], size: 1 }]);
});

test("biggestChanges ranks by added plus dropped, caps at 8, breaks ties by the earlier week, and shows in date order", () => {
  const sets = [["pa"], ["pa", "pb"], ["pc", "pd"], ["pc"], ["pa", "pb"], ["pa"], ["pb", "pc"], ["pb"], ["pd", "pa"], ["pd"], ["pd", "pc"]];
  const weeks = weeksFrom(sets.map((ids, i): [string, string[]] => [addDays("2026-06-01", 7 * i), ids]));
  const changes = priorityChanges(weeks);
  // Weeks 1–10 change by 1, 4, 1, 3, 1, 3, 1, 3, 1, 1.
  assert.deepEqual(changes.map((c) => c.size), [1, 4, 1, 3, 1, 3, 1, 3, 1, 1]);
  // The four big weeks, then the earliest four of the size-1 ties; weeks 9 and 10 miss out.
  assert.deepEqual(
    biggestChanges(changes).map((c) => c.week.from),
    [1, 2, 3, 4, 5, 6, 7, 8].map((i) => addDays("2026-06-01", 7 * i)),
  );
});

test("biggestChanges picks a bigger change over an earlier smaller one", () => {
  const weeks = weeksFrom([
    ["2026-09-07", ["pa"]],
    ["2026-09-14", ["pa", "pb"]], // +1
    ["2026-09-21", ["pc", "pd"]], // +2 −2
  ]);
  assert.deepEqual(biggestChanges(priorityChanges(weeks), 1).map((c) => c.week.from), ["2026-09-21"]);
});

test("priorityTimeline gives each priority's first week, last week and week count by title", () => {
  const weeks = weeksFrom([
    ["2026-09-07", ["pb"]],
    ["2026-09-14", ["pa", "pb"]],
    ["2026-09-28", ["pa"]],
  ]);
  assert.deepEqual(priorityTimeline(weeks, PRIORITY_BLOSSOMS), [
    { title: "Bravo", first: "2026-09-07", last: "2026-09-14", weeks: 2 },
    { title: "Alpha", first: "2026-09-14", last: "2026-09-28", weeks: 2 },
  ]);
});

function priorityDeps(roots: Row[], links: Link[]) {
  return {
    complete: failingComplete,
    allRoots: async () => roots,
    priorityLinks: async () => links,
    allBlossoms: async () => PRIORITY_BLOSSOMS,
  };
}

test("a priorities question sends Claude the numbered biggest changes and the timeline, citing each week's Root", async () => {
  let system = "";
  let prompt = "";
  const roots = [
    row("r1", "root", "2026-09-07", "settling in"),
    row("r2", "root", "2026-09-14", ""), // no writing, still cited
    row("r2b", "root", "2026-09-16", "midweek rethink"), // same week as r2
    row("r3", "root", "2026-09-21", "dropped the extras"),
  ];
  const links = [...priorities("r1", "pa"), ...priorities("r2", "pa", "pb"), ...priorities("r2b", "pc"), ...priorities("r3", "pd")];

  const result = await answerPriorities("What have been the biggest changes in priorities?", TODAY, {
    ...priorityDeps(roots, links),
    complete: async (s, p) => {
      system = s;
      prompt = p;
      return "You took on more [1], then narrowed to one [2]. [3]";
    },
  });

  assert.match(system, /already been worked out/);
  assert.equal(result.range, null);
  assert.equal(result.filter, "Priorities across 3 weeks: 2 changes shown");
  assert.equal(result.entriesConsidered, 4);
  assert.match(prompt, /covers your whole history/);
  assert.match(prompt, /\[1\] Weekly Root · week of 2026-09-14\nAdded: Bravo, Charlie\nmidweek rethink/);
  assert.match(prompt, /\[2\] Weekly Root · week of 2026-09-21\nAdded: Delta\nDropped: Alpha, Bravo, Charlie\ndropped the extras/);
  assert.doesNotMatch(prompt, /\[3\]/);
  assert.doesNotMatch(prompt, /settling in/); // the baseline week isn't a change
  assert.match(prompt, /<timeline>\nAlpha: week of 2026-09-07 to week of 2026-09-14 \(2 weeks\)\n/);
  assert.match(prompt, /Delta: week of 2026-09-21 to week of 2026-09-21 \(1 week\)\n<\/timeline>/);
  assert.match(prompt, /Question: What have been the biggest changes in priorities\?$/);
  assert.deepEqual(result.citations, [
    { n: 1, label: "Weekly Root", date: "2026-09-14", url: "https://notion.so/r2" },
    { n: 2, label: "Weekly Root", date: "2026-09-21", url: "https://notion.so/r3" },
  ]);
});

test("fewer than two weeks with priorities says there isn't enough history, without Claude", async () => {
  const roots = [row("r1", "root", "2026-09-07"), row("r2", "root", "2026-09-14")];
  for (const links of [[], priorities("r1", "pa")]) {
    const result = await answerPriorities("How have my priorities changed?", TODAY, priorityDeps(roots, links));
    assert.match(result.answer, /There isn't enough priority history yet/);
    assert.deepEqual(result.citations, []);
    assert.equal(result.entriesConsidered, 0);
  }
});

test("unchanged priorities say so without Claude", async () => {
  const roots = [row("r1", "root", "2026-09-07"), row("r2", "root", "2026-09-14")];
  const result = await answerPriorities(
    "How have my priorities changed?",
    TODAY,
    priorityDeps(roots, [...priorities("r1", "pa"), ...priorities("r2", "pa")]),
  );
  assert.equal(result.answer, "Your priorities stayed the same across 2 weeks.");
  assert.equal(result.filter, "Priorities across 2 weeks: 0 changes shown");
  assert.equal(result.entriesConsidered, 2);
});

test("a time phrase narrows the comparison to Roots in that range", async () => {
  let prompt = "";
  const roots = [row("old", "root", "2026-08-03"), row("r1", "root", "2026-09-21"), row("r2", "root", "2026-10-05")];
  const links = [...priorities("old", "pd"), ...priorities("r1", "pa"), ...priorities("r2", "pa", "pb")];
  const result = await answerPriorities("How have my priorities changed in the last 4 weeks?", TODAY, {
    ...priorityDeps(roots, links),
    complete: async (_s, p) => {
      prompt = p;
      return "You added one [1].";
    },
  });
  assert.deepEqual(result.range, { from: "2026-09-17", to: TODAY, label: "the last 4 weeks" });
  assert.equal(result.filter, "Priorities across 2 weeks: 1 change shown");
  assert.equal(result.entriesConsidered, 2);
  assert.match(prompt, /covers the last 4 weeks: 2026-09-17 to 2026-10-14/);
  assert.doesNotMatch(prompt, /Delta/);
  assert.deepEqual(result.citations, [{ n: 1, label: "Weekly Root", date: "2026-10-05", url: "https://notion.so/r2" }]);
});

test("a time phrase with too little history names the range", async () => {
  const roots = [row("r1", "root", "2026-09-07"), row("r2", "root", "2026-09-14")];
  const result = await answerPriorities(
    "How have my priorities changed last week?",
    TODAY,
    priorityDeps(roots, [...priorities("r1", "pa"), ...priorities("r2", "pb")]),
  );
  assert.match(result.answer, /There isn't enough priority history last week \(2026-10-05 to 2026-10-11\) yet/);
  assert.equal(result.range?.label, "last week");
});

const toned = (id: string, source: "seed" | "root", entry_date: string, tones: string[], content = `${id} text`) =>
  row(id, source, entry_date, content, tones);

test("monthlyToneCounts counts every Energy Tone on a Seed and keeps Seed and Root tones apart", () => {
  const [jan] = monthlyToneCounts([
    toned("s1", "seed", "2026-01-06", ["Tired", "Happy"]),
    toned("s2", "seed", "2026-01-07", ["Tired"]),
    toned("r1", "root", "2026-01-12", ["Grounded"]),
  ]);
  assert.deepEqual(jan, {
    month: "2026-01",
    seeds: { Tired: 2, Gentle: 0, Stressed: 0, Happy: 1, Low: 0 },
    roots: { Grounded: 1, Light: 0, Restless: 0, Energized: 0, Tender: 0, Overwhelmed: 0, Love: 0 },
  });
});

test("monthlyToneCounts covers every month oldest first, with zeros for a gap month and across a new year", () => {
  const months = monthlyToneCounts([
    toned("s2", "seed", "2026-02-10", ["Low"]),
    toned("s1", "seed", "2025-12-03", ["Gentle"]),
  ]);
  assert.deepEqual(months.map((m) => m.month), ["2025-12", "2026-01", "2026-02"]);
  assert.ok(Object.values(months[1].seeds).every((n) => n === 0));
  assert.ok(Object.values(months[1].roots).every((n) => n === 0));
  assert.equal(months[2].seeds.Low, 1);
});

test("monthlyToneCounts skips rows with no tones or no date, and drops tones outside the template", () => {
  const months = monthlyToneCounts([
    toned("s1", "seed", "2026-01-05", []),
    toned("s2", "seed", null as unknown as string, ["Tired"]),
    toned("s3", "seed", "2026-03-05", ["Calm"]), // a renamed option: not counted, doesn't stretch the span
    toned("s4", "seed", "2026-02-05", ["Happy", "Calm"]),
  ]);
  assert.deepEqual(months.map((m) => m.month), ["2026-02"]);
  assert.deepEqual(Object.keys(months[0].seeds), ENERGY_TONES);
  assert.equal(months[0].seeds.Happy, 1);
  assert.deepEqual(monthlyToneCounts([toned("s1", "seed", "2026-01-05", [])]), []);
});

test("monthlyToneCounts puts a Root in the month of its Week Of Monday", () => {
  const months = monthlyToneCounts([
    toned("r1", "root", "2026-03-30", ["Light"]), // a Monday: March
    toned("r2", "root", "2026-03-01", ["Tender"]), // a Sunday: the week of Feb 23
    toned("s1", "seed", "2026-03-01", ["Tired"]), // Seeds go by their own date
  ]);
  assert.deepEqual(
    months.map((m) => [m.month, m.roots.Light, m.roots.Tender, m.seeds.Tired]),
    [
      ["2026-02", 0, 1, 0],
      ["2026-03", 1, 0, 1],
    ],
  );
});

test("monthLabel and spreadPick", () => {
  assert.equal(monthLabel("2026-01"), "Jan 2026");
  assert.equal(monthLabel("2026-09"), "Sep 2026");
  const twelve = Array.from({ length: 12 }, (_, i) => i);
  const picked = spreadPick(twelve, 5);
  assert.equal(picked.length, 5);
  assert.equal(picked[0], 0);
  assert.equal(picked[4], 11);
  assert.deepEqual(spreadPick([1, 2, 3], 5), [1, 2, 3]);
});

test("parseMonthSummaries keeps only the months asked about", () => {
  const summaries = parseMonthSummaries(
    "Here you go:\n\n2026-01: Tired but steady [1].\n**2026-03:** Lighter [2].\n2026-05: Not asked.\n",
    ["2026-01", "2026-02", "2026-03"],
  );
  assert.deepEqual([...summaries], [
    ["2026-01", "Tired but steady [1]."],
    ["2026-03", "Lighter [2]."],
  ]);
});

function monthlyRows(): Row[] {
  const janSeeds = Array.from({ length: 7 }, (_, i) =>
    toned(`sj${i + 1}`, "seed", `2026-01-0${i + 1}`, i === 0 ? ["Tired", "Happy"] : ["Tired"]),
  );
  return [
    ...janSeeds,
    toned("sj8", "seed", "2026-01-08", ["Low"], ""), // no writing: counted, not sent
    toned("rj", "root", "2026-01-05", ["Grounded"], "jan root"),
    toned("rm", "root", "2026-03-09", ["Light"], "march root"),
    toned("sm", "seed", "2026-03-10", ["Gentle"], ""),
    toned("sx", "seed", "2026-03-11", []), // no tones: not counted
  ];
}

test("a monthly tone question sends Claude each month's counts and picked entries, and cites them", async () => {
  let system = "";
  let prompt = "";
  const result = await answerMonthlyTone("What was each month's tone?", TODAY, {
    seedsAndRoots: async () => monthlyRows(),
    complete: async (s, p) => {
      system = s;
      prompt = p;
      return "2026-01: You were tired but steady [1][4].\n2026-02: Should be ignored [2].\n2026-03: Lighter [7].";
    },
  });

  assert.match(system, /already been worked out/);
  assert.equal(result.range, null);
  assert.equal(result.filter, "Tones across 3 months");
  assert.equal(result.entriesConsidered, 11);
  assert.match(prompt, /covers your whole history/);
  assert.match(prompt, /## 2026-01 \(Jan 2026\)\nDaily Seeds: Tired 7, Happy 1, Low 1 · Weekly Roots: Grounded 1\n\n\[1\] Daily Seed/);
  // 5 of the 7 written Seeds, spread through the month, plus the Root.
  for (const id of ["sj1", "sj3", "sj4", "sj6", "sj7"]) assert.match(prompt, new RegExp(`${id} text`));
  for (const id of ["sj2", "sj5", "sx"]) assert.doesNotMatch(prompt, new RegExp(`${id} text`));
  assert.match(prompt, /\[4\] Weekly Root · .*\njan root/);
  assert.match(prompt, /\[7\] Weekly Root · .*\nmarch root/);
  assert.doesNotMatch(prompt, /\[8\]/);
  assert.doesNotMatch(prompt, /2026-02/);

  assert.equal(
    result.answer,
    [
      "**Jan 2026**\nDaily Seeds: Tired 7, Happy 1, Low 1 · Weekly Roots: Grounded 1\nYou were tired but steady [1][4].",
      "**Feb 2026**\nDaily Seeds: none · Weekly Roots: none\nNo entries this month",
      "**Mar 2026**\nDaily Seeds: Gentle 1 · Weekly Roots: Light 1\nLighter [7].",
    ].join("\n\n"),
  );
  assert.deepEqual(result.citations, [
    { n: 1, label: "Daily Seed", date: "2026-01-01", url: "https://notion.so/sj1" },
    { n: 4, label: "Weekly Root", date: "2026-01-05", url: "https://notion.so/rj" },
    { n: 7, label: "Weekly Root", date: "2026-03-09", url: "https://notion.so/rm" },
  ]);
});

test("a month with tones but no writing is summarised from its counts, and a missing summary gets a fixed line", async () => {
  let prompt = "";
  const result = await answerMonthlyTone("What was each month's tone?", TODAY, {
    seedsAndRoots: async () => [toned("s1", "seed", "2026-05-04", ["Stressed"], "")],
    complete: async (_s, p) => {
      prompt = p;
      return "I'm not sure.";
    },
  });
  assert.match(prompt, /## 2026-05 \(May 2026\)\nDaily Seeds: Stressed 1 · Weekly Roots: none\n\n\(no writing this month\)/);
  assert.equal(result.answer, "**May 2026**\nDaily Seeds: Stressed 1 · Weekly Roots: none\nNo summary for this month");
  assert.deepEqual(result.citations, []);
  assert.equal(result.entriesConsidered, 1);
});

test("no tones at all says so without Claude", async () => {
  const rows = [toned("s1", "seed", "2026-09-04", []), toned("s2", "seed", "2026-09-05", ["Calm"])];
  const result = await answerMonthlyTone("What was each month's tone?", TODAY, {
    seedsAndRoots: async () => rows,
    complete: failingComplete,
  });
  assert.equal(result.answer, "You didn't set any Energy Tones or Tones / Feelings.");
  assert.equal(result.filter, "Tones across 0 months");
  assert.deepEqual(result.citations, []);
  assert.equal(result.entriesConsidered, 0);

  const ranged = await answerMonthlyTone("What was my tone last month?", TODAY, {
    seedsAndRoots: async () => [toned("s1", "seed", "2026-08-04", ["Happy"])],
    complete: failingComplete,
  });
  assert.equal(ranged.answer, "You didn't set any Energy Tones or Tones / Feelings last month (2026-09-01 to 2026-09-30).");
});

test("a time phrase narrows the months counted", async () => {
  let prompt = "";
  const rows = [
    toned("old", "seed", "2026-08-10", ["Happy"]),
    toned("s1", "seed", "2026-09-15", ["Low"]),
    toned("r1", "root", "2026-09-20", ["Restless"]), // a Sunday, in the week of Sep 14
  ];
  const result = await answerMonthlyTone("What was my tone last month?", TODAY, {
    seedsAndRoots: async () => rows,
    complete: async (_s, p) => {
      prompt = p;
      return "2026-09: Restless and low [2].";
    },
  });
  assert.deepEqual(result.range, { from: "2026-09-01", to: "2026-09-30", label: "last month" });
  assert.equal(result.filter, "Tones across 1 month");
  assert.equal(result.entriesConsidered, 2);
  assert.match(prompt, /covers last month: 2026-09-01 to 2026-09-30/);
  assert.doesNotMatch(prompt, /2026-08|old text/);
  assert.deepEqual(result.citations, [{ n: 2, label: "Weekly Root", date: "2026-09-20", url: "https://notion.so/r1" }]);
});

const themed = (id: string, source: "seed" | "root", entry_date: string, embedding: number[] | null, content = `${id} text`): EmbeddedRow => ({
  ...row(id, source, entry_date, content),
  embedding,
});

const axis = (i: number) => Array.from({ length: 8 }, (_, j) => (j === i ? 1 : 0));

// n Seeds with the same vector, one a week from start.
const themeRows = (prefix: string, n: number, start: string, embedding: number[] | null): EmbeddedRow[] =>
  Array.from({ length: n }, (_, i) => themed(`${prefix}-${i + 1}`, "seed", addDays(start, 7 * i), embedding));

const BLOSSOM_SEEDS = blossom("b-seeds", "Sample: Journal more", "", "Seeds");
const BLOSSOM_NONE = blossom("b-none", "Sample: Rest days", "", null);
const BLOSSOM_SPROUTS = blossom("b-sprout", "Sample: Budget", "", "Sprouts");

// No embed function: theme questions never send anything to Voyage.
function themeDeps(
  rows: EmbeddedRow[],
  links: Link[] = [],
  complete: (system: string, prompt: string) => Promise<string> = failingComplete,
) {
  return {
    complete,
    embeddedSeedsAndRoots: async () => rows,
    relationLinks: async () => links,
    allBlossoms: async () => [BLOSSOM_SEEDS, BLOSSOM_NONE, BLOSSOM_SPROUTS],
  };
}

const THEMES_Q = "What recurring themes haven't I made progress on?";

test("parseThemeSummaries reads name and summary for the themes asked about", () => {
  const summaries = parseThemeSummaries(
    "Here:\n\nTheme 1: Rest — You keep coming back to rest [1].\n**Theme 2:** Self-care - Small things [3].\nTheme 4: Not asked — x [9].\nTheme 1: Duplicate — y.",
    3,
  );
  assert.deepEqual([...summaries], [
    [1, { name: "Rest", summary: "You keep coming back to rest [1]." }],
    [2, { name: "Self-care", summary: "Small things [3]." }],
  ]);
});

test("with no embeddings, theme questions aren't set up and Claude isn't called", async () => {
  const result = await answerThemes(THEMES_Q, TODAY, themeDeps(themeRows("t", 6, "2026-06-01", null)));
  assert.equal(result.answer, "Theme questions aren't set up for this database yet. See README → Privacy.");
  assert.equal(result.filter, "Recurring themes: 0");
  assert.equal(result.entriesConsidered, 0);
  assert.deepEqual(result.citations, []);
});

test("with no recurring themes, it says so without Claude and counts what wasn't embedded", async () => {
  const rows = [
    ...themeRows("t0", 4, "2026-06-01", axis(0)), // too few entries
    ...themeRows("t1", 6, "2026-06-01", axis(1)).map((r, i) => ({ ...r, entry_date: addDays("2026-06-01", i) })), // one week
    themed("plain", "root", "2026-06-07", null),
    themed("blank", "seed", "2026-06-08", null, " \n"), // embed skips it too, so it isn't counted
  ];
  const result = await answerThemes(THEMES_Q, TODAY, themeDeps(rows));
  assert.equal(
    result.answer,
    "None of your writing forms a recurring theme yet: a theme needs at least 5 entries over 3 different weeks.\n\n1 entry with writing wasn't included because it isn't embedded yet (run npm run embed).",
  );
  assert.equal(result.filter, "Recurring themes: 0");
  assert.equal(result.entriesConsidered, 10);
});

test("when every recurring theme has progress, it names how many without Claude", async () => {
  const rows = [...themeRows("t0", 5, "2026-06-01", axis(0)), ...themeRows("t1", 5, "2026-06-01", axis(1))];
  const links: Link[] = [
    { from_id: "t0-2", to_id: "b-sprout", property: "Blossoms" },
    { from_id: "t1-1", to_id: "b-seeds", property: "🌸 Blossom" },
    { from_id: "t1-4", to_id: "b-sprout", property: "🌸 Priorities" },
  ];
  const result = await answerThemes(THEMES_Q, TODAY, themeDeps(rows, links));
  assert.equal(result.answer, "All 2 recurring themes have a linked Blossom that's made progress.");
  assert.equal(result.filter, "Recurring themes: 2, 0 without progress");
  assert.equal(result.entriesConsidered, 10);
});

test("flagged themes go to Claude in one call, at most 6 by size with 5 examples each, and are cited", async () => {
  const rows = [
    ...themeRows("t0", 7, "2026-06-01", axis(0)),
    ...themeRows("t1", 6, "2026-06-02", axis(1)),
    ...[2, 3, 4, 5, 6].flatMap((k) => themeRows(`t${k}`, 5, addDays("2026-06-01", k), axis(k))),
    ...themeRows("t7", 5, "2026-06-01", axis(7)), // has progress
  ];
  const links: Link[] = [
    { from_id: "t0-1", to_id: "b-sprout", property: "Related" }, // not a relation prop
    { from_id: "t1-1", to_id: "b-seeds", property: "Blossoms" },
    { from_id: "t1-2", to_id: "b-none", property: "🌸 Blossom" },
    { from_id: "t1-3", to_id: "b-gone", property: "Blossoms" }, // not a known Blossom
    { from_id: "t7-3", to_id: "b-sprout", property: "🌸 Priorities" },
  ];
  const calls: { system: string; prompt: string }[] = [];
  const result = await answerThemes(
    THEMES_Q,
    TODAY,
    themeDeps(rows, links, async (system, prompt) => {
      calls.push({ system, prompt });
      return "Theme 1: Rest — You keep coming back to rest [1][5].\n**Theme 2:** Money worries — Bills [6].\nTheme 9: Ignored — x [30].";
    }),
  );

  assert.equal(calls.length, 1);
  const { system, prompt } = calls[0];
  assert.match(system, /already been found and checked/);
  assert.match(prompt, /covers your whole history/);
  assert.equal(prompt.match(/## Theme \d/g)?.length, 6);
  assert.match(prompt, /## Theme 1\n7 entries over 7 weeks\nLinked Blossoms: none\n\n\[1\] Daily Seed · .*\nt0-1 text/);
  assert.match(prompt, /## Theme 2\n6 entries over 6 weeks\nLinked Blossoms: Sample: Journal more \(Seeds\), Sample: Rest days \(no Status\)\n\n\[6\] /);
  // The 5 earliest of theme 1's identical vectors; the latest 5-entry theme and the one with progress are cut.
  assert.doesNotMatch(prompt, /t0-6 text|t1-6 text|t6-1 text|t7-1 text/);
  assert.match(prompt, /\[30\] /);
  assert.doesNotMatch(prompt, /\[31\]/);

  assert.equal(result.filter, "Recurring themes: 8, 7 without progress");
  assert.equal(result.entriesConsidered, 43);
  const blocks = result.answer.split("\n\n");
  assert.equal(blocks[0], "**Rest**\n7 entries over 7 weeks · Linked Blossoms: none\nYou keep coming back to rest [1][5].");
  assert.equal(
    blocks[1],
    "**Money worries**\n6 entries over 6 weeks · Linked Blossoms: Sample: Journal more (Seeds), Sample: Rest days (no Status)\nBills [6].",
  );
  assert.equal(blocks[2], "**Unnamed theme**\n5 entries over 5 weeks · Linked Blossoms: none\nNo summary for this theme");
  assert.equal(blocks.length, 7);
  assert.equal(blocks[6], "1 more theme without progress isn't shown.");
  assert.deepEqual(result.citations, [
    { n: 1, label: "Daily Seed", date: "2026-06-01", url: "https://notion.so/t0-1" },
    { n: 5, label: "Daily Seed", date: "2026-06-29", url: "https://notion.so/t0-5" },
    { n: 6, label: "Daily Seed", date: "2026-06-02", url: "https://notion.so/t1-1" },
  ]);
});

test("partly embedded: clusters the embedded entries and says how many weren't included", async () => {
  const rows = [...themeRows("t0", 5, "2026-06-01", axis(0)), ...themeRows("plain", 2, "2026-06-03", null)];
  const result = await answerThemes(THEMES_Q, TODAY, themeDeps(rows, [], async () => "Theme 1: Rest — Rest [2]."));
  assert.equal(result.filter, "Recurring themes: 1, 1 without progress");
  assert.equal(result.entriesConsidered, 5);
  assert.equal(
    result.answer,
    "**Rest**\n5 entries over 5 weeks · Linked Blossoms: none\nRest [2].\n\n2 entries with writing weren't included because they aren't embedded yet (run npm run embed).",
  );
});

test("a time phrase narrows the entries before clustering", async () => {
  // Sep 7 to Sep 28 are in last month; Aug 31 and Oct 5 aren't.
  const rows = themeRows("t0", 6, "2026-08-31", axis(0));
  rows.push(themed("t0-extra", "root", "2026-09-20", axis(0))); // a Sunday Root, in the week of Sep 14
  let prompt = "";
  const result = await answerThemes(
    "What recurring themes haven't I made progress on last month?",
    TODAY,
    themeDeps(rows, [], async (_s, p) => {
      prompt = p;
      return "Theme 1: Rest — Rest [1].";
    }),
  );
  assert.deepEqual(result.range, { from: "2026-09-01", to: "2026-09-30", label: "last month" });
  assert.equal(result.entriesConsidered, 5);
  assert.match(prompt, /covers last month: 2026-09-01 to 2026-09-30/);
  assert.match(prompt, /5 entries over 4 weeks/);
  assert.doesNotMatch(prompt, /t0-1 text|t0-6 text/);
  assert.deepEqual(result.citations, [{ n: 1, label: "Daily Seed", date: "2026-09-07", url: "https://notion.so/t0-2" }]);
});

test("a time phrase with no writing in it says so without Claude", async () => {
  const rows = themeRows("t0", 5, "2026-06-01", axis(0));
  const result = await answerThemes("What recurring themes haven't I made progress on this week?", TODAY, themeDeps(rows));
  assert.equal(result.answer, "You didn't write any Seeds or Roots this week (2026-10-12 to 2026-10-14).");
  assert.equal(result.entriesConsidered, 0);
});
