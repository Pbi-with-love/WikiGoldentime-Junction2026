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
  fallbackNoteText,
  setLang,
} from "./i18n.js";

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
