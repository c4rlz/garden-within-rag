// Grouping written answers into themes by their stored embeddings, kept free
// of I/O so it can be tested on small vectors. Nothing here calls Voyage.
import { startOfWeek } from "./dates";
import { cosineSimilarity } from "./search";

// How similar an answer must be to a theme's centroid to join it. Each
// embedding covers one short answer, so answers on the same topic in different
// words score lower than whole entries sharing a template did. An untuned
// starting value: lower merges more topics, higher splits one topic into several.
export const THEME_SIMILARITY = 0.7;

// A theme recurs when its answers come from at least this many entries over this many weeks.
export const MIN_THEME_ENTRIES = 5;
export const MIN_THEME_WEEKS = 3;

// How many flagged themes Claude names, and how many examples each one gets.
export const MAX_THEMES_SHOWN = 6;
export const EXAMPLES_PER_THEME = 5;

// Relation properties on the Seed and Root side. The Blossom's own lists
// (🌱 Daily Seeds, 🌿 Weekly Roots) stop at 25 items, so they're never read.
export const RELATION_PROPS = ["Blossoms", "🌸 Blossom", "🌸 Priorities"];

// A Blossom counts for a theme when at least this share of the theme's entries
// link to it, and that share is at least this many times its share across all
// clustered entries. The lift stops a Blossom most entries link to (like the
// meditation one) from counting for every theme. Untuned starting values.
export const MIN_LINK_SHARE = 0.3;
export const MIN_LINK_LIFT = 2;

export interface Clusterable {
  id: string; // unique per answer
  entry_id: string; // the entry the answer belongs to
  entry_date: string;
  embedding: number[];
}

export interface Cluster<T extends Clusterable> {
  members: T[]; // in date order
  centroid: number[]; // the mean of the members' vectors
}

// Greedy centroid clustering. Rows are taken in date order (ties by id), and
// each joins the cluster whose centroid it is most similar to if that is at
// least threshold, or starts a new one. Unlike linking every similar pair, a
// chain of loosely related answers can't merge into one huge theme. The fixed
// order keeps the result the same however the rows arrive.
export function clusterEntries<T extends Clusterable>(rows: T[], threshold = THEME_SIMILARITY): Cluster<T>[] {
  const sorted = [...rows].sort((a, b) => a.entry_date.localeCompare(b.entry_date) || a.id.localeCompare(b.id));
  const clusters: Cluster<T>[] = [];
  for (const row of sorted) {
    let best: Cluster<T> | null = null;
    let bestScore = -Infinity;
    for (const cluster of clusters) {
      const score = cosineSimilarity(row.embedding, cluster.centroid);
      if (score > bestScore) {
        best = cluster;
        bestScore = score;
      }
    }
    if (best && bestScore >= threshold) {
      const n = best.members.push(row);
      best.centroid = best.centroid.map((v, i) => v + (row.embedding[i] - v) / n);
    } else {
      clusters.push({ members: [row], centroid: [...row.embedding] });
    }
  }
  return clusters;
}

// How many Monday-to-Sunday weeks the entries fall in, the same rule as weeksOf.
export function weekCount(rows: { entry_date: string }[]): number {
  return new Set(rows.map((r) => startOfWeek(r.entry_date))).size;
}

// How many distinct entries the answers come from.
export function entryCount(rows: { entry_id: string }[]): number {
  return new Set(rows.map((r) => r.entry_id)).size;
}

// Counted by entry, so several answers from one entry count once.
export function isRecurring(cluster: Cluster<Clusterable>): boolean {
  return entryCount(cluster.members) >= MIN_THEME_ENTRIES && weekCount(cluster.members) >= MIN_THEME_WEEKS;
}

// The Blossoms that count for a theme, linked from the Seed and Root side by
// at least MIN_LINK_SHARE of the theme's entries and by MIN_LINK_LIFT times
// their share across allEntryIds (every clustered entry). Links to ids that
// aren't known Blossoms are dropped. In id order.
export function themeBlossomIds(
  themeEntryIds: Iterable<string>,
  allEntryIds: Iterable<string>,
  links: { from_id: string; to_id: string; property: string }[],
  blossomIds: Iterable<string>,
): string[] {
  const theme = new Set(themeEntryIds);
  const all = new Set(allEntryIds);
  const known = new Set(blossomIds);
  const linkers = new Map<string, Set<string>>(); // Blossom id -> entries linking to it
  for (const link of links) {
    if (!RELATION_PROPS.includes(link.property) || !known.has(link.to_id)) continue;
    if (!linkers.has(link.to_id)) linkers.set(link.to_id, new Set());
    linkers.get(link.to_id)!.add(link.from_id);
  }
  const shareOf = (from: Set<string>, entries: Set<string>) =>
    entries.size === 0 ? 0 : [...entries].filter((id) => from.has(id)).length / entries.size;
  return [...linkers]
    .filter(([, from]) => {
      const share = shareOf(from, theme);
      return share > 0 && share >= MIN_LINK_SHARE && share >= MIN_LINK_LIFT * shareOf(from, all);
    })
    .map(([id]) => id)
    .sort();
}

// Seeds means not worked on yet, and no Status counts as Seeds. Every other
// Status is some stage of work.
export function hasProgress(status: string | null): boolean {
  return status !== null && status !== "Seeds";
}

// A theme is flagged when none of its counted Blossoms has made progress,
// including when it has none. Callers list themes with a Blossom first.
export function isFlagged(linked: { status: string | null }[]): boolean {
  return !linked.some((b) => hasProgress(b.status));
}

// The members closest to the centroid (the most representative), at most one
// per entry, in date order.
export function pickExamples<T extends Clusterable>(cluster: Cluster<T>, n = EXAMPLES_PER_THEME): T[] {
  const seen = new Set<string>();
  return cluster.members
    .map((row) => ({ row, score: cosineSimilarity(row.embedding, cluster.centroid) }))
    .sort((a, b) => b.score - a.score || a.row.entry_date.localeCompare(b.row.entry_date))
    .filter(({ row }) => !seen.has(row.entry_id) && seen.add(row.entry_id))
    .slice(0, n)
    .map((match) => match.row)
    .sort((a, b) => a.entry_date.localeCompare(b.entry_date) || a.id.localeCompare(b.id));
}
