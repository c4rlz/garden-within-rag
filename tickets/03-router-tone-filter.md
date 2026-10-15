# Route questions by type and answer tone-filter questions

## Context
The brief's approach step 3: decide whether a question is lookup, filter,
filter + meaning, relation or over time. Only lookup exists today. This adds
the router and the first new type: "What was going on during the weeks I
felt Overwhelmed?"

The brief's seven questions and their types:

| Question | Type | How it is answered |
| --- | --- | --- |
| What did I say I could let go of last week? | Lookup | Date filter, then the matching entries |
| What was going on during the weeks I felt Overwhelmed? | Filter | Filter on Tone / Feeling, then summarize |
| What has my body been asking for on Tired days? | Filter + meaning | Filter on Energy Tone, then semantic search |
| How has my morning meditation intention actually gone? | Relation | Gather every Seed and Root linked to that Blossom |
| What have been the biggest changes in priorities? | Over time | Compare the Priorities relation week by week, then narrate |
| What recurring themes haven't I made progress on? | Over time | Cluster similar answers into themes, then check linked Blossom status |
| What was each month's tone? | Over time | Count tones per month, plus a short cited summary per month |

## Acceptance criteria
- A router assigns each of the brief's seven questions its type from the brief.
- Lookup questions still go to `answerLookup`.
- Filter questions select Weekly Roots by Tone / Feeling (and Daily Seeds by
  Energy Tone), then Claude summarizes with citations.
- Types not built yet return a clear "not supported yet" answer.
- `npm run ask` uses the router.
- Tests cover routing all seven questions and the tone filter.

## Routing rules
The two tone lists don't overlap, so the kind of tone named decides the type.
Rules are checked in this order, and the first match wins:
1. **Over time:** "each month", "month by month", "changes in priorities",
   "recurring themes", "haven't made progress" and similar.
2. **Relation:** "intention", "Blossom", or "how has my … gone". Ticket 05
   works out which Blossom; the router doesn't need Blossom names.
3. **Filter + meaning:** an Energy Tone value (Tired, Gentle, Stressed, Happy,
   Low).
4. **Filter:** a Tone / Feeling value (Grounded, Light, Restless, Energized,
   Tender, Overwhelmed, Love).
5. **Lookup:** a time phrase that `parseDateRange` understands.
6. Otherwise Claude classifies it. `complete()` is asked to reply with one of
   the five type names; any other reply counts as "not supported yet".

The tone lists are hard-coded from the template (they're fixed). The router is
a pure function and needs no database. A question that names a tone and a time
("Overwhelmed last month") goes by the tone; combining filters is out of scope.

## Filter answers
- A Filter question selects the Weekly Roots whose `Tone / Feeling` matches,
  plus every Daily Seed dated inside those Roots' weeks (Monday to Sunday), so
  the answer covers "what was going on during the weeks".
- If no Root has that tone, it says so plainly without calling Claude, like
  `answerLookup`'s "You didn't write any…" message.
- The answer reports the filter it used (for example "Weeks you felt
  Overwhelmed: 6 weeks"), alongside or instead of `range`.

## Testing
Tests stay database-free, like the existing ones: the router, the week
selection and the prompt building are pure functions, and `complete()` and
`db()` are stubbed.

## Out of scope
- Semantic search (04), relations (05), over-time types (06–08).

## Pointers
- `src/lib/answer.ts`, `src/lib/claude.ts`, `scripts/ask.ts`

## Constraints
- Routing method: keyword rules first (a time phrase, a tone name, a Blossom
  name, "each month", "changes in priorities" and similar); Claude classifies
  only questions the rules can't place. Claude is called through
  `complete()` in `src/lib/claude.ts`, and tests stub it.
- Citations use the existing `Citation` shape.
