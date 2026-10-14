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
  content text not null default '',         -- written answers labeled by prompt, used for prompts and embeddings
  embedding vector(1024),                   -- filled by the embed step
  notion_last_edited timestamptz,
  ingested_at timestamptz not null default now()
);

create index if not exists entries_source_date on entries (source, entry_date);

-- Relation properties: Blossoms, 🌸 Blossom, 🌸 Priorities, 🌱 Daily Seeds, 🌿 Weekly Roots.
create table if not exists links (
  from_id uuid not null,
  to_id uuid not null,
  property text not null,
  primary key (from_id, to_id, property)
);

create index if not exists links_to on links (to_id);
