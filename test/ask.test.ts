import { test } from "node:test";
import assert from "node:assert/strict";
import type { Answer, Citation } from "../src/lib/answer";
import { answerParts, askResponse, boldParts, MAX_QUESTION_LENGTH, parseAskBody } from "../src/lib/ask";

test("parseAskBody accepts a question and trims it", () => {
  assert.deepEqual(parseAskBody({ question: "  What did I do last week?  " }), { question: "What did I do last week?" });
});

test("parseAskBody rejects missing, non-string, blank and over-long questions", () => {
  assert.deepEqual(parseAskBody(null), { error: "Type a question first." });
  assert.deepEqual(parseAskBody({}), { error: "Type a question first." });
  assert.deepEqual(parseAskBody({ question: 42 }), { error: "Type a question first." });
  assert.deepEqual(parseAskBody({ question: "   \n " }), { error: "Type a question first." });
  assert.deepEqual(parseAskBody({ question: "a".repeat(MAX_QUESTION_LENGTH + 1) }), {
    error: "Keep questions under 500 characters.",
  });
  assert.deepEqual(parseAskBody({ question: "a".repeat(MAX_QUESTION_LENGTH) }), {
    question: "a".repeat(MAX_QUESTION_LENGTH),
  });
});

const answer: Answer = {
  question: "What did I do last week?",
  range: null,
  filter: null,
  answer: "You rested [1].",
  citations: [{ n: 1, label: "Daily Seed", date: "2026-10-12", url: "https://www.notion.so/a" }],
  entriesConsidered: 1,
};

// Keeps the expected console.error out of the test output.
async function quietly<T>(fn: () => Promise<T>): Promise<T> {
  const original = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = original;
  }
}

test("askResponse passes the answer through with status 200", async () => {
  const asked: string[] = [];
  const result = await askResponse("What did I do last week?", async (q) => {
    asked.push(q);
    return answer;
  });
  assert.deepEqual(asked, ["What did I do last week?"]);
  assert.deepEqual(result, { status: 200, body: answer });
});

test("askResponse turns a thrown error into status 500 with its message", async () => {
  const message = "Claude Code isn't installed or not on your PATH. Install it, or set CLAUDE_BACKEND=api.";
  const result = await quietly(() =>
    askResponse("q", async () => {
      throw new Error(message);
    }),
  );
  assert.deepEqual(result, { status: 500, body: { error: message } });
});

test("askResponse only sends an error's first line to the browser", async () => {
  const result = await quietly(() =>
    askResponse("q", async () => {
      throw new Error("Claude Code didn't answer (exit 1).\nsecret stderr from the CLI");
    }),
  );
  assert.deepEqual(result, { status: 500, body: { error: "Claude Code didn't answer (exit 1)." } });
  assert.ok(!JSON.stringify(result.body).includes("secret"));
});

const cites: Citation[] = [
  { n: 1, label: "Daily Seed", date: "2026-10-12", url: "https://www.notion.so/1" },
  { n: 2, label: "Daily Seed", date: "2026-10-13", url: "https://www.notion.so/2" },
  { n: 3, label: "Weekly Root", date: "2026-10-18", url: "https://www.notion.so/3" },
];

test("answerParts splits the answer at its citation markers, in order", () => {
  assert.deepEqual(answerParts("You rested [1] and walked [2][3].", cites), [
    { text: "You rested " },
    { cite: cites[0] },
    { text: " and walked " },
    { cite: cites[1] },
    { cite: cites[2] },
    { text: "." },
  ]);
});

test("answerParts keeps a marker with no matching citation as text", () => {
  assert.deepEqual(answerParts("You rested [1] and [9].", cites), [
    { text: "You rested " },
    { cite: cites[0] },
    { text: " and [9]." },
  ]);
});

test("answerParts returns an answer with no markers as one text part", () => {
  assert.deepEqual(answerParts("Nothing to cite.", cites), [{ text: "Nothing to cite." }]);
  assert.deepEqual(answerParts("", []), [{ text: "" }]);
});

test("boldParts marks **bold** runs and keeps the rest as text", () => {
  assert.deepEqual(boldParts("**Oct 2026**\nMostly Tired, **some** Happy"), [
    { text: "Oct 2026", bold: true },
    { text: "\nMostly Tired, ", bold: false },
    { text: "some", bold: true },
    { text: " Happy", bold: false },
  ]);
});

test("boldParts leaves an unpaired or empty ** as text", () => {
  assert.deepEqual(boldParts("a ** b"), [{ text: "a ** b", bold: false }]);
  assert.deepEqual(boldParts("a **** b"), [{ text: "a **** b", bold: false }]);
  assert.deepEqual(boldParts(""), []);
});
