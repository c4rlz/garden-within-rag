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

## Details
- **Routing within "over time":** add an `overTime` field to `Route`
  (`"priorities" | "monthly tone" | "themes"`), set from the existing
  `OVER_TIME` patterns. Priorities questions come here. Monthly-tone (07) and
  themes (08) questions keep their "not supported yet" reply, and the existing
  test for "What was each month's tone?" stays. When Claude classifies a
  question as "over time" with no sub-type, reply "not supported yet".
- **Which changes are "biggest":** code ranks the weeks by how many
  priorities were added plus dropped, and passes Claude the top 8 changes
  along with the full timeline of each priority's first and last week. Claude
  narrates; it doesn't pick.
- **Citations:** each cited week is its Weekly Root entry, linked like other
  citations, even when the Root has no writing. Priority names come from the
  Blossom titles.
- **Edge cases:**
  - Weeks are ordered by `entry_date`. Two Roots in the same week are merged.
  - A week with no Root is skipped: compare with the previous Root.
  - A Root with no priorities is skipped, not counted as dropping them all.
  - The first Root is the baseline: nothing is "added" in it.
  - A link to a Blossom not in `entries` is ignored.
  - Fewer than two Roots with priorities: say there isn't enough history yet,
    without calling Claude.
- **Time window:** the whole history. If `parseDateRange` finds a time phrase
  in the question, narrow to that range.
- **`Answer.filter`:** for example "Priorities across 48 weeks: 9 changes
  shown". `entriesConsidered` is the number of Roots compared.
- **Tests:** database-free with injected `deps`, covering the diff, the
  ranking, the edge cases, routing and dispatch.

## Out of scope
- Monthly tone (07), themes (08).

## Pointers
- `links` (property `🌸 Priorities`), router (created in ticket 03)

## Constraints
- The diff is computed in code, not by Claude.
