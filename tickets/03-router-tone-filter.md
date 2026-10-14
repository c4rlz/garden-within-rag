# Route questions by type and answer tone-filter questions

## Context
The brief's approach step 3: decide whether a question is lookup, filter,
filter + meaning, relation or over time. Only lookup exists today. This adds
the router and the first new type: "What was going on during the weeks I
felt Overwhelmed?"

## Acceptance criteria
- A router assigns each of the brief's seven questions its type from the brief.
- Lookup questions still go to `answerLookup`.
- Filter questions select Weekly Roots by Tone / Feeling (and Daily Seeds by
  Energy Tone), then Claude summarizes with citations.
- Types not built yet return a clear "not supported yet" answer.
- `npm run ask` uses the router.
- Tests cover routing all seven questions and the tone filter.

## Out of scope
- Semantic search (04), relations (05), over-time types (06–08).

## Pointers
- `src/lib/answer.ts`, `src/lib/claude.ts`, `scripts/ask.ts`

## Constraints
- Routing method: [TODO: rules, Claude, or rules with Claude fallback].
- Citations use the existing `Citation` shape.
