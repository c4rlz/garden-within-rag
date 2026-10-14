import { test } from "node:test";
import assert from "node:assert/strict";
import type { PageObjectResponse } from "@notionhq/client";
import { parseNotionId, toEntry } from "../src/lib/notion";
import { sourceDef } from "../src/lib/template";

const text = (s: string) => ({ type: "rich_text", rich_text: s ? [{ plain_text: s }] : [] });

// A Daily Seed shaped like the template's, with made-up writing.
const seed = {
  object: "page",
  id: "11111111-2222-3333-4444-555555555555",
  created_time: "2026-10-06T15:00:00.000Z",
  last_edited_time: "2026-10-06T16:00:00.000Z",
  in_trash: false,
  url: "https://www.notion.so/Seed-11111111222233334444555555555555",
  properties: {
    Title: { type: "title", title: [{ plain_text: "October 6" }] },
    Date: { type: "date", date: { start: "2026-10-06", end: null } },
    "Energy Tone": { type: "multi_select", multi_select: [{ name: "Tired" }, { name: "Gentle" }] },
    "Body Offering - Self Care": { type: "checkbox", checkbox: true },
    Blossoms: { type: "relation", relation: [{ id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" }] },
    "What can I let go of?": text("Sample: the to-do list I didn't finish."),
    "What wants clarity?": text(""),
  },
} as unknown as PageObjectResponse;

test("toEntry flattens a Daily Seed", () => {
  const entry = toEntry(seed, sourceDef("seed"));
  assert.equal(entry.entryDate, "2026-10-06");
  assert.deepEqual(entry.tones, ["Tired", "Gentle"]);
  assert.deepEqual(entry.written, { "What can I let go of?": "Sample: the to-do list I didn't finish." });
  assert.equal(entry.content, "What can I let go of?\nSample: the to-do list I didn't finish.");
  assert.equal(entry.fields["Body Offering - Self Care"], true);
  assert.deepEqual(entry.links, [{ toId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", property: "Blossoms" }]);
});

test("a Weekly Root with no Week Of falls back to its created date", () => {
  const root = {
    ...seed,
    created_time: "2026-10-11T13:00:00.000Z",
    properties: {
      Title: { type: "title", title: [{ plain_text: "Weekly Root" }] },
      "Week Of": { type: "date", date: null },
      "Tone / Feeling": { type: "select", select: { name: "Tender" } },
    },
  } as unknown as PageObjectResponse;
  const entry = toEntry(root, sourceDef("root"));
  assert.equal(entry.entryDate, "2026-10-11");
  assert.deepEqual(entry.tones, ["Tender"]);
  assert.equal(entry.content, "");
});

test("parseNotionId reads ids and URLs", () => {
  const id = "945258cd448282b58127018c90e5689a";
  assert.equal(parseNotionId(id), id);
  assert.equal(parseNotionId("945258cd-4482-82b5-8127-018c90e5689a"), id);
  assert.equal(parseNotionId(`https://www.notion.so/me/Cafe-${id}?v=0123456789abcdef0123456789abcdef`), id);
  assert.throws(() => parseNotionId("https://www.notion.so/nothing-here"));
});
