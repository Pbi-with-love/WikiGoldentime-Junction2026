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
} from "./api.js";
import { createGalaxyScene } from "./scene.js";
import { createTimeSlider } from "./timeslider.js";
import { createUI } from "./ui.js";
import { lang as uiLang, applyStatic, t } from "./i18n.js";

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

  let currentYear = reducedMotion ? 2026 : 2003;
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

  const ui = createUI({
    async onSearchSubmit(query, langFilter = null, options = {}) {
      sliderCtrl?.stopIntro();
      ui.setLoading(true);
      try {
        const res = await search(query, { lang: langFilter, limit: 20 });
        ui.setLoading(false);

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
        ui.setLoading(false);
        ui.showError(t("error.network"));
      }
    },

    async onAskSubmit(query) {
      sliderCtrl?.stopIntro();
      ui.setLoading(true);
      try {
        const askRes = await ask(query, uiLang);
        const topKey = `${askRes.top.lang}:${askRes.top.page_id}`;
        const topStar = starByKey.get(topKey) || null;
        const threadsRes = await getThreads(askRes.top.lang, askRes.top.page_id);
        const threads = threadsRes?.threads || [];

        ui.setLoading(false);

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
          sceneCtrl?.selectStar(topStar, { glide: true });
          sceneCtrl?.setThreads(topStar, threads, currentYear);
        }

        ui.renderAskResult(activeAskState);
      } catch (err) {
        ui.setLoading(false);
        ui.showError(t("error.network"));
      }
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
      sliderCtrl?.stopIntro();
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
      sliderCtrl?.stopIntro();
      ui.setLoading(true);
      try {
        sliderCtrl?.setYear(ms.to_year);
        const topArticle = await getArticle(askRes.top.lang, askRes.top.page_id);
        const milestoneDiff = await getDiff(
          askRes.top.page_id,
          ms.rev_id,
          topArticle.rev_id
        );
        ui.setLoading(false);

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
        ui.setLoading(false);
        ui.showError(t("error.network"));
      }
    },

    async onSelectAsOfYear(pageId, yearInt) {
      sliderCtrl?.stopIntro();
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
      sliderCtrl?.stopIntro();
      sceneCtrl?.setLens(lensName);
    },

    async onEnterRoad(arg1 = {}, arg2 = null) {
      await enterTalvitieRoad(arg1, arg2);
    },

    onExitRoad() {
      roadLoadSeq++;
      articleLoadSeq++;
      ui.setLoading(false);
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
        try {
          ui.setLoading(true);
          const res = await search(branch.title, { lang: bLang, limit: 5 });
          ui.setLoading(false);
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
          ui.setLoading(false);
        }
      }
    },
  });

  async function enterTalvitieRoad(arg1 = {}, arg2 = null) {
    let lang = "fi";
    let page_id = null;
    let category = null;
    let mode = null;

    if (typeof arg1 === "string") {
      lang = arg1 || "fi";
      page_id = arg2 !== null && arg2 !== undefined ? Number(arg2) : 1256;
    } else if (typeof arg1 === "number") {
      page_id = arg1;
    } else if (arg1 && typeof arg1 === "object") {
      lang = arg1.lang || "fi";
      category = arg1.category || null;
      mode = arg1.mode || null;
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

    sliderCtrl?.stopIntro();
    ui.updateHoverLabel(null);
    ui.closeArticlePanel();
    activeStar = null;
    if (!sceneCtrl?.isRoadMode()) {
      sceneCtrl?.selectStar(null, { glide: false });
      sceneCtrl?.setThreads(null, [], currentYear);
    }
    sliderCtrl?.setYear(2026);
    ui.setLoading(true);
    try {
      const roadData = await getTopicRoad({ lang, page_id, category });
      if (roadSeq !== roadLoadSeq) return;
      ui.setLoading(false);
      ui.closeArticlePanel();
      ui.updateHoverLabel(null);
      sceneCtrl?.setThreads(null, [], currentYear);
      sceneCtrl?.enterRoadMode(roadData, 0);
      ui.openRoadView(roadData, sceneCtrl?.getRoadEventIndex() || 0);
    } catch (err) {
      if (roadSeq !== roadLoadSeq) return;
      ui.setLoading(false);
      ui.showError(t("error.network"));
    }
  }

  async function enterSummaryTrail(arg1 = {}, arg2 = null) {
    let lang = "fi";
    let page_id = null;
    if (typeof arg1 === "string") {
      lang = arg1 || "fi";
      page_id = arg2 !== null && arg2 !== undefined ? Number(arg2) : 1256;
    } else if (typeof arg1 === "number") {
      page_id = arg1;
    } else if (arg1 && typeof arg1 === "object") {
      lang = arg1.lang || "fi";
      page_id = arg1.page_id ?? arg1.pageId ?? arg2;
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
    roadLoadSeq++;
    sliderCtrl?.stopIntro();
    sliderCtrl?.setYear(2026);
    ui.updateHoverLabel(null);
    ui.setLoading(true);

    try {
      const summaryData = await getSummary(lang, page_id, uiLang);
      if (seq !== summaryLoadSeq) return;
      ui.setLoading(false);
      ui.closeArticlePanel();
      sceneCtrl?.setThreads(null, [], currentYear);
      const trailItems = ui.openSummaryTrail(summaryData);
      sceneCtrl?.enterSummaryTrail({ star, items: trailItems });
    } catch (err) {
      if (seq !== summaryLoadSeq) return;
      ui.setLoading(false);
      ui.showError(t("error.summaryLoad"));
    }
  }

  function exitSummaryTrail() {
    summaryLoadSeq++;
    ui.setLoading(false);
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

    sliderCtrl?.stopIntro();
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

      if (
        star.first_edit_year &&
        star.first_edit_year > Math.round(currentYear) &&
        !options.asofYear
      ) {
        sliderCtrl?.setYear(star.first_edit_year);
      }

      if (options.glide !== false) {
        sceneCtrl?.selectStar(star, { glide: true });
      } else {
        sceneCtrl?.selectStar(star, { glide: false });
      }
    }

    ui.setLoading(true);
    try {
      const targetYear = Math.round(options.asofYear ?? currentYear);
      const [article, threadsRes] = await Promise.all([
        getArticle(lang, pageId),
        getThreads(lang, pageId),
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

      ui.setLoading(false);
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
      ui.setLoading(false);
      ui.showError(t("error.network"));
    }
  }

  // Load initial stars + global timeline
  ui.setLoading(true);
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
    ui.setLoading(false);
  } catch (err) {
    ui.setLoading(false);
    ui.showError(t("error.network"));
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
      sliderCtrl.stopIntro();
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

  const restoredFromHash = await restoreConstellationFromHash();
  if (!restoredFromHash && stars.length > 0) {
    sliderCtrl.startIntro();
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
