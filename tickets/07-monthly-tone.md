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

## Out of scope
- The landing page charts (09) can reuse the counting but aren't built here.

## Pointers
- `entries.tones`, `entries.entry_date`, router (created in ticket 03)

## Constraints
- Counts computed in SQL or code, not by Claude.
