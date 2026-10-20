# Find recurring themes by topic, not by entry template

## Context
The themes answer (ticket 08) flags nothing on the sample data, so the
eval's "What recurring themes haven't I made progress on?" fails (ticket 11).
Measured on the sample database:
- Clustering at `THEME_SIMILARITY` 0.75 puts 281 of 375 entries in one theme
  and 50 of the 52 Weekly Roots in another: 5 recurring themes, 0 flagged.
  Stricter thresholds (0.80 to 0.88) split the groups, but at best flag one
  5 or 6 entry slice of the phone theme. The family theme is never flagged,
  and most phone entries stay in large mixed themes.
- Each entry has one embedding covering every prompt answer in it. A single
  Daily Seed mixes topics (meditation, phone at bedtime, breakfast), so
  entries group by the shape of the template, not by topic.
- A theme counts as progressing if any Blossom linked by any of its entries
  has progress. Most Seeds link to the meditation Blossom (Sprouts), so
  almost every theme is cleared.

## Acceptance criteria
- On the sample database, the themes answer flags the stuck themes the
  sample was written with: Put my phone away an hour before bed, and Call
  family every week (both at Seeds). It does not flag themes whose Blossoms
  have progressed.
- `npm run eval` passes the themes question without loosening its expected
  results in `sample/evals.json`.
- Clustering stays a pure, database-free function, with its tuning values as
  named constants. Tests cover the new grouping and flagging on small fixture
  vectors.
- The README and the embed step explain what is now embedded, and `npm run
  embed` says how many embeddings it will create before sending anything.

## Details
- **What's embedded:** the planner's choice, explained in the plan. The
  likely fix is one embedding per prompt answer (for example "What is my
  body asking for?" → its text) instead of one per entry, stored so the
  existing per-entry search (ticket 04) keeps working or is moved over.
- **Linked Blossoms for a theme:** the planner's choice of a rule that
  doesn't let one common link clear every theme, for example only Blossoms
  linked by a minimum share of the theme's entries. Flagging stays in code,
  and the Status rule is unchanged: Seeds or no Status means no progress.
- **Re-embedding:** the sample database has to be embedded again. That
  sends the sample text to Voyage once, at a small cost.
- **Privacy:** the real journal is still only embedded when
  `EMBED_REAL_JOURNAL=yes`. No new text goes to Voyage beyond the written
  answers it already gets, only split differently.

## Done by hand after implement
Re-embed the sample database, then run `npm run eval`. Check that the themes
question passes and the other six still pass before merging.

## Out of scope
- Showing themes on the landing page.
- Changing the other answerers' prompts.

## Pointers
- `src/lib/themes.ts`, `answerThemes` in `src/lib/answer.ts`
- Embeddings and `scripts/embed.ts` (ticket 02), semantic search (ticket 04)
- Sample themes in `scripts/generate-sample.ts`, expected results in
  `sample/evals.json` (ticket 11)

## Constraints
- No new dependencies.
