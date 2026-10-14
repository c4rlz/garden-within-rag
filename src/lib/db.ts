import pg from "pg";

let pool: pg.Pool | undefined;

export function db(): pg.Pool {
  pool ??= new pg.Pool({
    connectionString: process.env.DATABASE_URL ?? "postgres:///garden_within_rag",
  });
  return pool;
}

export async function closeDb(): Promise<void> {
  await pool?.end();
  pool = undefined;
}
