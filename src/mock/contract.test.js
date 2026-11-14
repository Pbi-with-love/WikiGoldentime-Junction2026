import test from "node:test";
import assert from "node:assert/strict";
import {
  MOCK,
  getStars,
  search,
  getArticle,
  getArticleTimeline,
  getGlobalTimeline,
  getAsOf,
  getDiff,
  ask,
  getThreads,
  getRoad,
  getTopicRoad,
  getSummary,
  getCompare,
} from "../api.js";
import { setMockConfig } from "./index.js";
import { ANNUAL_VERSIONS_CALIBRATION } from "./fixtures.js";

// Force mock mode by default so `npm test` always tests offline mocks regardless of src/api.js flags.
for (const key of Object.keys(MOCK)) {
  MOCK[key] = true;
}

const realEnv = process.env.REAL?.trim() ?? "";
if (realEnv) {
  const validKeys = Object.keys(MOCK);
  const realKeys = realEnv.split(",").map((k) => k.trim());
  for (const key of realKeys) {
    if (!Object.hasOwn(MOCK, key)) {
      throw new Error(
        `Unknown REAL key "${key}". Valid keys: ${validKeys.join(", ")}`
      );
    }
  }
  if (!process.env.API_BASE?.trim()) {
    throw new Error(
      "API_BASE must be set when REAL is non-empty (Node fetch needs an absolute URL, e.g. API_BASE=http://127.0.0.1:8002)."
    );
  }
  for (const key of realKeys) {
    MOCK[key] = false;
  }
}

// Keep contract tests fast while still testing latency and error modes explicitly
setMockConfig({ error: false, latency: false });

test("GET /api/stars respects Dataset S & M exact counts, keys, and verbatim examples", async () => {
  const stars = await getStars();
  assert.equal(stars.length, 29460, "Total stars must be 29,460");

  const counts = { fi: 0, sv: 0, en: 0 };
  let nullWikidata = 0;
  let historyCount = 0;
  const pkSet = new Set();
  const langsByWikidata = new Map();
  const starByKey = new Map();
  let warCount = 0;

  for (const s of stars) {
    assert.ok(["fi", "sv", "en"].includes(s.lang));
    counts[s.lang]++;

    const pk = `${s.lang}:${s.page_id}`;
    assert.ok(!pkSet.has(pk), `Duplicate primary key ${pk}`);
    pkSet.add(pk);
    starByKey.set(pk, s);

    assert.equal(typeof s.title, "string");
    assert.ok(s.url.startsWith(`https://${s.lang}.wikipedia.org/wiki/`));
    assert.equal(typeof s.length, "number");
    assert.ok(s.length >= 12);
    assert.ok(s.category === null || typeof s.category === "string");
    assert.equal(typeof s.x, "number");
    assert.equal(typeof s.y, "number");
    assert.equal(typeof s.z, "number");
    assert.ok(s.event_year === null || typeof s.event_year === "number");
    assert.ok(s.lat === null || typeof s.lat === "number");
    assert.ok(s.lon === null || typeof s.lon === "number");
    assert.equal(typeof s.has_history, "boolean");

    if (s.war_years !== undefined) {
      warCount++;
      assert.equal(s.lang, "fi");
      assert.ok(s.has_history && s.war_years.length > 0);
      assert.deepEqual(s.war_years, [...new Set(s.war_years)].sort((a, b) => a - b));
      assert.ok(s.war_years.every((y) => Number.isInteger(y) && y >= s.first_edit_year && y <= 2026));
    }

    if (s.has_history) {
      historyCount++;
      assert.equal(s.lang, "fi", "Only Finnish articles have history");
      assert.equal(typeof s.first_edit_year, "number");
    } else {
      assert.equal(s.first_edit_year, null, "first_edit_year must be null unless has_history");
    }

    assert.ok(s.created_year === null || (s.created_year >= 2001 && s.created_year <= 2026), "created_year 2001-2026 or null");

    if (s.wikidata_id === null) {
      nullWikidata++;
    } else {
      assert.match(s.wikidata_id, /^Q\d+$/);
      if (!langsByWikidata.has(s.wikidata_id)) {
        langsByWikidata.set(s.wikidata_id, new Set());
      }
      langsByWikidata.get(s.wikidata_id).add(s.lang);
    }
  }

  if (!MOCK.stars && !MOCK.timeline) {
    assert.ok(warCount >= 100, "real stars carry war_years");
    const tl = await getArticleTimeline(1256);
    const years = [...new Set(tl.months.filter((m) => m.disputes >= 3).map((m) => Number(m.month.slice(0, 4))))].sort((a, b) => a - b);
    assert.deepEqual(starByKey.get("fi:1256").war_years, years);
  }

  assert.equal(counts.fi, 19285);
  assert.equal(counts.sv, 4921);
  assert.equal(counts.en, 5254);
  assert.equal(nullWikidata, 410);
  // mock has 50 fixtures; real = fi articles with history (dataset M), derived from the data
  if (MOCK.stars) assert.equal(historyCount, 50);
  else assert.ok(historyCount >= 50 && historyCount <= counts.fi);

  let trilingualCount = 0;
  for (const langSet of langsByWikidata.values()) {
    if (langSet.size === 3) trilingualCount++;
  }
  assert.equal(trilingualCount, 2919, "Exactly 2,919 topics exist in all three languages");

  // Verbatim examples
  const verbatimExpected = [
    ["fi", 1256, "Q134949", "Talvisota", 78984],
    ["sv", 23612, "Q134949", "Vinterkriget", 20567],
    ["en", 33924, "Q134949", "Winter War", 113996],
    ["fi", 52097, "Q695285", "Moskovan rauhansopimus (1940)", 13219],
    ["sv", 426533, "Q695285", "Moskvafreden", 2425],
    ["en", 288706, "Q695285", "Moscow Peace Treaty", 4867],
    ["fi", 1150, "Q211855", "Suomen sisällissota", 124377],
    ["sv", 8414, "Q211855", "Finska inbördeskriget", 33282],
    ["en", 11772, "Q211855", "Finnish Civil War", 83931],
  ];

  for (const [lang, page_id, qid, title, len] of verbatimExpected) {
    const found = starByKey.get(`${lang}:${page_id}`);
    assert.ok(found, `Missing verbatim article ${lang}:${page_id}`);
    assert.equal(found.wikidata_id, qid);
    assert.equal(found.title, title);
    assert.equal(found.length, len);
  }

  // Named has_history=true Finnish articles
  const requiredHistoryIds = [
    1256, 1150, 440, 52097, 6021, 1275, 11446, 7650, 11444, 11477,
    6816, 34207, 162670, 8901, 11113, 18861, 11803, 218476, 9564, 5261,
  ];
  for (const pid of requiredHistoryIds) {
    const st = starByKey.get(`fi:${pid}`);
    assert.ok(st && st.has_history, `fi:${pid} must have has_history=true`);
  }
});

test("GET /api/search returns rows with cosine distance and 'also' language map", async () => {
  const res = await search("Talvisota", "", 10);
  assert.ok(Array.isArray(res.rows));
  assert.ok(res.rows.length > 0 && res.rows.length <= 10);

  const first = res.rows[0];
  assert.equal(typeof first.lang, "string");
  assert.equal(typeof first.page_id, "number");
  assert.equal(typeof first.title, "string");
  assert.equal(typeof first.url, "string");
  assert.ok(first.distance >= 0.35 && first.distance <= 0.65);

  if (res.rows.length >= 2) {
    // Real vector search top-2 gap on Talvisota is ~0.016 (0.5256 vs 0.5415)
    assert.ok(Math.abs(res.rows[1].distance - res.rows[0].distance) < 0.02);
  }

  assert.equal(typeof res.also, "object");
  assert.ok(Array.isArray(res.also.Q134949));
  assert.equal(res.also.Q134949.length, 2);
});

test("GET /api/article/{lang}/{page_id} returns exact article shape with Markdown and ISO UTC date", async () => {
  const art = await getArticle("fi", 1256);
  assert.equal(art.lang, "fi");
  assert.equal(art.page_id, 1256);
  assert.equal(typeof art.rev_id, "number");
  assert.equal(art.wikidata_id, "Q134949");
  assert.equal(art.title, "Talvisota");
  assert.match(art.date_modified, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  assert.ok(art.text.startsWith("# Talvisota\n"));
  assert.ok(Array.isArray(art.categories) && art.categories.length > 0);
  assert.ok(Array.isArray(art.other_languages) && art.other_languages.length === 2);
  assert.equal(art.has_history, true);
  assert.ok(art.thumb_url === null || typeof art.thumb_url === "string");
  assert.ok(art.thumb_file === null || typeof art.thumb_file === "string");
  assert.ok(art.image !== null && typeof art.image === "object" && !Array.isArray(art.image));
  assert.deepEqual(Object.keys(art.image).sort(), [
    "artist",
    "credit",
    "file_page_url",
    "license",
    "license_url",
    "thumb_url",
  ]);
  assert.equal(typeof art.image.thumb_url, "string");
  assert.equal(art.image.thumb_url, art.thumb_url);
  assert.equal(typeof art.image.file_page_url, "string");
  assert.ok(art.image.file_page_url.startsWith("https://commons.wikimedia.org/wiki/File:"));
  assert.ok(art.image.license === null || typeof art.image.license === "string");
  assert.ok(art.image.license_url === null || typeof art.image.license_url === "string");
  assert.ok(art.image.artist === null || typeof art.image.artist === "string");
  assert.ok(art.image.credit === null || typeof art.image.credit === "string");
});

test("GET /api/timeline and GET /api/timeline/{page_id} match calibrated versions and 404 rules", async () => {
  const globalTl = await getGlobalTimeline();
  assert.ok(Array.isArray(globalTl.months) && globalTl.months.length > 200);

  const byYear = {};
  for (const m of globalTl.months) {
    assert.match(m.month, /^\d{4}-\d{2}$/);
    const y = Number(m.month.slice(0, 4));
    byYear[y] = (byYear[y] || 0) + m.edits;
  }
  for (const [yearStr, expected] of Object.entries(ANNUAL_VERSIONS_CALIBRATION)) {
    assert.equal(byYear[Number(yearStr)], expected, `Year ${yearStr} version count mismatch`);
  }

  // Demo Path B: Talvisota timeline
  const talviTl = await getArticleTimeline(1256);
  assert.equal(talviTl.summary.versions, 2143);
  assert.equal(talviTl.summary.reverts, 328);
  assert.ok(talviTl.summary.war_months >= 1);
  assert.match(talviTl.summary.first_edit, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  assert.ok(talviTl.months.some((m) => m.disputes >= 3));

  const sisallisTl = await getArticleTimeline(1150);
  assert.equal(sisallisTl.summary.versions, 3357);

  // Non-history article must 404
  await assert.rejects(
    () => getArticleTimeline(23612),
    (err) => err.status === 404
  );
});

test("GET /api/asof/{page_id} and GET /api/diff/{page_id} support Demo Path B (2006 / 2012 / today)", async () => {
  const asof2006 = await getAsOf(1256, "2006-06-01 00:00:00");
  const asof2012 = await getAsOf(1256, "2012-06-01 00:00:00");
  const asofToday = await getAsOf(1256, "2026-10-01 00:00:00");

  assert.notEqual(asof2006.rev_id, asof2012.rev_id);
  assert.notEqual(asof2012.rev_id, asofToday.rev_id);
  assert.equal(asofToday.row_end, null);
  assert.ok(Array.isArray(asof2006.blocks) && asof2006.blocks.length > 0);
  for (const [tag, txt] of asof2006.blocks) {
    assert.ok(["h", "li", "p"].includes(tag));
    assert.equal(typeof txt, "string");
  }

  // Before creation -> 404
  await assert.rejects(
    () => getAsOf(52097, "2003-01-01 00:00:00"),
    (err) => err.status === 404
  );

  // Word diff
  const diff = await getDiff(1256, asof2006.rev_id, asofToday.rev_id);
  assert.ok(Array.isArray(diff.parts) && diff.parts.length > 0);
  assert.ok(diff.parts.some((p) => p.op === "edit" && Array.isArray(p.words)));
});

test("GET /api/ask supports Demo Path A (How did the Winter War end)", async () => {
  const res = await ask("How did the Winter War end");
  assert.equal(res.history_available, true);
  assert.ok(res.sources.length >= 1);

  if (MOCK.ask) {
    assert.ok(res.answer.includes("[mock]"));
    assert.deepEqual(res.top, { lang: "fi", page_id: 52097 });
    assert.equal(res.milestones.length, 3);
  } else {
    assert.ok(!res.answer.includes("[mock]"));
    assert.equal(res.pending, false);
    assert.equal(res.top.lang, "fi");
    assert.equal(typeof res.top.page_id, "number");
    assert.ok(res.milestones.length >= 2);
    assert.ok(Array.isArray(res.facts));
    for (const fact of res.facts) {
      assert.equal(typeof fact.text, "string");
      assert.ok(typeof fact.source_sentence === "string" && fact.source_sentence.length > 0);
      assert.ok(typeof fact.url === "string" && fact.url.includes("oldid="));
    }
  }

  res.milestones.forEach((ms, idx) => {
    assert.equal(typeof ms.from_year, "number");
    assert.equal(typeof ms.to_year, "number");
    assert.equal(typeof ms.answer, "string");
    assert.equal(typeof ms.rev_id, "number");
    assert.equal(typeof ms.user, "string");
    if (!MOCK.ask) {
      assert.equal(typeof ms.found, "boolean");
      assert.ok(typeof ms.url === "string" && ms.url.includes("oldid="));
      assert.ok(Object.hasOwn(ms, "changed_by"), `Milestone ${idx} must have changed_by key`);
      if (idx === 0) {
        assert.equal(ms.changed_by, null, "First milestone changed_by must be null");
      } else if (ms.changed_by !== null) {
        assert.equal(typeof ms.changed_by, "object");
        assert.equal(typeof ms.changed_by.rev_id, "number");
        assert.ok(typeof ms.changed_by.url === "string" && ms.changed_by.url.includes("oldid="));
      }
      assert.ok(Array.isArray(ms.facts));
      for (const fact of ms.facts) {
        assert.ok(typeof fact.source_sentence === "string" && fact.source_sentence.length > 0);
        assert.ok(typeof fact.url === "string" && fact.url.includes("oldid="));
      }
    }
  });

  // Non-history article ask returns history_available=false and empty milestones in mock mode;
  // live DB now indexes history for all 19,285 fi articles (including Engel via fi sibling).
  const noHistQuery = MOCK.ask ? "Vinterkriget" : "Who was Carl Ludvig Engel?";
  const noHist = await ask(noHistQuery);
  if (!MOCK.ask) {
    assert.equal(noHist.pending, false);
    assert.ok(!noHist.answer.includes("[mock]"));
    assert.equal(typeof noHist.history_available, "boolean");
    assert.ok(Array.isArray(noHist.milestones));
  } else {
    assert.equal(noHist.history_available, false);
    assert.deepEqual(noHist.milestones, []);
  }

  // Translated ask (?ui=sv) returns out_lang="sv" and preserves grounded original-language sources
  const resSv = await ask("How did the Winter War end?", "sv");
  assert.equal(resSv.history_available, true);
  assert.equal(resSv.out_lang, "sv");
  assert.ok(Array.isArray(resSv.sources) && resSv.sources.length >= 1);
  assert.ok(Array.isArray(resSv.milestones) && resSv.milestones.length >= 2);
  const milestoneShape = (msList) =>
    msList.map((ms) => [ms.from_year, ms.to_year, ms.changed_by?.rev_id ?? null]);
  assert.deepEqual(milestoneShape(resSv.milestones), milestoneShape(res.milestones));
  if (MOCK.ask) {
    assert.ok(resSv.answer.includes("[mock] (sv)"));
    const pendingFirst = await ask("mockpending question", "en");
    assert.equal(pendingFirst.pending, true);
    assert.equal(pendingFirst.progress.years_total, 12);
    const pendingSecond = await ask("mockpending question", "en");
    assert.equal(pendingSecond.pending, false);
    assert.equal(pendingSecond.out_lang, "en");
  } else {
    assert.equal(resSv.pending, false);
    assert.ok(!resSv.answer.includes("[mock]"));
    for (const fact of resSv.facts || []) {
      assert.ok(typeof fact.source_sentence === "string" && fact.source_sentence.length > 0);
      assert.ok(typeof fact.url === "string" && fact.url.includes("oldid="));
    }
  }
});

test("GET /api/threads supports Demo Path C (5-hop chain from 52097 with ghost thread)", async () => {
  const visited = [];
  let current = { lang: "fi", page_id: 52097 };

  for (let hop = 0; hop < 5; hop++) {
    const res = await getThreads(current.lang, current.page_id, visited);
    assert.ok(Array.isArray(res.threads));
    assert.ok(res.threads.length >= 1 && res.threads.length <= 4);

    if (!MOCK.threads) {
      for (const t of res.threads) {
        assert.equal(typeof t.target.x, "number");
        assert.ok(["before", "after", "semantic"].includes(t.type));
        assert.ok(!t.summary.includes("[mock]"));
      }
    }
    if (MOCK.threads && hop === 0) {
      const ghost = res.threads.find((t) => t.type === "ghost");
      assert.ok(ghost, "Hop 0 from 52097 must include a ghost thread");
      assert.equal(ghost.first_year, 2007);
      assert.equal(ghost.removed_year, 2014);
    }

    visited.push(current.page_id);
    current = {
      lang: res.threads[0].target.lang,
      page_id: res.threads[0].target.page_id,
    };
  }

  assert.equal(visited.length, 5);

  // Source without history must not return ghost threads
  const svThreads = await getThreads("sv", 23612, []);
  assert.ok(svThreads.threads.every((t) => t.type !== "ghost"));
});

test("GET /api/road/{lang}/{page_id} returns station-based Talvitie fixtures (Talvisota 13 stations, Suomen sisällissota 11 stations, Moskovan rauhansopimus 5 stations)", async () => {
  const talviRoad = await getRoad("fi", 1256);
  assert.deepEqual(talviRoad.article, {
    lang: "fi",
    page_id: 1256,
    wikidata_id: "Q134949",
    title: "Talvisota",
    url: "https://fi.wikipedia.org/wiki/Talvisota",
    words: 8395,
    reading_minutes: 35,
    has_history: true,
  });

  // Also works with object argument
  const talviRoadObj = await getRoad({ lang: "fi", page_id: 1256 });
  assert.equal(talviRoadObj.stations.length, 13);

  const expectedTalvi = [
    [1, "Tausta", 2978, 12],
    [2, "Joukot", 320, 2],
    [3, "Suomen torjuntavoitot joulu- ja tammikuussa", 504, 2],
    [4, "Puna-armeijan suurhyökkäys helmikuussa", 663, 3],
    [5, "Moskovan rauha", 842, 4],
    [6, "Osapuolten heikkoudet ja vahvuudet", 761, 3],
    [7, "Talvisodan sotatalous Suomessa", 163, 1],
    [8, "Osapuolten tappiot", 345, 2],
    [9, "Alueluovutukset ja väestön uudelleensijoitus", 63, 1],
    [10, "Ulkomaiden roolit ja apu", 399, 2],
    [11, "Talvisodan seurauksista ja merkityksestä", 761, 3],
    [12, "Kunniamerkit", 38, 1],
    [13, "Talvisota taiteessa ja viihteessä", 117, 1],
  ];

  assert.equal(talviRoad.stations.length, 13);
  for (let i = 0; i < expectedTalvi.length; i++) {
    const [no, heading, words, mins] = expectedTalvi[i];
    const st = talviRoad.stations[i];
    assert.equal(st.no, no);
    assert.equal(st.heading, heading);
    assert.equal(st.words, words);
    assert.equal(st.reading_minutes, mins);
    if (MOCK.road) assert.ok(st.summary.includes("[mock]"));
    if (MOCK.road) assert.ok(st.text.includes("[mock]"));
    assert.ok(Array.isArray(st.facts) && st.facts.length <= 3);
    assert.ok(Array.isArray(st.years));
    assert.ok(Array.isArray(st.posts));
    assert.ok(st.history && typeof st.history.added_year === "number");
    assert.equal(typeof st.history.changes, "number");
    assert.ok(Array.isArray(st.history.war_years));
    assert.equal(st.lanes.fi, true);
    assert.ok(st.lanes.sv === null || (st.lanes.sv >= 0 && st.lanes.sv <= 1));
    assert.ok(st.lanes.en === null || (st.lanes.en >= 0 && st.lanes.en <= 1));
    assert.ok(Array.isArray(st.branches) && st.branches.length <= 2);
  }

  assert.equal(talviRoad.stations[0].posts.length, 9);
  assert.deepEqual(talviRoad.stations[11].years, []);
  assert.equal(talviRoad.ghost_stations.length, 1);
  if (MOCK.road) assert.ok(talviRoad.ghost_stations[0].text.includes("[mock]"));

  // Suomen sisällissota (1150) — 11 stations
  const sisallisRoad = await getRoad("fi", 1150);
  assert.equal(sisallisRoad.article.title, "Suomen sisällissota");
  assert.equal(sisallisRoad.article.words, 13399);
  assert.equal(sisallisRoad.article.reading_minutes, 56);
  assert.equal(sisallisRoad.stations.length, 11);

  const expectedSisallisWords = [163, 671, 4000, 858, 4500, 1420, 353, 420, 69, 81, 555];
  sisallisRoad.stations.forEach((st, idx) => {
    assert.equal(st.no, idx + 1);
    assert.equal(st.words, expectedSisallisWords[idx]);
  });
  assert.deepEqual(sisallisRoad.stations[6].years, []);
  assert.deepEqual(sisallisRoad.stations[9].years, []);
  assert.equal(sisallisRoad.ghost_stations.length, 1);

  // Moskovan rauhansopimus (1940) (52097) — 5 stations
  const moskovaRoad = await getRoad("fi", 52097);
  assert.equal(moskovaRoad.article.words, 2150);
  assert.equal(moskovaRoad.stations.length, 5);
  assert.equal(moskovaRoad.ghost_stations.length, 1);

  // Short non-history article (sv:426533 Moskvafreden, length 2425 < 9000)
  const shortRoad = await getRoad("sv", 426533);
  assert.equal(shortRoad.article.has_history, false);
  assert.ok(shortRoad.stations.length < 4 && shortRoad.article.words < 1500);
  assert.ok(shortRoad.stations.every((st) => st.history === null));
  assert.deepEqual(shortRoad.ghost_stations, []);
});

test("GET /api/topic-road supports Option A Topic Road fixtures (Talvisota, Suomen sisällissota, Autonomian aika)", async () => {
  const autonomia = await getTopicRoad({ category: "Suomen suuriruhtinaskunta" });
  assert.equal(
    autonomia.topic.category,
    MOCK["topic-road"] ? "Autonomian aika" : "Suomen suuriruhtinaskunta"
  );
  assert.ok(Array.isArray(autonomia.eras) && autonomia.eras.length >= 3);
  assert.ok(Array.isArray(autonomia.events) && autonomia.events.length >= 10);
  if (MOCK["topic-road"]) assert.ok(autonomia.events[0].summary_short.includes("[mock]"));
  else assert.ok(autonomia.events.every((ev) => !String(ev.summary_short || "").includes("[mock]")));

  const talviTopic = await getTopicRoad({ lang: "fi", page_id: 1256 });
  assert.equal(talviTopic.topic.title, "Talvisota");
  assert.ok(talviTopic.events.length >= 10);

  const sisallisTopic = await getTopicRoad({ lang: "fi", page_id: 1150 });
  assert.equal(sisallisTopic.topic.title, "Suomen sisällissota");
  assert.ok(sisallisTopic.events.length >= 10);

  const svTopic = await getTopicRoad({ lang: "sv", page_id: 23612 });
  assert.ok(Array.isArray(svTopic.events) && svTopic.events.length >= 5);

  if (!MOCK["topic-road"]) {
    const seeds = talviTopic.events.filter((ev) => ev.why?.kind === "seed");
    assert.equal(seeds.length, 1);
    assert.equal(seeds[0].page_id, 1256);

    const wds = talviTopic.events.map((ev) => ev.wikidata_id).filter(Boolean);
    assert.equal(new Set(wds).size, wds.length, "No duplicate wikidata_id in topic-road");

    let seenNull = false;
    let prevYear = -Infinity;
    for (const ev of talviTopic.events) {
      assert.ok(!String(ev.summary_short || "").includes("[mock]"));
      assert.ok(!String(ev.summary_long || "").includes("[mock]"));
      assert.ok(!String(ev.summary_short || "").startsWith("#"));
      if (ev.event_year === null) {
        seenNull = true;
      } else {
        assert.equal(seenNull, false, "Undated stations must appear only at the end");
        assert.ok(ev.event_year >= prevYear, "Dated years must be non-decreasing");
        prevYear = ev.event_year;
      }
    }

    for (const road of [talviTopic, sisallisTopic]) {
      for (const ev of road.events) {
        for (const lg of ev.lanes) {
          const sib = ev.siblings[lg];
          const lead = String(sib?.summary_short || "");
          assert.ok(lead && !lead.includes("[mock]") && !lead.startsWith("#"), `sibling lead ${ev.title} ${lg}`);
          if (lg === ev.lang) assert.equal(sib.summary_short, ev.summary_short);
        }
      }
    }

    const talviKeys = new Set(talviTopic.events.map((ev) => `${ev.lang}:${ev.page_id}`));
    const sisallisKeys = new Set(sisallisTopic.events.map((ev) => `${ev.lang}:${ev.page_id}`));
    assert.notDeepEqual([...talviKeys].sort(), [...sisallisKeys].sort());
  }
});

test("GET /api/summary/{lang}/{page_id} returns 3D Summary Trail fixtures, Jatkosota, and short-article overview-only responses", async () => {
  const normWs = (s) => String(s || "").replace(/\s+/g, " ").trim();
  const assertFactShape = (f) => {
    assert.equal(typeof f.label, "string");
    assert.ok(f.label.length > 0);
    assert.equal(typeof f.value, "string");
    assert.ok(f.value.length > 0);
    assert.equal(typeof f.source, "string");
    assert.ok(f.source.length > 0);
  };
  const assertLongSummaryShape = (sum, expectedTitle, { expectHistory = true } = {}) => {
    assert.equal(sum.article.title, expectedTitle);
    assert.ok(sum.article.words >= 1500);
    assert.ok(sum.article.reading_minutes >= 1);
    assert.equal(sum.article.has_history, expectHistory);
    assert.equal(typeof sum.rev_id, "number");
    assert.ok(typeof sum.tldr === "string" && sum.tldr.length > 0);
    assert.ok(Array.isArray(sum.facts) && sum.facts.length <= 3);
    for (const f of sum.facts) assertFactShape(f);

    if (MOCK.summary) {
      assert.equal(sum.mode, "mock");
      assert.ok(sum.tldr.includes("[mock]"));
      assert.ok(sum.facts.length > 0);
    } else {
      assert.ok(["llm", "extractive"].includes(sum.mode));
      assert.ok(!sum.tldr.includes("[mock]"));
    }

    assert.ok(Array.isArray(sum.sections) && sum.sections.length >= 4);
    sum.sections.forEach((sec, idx) => {
      assert.equal(sec.no, idx + 1);
      assert.ok(typeof sec.heading === "string" && sec.heading.length > 0);
      assert.ok(typeof sec.words === "number" && sec.words >= 20);
      assert.ok(typeof sec.reading_minutes === "number" && sec.reading_minutes >= 1);
      assert.ok(typeof sec.one_line === "string" && sec.one_line.length > 0);
      assert.ok(typeof sec.summary === "string" && sec.summary.length > 0);
      assert.ok(Array.isArray(sec.facts) && sec.facts.length <= 3);
      for (const f of sec.facts) {
        assertFactShape(f);
        if (!MOCK.summary) {
          assert.ok(
            normWs(sec.text).includes(normWs(f.source)),
            `Section ${sec.heading} fact source not found in sec.text: ${f.source}`
          );
        }
      }
      assert.ok(typeof sec.text === "string" && sec.text.startsWith("## "));
      if (MOCK.summary) {
        assert.ok(sec.one_line.includes("[mock]"));
        assert.ok(sec.summary.includes("[mock]"));
        assert.ok(sec.text.includes("[mock]"));
      } else {
        assert.ok(!sec.one_line.includes("[mock]"));
        assert.ok(!sec.summary.includes("[mock]"));
        assert.ok(!sec.text.includes("[mock]"));
      }
      if (expectHistory) {
        assert.ok(sec.history && typeof sec.history.added_year === "number");
        assert.equal(typeof sec.history.changes, "number");
        assert.ok(Array.isArray(sec.history.war_years));
      } else {
        assert.equal(sec.history, null);
      }
    });

    assert.ok(Array.isArray(sum.ghost_sections));
    for (const g of sum.ghost_sections) {
      assert.equal(typeof g.after_no, "number");
      assert.ok(typeof g.heading === "string" && g.heading.length > 0);
      assert.equal(typeof g.from_year, "number");
      assert.equal(typeof g.removed_year, "number");
      assert.equal(typeof g.text, "string");
      assert.equal(typeof g.oldid, "number");
    }
  };

  // 1. Talvisota (1256)
  const talviSummary = await getSummary("fi", 1256);
  assertLongSummaryShape(talviSummary, "Talvisota");
  if (MOCK.summary) {
    assert.equal(talviSummary.article.words, 8395);
    assert.equal(talviSummary.article.reading_minutes, 35);
    assert.equal(talviSummary.sections.length, 13);
    assert.equal(talviSummary.ghost_sections.length, 1);
  }

  // 2. Suomen sisällissota (1150)
  const sisallisSummary = await getSummary("fi", 1150);
  assertLongSummaryShape(sisallisSummary, "Suomen sisällissota");
  if (MOCK.summary) {
    assert.equal(sisallisSummary.sections.length, 11);
    assert.equal(sisallisSummary.ghost_sections.length, 1);
  }

  // 3. Jatkosota (440)
  const jatkoSummary = await getSummary("fi", 440);
  assertLongSummaryShape(jatkoSummary, "Jatkosota");
  if (MOCK.summary) {
    assert.equal(jatkoSummary.sections.length, 10);
    assert.equal(jatkoSummary.sections[2].heading, "Hyökkäysvaihe");
    assert.equal(jatkoSummary.sections[3].heading, "Asemasotavaihe");
    assert.equal(jatkoSummary.ghost_sections.length, 1);
  }

  // Real-mode top-level fact grounding check against the real article text from API_BASE
  if (!MOCK.summary) {
    const apiBase = (process.env.API_BASE || "").replace(/\/+$/, "");
    for (const [sum, pid] of [
      [talviSummary, 1256],
      [sisallisSummary, 1150],
      [jatkoSummary, 440],
    ]) {
      if (sum.facts.length > 0) {
        const artRes = await fetch(`${apiBase}/api/article/fi/${pid}`);
        assert.equal(artRes.status, 200);
        const artJson = await artRes.json();
        const normArt = normWs(artJson.text);
        for (const f of sum.facts) {
          assert.ok(
            normArt.includes(normWs(f.source)),
            `Top-level fact source for fi:${pid} not found in article text: ${f.source}`
          );
        }
      }
    }
  }

  // 4. Short article (sv:426533 Moskvafreden, < 1,500 words / < 4 sections) -> Card 0 only (sections: [])
  const shortSummary = await getSummary("sv", 426533);
  assert.equal(shortSummary.article.title, "Moskvafreden");
  assert.equal(typeof shortSummary.rev_id, "number");
  if (MOCK.summary) {
    assert.equal(shortSummary.mode, "mock");
    assert.ok(shortSummary.tldr.includes("[mock]"));
  } else {
    assert.ok(["llm", "extractive"].includes(shortSummary.mode));
    assert.ok(!shortSummary.tldr.includes("[mock]"));
  }
  assert.ok(Array.isArray(shortSummary.facts) && shortSummary.facts.length <= 3);
  for (const f of shortSummary.facts) assertFactShape(f);
  assert.deepEqual(shortSummary.sections, []);
  assert.deepEqual(shortSummary.ghost_sections, []);

  // 5. Native sibling switch (?ui=sv, ?ui=en for fi:1256) returns native sv/en summary + fi_history + history_status
  const expectedTitles = { sv: "Vinterkriget", en: "Winter War" };
  for (const targetUi of ["sv", "en"]) {
    const natRes = await getSummary("fi", 1256, targetUi);
    assertLongSummaryShape(natRes, expectedTitles[targetUi], { expectHistory: false });
    assert.equal(natRes.variant, "native");
    assert.equal(natRes.article.lang, targetUi);
    assert.notEqual(natRes.article.page_id, 1256);
    assert.equal(natRes.requested.page_id, 1256);
    assert.equal(natRes.out_lang, targetUi);
    assert.ok(["ready", "building", "none"].includes(natRes.history_status));
    if (!MOCK.summary) {
      assert.equal(natRes.mode, "llm");
      assert.equal(natRes.history_status, "ready");
      const apiBase = (process.env.API_BASE || "").replace(/\/+$/, "");
      const artRes = await fetch(`${apiBase}/api/article/${targetUi}/${natRes.article.page_id}`);
      assert.equal(artRes.status, 200);
      const artJson = await artRes.json();
      const normArt = normWs(artJson.text);
      for (const f of natRes.facts) {
        assert.ok(
          normArt.includes(normWs(f.source)),
          `Native ${targetUi} summary top-level fact source not found in ${targetUi}:${natRes.article.page_id}: ${f.source}`
        );
      }
      assert.ok(natRes.fi_history && natRes.fi_history.article.page_id === 1256);
      assert.ok(Array.isArray(natRes.fi_history.ghost_sections) && natRes.fi_history.ghost_sections.length >= 1);
    } else {
      assert.ok(natRes.tldr.includes("[mock]"));
      assert.equal(natRes.history_status, "ready");
      assert.ok(natRes.fi_history && natRes.fi_history.article.page_id === 1256);
    }
  }

  // 6. Translated summary (?ui=sv for untranslated history article T)
  // Per coordinator decision: mock uses 306897 via mock fixtures (no edit to src/mock/stars.js); real uses 966363 ('Suomi 1980-luvulla')
  const untranslatedPid = MOCK.summary ? 306897 : 966363;
  const tDefault = await getSummary("fi", untranslatedPid);
  const tSv = await getSummary("fi", untranslatedPid, "sv");
  assert.equal(tSv.variant, "translated");
  assert.equal(tSv.out_lang, "sv");
  assert.equal(tSv.article.lang, "fi");
  assert.ok(["ready", "building", "none"].includes(tSv.history_status));
  assert.equal(tSv.rev_id, tDefault.rev_id);
  assert.equal(tSv.sections.length, tDefault.sections.length);
  for (let i = 0; i < tDefault.sections.length; i++) {
    assert.equal(tSv.sections[i].no, tDefault.sections[i].no);
    assert.equal(tSv.sections[i].heading, tDefault.sections[i].heading);
    assert.equal(tSv.sections[i].text, tDefault.sections[i].text);
    assert.deepEqual(tSv.sections[i].history, tDefault.sections[i].history);
    assert.deepEqual(
      (tSv.sections[i].facts || []).map((f) => f.source),
      (tDefault.sections[i].facts || []).map((f) => f.source)
    );
  }
  assert.deepEqual(tSv.ghost_sections, tDefault.ghost_sections);
  assert.deepEqual(
    (tSv.facts || []).map((f) => f.source),
    (tDefault.facts || []).map((f) => f.source)
  );
  if (MOCK.summary) {
    assert.ok(tSv.tldr.includes("[mock] (sv)"));
  } else {
    assert.equal(tSv.mode, "llm");
  }
});

test("GET /api/compare/{lang}/{page_id} matches cross-language compare contract", async () => {
  const res = await getCompare("fi", 1256);
  const sumRes = MOCK.compare
    ? await getSummary("fi", 1256)
    : await fetch(`${process.env.API_BASE.replace(/\/+$/, "")}/api/summary/fi/1256`).then((r) => r.json());

  assert.equal(res.article.lang, "fi");
  assert.equal(res.article.page_id, 1256);
  assert.equal(typeof res.article.title, "string");
  assert.ok(res.article.title.length > 0);
  assert.equal(typeof res.threshold, "number");
  assert.ok(res.threshold > 0 && res.threshold < 1);

  assert.ok(res.siblings && typeof res.siblings === "object");
  for (const sibLang of ["sv", "en"]) {
    const sib = res.siblings[sibLang];
    assert.ok(sib && typeof sib === "object", `Talvisota should have ${sibLang} sibling`);
    assert.equal(typeof sib.page_id, "number");
    assert.equal(typeof sib.title, "string");
    assert.ok(sib.url.startsWith(`https://${sibLang}.wikipedia.org/wiki/`));
  }

  assert.ok(Array.isArray(res.sections));
  assert.equal(res.sections.length, sumRes.sections.length);
  for (let i = 0; i < res.sections.length; i++) {
    assert.equal(res.sections[i].no, sumRes.sections[i].no);
    assert.equal(res.sections[i].heading, sumRes.sections[i].heading);
  }

  let sawMatch = false;
  let sawNoMatch = false;
  for (const sec of res.sections) {
    for (const sibLang of ["sv", "en"]) {
      const slot = sec[sibLang];
      if (res.siblings[sibLang] === null) {
        assert.equal(slot, null);
        continue;
      }
      if (slot === null) continue;
      assert.equal(typeof slot.match, "boolean");
      assert.equal(typeof slot.distance, "number");
      assert.equal(slot.match, slot.distance <= res.threshold);
      if (slot.match) {
        sawMatch = true;
        assert.ok(slot.section === null || typeof slot.section === "string");
        assert.equal(typeof slot.passage, "string");
        assert.ok(slot.passage.trim().length > 0);
        assert.equal(typeof slot.url, "string");
        assert.ok(slot.url.startsWith(`https://${sibLang}.wikipedia.org/wiki/`));
        if (MOCK.compare) {
          assert.ok(slot.passage.includes("[mock]"));
        } else {
          assert.ok(!slot.passage.includes("[mock]"));
        }
      } else {
        sawNoMatch = true;
        assert.equal(slot.section, null);
        assert.equal(slot.passage, null);
        assert.equal(slot.url, null);
      }
    }
  }
  assert.ok(sawMatch && sawNoMatch, "Expected both matching and non-matching slots in fi:1256");

  // Single-sibling (en only, sv missing)
  const enOnlyPid = MOCK.compare ? 304670 : 19086;
  const enOnlyRes = await getCompare("fi", enOnlyPid);
  assert.equal(enOnlyRes.siblings.sv, null);
  assert.ok(enOnlyRes.siblings.en !== null);
  for (const sec of enOnlyRes.sections) {
    assert.equal(sec.sv, null);
  }

  // No-sibling article (both sv and en missing)
  const noSibPid = MOCK.compare ? 306770 : 6869;
  const noSibRes = await getCompare("fi", noSibPid);
  assert.equal(noSibRes.siblings.sv, null);
  assert.equal(noSibRes.siblings.en, null);
  for (const sec of noSibRes.sections) {
    assert.equal(sec.sv, null);
    assert.equal(sec.en, null);
  }

  // Non-Finnish article -> 404
  await assert.rejects(
    () => getCompare("sv", 23612),
    (err) => err && (err.status === 404 || /404/.test(String(err.message)))
  );
});

test("Simulated error mode (?mockError=1 / setMockConfig) rejects properly", { skip: !MOCK.stars }, async () => {
  setMockConfig({ error: true, latency: false });
  await assert.rejects(() => getStars(), /Simulated network error/);
  setMockConfig({ error: false, latency: true });
});
