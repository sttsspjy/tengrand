// Adapted from React Bits SplashCursor (MIT), itself after Pavel Dobryakov's WebGL-Fluid-Simulation (MIT).
// Stable-fluids solver (curl + vorticity, divergence, Jacobi pressure, projection, semi-Lagrangian advection)
// on half-float ping-pong targets. Instead of dye it advects a displacement field (RG: pattern, BA: phrase)
// that relaxes back to rest; the display pass samples a static ebru pattern and the phrase through it.

export type Phrase = { before: string; accent: string; after: string };
type FBO = { tex: WebGLTexture; fb: WebGLFramebuffer; w: number; h: number };
type Double = { read: FBO; write: FBO; swap: () => void };

const VS = `#version 300 es
precision highp float;
in vec2 aPos;
uniform vec2 texel;
out vec2 vUv; out vec2 vL; out vec2 vR; out vec2 vT; out vec2 vB;
void main(){
  vUv = aPos * .5 + .5;
  vL = vUv - vec2(texel.x, 0.); vR = vUv + vec2(texel.x, 0.);
  vT = vUv + vec2(0., texel.y); vB = vUv - vec2(0., texel.y);
  gl_Position = vec4(aPos, 0., 1.);
}`;

const HEAD = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv; in vec2 vL; in vec2 vR; in vec2 vT; in vec2 vB;
out vec4 o;
`;

const FS = {
  splat: `${HEAD}
uniform sampler2D uTarget; uniform float aspect; uniform vec3 color; uniform vec2 point; uniform float radius;
void main(){ vec2 p = vUv - point; p.x *= aspect; o = vec4(texture(uTarget, vUv).xyz + exp(-dot(p, p) / radius) * color, 1.); }`,
  advect: `${HEAD}
uniform sampler2D uVelocity; uniform sampler2D uSource; uniform vec2 simTexel; uniform float dt; uniform float dissipation;
void main(){ vec2 c = vUv - dt * texture(uVelocity, vUv).xy * simTexel; o = texture(uSource, c) / (1. + dissipation * dt); }`,
  disp: `${HEAD}
uniform sampler2D uVelocity; uniform sampler2D uSource; uniform vec2 simTexel; uniform float dt; uniform vec2 relax;
void main(){
  vec2 back = vUv - dt * texture(uVelocity, vUv).xy * simTexel;
  vec4 d = texture(uSource, back);
  vec2 off = back - vUv;
  d += vec4(off, off);
  d.xy *= relax.x; d.zw *= relax.y;
  o = d;
}`,
  divergence: `${HEAD}
uniform sampler2D uVelocity;
void main(){
  float L = texture(uVelocity, vL).x; float R = texture(uVelocity, vR).x;
  float T = texture(uVelocity, vT).y; float B = texture(uVelocity, vB).y;
  vec2 C = texture(uVelocity, vUv).xy;
  if (vL.x < 0.) L = -C.x; if (vR.x > 1.) R = -C.x; if (vT.y > 1.) T = -C.y; if (vB.y < 0.) B = -C.y;
  o = vec4(.5 * (R - L + T - B), 0., 0., 1.);
}`,
  curl: `${HEAD}
uniform sampler2D uVelocity;
void main(){
  float L = texture(uVelocity, vL).y; float R = texture(uVelocity, vR).y;
  float T = texture(uVelocity, vT).x; float B = texture(uVelocity, vB).x;
  o = vec4(.5 * (R - L - T + B), 0., 0., 1.);
}`,
  vorticity: `${HEAD}
uniform sampler2D uVelocity; uniform sampler2D uCurl; uniform float curl; uniform float dt;
void main(){
  float L = texture(uCurl, vL).x; float R = texture(uCurl, vR).x;
  float T = texture(uCurl, vT).x; float B = texture(uCurl, vB).x; float C = texture(uCurl, vUv).x;
  vec2 f = .5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  f /= length(f) + .0001; f *= curl * C; f.y *= -1.;
  o = vec4(clamp(texture(uVelocity, vUv).xy + f * dt, -1000., 1000.), 0., 1.);
}`,
  pressure: `${HEAD}
uniform sampler2D uPressure; uniform sampler2D uDivergence;
void main(){
  float L = texture(uPressure, vL).x; float R = texture(uPressure, vR).x;
  float T = texture(uPressure, vT).x; float B = texture(uPressure, vB).x;
  o = vec4((L + R + B + T - texture(uDivergence, vUv).x) * .25, 0., 0., 1.);
}`,
  gradient: `${HEAD}
uniform sampler2D uPressure; uniform sampler2D uVelocity;
void main(){
  float L = texture(uPressure, vL).x; float R = texture(uPressure, vR).x;
  float T = texture(uPressure, vT).x; float B = texture(uPressure, vB).x;
  o = vec4(texture(uVelocity, vUv).xy - vec2(R - L, T - B), 0., 1.);
}`,
  scale: `${HEAD}
uniform sampler2D uTexture; uniform float value;
void main(){ o = value * texture(uTexture, vUv); }`,
  // Mathematical marbling (after Jaffer & Lu): drops, tine lines and waves applied in reverse to each pixel.
  pattern: `${HEAD}
#define MAXOPS 92
uniform vec4 uA[MAXOPS]; uniform vec4 uB[MAXOPS]; uniform int uCount; uniform float aspect; uniform vec2 px;
uniform vec3 pal[8]; uniform vec3 size;
vec3 shade(vec2 p){
  for (int i = MAXOPS - 1; i >= 0; i--) {
    if (i >= uCount) continue;
    vec4 a = uA[i]; vec4 b = uB[i];
    if (b.x < .5) {
      vec2 d = p - a.xy; float l2 = dot(d, d); float r2 = a.z * a.z;
      if (l2 < r2) return pal[int(a.w)];
      p = a.xy + d * sqrt(1. - r2 / l2);
    } else if (b.x < 1.5) {
      vec2 m = vec2(cos(a.z), sin(a.z)); vec2 n = vec2(-m.y, m.x);
      float t = dot(p - a.xy, n);
      float dist = b.w > 0. ? b.w * .5 - abs(mod(t, b.w) - b.w * .5) : abs(t);
      p -= m * (b.y * b.z / (dist + b.z));
    } else {
      vec2 m = vec2(cos(a.z), sin(a.z)); vec2 n = vec2(-m.y, m.x);
      p -= m * b.y * sin(b.z * dot(p, n) + b.w);
    }
  }
  return size;
}
void main(){
  vec2 p = vec2(vUv.x * aspect, 1. - vUv.y);
  vec2 q = px * vec2(aspect, 1.) * .25;
  vec3 c = shade(p + vec2(-q.x, -q.y)) + shade(p + vec2(q.x, -q.y)) + shade(p + vec2(-q.x, q.y)) + shade(p + vec2(q.x, q.y));
  o = vec4(c * .25, 1.);
}`,
  display: `${HEAD}
uniform sampler2D uDisp; uniform sampler2D uPattern; uniform sampler2D uText; uniform sampler2D uVelocity;
uniform vec2 res; uniform float aspect; uniform vec3 ink; uniform vec3 accent;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
void main(){
  vec4 d = texture(uDisp, vUv);
  vec2 pc = vUv + d.xy; vec2 tc = vUv + d.zw;
  vec3 col = texture(uPattern, pc).rgb;
  col *= .955 + .07 * hash(floor(pc * res * .5));
  vec4 t = texture(uText, tc);
  col = mix(col, ink, t.r * .95);
  col = mix(col, accent, t.g * .97);
  vec2 v = texture(uVelocity, vUv).xy;
  col += smoothstep(30., 600., length(v)) * .05;
  vec2 e2 = min(vUv, 1. - vUv); float e = min(e2.x * aspect, e2.y);
  col *= mix(.78, 1., smoothstep(0., .04, e));
  col *= .985 + .03 * hash(gl_FragCoord.xy);
  o = vec4(col, 1.);
}`,
};

type Prog = { p: WebGLProgram; u: Record<string, WebGLUniformLocation | null> };

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
const PAL = ["#1c1a19", "#0b8a8c", "#ff5d1f", "#d6a03d", "#c8361d", "#efe5cf", "#143f78", "#93c4bb"].map(hex);
const SIZE = hex("#e9dfc6");
const INK = hex("#1c1a19");
const ACCENT = hex("#c8361d");

const rng = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};

/** Forward marbling recipe in pattern space (x in [0, aspect], y in [0, 1], y down): battal stones, gel-git combs, a wave, and a ringed centre that holds the phrase. */
function recipe(aspect: number) {
  const A: number[] = [];
  const B: number[] = [];
  const drop = (x: number, y: number, r: number, c: number) => (A.push(x, y, r, c), B.push(0, 0, 0, 0));
  const tine = (x: number, y: number, ang: number, alpha: number, lambda: number, spacing = 0) => (A.push(x, y, ang, 0), B.push(1, alpha, lambda, spacing));
  const wave = (ang: number, amp: number, freq: number, phase: number) => (A.push(0, 0, ang, 0), B.push(2, amp, freq, phase));
  const r = rng(91);
  const wide = aspect >= 1;
  const k = wide ? 1 : aspect * 1.25;
  const cols = [1, 2, 0, 3, 6, 7, 1, 2, 4, 5];
  for (let i = 0; i < 44; i++) drop(-0.1 + r() * (aspect + 0.2), -0.1 + r() * 1.2, (0.05 + r() * 0.08) * k, cols[i % cols.length]);
  const sp = 0.17 * k;
  tine(0, 0, Math.PI / 2, 0.09 * k, 0.014, sp);
  tine(sp / 2, 0, -Math.PI / 2, 0.09 * k, 0.014, sp);
  wave(0, 0.022 * k, 13 / k, 0.7);
  tine(0, 0.5, 0, 0.05 * k, 0.02, 0.24 * k);
  // ringed centre: three overlapping ring stacks merge into one cream capsule; each earlier drop
  // becomes a thin ring around the later ones (area-preserving), so the stones stay visible outside
  const cx = aspect / 2;
  const centres = wide ? [-0.24, 0, 0.24].map((d) => [cx + d, 0.5]) : [-0.15, 0, 0.15].map((d) => [cx, 0.5 + d]);
  const rings = [0, 1, 5, 2, 5, 6, 3];
  const rr = (wide ? 0.07 : 0.06 * aspect * 1.6);
  for (const c of rings) for (const [x, y] of centres) drop(x, y, rr, c);
  for (const [x, y] of centres) drop(x, y, wide ? 0.215 : 0.2 * aspect * 1.6, 5);
  tine(cx, 0, Math.PI / 2, 0.035 * k, 0.05);
  return { A, B, count: A.length / 4 };
}

export class Marble {
  ok = false;
  private gl!: WebGL2RenderingContext;
  private progs: Record<string, Prog> = {};
  private vel!: Double;
  private disp!: Double;
  private pres!: Double;
  private div!: FBO;
  private curlT!: FBO;
  private pattern: FBO | null = null;
  private text: WebGLTexture | null = null;
  private w = 0;
  private h = 0;
  private queue: [number, number, number, number][] = [];
  private t = 0;
  private fmt: { rgba: number; rg: number; r: number; frg: number; fr: number } = { rgba: 0, rg: 0, r: 0, frg: 0, fr: 0 };

  constructor(
    private canvas: HTMLCanvasElement,
    private fonts: { text: string; display: string },
    private phrase: Phrase
  ) {
    const gl = canvas.getContext("webgl2", { alpha: false, depth: false, stencil: false, antialias: false, premultipliedAlpha: false, powerPreference: "high-performance" });
    if (!gl) return;
    this.gl = gl;
    gl.getExtension("EXT_color_buffer_float");
    gl.getExtension("EXT_color_buffer_half_float");
    this.fmt = { rgba: gl.RGBA16F, rg: gl.RG16F, r: gl.R16F, frg: gl.RG, fr: gl.RED };
    // some drivers can't render to RG/R half floats; fall back to RGBA
    if (!this.canRender(gl.RG16F, gl.RG)) this.fmt = { rgba: gl.RGBA16F, rg: gl.RGBA16F, r: gl.RGBA16F, frg: gl.RGBA, fr: gl.RGBA };
    if (!this.canRender(gl.RGBA16F, gl.RGBA)) return;
    try {
      for (const [k, src] of Object.entries(FS)) this.progs[k] = this.program(src);
    } catch {
      return;
    }
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);
    this.ok = true;
  }

  private canRender(internal: number, format: number) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, 4, 4, 0, format, gl.HALF_FLOAT, null);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.deleteFramebuffer(fb);
    gl.deleteTexture(tex);
    return ok;
  }

  private program(fs: string): Prog {
    const gl = this.gl;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, "aPos");
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "link");
    const u: Prog["u"] = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) as number;
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i)!;
      const name = info.name.replace(/\[0\]$/, "");
      u[name] = gl.getUniformLocation(p, info.name);
    }
    return { p, u };
  }

  private fbo(w: number, h: number, internal: number, format: number, type: number, filter: number): FBO {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null);
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return { tex, fb, w, h };
  }
  private double(w: number, h: number, internal: number, format: number): Double {
    const gl = this.gl;
    const d: Double = {
      read: this.fbo(w, h, internal, format, gl.HALF_FLOAT, gl.LINEAR),
      write: this.fbo(w, h, internal, format, gl.HALF_FLOAT, gl.LINEAR),
      swap: () => {
        const t = d.read;
        d.read = d.write;
        d.write = t;
      },
    };
    return d;
  }
  private free(f: FBO | null | undefined) {
    if (!f) return;
    this.gl.deleteTexture(f.tex);
    this.gl.deleteFramebuffer(f.fb);
  }

  /** Sizes the canvas and all targets; regenerates the pattern and the phrase texture. */
  resize(cssW: number, cssH: number, dpr: number) {
    if (!this.ok) return;
    const gl = this.gl;
    const w = Math.max(2, Math.min(2400, Math.round(cssW * dpr)));
    const h = Math.max(2, Math.min(2400, Math.round(cssH * dpr)));
    if (w === this.w && h === this.h && this.pattern) return;
    this.w = w;
    this.h = h;
    this.canvas.width = w;
    this.canvas.height = h;
    const aspect = w / h;
    const grid = (short: number) => (aspect >= 1 ? [Math.round(short * aspect), short] : [short, Math.round(short / aspect)]);
    const [sw, sh] = grid(128);
    const [dw, dh] = grid(aspect >= 1 ? 360 : 300);
    for (const d of [this.vel, this.disp, this.pres]) if (d) (this.free(d.read), this.free(d.write));
    this.free(this.div);
    this.free(this.curlT);
    this.free(this.pattern);
    const f = this.fmt;
    this.vel = this.double(sw, sh, f.rg, f.frg);
    this.pres = this.double(sw, sh, f.r, f.fr);
    this.div = this.fbo(sw, sh, f.r, f.fr, gl.HALF_FLOAT, gl.NEAREST);
    this.curlT = this.fbo(sw, sh, f.r, f.fr, gl.HALF_FLOAT, gl.NEAREST);
    this.disp = this.double(dw, dh, gl.RGBA16F, gl.RGBA);
    this.pattern = this.fbo(w, h, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR);
    // pattern
    const rc = recipe(aspect);
    const pp = this.use("pattern", this.pattern);
    gl.uniform4fv(pp.u.uA, new Float32Array(rc.A));
    gl.uniform4fv(pp.u.uB, new Float32Array(rc.B));
    gl.uniform1i(pp.u.uCount, rc.count);
    gl.uniform1f(pp.u.aspect, aspect);
    gl.uniform2f(pp.u.px, 1 / w, 1 / h);
    gl.uniform3fv(pp.u.pal, new Float32Array(PAL.flat()));
    gl.uniform3fv(pp.u.size, new Float32Array(SIZE));
    this.blit(this.pattern);
    this.drawText(w, h);
  }

  private drawText(w: number, h: number) {
    const gl = this.gl;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const x = c.getContext("2d")!;
    x.fillStyle = "#000";
    x.fillRect(0, 0, w, h);
    x.textAlign = "center";
    x.textBaseline = "alphabetic";
    const wide = w >= h;
    const { before, accent, after } = this.phrase;
    const line2 = after ? `${accent} ${after}` : accent;
    // sizes are fractions of the short side so the phrase sits inside the cream centre
    const s1 = wide ? h * 0.068 : w * 0.088;
    const s2 = wide ? h * 0.25 : w * 0.28;
    x.font = `300 ${s1}px ${this.fonts.display}`;
    x.fillStyle = "#f00";
    const y1 = h * (wide ? 0.43 : 0.43);
    x.fillText(before, w / 2, y1);
    x.font = `italic 400 ${s2}px ${this.fonts.display}`;
    x.fillStyle = "#0f0";
    x.globalCompositeOperation = "lighter";
    x.fillText(line2, w / 2 + s2 * 0.04, y1 + s2 * 0.86);
    if (!this.text) this.text = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.text);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  /** Redraws the phrase (call after fonts load). */
  refreshText() {
    if (this.ok && this.w) this.drawText(this.w, this.h);
  }

  private use(name: string, target: FBO | null) {
    const gl = this.gl;
    const pr = this.progs[name];
    gl.useProgram(pr.p);
    const w = target ? target.w : this.w;
    const h = target ? target.h : this.h;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null);
    gl.viewport(0, 0, w, h);
    gl.uniform2f(pr.u.texel, 1 / w, 1 / h);
    return pr;
  }
  private bind(pr: Prog, name: string, tex: WebGLTexture, unit: number) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(pr.u[name], unit);
  }
  private blit(_t: FBO | null) {
    this.gl.drawElements(this.gl.TRIANGLES, 6, this.gl.UNSIGNED_SHORT, 0);
  }

  /** Stylus input: position in uv (y up) and its motion since the last event, in uv. */
  input(x: number, y: number, dx: number, dy: number) {
    if (this.queue.length < 24) this.queue.push([x, y, dx, dy]);
  }

  private splat(x: number, y: number, fx: number, fy: number, radius: number) {
    const gl = this.gl;
    const pr = this.use("splat", this.vel.write);
    this.bind(pr, "uTarget", this.vel.read.tex, 0);
    gl.uniform1f(pr.u.aspect, this.w / this.h);
    gl.uniform2f(pr.u.point, x, y);
    gl.uniform3f(pr.u.color, fx, fy, 0);
    gl.uniform1f(pr.u.radius, radius);
    this.blit(this.vel.write);
    this.vel.swap();
  }

  /** One simulation step + display. `drift` moves an automatic stylus (touch / idle). */
  frame(dt: number, drift: number) {
    if (!this.ok || !this.pattern || !this.text) return;
    const gl = this.gl;
    dt = Math.min(dt, 1 / 30);
    this.t += dt;
    const aspect = this.w / this.h;
    // stylus strokes become three comb tines across the motion
    for (const [x, y, dx, dy] of this.queue) {
      const len = Math.hypot(dx * aspect, dy) || 1;
      const nx = (-dy / len) * 0.034;
      const ny = ((dx * aspect) / len) * 0.034;
      const F = 5200;
      for (const k of [-1, 0, 1]) this.splat(x + (nx / aspect) * k, y + ny * k, dx * F * (k ? 0.75 : 1), dy * F * (k ? 0.75 : 1), 0.00045);
    }
    this.queue.length = 0;
    if (drift > 0) {
      // an automatic stylus orbits the cream centre, combing the rings without crossing the phrase
      const t = this.t * 0.35;
      const ang = t + 0.6 * Math.sin(t * 0.37);
      const rx = (aspect < 1 ? 0.45 : 0.41) + 0.03 * Math.sin(t * 1.3);
      const ry = 0.39 + 0.05 * Math.cos(t * 0.9);
      const px = 0.5 + rx * Math.cos(ang);
      const py = 0.5 + ry * Math.sin(ang);
      const vx = -rx * Math.sin(ang);
      const vy = ry * Math.cos(ang);
      this.splat(px, py, vx * 140 * drift, vy * 140 * drift, 0.0005);
    }

    const sim = { x: 1 / this.vel.read.w, y: 1 / this.vel.read.h };
    let pr = this.use("curl", this.curlT);
    this.bind(pr, "uVelocity", this.vel.read.tex, 0);
    this.blit(this.curlT);

    pr = this.use("vorticity", this.vel.write);
    this.bind(pr, "uVelocity", this.vel.read.tex, 0);
    this.bind(pr, "uCurl", this.curlT.tex, 1);
    gl.uniform1f(pr.u.curl, 4);
    gl.uniform1f(pr.u.dt, dt);
    this.blit(this.vel.write);
    this.vel.swap();

    pr = this.use("divergence", this.div);
    this.bind(pr, "uVelocity", this.vel.read.tex, 0);
    this.blit(this.div);

    pr = this.use("scale", this.pres.write);
    this.bind(pr, "uTexture", this.pres.read.tex, 0);
    gl.uniform1f(pr.u.value, 0.8);
    this.blit(this.pres.write);
    this.pres.swap();

    pr = this.use("pressure", this.pres.write);
    this.bind(pr, "uDivergence", this.div.tex, 1);
    for (let i = 0; i < 18; i++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.pres.write.fb);
      this.bind(pr, "uPressure", this.pres.read.tex, 0);
      this.blit(this.pres.write);
      this.pres.swap();
    }

    pr = this.use("gradient", this.vel.write);
    this.bind(pr, "uPressure", this.pres.read.tex, 0);
    this.bind(pr, "uVelocity", this.vel.read.tex, 1);
    this.blit(this.vel.write);
    this.vel.swap();

    pr = this.use("advect", this.vel.write);
    this.bind(pr, "uVelocity", this.vel.read.tex, 0);
    this.bind(pr, "uSource", this.vel.read.tex, 0);
    gl.uniform2f(pr.u.simTexel, sim.x, sim.y);
    gl.uniform1f(pr.u.dt, dt);
    gl.uniform1f(pr.u.dissipation, 1.6);
    this.blit(this.vel.write);
    this.vel.swap();

    // displacement: the pattern keeps its combing (slow relax), the phrase re-forms within ~2 s
    pr = this.use("disp", this.disp.write);
    this.bind(pr, "uVelocity", this.vel.read.tex, 0);
    this.bind(pr, "uSource", this.disp.read.tex, 1);
    gl.uniform2f(pr.u.simTexel, sim.x, sim.y);
    gl.uniform1f(pr.u.dt, dt);
    gl.uniform2f(pr.u.relax, Math.exp(-dt * 0.07), Math.exp(-dt * 1.25));
    this.blit(this.disp.write);
    this.disp.swap();

    pr = this.use("display", null);
    this.bind(pr, "uDisp", this.disp.read.tex, 0);
    this.bind(pr, "uPattern", this.pattern.tex, 1);
    this.bind(pr, "uText", this.text, 2);
    this.bind(pr, "uVelocity", this.vel.read.tex, 3);
    gl.uniform2f(pr.u.res, this.w, this.h);
    gl.uniform1f(pr.u.aspect, aspect);
    gl.uniform3fv(pr.u.ink, new Float32Array(INK));
    gl.uniform3fv(pr.u.accent, new Float32Array(ACCENT));
    this.blit(null);
  }

  /** Frees GPU resources but keeps the context (a remount reuses the same canvas). */
  destroy() {
    if (!this.ok) return;
    const gl = this.gl;
    for (const d of [this.vel, this.disp, this.pres]) if (d) (this.free(d.read), this.free(d.write));
    this.free(this.div);
    this.free(this.curlT);
    this.free(this.pattern);
    if (this.text) gl.deleteTexture(this.text);
    for (const pr of Object.values(this.progs)) gl.deleteProgram(pr.p);
    this.ok = false;
  }
}
