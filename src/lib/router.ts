// Decides what kind of question is being asked. Keyword rules come first and
// are checked in order; Claude classifies only what no rule places.
import { complete } from "./claude";
import { localToday, parseDateRange } from "./dates";

export type QuestionType = "lookup" | "filter" | "filter + meaning" | "relation" | "over time";

const TYPES: QuestionType[] = ["lookup", "filter", "filter + meaning", "relation", "over time"];

// The template's option lists. They don't overlap, so the kind of tone named
// decides the type.
export const ENERGY_TONES = ["Tired", "Gentle", "Stressed", "Happy", "Low"]; // Daily Seeds
export const ROOT_TONES = ["Grounded", "Light", "Restless", "Energized", "Tender", "Overwhelmed", "Love"]; // Weekly Roots

export interface Route {
  type: QuestionType;
  tone?: string; // spelled as in the template
}

const OVER_TIME = [
  /\beach month\b/,
  /\bevery month\b/,
  /\bmonth by month\b/,
  /\bper month\b/,
  /\bweek by week\b/,
  /\bover time\b/,
  /\bchanges? in (?:my )?priorities\b/,
  /\bpriorities (?:have )?changed\b/,
  /\brecurring themes?\b/,
  /\bhaven['’]?t (?:i )?made (?:any )?progress\b/,
];

const RELATION = [/\bintentions?\b/, /\bblossoms?\b/, /\bhow ha(?:s|ve) my\b.*\bgone\b/];

function findTone(q: string, tones: string[]): string | undefined {
  return tones.find((tone) => new RegExp(`\\b${tone.toLowerCase()}\\b`).test(q));
}

export function routeByRules(question: string, today = localToday()): Route | null {
  const q = question.toLowerCase();

  if (OVER_TIME.some((re) => re.test(q))) return { type: "over time" };
  if (RELATION.some((re) => re.test(q))) return { type: "relation" };

  const energy = findTone(q, ENERGY_TONES);
  if (energy) return { type: "filter + meaning", tone: energy };
  const root = findTone(q, ROOT_TONES);
  if (root) return { type: "filter", tone: root };

  if (parseDateRange(question, today)) return { type: "lookup" };
  return null;
}

const CLASSIFY_SYSTEM = `You sort questions about a Garden Within journal (Daily Seeds, Weekly Roots and Blossoms) into one of five types:

lookup: about a stretch of time. "What did I say I could let go of last week?"
filter: about weeks with a given Tone / Feeling. "What was going on during the weeks I felt Overwhelmed?"
filter + meaning: about days with a given Energy Tone, searched for meaning. "What has my body been asking for on Tired days?"
relation: about a Blossom (an intention) and the entries linked to it. "How has my morning meditation intention actually gone?"
over time: about change or patterns across weeks or months. "What have been the biggest changes in priorities?", "What recurring themes haven't I made progress on?", "What was each month's tone?"

Reply with exactly one type name from the list (lookup, filter, filter + meaning, relation, over time) and nothing else. If none fits, reply "none".`;

// Accepts only an exact type name, ignoring case, whitespace, quotes,
// backticks and trailing punctuation. Anything else is null.
export function parseTypeReply(reply: string): QuestionType | null {
  const cleaned = reply
    .trim()
    .toLowerCase()
    .replace(/[`"'“”‘’]/g, "")
    .replace(/[.!?,;:]+$/, "")
    .trim();
  return TYPES.find((t) => t === cleaned) ?? null;
}

export async function routeQuestion(
  question: string,
  today = localToday(),
  classify: (system: string, prompt: string) => Promise<string> = complete,
): Promise<Route | null> {
  const route = routeByRules(question, today);
  if (route) return route;
  const type = parseTypeReply(await classify(CLASSIFY_SYSTEM, question));
  return type ? { type } : null;
}
