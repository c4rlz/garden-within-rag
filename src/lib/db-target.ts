// Decides, without connecting, whether two Postgres URLs could reach the same
// database. Used to keep the sample loader away from the real entries, so it errs
// toward "could be the same": anything it can't read counts as a match.

export interface DbTarget {
  server: string; // "local" for the socket, localhost, 127.0.0.1 and ::1
  port: number;
  database: string;
}

type Env = Record<string, string | undefined>;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function normaliseServer(host: string): string {
  const h = host.toLowerCase().replace(/^\[(.+)\]$/, "$1");
  return h.startsWith("/") || LOCAL_HOSTS.has(h) ? "local" : h;
}

// Fills in missing parts the way pg does: ?host=, then the URL host, then PGHOST;
// port from ?port=, the URL or PGPORT; database from the path, PGDATABASE, then the user.
export function parseDbTarget(url: string, env: Env = process.env): DbTarget | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") return null;
    const query = parsed.searchParams;

    const host = query.get("host") || decodeURIComponent(parsed.hostname) || env.PGHOST || "localhost";
    // pg can try several hosts in turn; don't guess which one it reaches.
    if (host.includes(",")) return null;

    const port = Number(query.get("port") || parsed.port || env.PGPORT || 5432);
    if (!Number.isInteger(port) || port <= 0) return null;

    const user = query.get("user") || decodeURIComponent(parsed.username) || env.PGUSER || env.USER;
    const database = decodeURIComponent(parsed.pathname.slice(1)) || env.PGDATABASE || user;
    if (!database) return null;

    return { server: normaliseServer(host), port, database };
  } catch {
    return null;
  }
}

// Ports are ignored on purpose: two local servers on different ports still count
// as one, so a matching database name is enough to refuse.
export function couldBeSameDatabase(a: string, b: string, env: Env = process.env): boolean {
  const x = parseDbTarget(a, env);
  const y = parseDbTarget(b, env);
  if (!x || !y) return true;
  return x.server === y.server && x.database === y.database;
}
