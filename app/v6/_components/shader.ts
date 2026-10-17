// Nocturne II world: one fullscreen pass hosting three worlds.
//   night  — sea with analytic normals, a standing door of sodium light at a real distance, clouds,
//            god-rays, anamorphic streak, bioluminescent click ripples, a cursor-steered moon glitter.
//   noon   — salt flat (voronoi crust), six obsidian monoliths with hard sun shadows, mirage band,
//            heat shimmer; high-key monochrome.
//   dark   — darkroom: wall of safelights, developer bath (ripples, agitation), a door that opens
//            onto the night (rendered through a second camera).
// Transitions: whiteout (I->II), solarize + red bleed + crossfade (II->III), door (III->coda).

export const VERT = /* glsl */ `#version 300 es
layout(location=0) in vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }
`;

export const FRAG = /* glsl */ `#version 300 es
precision highp float;
out vec4 outColor;

uniform vec2 uRes;
uniform float uTime;
uniform vec4 uCamP;  // pos, focal
uniform vec4 uCamR;  // yaw, pitch, roll
uniform vec4 uCam2P;
uniform vec4 uCam2R;
uniform vec4 uW;     // weights: night, noon, dark
uniform vec4 uWC;    // 1 = world uses cam2: night, noon, dark
uniform vec4 uT;     // whiteout, solarize, bleed, cut flash
uniform vec4 uN1;    // doorX, doorZ, halfW, height
uniform vec4 uN2;    // intensity, fog, wave, warmth
uniform vec4 uN3;    // exposure, cloud, streak, moon
uniform vec4 uS1;    // sunAz, sunEl, exposure, hover slab
uniform vec4 uSlab[6];
uniform vec4 uD1;    // lamp spacing, flash, lamps on, agitation
uniform vec4 uD2;    // doorX, door halfW, door height, hover print
uniform vec4 uRip[6];
uniform vec2 uPtr;

#define PI 3.14159265
// Always 0 at runtime; stops ANGLE/FXC from unrolling loops (multi-second link times otherwise).
#define ZERO min(int(uTime), 0)
const vec2 RG[4] = vec2[4](vec2(0.125, 0.375), vec2(-0.375, 0.125), vec2(0.375, -0.125), vec2(-0.125, -0.375));

float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec2 hash2(vec2 p){ p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i), b = hash(i + vec2(1.0, 0.0)), c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p){
  float s = 0.0, a = 0.5;
  for (int i = ZERO; i < 4; i++) { s += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
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
vec3 camRay(Cam c, vec2 uv){ return normalize(c.f * c.F + c.r * uv.x + c.u * uv.y); }

// Expanding rings from clicks; returns surface gradient, glow = crest intensity. s scales world units.
vec2 ripples(vec2 p, float s, out float glow){
  vec2 g = vec2(0.0);
  glow = 0.0;
  for (int i = ZERO; i < 6; i++) {
    vec4 R = uRip[i];
    float age = uTime - R.z;
    if (R.w <= 0.0 || age < 0.0 || age > 8.0) continue;
    vec2 dp = (p - R.xy) * s;
    float d = length(dp) + 1e-3;
    float x = d - age * 2.4;
    float env = exp(-x * x * 0.3) * exp(-age * 0.45) * R.w / (1.0 + d * 0.12);
    g += dp / d * sin(x * 4.0) * env;
    glow += env * smoothstep(0.3, 1.0, cos(x * 4.0));
  }
  return g;
}

/* =========================== NIGHT =========================== */

vec3 LCOL;
float SYAW;
float PIX;

float relAz(vec3 d){
  float a = atan(d.x, d.z) - SYAW;
  return mod(a + PI, 2.0 * PI) - PI;
}

// Door of light standing on the sea at (uN1.x, 0, uN1.y): a vertical emissive rect facing -z.
vec3 doorLight(vec3 o, vec3 d, float widen){
  if (d.z < 1e-4) return vec3(0.0);
  float t = (uN1.y - o.z) / d.z;
  if (t <= 0.0) return vec3(0.0);
  vec3 h = o + d * t;
  float hw = uN1.z * widen, hh = uN1.w;
  float fp = t * PIX * 1.5;
  float w = max(hw, fp);
  float dx = abs(h.x - uN1.x);
  float core = smoothstep(w, w * 0.2, dx) * (hw / w);
  core *= smoothstep(hh, hh * 0.94, h.y) * smoothstep(-fp * 2.0, fp, h.y);
  float ax = max(dx - hw, 0.0) / t;
  float ay = max(abs(h.y - hh * 0.45) - hh * 0.3, 0.0) / t;
  float r = length(vec2(ax * 1.2, ay * 0.55));
  float halo = exp(-r * 26.0) * 0.8 + exp(-r * 7.0) * 0.16;
  return LCOL * (core * 16.0 + halo) * uN2.x;
}

// Blurred door for sea reflections: widened by a fixed blur instead of scaling the opening.
vec3 doorLightR(vec3 o, vec3 d){
  float hw0 = max(uN1.z, 1e-4);
  return doorLight(o, d, min(2.4, (hw0 + 0.25) / hw0)) * mix(1.0, 0.55, smoothstep(0.5, 3.0, hw0));
}

vec3 skyBase(float az, float el){
  float e = max(el, 0.0);
  vec3 zen = vec3(0.0018, 0.005, 0.0078);
  vec3 hor = vec3(0.012, 0.03, 0.04);
  vec3 c = mix(hor, zen, pow(smoothstep(0.0, 0.55, e), 0.55));
  float aa = abs(az);
  c += LCOL * uN2.x * (exp(-e * 30.0) * exp(-aa * 4.0) * 0.16 + exp(-e * 6.0) * exp(-aa * 1.6) * 0.012);
  return c;
}

vec3 nightSky(vec3 o, vec3 d){
  float az = relAz(d);
  float el = asin(clamp(d.y, -1.0, 1.0));
  vec3 c = skyBase(az, el);
  float e = max(d.y, 0.0);
  vec2 cp = d.xz / (e + 0.06) + o.xz * 0.025;
  float n = fbm(cp * 0.55 + vec2(uTime * 0.012, uTime * 0.004));
  float n2 = fbm(cp * 1.7 - vec2(uTime * 0.02, 0.0));
  float cl = smoothstep(0.42, 0.82, n * 0.75 + n2 * 0.35) * uN3.y * smoothstep(0.004, 0.06, e) * smoothstep(0.9, 0.2, e);
  float lit = exp(-abs(az) * 4.0) * exp(-e * 4.5);
  vec3 cc = mix(vec3(0.003, 0.008, 0.011), LCOL * 0.16 * uN2.x, lit);
  c = mix(c, cc, cl * 0.85);
  c += LCOL * uN2.x * lit * smoothstep(0.35, 0.5, n) * smoothstep(0.62, 0.5, n) * 0.08 * uN3.y;
  c += doorLight(o, d, 1.0) * (1.0 - cl * 0.7);
  return c;
}

vec3 seaNormal(vec2 p, vec2 wp, float foot, out float glow){
  vec2 g = vec2(0.0);
  float amp = 1.0, freq = 0.55, it = 0.0;
  float t = uTime * 0.9;
  for (int i = ZERO; i < 9; i++) {
    vec2 dir = vec2(sin(it), cos(it));
    float x = dot(dir, p) * freq + t * sqrt(freq) * 1.3;
    float w = exp(sin(x) - 1.0);
    float aa = smoothstep(1.0, 3.5, (6.2831 / freq) / foot);
    g += amp * w * cos(x) * freq * dir * aa;
    p -= dir * w * amp * 0.06;
    it += 1232.399963;
    amp *= 0.8;
    freq *= 1.21;
  }
  g *= 0.1 * uN2.z;
  g += ripples(wp, 1.0, glow) * 0.16;
  return normalize(vec3(-g.x, 1.0, -g.y));
}

vec3 lensTerms(vec2 sp, vec2 sc, float chroma){
  vec3 o = vec3(0.0);
  for (int k = ZERO; k < 3; k++) {
    float off = (float(k) - 1.0) * chroma;
    vec2 q = sp * (1.0 + off) - sc;
    float streak = exp(-abs(q.y) * 420.0) * exp(-abs(q.x) * 2.6);
    float bloom = exp(-length(q * vec2(1.0, 0.8)) * 9.0);
    o[k] = streak * 0.07 + bloom * 0.018;
  }
  return o;
}

vec3 renderNight(Cam c, vec2 uv){
  PIX = 1.0 / (uRes.y * c.F);
  vec3 rd = camRay(c, uv);
  vec3 ro = c.o;
  float warm = clamp(uN2.w, 0.0, 1.3);
  LCOL = mix(vec3(0.55, 0.66, 0.78), vec3(1.0, 0.36, 0.06), clamp(warm, 0.0, 1.0)) * (1.0 + max(warm - 1.0, 0.0));
  vec3 dc = vec3(uN1.x, uN1.w * 0.45, uN1.y) - ro;
  SYAW = atan(dc.x, dc.z);
  float az = relAz(rd);
  float el = asin(clamp(rd.y, -1.0, 1.0));

  // moon: a cool second light whose bearing follows the pointer
  float mAz = SYAW - 0.9 + uPtr.x * 0.7;
  vec3 moon = normalize(vec3(sin(mAz), 0.12, cos(mAz)));

  vec3 col;
  if (rd.y > 0.0) {
    col = nightSky(ro, rd);
    col += vec3(0.5, 0.6, 0.7) * exp(-length(rd - moon) * 40.0) * 0.04 * uN3.w;
  } else {
    float t = ro.y / -rd.y;
    vec3 p = ro + rd * t;
    float foot = t * 1.4 / (uRes.y * c.F * max(-rd.y, 0.02));
    float rg;
    vec3 n = seaNormal(p.xz + vec2(0.0, uTime * 0.25), p.xz, foot, rg);
    vec3 r = reflect(rd, n);
    r.y = abs(r.y);
    float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, -rd), 0.0), 5.0);
    float raz = relAz(r);
    float rel = asin(clamp(r.y, -1.0, 1.0));
    vec3 refl = skyBase(raz, rel) + doorLightR(p, r);
    refl += vec3(0.55, 0.68, 0.8) * pow(max(dot(r, moon), 0.0), 600.0) * 3.0 * uN3.w;
    vec3 body = vec3(0.0008, 0.0035, 0.0045) + LCOL * uN2.x * 0.006 * exp(-abs(az) * 2.0);
    col = mix(body, refl, fres);
    // bioluminescent crest on click ripples
    col += vec3(0.2, 0.9, 0.75) * rg * 0.06 * exp(-t * 0.03);
    vec3 fogc = skyBase(az, 0.0) * 0.9;
    col = mix(col, fogc, 1.0 - exp(-t * uN2.y));
    col += doorLight(ro, rd, 1.0);
  }

  // volumetric rays fanning from the door
  vec3 sdir = normalize(dc);
  float elC = asin(clamp(sdir.y, -1.0, 1.0));
  vec2 v = vec2(az, el - elC);
  float ang = atan(v.y, v.x);
  float rl = length(v);
  float rays = noise(vec2(ang * 7.0, uTime * 0.07)) * noise(vec2(ang * 19.0 + 3.0, uTime * 0.11));
  rays = pow(rays, 2.0) * exp(-rl * 4.0) * smoothstep(0.0, 0.06, rl);
  col += LCOL * rays * uN2.x * (0.02 + uN2.y * 0.6) * (1.0 + uN3.z);

  float sz = dot(sdir, c.f);
  vec2 sc = vec2(dot(sdir, c.r), dot(sdir, c.u)) / max(sz, 0.001) * c.F;
  float vis = smoothstep(0.0, 0.2, sz);
  float chroma = 0.006 * dot(uv, uv) * (1.0 + uN3.z * 2.0);
  float angW = min(uN1.z / max(length(dc), 1.0), 0.5);
  col += LCOL * lensTerms(uv, sc, chroma) * uN2.x * vis * (1.0 + angW * 20.0) * (1.0 + uN3.z);

  // light-speed streaks rushing out of the door during the crossing
  if (uN3.z > 0.01) {
    vec2 dv = uv - sc;
    float ra = atan(dv.y, dv.x);
    float rr = length(dv);
    float lines = pow(noise(vec2(ra * 70.0, rr * 2.0 - uTime * 3.0)), 8.0) + pow(noise(vec2(ra * 23.0 + 5.0, rr * 1.2 - uTime * 2.0)), 6.0) * 0.6;
    col += LCOL * lines * smoothstep(0.02, 0.5, rr) * uN3.z * uN3.z * 0.35 * vis;
  }

  col += vec3(0.0, 0.0022, 0.0032);
  col *= uN3.x;
  col = (col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14);
  col = clamp(col, 0.0, 1.0);
  return pow(col, vec3(1.0 / 2.2));
}

/* =========================== NOON =========================== */

vec3 SUN;

float EDGE; // bevel factor of the last slabHit (0 face .. 1 edge)

// Ray vs y-rotated monolith (proportions 4 : 9 : 1). Normal includes a narrow bevel so edges catch light.
float slabHit(vec3 ro, vec3 rd, vec4 S, out vec3 n){
  float c = cos(S.z), s = sin(S.z);
  vec3 o = ro - vec3(S.x, S.w * 0.5, S.y);
  vec3 lo = vec3(c * o.x - s * o.z, o.y, s * o.x + c * o.z);
  vec3 ld = vec3(c * rd.x - s * rd.z, rd.y, s * rd.x + c * rd.z);
  ld = mix(ld, vec3(1e-5), vec3(lessThan(abs(ld), vec3(1e-5))));
  vec3 hs = vec3(S.w * 0.2222, S.w * 0.5, S.w * 0.0556);
  vec3 m = 1.0 / ld;
  vec3 k = abs(m) * hs;
  vec3 t1 = -m * lo - k, t2 = -m * lo + k;
  float tN = max(max(t1.x, t1.y), t1.z);
  float tF = min(min(t2.x, t2.y), t2.z);
  if (tN > tF || tF < 0.0) return -1.0;
  vec3 ln = -sign(ld) * step(t1.yzx, t1.xyz) * step(t1.zxy, t1.xyz);
  vec3 lp = lo + ld * tN;
  float b = S.w * 0.014;
  vec3 e = clamp((abs(lp) - (hs - b)) / b, 0.0, 1.0) * (1.0 - abs(ln));
  e.y *= step(0.0, lp.y); // no bevel where the stone meets the salt
  EDGE = max(max(e.x, e.y), e.z);
  ln = normalize(ln + e * sign(lp) * 0.9);
  n = vec3(c * ln.x + s * ln.z, ln.y, -s * ln.x + c * ln.z);
  return tN;
}

float slabs(vec3 ro, vec3 rd, out vec3 n, out float id){
  float best = 1e9;
  float edge = 0.0;
  id = -1.0;
  for (int i = ZERO; i < 6; i++) {
    vec3 nn;
    float t = slabHit(ro, rd, uSlab[i], nn);
    if (t > 0.0 && t < best) { best = t; n = nn; id = float(i); edge = EDGE; }
  }
  EDGE = edge;
  return id < 0.0 ? -1.0 : best;
}

float shadowed(vec3 p){
  for (int i = ZERO; i < 6; i++) {
    vec3 nn;
    if (slabHit(p, SUN, uSlab[i], nn) > 0.0) return 1.0;
  }
  return 0.0;
}

// Ambient occlusion on the salt around each monolith's footprint.
float groundAO(vec2 p){
  float ao = 1.0;
  for (int i = ZERO; i < 6; i++) {
    vec4 S = uSlab[i];
    float c = cos(S.z), s = sin(S.z);
    vec2 o = p - S.xy;
    vec2 q = vec2(c * o.x - s * o.y, s * o.x + c * o.y);
    vec2 hs = vec2(S.w * 0.2222, S.w * 0.0556);
    float d = length(max(abs(q) - hs, 0.0));
    ao *= 1.0 - 0.55 * exp(-d * 2.2 / (0.4 + S.w * 0.04));
  }
  return ao;
}

// distance to salt-crust polygon border
float saltEdge(vec2 p){
  vec2 n = floor(p), f = fract(p);
  vec2 mr = vec2(0.0), mg = vec2(0.0);
  float md = 8.0;
  for (int j = -1 + ZERO; j <= 1; j++)
  for (int i = -1 + ZERO; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 o = hash2(n + g) * 0.75 + 0.125;
    vec2 r = g + o - f;
    float d = dot(r, r);
    if (d < md) { md = d; mr = r; mg = g; }
  }
  md = 8.0;
  for (int j = -1 + ZERO; j <= 1; j++)
  for (int i = -1 + ZERO; i <= 1; i++) {
    vec2 g = mg + vec2(float(i), float(j));
    vec2 o = hash2(n + g) * 0.75 + 0.125;
    vec2 r = g + o - f;
    if (dot(mr - r, mr - r) > 1e-5) md = min(md, dot(0.5 * (mr + r), normalize(r - mr)));
  }
  return md;
}

vec3 noonSky(vec3 d){
  float e = max(d.y, 0.0);
  vec3 c = mix(vec3(0.985, 0.982, 0.975), vec3(0.79, 0.81, 0.82), pow(smoothstep(0.0, 1.0, e), 0.7));
  float sd = max(dot(d, SUN), 0.0);
  c += vec3(1.0, 0.98, 0.95) * (pow(sd, 1800.0) * 3.0 + pow(sd, 40.0) * 0.22);
  return c;
}

float groundAlbedo(vec2 p, float foot){
  float e = saltEdge(p * 0.7);
  float fw = foot * 0.7;
  float ridge = 1.0 - smoothstep(0.0, 0.045 + fw, e);
  float groove = smoothstep(0.03 + fw, 0.07 + fw, e) * (1.0 - smoothstep(0.07 + fw, 0.13 + fw, e));
  float far = 1.0 - smoothstep(0.12, 0.5, fw);
  float var = fbm(p * 0.07) * 0.14 + noise(p * 0.9) * 0.05;
  return 0.78 + var + (ridge * 0.12 - groove * 0.07) * far;
}

vec3 shimmer(vec3 rd){
  float hz = exp(-abs(rd.y) * 70.0);
  rd.y += (noise(vec2(rd.x * 60.0 + rd.z * 60.0, uTime * 2.5)) - 0.5) * 0.004 * hz;
  return normalize(rd);
}

// Monolith id a ray sees (-1 for salt or sky), for silhouette detection.
float noonKey(vec3 ro, vec3 rd){
  vec3 n;
  float id;
  float ts = slabs(ro, rd, n, id);
  float tg = rd.y < 0.0 ? -ro.y / rd.y : 1e9;
  return ts > 0.0 && ts < tg ? id : -1.0;
}

float KEY; // monolith id seen by the last noonShade
vec3 noonShade(vec3 ro, vec3 rd, float F){
  vec3 n;
  float id;
  float ts = slabs(ro, rd, n, id);
  KEY = ts > 0.0 && (rd.y >= 0.0 || ts < -ro.y / rd.y) ? id : -1.0;
  float edge = EDGE;
  float tg = rd.y < 0.0 ? -ro.y / rd.y : 1e9;
  vec3 col;
  if (ts > 0.0 && ts < tg) {
    // polished black stone: dark base, fresnel reflection of salt and sky, bevel rims, sun glint
    vec3 p = ro + rd * ts;
    vec3 r = reflect(rd, n);
    float ndv = max(dot(n, -rd), 0.0);
    float fres = 0.065 + 0.935 * pow(1.0 - ndv, 5.0);
    vec3 env = r.y > 0.0 ? noonSky(r) : vec3(0.9) * mix(1.0, 0.72, smoothstep(0.0, -0.5, r.y));
    env = mix(env, vec3(1.0), exp(-abs(r.y) * 60.0) * 0.4); // bright horizon line in the polish
    float dif = max(dot(n, SUN), 0.0);
    col = vec3(0.008) + vec3(0.02) * dif + env * fres;
    float sg = max(dot(r, SUN), 0.0);
    col += vec3(1.0, 0.98, 0.95) * (pow(sg, 600.0) * 6.0 + pow(sg, 50.0) * 0.12);
    col += env * edge * 0.55 * (0.4 + 0.6 * pow(1.0 - ndv, 2.0));
    float base = smoothstep(0.0, 0.25 + uSlab[int(id)].w * 0.05, p.y);
    col *= mix(0.45, 1.0, base);
    float hov = 1.0 - step(0.5, abs(id - uS1.w));
    col += vec3(1.0) * hov * (0.04 + pow(1.0 - ndv, 3.0) * 0.5 + edge * 0.4);
    col = mix(col, vec3(0.95, 0.95, 0.94), 1.0 - exp(-ts * 0.0035));
  } else if (rd.y < 0.0) {
    vec3 p = ro + rd * tg;
    float foot = tg / (uRes.y * F * max(-rd.y, 0.01));
    float alb = groundAlbedo(p.xz, foot);
    float sh = shadowed(p + vec3(0.0, 0.002, 0.0));
    col = vec3(alb) * (1.0 - sh * 0.9) * mix(0.55, 1.0, groundAO(p.xz));
    float mir = smoothstep(0.032, 0.002, -rd.y);
    if (mir > 0.0) {
      vec3 r = vec3(rd.x, -rd.y, rd.z);
      r.y += (noise(vec2(p.x * 0.6, uTime * 3.0)) - 0.5) * 0.004;
      vec3 mc = noonSky(normalize(r));
      vec3 mn;
      float mid;
      if (slabs(p, normalize(r), mn, mid) > 0.0) mc = vec3(0.08);
      col = mix(col, mc, mir * 0.8);
    }
    col = mix(col, vec3(0.95, 0.95, 0.94), 1.0 - exp(-tg * 0.0035));
  } else {
    col = noonSky(rd);
  }
  return col;
}

vec3 renderNoon(Cam c, vec2 uv){
  SUN = normalize(vec3(cos(uS1.y) * sin(uS1.x), sin(uS1.y), cos(uS1.y) * cos(uS1.x)));
  vec3 ro = c.o;
  // silhouette AA: two diagonal probes; where they disagree with the centre, rotated-grid 4x supersample
  // sample 0 is the centre; on a silhouette it is discarded and samples 1..4 are averaged.
  // Single noonShade call site inside a non-unrolled loop keeps the compiled shader small.
  float px = 1.0 / uRes.y;
  vec3 ra = shimmer(camRay(c, uv + vec2(0.5, 0.5) * px)), rb = shimmer(camRay(c, uv - vec2(0.5, 0.5) * px));
  vec3 col = vec3(0.0);
  vec3 acc = vec3(0.0);
  for (int s = ZERO; s < 5; s++) {
    vec2 o = s == 0 ? vec2(0.0) : RG[s - 1] * px;
    vec3 sc = noonShade(ro, shimmer(camRay(c, uv + o)), c.F);
    if (s == 0) {
      col = sc;
      float k = KEY;
      if (noonKey(ro, ra) == k && noonKey(ro, rb) == k) break;
    } else acc += sc;
    if (s == 4) col = acc * 0.25;
  }
  col *= uS1.z;
  col = col / (1.0 + max(col - 1.0, 0.0) * 0.3);
  // near-monochrome grade with cool shadows
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, 0.6) * mix(vec3(0.93, 0.96, 1.0), vec3(1.0), smoothstep(0.0, 0.6, l));
  return clamp(col, 0.0, 1.0);
}

// II -> III: tone reversal sweeps down (with a Mackie line), then red dye bleeds through the negative.
vec3 develop(vec3 col, vec2 q, vec2 uv){
  float s = uT.y, b = uT.z;
  if (s <= 0.0 && b <= 0.0) return col;
  float nfr = (fbm(uv * 3.0 + vec2(0.0, uTime * 0.08)) - 0.5) * 0.35;
  float front = mix(1.25, -0.35, s);
  float d = (q.y + nfr) - front;
  float inv = smoothstep(-0.004, 0.004, d);
  float mackie = exp(-abs(d) * 70.0) * step(0.001, s) * step(s, 0.999);
  col = mix(col, vec3(1.0) - col, inv);
  col += vec3(1.0, 0.97, 0.9) * mackie * 0.85;
  if (b > 0.0) {
    float n = fbm(uv * 1.7 + vec2(uTime * 0.02, -uTime * 0.03));
    float rad = length(uv * vec2(0.75, 1.0));
    float field = n * 0.7 + (1.0 - rad) * 0.55;
    float th = 1.28 - b * 1.6;
    float m = smoothstep(th, th + 0.04, field);
    float edge = exp(-abs(field - th) * 40.0) * step(0.001, b) * step(b, 0.999);
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    vec3 red = vec3(1.0, 0.12, 0.045) * pow(lum, 1.35) * 1.05 + vec3(0.05, 0.0, 0.0);
    col = mix(col, red, m);
    col += vec3(1.0, 0.32, 0.1) * edge * 0.55;
  }
  return col;
}

/* =========================== DARKROOM =========================== */

const float WALLZ = 5.2;
const float RIMZ = 4.7;
const float LAMPY = 3.12;

float lampOn(float k){
  float h = hash(vec2(k, 3.1));
  float lv = uD1.z;
  float on = smoothstep(h * 0.55, h * 0.55 + 0.3, lv);
  float flick = step(0.5, noise(vec2(uTime * 22.0, k * 7.0)));
  return lv >= 1.0 ? 1.0 : on * mix(1.0, flick, step(lv, 0.98) * step(0.02, on) * (1.0 - on));
}

vec3 lampPos(float k){ return vec3((k + 0.5) * uD1.x, LAMPY, WALLZ - 0.06); }

float lampLight(vec3 p){
  float k0 = floor(p.x / uD1.x - 0.5);
  float L = 0.0;
  for (int i = ZERO; i < 3; i++) {
    float k = k0 + float(i) - 1.0;
    vec3 dl = lampPos(k) - p;
    L += lampOn(k) * 5.5 / (1.0 + dot(dl, dl) * 1.6);
  }
  return L;
}

float lampGlow(vec3 o, vec3 d){
  if (d.z <= 0.0) return 0.0;
  float t = (WALLZ - o.z) / d.z;
  float hx = o.x + d.x * t;
  float k0 = floor(hx / uD1.x - 0.5);
  float gl = 0.0;
  for (int i = ZERO; i < 3; i++) {
    float k = k0 + float(i) - 1.0;
    vec3 dl = lampPos(k) - o;
    float dist = length(dl);
    float a = length(cross(d, dl / dist));
    float rA = 0.2 / dist;
    float on = lampOn(k);
    gl += on * (smoothstep(rA, rA * 0.8, a) * 2.6 + exp(-a * 26.0) * 0.8 + exp(-a * 5.0) * 0.1);
  }
  return gl;
}

// mono safelight radiance of the wall at h, plus albedo for the enlarger flash
float wallShade(vec3 h, out float alb){
  vec2 tp = h.xy * vec2(3.2, 3.2);
  vec2 tf = abs(fract(tp) - 0.5);
  float grout = smoothstep(0.47, 0.5, max(tf.x, tf.y));
  float stain = fbm(h.xy * 1.3) * 0.5 + fbm(h.xy * 6.0) * 0.2;
  alb = (0.55 + stain * 0.3) * (1.0 - grout * 0.45);
  return lampLight(h) * alb * 0.6 + 0.006;
}

vec3 safe(float L){
  vec3 c = vec3(1.0, 0.11, 0.035) * L;
  c += vec3(1.0, 0.4, 0.15) * max(L - 1.6, 0.0) * 0.12;
  return c;
}

vec3 renderDark(Cam c, vec2 uv, Cam c2){
  vec3 rd = camRay(c, uv);
  vec3 ro = c.o;
  float L = 0.0;   // safelight radiance (mono)
  float alb = 0.0; // for the white enlarger flash
  vec3 cool = vec3(0.0);
  float doorW = uD2.y, doorX = uD2.x, doorH = uD2.z;

  float tw = rd.z > 1e-4 ? (WALLZ - ro.z) / rd.z : 1e9;
  float tg = rd.y < -1e-4 ? -ro.y / rd.y : 1e9;

  if (tw < tg) {
    vec3 h = ro + rd * tw;
    // door through the wall onto the night
    if (doorW > 0.0) {
      float fp = tw / (uRes.y * c.F) * 1.5;
      float m = smoothstep(doorW + fp, doorW - fp, abs(h.x - doorX)) * smoothstep(doorH + fp, doorH - fp, h.y);
      if (m > 0.001) {
        vec3 night = renderNight(c2, uv);
        float wa;
        float wl = wallShade(h, wa);
        vec3 wallc = 1.0 - exp(-safe(wl + lampGlow(ro, rd)) * 1.3);
        return mix(wallc, night, m);
      }
      float de = max(abs(h.x - doorX) - doorW, 0.0) + max(h.y - doorH, 0.0);
      cool += vec3(0.25, 0.42, 0.5) * exp(-de * 3.0) * min(doorW * 4.0, 1.0) * 0.25;
    }
    L = wallShade(h, alb);
  } else if (tg < 1e9) {
    vec3 p = ro + rd * tg;
    if (p.z < RIMZ - 0.035) {
      // developer bath
      float rg;
      vec2 g = ripples(p.xz, 3.0, rg) * 0.05;
      float ag = 0.004 + uD1.w * 0.03;
      g += vec2(sin(p.x * 7.0 + uTime * 1.3) + sin(p.z * 9.0 - uTime * 1.7 + p.x * 3.0), cos(p.z * 8.0 + uTime * 1.1)) * ag;
      vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
      vec3 r = reflect(rd, n);
      float fres = 0.1 + 0.9 * pow(1.0 - max(dot(n, -rd), 0.0), 5.0);
      float rl = 0.0;
      float ra;
      if (r.z > 1e-4) {
        float t2 = (WALLZ - p.z) / r.z;
        vec3 h2 = p + r * t2;
        rl = wallShade(h2, ra) + lampGlow(p, r);
        if (doorW > 0.0) {
          float dm = step(abs(h2.x - doorX), doorW) * step(h2.y, doorH);
          cool += vec3(0.4, 0.6, 0.7) * dm * fres * 0.6;
        }
      }
      float body = lampLight(p) * 0.09;
      L = mix(body, rl * 1.2, fres) + rg * 0.35;
      alb = 0.35;
    } else if (p.z < RIMZ + 0.02) {
      L = lampLight(p) * 0.55;
      alb = 0.9;
    } else {
      float grain = fbm(vec2(p.x * 4.0, p.z * 30.0));
      alb = 0.18 + grain * 0.12;
      L = lampLight(p) * alb * 0.5;
    }
    L *= exp(-tg * 0.02);
  } else {
    L = 0.002;
  }
  L += lampGlow(ro, rd);
  vec3 col = safe(L) + cool;
  // enlarger flash: the room in white light for an instant
  col = mix(col, vec3(alb * 0.9 + 0.05) * vec3(1.0, 0.97, 0.9) + col * 0.3, uD1.y);
  col = 1.0 - exp(-col * 1.3);
  return col;
}

/* =========================== MAIN =========================== */

void main(){
  vec2 frag = gl_FragCoord.xy;
  vec2 uv = (frag - 0.5 * uRes) / uRes.y;
  vec2 q = frag / uRes;
  Cam c1 = mkCam(uCamP, uCamR);
  Cam c2 = mkCam(uCam2P, uCam2R);

  // one call site per world: every extra call is a full inlined copy for the D3D compiler
  vec3 col = vec3(0.0);
  Cam cn = c1, cd = c1;
  if (uWC.x > 0.5) cn = c2;
  if (uWC.z > 0.5) cd = c2;
  if (uW.x > 0.001) col += uW.x * renderNight(cn, uv);
  if (uW.y > 0.001) col += uW.y * develop(renderNoon(c1, uv), q, uv);
  if (uW.z > 0.001) col += uW.z * renderDark(cd, uv, c2);

  col = mix(col, vec3(1.0, 0.995, 0.985), uT.x);
  col = mix(col, vec3(1.0) - col, uT.w);

  // vignette and grain weighted per world
  float vig = uW.x * 0.58 + uW.y * 0.22 + uW.z * 0.62;
  vec2 vq = q - 0.5;
  col *= mix(1.0 - vig, 1.0, smoothstep(0.95, 0.18, length(vq * vec2(1.0, 1.15))));
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  float gr = hash(frag + fract(uTime * 7.31) * 97.0) - 0.5;
  float ga = uW.x * 1.0 + uW.y * 0.5 + uW.z * 1.15;
  col += gr * (0.05 * (1.0 - lum) * (0.3 + lum * 3.0) + 0.012) * ga;

  outColor = vec4(col, 1.0);
}
`;
