import test from "node:test";
import assert from "node:assert/strict";
import {
  SUPPORTED,
  STRINGS,
  STORAGE_KEY,
  detectLang,
  t,
  fmtNumber,
  fmtDate,
  langName,
  mtFromLabel,
  askBasedOnLabel,
  fallbackNoteText,
  setLang,
  VIEW_STATE_STORAGE_KEY,
  normalizeViewState,
  saveViewState,
  consumeViewState,
  peekViewState,
  saveReloadCache,
  takeReloadCache,
} from "./i18n.js";
import { getAskProvenance } from "./ui.js";

test("STRINGS tables for fi, sv, en have identical key sets and non-empty values", () => {
  const enKeys = Object.keys(STRINGS.en).sort();
  for (const code of SUPPORTED) {
    const keys = Object.keys(STRINGS[code]).sort();
    assert.deepEqual(keys, enKeys, `Key mismatch for language '${code}'`);
    for (const key of keys) {
      const val = STRINGS[code][key];
      if (val && typeof val === "object") {
        assert.ok(typeof val.one === "string" && val.one.trim().length > 0, `${code}.${key}.one must be non-empty`);
        assert.ok(typeof val.other === "string" && val.other.trim().length > 0, `${code}.${key}.other must be non-empty`);
      } else {
        assert.ok(typeof val === "string" && val.trim().length > 0, `${code}.${key} must be non-empty string`);
      }
    }
  }
});

test("detectLang resolves navigator.language, saved preference, and handles throwing storage", () => {
  assert.equal(detectLang("fi-FI", null), "fi");
  assert.equal(detectLang("sv-SE", null), "sv");
  assert.equal(detectLang("sv-FI", null), "sv");
  assert.equal(detectLang("de-DE", null), "en");
  assert.equal(detectLang("", null), "en");

  const validStorage = {
    getItem(key) {
      return key === STORAGE_KEY ? "sv" : null;
    },
  };
  assert.equal(detectLang("fi-FI", validStorage), "sv");

  const throwingStorage = {
    getItem() {
      throw new Error("SecurityError: storage disabled");
    },
    setItem() {
      throw new Error("SecurityError: storage disabled");
    },
  };
  assert.equal(detectLang("fi-FI", throwingStorage), "fi");
  assert.equal(detectLang("sv", throwingStorage), "sv");
  assert.equal(detectLang("fr-FR", throwingStorage), "en");

  // setLang silently ignores throwing global localStorage and missing location
  const prevStorage = globalThis.localStorage;
  globalThis.localStorage = throwingStorage;
  try {
    assert.doesNotThrow(() => setLang("fi"));
  } finally {
    if (prevStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = prevStorage;
  }
});

test("plural selection and interpolation in t() work for count=1, count=5, count=0 in fi, sv, en", () => {
  for (const code of SUPPORTED) {
    const one = t("search.matchCount", { count: 1 }, code);
    const five = t("search.matchCount", { count: 5 }, code);
    const zero = t("search.matchCount", { count: 0 }, code);
    assert.ok(one.startsWith("1 "), `${code} one='${one}'`);
    assert.ok(five.startsWith("5 "), `${code} five='${five}'`);
    assert.ok(zero.startsWith("0 "), `${code} zero='${zero}'`);
    assert.notEqual(one, five.replace(/^5/, "1"), `${code} plural forms must handle 1 vs 5: one='${one}', five='${five}'`);

    const ch1 = t("ask.changedTimes", { count: 1 }, code);
    const ch5 = t("ask.changedTimes", { count: 5 }, code);
    assert.ok(ch1.includes("1"));
    assert.ok(ch5.includes("5"));
    assert.notEqual(ch1, ch5.replace("5", "1"));
  }
});

test("fmtNumber, fmtDate, langName, mtFromLabel, and fallbackNoteText format cleanly per locale", () => {
  assert.ok(fmtNumber(8395, "en").includes("8,395"));
  assert.ok(fmtNumber(8395, "fi").replace(/\u00a0/g, " ").includes("8 395"));
  assert.ok(fmtNumber(8395, "sv").replace(/\u00a0/g, " ").includes("8 395"));

  for (const code of SUPPORTED) {
    const formattedDate = fmtDate("2006-11-07T21:36:39Z", code);
    assert.ok(formattedDate.includes("2006"), `${code} date='${formattedDate}'`);
    assert.ok(langName("fi", code).length > 0);
    assert.ok(mtFromLabel(["fi", "en"], code).length > 0);
    assert.ok(fallbackNoteText("fi", code).length > 0);
  }
});

test("ask.unchangedSince formats plain string with unformatted year for fi, sv, en", () => {
  const expected = {
    en: "This answer has not changed since 2003",
    fi: "Vastaus ei ole muuttunut vuoden 2003 jälkeen",
    sv: "Svaret har inte ändrats sedan 2003",
  };
  for (const code of SUPPORTED) {
    const out = t("ask.unchangedSince", { year: 2003 }, code);
    assert.ok(out.includes("2003"), `${code} output '${out}' must include 2003`);
    assert.equal(out, expected[code]);
  }
});

test("016 summarize multilingual keys exist and are non-empty in fi, sv, en", () => {
  const keys = [
    "summary.nativeLabel",
    "summary.mtFromWiki.fi",
    "summary.mtFromWiki.sv",
    "summary.mtFromWiki.en",
    "summary.fiHistoryLabel",
    "summary.historyBuilding",
  ];
  for (const code of SUPPORTED) {
    for (const key of keys) {
      const val = STRINGS[code][key];
      assert.equal(typeof val, "string", `${code}.${key} must be a string`);
      assert.ok(val.trim().length > 0, `${code}.${key} must be non-empty`);
    }
  }
});

test("017 cross-language compare keys exist and are non-empty in fi, sv, en", () => {
  const keys = [
    "compare.alsoIn.sv",
    "compare.alsoIn.en",
    "compare.onlyFi",
    "compare.compact.sv",
    "compare.compact.en",
    "compare.compact.onlyFi",
    "compare.onlyFiHintBoth",
    "compare.onlyFiHintSv",
    "compare.onlyFiHintEn",
    "compare.sectionPrefix",
    "compare.leadLabel",
    "compare.readIn.sv",
    "compare.readIn.en",
  ];
  for (const code of SUPPORTED) {
    for (const key of keys) {
      const val = STRINGS[code][key];
      assert.equal(typeof val, "string", `${code}.${key} must be a string`);
      assert.ok(val.trim().length > 0, `${code}.${key} must be non-empty`);
    }
  }
});

test("019 image credit keys exist with expected placeholders in fi, sv, en", () => {
  for (const code of SUPPORTED) {
    const imgCredit = STRINGS[code]["panel.imageCredit"];
    const commonsCredit = STRINGS[code]["panel.commonsCredit"];
    assert.equal(typeof imgCredit, "string");
    assert.ok(imgCredit.includes("{artist}") && imgCredit.includes("{license}"));
    assert.equal(commonsCredit, "Wikimedia Commons");
  }
});

test("025 ask live-answer progress keys exist in fi, sv, en", () => {
  const keys = [
    "ask.preparingHistory",
    "ask.readingYears",
    "ask.translating",
    "ask.pendingTimeout",
    "ask.retry",
  ];
  for (const code of SUPPORTED) {
    for (const key of keys) {
      const val = STRINGS[code][key];
      assert.equal(typeof val, "string", `${code}.${key} must be a string`);
      assert.ok(val.trim().length > 0, `${code}.${key} must be non-empty`);
    }
    assert.ok(STRINGS[code]["ask.readingYears"].includes("{count}"));
  }
});

test("026 ask.basedOn i18n keys and getAskProvenance label rule", () => {
  for (const code of SUPPORTED) {
    assert.ok(STRINGS[code]["ask.basedOn"].includes("{langs}"));
    const line = askBasedOnLabel(["en", "en", "fi"], code);
    assert.ok(line.length > 0);
  }
  assert.equal(askBasedOnLabel(["en", "en", "fi"], "en"), "Based on English, Finnish Wikipedia");
  assert.equal(askBasedOnLabel(["fi"], "fi"), "Perustuu Wikipedia-artikkeleihin (suomi)");
  assert.equal(askBasedOnLabel(["en", "sv", "fi"], "sv"), "Baserat på Wikipedia (engelska, svenska, finska)");

  // En hero with out_lang="en" and question_lang="en" (or out_lang=null): NOT machine-translated
  assert.deepEqual(
    getAskProvenance(
      {
        pending: false,
        out_lang: "en",
        question_lang: "en",
        sources: [{ lang: "en" }, { lang: "en" }, { lang: "fi" }],
      },
      "en"
    ),
    { kind: "sources", langs: ["en", "fi"] }
  );
  assert.deepEqual(
    getAskProvenance(
      {
        pending: false,
        out_lang: null,
        question_lang: "en",
        sources: [{ lang: "en" }, { lang: "en" }, { lang: "fi" }],
      },
      "en"
    ),
    { kind: "sources", langs: ["en", "fi"] }
  );

  // sv UI hero (en question translated to sv): IS machine-translated from English
  assert.deepEqual(
    getAskProvenance(
      {
        pending: false,
        out_lang: "sv",
        question_lang: "en",
        sources: [{ lang: "en" }, { lang: "en" }, { lang: "fi" }],
      },
      "sv"
    ),
    { kind: "translated", fromLangs: ["en"] }
  );

  // fi question translated to en: IS machine-translated from Finnish
  assert.deepEqual(
    getAskProvenance(
      {
        pending: false,
        out_lang: "en",
        question_lang: "fi",
        sources: [{ lang: "fi" }],
      },
      "en"
    ),
    { kind: "translated", fromLangs: ["fi"] }
  );

  // Fallback when out_lang differs from UI language
  assert.deepEqual(
    getAskProvenance(
      {
        pending: false,
        out_lang: "fi",
        question_lang: "fi",
        sources: [{ lang: "fi" }],
      },
      "sv"
    ),
    { kind: "fallback", shownLang: "fi" }
  );

  // Pending response shows no provenance label yet
  assert.deepEqual(getAskProvenance({ pending: true, out_lang: null, sources: [{ lang: "fi" }] }, "en"), {
    kind: "none",
  });
});

test("028 saveViewState and consumeViewState round-trip views, consume once, and handle errors", () => {
  const store = new Map();
  const mockStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
  };

  // Summary Trail state with clamped/sanitized values
  assert.equal(
    saveViewState(
      {
        view: "summary",
        lens: "history",
        year: 2012,
        article: { lang: "fi", page_id: 1256 },
        cardIndex: 2,
        readMoreOpen: true,
      },
      mockStorage
    ),
    true
  );
  const sum = consumeViewState(mockStorage);
  assert.equal(sum.view, "summary");
  assert.equal(sum.lens, "history");
  assert.equal(sum.year, 2012);
  assert.deepEqual(sum.article, { lang: "fi", page_id: 1256 });
  assert.equal(sum.cardIndex, 2);
  assert.equal(sum.readMoreOpen, true);
  // Consumed once
  assert.equal(consumeViewState(mockStorage), null);

  // Road state (article road & category road)
  assert.equal(
    saveViewState(
      { view: "road", lens: "geography", year: 2026, article: { lang: "fi", page_id: 65432 }, stationIndex: 4 },
      mockStorage
    ),
    true
  );
  const road = consumeViewState(mockStorage);
  assert.equal(road.view, "road");
  assert.equal(road.lens, "geography");
  assert.equal(road.stationIndex, 4);

  assert.equal(
    saveViewState({ view: "road", category: "Suomen suuriruhtinaskunta", stationIndex: 2 }, mockStorage),
    true
  );
  const catRoad = consumeViewState(mockStorage);
  assert.equal(catRoad.category, "Suomen suuriruhtinaskunta");
  assert.equal(catRoad.stationIndex, 2);

  // Ask state with milestone
  assert.equal(
    saveViewState(
      { view: "ask", askQuery: "How did the Winter War end?", askMilestoneIdx: 1, year: 2006 },
      mockStorage
    ),
    true
  );
  const askState = consumeViewState(mockStorage);
  assert.equal(askState.view, "ask");
  assert.equal(askState.askQuery, "How did the Winter War end?");
  assert.equal(askState.askMilestoneIdx, 1);

  // Panel state
  assert.equal(
    saveViewState(
      { view: "panel", article: { lang: "fi", page_id: 1256 }, panelTab: "history", year: 2006 },
      mockStorage
    ),
    true
  );
  const panel = consumeViewState(mockStorage);
  assert.equal(panel.view, "panel");
  assert.equal(panel.panelTab, "history");
  assert.equal(panel.year, 2006);

  // Incomplete view states are rejected -> fallback to sky
  assert.equal(normalizeViewState({ view: "summary" }), null);
  assert.equal(normalizeViewState({ view: "ask", askQuery: "   " }), null);
  assert.equal(normalizeViewState({ view: "panel", article: { lang: "fi", page_id: -1 } }), null);

  // Malformed JSON in storage returns null cleanly
  store.set(VIEW_STATE_STORAGE_KEY, "{not-json");
  assert.equal(consumeViewState(mockStorage), null);
  assert.equal(store.has(VIEW_STATE_STORAGE_KEY), false);

  // Throwing storage fails safely
  const throwingStorage = {
    getItem() {
      throw new Error("SecurityError");
    },
    setItem() {
      throw new Error("SecurityError");
    },
    removeItem() {
      throw new Error("SecurityError");
    },
  };
  assert.equal(saveViewState({ view: "sky" }, throwingStorage), false);
  assert.equal(consumeViewState(throwingStorage), null);
});

test("031 normalizeViewState / saveViewState / consumeViewState handle cardRef round-trip and garbage", () => {
  const store = new Map();
  const mockStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
  };

  // Valid section cardRef round-trip + unknown keys stripped + string capped at 200 chars
  const longHeading = "H".repeat(250);
  const savedOk = saveViewState(
    {
      view: "summary",
      article: { lang: "fi", page_id: 1256 },
      cardIndex: 7,
      cardRef: {
        kind: "section",
        articleLang: "fi",
        articlePageId: 1256,
        totalSections: 13,
        no: 5,
        heading: longHeading,
        pos: 4,
        injectedKey: "should-be-stripped",
      },
    },
    mockStorage
  );
  assert.equal(savedOk, true);
  const restored = consumeViewState(mockStorage);
  assert.equal(restored.cardIndex, 7);
  assert.deepEqual(restored.cardRef, {
    kind: "section",
    articleLang: "fi",
    articlePageId: 1256,
    totalSections: 13,
    no: 5,
    heading: "H".repeat(200),
    pos: 4,
  });
  assert.equal("injectedKey" in restored.cardRef, false);

  // Valid ghost cardRef round-trip
  saveViewState(
    {
      view: "summary",
      article: { lang: "fi", page_id: 1256 },
      cardIndex: 1,
      cardRef: {
        kind: "ghost",
        articleLang: "sv",
        articlePageId: 23612,
        totalSections: 6,
        afterNo: 0,
        fromYear: 2005,
        oldid: 6022332,
        heading: "Sodan alku",
        fromFi: true,
        extra: 99,
      },
    },
    mockStorage
  );
  const restoredGhost = consumeViewState(mockStorage);
  assert.deepEqual(restoredGhost.cardRef, {
    kind: "ghost",
    articleLang: "sv",
    articlePageId: 23612,
    totalSections: 6,
    afterNo: 0,
    fromYear: 2005,
    oldid: 6022332,
    heading: "Sodan alku",
    fromFi: true,
  });

  // Valid overview & fiHistory round-trip
  for (const kind of ["overview", "fiHistory"]) {
    const out = normalizeViewState({
      view: "summary",
      article: { lang: "fi", page_id: 1256 },
      cardIndex: 0,
      cardRef: { kind, articleLang: "en", articlePageId: 33924, totalSections: 9, junk: true },
    });
    assert.deepEqual(out.cardRef, {
      kind,
      articleLang: "en",
      articlePageId: 33924,
      totalSections: 9,
    });
  }

  // Missing cardRef (old 028 saved state) keeps cardIndex and sets cardRef = null
  const legacy = normalizeViewState({
    view: "summary",
    article: { lang: "fi", page_id: 1256 },
    cardIndex: 3,
  });
  assert.equal(legacy.cardIndex, 3);
  assert.equal(legacy.cardRef, null);

  // Invalid/garbage cardRef values are dropped to null without dropping the view state
  const garbageRefs = [
    "not-an-object",
    123,
    ["section"],
    { kind: "unknown" },
    { kind: "section", no: -1, heading: "X" },
    { kind: "section", no: 1.5, heading: "X" },
    { kind: "section", no: "5", heading: "X" },
    { kind: "section", no: 5, heading: 42 },
    { kind: "section", no: 5, heading: "X", pos: -2 },
    { kind: "section", no: 5, heading: "X", articleLang: "de" },
    { kind: "section", no: 5, heading: "X", articlePageId: -5 },
    { kind: "section", no: 5, heading: "X", totalSections: -1 },
    { kind: "ghost", afterNo: -1, fromYear: 2005, heading: "G" },
    { kind: "ghost", afterNo: 0, fromYear: -1, heading: "G" },
    { kind: "ghost", afterNo: 0, fromYear: 2005, oldid: -1, heading: "G" },
    { kind: "ghost", afterNo: 0, fromYear: 2005, heading: null },
  ];
  for (const bad of garbageRefs) {
    const res = normalizeViewState({
      view: "summary",
      article: { lang: "fi", page_id: 1256 },
      cardIndex: 4,
      cardRef: bad,
    });
    assert.ok(res !== null);
    assert.equal(res.cardIndex, 4);
    assert.equal(res.cardRef, null, `Expected bad cardRef ${JSON.stringify(bad)} to be dropped`);
  }
});

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

test("peekViewState reads without consuming", () => {
  const st = fakeStorage();
  saveViewState({ view: "summary", article: { lang: "fi", page_id: 1256 }, year: 2026 }, st);
  assert.equal(peekViewState(st).article.page_id, 1256);
  assert.equal(peekViewState(st).article.page_id, 1256);
  assert.equal(consumeViewState(st).article.page_id, 1256);
  assert.equal(peekViewState(st), null);
});

function withFakeCaches(fn) {
  const store = new Map();
  const prev = globalThis.caches;
  globalThis.caches = {
    has: async (n) => store.has(n),
    delete: async (n) => store.delete(n),
    open: async (n) => {
      if (!store.has(n)) store.set(n, new Map());
      const c = store.get(n);
      return { put: async (u, r) => c.set(u, r), match: async (u) => c.get(u) };
    },
  };
  return fn(store).finally(() => {
    globalThis.caches = prev;
  });
}

test("reload cache: saved once, taken once, deleted", () =>
  withFakeCaches(async (store) => {
    await saveReloadCache({ stars: [{ page_id: 1 }], timeline: { months: [] }, compare: { key: "fi:1", data: { a: 1 } } });
    const got = await takeReloadCache();
    assert.equal(got.stars[0].page_id, 1);
    assert.equal(got.compare.key, "fi:1");
    assert.equal(store.size, 0);
    assert.equal(await takeReloadCache(), null);
  }));

test("reload cache: empty stars are not saved, stale or broken entries fall back to null", () =>
  withFakeCaches(async (store) => {
    await saveReloadCache({ stars: [], timeline: { months: [] } });
    assert.equal(store.size, 0);
    const realNow = Date.now;
    await saveReloadCache({ stars: [{ page_id: 1 }], timeline: { months: [] } });
    Date.now = () => realNow() + 61_000;
    try {
      assert.equal(await takeReloadCache(), null);
    } finally {
      Date.now = realNow;
    }
    store.set("wm-reload-restore", new Map([["/__reload-restore", { json: async () => { throw new Error("bad"); } }]]));
    assert.equal(await takeReloadCache(), null);
  }));

test("reload cache: no Cache Storage means null, no throw", async () => {
  const prev = globalThis.caches;
  delete globalThis.caches;
  try {
    await saveReloadCache({ stars: [{ page_id: 1 }], timeline: {} });
    assert.equal(await takeReloadCache(), null);
  } finally {
    if (prev) globalThis.caches = prev;
  }
});
