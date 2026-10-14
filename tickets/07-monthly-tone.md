# Answer each month's tone with counts and cited summaries

## Context
"What was each month's tone?" Count tones per month and add a short cited
summary for each month.

## Acceptance criteria
- Counts Daily Seed Energy Tones and Weekly Root Tone / Feeling per month.
- Answers with each month's counts and a one- or two-sentence summary citing entries.
- Tests cover the counting, including months with no entries.

## Out of scope
- The landing page charts (09) can reuse the counting but aren't built here.

## Pointers
- `entries.tones`, `entries.entry_date`, router (created in ticket 03)

## Constraints
- Counts computed in SQL or code, not by Claude.
