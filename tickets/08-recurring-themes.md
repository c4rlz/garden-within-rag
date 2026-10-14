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

## Out of scope
- Showing themes on the landing page.

## Pointers
- Embeddings (created in ticket 02), `links`, router (created in ticket 03)

## Constraints
- Clustering method: the planner's choice of a simple method over the
  embeddings (for example grouping entries whose embeddings are very similar),
  explained in the plan. No new dependencies.
