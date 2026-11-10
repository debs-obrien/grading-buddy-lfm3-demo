#!/usr/bin/env node
/**
 * One-shot converter: notes.md → content.json (v2 structured content).
 * Counting 1–10 becomes one item. Glossary is built from every Korean term.
 */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const md = fs.readFileSync(path.join(root, "data/belts/white-yellow/notes.md"), "utf8");

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Hand-checked Korean terms / English for items that need them (overrides title parse). */
const KOREAN = {
  "charyot-attention": { korean: "charyot", english: "attention" },
  "kyong-ye-bow": { korean: "kyong ye", english: "bow" },
  "junbi-ready": { korean: "junbi", english: "ready" },
  "si-jak-begin": { korean: "si jak", english: "begin or start" },
  "baro-return": { korean: "baro", english: "return" },
  "kihap-yell": { korean: "kihap", english: "yell or shout" },
  "dojang-and-dobok": { korean: "dojang", english: "training hall", also: [{ korean: "dobok", english: "training uniform" }] },
  "instructor-sabum-nim": { korean: "sabum nim", english: "instructor" },
  "high-middle-and-low": { korean: "kaunde", english: "middle", also: [
    { korean: "nopunde", english: "high" },
    { korean: "najunde", english: "low" },
  ]},
  "punch-block-and-kick-words": { korean: "makgi", english: "block", also: [
    { korean: "jirugi", english: "punch" },
    { korean: "chagi", english: "kick" },
  ]},
  "attention-stance-charyot-sogi": { korean: "charyot sogi", english: "attention stance" },
  "parallel-stance-and-parallel-ready-stance": { korean: "narani junbi sogi", english: "parallel ready stance", also: [
    { korean: "narani sogi", english: "parallel stance" },
  ]},
  "walking-stance-gunnun-sogi": { korean: "gunnun sogi", english: "walking stance" },
  "stepping-forward-and-backward": { korean: "nagagi", english: "stepping forward", also: [
    { korean: "duruogi", english: "stepping backward" },
  ]},
  "forearm-low-block-palmok-najunde-makgi": { korean: "palmok najunde makgi", english: "forearm low block" },
  "knife-hand-low-block-sonkal-najunde-makgi": { korean: "sonkal najunde makgi", english: "knife-hand low block" },
  "inner-forearm-side-block-an-palmok-yop-makgi": { korean: "an palmok yop makgi", english: "inner forearm side block" },
  "front-punch-ap-jirugi": { korean: "ap jirugi", english: "front punch" },
  "front-snap-kick-apcha-busigi": { korean: "apcha busigi", english: "front snap kick" },
  "front-rising-kick-apcha-olligi": { korean: "apcha olligi", english: "front rising kick" },
  "saju-jirugi-four-direction-punch": { korean: "Saju Jirugi", english: "four-direction punch" },
  "saju-makgi-four-direction-block": { korean: "Saju Makgi", english: "four-direction block" },
  "what-a-pattern-tul-is": { korean: "tul", english: "pattern" },
  "l-stance-niunja-sogi": { korean: "niunja sogi", english: "L-stance" },
  "sitting-stance-annun-sogi": { korean: "annun sogi", english: "sitting stance" },
  "turning-in-place-and-step-turning": { korean: "gujari dolgi", english: "spot turning" },
};

function topicOf(id) {
  if (/tenet|courtesy|integrity|perseverance|self-control|indomitable/.test(id)) return "tenets";
  if (/oath/.test(id)) return "oath";
  if (/^saju/.test(id)) return "saju";
  if (/chon-ji|pattern-tul|what-a-pattern/.test(id)) return "chonji";
  if (/belt/.test(id)) return "belts";
  if (/counting|count/.test(id)) return "counting";
  if (/^(who-started|when-taekwon-do|what-itf|what-the-word-taekwon-do)/.test(id)) return "history";
  if (/stance|sogi|stepping-forward/.test(id)) return "stances";
  if (/block|punch|kick|makgi|jirugi|chagi|forearm|knife|snap|rising|front-punch|front-snap|front-rising/.test(id))
    return "techniques";
  return "commands";
}

const parts = md.split(/^### /m).slice(1);
const raw = [];
for (const part of parts) {
  const lines = part.split("\n");
  const title = lines[0].trim();
  const note = { id: slug(title), title, grading: "", tags: [], quiz: null, answer: null, kind: null, wrong: null, why: null, body: "" };
  const body = [];
  for (const rawLine of lines.slice(1)) {
    const line = rawLine.trimEnd();
    if (/^## /.test(line)) break;
    const m = line.match(/^(Tags|Grading|Quiz|Answer|Kind|Wrong|Why):\s*(.*)$/);
    if (m) {
      const [, key, value] = m;
      if (key === "Tags") note.tags = value.split(",").map((t) => t.trim()).filter(Boolean);
      if (key === "Grading") note.grading = value.trim();
      if (key === "Quiz") note.quiz = value.trim();
      if (key === "Answer") note.answer = value.trim();
      if (key === "Kind") note.kind = value.trim();
      if (key === "Why") note.why = value.trim();
      if (key === "Wrong") note.wrong = value.split("|").map((t) => t.trim()).filter(Boolean);
    } else body.push(line);
  }
  note.body = body.join("\n").trim();
  raw.push(note);
}

function stripQuotes(t) {
  const s = t.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("\u201C") && s.endsWith("\u201D"))) return s.slice(1, -1);
  return s;
}

function splitOfficial(body) {
  const simpleM = body.match(/^In simple words:\s*(.+)$/m);
  let rest = body;
  let officialText = null;

  // Inline on same line: Official ITF wording: "…"
  const inline = body.match(/^Official ITF wording:\s*(.+)$/m);
  if (inline && inline[1].trim()) {
    officialText = stripQuotes(inline[1]);
    rest = rest.replace(inline[0], "").trim();
  } else if (/Official ITF wording:\s*\n\s*1\./.test(body)) {
    // Oath style: label (maybe mid-paragraph), then numbered lines
    const after = body.split(/Official ITF wording:\s*\n/)[1] || "";
    const lines = [];
    for (const line of after.split("\n")) {
      if (/^\d+\.\s+/.test(line.trim())) lines.push(line.trim().replace(/^\d+\.\s+/, ""));
      else if (lines.length) break;
    }
    if (lines.length) {
      officialText = lines.join("\n");
      rest = rest
        .replace(/\s*Official ITF wording:\s*\n(?:\d+\.\s+.+\n?)+/, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    }
  }

  if (simpleM) rest = rest.replace(simpleM[0], "").trim();
  return {
    officialText,
    simpleFromBody: simpleM ? simpleM[1].trim() : null,
    rest,
  };
}

const SOURCE_FOR = {
  "what-the-white-belt-means": "NZ-HB",
  "what-the-yellow-belt-means": "NZ-HB",
  "what-chon-ji-means": "NZ-HB",
  "the-five-tenets": "ITF-P",
  "the-student-oath": "ITF-P",
};

const items = [];
const countNotes = raw.filter((n) => n.id.startsWith("counting-"));
const nonCount = raw.filter((n) => !n.id.startsWith("counting-"));

for (const note of nonCount) {
  const { officialText, simpleFromBody, rest } = splitOfficial(note.body);
  const k = KOREAN[note.id];
  let simple = simpleFromBody || note.why || "";
  if (!simple) {
    const first = rest.split(/\n/).map((l) => l.trim()).filter(Boolean)[0] || "";
    simple = first || note.title;
  }
  const english = k?.english || note.answer?.replace(/\.\s*$/, "") || note.title;

  const official = officialText
    ? { text: officialText, source: SOURCE_FOR[note.id] || "NZ-HB" }
    : undefined;

  const aliases = [...new Set([
    ...note.tags,
    note.title.toLowerCase(),
    ...(k?.korean ? [k.korean.toLowerCase()] : []),
    ...(k?.english ? [k.english.toLowerCase()] : []),
    ...(k?.also || []).flatMap((a) => [a.korean.toLowerCase(), a.english.toLowerCase()]),
  ])];

  const item = {
    id: note.id,
    topic: topicOf(note.id),
    title: note.title,
    english,
    korean: k?.korean || undefined,
    alsoKorean: k?.also || undefined,
    official,
    simple,
    grading: note.grading,
    aliases,
    learnBody: rest,
    quiz: note.quiz || undefined,
    answer: note.answer || undefined,
    kind: note.kind || undefined,
    wrong: note.wrong || undefined,
    why: note.why || undefined,
  };

  const moveLines = rest.match(/^\d+\.\s+.+$/gm);
  if (moveLines && /chon-ji-moves/.test(note.id)) {
    item.moves = moveLines.map((l) => {
      const m = l.match(/^(\d+)\.\s+(.*)$/);
      return { n: Number(m[1]), text: m[2] };
    });
    const end = rest.match(/^End:\s+(.*)$/m);
    if (end) item.end = end[1];
  }

  items.push(item);
}

const numbers = [
  { n: 1, korean: "hana" },
  { n: 2, korean: "dul" },
  { n: 3, korean: "set" },
  { n: 4, korean: "net" },
  { n: 5, korean: "dasot" },
  { n: 6, korean: "yosot" },
  { n: 7, korean: "ilgop" },
  { n: 8, korean: "yodul" },
  { n: 9, korean: "ahop" },
  { n: 10, korean: "yol" },
];

items.push({
  id: "counting-1-to-10-in-korean",
  topic: "counting",
  title: "Counting 1 to 10 in Korean",
  english: "Counting from one to ten in Korean",
  simple: "1 hana, 2 dul, 3 set, 4 net, 5 dasot, 6 yosot, 7 ilgop, 8 yodul, 9 ahop, 10 yol. (Dul is sometimes spelled dool.)",
  grading: "2",
  aliases: [
    "counting", "count", "numbers", "korean", "korean words for counting", "korean words",
    "hana", "dul", "set", "net", "dasot", "yosot", "ilgop", "yodul", "ahop", "yol",
    "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
    "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "count to 10", "count to ten",
  ],
  numbers,
  learnBody: "1 hana, 2 dul, 3 set, 4 net, 5 dasot, 6 yosot, 7 ilgop, 8 yodul, 9 ahop, 10 yol. (Dul is sometimes spelled dool.)",
  quiz: "How do you count to ten in Korean?",
  answer: "Hana, dul, set, net, dasot, yosot, ilgop, yodul, ahop, yol.",
  wrong: [
    "Yosot, ilgop, yodul, ahop, yol, hana, dul, set, net, dasot.",
    "Hana, set, dul, dasot, net, yosot, yodul, ilgop, ahop, yol.",
  ],
  why: "1 hana, 2 dul, 3 set, 4 net, 5 dasot, 6 yosot, 7 ilgop, 8 yodul, 9 ahop, 10 yol.",
});

const topics = [
  { id: "commands", name: "Commands and dojang words", aliases: ["command", "commands", "dojang words", "dojang", "korean words", "words i need"] },
  { id: "counting", name: "Counting in Korean", aliases: ["counting", "count", "numbers", "korean counting", "korean words for counting"] },
  { id: "stances", name: "Stances", aliases: ["stance", "stances", "sogi"] },
  { id: "techniques", name: "Blocks, punches and kicks", aliases: ["block", "punch", "kick", "technique", "techniques"] },
  { id: "chonji", name: "Chon-Ji", aliases: ["chon-ji", "chonji", "chon ji", "pattern", "tul", "teul"] },
  { id: "tenets", name: "The five tenets", aliases: ["tenet", "tenets", "five tenets"] },
  { id: "oath", name: "The student oath", aliases: ["oath", "student oath", "promise"] },
  { id: "belts", name: "Belts", aliases: ["belt", "belts", "kup", "gup", "colour", "color"] },
  { id: "history", name: "Taekwon-Do history", aliases: ["history", "founder", "itf", "named", "name day"] },
  { id: "saju", name: "Saju exercises", aliases: ["saju", "four-direction", "four direction"] },
  { id: "glossary", name: "Korean words for this grading", aliases: ["korean words", "korean word", "words do i need", "words i need to know", "glossary", "vocabulary"] },
];

const glossary = [];
for (const i of items) {
  if (i.korean) glossary.push({ term: i.korean, meaning: i.english, itemId: i.id });
  for (const a of i.alsoKorean || []) glossary.push({ term: a.korean, meaning: a.english, itemId: i.id });
}
for (const num of numbers) {
  glossary.push({ term: num.korean, meaning: String(num.n), itemId: "counting-1-to-10-in-korean" });
}

// Synthetic glossary item so Ask can load "all Korean words" as one topic's facts
items.push({
  id: "glossary-korean-words",
  topic: "glossary",
  title: "Korean words for white to yellow belt",
  english: "All the Korean words in this grading",
  simple: "These are the Korean words you need for white to yellow belt grading.",
  grading: "1",
  aliases: ["korean words", "korean word", "words do i need", "words i need to know", "what korean words", "vocabulary", "glossary"],
  learnBody: glossary.map((g) => `${g.term}: ${g.meaning}`).join("\n"),
  glossary: true,
});


const EXTRA_ALIASES = {
  "front-snap-kick-apcha-busigi": ["toes","toes back","pull toes","pull my toes","ball of the foot","ball of your foot","ap kumchi","why pull toes","pull my toes back"],
  "how-many-moves-chon-ji-has": ["how many moves","19 moves","nineteen"],
  "what-chon-ji-means": ["chon-ji mean","chonji mean","heaven the earth"],
  "what-the-white-belt-means": ["white belt mean","white belt meaning"],
  "what-the-yellow-belt-means": ["yellow belt mean","yellow belt meaning"],
  "belt-order-for-the-first-gradings": ["after white","belt after","comes after white","yellow stripe"],
  "the-five-tenets": ["five tenets","the tenets"],
  "who-started-taekwon-do": ["founder","who started","choi hong hi"],
  "when-taekwon-do-got-its-name": ["1955","given its name","name day"],
  "what-itf-means": ["itf stand","international taekwon-do federation"],
  "dojang-and-dobok": ["dobok","dojang","uniform"],
  "l-stance-niunja-sogi": ["l-stance","l stance","niunja","blocks in chon-ji","moves 9 to 16","moves 9"],
  "chon-ji-moves-9-to-12": ["moves 9 to 12","moves 9 to 16","l-stance","inner forearm","move 9"],
  "chon-ji-moves-13-to-16": ["moves 13 to 16","moves 9 to 16","inner forearm"],
};
for (const item of items) {
  if (EXTRA_ALIASES[item.id]) {
    item.aliases = [...new Set([...(item.aliases || []), ...EXTRA_ALIASES[item.id]])];
  }
}


function categoryFor(topic, itemId) {
  if (itemId === "what-chon-ji-means" || itemId === "how-many-moves-chon-ji-has" || /^chon-ji-moves-/.test(itemId) || itemId === "chon-ji-start-position-and-diagram" || itemId === "punches-in-chon-ji-obverse-punch" || itemId === "what-a-pattern-tul-is") return "pattern";
  if (String(itemId).startsWith("saju-")) return "exercise";
  const map = { stances: "stance", commands: "command", techniques: "technique", belts: "belt", counting: "counting", tenets: "tenet", oath: "oath", history: "history", chonji: "pattern", saju: "exercise", glossary: "glossary" };
  return map[topic] || "word";
}
for (const item of items) item.category = categoryFor(item.topic, item.id);

const out = {
  about: "White to yellow belt grading content. Learn, Quiz and Ask all read this file. Official ITF wording is copied character for character from the sources named on each quote.",
  gradingScope: "ITF Taekwon-Do only. Grading 1 = 10th to 9th kup. Grading 2 = 9th to 8th kup.",
  topics,
  items,
  glossary,
};

const outPath = path.join(root, "data/belts/white-yellow/content.json");
fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
console.log(`Wrote ${items.length} items, ${glossary.length} glossary entries`);
console.log("Official:", items.filter((i) => i.official).map((i) => `${i.id} [${i.official.source}]`));
console.log("Counting is one item:", items.filter((i) => /counting/.test(i.id)).map((i) => i.id));
