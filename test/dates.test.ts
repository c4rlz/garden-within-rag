import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDateRange } from "../src/lib/dates";

// 2026-10-14 is a Wednesday.
const today = "2026-10-14";

test("last week is the previous Monday to Sunday", () => {
  assert.deepEqual(parseDateRange("What did I say I could let go of last week?", today), {
    from: "2026-10-05",
    to: "2026-10-11",
    label: "last week",
  });
});

test("last week from a Monday or Sunday", () => {
  assert.equal(parseDateRange("last week", "2026-10-12")?.from, "2026-10-05");
  assert.equal(parseDateRange("last week", "2026-10-18")?.to, "2026-10-11");
});

test("this week runs from Monday to today", () => {
  assert.deepEqual(parseDateRange("this week", today), { from: "2026-10-12", to: today, label: "this week" });
});

test("last N days includes today", () => {
  assert.deepEqual(parseDateRange("over the last 10 days", today), {
    from: "2026-10-05",
    to: today,
    label: "the last 10 days",
  });
  assert.equal(parseDateRange("the past two weeks", today)?.from, "2026-10-01");
});

test("months", () => {
  assert.deepEqual(parseDateRange("last month", today), { from: "2026-09-01", to: "2026-09-30", label: "last month" });
  assert.equal(parseDateRange("this month", today)?.from, "2026-10-01");
  assert.equal(parseDateRange("last month", "2026-03-10")?.to, "2026-02-28");
});

test("no time phrase", () => {
  assert.equal(parseDateRange("What has my body been asking for on Tired days?", today), null);
});
