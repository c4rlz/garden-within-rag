# Answer relation questions by following Blossom links

## Context
"How has my morning meditation intention actually gone?" Gather every Seed
and Root linked to that Blossom, instead of searching.

## Acceptance criteria
- Finds the Blossom the question names, then every Seed and Root linked to it
  through the `links` table, in date order. Links are read from the Seed and
  Root side (`to_id` = the Blossom, property `Blossoms` or `🌸 Blossom`),
  never from the Blossom's own relations. Notion lists at most 25 items per
  relation on a page, so a busy Blossom's own list is cut off on real data,
  while each Seed's and Root's list is complete.
- Claude answers how it has gone, citing the linked entries and the Blossom.
- A Blossom that can't be found gets a clear answer that names the closest
  matches.
- Tests cover link gathering against fixture rows, including a Blossom with
  more than 25 linked Seeds whose own back-relation lists only 25.

## Out of scope
- Semantic search.

## Pointers
- `links` table in `db/schema.sql`, router (created in ticket 03)
- The comment on the 25-item cap in `src/lib/notion.ts`

## Constraints
- No embeddings used for this type.
