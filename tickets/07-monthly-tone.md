# Answer each month's tone with counts and cited summaries

## Context
"What was each month's tone?" Count tones per month and add a short cited
summary for each month.

## Acceptance criteria
- Counts Daily Seed `Energy Tone` and Weekly Root `Tone / Feeling` per month.
  - `Energy Tone` is multi-select (Tired, Gentle, Stressed, Happy, Low): a
    Seed can have several tones, and each one counts.
  - `Tone / Feeling` is single-select (Grounded, Light, Restless, Energized,
    Tender, Overwhelmed, Love).
  - The two sets of tones are reported separately, not merged.
- Answers with each month's counts and a one- or two-sentence summary citing entries.
- Tests cover the counting, including months with no entries.

## Details
- **Counting:** an exported pure function, `monthlyToneCounts(rows)`, takes
  entry rows (source, entry_date, tones) and returns one object per month
  (`{ month: "2026-01", seeds: Record<tone, number>, roots: Record<tone, number> }`),
  oldest first. Ticket 09 reuses it for the month-by-month chart. Every tone
  in each list is present, with 0 where unused. Entries with no tones are
  skipped.
- **Which month a Root belongs to:** the month of its `entry_date` (its Week
  Of Monday).
- **Months covered:** every month from the first to the last entry, including
  gaps. A month with no entries shows zero counts and a fixed line ("No
  entries this month") without asking Claude.
- **Time window:** the whole history, narrowed by `parseDateRange` when the
  question names a period, like ticket 06.
- **Summaries:** one Claude call for all months. Code picks what Claude sees:
  each month's counts, plus that month's Weekly Roots with writing, and up to
  5 Daily Seeds with writing per month (spread through the month). Claude
  writes one or two sentences per month and cites only the entries it was
  given, Seeds or Roots, linked like other citations.
- **Labels:** months as "Jan 2026", oldest to newest.
- **No tones at all in range:** say so plainly without calling Claude.
- **`Answer.filter`:** for example "Tones across 13 months". `entriesConsidered`
  is the number of entries counted.
- **Wiring:** `answerQuestion` sends `overTime: "monthly tone"` here,
  replacing its "not supported yet" reply and the test that checks it.
- **Tests:** database-free with injected `deps`, covering the counting, the
  edge cases and dispatch.

## Out of scope
- The landing page charts (09) can reuse the counting but aren't built here.

## Pointers
- `entries.tones`, `entries.entry_date`, router (created in ticket 03)

## Constraints
- Counts computed in SQL or code, not by Claude.
