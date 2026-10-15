import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTypeReply, routeByRules, routeQuestion } from "../src/lib/router";

const TODAY = "2026-10-14";

test("each of the brief's seven questions gets its type", () => {
  const cases: [string, string, string?][] = [
    ["What did I say I could let go of last week?", "lookup"],
    ["What was going on during the weeks I felt Overwhelmed?", "filter", "Overwhelmed"],
    ["What has my body been asking for on Tired days?", "filter + meaning", "Tired"],
    ["How has my morning meditation intention actually gone?", "relation"],
    ["What have been the biggest changes in priorities?", "over time"],
    ["What recurring themes haven't I made progress on?", "over time"],
    ["What was each month's tone?", "over time"],
  ];
  for (const [question, type, tone] of cases) {
    const route = routeByRules(question, TODAY);
    assert.equal(route?.type, type, question);
    assert.equal(route?.tone, tone, question);
  }
});

test("rules are checked in order and the first match wins", () => {
  assert.deepEqual(routeByRules("What happened when I was Overwhelmed last month?", TODAY), { type: "filter", tone: "Overwhelmed" });
  assert.equal(routeByRules("What was each month's tone? Was it mostly Grounded?", TODAY)?.type, "over time");
  assert.equal(routeByRules("What about Tired days during my intention?", TODAY)?.type, "relation");
  assert.equal(routeByRules("Have I had any Tired days in weeks I felt Tender?", TODAY)?.type, "filter + meaning");
});

test("other over-time and relation phrasings", () => {
  assert.equal(routeByRules("How have my priorities changed?", TODAY)?.type, "over time");
  assert.equal(routeByRules("What haven’t I made any progress on?", TODAY)?.type, "over time");
  assert.equal(routeByRules("How has my journaling habit gone?", TODAY)?.type, "relation");
  assert.equal(routeByRules("Which Blossoms did I finish?", TODAY)?.type, "relation");
});

test("over-time questions get a sub-type, and their type stays over time", () => {
  const cases: [string, string | undefined][] = [
    ["What have been the biggest changes in priorities?", "priorities"],
    ["What recurring themes haven't I made progress on?", "themes"],
    ["What was each month's tone?", "monthly tone"],
    ["How have my priorities changed?", "priorities"],
    ["How have my priorities shifted week by week?", "priorities"],
    ["What were the changes in my priorities each month?", "priorities"],
    ["Which themes kept coming up over time?", "themes"],
    ["How have I changed over time?", undefined],
  ];
  for (const [question, overTime] of cases) {
    const route = routeByRules(question, TODAY);
    assert.equal(route?.type, "over time", question);
    assert.equal(route?.overTime, overTime, question);
  }
  assert.deepEqual(routeByRules("How have I changed over time?", TODAY), { type: "over time" });
});

test("Claude's over-time classification has no sub-type", async () => {
  assert.deepEqual(await routeQuestion("What keeps me going?", TODAY, async () => "over time"), { type: "over time" });
});

test("tones match case-insensitively on whole words", () => {
  assert.deepEqual(routeByRules("weeks i felt OVERWHELMED", TODAY), { type: "filter", tone: "Overwhelmed" });
  assert.equal(routeByRules("What made the week feel lighter?", TODAY), null);
  assert.equal(routeByRules("Was I lowkey stressed out?", TODAY)?.tone, "Stressed");
  assert.equal(routeByRules("What did I write below?", TODAY), null);
});

test("Claude classifies only questions no rule places", async () => {
  const calls: string[] = [];
  const classify = async (_system: string, prompt: string) => {
    calls.push(prompt);
    return "Relation";
  };
  assert.deepEqual(await routeQuestion("What keeps me going?", TODAY, classify), { type: "relation" });
  assert.deepEqual(calls, ["What keeps me going?"]);

  await routeQuestion("What did I say I could let go of last week?", TODAY, classify);
  assert.equal(calls.length, 1);
});

test("an unrecognised classifier reply means not supported", async () => {
  const route = await routeQuestion("What keeps me going?", TODAY, async () => "I think it's a lookup");
  assert.equal(route, null);
});

test("parseTypeReply accepts the five names and nothing else", () => {
  assert.equal(parseTypeReply("lookup"), "lookup");
  assert.equal(parseTypeReply("  Filter\n"), "filter");
  assert.equal(parseTypeReply("`filter + meaning`"), "filter + meaning");
  assert.equal(parseTypeReply('"Relation".'), "relation");
  assert.equal(parseTypeReply("OVER TIME"), "over time");
  for (const reply of ["", "none", "lookup question", "filter+meaning", "The type is relation", "over-time"]) {
    assert.equal(parseTypeReply(reply), null, reply);
  }
});
