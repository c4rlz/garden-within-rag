import { test } from "node:test";
import assert from "node:assert/strict";
import {
  answerFilter,
  answerFilterMeaning,
  answerQuestion,
  answerRelation,
  citationsFrom,
  filterPrompt,
  linkedEntryIds,
  parseBlossomReply,
  pickBlossom,
  scoreBlossoms,
  titleWords,
  weeksOf,
  type Answer,
  type EmbeddedRow,
  type Link,
  type Row,
} from "../src/lib/answer";
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
  const cases: [string, RegExp][] = [["What was each month's tone?", /change over time aren't supported yet/]];
  for (const [question, message] of cases) {
    const { calls, deps } = stubDeps();
    const result = await answerQuestion(question, TODAY, deps);
    assert.match(result.answer, message);
    assert.deepEqual(result.citations, []);
    assert.deepEqual(calls, [], question);
  }
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
