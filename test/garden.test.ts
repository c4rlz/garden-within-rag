import { test } from "node:test";
import assert from "node:assert/strict";
import { monthlyToneCounts } from "../src/lib/answer";
import { addDays } from "../src/lib/dates";
import {
  barTotal,
  blossomsByStatus,
  cellTitle,
  dayCells,
  monthBars,
  STATUSES,
  TONE_COLORS,
  weekColumns,
  yearWindow,
  type BlossomRow,
  type ToneRow,
} from "../src/lib/garden";
import { ENERGY_TONES, ROOT_TONES } from "../src/lib/router";

const TODAY = "2026-10-19"; // a Monday

const seed = (entry_date: string, ...tones: string[]): ToneRow => ({ source: "seed", entry_date, tones });
const root = (entry_date: string, ...tones: string[]): ToneRow => ({ source: "root", entry_date, tones });
const blossom = (title: string, status: string | null): BlossomRow => ({ title, status, url: `https://notion.so/${title}` });

const cellOn = (rows: ToneRow[], date: string, today = TODAY) => dayCells(rows, today).find((c) => c.date === date)!;

test("the window is the last 365 days ending today", () => {
  assert.deepEqual(yearWindow(TODAY), { from: "2025-10-20", to: TODAY });
  const cells = dayCells([], TODAY);
  assert.equal(cells.length, 365);
  assert.equal(cells[0].date, addDays(TODAY, -364));
  assert.equal(cells[364].date, TODAY);
});

test("the window counts a leap day as one of its 365 days", () => {
  const cells = dayCells([], "2028-03-10");
  assert.equal(cells.length, 365);
  assert.equal(cells[0].date, "2027-03-12");
  assert.ok(cells.some((c) => c.date === "2028-02-29"));
  assert.equal(new Set(cells.map((c) => c.date)).size, 365);
});

test("Seeds before the window or after today are left out", () => {
  const rows = [seed("2025-10-19", "Tired"), seed("2025-10-20", "Happy"), seed(TODAY, "Low"), seed("2026-10-20", "Gentle")];
  const cells = dayCells(rows, TODAY);
  assert.deepEqual(cells[0].tones, ["Happy"]);
  assert.deepEqual(cells[364].tones, ["Low"]);
  assert.equal(cells.filter((c) => c.tones.length > 0).length, 2);
});

test("a day with no Seed, or only tones outside the template, is empty", () => {
  const rows = [seed("2026-10-01", "Sleepy"), root("2026-10-02", "Grounded")];
  assert.deepEqual(cellOn(rows, "2026-10-01").tones, []);
  assert.deepEqual(cellOn(rows, "2026-10-02").tones, []);
  assert.deepEqual(cellOn(rows, "2026-10-03").tones, []);
  assert.equal(cellTitle(cellOn(rows, "2026-10-03")), "2026-10-03: no Energy Tone");
});

test("a Seed with several tones splits in ENERGY_TONES order, unknown tones dropped", () => {
  const cell = cellOn([seed("2026-10-01", "Happy", "Sleepy", "Tired")], "2026-10-01");
  assert.deepEqual(cell.tones, ["Tired", "Happy"]);
  assert.equal(cellTitle(cell), "2026-10-01: Tired, Happy");
});

test("two Seeds on the same day merge without duplicates", () => {
  const rows = [seed("2026-10-01", "Low", "Tired"), seed("2026-10-01", "Tired", "Gentle")];
  assert.deepEqual(cellOn(rows, "2026-10-01").tones, ["Tired", "Gentle", "Low"]);
});

test("week columns put each day in its weekday's row", () => {
  // 2025-10-21 is a Tuesday, so the window from 2026-10-20 starts on one too.
  const columns = weekColumns(dayCells([], "2026-10-20"));
  assert.ok(columns.every((col) => col.length === 7));
  assert.equal(columns[0][0], null);
  assert.equal(columns[0][1]?.date, "2025-10-21");
  assert.equal(columns.flat().filter(Boolean).length, 365);
  // Every Monday slot holds a Monday.
  for (const col of columns) if (col[0]) assert.equal(new Date(`${col[0].date}T00:00:00Z`).getUTCDay(), 1);
  const last = columns[columns.length - 1];
  assert.equal(last[1]?.date, "2026-10-20");
  assert.deepEqual(last.slice(2), [null, null, null, null, null]);
});

test("week columns of a window starting on a Monday need no leading padding", () => {
  const columns = weekColumns(dayCells([], TODAY));
  assert.equal(columns[0][0]?.date, "2025-10-20");
  assert.equal(columns.length, 53);
});

test("month bars cover every month the window touches, oldest first, gaps included", () => {
  const bars = monthBars([seed("2026-03-04", "Tired")], TODAY);
  assert.equal(bars.length, 13);
  assert.equal(bars[0].month, "2025-10");
  assert.equal(bars[0].label, "Oct 2025");
  assert.equal(bars[12].month, "2026-10");
  const april = bars.find((b) => b.month === "2026-04")!;
  assert.deepEqual(april.seeds, []);
  assert.deepEqual(april.roots, []);
});

test("month bar counts match monthlyToneCounts, in template order with zeros left out", () => {
  const rows = [
    seed("2026-09-01", "Happy", "Tired"),
    seed("2026-09-02", "Tired"),
    seed("2026-09-03", "Sleepy"),
    root("2026-09-07", "Love", "Grounded"),
    root("2026-09-14", "Grounded"),
  ];
  const sept = monthBars(rows, TODAY).find((b) => b.month === "2026-09")!;
  const expected = monthlyToneCounts(rows).find((m) => m.month === "2026-09")!;
  assert.deepEqual(sept.seeds, [
    { tone: "Tired", count: expected.seeds.Tired, start: 0 },
    { tone: "Happy", count: expected.seeds.Happy, start: 2 },
  ]);
  assert.deepEqual(sept.roots, [
    { tone: "Grounded", count: 2, start: 0 },
    { tone: "Love", count: 1, start: 2 },
  ]);
  assert.equal(barTotal(sept.seeds), 3);
});

test("a Root dated on a Sunday stays in its Monday's month", () => {
  // 2026-03-01 is a Sunday; its week starts Monday 2026-02-23.
  const bars = monthBars([root("2026-03-01", "Tender")], TODAY);
  assert.deepEqual(bars.find((b) => b.month === "2026-02")!.roots, [{ tone: "Tender", count: 1, start: 0 }]);
  assert.deepEqual(bars.find((b) => b.month === "2026-03")!.roots, []);
});

test("month bars leave out Seeds outside the window and Roots whose week is before it", () => {
  const rows = [seed("2025-10-19", "Tired"), root("2025-10-19", "Light"), seed("2026-10-20", "Low"), root("2025-10-20", "Love")];
  const bars = monthBars(rows, TODAY);
  assert.deepEqual(bars[0].seeds, []);
  assert.deepEqual(bars[0].roots, [{ tone: "Love", count: 1, start: 0 }]);
  assert.ok(bars.every((b) => b.seeds.length === 0));
});

test("segment starts add up to the bar's total", () => {
  const rows = ENERGY_TONES.flatMap((tone, i) => Array.from({ length: i + 1 }, (_, d) => seed(`2026-08-0${d + 1}`, tone)));
  const { seeds } = monthBars(rows, TODAY).find((b) => b.month === "2026-08")!;
  assert.deepEqual(seeds.map((s) => s.tone), ENERGY_TONES);
  for (let i = 1; i < seeds.length; i++) assert.equal(seeds[i].start, seeds[i - 1].start + seeds[i - 1].count);
  assert.equal(barTotal(seeds), 15);
});

test("Blossoms are grouped into the five Status columns in order", () => {
  const columns = blossomsByStatus([
    blossom("Walks", "Sprouts"),
    blossom("Garden", null),
    blossom("Bread", "Seeds"),
    blossom("Pottery", "Bloomed"),
    blossom("Choir", "Someday"),
  ]);
  assert.deepEqual(columns.map((c) => c.status), STATUSES);
  assert.deepEqual(columns.map((c) => c.status), ["Seeds", "Sprouts", "Blossoms", "Bloomed", "Archived"]);
  assert.deepEqual(columns[0].blossoms.map((b) => b.title), ["Bread", "Garden"]);
  assert.deepEqual(columns[1].blossoms, [{ title: "Walks", url: "https://notion.so/Walks" }]);
  assert.deepEqual(columns[2].blossoms, []);
  assert.deepEqual(columns[4].blossoms, []);
  // A Status outside the template list has no column.
  assert.equal(columns.flatMap((c) => c.blossoms).length, 4);
});

test("empty input gives empty but well-formed results", () => {
  const cells = dayCells([], TODAY);
  assert.equal(cells.length, 365);
  assert.ok(cells.every((c) => c.tones.length === 0));
  const bars = monthBars([], TODAY);
  assert.equal(bars.length, 13);
  assert.ok(bars.every((b) => b.seeds.length === 0 && b.roots.length === 0));
  const columns = blossomsByStatus([]);
  assert.equal(columns.length, 5);
  assert.ok(columns.every((c) => c.blossoms.length === 0));
  assert.deepEqual(weekColumns([]), []);
});

test("every tone has a color", () => {
  for (const tone of [...ENERGY_TONES, ...ROOT_TONES]) assert.match(TONE_COLORS[tone], /^--tone-[a-z]+$/);
});
