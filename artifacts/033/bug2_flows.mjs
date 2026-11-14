import { createRequire } from "module";
const require = createRequire("/opt/homebrew/lib/node_modules/@playwright/cli/node_modules/playwright-core/");
const { chromium } = require("playwright-core");
const SH = "artifacts/screenshots/033/";
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errs = [], bad = [];
page.on("console", (m) => m.type() === "error" && errs.push(m.text()));
page.on("response", (r) => r.status() >= 400 && bad.push(r.status() + " " + r.url()));
const boot = async (lang) => {
  await page.goto("http://127.0.0.1:4173/");
  await page.evaluate((l) => { localStorage.setItem("wikimemory.lang", l); sessionStorage.clear(); }, lang);
  await page.reload();
  await page.waitForFunction(() => window.__wikimemory?.enterSummaryTrail, null, { timeout: 60000 });
};
const text = () => page.evaluate(() => document.body.innerText);
const sw = async (code) => { await page.click(`.lang-switch-btn[data-ui-lang="${code}"]`); await page.waitForFunction(() => window.__wikimemory?.enterSummaryTrail || window.__wikimemory, null, { timeout: 60000 }); await page.waitForTimeout(2500); };
const res = {};
// Trail fi -> sv -> en
await boot("fi");
await page.evaluate(() => window.__wikimemory.enterSummaryTrail({ lang: "fi", page_id: 1256, focusIdx: 8 }));
await page.waitForTimeout(3500); await page.screenshot({ path: SH + "03-fi.png" });
await page.click('.lang-switch-btn[data-ui-lang="sv"]'); await page.waitForTimeout(120); await page.screenshot({ path: SH + "04-mid-switch.png" });
await page.waitForFunction(() => /Fredsavtalet/i.test(JSON.stringify(window.__wikimemory?.ui?.getSummaryViewState?.()?.cardRef ?? "")), null, { timeout: 30000 }); await page.waitForTimeout(1500);
await page.screenshot({ path: SH + "05-sv.png" }); res.sv = await page.evaluate(() => window.__wikimemory.ui.getSummaryViewState().cardRef.heading);
await page.click('.lang-switch-btn[data-ui-lang="en"]');
await page.waitForFunction(() => /Soviet breakthrough in February/i.test(JSON.stringify(window.__wikimemory?.ui?.getSummaryViewState?.()?.cardRef ?? "")), null, { timeout: 30000 }); await page.waitForTimeout(1500);
await page.screenshot({ path: SH + "06-en.png" }); res.en = await page.evaluate(() => window.__wikimemory.ui.getSummaryViewState().cardRef.heading);
// road station 5 fi -> en
await boot("fi");
await page.evaluate(() => window.__wikimemory.enterTalvitieRoad({ lang: "fi", page_id: 1256, mode: "topic", stationIndex: 5 }));
await page.waitForTimeout(3500);
await page.click('.lang-switch-btn[data-ui-lang="en"]'); await page.waitForTimeout(5000);
await page.screenshot({ path: SH + "07-road-en.png" });
res.road = await page.evaluate(() => ({ road: window.__wikimemory.sceneCtrl.isRoadMode?.(), trail: window.__wikimemory.sceneCtrl.isSummaryTrailMode?.() }));
// Ask hero en -> fi
await boot("en");
await page.fill("#search-input", "How did the Winter War end?"); await page.press("#search-input", "Enter");
await page.waitForTimeout(6000);
const askBefore = await text();
await page.click('.lang-switch-btn[data-ui-lang="fi"]'); await page.waitForTimeout(6000);
await page.screenshot({ path: SH + "07-ask-fi.png" });
res.ask = { before: /Winter War|1940|1939/.test(askBefore), afterQuery: await page.inputValue("#search-input") };
// overview -> Suomi, ghost -> English: summary trail focusIdx 0 then fi
await boot("en");
await page.evaluate(() => window.__wikimemory.enterSummaryTrail({ lang: "fi", page_id: 1256, focusIdx: 0 }));
await page.waitForTimeout(3500);
await page.click('.lang-switch-btn[data-ui-lang="fi"]'); await page.waitForTimeout(5000);
await page.screenshot({ path: SH + "07-overview-fi.png" });
res.overview = await page.evaluate(() => window.__wikimemory.sceneCtrl.isSummaryTrailMode?.());
console.log(JSON.stringify(res), "console errors:", errs.length, errs.slice(0, 3), "http>=400:", bad.length, bad.slice(0, 3));
await browser.close();
