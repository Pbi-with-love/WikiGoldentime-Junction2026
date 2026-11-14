// Spec 033 bug 4: legend / "Edits per month" rects vs the projected map outline bbox in Geography. Usage: node bug4_measure.mjs <tag>
import { createRequire } from "module";
const require = createRequire("/opt/homebrew/lib/node_modules/@playwright/cli/node_modules/playwright-core/");
const { chromium } = require("playwright-core");
const tag = process.argv[2] || "run";
const SH = "artifacts/screenshots/033/";
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const out = {};
for (const [w, h, lang, shot] of [[390, 844, "en", "09-geo-390-en"], [390, 844, "fi", "10-geo-390-fi"], [1280, 720, "en", "11-geo-1280-en"]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("console", (m) => m.type() === "error" && errs.push(m.text()));
  await page.goto("http://127.0.0.1:4173/");
  await page.evaluate((l) => { localStorage.setItem("wikimemory.lang", l); sessionStorage.clear(); }, lang);
  await page.reload();
  await page.waitForFunction(() => window.__wikimemory?.sceneCtrl, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.click('.lens-btn[data-lens="geography"]');
  await page.waitForTimeout(3500);
  const m = await page.evaluate(() => {
    const r = (el) => { if (!el || el.hidden) return null; const b = el.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), b: Math.round(b.bottom) }; };
    const edits = [...document.querySelectorAll("#timeslider-root *")].find((e) => /Edits per month|Redigeringar per månad|Muokkauksia kuukaudessa/i.test(e.textContent) && e.children.length === 0);
    const g = window.__wikimemory.sceneCtrl.getGeographyOutlineScreenBbox();
    const o = g.outlineBbox;
    return { legend: r(document.getElementById("sky-legend")), edits: r(edits), slider: r(document.getElementById("timeslider-root")),
      outline: { l: Math.round(o.minX), r: Math.round(o.maxX), t: Math.round(o.minY), b: Math.round(o.maxY) }, vw: innerWidth, vh: innerHeight };
  });
  const inter = (a, o) => a && !(a.r <= o.l || a.l >= o.r || a.b <= o.t || a.t >= o.b);
  m.legendHitsOutline = inter(m.legend, m.outline);
  m.editsHitsOutline = inter(m.edits, m.outline);
  m.edgeMin = Math.round(Math.min(m.outline.l, m.vw - m.outline.r, m.outline.t, m.vh - m.outline.b));
  m.errors = errs.length;
  out[`${w}x${h}-${lang}`] = m;
  await page.screenshot({ path: `${SH}${shot}${tag === "after" ? "" : "-before"}.png` });
  await ctx.close();
}
console.log(JSON.stringify(out, null, 1));
await browser.close();
