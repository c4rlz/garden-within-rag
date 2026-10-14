// npm run ask -- "What did I say I could let go of last week?"
import { answerLookup } from "../src/lib/answer";
import { closeDb } from "../src/lib/db";

const question = process.argv.slice(2).join(" ").trim();
if (!question) {
  console.error('Usage: npm run ask -- "What did I say I could let go of last week?"');
  process.exit(1);
}

try {
  const result = await answerLookup(question);
  if (result.range) console.log(`Looking at ${result.range.label}: ${result.range.from} to ${result.range.to} (${result.entriesConsidered} entries)\n`);
  console.log(result.answer);
  if (result.citations.length) {
    console.log("\nSources");
    for (const c of result.citations) console.log(`[${c.n}] ${c.label}, ${c.date}: ${c.url}`);
  }
} finally {
  await closeDb();
}
