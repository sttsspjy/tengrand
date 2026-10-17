// Precomputed per-instance transforms for the three target forms, in each form's local space.
// Slat geometry: long axis X (length 1), thin axis Y, width Z.
import * as THREE from "three";

export type Form = { p: THREE.Vector3[]; q: THREE.Quaternion[]; s: THREE.Vector3[] };

export type Forms = {
  helix: Form; // Monolith: vertical helix column
  sea: Form; // Nocturne: low field of blades with a horizon line
  ring: Form; // Codex: armillary lattice of three rings
  seaSwell: Float32Array; // 1 = blade follows the swell, 0 = horizon slat stays put
  delay: Float32Array; // 0..1 ripple order
  share: Float32Array; // 0..1 low-discrepancy value that assigns the slat to a form
  dir: THREE.Vector3[]; // flutter direction while morphing
  axis: THREE.Vector3[]; // flutter tumble axis
};

export const SEA_Y = -1.5;

const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

const empty = (n: number): Form => ({
  p: Array.from({ length: n }, () => new THREE.Vector3()),
  q: Array.from({ length: n }, () => new THREE.Quaternion()),
  s: Array.from({ length: n }, () => new THREE.Vector3(1, 1, 1)),
});

export function buildForms(N: number): Forms {
  const helix = empty(N);
  const sea = empty(N);
  const ring = empty(N);
  const seaSwell = new Float32Array(N);
  const delay = new Float32Array(N);
  const share = new Float32Array(N);
  const dir: THREE.Vector3[] = [];
  const axis: THREE.Vector3[] = [];

  const X = new THREE.Vector3();
  const Y = new THREE.Vector3();
  const Z = new THREE.Vector3();
  const r = new THREE.Vector3();
  const b = new THREE.Vector3();
  const m = new THREE.Matrix4();

  // ── Monolith: helix column (slats stacked along the spine, radial, twisting with height) ──
  const R = 1.0;
  const turns = 2.2;
  const H = 6.3;
  const span = turns * Math.PI * 2;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const u0 = t - 0.5;
    const th = u0 * span;
    const c = Math.cos(th);
    const s = Math.sin(th);
    Y.set(-R * s * span, H, R * c * span).normalize();
    r.set(c, 0, s);
    b.crossVectors(Y, r).normalize();
    const phi = 1.8 * u0;
    X.copy(r).multiplyScalar(Math.cos(phi)).addScaledVector(b, Math.sin(phi));
    Z.crossVectors(X, Y);
    const len = 1.6 * (0.9 + 0.1 * Math.sin(t * 19));
    helix.p[i].set(R * c, u0 * H, R * s).addScaledVector(X, len * 0.1);
    helix.q[i].setFromRotationMatrix(m.makeBasis(X, Y, Z));
    helix.s[i].set(len, 1, 1);
  }

  // ── Nocturne: field of flat blades receding to a straight horizon line ──
  const nH = Math.round(N * 0.1);
  const F = N - nH;
  const cols = Math.round(Math.sqrt(F * 1.7));
  const rows = Math.ceil(F / cols);
  const W = 8;
  const D = 5;
  for (let k = 0; k < F; k++) {
    const row = Math.floor(k / cols);
    const col = k % cols;
    const x = ((col + 0.5) / cols - 0.5) * W + (hash(k + 3) - 0.5) * 0.22;
    const z = ((row + 0.5) / rows - 0.5) * D + (hash(k + 9) - 0.5) * 0.18;
    sea.p[k].set(x, SEA_Y, z);
    sea.q[k].setFromAxisAngle(Y.set(0, 1, 0), (hash(k + 17) - 0.5) * 0.5);
    sea.s[k].set(0.42 + 0.14 * hash(k + 5), 1, 0.52);
    seaSwell[k] = 1;
  }
  const HW = 11;
  for (let j = 0; j < nH; j++) {
    const k = F + j;
    sea.p[k].set(((j + 0.5) / nH - 0.5) * HW, SEA_Y + 0.02, -D / 2 - 0.9);
    sea.q[k].identity();
    sea.s[k].set((HW / nH) * 1.03, 0.55, 0.14);
    seaSwell[k] = 0;
  }

  // ── Codex: armillary lattice, three rings of louvered slats ──
  const rings = [
    { n: new THREE.Vector3(0, 1, 0), R: 2.75 },
    { n: new THREE.Vector3(1, 0, 0), R: 2.75 },
    { n: new THREE.Vector3(0, 1, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), 0.41), R: 2.35 },
  ];
  const per = Math.ceil(N / 3);
  for (let i = 0; i < N; i++) {
    const ri = Math.min(2, Math.floor(i / per));
    const start = ri * per;
    const cnt = Math.min(per, N - start);
    const a = ((i - start) / cnt) * Math.PI * 2;
    const { n, R: rr } = rings[ri];
    const e1 = new THREE.Vector3(0, 0, 1).cross(n);
    if (e1.lengthSq() < 1e-6) e1.set(1, 0, 0).cross(n);
    e1.normalize();
    const e2 = new THREE.Vector3().crossVectors(n, e1).normalize();
    r.copy(e1).multiplyScalar(Math.cos(a)).addScaledVector(e2, Math.sin(a));
    Y.copy(e1).multiplyScalar(-Math.sin(a)).addScaledVector(e2, Math.cos(a));
    X.copy(n);
    Z.crossVectors(X, Y);
    ring.p[i].copy(r).multiplyScalar(rr);
    ring.q[i].setFromRotationMatrix(m.makeBasis(X, Y, Z));
    ring.s[i].set(0.6 + 0.08 * hash(i + 21), 1, 0.42);
  }

  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    delay[i] = 0.85 * t + 0.15 * hash(i * 1.9 + 11);
    share[i] = (i * 0.6180339887 + 0.5) % 1;
    dir.push(new THREE.Vector3(hash(i + 31) - 0.5, hash(i + 37) - 0.3, hash(i + 41) - 0.5).normalize());
    axis.push(new THREE.Vector3(hash(i + 43) - 0.5, hash(i + 47) - 0.5, hash(i + 53) - 0.5).normalize());
  }

  return { helix, sea, ring, seaSwell, delay, share, dir, axis };
}
