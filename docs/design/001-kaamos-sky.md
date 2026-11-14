# Design Plan: wikimemory ("Kaamos Sky")

## 1. Visual Direction & Anti-Template Audit
**Concept**: *Kaamos* — the Finnish polar night. Instead of generic sci-fi "outer space" (pure `#000000` void, neon cyan UI chrome, glassmorphism blur cards, and uppercase sci-fi telemetry labels), `wikimemory` renders the 29,460 articles of Finnish history as a calm winter night sky over Finland, lifting into a twilight horizon (`#1C2E4D`) at the bottom edge where time is scrubbed.

**What we changed from generic 3D templates & why**:
- **Replaced standard browser `<input type="range">` with an integrated Horizon Chronicle Scrubber**: A default range slider looks like a settings form control. Instead, the bottom 124px horizon band fuses a 288-month edit-volume histogram (2003–2026), a custom tactile scrubber track with year ticks, and oversized **Literata** tabular numerals (`2003`–`2026`) that anchor the entire viewport.
- **No decorative colors, badges, or shadows**: Every color carries strict semantic meaning—language (`--snow` Finnish, `--birch` Swedish, `--lichen` English) or edit war (`--lingon` red). Panels use flat `--panel` (`#16243F`) with a `1px solid #2A3B5C` border and zero `box-shadow`.
- **Restrained editorial typography**: Sentence case everywhere. No `ALL-CAPS` eyebrow headers, no `A · B · C` metadata strings, no `→` arrows on buttons, and no monospace telemetry labels.

## 2. Design Tokens
Defined as CSS custom properties in `:root` and mirrored as exact hex constants in `src/scene.js`:

| Token | Value | Semantic Role |
| :--- | :--- | :--- |
| `--kaamos` | `#101C33` | Sky background (upper 72% of viewport, never pure black) |
| `--horizon` | `#1C2E4D` | Soft atmospheric lift at bottom edge behind the time slider |
| `--snow` | `#EEF2F6` | Finnish articles (`fi`, ~65% of stars), primary text, active focus ring |
| `--birch` | `#D9B872` | Swedish articles (`sv`, ~17% of stars) |
| `--lichen` | `#8FC3B7` | English articles (`en`, ~18% of stars) |
| `--lingon` | `#D43F55` | Edit wars only (lingonberry red; pulsing halo or static ring in reduced-motion) |
| `--frost` | `#8A9BB3` | Secondary text, inactive histogram bars, subtle tick marks |
| `--panel` | `#16243F` | Article panel & search surface (`1px solid #2A3B5C` border, no shadows) |

## 3. Typography
- **Literata** (`400`, `600`, Google Fonts with Latin Extended `ä ö å`):
  - Time slider year numeral: `3.25rem` (`52px`), weight `600`, `font-variant-numeric: tabular-nums`, `line-height: 1`.
  - Article panel title: `1.5rem` (`24px`), weight `600`, `line-height: 1.25`.
  - Article body copy: `1rem` (`16px`), weight `400`, `line-height: 1.6`, constrained to `max-width: 68ch`.
- **Hanken Grotesk** (`400`, `600`, Google Fonts with Latin Extended `ä ö å`):
  - Wordmark `wikimemory`: `1.1875rem` (`19px`), weight `600`, letter-spacing `-0.015em`.
  - Search input, buttons (`Search`, `Close`, `Read on Wikipedia`), legend items, and hover/search star labels: `0.875rem`–`0.9375rem` (`14px`–`15px`), weights `400` and `600`.

## 4. Layout & Interactive States
1. **Top-left bar (`28px` from left, `24px` from top)**:
   - Left-aligned wordmark `wikimemory` beside the search form (`Ask about the history of Finland…`, submit button `Search`).
   - Empty state message directly beneath when a query has no matches: `"No articles match. Try a place, a person or a year."`
2. **Right article panel (`420px` wide, `28px` from right)**:
   - Closed by default; opens on star click.
   - Displays title, `Close` button, available language versions (`fi` / `sv` / `en` colored dots + full language names), edit-war alert banner (when applicable in `--lingon`), historical article excerpt for the selected year, and `Read on Wikipedia` link.
   - Below `1280px` width, converts cleanly into a bottom sheet above the time slider.
3. **Bottom-left legend**:
   - Quiet 4-item key (`Finnish`, `Swedish`, `English`, `Edit war`) with `8px` colored dots.
4. **Bottom signature Time Slider (`2003–2026`)**:
   - 288-bar monthly edit histogram (peaking in 2005–2008) sitting immediately above the 2003–2026 scrubber line.
   - Draggable handle (`◉`) + keyboard navigation (`ArrowLeft` / `ArrowRight` steps 1 year per press, `Home` / `End` jumps to 2003 / 2026) with high-contrast `:focus-visible` ring.
   - Large Literata year display that counts up during the 4-second intro (`2003 → 2026`) as stars ignite by `first_edit_year`.
