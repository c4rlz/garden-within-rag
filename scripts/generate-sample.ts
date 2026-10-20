// npm run sample:generate
// Writes sample/garden.json: a year of made-up Garden Within pages for demos and
// evals. It uses a seeded random generator and fixed dates, never today's date,
// so every run writes the same file. npm run sample:load shifts the dates.
import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import type { PageObjectResponse } from "@notionhq/client";
import { uuidFromKey, type SampleDataset } from "../src/lib/sample";

const START = "2025-01-06"; // a Monday
const WEEKS = 52;
const DAYS = WEEKS * 7; // so the last day is a Sunday
const NOTE = "Made-up sample data for demos and evals. Not a real journal. Dates are shifted at load time.";

// ---- Helpers ----

function mulberry32(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const title = (s: string) => ({ type: "title", title: [{ plain_text: s }] });
const text = (s: string | null) => ({ type: "rich_text", rich_text: s ? [{ plain_text: s }] : [] });
const date = (d: string | null) => ({ type: "date", date: d ? { start: d, end: null } : null });
const select = (name: string | null) => ({ type: "select", select: name ? { name } : null });
const multiSelect = (names: string[]) => ({ type: "multi_select", multi_select: names.map((name) => ({ name })) });
const checkbox = (value: boolean) => ({ type: "checkbox", checkbox: value });
const relation = (ids: string[]) => ({ type: "relation", relation: ids.map((id) => ({ id })) });
const createdTime = (t: string) => ({ type: "created_time", created_time: t });

function page(kind: string, key: string, created: string, edited: string, properties: Record<string, unknown>) {
  const id = uuidFromKey(`${kind}:${key}`);
  return {
    object: "page",
    id,
    created_time: created,
    last_edited_time: edited,
    in_trash: false,
    url: `https://sample.invalid/garden-within/${kind}-${id.replace(/-/g, "")}`,
    properties,
  } as unknown as PageObjectResponse;
}

// ---- Blossoms ----

interface BlossomSpec {
  key: string;
  title: string;
  status: "Seeds" | "Sprouts" | "Bloomed" | "Archived" | "Blossoms";
  priority: "Gentle" | "Medium" | "High";
  type: string;
  ideatedDay: number; // days after START
  origin: string;
  intention: string;
  firstSteps: string;
  notes: string;
  reflection?: string;
}

const BLOSSOMS: BlossomSpec[] = [
  {
    key: "meditation",
    title: "Sample: Start mornings with 5 minute meditation",
    status: "Sprouts",
    priority: "High",
    type: "Habit",
    ideatedDay: 0,
    origin: "Mornings start with my phone and the day feels rushed before it begins.",
    intention: "Five quiet minutes first, so the day starts from my own pace instead of my inbox.",
    firstSteps: "Leave the cushion out by the window. Set a five minute timer. Phone stays in the kitchen until after.",
    notes:
      "Strong start, most mornings for the first couple of months. Fell apart during the launch crunch and again during the move. Comes back each time, but never quite as steady as at the start.",
  },
  {
    key: "screen",
    title: "Sample: Put my phone away an hour before bed",
    status: "Seeds",
    priority: "Medium",
    type: "Health",
    ideatedDay: 10,
    origin: "I keep scrolling in bed and then lie awake wired.",
    intention: "Better sleep and a calmer head at night.",
    firstSteps: "Charge the phone outside the bedroom. Keep a book on the nightstand.",
    notes: "Tried a few nights here and there. Haven't actually started properly.",
  },
  {
    key: "no",
    title: "Sample: Say no to extra work I don't have room for",
    status: "Sprouts",
    priority: "High",
    type: "Career",
    ideatedDay: 20,
    origin: "Every busy stretch starts with me saying yes to one more thing.",
    intention: "Protect time and energy for the work that matters and for rest.",
    firstSteps: "Wait a day before agreeing to new requests. Write a short script for saying no kindly.",
    notes: "Said no once and felt good about it. Then said yes to three more things during the launch.",
  },
  {
    key: "family",
    title: "Sample: Call family every week",
    status: "Seeds",
    priority: "Gentle",
    type: "Community",
    ideatedDay: 15,
    origin: "Realised it had been ages since I talked with my sister about anything real.",
    intention: "Stay close to the people who matter, not just when something needs organising.",
    firstSteps: "Put a recurring reminder in the calendar. Keep calls short so they're easy to say yes to.",
    notes: "Still mostly logistics calls. The reminder keeps getting snoozed.",
  },
  {
    key: "walk",
    title: "Sample: Daily walk outside",
    status: "Bloomed",
    priority: "Medium",
    type: "Health",
    ideatedDay: 0,
    origin: "Whole days pass without going outside.",
    intention: "Fresh air and movement, and a break between work and evening.",
    firstSteps: "A loop around the block after lunch.",
    notes: "Became automatic after a few weeks. Even kept it up through the busy stretches.",
    reflection: "This one stuck because it was small and had a fixed place in the day.",
  },
  {
    key: "blog",
    title: "Sample: Start a gardening blog",
    status: "Archived",
    priority: "Gentle",
    type: "Blog",
    ideatedDay: 3,
    origin: "Friends keep asking about the balcony plants.",
    intention: "Share what I'm learning and keep a record of it.",
    firstSteps: "Pick a name. Write three short posts before publishing anything.",
    notes: "Wrote two drafts. Lost interest once work got busy.",
    reflection: "Letting this go. I like the plants more than writing about them.",
  },
  {
    key: "bread",
    title: "Sample: Learn to bake bread",
    status: "Bloomed",
    priority: "Gentle",
    type: "Learning",
    ideatedDay: 5,
    origin: "Wanted something slow and hands-on that isn't a screen.",
    intention: "A calming skill, and good bread.",
    firstSteps: "Start with a simple no-knead loaf.",
    notes: "Flat loaves at first, then a good one. Now a regular thing.",
    reflection: "Proud of this. Baking became a way to slow down.",
  },
  {
    key: "role",
    title: "Sample: Ask for feedback on a bigger role",
    status: "Sprouts",
    priority: "High",
    type: "Career",
    ideatedDay: 80,
    origin: "I keep doing lead work without the title or support.",
    intention: "Be clear about what I want at work and ask for it.",
    firstSteps: "List what I already do. Book time with my manager.",
    notes: "Had the first conversation. Waiting on next steps.",
  },
  {
    key: "declutter",
    title: "Sample: Declutter the hallway closet",
    status: "Bloomed",
    priority: "Medium",
    type: "Home",
    ideatedDay: 120,
    origin: "Every time I open it something falls out.",
    intention: "A calmer home with less to manage.",
    firstSteps: "One shelf at a time. Donate bag by the door.",
    notes: "Done before the move, which made packing much easier.",
    reflection: "Small win that made a hard stretch lighter.",
  },
  {
    key: "water",
    title: "Sample: Drink more water",
    status: "Blossoms",
    priority: "Medium",
    type: "Health",
    ideatedDay: 170,
    origin: "Headaches in the afternoon, usually on days I forget to drink anything.",
    intention: "Fewer headaches and more steady energy.",
    firstSteps: "A full bottle on the desk every morning.",
    notes: "Mostly doing it. Forget on busy days.",
  },
  {
    key: "sketch",
    title: "Sample: Sketch once a week",
    status: "Blossoms",
    priority: "Gentle",
    type: "Creativity",
    ideatedDay: 250,
    origin: "Found an old sketchbook while unpacking.",
    intention: "Make something just for fun.",
    firstSteps: "Ten minutes, any subject, no erasing.",
    notes: "A handful of sketches so far. Enjoying it.",
  },
  {
    key: "volunteer",
    title: "Sample: Join a community garden volunteer day",
    status: "Seeds",
    priority: "Medium",
    type: "Community",
    ideatedDay: 260,
    origin: "Walked past the community garden in the new neighbourhood.",
    intention: "Meet neighbours and get my hands in the dirt.",
    firstSteps: "Sign up for the mailing list.",
    notes: "On the mailing list. Haven't gone yet.",
  },
  {
    key: "away",
    title: "Sample: Plan a quiet day away",
    status: "Seeds",
    priority: "Gentle",
    type: "Other",
    ideatedDay: 300,
    origin: "Need a day with no plans and no screens.",
    intention: "Real rest, somewhere that isn't home.",
    firstSteps: "Pick a nearby town with a trail.",
    notes: "Just an idea for now.",
  },
];

// ---- Moods ----

// Four-week blocks so months differ: a dominant Root tone, other tones that can
// show up, Energy Tone weights for Seeds, and how often meditation happens.
interface Block {
  tone: string;
  others: string[];
  energy: Record<string, number>;
  meditation: number;
  busy?: "launch" | "move";
}

const BLOCKS: Block[] = [
  { tone: "Grounded", others: ["Light", "Tender"], energy: { Gentle: 3, Happy: 2, Tired: 1, Low: 0.5, Stressed: 0.5 }, meditation: 0.75 },
  { tone: "Light", others: ["Grounded", "Energized"], energy: { Happy: 3, Gentle: 2, Tired: 1, Stressed: 0.5, Low: 0.3 }, meditation: 0.8 },
  { tone: "Restless", others: ["Tender", "Grounded"], energy: { Stressed: 2, Tired: 2, Low: 1, Gentle: 1, Happy: 0.5 }, meditation: 0.5 },
  { tone: "Overwhelmed", others: [], energy: { Stressed: 4, Tired: 4, Low: 1, Gentle: 0.5, Happy: 0.3 }, meditation: 0.2, busy: "launch" },
  { tone: "Tender", others: ["Grounded", "Restless"], energy: { Tired: 3, Low: 2, Gentle: 2, Stressed: 1, Happy: 0.5 }, meditation: 0.4 },
  { tone: "Energized", others: ["Light", "Love"], energy: { Happy: 4, Gentle: 1.5, Tired: 0.7, Stressed: 0.7, Low: 0.2 }, meditation: 0.65 },
  { tone: "Light", others: ["Energized", "Grounded"], energy: { Happy: 3, Gentle: 2, Tired: 1, Stressed: 0.5, Low: 0.3 }, meditation: 0.7 },
  { tone: "Grounded", others: ["Light", "Tender"], energy: { Gentle: 3, Happy: 2, Tired: 1, Low: 0.5, Stressed: 0.7 }, meditation: 0.7 },
  { tone: "Overwhelmed", others: [], energy: { Stressed: 4, Tired: 4, Low: 1.5, Gentle: 0.5, Happy: 0.3 }, meditation: 0.15, busy: "move" },
  { tone: "Tender", others: ["Restless", "Grounded"], energy: { Tired: 3, Low: 2.5, Gentle: 1.5, Stressed: 1, Happy: 0.5 }, meditation: 0.35 },
  { tone: "Love", others: ["Light", "Grounded"], energy: { Happy: 3, Gentle: 3, Tired: 1, Stressed: 0.4, Low: 0.3 }, meditation: 0.6 },
  { tone: "Restless", others: ["Tender", "Energized"], energy: { Stressed: 2.5, Tired: 2, Low: 1, Gentle: 1, Happy: 0.5 }, meditation: 0.5 },
  { tone: "Grounded", others: ["Light", "Love"], energy: { Gentle: 3, Happy: 2, Tired: 1.5, Low: 0.5, Stressed: 0.5 }, meditation: 0.7 },
];

// Weekly Root priorities change in phases of 13 weeks, plus some week-to-week noise.
const PHASES: string[][] = [
  ["meditation", "walk", "bread", "blog"],
  ["meditation", "no", "role"],
  ["declutter", "family", "water"],
  ["meditation", "sketch", "screen", "volunteer"],
];

// ---- Writing ----

const MATTERS = [
  "Getting through the project review calmly.",
  "Being present at dinner with friends.",
  "Finishing the report without rushing.",
  "A slow start and one important task.",
  "Checking in on my sister.",
  "Clearing the kitchen so the evening feels easy.",
  "Showing up for the team meeting prepared.",
  "Resting without feeling guilty about it.",
  "Watering the balcony plants and repotting the basil.",
  "Keeping my lunch break an actual break.",
  "One focused hour on the hard task before messages.",
  "Being kind to myself when things slip.",
  "Getting outside while it's light.",
  "Cooking something real instead of snacking.",
];

const CLARITY = [
  "What I actually want from work this year.",
  "How much to plan versus leave open.",
  "Whether I'm tired or just bored.",
  "Which plans I'm keeping out of obligation.",
  "How to ask for help without feeling like a burden.",
  "What a good evening looks like for me.",
  "Why small decisions feel so heavy lately.",
];

const CLEARER = [
  "I do better with one priority than with five.",
  "A short walk fixes more than another coffee.",
  "The worry was bigger than the actual problem.",
  "I like quiet evenings more than I admit.",
  "Asking for help went better than I expected.",
  "I don't need to answer messages right away.",
  "Most of my stress comes from the calendar, not the work.",
  "Finishing one thing feels better than starting three.",
];

const LET_GO = [
  "The to-do list I didn't finish.",
  "Needing every conversation to go perfectly.",
  "Comparing my progress to other people's.",
  "The awkward thing I said in the meeting.",
  "Trying to fix everything in one day.",
  "Old plans that don't fit anymore.",
  "Worrying about what I can't control.",
  "Being annoyed about the delayed train.",
  "Keeping the house spotless.",
  "The idea that rest has to be earned.",
];

const BODY_TIRED = [
  "Rest. An early night, honestly.",
  "Sleep. I'm running on empty.",
  "Water and a proper lunch instead of more coffee.",
  "Gentle stretching for my back and neck.",
  "A nap, or at least lying down for twenty minutes.",
  "Going to bed early without the phone.",
  "Slowing down. Less rushing between things.",
  "Warm food and a quiet evening in.",
];

const BODY_OTHER = [
  "Movement. A long walk or a run.",
  "Sunlight and fresh air.",
  "Stretching after sitting all day.",
  "More vegetables and fewer snacks.",
  "Dancing around the kitchen.",
  "A proper workout.",
  "Water, I forgot to drink any this morning.",
  "Deep breaths and unclenching my jaw.",
];

const OFFERINGS = [
  "A slow walk around the block.",
  "Ten minutes of stretching.",
  "A bath and an early night.",
  "Made a real breakfast.",
  "Yoga video before bed.",
  "A walk to the park and back.",
  "Cooked soup and ate it slowly.",
  "Lay in the sun for a bit.",
];

const MEDITATION_DID = [
  "Five minutes of sitting before coffee made the whole morning calmer.",
  "Meditated first thing. I noticed the rush and didn't follow it.",
  "The morning sit was short but it set the tone.",
  "Meditation is easier when the cushion is already out.",
  "Sat for five minutes. My head felt quieter all morning.",
];

const MEDITATION_MISSED = [
  "Skipped meditation again and the morning ran away from me.",
  "Checked my phone before meditating and never got back to it.",
  "No morning sit today. I felt scattered by lunch.",
  "Meant to meditate, slept through the alarm instead.",
];

const MEDITATION_LET_GO = [
  "Beating myself up for skipping meditation this morning.",
  "Needing the meditation streak to be perfect.",
];

// Recurring themes in the written answers, each tied to a Blossom that never blooms.
const THEMES: Record<string, { clarity: string[]; letGo: string[]; insight: string[] }> = {
  screen: {
    clarity: [
      "Why I keep scrolling late at night when I'm tired.",
      "What I'm looking for on my phone at bedtime.",
    ],
    letGo: [
      "Scrolling in bed until I'm too wired to sleep.",
      "The late-night phone habit. Again.",
      "Checking messages in bed.",
    ],
    insight: [
      "Late-night scrolling showed up again on most of the bad-sleep days.",
      "Phone in bed keeps coming up. I know the fix and don't do it.",
    ],
  },
  no: {
    clarity: [
      "Whether I can take on the new project without burning out.",
      "Why I find it so hard to say no at work.",
    ],
    letGo: [
      "Saying yes to every extra request at work.",
      "Feeling responsible for everyone's deadlines.",
      "Guilt about turning down the extra task.",
    ],
    insight: [
      "I said yes to too much again. Same pattern every busy stretch.",
      "Overcommitting at work is still the root of most stressful weeks.",
    ],
  },
  family: {
    clarity: [
      "When I last really talked with my family.",
      "Why calling home feels like a chore when I miss them.",
    ],
    letGo: [
      "Guilt about not calling home.",
      "Waiting for the perfect time to call my sister.",
    ],
    insight: [
      "Noticed I haven't called family in a while. It keeps slipping.",
      "Talking with family only about logistics. Want more than that.",
    ],
  },
};

const THEME_RATE: Record<string, number> = { screen: 0.12, no: 0.09, family: 0.07 };

const WEEK_THEMES: Record<string, string[]> = {
  Grounded: ["Steady rhythm", "Settling in", "Simple routines", "Coming back to basics"],
  Light: ["Ease", "Fun and friends", "Lightness", "Saying yes to joy"],
  Restless: ["Searching", "Unsettled", "Itchy for change", "Too many tabs open"],
  Energized: ["Momentum", "New ideas", "Moving fast", "Fresh energy"],
  Tender: ["Recovery", "Being gentle", "Soft landing", "Healing"],
  Overwhelmed: ["Getting through it", "Survival mode", "Too much at once", "Holding it together"],
  Love: ["Connection", "Gratitude", "People I love", "Warmth"],
};

const HIGHLIGHTS = [
  "Dinner with old friends that went late.",
  "A really good walk by the water.",
  "Finished a book I'd been reading for ages.",
  "Got positive feedback on the project.",
  "Baked bread that actually rose.",
  "A quiet evening with nothing planned.",
  "Helped a friend move a couch and laughed the whole time.",
  "Found a new cafe close to home.",
  "Long call with an old friend.",
  "The balcony tomatoes finally turned red.",
];

const INSIGHTS = [
  "My energy dips when I skip lunch.",
  "Mornings set the tone for everything else.",
  "I'm happier when evenings are unplanned.",
  "Too many social plans in a row wear me out.",
  "Walking helps me think through problems.",
  "I underestimate how long things take.",
];

const PROUD = [
  "Spoke up in the meeting.",
  "Kept my lunch break three days running.",
  "Asked for help instead of struggling alone.",
  "Went to bed on time most nights.",
  "Finished the hard task I'd been avoiding.",
  "Said no to a plan I didn't have energy for.",
  "Cooked at home most nights.",
];

const GREW = [
  "The walking habit feels automatic now.",
  "More patience with myself.",
  "Bread is getting better every time.",
  "Less guilt about resting.",
  "Getting better at planning the week ahead.",
];

const MEDITATION_ROOT_GOOD = [
  "Meditated most mornings. It's starting to feel normal.",
  "Morning sits kept the week calmer than it could have been.",
];

const MEDITATION_ROOT_BAD = [
  "Meditation slipped. Only managed a couple of mornings.",
  "Barely meditated. Mornings got swallowed by everything else.",
];

// The two busy stretches, one line per week of the block. Some name the theme they show.
const BUSY: Record<"launch" | "move", { highlights: string[]; insights: { text: string; theme?: string }[] }> = {
  launch: {
    highlights: [
      "The product launch at work moved up and most evenings went to catching up.",
      "Covered for a teammate who was out sick on top of the launch prep.",
      "Launch went out. Spent the days after fixing the bugs that came with it.",
      "First quieter week after the launch. Slept in and cleared the inbox.",
    ],
    insights: [
      { text: "Saying yes to every request is how the week got this full.", theme: "no" },
      { text: "I stop eating real meals when work gets loud." },
      { text: "I kept skipping the morning sit to answer messages, and the days felt worse for it." },
      { text: "The rush is over but my body still feels braced for it." },
    ],
  },
  move: {
    highlights: [
      "Packed up the apartment while work stayed busy. Boxes everywhere.",
      "Moving day, plus family visiting to help, plus a deadline. Too much at once.",
      "Unpacking in every spare hour. Couldn't find anything.",
      "Finally hung the pictures. The new place feels like home.",
    ],
    insights: [
      { text: "I agreed to cover extra work in the same weeks as the move.", theme: "no" },
      { text: "Every call with family was logistics. I miss just talking.", theme: "family" },
      { text: "No mornings to myself at all. Meditation fell off completely." },
      { text: "When things settle I want to keep the habits that survived." },
    ],
  },
};

// ---- Generation ----

export function generateSample(): SampleDataset {
  const rand = mulberry32(20260106);
  const chance = (p: number) => rand() < p;
  const pick = <T>(items: T[]): T => items[Math.floor(rand() * items.length)];
  const weighted = (weights: Record<string, number>, exclude: string[] = []): string => {
    const options = Object.entries(weights).filter(([name]) => !exclude.includes(name));
    let r = rand() * options.reduce((sum, [, w]) => sum + w, 0);
    for (const [name, w] of options) if ((r -= w) < 0) return name;
    return options[options.length - 1][0];
  };
  const time = (day: string, hour: number, minute = 0) =>
    `${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00.000Z`;

  const spec = Object.fromEntries(BLOSSOMS.map((b) => [b.key, b]));
  const blossomId = (key: string) => uuidFromKey(`blossom:${key}`);
  const ideated = (key: string, day: number) => spec[key].ideatedDay <= day;

  const seedLinks = new Map<string, string[]>(); // blossom key -> seed ids
  const rootLinks = new Map<string, Set<string>>(); // blossom key -> root ids
  for (const b of BLOSSOMS) {
    seedLinks.set(b.key, []);
    rootLinks.set(b.key, new Set());
  }

  const seeds: PageObjectResponse[] = [];
  for (let d = 0; d < DAYS; d++) {
    const day = addDays(START, d);
    const block = BLOCKS[Math.floor(d / 28)];
    // The last two weeks have a Seed every day with a let-go answer, so "last week"
    // has one whatever weekday the sample is loaded on.
    const lastTwoWeeks = d >= DAYS - 14;
    if (!lastTwoWeeks && chance(0.15)) continue;

    const first = weighted(block.energy);
    const tones = chance(0.2) ? [first, weighted(block.energy, [first])] : [first];
    const tired = tones.includes("Tired");

    const links: string[] = [];
    const meditation = ideated("meditation", d) && chance(0.45);
    const meditated = chance(block.meditation);
    if (meditation) links.push("meditation");

    let theme: string | null = null;
    for (const key of Object.keys(THEMES)) {
      const rate = THEME_RATE[key] * (block.busy && key === "no" ? 3 : 1);
      if (!theme && ideated(key, d) && chance(rate)) theme = key;
    }
    if (theme) links.push(theme);
    const themeInClarity = chance(0.5);

    const matters = chance(0.8) ? pick(MATTERS) : null;
    const clarity = theme && themeInClarity ? pick(THEMES[theme].clarity) : chance(0.5) ? pick(CLARITY) : null;
    let letGo: string | null = null;
    if (theme && !themeInClarity) letGo = pick(THEMES[theme].letGo);
    else if (lastTwoWeeks || chance(0.6)) {
      letGo = meditation && !meditated && chance(0.5) ? pick(MEDITATION_LET_GO) : pick(LET_GO);
    }
    const clearer = meditation
      ? pick(meditated ? MEDITATION_DID : MEDITATION_MISSED)
      : chance(0.5)
        ? pick(CLEARER)
        : null;
    const body = tired ? (chance(0.9) ? pick(BODY_TIRED) : null) : chance(0.55) ? pick(BODY_OTHER) : null;
    const offering = chance(0.5) ? pick(OFFERINGS) : null;
    const selfCare = offering ? chance(0.85) : chance(0.15);

    if (offering?.includes("walk") && ideated("walk", d) && chance(0.5)) links.push("walk");
    if (body?.includes("Water") && ideated("water", d)) links.push("water");

    const created = time(day, 13 + Math.floor(rand() * 4), Math.floor(rand() * 60));
    const edited = time(day, 18 + Math.floor(rand() * 5), Math.floor(rand() * 60));
    const seed = page("seed", day, created, edited, {
      Title: title("Sample Daily Seed"),
      Date: date(day),
      "Energy Tone": multiSelect(tones),
      "Body Offering - Self Care": checkbox(selfCare),
      Blossoms: relation(links.map(blossomId)),
      "What Matters Today?": text(matters),
      "What wants clarity?": text(clarity),
      "What became clearer?": text(clearer),
      "What can I let go of?": text(letGo),
      "What is my body asking for?": text(body),
      "Body Offering of the Day": text(offering),
    });
    for (const key of links) seedLinks.get(key)!.push(seed.id);
    seeds.push(seed);
  }

  const roots: PageObjectResponse[] = [];
  for (let w = 0; w < WEEKS; w++) {
    const monday = addDays(START, w * 7);
    const sunday = addDays(monday, 6);
    const d = w * 7;
    const block = BLOCKS[Math.floor(w / 4)];
    const weekInBlock = w % 4;

    const tone = block.busy ? (weekInBlock < 3 ? "Overwhelmed" : "Tender") : chance(0.65) ? block.tone : pick(block.others);

    const priorities = PHASES[Math.floor(w / 13)].filter((key) => ideated(key, d));
    if (priorities.length > 1 && chance(0.35)) priorities.splice(Math.floor(rand() * priorities.length), 1);
    if (chance(0.35)) {
      const extra = BLOSSOMS.filter((b) => ideated(b.key, d) && !priorities.includes(b.key));
      if (extra.length) priorities.push(pick(extra).key);
    }

    const linked: string[] = [];
    const meditation = ideated("meditation", d) && chance(priorities.includes("meditation") ? 0.85 : 0.4);
    if (meditation) linked.push("meditation");

    let highlights: string | null;
    let insights: string | null;
    if (block.busy) {
      const story = BUSY[block.busy];
      highlights = story.highlights[weekInBlock];
      insights = story.insights[weekInBlock].text;
      const theme = story.insights[weekInBlock].theme;
      if (theme) linked.push(theme);
    } else {
      highlights = chance(0.75) ? pick(HIGHLIGHTS) : null;
      const themes = Object.keys(THEMES).filter((key) => ideated(key, d));
      if (themes.length && chance(0.3)) {
        const theme = pick(themes);
        insights = pick(THEMES[theme].insight);
        linked.push(theme);
      } else insights = chance(0.6) ? pick(INSIGHTS) : null;
    }
    const grew = meditation
      ? pick(block.meditation >= 0.5 ? MEDITATION_ROOT_GOOD : MEDITATION_ROOT_BAD)
      : chance(0.4)
        ? pick(GREW)
        : null;

    const created = time(sunday, 20, Math.floor(rand() * 60));
    const root = page("root", monday, created, time(sunday, 22, Math.floor(rand() * 60)), {
      Title: title("Sample Weekly Root"),
      "Week Of": date(monday),
      "Created Date": createdTime(created),
      "Tone / Feeling": select(tone),
      "Accountability Check In": checkbox(chance(0.6)),
      "🌸 Priorities": relation(priorities.map(blossomId)),
      "🌸 Blossom": relation(linked.map(blossomId)),
      "Theme of the Week": text(chance(0.85) ? pick(WEEK_THEMES[tone]) : null),
      Highlights: text(highlights),
      "Insights & Patterns": text(insights),
      "Proud Moments": text(chance(0.6) ? pick(PROUD) : null),
      "Seeds That Grew": text(grew),
    });
    for (const key of [...priorities, ...linked]) rootLinks.get(key)!.add(root.id);
    roots.push(root);
  }

  // Relations in both directions, as Notion stores them, without the 25-item cap.
  const lastDay = addDays(START, DAYS - 1);
  const blossoms = BLOSSOMS.map((b) => {
    const created = time(addDays(START, b.ideatedDay), 17);
    return page("blossom", b.key, created, time(lastDay, 18), {
      Title: title(b.title),
      "Ideated At": createdTime(created),
      Status: select(b.status),
      Priority: select(b.priority),
      Type: select(b.type),
      "🌱 Daily Seeds": relation(seedLinks.get(b.key)!),
      "🌿 Weekly Roots": relation(roots.map((r) => r.id).filter((id) => rootLinks.get(b.key)!.has(id))),
      "Origin / Insight": text(b.origin),
      "Intention / Why it matters": text(b.intention),
      "First Steps": text(b.firstSteps),
      "Notes / Progress": text(b.notes),
      "Completion Reflection": text(b.reflection ?? null),
    });
  });

  return { note: NOTE, seeds, roots, blossoms };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dataset = generateSample();
  await mkdir(new URL("../sample/", import.meta.url), { recursive: true });
  await writeFile(new URL("../sample/garden.json", import.meta.url), `${JSON.stringify(dataset, null, 2)}\n`);
  console.log(
    `Wrote sample/garden.json: ${dataset.seeds.length} Daily Seeds, ${dataset.roots.length} Weekly Roots, ${dataset.blossoms.length} Blossoms.`,
  );
}
