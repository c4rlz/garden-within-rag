// Grouping written entries into themes by their stored embeddings, kept free
// of I/O so it can be tested on small vectors. Nothing here calls Voyage.
import { startOfWeek } from "./dates";
import { cosineSimilarity } from "./search";

// How similar an entry must be to a theme's centroid to join it. Untuned: each
// embedding covers a whole entry, so it may need lowering for real writing.
export const THEME_SIMILARITY = 0.75;

// A theme recurs when it has at least this many entries over this many weeks.
export const MIN_THEME_ENTRIES = 5;
export const MIN_THEME_WEEKS = 3;

// How many flagged themes Claude names, and how many examples each one gets.
export const MAX_THEMES_SHOWN = 6;
export const EXAMPLES_PER_THEME = 5;

// Relation properties on the Seed and Root side. The Blossom's own lists
// (🌱 Daily Seeds, 🌿 Weekly Roots) stop at 25 items, so they're never read.
export const RELATION_PROPS = ["Blossoms", "🌸 Blossom", "🌸 Priorities"];

export interface Clusterable {
  id: string;
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
// chain of loosely related entries can't merge into one huge theme. The fixed
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

export function isRecurring(cluster: Cluster<Clusterable>): boolean {
  return cluster.members.length >= MIN_THEME_ENTRIES && weekCount(cluster.members) >= MIN_THEME_WEEKS;
}

// The Blossoms the theme's entries link to from the Seed and Root side, each
// once. Links to ids that aren't known Blossoms are dropped.
export function linkedBlossomIds(
  memberIds: string[],
  links: { from_id: string; to_id: string; property: string }[],
  blossomIds: Iterable<string>,
): string[] {
  const members = new Set(memberIds);
  const known = new Set(blossomIds);
  const ids = links
    .filter((link) => members.has(link.from_id) && RELATION_PROPS.includes(link.property) && known.has(link.to_id))
    .map((link) => link.to_id);
  return [...new Set(ids)];
}

// Seeds means not worked on yet, and no Status counts as Seeds. Every other
// Status is some stage of work.
export function hasProgress(status: string | null): boolean {
  return status !== null && status !== "Seeds";
}

// A theme is flagged when none of its linked Blossoms has made progress,
// including when it has none.
export function isFlagged(linked: { status: string | null }[]): boolean {
  return !linked.some((b) => hasProgress(b.status));
}

// The members closest to the centroid (the most representative), in date order.
export function pickExamples<T extends Clusterable>(cluster: Cluster<T>, n = EXAMPLES_PER_THEME): T[] {
  return cluster.members
    .map((row) => ({ row, score: cosineSimilarity(row.embedding, cluster.centroid) }))
    .sort((a, b) => b.score - a.score || a.row.entry_date.localeCompare(b.row.entry_date))
    .slice(0, n)
    .map((match) => match.row)
    .sort((a, b) => a.entry_date.localeCompare(b.entry_date) || a.id.localeCompare(b.id));
}
