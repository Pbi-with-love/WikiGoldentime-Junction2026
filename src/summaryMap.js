const VALID_ARTICLE_LANGS = new Set(["fi", "sv", "en"]);

function normHeading(text) {
  return String(text ?? "").trim().toLowerCase();
}

function toNonNegInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

/**
 * Derive the ordered summary trail items from a /api/summary response,
 * matching ui.js's buildSummaryItems order without DOM elements.
 */
export function buildSummaryCardList(summaryData) {
  if (!summaryData || !summaryData.article) return [];
  const art = summaryData.article || {};
  const sections = Array.isArray(summaryData.sections) ? summaryData.sections : [];
  const ghosts = Array.isArray(summaryData.ghost_sections) ? summaryData.ghost_sections : [];
  const fiHistory = summaryData.fi_history ?? null;
  const historyStatus = summaryData.history_status ?? null;

  const items = [
    {
      kind: "overview",
      index: 0,
      article: art,
      totalSections: sections.length,
    },
  ];

  const pushGhostsAfter = (afterNo) => {
    for (const g of ghosts) {
      if (Number(g.after_no) === Number(afterNo)) {
        items.push({
          kind: "ghost",
          index: items.length,
          ghost: g,
          article: art,
          fromFi: art.lang === "fi",
          totalSections: sections.length,
        });
      }
    }
  };

  pushGhostsAfter(0);
  for (const sec of sections) {
    items.push({
      kind: "section",
      index: items.length,
      section: sec,
      article: art,
      totalSections: sections.length,
    });
    pushGhostsAfter(sec.no);
  }
  for (const g of ghosts) {
    const aNo = Number(g.after_no);
    if (aNo > sections.length || Number.isNaN(aNo)) {
      items.push({
        kind: "ghost",
        index: items.length,
        ghost: g,
        article: art,
        fromFi: art.lang === "fi",
        totalSections: sections.length,
      });
    }
  }

  if (fiHistory) {
    items.push({
      kind: "fiHistory",
      index: items.length,
      fiHistory,
      building: false,
      article: art,
      totalSections: sections.length,
    });
    const fiArt = fiHistory.article || art;
    for (const g of fiHistory.ghost_sections || []) {
      items.push({
        kind: "ghost",
        index: items.length,
        ghost: g,
        article: fiArt,
        fromFi: true,
        totalSections: sections.length,
      });
    }
  } else if (historyStatus === "building") {
    items.push({
      kind: "fiHistory",
      index: items.length,
      fiHistory: null,
      building: true,
      article: art,
      totalSections: sections.length,
    });
  }

  return items;
}

/**
 * Describe the currently focused Summary Trail card as a compact serializable reference.
 */
export function describeSummaryCard(item, summaryData) {
  if (!item || typeof item !== "object") return null;
  const art = summaryData?.article || item.article || {};
  const articleLang = VALID_ARTICLE_LANGS.has(art.lang) ? art.lang : null;
  const pageIdNum = Number(art.page_id);
  const articlePageId = Number.isInteger(pageIdNum) && pageIdNum >= 0 ? pageIdNum : null;
  const sections = Array.isArray(summaryData?.sections) ? summaryData.sections : [];
  const totalSections = Array.isArray(summaryData?.sections)
    ? sections.length
    : toNonNegInt(item.totalSections, 0);

  const base = {
    kind: item.kind,
    articleLang,
    articlePageId,
    totalSections,
  };

  if (item.kind === "overview" || item.kind === "fiHistory") {
    return base;
  }

  if (item.kind === "section" && item.section && typeof item.section === "object") {
    const sec = item.section;
    const no = toNonNegInt(sec.no, 0);
    let pos = sections.findIndex((s) => s === sec || Number(s?.no) === no);
    if (pos < 0) pos = Math.max(0, no - 1);
    return {
      ...base,
      no,
      heading: String(sec.heading ?? ""),
      pos,
    };
  }

  if (item.kind === "ghost" && item.ghost && typeof item.ghost === "object") {
    const g = item.ghost;
    const oldidNum = g.oldid != null ? Number(g.oldid) : null;
    return {
      ...base,
      afterNo: toNonNegInt(g.after_no, 0),
      fromYear: toNonNegInt(g.from_year, 0),
      oldid: Number.isInteger(oldidNum) && oldidNum >= 0 ? oldidNum : null,
      heading: String(g.heading ?? ""),
      fromFi: item.fromFi !== undefined ? Boolean(item.fromFi) : articleLang === "fi",
    };
  }

  return null;
}

function getOverviewIndex(items) {
  const idx = items.findIndex((it) => it?.kind === "overview");
  return idx >= 0 ? idx : 0;
}

function fallbackNearestSectionIndex(items, pos, totalSourceSections) {
  const sectionIndices = [];
  for (let i = 0; i < items.length; i++) {
    if (items[i]?.kind === "section") sectionIndices.push(i);
  }
  const nTgt = sectionIndices.length;
  if (nTgt === 0) return getOverviewIndex(items);
  const nSrc = Math.max(0, Number(totalSourceSections) || 0);
  const safePos = Math.max(0, Number(pos) || 0);
  const relIdx = Math.round((safePos / Math.max(1, nSrc - 1)) * (nTgt - 1));
  const clamped = Math.max(0, Math.min(nTgt - 1, relIdx));
  return sectionIndices[clamped];
}

function resolveTargetFiPageId(targetSummaryData) {
  const req = targetSummaryData?.requested;
  if (req?.lang === "fi" && req.page_id != null) {
    const n = Number(req.page_id);
    if (Number.isInteger(n) && n >= 0) return n;
  }
  const art = targetSummaryData?.article;
  if (art?.lang === "fi" && art.page_id != null) {
    const n = Number(art.page_id);
    if (Number.isInteger(n) && n >= 0) return n;
  }
  const fiHistArt = targetSummaryData?.fi_history?.article;
  if (fiHistArt?.page_id != null) {
    const n = Number(fiHistArt.page_id);
    if (Number.isInteger(n) && n >= 0) return n;
  }
  return null;
}

function matchByCompare(cardRef, items, targetSummaryData, compareData) {
  if (!compareData || !Array.isArray(compareData.sections)) return -1;
  const fiPageId = resolveTargetFiPageId(targetSummaryData);
  if (fiPageId === null) return -1;
  if (
    compareData.article?.page_id != null &&
    Number(compareData.article.page_id) !== fiPageId
  ) {
    return -1;
  }

  const sourceLang = cardRef.articleLang;
  const targetLang = targetSummaryData?.article?.lang;
  if (!VALID_ARTICLE_LANGS.has(sourceLang) || !VALID_ARTICLE_LANGS.has(targetLang)) {
    return -1;
  }

  let candidateRows;
  if (sourceLang === "fi") {
    candidateRows = compareData.sections.filter((r) => Number(r?.no) === Number(cardRef.no));
  } else {
    const wantedHeading = normHeading(cardRef.heading);
    if (!wantedHeading) return -1;
    candidateRows = compareData.sections.filter((r) => {
      const slot = r?.[sourceLang];
      return slot?.match === true && normHeading(slot.section) === wantedHeading;
    });
  }

  for (const row of candidateRows) {
    if (targetLang === "fi") {
      const idx = items.findIndex(
        (it) => it?.kind === "section" && Number(it.section?.no) === Number(row.no)
      );
      if (idx >= 0) return idx;
    } else {
      const slot = row?.[targetLang];
      if (slot?.match !== true || !slot.section) continue;
      const targetHeading = normHeading(slot.section);
      if (!targetHeading) continue;
      const idx = items.findIndex(
        (it) => it?.kind === "section" && normHeading(it.section?.heading) === targetHeading
      );
      if (idx >= 0) return idx;
    }
  }

  return -1;
}

/**
 * Map a source Summary Trail cardRef onto the index of the best matching card
 * in targetItems / targetSummaryData, using optional compareData.
 */
export function mapSummaryCard(cardRef, targetItems, targetSummaryData, compareData = null) {
  const items = Array.isArray(targetItems) ? targetItems : [];
  if (items.length === 0) return 0;
  if (!cardRef || typeof cardRef !== "object") return getOverviewIndex(items);

  // Rule 1: overview -> target overview; fiHistory -> target fiHistory if any, else rule 5
  if (cardRef.kind === "overview") {
    return getOverviewIndex(items);
  }
  if (cardRef.kind === "fiHistory") {
    const fiHistIdx = items.findIndex((it) => it?.kind === "fiHistory");
    if (fiHistIdx >= 0) return fiHistIdx;
    const nSrc = Math.max(0, Number(cardRef.totalSections) || 0);
    return fallbackNearestSectionIndex(items, Math.max(0, nSrc - 1), nSrc);
  }

  const targetArt = targetSummaryData?.article || {};
  const isSameArticle = Boolean(
    cardRef.articleLang &&
      cardRef.articlePageId != null &&
      targetArt.lang === cardRef.articleLang &&
      Number(targetArt.page_id) === Number(cardRef.articlePageId)
  );

  // Rule 2: Same article (same lang + page_id)
  if (isSameArticle) {
    if (cardRef.kind === "section") {
      const idx = items.findIndex(
        (it) => it?.kind === "section" && Number(it.section?.no) === Number(cardRef.no)
      );
      if (idx >= 0) return idx;
    } else if (cardRef.kind === "ghost") {
      const wantedHeading = normHeading(cardRef.heading);
      const idx = items.findIndex(
        (it) =>
          it?.kind === "ghost" &&
          Number(it.ghost?.after_no) === Number(cardRef.afterNo) &&
          Number(it.ghost?.from_year) === Number(cardRef.fromYear) &&
          normHeading(it.ghost?.heading) === wantedHeading
      );
      if (idx >= 0) return idx;
    }
  }

  // Rule 3: Fi ghost (fromFi) across articles
  if (cardRef.kind === "ghost") {
    if (cardRef.fromFi) {
      const matchesBase = (it) => {
        if (it?.kind !== "ghost" || !it.fromFi || !it.ghost) return false;
        if (Number(it.ghost.after_no) !== Number(cardRef.afterNo)) return false;
        if (Number(it.ghost.from_year) !== Number(cardRef.fromYear)) return false;
        if (cardRef.oldid != null) {
          return Number(it.ghost.oldid) === Number(cardRef.oldid);
        }
        return true;
      };
      const wantedHeading = normHeading(cardRef.heading);
      let idx = items.findIndex(
        (it) => matchesBase(it) && normHeading(it.ghost?.heading) === wantedHeading
      );
      if (idx < 0) {
        idx = items.findIndex(matchesBase);
      }
      if (idx >= 0) return idx;
    }
    return fallbackNearestSectionIndex(items, cardRef.afterNo ?? 0, cardRef.totalSections ?? 0);
  }

  // Rule 4: Different articles, compare mapping
  if (cardRef.kind === "section") {
    const cmpIdx = matchByCompare(cardRef, items, targetSummaryData, compareData);
    if (cmpIdx >= 0) return cmpIdx;

    // Rule 5: Fallback, nearest kept section
    const pos =
      cardRef.pos != null
        ? Number(cardRef.pos)
        : Math.max(0, (Number(cardRef.no) || 1) - 1);
    return fallbackNearestSectionIndex(items, pos, cardRef.totalSections ?? 0);
  }

  return getOverviewIndex(items);
}
