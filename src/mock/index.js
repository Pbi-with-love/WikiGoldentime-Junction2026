import { getStarsDataset, makeWikiUrl } from "./stars.js";
import {
  buildGlobalTimeline,
  ARTICLE_THUMBS,
  ASOF_FIXTURES,
  computeBlocksDiff,
  WINTER_WAR_END_ASK_FIXTURE,
  CURATED_THREADS_BY_FI_ID,
  ROAD_FIXTURES,
} from "./fixtures.js";
import { buildRoadForStar, buildSummaryForStar } from "./road_stations.js";

let forceMockError = false;
let latencyEnabled = true;

export function setMockConfig({ error = false, latency = true } = {}) {
  forceMockError = Boolean(error);
  latencyEnabled = Boolean(latency);
}

function shouldSimulateError() {
  if (forceMockError) return true;
  if (typeof window !== "undefined" && window.location && window.location.search) {
    const params = new URLSearchParams(window.location.search);
    if (params.get("mockError") === "1") return true;
  }
  return false;
}

async function simulateNetwork() {
  if (latencyEnabled) {
    const delayMs = 80 + Math.floor(Math.random() * 221); // 80–300 ms
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  if (shouldSimulateError()) {
    const err = new Error("Simulated network error (?mockError=1)");
    err.status = 503;
    throw err;
  }
}

function createHttpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// 1. GET /api/stars
export async function mockGetStars() {
  await simulateNetwork();
  const { stars } = getStarsDataset();
  return stars.map((s) => ({
    lang: s.lang,
    page_id: s.page_id,
    wikidata_id: s.wikidata_id,
    title: s.title,
    url: s.url,
    length: s.length,
    category: s.category,
    x: s.x,
    y: s.y,
    z: s.z,
    has_history: s.has_history,
    first_edit_year: s.first_edit_year,
    event_year: s.event_year,
    lat: s.lat,
    lon: s.lon,
  }));
}

// 2. GET /api/search?q=&lang=&limit=10
export async function mockSearch({ q = "", lang = "", limit = 10 } = {}) {
  await simulateNetwork();
  const raw = String(q || "").trim();
  if (!raw) return { rows: [], also: {} };

  const normalized = raw.toLowerCase();
  const emptyTriggers = ["zzzz", "xyz", "qwerty", "atlantis", "none", "nothing", "404", "nomatch"];
  if (emptyTriggers.some((t) => normalized.includes(t))) {
    return { rows: [], also: {} };
  }

  const { stars, byWikidata } = getStarsDataset();
  const pool = lang ? stars.filter((s) => s.lang === lang) : stars;

  const tokens = normalized
    .replace(/[?.,!;:()[\]"]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2);

  const scored = [];
  for (let i = 0; i < pool.length; i++) {
    const s = pool[i];
    const titleLower = s.title.toLowerCase();
    const catLower = (s.category || "").toLowerCase();

    let score = 0;
    if (titleLower === normalized) score += 150;
    else if (titleLower.includes(normalized)) score += 90;

    for (const tok of tokens) {
      if (titleLower.includes(tok)) score += 35;
      if (catLower.includes(tok)) score += 20;
      if (s.first_edit_year && String(s.first_edit_year) === tok) score += 25;
    }

    if (score > 0) {
      const historyBonus = s.has_history ? 25 : 0;
      scored.push({ star: s, score: score + historyBonus + Math.min(10, Math.log10(Math.max(10, s.length))) });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const maxItems = Math.max(1, Math.min(50, Number(limit) || 10));
  const picked = scored.slice(0, maxItems).map((item) => item.star);

  const rows = picked.map((s, idx) => ({
    lang: s.lang,
    page_id: s.page_id,
    wikidata_id: s.wikidata_id,
    title: s.title,
    url: s.url,
    // Real cosine distances sit around 0.40–0.60 and top-1 vs top-2 differ by < 0.01
    distance: Number((0.412 + idx * 0.0065).toFixed(4)),
  }));

  const also = {};
  for (const r of rows) {
    if (!r.wikidata_id) continue;
    const siblings = (byWikidata.get(r.wikidata_id) || []).filter(
      (sib) => !(sib.lang === r.lang && sib.page_id === r.page_id)
    );
    if (siblings.length > 0) {
      also[r.wikidata_id] = siblings.map((sib) => [sib.lang, sib.title, sib.url]);
    }
  }

  return { rows, also };
}

function buildRoadSync(star) {
  const { stars, byWikidata, byFiPageId } = getStarsDataset();
  const rawSiblings = star.wikidata_id
    ? (byWikidata.get(star.wikidata_id) || []).filter(
        (s) => !(s.lang === star.lang && s.page_id === star.page_id)
      )
    : [];

  const branchTargets = [];
  if (star.lang === "fi" && CURATED_THREADS_BY_FI_ID[star.page_id]) {
    for (const item of CURATED_THREADS_BY_FI_ID[star.page_id]) {
      if (item.type === "ghost") continue;
      const targetStar = byFiPageId.get(item.targetPageId);
      if (targetStar) {
        branchTargets.push({
          lang: targetStar.lang,
          page_id: targetStar.page_id,
          title: targetStar.title,
          reason: item.reason,
        });
      }
      if (branchTargets.length >= 2) break;
    }
  }
  if (branchTargets.length === 0) {
    const fallback = stars.find(
      (s) => s.lang === star.lang && s.category === star.category && s.page_id !== star.page_id
    );
    if (fallback) {
      branchTargets.push({
        lang: fallback.lang,
        page_id: fallback.page_id,
        title: fallback.title,
        reason: `Related in ${star.category || "Suomen historia"}`,
      });
    }
  }

  return buildRoadForStar(star, rawSiblings, branchTargets);
}

// 3. GET /api/article/{lang}/{page_id}
export async function mockGetArticle(lang, pageId) {
  await simulateNetwork();
  const { byKey, byWikidata } = getStarsDataset();
  const key = `${lang}:${Number(pageId)}`;
  const star = byKey.get(key);
  if (!star) {
    throw createHttpError(404, `Article ${key} not found`);
  }

  const siblings = star.wikidata_id
    ? (byWikidata.get(star.wikidata_id) || [])
        .filter((s) => !(s.lang === star.lang && s.page_id === star.page_id))
        .map((s) => [s.lang, s.title, s.url])
    : [];

  const categories = star.category
    ? [star.category, "Suomen historia"]
    : ["Suomen historia"];

  const thumbInfo = star.lang === "fi" && ARTICLE_THUMBS.has(star.page_id)
    ? ARTICLE_THUMBS.get(star.page_id)
    : null;

  const road = buildRoadSync(star);

  // Build clean Markdown starting with "# <title>\n"
  const asofList = ASOF_FIXTURES[star.page_id];
  let leadBody = "";
  if (asofList && asofList.length > 0) {
    const latest = asofList[asofList.length - 1];
    leadBody = latest.blocks
      .slice(1)
      .map(([type, txt]) => {
        if (type === "h") return `## ${txt}`;
        if (type === "li") return `- ${txt}`;
        return txt;
      })
      .join("\n\n");
  } else {
    leadBody = [
      `[mock] **${star.title}** is a Wikipedia article in the *${star.category || "Finnish history"}* collection (${star.length.toLocaleString("en-US")} characters).`,
      `- Primary key: \`(${star.lang}, ${star.page_id})\``,
      `- Category cluster: ${star.category || "Uncategorised halo"}`,
      star.has_history
        ? `[mock] Full system-versioned revision history (2003–2026) is loaded in MariaDB SVT for this Finnish article.`
        : `[mock] Only current snapshot text is stored for this article in Dataset S.`,
    ].join("\n\n");
  }

  const sectionsMarkdown = road.stations.map((st) => st.text).join("\n\n");
  const text = `# ${star.title}\n\n${leadBody}\n\n${sectionsMarkdown}`;

  return {
    lang: star.lang,
    page_id: star.page_id,
    rev_id: star.page_id === 1256 ? 23981405 : star.page_id === 52097 ? 22491034 : 18000000 + star.page_id,
    wikidata_id: star.wikidata_id,
    title: star.title,
    url: star.url,
    date_modified: "2025-08-18T14:12:47Z",
    length: star.length,
    words: road.article.words,
    reading_minutes: road.article.reading_minutes,
    station_count: road.stations.length,
    text,
    categories,
    other_languages: siblings,
    has_history: star.has_history,
    thumb_url: thumbInfo ? thumbInfo.thumb_url : null,
    thumb_file: thumbInfo ? thumbInfo.thumb_file : null,
  };
}

// Cache per-article timelines so they stay deterministic
const articleTimelineCache = new Map();

function buildPerArticleTimelineSync(star) {
  const pid = star.page_id;
  if (articleTimelineCache.has(pid)) return articleTimelineCache.get(pid);

  // Calibrate real magnitudes for Talvisota (1256) and Suomen sisällissota (1150)
  const targetVersions =
    pid === 1256 ? 2143 :
    pid === 1150 ? 3357 :
    pid === 52097 ? 642 :
    pid === 440 ? 1890 :
    420 + (pid % 680);

  const targetReverts =
    pid === 1256 ? 328 :
    pid === 1150 ? 512 :
    Math.round(targetVersions * 0.14);

  const targetDisputes =
    pid === 1256 ? 88 :
    pid === 1150 ? 142 :
    Math.round(targetReverts * 0.27);

  const startYear = star.first_edit_year || 2004;
  const startMonth = pid === 1256 ? 11 : pid === 52097 ? 2 : 3;
  const first_edit = `${startYear}-${String(startMonth).padStart(2, "0")}-14T11:08:45Z`;

  // Build monthly series from startYear..2026-10
  const rawMonths = [];
  let weightSum = 0;
  for (let y = startYear; y <= 2026; y++) {
    const mStart = y === startYear ? startMonth : 1;
    const mEnd = y === 2026 ? 10 : 12;
    for (let m = mStart; m <= mEnd; m++) {
      const peak = y >= 2006 && y <= 2009 ? 2.4 : y === 2014 || y === 2018 || y === 2022 ? 1.6 : 0.85;
      const seasonal = m === 3 || m === 11 || m === 12 ? 1.35 : 0.9;
      const w = peak * seasonal;
      weightSum += w;
      rawMonths.push({ year: y, m, month: `${y}-${String(m).padStart(2, "0")}`, w });
    }
  }

  let cumW = 0;
  let editsAllocated = 0;
  let revertsAllocated = 0;
  let disputesAllocated = 0;
  let war_months = 0;

  const months = rawMonths.map((item, idx) => {
    cumW += item.w;
    const isLast = idx === rawMonths.length - 1;
    const targetCumEdits = isLast ? targetVersions : Math.round((cumW / weightSum) * targetVersions);
    const edits = Math.max(0, targetCumEdits - editsAllocated);
    editsAllocated += edits;

    const targetCumReverts = isLast ? targetReverts : Math.round((cumW / weightSum) * targetReverts);
    const reverts = Math.max(0, targetCumReverts - revertsAllocated);
    revertsAllocated += reverts;

    // Create explicit edit-war months (disputes >= 3) in historically contested years
    const isWarMonth =
      (item.year === 2006 && item.m === 11) ||
      (item.year === 2007 && item.m === 3) ||
      (item.year === 2008 && item.m === 2) ||
      (item.year === 2014 && item.m === 3) ||
      (item.year === 2018 && item.m === 4) ||
      (pid === 1256 && item.year === 2022 && item.m === 3);

    let disputes = isWarMonth
      ? 3 + (idx % 2)
      : idx % 9 === 0 && reverts > 0
      ? 1
      : 0;
    if (isLast) {
      disputes = Math.max(0, targetDisputes - disputesAllocated);
    }
    disputesAllocated += disputes;
    if (disputes >= 3) war_months++;

    return {
      month: item.month,
      edits,
      reverts,
      disputes,
    };
  });

  const totalEdits = months.reduce((acc, m) => acc + m.edits, 0);
  const totalReverts = months.reduce((acc, m) => acc + m.reverts, 0);
  const totalDisputes = months.reduce((acc, m) => acc + m.disputes, 0);

  const result = {
    summary: {
      versions: totalEdits,
      reverts: totalReverts,
      disputes: totalDisputes,
      war_months,
      first_edit,
    },
    months,
  };
  articleTimelineCache.set(pid, result);
  return result;
}

// 4. GET /api/timeline/{page_id}
export async function mockGetArticleTimeline(pageId) {
  await simulateNetwork();
  const { byFiPageId } = getStarsDataset();
  const star = byFiPageId.get(Number(pageId));
  if (!star || !star.has_history) {
    throw createHttpError(404, `No edit history for page_id ${pageId}`);
  }
  return buildPerArticleTimelineSync(star);
}

// 5. GET /api/timeline
export async function mockGetGlobalTimeline() {
  await simulateNetwork();
  return buildGlobalTimeline();
}

function getAsOfSnapshotSync(star, atTimestamp) {
  const pid = star.page_id;
  const matchYear = String(atTimestamp || "2026-10-01 00:00:00").match(/^(\d{4})/);
  const year = matchYear ? Number(matchYear[1]) : 2026;

  if (year < (star.first_edit_year || 2004)) {
    throw createHttpError(404, `Article ${pid} did not exist in ${year}`);
  }

  const fixtures = ASOF_FIXTURES[pid];
  if (fixtures) {
    const snap =
      fixtures.find((f) => year >= f.fromYear && year <= f.toYear) ||
      fixtures[fixtures.length - 1];
    return {
      title: snap.title,
      rev_id: snap.rev_id,
      user: snap.user,
      comment: snap.comment,
      row_start: snap.row_start,
      row_end: snap.row_end,
      blocks: snap.blocks.map((b) => [b[0], b[1]]),
    };
  }

  // Generated 3-stage evolution for the other 48 has_history articles
  const early = year <= 2008;
  const mid = year >= 2009 && year <= 2016;
  const rev_id = early ? 500000 + pid : mid ? 11000000 + pid : 22000000 + pid;
  const user = early ? "Kahkonen" : mid ? "Peltimikko" : "Risukarhi";
  const comment = early
    ? "Alkuperäinen luonnos ja perustiedot"
    : mid
    ? "Lisätty arkistolähteitä ja täsmennetty lukuarvoja"
    : "Nykyinen historiografinen muotoilu";

  const row_start = early
    ? `${Math.max(star.first_edit_year, 2005)}-05-14T12:10:00Z`
    : mid
    ? "2012-09-20T15:30:00Z"
    : "2025-06-11T09:45:12Z";
  const row_end = early ? "2009-01-01T00:00:00Z" : mid ? "2017-01-01T00:00:00Z" : null;

  const blocks = early
    ? [
        ["h", star.title],
        ["p", `[mock] ${star.title} käsittelee aihetta ${star.category || "Suomen historia"}. Tämä varhainen versio (${year}) sisältää lyhyen tiivistelmän päätapahtumista.`],
        ["li", `[mock] Artikkeli aloitettiin vuonna ${star.first_edit_year} osana suomenkielisen Wikipedian historia-artikkelien perusrunkoa.`],
      ]
    : mid
    ? [
        ["h", star.title],
        ["p", `[mock] ${star.title} käsittelee aihetta ${star.category || "Suomen historia"}. Vuoden ${year} versiossa tekstiä laajennettiin uusilla tutkimusviitteillä ja tilastotiedoilla.`],
        ["li", `[mock] Artikkeli aloitettiin vuonna ${star.first_edit_year} ja sen laajuus kasvoi merkittävästi vuosina 2006–2012.`],
        ["p", `[mock] Useat muokkaajat täsmensivät aikakausien nimityksiä ja arkistolähteitä.`],
      ]
    : [
        ["h", star.title],
        ["p", `[mock] ${star.title} käsittelee aihetta ${star.category || "Suomen historia"}. Nykyinen versio (${year}) yhdistää suomalaisen ja kansainvälisen historiantutkimuksen näkökulmat.`],
        ["li", `[mock] Artikkeli aloitettiin vuonna ${star.first_edit_year} ja sen nykyinen pituus on ${star.length.toLocaleString("en-US")} merkkiä.`],
        ["p", `[mock] Tekstiä on tarkennettu lähdeviitteillä, arkistokuvilla ja viittauksilla rinnakkaisiin teemoihin.`],
      ];

  return {
    title: star.title,
    rev_id,
    user,
    comment,
    row_start,
    row_end,
    blocks,
  };
}

// 6. GET /api/asof/{page_id}?at=YYYY-MM-DD HH:MM:SS
export async function mockGetAsOf(pageId, at = "2026-10-01 00:00:00") {
  await simulateNetwork();
  const { byFiPageId } = getStarsDataset();
  const star = byFiPageId.get(Number(pageId));
  if (!star || !star.has_history) {
    throw createHttpError(404, `No SVT history for page_id ${pageId}`);
  }
  return getAsOfSnapshotSync(star, at);
}

function resolveSnapshotByParam(star, param) {
  const pid = star.page_id;
  const fixtures = ASOF_FIXTURES[pid];
  const num = Number(param);

  // Check if param matches a rev_id directly
  if (fixtures && !Number.isNaN(num)) {
    const byRev = fixtures.find((f) => f.rev_id === num);
    if (byRev) return byRev;
  }

  // Check if param is a 4-digit year or timestamp string
  const yearMatch = String(param || "2026").match(/^(\d{4})/);
  if (yearMatch) {
    const yr = Number(yearMatch[1]);
    if (yr >= 2003 && yr <= 2026) {
      return getAsOfSnapshotSync(star, `${yr}-10-01 00:00:00`);
    }
  }

  // If rev_id from generated article
  if (!Number.isNaN(num)) {
    if (num < 2000000) return getAsOfSnapshotSync(star, "2006-10-01 00:00:00");
    if (num < 16000000) return getAsOfSnapshotSync(star, "2012-10-01 00:00:00");
  }
  return getAsOfSnapshotSync(star, "2026-10-01 00:00:00");
}

// 7. GET /api/diff/{page_id}?from=&to=
export async function mockGetDiff(pageId, from = "2006", to = "2026") {
  await simulateNetwork();
  const { byFiPageId } = getStarsDataset();
  const star = byFiPageId.get(Number(pageId));
  if (!star || !star.has_history) {
    throw createHttpError(404, `No SVT history for page_id ${pageId}`);
  }

  const fromSnap = resolveSnapshotByParam(star, from);
  const toSnap = resolveSnapshotByParam(star, to);
  return computeBlocksDiff(fromSnap.blocks, toSnap.blocks);
}

// 8. GET /api/ask?q=
function withMockAskUi(payload, ui) {
  const out = structuredClone(payload);
  const normalizedUi = ui ? String(ui) : null;
  out.out_lang = normalizedUi;
  if (normalizedUi) {
    const rawAns = String(out.answer || "");
    out.answer = rawAns.startsWith("[mock] ")
      ? `[mock] (${normalizedUi}) ${rawAns.slice(7)}`
      : `[mock] (${normalizedUi}) ${rawAns}`;
  }
  return out;
}

export async function mockAsk(q = "", ui = null) {
  await simulateNetwork();
  const raw = String(q || "").trim();
  const lower = raw.toLowerCase();

  // Demo Path A: Winter War end (English, Vietnamese, Finnish, Swedish)
  if (
    lower.includes("winter war") ||
    lower.includes("hur slutade vinterkriget") ||
    lower.includes("miten talvisota päättyi") ||
    lower.includes("mùa đông") ||
    lower.includes("mua dong") ||
    lower.includes("moskovan rauha") ||
    lower.includes("moscow peace") ||
    (lower.includes("talvisota") && (lower.includes("end") || lower.includes("päätty") || lower.includes("rauha")))
  ) {
    return withMockAskUi(WINTER_WAR_END_ASK_FIXTURE, ui);
  }

  // Explicit no-history test query (so history_available=false is easily testable)
  if (lower.includes("vinterkriget") || lower.includes("nohistory")) {
    return withMockAskUi(
      {
        answer:
          "[mock] Vinterkriget (1939–1940) utkämpades mellan Finland och Sovjetunionen [1]. Eftersom denna källa är svenskspråkig finns ingen systemversionerad redigeringshistorik i Dataset M.",
        sources: [
          {
            n: 1,
            lang: "sv",
            page_id: 23612,
            title: "Vinterkriget",
            url: makeWikiUrl("sv", "Vinterkriget"),
          },
        ],
        top: { lang: "sv", page_id: 23612 },
        history_available: false,
        milestones: [],
      },
      ui
    );
  }

  // Otherwise match top articles via search
  const searchRes = await mockSearch({ q: raw || "Talvisota", limit: 3 });
  if (searchRes.rows.length === 0) {
    return withMockAskUi(
      {
        answer: "[mock] No grounded Wikipedia articles matched your question.",
        sources: [],
        top: { lang: "fi", page_id: 1256 },
        history_available: false,
        milestones: [],
      },
      ui
    );
  }

  const { byKey } = getStarsDataset();
  const topRow = searchRes.rows[0];
  const topStar = byKey.get(`${topRow.lang}:${topRow.page_id}`);
  const sources = searchRes.rows.slice(0, 3).map((r, idx) => ({
    n: idx + 1,
    lang: r.lang,
    page_id: r.page_id,
    title: r.title,
    url: r.url,
  }));

  const hasHistory = Boolean(topStar?.has_history);
  if (!hasHistory) {
    return withMockAskUi(
      {
        answer: `[mock] According to ${topRow.title} [1], this topic is part of the Finnish history collection on Wikipedia. Edit history milestones are only available for Finnish articles loaded in Dataset M.`,
        sources,
        top: { lang: topRow.lang, page_id: topRow.page_id },
        history_available: false,
        milestones: [],
      },
      ui
    );
  }

  const earlySnap = getAsOfSnapshotSync(topStar, "2006-10-01 00:00:00");
  const midSnap = getAsOfSnapshotSync(topStar, "2012-10-01 00:00:00");
  const nowSnap = getAsOfSnapshotSync(topStar, "2026-10-01 00:00:00");

  return withMockAskUi(
    {
      answer: `[mock] Grounded in **${topStar.title}** [1], the article documents key events in ${topStar.category || "Finnish history"} and has evolved across three major editorial phases since ${topStar.first_edit_year} [1]${sources.length > 1 ? " [2]" : ""}.`,
      sources,
      top: { lang: topStar.lang, page_id: topStar.page_id },
      history_available: true,
      milestones: [
        {
          from_year: topStar.first_edit_year || 2004,
          to_year: 2008,
          answer: earlySnap.blocks[1]?.[1] || earlySnap.blocks[0][1],
          rev_id: earlySnap.rev_id,
          user: earlySnap.user,
          comment: earlySnap.comment,
        },
        {
          from_year: 2009,
          to_year: 2016,
          answer: midSnap.blocks[1]?.[1] || midSnap.blocks[0][1],
          rev_id: midSnap.rev_id,
          user: midSnap.user,
          comment: midSnap.comment,
        },
        {
          from_year: 2017,
          to_year: 2026,
          answer: nowSnap.blocks[1]?.[1] || nowSnap.blocks[0][1],
          rev_id: nowSnap.rev_id,
          user: nowSnap.user,
          comment: nowSnap.comment,
        },
      ],
    },
    ui
  );
}

// 9. GET /api/threads/{lang}/{page_id}?exclude=<ids>
export async function mockGetThreads(lang, pageId, exclude = []) {
  await simulateNetwork();
  const { stars, byKey, byFiPageId } = getStarsDataset();
  const sourceStar = byKey.get(`${lang}:${Number(pageId)}`);
  if (!sourceStar) {
    throw createHttpError(404, `Source star ${lang}:${pageId} not found`);
  }

  const excludedSet = new Set(
    (Array.isArray(exclude) ? exclude : String(exclude || "").split(","))
      .map((x) => String(x).trim())
      .filter(Boolean)
  );
  excludedSet.add(String(sourceStar.page_id));
  excludedSet.add(`${sourceStar.lang}:${sourceStar.page_id}`);

  function isExcluded(targetStar) {
    return (
      excludedSet.has(String(targetStar.page_id)) ||
      excludedSet.has(`${targetStar.lang}:${targetStar.page_id}`)
    );
  }

  function formatTarget(s) {
    return {
      lang: s.lang,
      page_id: s.page_id,
      wikidata_id: s.wikidata_id,
      title: s.title,
      x: s.x,
      y: s.y,
      z: s.z,
    };
  }

  // Check curated 5-hop Demo Path C chain first
  if (lang === "fi" && CURATED_THREADS_BY_FI_ID[sourceStar.page_id]) {
    const rawThreads = CURATED_THREADS_BY_FI_ID[sourceStar.page_id];
    const threads = [];
    for (const item of rawThreads) {
      if (item.type === "ghost" && !sourceStar.has_history) continue;
      const targetStar = byFiPageId.get(item.targetPageId);
      if (!targetStar || isExcluded(targetStar)) continue;
      threads.push({
        type: item.type,
        target: formatTarget(targetStar),
        reason: item.reason,
        summary: item.summary,
        first_year: item.first_year,
        removed_year: item.removed_year,
      });
      if (threads.length === 4) break;
    }
    if (threads.length > 0) {
      return { threads };
    }
  }

  // Fallback generated threads for any article in the galaxy (max 4; ghost only when sourceStar.has_history)
  const sameCategory = stars.filter(
    (s) => s.lang === sourceStar.lang && s.category === sourceStar.category && !isExcluded(s)
  );
  const pool = sameCategory.length >= 4 ? sameCategory : stars.filter((s) => !isExcluded(s));

  const types = sourceStar.has_history
    ? ["after", "semantic", "before", "ghost"]
    : ["semantic", "after", "before", "semantic"];

  const threads = [];
  const step = Math.max(1, Math.floor(pool.length / 12));
  for (let i = 0; i < 4 && i * step < pool.length; i++) {
    const targetStar = pool[(sourceStar.page_id + i * step) % pool.length];
    if (!targetStar || isExcluded(targetStar)) continue;
    excludedSet.add(String(targetStar.page_id));

    const tType = types[i];
    const isGhost = tType === "ghost";
    threads.push({
      type: tType,
      target: formatTarget(targetStar),
      reason:
        tType === "after"
          ? "Time: subsequent phase"
          : tType === "before"
          ? "Time: historical background"
          : isGhost
          ? "Ghost: linked 2007–2014, then removed"
          : `Meaning: ${sourceStar.category || "shared context"}`,
      summary: isGhost
        ? `[mock] Linked in revisions between 2007 and 2014 before section restructuring.`
        : `[mock] Connected through ${sourceStar.category || "Finnish historiography"} in the UMAP manifold.`,
      first_year: isGhost ? 2007 : null,
      removed_year: isGhost ? 2014 : null,
    });
  }

  return { threads };
}

// 10. GET /api/road/{lang}/{page_id}
export async function mockGetRoad(langOrOpts = "fi", pageIdArg = null) {
  await simulateNetwork();

  let lang = "fi";
  let pageId = pageIdArg;
  if (langOrOpts && typeof langOrOpts === "object") {
    lang = langOrOpts.lang || "fi";
    pageId = langOrOpts.page_id ?? langOrOpts.pageId ?? pageIdArg;
  } else if (typeof langOrOpts === "number") {
    lang = "fi";
    pageId = langOrOpts;
  } else {
    lang = langOrOpts || "fi";
  }

  const pid = pageId !== null && pageId !== undefined && pageId !== "" ? Number(pageId) : 1256;
  const { byKey, byFiPageId } = getStarsDataset();
  const star = byKey.get(`${lang}:${pid}`) || byFiPageId.get(pid);
  if (!star) {
    throw createHttpError(404, `Article ${lang}:${pid} not found`);
  }

  return buildRoadSync(star);
}

// 11. GET /api/topic-road?category=... or ?lang=...&page_id=... (Option A: Historical Topic Road)
export async function mockGetTopicRoad({
  lang = "fi",
  page_id = null,
  pageId = null,
  category = null,
} = {}) {
  await simulateNetwork();

  const resolvedPageId = page_id ?? pageId;
  const catLower = (category || "").toLowerCase();
  const pid =
    resolvedPageId !== null && resolvedPageId !== undefined && resolvedPageId !== ""
      ? Number(resolvedPageId)
      : null;

  let fixture = ROAD_FIXTURES.talvisota;
  if (catLower.includes("autonom") || catLower.includes("suuriruhtinaskunta")) {
    fixture = ROAD_FIXTURES.autonomia;
  } else if (catLower.includes("sisällissota") || catLower.includes("sisallissota") || pid === 1150) {
    fixture = ROAD_FIXTURES.sisallissota;
  } else if (catLower.includes("talvisota") || pid === 1256 || pid === 52097) {
    fixture = ROAD_FIXTURES.talvisota;
  }

  return JSON.parse(JSON.stringify(fixture));
}

// 12. GET /api/summary/{lang}/{page_id}
export async function mockGetSummary(lang = "fi", pageId = 1256, ui = null) {
  await simulateNetwork();

  const pid = pageId !== null && pageId !== undefined && pageId !== "" ? Number(pageId) : 1256;
  const { byKey, byFiPageId, byWikidata } = getStarsDataset();
  const star = byKey.get(`${lang}:${pid}`) || (lang === "fi" ? byFiPageId.get(pid) : null);
  if (!star) {
    throw createHttpError(404, `Article ${lang}:${pid} not found`);
  }

  const rawSiblings = star.wikidata_id
    ? (byWikidata.get(star.wikidata_id) || []).filter(
        (s) => !(s.lang === star.lang && s.page_id === star.page_id)
      )
    : [];

  if (!ui || ui === star.lang) {
    return buildSummaryForStar(star, rawSiblings);
  }

  const requested = {
    lang: star.lang,
    page_id: star.page_id,
    title: star.title,
    url: makeWikiUrl(star.lang, star.title),
  };

  const nativeSibling = rawSiblings.find((s) => s.lang === ui);
  if (nativeSibling) {
    const sibSiblings = nativeSibling.wikidata_id
      ? (byWikidata.get(nativeSibling.wikidata_id) || []).filter(
          (s) => !(s.lang === nativeSibling.lang && s.page_id === nativeSibling.page_id)
        )
      : [];
    const res = buildSummaryForStar(nativeSibling, sibSiblings);
    res.out_lang = ui;
    res.variant = "native";
    res.requested = requested;

    if (ui === "fi") {
      res.fi_history = null;
      const hasInline =
        (res.sections || []).some((s) => s.history !== null) || (res.ghost_sections || []).length > 0;
      res.history_status = hasInline || nativeSibling.has_history ? "ready" : "none";
    } else {
      const fiStar = star.lang === "fi" ? star : rawSiblings.find((s) => s.lang === "fi");
      if (fiStar) {
        const fiSiblings = fiStar.wikidata_id
          ? (byWikidata.get(fiStar.wikidata_id) || []).filter(
              (s) => !(s.lang === fiStar.lang && s.page_id === fiStar.page_id)
            )
          : [];
        const fiBuilt = buildSummaryForStar(fiStar, fiSiblings);
        const sectionsWithHistory = (fiBuilt.sections || [])
          .filter((s) => s.history !== null)
          .map((s) => ({ no: s.no, heading: s.heading, history: s.history }));
        const ghosts = fiBuilt.ghost_sections || [];
        if (sectionsWithHistory.length > 0 || ghosts.length > 0) {
          res.fi_history = {
            article: {
              lang: fiStar.lang,
              page_id: fiStar.page_id,
              title: fiStar.title,
              url: makeWikiUrl(fiStar.lang, fiStar.title),
            },
            rev_id: fiBuilt.rev_id,
            sections: sectionsWithHistory,
            ghost_sections: ghosts,
          };
          res.history_status = "ready";
        } else {
          res.fi_history = null;
          res.history_status = "none";
        }
      } else {
        res.fi_history = null;
        res.history_status = "none";
      }
    }
    return res;
  }

  const res = buildSummaryForStar(star, rawSiblings);
  const stripMock = (txt) => String(txt || "").replace(/^\[mock\]\s*/, "");
  res.out_lang = ui;
  res.variant = "translated";
  res.requested = requested;
  res.tldr = `[mock] (${ui}) ${stripMock(res.tldr)}`;
  for (const sec of res.sections || []) {
    sec.one_line = `[mock] (${ui}) ${stripMock(sec.one_line)}`;
  }
  const hasInlineHistory =
    star.lang === "fi" &&
    ((res.sections || []).some((s) => s.history !== null) ||
      (res.ghost_sections || []).length > 0 ||
      Boolean(star.has_history));
  res.history_status = hasInlineHistory ? "ready" : "none";
  return res;
}
