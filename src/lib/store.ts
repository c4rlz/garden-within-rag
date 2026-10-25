import { db } from "./db";
import type { Entry } from "./notion";
import type { Source } from "./template";

// Replaces everything stored for one source with the entries just fetched, so
// pages deleted in Notion disappear here too. An answer's embedding survives
// while its text is unchanged.
export async function syncSource(source: Source, entries: Entry[]): Promise<{ upserted: number; removed: number }> {
  const client = await db().connect();
  try {
    await client.query("begin");
    for (const e of entries) {
      await client.query(
        `insert into entries (id, source, title, entry_date, tones, status, url, written, fields, content, notion_last_edited, ingested_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
         on conflict (id) do update set
           source = excluded.source, title = excluded.title, entry_date = excluded.entry_date,
           tones = excluded.tones, status = excluded.status, url = excluded.url,
           written = excluded.written, fields = excluded.fields,
           content = excluded.content, notion_last_edited = excluded.notion_last_edited, ingested_at = now()`,
        [e.id, e.source, e.title, e.entryDate, e.tones, e.status, e.url, e.written, e.fields, e.content, e.lastEdited],
      );
      await client.query(
        "delete from answer_embeddings where entry_id = $1 and ($2::jsonb ->> prompt) is distinct from content",
        [e.id, e.written],
      );
      await client.query("delete from links where from_id = $1", [e.id]);
      for (const link of e.links) {
        await client.query("insert into links (from_id, to_id, property) values ($1, $2, $3) on conflict do nothing", [
          e.id,
          link.toId,
          link.property,
        ]);
      }
    }
    const ids = entries.map((e) => e.id);
    const removed = await client.query(
      "delete from entries where source = $1 and not (id = any($2::uuid[])) returning id",
      [source, ids],
    );
    await client.query("delete from links where not exists (select 1 from entries where entries.id = links.from_id)");
    await client.query("commit");
    return { upserted: entries.length, removed: removed.rowCount ?? 0 };
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}
