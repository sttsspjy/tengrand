# Handoff: 2026-10-20 overhaul

All five requests are built and verified: typecheck and `next build` pass, there are zero console errors, and the probe holds 60 fps at 1600×900 and 390×844.

## What changed

### 1. Nocturne (v6), fully redesigned: "one night, one ascent, one light"
The camera climbs through a single night and ends at dawn, never back at the start. One paper lantern, released at the start, rises with the camera through every act. That lantern and the time of night (blue hour → midnight → dawn) are what connect the acts.

| Chapter | Scene |
|---|---|
| Intro / About | Street-level canyon of apartment towers with lit windows. Clicking a window lights its neighbours. |
| Craft D · alive | Top-down over the city; ALIVE is spelled in lit roofs, and the pointer switches windows on. |
| Craft E · motion | On your back under hundreds of rising lanterns breathing together. Holding the pointer down makes them breathe in. |
| Craft F · louder | Inside a storm-cloud base; lightning strikes reveal the words. Clicking also strikes. |
| Skills | Moonlit cloud sea. Each of the six skills gets its own shot: canyon, anvil thunderhead, tear down to the city, moon glade, strata with moonbeams, pull-back. |
| Projects | Constellations: each project is drawn in stars across the Milky Way. |
| Contact | Sunrise over the cloud sea, where the lantern dissolves into the sun. |

- **Fonts:** Fraunces and Martian Mono.
- **Shaders:** three programs (city, storm, clouds), compiled in parallel.
- **Removed:** the ocean, the salt flat and the darkroom.

### 2. Replacements for the hanging-paper sections
- **v6:** Projects are now the constellations (above).
- **v7 Codex:** Projects are now **The Infinite Library**.
  - The press prints the PROJECTS sheet, which is bound into a book and shelved.
  - The camera then spirals down a 13-level hexagonal library well, rendered in riso style (WebGL2, `app/v7/_components/library.ts`).
  - At each project, a book slides out and opens into a spread.
  - Contact is a catalogue card on the reading desk at the bottom of the well.

### 3. Craft: the three OG phrases × three worlds
- **Where the copy lives:** `content/profile.ts` → `craft[]` and `chapters.craft`.
- **Where Craft sits:** between About and Skills in every world.

| | alive | motion | louder |
|---|---|---|---|
| **v5 Monolith** | A · kinetic flip-panel facade spelling ALIVE (pointer flip trail) | B · breathing ring of fins (tunnel → torus, 90° roll) | C · megaphone horn; the words blast out of the bell |
| **v6 Nocturne** | D · city roofs | E · lanterns | F · storm |
| **v7 Codex** | G · marbling bath (WebGL fluid) | H · zoetrope | I · wood type slamming onto the press |

### 4. Questionnaire overhaul + entrance transitions
- **Gate "Trine":** a gallery corner with one floating solid. The solid is the intersection of the letters M, N and C, so its three coloured spotlights cast those three letters as shadows. The lights follow the running tally of answers. The slat sculpture is gone, so the gate no longer overlaps Monolith.
- **Fonts:** Bodoni Moda and Hanken Grotesk.
- **Each world has its own two-part entrance:**
  - **Monolith, "The Cut":** three hard 120° clicks, then 12 red blades drop. In v5 they turn like louvers and become the grid lines.
  - **Nocturne, "Lights out":** the room dims to one warm point, which blinks out. In v6 a match strikes at the same point and the city's windows come on.
  - **Codex, "Ink":** the C shadow bleeds into ink. In v7 the ink sheet turns away as a 3D page curl.
- **How the hand-off works:** the gate covers the screen in the world's colour, sets `html[data-entry]` and the cookie, then calls `router.refresh()`. Each world shows a matching cover on its first paint and plays the second half of the transition.

### 5. URL masking
`proxy.ts` serves the chosen world at `/` from the `tg_world` session cookie.
- `/restart` clears the cookie and returns to the questionnaire. Every "Back to the start" link is a plain `<a href={RESTART_HREF}>`.
- Typing `/v5`, `/v6` or `/v7` redirects to `/` in production. In development these paths stay open for probes.
- Refreshing the page keeps the visitor in their world. A new browser session starts at the questionnaire.

## How to test at home
1. `npm install`, then `npm run dev`.
2. Open `http://localhost:3000/` and answer the questions. If `/` keeps opening a world, go to `/restart` to clear the cookie.
3. Worlds open directly in dev at `/v5`, `/v6` and `/v7`.
   - `?entry` replays the arrival transition.
   - `/v6?debug` exposes `window.__n2go(g)` to jump along the timeline.
   - `window.__v7.jump(y)` does the same for v7 in development.
4. Run `npm run typecheck`, then `npx next build`.

## Known weak spots (best next steps)
- **v6 Skills:** the thunderheads read as stylised mushroom anvils rather than real cumulonimbus. The crane shot (e) is the softest frame. This is the weakest scene.
- **v6 mobile:** project notes overlap the lower part of each constellation. They stay readable because of a text shadow.
- **v7:** runs two WebGL2 contexts (marbling and library). The helix stair clips a gallery corner in a few places. Phones held in landscape get small book pages.
- **v5:** the `?entry` debug path shows the page for one frame before the cover. The real gate hand-off does not.
- **Gate → Monolith:** after the blades, the red cover holds about 0.6 s while v5's WebGL warms up.
- **Probe GPU:** every fps figure was measured on a desktop RTX GPU. Nothing has been measured on an integrated GPU yet. Every heavy scene has adaptive resolution.
