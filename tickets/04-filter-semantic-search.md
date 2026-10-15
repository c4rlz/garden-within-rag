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

## Details
- **Order of checks, so nothing is sent too early:**
  1. Filter Daily Seeds by the Energy Tone in SQL.
  2. If none match, say so plainly without calling Voyage or Claude, like
     `answerFilter`'s "You didn't have any weeks where you felt …".
  3. If none of the matches has an embedding, give the not-set-up answer.
  4. Only then embed the question.
- **Ranking:** fetch the filtered rows with their embeddings and rank them in
  TypeScript by cosine similarity. With a journal this size that's instant,
  and it keeps the ranking testable without a database.
- **What Claude gets:** the 12 best matches, with no minimum score.
- **Partly embedded:** search only the embedded entries, and say how many
  matching entries weren't searched because they aren't embedded yet.
- **No tone named** (Claude classified the question): answer like ticket 03
  does for Filter, listing `ENERGY_TONES` to choose from.
- **`Answer.filter`:** for example "Days you felt Tired: 48 days, 45 searched".
- **Voyage failures at question time:** a missing key or a Voyage error gives
  a short, readable message, not a stack trace.
- **Wiring:** `answerQuestion` in `src/lib/answer.ts` sends this type here,
  replacing its not-supported message.
- **README:** update the Status line and "How it works".

## Out of scope
- Theme clustering (08).

## Pointers
- Router (created in ticket 03), embed code (created in ticket 02),
  `src/lib/answer.ts`

## Constraints
- Filtering happens in SQL before the vector search, per the brief's core rule.
