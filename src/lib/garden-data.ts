// The Postgres reads behind the landing page. The shaping is in garden.ts.
import { db } from "./db";
import { startOfWeek } from "./dates";
import { yearWindow, type BlossomRow, type ToneRow } from "./garden";

// Seeds and Roots from the Monday before the window starts, so a Root whose
// week overlaps the window is included, and every Blossom.
export async function gardenRows(today: string): Promise<{ entries: ToneRow[]; blossoms: BlossomRow[] }> {
  const { from, to } = yearWindow(today);
  const [entries, blossoms] = await Promise.all([
    db().query<ToneRow>(
      `select source, to_char(entry_date, 'YYYY-MM-DD') as entry_date, tones from entries
       where source in ('seed', 'root') and entry_date between $1 and $2 order by entry_date, source`,
      [startOfWeek(from), to],
    ),
    db().query<BlossomRow>(`select title, status, url from entries where source = 'blossom' order by title`),
  ]);
  return { entries: entries.rows, blossoms: blossoms.rows };
}
