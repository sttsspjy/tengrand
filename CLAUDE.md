# Jaeyoung Portfolio: Claude Guidelines

## north-star

A personal portfolio that is itself the proof of skill. A visitor should feel "this person has taste and can build anything" within 5 seconds, then find concrete capabilities and work.

**Design first. Bold, unique, eye-catching, and fast.** Not a product: no maintenance or scalability concerns, no long-term architecture. One maintainer (the user). Visual quality and smoothness beat everything else.

Rules:
1. **Never ship the generic AI-website look.** (Banned list below.)
2. **Smooth on any machine.** Jank is a design failure, not a perf footnote. (Budget below.)
3. **Content is real.** All copy and facts come from `content/profile.ts`. Never invent projects, clients, metrics or testimonials. (FlowState and Meridian are known placeholders, kept until real apps replace them.)

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind v4 (`@import "tailwindcss"`, no config file) · motion · gsap + @gsap/react · lenis · ogl · three + @react-three/fiber + drei · postprocessing.
- Borrow freely from open-source UI code (React Bits https://reactbits.dev, source https://github.com/DavidHDev/react-bits). **Copy the component source into the repo and adapt it.** Don't add a package for one component. Mark copied files with one line: `// Adapted from React Bits (MIT)`.
- `typescript.ignoreBuildErrors` is OFF. Build must typecheck.

## File map

```
app/(gate)/           # `/`: AI-ethics questionnaire; the result routes the visitor to one world
app/v5 · v6 · v7      # the three worlds: Monolith · Nocturne · Codex. Each self-contained: layout.tsx (fonts) · page.tsx · _components/ · *.module.css
content/profile.ts    # ALL portfolio copy: profile, chapter names, capabilities, projects. Edit text only here.
content/quiz.ts       # questionnaire copy, world mapping and scoring, WORLD_COOKIE / RESTART_HREF
proxy.ts              # serves the chosen world at "/" from the tg_world cookie; /restart clears it; typed /vN redirects to "/" in production
public/vN/            # sample-specific assets
scripts/shot.mjs      # headless Edge probe: screenshots down the page, console errors, FPS, GPU
screenshots/          # user's reference sites (taste reference, not to copy)
```

Worlds are isolated: a world never imports from another world or the gate. Fonts load per world via `next/font` in its `layout.tsx`. No global CSS beyond `app/globals.css` reset.

## Banned (overused AI-site patterns)

- Rounded cards in a grid with an icon + title + text; "bento" grids; colored accent strips/borders on boxes
- Purple/blue/pink gradients, aurora/mesh-gradient blobs, gradient-filled headline text, glow-on-everything
- Glassmorphism panels (`backdrop-blur` cards), frosted navbars
- Generic sans defaults: Inter, Poppins, Montserrat, Space Grotesk, Roboto, Open Sans
- Pill badges for skill lists, lucide icon + label rows, "trusted by" rows, emoji, fake stats ("50+ projects")
- Centered hero with "Hi, I'm X 👋" + two buttons; scroll-down mouse icon; floating particles for decoration
- Custom cursor dot+ring follower (the old site's cliché)

## Performance (smooth on modern hardware, not a cage)

Target hardware: modern laptop chips (Apple M-series, recent Intel/AMD iGPU) and modern phones (iPhone 13+/recent Android flagships). Ambition wins over budget, as long as it stays smooth there.
- Prefer one WebGL context; two is acceptable when it buys a real effect. Render loops pause when off-screen and when the tab is hidden.
- DPR ≤2 (≤1.5 for heavy shaders). Adaptive resolution if frame time climbs.
- Prefer `transform`/`opacity`/shader uniforms. Filters, blends and clip-paths are fine on transitions/short moments, not as permanent per-frame layers over the whole page.
- No React state updates per scroll frame (refs / ScrollTrigger / motion values).
- Heavy visuals via `next/dynamic` (`ssr:false`) behind a static first paint.
- `prefers-reduced-motion` gets a calm, fully readable version.
- Check: smooth scrolling at 1600×900 on the probe's integrated GPU; zero console errors; no horizontal overflow at 390px wide.

## Verify

1. `npm run dev` (port 3000). Each sample at `/vN` (direct world paths work in development only). Append `?entry` to play the gate-to-world arrival.
2. `node scripts/shot.mjs /vN <outDir> [--mobile]`. Then read the PNGs and JSON (fps, worstMs, errors, gpu).
3. `npm run typecheck`.

## Git

Single maintainer. Commit straight to `main`, short imperative messages. No branches, PR rules or rebase policy.

## Comments

Comment the mechanism only (what it does / returns). No storytelling, no changelogs in code.

---

# Multi-agent convention

Main session = **Advisor**: decides concepts, writes briefs, verifies results (screenshots + probe numbers, not the worker's word), merges. **Worker** (subagent): implements exactly its brief, inside its own folder only, then sends a compact, honest completion report (what was built, what was borrowed, probe numbers, known issues, out-of-scope problems noticed). Workers never run `npm install`. Packages go through the Advisor so parallel workers don't corrupt `node_modules`.

---

# Response style (every response, always)

Three facts drive these rules:
1. Humans have small working memory. Anything not on screen is forgotten.
2. Knowing the answer ≠ doing it. If it needs doing, do it.
3. No vagueness or compromises. Always opt for the best possible method.

1. **Number multi-step tasks.** One bounded action per step.
2. **End with one concrete next action.**
3. **Suppress tangents.** Put them after the main point as "Separately: …". Questions the task needs are not tangents.
4. **State results concretely.** "Login now works.", not "I've made some changes…".
5. **Just fix it.** State cause and fix. Call out contradictions or fundamental issues.
6. **Lowest verbosity.** No "Great question", "Let me…", "Hope this helps", no recap of what was just done.
7. **Before sending:** the first and last lines alone must say what happened and what to do next.
