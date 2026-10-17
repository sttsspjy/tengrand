// Camera-less prints ("photograms"): objects laid on photo paper read as pale shapes on black.
// One composition per project, drawn in paper tone over a black ground.

const PAPER = "var(--paper)";
const r2 = (v: number) => Math.round(v * 100) / 100;

function Mirae() {
  // screen, camera lens, four audio tracks, timestamp ticks
  return (
    <>
      <rect x="22" y="24" width="116" height="74" rx="2" fill="none" stroke={PAPER} strokeWidth="5" />
      <rect x="34" y="36" width="60" height="50" fill={PAPER} opacity="0.32" />
      <circle cx="116" cy="60" r="13" fill={PAPER} />
      <circle cx="116" cy="60" r="6" fill="#000" />
      {[0, 1, 2, 3].map((k) => (
        <path
          key={k}
          d={`M22 ${122 + k * 16} ${Array.from({ length: 24 }, (_, i) => `L${22 + i * 5} ${r2(122 + k * 16 + Math.sin(i * (1.3 + k * 0.4) + k) * (3 + ((i * 7 + k * 3) % 5)))}`).join(" ")}`}
          fill="none"
          stroke={PAPER}
          strokeWidth="2.2"
          opacity={0.9 - k * 0.15}
        />
      ))}
      {Array.from({ length: 12 }, (_, i) => (
        <rect key={i} x={22 + i * 10} y="186" width="1.6" height={i % 4 === 0 ? 8 : 4} fill={PAPER} />
      ))}
    </>
  );
}

function Home() {
  // three task rows, one checked; a lot of quiet paper
  return (
    <>
      {[0, 1, 2].map((k) => (
        <g key={k} transform={`translate(30 ${62 + k * 34})`}>
          <rect x="0" y="0" width="16" height="16" fill="none" stroke={PAPER} strokeWidth="3" />
          {k === 0 ? <path d="M3 8 L7 13 L14 3" fill="none" stroke={PAPER} strokeWidth="3" /> : null}
          <rect x="28" y="5" width={k === 0 ? 50 : 76 - k * 10} height="6" fill={PAPER} opacity={k === 0 ? 0.45 : 0.95} />
        </g>
      ))}
      <circle cx="122" cy="172" r="5" fill={PAPER} />
    </>
  );
}

function FlowState() {
  // spoken waveform resolving into stacked blocks
  return (
    <>
      {Array.from({ length: 16 }, (_, i) => {
        const h = r2(8 + Math.abs(Math.sin(i * 0.9) * 44) * (1 - i / 22));
        return <rect key={i} x={r2(18 + i * 4.6)} y={r2(100 - h / 2)} width="2.4" height={h} fill={PAPER} />;
      })}
      <path d="M94 100 C 104 100, 104 60, 116 60 M94 100 C 104 100, 104 100, 116 100 M94 100 C 104 100, 104 140, 116 140" fill="none" stroke={PAPER} strokeWidth="2" opacity="0.7" />
      {[60, 100, 140].map((y, k) => (
        <g key={y}>
          <rect x="118" y={y - 9} width="26" height="18" fill={PAPER} />
          <rect x="118" y={y + 12} width={18 - k * 4} height="3" fill={PAPER} opacity="0.6" />
        </g>
      ))}
    </>
  );
}

function Meridian() {
  // globe of meridians with data streams crossing it
  return (
    <>
      <circle cx="80" cy="96" r="52" fill="none" stroke={PAPER} strokeWidth="3" />
      {[16, 32, 46].map((rx) => (
        <ellipse key={rx} cx="80" cy="96" rx={rx} ry="52" fill="none" stroke={PAPER} strokeWidth="1.6" opacity="0.8" />
      ))}
      <line x1="28" y1="96" x2="132" y2="96" stroke={PAPER} strokeWidth="1.6" />
      {[0, 1, 2, 3, 4].map((k) => (
        <path
          key={k}
          d={`M0 ${150 + k * 9} C 50 ${130 + k * 12}, 110 ${176 - k * 6}, 160 ${148 + k * 8}`}
          fill="none"
          stroke={PAPER}
          strokeWidth="1.4"
          strokeDasharray={`${2 + k} ${4 + k * 2}`}
          opacity="0.85"
        />
      ))}
    </>
  );
}

const ART = [Mirae, Home, FlowState, Meridian];

export default function Photogram({ i, soft = false }: { i: number; soft?: boolean }) {
  const Art = ART[i] ?? Mirae;
  return (
    <svg viewBox="0 0 160 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <rect width="160" height="200" fill="#000" />
      <g transform={soft ? "translate(80 100) scale(1.06) translate(-80 -100)" : undefined} opacity={soft ? 0.55 : undefined}>
        <Art />
      </g>
    </svg>
  );
}
