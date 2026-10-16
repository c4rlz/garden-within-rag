# Replace the starter page with the Garden data views

## Context
The brief's definition of done: a landing page that shows the data (a year of
daily tones, a month-by-month tone breakdown, intentions by status).
`src/app/page.tsx` is still the Create Next App starter.

## Acceptance criteria
- Shows a year of daily Energy Tones (one cell per day).
- Shows a month-by-month tone breakdown.
- Shows Blossoms grouped by Status.
- Reads from Postgres on the server and works with the sample data loaded.
- Says plainly when it's showing sample data, using the marker the sample
  loader writes (created in ticket 01).

## Details
- **Year of daily tones:** the last 365 days ending today, one cell per day in
  week columns. A day with no Seed is an empty cell. A Seed with several
  Energy Tones splits its cell into equal stripes, one per tone, in
  `ENERGY_TONES` order. Tones outside the template list are dropped. Each
  cell has a title with its date and tones.
- **Month-by-month breakdown:** the same 12 months, oldest first, gaps
  included. Each month has two stacked bars: Energy Tones from Seeds and
  Tone / Feeling from Roots. Counts come from `monthlyToneCounts` (ticket 07).
- **Blossoms by Status:** one column per Status, in the order Seeds, Sprouts,
  Blossoms, Bloomed, Archived. Each lists Blossom titles that link to their
  Notion page. A Blossom with no Status counts as Seeds, as in ticket 08. An
  empty column says "None".
- **Colors:** one fixed color per tone, the same in the grid and the bars,
  with a legend. Works in light and dark mode.
- **Sample notice:** when `datasetKind()` is `"sample"`, a line at the top
  says the page is showing made-up sample data.
- **Empty database:** each view says there's nothing to show yet. No errors.
- **Data:** read in a server component. The shaping (grid cells, bar
  segments, Status groups) is pure functions over rows.
- **Tests:** database-free, covering the shaping functions: the 365-day
  window, empty days, split cells, the month bars and Status grouping.

## Out of scope
- The ask box (10).

## Pointers
- `src/app/page.tsx`, `src/app/page.module.css`, `src/lib/db.ts`
- `src/lib/dataset.ts` (`datasetKind`) for the sample-data notice
- `AGENTS.md`: this Next.js version differs from older ones; read the guide
  in `node_modules/next/dist/docs/` before writing Next.js code

## Constraints
- Charts are hand-drawn SVG. No chart library or other new dependency.
