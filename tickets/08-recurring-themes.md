# Answer which recurring themes haven't made progress

## Context
"What recurring themes haven't I made progress on?" Cluster similar written
answers into themes, then check the Status of linked Blossoms.

## Acceptance criteria
- Clusters embedded entries into themes. If the database has no embeddings
  (the real journal isn't embedded yet, see ticket 02), it says theme
  questions aren't set up for this database.
- For each theme, finds linked Blossoms and their Status, and flags themes
  that recur with no linked Blossom that has made progress. Status options are
  Seeds, Sprouts, Bloomed, Archived and Blossoms. Seeds means not
  worked on yet; every other Status (Sprouts, Bloomed, Archived, Blossoms) is
  some stage of work and counts as progress. So a theme is flagged when all of
  its linked Blossoms are still Seeds, or it has none.
- Claude names the themes and cites example entries.
- Tests cover clustering on small fixture vectors.

## Details
- **What's clustered:** Daily Seeds and Weekly Roots with an embedding.
  Blossoms aren't clustered; they're what themes are checked against.
- **Clustering:** a pure function over the stored vectors, testable without a
  database, with its similarity threshold as a named constant. The method is
  the planner's choice, explained in the plan.
- **Recurring:** a theme needs at least 5 entries spread over at least 3
  different weeks.
- **Linked Blossoms:** the union of Blossoms the theme's entries link to
  through `RELATION_PROPS` (`Blossoms`, `🌸 Blossom`, `🌸 Priorities`), read
  from the Seed/Root side.
- **Flagging is computed in code:** a theme is flagged when it has no linked
  Blossom, or all its linked Blossoms are at Seeds. A Blossom with no Status
  counts as Seeds.
- **What Claude gets:** one call for all flagged themes, at most 6 themes
  (most entries first), with up to 5 example entries each picked by code.
  Claude names each theme in a few words and writes one or two sentences,
  citing only the examples it was given. It doesn't decide what's flagged.
- **Privacy:** only stored vectors are used. The question is never sent to
  Voyage.
- **Partly embedded:** cluster the embedded entries and say how many entries
  with writing weren't included (like ticket 04's "N searched").
- **Edge cases, answered without calling Claude:**
  - Not set up (no embeddings): "Theme questions aren't set up for this
    database yet. See README → Privacy."
  - No recurring themes: say so.
  - Every recurring theme has progress: say so, naming how many themes.
- **Time window:** the whole history, narrowed by `parseDateRange` when the
  question names a period, like tickets 06 and 07.
- **`Answer.filter`:** for example "Recurring themes: 9, 3 without progress".
  `entriesConsidered` is the number of entries clustered.
- **Wiring:** `answerQuestion` sends `overTime: "themes"` here, replacing its
  "not supported yet" reply and the test that checks it.
- **Tests:** database-free with injected `deps`, covering clustering,
  recurrence, flagging, the edge cases and dispatch.

## Out of scope
- Showing themes on the landing page.

## Pointers
- Embeddings (created in ticket 02), `links`, router (created in ticket 03)

## Constraints
- Clustering method: the planner's choice of a simple method over the
  embeddings (for example grouping entries whose embeddings are very similar),
  explained in the plan. No new dependencies.
