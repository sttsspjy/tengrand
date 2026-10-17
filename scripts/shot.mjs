// Headless Edge probe: screenshots a route down its full scroll + reports console errors, FPS and GPU.
// Usage: node scripts/shot.mjs /v1 [outDir] [--mobile] [--base=http://localhost:3000]
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const [routeArg = "/", outArg] = args.filter((a) => !a.startsWith("--"));
// Accepts "v1" or "/v1"; undoes Git Bash's "/v1" -> "C:/Program Files/Git/v1" rewrite.
const route = "/" + routeArg.replace(/^[A-Za-z]:\/.*?\/Git\//, "").replace(/^\/+/, "");
const outDir = outArg ?? `shots${route.replace(/\//g, "_") || "_root"}`;
const mobile = args.includes("--mobile");
const base = (args.find((a) => a.startsWith("--base=")) ?? "--base=http://localhost:3000").slice(7);
const vp = mobile ? { width: 390, height: 844 } : { width: 1600, height: 900 };

fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  channel: "msedge",
  headless: true,
  args: ["--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

const res = await page.goto(base + route, { waitUntil: "load", timeout: 120000 });
await page.waitForTimeout(3500);

const gpu = await page.evaluate(() => {
  const gl = document.createElement("canvas").getContext("webgl");
  const ext = gl?.getExtension("WEBGL_debug_renderer_info");
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl ? "webgl (renderer hidden)" : "no webgl";
});

// Counts rAF frames for `ms`, returns avg fps and worst frame time.
const measure = (ms) =>
  page.evaluate(
    (ms) =>
      new Promise((resolve) => {
        const times = [];
        let last = performance.now();
        const start = last;
        const tick = (t) => {
          times.push(t - last);
          last = t;
          if (t - start < ms) requestAnimationFrame(tick);
          else resolve({ fps: Math.round((times.length / (t - start)) * 1000), worstMs: Math.round(Math.max(...times.slice(1))) });
        };
        requestAnimationFrame(tick);
      }),
    ms
  );

const idle = await measure(2000);
await page.screenshot({ path: path.join(outDir, "00.png") });

const docH = await page.evaluate(() => document.documentElement.scrollHeight);
const steps = Math.min(16, Math.ceil(docH / vp.height));
const scrollPerf = [];
for (let i = 1; i <= steps; i++) {
  const perfP = i <= 3 ? measure(900) : null;
  for (let k = 0; k < 6; k++) {
    if (mobile) await page.evaluate((d) => window.scrollBy(0, d), vp.height / 6);
    else await page.mouse.wheel(0, vp.height / 6);
    await page.waitForTimeout(60);
  }
  if (perfP) scrollPerf.push(await perfP);
  await page.waitForTimeout(1100);
  await page.screenshot({ path: path.join(outDir, `${String(i).padStart(2, "0")}.png`) });
  const atEnd = await page.evaluate(() => window.scrollY + innerHeight >= document.documentElement.scrollHeight - 4);
  if (atEnd) break;
}

const hOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
console.log(JSON.stringify({ route, status: res?.status(), viewport: vp, gpu, idle, scrollPerf, docHeight: docH, horizontalOverflow: hOverflow, errors, outDir: path.resolve(outDir) }, null, 2));
await browser.close();
