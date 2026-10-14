// Made-up Garden Within pages for demos and evals, kept in sample/garden.json.
// Dates in the file are fixed; loading moves them by whole weeks so the newest
// Seed falls in the past week and every Week Of stays a Monday.
import { readFile } from "node:fs/promises";
import type { PageObjectResponse } from "@notionhq/client";
import { flattenProperty, toEntry, type Entry } from "./notion";
import { SOURCES, type Source } from "./template";

export interface SampleDataset {
  note: string;
  seeds: PageObjectResponse[];
  roots: PageObjectResponse[];
  blossoms: PageObjectResponse[];
}

const LISTS = { seed: "seeds", root: "roots", blossom: "blossoms" } as const;

export async function readSampleDataset(): Promise<SampleDataset> {
  return JSON.parse(await readFile(new URL("../../sample/garden.json", import.meta.url), "utf8"));
}

const DAY_MS = 86_400_000;

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

// Moves a date (YYYY-MM-DD) or timestamp by whole days, in UTC like dates.ts.
function shiftIso(value: string, days: number): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(Date.parse(`${value}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
  }
  return new Date(Date.parse(value) + days * DAY_MS).toISOString();
}

// Whole weeks that put the newest Seed between today - 6 and today.
export function shiftWeeksFor(dataset: SampleDataset, today: string): number {
  const dates = dataset.seeds
    .map((page) => (page.properties.Date ? flattenProperty(page.properties.Date) : null))
    .filter((d): d is string => typeof d === "string")
    .sort();
  const newest = dates.at(-1);
  return newest ? Math.floor(daysBetween(newest.slice(0, 10), today) / 7) : 0;
}

// Returns a copy with every date moved: page timestamps and every date,
// created_time and last_edited_time property, matched by type rather than name.
export function shiftDataset(dataset: SampleDataset, weeks: number): SampleDataset {
  const days = weeks * 7;
  const copy = structuredClone(dataset);
  for (const page of [...copy.seeds, ...copy.roots, ...copy.blossoms]) {
    page.created_time = shiftIso(page.created_time, days);
    page.last_edited_time = shiftIso(page.last_edited_time, days);
    for (const value of Object.values(page.properties)) {
      if (value.type === "date" && value.date) {
        value.date.start = shiftIso(value.date.start, days);
        if (value.date.end) value.date.end = shiftIso(value.date.end, days);
      } else if (value.type === "created_time") value.created_time = shiftIso(value.created_time, days);
      else if (value.type === "last_edited_time") value.last_edited_time = shiftIso(value.last_edited_time, days);
    }
  }
  return copy;
}

// Maps the pages the same way ingest maps real ones.
export function sampleEntries(dataset: SampleDataset): Record<Source, Entry[]> {
  return Object.fromEntries(
    SOURCES.map((def) => [def.source, dataset[LISTS[def.source]].map((page) => toEntry(page, def))]),
  ) as Record<Source, Entry[]>;
}
