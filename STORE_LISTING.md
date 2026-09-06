# C.A.L.I.O — Chrome Web Store listing (launch)

Paste these fields into the [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole).  
**Do not keyword-stuff.** Google bans spammy metadata.

---

## Store name (max 75 characters)

```
SEC EDGAR Filings Extract & Excel — CALIO
```

Character count: 42. Function-first for CWS search; brand second.

**Also set `manifest.json` `name` to the same string** (done for this release).

---

## Short description (max 132 characters)

```
Extract 10-K, 10-Q, 8-K, Form 4 & more from SEC EDGAR. Compare periods, export Excel/PDF, watchlist. Private, on-device.
```

Character count: ~118.

---

## Detailed description (paste as plain text; use line breaks)

```
CALIO is a Chrome extension for reading and extracting public SEC EDGAR filings. Open a company desk, pull structured fields from 10-K, 10-Q, 8-K, Form 3/4/5, 13D/G, Form 144 and more, compare periods, and export multi-sheet Excel or a print-ready PDF — with processing on your device.

Who it is for
• Equity researchers and value investors who live in EDGAR
• Analysts and students who need clean extracts without a heavy desktop stack
• Anyone who wants Form 4 / 8-K / ownership fields without retyping into spreadsheets

What you can do
• Search by ticker or company name and open an SEC-style company desk
• Browse recent 10-K / 10-Q, 8-K, ownership (13D/G), insider forms (3/4/5), proxies, and Form 144
• Company timeline of high-signal filings
• Open filings in the browser or use Open & extract for structured fields
• Form-aware extracts (financials, events, ownership, insider trades, Rule 144)
• Extract quality badge so you know when a pack looks incomplete
• Compare two periods and export results to Excel
• Multi-sheet Excel workbooks and print-ready PDF reports
• Extract history and a local company watchlist with new-filing alerts
• Usage limits that respect SEC fair-access guidance

Privacy
• Filing text is processed on your device
• We do not store filing contents on CALIO servers
• No account required for core extract, compare, or export
• Optional email only if you choose product updates

What CALIO is not
• Not investment advice
• Not a real-time trading terminal
• Not a substitute for reading the full filing when decisions matter

How to start
1. Install CALIO
2. Open the extension or go to sec.gov / EDGAR
3. Search a ticker, open a filing, run Open & extract
4. Export Excel or PDF when you need a sheet or report

Support: caliointel@gmail.com
Privacy policy: host the marketing-site/privacy.html URL (see LAUNCH_CHECKLIST.md)
```

---

## Category

**Primary:** Workflow & Planning  
**Fallback:** Tools  

(Avoid vague mismatches. Do not pick Games / Entertainment.)

---

## Language

English (United States)

---

## Single purpose (dashboard field)

```
Help users review public SEC EDGAR filings with local extraction, comparison, and Excel/PDF export.
```

---

## Privacy practices (dashboard)

Answer accurately:

| Question | Answer |
|----------|--------|
| Collects user data? | Yes — limited local storage (prefs, history, watchlist); optional email if user saves it |
| Remote code? | No |
| Sells data? | No |
| Used for purposes unrelated to single purpose? | No |
| Privacy policy URL | **Required** — public URL of marketing-site privacy page |
| Host permissions | sec.gov / data.sec.gov / efts.sec.gov only for public EDGAR |

Justify each permission briefly (store UI):

- **storage** — local prefs, extract history, watchlist  
- **tabs / windows / scripting** — open app and extract on EDGAR pages  
- **downloads** — Excel/PDF the user requests  
- **alarms / notifications** — optional watchlist monitoring  
- **Host permissions** — public SEC EDGAR HTTP only  

---

## Website & support

| Field | Value |
|-------|--------|
| Official website | Your hosted marketing site (e.g. `https://YOURDOMAIN/` or GitHub Pages) |
| Support URL | Same site `/support` or `mailto:caliointel@gmail.com` |
| Support email | `caliointel@gmail.com` (matches extension User-Agent contact) |

Update DNS/inbox if `caliointel@gmail.com` is not live yet — use a real inbox you check.

---

## Graphic assets (required)

See **`marketing-site/ASSETS_SPECS.md`** for pixel sizes and captions.

| Asset | Size | File suggestion |
|-------|------|-----------------|
| Store icon | 128×128 | `icons/icon128.png` (ready) |
| Small promo tile | 440×280 | Capture or design — see specs |
| Marquee (optional) | 1400×560 | For homepage carousel eligibility |
| Screenshots | 1280×800 or 640×400 | **5 real product shots** (required) |

---

## Manifest (already aligned)

- `name`: SEC EDGAR Filings Extract & Excel — CALIO  
- `description`: short SEO line  
- `version`: 1.13.0  

---

## Policy reminders

- No keyword spam / competitor brand lists  
- No fake “#1” or “Editor’s Choice” on images  
- No paid/fake reviews  
- Screenshots must show the real extension UI  
- Not financial advice — keep disclaimer  

---

## After publish

1. Install from store link yourself; run one full extract + Excel  
2. Ask beta users for honest reviews after they export once  
3. Submit Featured nomination (One Stop Support) after quality is solid  
4. Submit AlternativeTo / Product Hunt (see `LAUNCH_CHECKLIST.md`)  
