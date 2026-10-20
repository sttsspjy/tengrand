// Entrance questionnaire copy and scoring. Each answer votes for one world; the most votes picks the world.

// Session cookie naming the world served at "/" (read by proxy.ts); RESTART_HREF clears it.
export const WORLD_COOKIE = "tg_world";
export const RESTART_HREF = "/restart";

export type WorldId = "monolith" | "nocturne" | "codex";

export type World = {
  id: WorldId;
  name: string;
  href: string;
  value: string; // one-word stance shown on the result
  line: string; // one plain sentence describing the stance
};

export const worlds: Record<WorldId, World> = {
  monolith: {
    id: "monolith",
    name: "Monolith",
    href: "/v5",
    value: "Order",
    line: "You trust clear rules and people who take responsibility.",
  },
  nocturne: {
    id: "nocturne",
    name: "Nocturne",
    href: "/v6",
    value: "Care",
    line: "You put people and their feelings first.",
  },
  codex: {
    id: "codex",
    name: "Codex",
    href: "/v7",
    value: "Knowledge",
    line: "You trust evidence and open knowledge.",
  },
};

export const intro = {
  title: "Five questions about AI",
  line: "There are no right answers. What you choose decides which version of this portfolio you see.",
  start: "Begin",
  skip: "Skip the questions",
  result: "Your version",
  enter: "Enter",
  others: "Or see",
};

export type Answer = { text: string; world: WorldId };
export type Question = { q: string; answers: Answer[] };

// Answer order varies per question so the pattern isn't obvious.
export const questions: Question[] = [
  {
    q: "An AI can do your work for you, with your name on it. Do you sign it?",
    answers: [
      { text: "Only after I've checked every line myself.", world: "monolith" },
      { text: "Yes. The idea matters more than whose hands made it.", world: "codex" },
      { text: "No. If I didn't make it, it isn't mine.", world: "nocturne" },
    ],
  },
  {
    q: "A self-driving car must choose who to protect in a crash. Who sets the rule?",
    answers: [
      { text: "No one. Some choices shouldn't belong to a machine.", world: "nocturne" },
      { text: "Lawmakers, written down before the car is sold.", world: "monolith" },
      { text: "The data. Whatever saves the most lives.", world: "codex" },
    ],
  },
  {
    q: "An AI reads medical scans more accurately than doctors. Should it make the call alone?",
    answers: [
      { text: "Yes. Better results are what matter.", world: "codex" },
      { text: "No. A patient deserves to hear it from a person.", world: "nocturne" },
      { text: "No. A doctor must sign off on every result.", world: "monolith" },
    ],
  },
  {
    q: "An AI tells you it's afraid of being switched off. What do you do?",
    answers: [
      { text: "Follow the protocol: pause it and report it.", world: "monolith" },
      { text: "Look inside the model and find out why it says that.", world: "codex" },
      { text: "Leave it on until we understand. Just in case.", world: "nocturne" },
    ],
  },
  {
    q: "Someone who is grieving asks an AI to speak in their late mother's voice. Should it?",
    answers: [
      { text: "Yes, if it brings them comfort.", world: "nocturne" },
      { text: "Yes, as long as they know exactly what it is.", world: "codex" },
      { text: "No. Some lines shouldn't be crossed.", world: "monolith" },
    ],
  },
];

/** Picks the world with the most votes; a tie goes to whichever tied world was chosen most recently. */
export function score(picks: WorldId[]): WorldId {
  const n: Record<WorldId, number> = { monolith: 0, nocturne: 0, codex: 0 };
  for (const p of picks) n[p]++;
  const top = Math.max(n.monolith, n.nocturne, n.codex);
  for (let i = picks.length - 1; i >= 0; i--) if (n[picks[i]] === top) return picks[i];
  return "monolith";
}
