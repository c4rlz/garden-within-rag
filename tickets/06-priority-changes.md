# Answer how priorities changed week to week

## Context
"What have been the biggest changes in priorities?" Compute the week-by-week
diff of the Priorities relation, then have Claude narrate it.

## Acceptance criteria
- Computes, per Weekly Root in date order, which priorities were added or
  dropped. Priorities are the Root's `🌸 Priorities` relation to Blossoms in
  🌸 The Garden, read from the Root side of `links`.
- Claude narrates the biggest changes, citing the weeks they happened.
- Tests cover the diff computation.

## Out of scope
- Monthly tone (07), themes (08).

## Pointers
- `links` (property `🌸 Priorities`), router (created in ticket 03)

## Constraints
- The diff is computed in code, not by Claude.
