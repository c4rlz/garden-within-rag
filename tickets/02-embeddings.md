# Embed written answers into pgvector

## Context
Filter-plus-meaning and theme questions need semantic search over the written
answers. The schema already has `entries.embedding vector(1024)`.

## Acceptance criteria
- `npm run embed` embeds every entry with non-empty `content` and no
  embedding, or whose content changed since it was embedded.
- Re-running it embeds nothing new when nothing changed.
- The provider and key come from environment variables, documented in
  `.env.example` and the README.
- Tests cover choosing which entries to embed, with the API call stubbed.

## Out of scope
- Using the embeddings in search (tickets 04 and 08).

## Pointers
- `db/schema.sql`, `src/lib/db.ts`, `scripts/ingest.ts` for the script pattern

## Constraints
- Provider: [TODO: chosen in setup]. No new dependencies beyond any installed
  in setup.
