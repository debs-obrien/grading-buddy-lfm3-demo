// Groups notes into kid-friendly topics for the little icons. Pure data, no DOM.
import type { Note } from "./notes.ts";

export type Topic = "tenets" | "oath" | "words" | "saju" | "chonji" | "belts" | "counting" | "story";

export const TOPICS: Record<Topic, { label: string; icon: string }> = {
  tenets: { label: "Tenets", icon: "💛" },
  oath: { label: "Student oath", icon: "🤝" },
  words: { label: "Korean words", icon: "🗣️" },
  saju: { label: "Saju", icon: "🧭" },
  chonji: { label: "Chon-Ji", icon: "🌏" },
  belts: { label: "Belts", icon: "🎽" },
  counting: { label: "Counting", icon: "🔢" },
  story: { label: "Taekwon-Do story", icon: "📜" },
};

export function topicOf(n: Note): Topic {
  const id = n.id;
  if (/tenet|courtesy|integrity|perseverance|self-control|indomitable/.test(id)) return "tenets";
  if (/oath/.test(id)) return "oath";
  if (/^saju/.test(id)) return "saju";
  if (/chon-ji/.test(id)) return "chonji";
  if (/belt/.test(id)) return "belts";
  if (/counting/.test(id)) return "counting";
  if (/^(who-started|when-taekwon-do|what-itf|what-the-word-taekwon-do)/.test(id)) return "story";
  return "words";
}
