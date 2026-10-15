// Ranking for semantic search, kept free of I/O so it can be tested. The rows
// are already filtered in SQL; this only orders them by meaning.

// How many of the closest entries Claude gets. There is no minimum score.
export const TOP_MATCHES = 12;

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error(`Can't compare vectors of length ${a.length} and ${b.length}.`);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / Math.sqrt(normA * normB);
}

// The limit rows closest to query, highest score first. Rows without an
// embedding are skipped; ties go to the earlier date so the order is stable.
export function rankBySimilarity<T extends { embedding: number[] | null; entry_date: string }>(
  rows: T[],
  query: number[],
  limit: number,
): { row: T; score: number }[] {
  return rows
    .flatMap((row) => (row.embedding ? [{ row, score: cosineSimilarity(row.embedding, query) }] : []))
    .sort((a, b) => b.score - a.score || a.row.entry_date.localeCompare(b.row.entry_date))
    .slice(0, limit);
}
