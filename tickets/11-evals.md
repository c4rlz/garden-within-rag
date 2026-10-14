# Add an eval script for the seven brief questions

## Context
The seven questions are both the feature spec and the eval set. The brief's
done list includes "Eval script passes on sample data".

## Acceptance criteria
- `npm run eval` runs all seven questions against the loaded sample data.
- For each, checks that the expected entries are cited and the key facts
  appear, and prints pass or fail per question with a total.
- Exits non-zero when any question fails.

## Out of scope
- Grading answer style.

## Pointers
- Sample dataset (created in ticket 01), router (created in ticket 03)

## Constraints
- Expected results live next to the sample data, not in the script.
