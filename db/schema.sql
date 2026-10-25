-- Garden Within RAG schema. Safe to re-run.
create extension if not exists vector;

-- One row per Notion page across the three Garden Within databases.
create table if not exists entries (
  id uuid primary key,                      -- Notion page id
  source text not null check (source in ('seed', 'root', 'blossom')),
  title text not null default '',
  entry_date date,                          -- Date (seeds), Week Of or created (roots), Ideated At (blossoms)
  tones text[] not null default '{}',       -- Energy Tone (seeds) or Tone / Feeling (roots)
  status text,                              -- Status (blossoms)
  url text not null,
  written jsonb not null default '{}',      -- prompt name -> written answer, empty answers left out
  fields jsonb not null default '{}',       -- every other property, flattened
  content text not null default '',         -- written answers labeled by prompt, used for prompts
  notion_last_edited timestamptz,
  ingested_at timestamptz not null default now()
);

create index if not exists entries_source_date on entries (source, entry_date);

-- Embeddings used to live here, one per entry. They're now one per written answer, below.
alter table entries drop column if exists embedding;

-- One embedding per written answer, filled by the embed step. content is the
-- answer text that was embedded, without its prompt label.
create table if not exists answer_embeddings (
  entry_id uuid not null references entries(id) on delete cascade,
  prompt text not null,                     -- a key of entries.written
  content text not null,
  embedding vector(1024) not null,
  primary key (entry_id, prompt)
);

create index if not exists answer_embeddings_entry on answer_embeddings (entry_id);

-- Relation properties: Blossoms, 🌸 Blossom, 🌸 Priorities, 🌱 Daily Seeds, 🌿 Weekly Roots.
create table if not exists links (
  from_id uuid not null,
  to_id uuid not null,
  property text not null,
  primary key (from_id, to_id, property)
);

create index if not exists links_to on links (to_id);

-- Marks a database loaded with made-up sample data (npm run sample:load). Stays
-- empty in the real database. The check on kind allows one row at most.
create table if not exists dataset (
  kind text primary key check (kind = 'sample'),
  loaded_at timestamptz not null default now(),
  shift_weeks integer not null default 0    -- weeks the sample dates were moved by at load time
);
