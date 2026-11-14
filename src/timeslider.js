import { fmtNumber, t } from "./i18n.js";

const MIN_YEAR = 2003;
const MAX_YEAR = 2026;
const YEAR_SPAN = MAX_YEAR - MIN_YEAR; // 23 years

export function createTimeSlider({
  container,
  globalTimeline,
  stars,
  reducedMotion = false,
  onYearChange,
}) {
  const monthsList = globalTimeline?.months || [];
  const maxMonthEdits = Math.max(1, ...monthsList.map((m) => m.edits || 0));

  // Precompute annual version totals & edit-war month counts from GET /api/timeline
  const statsByYear = new Map();
  for (let y = MIN_YEAR; y <= MAX_YEAR; y++) {
    statsByYear.set(y, { edits: 0, warMonths: 0, historyArticles: 0 });
  }

  for (const m of monthsList) {
    const y = Number(String(m.month).slice(0, 4));
    const entry = statsByYear.get(y);
    if (entry) {
      entry.edits += m.edits || 0;
      if ((m.disputes || 0) >= 3) entry.warMonths += 1;
    }
  }

  for (let y = MIN_YEAR; y <= MAX_YEAR; y++) {
    let historyCount = 0;
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      if (s.has_history && s.first_edit_year && s.first_edit_year <= y) {
        historyCount++;
      }
    }
    const entry = statsByYear.get(y);
    if (entry) entry.historyArticles = historyCount;
  }

  container.innerHTML = `
    <div class="slider-meta-row">
      <span class="slider-caption">${t("timeslider.caption")}</span>
      <span class="slider-year-summary" id="slider-year-summary" aria-live="polite"></span>
    </div>
    <div class="slider-interactive-zone" id="slider-interactive-zone">
      <div class="histogram-bars" id="histogram-bars" aria-hidden="true"></div>
      <div class="slider-axis-row">
        <span class="slider-bound-year" aria-hidden="true">2003</span>
        <div
          class="slider-track"
          id="slider-track"
          role="slider"
          tabindex="0"
          aria-label="Selected year in Wikipedia history"
          aria-valuemin="${MIN_YEAR}"
          aria-valuemax="${MAX_YEAR}"
          aria-valuenow="${MAX_YEAR}"
        >
          <div class="slider-track-line">
            <div class="slider-track-fill" id="slider-track-fill"></div>
          </div>
          <div class="slider-ticks" id="slider-ticks" aria-hidden="true"></div>
          <div class="slider-handle-group" id="slider-handle-group">
            <div class="slider-handle-dot" aria-hidden="true"></div>
            <div class="slider-year-numeral" id="slider-year-numeral">2026</div>
          </div>
        </div>
        <span class="slider-bound-year" aria-hidden="true">2026</span>
      </div>
    </div>
  `;

  const barsContainer = container.querySelector("#histogram-bars");
  const interactiveZone = container.querySelector("#slider-interactive-zone");
  const trackEl = container.querySelector("#slider-track");
  const fillEl = container.querySelector("#slider-track-fill");
  const ticksEl = container.querySelector("#slider-ticks");
  const handleGroupEl = container.querySelector("#slider-handle-group");
  const yearNumeralEl = container.querySelector("#slider-year-numeral");
  const yearSummaryEl = container.querySelector("#slider-year-summary");

  // Build monthly histogram bars from GET /api/timeline
  const barElements = [];
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < monthsList.length; i++) {
    const m = monthsList[i];
    const year = Number(String(m.month).slice(0, 4));
    const month = Number(String(m.month).slice(5, 7));
    const normalized = (m.edits || 0) / maxMonthEdits;

    const bar = document.createElement("div");
    bar.className = "hist-bar";
    if ((m.disputes || 0) >= 3) bar.classList.add("has-war-spike");
    bar.style.height = `${Math.max(5, Math.round(normalized * 100))}%`;
    bar.dataset.monthKey = m.month;
    fragment.appendChild(bar);
    barElements.push({ el: bar, year, month });
  }
  barsContainer.appendChild(fragment);

  // Build 24 year ticks along the line
  for (let y = MIN_YEAR; y <= MAX_YEAR; y++) {
    const tick = document.createElement("span");
    const isMajor = y === 2003 || y === 2008 || y === 2014 || y === 2020 || y === 2026;
    tick.className = isMajor ? "slider-tick major" : "slider-tick";
    const pct = ((y - MIN_YEAR) / YEAR_SPAN) * 100;
    tick.style.left = `${pct}%`;
    ticksEl.appendChild(tick);
  }

  let currentYearFloat = reducedMotion ? MAX_YEAR : MIN_YEAR;
  let introRafId = null;

  function stopIntro() {
    if (introRafId !== null) {
      cancelAnimationFrame(introRafId);
      introRafId = null;
    }
  }

  function renderSliderState(yearFloat) {
    const clamped = Math.min(MAX_YEAR, Math.max(MIN_YEAR, yearFloat));
    currentYearFloat = clamped;
    const yearInt = Math.round(clamped);
    const pct = ((clamped - MIN_YEAR) / YEAR_SPAN) * 100;

    fillEl.style.width = `${pct}%`;
    handleGroupEl.style.left = `${pct}%`;
    if (pct < 5) {
      handleGroupEl.dataset.edge = "left";
    } else if (pct > 95) {
      handleGroupEl.dataset.edge = "right";
    } else {
      handleGroupEl.dataset.edge = "center";
    }

    yearNumeralEl.textContent = String(yearInt);
    trackEl.setAttribute("aria-valuenow", String(yearInt));
    trackEl.setAttribute("aria-valuetext", `Year ${yearInt}`);

    for (let i = 0; i < barElements.length; i++) {
      const b = barElements[i];
      const monthDecimal = b.year + (b.month - 1) / 12;
      const isActive = monthDecimal <= clamped + 0.92;
      b.el.classList.toggle("is-active", isActive);
      b.el.classList.toggle("is-current-year", b.year === yearInt);
    }

    const stats = statsByYear.get(yearInt) || { edits: 0, warMonths: 0, historyArticles: 0 };
    const editsFormatted = fmtNumber(stats.edits);
    const editsLine = t("timeslider.editsInYear", { edits: editsFormatted, year: yearInt });
    if (stats.warMonths > 0) {
      const warText = t("timeslider.warMonths", { count: stats.warMonths });
      yearSummaryEl.innerHTML = `<span>${editsLine}</span> <span class="summary-war-indicator"><span class="war-inline-dot"></span>${warText}</span>`;
    } else {
      yearSummaryEl.innerHTML = `<span>${editsLine}</span>`;
    }
  }

  function updateFromPointerEvent(event, snapToInteger = false) {
    stopIntro();
    const rect = trackEl.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const rawYear = MIN_YEAR + ratio * YEAR_SPAN;
    const nextYear = snapToInteger ? Math.round(rawYear) : rawYear;
    renderSliderState(nextYear);
    onYearChange?.(nextYear);
  }

  let isDragging = false;

  interactiveZone.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    isDragging = true;
    interactiveZone.setPointerCapture(event.pointerId);
    trackEl.focus({ preventScroll: true });
    updateFromPointerEvent(event, false);
  });

  interactiveZone.addEventListener("pointermove", (event) => {
    if (!isDragging) return;
    updateFromPointerEvent(event, false);
  });

  function endDrag(event) {
    if (!isDragging) return;
    isDragging = false;
    try {
      interactiveZone.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }
    const snapped = Math.round(currentYearFloat);
    renderSliderState(snapped);
    onYearChange?.(snapped);
  }

  interactiveZone.addEventListener("pointerup", endDrag);
  interactiveZone.addEventListener("pointercancel", endDrag);

  trackEl.addEventListener("keydown", (event) => {
    let nextYear = Math.round(currentYearFloat);
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      nextYear = Math.max(MIN_YEAR, nextYear - 1);
    } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      nextYear = Math.min(MAX_YEAR, nextYear + 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      nextYear = MIN_YEAR;
    } else if (event.key === "End") {
      event.preventDefault();
      nextYear = MAX_YEAR;
    } else {
      return;
    }

    stopIntro();
    renderSliderState(nextYear);
    onYearChange?.(nextYear);
  });

  function startIntro() {
    if (reducedMotion) {
      renderSliderState(MAX_YEAR);
      onYearChange?.(MAX_YEAR);
      return;
    }

    stopIntro();
    const durationMs = 4000;
    const startTime = performance.now();

    function step(now) {
      const elapsed = now - startTime;
      const t = Math.min(1, Math.max(0, elapsed / durationMs));
      const eased = t < 0.85 ? (t / 0.85) * 0.88 : 0.88 + (1 - Math.pow(1 - (t - 0.85) / 0.15, 2)) * 0.12;
      const yearFloat = MIN_YEAR + eased * YEAR_SPAN;

      renderSliderState(yearFloat);
      onYearChange?.(yearFloat);

      if (t < 1) {
        introRafId = requestAnimationFrame(step);
      } else {
        introRafId = null;
        renderSliderState(MAX_YEAR);
        onYearChange?.(MAX_YEAR);
      }
    }

    introRafId = requestAnimationFrame(step);
  }

  renderSliderState(currentYearFloat);

  return {
    startIntro,
    stopIntro,
    setYear(yearValue) {
      stopIntro();
      renderSliderState(yearValue);
      onYearChange?.(yearValue);
    },
    getCurrentYear() {
      return Math.round(currentYearFloat);
    },
  };
}
