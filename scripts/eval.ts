// Asks the brief's seven questions against the sample database and checks each
// answer against sample/evals.json. Calls Claude and Voyage, so npm test doesn't run it.
import { readFile } from "node:fs/promises";
import { answerQuestion } from "../src/lib/answer";
import { datasetKind, shiftWeeks } from "../src/lib/dataset";
import { closeDb, db } from "../src/lib/db";
import { anyFailed, evalRefusal, evalToday, formatResult, formatTotal, runEvals, sampleEntryIds, sampleUrls, type EvalFile } from "../src/lib/evals";
import { readSampleDataset } from "../src/lib/sample";

// db() reads DATABASE_URL on first use, so everything below talks to the sample database.
process.env.DATABASE_URL = process.env.SAMPLE_DATABASE_URL ?? "postgres:///garden_within_sample";

try {
  // Decided before anything is sent, so a refusal costs nothing.
  const kind = await datasetKind();
  let unembedded = 0;
  if (kind === "sample") {
    const { rows } = await db().query("select count(*)::int as n from entries where content <> '' and embedding is null");
    unembedded = rows[0].n;
  }
  const refusal = evalRefusal(kind, unembedded);
  if (refusal) {
    console.error(refusal);
    process.exitCode = 1;
  } else {
    const dataset = await readSampleDataset();
    const { cases }: EvalFile = JSON.parse(await readFile(new URL("../sample/evals.json", import.meta.url), "utf8"));
    const today = evalToday(await shiftWeeks(), dataset);
    console.log(`Asking ${cases.length} questions as of ${today}.\n`);

    const results = await runEvals(
      cases,
      (question) => answerQuestion(question, today),
      sampleUrls(dataset),
      sampleEntryIds(dataset),
      (result) => console.log(formatResult(result)),
    );
    console.log(`\n${formatTotal(results)}`);
    if (anyFailed(results)) process.exitCode = 1;
  }
} finally {
  await closeDb();
}
