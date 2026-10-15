# Answer relation questions by following Blossom links

## Context
"How has my morning meditation intention actually gone?" Gather every Seed
and Root linked to that Blossom, instead of searching.

## Acceptance criteria
- Finds the Blossom the question names, then every Seed and Root linked to it
  through the `links` table, in date order. Links are read from the Seed and
  Root side (`to_id` = the Blossom, property `Blossoms`, `🌸 Blossom` or
  `🌸 Priorities`),
  never from the Blossom's own relations. Notion lists at most 25 items per
  relation on a page, so a busy Blossom's own list is cut off on real data,
  while each Seed's and Root's list is complete.
- Claude answers how it has gone, citing the linked entries and the Blossom.
- A Blossom that can't be found gets a clear answer that names the closest
  matches.
- Tests cover link gathering against fixture rows, including a Blossom with
  more than 25 linked Seeds whose own back-relation lists only 25.

## Details
- **Matching the Blossom:** word overlap first, like the router's rules.
  Compare the question's words with each Blossom title, ignoring a leading
  "Sample:", case, common words and simple plural "s" (so "morning
  meditation" matches "Start mornings with 5 minute meditation"). A single
  clear best match wins. If no Blossom scores, or two tie for best, Claude
  picks from the Blossom titles through `complete()` (stubbed in tests), and
  may answer "none".
- **Can't be found:** name up to 3 closest titles by word overlap. With no
  Blossoms at all, say so plainly. Neither case calls Claude for the answer.
- **Linked entries:** Seeds through `Blossoms`, and Roots through
  `🌸 Blossom` or `🌸 Priorities`, all read from the Seed/Root side. A Root
  that lists it under both counts once.
- **Nothing linked, or nothing written:** say so plainly without calling
  Claude, like `answerFilter`.
- **What Claude gets:** the Blossom as entry [1], with its Status and written
  fields, then every linked entry with writing in date order (ties broken by
  source, as `answerFilter` does). No cap for now.
- **`Answer.filter`:** for example "Linked to Start mornings with 5 minute
  meditation: 64 entries".
- **Wiring:** `answerQuestion` sends relation questions here, replacing the
  not-supported message and its test. `npm run ask` answers them.
- **Tests:** database-free with injected `deps`, like `answerFilter`.

## Out of scope
- Semantic search.

## Pointers
- `links` table in `db/schema.sql`, router (created in ticket 03)
- The comment on the 25-item cap in `src/lib/notion.ts`

## Constraints
- No embeddings used for this type.
