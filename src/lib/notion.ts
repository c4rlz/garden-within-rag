import { Client, isFullPage, iteratePaginatedAPI } from "@notionhq/client";
import type { PageObjectResponse } from "@notionhq/client";
import type { SourceDef } from "./template";

type PropertyValue = PageObjectResponse["properties"][string];
type Flat = string | number | boolean | string[] | null;

export interface Entry {
  id: string;
  source: SourceDef["source"];
  title: string;
  entryDate: string | null;
  tones: string[];
  status: string | null;
  url: string;
  written: Record<string, string>;
  fields: Record<string, Flat>;
  content: string;
  links: { toId: string; property: string }[];
  lastEdited: string;
}

export function notionClient(): Client {
  const auth = process.env.NOTION_TOKEN;
  if (!auth) throw new Error("NOTION_TOKEN is not set. Copy .env.example to .env.local and fill it in.");
  return new Client({ auth });
}

// Accepts a database id or a database URL copied from Notion.
export function parseNotionId(value: string): string {
  const path = value.trim().split(/[?#]/)[0].replace(/\/$/, "");
  const dashed = path.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  if (dashed) return dashed[0].replace(/-/g, "").toLowerCase();
  // Page URLs end in the id: notion.so/Daily-Seeds-945258cd448282b58127018c90e5689a
  const plain = path.match(/[0-9a-f]{32}$/i);
  if (!plain) throw new Error(`Not a Notion id or URL: ${value}`);
  return plain[0].toLowerCase();
}

export async function fetchPages(notion: Client, databaseId: string): Promise<PageObjectResponse[]> {
  // Since API version 2025-09-03, rows are queried through the database's data source.
  const database = await notion.databases.retrieve({ database_id: databaseId });
  if (!("data_sources" in database) || database.data_sources.length === 0) {
    throw new Error(`Database ${databaseId} has no data source the integration can read.`);
  }
  const pages: PageObjectResponse[] = [];
  for await (const result of iteratePaginatedAPI(notion.dataSources.query, {
    data_source_id: database.data_sources[0].id,
  })) {
    if (result.object === "page" && isFullPage(result) && !result.in_trash) pages.push(result);
  }
  return pages;
}

function plainText(rich: { plain_text: string }[]): string {
  return rich.map((r) => r.plain_text).join("").trim();
}

// Note: a page object lists at most 25 items per relation. Seeds and roots link to
// only a few Blossoms each, so links are complete when read from their side.
export function flattenProperty(value: PropertyValue): Flat {
  switch (value.type) {
    case "title":
      return plainText(value.title);
    case "rich_text":
      return plainText(value.rich_text);
    case "select":
      return value.select?.name ?? null;
    case "status":
      return value.status?.name ?? null;
    case "multi_select":
      return value.multi_select.map((o) => o.name);
    case "date":
      return value.date?.start ?? null;
    case "checkbox":
      return value.checkbox;
    case "number":
      return value.number;
    case "url":
      return value.url;
    case "relation":
      return value.relation.map((r) => r.id);
    case "created_time":
      return value.created_time;
    case "last_edited_time":
      return value.last_edited_time;
    default:
      return null;
  }
}

export function toEntry(page: PageObjectResponse, def: SourceDef): Entry {
  const written: Record<string, string> = {};
  const fields: Record<string, Flat> = {};
  const links: Entry["links"] = [];
  let title = "";

  for (const [name, value] of Object.entries(page.properties)) {
    const flat = flattenProperty(value);
    if (value.type === "title") title = (flat as string) ?? "";
    else if (value.type === "rich_text") {
      if (flat) written[name] = flat as string;
    } else if (value.type === "relation") {
      for (const toId of flat as string[]) links.push({ toId, property: name });
    } else fields[name] = flat;
  }

  const date = def.dateProps.map((p) => fields[p]).find((v): v is string => typeof v === "string");
  const entryDate = (date ?? page.created_time).slice(0, 10);

  const toneValue = def.toneProp ? fields[def.toneProp] : null;
  const tones = Array.isArray(toneValue) ? toneValue : typeof toneValue === "string" ? [toneValue] : [];
  const statusValue = def.statusProp ? fields[def.statusProp] : null;

  const content = Object.entries(written)
    .map(([prompt, answer]) => `${prompt}\n${answer}`)
    .join("\n\n");

  return {
    id: page.id,
    source: def.source,
    title,
    entryDate,
    tones,
    status: typeof statusValue === "string" ? statusValue : null,
    url: page.url,
    written,
    fields,
    content,
    links,
    lastEdited: page.last_edited_time,
  };
}
