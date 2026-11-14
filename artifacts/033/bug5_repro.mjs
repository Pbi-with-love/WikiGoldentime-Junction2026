// Spec 033 bug 5: open star fi:8646 (created 2004), press Home on the slider (2001): no asof 404, no console error.
import { createRequire } from "module";
const require = createRequire("/opt/homebrew/lib/node_modules/@playwright/cli/node_modules/playwright-core/");
const { chromium } = require("playwright-core");
const tag = process.argv[2] || "run";
const browser = await chromium.launch({ executablePath: process.env.CHROME });
for (const lang of ["en", "fi", "sv"]) {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  const errs = [], bad = [], asof = [];
  page.on("console", (m) => m.type() === "error" && errs.push(m.text()));
  page.on("response", (r) => { if (r.status() >= 400) bad.push(r.status() + " " + r.url()); if (r.url().includes("/api/asof/8646")) asof.push(r.status() + " " + r.url().split("?")[1]); });
  await page.goto("http://127.0.0.1:4173/");
  await page.evaluate((l) => { localStorage.setItem("wikimemory.lang", l); sessionStorage.clear(); }, lang);
  await page.reload();
  await page.waitForFunction(() => window.__wikimemory?.openStarArticle, null, { timeout: 60000 });
  await page.waitForTimeout(1000);
  await page.evaluate(() => window.__wikimemory.openStarArticle("fi", 8646, { glide: false, openTab: "history" }));
  await page.waitForTimeout(3500);
  const open1 = await page.evaluate(() => window.__wikimemory.ui.isPanelOpen());
  await page.focus('#timeslider-root [role="slider"]');
  await page.keyboard.press("Home");
  await page.waitForTimeout(2500);
  const open2 = await page.evaluate(() => window.__wikimemory.ui.isPanelOpen());
  const year = await page.evaluate(() => document.querySelector('#timeslider-root [role="slider"]').getAttribute("aria-valuenow"));
  if (lang === "en") await page.screenshot({ path: `artifacts/screenshots/033/12-asof-scrub-${tag}.png` });
  console.log(lang, JSON.stringify({ panelBefore: open1, panelAfter: open2, sliderYear: year, asof, http4xx: bad, consoleErrors: errs }));
}
await browser.close();
