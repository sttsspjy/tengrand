// Single source of portfolio copy. Every sample reads from here; edit text here only.

export const profile = {
  name: "Jaeyoung",
  handle: "sttsspjy",
  role: "AI-native builder",
  alias: "Vibecoder",
  location: "Korea / Remote",
  year: 2026,
  statement:
    "I build complete web and desktop apps with AI coding agents, from the interface to the server, the AI features and the deployment.",
  about: [
    "I work with several AI coding agents at once. I plan the work, hand each agent a task, review what they write and stay responsible for the result.",
    "Most of my projects combine a polished interface with AI that searches and reads documents.",
    "I run AI models on my own computer when privacy or cost matters, and in the cloud when the project needs to scale.",
  ],
  contact: {
    email: "fjlllb111@gmail.com",
    github: "https://github.com/sttsspjy",
  },
} as const;

// Section names every world uses for its chapters, in reading order.
export const chapters = {
  intro: "Intro",
  about: "About",
  craft: "Craft",
  skills: "Skills",
  work: "Projects",
  contact: "Contact",
  restart: "Back to the start",
} as const;

export type Phrase = {
  id: "alive" | "motion" | "louder";
  before: string; // text before the accent word
  accent: string; // the emphasised word
  after: string; // text after the accent word ("" if none)
  sub: string; // supporting line; "" if none
  hint: string; // interaction hint shown with the slide; "" if none
};

// The three Craft slides, in order. Every world stages all three, each in its own scene.
export const craft: Phrase[] = [
  { id: "alive", before: "Interactions that feel", accent: "alive.", after: "", sub: "", hint: "Hover anywhere" },
  { id: "motion", before: "Motion is the", accent: "message.", after: "", sub: "Together, we breathe.", hint: "" },
  {
    id: "louder",
    before: "Designs that",
    accent: "speak",
    after: "louder than words.",
    sub: "Built with precision. Felt with intention.",
    hint: "",
  },
];

export type Capability = {
  id: string;
  title: string;
  line: string; // one-sentence claim
  items: string[];
};

// Skill groups shown in every world.
export const capabilities: Capability[] = [
  {
    id: "retrieval",
    title: "Retrieval & Knowledge",
    line: "Making large sets of documents searchable and answerable by AI.",
    items: ["Vector RAG", "GraphRAG", "LazyGraphRAG", "LLM Wiki (Karpathy pattern)", "Document parsing algorithms"],
  },
  {
    id: "local-ai",
    title: "Agents & Local AI",
    line: "Running AI models and agents on my own hardware.",
    items: ["Local LLMs", "Hermes Agent", "Hugging Face", "Stable Diffusion", "Local image & video generation"],
  },
  {
    id: "ai-engineering",
    title: "AI-Native Engineering",
    line: "Building software with several AI coding agents working in parallel.",
    items: ["Claude Code", "Codex", "Multi-agent orchestration"],
  },
  {
    id: "interface",
    title: "Interface",
    line: "Web and desktop interfaces with careful design and animation.",
    items: ["React", "Next.js", "TypeScript", "JavaScript", "shadcn/ui", "Electron"],
  },
  {
    id: "systems",
    title: "Systems & Data",
    line: "Back-end services, databases and API integrations.",
    items: ["Node.js", "Python", "Java", "C", "SQL", "Firebase", "Database management", "API integration"],
  },
  {
    id: "cloud",
    title: "Cloud & Shipping",
    line: "Hosting, deployment and version control.",
    items: ["AWS", "Google Cloud", "Vercel", "Railway", "GitHub"],
  },
];

export type Project = {
  id: string;
  name: string;
  kind: string;
  year: number;
  desc: string;
  stack: string[];
  link?: string;
  status?: string; // shown in place of a link when the project isn't public yet
};

export const projects: Project[] = [
  {
    id: "mirae",
    name: "Mirae",
    kind: "Desktop app · Electron",
    year: 2026,
    desc: "A desktop app for recording user research interviews. It records the screen, camera and audio, transcribes the conversation live and labels who is speaking, and links notes to the recording's timeline. Recordings stay on the computer, and observers can watch from a browser.",
    stack: ["Electron", "React", "TypeScript", "ffmpeg", "Live ASR", "Cloudflare Tunnel"],
    status: "To be revealed",
  },
  {
    id: "home",
    name: "Home.app",
    kind: "Web app",
    year: 2025,
    desc: "A simple task manager for tracking projects and progress, with nothing else on the screen.",
    stack: ["Next.js", "React", "Vercel"],
    link: "https://jyhome.vercel.app",
  },
  {
    id: "flowstate",
    name: "FlowState",
    kind: "AI productivity",
    year: 2025,
    desc: "A productivity app for solo makers. You speak your ideas and AI turns them into organized tasks and projects.",
    stack: ["React", "Whisper", "Supabase", "LLM"],
  },
  {
    id: "meridian",
    name: "Meridian",
    kind: "Data intelligence",
    year: 2025,
    desc: "An app that uses AI to find patterns in live data and shows them as interactive 3D charts.",
    stack: ["Three.js", "Python", "WebSockets", "Claude"],
  },
];
