# Add an ask box with cited answers to the landing page

## Context
The landing page needs "a box to ask questions, with cited answers".

## Acceptance criteria
- A question box on the landing page sends the question to a server route
  that uses the router.
- The answer shows with numbered citations linking to the Notion pages.
- Shows a loading state and readable errors.

## Out of scope
- Saving question history.

## Pointers
- Landing page (created in ticket 09), router (created in ticket 03),
  `Citation` in `src/lib/answer.ts`

## Constraints
- No new dependencies.
