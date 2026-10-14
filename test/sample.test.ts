import { test } from "node:test";
import assert from "node:assert/strict";
import type { PageObjectResponse } from "@notionhq/client";
import { generateSample } from "../scripts/generate-sample";
import { parseDateRange } from "../src/lib/dates";
import { flattenProperty } from "../src/lib/notion";
import { readSampleDataset, sampleEntries, shiftDataset, shiftWeeksFor, type SampleDataset } from "../src/lib/sample";

const text = (s: string) => ({ type: "rich_text", rich_text: s ? [{ plain_text: s }] : [] });
const ids = (...list: string[]) => ({ type: "relation", relation: list.map((id) => ({ id })) });

const SEED = "11111111-1111-5111-8111-111111111111";
const ROOT = "22222222-2222-5222-8222-222222222222";
const BLOSSOM = "33333333-3333-5333-8333-333333333333";

// One of each, linked both ways, shaped like sample/garden.json.
const tiny = {
  note: "Made-up sample data for a test.",
  seeds: [
    {
      object: "page",
      id: SEED,
      created_time: "2025-02-03T15:00:00.000Z",
      last_edited_time: "2025-02-03T19:00:00.000Z",
      in_trash: false,
      url: "https://sample.invalid/garden-within/seed-1",
      properties: {
        Title: { type: "title", title: [{ plain_text: "Sample Daily Seed" }] },
        Date: { type: "date", date: { start: "2025-02-03", end: null } },
        "Energy Tone": { type: "multi_select", multi_select: [{ name: "Tired" }] },
        Blossoms: ids(BLOSSOM),
        "What can I let go of?": text("The to-do list I didn't finish."),
        "What wants clarity?": text(""),
      },
    },
  ],
  roots: [
    {
      object: "page",
      id: ROOT,
      created_time: "2025-02-09T20:00:00.000Z",
      last_edited_time: "2025-02-09T22:00:00.000Z",
      in_trash: false,
      url: "https://sample.invalid/garden-within/root-1",
      properties: {
        Title: { type: "title", title: [{ plain_text: "Sample Weekly Root" }] },
        "Week Of": { type: "date", date: { start: "2025-02-03", end: null } },
        "Created Date": { type: "created_time", created_time: "2025-02-09T20:00:00.000Z" },
        "Tone / Feeling": { type: "select", select: { name: "Overwhelmed" } },
        "🌸 Priorities": ids(BLOSSOM),
        "🌸 Blossom": ids(BLOSSOM),
        Highlights: text("A busy week."),
      },
    },
  ],
  blossoms: [
    {
      object: "page",
      id: BLOSSOM,
      created_time: "2025-01-10T17:00:00.000Z",
      last_edited_time: "2025-03-01T18:00:00.000Z",
      in_trash: false,
      url: "https://sample.invalid/garden-within/blossom-1",
      properties: {
        Title: { type: "title", title: [{ plain_text: "Sample: Start mornings with 5 minute meditation" }] },
        "Ideated At": { type: "created_time", created_time: "2025-01-10T17:00:00.000Z" },
        Status: { type: "select", select: { name: "Sprouts" } },
        "🌱 Daily Seeds": ids(SEED),
        "🌿 Weekly Roots": ids(ROOT),
      },
    },
  ],
} as unknown as SampleDataset;

test("sample pages map to entries and links like real pages", () => {
  const { seed, root, blossom } = sampleEntries(tiny);

  assert.equal(seed[0].source, "seed");
  assert.equal(seed[0].entryDate, "2025-02-03");
  assert.deepEqual(seed[0].tones, ["Tired"]);
  assert.deepEqual(seed[0].written, { "What can I let go of?": "The to-do list I didn't finish." });
  assert.deepEqual(seed[0].links, [{ toId: BLOSSOM, property: "Blossoms" }]);
  assert.equal(seed[0].url, "https://sample.invalid/garden-within/seed-1");

  assert.equal(root[0].source, "root");
  assert.equal(root[0].entryDate, "2025-02-03");
  assert.deepEqual(root[0].tones, ["Overwhelmed"]);
  assert.deepEqual(root[0].links, [
    { toId: BLOSSOM, property: "🌸 Priorities" },
    { toId: BLOSSOM, property: "🌸 Blossom" },
  ]);

  assert.equal(blossom[0].source, "blossom");
  assert.equal(blossom[0].entryDate, "2025-01-10");
  assert.equal(blossom[0].status, "Sprouts");
  assert.deepEqual(blossom[0].links, [
    { toId: SEED, property: "🌱 Daily Seeds" },
    { toId: ROOT, property: "🌿 Weekly Roots" },
  ]);
});

// ---- Helpers for the generated dataset ----

const sample = generateSample();
const allPages = (ds: SampleDataset) => [...ds.seeds, ...ds.roots, ...ds.blossoms];
const value = (page: PageObjectResponse, name: string) => flattenProperty(page.properties[name]);
const str = (page: PageObjectResponse, name: string) => value(page, name) as string | null;
const list = (page: PageObjectResponse, name: string) => value(page, name) as string[];
const titleOf = (page: PageObjectResponse) => str(page, "Title") ?? "";
const weekday = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).getUTCDay();
const addDays = (iso: string, days: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const msBetween = (a: string, b: string) => Date.parse(b) - Date.parse(a);

// ---- Date shift ----

test("the shift puts the newest Seed in the past week and last week has let-go answers", () => {
  // Every weekday from Monday 2026-10-12 to Sunday 2026-10-18, plus a date before the sample.
  const todays = [0, 1, 2, 3, 4, 5, 6].map((n) => addDays("2026-10-12", n)).concat("2024-06-05");
  for (const today of todays) {
    const shifted = shiftDataset(sample, shiftWeeksFor(sample, today));
    const newest = shifted.seeds.map((p) => str(p, "Date")!).sort().at(-1)!;
    assert.ok(newest >= addDays(today, -6) && newest <= today, `${today}: newest Seed ${newest}`);

    for (const root of shifted.roots) assert.equal(weekday(str(root, "Week Of")!), 1, `${today}: Week Of is a Monday`);

    const lastWeek = parseDateRange("What did I say I could let go of last week?", today)!;
    const letGo = shifted.seeds.filter((p) => {
      const d = str(p, "Date")!;
      return d >= lastWeek.from && d <= lastWeek.to && str(p, "What can I let go of?");
    });
    assert.equal(letGo.length, 7, `${today}: let-go answers last week`);
  }
});

test("the shift moves every date by the same whole number of weeks and leaves the input alone", () => {
  const before = JSON.stringify(sample);
  const weeks = shiftWeeksFor(sample, "2026-10-14");
  const shifted = shiftDataset(sample, weeks);
  assert.equal(JSON.stringify(sample), before);
  assert.ok(weeks !== 0);

  const ms = weeks * 7 * 86_400_000;
  const days = weeks * 7;
  for (const kind of ["seeds", "roots", "blossoms"] as const) {
    sample[kind].forEach((page, i) => {
      const moved = shifted[kind][i];
      assert.equal(msBetween(page.created_time, moved.created_time), ms);
      assert.equal(msBetween(page.last_edited_time, moved.last_edited_time), ms);
    });
  }
  sample.seeds.forEach((p, i) => assert.equal(str(shifted.seeds[i], "Date"), addDays(str(p, "Date")!, days)));
  sample.roots.forEach((p, i) => {
    assert.equal(str(shifted.roots[i], "Week Of"), addDays(str(p, "Week Of")!, days));
    assert.equal(msBetween(str(p, "Created Date")!, str(shifted.roots[i], "Created Date")!), ms);
  });
  sample.blossoms.forEach((p, i) => {
    assert.equal(msBetween(str(p, "Ideated At")!, str(shifted.blossoms[i], "Ideated At")!), ms);
  });
});

// ---- The committed dataset ----

test("sample/garden.json is what the generator writes", async () => {
  assert.deepEqual(await readSampleDataset(), JSON.parse(JSON.stringify(generateSample())));
});

test("every sample page is labeled, has a stable-looking id and a placeholder url", () => {
  assert.match(sample.note, /^Made-up sample data/);
  const pages = allPages(sample);
  for (const page of pages) {
    assert.ok(titleOf(page).startsWith("Sample"), titleOf(page));
    assert.match(page.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    assert.ok(page.url.startsWith("https://sample.invalid/"), page.url);
  }
  assert.equal(new Set(pages.map((p) => p.id)).size, pages.length);
});

test("written text never names a weekday or month, since dates move at load time", () => {
  const names = /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|January|February|March|April|June|July|August|September|October|November|December)\b/;
  for (const page of allPages(sample)) {
    for (const [name, prop] of Object.entries(page.properties)) {
      if (prop.type === "rich_text" || prop.type === "title") assert.doesNotMatch(String(value(page, name) ?? ""), names);
    }
  }
});

test("Seeds skip some days and Roots cover every week", () => {
  const days = sample.roots.length * 7;
  const coverage = sample.seeds.length / days;
  assert.ok(coverage >= 0.8 && coverage <= 0.9, `coverage ${coverage}`);
  assert.equal(new Set(sample.seeds.map((p) => str(p, "Date"))).size, sample.seeds.length);

  const mondays = sample.roots.map((p) => str(p, "Week Of")!);
  assert.equal(mondays.length, 52);
  mondays.forEach((m, i) => {
    assert.equal(weekday(m), 1);
    if (i > 0) assert.equal(m, addDays(mondays[i - 1], 7));
  });

  // Not every prompt is answered every day.
  for (const prompt of ["What Matters Today?", "What wants clarity?", "What became clearer?", "What is my body asking for?"]) {
    const filled = sample.seeds.filter((p) => str(p, prompt)).length;
    assert.ok(filled > 0 && filled < sample.seeds.length, prompt);
  }
});

test("relations are stored in both directions", () => {
  const byId = new Map(allPages(sample).map((p) => [p.id, p]));
  for (const seed of sample.seeds) {
    for (const id of list(seed, "Blossoms")) assert.ok(list(byId.get(id)!, "🌱 Daily Seeds").includes(seed.id));
  }
  for (const root of sample.roots) {
    for (const id of [...list(root, "🌸 Priorities"), ...list(root, "🌸 Blossom")]) {
      assert.ok(list(byId.get(id)!, "🌿 Weekly Roots").includes(root.id));
    }
  }
  for (const blossom of sample.blossoms) {
    for (const id of list(blossom, "🌱 Daily Seeds")) assert.ok(list(byId.get(id)!, "Blossoms").includes(blossom.id));
    for (const id of list(blossom, "🌿 Weekly Roots")) {
      const root = byId.get(id)!;
      assert.ok([...list(root, "🌸 Priorities"), ...list(root, "🌸 Blossom")].includes(blossom.id));
    }
  }
});

test("there is material for each of the seven questions", () => {
  // Blossoms: every Status, and a meditation Blossom many Seeds and Roots link to.
  assert.deepEqual(
    new Set(sample.blossoms.map((p) => str(p, "Status"))),
    new Set(["Seeds", "Sprouts", "Bloomed", "Archived", "Blossoms"]),
  );
  const meditation = sample.blossoms.find((p) => titleOf(p) === "Sample: Start mornings with 5 minute meditation");
  assert.ok(meditation);
  assert.ok(list(meditation, "🌱 Daily Seeds").length > 50);
  assert.ok(list(meditation, "🌿 Weekly Roots").length > 20);

  // Overwhelmed weeks and Tired days with body answers.
  assert.ok(sample.roots.filter((p) => str(p, "Tone / Feeling") === "Overwhelmed").length >= 4);
  const tired = sample.seeds.filter((p) => list(p, "Energy Tone").includes("Tired"));
  assert.ok(tired.filter((p) => str(p, "What is my body asking for?")).length >= 20);

  // Priorities change week to week, and between the start and the end.
  const priorities = sample.roots.map((p) => [...list(p, "🌸 Priorities")].sort().join(","));
  assert.ok(new Set(priorities).size > 10);
  assert.notEqual(priorities[0], priorities.at(-1));

  // Recurring themes linked to Blossoms that never reach Bloomed.
  const themes = sample.blossoms.filter(
    (p) => p !== meditation && ["Seeds", "Sprouts"].includes(str(p, "Status")!) && list(p, "🌱 Daily Seeds").length >= 10,
  );
  assert.ok(themes.length >= 2, `${themes.length} theme Blossoms`);

  // Months whose dominant Root tone differs.
  const byMonth = new Map<string, Map<string, number>>();
  for (const root of sample.roots) {
    const month = str(root, "Week Of")!.slice(0, 7);
    const counts = byMonth.get(month) ?? new Map<string, number>();
    const tone = str(root, "Tone / Feeling")!;
    counts.set(tone, (counts.get(tone) ?? 0) + 1);
    byMonth.set(month, counts);
  }
  const dominant = [...byMonth.values()].map((counts) => [...counts].sort((a, b) => b[1] - a[1])[0][0]);
  assert.ok(new Set(dominant).size >= 3, `dominant tones: ${dominant.join(", ")}`);
});
