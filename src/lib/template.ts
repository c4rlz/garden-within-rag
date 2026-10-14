// The three databases in the public Garden Within template. Property names are
// shared by every copy of the template, so only the database ids are configured.

export type Source = "seed" | "root" | "blossom";

export interface SourceDef {
  source: Source;
  label: string;
  envVar: string;
  // Date properties to try in order; falls back to the page's created time.
  dateProps: string[];
  toneProp?: string;
  statusProp?: string;
}

export const SOURCES: SourceDef[] = [
  {
    source: "seed",
    label: "Daily Seed",
    envVar: "NOTION_SEEDS_DB",
    dateProps: ["Date"],
    toneProp: "Energy Tone",
  },
  {
    source: "root",
    label: "Weekly Root",
    envVar: "NOTION_ROOTS_DB",
    // Weekly Roots are auto-created and Week Of is often left empty.
    dateProps: ["Week Of"],
    toneProp: "Tone / Feeling",
  },
  {
    source: "blossom",
    label: "Blossom",
    envVar: "NOTION_GARDEN_DB",
    dateProps: [],
    statusProp: "Status",
  },
];

export function sourceDef(source: Source): SourceDef {
  return SOURCES.find((s) => s.source === source)!;
}
