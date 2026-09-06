# Chrome Web Store graphic assets — CALIO

Official sizes: [developer.chrome.com/docs/webstore/images](https://developer.chrome.com/docs/webstore/images)

---

## 1. Store icon (required)

| Spec | Value |
|------|--------|
| Size | **128 × 128** PNG |
| File | `icons/icon128.png` (already in extension) |
| Notes | No screenshots inside icon; simple mark |

Upload the same 128px icon in the dashboard.

---

## 2. Screenshots (required — capture today)

| Spec | Value |
|------|--------|
| Count | **5** (max; use all five) |
| Size | **1280 × 800** preferred (or 640 × 400) |
| Format | PNG or JPEG, full bleed, no padding |
| Rule | Must show **real** CALIO UI (policy) |

### Capture workflow (15 minutes)

1. Load unpacked CALIO in Chrome.
2. Open a well-known ticker (e.g. AAPL or MSFT) in the company desk.
3. Use full-screen window; macOS: `Cmd+Shift+4` then drag, or CleanShot/Shottr at 1280×800.
4. Prefer dark teal UI with readable labels; avoid empty error states.

### Screenshot plan + on-image captions (short)

| # | Scene | On-image caption (optional, max ~6 words) | Alt text for store |
|---|--------|---------------------------------------------|--------------------|
| 1 | Company desk: search + company info + timeline | `Company desk & filing timeline` | CALIO company dashboard with SEC filing timeline |
| 2 | 10-Q or 10-K extract with quality badge | `Form-aware 10-Q extract` | Extracted financial fields from a 10-Q filing |
| 3 | Form 4 extract (insider fields only) | `Form 4 insider extract` | Form 4 reporting owner and transaction table |
| 4 | Compare two periods + Excel button visible | `Compare periods → Excel` | Side-by-side period compare with export |
| 5 | Watchlist + extract history sidebar | `Local history & watchlist` | Sidebar with extract history and company watchlist |

**Do not** put “#1”, “Best”, or fake badges on screenshots.

Save as:

```
marketing-site/assets/screenshots/
  01-company-desk.png
  02-extract-10q.png
  03-form4.png
  04-compare-excel.png
  05-watchlist-history.png
```

---

## 3. Small promo tile (required for good search UI)

| Spec | Value |
|------|--------|
| Size | **440 × 280** PNG |
| Appears | Homepage, category, **search results** |

### Design brief

- Background: deep navy `#0b1220` → teal glow `#14b8a6`
- Large wordmark: **CALIO**
- Subline: **SEC EDGAR → Excel**
- Small icons or simple shapes: document + spreadsheet (not cluttered)
- No fake “Featured” badge
- Must stay legible when shrunk

### Text on tile

```
CALIO
SEC EDGAR → Excel
Extract · Compare · Export
```

File: `marketing-site/assets/promo-tile-440x280.png`

---

## 4. Marquee (optional but recommended)

| Spec | Value |
|------|--------|
| Size | **1400 × 560** PNG |
| Use | Chrome Web Store homepage carousel if merchandised |

### Design brief

- Left: headline **Extract SEC filings. Export Excel.**
- Right: simplified product mock (desk or extract panel)
- Brand colors consistent with promo tile
- Little text; high contrast

File: `marketing-site/assets/marquee-1400x560.png`

---

## 5. YouTube / listing video (optional)

| Spec | Value |
|------|--------|
| Length | 30–60 seconds |
| Content | Silent or soft: search ticker → extract → Excel |
| Host | YouTube unlisted OK; paste URL in listing |

---

## Checklist before upload

- [ ] 128 icon  
- [ ] 5 screenshots, real UI  
- [ ] 440×280 promo tile  
- [ ] Marquee optional  
- [ ] No competitor logos  
- [ ] No keyword walls of text on images  
