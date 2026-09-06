# CALIO — launch today (Chrome Web Store)

Do these in order. Estimated time: **45–90 minutes** (plus Google review wait).

---

## A. Pre-flight (10 min)

- [x] SEO store name + short description in `manifest.json`
- [x] Full copy in `STORE_LISTING.md`
- [x] Marketing site (home + 3 SEO pages + privacy + support)
- [x] Extension zip: `dist/calio-1.13.0-cws.zip`
- [ ] Icons verified (128/48/32/16 present)
- [ ] Load unpacked → open AAPL/MSFT → extract once → Excel works
- [ ] `caliointel@gmail.com` inbox works **or** replace with an email you own everywhere

---

## B. Host privacy policy (required) — 10 min

Chrome Web Store needs a **public HTTPS privacy URL**.

**Fastest free options:**

1. **Netlify Drop:** drag `marketing-site/` folder → get URL  
   https://app.netlify.com/drop  
2. **GitHub Pages:** push `marketing-site` as repo pages  
3. **Cloudflare Pages / Vercel:** same folder upload  

After host:

| Field | URL |
|-------|-----|
| Website | `https://YOUR-HOST/` |
| Privacy policy | `https://YOUR-HOST/privacy.html` |
| Support | `https://YOUR-HOST/support.html` |

Open privacy in a private window — must load without login.

---

## C. Capture screenshots (15 min)

Follow `marketing-site/ASSETS_SPECS.md`:

1. Company desk + timeline  
2. 10-Q extract  
3. Form 4 extract  
4. Compare + Excel  
5. History / watchlist  

Size **1280×800**. Real UI only.

Promo tile 440×280: design in Figma/Canva using ASSETS_SPECS brief, **or** use generated files in `marketing-site/assets/` if present.

---

## D. Publish on Chrome Web Store (20 min)

1. Open https://chrome.google.com/webstore/devconsole  
2. Pay one-time developer fee if first time (**$5**)  
3. **New item** → upload `dist/calio-1.13.0-cws.zip`  
4. Paste from `STORE_LISTING.md`:
   - Name  
   - Summary  
   - Description  
   - Category: **Workflow & Planning**  
   - Language: English  
5. Upload icon, 5 screenshots, promo tile  
6. Privacy tab: accurate answers + privacy URL  
7. Single purpose: from STORE_LISTING  
8. Visibility: **Public**  
9. **Submit for review**

Google review can take **hours to a few days**. Not always same-day live.

---

## E. After “Published”

1. Copy store URL  
2. Paste into `marketing-site/index.html` → set `CWS_URL`  
3. Redeploy marketing site  
4. Install from store yourself; run smoke test  
5. Soft launch posts (value-first, no spam):
   - r/ValueInvesting / r/SecurityAnalysis (read rules)  
   - Indie Hackers  
   - AlternativeTo as BamSEC alternative  
   - Product Hunt (schedule if needed)  
6. Ask beta users: extract once → leave honest review  
7. Later: Featured badge nomination via [One Stop Support](https://support.google.com/chrome_webstore/contact/one_stop_support)

---

## F. Files map

| Path | Use |
|------|-----|
| `dist/calio-1.13.0-cws.zip` | Upload to CWS |
| `STORE_LISTING.md` | All dashboard text |
| `marketing-site/` | Website + privacy host |
| `marketing-site/ASSETS_SPECS.md` | Screenshot & tile specs |
| `LAUNCH_CHECKLIST.md` | This file |

---

## G. Do not

- Buy reviews or installs  
- Keyword-stuff description  
- Upload mockups that are not the product  
- Submit without a working privacy URL  
