import {
  lang as uiLang,
  t,
  fmtNumber,
  fmtDate,
  langName,
  mtFromLabel,
  fallbackNoteText,
  setLang,
} from "./i18n.js";

const KNOWN_ROAD_PAGE_IDS = new Set([1256, 1150]);

function isRoadEligibleArticle(article) {
  if (!article) return false;
  const stationCount = Array.isArray(article.stations)
    ? article.stations.length
    : Number(article.station_count || article.stations || 0);
  if (stationCount >= 4) return true;
  if (typeof article.words === "number" && article.words >= 1500) return true;
  if (typeof article.length === "number" && article.length >= 9000) return true;
  const headingCount = (String(article.text || "").match(/^##\s+/gm) || []).length;
  if (headingCount >= 4) return true;
  return false;
}

function normalizeLanes(lanes) {
  if (!lanes) return { fi: true, sv: 0, en: 0 };
  if (Array.isArray(lanes)) {
    return {
      fi: lanes.includes("fi"),
      sv: lanes.includes("sv") ? 1 : 0,
      en: lanes.includes("en") ? 1 : 0,
    };
  }
  return {
    fi: Boolean(lanes.fi ?? true),
    sv: Number(lanes.sv || 0),
    en: Number(lanes.en || 0),
  };
}

function normalizeRoadData(raw) {
  if (!raw) return { roadKind: "sections", article: {}, stations: [], ghost_stations: [], eras: [] };
  if (Array.isArray(raw.stations)) {
    const stations = raw.stations.map((s, idx) => ({
      no: s.no ?? idx + 1,
      heading: s.heading || s.title || t("road.sectionNumbered", { no: idx + 1 }),
      words: s.words ?? 300,
      reading_minutes: s.reading_minutes ?? Math.max(1, Math.round((s.words || 300) / 220)),
      summary: s.summary || s.summary_short || "",
      facts: Array.isArray(s.facts) ? s.facts.slice(0, 3) : [],
      years: Array.isArray(s.years) ? s.years : s.event_year ? [s.event_year] : [],
      posts: Array.isArray(s.posts) ? s.posts : [],
      text: s.text || s.summary_long || s.summary || "",
      history: s.history || null,
      lanes: normalizeLanes(s.lanes),
      branches: Array.isArray(s.branches) ? s.branches : [],
    }));
    const totalWords =
      raw.article?.words ?? stations.reduce((acc, s) => acc + (s.words || 0), 0);
    const totalMins =
      raw.article?.reading_minutes ??
      Math.max(1, stations.reduce((acc, s) => acc + (s.reading_minutes || 0), 0));
    return {
      roadKind: "sections",
      topic: {
        title: raw.article?.title || raw.topic?.title || "Talvisota",
        lang: raw.article?.lang || "fi",
        page_id: raw.article?.page_id ?? 1256,
        category: null,
      },
      eras: [],
      article: {
        lang: raw.article?.lang || "fi",
        page_id: raw.article?.page_id ?? 1256,
        wikidata_id: raw.article?.wikidata_id || null,
        title: raw.article?.title || raw.topic?.title || "Talvisota",
        url: raw.article?.url || "https://fi.wikipedia.org/wiki/Talvisota",
        words: totalWords,
        reading_minutes: totalMins,
        has_history: Boolean(raw.article?.has_history ?? true),
      },
      stations,
      ghost_stations: Array.isArray(raw.ghost_stations) ? raw.ghost_stations : [],
    };
  }

  const events = raw.events || [];
  const topicMeta = raw.topic || {};
  const stations = events.map((ev, idx) => ({
    no: idx + 1,
    lang: ev.lang || topicMeta.lang || "fi",
    page_id: ev.page_id ?? null,
    heading: ev.heading || ev.title || `Milestone ${idx + 1}`,
    words: ev.words ?? 0,
    reading_minutes: ev.reading_minutes ?? 1,
    event_year: ev.event_year ?? null,
    event_label: ev.event_label || (ev.event_year ? String(ev.event_year) : ""),
    url: ev.url || null,
    thumb_url: ev.thumb_url || null,
    thumb_file: ev.thumb_file || null,
    summary: ev.summary || ev.summary_short || "",
    facts: Array.isArray(ev.facts) ? ev.facts.slice(0, 3) : [],
    years: Array.isArray(ev.years) ? ev.years : ev.event_year ? [ev.event_year] : [],
    posts: Array.isArray(ev.posts) ? ev.posts : [],
    text: ev.text || ev.summary_long || ev.summary_short || "",
    history:
      ev.history ||
      (ev.has_history && ev.first_added_year
        ? {
            added_year: ev.first_added_year,
            changes: ev.changes || 1,
            war_years: ev.war_years || [],
          }
        : null),
    lanes: normalizeLanes(ev.lanes),
    branches: Array.isArray(ev.branches) ? ev.branches : [],
  }));
  const totalWords = stations.reduce((acc, s) => acc + s.words, 0);
  const totalMins = stations.reduce((acc, s) => acc + s.reading_minutes, 0);
  return {
    roadKind: "topic",
    topic: {
      title: topicMeta.title || "Talvisota",
      lang: topicMeta.lang || "fi",
      page_id: topicMeta.page_id ?? null,
      category: topicMeta.category || null,
    },
    eras: Array.isArray(raw.eras) ? raw.eras : [],
    article: {
      lang: raw.article?.lang || topicMeta.lang || "fi",
      page_id: raw.article?.page_id ?? topicMeta.page_id ?? null,
      wikidata_id: raw.article?.wikidata_id || null,
      title: raw.article?.title || topicMeta.title || "Talvisota",
      url: raw.article?.url || "https://fi.wikipedia.org/wiki/Talvisota",
      words: totalWords,
      reading_minutes: totalMins,
      has_history: true,
    },
    stations,
    ghost_stations: Array.isArray(raw.ghost_stations) ? raw.ghost_stations : [],
  };
}

export function createUI({
  onSearchSubmit,
  onAskSubmit,
  onClearSearch,
  onSelectStarByKey,
  onFollowThread,
  onSelectMilestone,
  onSelectAsOfYear,
  onSaveConstellation,
  onClearConstellation,
  onClosePanel,
  onSelectLens,
  onEnterRoad,
  onExitRoad,
  onSelectRoadEventIndex,
  onRoadBranchClick,
  onEnterSummaryTrail,
  onExitSummaryTrail,
  onSelectSummaryIndex,
  onSummaryOpenFullArticle,
}) {
  const skyTopBar = document.getElementById("sky-top-bar");
  const searchForm = document.getElementById("search-form");
  const searchInput = document.getElementById("search-input");
  const searchClearBtn = document.getElementById("search-clear-btn");
  const btnAsk = document.getElementById("btn-ask");
  const lensSwitcher = document.getElementById("lens-switcher");
  const langSwitcher = document.getElementById("lang-switcher");
  const statusLoading = document.getElementById("status-loading");
  const searchFeedback = document.getElementById("search-feedback");
  const searchResultsPanel = document.getElementById("search-results-panel");
  const askPanel = document.getElementById("ask-panel");
  const constellationBar = document.getElementById("constellation-bar");

  const roadTopBar = document.getElementById("road-top-bar");
  const btnBackToSky = document.getElementById("btn-back-to-sky");
  const roadTopicTitle = document.getElementById("road-topic-title");
  const roadTopicMeta = document.getElementById("road-topic-meta");
  const roadCardsStage = document.getElementById("road-cards-stage");
  const timesliderRoot = document.getElementById("timeslider-root");
  const roadEraMinimap = document.getElementById("road-era-minimap");
  const skyLegend = document.getElementById("sky-legend");

  const summaryTopBar = document.getElementById("summary-top-bar");
  const summaryBackBtn = document.getElementById("summary-back-btn");
  const summaryTrailTitle = document.getElementById("summary-trail-title");
  const summaryTrailMeta = document.getElementById("summary-trail-meta");
  const summaryOpenArticleBtn = document.getElementById("summary-open-article-btn");
  const summaryFocusedOverlay = document.getElementById("summary-focused-overlay");
  const summaryBottomBar = document.getElementById("summary-bottom-bar");
  const summaryPrevBtn = document.getElementById("summary-prev-btn");
  const summaryNextBtn = document.getElementById("summary-next-btn");
  const summaryProgressText = document.getElementById("summary-progress-text");

  const hoverLabel = document.getElementById("hover-label");
  const projectedLabelsContainer = document.getElementById("projected-labels");

  const articlePanel = document.getElementById("article-panel");
  const panelThumbFigure = document.getElementById("panel-thumb-figure");
  const panelThumbImg = document.getElementById("panel-thumb-img");
  const panelThumbCaption = document.getElementById("panel-thumb-caption");
  const panelTitle = document.getElementById("panel-title");
  const panelCloseBtn = document.getElementById("panel-close-btn");
  const panelLanguages = document.getElementById("panel-languages");
  const panelSiblingOffer = document.getElementById("panel-sibling-offer");
  const panelTabs = document.getElementById("panel-tabs");
  const tabBtnToday = document.getElementById("tab-btn-today");
  const tabBtnHistory = document.getElementById("tab-btn-history");
  const panelNoHistory = document.getElementById("panel-no-history");

  const tabViewToday = document.getElementById("tab-view-today");
  const panelMarkdown = document.getElementById("panel-markdown");
  const panelCategories = document.getElementById("panel-categories");
  const panelThreadsSection = document.getElementById("panel-threads-section");

  const tabViewHistory = document.getElementById("tab-view-history");
  const panelSvtSummary = document.getElementById("panel-svt-summary");
  const panelSvtMonths = document.getElementById("panel-svt-months");
  const panelSvtPresets = document.getElementById("panel-svt-presets");
  const panelAsofMeta = document.getElementById("panel-asof-meta");
  const panelAsofBlocks = document.getElementById("panel-asof-blocks");
  const panelDiffSection = document.getElementById("panel-diff-section");
  const panelSummarizeBtn = document.getElementById("panel-summarize-btn");
  const panelRoadBtn = document.getElementById("panel-road-btn");
  const panelWikiLink = document.getElementById("panel-wiki-link");

  // Three Lenses switcher buttons ("meaning" | "history" | "geography")
  function setActiveLensButton(lensName) {
    lensSwitcher?.querySelectorAll(".lens-btn").forEach((btn) => {
      const isMatch = btn.dataset.lens === lensName;
      btn.classList.toggle("is-active", isMatch);
      btn.setAttribute("aria-pressed", isMatch ? "true" : "false");
    });
  }

  lensSwitcher?.querySelectorAll(".lens-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const lens = btn.dataset.lens;
      if (lens) {
        setActiveLensButton(lens);
        onSelectLens?.(lens);
      }
    });
  });

  langSwitcher?.querySelectorAll(".lang-switch-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const code = btn.dataset.uiLang;
      if (code && code !== uiLang) {
        setLang(code);
      }
    });
  });

  panelSiblingOffer?.addEventListener("click", () => {
    const sLang = panelSiblingOffer.dataset.lang;
    const sTitle = panelSiblingOffer.dataset.title;
    if (sLang && sTitle) {
      onSearchSubmit?.(sTitle, sLang, { openDirectly: true });
    }
  });

  // Demo prompt chips
  document.querySelectorAll(".prompt-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const action = chip.dataset.action;
      if (action === "ask") {
        const q = chip.dataset.query || t("demo.askQuery");
        searchInput.value = q;
        searchClearBtn.hidden = false;
        onAskSubmit?.(q);
      } else if (action === "article") {
        onSelectStarByKey?.(chip.dataset.lang, Number(chip.dataset.pageId), { openTab: "history" });
      } else if (action === "threads") {
        onSelectStarByKey?.(chip.dataset.lang, Number(chip.dataset.pageId), { openTab: "today", startConstellation: true });
      } else if (action === "road") {
        onEnterRoad?.({ lang: chip.dataset.lang || "fi", page_id: Number(chip.dataset.pageId || 1256), mode: "topic" });
      }
    });
  });

  // Road top bar controls
  btnBackToSky?.addEventListener("click", () => {
    onExitRoad?.();
  });

  document.querySelectorAll(".road-topic-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      if (chip.dataset.roadCategory) {
        onEnterRoad?.({ category: chip.dataset.roadCategory, mode: "topic" });
      } else if (chip.dataset.roadPage) {
        onEnterRoad?.({
          lang: chip.dataset.roadLang || "fi",
          page_id: Number(chip.dataset.roadPage),
          mode: chip.dataset.roadMode || "topic",
        });
      }
    });
  });

  function isQuestionQuery(q) {
    const lower = q.toLowerCase();
    return (
      q.endsWith("?") ||
      /^(how|what|why|when|where|who|explain|tell|miten|mikä|miksi|milloin|missä|kuka|hur|vad|varför|när|var|vem)\b/i.test(q) ||
      lower.includes("kết thúc") ||
      lower.includes("thế nào") ||
      lower.includes("winter war end") ||
      lower.includes("talvisota päättyi") ||
      lower.includes("vinterkriget")
    );
  }

  // Search form submit
  searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const q = searchInput.value.trim();
    if (!q) {
      clearLeftOverlays();
      onClearSearch?.();
      return;
    }
    if (isQuestionQuery(q)) {
      onAskSubmit?.(q);
    } else {
      onSearchSubmit?.(q);
    }
  });

  btnAsk.addEventListener("click", () => {
    const q = searchInput.value.trim() || t("demo.askQuery");
    searchInput.value = q;
    searchClearBtn.hidden = false;
    onAskSubmit?.(q);
  });

  searchInput.addEventListener("input", () => {
    const hasText = searchInput.value.trim().length > 0;
    searchClearBtn.hidden = !hasText;
    if (!hasText) {
      clearLeftOverlays();
      onClearSearch?.();
    }
  });

  searchClearBtn.addEventListener("click", () => {
    searchInput.value = "";
    clearLeftOverlays();
    searchInput.focus();
    onClearSearch?.();
  });

  function setLoading(isLoading) {
    statusLoading.hidden = !isLoading;
  }

  function showError(msg = t("error.network")) {
    searchFeedback.textContent = msg;
    searchFeedback.classList.add("is-error");
    searchFeedback.hidden = false;
  }

  function clearLeftOverlays() {
    searchClearBtn.hidden = searchInput.value.trim().length === 0;
    searchFeedback.hidden = true;
    searchFeedback.classList.remove("is-error");
    searchFeedback.textContent = "";
    searchResultsPanel.hidden = true;
    searchResultsPanel.innerHTML = "";
    askPanel.hidden = true;
    askPanel.innerHTML = "";
  }

  // Render Search Results + "also in" language dots
  function renderSearchResults(searchRes) {
    askPanel.hidden = true;
    searchFeedback.classList.remove("is-error");

    const rows = searchRes?.rows || [];
    const also = searchRes?.also || {};

    if (rows.length === 0) {
      searchResultsPanel.hidden = true;
      searchFeedback.textContent = t("search.emptyHint");
      searchFeedback.hidden = false;
      return;
    }

    searchFeedback.hidden = true;
    const alsoInPrefix = escapeHtml(t("search.alsoInPrefix"));
    const itemsHtml = rows
      .slice(0, 8)
      .map((r) => {
        // `also` is keyed by wikidata_id and excludes only the first row's language, so merge in the
        // other result rows of the same entity and drop this row's own language.
        const merged = new Map();
        for (const [sLang, sTitle] of [
          ...rows.filter((o) => o.wikidata_id && o.wikidata_id === r.wikidata_id).map((o) => [o.lang, o.title]),
          ...(r.wikidata_id && also[r.wikidata_id] ? also[r.wikidata_id] : []),
        ]) {
          if (sLang !== r.lang && !merged.has(sLang)) merged.set(sLang, sTitle);
        }
        const siblings = [...merged];
        const alsoHtml =
          siblings.length > 0
            ? `<span class="search-also-group" aria-label="Also in other languages">${alsoInPrefix} ${siblings
                .map(
                  ([sLang, sTitle]) =>
                    `<button type="button" class="also-lang-btn" data-lang="${escapeHtml(
                      sLang
                    )}" data-title="${escapeHtml(sTitle)}" title="${escapeHtml(
                      `${langName(sLang)}: ${sTitle}`
                    )}"><span class="dot dot-${escapeHtml(sLang)}"></span>${escapeHtml(sLang)}</button>`
                )
                .join(" ")}</span>`
            : "";

        return `
          <div class="search-result-row">
            <button type="button" class="search-result-main" data-lang="${escapeHtml(r.lang)}" data-page-id="${r.page_id}">
              <span class="dot dot-${escapeHtml(r.lang)}"></span>
              <span class="search-result-title">${escapeHtml(r.title)}</span>
            </button>
            ${alsoHtml}
          </div>
        `;
      })
      .join("");

    searchResultsPanel.innerHTML = `
      <div class="overlay-card-header">
        <span class="overlay-card-label">${escapeHtml(t("search.matchCount", { count: rows.length }))}</span>
        <button type="button" class="btn-inline-close" id="close-search-results">${escapeHtml(t("nav.close"))}</button>
      </div>
      <div class="search-results-list">${itemsHtml}</div>
    `;
    searchResultsPanel.hidden = false;

    searchResultsPanel.querySelector("#close-search-results")?.addEventListener("click", () => {
      searchResultsPanel.hidden = true;
      onClearSearch?.();
    });

    searchResultsPanel.querySelectorAll(".search-result-main").forEach((btn) => {
      btn.addEventListener("click", () => {
        onSelectStarByKey?.(btn.dataset.lang, Number(btn.dataset.pageId));
      });
    });

    searchResultsPanel.querySelectorAll(".also-lang-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const qTitle = btn.dataset.title;
        const sLang = btn.dataset.lang;
        onSearchSubmit?.(qTitle, sLang);
      });
    });
  }

  // Render Grounded AI Ask Answer + "This answer changed N times" strip + Memory Threads tree
  function renderAskResult({
    query,
    askRes,
    threads = [],
    activeMilestoneIdx = -1,
    milestoneDiff = null,
    todayRevId = null,
  }) {
    searchResultsPanel.hidden = true;
    searchFeedback.hidden = true;

    const topSource =
      askRes.sources?.find(
        (s) => s.lang === askRes.top?.lang && s.page_id === askRes.top?.page_id
      ) || askRes.sources?.[0];
    const topTitle = topSource ? topSource.title : `${askRes.top.lang}:${askRes.top.page_id}`;

    const sourcesHtml = (askRes.sources || [])
      .map(
        (s) => `
        <button type="button" class="ask-source-chip" data-lang="${escapeHtml(s.lang)}" data-page-id="${s.page_id}">
          <span class="source-num">[${s.n}]</span>
          <span class="dot dot-${escapeHtml(s.lang)}"></span>
          <span>${escapeHtml(s.title)}</span>
        </button>
      `
      )
      .join("");

    let milestonesHtml = "";
    if (!askRes.history_available || !askRes.milestones || askRes.milestones.length === 0) {
      milestonesHtml = `<p class="ask-no-history">${escapeHtml(t("ask.noHistory"))}</p>`;
    } else {
      const m = askRes.milestones.length;
      const stripTitle =
        m === 1
          ? t("ask.unchangedSince", { year: askRes.milestones[0].from_year })
          : t("ask.changedTimes", { count: m - 1 });
      const nodesHtml = askRes.milestones
        .map((ms, idx) => {
          const isSelected = idx === activeMilestoneIdx;
          const oldidUrl = ms.url || buildWikiOldidUrl("fi", ms.rev_id);
          const cb = ms.changed_by;
          const cbHtml = cb
            ? `<span class="milestone-card-changed-by">${escapeHtml(
                t("ask.changedBy", { user: cb.user || "", date: fmtDate(cb.row_start) })
              )} <a href="${escapeHtml(
                cb.url || buildWikiOldidUrl("fi", cb.rev_id)
              )}" target="_blank" rel="noopener noreferrer" class="milestone-oldid-link">oldid=${escapeHtml(
                cb.rev_id
              )}</a></span>`
            : "";
          return `
            <div class="milestone-node-card ${isSelected ? "is-active" : ""}">
              <button type="button" class="milestone-node-btn" data-ms-idx="${idx}">
                <span class="milestone-dot"></span>
                <span class="milestone-years">${ms.from_year}–${ms.to_year}</span>
                <span class="milestone-user">${escapeHtml(ms.user)}</span>
              </button>
              ${cbHtml}
              <a
                href="${escapeHtml(oldidUrl)}"
                target="_blank"
                rel="noopener noreferrer"
                class="milestone-oldid-link"
                title="${escapeHtml(t("ask.openRevisionTitle", { revId: ms.rev_id }))}"
              >oldid=${ms.rev_id}</a>
            </div>
          `;
        })
        .join("");

      const selectedMs =
        activeMilestoneIdx >= 0 && askRes.milestones[activeMilestoneIdx]
          ? askRes.milestones[activeMilestoneIdx]
          : null;

      let selectedMsDetailHtml = "";
      if (selectedMs) {
        const oldidUrl = selectedMs.url || buildWikiOldidUrl("fi", selectedMs.rev_id);
        const diffHtml = milestoneDiff ? renderDiffPartsHtml(milestoneDiff.parts) : "";
        const showMsMt = Boolean(askRes.out_lang && askRes.out_lang !== "fi");
        const msMtHtml = showMsMt
          ? `<span class="mt-label">${escapeHtml(mtFromLabel(["fi"]))}</span>`
          : "";
        const changedBy = selectedMs.changed_by;
        const changedByHtml = changedBy
          ? `<span class="milestone-changed-by">${escapeHtml(
              t("ask.changedBy", {
                user: changedBy.user || "",
                date: fmtDate(changedBy.row_start),
              })
            )} <a href="${escapeHtml(
              changedBy.url || buildWikiOldidUrl("fi", changedBy.rev_id)
            )}" target="_blank" rel="noopener noreferrer" class="oldid-anchor">oldid=${escapeHtml(
              changedBy.rev_id
            )}</a></span>`
          : "";
        const metaStripHtml =
          msMtHtml || changedByHtml
            ? `<div class="milestone-meta-strip">${msMtHtml}${changedByHtml}</div>`
            : "";

        const msFacts = Array.isArray(selectedMs.facts) ? selectedMs.facts : [];
        const msFactsHtml =
          msFacts.length > 0
            ? `<div class="facts-source-list">${msFacts
                .map((f) => {
                  const factUrl = f.url || oldidUrl;
                  return renderFactSourceItemHtml({
                    claimHtml: escapeHtml(f.text || ""),
                    sourceSentence: f.source_sentence || "",
                    sourceLang: "fi",
                    oldidUrl: factUrl,
                    oldid: extractOldid(factUrl, selectedMs.rev_id),
                  });
                })
                .join("")}</div>`
            : "";

        selectedMsDetailHtml = `
          <div class="milestone-detail-box">
            <div class="milestone-detail-header">
              <span>${escapeHtml(
                t("ask.versionSpan", {
                  from: selectedMs.from_year,
                  to: selectedMs.to_year,
                  user: selectedMs.user,
                })
              )}</span>
              <a href="${escapeHtml(oldidUrl)}" target="_blank" rel="noopener noreferrer" class="oldid-anchor">oldid=${selectedMs.rev_id}</a>
            </div>
            ${selectedMs.comment ? `<p class="milestone-comment">"${escapeHtml(selectedMs.comment)}"</p>` : ""}
            ${metaStripHtml}
            <p class="milestone-answer-paragraph">${escapeHtml(selectedMs.answer)}</p>
            ${msFactsHtml}
            ${
              diffHtml
                ? `<div class="milestone-inline-diff">
                    <div class="diff-caption">${escapeHtml(t("ask.diffToday"))}${todayRevId ? ` (<a href="${escapeHtml(buildWikiOldidUrl("fi", todayRevId))}" target="_blank" rel="noopener noreferrer" class="oldid-anchor">oldid=${todayRevId}</a>)` : ""}</div>
                    ${diffHtml}
                  </div>`
                : ""
            }
          </div>
        `;
      }

      milestonesHtml = `
        <div class="milestone-strip-section">
          <div class="milestone-strip-title">${escapeHtml(stripTitle)}</div>
          <div class="milestone-nodes-row">${nodesHtml}</div>
          ${selectedMsDetailHtml}
        </div>
      `;
    }

    let askProvenanceHtml = "";
    if (askRes.out_lang) {
      if (askRes.out_lang !== uiLang) {
        askProvenanceHtml = `<p class="i18n-fallback-note">${escapeHtml(
          fallbackNoteText(askRes.out_lang)
        )}</p>`;
      } else {
        const diffSourceLangs = [];
        for (const s of askRes.sources || []) {
          if (s.lang && s.lang !== askRes.out_lang && !diffSourceLangs.includes(s.lang)) {
            diffSourceLangs.push(s.lang);
          }
        }
        if (diffSourceLangs.length > 0) {
          askProvenanceHtml = `<div class="mt-label">${escapeHtml(mtFromLabel(diffSourceLangs))}</div>`;
        }
      }
    }

    const threadsTreeHtml = renderThreadsTreeHtml(topTitle, askRes.top, threads);

    askPanel.innerHTML = `
      <div class="overlay-card-header">
        <button type="button" class="ask-top-star-btn" id="ask-top-star-btn">
          <span class="star-glyph" aria-hidden="true">★</span>
          <span>${escapeHtml(topTitle)}</span>
        </button>
        <button type="button" class="btn-inline-close" id="close-ask-panel">${escapeHtml(t("nav.close"))}</button>
      </div>
      ${askProvenanceHtml}
      <div class="ask-answer-body">${formatAnswerText(askRes.answer)}</div>
      ${sourcesHtml ? `<div class="ask-sources-row">${sourcesHtml}</div>` : ""}
      ${milestonesHtml}
      ${threadsTreeHtml}
    `;
    askPanel.hidden = false;

    askPanel.querySelector("#close-ask-panel")?.addEventListener("click", () => {
      askPanel.hidden = true;
      onClearSearch?.();
    });

    askPanel.querySelector("#ask-top-star-btn")?.addEventListener("click", () => {
      if (askRes.top) {
        onSelectStarByKey?.(askRes.top.lang, askRes.top.page_id);
      }
    });

    askPanel.querySelectorAll(".ask-source-chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        onSelectStarByKey?.(btn.dataset.lang, Number(btn.dataset.pageId));
      });
    });

    askPanel.querySelectorAll(".milestone-node-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.dataset.msIdx);
        const ms = askRes.milestones[idx];
        if (ms) {
          onSelectMilestone?.(askRes, ms, idx);
        }
      });
    });

    wireThreadButtons(askPanel);
  }

  function renderThreadsTreeHtml(sourceTitle, sourceKey, threads = []) {
    if (!threads || threads.length === 0) return "";
    const branchesHtml = threads
      .map((t) => {
        const isGhost = t.type === "ghost";
        const branchClass = isGhost ? "thread-branch is-ghost" : `thread-branch is-${escapeHtml(t.type)}`;
        const ghostYears =
          isGhost && t.first_year && t.removed_year
            ? ` (${t.first_year}–${t.removed_year})`
            : "";
        return `
          <div class="${branchClass}">
            <div class="thread-connector" aria-hidden="true">${isGhost ? "└ ─ ─" : "├──"}</div>
            <div class="thread-content">
              <div class="thread-top-line">
                <span class="thread-reason">${escapeHtml(t.reason)}</span>
                <button
                  type="button"
                  class="thread-target-btn"
                  data-source-lang="${escapeHtml(sourceKey?.lang || "fi")}"
                  data-source-id="${sourceKey?.page_id || ""}"
                  data-target-lang="${escapeHtml(t.target.lang)}"
                  data-target-id="${t.target.page_id}"
                >
                  <span class="dot dot-${escapeHtml(t.target.lang)}"></span>
                  <span>${escapeHtml(t.target.title)}${escapeHtml(ghostYears)}</span>
                </button>
              </div>
              <p class="thread-summary">${escapeHtml(t.summary)}</p>
            </div>
          </div>
        `;
      })
      .join("");

    return `
      <div class="threads-tree" aria-label="Memory threads">
        <div class="threads-tree-root">
          <span class="star-glyph" aria-hidden="true">★</span>
          <span>${escapeHtml(t("threads.heading", { title: sourceTitle }))}</span>
        </div>
        <div class="threads-branches">${branchesHtml}</div>
      </div>
    `;
  }

  function wireThreadButtons(rootEl) {
    rootEl.querySelectorAll(".thread-target-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        onFollowThread?.({
          sourceLang: btn.dataset.sourceLang,
          sourcePageId: Number(btn.dataset.sourceId),
          targetLang: btn.dataset.targetLang,
          targetPageId: Number(btn.dataset.targetId),
        });
      });
    });
  }

  // Render Birch Constellation Path bar + "Save this constellation"
  function renderConstellationBar(pathStars = [], savedHash = "") {
    if (!pathStars || pathStars.length < 2) {
      constellationBar.hidden = true;
      constellationBar.innerHTML = "";
      return;
    }

    const hopsHtml = pathStars
      .map(
        (s, idx) => `
        <button type="button" class="constellation-hop-btn" data-lang="${escapeHtml(s.lang)}" data-page-id="${s.page_id}">
          <span class="hop-index">${idx + 1}.</span>
          <span>${escapeHtml(s.title)}</span>
        </button>
      `
      )
      .join('<span class="hop-sep" aria-hidden="true">/</span>');

    constellationBar.innerHTML = `
      <div class="constellation-hops">${hopsHtml}</div>
      <div class="constellation-actions">
        <button type="button" class="btn-control btn-save-constellation" id="btn-save-constellation">
          ${savedHash ? escapeHtml(t("nav.savedConstellation", { title: savedHash })) : escapeHtml(t("nav.saveConstellation"))}
        </button>
        <button type="button" class="btn-inline-close" id="btn-clear-constellation">${escapeHtml(t("nav.clear"))}</button>
      </div>
    `;
    constellationBar.hidden = false;

    constellationBar.querySelectorAll(".constellation-hop-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        onSelectStarByKey?.(btn.dataset.lang, Number(btn.dataset.pageId));
      });
    });

    constellationBar.querySelector("#btn-save-constellation")?.addEventListener("click", () => {
      onSaveConstellation?.();
    });

    constellationBar.querySelector("#btn-clear-constellation")?.addEventListener("click", () => {
      onClearConstellation?.();
    });
  }

  // Hover label next to cursor (never shown once Talvitie road mode is active)
  function updateHoverLabel(star, clientX, clientY, isEditWar = false) {
    if (!star || activeRoadState) {
      hoverLabel.hidden = true;
      return;
    }
    const dotClass = isEditWar ? "dot-war" : `dot-${star.lang}`;
    hoverLabel.innerHTML = `<span class="dot ${dotClass}"></span><span class="hover-title">${escapeHtml(star.title)}</span>`;
    hoverLabel.hidden = false;

    const pad = 16;
    const maxLeft = window.innerWidth - 260;
    const maxTop = window.innerHeight - 60;
    const x = Math.min(maxLeft, clientX + pad);
    const y = Math.min(maxTop, Math.max(16, clientY - 12));
    hoverLabel.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
  }

  // 3D Projected Labels (Search results + active threads + sky cluster roads + lens guides + Talvitie road numerals/gaps/branches/ghosts)
  let projectedMap = new Map();
  let projectedReasonMap = new Map();
  let projectedClusterMap = new Map();
  let projectedGuideMap = new Map();
  let projectedRoadYearMap = new Map();
  let projectedRoadGapMap = new Map();
  let projectedRoadBranchMap = new Map();
  let projectedRoadGhostMap = new Map();

  function syncPool(mapObj, items, keyFn, createFn, updateFn) {
    const activeKeys = new Set(items.map(keyFn));
    for (const [k, el] of mapObj.entries()) {
      if (!activeKeys.has(k)) {
        el.remove();
        mapObj.delete(k);
      }
    }
    for (const item of items) {
      const k = keyFn(item);
      let el = mapObj.get(k);
      if (!el) {
        el = createFn(item);
        projectedLabelsContainer.appendChild(el);
        mapObj.set(k, el);
      }
      updateFn(el, item);
    }
  }

  function updateProjectedLabels(
    {
      starLabels = [],
      threadLabels = [],
      clusterLabels = [],
      lensGuideLabels = [],
      roadYearLabels = [],
      roadGapLabels = [],
      roadBranchLabels = [],
      roadGhostLabels = [],
    },
    currentYear,
    isEditWarFn
  ) {
    // 1. Star labels
    syncPool(
      projectedMap,
      starLabels,
      (item) => `${item.star.lang}:${item.star.page_id}`,
      (item) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "projected-star-label";
        btn.addEventListener("click", () => {
          onSelectStarByKey?.(item.star.lang, item.star.page_id);
        });
        return btn;
      },
      (btn, { star, x, y, isSelected, threadType }) => {
        const isWar = isEditWarFn ? isEditWarFn(star, currentYear) : false;
        const dotClass = isWar ? "dot-war" : `dot-${star.lang}`;
        btn.classList.toggle("is-selected", Boolean(isSelected));
        btn.classList.toggle("is-ghost-target", threadType === "ghost");
        const nextHtml = `<span class="dot ${dotClass}"></span><span>${escapeHtml(star.title)}</span>`;
        if (btn.dataset.renderedHtml !== nextHtml) {
          btn.innerHTML = nextHtml;
          btn.dataset.renderedHtml = nextHtml;
        }
        btn.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
      }
    );

    // 2. Thread reason pills
    syncPool(
      projectedReasonMap,
      threadLabels,
      (item) => `${item.targetStar.lang}:${item.targetStar.page_id}`,
      () => {
        const pill = document.createElement("span");
        pill.className = "projected-thread-reason";
        return pill;
      },
      (pill, item) => {
        pill.classList.toggle("is-ghost", item.thread.type === "ghost");
        if (pill.textContent !== item.thread.reason) {
          pill.textContent = item.thread.reason;
        }
        pill.style.transform = `translate3d(${Math.round(item.x)}px, ${Math.round(item.y)}px, 0)`;
      }
    );

    // 3. Sky cluster road labels (click to enter Talvitie mode!)
    syncPool(
      projectedClusterMap,
      clusterLabels,
      (item) => item.id,
      (item) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "projected-cluster-road-btn";
        btn.addEventListener("click", () => {
          onEnterRoad?.(item.query);
        });
        return btn;
      },
      (btn, item) => {
        const html = `<span class="cluster-road-title">${escapeHtml(item.label)}</span><span class="cluster-road-sub">${escapeHtml(item.sublabel)}</span>`;
        if (btn.dataset.renderedHtml !== html) {
          btn.innerHTML = html;
          btn.dataset.renderedHtml = html;
        }
        btn.style.transform = `translate3d(${Math.round(item.x)}px, ${Math.round(item.y)}px, 0)`;
      }
    );

    // 4. Lens guide labels (History spiral eras / Geography cities & Unlocated articles)
    syncPool(
      projectedGuideMap,
      lensGuideLabels,
      (item) => item.label,
      () => {
        const span = document.createElement("span");
        span.className = "projected-lens-guide";
        return span;
      },
      (span, item) => {
        if (span.textContent !== item.label) {
          span.textContent = item.label;
        }
        span.style.transform = `translate3d(${Math.round(item.x)}px, ${Math.round(item.y)}px, 0)`;
      }
    );

    // 5. Talvitie road historical years along the right edge of the road (large Literata numerals)
    syncPool(
      projectedRoadYearMap,
      roadYearLabels,
      (item) => `ry-${item.index ?? item.stationIndex ?? 0}`,
      (item) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "projected-road-year";
        btn.addEventListener("click", () => {
          onSelectRoadEventIndex?.(item.index ?? item.stationIndex ?? 0);
        });
        return btn;
      },
      (btn, item) => {
        btn.classList.toggle("is-current", Boolean(item.isCurrent));
        const textVal = String(item.year ?? item.label ?? "");
        if (btn.textContent !== textVal) {
          btn.textContent = textVal;
        }
        btn.style.transform = `translate3d(${Math.round(item.x)}px, ${Math.round(item.y)}px, 0)`;
      }
    );

    // 6. Talvitie non-linear compressed gap markers
    syncPool(
      projectedRoadGapMap,
      roadGapLabels,
      (item) => item.label,
      () => {
        const span = document.createElement("span");
        span.className = "projected-road-gap";
        return span;
      },
      (span, item) => {
        if (span.textContent !== item.label) {
          span.textContent = item.label;
        }
        span.style.transform = `translate3d(${Math.round(item.x)}px, ${Math.round(item.y)}px, 0)`;
      }
    );

    // 7. Talvitie 3D side branch markers
    syncPool(
      projectedRoadBranchMap,
      roadBranchLabels,
      (item) => {
        const br = item.branch || item;
        const stIdx = item.stationIndex ?? item.eventIndex ?? item.index ?? 0;
        return `${stIdx}:${br.page_id ?? br.title}`;
      },
      (item) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "projected-road-branch";
        btn.addEventListener("click", () => {
          onRoadBranchClick?.(item.branch || item);
        });
        return btn;
      },
      (btn, item) => {
        const br = item.branch || item;
        const html = `<span class="branch-reason">${escapeHtml(br.reason)}</span><span class="branch-title">${escapeHtml(br.title)}</span>`;
        if (btn.dataset.renderedHtml !== html) {
          btn.innerHTML = html;
          btn.dataset.renderedHtml = html;
        }
        btn.style.transform = `translate3d(${Math.round(item.x)}px, ${Math.round(item.y)}px, 0)`;
      }
    );

    // 8. Talvitie 3D ghost station markers ("Section removed in <removed_year>")
    syncPool(
      projectedRoadGhostMap,
      roadGhostLabels,
      (item) => {
        const g = item.ghost || item;
        return `rg-${g.after_no ?? item.index ?? 0}-${g.removed_year ?? ""}-${g.heading ?? ""}`;
      },
      (item) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "projected-road-ghost";
        btn.addEventListener("click", () => {
          openGhostStation(item.ghost || item);
        });
        return btn;
      },
      (btn, item) => {
        const g = item.ghost || item;
        const removedYear = g.removed_year ?? item.removed_year;
        const labelText = removedYear
          ? t("scene.sectionRemoved", { year: removedYear })
          : item.label || g.heading || t("road.removedSectionFallback");
        if (btn.textContent !== labelText) {
          btn.textContent = labelText;
        }
        btn.style.transform = `translate3d(${Math.round(item.x)}px, ${Math.round(item.y)}px, 0)`;
      }
    );
  }

  // ============================================================================
  // Talvitie ("Winter Road") Mode: Nordic Editorial Station Briefing Cards + TOC Minimap
  // ============================================================================
  let activeRoadState = null; // { roadData, activeIndex, expandedSection, activePostHeading, activeGhost, visitedIndices }

  function resolveGhostStation(ghostInput) {
    if (!ghostInput) return null;
    const list = activeRoadState?.roadData?.ghost_stations || [];
    const matched = list.find(
      (g) =>
        (ghostInput.after_no !== undefined && g.after_no === Number(ghostInput.after_no)) ||
        (ghostInput.heading && g.heading === ghostInput.heading)
    );
    return matched ? { ...matched, ...ghostInput, text: matched.text || ghostInput.text } : ghostInput;
  }

  function openGhostStation(ghostInput) {
    if (!activeRoadState) return;
    const resolved = resolveGhostStation(ghostInput);
    if (!resolved) return;
    activeRoadState.activeGhost = resolved;
    renderRoadCards();
    renderRoadEraMinimap();
  }

  function openRoadView(rawRoadData, initialIndex = 0) {
    const roadData = normalizeRoadData(rawRoadData);
    const clampedInit = Math.max(0, Math.min(Math.max(0, roadData.stations.length - 1), initialIndex));
    const visitedIndices = new Set();
    for (let i = 0; i <= clampedInit; i++) {
      visitedIndices.add(i);
    }

    activeRoadState = {
      roadData,
      activeIndex: clampedInit,
      expandedSection: false,
      showAllPosts: false,
      activePostHeading: null,
      activeGhost: null,
      visitedIndices,
    };

    skyTopBar.hidden = true;
    if (langSwitcher) langSwitcher.hidden = true;
    timesliderRoot.hidden = true;
    hoverLabel.hidden = true;
    if (skyLegend) skyLegend.hidden = true;

    const art = roadData.article;
    const topicMeta = roadData.topic || {};
    const totalSections = roadData.stations.length;
    roadTopicTitle.textContent = topicMeta.title || art.title || "Talvisota";
    if (roadTopicMeta) {
      const eras = roadData.eras || [];
      const eraSpan =
        eras.length > 0 ? ` · ${eras[0].from_year}–${eras[eras.length - 1].to_year}` : "";
      roadTopicMeta.textContent = `${t("road.historicalMilestones", { count: totalSections })}${eraSpan}`;
    }

    const activePageId = art.page_id ?? topicMeta.page_id;
    document.querySelectorAll(".road-topic-chip").forEach((chip) => {
      const matchesCategory =
        Boolean(chip.dataset.roadCategory) && chip.dataset.roadCategory === topicMeta.category;
      const matchesPage =
        Boolean(chip.dataset.roadPage) &&
        activePageId !== null &&
        activePageId !== undefined &&
        Number(chip.dataset.roadPage) === Number(activePageId);
      chip.classList.toggle("is-active", matchesCategory || matchesPage);
    });

    roadTopBar.hidden = false;
    roadCardsStage.hidden = false;
    roadEraMinimap.hidden = false;

    renderRoadCards();
    renderRoadEraMinimap();
  }

  function updateRoadActiveIndex(newIndex) {
    if (!activeRoadState) return;
    const stations = activeRoadState.roadData.stations || [];
    const clamped = Math.max(0, Math.min(Math.max(0, stations.length - 1), Number(newIndex) || 0));
    if (activeRoadState.activeIndex !== clamped || activeRoadState.activeGhost !== null) {
      activeRoadState.activeIndex = clamped;
      activeRoadState.expandedSection = false;
      activeRoadState.showAllPosts = false;
      activeRoadState.activePostHeading = null;
      activeRoadState.activeGhost = null;
    }
    for (let i = 0; i <= clamped; i++) {
      activeRoadState.visitedIndices.add(i);
    }
    renderRoadCards();
    renderRoadEraMinimap();
  }

  function closeRoadView() {
    activeRoadState = null;
    roadTopBar.hidden = true;
    roadCardsStage.hidden = true;
    roadCardsStage.innerHTML = "";
    roadEraMinimap.hidden = true;
    roadEraMinimap.innerHTML = "";

    skyTopBar.hidden = false;
    if (langSwitcher) langSwitcher.hidden = false;
    timesliderRoot.hidden = false;
    if (skyLegend) skyLegend.hidden = false;
  }

  function renderLaneDotsHtml(lanes) {
    const laneObj = normalizeLanes(lanes);
    const dots = [`<span class="dot dot-fi" title="${escapeHtml(langName("fi"))}"></span>`];
    if (laneObj.sv > 0) {
      dots.push(`<span class="dot dot-sv" title="${escapeHtml(langName("sv"))}"></span>`);
    }
    if (laneObj.en > 0) {
      dots.push(`<span class="dot dot-en" title="${escapeHtml(langName("en"))}"></span>`);
    }
    return dots.join("");
  }

  function renderLaneCoverageHtml(lanes) {
    const laneObj = normalizeLanes(lanes);
    const coveredNames = [];
    if (laneObj.sv > 0) coveredNames.push(langName("sv"));
    if (laneObj.en > 0) coveredNames.push(langName("en"));
    const labelText =
      coveredNames.length > 0
        ? t("road.alsoCoveredIn", { langs: coveredNames.join(", ") })
        : t("road.finnishOnly");
    return `
      <span class="lane-dots-group">${renderLaneDotsHtml(laneObj)}</span>
      <span class="lane-coverage-text">${escapeHtml(labelText)}</span>
    `;
  }

  function renderRoadCards() {
    if (!activeRoadState) return;
    const {
      roadData,
      activeIndex,
      expandedSection,
      showAllPosts = false,
      activePostHeading,
      activeGhost,
    } = activeRoadState;
    const stations = roadData.stations || [];
    const ghostStations = roadData.ghost_stations || [];
    const isTopicRoad = roadData.roadKind === "topic";
    if (stations.length === 0) return;

    // Dedicated Ghost Station Card state inside #road-cards-stage
    if (activeGhost) {
      const fromYr = activeGhost.from_year ?? "2005";
      const remYr = activeGhost.removed_year ?? "2014";
      const afterNo = activeGhost.after_no ?? (stations[activeIndex]?.no || 1);
      roadCardsStage.innerHTML = `
        <div class="road-perspective-deck is-reading">
          <article class="road-card is-nearest is-ghost-station" aria-label="Removed Wikipedia section">
            <div class="road-ghost-badge-row">
              <span class="road-ghost-badge">
                ${escapeHtml(t("road.removedInExisted", { from: fromYr, removed: remYr }))}
              </span>
            </div>
            <div class="road-card-header-row">
              <h2 class="road-card-title">${escapeHtml(activeGhost.heading || t("road.removedSectionFallback"))}</h2>
            </div>
            <div class="road-ghost-body" tabindex="0">
              <div class="road-ghost-removed-note">${escapeHtml(t("road.archivedIn", { year: remYr }))}</div>
              <div class="road-ghost-markdown">
                ${renderStationMarkdownHtml(activeGhost.text, activeGhost.heading, null, [])}
              </div>
            </div>
            <div class="road-card-footer">
              <button type="button" class="btn-control btn-return-from-ghost" id="btn-return-from-ghost">
                ${escapeHtml(t("road.returnToSection", { no: afterNo }))}
              </button>
            </div>
          </article>
        </div>
      `;

      roadCardsStage.querySelector("#btn-return-from-ghost")?.addEventListener("click", () => {
        const targetAfterNo = Number(activeGhost.after_no);
        activeRoadState.activeGhost = null;
        const foundIdx = stations.findIndex((s) => s.no === targetAfterNo);
        if (foundIdx >= 0 && foundIdx !== activeRoadState.activeIndex) {
          onSelectRoadEventIndex?.(foundIdx);
          updateRoadActiveIndex(foundIdx);
        } else {
          renderRoadCards();
          renderRoadEraMinimap();
        }
      });
      return;
    }

    // Horizon strips (.is-next-2 and .is-next-1) stacked cleanly ABOVE the active station card (.is-nearest)
    const horizonSlots = [
      { idx: activeIndex + 2, slotClass: "is-next-2" },
      { idx: activeIndex + 1, slotClass: "is-next-1" },
    ].filter((s) => s.idx >= 0 && s.idx < stations.length);

    const horizonHtml = horizonSlots
      .map(({ idx, slotClass }) => {
        const st = stations[idx];
        const secNo = String(st.no ?? idx + 1).padStart(2, "0");
        const metricsText = isTopicRoad
          ? escapeHtml(st.event_label || (st.event_year ? String(st.event_year) : ""))
          : escapeHtml(
              t("road.wordsAndMins", {
                words: fmtNumber(st.words || 0),
                mins: fmtNumber(st.reading_minutes || 1),
              })
            );
        return `
          <article
            class="road-card ${slotClass}"
            data-road-idx="${idx}"
            role="button"
            tabindex="0"
            aria-label="${isTopicRoad ? `Milestone ${secNo}` : `Section ${secNo}`}: ${escapeHtml(st.heading)}"
          >
            <div class="horizon-strip-row">
              <div class="horizon-strip-left">
                <span class="horizon-section-no">${escapeHtml(
                  isTopicRoad ? secNo : t("road.sectionNumbered", { no: secNo })
                )}</span>
                <h3 class="horizon-heading">${escapeHtml(st.heading)}</h3>
              </div>
              <div class="horizon-strip-right">
                <span class="horizon-metrics">${metricsText}</span>
                <span class="horizon-lanes">${renderLaneDotsHtml(st.lanes)}</span>
              </div>
            </div>
          </article>
        `;
      })
      .join("");

    const st = stations[activeIndex];
    const idx = activeIndex;

    // Row 2: Memory Badge
    let memoryBadgeHtml = "";
    if (st.history && st.history.added_year) {
      const warYears = Array.isArray(st.history.war_years) ? st.history.war_years : [];
      const warDot =
        warYears.length > 0
          ? `<span class="dot dot-war" title="${escapeHtml(t("road.editWarIn", { years: warYears.join(", ") }))}"></span>`
          : "";
      const changesCount = st.history.changes ?? 1;
      const badgeKey = isTopicRoad ? "road.addedChangedTimes" : "road.addedRewrittenTimes";
      memoryBadgeHtml = `
        <div class="road-memory-badge">
          ${warDot}
          <span>${escapeHtml(t(badgeKey, { year: st.history.added_year, count: changesCount }))}</span>
        </div>
      `;
    }

    // Topic Road optional thumbnail
    const thumbRowHtml =
      isTopicRoad && st.thumb_url
        ? `
          <div class="road-event-thumb-row">
            <img class="road-event-thumb-img" src="${escapeHtml(st.thumb_url)}" alt="${escapeHtml(st.heading)}" />
            ${
              st.thumb_file
                ? `<a class="road-event-thumb-caption" href="https://commons.wikimedia.org/wiki/File:${encodeURIComponent(
                    st.thumb_file
                  )}" target="_blank" rel="noopener noreferrer">Wikimedia Commons · ${escapeHtml(
                    st.thumb_file
                  )}</a>`
                : ""
            }
          </div>
        `
        : "";

    // Row 4: Facts Ledger (max 3)
    const facts = (st.facts || []).slice(0, 3);
    const factsHtml =
      facts.length > 0
        ? `
          <div class="road-facts-ledger" style="grid-template-columns: repeat(${facts.length}, minmax(0, 1fr))">
            ${facts
              .map(
                (f) => `
                <div class="road-fact-cell">
                  <span class="road-fact-label">${escapeHtml(f.label)}</span>
                  <span class="road-fact-value">${escapeHtml(f.value)}</span>
                </div>
              `
              )
              .join("")}
          </div>
        `
        : "";

    // Row 5: Subsections (posts) — collapse overflow behind "+N more" while section reader is closed
    const posts = st.posts || [];
    const maxIdlePosts = 2;
    const isPostsCollapsed = !expandedSection && !showAllPosts && posts.length > maxIdlePosts;
    const visiblePosts = isPostsCollapsed ? posts.slice(0, maxIdlePosts) : posts;
    const postsMoreChipHtml = isPostsCollapsed
      ? `<button type="button" class="road-post-chip road-post-more-chip" id="btn-road-more-posts">${escapeHtml(
          t("summary.moreSubsections", { count: posts.length - maxIdlePosts })
        )}</button>`
      : !expandedSection && showAllPosts && posts.length > maxIdlePosts
      ? `<button type="button" class="road-post-chip road-post-more-chip" id="btn-road-less-posts">${escapeHtml(
          t("road.showFewer")
        )}</button>`
      : "";
    const postsHtml =
      posts.length > 0
        ? `
          <div class="road-posts-row" aria-label="Subsections in this section">
            <span class="road-posts-label">${escapeHtml(
              t("road.subsectionsCount", { count: posts.length })
            )}</span>
            <div class="road-posts-chips">
              ${visiblePosts
                .map(
                  (p, pIdx) => `
                  <button
                    type="button"
                    class="road-post-chip ${activePostHeading === p.heading ? "is-active" : ""}"
                    data-post-idx="${pIdx}"
                  >
                    <span class="post-chip-heading">${escapeHtml(p.heading)}</span>
                    <span class="post-chip-words">· ${escapeHtml(
                      t("road.shortWords", { count: fmtNumber(p.words) })
                    )}</span>
                  </button>
                `
                )
                .join("")}
              ${postsMoreChipHtml}
            </div>
          </div>
        `
        : "";

    // Row 6: Expanded Original Section Markdown (or detailed milestone summary in Topic Road)
    const expandedReaderHtml = expandedSection
      ? `
        <div class="road-section-reader" id="road-section-reader" tabindex="0" aria-label="${
          isTopicRoad ? "Milestone context" : "Original section text"
        }">
          ${renderStationMarkdownHtml(st.text, st.heading, activePostHeading, posts)}
        </div>
      `
      : "";

    // Ghost station indicator when a ghost_station occurs right after this station
    const ghostsAfterCurrent = ghostStations.filter((g) => Number(g.after_no) === Number(st.no));
    const ghostTriggerHtml =
      ghostsAfterCurrent.length > 0
        ? `
          <div class="road-card-ghost-row">
            ${ghostsAfterCurrent
              .map(
                (g, gIdx) => `
                <button type="button" class="road-card-ghost-btn" data-card-ghost-idx="${gIdx}">
                  <span class="ghost-btn-badge">${escapeHtml(t("scene.sectionRemoved", { year: g.removed_year }))}</span>
                  <span class="ghost-btn-heading">${escapeHtml(
                    t("road.removedHeadingExisted", {
                      heading: g.heading,
                      from: g.from_year,
                      removed: g.removed_year,
                    })
                  )}</span>
                </button>
              `
              )
              .join("")}
          </div>
        `
        : "";

    // Row 7: Side branches
    const branches = st.branches || [];
    const branchesHtml =
      branches.length > 0
        ? `
          <div class="road-card-branches" aria-label="Side roads">
            ${branches
              .map(
                (br, bIdx) => `
                <button type="button" class="road-branch-btn" data-branch-idx="${bIdx}">
                  <span class="road-branch-reason">${escapeHtml(br.reason)}</span>
                  <span class="road-branch-title">${escapeHtml(br.title)}</span>
                </button>
              `
              )
              .join("")}
          </div>
        `
        : "";

    const metaLeftText = isTopicRoad
      ? `${escapeHtml(t("road.milestoneCounter", { current: idx + 1, total: stations.length }))}${
          st.event_label ? ` · ${escapeHtml(st.event_label)}` : ""
        }`
      : `${escapeHtml(t("road.sectionCounter", { current: st.no, total: stations.length }))} · ${escapeHtml(
          t("road.wordsAndMins", {
            words: fmtNumber(st.words || 0),
            mins: fmtNumber(st.reading_minutes || 1),
          })
        )}`;

    const canOpenArticle = isTopicRoad ? Boolean(st.page_id) : Boolean(roadData.article?.page_id);

    const nearestCardHtml = `
      <article class="road-card is-nearest" data-road-idx="${idx}">
        <div class="road-card-top-meta">
          <span class="road-card-meta-left">${metaLeftText}</span>
          <div class="road-card-lanes">${renderLaneCoverageHtml(st.lanes)}</div>
        </div>

        <div class="road-card-header-row">
          <h2 class="road-card-title">${escapeHtml(st.heading)}</h2>
          ${memoryBadgeHtml}
        </div>

        <div class="road-card-scroll">
          ${thumbRowHtml}
          <p class="road-card-summary">${escapeHtml(st.summary)}</p>
          ${factsHtml}
          ${postsHtml}
          ${expandedReaderHtml}
          ${ghostTriggerHtml}
          ${branchesHtml}
        </div>

        <div class="road-card-footer">
          <div class="road-step-controls">
            <button
              type="button"
              class="btn-control btn-road-step"
              id="btn-road-prev"
              ${idx === 0 ? "disabled" : ""}
            >
              ${escapeHtml(t("nav.prev"))}
            </button>
            <span class="road-step-counter">${escapeHtml(
              t("road.stepOfTotal", { current: idx + 1, total: stations.length })
            )}</span>
            <button
              type="button"
              class="btn-control btn-road-step"
              id="btn-road-next"
              ${idx >= stations.length - 1 ? "disabled" : ""}
            >
              ${escapeHtml(t("nav.next"))}
            </button>
          </div>
          <div class="road-footer-actions">
            <button
              type="button"
              class="btn-control btn-read-section ${expandedSection ? "is-active" : ""}"
              id="btn-road-toggle-section"
              aria-expanded="${expandedSection ? "true" : "false"}"
            >
              ${escapeHtml(
                expandedSection
                  ? isTopicRoad
                    ? t("road.hideDetails")
                    : t("nav.hideText")
                  : isTopicRoad
                  ? t("road.readMilestone")
                  : t("road.readThisSection")
              )}
            </button>
            ${
              canOpenArticle
                ? `<button type="button" class="btn-control btn-read-full-article" id="btn-road-read-full">${escapeHtml(
                    isTopicRoad ? t("nav.openArticle") : t("nav.openFullArticle")
                  )}</button>`
                : ""
            }
          </div>
        </div>
      </article>
    `;

    roadCardsStage.innerHTML = `<div class="road-perspective-deck ${
      expandedSection ? "is-reading" : ""
    }">${horizonHtml}${nearestCardHtml}</div>`;

    // Wire background horizon cards click to step to that station
    roadCardsStage.querySelectorAll(".road-card.is-next-1, .road-card.is-next-2").forEach((cardEl) => {
      cardEl.addEventListener("click", () => {
        const targetIdx = Number(cardEl.dataset.roadIdx);
        onSelectRoadEventIndex?.(targetIdx);
        updateRoadActiveIndex(targetIdx);
      });
      cardEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          const targetIdx = Number(cardEl.dataset.roadIdx);
          onSelectRoadEventIndex?.(targetIdx);
          updateRoadActiveIndex(targetIdx);
        }
      });
    });

    // Wire subsection chips -> expand "Read this section" & scroll to/highlight that subsection
    roadCardsStage.querySelectorAll(".road-post-chip[data-post-idx]").forEach((chipEl) => {
      chipEl.addEventListener("click", () => {
        const pIdx = Number(chipEl.dataset.postIdx);
        const post = posts[pIdx];
        if (!post) return;
        activeRoadState.expandedSection = true;
        activeRoadState.activePostHeading = post.heading;
        renderRoadCards();
      });
    });

    roadCardsStage.querySelector("#btn-road-more-posts")?.addEventListener("click", () => {
      activeRoadState.showAllPosts = true;
      renderRoadCards();
    });

    roadCardsStage.querySelector("#btn-road-less-posts")?.addEventListener("click", () => {
      activeRoadState.showAllPosts = false;
      renderRoadCards();
    });

    // If a subsection is highlighted inside #road-section-reader, scroll to it
    if (expandedSection && activePostHeading) {
      const highlightedEl = roadCardsStage.querySelector(".is-highlighted-subsection");
      highlightedEl?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    // Wire inline Ghost Station button
    roadCardsStage.querySelectorAll(".road-card-ghost-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const gIdx = Number(btn.dataset.cardGhostIdx);
        const ghost = ghostsAfterCurrent[gIdx];
        if (ghost) openGhostStation(ghost);
      });
    });

    // Wire Previous / Next buttons
    roadCardsStage.querySelector("#btn-road-prev")?.addEventListener("click", () => {
      if (activeIndex > 0) {
        onSelectRoadEventIndex?.(activeIndex - 1);
        updateRoadActiveIndex(activeIndex - 1);
      }
    });
    roadCardsStage.querySelector("#btn-road-next")?.addEventListener("click", () => {
      if (activeIndex < stations.length - 1) {
        onSelectRoadEventIndex?.(activeIndex + 1);
        updateRoadActiveIndex(activeIndex + 1);
      }
    });

    // Wire "Read this section" / "Hide section text"
    roadCardsStage.querySelector("#btn-road-toggle-section")?.addEventListener("click", () => {
      activeRoadState.expandedSection = !activeRoadState.expandedSection;
      if (!activeRoadState.expandedSection) {
        activeRoadState.activePostHeading = null;
      }
      renderRoadCards();
    });

    // Wire "Open full article" / milestone article
    roadCardsStage.querySelector("#btn-road-read-full")?.addEventListener("click", () => {
      if (isTopicRoad) {
        if (st?.page_id) {
          onSelectStarByKey?.(st.lang || "fi", st.page_id, { glide: false, openTab: "today" });
        }
      } else {
        const art = roadData.article;
        if (art) {
          onSelectStarByKey?.(art.lang || "fi", art.page_id, { glide: false, openTab: "today" });
        }
      }
    });

    // Wire side road branches
    roadCardsStage.querySelectorAll(".road-branch-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const bIdx = Number(btn.dataset.branchIdx);
        const br = branches[bIdx];
        if (br) {
          onRoadBranchClick?.(br);
        }
      });
    });
  }

  function renderRoadEraMinimap() {
    if (!roadEraMinimap || !activeRoadState) return;
    const { roadData, activeIndex, visitedIndices } = activeRoadState;
    const stations = roadData.stations || [];
    const currentSt = stations[activeIndex] || stations[0];
    if (!currentSt) return;

    const evYear = Number(currentSt.event_year) || 1900;
    const eras = roadData.eras || [];
    const activeEra =
      eras.find((e) => evYear >= e.from_year && evYear <= e.to_year) || eras[0] || null;
    const eraCaption = activeEra
      ? `${activeEra.from_year}–${activeEra.to_year} · ${activeEra.label}`
      : roadData.topic?.title || t("road.historicalRoadFallback");

    const bandsPieces = stations.map((st, idx) => {
      const isRead = idx < activeIndex || Boolean(visitedIndices?.has(idx));
      const isCurrent = idx === activeIndex;
      const yrText = st.event_year ? String(st.event_year) : String(idx + 1).padStart(2, "0");
      return `
        <button
          type="button"
          class="toc-band ${isRead ? "is-read" : ""} ${isCurrent ? "is-current" : ""}"
          data-toc-idx="${idx}"
          style="flex-grow: 1"
          title="${escapeHtml(`${yrText} — ${st.heading}`)}"
        >
          <span class="toc-band-no">${escapeHtml(yrText)}</span>
          <span class="toc-band-heading">${escapeHtml(st.heading)}</span>
        </button>
      `;
    });

    roadEraMinimap.innerHTML = `
      <div class="era-minimap-header">
        <div class="era-minimap-caption-group">
          <span class="era-minimap-progress">${escapeHtml(eraCaption)}</span>
          <span class="era-minimap-sublabel">${escapeHtml(currentSt.heading)}</span>
        </div>
        <div class="era-minimap-section-fallback" id="era-minimap-year-numeral">${escapeHtml(
          t("road.milestoneCounter", { current: activeIndex + 1, total: stations.length })
        )}</div>
      </div>
      <div class="toc-bands-row" role="navigation" aria-label="Topic road milestones minimap">${bandsPieces.join("")}</div>
    `;

    roadEraMinimap.querySelectorAll(".toc-band").forEach((btn) => {
      btn.addEventListener("click", () => {
        const targetIdx = Number(btn.dataset.tocIdx);
        onSelectRoadEventIndex?.(targetIdx);
        updateRoadActiveIndex(targetIdx);
      });
    });
  }

  // ============================================================================
  // Single-Article 3D Summary Trail Controller
  // ============================================================================
  let activeSummaryState = null; // { summaryData, items, focusIdx, readMoreOpen, cssElements, summaryMinutes }
  let lastSummaryWheelTime = 0;

  function computeSummaryMinutes(summaryData) {
    const tldrWords = String(summaryData.tldr || "").trim().split(/\s+/).filter(Boolean).length;
    const sectionOneLinesWords = (summaryData.sections || []).reduce((acc, s) => {
      return acc + String(s.one_line || s.summary || "").trim().split(/\s+/).filter(Boolean).length;
    }, 0);
    const totalSummaryWords = tldrWords + sectionOneLinesWords;
    return Math.max(1, Math.round(totalSummaryWords / 110));
  }

  function buildSummaryItems(summaryData) {
    const art = summaryData.article || {};
    const sections = summaryData.sections || [];
    const ghosts = summaryData.ghost_sections || [];
    const summaryMinutes = computeSummaryMinutes(summaryData);
    const revId = summaryData.rev_id ?? art.rev_id ?? null;
    const mode = summaryData.mode || "extractive";
    const outLang = summaryData.out_lang ?? null;
    const variant = summaryData.variant ?? null;
    const requested = summaryData.requested ?? null;
    const historyStatus = summaryData.history_status ?? null;
    const fiHistory = summaryData.fi_history ?? null;

    const items = [
      {
        kind: "overview",
        index: 0,
        article: art,
        revId,
        mode,
        outLang,
        variant,
        requested,
        tldr: summaryData.tldr || "",
        facts: (summaryData.facts || []).slice(0, 3),
        summaryMinutes,
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
            revId,
            mode,
            outLang,
            variant,
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
        revId,
        mode,
        outLang,
        variant,
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
          revId,
          mode,
          outLang,
          variant,
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
        requested,
        variant,
        revId,
        mode,
        outLang,
        totalSections: sections.length,
      });
      const fiArt = fiHistory.article || art;
      const fiRevId = fiHistory.rev_id ?? revId;
      for (const g of fiHistory.ghost_sections || []) {
        items.push({
          kind: "ghost",
          index: items.length,
          ghost: g,
          article: fiArt,
          revId: fiRevId,
          mode,
          outLang,
          variant,
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
        requested,
        variant,
        revId,
        mode,
        outLang,
        totalSections: sections.length,
      });
    }

    return { items, summaryMinutes };
  }

  function renderSummaryFactsHtml(facts, { isFocused, isTranslated, artLang, revId, allowChips = false }) {
    const list = Array.isArray(facts) ? facts : [];
    if (list.length === 0) return "";
    if (isFocused && isTranslated) {
      const revUrl = revId ? buildWikiOldidUrl(artLang, revId) : null;
      return `<div class="facts-source-list">${list
        .map((f) =>
          renderFactSourceItemHtml({
            claimHtml: `<strong>${escapeHtml(f.label || "")}:</strong> ${escapeHtml(f.value || "")}`,
            sourceSentence: f.source || "",
            sourceLang: artLang,
            oldidUrl: revUrl,
            oldid: revId,
          })
        )
        .join("")}</div>`;
    }
    if (!allowChips) return "";
    return `<div class="summary-trail-facts">${list
      .map(
        (f) => `
          <span class="summary-trail-fact-chip">
            <strong>${escapeHtml(f.label)}:</strong> ${escapeHtml(f.value)}
          </span>
        `
      )
      .join("")}</div>`;
  }

  function buildCompareState(compareData) {
    if (!compareData || !Array.isArray(compareData.sections)) return null;
    const byNo = new Map();
    for (const sec of compareData.sections) {
      byNo.set(Number(sec.no), sec);
    }
    return {
      articlePageId: compareData.article?.page_id ?? null,
      siblings: compareData.siblings || { sv: null, en: null },
      byNo,
    };
  }

  function resolveSectionCompare(sec, compareState, art) {
    if (!sec || !compareState || art?.lang !== "fi") return null;
    if (
      compareState.articlePageId !== null &&
      art.page_id !== undefined &&
      Number(art.page_id) !== Number(compareState.articlePageId)
    ) {
      return null;
    }
    const cmp = compareState.byNo.get(Number(sec.no));
    if (!cmp || String(cmp.heading || "") !== String(sec.heading || "")) return null;
    return { cmp, siblings: compareState.siblings };
  }

  function renderSectionCompareHtml(resolved, { compact = false } = {}) {
    if (!resolved) return "";
    const { cmp, siblings } = resolved;
    const sibs = siblings || {};
    const matchedLangs = ["sv", "en"].filter((l) => cmp[l] && cmp[l].match === true);
    const hasAnySibling = Boolean(sibs.sv || sibs.en);
    const comparedNonMatch = ["sv", "en"].some((l) => Boolean(sibs[l]) && cmp[l]?.match === false);

    if (matchedLangs.length > 0) {
      if (compact) {
        const itemsHtml = matchedLangs
          .map(
            (l) => `
              <span class="compare-compact-item">
                <span class="dot dot-${l}" aria-hidden="true"></span>
                <span class="compare-compact-label">${escapeHtml(t(`compare.compact.${l}`))}</span>
              </span>
            `
          )
          .join("");
        return `<div class="compare-presence is-compact"><div class="compare-compact-row">${itemsHtml}</div></div>`;
      }
      const blocksHtml = matchedLangs
        .map((l) => {
          const slot = cmp[l];
          const secHtml = slot.section
            ? `<span class="compare-match-section">${escapeHtml(t("compare.sectionPrefix"))} <span lang="${l}">${escapeHtml(slot.section)}</span></span>`
            : `<span class="compare-match-section">${escapeHtml(t("compare.leadLabel"))}</span>`;
          return `
            <div class="compare-match-item">
              <div class="compare-match-head">
                <span class="dot dot-${l}" aria-hidden="true"></span>
                <span class="compare-match-label">${escapeHtml(t(`compare.alsoIn.${l}`))}</span>
              </div>
              <blockquote class="compare-passage-quote">
                <span class="compare-passage-text" lang="${l}">${escapeHtml(slot.passage || "")}</span>
              </blockquote>
              <div class="compare-match-footer">
                ${secHtml}
                <a class="compare-match-link" href="${escapeHtml(slot.url || "#")}" target="_blank" rel="noopener noreferrer">${escapeHtml(t(`compare.readIn.${l}`))}</a>
              </div>
            </div>
          `;
        })
        .join("");
      return `<section class="compare-presence"><div class="compare-match-list">${blocksHtml}</div></section>`;
    }

    if (hasAnySibling && comparedNonMatch) {
      if (compact) {
        return `
          <div class="compare-presence is-compact">
            <div class="compare-compact-row">
              <span class="compare-compact-item">
                <span class="dot dot-fi" aria-hidden="true"></span>
                <span class="compare-compact-label">${escapeHtml(t("compare.compact.onlyFi"))}</span>
              </span>
            </div>
          </div>
        `;
      }
      const hintKey =
        sibs.sv && sibs.en
          ? "compare.onlyFiHintBoth"
          : sibs.sv
            ? "compare.onlyFiHintSv"
            : "compare.onlyFiHintEn";
      return `
        <section class="compare-presence">
          <div class="compare-only-fi">
            <div class="compare-only-fi-row">
              <span class="dot dot-fi" aria-hidden="true"></span>
              <span class="compare-only-fi-label">${escapeHtml(t("compare.onlyFi"))}</span>
            </div>
            <p class="compare-only-fi-hint">${escapeHtml(t(hintKey))}</p>
          </div>
        </section>
      `;
    }

    return "";
  }

  function renderFiHistoryCompareDots(sec, compareState, fiArt) {
    const resolved = resolveSectionCompare(sec, compareState, { ...fiArt, lang: "fi" });
    if (!resolved) return "";
    const { cmp, siblings } = resolved;
    const matchedLangs = ["sv", "en"].filter((l) => cmp[l] && cmp[l].match === true);
    if (matchedLangs.length > 0) {
      const dots = matchedLangs
        .map((l) => `<span class="dot dot-${l}" title="${escapeHtml(t(`compare.alsoIn.${l}`))}"></span>`)
        .join("");
      return `<span class="compare-fi-dots">${dots}</span>`;
    }
    const hasAnySibling = Boolean(siblings?.sv || siblings?.en);
    const comparedNonMatch = ["sv", "en"].some((l) => Boolean(siblings?.[l]) && cmp[l]?.match === false);
    if (hasAnySibling && comparedNonMatch) {
      return `<span class="compare-fi-dots"><span class="dot dot-fi" title="${escapeHtml(t("compare.onlyFi"))}"></span></span>`;
    }
    return "";
  }

  function renderSummaryCardHtml(item, { isFocused = false, diff = 0, readMoreOpen = false } = {}) {
    const art = item.article || {};
    const artLang = art.lang || "fi";
    const langDotClass = artLang === "sv" ? "dot-sv" : artLang === "en" ? "dot-en" : "dot-fi";
    const isFar = !isFocused && diff >= 3;

    if (isFar) {
      const label =
        item.kind === "overview"
          ? art.title || t("panel.overview")
          : item.kind === "fiHistory"
            ? item.fiHistory?.article?.title || t("summary.fiHistoryLabel")
          : item.kind === "ghost"
            ? t("summary.ghostShort", {
                year: item.ghost.removed_year,
                heading: item.ghost.heading,
              })
            : `${item.section.no}. ${item.section.heading}`;
      return `<h3 class="summary-trail-title">${escapeHtml(label)}</h3>`;
    }

    const effectiveOutLang = item.outLang || artLang;
    const isNative = item.variant === "native";
    const isTranslated =
      !isNative &&
      (item.variant === "translated" ||
        (item.mode === "llm" && effectiveOutLang === uiLang && effectiveOutLang !== artLang));
    const isFallback = !isNative && !isTranslated && (item.variant === "fallback" || effectiveOutLang !== uiLang);
    const mtFromWikiKey = `summary.mtFromWiki.${artLang}`;
    const mtWikiLabel =
      artLang === "fi" || artLang === "sv" || artLang === "en" ? t(mtFromWikiKey) : mtFromLabel([artLang]);
    const provenanceHtml =
      isFocused && isFallback
        ? `<p class="i18n-fallback-note">${escapeHtml(fallbackNoteText(effectiveOutLang))}</p>`
        : !isFallback && isNative && item.kind === "overview"
          ? `<div class="mt-label">${escapeHtml(t("summary.nativeLabel"))}</div>`
          : !isFallback && isTranslated
            ? `<div class="mt-label">${escapeHtml(mtWikiLabel)}</div>`
            : "";

    if (item.kind === "overview") {
      const readMins = art.reading_minutes || 1;
      const sumMins = item.summaryMinutes || 1;
      const factsHtml = renderSummaryFactsHtml(item.facts, {
        isFocused,
        isTranslated,
        artLang,
        revId: item.revId,
        allowChips: true,
      });
      return `
        <div class="summary-trail-kicker">
          <span class="summary-trail-kicker-left"><span class="dot ${langDotClass}"></span>${escapeHtml(
            t("panel.overview")
          )}</span>
          <span class="summary-trail-kicker-right">${escapeHtml(
            t("summary.timeCompare", { read: fmtNumber(readMins), summary: fmtNumber(sumMins) })
          )}</span>
        </div>
        <h2 class="summary-trail-title">${escapeHtml(art.title || "")}</h2>
        ${provenanceHtml}
        <p class="summary-trail-tldr">${formatInlineMd(item.tldr || "")}</p>
        ${factsHtml}
      `;
    }

    if (item.kind === "fiHistory") {
      if (item.building) {
        const headingText = item.requested?.title || art.title || t("summary.fiHistoryLabel");
        return `
          <div class="summary-trail-kicker">
            <span class="summary-trail-kicker-left"><span class="dot dot-fi"></span>${escapeHtml(
              t("summary.fiHistoryLabel")
            )}</span>
          </div>
          <h3 class="summary-trail-title">${escapeHtml(headingText)}</h3>
          <div class="mt-label">${escapeHtml(t("summary.fiHistoryLabel"))}</div>
          <p class="i18n-fallback-note summary-history-loading">${escapeHtml(t("summary.historyBuilding"))}</p>
        `;
      }
      const fh = item.fiHistory || {};
      const fiArt = fh.article || {};
      const fiTitle = fiArt.title || t("summary.fiHistoryLabel");
      const fiUrl = fiArt.url || "";
      const fiSections = Array.isArray(fh.sections) ? fh.sections : [];
      const titleHtml = fiUrl
        ? `<a class="summary-fi-history-link" href="${escapeHtml(fiUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(
            fiTitle
          )}</a>`
        : escapeHtml(fiTitle);
      const compareState = buildCompareState(activeSummaryState?.compareData);
      const rowsHtml = fiSections
        .map((s) => {
          const hist = s.history || {};
          const hasWars = Array.isArray(hist.war_years) && hist.war_years.length > 0;
          const badgeHtml = `
            <span class="summary-history-badge">${
              hasWars ? `<span class="dot dot-war" title="${escapeHtml(t("summary.editWarTitle"))}"></span>` : ""
            }${escapeHtml(
              t("summary.rewrittenTimes", {
                count: hist.changes || 0,
                formattedCount: fmtNumber(hist.changes || 0),
              })
            )}</span>
          `;
          const dotsHtml = renderFiHistoryCompareDots(s, compareState, fiArt);
          return `
            <li class="summary-fi-history-row">
              <span class="summary-fi-history-heading" lang="fi">${escapeHtml(s.heading || "")}</span>
              <span class="summary-fi-history-meta">${dotsHtml}${badgeHtml}</span>
            </li>
          `;
        })
        .join("");
      return `
        <div class="summary-trail-kicker">
          <span class="summary-trail-kicker-left"><span class="dot dot-fi"></span>${escapeHtml(
            t("summary.fiHistoryLabel")
          )}</span>
          <span class="summary-trail-kicker-right">${escapeHtml(fmtNumber(fiSections.length))}</span>
        </div>
        <h3 class="summary-trail-title" lang="fi">${titleHtml}</h3>
        <div class="mt-label">${escapeHtml(t("summary.fiHistoryLabel"))}</div>
        ${rowsHtml ? `<ul class="summary-fi-history-list">${rowsHtml}</ul>` : ""}
      `;
    }

    if (item.kind === "ghost") {
      const g = item.ghost;
      const ghostProvenanceHtml =
        uiLang !== "fi" ? `<div class="mt-label">${escapeHtml(t("summary.fiHistoryLabel"))}</div>` : "";
      const bodyHtml =
        isFocused && readMoreOpen
          ? `
            <div class="summary-readmore-body">
              <div class="summary-readmore-removed-note">${escapeHtml(
                t("summary.archivedSectionMeta", {
                  from: g.from_year,
                  to: g.removed_year,
                  removed: g.removed_year,
                })
              )}</div>
              ${renderMarkdownHtml(g.text || "", art.title || "")}
            </div>
          `
          : "";
      return `
        <div class="summary-trail-kicker">
          <span class="summary-trail-kicker-left"><span class="summary-ghost-badge">${escapeHtml(
            t("scene.sectionRemoved", { year: g.removed_year })
          )}</span></span>
          <span class="summary-trail-kicker-right">${escapeHtml(g.from_year)}–${escapeHtml(g.removed_year)}</span>
        </div>
        <h3 class="summary-trail-title">${escapeHtml(g.heading)}</h3>
        ${ghostProvenanceHtml}
        <p class="summary-trail-oneline">${
          isFocused
            ? formatInlineMd(g.text || "")
            : escapeHtml(t("summary.archivedInYear", { year: g.removed_year }))
        }</p>
        ${
          isFocused
            ? `
              <div class="summary-card-actions">
                <button type="button" class="summary-readmore-btn" aria-expanded="${readMoreOpen ? "true" : "false"}">
                  ${escapeHtml(readMoreOpen ? t("summary.hideArchivedText") : t("summary.readMore"))}
                </button>
              </div>
              ${bodyHtml}
            `
            : ""
        }
      `;
    }

    const sec = item.section;
    const hist = sec.history;
    const hasWars = Boolean(hist && Array.isArray(hist.war_years) && hist.war_years.length > 0);
    const historyBadgeHtml = hist
      ? `<span class="summary-history-badge">${
          hasWars ? `<span class="dot dot-war" title="${escapeHtml(t("summary.editWarTitle"))}"></span>` : ""
        }${escapeHtml(
          t("summary.rewrittenTimes", {
            count: hist.changes,
            formattedCount: fmtNumber(hist.changes),
          })
        )}</span>`
      : "";

    const oneLine = String(sec.one_line || "").trim();
    const fullSummary = String(sec.summary || "").trim();
    let extraSummary = "";
    if (isFocused && fullSummary) {
      if (oneLine && fullSummary.startsWith(oneLine)) {
        extraSummary = fullSummary.slice(oneLine.length).trim();
      } else if (fullSummary !== oneLine) {
        extraSummary = fullSummary;
      }
    }

    const secFactsHtml = renderSummaryFactsHtml(sec.facts, {
      isFocused,
      isTranslated,
      artLang,
      revId: item.revId,
      allowChips: false,
    });

    const resolvedCompare =
      isFocused || diff === 1 || diff === 2
        ? resolveSectionCompare(sec, buildCompareState(activeSummaryState?.compareData), art)
        : null;
    const compareHtml = resolvedCompare
      ? renderSectionCompareHtml(resolvedCompare, { compact: !isFocused })
      : "";

    const readMoreHtml =
      isFocused && readMoreOpen
        ? `<div class="summary-readmore-body">${renderMarkdownHtml(sec.text || "", art.title || "")}</div>`
        : "";

    return `
      <div class="summary-trail-kicker">
        <span class="summary-trail-kicker-left">${escapeHtml(t("summary.sectionKicker", { no: sec.no }))}</span>
        <span class="summary-trail-kicker-right">${historyBadgeHtml}<span>${escapeHtml(
          t("summary.minRead", { count: sec.reading_minutes || 1 })
        )}</span></span>
      </div>
      <h3 class="summary-trail-title">${escapeHtml(sec.heading)}</h3>
      ${provenanceHtml}
      <p class="summary-trail-oneline">${formatInlineMd(oneLine)}</p>
      ${extraSummary ? `<p class="summary-trail-summary">${formatInlineMd(extraSummary)}</p>` : ""}
      ${secFactsHtml}
      ${compareHtml}
      ${
        isFocused
          ? `
            <div class="summary-card-actions">
              <button type="button" class="summary-readmore-btn" aria-expanded="${readMoreOpen ? "true" : "false"}">
                ${escapeHtml(readMoreOpen ? t("nav.hideText") : t("summary.readMore"))}
              </button>
            </div>
            ${readMoreHtml}
          `
          : ""
      }
    `;
  }

  function renderSummaryCardsAndHud() {
    if (!activeSummaryState) return;
    const { items, focusIdx, readMoreOpen, cssElements, summaryData } = activeSummaryState;
    const totalSections = (summaryData.sections || []).length;
    const currentItem = items[focusIdx] || items[0];

    if (summaryFocusedOverlay && currentItem) {
      summaryFocusedOverlay.innerHTML = `
        <article class="summary-trail-card is-focused ${currentItem.kind === "ghost" ? "is-ghost-card" : ""}" data-summary-index="${currentItem.index}">
          ${renderSummaryCardHtml(currentItem, { isFocused: true, diff: 0, readMoreOpen })}
        </article>
      `;
      const readMoreBtn = summaryFocusedOverlay.querySelector(".summary-readmore-btn");
      readMoreBtn?.addEventListener("click", () => {
        if (!activeSummaryState) return;
        activeSummaryState.readMoreOpen = !activeSummaryState.readMoreOpen;
        renderSummaryCardsAndHud();
      });
    }

    cssElements.forEach((el, idx) => {
      const diff = idx - focusIdx;
      const item = items[idx];
      el.classList.remove("is-next-1", "is-next-2", "is-far", "is-hidden-card");
      el.style.opacity = "";
      if (diff <= 0) {
        el.classList.add("is-hidden-card");
        return;
      }
      if (diff === 1) {
        el.classList.add("is-next-1");
      } else if (diff === 2) {
        el.classList.add("is-next-2");
      } else {
        el.classList.add("is-far");
        const farOpacity = Math.max(0.14, 0.56 - (diff - 3) * 0.055);
        el.style.opacity = item.kind === "ghost" ? String(Math.min(0.5, farOpacity)) : String(farOpacity);
      }
      el.innerHTML = renderSummaryCardHtml(item, { isFocused: false, diff, readMoreOpen: false });
    });

    if (summaryProgressText && currentItem) {
      if (currentItem.kind === "overview") {
        summaryProgressText.textContent =
          totalSections > 0
            ? t("summary.progressOverview", { count: totalSections })
            : t("summary.progressOverviewSingle");
      } else if (currentItem.kind === "fiHistory") {
        summaryProgressText.textContent = t("summary.fiHistoryLabel");
      } else if (currentItem.kind === "ghost") {
        summaryProgressText.textContent = t("scene.sectionRemoved", {
          year: currentItem.ghost.removed_year,
        });
      } else {
        summaryProgressText.textContent = t("summary.sectionOf", {
          no: currentItem.section.no,
          total: totalSections,
        });
      }
    }
    if (summaryPrevBtn) summaryPrevBtn.disabled = focusIdx <= 0;
    if (summaryNextBtn) summaryNextBtn.disabled = focusIdx >= items.length - 1;
  }

  function goToSummaryIndex(idx) {
    if (!activeSummaryState) return;
    const maxIdx = activeSummaryState.items.length - 1;
    const nextIdx = Math.max(0, Math.min(maxIdx, Number(idx) || 0));
    if (nextIdx === activeSummaryState.focusIdx) return;
    activeSummaryState.focusIdx = nextIdx;
    activeSummaryState.readMoreOpen = false;
    onSelectSummaryIndex?.(nextIdx);
    renderSummaryCardsAndHud();
  }

  function createSummaryCssElements(items) {
    return items.map((item) => {
      const el = document.createElement("article");
      el.className = `summary-trail-card summary-css3d-card ${
        item.kind === "ghost" ? "is-ghost-card" : ""
      }`;
      el.dataset.summaryIndex = String(item.index);
      el.addEventListener("click", (event) => {
        event.stopPropagation();
        goToSummaryIndex(item.index);
      });
      return el;
    });
  }

  function openSummaryTrail(summaryData) {
    if (!summaryData || !summaryData.article) return [];
    if (activeRoadState) closeRoadView();

    const { items, summaryMinutes } = buildSummaryItems(summaryData);
    const art = summaryData.article;
    const totalSections = (summaryData.sections || []).length;
    const cssElements = createSummaryCssElements(items);

    activeSummaryState = {
      summaryData,
      compareData: null,
      items,
      focusIdx: 0,
      readMoreOpen: false,
      cssElements,
      summaryMinutes,
    };

    skyTopBar.hidden = true;
    if (langSwitcher) langSwitcher.hidden = true;
    timesliderRoot.hidden = true;
    hoverLabel.hidden = true;
    if (skyLegend) skyLegend.hidden = true;
    articlePanel.hidden = true;

    if (summaryTrailTitle) summaryTrailTitle.textContent = art.title || "";
    if (summaryTrailMeta) {
      summaryTrailMeta.textContent =
        totalSections > 0
          ? t("summary.metaSections", {
              count: totalSections,
              read: fmtNumber(art.reading_minutes || 1),
              summary: fmtNumber(summaryMinutes),
            })
          : t("summary.metaOverview", { read: fmtNumber(art.reading_minutes || 1) });
    }

    if (summaryTopBar) summaryTopBar.hidden = false;
    if (summaryBottomBar) summaryBottomBar.hidden = false;
    if (summaryFocusedOverlay) {
      summaryFocusedOverlay.hidden = false;
      summaryFocusedOverlay.style.opacity = "0";
    }

    renderSummaryCardsAndHud();
    return items.map((item, idx) => ({ ...item, element: cssElements[idx] }));
  }

  function updateSummaryTrail(summaryData) {
    if (!activeSummaryState || !summaryData || !summaryData.article) return [];
    const prevCompareData = activeSummaryState.compareData || null;
    const { items, summaryMinutes } = buildSummaryItems(summaryData);
    const cssElements = createSummaryCssElements(items);
    const clampedFocus = Math.max(0, Math.min(items.length - 1, activeSummaryState.focusIdx));
    activeSummaryState = {
      summaryData,
      compareData: prevCompareData,
      items,
      focusIdx: clampedFocus,
      readMoreOpen: false,
      cssElements,
      summaryMinutes,
    };
    renderSummaryCardsAndHud();
    return {
      items: items.map((item, idx) => ({ ...item, element: cssElements[idx] })),
      focusIdx: clampedFocus,
    };
  }

  function attachSummaryCompare(compareData) {
    if (!activeSummaryState || !compareData || !Array.isArray(compareData.sections)) return;
    const prevCardScroll =
      summaryFocusedOverlay?.querySelector(".summary-trail-card")?.scrollTop || 0;
    activeSummaryState.compareData = compareData;
    renderSummaryCardsAndHud();
    if (prevCardScroll > 0) {
      const nextCard = summaryFocusedOverlay?.querySelector(".summary-trail-card");
      if (nextCard) nextCard.scrollTop = prevCardScroll;
    }
  }

  function updateSummaryFocusScreen({ visible = false, x = 0, y = 0, opacity = 1, scale = 1 } = {}) {
    if (!summaryFocusedOverlay) return;
    if (!activeSummaryState || !visible) {
      summaryFocusedOverlay.hidden = true;
      return;
    }
    summaryFocusedOverlay.hidden = false;
    summaryFocusedOverlay.style.opacity = String(Math.max(0, Math.min(1, opacity)));

    let targetX = x;
    let targetY = y;
    const panelIsOpen = !articlePanel.hidden && window.innerWidth > 900;
    if (panelIsOpen) {
      targetX = Math.min(targetX, (window.innerWidth - 460) * 0.5);
    }

    const cardRect = summaryFocusedOverlay.getBoundingClientRect();
    if (cardRect.height > 40) {
      const halfH = cardRect.height * 0.5;
      const minCenterY = 70 + halfH;
      const maxCenterY = window.innerHeight - 66 - halfH;
      if (minCenterY <= maxCenterY) {
        targetY = Math.max(minCenterY, Math.min(maxCenterY, targetY));
      } else {
        targetY = window.innerHeight * 0.5;
      }
    }

    const rx = Math.round(targetX);
    const ry = Math.round(targetY);
    const sc = Math.abs(1 - scale) < 0.002 ? "" : ` scale(${scale.toFixed(4)})`;
    summaryFocusedOverlay.style.transform = `translate3d(${rx}px, ${ry}px, 0) translate(-50%, -50%)${sc}`;
  }

  function closeSummaryTrail() {
    activeSummaryState = null;
    if (summaryTopBar) summaryTopBar.hidden = true;
    if (summaryBottomBar) summaryBottomBar.hidden = true;
    if (summaryFocusedOverlay) {
      summaryFocusedOverlay.hidden = true;
      summaryFocusedOverlay.innerHTML = "";
    }
    skyTopBar.hidden = false;
    if (langSwitcher) langSwitcher.hidden = false;
    timesliderRoot.hidden = false;
    if (skyLegend) skyLegend.hidden = false;
  }

  summaryBackBtn?.addEventListener("click", () => {
    onExitSummaryTrail?.();
  });

  summaryOpenArticleBtn?.addEventListener("click", () => {
    if (!activeSummaryState) return;
    const art = activeSummaryState.summaryData?.article;
    if (!art) return;
    onSummaryOpenFullArticle?.({ lang: art.lang || "fi", page_id: art.page_id });
  });

  summaryPrevBtn?.addEventListener("click", () => {
    if (!activeSummaryState) return;
    goToSummaryIndex(activeSummaryState.focusIdx - 1);
  });

  summaryNextBtn?.addEventListener("click", () => {
    if (!activeSummaryState) return;
    goToSummaryIndex(activeSummaryState.focusIdx + 1);
  });

  window.addEventListener(
    "wheel",
    (event) => {
      if (!activeSummaryState) return;
      if (event.target?.closest?.(".summary-readmore-body")) return;
      if (!articlePanel.hidden && event.target?.closest?.("#article-panel")) return;
      event.preventDefault();
      const now = performance.now();
      if (now - lastSummaryWheelTime < 220) return;
      if (Math.abs(event.deltaY) < 8) return;
      lastSummaryWheelTime = now;
      const step = event.deltaY > 0 ? 1 : -1;
      goToSummaryIndex(activeSummaryState.focusIdx + step);
    },
    { passive: false }
  );

  // Keyboard navigation in Talvitie road & Summary Trail modes
  window.addEventListener("keydown", (event) => {
    if (event.target && ["INPUT", "TEXTAREA"].includes(event.target.tagName)) return;

    if (activeSummaryState) {
      if (event.key === "ArrowDown" || event.key === "ArrowRight") {
        event.preventDefault();
        goToSummaryIndex(activeSummaryState.focusIdx + 1);
      } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
        event.preventDefault();
        goToSummaryIndex(activeSummaryState.focusIdx - 1);
      } else if (event.key === "Escape") {
        if (!articlePanel.hidden) {
          closeArticlePanel();
          onClosePanel?.();
        } else if (activeSummaryState.readMoreOpen) {
          activeSummaryState.readMoreOpen = false;
          renderSummaryCardsAndHud();
        } else {
          onExitSummaryTrail?.();
        }
      }
      return;
    }

    if (!activeRoadState) return;
    const total = activeRoadState.roadData?.stations?.length || 0;
    if (total === 0) return;

    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      const next = Math.min(total - 1, activeRoadState.activeIndex + 1);
      onSelectRoadEventIndex?.(next);
      updateRoadActiveIndex(next);
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      const prev = Math.max(0, activeRoadState.activeIndex - 1);
      onSelectRoadEventIndex?.(prev);
      updateRoadActiveIndex(prev);
    } else if (event.key === "Escape" && articlePanel.hidden) {
      if (activeRoadState.activeGhost) {
        activeRoadState.activeGhost = null;
        renderRoadCards();
        renderRoadEraMinimap();
      } else {
        onExitRoad?.();
      }
    }
  });

  // Right Article Panel
  let currentArticleState = null;

  panelCloseBtn.addEventListener("click", () => {
    closeArticlePanel();
    onClosePanel?.();
  });

  window.addEventListener("keydown", (event) => {
    if (activeSummaryState) return;
    if (event.key === "Escape" && !articlePanel.hidden) {
      closeArticlePanel();
      onClosePanel?.();
    }
  });

  panelSummarizeBtn?.addEventListener("click", () => {
    const art = currentArticleState?.article;
    if (!art) return;
    onEnterSummaryTrail?.({
      lang: art.lang || "fi",
      page_id: art.page_id,
    });
  });

  panelRoadBtn?.addEventListener("click", () => {
    const art = currentArticleState?.article;
    if (!art) return;
    onEnterRoad?.({
      lang: art.lang || "fi",
      page_id: art.page_id,
      mode: "topic",
    });
  });

  function switchPanelTab(tabName) {
    const isHistory = tabName === "history";
    tabBtnToday.classList.toggle("is-active", !isHistory);
    tabBtnToday.setAttribute("aria-selected", !isHistory ? "true" : "false");
    tabBtnHistory.classList.toggle("is-active", isHistory);
    tabBtnHistory.setAttribute("aria-selected", isHistory ? "true" : "false");

    tabViewToday.hidden = isHistory;
    tabViewHistory.hidden = !isHistory;
  }

  tabBtnToday.addEventListener("click", () => switchPanelTab("today"));
  tabBtnHistory.addEventListener("click", () => {
    if (currentArticleState?.article?.has_history) {
      switchPanelTab("history");
    }
  });

  function openArticlePanel({
    article,
    timeline = null,
    asof = null,
    diff = null,
    threads = [],
    selectedYear = 2026,
    openTab = "today",
  }) {
    if (!article) return;
    currentArticleState = { article, timeline, asof, diff, threads, selectedYear };

    // Only offer the road for articles with >= 4 stations or >= 1,500 words (article.words >= 1500 or article.length >= 9000)
    if (panelRoadBtn) {
      panelRoadBtn.hidden = !isRoadEligibleArticle(article);
    }

    // Header image when article.image exists; otherwise title only
    if (article.image && article.image.thumb_url) {
      panelThumbImg.src = article.image.thumb_url;
      panelThumbImg.alt = article.title;
      renderImageCreditCaption(panelThumbCaption, article.image);
      panelThumbFigure.hidden = false;
    } else {
      panelThumbFigure.hidden = true;
      panelThumbImg.src = "";
      if (panelThumbCaption) panelThumbCaption.textContent = "";
    }

    panelTitle.textContent = article.title;
    panelWikiLink.href = article.url;

    // Language versions (current + other_languages: [[lang, title, url]])
    panelLanguages.innerHTML = "";
    const allLangs = [
      [article.lang, article.title, article.url],
      ...(article.other_languages || []),
    ];
    const order = ["fi", "sv", "en"];
    for (const code of order) {
      const match = allLangs.find((entry) => entry[0] === code);
      if (!match) continue;
      const [lCode, lTitle] = match;
      const isCurrent = lCode === article.lang;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = isCurrent ? "lang-version-btn is-active" : "lang-version-btn";
      btn.setAttribute("aria-pressed", isCurrent ? "true" : "false");
      btn.innerHTML = `<span class="dot dot-${escapeHtml(lCode)}"></span><span>${escapeHtml(
        langName(lCode)
      )}</span>`;
      btn.title = lTitle;
      btn.addEventListener("click", () => {
        if (!isCurrent) {
          onSearchSubmit?.(lTitle, lCode, { openDirectly: true });
        }
      });
      panelLanguages.appendChild(btn);
    }

    // Sibling-article offer when opening an article in another language and ui-language sibling exists
    if (panelSiblingOffer) {
      const sibling =
        article.lang !== uiLang
          ? (article.other_languages || []).find((entry) => entry[0] === uiLang)
          : null;
      if (sibling) {
        const [sLang, sTitle] = sibling;
        panelSiblingOffer.innerHTML = `<span class="dot dot-${escapeHtml(
          sLang
        )}"></span><span class="sibling-offer-prefix">${escapeHtml(
          t(`panel.siblingRead.${sLang}`)
        )}</span><span class="sibling-offer-title">${escapeHtml(sTitle)}</span>`;
        panelSiblingOffer.dataset.lang = sLang;
        panelSiblingOffer.dataset.title = sTitle;
        panelSiblingOffer.hidden = false;
      } else {
        panelSiblingOffer.hidden = true;
        panelSiblingOffer.innerHTML = "";
        delete panelSiblingOffer.dataset.lang;
        delete panelSiblingOffer.dataset.title;
      }
    }

    // Tabs visibility based on has_history
    if (article.has_history) {
      panelTabs.hidden = false;
      tabBtnHistory.hidden = false;
      panelNoHistory.hidden = true;
    } else {
      panelTabs.hidden = false;
      tabBtnHistory.hidden = true;
      panelNoHistory.hidden = false;
      openTab = "today";
    }

    // Populate "Today" tab
    panelMarkdown.innerHTML = renderMarkdownHtml(article.text, article.title);
    panelCategories.innerHTML = (article.categories || [])
      .map((cat) => `<span class="category-tag">${escapeHtml(cat)}</span>`)
      .join("");
    panelThreadsSection.innerHTML = renderThreadsTreeHtml(
      article.title,
      { lang: article.lang, page_id: article.page_id },
      threads
    );
    wireThreadButtons(panelThreadsSection);

    // Populate "Through time" tab if has_history
    if (article.has_history && timeline) {
      renderThroughTimeTab({ article, timeline, asof, diff, selectedYear });
    }

    switchPanelTab(openTab === "history" && article.has_history ? "history" : "today");
    articlePanel.hidden = false;
  }

  function renderThroughTimeTab({ article, timeline, asof, diff, selectedYear }) {
    const s = timeline.summary;
    const artLang = article.lang || "fi";
    panelSvtSummary.innerHTML = `
      <div class="svt-stat"><strong>${escapeHtml(fmtNumber(s.versions))}</strong> ${escapeHtml(
        t("panel.versionsWord", { count: s.versions })
      )}</div>
      <div class="svt-stat"><strong>${escapeHtml(fmtNumber(s.reverts))}</strong> ${escapeHtml(
        t("panel.revertsWord", { count: s.reverts })
      )}</div>
      <div class="svt-stat"><strong>${escapeHtml(fmtNumber(s.disputes))}</strong> ${escapeHtml(
        t("panel.disputesWord", { count: s.disputes })
      )}</div>
      <div class="svt-stat"><span class="dot dot-war"></span><strong>${escapeHtml(
        fmtNumber(s.war_months)
      )}</strong> ${escapeHtml(t("timeslider.warMonthsWord", { count: s.war_months }))}</div>
    `;

    // Monthly bar strip
    panelSvtMonths.innerHTML = "";
    const months = timeline.months || [];
    const maxEdits = Math.max(5, ...months.map((m) => m.edits));
    const barsFrag = document.createDocumentFragment();
    for (const m of months) {
      const mYear = Number(m.month.slice(0, 4));
      const bar = document.createElement("button");
      bar.type = "button";
      bar.className = "panel-rev-bar";
      if (m.disputes >= 3) bar.classList.add("is-war");
      if (mYear <= selectedYear) bar.classList.add("is-past");
      bar.style.height = `${Math.max(14, Math.round((m.edits / maxEdits) * 100))}%`;
      bar.title = t("panel.monthBarTitle", {
        month: m.month,
        edits: fmtNumber(m.edits),
        disputes: fmtNumber(m.disputes),
      });
      bar.addEventListener("click", () => {
        onSelectAsOfYear?.(article.page_id, mYear);
      });
      barsFrag.appendChild(bar);
    }
    panelSvtMonths.appendChild(barsFrag);

    // Quick year buttons for rehearsable demo (2006 / 2012 / Today)
    const presetYears = [
      { year: 2006, label: t("panel.asOfYear", { year: 2006 }) },
      { year: 2012, label: t("panel.asOfYear", { year: 2012 }) },
      { year: 2026, label: t("panel.asOfToday") },
    ];
    panelSvtPresets.innerHTML = presetYears
      .map(
        (p) => `
        <button
          type="button"
          class="svt-preset-btn ${
            (p.year === 2006 && selectedYear <= 2008) ||
            (p.year === 2012 && selectedYear >= 2009 && selectedYear <= 2016) ||
            (p.year === 2026 && selectedYear >= 2017)
              ? "is-active"
              : ""
          }"
          data-year="${p.year}"
        >
          ${escapeHtml(p.label)}
        </button>
      `
      )
      .join("");

    panelSvtPresets.querySelectorAll(".svt-preset-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        onSelectAsOfYear?.(article.page_id, Number(btn.dataset.year));
      });
    });

    if (!asof) {
      panelAsofMeta.innerHTML = `<p class="asof-not-born">${escapeHtml(
        t("panel.noArticleThen", { year: selectedYear })
      )} (${escapeHtml(t("panel.firstEdit", { date: fmtDate(s.first_edit) }))})</p>`;
      panelAsofBlocks.innerHTML = "";
      panelDiffSection.innerHTML = "";
      return;
    }

    const oldidUrl = buildWikiOldidUrl(artLang, asof.rev_id);
    panelAsofMeta.innerHTML = `
      <div class="asof-meta-top">
        <span class="asof-year-badge">${selectedYear}</span>
        <span class="asof-editor">${t("panel.editedByOn", {
          user: `<strong>${escapeHtml(asof.user)}</strong>`,
          date: escapeHtml(fmtDate(asof.row_start)),
        })}</span>
        <a href="${escapeHtml(oldidUrl)}" target="_blank" rel="noopener noreferrer" class="oldid-anchor">oldid=${asof.rev_id}</a>
      </div>
      ${asof.comment ? `<p class="asof-comment">"${escapeHtml(asof.comment)}"</p>` : ""}
    `;

    panelAsofBlocks.innerHTML = (asof.blocks || [])
      .map(([tag, txt]) => {
        if (tag === "h") return `<h3>${escapeHtml(txt)}</h3>`;
        if (tag === "li") return `<ul class="asof-list"><li>${escapeHtml(txt)}</li></ul>`;
        return `<p>${escapeHtml(txt)}</p>`;
      })
      .join("");

    if (diff && diff.parts) {
      const todayOldidUrl = buildWikiOldidUrl(artLang, article.rev_id);
      panelDiffSection.innerHTML = `
        <div class="diff-header">
          <span>${escapeHtml(t("panel.diffToday"))}</span>
          <a href="${escapeHtml(todayOldidUrl)}" target="_blank" rel="noopener noreferrer" class="oldid-anchor">${escapeHtml(
        t("panel.todayOldid", { id: article.rev_id })
      )}</a>
        </div>
        <div class="diff-body">${renderDiffPartsHtml(diff.parts)}</div>
      `;
    } else {
      panelDiffSection.innerHTML = "";
    }
  }

  function closeArticlePanel() {
    articlePanel.hidden = true;
    currentArticleState = null;
  }

  return {
    setLoading,
    showError,
    clearLeftOverlays,
    setActiveLensButton,
    renderSearchResults,
    renderAskResult,
    renderConstellationBar,
    updateHoverLabel,
    updateProjectedLabels,
    openArticlePanel,
    closeArticlePanel,
    switchPanelTab,
    openRoadView,
    updateRoadActiveIndex,
    openGhostStation,
    closeRoadView,
    openSummaryTrail,
    updateSummaryTrail,
    attachSummaryCompare,
    updateSummaryFocusScreen,
    closeSummaryTrail,
    isSummaryTrailOpen() {
      return Boolean(activeSummaryState);
    },
    isRoadOpen() {
      return Boolean(activeRoadState);
    },
    hasDedicatedRoad(pageId) {
      return KNOWN_ROAD_PAGE_IDS.has(Number(pageId));
    },
    isPanelOpen() {
      return !articlePanel.hidden;
    },
    getCurrentArticle() {
      return currentArticleState?.article || null;
    },
  };
}

function renderStationMarkdownHtml(markdown, stationHeading, activePostHeading = null, posts = []) {
  const lines = String(markdown || "").split("\n");
  const out = [];
  let inList = false;
  let foundHighlightedHeading = false;

  function closeList() {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      closeList();
      continue;
    }
    if (line.startsWith("# ") || line.startsWith("## ")) {
      const prefixLen = line.startsWith("## ") ? 3 : 2;
      const hText = line.slice(prefixLen).trim();
      if (hText.toLowerCase() === String(stationHeading || "").toLowerCase()) continue;
      closeList();
      out.push(`<h3 class="reader-sec-heading">${formatInlineMd(hText)}</h3>`);
    } else if (line.startsWith("### ") || line.startsWith("#### ")) {
      const prefixLen = line.startsWith("#### ") ? 5 : 4;
      const subText = line.slice(prefixLen).trim();
      const isMatch =
        activePostHeading &&
        subText.toLowerCase() === String(activePostHeading).toLowerCase();
      if (isMatch) foundHighlightedHeading = true;
      closeList();
      out.push(
        `<h4 class="reader-sub-heading ${
          isMatch ? "is-highlighted-subsection" : ""
        }" data-sub-heading="${escapeHtml(subText)}">${formatInlineMd(subText)}</h4>`
      );
    } else if (line.startsWith("- ")) {
      if (!inList) {
        out.push("<ul class='md-list'>");
        inList = true;
      }
      out.push(`<li>${formatInlineMd(line.slice(2).trim())}</li>`);
    } else {
      closeList();
      out.push(`<p>${formatInlineMd(line)}</p>`);
    }
  }
  closeList();

  if (activePostHeading && !foundHighlightedHeading) {
    const matchedPost = (posts || []).find((p) => p.heading === activePostHeading);
    const wordsNote = matchedPost?.words
      ? ` · ${t("summary.words", { count: fmtNumber(matchedPost.words) })}`
      : "";
    out.unshift(
      `<h4 class="reader-sub-heading is-highlighted-subsection" data-sub-heading="${escapeHtml(
        activePostHeading
      )}">${escapeHtml(activePostHeading)}${escapeHtml(wordsNote)}</h4>`
    );
  }

  return out.join("");
}

function renderDiffPartsHtml(parts = []) {
  return parts
    .map((part) => {
      if (part.op === "same") {
        return `<div class="diff-same">${escapeHtml(
          t("panel.unchangedBlocks", { count: part.count })
        )}</div>`;
      }
      if (part.op === "del") {
        return `<div class="diff-block diff-del"><del>${escapeHtml(part.block[1])}</del></div>`;
      }
      if (part.op === "ins") {
        return `<div class="diff-block diff-ins"><ins>${escapeHtml(part.block[1])}</ins></div>`;
      }
      if (part.op === "edit" && Array.isArray(part.words)) {
        const wordsHtml = part.words
          .map((w) => {
            if (w.t === "del") return `<del class="diff-word-del">${escapeHtml(w.text)}</del>`;
            if (w.t === "ins") return `<ins class="diff-word-ins">${escapeHtml(w.text)}</ins>`;
            return `<span>${escapeHtml(w.text)}</span>`;
          })
          .join("");
        return `<p class="diff-block diff-edit">${wordsHtml}</p>`;
      }
      return "";
    })
    .join("");
}

function renderMarkdownHtml(markdown, articleTitle) {
  const lines = String(markdown || "").split("\n");
  const out = [];
  let inList = false;

  function closeList() {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      closeList();
      continue;
    }
    if (line.startsWith("# ")) {
      const h1Text = line.slice(2).trim();
      if (h1Text.toLowerCase() === String(articleTitle || "").toLowerCase()) continue;
      closeList();
      out.push(`<h3>${formatInlineMd(h1Text)}</h3>`);
    } else if (line.startsWith("## ")) {
      closeList();
      out.push(`<h3>${formatInlineMd(line.slice(3).trim())}</h3>`);
    } else if (line.startsWith("### ") || line.startsWith("#### ")) {
      closeList();
      const text = line.replace(/^#{3,4}\s+/, "").trim();
      out.push(`<h4>${formatInlineMd(text)}</h4>`);
    } else if (line.startsWith("- ")) {
      if (!inList) {
        out.push("<ul class='md-list'>");
        inList = true;
      }
      out.push(`<li>${formatInlineMd(line.slice(2).trim())}</li>`);
    } else {
      closeList();
      out.push(`<p>${formatInlineMd(line)}</p>`);
    }
  }
  closeList();
  return out.join("");
}

function formatInlineMd(str) {
  return escapeHtml(str)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>");
}

function formatAnswerText(text) {
  return formatInlineMd(text).replace(
    /\[(\d+)\]/g,
    '<span class="cite-badge">[$1]</span>'
  );
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safeHttpUrl(url) {
  if (typeof url !== "string") return null;
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : null;
}

function renderImageCreditCaption(captionEl, image) {
  if (!captionEl || !image) return;
  captionEl.textContent = "";

  const filePageUrl = safeHttpUrl(image.file_page_url) || "https://commons.wikimedia.org";
  const makeLink = (text, href, title = "") => {
    const a = document.createElement("a");
    a.className = "panel-thumb-credit";
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = text;
    if (title) a.title = title;
    return a;
  };

  const licenseText = typeof image.license === "string" ? image.license.trim() : "";
  if (!licenseText) {
    captionEl.appendChild(makeLink(t("panel.commonsCredit"), filePageUrl));
    return;
  }

  const rawAttr = (
    (typeof image.artist === "string" && image.artist.trim()) ||
    (typeof image.credit === "string" && image.credit.trim()) ||
    ""
  ).trim();
  const attrText = rawAttr
    ? rawAttr.length > 80
      ? `${rawAttr.slice(0, 79)}…`
      : rawAttr
    : t("panel.commonsCredit");
  const attrTitle = rawAttr.length > 80 ? rawAttr : "";
  const licenseUrl = safeHttpUrl(image.license_url);

  const parts = t("panel.imageCredit").split(/(\{artist\}|\{license\})/g);
  for (const part of parts) {
    if (!part) continue;
    if (part === "{artist}") {
      captionEl.appendChild(makeLink(attrText, filePageUrl, attrTitle));
    } else if (part === "{license}") {
      if (licenseUrl) {
        captionEl.appendChild(makeLink(licenseText, licenseUrl));
      } else {
        captionEl.appendChild(document.createTextNode(licenseText));
      }
    } else {
      captionEl.appendChild(document.createTextNode(part));
    }
  }
}

function buildWikiOldidUrl(langCode, revId) {
  const safeLang = ["fi", "sv", "en"].includes(langCode) ? langCode : "fi";
  return `https://${safeLang}.wikipedia.org/w/index.php?oldid=${encodeURIComponent(revId)}`;
}

function extractOldid(url, fallbackRevId = null) {
  const m = String(url || "").match(/[?&]oldid=(\d+)/);
  return m ? m[1] : fallbackRevId;
}

function renderFactSourceItemHtml({ claimHtml, sourceSentence, sourceLang, oldidUrl, oldid }) {
  const anchorHtml =
    oldidUrl && oldid != null
      ? ` <a href="${escapeHtml(oldidUrl)}" target="_blank" rel="noopener noreferrer" class="oldid-anchor">oldid=${escapeHtml(
          oldid
        )}</a>`
      : "";
  const quoteHtml = sourceSentence
    ? `<blockquote class="fact-source-quote"><span class="fact-source-text" lang="${escapeHtml(
        sourceLang
      )}">${escapeHtml(sourceSentence)}</span>${anchorHtml}</blockquote>`
    : anchorHtml
    ? `<div class="fact-source-quote">${anchorHtml}</div>`
    : "";
  return `
    <div class="fact-source-item">
      <div class="fact-claim">${claimHtml}</div>
      ${quoteHtml}
    </div>
  `;
}
