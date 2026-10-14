import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db";
import { localToday, parseDateRange, type DateRange } from "./dates";
import { sourceDef, type Source } from "./template";

const MODEL = "claude-opus-5-5";

interface Row {
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
      answer: `You didn't write any Seeds or Roots ${range.label} (${range.from} to ${range.to}).`,
      citations: [],
      entriesConsidered: 0,
    };
  }

  const context = rows.map((row, i) => `[${i + 1}] ${entryLabel(row)}\n${row.content}`).join("\n\n---\n\n");
  const prompt = `Today is ${today}. The question covers ${range.label}: ${range.from} to ${range.to}.\n\n<entries>\n${context}\n</entries>\n\nQuestion: ${question}`;

  const client = new Anthropic();
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: "medium" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    messages: [{ role: "user", content: prompt }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error(`Claude declined to answer (${response.stop_details?.category ?? "no category"}).`);
  }

  const answer = response.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("")
    .trim();

  const cited = new Set([...answer.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])));
  const citations = [...cited]
    .filter((n) => n >= 1 && n <= rows.length)
    .sort((a, b) => a - b)
    .map((n) => {
      const row = rows[n - 1];
      return { n, label: sourceDef(row.source).label, date: row.entry_date, url: row.url };
    });

  return { question, range, answer, citations, entriesConsidered: rows.length };
}
