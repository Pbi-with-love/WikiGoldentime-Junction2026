import { createRequire } from "module";
const require = createRequire("/opt/homebrew/lib/node_modules/@playwright/cli/node_modules/playwright-core/");
const { chromium } = require("playwright-core");
const browser = await chromium.launch({ executablePath: process.env.CHROME });
for (const [w, h, lang] of [[390, 844, "en"], [390, 844, "fi"], [1280, 720, "en"]]) {
  const page = await (await browser.newContext({ viewport: { width: w, height: h } })).newPage();
  await page.goto("http://127.0.0.1:4173/");
  await page.evaluate((l) => { localStorage.setItem("wikimemory.lang", l); sessionStorage.clear(); }, lang);
  await page.reload();
  await page.waitForFunction(() => window.__wikimemory?.sceneCtrl, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.click('.lens-btn[data-lens="geography"]'); await page.waitForTimeout(3500);
  const r = await page.evaluate(() => {
    const rect = (e) => e.getBoundingClientRect();
    const hdr = rect(document.getElementById("sky-top-bar")), sl = rect(document.getElementById("timeslider-root"));
    const labels = [...document.querySelectorAll(".projected-lens-guide")].filter((e) => e.offsetParent !== null);
    const bad = [];
    for (const e of labels) { const b = rect(e);
      if (b.left < 0 || b.right > innerWidth || b.top < 0 || b.bottom > innerHeight) bad.push(["outside", e.textContent]);
      if (!(b.right <= hdr.left || b.left >= hdr.right || b.bottom <= hdr.top || b.top >= hdr.bottom)) bad.push(["header", e.textContent]);
      if (!(b.right <= sl.left || b.left >= sl.right || b.bottom <= sl.top || b.top >= sl.bottom)) bad.push(["timeline", e.textContent]);
    }
    return { labels: labels.length, bad };
  });
  console.log(w, h, lang, JSON.stringify(r));
}
await browser.close();
