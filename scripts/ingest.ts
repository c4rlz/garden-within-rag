// Pulls all three Garden Within databases from Notion into Postgres.
import { datasetKind } from "../src/lib/dataset";
import { closeDb } from "../src/lib/db";
import { fetchPages, notionClient, parseNotionId, toEntry } from "../src/lib/notion";
import { syncSource } from "../src/lib/store";
import { SOURCES } from "../src/lib/template";

try {
  // Real entries must never end up in a database labeled as sample data.
  if ((await datasetKind()) === "sample") {
    throw new Error("This database is marked as sample data; point DATABASE_URL at the real database.");
  }
  const notion = notionClient();

  for (const def of SOURCES) {
    const configured = process.env[def.envVar];
    if (!configured) throw new Error(`${def.envVar} is not set. Paste the ${def.label} database URL into .env.local.`);

    const pages = await fetchPages(notion, parseNotionId(configured));
    const entries = pages.map((page) => toEntry(page, def));
    const { upserted, removed } = await syncSource(def.source, entries);
    const written = entries.filter((e) => e.content).length;
    console.log(`${def.label}s: ${upserted} pages (${written} with writing), ${removed} removed`);
  }
} finally {
  await closeDb();
}
