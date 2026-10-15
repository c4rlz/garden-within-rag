import { complete } from "./claude";
import { datasetKind } from "./dataset";
import { db } from "./db";
import { addDays, localToday, parseDateRange, startOfWeek, type DateRange } from "./dates";
import { embedRefusal } from "./embed";
import { ENERGY_TONES, ROOT_TONES, routeQuestion, type QuestionType } from "./router";
import { rankBySimilarity, TOP_MATCHES } from "./search";
import { sourceDef, type Source } from "./template";
import { embed, VoyageError } from "./voyage";

export interface Row {
  id: string;
  source: Source;
  title: string;
  entry_date: string;
  tones: string[];
  status: string | null;
  url: string;
  content: string;
}

export interface Citation {
  n: number;
  label: string;
  date: string;
  url: string;
}

export interface Answer {
  question: string;
  range: DateRange | null;
  filter: string | null; // e.g. "Weeks you felt Overwhelmed: 6 weeks"
  answer: string;
  citations: Citation[];
  entriesConsidered: number;
}

const SYSTEM = `You answer questions about the user's Garden Within journal: Daily Seeds (daily reflections), Weekly Roots (weekly reviews) and Blossoms (intentions).

Answer only from the numbered entries you are given. Speak to the user as "you". Be brief and plain, and quote their own words where it helps.
Cite every claim with the entry number in square brackets, like [2] or [1][3]. If the entries don't answer the question, say so plainly instead of guessing.`;

function entryLabel(row: Row): string {
  const def = sourceDef(row.source);
  const parts = [def.label, formatDate(row.entry_date)];
  if (row.tones.length) parts.push(`${def.toneProp}: ${row.tones.join(", ")}`);
  if (row.status) parts.push(`Status: ${row.status}`);
  return parts.join(" · ");
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

// The numbered entries Claude answers from.
export function numberedContext(rows: Row[]): string {
  return rows.map((row, i) => `[${i + 1}] ${entryLabel(row)}\n${row.content}`).join("\n\n---\n\n");
}

// Maps the [n] markers in Claude's answer back to the rows they came from.
export function citationsFrom(answer: string, rows: Row[]): Citation[] {
  const cited = new Set([...answer.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])));
  return [...cited]
    .filter((n) => n >= 1 && n <= rows.length)
    .sort((a, b) => a - b)
    .map((n) => {
      const row = rows[n - 1];
      return { n, label: sourceDef(row.source).label, date: row.entry_date, url: row.url };
    });
}

async function entriesInRange(range: DateRange): Promise<Row[]> {
  const { rows } = await db().query<Row>(
    `select id, source, title, to_char(entry_date, 'YYYY-MM-DD') as entry_date, tones, status, url, content
       from entries
      where source in ('seed', 'root') and entry_date between $1 and $2 and content <> ''
      order by entry_date, source`,
    [range.from, range.to],
  );
  return rows;
}

// Lookup questions: filter by date, then hand every matching entry to Claude.
// A week is at most eight entries, so no semantic search is needed.
export async function answerLookup(question: string, today = localToday()): Promise<Answer> {
  const range = parseDateRange(question, today);
  if (!range) {
    return {
      question,
      range,
      filter: null,
      answer: "I couldn't find a time period in that question. Try \"last week\", \"this month\" or \"the last 10 days\".",
      citations: [],
      entriesConsidered: 0,
    };
  }

  const rows = await entriesInRange(range);
  if (rows.length === 0) {
    return {
      question,
      range,
      filter: null,
      answer: `You didn't write any Seeds or Roots ${range.label} (${range.from} to ${range.to}).`,
      citations: [],
      entriesConsidered: 0,
    };
  }

  const prompt = `Today is ${today}. The question covers ${range.label}: ${range.from} to ${range.to}.\n\n<entries>\n${numberedContext(rows)}\n</entries>\n\nQuestion: ${question}`;

  const answer = await complete(SYSTEM, prompt);

  return { question, range, filter: null, answer, citations: citationsFrom(answer, rows), entriesConsidered: rows.length };
}

export interface Week {
  from: string; // Monday
  to: string; // Sunday
}

// The Monday-to-Sunday weeks the Roots fall in, without duplicates, in order.
export function weeksOf(roots: { entry_date: string | null }[]): Week[] {
  const starts = new Set(roots.flatMap((r) => (r.entry_date ? [startOfWeek(r.entry_date)] : [])));
  return [...starts].sort().map((from) => ({ from, to: addDays(from, 6) }));
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function filterPrompt(tone: string, weeks: Week[], rows: Row[], question: string, today: string): string {
  const list = weeks.map((w) => `week of ${w.from}`).join(", ");
  return `Today is ${today}. The question covers the ${plural(weeks.length, "week")} you felt ${tone}: ${list}.\n\n<entries>\n${numberedContext(rows)}\n</entries>\n\nQuestion: ${question}`;
}

const COLUMNS = `id, source, title, to_char(entry_date, 'YYYY-MM-DD') as entry_date, tones, status, url, content`;

async function rootsWithTone(tone: string): Promise<Row[]> {
  const { rows } = await db().query<Row>(
    `select ${COLUMNS}
       from entries
      where source = 'root' and $1 = any(tones) and entry_date is not null
      order by entry_date`,
    [tone],
  );
  return rows;
}

// Postgres weeks start on Monday, the same as startOfWeek.
async function seedsInWeeks(weekStarts: string[]): Promise<Row[]> {
  const { rows } = await db().query<Row>(
    `select ${COLUMNS}
       from entries
      where source = 'seed' and date_trunc('week', entry_date::timestamp)::date = any($1::date[]) and content <> ''
      order by entry_date`,
    [weekStarts],
  );
  return rows;
}

// Filter questions: pick the weeks whose Root has the tone, then hand Claude
// those Roots and every Seed written in the same weeks.
export async function answerFilter(
  question: string,
  tone: string,
  today = localToday(),
  deps: {
    complete: (system: string, prompt: string) => Promise<string>;
    rootsWithTone: (tone: string) => Promise<Row[]>;
    seedsInWeeks: (weekStarts: string[]) => Promise<Row[]>;
  } = { complete, rootsWithTone, seedsInWeeks },
): Promise<Answer> {
  const roots = await deps.rootsWithTone(tone);
  if (roots.length === 0) {
    return {
      question,
      range: null,
      filter: `Weeks you felt ${tone}: 0 weeks`,
      answer: `You didn't have any weeks where you felt ${tone}.`,
      citations: [],
      entriesConsidered: 0,
    };
  }

  // Every matching week counts, even one with nothing written in it.
  const weeks = weeksOf(roots);
  const filter = `Weeks you felt ${tone}: ${plural(weeks.length, "week")}`;
  const seeds = await deps.seedsInWeeks(weeks.map((w) => w.from));
  const rows = [...roots, ...seeds]
    .filter((row) => row.content !== "")
    .sort((a, b) => a.entry_date.localeCompare(b.entry_date) || a.source.localeCompare(b.source));

  if (rows.length === 0) {
    return {
      question,
      range: null,
      filter,
      answer: `You felt ${tone} for ${plural(weeks.length, "week")}, but didn't write any Seeds or Roots in them.`,
      citations: [],
      entriesConsidered: 0,
    };
  }

  const answer = await deps.complete(SYSTEM, filterPrompt(tone, weeks, rows, question, today));

  return { question, range: null, filter, answer, citations: citationsFrom(answer, rows), entriesConsidered: rows.length };
}

export type EmbeddedRow = Row & { embedding: number[] | null };

// Every Seed with the Energy Tone, written or not, so the day count matches
// answerFilter's week count. pgvector's text form ([0.1,0.2,…]) is valid JSON.
async function seedsWithEnergyTone(tone: string): Promise<EmbeddedRow[]> {
  const { rows } = await db().query<Row & { embedding: string | null }>(
    `select ${COLUMNS}, embedding::text as embedding
       from entries
      where source = 'seed' and $1 = any(tones) and entry_date is not null
      order by entry_date`,
    [tone],
  );
  return rows.map((r) => ({ ...r, embedding: r.embedding === null ? null : (JSON.parse(r.embedding) as number[]) }));
}

async function embedQuery(question: string): Promise<number[]> {
  const [vector] = await embed([question], "query");
  return vector;
}

// Why the question mustn't be sent to Voyage, or null if it may. Same rule as npm run embed.
async function queryRefusal(): Promise<string | null> {
  return embedRefusal(await datasetKind());
}

export function filterMeaningPrompt(tone: string, dayCount: number, rows: Row[], question: string, today: string): string {
  return `Today is ${today}. The question covers the ${plural(dayCount, "day")} you felt ${tone}. These are the ${rows.length} ${rows.length === 1 ? "entry" : "entries"} from those days closest in meaning to the question, in date order.\n\n<entries>\n${numberedContext(rows)}\n</entries>\n\nQuestion: ${question}`;
}

function voyageFailure(err: unknown): string {
  if (err instanceof VoyageError) return `Semantic search failed: Voyage returned ${err.status}. Try again in a moment.`;
  return err instanceof Error ? err.message : String(err);
}

// Filter + meaning questions: load the Seeds with the Energy Tone in SQL, then
// rank the embedded ones by similarity to the question and hand Claude the
// closest. Every check that can stop the answer runs before the question is
// sent to Voyage.
export async function answerFilterMeaning(
  question: string,
  tone: string,
  today = localToday(),
  deps: {
    complete: (system: string, prompt: string) => Promise<string>;
    seedsWithEnergyTone: (tone: string) => Promise<EmbeddedRow[]>;
    queryRefusal: () => Promise<string | null>;
    embedQuery: (question: string) => Promise<number[]>;
  } = { complete, seedsWithEnergyTone, queryRefusal, embedQuery },
): Promise<Answer> {
  const none = { question, range: null, citations: [], entriesConsidered: 0 };

  const seeds = await deps.seedsWithEnergyTone(tone);
  if (seeds.length === 0) {
    return { ...none, filter: `Days you felt ${tone}: 0 days`, answer: `You didn't have any days where you felt ${tone}.` };
  }

  const written = seeds.filter((row) => row.content !== "");
  const embedded = written.filter((row) => row.embedding);
  const filter = `Days you felt ${tone}: ${plural(seeds.length, "day")}, ${embedded.length} searched`;

  if (written.length === 0) {
    return { ...none, filter, answer: `You felt ${tone} on ${plural(seeds.length, "day")}, but didn't write any Seeds on them.` };
  }

  const notSetUp = {
    ...none,
    filter: `Days you felt ${tone}: ${plural(seeds.length, "day")}, 0 searched`,
    answer:
      "Semantic search isn't set up for this database yet, so nothing was searched or sent. Run npm run embed first (see README → Privacy).",
  };
  if (embedded.length === 0) return notSetUp;
  // Embeddings existing isn't enough: the real journal's questions only go to
  // Voyage after the user has opted in with EMBED_REAL_JOURNAL=yes.
  if (await deps.queryRefusal()) return notSetUp;

  let queryVector: number[];
  try {
    queryVector = await deps.embedQuery(question);
  } catch (err) {
    return { ...none, filter, answer: voyageFailure(err) };
  }

  // Picked by similarity, then shown and cited in date order like the other answerers.
  const rows = rankBySimilarity(embedded, queryVector, TOP_MATCHES)
    .map((match) => match.row)
    .sort((a, b) => a.entry_date.localeCompare(b.entry_date));

  let answer = await deps.complete(SYSTEM, filterMeaningPrompt(tone, seeds.length, rows, question, today));
  const unsearched = written.length - embedded.length;
  if (unsearched > 0) {
    answer += `\n\n${unsearched} of these days ${unsearched === 1 ? "wasn't" : "weren't"} searched because ${unsearched === 1 ? "it isn't" : "they aren't"} embedded yet (run npm run embed).`;
  }

  return { question, range: null, filter, answer, citations: citationsFrom(answer, rows), entriesConsidered: rows.length };
}

const NOT_SUPPORTED: Partial<Record<QuestionType, string>> = {
  relation: "Questions about how a Blossom has gone aren't supported yet.",
  "over time": "Questions about change over time aren't supported yet.",
};

export function notSupported(question: string, type: QuestionType | null): Answer {
  return {
    question,
    range: null,
    filter: null,
    answer: (type && NOT_SUPPORTED[type]) || "I couldn't tell what kind of question that is, so it isn't supported yet.",
    citations: [],
    entriesConsidered: 0,
  };
}

// Routes the question to the answerer for its type.
export async function answerQuestion(
  question: string,
  today = localToday(),
  deps: {
    classify: (system: string, prompt: string) => Promise<string>;
    answerLookup: (question: string, today: string) => Promise<Answer>;
    answerFilter: (question: string, tone: string, today: string) => Promise<Answer>;
    answerFilterMeaning: (question: string, tone: string, today: string) => Promise<Answer>;
  } = {
    classify: complete,
    answerLookup,
    answerFilter: (q, tone, t) => answerFilter(q, tone, t),
    answerFilterMeaning: (q, tone, t) => answerFilterMeaning(q, tone, t),
  },
): Promise<Answer> {
  const route = await routeQuestion(question, today, deps.classify);

  if (route?.type === "lookup") return deps.answerLookup(question, today);
  if (route?.type === "filter") {
    if (route.tone) return deps.answerFilter(question, route.tone, today);
    return { ...notSupported(question, null), answer: `Name a Tone / Feeling to filter by: ${ROOT_TONES.join(", ")}.` };
  }
  if (route?.type === "filter + meaning") {
    if (route.tone) return deps.answerFilterMeaning(question, route.tone, today);
    return { ...notSupported(question, null), answer: `Name an Energy Tone to filter by: ${ENERGY_TONES.join(", ")}.` };
  }
  return notSupported(question, route?.type ?? null);
}
