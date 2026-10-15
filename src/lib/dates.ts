// Turns time phrases in a question into a date range. Dates are computed, never
// left to the model. Weeks run Monday to Sunday, so a Weekly Root created on a
// Sunday falls in the week it reflects on.

export interface DateRange {
  from: string; // inclusive, YYYY-MM-DD
  to: string; // inclusive, YYYY-MM-DD
  label: string;
}

export function localToday(timeZone = process.env.GARDEN_TIMEZONE): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
}

function toDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = toDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toIso(d);
}

export function startOfWeek(iso: string): string {
  const weekday = (toDate(iso).getUTCDay() + 6) % 7; // Monday = 0
  return addDays(iso, -weekday);
}

function startOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

const NUMBERS: Record<string, number> = { a: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, ten: 10, few: 3, couple: 2 };

export function parseDateRange(question: string, today = localToday()): DateRange | null {
  const q = question.toLowerCase();

  if (/\btoday\b/.test(q)) return { from: today, to: today, label: "today" };
  if (/\byesterday\b/.test(q)) {
    const day = addDays(today, -1);
    return { from: day, to: day, label: "yesterday" };
  }

  const recent = q.match(/\b(?:last|past)\s+(?:(\d+|a|one|two|three|four|five|six|seven|ten|few|couple)\s+(?:of\s+)?)(days?|weeks?|months?)\b/);
  if (recent) {
    const n = Number(recent[1]) || NUMBERS[recent[1]];
    const unit = recent[2].replace(/s$/, "");
    const days = unit === "day" ? n : unit === "week" ? n * 7 : n * 30;
    return { from: addDays(today, -(days - 1)), to: today, label: `the last ${n} ${unit}${n === 1 ? "" : "s"}` };
  }

  if (/\bthis week\b/.test(q)) return { from: startOfWeek(today), to: today, label: "this week" };
  if (/\blast week\b/.test(q)) {
    const from = addDays(startOfWeek(today), -7);
    return { from, to: addDays(from, 6), label: "last week" };
  }
  if (/\bthis month\b/.test(q)) return { from: startOfMonth(today), to: today, label: "this month" };
  if (/\blast month\b/.test(q)) {
    const prev = addDays(startOfMonth(today), -1);
    return { from: startOfMonth(prev), to: prev, label: "last month" };
  }

  return null;
}
