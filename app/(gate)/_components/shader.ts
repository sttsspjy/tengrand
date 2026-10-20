// Trine: one carved solid in a gallery corner, lit by three axis-aligned lights.
// The solid is the intersection of three extruded block glyphs (N along x, M along z, C along y),
// so each light throws a different letter onto the surface it faces.

export const VERT = /* glsl */ `#version 300 es
layout(location = 0) in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

export const FRAG = /* glsl */ `#version 300 es
precision highp float;
out vec4 fragColor;

uniform vec2 uRes;
uniform float uTime;
uniform vec3 uCamPos;
uniform mat3 uCamM;     // columns: right, up, forward
uniform vec3 uLens;     // tan(half vertical fov), lens shift x, lens shift y (ndc)
uniform mat3 uObjM;     // object -> world rotation
uniform vec3 uLight;    // intensities: monolith (red, along z), nocturne (amber, along x), codex (teal, along y)
uniform vec4 uFx;       // x penumbra sharpness, y exposure, z amber cone scale, w grain
uniform vec4 uPoint;    // x intensity, y radius (screen heights)
uniform float uInk;     // ink front in screen heights, < 0 = off
uniform vec4 uShield;   // xy direction (ndc), z amount, w start

uniform vec3 uO;       // object centre
#define O uO
const float S = 1.08;   // object half size
const float W = 4.4;    // walls at x = -W and z = -W
const float H = 3.7;    // floor at y = 0.2 - H
const float T = 0.42;   // glyph stroke

const vec3 C_M = vec3(1.0, 0.045, 0.01);
const vec3 C_N = vec3(1.0, 0.36, 0.06);
const vec3 C_C = vec3(0.02, 0.62, 0.6);

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p; a *= 0.5; }
  return s;
}

// ---------- glyphs on [-1,1]^2 ----------
float box2(vec2 p, vec2 c, vec2 h) {
  vec2 d = abs(p - c) - h;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}
float band(vec2 p, vec2 a, vec2 b, float hw) {
  vec2 d = normalize(b - a);
  return abs(dot(p - a, vec2(-d.y, d.x))) - hw;
}
float gM(vec2 p) {
  vec2 q = vec2(abs(p.x), p.y);
  float bar = box2(q, vec2(1.0 - T * 0.5, 0.0), vec2(T * 0.5, 1.0));
  float dg = max(band(q, vec2(0.0, -0.3), vec2(1.0 - T * 0.5, 1.0), 0.205), box2(p, vec2(0.0), vec2(1.0)));
  return min(bar, dg);
}
float gN(vec2 p) {
  float bar = box2(vec2(abs(p.x), p.y), vec2(1.0 - T * 0.5, 0.0), vec2(T * 0.5, 1.0));
  float dg = max(band(p, vec2(-1.0 + T * 0.5, 1.0), vec2(1.0 - T * 0.5, -1.0), 0.215), box2(p, vec2(0.0), vec2(1.0)));
  return min(bar, dg);
}
float gC(vec2 p) {
  float l = box2(p, vec2(-1.0 + T * 0.5, 0.0), vec2(T * 0.5, 1.0));
  vec2 q = vec2(p.x, abs(p.y));
  float tb = box2(q, vec2(0.0, 1.0 - T * 0.5), vec2(1.0, T * 0.5));
  float spur = box2(q, vec2(1.0 - T * 0.5, 1.0 - T - 0.1), vec2(T * 0.5, 0.1 + 0.002));
  return min(min(l, tb), spur);
}

float smax(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return max(a, b) + h * h * k * 0.25;
}
// object space, unit half size
float obj(vec3 q) {
  float a = gN(vec2(-q.z, q.y));
  float b = gM(q.xy);
  float c = gC(vec2(q.x, -q.z));
  return smax(smax(a, b, 0.025), c, 0.025);
}

vec2 slab(vec3 ro, vec3 rd, float b) {
  vec3 r = mix(rd, vec3(1e-5), lessThan(abs(rd), vec3(1e-5)));
  vec3 m = 1.0 / r;
  vec3 n = m * ro;
  vec3 k = abs(m) * b;
  vec3 t1 = -n - k, t2 = -n + k;
  return vec2(max(max(t1.x, t1.y), t1.z), min(min(t2.x, t2.y), t2.z));
}

// world point -> object space
vec3 toObj(vec3 p) { return ((p - O) * uObjM) / S; }

float march(vec3 ro, vec3 rd, out vec3 hit) {
  vec2 b = slab(ro, rd, 1.02);
  if (b.x > b.y || b.y < 0.0) return -1.0;
  float t = max(b.x, 0.0);
  for (int i = 0; i < 80; i++) {
    vec3 p = ro + rd * t;
    float h = obj(p);
    if (h < 0.0012) { hit = p; return t; }
    t += h * 0.9;
    if (t > b.y) break;
  }
  return -1.0;
}

// Soft shadow toward a light, marched only where the ray crosses the object's padded bounds.
float shade(vec3 ro, vec3 rd, float k) {
  vec2 b = slab(ro, rd, 1.0 + 6.0 / k);
  if (b.x > b.y || b.y < 0.0) return 1.0;
  float t = max(b.x, 0.02);
  float res = 1.0;
  for (int i = 0; i < 64; i++) {
    // slightly inflated so rays running along a face register as blocked
    float h = obj(ro + rd * t) - 0.004;
    res = min(res, k * h / t);
    t += clamp(h, 0.035, 0.25);
    if (res < 0.002 || t > b.y) break;
  }
  res = clamp(res, 0.0, 1.0);
  return res * res * (3.0 - 2.0 * res);
}

vec3 objNormal(vec3 p) {
  const vec2 e = vec2(1.0, -1.0) * 0.0015;
  return normalize(e.xyy * obj(p + e.xyy) + e.yyx * obj(p + e.yyx) + e.yxy * obj(p + e.yxy) + e.xxx * obj(p + e.xxx));
}

// Spot pool around the light's axis through the object.
float pool(vec3 P, vec3 L, float scale) {
  vec3 d = P - O;
  d -= L * dot(d, L);
  float r = length(d) / scale;
  return smoothstep(4.3, 1.5, r) * 0.88 + 0.12 * exp(-r * r * 0.05);
}

// Light reflected by the three lit pools, treated as small disc emitters.
vec3 bounce(vec3 P, vec3 N) {
  vec3 acc = vec3(0.0);
  vec3 cs[3] = vec3[](vec3(O.x, O.y, -W), vec3(-W, O.y, O.z), vec3(O.x, 0.2 - H, O.z));
  vec3 ns[3] = vec3[](vec3(0, 0, 1), vec3(1, 0, 0), vec3(0, 1, 0));
  vec3 col[3] = vec3[](C_M * uLight.x, C_N * uLight.y, C_C * uLight.z);
  for (int i = 0; i < 3; i++) {
    vec3 v = cs[i] - P;
    float d2 = dot(v, v);
    vec3 l = v * inversesqrt(d2);
    acc += col[i] * max(dot(N, l), 0.0) * max(dot(ns[i], -l), 0.0) * 6.0 / (d2 + 6.0);
  }
  return acc;
}

vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 ndc = (frag * 2.0 - uRes) / uRes.y; // y in [-1,1]
  vec3 rd = normalize(uCamM * vec3((ndc + uLens.yz * vec2(uRes.x / uRes.y, 1.0)) * uLens.x, 1.0));
  vec3 ro = uCamPos;

  vec3 Ls[3] = vec3[](vec3(0, 0, 1), vec3(1, 0, 0), vec3(0, 1, 0));
  vec3 Lc[3] = vec3[](C_M * uLight.x, C_N * uLight.y, C_C * uLight.z);
  float fy = 0.2 - H;

  // room planes
  float tF = rd.y < 0.0 ? (fy - ro.y) / rd.y : 1e9;
  float tL = rd.x < 0.0 ? (-W - ro.x) / rd.x : 1e9;
  float tR = rd.z < 0.0 ? (-W - ro.z) / rd.z : 1e9;
  float tw = min(tF, min(tL, tR));
  int id = tw == tF ? 2 : (tw == tL ? 1 : 0);

  vec3 col = vec3(0.0);

  // object
  vec3 oro = toObj(ro), ord = rd * uObjM;
  vec3 oh;
  float to = march(oro, ord, oh);
  float tObj = to * S;

  if (to > 0.0 && tObj < tw) {
    vec3 nO = objNormal(oh);
    vec3 N = uObjM * nO;
    vec3 P = ro + rd * tObj;
    float ao = 0.0;
    for (int i = 1; i <= 4; i++) {
      float h = 0.05 * float(i);
      ao += (h - obj(oh + nO * h)) / h * (1.0 / float(i));
    }
    ao = clamp(1.0 - 0.45 * ao, 0.3, 1.0);
    vec3 alb = vec3(0.78, 0.765, 0.74);
    vec3 V = -rd;
    for (int i = 0; i < 3; i++) {
      vec3 L = Ls[i];
      float nl = dot(N, L);
      if (nl <= 0.0) continue;
      float sh = shade(oh + nO * 0.01, L * uObjM, 12.0);
      vec3 Hh = normalize(L + V);
      float sp = pow(max(dot(N, Hh), 0.0), 48.0) * 0.35;
      col += Lc[i] * sh * (alb * nl + sp);
    }
    col += alb * (bounce(P, N) * 0.32 + vec3(0.018, 0.019, 0.022)) * ao;
  } else if (tw < 1e8) {
    vec3 P = ro + rd * tw;
    vec3 N = id == 0 ? vec3(0, 0, 1) : (id == 1 ? vec3(1, 0, 0) : vec3(0, 1, 0));
    vec2 uv = id == 0 ? P.xy : (id == 1 ? P.zy : P.xz);

    // plaster walls, concrete floor
    float n1 = fbm(uv * 0.9);
    float n2 = vnoise(uv * 11.0);
    vec3 alb = id == 2
      ? vec3(0.25, 0.245, 0.24) * (0.9 + 0.16 * n1 + 0.08 * n2 + 0.06 * step(0.93, hash12(floor(uv * 60.0))))
      : vec3(0.37, 0.365, 0.355) * (0.93 + 0.1 * n1 + 0.04 * n2);

    // corner occlusion from the two other planes
    float dF = P.y - fy, dL = P.x + W, dR = P.z + W;
    float ao = 1.0;
    if (id != 2) ao *= 1.0 - 0.55 * exp(-dF * 1.6);
    if (id != 1) ao *= 1.0 - 0.55 * exp(-dL * 1.6);
    if (id != 0) ao *= 1.0 - 0.55 * exp(-dR * 1.6);

    vec3 L = Ls[id];
    float k = uFx.x;
    float sh = shade(toObj(P), L * uObjM, k);
    float sc = id == 1 ? uFx.z : 1.0;
    float amp = id == 1 ? 1.0 / (sc * sc) : 1.0;
    float direct = pool(P, L, sc) * sh;
    col += Lc[id] * alb * direct * min(amp, 6.0);
    col += alb * (bounce(P, N) * 0.6 + vec3(0.016, 0.017, 0.02) * (0.6 + 0.4 * smoothstep(4.0, -2.0, P.y))) * ao;
  }

  col *= uFx.y;
  col = aces(col * 1.15);
  col = pow(col, vec3(1.0 / 2.2));

  // vignette + text shield
  vec2 q = frag / uRes;
  col *= mix(0.62, 1.0, smoothstep(1.25, 0.35, length((q - 0.5) * vec2(1.15, 1.0)) * 1.6));
  float f = dot(ndc / vec2(uRes.x / uRes.y, 1.0), uShield.xy);
  col *= 1.0 - uShield.z * smoothstep(uShield.w, uShield.w + 0.8, f);

  // warm point (nocturne exit)
  if (uPoint.x > 0.0) {
    float d = length(frag - uRes * 0.5) / uRes.y;
    float r = max(uPoint.y, 1e-4);
    float core = smoothstep(r, r * 0.35, d);
    float halo = exp(-d / (r * 2.2)) * 0.55 + exp(-d / (r * 9.0)) * 0.12;
    col += uPoint.x * (vec3(1.0, 0.86, 0.66) * core + vec3(1.0, 0.55, 0.22) * halo);
  }

  // grain
  float g = hash12(frag + fract(uTime * 13.7) * 431.0) - 0.5;
  col += g * uFx.w;

  // ink soaking outward from the C shadow (codex exit)
  if (uInk >= 0.0) {
    float tFl = rd.y < -0.0001 ? (fy - ro.y) / rd.y : -1.0;
    float dI;
    if (tFl > 0.0) {
      vec3 Pf = ro + rd * tFl;
      float gd = gC(vec2(Pf.x - O.x, -(Pf.z - O.z)) / S) * S;
      dI = max(gd, 0.0) / (tFl * uLens.x * 2.0) + min(gd, 0.0) * 0.05;
    } else dI = 1.4 + rd.y * 2.0;
    vec2 sp = frag / uRes.y;
    // paper fibres: thin ridges along three directions that the ink wicks along
    float fib = 0.0;
    fib = max(fib, pow(1.0 - abs(2.0 * vnoise(mat2(0.9, 0.44, -0.44, 0.9) * sp * vec2(70.0, 5.0)) - 1.0), 10.0));
    fib = max(fib, pow(1.0 - abs(2.0 * vnoise(mat2(0.3, -0.95, 0.95, 0.3) * sp * vec2(60.0, 4.0) + 7.3) - 1.0), 10.0));
    fib = max(fib, pow(1.0 - abs(2.0 * vnoise(mat2(-0.7, 0.7, -0.7, -0.7) * sp * vec2(80.0, 5.0) + 3.1) - 1.0), 10.0));
    float lobes = fbm(sp * 3.2 + 1.7) - 0.5;
    float grain = vnoise(sp * 140.0) - 0.5;
    float reach = 0.03 + 0.06 * min(uInk, 1.0);
    float x = dI - uInk + lobes * (0.05 + 0.3 * min(uInk, 1.0)) - fib * reach + grain * 0.008;
    float m = smoothstep(0.003, -0.003, x);
    float halo = smoothstep(0.05 + reach, 0.0, x) * (1.0 - m);
    float rim = smoothstep(0.025, 0.0, -x) * m;
    vec3 ink = vec3(28.0, 26.0, 25.0) / 255.0;
    col = mix(col, col * 0.55 + ink * 0.25, halo * 0.75);
    col = mix(col, mix(ink, vec3(0.055, 0.05, 0.058), rim * 0.6), m);
  }

  fragColor = vec4(col, 1.0);
}
`;
