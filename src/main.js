import "./styles.css";
import {
  getStars,
  getGlobalTimeline,
  search,
  getArticle,
  getArticleTimeline,
  getAsOf,
  getDiff,
  ask,
  getThreads,
  getTopicRoad,
  getSummary,
  getCompare,
} from "./api.js";
import { createGalaxyScene } from "./scene.js";
import { createTimeSlider } from "./timeslider.js";
import { createUI } from "./ui.js";
import { lang as uiLang, applyStatic, t, saveViewState, consumeViewState } from "./i18n.js";
import { buildSummaryCardList, mapSummaryCard } from "./summaryMap.js";

const EDIT_WAR_DISPUTE_YEARS = {
  1256: [2007, 2008, 2013, 2014, 2017, 2022],
  1150: [2006, 2007, 2008, 2011, 2014, 2018, 2022],
  1152: [2007, 2009, 2014, 2022],
  679: [2007, 2008, 2015, 2020],
  3422: [2008, 2014, 2022],
  52097: [2008, 2014, 2022],
};

function isStarEditWar(star, yearInt) {
  if (!star || star.lang !== "fi" || !star.has_history) return false;
  const years = EDIT_WAR_DISPUTE_YEARS[star.page_id];
  if (years) return years.includes(Math.round(yearInt));
  return false;
}

async function init() {
  applyStatic(document);
  const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reducedMotion = reducedMotionQuery.matches;

  let currentYear = reducedMotion ? 2026 : 2001;
  let activeStar = null;
  let activeArticleTab = "today";
  let activeAskState = null;
  let constellationPath = [];
  let savedConstellationHash = "";
  let currentRoadMode = "topic";
  let articleLoadSeq = 0;
  let roadLoadSeq = 0;
  let summaryLoadSeq = 0;

  let stars = [];
  let globalTimeline = { months: [] };
  const starByKey = new Map();

  let sceneCtrl = null;
  let sliderCtrl = null;
  let activeLoadCount = 0;
  let detachIntroStopListeners = null;

  function stopIntroSweep(options = { jumpToEnd: true }) {
    if (detachIntroStopListeners) {
      detachIntroStopListeners();
      detachIntroStopListeners = null;
    }
    sliderCtrl?.stopIntro(options);
  }

  const ui = createUI({
    async onSearchSubmit(query, langFilter = null, options = {}) {
      stopIntroSweep({ jumpToEnd: true });
      const endLoading = beginLoading();
      try {
        const res = await search(query, { lang: langFilter, limit: 20 });
        endLoading();

        if (options.openDirectly && res.rows.length > 0) {
          const exact =
            res.rows.find((r) => r.title.toLowerCase() === query.toLowerCase()) || res.rows[0];
          await openStarArticle(exact.lang, exact.page_id, { glide: true, openTab: "today" });
          return;
        }

        ui.renderSearchResults(res);
        sceneCtrl?.setThreads(null, [], currentYear);
        const matchedStars = res.rows
          .map((r) => starByKey.get(`${r.lang}:${r.page_id}`))
          .filter(Boolean);
        sceneCtrl?.setSearchResults(matchedStars, { glide: true });
      } catch (err) {
        ui.showError(t("error.network"));
      } finally {
        endLoading();
      }
    },

    async onAskSubmit(query) {
      await runAskQuery(query);
    },

    onClearSearch() {
      activeAskState = null;
      sceneCtrl?.setSearchResults([], { glide: false });
      if (!activeStar) {
        sceneCtrl?.setThreads(null, [], currentYear);
      }
    },

    async onSelectStarByKey(lang, pageId, options = {}) {
      await openStarArticle(lang, Number(pageId), options);
    },

    async onFollowThread({ sourceLang, sourcePageId, targetLang, targetPageId }) {
      stopIntroSweep({ jumpToEnd: true });
      const fromStar = starByKey.get(`${sourceLang}:${sourcePageId}`);
      const toStar = starByKey.get(`${targetLang}:${targetPageId}`);
      if (!toStar) return;

      if (fromStar && constellationPath.length === 0) {
        constellationPath.push(fromStar);
      } else if (
        fromStar &&
        constellationPath[constellationPath.length - 1]?.page_id !== fromStar.page_id
      ) {
        const existingIdx = constellationPath.findIndex(
          (s) => s.lang === fromStar.lang && s.page_id === fromStar.page_id
        );
        if (existingIdx === -1) {
          constellationPath.push(fromStar);
        }
      }

      const alreadyInPath = constellationPath.some(
        (s) => s.lang === toStar.lang && s.page_id === toStar.page_id
      );
      if (!alreadyInPath) {
        constellationPath.push(toStar);
      }

      savedConstellationHash = "";
      sceneCtrl?.setConstellationPath(constellationPath);
      ui.renderConstellationBar(constellationPath, savedConstellationHash);

      if (fromStar) {
        sceneCtrl?.glideAlongThread(fromStar, toStar);
      }

      await openStarArticle(targetLang, targetPageId, {
        glide: !fromStar,
        openTab: "today",
        keepConstellation: true,
      });
    },

    async onSelectMilestone(askRes, ms, idx) {
      await selectMilestone(askRes, ms, idx);
    },

    async onSelectAsOfYear(pageId, yearInt) {
      stopIntroSweep({ jumpToEnd: false });
      sliderCtrl?.setYear(yearInt);
      await openStarArticle("fi", Number(pageId), {
        glide: false,
        openTab: "history",
        asofYear: yearInt,
        keepConstellation: true,
      });
    },

    onSaveConstellation() {
      if (constellationPath.length < 2) return;
      const hash = `#path-${constellationPath.map((s) => `${s.lang}:${s.page_id}`).join("-")}`;
      savedConstellationHash = hash;
      window.history.replaceState(null, "", hash);
      ui.renderConstellationBar(constellationPath, savedConstellationHash);
    },

    onClearConstellation() {
      constellationPath = [];
      savedConstellationHash = "";
      if (window.location.hash.startsWith("#path-")) {
        window.history.replaceState(
          null,
          "",
          window.location.pathname + window.location.search
        );
      }
      sceneCtrl?.setConstellationPath([]);
      ui.renderConstellationBar([], "");
    },

    onClosePanel() {
      activeStar = null;
      if (!sceneCtrl?.isRoadMode()) {
        sceneCtrl?.selectStar(null, { glide: false });
        sceneCtrl?.setThreads(null, [], currentYear);
      }
    },

    onSelectLens(lensName) {
      stopIntroSweep({ jumpToEnd: true });
      sceneCtrl?.setLens(lensName);
    },

    async onEnterRoad(arg1 = {}, arg2 = null) {
      await enterTalvitieRoad(arg1, arg2);
    },

    onExitRoad() {
      roadLoadSeq++;
      articleLoadSeq++;
      clearLoading();
      sceneCtrl?.exitRoadMode();
      ui.closeRoadView();
    },

    onSelectRoadEventIndex(idx) {
      sceneCtrl?.setRoadEventIndex(idx);
    },

    async onEnterSummaryTrail(opts = {}) {
      await enterSummaryTrail(opts);
    },

    onExitSummaryTrail() {
      exitSummaryTrail();
    },

    onSelectSummaryIndex(idx) {
      sceneCtrl?.setSummaryFocusIndex(idx);
    },

    async onSummaryOpenFullArticle({ lang = "fi", page_id = 1256 } = {}) {
      await openStarArticle(lang, page_id, {
        glide: false,
        openTab: "today",
        keepSummaryTrail: true,
      });
    },

    onBeforeLangSwitch() {
      saveViewState(captureViewState());
    },

    async onRoadBranchClick(branch) {
      if (!branch) return;
      const bLang = branch.lang || "fi";
      const bPageId = Number(branch.page_id);
      const isRoadBranch =
        ui.hasDedicatedRoad(bPageId) ||
        String(branch.reason || "")
          .toLowerCase()
          .startsWith("road:");
      if (isRoadBranch) {
        await enterTalvitieRoad({
          lang: bLang,
          page_id: bPageId,
          mode: currentRoadMode,
        });
        return;
      }

      const key = `${bLang}:${bPageId}`;
      if (starByKey.has(key)) {
        await openStarArticle(bLang, bPageId, {
          glide: false,
          openTab: "today",
        });
      } else if (branch.title) {
        const endLoading = beginLoading();
        try {
          const res = await search(branch.title, { lang: bLang, limit: 5 });
          endLoading();
          if (res?.rows?.length > 0) {
            const match =
              res.rows.find((r) => r.title.toLowerCase() === branch.title.toLowerCase()) ||
              res.rows[0];
            await openStarArticle(match.lang, match.page_id, {
              glide: false,
              openTab: "today",
            });
          }
        } catch (err) {
          // best-effort branch lookup
        } finally {
          endLoading();
        }
      }
    },
  });

  function beginLoading() {
    activeLoadCount += 1;
    ui.setLoading(true);
    let done = false;
    return () => {
      if (done) return;
      done = true;
      activeLoadCount = Math.max(0, activeLoadCount - 1);
      if (activeLoadCount === 0) ui.setLoading(false);
    };
  }

  function clearLoading() {
    activeLoadCount = 0;
    ui.setLoading(false);
  }

  async function runAskQuery(query) {
    stopIntroSweep({ jumpToEnd: true });
    const endLoading = beginLoading();
    try {
      const askRes = await ask(query, uiLang);
      const topKey = `${askRes.top.lang}:${askRes.top.page_id}`;
      const topStar = starByKey.get(topKey) || null;
      const threadsRes = await getThreads(askRes.top.lang, askRes.top.page_id);
      const threads = threadsRes?.threads || [];

      endLoading();

      activeAskState = {
        query,
        askRes,
        threads,
        activeMilestoneIdx: -1,
        milestoneDiff: null,
        todayRevId: null,
      };

      if (topStar) {
        activeStar = topStar;
        if (constellationPath.length < 2) {
          constellationPath = [topStar];
          savedConstellationHash = "";
          ui.renderConstellationBar(constellationPath, savedConstellationHash);
        }
      }

      const sourceStars = (askRes.sources || [])
        .map((s) => starByKey.get(`${s.lang}:${s.page_id}`))
        .filter(Boolean);
      sceneCtrl?.setSearchResults(sourceStars, { glide: false });
      if (topStar) {
        // 023: a not-yet-born top article moves the slider to its creation year.
        const bornYear = topStar.created_year ?? topStar.first_edit_year;
        if (bornYear && bornYear > Math.round(currentYear)) sliderCtrl?.setYear(bornYear);
        sceneCtrl?.selectStar(topStar, { glide: true });
        sceneCtrl?.setThreads(topStar, threads, currentYear);
      }

      ui.renderAskResult(activeAskState);
      return activeAskState;
    } catch (err) {
      ui.showError(t("error.network"));
      return null;
    } finally {
      endLoading();
    }
  }

  async function selectMilestone(askRes, ms, idx) {
    stopIntroSweep({ jumpToEnd: false });
    const endLoading = beginLoading();
    try {
      sliderCtrl?.setYear(ms.to_year);
      const topArticle = await getArticle(askRes.top.lang, askRes.top.page_id);
      const milestoneDiff = await getDiff(askRes.top.page_id, ms.rev_id, topArticle.rev_id);
      endLoading();

      if (activeAskState) {
        activeAskState = {
          ...activeAskState,
          activeMilestoneIdx: idx,
          milestoneDiff,
          todayRevId: topArticle.rev_id,
        };
        ui.renderAskResult(activeAskState);
      }

      await openStarArticle(askRes.top.lang, askRes.top.page_id, {
        glide: false,
        openTab: "history",
        asofYear: ms.to_year,
        keepConstellation: true,
      });
    } catch (err) {
      ui.showError(t("error.network"));
    } finally {
      endLoading();
    }
  }

  function captureViewState() {
    const lens = sceneCtrl?.getCurrentLens?.() || "meaning";
    const year = Math.round(sliderCtrl?.getCurrentYear?.() ?? currentYear ?? 2026);
    const currentPanelArt = ui.getCurrentArticle();
    const panelOpen = Boolean(ui.isPanelOpen() && currentPanelArt);
    const panelArticle = panelOpen
      ? { lang: currentPanelArt.lang || "fi", page_id: currentPanelArt.page_id }
      : null;
    const panelTab = ui.getActivePanelTab?.() || "today";

    if (ui.isSummaryTrailOpen()) {
      const sumState = ui.getSummaryViewState();
      return {
        view: "summary",
        lens,
        year,
        article: sumState ? { lang: sumState.lang, page_id: sumState.page_id } : null,
        cardIndex: sumState?.focusIdx ?? 0,
        cardRef: sumState?.cardRef ?? null,
        readMoreOpen: Boolean(sumState?.readMoreOpen),
        panelOpen,
        panelArticle,
        panelTab,
      };
    }

    if (ui.isRoadOpen()) {
      const roadState = ui.getRoadViewState();
      return {
        view: "road",
        lens,
        year,
        article:
          roadState?.page_id != null
            ? { lang: roadState.lang || "fi", page_id: roadState.page_id }
            : null,
        category: roadState?.category || null,
        stationIndex: roadState?.stationIndex ?? 0,
        panelOpen,
        panelArticle,
        panelTab,
      };
    }

    if (ui.isAskOpen() && activeAskState?.query) {
      return {
        view: "ask",
        lens,
        year,
        askQuery: activeAskState.query,
        askMilestoneIdx: activeAskState.activeMilestoneIdx ?? -1,
        panelOpen,
        panelArticle,
        panelTab,
      };
    }

    if (panelOpen && panelArticle) {
      return {
        view: "panel",
        lens,
        year,
        article: panelArticle,
        panelTab,
      };
    }

    return { view: "sky", lens, year };
  }

  async function enterTalvitieRoad(arg1 = {}, arg2 = null) {
    let lang = "fi";
    let page_id = null;
    let category = null;
    let mode = null;
    let stationIndex = 0;

    if (typeof arg1 === "string") {
      lang = arg1 || "fi";
      page_id = arg2 !== null && arg2 !== undefined ? Number(arg2) : 1256;
    } else if (typeof arg1 === "number") {
      page_id = arg1;
    } else if (arg1 && typeof arg1 === "object") {
      lang = arg1.lang || "fi";
      category = arg1.category || null;
      mode = arg1.mode || null;
      if (Number.isFinite(Number(arg1.stationIndex))) {
        stationIndex = Math.max(0, Math.floor(Number(arg1.stationIndex)));
      }
      if (arg1.page_id !== undefined && arg1.page_id !== null) {
        page_id = Number(arg1.page_id);
      } else if (arg1.pageId !== undefined && arg1.pageId !== null) {
        page_id = Number(arg1.pageId);
      }
    }

    mode = "topic";
    currentRoadMode = mode;
    const roadSeq = ++roadLoadSeq;
    articleLoadSeq++;

    if (sceneCtrl?.isSummaryTrailMode()) {
      sceneCtrl?.exitSummaryTrail({ restoreStarSelection: false });
      ui.closeSummaryTrail();
    }

    stopIntroSweep({ jumpToEnd: false });
    ui.updateHoverLabel(null);
    ui.closeArticlePanel();
    activeStar = null;
    if (!sceneCtrl?.isRoadMode()) {
      sceneCtrl?.selectStar(null, { glide: false });
      sceneCtrl?.setThreads(null, [], currentYear);
    }
    sliderCtrl?.setYear(2026);
    const endLoading = beginLoading();
    try {
      const roadData = await getTopicRoad({ lang, page_id, category });
      if (roadSeq !== roadLoadSeq) return;
      endLoading();
      ui.closeArticlePanel();
      ui.updateHoverLabel(null);
      sceneCtrl?.setThreads(null, [], currentYear);
      sceneCtrl?.enterRoadMode(roadData, stationIndex);
      ui.openRoadView(roadData, sceneCtrl?.getRoadEventIndex() ?? stationIndex);
    } catch (err) {
      if (roadSeq !== roadLoadSeq) return;
      ui.showError(t("error.network"));
    } finally {
      endLoading();
    }
  }

  async function enterSummaryTrail(arg1 = {}, arg2 = null) {
    let lang = "fi";
    let page_id = null;
    let initialFocusIdx = 0;
    let initialReadMore = false;
    let cardRef = null;
    if (typeof arg1 === "string") {
      lang = arg1 || "fi";
      page_id = arg2 !== null && arg2 !== undefined ? Number(arg2) : 1256;
    } else if (typeof arg1 === "number") {
      page_id = arg1;
    } else if (arg1 && typeof arg1 === "object") {
      lang = arg1.lang || "fi";
      page_id = arg1.page_id ?? arg1.pageId ?? arg2;
      if (Number.isFinite(Number(arg1.focusIdx))) {
        initialFocusIdx = Math.max(0, Math.floor(Number(arg1.focusIdx)));
      }
      initialReadMore = Boolean(arg1.readMoreOpen);
      cardRef = arg1.cardRef || null;
    }
    if (page_id === null || page_id === undefined || Number.isNaN(Number(page_id))) {
      page_id = activeStar?.page_id ?? 1256;
      lang = activeStar?.lang ?? lang;
    } else {
      page_id = Number(page_id);
    }

    const star = starByKey.get(`${lang}:${page_id}`) || activeStar;
    if (!star) return;

    const seq = ++summaryLoadSeq;
    articleLoadSeq++;
    roadLoadSeq++;
    ui.closeArticlePanel();
    stopIntroSweep({ jumpToEnd: false });
    sliderCtrl?.setYear(2026);
    ui.updateHoverLabel(null);
    const endLoading = beginLoading();

    let summaryOpened = false;
    let pendingCompare = null;
    let comparePromise = null;
    if (lang === "fi") {
      comparePromise = getCompare("fi", page_id)
        .then((compareData) => {
          if (seq !== summaryLoadSeq) return null;
          if (summaryOpened && ui.isSummaryTrailOpen()) {
            ui.attachSummaryCompare(compareData);
          } else {
            pendingCompare = compareData;
          }
          return compareData;
        })
        .catch((err) => {
          if (seq !== summaryLoadSeq) return null;
          console.warn("Cross-language compare unavailable:", err);
          return null;
        });
    }

    try {
      const summaryData = await getSummary(lang, page_id, uiLang);
      if (seq !== summaryLoadSeq) return;
      let compareDataForMap = null;
      if (cardRef && comparePromise) {
        let timeoutId = null;
        compareDataForMap = await Promise.race([
          comparePromise,
          new Promise((resolve) => {
            timeoutId = setTimeout(() => resolve(null), 3000);
          }),
        ]);
        if (timeoutId !== null) clearTimeout(timeoutId);
        if (seq !== summaryLoadSeq) return;
      }
      if (cardRef) {
        const targetItems = buildSummaryCardList(summaryData);
        initialFocusIdx = mapSummaryCard(cardRef, targetItems, summaryData, compareDataForMap);
      }
      endLoading();
      ui.closeArticlePanel();
      sceneCtrl?.setThreads(null, [], currentYear);
      const trailItems = ui.openSummaryTrail(summaryData, {
        focusIdx: initialFocusIdx,
        readMoreOpen: initialReadMore,
      });
      summaryOpened = true;
      const clampedFocus = ui.getSummaryFocusIndex?.() ?? 0;
      sceneCtrl?.enterSummaryTrail({ star, items: trailItems });
      if (clampedFocus > 0) {
        sceneCtrl?.updateSummaryTrailItems(trailItems, clampedFocus);
      }
      if (pendingCompare) {
        ui.attachSummaryCompare(pendingCompare);
        pendingCompare = null;
      }

      if (summaryData.history_status === "building") {
        setTimeout(async () => {
          if (seq !== summaryLoadSeq || !ui.isSummaryTrailOpen()) return;
          try {
            const refreshed = await getSummary(lang, page_id, uiLang);
            if (seq !== summaryLoadSeq || !ui.isSummaryTrailOpen()) return;
            const updated = ui.updateSummaryTrail(refreshed);
            if (updated?.items?.length) {
              sceneCtrl?.updateSummaryTrailItems(updated.items, updated.focusIdx);
            }
          } catch (_) {
            // Single best-effort re-fetch when history was building; leave current card intact on error
          }
        }, 1500);
      }
    } catch (err) {
      if (seq !== summaryLoadSeq) return;
      ui.showError(t("error.summaryLoad"));
    } finally {
      endLoading();
    }
  }

  function exitSummaryTrail() {
    summaryLoadSeq++;
    clearLoading();
    ui.closeArticlePanel();
    ui.closeSummaryTrail();
    sceneCtrl?.exitSummaryTrail({ restoreStarSelection: true });
  }

  async function openStarArticle(lang, pageId, options = {}) {
    const key = `${lang}:${pageId}`;
    const star = starByKey.get(key);
    if (!star) return;

    const articleSeq = ++articleLoadSeq;
    const inRoad = Boolean(sceneCtrl?.isRoadMode());
    const inSummary = Boolean(sceneCtrl?.isSummaryTrailMode());

    stopIntroSweep({ jumpToEnd: !options.asofYear });
    activeStar = star;
    if (options.openTab) {
      activeArticleTab = options.openTab;
    }

    if (!inRoad && !inSummary) {
      if (options.startConstellation) {
        constellationPath = [star];
        savedConstellationHash = "";
        sceneCtrl?.setConstellationPath([]);
        ui.renderConstellationBar(constellationPath, "");
      } else if (!options.keepConstellation && constellationPath.length < 2) {
        constellationPath = [star];
      }

      // Decision (023): a not-yet-born star auto-jumps the slider to its creation year.
      const bornYear = star.created_year ?? star.first_edit_year;
      if (bornYear && bornYear > Math.round(currentYear) && !options.asofYear) {
        sliderCtrl?.setYear(bornYear);
      }

      if (options.glide !== false) {
        sceneCtrl?.selectStar(star, { glide: true });
      } else {
        sceneCtrl?.selectStar(star, { glide: false });
      }
    }

    const endLoading = beginLoading();
    try {
      const targetYear = Math.round(options.asofYear ?? currentYear);
      const [article, threadsRes] = await Promise.all([
        getArticle(lang, pageId),
        // Threads are optional mock fixtures; missing non-fixture stars must not block opening Dataset M/S articles.
        getThreads(lang, pageId).catch(() => ({ threads: [] })),
      ]);
      if (articleSeq !== articleLoadSeq) return;

      if (article && star) {
        if (article.length === undefined && star.length !== undefined) {
          article.length = star.length;
        }
        if (article.words === undefined && star.words !== undefined) {
          article.words = star.words;
        }
      }

      const visitedKeys = new Set(
        constellationPath
          .filter((s) => !(s.lang === lang && s.page_id === pageId))
          .map((s) => `${s.lang}:${s.page_id}`)
      );
      const allThreads = threadsRes?.threads || [];
      const filteredThreads = allThreads.filter(
        (t) => !visitedKeys.has(`${t.target.lang}:${t.target.page_id}`)
      );

      if (!inRoad && !inSummary && !sceneCtrl?.isRoadMode() && !sceneCtrl?.isSummaryTrailMode()) {
        sceneCtrl?.setThreads(star, filteredThreads, targetYear);
      }

      let timeline = null;
      let asof = null;
      let diff = null;

      if (article.has_history) {
        timeline = await getArticleTimeline(pageId);
        if (articleSeq !== articleLoadSeq) return;
        asof = await getAsOf(pageId, `${targetYear}-12-31`);
        if (articleSeq !== articleLoadSeq) return;
        if (asof) {
          diff = await getDiff(pageId, asof.rev_id, article.rev_id);
          if (articleSeq !== articleLoadSeq) return;
        }
      }

      endLoading();
      ui.openArticlePanel({
        article,
        timeline,
        asof,
        diff,
        threads: filteredThreads,
        selectedYear: targetYear,
        openTab: options.openTab || activeArticleTab,
      });
    } catch (err) {
      if (articleSeq !== articleLoadSeq) return;
      ui.showError(t("error.network"));
    } finally {
      endLoading();
    }
  }

  // Load initial stars + global timeline
  const endInitLoading = beginLoading();
  try {
    const [loadedStars, loadedTimeline] = await Promise.all([
      getStars(),
      getGlobalTimeline(),
    ]);
    stars = loadedStars;
    globalTimeline = loadedTimeline;
    for (const s of stars) {
      starByKey.set(`${s.lang}:${s.page_id}`, s);
    }
  } catch (err) {
    ui.showError(t("error.network"));
  } finally {
    endInitLoading();
  }

  const canvas = document.getElementById("galaxy-canvas");
  sceneCtrl = createGalaxyScene({
    canvas,
    stars,
    reducedMotion,
    onHoverStar(star, clientX, clientY) {
      const isWar = isStarEditWar(star, Math.round(currentYear));
      ui.updateHoverLabel(star, clientX, clientY, isWar);
    },
    async onSelectStar(star) {
      if (!star) return;
      await openStarArticle(star.lang, star.page_id, {
        glide: true,
        openTab: star.has_history ? activeArticleTab : "today",
      });
    },
    onFrameLabelsUpdate(projectedPayload) {
      ui.updateProjectedLabels(projectedPayload, Math.round(currentYear), isStarEditWar);
    },
    onRoadIndexChange(idx) {
      ui.updateRoadActiveIndex(idx);
    },
    onRoadGhostClick(ghost) {
      ui.openGhostStation(ghost);
    },
    onSummaryFocusScreenUpdate(payload) {
      ui.updateSummaryFocusScreen(payload);
    },
  });

  const sliderContainer = document.getElementById("timeslider-root");
  let lastPanelYear = -1;
  sliderCtrl = createTimeSlider({
    container: sliderContainer,
    globalTimeline,
    stars,
    reducedMotion,
    async onYearChange(yearFloat) {
      currentYear = yearFloat;
      sceneCtrl.setYear(yearFloat);
      const yearInt = Math.round(yearFloat);
      if (
        activeStar &&
        ui.isPanelOpen() &&
        !sceneCtrl.isRoadMode() &&
        !sceneCtrl.isSummaryTrailMode() &&
        yearInt !== lastPanelYear
      ) {
        lastPanelYear = yearInt;
        const currentArticle = ui.getCurrentArticle();
        if (currentArticle && currentArticle.has_history) {
          await openStarArticle(activeStar.lang, activeStar.page_id, {
            glide: false,
            openTab: "history",
            asofYear: yearInt,
            keepConstellation: true,
          });
        }
      }
    },
  });

  reducedMotionQuery.addEventListener("change", (e) => {
    reducedMotion = e.matches;
    sceneCtrl.setReducedMotion(reducedMotion);
    if (reducedMotion) {
      sliderCtrl.setYear(2026);
    }
  });

  // Restore saved constellation from URL hash if present (#path-fi:52097-fi:194041...)
  async function restoreConstellationFromHash() {
    const hash = window.location.hash;
    if (!hash || !hash.startsWith("#path-")) return false;
    const rawTokens = hash.slice("#path-".length).split("-");
    const restored = [];
    for (const token of rawTokens) {
      const [lang, idStr] = token.split(":");
      const star = starByKey.get(`${lang}:${Number(idStr)}`);
      if (star) restored.push(star);
    }
    if (restored.length >= 2) {
      stopIntroSweep({ jumpToEnd: false });
      sliderCtrl.setYear(2026);
      constellationPath = restored;
      savedConstellationHash = hash;
      sceneCtrl.setConstellationPath(constellationPath);
      ui.renderConstellationBar(constellationPath, savedConstellationHash);
      const lastStar = restored[restored.length - 1];
      await openStarArticle(lastStar.lang, lastStar.page_id, {
        glide: true,
        openTab: "today",
        keepConstellation: true,
      });
      return true;
    }
    return false;
  }

  function attachIntroInteractionStop() {
    if (!sliderCtrl?.isIntroActive()) return;
    const onPointerDown = (event) => {
      if (event.target?.closest?.("#timeslider-root")) {
        if (detachIntroStopListeners) {
          detachIntroStopListeners();
          detachIntroStopListeners = null;
        }
        return;
      }
      stopIntroSweep({ jumpToEnd: true });
    };
    const onKeyDown = (event) => {
      if (event.target?.closest?.("#timeslider-root")) {
        if (detachIntroStopListeners) {
          detachIntroStopListeners();
          detachIntroStopListeners = null;
        }
        return;
      }
      stopIntroSweep({ jumpToEnd: true });
    };
    const onWheel = () => {
      stopIntroSweep({ jumpToEnd: true });
    };
    window.addEventListener("pointerdown", onPointerDown, { capture: true, passive: true });
    window.addEventListener("keydown", onKeyDown, { capture: true, passive: true });
    window.addEventListener("wheel", onWheel, { capture: true, passive: true });
    detachIntroStopListeners = () => {
      window.removeEventListener("pointerdown", onPointerDown, { capture: true });
      window.removeEventListener("keydown", onKeyDown, { capture: true });
      window.removeEventListener("wheel", onWheel, { capture: true });
    };
  }

  async function restoreViewState(saved) {
    if (!saved) return false;
    try {
      if (saved.lens && saved.lens !== "meaning") {
        ui.setActiveLensButton(saved.lens);
        sceneCtrl?.setLens(saved.lens);
      }
      sliderCtrl?.setYear(saved.year ?? 2026);

      if (saved.view === "summary" && saved.article) {
        await enterSummaryTrail({
          lang: saved.article.lang,
          page_id: saved.article.page_id,
          focusIdx: saved.cardIndex,
          cardRef: saved.cardRef ?? null,
          readMoreOpen: saved.readMoreOpen,
        });
        if (saved.panelOpen && saved.panelArticle) {
          await openStarArticle(saved.panelArticle.lang, saved.panelArticle.page_id, {
            glide: false,
            openTab: saved.panelTab,
            asofYear: saved.year,
            keepSummaryTrail: true,
          });
        }
        return true;
      }

      if (saved.view === "road") {
        await enterTalvitieRoad({
          lang: saved.article?.lang || "fi",
          page_id: saved.article?.page_id ?? null,
          category: saved.category || null,
          mode: "topic",
          stationIndex: saved.stationIndex,
        });
        if (saved.panelOpen && saved.panelArticle) {
          await openStarArticle(saved.panelArticle.lang, saved.panelArticle.page_id, {
            glide: false,
            openTab: saved.panelTab,
            asofYear: saved.year,
          });
        }
        return true;
      }

      if (saved.view === "ask" && saved.askQuery) {
        ui.setSearchInput(saved.askQuery);
        const askState = await runAskQuery(saved.askQuery);
        const msIdx = saved.askMilestoneIdx;
        const ms =
          askState && msIdx >= 0 ? askState.askRes?.milestones?.[msIdx] : null;
        if (ms) {
          await selectMilestone(askState.askRes, ms, msIdx);
        } else if (saved.panelOpen && saved.panelArticle) {
          await openStarArticle(saved.panelArticle.lang, saved.panelArticle.page_id, {
            glide: false,
            openTab: saved.panelTab,
            asofYear: saved.year,
            keepConstellation: true,
          });
        }
        return true;
      }

      if (saved.view === "panel" && saved.article) {
        await openStarArticle(saved.article.lang, saved.article.page_id, {
          glide: true,
          openTab: saved.panelTab,
          asofYear: saved.year,
        });
        return true;
      }

      return saved.view === "sky";
    } catch {
      return false;
    }
  }

  const savedViewState = consumeViewState();
  const restoredFromViewState = await restoreViewState(savedViewState);
  const restoredFromHash = restoredFromViewState ? false : await restoreConstellationFromHash();
  if (!restoredFromViewState && !restoredFromHash && stars.length > 0) {
    sliderCtrl.startIntro();
    attachIntroInteractionStop();
  }

  // Expose debug handle for automated verification
  window.__wikimemory = {
    stars,
    starByKey,
    sceneCtrl,
    sliderCtrl,
    ui,
    openStarArticle,
    enterTalvitieRoad,
    enterSummaryTrail,
    exitSummaryTrail,
    selectSampleStar(titleSubstring = "Talvisota") {
      const match =
        stars.find((s) =>
          s.title.toLowerCase().includes(titleSubstring.toLowerCase())
        ) || stars[0];
      if (match) {
        openStarArticle(match.lang, match.page_id, {
          glide: true,
          openTab: match.has_history ? "history" : "today",
        });
      }
      return match;
    },
  };
}

init();
