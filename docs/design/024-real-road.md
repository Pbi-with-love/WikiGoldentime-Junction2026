# Design Handoff: Spec 024 — Real Road Cards, Category Road & Memory Threads

Scope: Design-only handoff for Part A (`docs/specs/024-real-road.md` §A4 & §Design), building on `docs/design/001-kaamos-sky.md`, `docs/design/013-i18n.md`, and `docs/design/017-cross-language-compare.md`.  
Files changed by Argon: `docs/design/024-real-road.md` only.

---

## 1. Design Decisions & Rationale

1. **Title-anchored `"Why on this road"` line (`<p class="road-card-why">`) separated from the wrapping memory badge:**
   - Placing `.road-card-why` inside a `.road-card-title-block` wrapper directly below `<h2 class="road-card-title">` (inside `.road-card-header-row`) guarantees the reason a milestone appears on the road (`This article`, `Similar (69%)`, `Similar (69%), shared category: Talvisota`, or `Category: Autonomian aika`) is always visually bound to the title.
   - Because `.road-memory-badge` now expands to include `reverts · disputes` alongside `Added {year} · changed {count} times`, it will wrap below `.road-card-title-block` on long titles or narrow (`340px`) viewports. Nesting `.road-card-why` inside `.road-card-title-block` prevents the edit-history stats from wedging between the title and the explanation line.
   - Rendered in quiet `var(--frost)` without decorative dots or background pill fills (`001-kaamos-sky.md` rule: dots are strictly semantic language or edit-war markers). Hidden completely when `st.why` is missing (mock fixtures or `sections` roads).

2. **Language-neutral `category` preservation & `lang` tagging on non-UI-language content:**
   - Real roads mix articles across `fi`, `sv`, and `en`, and `why.category` is always a Finnish Wikipedia category name (`"Autonomian aika"`, `"Talvisota"`).
   - Verbatim Wikipedia text—road card titles (`.road-card-title`, `.horizon-heading`), extractive lead prose (`.road-card-summary`), expanded lead reader (`#road-section-reader`), Finnish category names inside `.road-card-why`, and memory thread target titles/summaries (`.thread-target-btn`, `.thread-summary`)—always carries an explicit `lang` attribute matching its source Wikipedia edition (`lang="${st.lang}"`, `lang="fi"`, or `lang="${t.target.lang}"`) while UI chrome strings stay in `uiLang`.

3. **Accurate language-dot and coverage semantics for non-Finnish stations:**
   - Currently `renderLaneDotsHtml()` unconditionally renders `.dot-fi` and `renderLaneCoverageHtml()` assumes Finnish is always present. On real roads seeded from `sv` or `en` stars, stations may exist only in Swedish (`["sv"]`), only in English (`["en"]`), or in `["sv", "en"]` without Finnish.
   - `renderLaneDotsHtml()` must emit `.dot-fi` **only** when `laneObj.fi` is true, preserving canonical `fi` → `sv` → `en` order. `renderLaneCoverageHtml(lanes, stationLang)` computes `others = present.filter(c => c !== stationLang)` so non-Finnish stations announce `"Also covered in: Finnish, English"` when siblings exist, or `"Only in Swedish Wikipedia"` / `"Only in English Wikipedia"` via dedicated per-language i18n keys (`road.onlyInWiki.{fi,sv,en}`) so Finnish and Swedish inflected grammar stays natural.

4. **Inline `reverts · disputes` inside `.road-memory-badge` with locale number formatting:**
   - Real Finnish stations carry `history_stats: { versions, reverts, disputes, war_months }` (e.g., Talvisota `2,143` versions, `328` reverts, `88` disputes).
   - Format `changes` (`versions`) with `fmtNumber()` and append `reverts · disputes` inside `.road-memory-badge` using existing `panel.revertsWord` and `panel.disputesWord` pluralized keys (`fmtNumber(reverts) + " " + t("panel.revertsWord", { count: reverts })`), keeping `.dot-war` (`--lingon`) strictly for stations with `war_years.length > 0`.
   - Split `.road-memory-badge` into wrapping spans (`flex-wrap: wrap; flex: 0 1 auto; max-width: 100%;`) so the longer badge never causes horizontal overflow at `340px` card width.

5. **Semantic `<figure>` + `<figcaption>` image credit reusing `renderImageCreditCaption`:**
   - Replace the `<a class="road-event-thumb-caption">` element with `<figure class="road-event-thumb-row">` + `<figcaption class="road-event-thumb-caption" id="road-event-thumb-caption">`, removing `text-decoration: underline` from `.road-event-thumb-caption` so only the `.panel-thumb-credit` links created by `renderImageCreditCaption(captionEl, st.image)` are underlined (matching `#article-panel`). Keep the existing Commons filename link inside `<figcaption>` as fallback when `st.image` is null (mock fixtures).

6. **Category road & era minimap deduplication (`eraCaption` / `eraSpan`):**
   - Real `/api/topic-road` (`road.py`) produces `eras` with `label: "from–to"` (or `"year"` when single-year), unlike mock fixtures which attach prose era titles (`"Autonomian synty ja keisarillinen senaatti"`).
   - Guard `renderRoadEraMinimap()` so when `activeEra.label` equals the formatted year span (or `from_year === to_year`), it renders the span once instead of `"1809–1862 · 1809–1862"` or `"1939–1939 · 1939"`. Same single-year guard applies to `#road-topic-meta` (`eraSpan`), and undated tail stations (`event_year == null`) fall back to `topic.title` in `.era-minimap-progress` rather than defaulting to year `1900`.

7. **Real Memory Threads under the Ask answer (and Article Panel):**
   - Keep the existing `.threads-tree` visual grammar (`--kaamos` rows on `--panel`, `1px solid var(--border)`). In real mode (`before` / `after` / `semantic`, zero `ghost` rows), apply `font-variant-numeric: tabular-nums` and `white-space: nowrap` to `.thread-reason` (`← 1918`, `1944 →`, `≈ 69 %`), `min-width: 0` on `.thread-content`, top-aligned `.dot` on wrapping `.thread-target-btn` labels, `overflow-wrap: anywhere` on `.thread-summary`, and `└──` on the final non-ghost branch.

---

## 2. Design Tokens & Typography Reused

All tokens already exist in `:root` in `src/styles.css` (zero new colors, fonts, shadows, or dependencies):

| Token | Value | Usage in Spec 024 UI |
| :--- | :--- | :--- |
| `--kaamos` | `#101C33` | `.thread-branch` surface, `.road-card.is-next-2` backdrop |
| `--panel` | `#16243F` | `.road-card.is-nearest`, `.thread-reason` badge, `.toc-band.is-current` |
| `--border` | `#2A3B5C` | Card & thumbnail borders, `.thread-branch` / `.thread-reason` borders, footer hairline |
| `--snow` | `#EEF2F6` | `.dot-fi` fill (`8px`), `.road-card-title`, `.road-card-summary`, `.thread-target-btn`, focus rings |
| `--birch` | `#D9B872` | `.dot-sv` fill (`8px`), `.road-mode-tag`, `.toc-band.is-read` indicator |
| `--lichen` | `#8FC3B7` | `.dot-en` fill (`8px`), `#panel-road-btn` border (`See as a road`) |
| `--lingon` | `#D43F55` | `.dot-war` (`8px`) on `.road-memory-badge` **only** when `war_years.length > 0` |
| `--frost` | `#8A9BB3` | `.road-card-why`, `.road-memory-badge`, `.road-event-thumb-caption`, `.lane-coverage-text`, `.thread-reason`, `.thread-summary` |
| `--font-ui` | `"Hanken Grotesk", ...` | `.road-card-why` (`0.8125rem`), `.road-memory-badge` (`0.75rem`), `.road-event-thumb-caption` (`0.75rem`), `.road-card-lanes` (`0.75rem`), `.thread-*` |
| `--font-serif` | `"Literata", Georgia, serif` | `.road-card-title` (`1.375rem`, `600`), `.road-card-summary` (`0.96875rem`, `400`, `line-height: 1.62`) |

Editorial rules from `001-kaamos-sky.md` preserved: sentence case everywhere, zero ALL-CAPS eyebrows, zero decorative dots/shadows, flat surfaces. (`·` inside `.road-memory-badge` is retained solely to match the existing `"Added {year} · changed {count} times"` format per Spec 024.)

---

## 3. Component Specifications & Static HTML/CSS Mocks

### 3.1 Real Road Card (`.road-card.is-nearest`): Header, `"Why"`, Memory Stats & Image Credit

**Inner anatomy of `.road-card.is-nearest` (`660px` max width desktop, `min(660px, calc(100vw - 56px))` -> `~334px–340px` mobile):**
1. `.road-card-top-meta`: `.road-card-meta-left` + `.road-card-lanes` (accurate dots + coverage text)
2. `.road-card-header-row`:
   - `.road-card-title-block`: `<h2 class="road-card-title" lang="...">` + optional `<p class="road-card-why">`
   - Optional `.road-memory-badge` (`has_history && added_year`): optional `.dot-war` + primary `"Added {year} · changed {count} times"` + optional `"· {reverts} · {disputes}"` when `history_stats` exists
3. `.road-card-scroll`:
   - Optional `<figure class="road-event-thumb-row">` + `<img class="road-event-thumb-img">` + `<figcaption class="road-event-thumb-caption" id="road-event-thumb-caption">` (populated via `renderImageCreditCaption` when `st.image` exists, or Commons fallback link)
   - Optional `<p class="road-card-summary" lang="...">` (extractive lead `summary_short`, omitted if empty)
   - Existing optional facts/posts/expanded reader (`#road-section-reader` with `lang="${st.lang}"`)/ghosts/branches
4. `.road-card-footer`: unchanged controls (`Previous` / `{current} of {total}` / `Next`, `Read milestone` / `Hide details`, `Open article`).

```html
<!-- Static Mock 1: Seed station with edit-war history, shared-free Commons image & all 3 lanes (en UI) -->
<article class="road-card is-nearest" data-road-idx="3">
  <div class="road-card-top-meta">
    <span class="road-card-meta-left">Milestone 4 of 13 · 1939</span>
    <div class="road-card-lanes">
      <span class="lane-dots-group" aria-hidden="true">
        <span class="dot dot-fi" title="Finnish"></span>
        <span class="dot dot-sv" title="Swedish"></span>
        <span class="dot dot-en" title="English"></span>
      </span>
      <span class="lane-coverage-text">Also covered in: Swedish, English</span>
    </div>
  </div>

  <div class="road-card-header-row">
    <div class="road-card-title-block">
      <h2 class="road-card-title" lang="fi">Talvisota</h2>
      <p class="road-card-why">This article</p>
    </div>
    <div class="road-memory-badge">
      <span class="dot dot-war" title="Edit war in 2006, 2008, 2010"></span>
      <span class="road-memory-primary">Added 2004 · changed 2,143 times</span>
      <span class="road-memory-stats">328 reverts · 88 disputes</span>
    </div>
  </div>

  <div class="road-card-scroll">
    <figure class="road-event-thumb-row">
      <img class="road-event-thumb-img" src="https://upload.wikimedia.org/..." alt="Talvisota" />
      <figcaption class="road-event-thumb-caption" id="road-event-thumb-caption">
        Image: <a class="panel-thumb-credit" href="https://commons.wikimedia.org/..." target="_blank" rel="noopener noreferrer">SA-kuvat</a>,
        <a class="panel-thumb-credit" href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">CC BY-SA 4.0</a>
      </figcaption>
    </figure>
    <p class="road-card-summary" lang="fi">Talvisota oli 30. marraskuuta 1939 – 13. maaliskuuta 1940 käyty sota Suomen ja Neuvostoliiton välillä…</p>
  </div>

  <div class="road-card-footer">...</div>
</article>
```

```html
<!-- Static Mock 2: Similar station with shared Finnish category, non-fi (sv-only) star, no history, no image (en UI) -->
<article class="road-card is-nearest" data-road-idx="5">
  <div class="road-card-top-meta">
    <span class="road-card-meta-left">Milestone 6 of 13 · 1940</span>
    <div class="road-card-lanes">
      <span class="lane-dots-group" aria-hidden="true">
        <span class="dot dot-sv" title="Swedish"></span>
      </span>
      <span class="lane-coverage-text">Only in Swedish Wikipedia</span>
    </div>
  </div>

  <div class="road-card-header-row">
    <div class="road-card-title-block">
      <h2 class="road-card-title" lang="sv">Svenska frivilligkåren</h2>
      <p class="road-card-why">Similar (69%), shared category: <span lang="fi">Talvisota</span></p>
    </div>
  </div>

  <div class="road-card-scroll">
    <p class="road-card-summary" lang="sv">Svenska frivilligkåren var ett svenskt militärt förband bestående av frivilliga under vinterkriget…</p>
  </div>

  <div class="road-card-footer">...</div>
</article>
```

```css
/* Replace/extend existing header, memory badge, and thumb caption rules in src/styles.css */
.road-card-lanes {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px 8px;
  max-width: 100%;
  min-width: 0;
  font-family: var(--font-ui);
  font-size: 0.75rem;
  color: var(--frost);
}

.lane-coverage-text {
  color: var(--frost);
  min-width: 0;
}

.road-card-header-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 6px 14px;
  flex-shrink: 0;
}

.road-card-title-block {
  flex: 1 1 240px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.road-card-title {
  font-family: var(--font-serif);
  font-size: 1.375rem;
  font-weight: 600;
  line-height: 1.24;
  color: var(--snow);
  overflow-wrap: anywhere;
}

.road-card-why {
  margin: 0;
  font-family: var(--font-ui);
  font-size: 0.8125rem;
  font-weight: 400;
  line-height: 1.35;
  color: var(--frost);
  overflow-wrap: anywhere;
}

.road-memory-badge {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px 6px;
  padding: 4px 0 0 0;
  background: transparent;
  border: none;
  font-family: var(--font-ui);
  font-size: 0.75rem;
  line-height: 1.35;
  color: var(--frost);
  font-variant-numeric: tabular-nums;
  flex: 0 1 auto;
  max-width: 100%;
}

.road-memory-stats::before {
  content: "·";
  margin-right: 6px;
  color: var(--frost);
}

.road-event-thumb-row {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 12px;
}

.road-event-thumb-caption {
  flex: 1 1 auto;
  min-width: 0;
  font-family: var(--font-ui);
  font-size: 0.75rem;
  line-height: 1.4;
  color: var(--frost);
  overflow-wrap: anywhere;
}
```

> **Note on `.road-event-thumb-caption`:** Removing `text-decoration: underline` from `.road-event-thumb-caption` ensures plain text (`"Image: "` and `", "`) stays un-underlined while the `<a class="panel-thumb-credit">` links created by `renderImageCreditCaption()` (and the fallback Commons link) keep `text-decoration: underline` and `color: var(--snow)` on hover via existing `.panel-thumb-credit` rules.

---

### 3.2 Lane Dots & Coverage Rules (`renderLaneDotsHtml`, `renderLaneCoverageHtml`)

1. **`normalizeLanes(lanes, fallbackLang = null)`:**
   - When `Array.isArray(lanes)`: `{ fi: lanes.includes("fi"), sv: lanes.includes("sv") ? 1 : 0, en: lanes.includes("en") ? 1 : 0 }`.
   - When `lanes` is an object: `{ fi: Boolean(lanes.fi), sv: Number(lanes.sv || 0), en: Number(lanes.en || 0) }` (preserves `sections` road objects where `fi: true` is explicit).
   - When `!lanes`: default from `fallbackLang` if given (`{ fi: fallbackLang === "fi", sv: fallbackLang === "sv" ? 1 : 0, en: fallbackLang === "en" ? 1 : 0 }`), else `{ fi: true, sv: 0, en: 0 }`.
2. **`renderLaneDotsHtml(lanes)`:**
   - Emit `<span class="dot dot-${code}" title="${langName(code)}"></span>` **only for languages present** (`fi`, `sv`, `en` in canonical order). Never inject `.dot-fi` when `laneObj.fi` is `false`.
   - Wrap inside `<span class="lane-dots-group" aria-hidden="true">` on `.is-nearest` so screen readers read the coverage text rather than redundant empty spans; keep `.horizon-lanes` (`renderLaneDotsHtml(st.lanes)`) on `.is-next-1` / `.is-next-2` strips.
3. **`renderLaneCoverageHtml(lanes, stationLang = "fi")`:**
   - `present = ["fi", "sv", "en"].filter(c => c === "fi" ? laneObj.fi : laneObj[c] > 0)`.
   - `others = present.filter(c => c !== stationLang)`.
   - If `others.length > 0`: `t("road.alsoCoveredIn", { langs: others.map(c => langName(c)).join(", ") })`.
     - Example (`stationLang = "sv"`, `lanes = ["fi", "sv", "en"]`, `ui = "en"`): dots `fi` + `sv` + `en`, label `"Also covered in: Finnish, English"`.
   - If `others.length === 0`:
     - When `stationLang === "fi"`: keep `t("road.finnishOnly")` (or `t("road.onlyInWiki.fi")`—keeping `road.finnishOnly` preserves existing Finnish-station copy).
     - When `stationLang === "sv"` or `"en"`: `t("road.onlyInWiki." + stationLang)` -> `"Only in Swedish Wikipedia"` / `"Only in English Wikipedia"`.

---

### 3.3 Category Road (`Autonomian aika`, `why.kind === "category"`) & Era Minimap

- **Top bar (`#road-top-bar`):**
  - `.road-topic-chip[data-road-category="Autonomian aika"]` activates `.is-active` via existing `topicMeta.category` match.
  - `#road-topic-title` renders `topicMeta.title` (`Autonomian aika`).
  - `#road-topic-meta`: guard single-year span so if `eras[0].from_year === eras[eras.length - 1].to_year`, `eraSpan` renders ` · 1939` rather than ` · 1939–1939`.
- **Station card header:**
  - `.road-card-why` renders `Category: <span lang="fi">Autonomian aika</span>` (`road.whyCategoryPrefix`).
- **Horizon strips (`.is-next-1`, `.is-next-2`):**
  - Add `lang="${escapeHtml(st.lang)}"` on `.horizon-heading`.
  - Omit `<span class="horizon-metrics">` when `metricsText === ""` (undated stations) so `.horizon-strip-right` stays flush.
- **Era minimap (`#road-era-minimap`):**
  - In `renderRoadEraMinimap()`:
    - If `currentSt.event_year == null` (undated tail station), render `roadData.topic?.title || t("road.historicalRoadFallback")` in `.era-minimap-progress` instead of defaulting `evYear` to `1900`.
    - When `currentSt.event_year != null` and `activeEra` exists, compute `spanStr = activeEra.from_year === activeEra.to_year ? String(activeEra.from_year) : (activeEra.from_year + "–" + activeEra.to_year)`. If `activeEra.label && activeEra.label !== spanStr`, render `spanStr + " · " + activeEra.label` (preserves mock prose era titles); otherwise render `spanStr` once (prevents `"1809–1862 · 1809–1862"`).

```html
<!-- Static Mock 3: Category road card (Autonomian aika, fi UI) -->
<article class="road-card is-nearest" data-road-idx="0">
  <div class="road-card-top-meta">
    <span class="road-card-meta-left">Etappi 1 / 13 · 1809</span>
    <div class="road-card-lanes">
      <span class="lane-dots-group" aria-hidden="true">
        <span class="dot dot-fi" title="suomi"></span>
        <span class="dot dot-sv" title="ruotsi"></span>
        <span class="dot dot-en" title="englanti"></span>
      </span>
      <span class="lane-coverage-text">Käsitelty myös kielillä: ruotsi, englanti</span>
    </div>
  </div>
  <div class="road-card-header-row">
    <div class="road-card-title-block">
      <h2 class="road-card-title" lang="fi">Porvoon valtiopäivät</h2>
      <p class="road-card-why">Luokka: <span lang="fi">Autonomian aika</span></p>
    </div>
    <div class="road-memory-badge">
      <span class="road-memory-primary">Lisätty 2005 · muokattu 142 kertaa</span>
      <span class="road-memory-stats">12 palautusta · 3 kiistaa</span>
    </div>
  </div>
  <div class="road-card-scroll">
    <p class="road-card-summary" lang="fi">…</p>
  </div>
  <div class="road-card-footer">...</div>
</article>
```

---

### 3.4 Real Memory Threads Under the Ask Answer (and Article Panel)

`renderThreadsTreeHtml()` in `src/ui.js` already renders under `#ask-panel` (`renderAskResult`) and `#panel-threads-section` (`openArticlePanel`). Real `/api/threads/{lang}/{page_id}` drops `ghost` threads and returns 1–4 items (`type`: `"before" | "after" | "semantic"`, `reason`: `"← 1918" | "1944 →" | "≈ 69 %"`, `target: { lang, page_id, title, ... }`, `summary` up to 200 chars in `target.lang`).

**Refinements to existing `.threads-tree` markup & CSS:**
1. **Last-branch connector:** Use `"└──"` on the final thread item when `!isGhost` (`idx === threads.length - 1 ? "└──" : "├──"`).
2. **`lang` tagging & empty summary guard:** Set `lang="${escapeHtml(t.target.lang)}"` on the target title `<span>` inside `.thread-target-btn` and on `<p class="thread-summary">`. Omit `<p class="thread-summary">` if `t.summary` is empty/whitespace.
3. **Tabular reasons & wrapping safety:** Add `font-variant-numeric: tabular-nums; white-space: nowrap;` on `.thread-reason`, `min-width: 0;` on `.thread-content`, top-aligned `.dot` inside `.thread-target-btn` so wrapped 2-line titles keep the dot aligned to line 1, and `margin: 0; overflow-wrap: anywhere;` on `.thread-summary`.

```html
<!-- Static Mock 4: Real memory threads tree under Ask answer (en UI, mixed fi/sv/en targets) -->
<div class="threads-tree" aria-label="Memory threads">
  <div class="threads-tree-root">
    <span class="star-glyph" aria-hidden="true">★</span>
    <span>Memory threads from Talvisota</span>
  </div>
  <div class="threads-branches">
    <div class="thread-branch is-before">
      <div class="thread-connector" aria-hidden="true">├──</div>
      <div class="thread-content">
        <div class="thread-top-line">
          <span class="thread-reason">← 1920</span>
          <button type="button" class="thread-target-btn" data-source-lang="fi" data-source-id="1256" data-target-lang="fi" data-target-id="8901">
            <span class="dot dot-fi" aria-hidden="true"></span>
            <span lang="fi">Tarton rauha</span>
          </button>
        </div>
        <p class="thread-summary" lang="fi">Tarton rauha solmittiin Suomen ja Neuvosto-Venäjän välillä 14. lokakuuta 1920…</p>
      </div>
    </div>
    <div class="thread-branch is-semantic">
      <div class="thread-connector" aria-hidden="true">└──</div>
      <div class="thread-content">
        <div class="thread-top-line">
          <span class="thread-reason">≈ 71 %</span>
          <button type="button" class="thread-target-btn" data-source-lang="fi" data-source-id="1256" data-target-lang="en" data-target-id="12345">
            <span class="dot dot-en" aria-hidden="true"></span>
            <span lang="en">Moscow Peace Treaty</span>
          </button>
        </div>
        <p class="thread-summary" lang="en">The Moscow Peace Treaty was signed by Finland and the Soviet Union on 12 March 1940…</p>
      </div>
    </div>
  </div>
</div>
```

```css
/* Adjustments to existing .thread-* rules in src/styles.css */
.thread-content {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
  min-width: 0;
}

.thread-reason {
  font-size: 0.75rem;
  padding: 1px 6px;
  border-radius: 2px;
  background-color: var(--panel);
  border: 1px solid var(--border);
  color: var(--frost);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.thread-target-btn {
  background: transparent;
  border: none;
  color: var(--snow);
  font-family: var(--font-ui);
  font-size: 0.875rem;
  font-weight: 600;
  display: inline-flex;
  align-items: flex-start;
  gap: 6px;
  max-width: 100%;
  cursor: pointer;
  text-align: left;
}

.thread-target-btn .dot {
  margin-top: 5px;
}

.thread-summary {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--frost);
  line-height: 1.4;
  overflow-wrap: anywhere;
}
```

---

### 3.5 Complete Wording Table (`en` / `fi` / `sv`)

#### New keys to add identically to `STRINGS.en`, `STRINGS.fi`, and `STRINGS.sv` in `src/i18n.js`

| Key | `en` | `fi` | `sv` |
| :--- | :--- | :--- | :--- |
| `road.onlyInWiki.fi` | `Only in Finnish Wikipedia` | `Vain suomenkielisessä Wikipediassa` | `Bara i finskspråkiga Wikipedia` |
| `road.onlyInWiki.sv` | `Only in Swedish Wikipedia` | `Vain ruotsinkielisessä Wikipediassa` | `Bara i svenskspråkiga Wikipedia` |
| `road.onlyInWiki.en` | `Only in English Wikipedia` | `Vain englanninkielisessä Wikipediassa` | `Bara i engelskspråkiga Wikipedia` |
| `road.whySeed` | `This article` | `Tämä artikkeli` | `Denna artikel` |
| `road.whySimilar` | `Similar ({pct}%)` | `Samankaltainen ({pct} %)` | `Liknande ({pct} %)` |
| `road.whySimilarNoPct` | `Similar article` | `Samankaltainen artikkeli` | `Liknande artikel` |
| `road.whySharedCategoryPrefix` | `shared category:` | `yhteinen luokka:` | `gemensam kategori:` |
| `road.whyCategoryPrefix` | `Category:` | `Luokka:` | `Kategori:` |

> **Notes on formatting & reuse:**
> - **Locale `%` spacing:** English omits the space before `%` (`Similar (69%)`), matching existing `src/mock/` English copy; Finnish and Swedish include a space (`Samankaltainen (69 %)`, `Liknande (69 %)`).
> - **Why line composition:**
>   - `why.kind === "seed"` → `t("road.whySeed")`
>   - `why.kind === "similar"`: base is `why.similarity != null ? t("road.whySimilar", { pct: Math.round(why.similarity * 100) }) : t("road.whySimilarNoPct")`. If `why.category` is non-null, append `, ${escapeHtml(t("road.whySharedCategoryPrefix"))} <span lang="fi">${escapeHtml(why.category)}</span>`.
>   - `why.kind === "category"` (and `why.category`): `${escapeHtml(t("road.whyCategoryPrefix"))} <span lang="fi">${escapeHtml(why.category)}</span>`.
> - **Existing keys reused (zero duplication):**
>   - `road.alsoCoveredIn` (`"Also covered in: {langs}"` / `"Käsitelty myös kielillä: {langs}"` / `"Behandlas även på: {langs}"`) with `others.map(c => langName(c)).join(", ")`.
>   - `road.finnishOnly` for `fi`-only stations.
>   - `road.addedChangedTimes` with `count: fmtNumber(changesCount)` — `Number(fmtNumber(1)) === 1` selects `.one`, while `0` and `"2,143"` / `"2 143"` (`Number(...)` is `0` or `NaN`) select `.other`.
>   - `panel.revertsWord` and `panel.disputesWord` (`${fmtNumber(reverts)} ${t("panel.revertsWord", { count: reverts })}` · `${fmtNumber(disputes)} ${t("panel.disputesWord", { count: disputes })}`) inside `.road-memory-stats` when `st.history_stats` (or `st.history?.stats`) is non-null.
>   - `panel.imageCredit` and `panel.commonsCredit` via `renderImageCreditCaption(captionEl, st.image)`.

---

## 4. Responsive Layout (`340px` Cards) & Interactive States

- **Narrow card budget (`<= 400px` viewport / `~334px–340px` card, `298px–304px` inner width):**
  - `.road-card-top-meta`: `flex-wrap: wrap` keeps `"Milestone 4 of 13 · 1939"` on line 1 and `.road-card-lanes` (`8px` dots + `"Vain ruotsinkielisessä Wikipediassa"` `~225px`) cleanly on line 2 if needed.
  - `.road-card-header-row`: `.road-card-title` + `.road-card-why` stay grouped above `.road-memory-badge`; `.road-memory-badge` wraps neatly onto `Lisätty 2004 · muokattu 2 143 kertaa` / `328 palautusta · 88 kiistaa` with zero horizontal overflow. (If `.road-memory-stats` wraps to a second line, keeping `content: "·"` on `.road-memory-stats::before` or hiding it only if desired is acceptable; `max-width: 100%` prevents clipping.)
  - `.road-event-thumb-row`: `72px` thumbnail + `12px` gap leaves `214px–220px` for `<figcaption class="road-event-thumb-caption">` with `overflow-wrap: anywhere` for long artist/license names.
  - `.road-card.is-nearest` keeps `max-height: min(492px, calc(100vh - 178px))` and `.road-card-scroll` `overflow-y: auto` so `720px` laptop viewports never collide with `#road-top-bar` or `#road-era-minimap`.

- **Interactive, Empty, Loading & Error States:**
  - **Default / Hover / Focus-visible / Active / Disabled:** `#panel-road-btn`, `.road-topic-chip`, `.road-card.is-next-1/.is-next-2`, `#btn-road-prev/#btn-road-next` (`disabled` at endpoints), `#btn-road-toggle-section` (`aria-expanded`), `#btn-road-read-full`, `.panel-thumb-credit`, `.toc-band`, and `.thread-target-btn` inherit existing `button:focus-visible` / `a:focus-visible` (`2px solid var(--snow); outline-offset: 2px;`) and hover transitions.
  - **Loading:** Existing `ui.setLoading(true)` status pill while `getTopicRoad` or `getAsk` + `getThreads` fetches; sky remains rendered.
  - **Empty / Missing optional fields:**
    - `st.why` missing (mock fixtures) → omit `.road-card-why`.
    - `st.has_history === false` (`sv`/`en` or unedited `fi`) → omit `.road-memory-badge`.
    - `st.history_stats` missing (mock fixtures) → omit `.road-memory-stats`, keep `Added {year} · changed {count} times`.
    - `st.thumb_url` missing → omit `.road-event-thumb-row`.
    - `st.summary` empty → omit `.road-card-summary`.
    - `threads` empty → `renderThreadsTreeHtml` returns `""`.
  - **Error (e.g., `/api/topic-road*` blocked or fails):** Existing `enterTalvitieRoad` catch calls `ui.setLoading(false); ui.showError(t("error.network"));`, keeping sky and navigation usable.

---

## 5. Implementation Handoff Checklist for Hydrogen

1. **Files in Part A scope (no edits to `index.html`, `src/scene.js`, or `src/main.js`):**
   - `src/i18n.js`: Add the 8 new `road.*` keys identically to `STRINGS.en`, `STRINGS.fi`, and `STRINGS.sv`.
   - `src/ui.js`:
     - `isRoadEligibleArticle`: return `Boolean(article)` (eligible for every loaded star).
     - `normalizeLanes`: accept optional `fallbackLang`; preserve `fi` strictly from `lanes` array/object rather than defaulting `fi` to `true` for non-`fi` array/fallback.
     - `normalizeRoadData` (topic branch): carry `why`, `image`, `siblings`, `history_stats`, `thumb_url: ev.thumb_url || ev.image?.thumb_url || null`; populate `history.stats: ev.history_stats || null` and `history.changes: ev.history_stats?.versions ?? ev.changes ?? 1`.
     - `renderLaneDotsHtml` & `renderLaneCoverageHtml(lanes, stationLang)`: only emit `.dot-fi` when `laneObj.fi` is true; render `others` via `road.alsoCoveredIn` or single-language via `road.finnishOnly` / `road.onlyInWiki.{sv,en}`.
     - `renderRoadCards`: add `.road-card-title-block`, `.road-card-why`, `lang="${st.lang}"` on title/summary/reader/horizon heading, `fmtNumber` + `.road-memory-stats` inside `.road-memory-badge`, `<figure class="road-event-thumb-row">` + `<figcaption id="road-event-thumb-caption">` populated by `renderImageCreditCaption(..., st.image)` after `innerHTML` assignment (keeping Commons fallback link when `st.image` is null).
     - `openRoadView` & `renderRoadEraMinimap`: single-year span guard (`from === to`), deduplicate `eraCaption` when `activeEra.label === spanStr`, and avoid `1900` fallback on undated stations (`event_year == null`).
     - `renderThreadsTreeHtml`: `└──` on final non-ghost branch, `lang="${t.target.lang}"` on target title & summary, omit empty `.thread-summary`.
   - `src/styles.css`: Apply the `.road-card-header-row`, `.road-card-title-block`, `.road-card-why`, `.road-memory-badge`, `.road-memory-stats`, `.road-card-lanes`, `.road-event-thumb-row`, `.road-event-thumb-caption` (removing wrapper underline), and `.thread-*` adjustments.
2. **Stable hooks for Playwright verification (`artifacts/screenshots/024-real-road/`):**
   - `.road-card.is-nearest`, `.road-card-why`, `.road-memory-badge`, `.road-memory-stats`, `.road-card-lanes`, `.road-event-thumb-caption .panel-thumb-credit`, `.road-topic-chip[data-road-category="Autonomian aika"].is-active`, `.threads-tree .thread-branch`, `.thread-reason`, `.thread-target-btn`.
