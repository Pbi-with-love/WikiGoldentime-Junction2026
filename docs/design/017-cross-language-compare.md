# Design Handoff: Spec 017 — Cross-Language Compare (`sv` / `en` Presence on Summarize Section Cards)

Scope: Design-only handoff for Hydrogen (`docs/specs/017-cross-language-compare.md`), building on `docs/design/001-kaamos-sky.md` and `docs/design/013-i18n.md`.  
Note: No `docs/specs/016-*` or `docs/design/016-*` exists in the repository at handoff time; this design integrates directly with the current Summarize implementation in `src/ui.js`, `src/main.js`, `src/styles.css`, and `src/i18n.js`.  
Files changed by Argon: `docs/design/017-cross-language-compare.md` only.

---

## 1. Design Decisions & Rationale

1. **Bottom-of-summary placement above `Read more` (`#summary-focused-overlay`) and a single-row compact strip on near CSS3D trail cards:**
   - On focused section cards (`.summary-trail-card.is-focused`), the compare block sits directly after `.summary-trail-summary` / `.facts-source-list` and immediately above `.summary-card-actions` (`.summary-readmore-btn`). Putting it above `.summary-trail-oneline` would displace the Finnish section summary below up to ~190 px of sibling excerpts; putting it below `.summary-readmore-body` would push it underneath expanded multi-paragraph Wikipedia text.
   - On near CSS3D trail cards (`.summary-css3d-card.is-next-1` and `.is-next-2`), a compact 1-row dot + short-label footer sits directly under `.summary-trail-oneline`.
   - On far CSS3D trail cards (`.summary-css3d-card.is-far`, `280px` title-only pills at `0.14–0.56` opacity), Overview cards, and Ghost cards: show **nothing** (consistent with `.mt-label` suppression on `.is-far`).
2. **Semantic language dots (`--birch`, `--lichen`, `--snow`) matching stars and the legend:**
   - Every compare line opens with an `8px` `.dot` (`dot-sv`, `dot-en`, `dot-fi`) before its label, keeping 1:1 visual parity with `#sky-legend`, `#panel-languages`, and Road lane dots (`renderLaneDotsHtml`).
   - Matching languages always appear in canonical `sv` then `en` order (`fi · sv · en`). Non-matching siblings are omitted when the other sibling matches (no noisy `"Not in Swedish"` line).
3. **Reuse of Spec 013's left-rule `Literata` quote pattern for verbatim passages:**
   - Each matching sibling excerpt uses `<blockquote class="compare-passage-quote">` (`2px solid var(--border)` left rule, upright `var(--font-serif)` `0.8125rem`, `var(--frost)`) with `lang="sv"` or `lang="en"` on `<span class="compare-passage-text">`—matching `.fact-source-quote` in `docs/design/013-i18n.md` so judges immediately recognize *left-rule serif quote = verbatim original-language Wikipedia text*.
   - Below each quote, a quiet footer shows the sibling section name (or `Lead section` / `Johdanto` / `Inledning` when `section === null`) and an underlined external link (`target="_blank" rel="noopener noreferrer"`) styled like `.oldid-anchor`. Raw cosine `distance` is hidden from visible UI (no telemetry clutter).
4. **Quiet, non-alarming `"Only in Finnish Wikipedia"` with an honest inline caveat:**
   - Styled in `var(--frost)` with `dot-fi` (`--snow`), zero alert box, zero background tint, and never `--lingon`.
   - On the focused card only, a single muted sub-line directly beneath explains that no similar passage was found in the compared edition(s) (`compare.onlyFiHint*`), so touch/mobile users and screenshots see the similarity caveat without needing hover.
5. **Silent loading / failure / missing-sibling degradation:**
   - While `/api/compare` is still in flight, if it fails, if `article.lang !== "fi"`, or if `siblings.sv === null && siblings.en === null`, render **nothing** (no spinner, no placeholder, no layout shift inside Summarize).

---

## 2. Design Tokens & Typography Reused

All tokens already exist in `:root` in `src/styles.css` (zero new colors, fonts, shadows, or dependencies):

| Token | Value | Usage in Spec 017 UI |
| :--- | :--- | :--- |
| `--snow` | `#EEF2F6` | `.dot-fi` fill (`8px`), `.compare-match-label` text, link `:hover` / `:focus-visible` |
| `--birch` | `#D9B872` | `.dot-sv` fill (`8px`) on Swedish match lines and compact trail strip |
| `--lichen` | `#8FC3B7` | `.dot-en` fill (`8px`) on English match lines and compact trail strip |
| `--frost` | `#8A9BB3` | `.compare-passage-text`, `.compare-match-section`, `.compare-match-link`, `.compare-only-fi-label`, `.compare-compact-label`; `rgba(138, 155, 179, 0.85)` for `.compare-only-fi-hint` |
| `--border` | `#2A3B5C` | `1px` top hairline separating `.compare-presence` from card summary prose; `2px` left rule on `.compare-passage-quote` |
| `--lingon` | `#D43F55` | **Forbidden** in compare UI |
| `--font-ui` | `"Hanken Grotesk", ...` | Match headers (`0.8125rem`, `600`), `"Only in Finnish Wikipedia"` (`0.8125rem`, `400`), compact strip (`0.75rem`, `400`), section cue, link, and hint (`0.75rem`, `400`) |
| `--font-serif` | `"Literata", Georgia, serif` | Verbatim sibling `passage` quote (`0.8125rem`, upright `400`, `line-height: 1.5`) |

Editorial rules from `001-kaamos-sky.md` preserved: sentence case everywhere, zero ALL-CAPS eyebrows, zero `A · B · C` middots, zero `→` arrows, flat unboxed layout (`box-shadow: none`, no background boxes inside cards).

---

## 3. Component Specifications & Static HTML/CSS Mocks

### 3.1 Presence Row Placement & Height Budget (`720 px` Viewport)

- **Focused section card anatomy (`.summary-trail-card.is-focused`, `460px` wide, `padding: 20px 22px`):**
  1. `.summary-trail-kicker`
  2. `<h3 class="summary-trail-title">`
  3. `.mt-label` or `.i18n-fallback-note` (when applicable)
  4. `<p class="summary-trail-oneline">`
  5. `<p class="summary-trail-summary">` (`extraSummary`)
  6. `.facts-source-list` (when translated `sec.facts` exist)
  7. **`.compare-presence` (NEW — section cards only)**
  8. `.summary-card-actions` (`.summary-readmore-btn`)
  9. `.summary-readmore-body` (when `readMoreOpen`)
- **720 px viewport budget check:**
  - `.summary-trail-card.is-focused` has `max-height: calc(100vh - 148px)` (`572px` at `720px` height -> `532px` inner vertical budget after `40px` vertical padding), with existing `overflow-y: auto; overscroll-behavior: contain;`.
  - Without `sec.facts` and with `Read more` closed, a `sv+en` match with two full 240-char passages measures ~`465px` total inner height (`~230px` summary top + `~190px` compare block + `~44px` action row), fitting above the fold at `720px` without scrolling. When `sec.facts` or `Read more` are also present, the existing card scroll handles overflow safely between top HUD (`70px`) and bottom bar (`66px`).
- **CSS3D trail card anatomy:**
  - `.summary-css3d-card.is-next-1` / `.is-next-2` (`390px` wide): render `.compare-presence.is-compact` below `.summary-trail-oneline` (no passage, no link, no secondary hint).
  - `.summary-css3d-card.is-far` (`280px` wide): unchanged — renders only `<h3 class="summary-trail-title">`.

```html
<!-- Static Mock 1: Focused Section Card placement (both sv and en match) -->
<article class="summary-trail-card is-focused" data-summary-index="1">
  <div class="summary-trail-kicker">...</div>
  <h3 class="summary-trail-title">Tausta</h3>
  <div class="mt-label">Machine-translated from Finnish</div>
  <p class="summary-trail-oneline">...</p>
  <p class="summary-trail-summary">...</p>
  <!-- .facts-source-list if present -->

  <section class="compare-presence" aria-label="Coverage in other Wikipedia editions">
    <div class="compare-match-list">
      <div class="compare-match-item">...</div>
      <div class="compare-match-item">...</div>
    </div>
  </section>

  <div class="summary-card-actions">
    <button type="button" class="summary-readmore-btn" aria-expanded="false">Read more</button>
  </div>
</article>

<!-- Static Mock 1b: Near CSS3D Trail Card (.is-next-1 / .is-next-2) compact placement -->
<article class="summary-trail-card summary-css3d-card is-next-1" data-summary-index="2">
  <div class="summary-trail-kicker">...</div>
  <h3 class="summary-trail-title">Moskovan rauha</h3>
  <div class="mt-label">Machine-translated from Finnish</div>
  <p class="summary-trail-oneline">...</p>

  <div class="compare-presence is-compact">
    <div class="compare-compact-row">
      <span class="compare-compact-item">
        <span class="dot dot-sv" aria-hidden="true"></span>
        <span class="compare-compact-label">Also in Swedish</span>
      </span>
      <span class="compare-compact-item">
        <span class="dot dot-en" aria-hidden="true"></span>
        <span class="compare-compact-label">Also in English</span>
      </span>
    </div>
  </div>
</article>
```

```css
.compare-presence {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--border);
  font-family: var(--font-ui);
}

.compare-presence.is-compact {
  margin-top: 10px;
  padding-top: 8px;
}

.summary-css3d-card.is-far .compare-presence {
  display: none;
}
```

---

### 3.2 Language Dots

- **Rule:** Dots in `.compare-presence` carry the same article-edition semantics as galaxy stars and `#sky-legend`:
  - `.dot.dot-sv` (`--birch` `#D9B872`) -> Swedish Wikipedia match (`sv.match === true`)
  - `.dot.dot-en` (`--lichen` `#8FC3B7`) -> English Wikipedia match (`en.match === true`)
  - `.dot.dot-fi` (`--snow` `#EEF2F6`) -> Finnish-only verdict (`hasAnySibling && comparedNonMatch && matchedLangs.length === 0`)
- **Placement:** `8px × 8px` dot (`aria-hidden="true"`) placed immediately before each `"Also in …"` header label, before `"Only in Finnish Wikipedia"`, and before each compact trail label.

```html
<!-- Static Mock 2: Language dots across match, compact, and Finnish-only lines -->
<div class="compare-match-head">
  <span class="dot dot-sv" aria-hidden="true"></span>
  <span class="compare-match-label">Also in Swedish Wikipedia</span>
</div>

<div class="compare-match-head">
  <span class="dot dot-en" aria-hidden="true"></span>
  <span class="compare-match-label">Also in English Wikipedia</span>
</div>

<div class="compare-only-fi-row">
  <span class="dot dot-fi" aria-hidden="true"></span>
  <span class="compare-only-fi-label">Only in Finnish Wikipedia</span>
</div>
```

```css
/* Reuses .dot, .dot-fi, .dot-sv, .dot-en from src/styles.css (8px, border-radius: 50%, flex-shrink: 0) */
.compare-match-head,
.compare-only-fi-row,
.compare-compact-item {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}

.compare-compact-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px 12px;
}

.compare-compact-label {
  font-family: var(--font-ui);
  font-size: 0.75rem;
  font-weight: 400;
  line-height: 1.35;
  color: var(--frost);
}
```

---

### 3.3 Matching Passage & Link (`sv` / `en`)

- **Passage styling:** `<blockquote class="compare-passage-quote">` mirrors `.fact-source-quote` (`2px solid var(--border)` left rule, `padding-left: 9px`, upright `var(--font-serif)` `0.8125rem`, `line-height: 1.5`, `color: var(--frost)`). Wrap the verbatim `passage` (already `<= 240` chars from `/api/compare`) inside `<span class="compare-passage-text" lang="sv">` or `lang="en"`. Do not CSS-truncate on the focused card.
- **Sibling section name & link:**
  - Placed in `.compare-match-footer` directly beneath `.compare-passage-quote`, indented `padding-left: 11px` to align cleanly with the quote text.
  - When `secCompare[lang].section` is a string: `<span class="compare-match-section">Section: <span lang="${sibLang}">${section}</span></span>` followed by `<a class="compare-match-link" href="${url}" target="_blank" rel="noopener noreferrer">Read in Swedish Wikipedia</a>`.
  - When `secCompare[lang].section === null` (intro/lead chunk match): `<span class="compare-match-section">Lead section</span>` followed by the same external link (`url` without `#anchor`).
  - `distance` is never rendered as visible text.
  - Link uses `escapeHtml(url)` and `rel="noopener noreferrer"` and inherits global `a:focus-visible` (`2px solid var(--snow)`).

```html
<!-- Static Mock 3: Matching passage + section link (named section in sv, lead in en) -->
<div class="compare-match-list">
  <div class="compare-match-item">
    <div class="compare-match-head">
      <span class="dot dot-sv" aria-hidden="true"></span>
      <span class="compare-match-label">Also in Swedish Wikipedia</span>
    </div>
    <blockquote class="compare-passage-quote">
      <span class="compare-passage-text" lang="sv">Finland hade varit en del av det ryska kejsardömet sedan 1809…</span>
    </blockquote>
    <div class="compare-match-footer">
      <span class="compare-match-section">Section: <span lang="sv">Bakgrund</span></span>
      <a class="compare-match-link" href="https://sv.wikipedia.org/wiki/Vinterkriget#Bakgrund" target="_blank" rel="noopener noreferrer">Read in Swedish Wikipedia</a>
    </div>
  </div>

  <div class="compare-match-item">
    <div class="compare-match-head">
      <span class="dot dot-en" aria-hidden="true"></span>
      <span class="compare-match-label">Also in English Wikipedia</span>
    </div>
    <blockquote class="compare-passage-quote">
      <span class="compare-passage-text" lang="en">The Winter War began with a Soviet invasion on 30 November 1939…</span>
    </blockquote>
    <div class="compare-match-footer">
      <span class="compare-match-section">Lead section</span>
      <a class="compare-match-link" href="https://en.wikipedia.org/wiki/Winter_War" target="_blank" rel="noopener noreferrer">Read in English Wikipedia</a>
    </div>
  </div>
</div>
```

```css
.compare-match-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.compare-match-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.compare-match-label {
  font-family: var(--font-ui);
  font-size: 0.8125rem;
  font-weight: 600;
  line-height: 1.35;
  color: var(--snow);
}

.compare-passage-quote {
  margin: 0;
  padding-left: 9px;
  border-left: 2px solid var(--border);
  font-family: var(--font-serif);
  font-size: 0.8125rem;
  font-weight: 400;
  line-height: 1.5;
  color: var(--frost);
  overflow-wrap: anywhere;
}

.compare-match-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 3px 10px;
  padding-left: 11px;
  font-family: var(--font-ui);
  font-size: 0.75rem;
  line-height: 1.4;
}

.compare-match-section {
  color: var(--frost);
}

.compare-match-link {
  color: var(--frost);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.compare-match-link:hover {
  color: var(--snow);
}
```

---

### 3.4 `"Only in Finnish Wikipedia"` (Quiet State + Secondary Hint)

- **Trigger:** Rendered only when `hasAnySibling` (`Boolean(siblings?.sv || siblings?.en)`), no sibling matched (`matchedLangs.length === 0`), and at least one existing sibling was actually compared (`siblings[l] && secCompare[l]?.match === false`).
- **Look:** Unboxed, single-line `.compare-only-fi-row` in `var(--frost)` (`0.8125rem`, `400` weight) with `.dot-fi`, plus `.compare-only-fi-hint` (`0.75rem`, `rgba(138, 155, 179, 0.85)`, aligned via `padding-left: 15px`) on focused cards only. Near CSS3D cards show only the compact `.compare-compact-row` with `.dot-fi` + `"Only in Finnish"`.

```html
<!-- Static Mock 4: Focused card "Only in Finnish Wikipedia" state -->
<section class="compare-presence" aria-label="Coverage in other Wikipedia editions">
  <div class="compare-only-fi">
    <div class="compare-only-fi-row">
      <span class="dot dot-fi" aria-hidden="true"></span>
      <span class="compare-only-fi-label">Only in Finnish Wikipedia</span>
    </div>
    <p class="compare-only-fi-hint">No similar passage found in Swedish or English Wikipedia</p>
  </div>
</section>
```

```css
.compare-only-fi {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.compare-only-fi-label {
  font-family: var(--font-ui);
  font-size: 0.8125rem;
  font-weight: 400;
  line-height: 1.35;
  color: var(--frost);
}

.compare-only-fi-hint {
  margin: 0;
  padding-left: 15px;
  font-family: var(--font-ui);
  font-size: 0.75rem;
  font-weight: 400;
  line-height: 1.4;
  color: rgba(138, 155, 179, 0.85);
}
```

---

### 3.5 Complete Wording Table (`fi` / `sv` / `en`) & Absent/Loading States

All keys below must be added identically to `STRINGS.en`, `STRINGS.fi`, and `STRINGS.sv` in `src/i18n.js` (so `src/i18n.test.js` passes).

| Key | `en` | `fi` | `sv` |
| :--- | :--- | :--- | :--- |
| `compare.alsoIn.sv` | `Also in Swedish Wikipedia` | `Myös ruotsinkielisessä Wikipediassa` | `Även i svenskspråkiga Wikipedia` |
| `compare.alsoIn.en` | `Also in English Wikipedia` | `Myös englanninkielisessä Wikipediassa` | `Även i engelskspråkiga Wikipedia` |
| `compare.onlyFi` | `Only in Finnish Wikipedia` | `Vain suomenkielisessä Wikipediassa` | `Bara i finskspråkiga Wikipedia` |
| `compare.compact.sv` | `Also in Swedish` | `Myös ruotsiksi` | `Även på svenska` |
| `compare.compact.en` | `Also in English` | `Myös englanniksi` | `Även på engelska` |
| `compare.compact.onlyFi` | `Only in Finnish` | `Vain suomeksi` | `Bara på finska` |
| `compare.onlyFiHintBoth` | `No similar passage found in Swedish or English Wikipedia` | `Samankaltaista kohtaa ei löytynyt ruotsin- tai englanninkielisestä Wikipediasta` | `Ingen liknande text hittades i svensk- eller engelskspråkiga Wikipedia` |
| `compare.onlyFiHintSv` | `No similar passage found in Swedish Wikipedia` | `Samankaltaista kohtaa ei löytynyt ruotsinkielisestä Wikipediasta` | `Ingen liknande text hittades i svenskspråkiga Wikipedia` |
| `compare.onlyFiHintEn` | `No similar passage found in English Wikipedia` | `Samankaltaista kohtaa ei löytynyt englanninkielisestä Wikipediasta` | `Ingen liknande text hittades i engelskspråkiga Wikipedia` |
| `compare.sectionPrefix` | `Section:` | `Osio:` | `Avsnitt:` |
| `compare.leadLabel` | `Lead section` | `Johdanto` | `Inledning` |
| `compare.readIn.sv` | `Read in Swedish Wikipedia` | `Lue ruotsinkielisessä Wikipediassa` | `Läs på svenskspråkiga Wikipedia` |
| `compare.readIn.en` | `Read in English Wikipedia` | `Lue englanninkielisessä Wikipediassa` | `Läs på engelskspråkiga Wikipedia` |

- **Loading / absent / error / no-sibling / overview / ghost states (render nothing):**

```html
<!-- Static Mock 5: Loading, failed, non-fi, no-sibling, overview, ghost, or uncompared section -->
<!-- Render empty string: no .compare-presence element emitted in the DOM -->
```

- **Hint selection rule (`compare.onlyFiHint*`):**
  - `siblings.sv && siblings.en` -> `compare.onlyFiHintBoth`
  - `siblings.sv && !siblings.en` -> `compare.onlyFiHintSv`
  - `!siblings.sv && siblings.en` -> `compare.onlyFiHintEn`
- **Passages stay verbatim** in their original Wikipedia language (`lang="sv"` or `lang="en"`), never translated when the UI switches language.

---

### 3.6 Narrow Widths (`< 900 px` / `390 px` Viewport, `340 px` Cards)

At `@media (max-width: 900px)`, `src/styles.css` already sets `.summary-trail-card { width: 340px; padding: 16px 16px; }`, giving **`308px` inner content width** (and `297px` quote width inside the `2px + 9px` left rule).

- `"Myös ruotsinkielisessä Wikipediassa"` (`~220px`) + `8px` dot + `7px` gap = `235px` <= `308px` (fits on 1 line; wraps gracefully if zoomed).
- `"Osio: Bakgrund"` + `"Lue ruotsinkielisessä Wikipediassa"` wraps cleanly onto 2 lines via `flex-wrap: wrap` with `gap: 3px 10px` and `padding-left: 11px`.
- Compact strip on `340px` near cards: `"Myös ruotsiksi"` (`~105px`) + `"Myös englanniksi"` (`~115px`) + dots/gaps = `~232px` <= `308px` (single row, or clean wrap on very narrow `<= 360px` viewports).

```html
<!-- Static Mock 6: 340px mobile card (fi UI, 390px viewport, sv+en match) -->
<article class="summary-trail-card is-focused" data-summary-index="1">
  <div class="summary-trail-kicker">...</div>
  <h3 class="summary-trail-title">Tausta</h3>
  <p class="summary-trail-oneline">...</p>
  <p class="summary-trail-summary">...</p>

  <section class="compare-presence" aria-label="Coverage in other Wikipedia editions">
    <div class="compare-match-list">
      <div class="compare-match-item">
        <div class="compare-match-head">
          <span class="dot dot-sv" aria-hidden="true"></span>
          <span class="compare-match-label">Myös ruotsinkielisessä Wikipediassa</span>
        </div>
        <blockquote class="compare-passage-quote">
          <span class="compare-passage-text" lang="sv">Finland hade varit en del av det ryska kejsardömet sedan 1809…</span>
        </blockquote>
        <div class="compare-match-footer">
          <span class="compare-match-section">Osio: <span lang="sv">Bakgrund</span></span>
          <a class="compare-match-link" href="https://sv.wikipedia.org/wiki/Vinterkriget#Bakgrund" target="_blank" rel="noopener noreferrer">Lue ruotsinkielisessä Wikipediassa</a>
        </div>
      </div>
    </div>
  </section>

  <div class="summary-card-actions">
    <button type="button" class="summary-readmore-btn" aria-expanded="false">Lue lisää</button>
  </div>
</article>
```

```css
@media (max-width: 900px) {
  .compare-presence {
    margin-top: 10px;
    padding-top: 8px;
  }

  .compare-match-list {
    gap: 8px;
  }

  .compare-match-head,
  .compare-only-fi-row {
    align-items: flex-start;
  }

  .compare-match-head .dot,
  .compare-only-fi-row .dot {
    margin-top: 5px;
  }
}
```

---

## 4. Interaction, Integration & Accessibility Notes for Hydrogen

1. **Parallel fetch & non-blocking attachment (`src/main.js`, `src/ui.js`):**
   - In `enterSummaryTrail`, when `lang === "fi"`, start `getCompare("fi", page_id)` alongside `getSummary(lang, page_id, uiLang)` under the same `summaryLoadSeq` guard.
   - Open Summarize as soon as `getSummary` resolves; never await a slow `getCompare` before rendering the trail.
   - When `getCompare` resolves (and `seq === summaryLoadSeq`), attach matching sections by `sec.no` (skipping any section where `compareSec.heading !== sec.heading`) onto `activeSummaryState`, then re-render the focused card and near CSS3D cards **in place** (preserving `focusIdx` and `readMoreOpen`, without re-running `sceneCtrl.enterSummaryTrail`).
   - If `getCompare` rejects, log at most one `console.warn` and leave Summarize without `.compare-presence`.
2. **Semantic HTML & keyboard focus:**
   - External links use `<a href="..." target="_blank" rel="noopener noreferrer">` and inherit `a:focus-visible` (`2px solid var(--snow)`).
   - Keep `lang="sv"` / `lang="en"` strictly on `<span class="compare-passage-text">` and the inline sibling section `<span lang="...">`, keeping UI labels (`Also in…`, `Section:`, `Read in…`) in the active UI language (`document.documentElement.lang`).
   - Escape `passage`, `section`, and `url` through `escapeHtml()` before HTML insertion.
3. **Stable hooks for Playwright verification (`01-match-fi.png` .. `07-narrow-fi.png`):**
   - `.compare-presence`, `.compare-presence.is-compact`, `.compare-match-item`, `.compare-passage-text[lang="sv"]`, `.compare-passage-text[lang="en"]`, `.compare-match-link`, `.compare-only-fi`.

---

## 5. Files Changed & Assumptions

- **Changed by Argon:** `docs/design/017-cross-language-compare.md` (this file only).
- **Assumptions for Hydrogen:**
  - `compareData` may arrive before `getSummary` resolves (attach before `ui.openSummaryTrail`) or after (update via a dedicated `ui.attachSummaryCompare(compareData)` helper without disturbing camera or `focusIdx`).
  - Existing `aria-label` on `<section class="compare-presence">` stays simple English (`"Coverage in other Wikipedia editions"`), consistent with Spec 013's boundary on static `aria-label` strings.
