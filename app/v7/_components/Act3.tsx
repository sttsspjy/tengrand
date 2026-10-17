"use client";

import { useEffect, useRef } from "react";
import { profile, projects, chapters } from "@/content/profile";
import { registerPart, sub, easeInOut, type Frame } from "../_lib/stage";
import { Track, type Pose, type Seg } from "../_lib/track";
import { drawHalftone } from "../_lib/halftone";
import { drawSeal, fontsOf } from "../_lib/seal";
import { stackOf, projectId } from "../_lib/kb";
import { goTo } from "../_lib/scroll";
import Poster from "./Poster";
import s from "../act3.module.css";

// Act III: the press (t2) prints the title sheet in three passes, then the camera pulls back to a
// gallery wall of riso prints and walks it (dolly + yaw swings). Click the wall to stamp it.

const INKS = { orange: "#ff5d1f", teal: "#0b8a8c", black: "#1c1a19" };
const PASS: [number, number][] = [
  [0.05, 0.4],
  [0.36, 0.67],
  [0.63, 0.93],
];

export default function Act3() {
  const layerRef = useRef<HTMLDivElement>(null);
  const wallRef = useRef<HTMLDivElement>(null);
  const stampsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const layer = layerRef.current!;
    const wall = wallRef.current!;
    const root = layer.closest<HTMLElement>("[data-codex]")!;
    const footer = root.querySelector<HTMLElement>("[data-footer]");
    const passes = Array.from(layer.querySelectorAll<HTMLElement>("[data-pass]"));
    const rollers = Array.from(layer.querySelectorAll<HTMLElement>("[data-roller]"));
    const titleOrange = layer.querySelector<HTMLCanvasElement>("[data-ht-orange]");
    const titleTeal = layer.querySelector<HTMLCanvasElement>("[data-ht-teal]");
    const postmark = layer.querySelector<HTMLCanvasElement>("[data-postmark]");
    let track: Track | null = null;
    let phase = "";
    let lastKey = "";
    let footOn = false;
    let hintOn = false;
    let contactAt = 0;
    let cam: Pose = { cx: 0, cy: 0, s: 1, ry: 0, rz: 0 };
    let size = { vw: 0, vh: 0 };
    const stampImgs: string[] = [];
    let stampN = 0;

    const fonts = fontsOf(root);
    document.fonts.ready.then(() => {
      for (const [k, col] of [
        ["o", INKS.orange],
        ["t", INKS.teal],
      ] as const) {
        const c = document.createElement("canvas");
        drawSeal(c, 220, col, fonts, k === "o" ? 7 : 11);
        stampImgs.push(c.toDataURL());
      }
      if (postmark) drawSeal(postmark, postmark.offsetWidth || 180, INKS.teal, fonts, 5, `${profile.location} · ${profile.year} · ${profile.handle} · `.toUpperCase());
    });

    const paintTitle = () => {
      // pass 1: orange field that breaks into halftone toward the foot; pass 2: a halftone node (disc)
      if (titleOrange)
        drawHalftone(
          titleOrange,
          (u, v) => {
            // paper across the head, a halftone ramp, then solid ink; the ramp edge waves gently
            const edge = 0.6 + 0.05 * Math.sin(u * 7.5 + 1);
            return v < edge - 0.26 ? 0 : v < edge ? ((v - edge + 0.26) / 0.26) * 1.3 : 1.3;
          },
          INKS.orange,
          Math.max(7, titleOrange.offsetWidth / 90),
          22,
          0.78,
          2
        );
      if (titleTeal)
        drawHalftone(
          titleTeal,
          (u, v) => {
            // disc radius in px of the sheet's short side, so portrait and landscape keep a round node
            const w = titleTeal.offsetWidth;
            const h = titleTeal.offsetHeight;
            const portrait = h > w;
            const d = Math.hypot((u - (portrait ? 0.6 : 0.7)) * w, (v - (portrait ? 0.38 : 0.42)) * h) / (0.4 * Math.min(w, h));
            return d < 1 ? 1.15 - d * 0.75 : 0;
          },
          INKS.teal,
          Math.max(6, titleTeal.offsetWidth / 110),
          67,
          0.72,
          2
        );
    };
    document.fonts.ready.then(paintTitle);

    const station = (name: string): Pose => {
      const el = wall.querySelector<HTMLElement>(`[data-station="${name}"]`)!;
      return { cx: el.offsetLeft + el.offsetWidth / 2, cy: el.offsetTop + el.offsetHeight / 2, s: 1, ry: 0, rz: 0 };
    };

    const un = registerPart("act3", {
      owns: "a3",
      measure: (vw, vh, mobile) => {
        size = { vw, vh };
        const title: Pose = { ...station("title"), s: 2 };
        const w0 = station("work-0");
        const over: Pose = { ...w0, cx: title.cx + (w0.cx - title.cx) * 0.62, s: mobile ? 0.3 : 0.4, ry: -12, rz: -1 };
        const segs: Seg[] = [
          { kind: "hold", a: title, len: 0.12 * vh, id: "projects" },
          { kind: "fly", len: 0.72 * vh, ease: (t) => 1 - Math.pow(1 - t, 2.4) },
          { kind: "hold", a: over, len: 0.25 * vh, id: "gallery" },
          { kind: "fly", len: 0.62 * vh, arc: { rz: 1.2 } },
        ];
        projects.forEach((p, i) => {
          if (i > 0) segs.push({ kind: "fly", len: 0.52 * vh, arc: { ry: i % 2 ? 17 : -17, s: -0.3, rz: i % 2 ? -1.4 : 1.4 } });
          segs.push({ kind: "hold", a: station(`work-${i}`), len: 0.52 * vh, id: `entry-${p.id}` });
        });
        segs.push({ kind: "fly", len: 0.62 * vh, arc: { ry: 15, s: -0.32, rz: -1 } });
        segs.push({ kind: "hold", a: station("contact"), len: 0.75 * vh, id: "contact" });
        track = new Track(segs);
        contactAt = track.startOf("contact");
        lastKey = "";
        paintTitle();
        const anchors: Record<string, number> = { projects: 0, contact: contactAt + 0.1 * vh };
        projects.forEach((p) => (anchors[`entry-${p.id}`] = track!.startOf(`entry-${p.id}`) + 0.06 * vh));
        return { len: track.total, anchors };
      },
      update: (f: Frame) => {
        if (!track) return;
        const { y, L, vw, vh } = f;
        if (y < L.t2.start) return;
        const press = y < L.a3.start;
        const ph = press ? "press" : "a3";
        if (ph !== phase) {
          phase = ph;
          layer.dataset.phase = ph;
          if (!press) for (const el of passes) el.style.clipPath = "none";
        }
        // press passes: each ink is revealed above its roller as the roller travels down the sheet
        if (press) {
          const RH = rollers[0]?.offsetHeight ?? 100;
          PASS.forEach(([a, b], k) => {
            const u = sub(f.p2, a, b);
            const e = easeInOut(u);
            const yy = -RH / 2 + (vh + RH) * e;
            const el = passes[k];
            if (f.reduced) {
              el.style.clipPath = f.p2 >= 0.5 ? "none" : "inset(0 0 100% 0)";
            } else {
              const cut = Math.max(0, Math.min(100, (1 - yy / vh) * 100));
              el.style.clipPath = u >= 1 ? "none" : `inset(0 0 ${cut.toFixed(2)}% 0)`;
            }
            const r = rollers[k];
            if (r) {
              const show = !f.reduced && u > 0 && u < 1;
              r.style.visibility = show ? "visible" : "hidden";
              if (show) {
                r.style.transform = `translate3d(0, ${(yy - RH / 2).toFixed(1)}px, 0)`;
                r.style.backgroundPositionY = `0px, ${(e * 1400).toFixed(0)}px`;
              }
            }
          });
        } else for (const r of rollers) r.style.visibility = "hidden";

        const pose = press ? track.at(0) : track.at(y - L.a3.start, f.reduced);
        cam = pose;
        const key = `${pose.cx.toFixed(1)}|${pose.cy.toFixed(1)}|${pose.s.toFixed(4)}|${pose.ry.toFixed(2)}|${pose.rz.toFixed(2)}|${vw}|${vh}`;
        if (key !== lastKey || f.fresh) {
          lastKey = key;
          wall.style.transform = `translate3d(${vw / 2}px, ${vh / 2}px, 0) rotateY(${pose.ry.toFixed(3)}deg) rotateZ(${pose.rz.toFixed(3)}deg) scale(${pose.s.toFixed(5)}) translate3d(${(-pose.cx).toFixed(2)}px, ${(-pose.cy).toFixed(2)}px, 0)`;
        }
        const fo = !press && y - L.a3.start > contactAt - 0.15 * vh;
        const ho = !press && !fo && y - L.a3.start > 0.45 * vh;
        if (ho !== hintOn) {
          hintOn = ho;
          layer.toggleAttribute("data-hint", ho);
        }
        if (fo !== footOn) {
          footOn = fo;
          footer?.toggleAttribute("data-on", fo);
        }
      },
    });

    // click-to-stamp anywhere on the wall (not on prints or controls)
    const onClick = (e: MouseEvent) => {
      if (phase !== "a3" || !stampImgs.length) return;
      const t = e.target as HTMLElement;
      if (t.closest("a, button, input, [data-poster], [data-nostamp]")) return;
      const { vw, vh } = size;
      const wx = cam.cx + (e.clientX - vw / 2) / cam.s;
      const wy = cam.cy + (e.clientY - vh / 2) / cam.s;
      const el = document.createElement("span");
      el.className = s.stamp;
      el.style.left = `${wx}px`;
      el.style.top = `${wy}px`;
      el.style.backgroundImage = `url(${stampImgs[stampN % stampImgs.length]})`;
      el.style.setProperty("--r", `${(Math.random() - 0.5) * 50}deg`);
      el.setAttribute("aria-hidden", "true");
      stampN++;
      const box = stampsRef.current!;
      box.appendChild(el);
      while (box.children.length > 36) box.firstElementChild?.remove();
    };
    layer.addEventListener("click", onClick);
    return () => {
      un();
      layer.removeEventListener("click", onClick);
    };
  }, []);

  const gh = profile.contact.github.replace(/^https?:\/\//, "");

  return (
    <div className={s.layer} data-layer="a3" ref={layerRef}>
      <div className={s.wall} ref={wallRef}>
        <div className={s.wallDeco} aria-hidden>
          <span className={s.wallNumeral}>III</span>
        </div>

        {/* the title sheet the press prints; at camera scale 2 it exactly fills the viewport */}
        <section className={s.titleSheet} data-station="title" data-anchor="projects" id="projects" aria-labelledby="h-works">
          <div className={s.passOrange} data-pass="0">
            <canvas className={s.htFill} data-ht-orange aria-hidden />
          </div>
          <div className={s.passTeal} data-pass="1" aria-hidden>
            <canvas className={s.htFill} data-ht-teal />
            <span className={s.tealRing} />
            <span className={`${s.tealRing} ${s.tealRing2}`} />
          </div>
          <div className={s.passKey} data-pass="2">
            <p className={s.tKick}>3</p>
            <h2 id="h-works" className={s.tTitle}>
              {chapters.work}
            </h2>
            <ol className={s.tList}>
              {projects.map((p, i) => (
                <li key={p.id}>
                  <b>{String(i + 1).padStart(2, "0")}</b> {p.name}
                </li>
              ))}
            </ol>
            <span className={`${s.reg} ${s.regTL}`} aria-hidden />
            <span className={`${s.reg} ${s.regTR}`} aria-hidden />
            <span className={`${s.reg} ${s.regBL}`} aria-hidden />
            <span className={s.bars} aria-hidden>
              <i style={{ background: INKS.orange }} />
              <i style={{ background: INKS.teal }} />
              <i style={{ background: INKS.black }} />
              <i style={{ background: "#3b2a1d" }} />
            </span>
          </div>
        </section>

        {projects.map((p, i) => (
          <section key={p.id} className={s.station} data-station={`work-${i}`} data-anchor={`entry-${p.id}`} id={`entry-${p.id}`} aria-labelledby={`h-${p.id}`}>
            <Poster p={p} i={i} />
            <div className={s.label}>
              <p className={s.labelNo}>{String(i + 1).padStart(2, "0")}</p>
              <p className={s.labelKind}>
                {p.kind} · {p.year}
              </p>
              <p className={s.labelDesc}>{p.desc}</p>
              <ul className={s.labelStack}>
                {stackOf(projectId(p.id)).map(({ name, entity }) => (
                  <li key={name}>
                    {entity?.kind === "item" ? (
                      <a
                        href={`#${entity.anchor}`}
                        onClick={(e) => {
                          e.preventDefault();
                          goTo(entity.anchor);
                        }}
                      >
                        {name}
                      </a>
                    ) : (
                      name
                    )}
                  </li>
                ))}
              </ul>
              {p.link ? (
                <a href={p.link} className={s.labelLink} target="_blank" rel="noreferrer">
                  {p.link.replace(/^https?:\/\//, "")}
                  <span aria-hidden> ↗</span>
                </a>
              ) : (
                p.status && <p className={s.labelStatus}>{p.status}</p>
              )}
            </div>
          </section>
        ))}

        <section className={s.contact} data-station="contact" data-anchor="contact" id="contact" aria-labelledby="h-corr">
          <div className={s.envelope}>
            <div className={s.envInner}>
              <p className={s.envKick}>4</p>
              <h2 id="h-corr" className={s.envTitle}>
                {chapters.contact}
              </h2>
              <a href={`mailto:${profile.contact.email}`} className={s.envEmail}>
                {profile.contact.email}
              </a>
              <p className={s.envAlt}>
                <span className={s.envAltLabel}>GitHub</span>
                <a href={profile.contact.github} target="_blank" rel="noreferrer">
                  {gh}
                  <span aria-hidden> ↗</span>
                </a>
              </p>
              <p className={s.envFrom}>
                {profile.name} · {profile.location}
              </p>
            </div>
            <span className={s.envLines} aria-hidden />
            <div className={s.postage} aria-hidden>
              <span className={s.postJ}>J</span>
              <span className={s.postVal}>{profile.year}</span>
            </div>
            <canvas className={s.postmark} data-postmark aria-hidden />
          </div>
        </section>

        <div className={s.stamps} ref={stampsRef} />
      </div>

      <div className={s.rollers} aria-hidden>
        <div className={s.roller} data-roller data-ink="orange" />
        <div className={s.roller} data-roller data-ink="teal" />
        <div className={s.roller} data-roller data-ink="black" />
      </div>

      <p className={s.hint} aria-hidden data-nostamp>
        <span className={s.hintStamp} />
        Drag a print to swing it
      </p>
    </div>
  );
}
