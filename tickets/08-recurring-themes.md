# Answer which recurring themes haven't made progress

## Context
"What recurring themes haven't I made progress on?" Cluster similar written
answers into themes, then check the Status of linked Blossoms.

## Acceptance criteria
- Clusters embedded entries into themes.
- For each theme, finds linked Blossoms and their Status, and flags themes
  that recur with no Blossom past [TODO: which status counts as progress].
- Claude names the themes and cites example entries.
- Tests cover clustering on small fixture vectors.

## Out of scope
- Showing themes on the landing page.

## Pointers
- Embeddings (created in ticket 02), `links`, router (created in ticket 03)

## Constraints
- Clustering method: [TODO]. No new dependencies.
