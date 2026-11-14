// Data access layer for wikimemory.
// To switch one endpoint to the real MariaDB FastAPI backend, set its MOCK key
// to false after the contract test passes against the real API
// (e.g. `REAL=<key> API_BASE=http://127.0.0.1:8002 npm test`).

export const MOCK = {
  stars: true, search: true, article: true, timeline: true, asof: true, diff: true,
  summary: true, ask: true, threads: true, road: true, "topic-road": true,
};

const API_BASE = (globalThis.process?.env?.API_BASE ?? "").replace(/\/+$/, "");

import {
  mockGetStars,
  mockSearch,
  mockGetArticle,
  mockGetArticleTimeline,
  mockGetGlobalTimeline,
  mockGetAsOf,
  mockGetDiff,
  mockAsk,
  mockGetThreads,
  mockGetRoad,
  mockGetTopicRoad,
  mockGetSummary,
} from "./mock/index.js";

async function fetchJson(path) {
  const url = `${API_BASE}${path}`;
  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new Error(`Fetch failed for ${url}: ${err.message}`, { cause: err });
  }
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} for ${url}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/**
 * GET /api/stars
 */
export async function getStars() {
  if (MOCK.stars) return mockGetStars();
  return fetchJson("/api/stars");
}

/**
 * GET /api/search?q=&lang=&limit=10
 */
export async function search(q = "", langOrOpts = "", limit = 10) {
  let lang = "";
  let actualLimit = limit;
  if (langOrOpts && typeof langOrOpts === "object") {
    lang = langOrOpts.lang || "";
    actualLimit = langOrOpts.limit ?? limit;
  } else {
    lang = langOrOpts || "";
  }
  if (MOCK.search) return mockSearch({ q, lang, limit: actualLimit });
  const params = new URLSearchParams({
    q: String(q || ""),
    lang: String(lang || ""),
    limit: String(actualLimit),
  });
  return fetchJson(`/api/search?${params.toString()}`);
}

/**
 * GET /api/article/{lang}/{page_id}
 */
export async function getArticle(lang, pageId) {
  if (MOCK.article) return mockGetArticle(lang, pageId);
  return fetchJson(`/api/article/${encodeURIComponent(lang)}/${encodeURIComponent(pageId)}`);
}

/**
 * GET /api/timeline/{page_id} (only has_history articles; 404 otherwise)
 */
export async function getArticleTimeline(pageId) {
  if (MOCK.timeline) return mockGetArticleTimeline(pageId);
  return fetchJson(`/api/timeline/${encodeURIComponent(pageId)}`);
}

/**
 * GET /api/timeline (all loaded history, for the slider histogram)
 */
export async function getGlobalTimeline() {
  if (MOCK.timeline) return mockGetGlobalTimeline();
  return fetchJson("/api/timeline");
}

/**
 * Convenience dispatcher: getTimeline() -> GET /api/timeline; getTimeline(pageId) -> GET /api/timeline/{page_id}
 */
export async function getTimeline(pageId) {
  if (pageId === undefined || pageId === null) {
    return getGlobalTimeline();
  }
  return getArticleTimeline(pageId);
}

/**
 * GET /api/asof/{page_id}?at=YYYY-MM-DD HH:MM:SS
 */
export async function getAsOf(pageId, at = "2026-10-01 00:00:00") {
  if (MOCK.asof) return mockGetAsOf(pageId, at);
  const params = new URLSearchParams({ at: String(at) });
  return fetchJson(`/api/asof/${encodeURIComponent(pageId)}?${params.toString()}`);
}

/**
 * GET /api/diff/{page_id}?from=&to=
 */
export async function getDiff(pageId, from = "2006", to = "2026") {
  if (MOCK.diff) return mockGetDiff(pageId, from, to);
  const params = new URLSearchParams({ from: String(from), to: String(to) });
  return fetchJson(`/api/diff/${encodeURIComponent(pageId)}?${params.toString()}`);
}

/**
 * GET /api/ask?q=
 */
export async function ask(q = "") {
  if (MOCK.ask) return mockAsk(q);
  const params = new URLSearchParams({ q: String(q || "") });
  return fetchJson(`/api/ask?${params.toString()}`);
}

/**
 * GET /api/threads/{lang}/{page_id}?exclude=<ids>
 */
export async function getThreads(lang, pageId, exclude = []) {
  if (MOCK.threads) return mockGetThreads(lang, pageId, exclude);
  const excludeStr = Array.isArray(exclude) ? exclude.join(",") : String(exclude || "");
  const params = new URLSearchParams({ exclude: excludeStr });
  return fetchJson(
    `/api/threads/${encodeURIComponent(lang)}/${encodeURIComponent(pageId)}?${params.toString()}`
  );
}

/**
 * GET /api/road/{lang}/{page_id}
 */
export async function getRoad(langOrOpts = "fi", pageIdArg = null) {
  let lang = "fi";
  let page_id = pageIdArg;
  if (langOrOpts && typeof langOrOpts === "object") {
    lang = langOrOpts.lang || "fi";
    page_id = langOrOpts.page_id ?? langOrOpts.pageId ?? pageIdArg;
  } else if (typeof langOrOpts === "number") {
    lang = "fi";
    page_id = langOrOpts;
  } else {
    lang = langOrOpts || "fi";
  }
  if (page_id === null || page_id === undefined) {
    page_id = 1256;
  }
  if (MOCK.road) return mockGetRoad(lang, page_id);
  return fetchJson(`/api/road/${encodeURIComponent(lang)}/${encodeURIComponent(page_id)}`);
}

/**
 * GET /api/topic-road?category=... or ?lang=...&page_id=... (Option A: Historical Topic Road)
 */
export async function getTopicRoad({
  lang = "fi",
  page_id = null,
  pageId = null,
  category = null,
} = {}) {
  const resolvedPageId = page_id ?? pageId;
  if (MOCK["topic-road"]) {
    return mockGetTopicRoad({ lang, page_id: resolvedPageId, category });
  }
  const params = new URLSearchParams();
  if (category) {
    params.set("category", String(category));
  } else {
    params.set("lang", String(lang || "fi"));
    params.set("page_id", String(resolvedPageId ?? 1256));
  }
  return fetchJson(`/api/topic-road?${params.toString()}`);
}

/**
 * GET /api/summary/{lang}/{page_id}
 */
export async function getSummary(lang = "fi", pageId = 1256) {
  const safeLang = lang || "fi";
  const safePageId = pageId ?? 1256;
  if (MOCK.summary) return mockGetSummary(safeLang, safePageId);
  return fetchJson(`/api/summary/${encodeURIComponent(safeLang)}/${encodeURIComponent(safePageId)}`);
}
