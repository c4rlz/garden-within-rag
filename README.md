# Garden Within RAG

Ask questions about a [Garden Within](https://rattle-layer-d9a.notion.site/The-Garden-Within-509258cd448282cc883e816a3577324a) Notion journal and get answers that cite the exact day or week they came from.

The core rule: compute what can be computed, retrieve only what needs meaning. Dates, tones, statuses and relations are queried directly in Postgres; embeddings are only for the written answers.

**Status:** early. Ingest and the first question type (date lookups) work. Embeddings, the other question types, the landing page and the eval script are next.

## How it works

1. **Ingest** pulls the three template databases (🌱 Daily Seeds, 🌿 Weekly Roots, 🌸 The Garden) through the Notion API. Each page becomes one row: its written answers labeled by prompt, its structured fields, and its Blossom links.
2. **Ask** finds the time period in the question ("last week", "the last 10 days"), loads every entry in that range, and has Claude answer with numbered citations that map back to Notion pages. Claude runs through your local Claude Code by default, or the Claude API.

## Setup

You need Node 22+, Postgres with [pgvector](https://github.com/pgvector/pgvector), a Notion workspace with the Garden Within template, and either [Claude Code](https://claude.com/claude-code) or a Claude API key.

### 1. Get the template

If you don't already use it, open the [Garden Within template](https://rattle-layer-d9a.notion.site/The-Garden-Within-509258cd448282cc883e816a3577324a) and select **Duplicate** to copy it into your workspace. The tool reads the template's property names as they are, so rename databases if you like, but leave the properties alone.

### 2. Create a Notion token

The tool uses a Notion personal access token. It reads with your own permissions, so you don't need to share each database with it.

1. Open [Personal access tokens](https://www.notion.so/developers/tokens) in Notion's Developer portal.
2. Select **New token**.
3. Name it (for example "Garden Within RAG"), tick the **Notion API** capability, and choose an expiration. If a workspace picker appears, pick the workspace that holds your Garden Within.
4. Select **Create token** and copy the value, which starts with `ntn_`. Notion only shows it once.

Who can create tokens depends on the plan. On Free, only workspace owners can, and on Business only owners can unless an admin allows members in **Settings → Connections**. If **New token** isn't available to you, ask a workspace owner.

<details>
<summary>Prefer a separate bot instead of your own permissions?</summary>

Create an internal connection in the [Developer portal](https://app.notion.com/developers/connections) under **Build → Internal connections**, and copy its **API token** from the **Configuration** tab. Then give it access to the three databases: either from its **Content access** tab, or from each database's **•••** menu → **Connections** → **+ Add connection**. Sharing the parent 🪴 The Garden Within page covers all three.

</details>

### 3. Copy the three database links

In Notion, open each of 🌱 Daily Seeds, 🌿 Weekly Roots and 🌸 The Garden as a full page, and copy its link from **Share → Copy link**, or straight from the address bar. The tool accepts the full link or just the id at the end of it.

### 4. Choose how Claude answers

By default the tool runs your installed Claude Code (`claude -p`), so answers use your Claude Code login and plan, with no API key. Install Claude Code and sign in once by running `claude`. The tool gives it no tools and no saved session: it only reads the entries in the question, and they don't appear in your Claude Code history.

To use the Claude API instead, create a key in the [Claude Console](https://platform.claude.com/settings/keys) under **API keys**, then set `CLAUDE_BACKEND=api` and `ANTHROPIC_API_KEY` in `.env.local`.

### 5. Configure and run

```sh
npm install
cp .env.example .env.local   # paste the token and database links
createdb garden_within_rag
npm run db:setup             # create tables
npm run ingest               # pull from Notion; run again any time to sync
npm run ask -- "What did I say I could let go of last week?"
```

`ingest` prints how many pages it found in each database and how many have writing, which is a quick check that the token and links work.

## Development

```sh
npm test         # unit tests
npm run typecheck
npm run lint
```

## Privacy

Journal entries stay in your local Postgres and are sent to Claude only to answer a question, through Claude Code or the API. Real entries are never committed; `.env.local` is git-ignored.
