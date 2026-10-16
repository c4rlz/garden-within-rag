# Garden Within RAG

Ask questions about a [Garden Within](https://rattle-layer-d9a.notion.site/The-Garden-Within-509258cd448282cc883e816a3577324a) Notion journal and get answers that cite the exact day or week they came from.

The core rule: compute what can be computed, retrieve only what needs meaning. Dates, tones, statuses and relations are queried directly in Postgres; embeddings are only for the written answers.

**Status:** early. Ingest, embeddings for the sample data, and three question types work: date lookups, Tone / Feeling filters, and Energy Tone questions searched by meaning. Blossom and over-time questions, the landing page and the eval script are next.

## How it works

1. **Ingest** pulls the three template databases (🌱 Daily Seeds, 🌿 Weekly Roots, 🌸 The Garden) through the Notion API. Each page becomes one row: its written answers labeled by prompt, its structured fields, and its Blossom links.
2. **Ask** first works out the question's type with keyword rules (Claude classifies the rest). Lookup questions find the time period ("last week", "the last 10 days") and load every entry in that range; tone questions ("the weeks I felt Overwhelmed") load the Weekly Roots with that Tone / Feeling and the Daily Seeds from those weeks. Energy Tone questions ("What has my body been asking for on Tired days?") load that tone's Daily Seeds in Postgres, then rank the embedded ones by similarity to the question, and Claude gets the 12 closest; until the database is embedded, they say semantic search isn't set up. Each way, it has Claude answer with numbered citations that map back to Notion pages. Claude runs through your local Claude Code by default, or the Claude API.

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

If you set up the database before the sample data existed, run `npm run db:setup` again. It's safe to re-run and adds the `dataset` table that `ingest` checks.

## Sample data

`sample/garden.json` is a year of made-up Garden Within entries for demos and evals. Every title starts with "Sample". It lives in its own database, never the real one: loading replaces everything stored for each source, so loading it into the real database would wipe your entries.

```sh
createdb garden_within_sample   # needs pgvector, like the real database
npm run sample:load             # applies the schema, then loads the sample
DATABASE_URL=postgres:///garden_within_sample npm run embed
DATABASE_URL=postgres:///garden_within_sample npm run ask -- "What did I say I could let go of last week?"
```

- `embed` needs `VOYAGE_API_KEY` in `.env.local`. It embeds each entry's written answers with Voyage AI's `voyage-4`, and saves each batch as it comes back. Running it again only sends entries that are new or whose writing changed, so it's also how to finish a run that stopped partway. It refuses to run against any database not marked as sample data (see Privacy).

- `sample:load` writes to `SAMPLE_DATABASE_URL`, which defaults to `postgres:///garden_within_sample`. It refuses to run, and changes nothing, if that could be the same database as `DATABASE_URL` (default `postgres:///garden_within_rag`): same database name on the same server, where the local socket, `localhost`, `127.0.0.1` and `::1` count as one server whatever the port. It can't tell that two different hostnames point at the same server, so don't use aliases for the real database.
- The app and `ask` keep using the real database unless you set `DATABASE_URL` to the sample one on purpose.
- Dates move each time the sample is loaded, by whole weeks, so the newest entry is in the past week. Run `npm run sample:load` again to bring them up to date.
- The sample database is marked as sample data, and `npm run ingest` refuses to run against it, so real entries never mix with made-up ones.
- `npm run sample:generate` rebuilds `sample/garden.json`. It always writes the same file.

## Development

```sh
npm test         # unit tests
npm run typecheck
npm run lint
```

## Privacy

Journal entries stay in your local Postgres and are sent to Claude only to answer a question, through Claude Code or the API. Real entries are never committed; `.env.local` is git-ignored.

`npm run embed` sends written answers (each entry's `content`) to [Voyage AI](https://www.voyageai.com/) to embed them. Voyage may train on data sent to it unless your account has opted out, so only the sample database is embedded by default: `npm run embed` refuses, sending nothing, against any database not marked as sample data, including the real one at the default `DATABASE_URL`.

Energy Tone questions also send the question itself to Voyage, to embed it for search. That only happens when the matching entries are embedded and the same rule allows it: the sample database, or `EMBED_REAL_JOURNAL=yes`. Otherwise the question isn't sent anywhere.

Theme questions ("What recurring themes haven't I made progress on?") use only the embeddings already stored and never send anything to Voyage, so they need `npm run embed` to have run first.

To embed your real journal, first opt out of training: in MongoDB Atlas, go to **Organization Settings** and turn off **Help Improve Voyage AI Models**. This setting needs a payment method on file. Then set `EMBED_REAL_JOURNAL=yes` in `.env.local` and run `npm run embed`.
