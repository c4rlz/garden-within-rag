# Add a labeled sample dataset and a loader for it

## Context
The template copy has almost no entries, and the brief needs a demo and evals
that run on sample data, never real entries. Every later ticket tests against this.

## Acceptance criteria
- A sample dataset covers all three databases in the template's shape: at
  least 12 months of Daily Seeds, matching Weekly Roots, and several Blossoms
  with varied Status values.
- It includes material for all seven brief questions: Overwhelmed weeks,
  Tired days, a morning meditation Blossom with linked Seeds and Roots,
  priorities that shift, recurring themes, and varied monthly tones.
- Every sample entry is clearly labeled as made up (e.g. titles and a
  dataset header say "Sample").
- `npm run sample:load` loads it into Postgres through the same store code as
  ingest, replacing any earlier sample load.
- Tests cover the loader's mapping into entries and links.

## Out of scope
- Embeddings (ticket 02). Any UI.

## Pointers
- `src/lib/store.ts` (`syncSource`), `src/lib/notion.ts` (`Entry`),
  `src/lib/template.ts`, `db/schema.sql`

## Constraints
- No new dependencies. No real journal content.
