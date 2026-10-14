# Add a labeled sample dataset and a loader for its own database

## Context
The template copy has almost no entries, and the brief needs a demo and evals
that run on sample data, never real entries ("My real entries never go in the
repo"). Every later ticket tests against this dataset.

Sample data lives in its own Postgres database, never the real one.
`syncSource` deletes every row of a source that isn't in the batch it's given
(`src/lib/store.ts`), so loading sample data into the real database would wipe
the real entries, and a later `npm run ingest` would wipe the sample.

The dataset has to cover the brief's seven questions, which are also the eval
set (ticket 11):

| Question | Type | How it is answered |
| --- | --- | --- |
| What did I say I could let go of last week? | Lookup | Date filter, then the matching entries |
| What was going on during the weeks I felt Overwhelmed? | Filter | Filter on Tone / Feeling, then summarize |
| What has my body been asking for on Tired days? | Filter + meaning | Filter on Energy Tone, then semantic search |
| How has my morning meditation intention actually gone? | Relation | Gather every Seed and Root linked to that Blossom |
| What have been the biggest changes in priorities? | Over time | Compare the Priorities relation week by week, then narrate |
| What recurring themes haven't I made progress on? | Over time | Cluster similar answers into themes, then check linked Blossom status |
| What was each month's tone? | Over time | Count tones per month, plus a short cited summary per month |

The template's exact property names and options (from the public Garden
Within template). The JSON must use these names verbatim:

- **🌱 Daily Seeds**
  - `Title` (title).
  - `Date` (date).
  - `Energy Tone` (multi-select: Tired, Gentle, Stressed, Happy, Low).
  - `Body Offering - Self Care` (checkbox).
  - `Blossoms` (relation to 🌸 The Garden).
  - Text: `What Matters Today?`, `What wants clarity?`, `What became clearer?`, `What can I let go of?`, `What is my body asking for?`, `Body Offering of the Day`.
- **🌿 Weekly Roots**
  - `Title` (title).
  - `Week Of` (date).
  - `Created Date` (created time).
  - `Tone / Feeling` (select: Grounded, Light, Restless, Energized, Tender, Overwhelmed, Love).
  - `Accountability Check In` (checkbox).
  - `🌸 Priorities` and `🌸 Blossom` (relations to 🌸 The Garden).
  - Text: `Theme of the Week`, `Highlights`, `Insights & Patterns`, `Proud Moments`, `Seeds That Grew`.
- **🌸 The Garden** (Blossoms)
  - `Title` (title).
  - `Ideated At` (created time).
  - `Status` (select: Seeds, Sprouts, Bloomed, Archived, Blossoms).
  - `Priority` (select: Gentle, Medium, High).
  - `Type` (select: Blog, Habit, Home, Health, Community, Other, Career, Learning, Creativity).
  - `🌱 Daily Seeds` and `🌿 Weekly Roots` (relations back to the other two).
  - Text: `Origin / Insight`, `Intention / Why it matters`, `First Steps`, `Notes / Progress`, `Completion Reflection`.

## Acceptance criteria
- `scripts/generate-sample.ts` (`npm run sample:generate`) writes the sample
  dataset to `sample/garden.json` as Notion-page-shaped JSON:
  `{ "note": "Made-up sample data…", "seeds": [...], "roots": [...],
  "blossoms": [...] }`. Both files are committed. The generator uses its own
  seeded random number generator and never reads today's date, so running it
  again produces the same file. The JSON goes through the same `toEntry` mapping as
  real pages. It has:
  - Daily Seeds on about 85% of the days in a 12-month span, the way real
    journals skip days. Not every written field is filled on every day.
  - One Weekly Root per week over the same span, with `🌸 Priorities` that
    change from week to week.
  - Several Blossoms covering every Status value, including a "Start mornings
    with 5 minute meditation" Blossom that many Seeds and Roots link to.
  - Relations stored in both directions, as Notion does: a Seed's `Blossoms`
    and that Blossom's `🌱 Daily Seeds`. Every link is listed, ignoring
    Notion's 25-item cap.
  - Enough material for each of the seven questions above to have a clear
    answer: some Overwhelmed weeks, some Tired days, recurring themes in the
    written answers (some linked to Blossoms that never reach Bloomed), and
    months whose tones differ.
- Dates shift at load time by a whole number of weeks, so the newest Seed
  falls within the past 7 days of `localToday()` (`src/lib/dates.ts`) and
  every `Week Of` stays a Monday, matching how `dates.ts` defines weeks. The
  shift applies to every date in the dataset, including `created_time` and
  `last_edited_time`. After the shift, last week (Monday to Sunday) has Seeds
  with `What can I let go of?` filled in.
- Every page has a stable UUID, so reloading replaces rows instead of
  duplicating them. Each page also has a placeholder `url` that clearly isn't
  a real Notion page.
- Every sample entry is labeled as made up: titles start with "Sample", and
  the dataset file says so at the top.
- `npm run sample:load` loads the dataset into the sample database:
  `SAMPLE_DATABASE_URL`, defaulting to `postgres:///garden_within_sample`.
  It applies `db/schema.sql` first (safe to re-run), then uses `syncSource`.
  The loader sets `DATABASE_URL` to the sample URL before anything calls
  `db()`, so `db.ts` and `store.ts` stay as they are.
- `sample:load` refuses to run, and changes nothing, if the sample database
  could be the same as the real one. The real one is `DATABASE_URL`, or its
  default `postgres:///garden_within_rag`, and either may come from
  `.env.local`. The check parses both URLs without connecting. It fills in
  missing parts the way `pg` does (`?host=`, `PGHOST`, `PGPORT`,
  `PGDATABASE`), and treats the local socket, `localhost`, `127.0.0.1` and
  `::1` as the same server. If the database names match on what could be the
  same server, or if either URL can't be parsed, it refuses.
- A `dataset` table (added to `db/schema.sql`, one row at most, keyed on
  `kind`) marks the sample database. The loader upserts `kind = 'sample'`,
  and the table stays empty in the real database. `npm run ingest` refuses to
  run against a database marked as sample, so real entries never end up
  labeled as sample data. The landing page (ticket 09) and the evals (ticket 11)
  check it.
- The README explains how to create the sample database (it needs pgvector,
  like the real one), load it, and point the app at it with `DATABASE_URL`.
  `.env.example` lists `SAMPLE_DATABASE_URL`.
- Tests cover the JSON-to-entries-and-links mapping, the date shift, and the
  same-database check, without needing a running Postgres.

## Out of scope
- Embeddings (ticket 02).
- Expected answers for the evals (ticket 11 writes those next to this dataset).
- Any UI.
- Changing `syncSource`, or `npm run ingest` beyond its refusal on a sample database.

## Pointers
- `src/lib/store.ts` (`syncSource`): deletes rows of a source not in the batch
- `src/lib/notion.ts` (`Entry`, `toEntry`)
- `src/lib/template.ts` (date, tone and status property names), `db/schema.sql`
- `src/lib/db.ts`: reads `DATABASE_URL`
- `src/lib/dates.ts` (`localToday`, week boundaries)
- `test/notion.test.ts`: an existing template-shaped fixture
- `scripts/ingest.ts` and `scripts/db-setup.ts`: patterns for the new script

## Constraints
- No new dependencies. No real journal content.
- The app's default database stays the real one (`garden_within_rag`). Sample
  data is only used when `DATABASE_URL` is pointed at the sample database on
  purpose; nothing switches to it automatically.
- The sample database is created by hand first (`createdb garden_within_sample`).
