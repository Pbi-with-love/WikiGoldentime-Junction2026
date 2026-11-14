// Spec 033 bug 2: click Svenska/English in the Summary Trail (fi Moskovan rauha, Osio 5/13), time to trail card visible.
// Usage: node bug2_measure.mjs [runs]   (needs preview on :4173 and tunnel on :8002)
import { createRequire } from "module";
const require = createRequire("/opt/homebrew/lib/node_modules/@playwright/cli/node_modules/playwright-core/");
const { chromium } = require("playwright-core");
const RUNS = Number(process.argv[2] || 5);
const URL = "http://127.0.0.1:4173/";
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("requestfailed", (r) => errors.push("REQFAIL " + r.url()));
const out = [];
async function sliderYear() { return page.evaluate(() => document.querySelector("#timeslider-root")?.innerText?.replace(/\s+/g, " ").slice(0, 60)); }
async function trailText() { return page.evaluate(() => document.body.innerText); }
async function setup(lang) {
  await page.addInitScript((l) => { try { if (!sessionStorage.getItem("wmInit")) { localStorage.setItem("wikimemory.lang", l); sessionStorage.setItem("wmInit", "1"); } } catch {} }, lang);
}
await page.addInitScript(() => {
  const s = []; window.__samples = s;
  setInterval(() => {
    const l = document.getElementById("status-loading");
    const sl = document.querySelector('#timeslider-root [role="slider"]');
    s.push([Date.now(), l && !l.hidden ? 1 : 0, sl ? sl.getAttribute("aria-valuenow") : null, !!document.querySelector("#galaxy-canvas")]);
    try { sessionStorage.setItem("wmSamples", JSON.stringify(s.slice(-400))); } catch {}
  }, 20);
});
await page.goto(URL);
await page.evaluate(() => { localStorage.setItem("wikimemory.lang", "fi"); sessionStorage.clear(); });
await page.reload();
await page.waitForFunction(() => window.__wikimemory?.enterSummaryTrail, null, { timeout: 60000 });
await page.evaluate(() => window.__wikimemory.enterSummaryTrail({ lang: "fi", page_id: 1256, focusIdx: 8 }));
await page.waitForTimeout(4000);
const startText = await trailText();
console.log("fi start has Moskovan rauha:", /Moskovan rauha/i.test(startText));
async function hop(code, expect) {
  const t0 = Date.now();
  await page.click(`.lang-switch-btn[data-ui-lang="${code}"]`);
  const midYears = [];
  const iv = setInterval(async () => { try { midYears.push(await sliderYear()); } catch {} }, 150);
  await page.waitForFunction((re) => new RegExp(re, "i").test(JSON.stringify(window.__wikimemory?.ui?.getSummaryViewState?.()?.cardRef ?? "")), expect, { timeout: 60000, polling: 50 });
  clearInterval(iv);
  const t1 = Date.now();
  const split = null;
  const samples = await page.evaluate(() => window.__samples);
  const after = samples.filter((x) => x[0] >= t0);
  const years = [...new Set(after.map((x) => x[2]))];
  let maxLoad = 0, run = 0, prev = 0;
  for (const x of after) { if (x[1]) { run += prev ? x[0] - prev : 0; maxLoad = Math.max(maxLoad, run); prev = x[0]; } else { run = 0; prev = 0; } }
  return { total: t1 - t0, split, sliderYears: years, maxLoadingOverlayMs: maxLoad };
}
for (const [code, expect] of [["sv", "Fredsavtalet"], ["en", "Soviet breakthrough in February"]]) {
  const totals = [];
  for (let i = 0; i < RUNS; i++) {
    const r = await hop(code, expect);
    totals.push(r.total);
    console.log(code, i, JSON.stringify(r));
    // go back to fi/focus 4 for the next run
    await page.evaluate((l) => localStorage.setItem("wikimemory.lang", "fi"), code);
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    await page.waitForFunction(() => window.__wikimemory?.enterSummaryTrail, null, { timeout: 60000 });
    await page.evaluate(() => window.__wikimemory.enterSummaryTrail({ lang: "fi", page_id: 1256, focusIdx: 8 }));
    await page.waitForTimeout(3000);
  }
  totals.sort((a, b) => a - b);
  console.log(code, "median", totals[Math.floor(totals.length / 2)], "all", totals.join(","));
  // reset to match the next target
}
console.log("errors", errors.length, errors.slice(0, 5));
await browser.close();
