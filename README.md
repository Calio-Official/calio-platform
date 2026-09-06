# CALIO — Institutional SEC EDGAR Research Terminal & Financial Extractor

**Compliance Analytics Layer for Insurance Operations**

Chrome MV3 extension & browser workstation for public U.S. SEC EDGAR: structured filing extraction, interactive 5-Year DCF valuation, 25-sector peer comp matrices, forensic accounting scores, multi-sheet Excel export, and automated watchlist monitoring.

---

## Current Version

**1.16.0** — Production release with 3-tier payment architecture, interactive DCF sliders, 25-sector peer benchmarks, forensic accounting suite (Beneish M-Score, Altman Z-Score, Piotroski F-Score, Sloan Accruals), rate-limit upgrade modals, and direct Chrome Web Store review integration.

* **Chrome Web Store Listing:** [SEC EDGAR Filings Extract & Excel — CALIO](https://chromewebstore.google.com/detail/sec-edgar-filings-extract/mjlmlhdhcdlohompclddmcnpgdhjgeja)
* **Official Extension ID:** `mjlmlhdhcdlohompclddmcnpgdhjgeja`
* **Release Zip Package:** `dist/calio-1.16.0-cws.zip`

---

## Core Capabilities & Valuation Engines

| Engine | Description | Supported Forms |
| :--- | :--- | :--- |
| **Structured Filing Extraction** | Direct parsing of balance sheets, income statements, cash flows, and operating ratios into memory. | 10-K, 10-Q, 20-F |
| **Corporate Governance & Proxies** | Executive compensation tables (Salary, Stock Awards, Option Grants, Non-Equity Incentives), CEO Pay Ratio, and Say-on-Pay approvals. | DEF 14A |
| **Insider Transactions & Ownership** | Real-time insider trades, executive option exercises, open-market buys/sells, direct vs. indirect holdings, and institutional beneficial ownership stakes. | Form 3, 4, 5, 13D, 13G, 144 |
| **Material Events & Releases** | Material corporate events, earnings releases, executive departures, and credit agreements. | 8-K |
| **Interactive 5-Year DCF Model** | Automated Free Cash Flow to Firm (FCFF) discounted cash flow model with dynamic revenue growth, EBIT margin, WACC, and terminal growth sliders calculating implied intrinsic share price. | 10-K, 10-Q |
| **25-Sector Peer Benchmarking** | Side-by-side matrices comparing margins, EV/EBITDA, P/E, and debt-to-equity ratios across 25 industry sectors, with custom ticker additions. | All SEC Registrants |
| **Forensic Health & QoE Suite** | Computes Beneish M-Score (8 variables), Altman Z-Score (5 ratios), Piotroski F-Score (9 points), and Sloan Accrual anomaly spread. | 10-K, 10-Q |
| **Multi-Sheet Excel Export** | Multi-tab `.xlsx` models with audit timestamps, dynamic `=CALIO()` formula bridges, and verified click-to-source SEC hyperlinks. | All Filings |

---

## Membership & Payment Tiers

CALIO features built-in contextual tier management and quota monitoring:

| Tier | Price | Monthly Limit | Hourly Pace Limit | Advanced Features |
| :--- | :--- | :--- | :--- | :--- |
| **Free Starter** | **$0 / mo** | 80 extracts / mo | 25 extracts / hr | Core 10-K/Q, Form 4, basic DCF, top 5 sector peers, CSV & basic export |
| **Pro Analyst** | **$35 / mo** | 500 extracts / mo | 100 extracts / hr | All filings + DEF 14A/13D/G, interactive DCF sliders, all 25 sectors, Beneish M-Score, multi-sheet Excel models |
| **Institutional Desk** | **$55 / mo** | 2,500 extracts / mo | 300 extracts / hr | High-throughput pace, complete forensic suite, unlimited custom peer spreads, audit drilldowns, real-time monitoring |

---

## SEC Fair Access & Rate Limiting

CALIO operates with client-side rate limiters to ensure 100% compliance with official SEC.gov Fair Access Policies:

* **Hard Maximum Bandwidth:** SEC permits up to 10 requests per second (36,000/hour). CALIO Free runs at ~25/hour (1,440× below SEC ceiling).
* **Serialized Queue (`secFetchQueue`):** Calls to SEC EDGAR are strictly serialized with a minimum 250ms spacing between network requests, preventing burst spikes.
* **RFC-Compliant User-Agent:** Automatic injection of required headers (`CALIO-Extension/1.16 (...) contact: caliointel@gmail.com`).
* **Zero-Network DOM Extraction:** Parses filings directly from local browser memory on `sec.gov` with zero additional network calls.
* **Pace & Quota Dialog (`#quotaDialog`):** Alerts users when reaching their hourly rate limit or monthly tier allocation, preventing extraction hangs and providing an upgrade path.

---

## Privacy & Zero-Cloud Architecture

* **100% On-Device Processing:** All filing text, XBRL data, and DCF models are processed locally in your browser memory.
* **Zero Cloud Data Storage:** CALIO operates no central filing database. Your watchlists, searches, and exported models are never transmitted to or stored on CALIO servers.
* **No Account Required:** Core features function with zero signups or logins.
* **Data Retention:** All history and preferences remain in local browser storage (`chrome.storage.local`) until manually cleared.

---

## Project Structure

```
CALIO_MVP/
├── manifest.json              # Chrome Extension Manifest V3 configuration
├── background.js              # Service worker: SEC pacing, queue, tier limits, Excel generator
├── content.js                 # In-page DOM parser and floating SEC companion
├── app.html / app.js / app.css# Full-screen financial workstation terminal
├── options.html / options.js  # User preferences, 3-tier pricing cards, and license activation
├── popup.html / popup.js      # Extension toolbar popup
├── styles.css                 # Shared institutional design system
├── privacy.html               # In-extension privacy policy
├── marketing-site/            # Standalone zero-storage web platform (Vercel-ready)
│   ├── index.html             # Product landing page with live Chrome Web Store links
│   ├── privacy.html           # Public HTTPS privacy policy
│   ├── support.html           # Support and contact page
│   ├── vercel.json            # Security headers (HSTS, CSP, X-Frame-Options)
│   └── css/site.css           # Marketing site styles
└── dist/                      # Packaged release archives (calio-1.16.0-cws.zip)
```

---

## Developer Installation

1. Open Google Chrome and navigate to `chrome://extensions`.
2. Toggle **Developer mode** on (top right).
3. Click **Load unpacked** and select the `/Users/sumedhchopra/Desktop/POSTED_EXT/CALIO_MVP` directory.
4. Open any SEC EDGAR filing (e.g. `https://www.sec.gov/edgar/searchedgar/companysearch`) or click the CALIO toolbar icon to launch the workstation.

---

## Support & Contact

* **Publisher Contact:** `caliointel@gmail.com`
* **Chrome Web Store:** [CALIO Listing](https://chromewebstore.google.com/detail/sec-edgar-filings-extract/mjlmlhdhcdlohompclddmcnpgdhjgeja)
