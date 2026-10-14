# Garden Within RAG

Ask questions about a [Garden Within](https://rattle-layer-d9a.notion.site/The-Garden-Within-509258cd448282cc883e816a3577324a) Notion journal and get answers that cite the exact day or week they came from.

The core rule: compute what can be computed, retrieve only what needs meaning. Dates, tones, statuses and relations are queried directly in Postgres; embeddings are only for the written answers.

**Status:** early. Ingest and the first question type (date lookups) work. Embeddings, the other question types, the landing page and the eval script are next.

## How it works

1. **Ingest** pulls the three template databases (🌱 Daily Seeds, 🌿 Weekly Roots, 🌸 The Garden) through the Notion API. Each page becomes one row: its written answers labeled by prompt, its structured fields, and its Blossom links.
2. **Ask** finds the time period in the question ("last week", "the last 10 days"), loads every entry in that range, and has Claude answer with numbered citations that map back to Notion pages.

## Run it

Needs Node 22+ and Postgres with [pgvector](https://github.com/pgvector/pgvector).

```sh
npm install
cp .env.example .env.local   # then fill it in
createdb garden_within_rag
npm run db:setup             # create tables
npm run ingest               # pull from Notion
npm run ask -- "What did I say I could let go of last week?"
```

For Notion, create an internal integration at notion.so/profile/integrations, then share each of the three databases with it (••• → Connections) and paste their URLs into `.env.local`.

```sh
npm test         # unit tests
npm run typecheck
```

## Privacy

Journal entries stay in your local Postgres and are sent only to the Claude API to answer a question. Real entries are never committed; `.env.local` is git-ignored.
