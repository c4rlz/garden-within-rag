# Answer filter-plus-meaning questions with semantic search

## Context
"What has my body been asking for on Tired days?" Filter on Energy Tone first,
then search the written answers for meaning within that set.

## Acceptance criteria
- Filters Daily Seeds by the Energy Tone named in the question, then ranks
  them by vector similarity to the question.
- Answers from the top matches with citations.
- The router sends this type here.
- If none of the filtered entries has an embedding (the real journal isn't
  embedded yet, see ticket 02), it says semantic search isn't set up for this
  database. It doesn't call Voyage, so the question isn't sent anywhere.
- The question is embedded with Voyage (`input_type: "query"`), using the
  same model as ticket 02.
- Tests cover the filter-then-rank order and the not-set-up answer, with
  stubbed embeddings.

## Out of scope
- Theme clustering (08).

## Pointers
- Router (created in ticket 03), embed code (created in ticket 02),
  `src/lib/answer.ts`

## Constraints
- Filtering happens in SQL before the vector search, per the brief's core rule.
