# seminar-doc-builder-0603

## Trigger

Use this skill when the user asks to create **seminar planning and guidance documents** — for example:
- "〇〇のセミナーの企画と案内資料を作成して"
- "セミナーの企画書と案内ページを作って"
- "〇〇セミナーの運営資料を作成して"

Do NOT trigger for: slide decks, presentation materials, lecture notes, workshop handouts, event flyers alone, or any request that does not explicitly involve both a kikakusho (planning document) and annai (participant guide).

## What this skill does

Given a seminar theme, generate two self-contained HTML files:

1. `kikakusho.html` — internal planning document (企画書)
2. `annai.html` — participant-facing landing page (案内ページ)

---

## Design System (apply to both files)

| Token | Value |
|---|---|
| Base color | `#16365C` (navy) |
| Accent color | `#F4A300` (amber) |
| Background | `#FBF8F1` (off-white) |
| Border radius | 16px |
| Shadow | `0 2px 12px rgba(0,0,0,.08)` |
| Font | `"Hiragino Kaku Gothic ProN", "Meiryo", sans-serif` |

- Each section heading has a **numbered round badge** (amber circle, white digit) on the left.
- Cards: white background, 16px radius, light shadow.
- Footer signature: `Produced with Claude Code ✦ 主催：（架空の主催者名）`
- No external CSS/JS/CDN/image URLs. All CSS inside `<style>`. Works by double-click in browser.
- Prices formatted as `1,500円` (comma + 円).

---

## kikakusho.html — Structure (7 blocks in order)

1. **Title + one-line catchcopy** — navy header card with amber badge label "社内企画書"
2. **開催概要** — 2-column table: item (140px) / value
   - 開催日時 / 形式 / 定員 / 参加費 / 対象
3. **背景・なぜ今やるのか** — 2–3 sentences of context
4. **受講後のゴール** — BEFORE → AFTER layout
   - Left card (blue-grey bg): BEFORE bullet list
   - Center: large amber arrow `→`
   - Right card (green bg): AFTER bullet list
5. **プログラム** — 3-column table: 時刻 / 内容 / 所要時間
6. **こんな方におすすめ** — checklist (✔ amber) with 3 items
7. **持ち物・注意事項** — list with ▶ navy marker

---

## annai.html — Structure

### 1. Hero section
- Background: `linear-gradient(135deg, #16365C 60%, #F4A300 100%)`
- Centered: tag badge → h1 (theme title, key phrase in amber `<em>`) → date/time line → CTA button (amber, pill-shaped)

### 2. "3つのポイント" — 3 horizontal cards
- Each card: emoji (large), bold heading, short description
- `display: flex; gap: 20px; flex-wrap: wrap;`

### 3. FAQ — 3 Q&A items
- Each item: amber round "Q" badge + question (bold navy) + answer text below
- Outer card: `background: #FBF8F1`, inner answer indented past badge

### 4. CTA closing section
- Navy background, centered h2 + summary text + CTA button

---

## Instructions for generating new files

1. Read the user's theme and infer natural sample values (date ~3 months ahead, price 1,000–3,000円, capacity 30–100, etc.).
2. Tailor all content (program steps, BEFORE/AFTER items, FAQ, point cards, emojis) to the theme.
3. Keep the design tokens and structural order exactly as specified above.
4. Write both HTML files to the current working directory.
5. After writing, report: file names created, theme used, and sample values chosen.
