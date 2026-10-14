# Embed written answers into pgvector

## Context
Filter-plus-meaning and theme questions need semantic search over the written
answers. The schema already has `entries.embedding vector(1024)`.

Embeddings use Voyage AI (`voyage-3.5`, 1024 dimensions, matching the
`vector(1024)` column). Voyage may train on data sent to it unless the account
has opted out, so for now only the sample database is embedded. The real
journal is never sent to Voyage until the user turns that on.

## Acceptance criteria
- `npm run embed` embeds every entry with non-empty `content` and a null
  `embedding`. `syncSource` already clears the embedding whenever content
  changes, so no extra change tracking is needed.
- Re-running it embeds nothing new when nothing changed.
- It refuses to run, sending nothing, unless the database is marked as
  sample (`datasetKind()` in `src/lib/dataset.ts`) or
  `EMBED_REAL_JOURNAL=yes` is set. The refusal message explains why and
  points to the README.
- It sends entries in batches and calls Voyage's REST API with `fetch`.
  The key comes from `VOYAGE_API_KEY`.
- `.env.example` lists `VOYAGE_API_KEY` and `EMBED_REAL_JOURNAL`.
- The README's Privacy section says that embedding sends written answers to
  Voyage, that only the sample database is embedded by default, and how to
  opt out of Voyage training (Atlas → Organization Settings → "Help Improve
  Voyage AI Models", which needs a payment method on file) before setting
  `EMBED_REAL_JOURNAL=yes`.
- Tests cover choosing which entries to embed, batching, and the refusal,
  with the API call stubbed.

## Out of scope
- Using the embeddings in search (tickets 04 and 08).

## Pointers
- `db/schema.sql`, `src/lib/db.ts`, `scripts/ingest.ts` for the script pattern
- `src/lib/store.ts`: clears `embedding` when `content` changes
- `src/lib/dataset.ts` (`datasetKind`)

## Constraints
- No new dependencies: call Voyage with `fetch`.
- Never send real journal text to Voyage unless `EMBED_REAL_JOURNAL=yes`.
