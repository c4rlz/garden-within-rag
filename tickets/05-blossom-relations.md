# Answer relation questions by following Blossom links

## Context
"How has my morning meditation intention actually gone?" Gather every Seed
and Root linked to that Blossom, instead of searching.

## Acceptance criteria
- Finds the Blossom the question names, then every Seed and Root linked to it
  through the `links` table, in date order.
- Claude answers how it has gone, citing the linked entries and the Blossom.
- A Blossom that can't be found gets a clear answer that names the closest
  matches.
- Tests cover link gathering against fixture rows.

## Out of scope
- Semantic search.

## Pointers
- `links` table in `db/schema.sql`, router (created in ticket 03)

## Constraints
- No embeddings used for this type.
