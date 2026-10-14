// Loads sample/garden.json into the sample database, never the real one.
// syncSource replaces every row of a source, so loading into the real database
// would wipe the real entries. Dates are shifted so the newest Seed is in the past week.
import { readFile } from "node:fs/promises";
import { couldBeSameDatabase, parseDbTarget } from "../src/lib/db-target";
import { markSample } from "../src/lib/dataset";
import { localToday } from "../src/lib/dates";
import { closeDb, db } from "../src/lib/db";
import { readSampleDataset, sampleEntries, shiftDataset, shiftWeeksFor } from "../src/lib/sample";
import { syncSource } from "../src/lib/store";
import { SOURCES } from "../src/lib/template";

const real = process.env.DATABASE_URL ?? "postgres:///garden_within_rag";
const sample = process.env.SAMPLE_DATABASE_URL ?? "postgres:///garden_within_sample";

if (couldBeSameDatabase(real, sample)) {
  const describe = (url: string) => {
    const target = parseDbTarget(url);
    return target ? `database ${target.database} on ${target.server === "local" ? "the local server" : target.server}` : "a URL that couldn't be read";
  };
  console.error("Refusing to load sample data: the sample database could be the real one.");
  console.error(`  DATABASE_URL:        ${describe(real)}`);
  console.error(`  SAMPLE_DATABASE_URL: ${describe(sample)}`);
  console.error("Point SAMPLE_DATABASE_URL at a separate database (see README → Sample data). Nothing was changed.");
  process.exit(1);
}

// db() reads DATABASE_URL on first use, so everything below talks to the sample database.
process.env.DATABASE_URL = sample;

try {
  const dataset = await readSampleDataset();
  const weeks = shiftWeeksFor(dataset, localToday());
  const entries = sampleEntries(shiftDataset(dataset, weeks));

  await db().query(await readFile(new URL("../db/schema.sql", import.meta.url), "utf8"));
  // Marked before loading, so even a half-finished load counts as sample data.
  await markSample(weeks);

  for (const def of SOURCES) {
    const { upserted, removed } = await syncSource(def.source, entries[def.source]);
    const written = entries[def.source].filter((e) => e.content).length;
    console.log(`${def.label}s: ${upserted} pages (${written} with writing), ${removed} removed`);
  }
  console.log(`Sample data loaded, dates moved by ${weeks} weeks.`);
} finally {
  await closeDb();
}
