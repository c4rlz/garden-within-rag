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

## Out of scope
- The ask box (10).

## Pointers
- `src/app/page.tsx`, `src/app/page.module.css`, `src/lib/db.ts`
- `src/lib/dataset.ts` (`datasetKind`) for the sample-data notice
- `AGENTS.md`: this Next.js version differs from older ones; read the guide
  in `node_modules/next/dist/docs/` before writing Next.js code

## Constraints
- Charts: [TODO: hand-drawn SVG, or the library installed in setup].
