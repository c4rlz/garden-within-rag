// Shapes rows into the landing page's views: a year of daily Energy Tones,
// month-by-month tone bars and Blossoms by Status. Kept free of I/O so it can
// be tested without a database; the reads are in garden-data.ts.
import { monthLabel, monthlyToneCounts, monthsBetween, type Row } from "./answer";
import { addDays, startOfWeek } from "./dates";
import { ENERGY_TONES, ROOT_TONES } from "./router";

export const WINDOW_DAYS = 365;

// The Blossom Status options in the template, in the order they're worked through.
export const STATUSES = ["Seeds", "Sprouts", "Blossoms", "Bloomed", "Archived"];

// One fixed color per tone, as the name of a CSS custom property set in
// globals.css for light and dark. Seed and Root tones never share a bar, so each
// list takes the categorical slots in order and the two lists reuse hues.
export const TONE_COLORS: Record<string, string> = Object.fromEntries(
  [...ENERGY_TONES, ...ROOT_TONES].map((tone) => [tone, `--tone-${tone.toLowerCase()}`]),
);

export type ToneRow = Pick<Row, "source" | "entry_date" | "tones">;
export type BlossomRow = Pick<Row, "title" | "status" | "url">;

export interface DayCell {
  date: string; // YYYY-MM-DD
  tones: string[]; // Energy Tones in ENERGY_TONES order, empty for no Seed
}

export interface Segment {
  tone: string;
  count: number;
  start: number; // the counts stacked below this one
}

export interface MonthBar {
  month: string; // YYYY-MM
  label: string; // "Oct 2026"
  seeds: Segment[];
  roots: Segment[];
}

export interface StatusColumn {
  status: string;
  blossoms: { title: string; url: string }[];
}

// The last WINDOW_DAYS days ending today, inclusive.
export function yearWindow(today: string): { from: string; to: string } {
  return { from: addDays(today, -(WINDOW_DAYS - 1)), to: today };
}

// One cell per day in the window, oldest first. A day's tones are every
// template Energy Tone on its Seeds, each once.
export function dayCells(rows: ToneRow[], today: string): DayCell[] {
  const { from, to } = yearWindow(today);
  const byDate = new Map<string, Set<string>>();
  for (const row of rows) {
    if (row.source !== "seed" || !row.entry_date || row.entry_date < from || row.entry_date > to) continue;
    const tones = byDate.get(row.entry_date) ?? new Set();
    for (const tone of row.tones) tones.add(tone);
    byDate.set(row.entry_date, tones);
  }
  return Array.from({ length: WINDOW_DAYS }, (_, i) => {
    const date = addDays(from, i);
    const tones = byDate.get(date);
    return { date, tones: ENERGY_TONES.filter((t) => tones?.has(t)) };
  });
}

// Monday = 0, matching startOfWeek.
function weekday(iso: string): number {
  return (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
}

// Monday-to-Sunday columns of seven slots. The first and last are padded with
// null so each day sits in its weekday's row.
export function weekColumns(cells: DayCell[]): (DayCell | null)[][] {
  if (cells.length === 0) return [];
  const slots: (DayCell | null)[] = [...Array<null>(weekday(cells[0].date)).fill(null), ...cells];
  while (slots.length % 7 !== 0) slots.push(null);
  return Array.from({ length: slots.length / 7 }, (_, i) => slots.slice(i * 7, i * 7 + 7));
}

// "2026-10-19: Tired, Happy", or "2026-10-19: no Energy Tone".
export function cellTitle(cell: DayCell): string {
  return `${cell.date}: ${cell.tones.length > 0 ? cell.tones.join(", ") : "no Energy Tone"}`;
}

function segments(counts: Record<string, number>, tones: string[]): Segment[] {
  const out: Segment[] = [];
  let start = 0;
  for (const tone of tones) {
    const count = counts[tone] ?? 0;
    if (count === 0) continue;
    out.push({ tone, count, start });
    start += count;
  }
  return out;
}

// Each month the window touches, oldest first, gaps included. Seeds count when
// dated in the window. A Root counts when its Monday-to-Sunday week overlaps the
// window, in its Monday's month, so it's dropped if that month is before the window.
export function monthBars(rows: ToneRow[], today: string): MonthBar[] {
  const { from, to } = yearWindow(today);
  const firstMonday = startOfWeek(from);
  const inWindow = rows.filter(
    (r) =>
      !!r.entry_date &&
      r.entry_date <= to &&
      ((r.source === "seed" && r.entry_date >= from) || (r.source === "root" && r.entry_date >= firstMonday)),
  );
  const counts = new Map(monthlyToneCounts(inWindow).map((m) => [m.month, m]));
  return monthsBetween(from.slice(0, 7), to.slice(0, 7)).map((month) => {
    const m = counts.get(month);
    return {
      month,
      label: monthLabel(month),
      seeds: m ? segments(m.seeds, ENERGY_TONES) : [],
      roots: m ? segments(m.roots, ROOT_TONES) : [],
    };
  });
}

// The total a bar stacks to.
export function barTotal(segs: Segment[]): number {
  return segs.reduce((sum, s) => sum + s.count, 0);
}

// One column per Status in STATUSES order, titles sorted. No Status counts as
// Seeds, as in hasProgress; a Status outside the template list is dropped.
export function blossomsByStatus(rows: BlossomRow[]): StatusColumn[] {
  return STATUSES.map((status) => ({
    status,
    blossoms: rows
      .filter((r) => (r.status ?? "Seeds") === status)
      .map((r) => ({ title: r.title, url: r.url }))
      .sort((a, b) => a.title.localeCompare(b.title)),
  }));
}
