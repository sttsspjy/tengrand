// Nocturne world: three fragment programs (one per scene, built from one source with SCENE) on one
// upward journey through a night. Each draw renders one scene with its camera; while two scenes blend,
// the second draw is alpha-blended over the first.
//   city   (SCENE 0) — towers on a grid traced by 2D DDA + per-cell box; procedural windows with
//                       curtains/TVs/switching, roof skylights, street lamps, car lights, height fog,
//                       the ALIVE district, the lantern field and the sky above the city.
//   storm  (SCENE 1) — the base of a storm cloud: soft volume march lit from below by the city and
//                       from inside by lightning; spider lightning across the base.
//   above  (SCENE 2) — moonlit / dawn sea of clouds: billow heightfield with a thin volume skin,
//                       cumulus towers as small volumes, a gap onto the city; constellations.
// Every scene returns colour + sky transmittance; the visitor's lantern and the post grade are shared.

export const VERT = /* glsl */ `#version 300 es
layout(location=0) in vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG_SRC = /* glsl */ `#version 300 es
precision highp float;
precision highp int;
out vec4 outColor;

uniform sampler2D uNoise;
uniform vec2 uRes;
uniform float uTime;
uniform vec4 uCamP;   // pos, focal
uniform vec4 uCamR;   // yaw, pitch, roll
uniform vec4 uSky;    // stars, milky way, dawn, blue hour
uniform vec4 uSky2;   // city glow, storm dark, moon intensity, sun intensity
uniform vec4 uMoon;   // dir, angular radius
uniform vec4 uSun;    // dir, angular radius
uniform vec4 uCity;   // pLit, word progress, dim, fog gain
uniform vec4 uWord;   // i0, j0, mode, unused
uniform vec4 uTrail[8]; // x, z, t0, amp
uniform vec4 uArr;    // wave radius, lantern exposure, flare, active
uniform vec4 uArrP;   // wave origin
uniform vec4 uLanF;   // band lo, band hi, rise, amount
uniform vec4 uLan0;   // visitor's lantern for this draw: pos, half height
uniform vec4 uLanI;   // intensity, unused, field breath, hold
uniform vec4 uStorm;  // flash, bolt x, bolt z, seed
uniform vec4 uStorm2; // city glow under the cloud, ambient, unused, unused
uniform vec4 uAbove;  // emergence vapour, city glow under the tear, strata, thunderheads
uniform vec4 uCS[64]; // constellation stars: x, y, mag, k
uniform vec4 uCL[64]; // constellation segments: a, b, order, k
uniform vec4 uCR[4];  // ranges: starStart, starCount, segStart, segCount
uniform vec4 uCC[4];  // az, el, unused, draw progress
uniform vec4 uCH[4];  // hover, visibility, unused, unused
uniform vec4 uPost;   // exposure, vignette, grain, white flash
uniform vec2 uPtr;

#define PI 3.14159265
// Always 0 at runtime; stops ANGLE/FXC from unrolling loops (multi-second link times otherwise).
#define ZERO min(int(uTime), 0)

float PIX; // angular size of one pixel for the current camera

/* ---------- hashing / noise ---------- */
uint pcg(uint v){
  uint s = v * 747796405u + 2891336453u;
  uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
float sq(float x){ return x * x; }
float hu(uint v){ return float(pcg(v)) * (1.0 / 4294967296.0); }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }

// value noise from a 256^2 random texture (G channel = R shifted by (37,17) for the 3D lookup)
float n2(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return textureLod(uNoise, (i + f + 0.5) / 256.0, 0.0).x;
}
float n3(vec3 p){
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  vec2 uv = (i.xy + vec2(37.0, 17.0) * i.z) + f.xy;
  vec2 rg = textureLod(uNoise, (uv + 0.5) / 256.0, 0.0).yx;
  return mix(rg.x, rg.y, f.z);
}
float fbm3(vec3 p){
  float s = 0.0, a = 0.5;
  for (int i = ZERO; i < 4; i++) { s += a * n3(p); p = p * 2.02 + vec3(1.7, 9.2, 4.1); a *= 0.5; }
  return s;
}

struct Cam { vec3 o; vec3 f; vec3 r; vec3 u; float F; };
Cam mkCam(vec4 P, vec4 R){
  Cam c;
  float cy = cos(R.x), sy = sin(R.x), cp = cos(R.y), sp = sin(R.y);
  c.f = vec3(sy * cp, sp, cy * cp);
  vec3 r0 = vec3(cy, 0.0, -sy);
  vec3 u0 = cross(c.f, r0);
  float cr = cos(R.z), sr = sin(R.z);
  c.r = r0 * cr + u0 * sr;
  c.u = u0 * cr - r0 * sr;
  c.o = P.xyz;
  c.F = P.w;
  return c;
}

const vec3 SODIUM = vec3(1.0, 0.5, 0.18);
const vec3 LANTERN = vec3(1.0, 0.5, 0.17);

/* =========================== SKY =========================== */

vec3 starLayer(vec3 d, float sc, float thr, float gain){
  vec3 p = d * sc;
  vec3 id = floor(p);
  uint k = pcg(uint(id.x + 4096.0) * 73856093u ^ uint(id.y + 4096.0) * 19349663u ^ uint(id.z + 4096.0) * 83492791u);
  float h = hu(k);
  if (h > thr) return vec3(0.0);
  vec3 j = vec3(hu(k ^ 1u), hu(k ^ 2u), hu(k ^ 3u)) * 0.4 + 0.3;
  vec3 v = (id + j) - p;
  v -= d * dot(v, d);
  float dd = length(v);
  float sig = max(PIX * sc * 0.8, 0.05);
  float m = pow(hu(k ^ 4u), 5.0) * 3.2 + 0.12;
  float tw = 0.72 + 0.28 * sin(uTime * (1.3 + 4.0 * hu(k ^ 5u)) + h * 60.0);
  vec3 col = mix(vec3(0.68, 0.8, 1.0), vec3(1.0, 0.84, 0.66), hu(k ^ 6u));
  return col * exp(-dd * dd / (sig * sig)) * (0.0025 / (sig * sig)) * m * tw * gain;
}

vec3 skyGrad(vec3 d){
  float el = d.y;
  float e = clamp(el, 0.0, 1.0);
  vec3 zen = mix(vec3(0.0022, 0.0045, 0.013), vec3(0.008, 0.02, 0.06), uSky.w);
  vec3 hor = mix(vec3(0.011, 0.018, 0.036), vec3(0.03, 0.05, 0.1), uSky.w);
  vec3 c = mix(hor, zen, pow(e, 0.42));
  // moon-side brightening
  float md = max(dot(d, uMoon.xyz), 0.0);
  c += vec3(0.05, 0.07, 0.12) * uSky2.z * (pow(md, 6.0) * 0.12 + pow(md, 60.0) * 0.25);
  // city light pollution at the horizon
  c += vec3(0.3, 0.13, 0.05) * uSky2.x * (exp(-max(el, 0.0) * 9.0) * 0.16 + exp(-max(el, 0.0) * 2.5) * 0.02);
  float dawn = uSky.z;
  if (dawn > 0.001) {
    vec3 s = uSun.xyz;
    float sd = max(dot(d, s), 0.0);
    float sh = max(dot(normalize(vec3(d.x, 0.0, d.z) + 1e-5), normalize(vec3(s.x, 0.0, s.z) + 1e-5)), 0.0);
    vec3 dz = mix(vec3(0.012, 0.024, 0.085), vec3(0.035, 0.075, 0.21), dawn);
    vec3 dh = mix(vec3(0.16, 0.06, 0.1), vec3(0.75, 0.3, 0.12), dawn) * mix(0.25, 1.0, sq(sh));
    float hb = exp(-max(el, 0.0) * mix(9.0, 6.0, dawn));
    vec3 dc = mix(dz, dh, hb);
    dc += vec3(0.7, 0.2, 0.3) * exp(-abs(el - 0.13) * 8.0) * 0.14 * dawn * (0.45 + 0.55 * sh);
    dc += vec3(1.0, 0.5, 0.2) * (pow(sd, 12.0) * 0.3 + pow(sd, 90.0) * 1.0) * dawn;
    c = mix(c, dc, smoothstep(0.0, 0.7, dawn));
  }
  return c;
}

vec3 skyFull(vec3 d){
  vec3 c = skyGrad(d);
  float night = 1.0 - smoothstep(0.2, 0.9, uSky.z);
  if (d.y > -0.05 && night > 0.0) {
    float hz = smoothstep(-0.05, 0.12, d.y);
    // milky way: band around a great circle, 3D-noise structure and a dark rift
    if (uSky.y > 0.001) {
      vec3 N = normalize(vec3(-0.5, 0.45, 0.74));
      float b = dot(d, N);
      float band = exp(-b * b * 22.0);
      if (band > 0.004) {
        vec3 gc = normalize(vec3(0.55, 0.62, 0.1));
        float core = pow(max(dot(normalize(d - N * b), gc), 0.0), 3.0);
        float cl = fbm3(d * 7.0);
        float rift = smoothstep(0.42, 0.7, fbm3(d * 13.0 + 4.0)) * exp(-b * b * 160.0);
        vec3 mw = mix(vec3(0.42, 0.55, 0.95), vec3(1.0, 0.78, 0.58), core * 0.8);
        float k = band * (0.25 + 1.1 * cl * cl) * (0.5 + 1.6 * core) * (1.0 - 0.85 * rift);
        c += mw * k * uSky.y * 0.075 * hz;
        c += starLayer(d, 340.0, 0.22 * band, 0.5) * uSky.y * hz;
      }
    }
    float st = uSky.x * night * hz;
    if (st > 0.001) {
      c += starLayer(d, 120.0, 0.07, 1.0) * st;
      c += starLayer(d, 230.0, 0.1, 0.45) * st;
    }
  }
  // moon
  if (uSky2.z > 0.001) {
    float md = dot(d, uMoon.xyz);
    float ang = acos(clamp(md, -1.0, 1.0));
    float R = uMoon.w;
    if (ang < R * 3.0) {
      vec3 mr = normalize(cross(vec3(0.0, 1.0, 0.0), uMoon.xyz));
      vec3 mu = cross(uMoon.xyz, mr);
      vec2 lc = vec2(dot(d, mr), dot(d, mu)) / R;
      float maria = 0.72 + 0.28 * smoothstep(0.3, 0.7, n2(lc * 2.3 + 3.0) * 0.6 + n2(lc * 5.0) * 0.4);
      float limb = sqrt(max(1.0 - dot(lc, lc), 0.0));
      float disc = smoothstep(R, R - PIX * 1.5, ang);
      c = mix(c, vec3(1.0, 0.95, 0.86) * maria * (0.6 + 0.4 * limb) * 2.6 * uSky2.z, disc * smoothstep(0.0, 0.3, uSky2.z));
    }
    c += vec3(0.55, 0.65, 0.9) * uSky2.z * (exp(-ang * 22.0) * 0.12 + exp(-ang * 5.0) * 0.025);
  }
  // sun
  if (uSky2.w > 0.001) {
    float ang = acos(clamp(dot(d, uSun.xyz), -1.0, 1.0));
    c += vec3(1.0, 0.72, 0.42) * smoothstep(uSun.w, uSun.w - PIX * 1.5, ang) * 7.0 * uSky2.w;
    c += vec3(1.0, 0.55, 0.25) * uSky2.w * (exp(-ang * 18.0) * 0.45 + exp(-ang * 4.0) * 0.05);
  }
  c *= 1.0 - 0.9 * uSky2.y;
  return c;
}

vec3 pointLight(vec3 p, vec3 n, vec4 lan, float I){
  vec3 lv = lan.xyz - p;
  float d2 = dot(lv, lv);
  return LANTERN * I * 5.0 * max(dot(n, lv) * inversesqrt(d2 + 1e-4), 0.0) / (1.0 + d2 * 0.35);
}

/* =========================== CITY =========================== */
#if SCENE == 0

const float CS = 24.0;
const float FH = 3.0;
const float BW = 2.9;
const float HMAX = 152.0;
const int GLY[5] = int[5](11245, 18727, 29847, 23402, 31143);

struct Tw { vec2 c; vec2 hs; float h; int kind; uint k; };

int wordBit(ivec2 id){
  int lx = id.x - int(uWord.x);
  int j0 = int(uWord.y);
  if (uWord.z < 1.5) {
    int row = j0 + 4 - id.y;
    if (lx < 0 || lx > 18 || row < 0 || row > 4) return -1;
    int L = lx / 4;
    int c = lx - L * 4;
    if (c == 3) return 0;
    return (GLY[L] >> ((4 - row) * 3 + (2 - c))) & 1;
  }
  // two lines: ALI / VE (second line indented two cells)
  int ra = j0 + 10 - id.y;
  if (lx < 0 || lx > 10 || ra < 0 || ra > 10) return -1;
  int line = ra / 6;
  int r = ra - line * 6;
  if (r == 5) return 0;
  int lx2 = lx - line * 2;
  if (lx2 < 0) return 0;
  int L = lx2 / 4;
  int c = lx2 - L * 4;
  L += line * 3;
  if (c == 3 || L > 4 || (line == 0 && L > 2)) return 0;
  return (GLY[L] >> ((4 - r) * 3 + (2 - c))) & 1;
}

// low-rise district around the word so its roofs read from straight above
bool wordZone(ivec2 id){
  int lx = id.x - int(uWord.x), ly = id.y - int(uWord.y);
  return uWord.z < 1.5 ? (lx >= -2 && lx <= 20 && ly >= -2 && ly <= 6) : (lx >= -2 && lx <= 12 && ly >= -2 && ly <= 12);
}

Tw tower(ivec2 id){
  uint k = pcg(uint(id.x + 4096) * 65599u + uint(id.y + 4096));
  float a = hu(k), b = hu(k ^ 0x9e3779b9u), c = hu(k ^ 0x85ebca6bu), e = hu(k ^ 0xc2b2ae35u);
  int wb = wordBit(id);
  bool route = (id.x == -1 || id.x == 0) && id.y >= -3 && id.y <= 4;
  float fl = 16.0 + floor(pow(a, 1.3) * 28.0);
  if (route) fl = 37.0 + floor(a * 11.0);
  if (wb >= 0 || wordZone(id)) fl = 8.0 + floor(a * 3.0);
  Tw t;
  t.h = fl * FH + 1.5;
  t.hs = vec2(6.4 + 1.8 * b, 6.4 + 1.8 * c);
  vec2 o = (vec2(e, a) - 0.5) * 2.2;
  if (route) { t.hs = vec2(7.4 + 0.3 * b, 9.6); o = vec2(id.x == 0 ? 4.0 : -4.0, (e - 0.5) * 1.6); }
  if (!route && wb < 0 && e < 0.06) t.h = 0.0;
  t.c = (vec2(id) + 0.5) * CS + o;
  t.kind = wb;
  t.k = k;
  return t;
}

// t > 0 hit (tw.h < 0 marks the street), -1 sky, -2 ran out of steps
float traceCity(vec3 ro, vec3 rd, out vec3 nrm, out Tw tw){
  nrm = vec3(0.0, 1.0, 0.0);
  tw = Tw(vec2(0.0), vec2(0.0), -1.0, -1, 0u);
  float t = 0.0;
  if (ro.y > HMAX) {
    if (rd.y >= 0.0) return -1.0;
    t = (ro.y - HMAX) / -rd.y;
    if (t > 2200.0) return -2.0;
  }
  vec2 p = ro.xz + rd.xz * t;
  ivec2 c = ivec2(floor(p / CS));
  vec2 dxz = vec2(abs(rd.x) < 1e-6 ? 1e-6 : rd.x, abs(rd.z) < 1e-6 ? 1e-6 : rd.z);
  ivec2 st = ivec2(dxz.x > 0.0 ? 1 : -1, dxz.y > 0.0 ? 1 : -1);
  vec2 tm = ((vec2(c) + vec2(st.x > 0 ? 1.0 : 0.0, st.y > 0 ? 1.0 : 0.0)) * CS - ro.xz) / dxz;
  vec2 td = CS / abs(dxz);
  vec3 inv = 1.0 / vec3(dxz.x, abs(rd.y) < 1e-6 ? 1e-6 : rd.y, dxz.y);
  for (int i = ZERO; i < 100; i++) {
    Tw T = tower(c);
    if (T.h > 0.0) {
      vec3 mn = vec3(T.c.x - T.hs.x, 0.0, T.c.y - T.hs.y);
      vec3 mx = vec3(T.c.x + T.hs.x, T.h, T.c.y + T.hs.y);
      vec3 t1 = (mn - ro) * inv, t2 = (mx - ro) * inv;
      vec3 a = min(t1, t2), b = max(t1, t2);
      float tn = max(max(a.x, a.y), a.z);
      float tf = min(min(b.x, b.y), b.z);
      if (tn <= tf && tn > 0.0) {
        if (tn == a.x) nrm = vec3(-sign(rd.x), 0.0, 0.0);
        else if (tn == a.y) nrm = vec3(0.0, -sign(rd.y), 0.0);
        else nrm = vec3(0.0, 0.0, -sign(rd.z));
        tw = T;
        return tn;
      }
    }
    float tex = min(tm.x, tm.y);
    if (rd.y < 0.0) {
      float tg = -ro.y / rd.y;
      if (tg < tex) { nrm = vec3(0.0, 1.0, 0.0); return tg; }
    } else if (ro.y + rd.y * tex > HMAX) return -1.0;
    if (tm.x < tm.y) { tm.x += td.x; c.x += st.x; } else { tm.y += td.y; c.y += st.y; }
  }
  return -2.0;
}

float wordOn(Tw T){
  float th = hu(T.k ^ 0x4d2u) * 0.62;
  return smoothstep(th, th + 0.2, uCity.y);
}

// probability that a light at world position wp is on
float litProb(vec3 wp, Tw T){
  float p = uCity.x * (1.0 - uCity.z * 0.88);
  if (T.kind == 1) p = mix(p, 0.9, wordOn(T));
  float boost = 0.0;
  for (int k = ZERO; k < 8; k++) {
    vec4 R = uTrail[k];
    if (R.w <= 0.0) continue;
    float age = uTime - R.z;
    if (age < 0.0 || age > 16.0) continue;
    vec2 d = wp.xz - R.xy;
    float rad = 22.0 + 26.0 * min(age, 1.2);
    boost += R.w * exp(-dot(d, d) / (rad * rad)) * smoothstep(0.0, 0.6, age) * exp(-age * 0.2);
  }
  p += min(boost, 0.6);
  if (uArr.w > 0.5) p *= step(length(wp - uArrP.xyz), uArr.x);
  return p;
}

vec3 skyAmbient(){
  return mix(vec3(0.006, 0.011, 0.024), vec3(0.016, 0.03, 0.065), uSky.w);
}

vec3 shadeTower(vec3 p, vec3 n, Tw T, vec3 rd, float t, vec4 lan, float lanI){
  float fw = t * PIX;
  vec3 amb = skyAmbient();
  if (n.y > 0.5) {
    // roof: parapet, skylight panels (lit by pointer / word), aviation light
    vec2 rl = p.xz - T.c;
    vec2 ed = T.hs - abs(rl);
    float edge = min(ed.x, ed.y);
    float par = smoothstep(0.55 + fw, 0.45, edge);
    vec2 g = (rl + T.hs) / 1.7;
    vec2 gi = floor(g), gf = fract(g);
    float fwg = fw / 1.7;
    float pan = smoothstep(0.2 - fwg, 0.2 + fwg, gf.x) * smoothstep(0.8 + fwg, 0.8 - fwg, gf.x)
              * smoothstep(0.2 - fwg, 0.2 + fwg, gf.y) * smoothstep(0.8 + fwg, 0.8 - fwg, gf.y);
    uint rid = pcg(T.k + uint(gi.x) * 31u + uint(gi.y) * 977u + 5u);
    float pr = max(litProb(vec3(p.x, T.h, p.z), T) - uCity.x * (1.0 - uCity.z * 0.88), 0.0) * 0.8;
    float on = step(hu(rid), pr);
    float far = smoothstep(0.3, 0.9, fwg);
    float word = T.kind == 1 ? wordOn(T) : 0.0;
    vec3 warm = mix(vec3(1.0, 0.6, 0.3), vec3(1.0, 0.75, 0.5), hu(rid ^ 9u));
    vec3 em = warm * mix(on * pan, min(pr, 1.0) * 0.36, far) * 1.3;
    em += vec3(1.0, 0.5, 0.2) * word * (0.62 + 0.38 * pan) * smoothstep(0.0, 1.2, edge) * 1.9;
    vec3 base = vec3(0.07, 0.072, 0.08) * (amb * 3.0 + SODIUM * 0.02) * (1.0 + par * 1.5);
    base += pointLight(p, n, lan, lanI) * 0.1;
    vec3 col = base + em * (1.0 - par * 0.8);
    if (T.h > 100.0) {
      vec2 cd = abs(rl) - (T.hs - 0.9);
      float blink = step(0.55, fract(uTime * 0.45 + hu(T.k ^ 0x77u)));
      col += vec3(1.0, 0.06, 0.02) * 40.0 * smoothstep(0.45 + fw * 0.6, 0.0, length(cd)) * blink;
    }
    return col;
  }
  bool xf = abs(n.x) > 0.5;
  float u = xf ? p.z - T.c.y : p.x - T.c.x;
  float L = xf ? T.hs.y : T.hs.x;
  uint face = xf ? (n.x > 0.0 ? 0u : 1u) : (n.z > 0.0 ? 2u : 3u);
  float nb = max(1.0, floor(2.0 * L / BW));
  float bw = 2.0 * L / nb;
  float bu = (u + L) / bw;
  float bi = clamp(floor(bu), 0.0, nb - 1.0);
  float fu = bu - bi;
  float fy = p.y / FH;
  float fl = floor(fy);
  float fv = fy - fl;
  float floors = floor((T.h - 1.5) / FH);
  float ang = max(abs(dot(rd, n)), 0.18);
  float fwu = fw / (bw * ang);
  float fwv = fw / (FH * ang);
  // bay rhythm: two wide balcony bays, then a narrow window
  float bt = mod(bi + float(T.k & 3u), 3.0);
  bool wide = bt < 1.5;
  float u0 = wide ? (bt < 0.5 ? 0.1 : 0.0) : 0.3;
  float u1 = wide ? (bt < 0.5 ? 1.0 : 0.9) : 0.7;
  float v0 = 0.28, v1 = 0.88;
  float wx = smoothstep(u0 - fwu, u0 + fwu, fu) * (1.0 - smoothstep(u1 - fwu, u1 + fwu, fu));
  float wy = smoothstep(v0 - fwv, v0 + fwv, fv) * (1.0 - smoothstep(v1 - fwv, v1 + fwv, fv));
  float hasWin = step(1.0, fl) * step(fl, floors - 1.0);
  float win = wx * wy * hasWin;
  float far = smoothstep(0.25, 0.85, max(fwu, fwv));

  // a wide window spans two bays: one id per window
  float wbi = wide ? bi - (bt < 0.5 ? 0.0 : 1.0) : bi;
  uint wid = pcg(T.k + face * 7919u + uint(fl) * 104729u + uint(wbi + 1.0) * 15485863u);
  float wcu = wide ? (bt < 0.5 ? bi + 1.0 : bi) : bi + 0.5;
  float wc = T.c.x - L + wcu * bw;
  float wcz = T.c.y - L + wcu * bw;
  vec3 wp = vec3(xf ? p.x : wc, (fl + 0.58) * FH, xf ? wcz : p.z);
  float pl = litProb(wp, T);
  float per = 22.0 + 70.0 * hu(wid ^ 0x51u);
  float ep = floor(uTime / per + hu(wid ^ 0x77u));
  float lit = step(hu(wid + uint(ep) * 2654435761u), pl);

  float ts = hu(wid ^ 0x1234u);
  vec3 tint = ts < 0.46 ? vec3(1.0, 0.52, 0.22) : ts < 0.74 ? vec3(1.0, 0.68, 0.4) : ts < 0.9 ? vec3(0.82, 0.88, 1.0) : vec3(0.3, 0.46, 1.0);
  float br = 0.35 + 1.0 * hu(wid ^ 0x99u);
  if (ts >= 0.9) br *= 0.4 + 0.6 * n2(vec2(uTime * 7.0, float(wid & 1023u)));
  // position across the whole window (0..1) for curtains / lamps
  float wu = wide ? clamp((bt < 0.5 ? fu - 0.1 : fu + 1.0) / 1.9, 0.0, 1.0) : (fu - 0.3) / 0.4;
  float wv = (fv - v0) / (v1 - v0);
  float cs = hu(wid ^ 0xabcu);
  float pat = 1.0;
  if (cs < 0.4) {
    // drawn curtains glowing warm, with a bright gap
    float gap = 0.25 + 0.5 * hu(wid ^ 0xdefu);
    pat = mix(0.38, 1.35, smoothstep(0.06 + fwu, 0.0, abs(wu - gap)));
    tint = mix(tint, vec3(1.0, 0.45, 0.16), 0.35);
  } else if (cs < 0.58) {
    pat = mix(0.55 + 0.45 * step(0.45, fract(wv * 11.0)), 0.78, smoothstep(0.015, 0.05, fwv));
  } else {
    // bare room: a lamp somewhere, darker furniture low
    float lx = hu(wid ^ 0x3c3u);
    pat = 0.55 + 0.9 * exp(-(sq(wu - lx) * 18.0 + sq(wv - 0.75) * 10.0));
    pat *= mix(0.45, 1.0, smoothstep(0.15, 0.4, wv));
  }
  pat *= mix(0.75, 1.1, wv);
  // balcony: frosted lower panel and a sliding-door mullion on wide windows
  if (wide) {
    pat *= mix(0.42, 1.0, smoothstep(0.3 - fwv * 2.0, 0.3 + fwv * 2.0, wv));
    pat *= 1.0 - 0.75 * smoothstep(0.02 + fwu, 0.0, abs(fu - (bt < 0.5 ? 1.0 : 0.0))) * (1.0 - far);
  }
  vec3 em = tint * br * pat * 2.2;
  if (uArr.w > 0.5) em *= 1.0 + 5.0 * exp(-abs(uArr.x - length(wp - uArrP.xyz)) * 0.09);
  vec3 meanEm = vec3(1.0, 0.58, 0.3) * min(pl, 1.0) * 0.45 * 0.75;
  vec3 winEm = mix(em * lit * win, meanEm, far);

  // walls: painted concrete, slab bands, sky + street + window spill + lantern
  float alb = 0.2 + 0.12 * hu(T.k ^ 0x3u);
  vec3 wt = mix(vec3(1.0, 0.94, 0.86), vec3(0.86, 0.92, 1.0), hu(T.k ^ 0x5u));
  float band = smoothstep(0.09 + fwv, 0.0, abs(fv - 0.12)) * (1.0 - far);
  float frame = (1.0 - far) * hasWin * max(
      smoothstep(0.035 + fwu, 0.0, min(abs(fu - u0), abs(fu - u1))) * step(v0 - 0.03, fv) * step(fv, v1 + 0.03),
      smoothstep(0.03 + fwv, 0.0, min(abs(fv - v0), abs(fv - v1))) * step(u0 - 0.02, fu) * step(fu, u1 + 0.02));
  vec2 dr = vec2(max(max(u0 - fu, fu - u1), 0.0) * bw, max(max(v0 - fv, fv - v1), 0.0) * FH);
  float spill = lit * hasWin * exp(-length(dr) * 2.4) * br * (1.0 - far) + far * min(pl, 1.0) * 0.08;
  vec3 light = amb * (1.0 + band * 1.5 + frame * 1.2) + SODIUM * 0.18 * exp(-p.y / 10.0) + tint * spill * 0.5;
  light += vec3(0.5, 0.6, 0.85) * max(dot(n, uMoon.xyz), 0.0) * 0.03 * uSky2.z;
  light += pointLight(p, n, lan, lanI);
  light *= mix(0.4, 1.0, smoothstep(0.0, 26.0, p.y));
  vec3 wall = alb * wt * light;
  float fres = 0.04 + 0.96 * pow(1.0 - ang, 5.0);
  float refl = 0.6 + 0.8 * n2(vec2(wp.x + wp.z, wp.y) * 0.21 + float(face));
  vec3 glass = vec3(0.003, 0.005, 0.009) + amb * fres * 1.6 * refl + vec3(0.03, 0.016, 0.008) * refl * (1.0 - wv) * 0.35 + pointLight(p, n, lan, lanI) * 0.04;
  float wm = mix(win, 0.45, far);
  return mix(wall, glass, wm * (1.0 - lit * (1.0 - far))) + winEm;
}

vec3 shadeGround(vec3 p, vec3 rd, float t, vec4 lan, float lanI){
  float fw = t * PIX;
  vec2 cf = fract(p.xz / CS) * CS;
  vec2 sd = min(cf, CS - cf); // distance to street centre lines
  vec2 lz = vec2(sd.x - 3.4, mod(p.z, 18.0) - 9.0);
  vec2 lx = vec2(sd.y - 3.4, mod(p.x, 18.0) - 9.0);
  float pool = exp(-dot(lz, lz) / 26.0) + exp(-dot(lx, lx) / 26.0);
  vec3 col = vec3(0.035) * (skyAmbient() * 2.0 + SODIUM * (0.05 + pool * 0.9));
  // lane markings
  col += vec3(0.02) * smoothstep(0.12 + fw, 0.0, min(sd.x, sd.y)) * step(0.5, fract(p.z * 0.25));
  // car lights along streets in z: right lane +z, left lane -z
  float sx = p.x - floor(p.x / CS + 0.5) * CS;
  float lane = sign(sx);
  float along = p.z * lane - uTime * 9.0;
  float seg = floor(along / 34.0);
  float f = along - seg * 34.0;
  uint ck = pcg(uint(seg + 50000.0) * 3u + (lane > 0.0 ? 1u : 0u) + uint(floor(p.x / CS + 0.5) + 500.0) * 101u);
  if (hu(ck) < 0.45 && abs(abs(sx) - 1.8) < 1.6) {
    float sp = max(0.45, fw);
    float head = exp(-sq((f - 17.0) / (sp * 2.5))) * exp(-sq((abs(sx) - 1.8) / sp));
    float tail = exp(-sq((f - 21.5) / (sp * 2.0))) * exp(-sq((abs(sx) - 1.8) / sp));
    float k = min(1.0, 0.45 / sp);
    col += (vec3(1.0, 0.88, 0.7) * head * 5.0 + vec3(1.0, 0.07, 0.03) * tail * 3.5) * k;
    col += vec3(1.0, 0.85, 0.6) * exp(-abs(f - 11.0) * 0.25) * exp(-sq((abs(sx) - 1.8) / 1.4)) * step(f, 17.0) * 0.06;
  }
  col += pointLight(p, vec3(0.0, 1.0, 0.0), lan, lanI) * 0.035;
  return col;
}

// the city past the traced range: a carpet of window lights on a plane at roof height
vec3 cityCarpet(vec3 ro, vec3 rd, out float t){
  t = rd.y < -1e-4 ? (ro.y - 60.0) / -rd.y : 1e5;
  t = min(t, 1e5);
  vec3 p = ro + rd * t;
  float fw = t * PIX / max(-rd.y, 0.04);
  vec2 g = p.xz / 3.0;
  vec2 gi = floor(g), gf = fract(g) - 0.5;
  uint k = pcg(uint(gi.x + 1e5) * 7919u + uint(gi.y + 1e5));
  vec2 cf = fract(p.xz / CS);
  float block = step(0.17, cf.x) * step(cf.x, 0.83) * step(0.17, cf.y) * step(cf.y, 0.83);
  float pl = uCity.x * (1.0 - uCity.z * 0.88);
  float on = step(hu(k), pl * 0.8) * block;
  float dotm = exp(-dot(gf, gf) * 18.0);
  float far = smoothstep(0.4, 1.5, fw / 3.0);
  vec3 tint = hu(k ^ 7u) < 0.8 ? vec3(1.0, 0.58, 0.28) : vec3(0.75, 0.85, 1.0);
  vec3 c = mix(tint * on * dotm * 2.2, vec3(1.0, 0.58, 0.3) * pl * 0.25, far);
  vec2 sd = min(cf, 1.0 - cf);
  c += SODIUM * 0.2 * smoothstep(0.05, 0.0, min(sd.x, sd.y)) * (1.0 - far);
  return c;
}

vec3 renderCity(vec3 ro, vec3 rd, vec4 lan, float lanI, out float T, out float tHit){
  vec3 n;
  Tw tw;
  float t = traceCity(ro, rd, n, tw);
  vec3 col = vec3(0.0);
  float tf;
  T = 0.0;
  if (t > 0.0) {
    vec3 p = ro + rd * t;
    if (tw.h < 0.0) col = shadeGround(p, rd, t, lan, lanI);
    else col = shadeTower(p, n, tw, rd, t, lan, lanI);
    tHit = t;
    tf = t;
  } else if (t < -1.5) {
    float tc;
    col = cityCarpet(ro, rd, tc);
    tHit = tc;
    tf = tc;
  } else {
    tHit = 1e6;
    tf = 1e6;
    T = 1.0;
  }
  // height fog: integral of a*exp(-b*y) along the ray
  float fa = 0.0075 * uWord.w, fb = 0.011;
  float kk = fb * rd.y;
  float tt = min(tf, 8000.0);
  float fi = abs(kk) < 1e-5 ? tt : (1.0 - exp(-kk * tt)) / kk;
  float fog = fa * exp(-fb * ro.y) * fi;
  float ft = exp(-fog);
  float yh = mix(ro.y + rd.y * min(tt, 240.0) * 0.5, ro.y + rd.y * min(tt, 9000.0), smoothstep(150.0, 400.0, ro.y));
  vec3 fc = mix(vec3(0.075, 0.04, 0.022), vec3(0.012, 0.02, 0.042), smoothstep(6.0, 120.0, yh)) * uCity.w;
  col = col * ft + fc * (1.0 - ft);
  T *= ft;
  return col;
}

#endif

/* ---------- lanterns ---------- */
// One paper sky-lantern in billboard units (y up, body -1..1). side: 1 seen from the side, 0 from
// straight below/above. Returns emission.
vec3 lanternShape(vec2 lp, float pw, float side, float fromBelow){
  float y01 = clamp(lp.y * 0.5 + 0.5, 0.0, 1.0);
  float hw = (0.5 + 0.2 * y01 + 0.09 * sin(PI * y01)) * (1.0 - 0.32 * smoothstep(0.88, 1.0, y01));
  float body = smoothstep(hw + pw, hw - pw, abs(lp.x)) * smoothstep(-1.0 - pw, -1.0 + pw, lp.y) * smoothstep(1.0 + pw, 1.0 - pw, lp.y);
  float rib = 1.0 - 0.24 * smoothstep(0.05 + pw, 0.0, abs(abs(lp.x) - hw * 0.52)) * (1.0 - smoothstep(0.1, 0.3, pw));
  float glow = mix(1.45, 0.42, y01) * (0.7 + 0.3 * cos(lp.x / hw * 1.5)) * rib;
  float flame = exp(-(lp.x * lp.x * 10.0 + sq(lp.y + 0.8) * 16.0));
  vec3 sideC = body * (LANTERN * 2.1 * glow + vec3(1.0, 0.8, 0.48) * flame * 5.0);
  float r = max(abs(lp.x), abs(lp.y)) * 0.85 + length(lp) * 0.15;
  float rim = smoothstep(0.8 + pw, 0.76 - pw, r);
  vec3 botC = LANTERN * rim * mix(1.0, 2.3, fromBelow) * (0.6 + 0.6 * smoothstep(0.8, 0.0, r)) + vec3(1.0, 0.84, 0.52) * exp(-dot(lp, lp) * 14.0) * 6.0 * fromBelow;
  return mix(botC, sideC, side);
}

#if SCENE == 0
// many lanterns rising over the city (city coordinates): 3D DDA through jittered cells
vec3 lanternField(vec3 ro, vec3 rd, float tMax){
  float y0 = uLanF.x, y1 = uLanF.y;
  float ta, tb;
  if (abs(rd.y) < 1e-4) {
    if (ro.y < y0 || ro.y > y1) return vec3(0.0);
    ta = 0.0;
    tb = tMax;
  } else {
    float t0 = (y0 - ro.y) / rd.y, t1 = (y1 - ro.y) / rd.y;
    ta = max(min(t0, t1), 0.0);
    tb = min(max(t0, t1), tMax);
  }
  tb = min(tb, 1100.0);
  if (ta >= tb) return vec3(0.0);
  const float LC = 30.0;
  const float S = 0.85; // lantern half height
  vec3 o = ro;
  o.y -= uLanF.z;
  vec3 p = o + rd * ta;
  vec3 cell = floor(p / LC);
  vec3 rr = vec3(abs(rd.x) < 1e-5 ? 1e-5 : rd.x, abs(rd.y) < 1e-5 ? 1e-5 : rd.y, abs(rd.z) < 1e-5 ? 1e-5 : rd.z);
  vec3 st = sign(rr);
  vec3 tm = ((cell + max(st, 0.0)) * LC - o) / rr;
  vec3 td = LC / abs(rr);
  vec3 up = vec3(0.0, 1.0, 0.0) - rd * rd.y;
  float ul = length(up);
  up = ul > 1e-3 ? up / ul : vec3(0.0, 0.0, 1.0);
  vec3 rt = cross(rd, up);
  float side = smoothstep(0.25, 0.7, ul);
  float fromBelow = step(0.0, rd.y);
  vec3 acc = vec3(0.0);
  float t = ta;
  for (int i = ZERO; i < 40; i++) {
    if (t > tb) break;
    uint k = pcg(uint(cell.x + 4096.0) * 73u + pcg(uint(cell.y + 4096.0) * 151u + pcg(uint(cell.z + 4096.0))));
    float h = hu(k);
    if (h < mix(0.5, 0.16, smoothstep(30.0, 420.0, t))) {
      vec3 jit = vec3(hu(k ^ 1u), hu(k ^ 2u), hu(k ^ 3u)) - 0.5;
      vec3 c = (cell + 0.5 + jit * 0.5) * LC + vec3(sin(uTime * 0.31 + h * 20.0), 0.0, cos(uTime * 0.27 + h * 13.0)) * 1.6;
      vec3 w = c - o;
      float tc = dot(w, rd);
      if (tc > 1.0 && tc < tMax) {
        vec3 q = w - rd * tc;
        vec2 lp = vec2(dot(-q, rt), dot(-q, up)) / S;
        float pw = tc * PIX / S;
        float ll = length(lp);
        float ph = 0.6 + 0.4 * sin(uTime * 1.366 + h * 1.4);
        float lit = mix(1.0, ph, uLanI.z) * (0.5 + 0.8 * hu(k ^ 4u)) * exp(-tc * 0.0021);
        vec3 e = vec3(0.0);
        if (pw > 0.5) {
          // smaller than a pixel: an energy-preserving warm point
          float sg = pw * 1.2;
          e = LANTERN * 1.6 * exp(-ll * ll / (sg * sg)) * min(1.0, 0.35 / (sg * sg)) + LANTERN * exp(-ll / (sg * 3.0)) * 0.02;
        } else if (ll < 5.0) {
          e = lanternShape(lp, pw, side, fromBelow) + LANTERN * (exp(-ll * 1.3) * 0.16 + exp(-ll * 0.45) * 0.02);
        }
        acc += e * lit;
      }
    }
    if (tm.x < tm.y && tm.x < tm.z) { t = tm.x; tm.x += td.x; cell.x += st.x; }
    else if (tm.y < tm.z) { t = tm.y; tm.y += td.y; cell.y += st.y; }
    else { t = tm.z; tm.z += td.z; cell.z += st.z; }
  }
  return acc * uLanF.w * (1.0 + uLanI.w * 0.9);
}

#endif

/* ---------- the visitor's lantern ---------- */
vec3 heroLantern(Cam c, vec3 rd, vec2 uv, vec4 L, float I, float tMax){
  if (I <= 0.001) return vec3(0.0);
  vec3 w = L.xyz - c.o;
  float tc = dot(w, rd);
  vec3 col = vec3(0.0);
  float zf = dot(w, c.f);
  if (zf > 0.05) {
    // screen-space streak + flare around its projection
    vec2 sp = vec2(dot(w, c.r), dot(w, c.u)) / zf * c.F;
    vec2 dv = uv - sp;
    float vis = zf < tMax ? 1.0 : 0.25;
    float streak = exp(-abs(dv.y) * 160.0) * exp(-abs(dv.x) * 3.0);
    col += vec3(1.0, 0.55, 0.22) * I * vis * (streak * 0.05 + exp(-length(dv) * 9.0) * 0.05);
  }
  if (tc <= 0.0) return col;
  vec3 q = w - rd * tc;
  vec3 up = vec3(0.0, 1.0, 0.0) - rd * rd.y;
  float ul = length(up);
  up = ul > 1e-3 ? up / ul : vec3(0.0, 0.0, 1.0);
  vec3 rt = cross(rd, up);
  float s = L.w;
  vec2 lp = vec2(dot(-q, rt), dot(-q, up)) / s;
  float pw = tc * PIX / s;
  float ll = length(lp);
  vec3 bodyC = lanternShape(lp, max(pw, 0.004), smoothstep(0.25, 0.7, ul), step(0.0, rd.y));
  float halo = exp(-ll * 1.1) * 0.2 + exp(-ll * 0.22) * 0.022;
  vec3 lc = bodyC * (tc < tMax ? 1.0 : 0.0) + LANTERN * halo * (tc < tMax ? 1.0 : 0.35);
  return col + lc * I;
}

/* =========================== STORM =========================== */
#if SCENE == 1

float baseH(vec2 p){
  vec2 q = p * 0.011 + vec2(0.0, uTime * 0.006);
  float n = n2(q) * 0.6 + n2(q * 2.1 + 3.1) * 0.4;
  return -26.0 * n;
}

// spider lightning crawling across the cloud base: noisy branches out from the strike point
vec3 bolt(vec3 ro, vec3 rd, float tMax){
  if (uStorm.x < 0.02 || rd.y <= 0.02 || ro.y > -16.0) return vec3(0.0);
  float t = (-16.0 - ro.y) / rd.y;
  vec2 q = ro.xz + rd.xz * t - uStorm.yz;
  float sd = uStorm.w;
  float w = max(0.7, t * PIX * 1.3);
  float core = 0.0, glow = 0.0;
  for (int k = ZERO; k < 5; k++) {
    float fk = float(k);
    float an = sd * 1.7 + fk * 1.2566 + (n2(vec2(sd, fk * 3.1)) - 0.5) * 0.9;
    vec2 dir = vec2(cos(an), sin(an));
    float s = dot(q, dir);
    float L = 90.0 + 120.0 * n2(vec2(fk * 5.3, sd));
    if (s < 0.0 || s > L) continue;
    float d = dot(q, vec2(-dir.y, dir.x));
    float off = (n2(vec2(s * 0.014, sd + fk * 7.0)) - 0.5) * 70.0 * (s / L + 0.2) + (n2(vec2(s * 0.06, sd + fk * 11.0)) - 0.5) * 14.0 + (n2(vec2(s * 0.25, sd + fk)) - 0.5) * 3.0;
    float dd = abs(d - off);
    float fade = sqrt(1.0 - s / L);
    core += exp(-dd * dd / (w * w)) * min(1.0, 1.5 / w) * fade;
    glow += exp(-dd / 12.0) * fade;
    // a fork leaving the branch past its middle
    float s2 = s - L * 0.45;
    if (s2 > 0.0) {
      float off2 = off + s2 * (0.5 + 0.4 * sin(sd + fk)) + (n2(vec2(s * 0.08, sd + fk * 13.0)) - 0.5) * 10.0;
      float d2 = abs(d - off2);
      core += exp(-d2 * d2 / (w * w)) * min(1.0, 0.9 / w) * fade * (1.0 - s2 / (L * 0.55));
    }
  }
  float occ = t < tMax + 30.0 ? 1.0 : 0.25;
  return vec3(0.8, 0.82, 1.0) * (core * 22.0 + glow * 0.5) * uStorm.x * occ;
}

vec3 renderStorm(vec3 ro, vec3 rd, out float T, out float tHit){
  T = 0.0;
  tHit = 1e6;
  vec3 fp = vec3(uStorm.y, 16.0, uStorm.z);
  vec3 cityG = vec3(0.024, 0.011, 0.008) * uStorm2.x;
  vec3 ambC = vec3(0.008, 0.008, 0.026) * uStorm2.y;
  vec3 fl = vec3(0.68, 0.7, 1.0) * uStorm.x;
  // entry into the cloud layer: analytic hit with the lowest extent, then march the soft base
  float t0 = 0.0;
  bool hit = ro.y > -2.0;
  if (!hit && rd.y > 0.02) {
    float t = max(0.0, (-30.0 - ro.y) / rd.y);
    for (int i = ZERO; i < 32; i++) {
      vec3 p = ro + rd * t;
      float d = baseH(p.xz) - p.y;
      if (d < 0.5 || p.y > 0.0) { hit = true; break; }
      t += max(d * 0.6, 0.3 + t * 0.003);
      if (t > 3000.0) break;
    }
    t0 = t;
  }
  vec3 col = vec3(0.0);
  float Tr = 1.0;
  if (hit) {
    // volume march: soft billows lit from below by the city and from inside by lightning
    float t = t0;
    float tOpaque = 1e5;
    float dt = ro.y > -2.0 ? 1.4 : 2.2 + t0 * 0.01;
    for (int i = ZERO; i < 22; i++) {
      vec3 p = ro + rd * t;
      float bh = baseH(p.xz);
      float depth = p.y - bh;
      float inL = smoothstep(-2.0, 4.0, depth) * (1.0 - smoothstep(58.0, 74.0, p.y));
      float n = n3(p * 0.035 + vec3(0.0, -uTime * 0.9, uTime * 0.1)) * 0.62 + n3(p * 0.11 + vec3(7.0, -uTime * 1.6, 7.0)) * 0.38;
      float dens = inL * (0.008 + 0.5 * smoothstep(0.5, 0.82, n));
      if (dens > 0.001) {
        vec3 Lc = ambC * (0.4 + 1.2 * n) + cityG * exp(-max(depth, 0.0) * 0.22) * (0.3 + 1.4 * n * n);
        // moonlight leaking down through the top of the cloud
        Lc += vec3(0.07, 0.085, 0.13) * smoothstep(8.0, 72.0, p.y) * (0.5 + n);
        float fdd = length(p - fp);
        Lc += fl * (4.5 / (1.0 + fdd * fdd * 0.0032)) * (0.08 + 0.92 * n * n);
        // the lantern glowing in the vapour around it
        vec3 lq = p - uLan0.xyz;
        Lc += LANTERN * uLanI.x * 0.5 / (1.0 + dot(lq, lq) * 0.12);
        col += Tr * dens * dt * Lc;
        Tr *= exp(-dens * dt);
        if (tOpaque > 1e4 && Tr < 0.35) tOpaque = t;
        if (Tr < 0.02) break;
      }
      t += dt;
      dt *= 1.17;
    }
    tHit = max(t0 + 2.0, tOpaque);
    col += Tr * (ambC * 0.4 + fl * 0.04);
  } else {
    // below the base looking down / sideways: rain haze over the faint city
    float down = clamp(-rd.y, 0.0, 1.0);
    col = cityG * (0.15 + 0.4 * down) + ambC * 0.5 + fl * 0.04;
  }
  // rain haze between the camera and the base
  float hz = 1.0 - exp(-t0 * 0.0016);
  col = mix(col, ambC * 1.3 + cityG * 0.1 + fl * 0.03, hz);
  col += bolt(ro, rd, tHit);
  return col;
}

#endif

/* =========================== ABOVE THE CLOUDS =========================== */
#if SCENE == 2

const mat2 M2 = mat2(0.8, -0.6, 0.6, 0.8);
// the tear in the deck (centre xz, half width, half length) and the canyon centre line
const vec4 TEAR = vec4(1150.0, 450.0, 70.0, 230.0);
float canyonZ(float x){ return -30.0 + 15.0 * sin(x * 0.004); }
const float CURV = 60000.0; // exaggerated planet radius: the deck curves away under a high camera

// Flat-topped stratocumulus deck: billows compressed at the top, a gentle swell, the canyon walls and
// the tear onto the city.
float cloudH(vec2 p, int oct){
  vec2 q = p * 0.011 + vec2(uTime * 0.004, 0.0);
  float h = 0.0, a = 1.0, s = 0.0;
  for (int i = ZERO; i < 6; i++) {
    if (i >= oct) break;
    float nn = n2(q);
    h += a * mix(abs(2.0 * nn - 1.0), nn, 0.4);
    s += a;
    q = M2 * q * 2.07 + 1.7;
    a *= 0.5;
  }
  h /= s;
  float y = 14.0 * (1.0 - exp(-h * 1.6)) - 5.0 + 5.0 * (n2(p * 0.0011 + 3.0) - 0.5);
  float dz = abs(p.y - canyonZ(p.x)) - 58.0;
  float wall = exp(-dz * dz / 700.0) * smoothstep(-120.0, 0.0, p.x) * (1.0 - smoothstep(560.0, 720.0, p.x));
  if (wall > 0.01) {
    float hb = abs(2.0 * n2(p * 0.035 + 2.0) - 1.0) * 0.6 + abs(2.0 * n2(p * 0.08 + 5.0) - 1.0) * 0.4;
    y += wall * 22.0 * (0.45 + 0.4 * h + 0.45 * hb);
  }
  vec2 tq = (p - TEAR.xy) / TEAR.zw;
  tq.x += 0.3 * sin(tq.y * 2.6);
  float tr = dot(tq, tq) * (0.75 + 0.55 * n2(p * 0.02 + 9.0));
  if (tr < 4.0) y -= 95.0 * exp(-tr * tr * 1.4);
  return y;
}

// the city far below the tear: blocks of lit windows and sodium streets, softened by haze
vec3 belowCity(vec3 ro, vec3 rd){
  float t = (ro.y + 1100.0) / max(-rd.y, 0.05);
  vec3 p = ro + rd * t;
  float fw = t * PIX;
  float district = smoothstep(0.25, 0.75, n2(p.xz * 0.004 + 3.0));
  vec2 cf = fract(p.xz / 48.0) - 0.5;
  float street = exp(-min(abs(cf.x), abs(cf.y)) * 48.0 / max(1.5, fw * 0.7)) * (0.4 + 0.6 * district);
  vec2 g = p.xz / 6.0;
  vec2 gi = floor(g), gf = fract(g) - 0.5;
  uint k = pcg(uint(gi.x + 1e5) * 7919u + uint(gi.y + 1e5));
  float sz = max(0.12, fw / 6.0);
  float on = step(hu(k), 0.06 + 0.22 * district);
  vec3 tint = hu(k ^ 7u) < 0.82 ? vec3(1.0, 0.55, 0.22) : vec3(0.75, 0.85, 1.0);
  vec3 c = tint * on * exp(-dot(gf, gf) / (sz * sz)) * min(1.0, 0.03 / (sz * sz)) * 3.0;
  c += SODIUM * street * 0.12 + vec3(0.06, 0.03, 0.016) * district;
  return c * uAbove.y;
}

vec3 cloudLight(){ return mix(vec3(0.6, 0.7, 0.95) * uSky2.z * 0.55, vec3(1.0, 0.52, 0.26) * 1.25 * max(uSky2.w, 0.25), uSky.z); }
vec3 cloudL(){ return normalize(mix(uMoon.xyz, uSun.xyz, smoothstep(0.0, 0.6, uSky.z))); }

// Distant cumulonimbus as small volumes: a broad tower that spreads into a sheared anvil, noise-displaced,
// lit by the moon with a silver rim; the first is lit from inside by lightning. Premultiplied rgb + coverage.
const vec4 CB[3] = vec4[3](vec4(16000.0, 7000.0, 6500.0, 4200.0), vec4(-12000.0, 12000.0, 5200.0, 3600.0),
                           vec4(19000.0, -10000.0, 7000.0, 4600.0));
float cbShape(vec3 l, float k, float sh){
  // l: (x across, y up 0..1 of height, z) in tower radii / heights
  float r = length(l.xz);
  float anvil = smoothstep(0.76, 0.9, l.y);
  float rad = 0.38 + 0.1 * l.y + 0.12 * smoothstep(0.5, 0.0, l.y);
  // anvil: a thin flat sheet sheared downwind
  vec2 ac = vec2(sh * 1.5, 0.0) * anvil;
  float ra = length((l.xz - ac) * vec2(0.8, 1.25)) - (rad + 1.0 * anvil);
  float col = max(r - rad, -l.y);
  float d = mix(col, ra, anvil);
  d = max(d, l.y - 1.0 - 0.05 * exp(-r * r * 10.0));
  return d;
}
vec4 thunderheads(vec3 ro, vec3 rd, float tMax, vec3 L, vec3 lc, vec3 amb, vec3 hazeC){
  vec4 acc = vec4(0.0);
  float fwd = pow(max(dot(rd, L), 0.0), 10.0);
  for (int k = ZERO; k < 3; k++) {
    vec4 C = CB[k];
    float sh = k == 1 ? -1.0 : 1.0;
    vec3 sc = vec3(C.w, C.z, C.w);
    vec3 base = vec3(C.x, -0.25 * C.z, C.y);
    // bounding box in tower units
    vec3 bmin = vec3(-2.9, 0.0, -2.0), bmax = vec3(2.9, 1.2, 2.0);
    vec3 o = (ro - base) / sc, d = rd / sc;
    vec3 inv = 1.0 / d;
    vec3 t1 = (bmin - o) * inv, t2 = (bmax - o) * inv;
    vec3 tn3 = min(t1, t2), tf3 = max(t1, t2);
    float ta = max(max(max(tn3.x, tn3.y), tn3.z), 0.0);
    float tb = min(min(min(tf3.x, tf3.y), tf3.z), tMax);
    if (ta >= tb) continue;
    float dt = (tb - ta) / 44.0;
    float t = ta + dt * (0.25 + 0.5 * hash12(gl_FragCoord.xy + float(k) * 13.0));
    float fo = min(1.0 - exp(-ta * 0.00004), 0.42);
    float Tr = 1.0;
    vec3 cacc = vec3(0.0);
    float fl = 0.0;
    vec3 sp = vec3(0.0);
    if (k == 0) {
      fl = step(0.84, hu(uint(floor(uTime * 9.0)))) * step(0.5, hu(uint(floor(uTime * 1.3)) + 77u));
      sp = vec3(-0.3 + 0.6 * hu(uint(floor(uTime * 1.3)) + 5u), 0.35 + 0.35 * hu(uint(floor(uTime * 1.3)) + 9u), 0.0);
    }
    for (int i = ZERO; i < 44; i++) {
      vec3 p = ro + rd * t;
      vec3 l = (p - base) / sc;
      l.y = (p.y - base.y + 0.3 * dot(p.xz - ro.xz, p.xz - ro.xz) / (2.0 * CURV)) / sc.y;
      vec3 q = vec3(l.x * 1.0, l.y * 1.8, l.z * 1.0) + float(k) * 11.0;
      float nz = n3(q) * 0.5 + n3(q * 2.3 + 4.0) * 0.3 + n3(q * 6.0 + 9.0) * 0.2;
      float sd = cbShape(l, float(k), sh) - (nz - 0.5) * (0.36 + 0.2 * l.y);
      float dens = smoothstep(0.02, -0.07, sd) * 0.0032 * 1500.0 / C.w;
      if (dens > 0.0) {
        float deep = smoothstep(0.0, -0.4, sd);
        // self-shadow: three steps toward the light through the bare shape
        vec3 Ll = normalize(L / sc);
        float occ = 0.0;
        for (int j = ZERO; j < 3; j++) {
          float sj = 0.08 * pow(2.6, float(j));
          occ += smoothstep(0.1, -0.2, cbShape(l + Ll * sj, float(k), sh)) * sj;
        }
        float lit = exp(-occ * 4.0) * (0.55 + 0.9 * nz);
        float fringe = smoothstep(-0.07, 0.0, sd);
        vec3 Ls = lc * (lit * 1.1 + fwd * fringe * 3.0) + amb * (0.12 + 0.3 * clamp(l.y, 0.0, 1.0)) * (1.0 - 0.6 * deep);
        Ls *= mix(0.4, 1.0, smoothstep(0.0, 0.5, l.y));
        if (k == 0) Ls += vec3(0.72, 0.7, 1.0) * fl * exp(-length((l - sp) * vec3(1.3, 2.4, 1.3)) * 2.6) * 3.0;
        cacc += Tr * dens * dt * Ls;
        Tr *= exp(-dens * dt);
        if (Tr < 0.03) break;
      }
      t += dt;
    }
    float a = 1.0 - Tr;
    if (a < 0.002) continue;
    cacc = mix(cacc, hazeC * 0.7 * a, fo);
    acc.rgb += (1.0 - acc.a) * cacc;
    acc.a += (1.0 - acc.a) * a;
  }
  return acc;
}

// thin translucent strata above the deck (shot e) and the shafts of moonlight between them
float strataD(vec2 p, float k){
  // streaky stratus: stretched along x, soft-edged
  vec2 q = p * vec2(0.0022, 0.0075);
  float n = n2(q + k * 3.1) * 0.55 + n2(q * 2.7 + k) * 0.3 + n2(p * 0.03 + k * 2.0) * 0.15;
  return smoothstep(0.32, 0.86, n);
}

vec3 renderAbove(vec3 ro, vec3 rd, vec4 lan, float lanI, out float T, out float tHit){
  const float TOP = 52.0;
  T = 0.0;
  tHit = 1e6;
  float t = 0.0, tp = 0.0;
  bool sky = false, below = false, hit = false;
  float mn = 1e9, tm = 0.0; // closest miss (clearance / distance) and where
  if (ro.y > TOP) {
    if (rd.y >= 0.0) sky = true;
    else t = (ro.y - TOP) / -rd.y;
  }
  if (!sky) {
    for (int i = ZERO; i < 110; i++) {
      vec3 p = ro + rd * t;
      float cd = t * length(rd.xz);
      float drop = cd * cd / (2.0 * CURV);
      if (p.y + drop < -46.0) { below = true; break; }
      float d = p.y + drop - cloudH(p.xz, 3);
      if (d < 0.0015 * t + 0.02) { hit = true; break; }
      float k = d / (t + 2.0);
      if (k < mn) { mn = k; tm = t; }
      if (t > 9000.0 || (rd.y > 0.0 && p.y > TOP)) break;
      tp = t;
      t += max(d * 0.55, 0.05 + t * 0.003);
    }
    if (hit) {
      // refine the crossing so steep cloud walls do not band
      float a = tp, b = t;
      for (int j = ZERO; j < 5; j++) {
        float m = 0.5 * (a + b);
        vec3 q = ro + rd * m;
        float cd = m * length(rd.xz);
        if (q.y + cd * cd / (2.0 * CURV) - cloudH(q.xz, 3) < 0.0) b = m; else a = m;
      }
      t = b;
    }
    sky = !hit && !below;
  }
  vec3 L = cloudL();
  vec3 lc = cloudLight();
  vec3 hazeC = skyGrad(normalize(vec3(rd.x, max(rd.y, 0.0) * 0.4 + 0.02, rd.z))) * 0.95;
  vec3 skyAmb = mix(vec3(0.02, 0.034, 0.078), vec3(0.13, 0.12, 0.26), uSky.z);
  float edgeA = sky && mn < 0.012 ? 1.0 : 0.0;
  vec3 col = vec3(0.0);
  if (below) {
    col = belowCity(ro, rd);
    tHit = t;
  } else if (hit || edgeA > 0.0) {
    float ts = hit ? t : tm;
    vec3 p = ro + rd * ts;
    float e = 0.8 + ts * 0.003;
    float hc = cloudH(p.xz, 5);
    float hx = cloudH(p.xz + vec2(e, 0.0), 5);
    float hz = cloudH(p.xz + vec2(0.0, e), 5);
    vec3 n = normalize(vec3(hc - hx, e, hc - hz));
    float sh = 1.0;
    float st = 3.0;
    for (int i = ZERO; i < 6; i++) {
      vec3 q = p + L * st;
      float d = q.y - cloudH(q.xz, 3);
      sh = min(sh, clamp(d / (st * 0.25) + 0.4, 0.0, 1.0));
      st *= 2.0;
    }
    float dif = clamp((dot(n, L) + 0.4) / 1.4, 0.0, 1.0);
    float hf = smoothstep(-6.0, 12.0, hc);
    float shd = mix(0.28, 1.0, sh);
    vec3 amb = skyAmb * (0.5 + 0.5 * hf) * (0.65 + 0.35 * n.y);
    float rl = dot(rd, L);
    float fwd = pow(max(rl, 0.0), 5.0);
    // silver lining on the edges, and the moon glade: a sharp forward-scatter lobe across the tops
    float glade = pow(max(rl, 0.0), 60.0) * (0.35 + 0.65 * n.y) + pow(max(rl, 0.0), 14.0) * 0.18;
    vec3 Ls0 = lc * (dif * shd * 0.85 + 0.1 * hf * (1.0 - dif) * shd + fwd * (1.0 - abs(n.y) * 0.6) * 1.0 * shd + glade * 3.4 * shd);
    float tv = max(ts - 5.0, 0.0);
    float dtv = 1.3 + ts * 0.0025;
    vec3 acc = vec3(0.0);
    float Tr = 1.0;
    for (int j = ZERO; j < 8; j++) {
      vec3 q = ro + rd * tv;
      float dd = cloudH(q.xz, 3) - q.y;
      float nz = n3(q * 0.1 + vec3(0.0, uTime * 0.04, 0.0)) * 0.65 + n3(q * 0.26 + 3.0) * 0.35;
      float den = clamp(dd * 0.32 + (nz - 0.5) * 1.4 + 0.2, 0.0, 1.0) * 0.6;
      if (den > 0.001) {
        float inner = exp(-max(dd, 0.0) * 0.12);
        vec3 Lq = (Ls0 * inner + amb) * (0.72 + 0.56 * nz) * mix(0.3, 1.0, hf);
        acc += Tr * den * dtv * Lq;
        Tr *= exp(-den * dtv);
        if (Tr < 0.03) break;
      }
      tv += dtv;
    }
    col = acc + (hit ? Tr * amb * mix(0.3, 1.0, hf) * 0.8 : vec3(0.0));
    // the tear's walls glow from the city below
    vec2 tq = (p.xz - TEAR.xy) / TEAR.zw;
    col += vec3(0.5, 0.24, 0.1) * exp(-dot(tq, tq) * 0.7) * smoothstep(5.0, -40.0, p.y) * 0.35 * uAbove.y;
    col += pointLight(p, n, lan, lanI) * 0.3;
    float fo = 1.0 - exp(-ts * 0.00045);
    if (hit) {
      tHit = t;
      col = mix(col, hazeC, fo);
    } else {
      col = mix(col, hazeC * (1.0 - Tr), fo);
      T = Tr;
    }
  } else {
    T = 1.0;
  }
  // distant thunderheads standing on the deck (skills only)
  if (uAbove.w > 0.001) {
    vec4 cb = thunderheads(ro, rd, tHit, L, lc, skyAmb, hazeC) * uAbove.w;
    col = cb.rgb + (1.0 - cb.a) * col;
    T *= 1.0 - cb.a;
  }
  // strata sheets and moonbeams between them (crane shot)
  if (uAbove.z > 0.001) {
    float sa = 0.0;
    vec3 sc = vec3(0.0);
    for (int k = ZERO; k < 2; k++) {
      float hs = k == 0 ? 150.0 : 270.0;
      float ts = (hs - ro.y) / rd.y;
      if (ts <= 0.0 || ts > tHit || abs(rd.y) < 1e-3) continue;
      vec3 q = ro + rd * ts;
      float a = strataD(q.xz, float(k)) * 0.42 * uAbove.z * exp(-ts * 0.0006);
      vec3 c2 = rd.y < 0.0 ? lc * (0.55 + 0.3 * strataD(q.xz * 2.0, float(k) + 5.0)) + skyAmb : skyAmb * 1.4 + lc * pow(max(dot(rd, L), 0.0), 4.0) * 1.2;
      c2 = mix(c2, hazeC, 1.0 - exp(-ts * 0.0005));
      // nearer sheet first: composite the second behind the first when it is farther
      sc = sc + (1.0 - sa) * a * c2;
      sa = sa + (1.0 - sa) * a;
    }
    col = sc + (1.0 - sa) * col;
    T *= 1.0 - sa;
    float tm2 = min(tHit, 1400.0);
    float dt = tm2 / 12.0;
    float shaft = 0.0;
    float tt = dt * hash12(gl_FragCoord.xy);
    for (int i = ZERO; i < 12; i++) {
      vec3 q = ro + rd * tt;
      if (q.y > -5.0 && q.y < 270.0) {
        float Tl = 1.0;
        for (int k = ZERO; k < 2; k++) {
          float hs = k == 0 ? 150.0 : 270.0;
          if (hs > q.y) Tl *= 1.0 - 0.95 * smoothstep(0.2, 0.6, strataD((q + L * ((hs - q.y) / max(L.y, 0.05))).xz, float(k)));
        }
        shaft += clamp((Tl - 0.45) * 1.8, 0.0, 1.0) * dt;
      }
      tt += dt;
    }
    float ph = 0.06 + 2.2 * pow(max(dot(rd, L), 0.0), 8.0);
    col += lc * shaft * 0.0011 * ph * uAbove.z;
  }
  // emerging from the storm: streaming vapour with gaps
  if (uAbove.x > 0.001) {
    float wn = n3(rd * 3.0 + vec3(0.0, -uTime * 0.7, 0.0)) * 0.6 + n3(rd * 7.0 + vec3(0.0, -uTime * 1.3, 3.0)) * 0.4;
    float fa = clamp(uAbove.x * (0.55 + 0.9 * wn), 0.0, 1.0);
    vec3 fogc = (vec3(0.05, 0.06, 0.1) + lc * 0.24) * (0.7 + 0.6 * wn);
    col = mix(col, fogc, fa);
    T *= 1.0 - fa;
  }
  return col;
}

/* ---------- constellations ---------- */
vec3 constellations(vec3 d){
  vec3 acc = vec3(0.0);
  for (int k = ZERO; k < 4; k++) {
    vec4 C = uCC[k];
    float vis = uCH[k].y;
    if (vis <= 0.001) continue;
    float ca = cos(C.x), sa = sin(C.x), ce = cos(C.y), se = sin(C.y);
    vec3 F = vec3(sa * ce, se, ca * ce);
    float fd = dot(d, F);
    if (fd < 0.6) continue;
    vec3 R = vec3(ca, 0.0, -sa);
    vec3 U = cross(F, R);
    vec2 lp = vec2(dot(d, R), dot(d, U)) / fd;
    float pxl = PIX / (fd * fd);
    float hov = uCH[k].x;
    vec4 rg = uCR[k];
    float line = 0.0;
    int s0 = int(rg.z), sn = int(rg.w);
    for (int i = ZERO; i < 16; i++) {
      if (i >= sn) break;
      vec4 S = uCL[s0 + i];
      float f = clamp((C.w - S.z) / 0.38, 0.0, 1.0);
      if (f <= 0.0) continue;
      vec2 a = uCS[int(S.x)].xy, b = uCS[int(S.y)].xy;
      b = a + (b - a) * f;
      vec2 pa = lp - a, ba = b - a;
      float hh = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);
      float dl = length(pa - ba * hh);
      // keep the star centres clear of the line
      float gap = smoothstep(0.006, 0.014, length(lp - a)) * smoothstep(0.006, 0.014, length(lp - (a + ba)));
      float w = max(pxl * 0.8, 0.0011);
      line += (smoothstep(w * 1.6, 0.0, dl) * (0.0011 / w) * 1.1 + exp(-dl * 130.0) * 0.16 + exp(-dl * 28.0) * 0.025) * gap;
    }
    int t0 = int(rg.x), tn = int(rg.y);
    for (int i = ZERO; i < 18; i++) {
      if (i >= tn) break;
      vec4 S = uCS[t0 + i];
      vec2 dv = lp - S.xy;
      float dd = length(dv);
      if (dd > 0.09) continue;
      float mag = S.z * mix(0.35, 1.0, smoothstep(0.0, 0.3, C.w)) * (1.0 + hov * 0.8);
      float tw = 0.82 + 0.18 * sin(uTime * (1.7 + hov * 7.0 + float(i) * 0.37) + float(i) * 3.7);
      float sig = max(pxl * 1.0, 0.0032);
      float core = exp(-dd * dd / (sig * sig)) * (0.0032 * 0.0032) / (sig * sig);
      float glow = exp(-dd * 90.0) * 0.4 + exp(-dd * 26.0) * 0.07;
      float sp = (exp(-abs(dv.x) * 1100.0) * exp(-abs(dv.y) * 42.0) + exp(-abs(dv.y) * 1100.0) * exp(-abs(dv.x) * 42.0)) * smoothstep(0.95, 1.2, S.z);
      vec3 sc = mix(vec3(0.72, 0.84, 1.0), vec3(1.0, 0.86, 0.66), fract(float(i + k * 5) * 0.618));
      acc += sc * mag * tw * (core * 7.0 + glow + sp * 1.4) * vis;
    }
    acc += vec3(0.6, 0.74, 1.0) * line * (0.55 + hov * 0.7) * vis;
  }
  return acc;
}

#endif

vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }

/* =========================== MAIN =========================== */

void main(){
  vec2 frag = gl_FragCoord.xy;
  vec2 uv = (frag - 0.5 * uRes) / uRes.y;
  vec2 q = frag / uRes;
  Cam c = mkCam(uCamP, uCamR);
  vec4 lan = uLan0;
  float lanI = uLanI.x;
  vec3 rd = normalize(c.f * c.F + c.r * uv.x + c.u * uv.y);
  PIX = 1.0 / (uRes.y * c.F);
  float T, tHit;
#if SCENE == 0
  vec3 col = renderCity(c.o, rd, lan, lanI, T, tHit);
  if (T > 0.001) col += T * skyFull(rd);
  if (uLanF.w > 0.001) col += lanternField(c.o, rd, tHit);
#elif SCENE == 1
  vec3 col = renderStorm(c.o, rd, T, tHit);
#else
  vec3 col = renderAbove(c.o, rd, lan, lanI, T, tHit);
  if (T > 0.001) col += T * (skyFull(rd) + constellations(rd));
#endif
  vec3 lcol = heroLantern(c, rd, uv, lan, lanI, tHit);
  vec3 flare = vec3(0.0);
#if SCENE == 0
  if (uArr.z > 0.001) {
    // struck-match flare at the lantern (arrival), outside the scene exposure
    vec3 w = lan.xyz - c.o;
    float zf = dot(w, c.f);
    if (zf > 0.05) {
      vec2 dv = uv - vec2(dot(w, c.r), dot(w, c.u)) / zf * c.F;
      float r = length(dv);
      float streak = exp(-abs(dv.y) * 140.0) * exp(-abs(dv.x) * 2.2);
      float rays = pow(max(cos(atan(dv.y, dv.x) * 6.0), 0.0), 8.0) * exp(-r * 9.0);
      flare = vec3(1.0, 0.78, 0.5) * uArr.z * (exp(-r * 28.0) * 6.0 + exp(-r * 5.0) * 0.5 + streak * 1.6 + rays * 0.8);
    }
  }
#endif
  col = col * uPost.x + lcol * max(uPost.x, uArr.y) + flare;
  col += vec3(0.75, 0.75, 1.0) * uPost.w;
  col = aces(col);
  col = pow(col, vec3(1.0 / 2.2));
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, col * vec3(0.9, 0.98, 1.12), (1.0 - lum) * 0.3);
  vec2 vq = q - 0.5;
  col *= mix(1.0 - uPost.y, 1.0, smoothstep(0.95, 0.2, length(vq * vec2(1.0, 1.15))));
  float gr = hash12(frag + fract(uTime * 7.31) * 97.0) - 0.5;
  col += gr * uPost.z * (0.06 * (1.0 - lum) + 0.012);
  outColor = vec4(col, 1.0);
}
`;

/** Fragment source for one scene: 0 city, 1 storm, 2 above the clouds. */
export const fragFor = (scene: 0 | 1 | 2) => FRAG_SRC.replace("#version 300 es", `#version 300 es\n#define SCENE ${scene}`);
