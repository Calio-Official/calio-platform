# C.A.L.I.O — SEC Filing Companion

**Compliance Analytics Layer for Insurance Operations**

Chrome MV3 extension for public SEC EDGAR: company desk, form-aware extract, compare, Excel & PDF export, extract history, and watchlist.

## Version

**1.13.0** — launch-quality MVP (form QA, store package, reliability, collapsible sidebar)

## Install (developer)

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → this folder
4. Click the extension icon or **Open C.A.L.I.O** on an EDGAR page
5. After code updates: **Reload** the extension, then hard-refresh open EDGAR tabs

## Core features

| Area | What you get |
|------|----------------|
| Dashboard | Company info, balanced timeline, filing tables by type |
| Extract | Form-aware packs (10-K/Q, 8-K, 3/4/5, 13D/G, 144) + quality badge |
| Compare | Two periods + multi-sheet Excel export |
| Exports | Multi-sheet `.xlsx` and print-ready PDF report |
| History | Last extracts on device; reopen without re-fetch |
| Watchlist | Local list + new-filing alerts (monitor alarm) |

## SEC fair access

| Control | Default |
|---------|---------|
| Min gap between SEC HTTP calls | ~250ms |
| Extracts per month (per profile) | 80 |
| Extracts per hour | 25 |
| Compare | costs 2 extract units |
| SEC request timeout | ~28s (clear error if EDGAR is slow) |

## Privacy & store

- In-extension policy: `privacy.html`
- **Store listing copy:** `STORE_LISTING.md` (SEO-optimized)
- **Launch checklist:** `LAUNCH_CHECKLIST.md`
- **CWS zip:** `dist/calio-1.13.0-cws.zip`
- **Marketing site + public privacy:** `marketing-site/` (host before submit)
- Filing text is not uploaded to C.A.L.I.O servers

## Preferences

**Preferences** in the app sidebar:

- Optional account email + product-update opt-in  
- Mail client for share  
- Usage counters  
- Clear local data  

## Security notes

- Message types allowlisted  
- SEC host allowlist for fetches / open tab  
- `credentials: "omit"` on SEC fetches  
- Optional email only after explicit save  

## Support after update

If you see **Extension context invalidated**, reload the extension and refresh the EDGAR tab. A reconnect banner appears on SEC pages when the content script is stale.
