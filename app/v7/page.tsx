import Link from "next/link";
import { profile, capabilities, projects, chapters } from "@/content/profile";
import { NOTES, entityByName } from "./_lib/kb";
import { PopoverProvider, EntityLink } from "./_components/Popover";
import Sidenote from "./_components/Sidenote";
import SmoothScroll from "./_components/SmoothScroll";
import Director from "./_components/Director";
import Act1 from "./_components/Act1";
import Act2 from "./_components/Act2";
import Act3 from "./_components/Act3";
import GraphPlate from "./_components/GraphPlate";
import JumpLink from "./_components/JumpLink";
import HeroSeal from "./_components/HeroSeal";
import b from "./base.module.css";
import s from "./act1.module.css";

/** Note body: the listed capability items as entity links, separated by middots. */
function noteText(items: string[]) {
  return items.map((name, i) => {
    const e = entityByName(name);
    return (
      <span key={name}>
        {i > 0 && " · "}
        {e ? <EntityLink id={e.id}>{name}</EntityLink> : name}
      </span>
    );
  });
}

/** Paragraph with sidenote markers inserted after their anchor phrases. */
function Para({ text, notes, first }: { text: string; notes: { n: (typeof NOTES)[number]; num: number }[]; first?: boolean }) {
  const cuts = notes
    .map(({ n, num }) => ({ at: text.indexOf(n.phrase) + n.phrase.length, n, num }))
    .filter((c) => c.at >= c.n.phrase.length)
    .sort((a, c) => a.at - c.at);
  const out: React.ReactNode[] = [];
  let last = 0;
  cuts.forEach((c) => {
    out.push(text.slice(last, c.at));
    out.push(
      <Sidenote key={c.num} n={c.num}>
        {noteText(c.n.items)}
      </Sidenote>
    );
    last = c.at;
  });
  out.push(text.slice(last));
  return <p className={first ? s.firstPara : undefined}>{out}</p>;
}

const CHAPTERS = [
  { to: "about", label: chapters.about, sw: "swPaper" },
  { to: "skills", label: chapters.skills, sw: "swBlue" },
  { to: "projects", label: chapters.work, sw: "swRiso" },
  { to: "contact", label: chapters.contact, sw: "swAir" },
] as const;

export default function CodexPage() {
  const years = projects.map((p) => p.year);
  const span = `${Math.min(...years)}–${Math.max(...years)}`;
  const notesFor = (para: number) => NOTES.map((n, i) => ({ n, num: i + 1 })).filter((x) => x.n.para === para);

  return (
    <PopoverProvider>
      <SmoothScroll />
      <div className={b.page} data-codex data-act="1" data-sec="1">
        <a href="#about" className={b.skip}>
          {chapters.about}
        </a>

        <header className={b.hud}>
          <span className={b.hudBrand}>Codex</span>
          <ol className={b.hudActs} aria-label={chapters.intro}>
            {CHAPTERS.map((c, i) => (
              <li key={c.to} data-a={i + 1}>
                <JumpLink to={c.to}>
                  <b>{i + 1}</b> {c.label}
                </JumpLink>
              </li>
            ))}
          </ol>
          <span className={b.hudRight}>{profile.year}</span>
          <span className={b.hudTrack} aria-hidden>
            <span className={b.hudProg} data-progress />
          </span>
        </header>

        <main className={b.stage}>
          <Act1>
            {/* ---- hero leaf ---- */}
            <section className={`${s.region} ${s.rHero}`} data-region="hero" data-anchor="top" id="top" aria-labelledby="title">
              <div className={s.mast}>
                <span>Codex</span>
                <span className={s.mastMid}>{chapters.intro}</span>
                <span className={s.dim}>{profile.year}</span>
              </div>
              <span className={s.mastRuleA} aria-hidden />
              <span className={s.mastRuleB} aria-hidden />

              <h1 id="title" className={s.title} aria-label={profile.name}>
                {profile.name.split("").map((ch, i) => (
                  <span key={i} className={s.chMask} aria-hidden>
                    <span className={s.ch} style={{ ["--i" as string]: i } as React.CSSProperties}>
                      {ch}
                    </span>
                  </span>
                ))}
              </h1>
              <p className={s.pron}>
                <span className={s.pronHead}>{profile.role}</span>
                <span className={s.pronSep}> · </span>
                <i>{profile.alias}</i>
                <span className={s.pronSep}> · </span>
                {profile.location}
              </p>

              <div className={s.heroGrid}>
                <p className={s.lead}>
                  <span className={s.dropCap} aria-hidden>
                    <span className={s.dropLetter}>{profile.statement[0]}</span>
                  </span>
                  <span className={s.srOnly}>{profile.statement[0]}</span>
                  {profile.statement.slice(1)}
                </p>
                <nav className={s.key} aria-label={chapters.intro}>
                  <ol className={s.keyList}>
                    {CHAPTERS.map((c, i) => (
                      <li key={c.to}>
                        <JumpLink to={c.to} className={s.keyLink}>
                          <span className={`${s.sw} ${s[c.sw]}`} aria-hidden />
                          <b>{i + 1}</b>
                          {c.label}
                        </JumpLink>
                      </li>
                    ))}
                  </ol>
                </nav>
                <div className={s.heroSide}>
                  <dl className={s.infobox}>
                    <div>
                      <dt>{chapters.skills}</dt>
                      <dd>{capabilities.length}</dd>
                    </div>
                    <div>
                      <dt>{chapters.work}</dt>
                      <dd>
                        {projects.length} <span className={s.dim}>· {span}</span>
                      </dd>
                    </div>
                    <div>
                      <dt>GitHub</dt>
                      <dd>
                        <a href={profile.contact.github} className={s.plainLink} target="_blank" rel="noreferrer">
                          {profile.handle}
                        </a>
                      </dd>
                    </div>
                    <div>
                      <dt>Email</dt>
                      <dd>
                        <a href={`mailto:${profile.contact.email}`} className={s.plainLink}>
                          {profile.contact.email}
                        </a>
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
              <HeroSeal />
            </section>

            {/* ---- about leaf ---- */}
            <section className={`${s.region} ${s.rAbout}`} data-region="about" data-anchor="about" id="about" aria-labelledby="h-about">
              <span className={s.secRule} aria-hidden />
              <h2 id="h-about" className={s.h2}>
                <span className={s.h2Num}>1</span>
                {chapters.about}
              </h2>
              <div className={s.prose}>
                {profile.about.map((t, i) => (
                  <Para key={i} text={t} notes={notesFor(i)} first={i === 0} />
                ))}
              </div>
            </section>

            {/* ---- graph leaf ---- */}
            <section className={`${s.region} ${s.rGraph}`} data-region="graph" data-anchor="plate" id="plate" aria-label={`${chapters.skills} · ${chapters.work}`}>
              <GraphPlate />
            </section>
          </Act1>

          <Act2 />
          <Act3 />
        </main>

        <footer className={b.footer} data-footer>
          <p className={b.colMeta}>
            <span>
              © {profile.year} {profile.name}
            </span>
            <JumpLink to="top" className={b.colTop}>
              {chapters.intro} ↑
            </JumpLink>
          </p>
          <Link href="/" className={b.restart}>
            {chapters.restart}
            <span aria-hidden> →</span>
          </Link>
        </footer>
        <Director />
      </div>
    </PopoverProvider>
  );
}
