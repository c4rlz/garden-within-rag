import { db } from "./db";

// What the connected database holds. The dataset table is only filled in by
// npm run sample:load; the real database leaves it empty or doesn't have it yet.
export async function datasetKind(): Promise<"sample" | null> {
  const table = await db().query("select to_regclass('dataset') is not null as present");
  if (!table.rows[0].present) return null;
  const { rows } = await db().query("select kind from dataset limit 1");
  return rows[0]?.kind === "sample" ? "sample" : null;
}

// Weeks npm run sample:load moved the sample dates by.
export async function shiftWeeks(): Promise<number> {
  const { rows } = await db().query("select shift_weeks from dataset where kind = 'sample' limit 1");
  return rows[0]?.shift_weeks ?? 0;
}

export async function markSample(shiftWeeks: number): Promise<void> {
  await db().query(
    `insert into dataset (kind, shift_weeks) values ('sample', $1)
     on conflict (kind) do update set loaded_at = now(), shift_weeks = excluded.shift_weeks`,
    [shiftWeeks],
  );
}
