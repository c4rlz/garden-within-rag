# Add an eval script for the seven brief questions

## Context
The seven questions are both the feature spec and the eval set. The brief's
done list includes "Eval script passes on sample data".

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
- `npm run eval` runs all seven questions against the sample database
  (created in ticket 01), and refuses to run against any other database.
- For each, checks that the expected entries are cited and the key facts
  appear, and prints pass or fail per question with a total.
- Exits non-zero when any question fails.

## Out of scope
- Grading answer style.

## Pointers
- Sample dataset (created in ticket 01), router (created in ticket 03)

## Constraints
- Expected results live next to the sample data, not in the script.
