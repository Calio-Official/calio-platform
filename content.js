/**
 * C.A.L.I.O — Content Script
 * Compliance Analytics Layer for Insurance Operations.
 * Side panel on SEC EDGAR: extract · insurance metrics · risk scan · compare · export.
 * Fully rules-based and local — no AI.
 */
(() => {
  const APP_HOST_ID = "calio-root-host";
  const URL_WATCH_INTERVAL_MS = 900;

  const MISSING_METRIC = "Not disclosed in this filing";

  const SUPPORTED_FILINGS = new Set([
    "10-K",
    "10-Q",
    "8-K",
    "20-F",
    "6-K",
    "S-1",
    "S-3",
    "DEF 14A",
    "SC 13D",
    "SC 13G",
    "4",
    "3",
    "5",
    "144"
  ]);

  /** Kinds that must never run the 10-K/10-Q financial + XBRL pipeline */
  const NON_FINANCIAL_KINDS = new Set([
    "insider",
    "ownership",
    "form144",
    "proxy",
    "event"
  ]);

  /**
   * Line-item catalog. `section` prefers a statement window so we do not grab
   * the same words from MD&A footnotes or exhibit covers.
   * `kind`: money | perShare | shares | count
   * `exactLabels`: preferred exact row labels (case-insensitive)
   */
  const FINANCIAL_SPECS = [
    { key: "revenue", label: "Revenue", section: "income", kind: "money", exactLabels: ["Revenue", "Net revenue", "Net sales", "Total revenue", "Total net sales", "Sales"], patterns: [/^Revenue\b/i, /^Net (?:revenue|sales)\b/i, /^Total (?:revenue|net sales)\b/i] },
    { key: "costOfRevenue", label: "Cost of Revenue", section: "income", kind: "money", exactLabels: ["Cost of revenue", "Cost of sales", "Cost of goods sold"], patterns: [/^Cost of (?:revenue|sales|goods sold)\b/i] },
    { key: "grossProfit", label: "Gross Profit", section: "income", kind: "money", exactLabels: ["Gross profit"], patterns: [/^Gross profit\b/i] },
    { key: "rdExpense", label: "R&D Expense", section: "income", kind: "money", exactLabels: ["Research and development"], patterns: [/^Research and development\b/i] },
    { key: "sgaExpense", label: "SG&A Expense", section: "income", kind: "money", exactLabels: ["Sales, general and administrative", "Selling, general and administrative"], patterns: [/^Sales?, general and administrative\b/i, /^Selling, general and administrative\b/i] },
    { key: "operatingIncome", label: "Operating Income", section: "income", kind: "money", exactLabels: ["Operating income", "Income from operations", "Operating loss"], patterns: [/^Operating (?:income|loss|profit)\b/i, /^Income from operations\b/i] },
    { key: "interestExpense", label: "Interest Expense", section: "income", kind: "money", exactLabels: ["Interest expense"], patterns: [/^Interest expense\b/i] },
    { key: "incomeTax", label: "Income Tax Expense", section: "income", kind: "money", exactLabels: ["Income tax expense", "Provision for income taxes"], patterns: [/^Income tax(?:es)? (?:expense|benefit)\b/i, /^Provision for income taxes\b/i] },
    { key: "netIncome", label: "Net Income", section: "income", kind: "money", exactLabels: ["Net income", "Net income (loss)", "Net earnings", "Net loss"], patterns: [/^Net (?:income|earnings|loss)\b(?! per)/i] },
    { key: "epsBasic", label: "EPS — Basic", section: "income", kind: "perShare", exactLabels: ["Basic"], patterns: [/^Basic\b/i, /Net income per share:\s*Basic/i, /Basic\s+\$?\s*[\d.]+/i], special: "epsBasic" },
    { key: "epsDiluted", label: "EPS — Diluted", section: "income", kind: "perShare", exactLabels: ["Diluted"], patterns: [/^Diluted\b/i], special: "epsDiluted" },
    { key: "sharesBasic", label: "Weighted Avg Shares — Basic", section: "income", kind: "shares", exactLabels: ["Basic"], patterns: [/Weighted average shares[\s\S]{0,80}?Basic/i], special: "sharesBasic" },
    { key: "sharesDiluted", label: "Weighted Avg Shares — Diluted", section: "income", kind: "shares", exactLabels: ["Diluted"], patterns: [/Weighted average shares[\s\S]{0,120}?Diluted/i], special: "sharesDiluted" },
    { key: "cashAndEquivalents", label: "Cash & Cash Equivalents", section: "balance", kind: "money", exactLabels: ["Cash and cash equivalents"], patterns: [/^Cash and cash equivalents\b/i] },
    { key: "totalAssets", label: "Total Assets", section: "balance", kind: "money", exactLabels: ["Total assets"], patterns: [/^Total assets\b/i] },
    { key: "totalLiabilities", label: "Total Liabilities", section: "balance", kind: "money", exactLabels: ["Total liabilities"], patterns: [/^Total liabilities\b/i] },
    { key: "stockholdersEquity", label: "Stockholders' Equity", section: "balance", kind: "money", exactLabels: ["Total stockholders' equity", "Total shareholders' equity", "Total equity"], patterns: [/^Total (?:stockholders|shareholders)['’]? equity\b/i, /^Total equity\b/i] },
    { key: "longTermDebt", label: "Long-Term Debt", section: "balance", kind: "money", exactLabels: ["Long-term debt", "Long term debt"], patterns: [/^Long[- ]term debt\b/i] },
    { key: "goodwill", label: "Goodwill", section: "balance", kind: "money", exactLabels: ["Goodwill"], patterns: [/^Goodwill\b/i] },
    { key: "operatingCashFlow", label: "Operating Cash Flow", section: "cashflow", kind: "money", exactLabels: ["Net cash provided by operating activities", "Net cash used in operating activities"], patterns: [/^Net cash (?:provided by|used in) operating activities\b/i] },
    { key: "investingCashFlow", label: "Investing Cash Flow", section: "cashflow", kind: "money", exactLabels: ["Net cash provided by investing activities", "Net cash used in investing activities"], patterns: [/^Net cash (?:provided by|used in) investing activities\b/i] },
    { key: "financingCashFlow", label: "Financing Cash Flow", section: "cashflow", kind: "money", exactLabels: ["Net cash provided by financing activities", "Net cash used in financing activities"], patterns: [/^Net cash (?:provided by|used in) financing activities\b/i] },
    { key: "capex", label: "Capital Expenditures", section: "cashflow", kind: "money", exactLabels: ["Purchases of property and equipment", "Capital expenditures"], patterns: [/^Purchases? of property and equipment\b/i, /^Capital expenditures?\b/i] }
  ];

  const SECTION_SPECS = [
    { key: "mda", label: "MD&A", phrases: ["management's discussion and analysis", "management discussion and analysis", "item 2. management", "item 7. management", "md&a"] },
    { key: "riskFactors", label: "Risk Factors", phrases: ["item 1a. risk factors", "item 1a – risk factors", "item 1a - risk factors", "risk factors"] },
    { key: "legalProceedings", label: "Legal Proceedings", phrases: ["item 3. legal proceedings", "item 1. legal proceedings", "legal proceedings"] },
    { key: "controlsProcedures", label: "Controls & Procedures", phrases: ["controls and procedures", "item 4. controls", "item 9a"] },
    { key: "financialStatements", label: "Financial Statements", phrases: ["consolidated statements of", "consolidated balance sheets", "financial statements"] },
    { key: "exhibits", label: "Exhibits", phrases: ["item 6. exhibits", "item 15. exhibits", "exhibit index"] }
  ];

  const MENTION_SPECS = [
    { key: "dividend", label: "Dividends", patterns: [/\bdividends?\b/, /\bdividend\s+declared\b/, /\bcash\s+dividend\b/] },
    { key: "shareRepurchase", label: "Share Repurchases", patterns: [/\bshare\s+repurchase/, /\bstock\s+repurchase/, /\bbuyback/, /\btreasury\s+stock/] },
    { key: "debt", label: "Debt", patterns: [/\blong[- ]term\s+debt\b/, /\bnotes\s+payable\b/, /\bcredit\s+facility\b/, /\bsenior\s+notes\b/, /\bindebtedness\b/] },
    { key: "acquisition", label: "Acquisitions", patterns: [/\bacquisition\b/, /\bacquired\b/, /\bmerger\b/, /\bbusiness\s+combination\b/] },
    { key: "executiveChanges", label: "Executive Changes", patterns: [/\bresignation\b/, /\bappointed\s+(?:as\s+)?(?:ceo|cfo|president|director)\b/, /\bitem\s+5\.02\b/, /\bdeparture\s+of\s+directors\b/] },
    { key: "cybersecurity", label: "Cybersecurity", patterns: [/\bcybersecurity\b/, /\bcyber\s+attack\b/, /\bdata\s+breach\b/] },
    { key: "goingConcern", label: "Going Concern", patterns: [/\bgoing\s+concern\b/] },
    { key: "relatedParty", label: "Related Party", patterns: [/\brelated\s+part(?:y|ies)\b/] },
    { key: "subsequentEvents", label: "Subsequent Events", patterns: [/\bsubsequent\s+events?\b/] },
    { key: "segmentReporting", label: "Segment Reporting", patterns: [/\bsegment\s+information\b/, /\breportable\s+segments?\b/] }
  ];

  const state = {
    host: null,
    shadow: null,
    refs: {},
    isOpen: false,
    isBusy: false,
    lastUrl: location.href,
    parsed: null,
    context: null,
    compareResult: null,
    activeTab: "extract", // extract | share | compare
    toastTimer: null,
    prefs: {
      lastEmail: "",
      preferredMailClient: "mailto",
      theme: "system",
      accountEmail: ""
    },
    usage: { count: 0, freeLimit: 5, month: "" },
    watchlist: [],
    watched: false,
    shouldPromptReview: false,
    reviewPromptCount: 5
  };

  /* ── Mount ───────────────────────────────────────────── */

  /**
   * Shadow DOM + relative @font-face URLs often fail silently on EDGAR pages.
   * Inject absolute chrome-extension:// font URLs into document + shadow,
   * then force Outfit on the UI (Outfit is geometrically distinct from SF/Segoe).
   */
  function injectCalioFonts(shadowRoot) {
    const weights = [400, 500, 600, 700, 800];
    const faces = weights
      .map((w) => {
        const url = chrome.runtime.getURL(`fonts/outfit-${w}.woff2`);
        return `
@font-face {
  font-family: "Outfit";
  font-style: normal;
  font-weight: ${w};
  font-display: block;
  src: url("${url}") format("woff2");
}`;
      })
      .join("\n");

    // Force application so we never silently sit on system UI.
    const force = `
.calio-app,
.calio-app button,
.calio-app input,
.calio-app select,
.calio-app textarea,
.calio-launcher,
.calio-launcher-label,
.calio-brand-title,
.calio-brand-subtitle,
.calio-state-title,
.calio-section-title,
.calio-button,
.calio-tab,
.calio-chip,
.calio-metric-value,
.calio-metric-label,
.calio-fact-label,
.calio-fact-value:not(.mono),
.calio-action-card-title,
.calio-eyebrow {
  font-family: "Outfit", ui-sans-serif, system-ui, sans-serif !important;
}
.calio-brand-title {
  letter-spacing: 0.16em !important;
  font-weight: 700 !important;
}
.calio-fact-value.mono {
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace !important;
}
`;

    const bundle = `${faces}\n${force}`;

    // Document-level: makes the face available page-wide (including shadow).
    let docStyle = document.getElementById("calio-font-faces");
    if (!docStyle) {
      docStyle = document.createElement("style");
      docStyle.id = "calio-font-faces";
      (document.head || document.documentElement).appendChild(docStyle);
    }
    docStyle.textContent = faces;

    // Shadow-level: faces + forced family where the UI actually lives.
    if (shadowRoot) {
      let shadowStyle = shadowRoot.querySelector("#calio-font-faces-shadow");
      if (!shadowStyle) {
        shadowStyle = document.createElement("style");
        shadowStyle.id = "calio-font-faces-shadow";
        shadowRoot.appendChild(shadowStyle);
      }
      shadowStyle.textContent = bundle;
    }

    // Prefetch so the launcher doesn’t flash system font first.
    weights.forEach((w) => {
      const href = chrome.runtime.getURL(`fonts/outfit-${w}.woff2`);
      if (document.querySelector(`link[data-calio-font="${w}"]`)) return;
      const link = document.createElement("link");
      link.rel = "preload";
      link.as = "font";
      link.type = "font/woff2";
      link.crossOrigin = "anonymous";
      link.href = href;
      link.dataset.calioFont = String(w);
      (document.head || document.documentElement).appendChild(link);
    });
  }

  function mount() {
    if (document.getElementById(APP_HOST_ID)) return;

    const host = document.createElement("div");
    host.id = APP_HOST_ID;
    (document.body || document.documentElement).appendChild(host);

    const shadow = host.attachShadow({ mode: "open" });
    injectCalioFonts(shadow);

    const styleLink = document.createElement("link");
    styleLink.setAttribute("rel", "stylesheet");
    styleLink.setAttribute("href", chrome.runtime.getURL("styles.css"));

    const app = document.createElement("div");
    app.className = "calio-app";
    app.innerHTML = `
      <div class="calio-overlay" data-part="overlay"></div>

      <button type="button" class="calio-launcher" data-part="launcher" aria-label="Open C.A.L.I.O companion">
        <span class="calio-launcher-mark" aria-hidden="true">
          <img class="calio-logo-img" src="${chrome.runtime.getURL("icons/calio-mark.png")}" alt="" width="28" height="28" />
        </span>
        <span class="calio-launcher-label">Open C.A.L.I.O</span>
      </button>

      <aside class="calio-drawer" data-part="drawer" aria-hidden="true">
        <div class="calio-panel-shell">
          <div class="calio-panel-topbar">
            <div class="calio-brand-block">
              <div class="calio-brand-mark" aria-hidden="true">
                <img class="calio-logo-img" src="${chrome.runtime.getURL("icons/calio-mark.png")}" alt="" width="36" height="36" />
              </div>
              <div>
                <div class="calio-brand-title">C.A.L.I.O</div>
                <div class="calio-brand-subtitle">Companion</div>
              </div>
            </div>
            <button type="button" class="calio-close-button" data-action="close" aria-label="Close panel">×</button>
          </div>
          <div class="calio-sticky-chrome" data-part="chrome">
            <p class="calio-brand-expand">Compliance Analytics Layer for Insurance Operations</p>
            <div class="calio-top-actions">
              <button type="button" class="calio-button" data-action="parse" data-part="extract-btn">Extract</button>
              <button type="button" class="calio-icon-button" data-action="open-settings" aria-label="Settings" title="Settings"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg></button>
            </div>
            <div class="calio-tabs" data-part="tabs">
              <button type="button" class="calio-tab is-active" data-action="tab-extract">Extract</button>
              <button type="button" class="calio-tab" data-action="tab-share">Share</button>
              <button type="button" class="calio-tab" data-action="tab-compare">Compare</button>
            </div>
          </div>
          <div class="calio-panel-scroll">
            <div class="calio-panel-body" data-part="body"></div>
          </div>
          <div class="calio-legal-footer" data-part="legal">
            This tool summarizes public SEC EDGAR information. It is not investment advice.
            Always verify figures on the official filing.
            <span class="calio-legal-sep">·</span>
            Filing contents are processed on your device and are not stored on C.A.L.I.O servers.
          </div>
        </div>
      </aside>
    `;

    shadow.appendChild(styleLink);
    shadow.appendChild(app);

    state.host = host;
    state.shadow = shadow;
    state.refs.app = app;
    state.refs.overlay = shadow.querySelector('[data-part="overlay"]');
    state.refs.launcher = shadow.querySelector('[data-part="launcher"]');
    state.refs.launcherLabel = shadow.querySelector(".calio-launcher-label");
    state.refs.drawer = shadow.querySelector('[data-part="drawer"]');
    state.refs.body = shadow.querySelector('[data-part="body"]');
    state.refs.chrome = shadow.querySelector('[data-part="chrome"]');
    state.refs.extractBtn = shadow.querySelector('[data-part="extract-btn"]');
    state.refs.tabs = shadow.querySelector('[data-part="tabs"]');

    // Close lives in topbar — bind on whole app, not just body.
    state.refs.launcher.addEventListener("click", onLauncherClick);
    state.refs.overlay.addEventListener("click", closeDrawer);
    state.refs.app.addEventListener("click", onAppClick);
    state.refs.app.addEventListener("submit", onAppSubmit);
    state.refs.app.addEventListener("change", onAppChange);
    window.addEventListener("keydown", onKeyDown);

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === "calio:runExtract") {
        runParse()
          .then(() => {
            sendResponse({
              ok: true,
              extract: state.parsed
                ? { ...state.parsed, documentUrl: state.context?.documentUrl || "" }
                : null
            });
            if (state.parsed) {
              sendMessage({
                type: "calio:setLastExtract",
                payload: {
                  extract: {
                    ...state.parsed,
                    documentUrl: state.context?.documentUrl || ""
                  }
                }
              }).then(() => {
                checkDrawerReviewPrompt();
              }).catch(() => {});
            }
          })
          .catch((err) => {
            sendResponse({
              ok: false,
              error: err?.message || "Extract failed."
            });
          });
        return true;
      }

      // Full-parser compare for app window (same engine as Extract).
      if (message?.type === "calio:parseFilingPair") {
        try {
          const formType = message.formType || "10-Q";
          const companyQuery = message.companyQuery || "";
          const leftBundle = message.left || {};
          const rightBundle = message.right || {};

          const leftCtx = {
            rawText: leftBundle.text || "",
            documentUrl: leftBundle.documentUrl || "",
            companyName: leftBundle.companyName || companyQuery,
            filingType: formType,
            cik: leftBundle.cik,
            pageTitle: leftBundle.pageTitle || "",
            skipDom: true,
            // Period-matched companyfacts from background (high confidence)
            xbrlFacts: leftBundle.xbrlFacts || null
          };
          const rightCtx = {
            rawText: rightBundle.text || "",
            documentUrl: rightBundle.documentUrl || "",
            companyName: rightBundle.companyName || companyQuery,
            filingType: formType,
            cik: rightBundle.cik,
            pageTitle: rightBundle.pageTitle || "",
            skipDom: true,
            xbrlFacts: rightBundle.xbrlFacts || null
          };

          const leftParsed = parseFilingDocument(leftCtx);
          const rightParsed = parseFilingDocument(rightCtx);

          if (!leftParsed.filingDate && leftBundle.filingDate) {
            leftParsed.filingDate = leftBundle.filingDate;
          }
          if (!rightParsed.filingDate && rightBundle.filingDate) {
            rightParsed.filingDate = rightBundle.filingDate;
          }
          if (!leftParsed.periodEnd && leftBundle.reportDate) {
            leftParsed.periodEnd = leftBundle.reportDate;
          }
          if (!rightParsed.periodEnd && rightBundle.reportDate) {
            rightParsed.periodEnd = rightBundle.reportDate;
          }
          if (leftBundle.companyName) leftParsed.companyName = leftBundle.companyName;
          if (rightBundle.companyName) rightParsed.companyName = rightBundle.companyName;

          const diff = buildComparison(leftParsed, rightParsed, {
            labelA: leftBundle.label || leftParsed.periodEnd || "Filing A",
            labelB: rightBundle.label || rightParsed.periodEnd || "Filing B",
            formType
          });

          const deltas = [];
          for (const row of diff.financialRows || []) {
            deltas.push({
              key: row.key,
              label: row.label,
              leftDisplay: row.aDisplay,
              rightDisplay: row.bDisplay,
              leftValue: row.aValue,
              rightValue: row.bValue,
              aValue: row.aValue,
              bValue: row.bValue,
              display: row.deltaDisplay,
              delta: row.delta,
              foundA: row.aValue != null && Number.isFinite(row.aValue),
              foundB: row.bValue != null && Number.isFinite(row.bValue),
              section: "Financials"
            });
          }

          const insKeys = new Set([
            ...Object.keys(leftParsed.insurance || {}),
            ...Object.keys(rightParsed.insurance || {})
          ]);
          for (const key of insKeys) {
            const a = leftParsed.insurance?.[key];
            const b = rightParsed.insurance?.[key];
            const aVal = a?.value;
            const bVal = b?.value;
            let deltaDisplay = "—";
            let delta = null;
            if (
              aVal != null &&
              bVal != null &&
              Number.isFinite(aVal) &&
              Number.isFinite(bVal)
            ) {
              delta = bVal - aVal;
              const pct = aVal !== 0 ? (delta / Math.abs(aVal)) * 100 : null;
              deltaDisplay =
                pct == null
                  ? String(delta)
                  : `${delta >= 0 ? "+" : ""}${delta.toFixed(2)} (${
                      pct >= 0 ? "+" : ""
                    }${pct.toFixed(1)}%)`;
            }
            deltas.unshift({
              key: `ins_${key}`,
              label: a?.label || b?.label || key,
              leftDisplay: a?.display || MISSING_METRIC,
              rightDisplay: b?.display || MISSING_METRIC,
              display: deltaDisplay,
              delta,
              foundA: aVal != null && Number.isFinite(aVal),
              foundB: bVal != null && Number.isFinite(bVal),
              section: "Insurance"
            });
          }

          sendResponse({
            ok: true,
            left: leftParsed,
            right: rightParsed,
            deltas,
            diff
          });
        } catch (err) {
          sendResponse({
            ok: false,
            error: err?.message || "Full parse compare failed."
          });
        }
        return true;
      }

      return false;
    });

    // Auto-extract if the app opened this tab via Open & extract
    chrome.storage.local.get(
      [
        "calioPendingExtractTabId",
        "calioPendingExtractAt",
        "calioPendingExtractUrl"
      ],
      (store) => {
        try {
          const pendingId = store.calioPendingExtractTabId;
          const at = store.calioPendingExtractAt || 0;
          const pendingUrl = String(store.calioPendingExtractUrl || "").trim();
          if (!pendingId || Date.now() - at > 120000) return;

          // Claim only our tab (avoid another EDGAR page stealing the pending flag)
          chrome.runtime.sendMessage(
            { type: "calio:claimPendingExtract" },
            (claim) => {
              if (chrome.runtime.lastError || !claim?.ok || !claim.shouldExtract) {
                return;
              }
              setTimeout(() => {
                runParse()
                  .then(() => {
                    if (state.parsed) {
                      const docUrl =
                        state.context?.documentUrl ||
                        pendingUrl ||
                        location.href;
                      sendMessage({
                        type: "calio:setLastExtract",
                        payload: {
                          extract: {
                            ...state.parsed,
                            documentUrl: docUrl,
                            sourceUrl: docUrl,
                            extractedAt: Date.now()
                          }
                        }
                      }).catch(() => {});
                    }
                    chrome.storage.local.remove([
                      "calioPendingExtractTabId",
                      "calioPendingExtractAt",
                      "calioPendingExtractUrl"
                    ]);
                  })
                  .catch(() => {});
              }, 1200);
            }
          );
        } catch {
          /* ignore */
        }
      }
    );

    try {
      refreshContextAndRender();
    } catch (err) {
      console.error("[CALIO] initial render failed", err);
      try {
        setBodyHtml(`
          <div class="calio-state-card">
            <div class="calio-eyebrow">Error</div>
            <h2 class="calio-state-title">Panel failed to load</h2>
            <p class="calio-muted">${escapeHtml(err?.message || "Unknown error")}</p>
            <div class="calio-action-row" style="margin-top:12px">
              <button class="calio-button" data-action="parse" type="button">Try again</button>
            </div>
          </div>
        `);
      } catch (e2) {
        console.error("[CALIO] recovery render failed", e2);
      }
    }
    watchUrlChanges();
    initSmartFootnotePeeker();
  }

  function shouldRunOnPage() {
    try {
      const host = location.hostname;
      return /(^|\.)sec\.gov$/i.test(host);
    } catch {
      return false;
    }
  }

  function watchUrlChanges() {
    setInterval(() => {
      if (location.href !== state.lastUrl) {
        state.lastUrl = location.href;
        state.isBusy = false;
        state.parsed = null;
        state.context = null;
        state.compareResult = null;
        state.activeTab = "extract";
        closeDrawer();
        refreshContextAndRender();
        if (state.refs.launcherLabel) {
          state.refs.launcherLabel.textContent = "Open C.A.L.I.O";
        }
      }
    }, URL_WATCH_INTERVAL_MS);
  }

  function onKeyDown(event) {
    if (event.key === "Escape" && state.isOpen) closeDrawer();
  }

  function isExtensionContextAlive() {
    try {
      // After chrome://extensions reload, old content scripts stay on open pages
      // but chrome.runtime.id becomes undefined / messaging throws.
      return Boolean(chrome?.runtime?.id);
    } catch {
      return false;
    }
  }

  function isContextInvalidatedError(err) {
    const msg = String(err?.message || err || "");
    return /extension context invalidated|context invalidated|receiving end does not exist/i.test(
      msg
    );
  }

  function showReloadRequiredBanner() {
    try {
      // Prefer a visible page banner over console noise (console.warn shows up in
      // chrome://extensions errors after reload).
      let banner = document.getElementById("calio-reload-banner");
      if (!banner) {
        banner = document.createElement("div");
        banner.id = "calio-reload-banner";
        banner.setAttribute("role", "status");
        banner.style.cssText = [
          "position:fixed",
          "bottom:20px",
          "right:20px",
          "z-index:2147483646",
          "max-width:320px",
          "padding:14px 16px",
          "border-radius:12px",
          "background:#0f2e29",
          "color:#fff",
          "font:600 13px/1.45 system-ui,sans-serif",
          "box-shadow:0 12px 40px rgba(0,0,0,.28)",
          "border:1px solid rgba(255,255,255,.12)"
        ].join(";");
        document.documentElement.appendChild(banner);
      }
      banner.innerHTML =
        "<div style=\"margin-bottom:8px\">C.A.L.I.O was updated or reloaded.</div>" +
        "<div style=\"font-weight:500;opacity:.9;margin-bottom:12px\">" +
        "Refresh this SEC page to reconnect the extension.</div>" +
        "<button type=\"button\" id=\"calio-reload-page-btn\" style=\"" +
        "appearance:none;border:0;border-radius:8px;padding:8px 12px;" +
        "background:#fff;color:#0f2e29;font:650 12px system-ui,sans-serif;cursor:pointer" +
        "\">Refresh page</button>";
      const btn = banner.querySelector("#calio-reload-page-btn");
      if (btn) {
        btn.onclick = () => {
          try {
            location.reload();
          } catch {
            /* ignore */
          }
        };
      }
    } catch {
      /* ignore */
    }
  }

  async function onLauncherClick() {
    if (!isExtensionContextAlive()) {
      showReloadRequiredBanner();
      return;
    }
    try {
      await sendMessage({ type: "calio:openApp" });
    } catch (err) {
      if (isContextInvalidatedError(err) || !isExtensionContextAlive()) {
        showReloadRequiredBanner();
        return;
      }
      // Real openApp failure (e.g. window API) — fall back to on-page panel
      openDrawer();
      if (!state.isBusy) await runParse();
    }
  }

  function onAppClick(event) {
    const trigger = event.target.closest("[data-action]");
    if (!trigger || !state.refs.app.contains(trigger)) return;

    const action = trigger.getAttribute("data-action");
    switch (action) {
      case "close":
        event.preventDefault();
        event.stopPropagation();
        closeDrawer();
        break;
      case "parse":
        runParse();
        break;
      case "download-html":
        downloadHtml();
        break;
      case "save-pdf":
        savePdf();
        break;
      case "open-settings":
        sendMessage({ type: "calio:openOptions" });
        break;
      case "tab-extract":
        state.activeTab = "extract";
        renderMain();
        break;
      case "tab-share":
        state.activeTab = "share";
        renderMain();
        break;
      case "tab-compare":
        state.activeTab = "compare";
        renderMain();
        break;
      case "open-document":
        {
          event.preventDefault();
          const url = trigger.getAttribute("data-url");
          if (url) sendMessage({ type: "calio:openTab", payload: { url } });
        }
        break;
      case "copy-insight":
        copyInsight();
        break;
      case "export-csv":
        exportCsv();
        break;
      case "export-excel":
        exportExcel();
        break;
      case "open-app":
        if (!isExtensionContextAlive()) {
          showReloadRequiredBanner();
          break;
        }
        sendMessage({ type: "calio:openApp" }).catch((err) => {
          if (isContextInvalidatedError(err) || !isExtensionContextAlive()) {
            showReloadRequiredBanner();
          }
        });
        break;
      case "toggle-watchlist":
        toggleWatchlist();
        break;
      case "review-dismiss":
        state.shouldPromptReview = false;
        sendMessage({ type: "calio:recordReviewDismissed" }).catch(() => {});
        renderMain();
        break;
      case "review-accept":
        state.shouldPromptReview = false;
        sendMessage({ type: "calio:recordReviewAccepted" }).catch(() => {});
        renderMain();
        {
          const reviewUrl =
            "https://chromewebstore.google.com/detail/sec-edgar-filings-extract/mjlmlhdhcdlohompclddmcnpgdhjgeja/reviews";
          window.open(reviewUrl, "_blank", "noopener,noreferrer");
          showInlineToast("Thank you for supporting CALIO!");
        }
        break;
      default:
        break;
    }
  }

  async function onAppSubmit(event) {
    const form = event.target.closest("[data-form]");
    if (!form) return;
    event.preventDefault();

    if (form.getAttribute("data-form") === "email") {
      await sendEmail(form);
    } else if (form.getAttribute("data-form") === "compare") {
      await runCompare(form);
    }
  }

  function onAppChange(event) {
    const el = event.target;
    if (!el || el.name !== "formType") return;
    const form = el.closest("[data-form='compare']");
    if (!form) return;
    toggleCompareQuarterFields(form, el.value);
  }

  function toggleCompareQuarterFields(form, formType) {
    const needs = formNeedsQuarter(formType);
    form.querySelectorAll("[data-quarter-field]").forEach((node) => {
      node.style.display = needs ? "" : "none";
    });
    const hint = form.querySelector("[data-quarter-hint]");
    if (hint) {
      hint.style.display = needs ? "" : "none";
    }
    // Clear quarter values' required UX — use latest silently for annual forms
    if (!needs) {
      form.querySelectorAll('select[name="quarterA"], select[name="quarterB"]').forEach((sel) => {
        sel.value = "latest";
      });
    }
  }

  function openDrawer() {
    state.isOpen = true;
    state.refs.overlay.classList.add("is-open");
    state.refs.drawer.classList.add("is-open");
    state.refs.drawer.setAttribute("aria-hidden", "false");
    updateChrome();
  }

  function closeDrawer() {
    state.isOpen = false;
    state.refs.overlay.classList.remove("is-open");
    state.refs.drawer.classList.remove("is-open");
    state.refs.drawer.setAttribute("aria-hidden", "true");
  }

  /* ── Core parse flow ─────────────────────────────────── */

  function refreshContextAndRender() {
    state.context = collectPageContextLite();
    renderIdleState(state.context);
  }

  async function runParse() {
    state.isBusy = true;
    state.activeTab = "extract";
    try {
      const lite = collectPageContextLite();
      state.context = lite;
      renderLoadingState(lite);

      await loadPrefs();

      // Resolve the real filing document (handles /ix viewer + index pages).
      const resolved = await resolveFilingContent(lite);
      state.context = {
        ...lite,
        ...resolved,
        isSupported: SUPPORTED_FILINGS.has(resolved.filingType) || lite.isSupported
      };

      // SEC fair-access: refuse extract if monthly/hourly quota exceeded
      try {
        const quota = await sendMessage({ type: "calio:checkExtractQuota" });
        if (quota && quota.ok === false) {
          throw new Error(
            quota.error ||
              "Extract limit reached for this period. Try again later."
          );
        }
      } catch (qErr) {
        if (qErr?.message && /limit/i.test(qErr.message)) throw qErr;
      }

      // Re-detect type from live URL (xsl144 transforms often miss form in title early)
      const liveType = detectFilingType(
        state.context.rawText || "",
        document.title || "",
        location.href
      );
      if (liveType && liveType !== "UNKNOWN") {
        state.context.filingType = liveType;
      }

      // Pull sibling ownership XML (Form 144/4 primary_doc.xml) for structured fields
      try {
        const xmlExtra = await fetchSiblingOwnershipXml(
          state.context.documentUrl || location.href
        );
        if (xmlExtra) {
          state.context.rawText = `${state.context.rawText || ""}\n\n${xmlExtra}`;
          if (/submissionType>\s*144/i.test(xmlExtra)) {
            state.context.filingType = "144";
          }
        }
      } catch {
        /* optional */
      }

      // XBRL companyfacts only for financial forms — never on 144 / 3/4/5 / 13D/G / proxy
      const formForXbrl = String(state.context.filingType || "").toUpperCase();
      const kindX = filingIntelKind(formForXbrl);
      const skipXbrl =
        NON_FINANCIAL_KINDS.has(kindX) ||
        formForXbrl === "144" ||
        /^(3|4|5)$/.test(formForXbrl) ||
        /13D|13G|SC 13|DEF 14|PROXY|144/.test(formForXbrl);
      const cikForXbrl =
        state.context.cik ||
        extractCikFromUrl(state.context.documentUrl || state.context.url || "");
      if (cikForXbrl && !skipXbrl) {
        try {
          const xbrlRes = await sendMessage({
            type: "calio:fetchXbrlFacts",
            payload: {
              cik: cikForXbrl,
              formType: state.context.filingType || ""
            }
          });
          if (xbrlRes?.ok && xbrlRes.facts) {
            state.context.xbrlFacts = xbrlRes.facts;
            state.context.xbrlEntityName = xbrlRes.entityName || "";
          }
        } catch {
          // XBRL optional — HTML extract still runs
        }
      }

      const parsed = parseFilingDocument(state.context);
      state.parsed = parsed;
      state.compareResult = null;

      try {
        const usageRes = await sendMessage({
          type: "calio:recordUsage",
          payload: { cost: 1, reason: "extract" }
        });
        if (usageRes?.ok) state.usage = usageRes.usage || state.usage;
        else if (usageRes?.error) {
          console.warn("[CALIO] usage", usageRes.error);
        }
      } catch {
        // non-blocking for storage errors only
      }

      try {
        const wl = await sendMessage({ type: "calio:getWatchlist" });
        if (wl?.ok) {
          state.watchlist = wl.watchlist || [];
          state.watched = isOnWatchlist(parsed);
        }
      } catch {
        // non-blocking
      }

      updateChrome();
      renderMain();
      if (state.refs.launcherLabel) {
        state.refs.launcherLabel.textContent = "Re-open C.A.L.I.O";
      }

      sendMessage({
        type: "calio:recordRecent",
        payload: {
          companyName: parsed.companyName,
          filingType: parsed.filingType,
          sourceUrl: state.context.documentUrl,
          action: "parse"
        }
      }).catch(() => {});

      sendMessage({
        type: "calio:setLastExtract",
        payload: {
          extract: {
            ...parsed,
            documentUrl: state.context.documentUrl || ""
          }
        }
      }).then(() => {
        checkDrawerReviewPrompt();
      }).catch(() => {});
    } catch (error) {
      console.error("[CALIO] parse failed", error);
      renderErrorState(error?.message || "Unable to parse this filing.");
    } finally {
      state.isBusy = false;
    }
  }

  async function loadPrefs() {
    try {
      const settingsRes = await sendMessage({ type: "calio:getSettings" });
      if (settingsRes?.ok) {
        const s = settingsRes.settings || {};
        state.prefs.lastEmail = s.accountEmail || s.lastEmail || "";
        state.prefs.preferredMailClient = s.preferredMailClient || "mailto";
        state.prefs.theme = s.theme || "system";
        state.prefs.accountEmail = s.accountEmail || "";
      }
      const usageRes = await sendMessage({ type: "calio:getUsage" });
      if (usageRes?.ok) state.usage = usageRes.usage || state.usage;
      const wl = await sendMessage({ type: "calio:getWatchlist" });
      if (wl?.ok) state.watchlist = wl.watchlist || [];
    } catch {
      // keep defaults
    }
  }

  function updateChrome() {
    if (state.refs.extractBtn) {
      state.refs.extractBtn.textContent = state.parsed ? "Re-extract" : "Extract";
    }
    if (state.refs.tabs) {
      state.refs.tabs.querySelectorAll(".calio-tab").forEach((tab) => {
        const action = tab.getAttribute("data-action") || "";
        const map = {
          "tab-extract": "extract",
          "tab-share": "share",
          "tab-compare": "compare"
        };
        tab.classList.toggle("is-active", map[action] === state.activeTab);
      });
    }
  }

  function isOnWatchlist(parsed) {
    const list = state.watchlist || [];
    const name = (parsed?.companyName || "").toLowerCase();
    const cik = parsed?.cik || "";
    return list.some(
      (item) =>
        (item.cik && cik && item.cik === cik) ||
        String(item.companyName || "").toLowerCase() === name
    );
  }


  /**
   * Build text from the page, or fetch the primary document when needed.
   * Prefer content that actually contains statement keywords.
   */
  async function resolveFilingContent(lite) {
    const pageText = extractPageText();
    const domText = extractDomTableText();
    const combinedPage = [pageText, domText].filter(Boolean).join("\n\n");
    const documentUrl = resolveDocumentUrl();
    const pageKind = detectPageKind(location.href, combinedPage);

    const pageScore = scoreFinancialText(combinedPage);

    // Always try fetch of the underlying .htm when on /ix — merge with page text.
    let fetchedText = "";
    if (
      documentUrl &&
      isProbablySecDocUrl(documentUrl) &&
      (pageKind === "ix" || pageKind === "document" || pageScore < 3)
    ) {
      try {
        const fetched = await sendMessage({
          type: "calio:fetchDocumentText",
          payload: { documentUrl }
        });
        if (fetched?.ok && !isSecBlockedText(fetched.text)) {
          fetchedText = fetched.text || "";
        }
      } catch {
        // keep page text
      }
    }

    const merged = [combinedPage, fetchedText].filter(Boolean).join("\n\n");
    const bestText = scoreFinancialText(merged) >= scoreFinancialText(combinedPage)
      ? merged
      : combinedPage;

    if (bestText.length >= 800 || pageScore >= 1) {
      return {
        documentUrl: documentUrl || location.href,
        rawText: bestText,
        filingType: detectFilingType(bestText, document.title, documentUrl),
        companyName: extractCompanyName(bestText, document.title),
        cik: extractCikFromUrl(documentUrl || location.href),
        pageKind,
        source: fetchedText ? "page+fetch" : "page-text"
      };
    }

    // Case B: filing detail / index page — resolve primary document link.
    const candidates = collectDocumentCandidateUrls();
    const preferredType = detectFilingType(
      pageText,
      document.title,
      location.href
    );

    const resolved = await sendMessage({
      type: "calio:resolvePrimaryDocument",
      payload: {
        pageUrl: location.href,
        documentUrl,
        filingType: preferredType,
        candidateUrls: candidates
      }
    });

    if (resolved?.ok && resolved.textLength >= 800) {
      const filingType = detectFilingType(
        resolved.text,
        resolved.pageTitle || document.title,
        resolved.documentUrl
      );
      return {
        documentUrl: resolved.documentUrl,
        rawText: resolved.text,
        filingType,
        companyName: extractCompanyName(
          resolved.text,
          resolved.pageTitle || document.title
        ),
        cik: extractCikFromUrl(resolved.documentUrl || location.href),
        pageKind: "resolved-primary",
        source: resolved.source || "resolved",
        note:
          pageKind === "index"
            ? "Parsed primary document linked from this filing index."
            : null
      };
    }

    // Fallback: parse whatever is on the page.
    return {
      documentUrl: documentUrl || location.href,
      rawText: pageText,
      filingType: preferredType,
      companyName: extractCompanyName(pageText, document.title),
      cik: extractCikFromUrl(documentUrl || location.href),
      pageKind,
      source: "page-fallback",
      note:
        pageText.length < 1500
          ? "Limited text on this page. Open the primary 10-K/10-Q document for better extraction."
          : null
    };
  }

  function collectDocumentCandidateUrls() {
    const urls = [];
    const anchors = document.querySelectorAll("a[href]");
    anchors.forEach((a) => {
      const href = a.getAttribute("href") || "";
      const text = (a.textContent || "").trim();
      const joined = `${href} ${text}`.toLowerCase();
      if (
        /\.htm/i.test(href) &&
        !/index\.htm/i.test(href) &&
        (/10-?q|10-?k|8-?k|s-1|20-f|6-k|form/i.test(joined) ||
          /interactive/i.test(joined) === false)
      ) {
        try {
          urls.push(new URL(href, location.href).href);
        } catch {
          // skip
        }
      }
    });

    // Also parse Type column patterns on EDGAR index tables.
    document.querySelectorAll("tr").forEach((row) => {
      const cells = [...row.querySelectorAll("td, th")].map((c) =>
        (c.textContent || "").trim()
      );
      const typeCell = cells.find((c) =>
        /^(10-Q|10-K|8-K|20-F|6-K|S-1|S-3)/i.test(c)
      );
      const link = row.querySelector('a[href*=".htm"]');
      if (typeCell && link) {
        try {
          urls.push(new URL(link.getAttribute("href"), location.href).href);
        } catch {
          // skip
        }
      }
    });

    return [...new Set(urls)].slice(0, 25);
  }

  function detectPageKind(url, text) {
    const u = String(url || "").toLowerCase();
    if (/\/ix(\?|$)/.test(u) || /\/ixviewer\//.test(u)) return "ix";
    if (/-index\.htm/.test(u) || /filing detail/i.test(text.slice(0, 2000))) {
      return "index";
    }
    if (/\/archives\/edgar\/data\//.test(u) && /\.htm/i.test(u)) return "document";
    if (/browse-edgar|companysearch|edgar\/search/i.test(u)) return "search";
    return "other";
  }

  /* ── Page context helpers ────────────────────────────── */

  function collectPageContextLite() {
    const rawText = extractPageText();
    const documentUrl = resolveDocumentUrl();
    const filingType = detectFilingType(rawText, document.title, documentUrl);
    const companyName = extractCompanyName(rawText, document.title);
    const cik = extractCikFromUrl(documentUrl || location.href);
    const pageKind = detectPageKind(location.href, rawText);

    return {
      url: location.href,
      documentUrl,
      pageTitle: document.title,
      companyName,
      filingType,
      cik,
      rawText,
      pageKind,
      isSupported: SUPPORTED_FILINGS.has(filingType)
    };
  }

  function extractPageText() {
    // Prefer known SEC viewer content roots when present.
    const roots = [
      document.querySelector("#iframe-i"),
      document.querySelector("#dynamic-xbrl-form"),
      document.querySelector(".ix-content"),
      document.querySelector("#contentDiv"),
      document.querySelector("#filing_document"),
      document.body
    ].filter(Boolean);

    let best = "";
    for (const root of roots) {
      if (root.tagName === "IFRAME") {
        try {
          const doc = root.contentDocument;
          const t = normalizeStatementText(doc?.body?.innerText || "");
          if (t.length > best.length) best = t;
        } catch {
          // cross-origin
        }
        continue;
      }
      const t = normalizeStatementText(root.innerText || "");
      if (t.length > best.length) best = t;
    }

    // Walk same-origin iframes generally
    try {
      document.querySelectorAll("iframe").forEach((frame) => {
        try {
          const t = normalizeStatementText(
            frame.contentDocument?.body?.innerText || ""
          );
          if (t.length > best.length) best = t;
        } catch {
          // ignore
        }
      });
    } catch {
      // ignore
    }

    return best || normalizeStatementText(document.documentElement?.innerText || "");
  }

  function scoreFinancialText(text) {
    const t = String(text || "").toLowerCase();
    let score = 0;
    const keys = [
      "revenue",
      "net income",
      "gross profit",
      "operating income",
      "cash and cash equivalents",
      "in millions",
      "total assets",
      "statements of income",
      "balance sheets"
    ];
    for (const k of keys) {
      if (t.includes(k)) score += 1;
    }
    if (/\d{1,3}(,\d{3})+/.test(t)) score += 2;
    return score;
  }

  function isSecBlockedText(text) {
    return /undeclared automated tool|your request has been identified/i.test(
      String(text || "")
    );
  }

  function isProbablySecDocUrl(url) {
    return /\/archives\/edgar\/data\/.+\.htm/i.test(String(url || ""));
  }

  function resolveDocumentUrl() {
    const params = new URLSearchParams(location.search);
    const doc = params.get("doc") || params.get("filename");
    if (doc) {
      try {
        return new URL(doc, location.origin).href;
      } catch {
        // fall through
      }
    }

    if (/\/ixviewer\//i.test(location.pathname)) {
      const d = params.get("doc");
      if (d) {
        try {
          return new URL(d, location.origin).href;
        } catch {
          return location.href;
        }
      }
    }

    return location.href;
  }

  /**
   * Detect form type from the COVER PAGE first (first ~6k chars).
   * Full-filing scans false-positive on cross-references like “see our Form 10-K”.
   */
  function detectFilingType(text, title, url) {
    const cover = String(text || "").slice(0, 6000);
    const head = `${cover}\n${title || ""}\n${url || ""}`;

    // URL is the most reliable signal for ownership transforms (xsl144, xslF345…)
    const u = String(url || "").toLowerCase();
    if (/xsl144|form144|\/144\.xml|submissiontype>144|form\s*144/i.test(u)) {
      return "144";
    }
    // Form 3/4/5 ownership HTML transforms (before generic 13G path noise)
    if (/xslf345x0?3|form3|wlform3/i.test(u) && !/xsl144/i.test(u)) return "3";
    if (/xslf345x0?5|form5|wlform5/i.test(u) && !/xsl144/i.test(u)) return "5";
    if (
      (/xslf345|ownership\.xml|form4|\/4\.xml|wlform4/i.test(u) ||
        /primary_doc\.xml/i.test(u)) &&
      !/form\s*144|xsl144|13[dg]|sc13/i.test(u)
    ) {
      if (/xslf345|form4|wlform4|\/4\.xml/i.test(u)) return "4";
    }
    if (/sc13g|schedule.?13g|13g[\._/-]|xsl.*13g/i.test(u)) return "SC 13G";
    if (/sc13d|schedule.?13d|13d[\._/-]|xsl.*13d/i.test(u)) return "SC 13D";
    if (/\/8-?k|form8-?k|current.?report/i.test(u) && !/10-?k|10-?q/i.test(u)) {
      if (/8-?k/i.test(u)) return "8-K";
    }
    if (/10-?q/i.test(u)) return "10-Q";
    if (/10-?k/i.test(u) && !/10-?q/i.test(u)) return "10-K";

    // Strong cover-page signals (order matters: Form 144 before bare “4”, Q before K).
    const coverChecks = [
      [/\bFORM\s+144\b/i, "144"],
      [/\bNOTICE OF PROPOSED SALE OF SECURITIES\b/i, "144"],
      [/\bPURSUANT TO RULE 144\b/i, "144"],
      [/\b144:\s*Filer Information\b/i, "144"],
      [/\bFORM\s+10-Q\/A\b/i, "10-Q"],
      [/\bFORM\s+10-Q\b/i, "10-Q"],
      [/\bQUARTERLY\s+REPORT\b(?:\s+PURSUANT TO SECTION 13|\s+FOR THE)/i, "10-Q"],
      [/\bFOR THE QUARTERLY PERIOD ENDED\b/i, "10-Q"],
      [/\bFORM\s+10-K\/A\b/i, "10-K"],
      [/\bFORM\s+10-K\b/i, "10-K"],
      [/\bANNUAL\s+REPORT\b(?:\s+PURSUANT TO SECTION 13|\s+FOR THE)/i, "10-K"],
      [/\bFOR THE FISCAL YEAR ENDED\b/i, "10-K"],
      [/\bFORM\s+8-K\/A\b/i, "8-K"],
      [/\bFORM\s+8-K\b/i, "8-K"],
      [/\bCURRENT\s+REPORT\b(?:\s+PURSUANT TO SECTION 13|\s+OR\s+15\(d\))/i, "8-K"],
      [/\bSCHEDULE\s+13D\/A\b/i, "SC 13D"],
      [/\bSCHEDULE\s+13D\b/i, "SC 13D"],
      [/\bSCHEDULE\s+13G\/A\b/i, "SC 13G"],
      [/\bSCHEDULE\s+13G\b/i, "SC 13G"],
      [/\bSC\s+13D\/A\b/i, "SC 13D"],
      [/\bSC\s+13D\b/i, "SC 13D"],
      [/\bSC\s+13G\/A\b/i, "SC 13G"],
      [/\bSC\s+13G\b/i, "SC 13G"],
      [/\bINFORMATION TO BE INCLUDED IN STATEMENTS FILED PURSUANT\b/i, "SC 13G"],
      [/\bFORM\s+4\/A\b/i, "4"],
      [/\bFORM\s+4\b/i, "4"],
      [/\bFORM\s+3\/A\b/i, "3"],
      [/\bFORM\s+3\b/i, "3"],
      [/\bFORM\s+5\/A\b/i, "5"],
      [/\bFORM\s+5\b/i, "5"],
      [/\bSTATEMENT OF CHANGES IN BENEFICIAL OWNERSHIP\b/i, "4"],
      [/\bINITIAL STATEMENT OF BENEFICIAL OWNERSHIP\b/i, "3"],
      [/\bFORM\s+20-F\b/i, "20-F"],
      [/\bFORM\s+6-K\b/i, "6-K"],
      [/\bFORM\s+S-1\b/i, "S-1"],
      [/\bFORM\s+S-3\b/i, "S-3"],
      [/\bDEF\s*14A\b/i, "DEF 14A"],
      [/\bPROXY\s+STATEMENT\b/i, "DEF 14A"]
    ];

    for (const [re, type] of coverChecks) {
      if (re.test(head)) return type;
    }

    // XML / submission type tokens in body (ownership filings)
    if (/<own:submissionType>\s*144\s*</i.test(text) || /submissionType>\s*144\s*</i.test(text)) {
      return "144";
    }
    if (/<own:submissionType>\s*4\s*</i.test(text) || /submissionType>\s*4\s*</i.test(text)) {
      return "4";
    }
    if (/percent of class represented by amount/i.test(cover) && /13G/i.test(head)) {
      return "SC 13G";
    }

    // Last resort: first explicit FORM token in cover only (not whole doc)
    if (/\bForm\s+144\b|\bFORM\s+144\b/i.test(cover)) return "144";
    if (/\b10-Q\b/i.test(cover)) return "10-Q";
    if (/\b10-K\b/i.test(cover)) return "10-K";
    if (/\b8-K\b/i.test(cover)) return "8-K";
    if (/\b13G\b/i.test(cover)) return "SC 13G";
    if (/\b13D\b/i.test(cover)) return "SC 13D";

    return "UNKNOWN";
  }

  /**
   * Post-parse quality gate for the five MVP form packs.
   * Does not invent numbers — only rates completeness of what was found.
   */
  function assessExtractQuality(filingType, parsed) {
    const t = String(filingType || parsed?.filingType || "").toUpperCase();
    const ci = parsed?.corporateIntel;
    const checks = [];
    let score = 0;
    let max = 0;

    const add = (ok, label) => {
      max += 1;
      if (ok) score += 1;
      checks.push({ ok: Boolean(ok), label });
    };

    if (/^10-Q/.test(t) || /^10-K/.test(t)) {
      const fin = parsed?.financials || {};
      add(Boolean(fin.revenue?.display || fin.netIncome?.display), "Revenue or net income");
      add(
        Boolean(fin.totalAssets?.display || fin.cashAndEquivalents?.display),
        "Balance sheet item"
      );
      add(Boolean(parsed?.periodEnd || parsed?.filingDate), "Period / filing date");
      add((parsed?.metricsFound || 0) >= 3, "At least 3 financial metrics");
    } else if (/^8-K/.test(t)) {
      add(Boolean(ci?.items?.length || parsed?.eightK), "8-K item or event class");
      add(Boolean(parsed?.companyName && parsed.companyName !== "Unknown issuer"), "Issuer name");
      add(Boolean(ci?.headline || parsed?.eightK?.label), "Event headline");
    } else if (t === "4" || t === "3" || t === "5") {
      add(Boolean(ci?.people?.length), "Reporting person");
      add(
        Boolean(ci?.transactions?.length || ci?.facts?.some((f) => /share|price|transaction/i.test(f.label || ""))),
        "Transaction or holdings fact"
      );
      add(Boolean(ci?.facts?.some((f) => /relationship|issuer/i.test(f.label || ""))), "Relationship / issuer");
    } else if (t === "144") {
      add(Boolean(ci?.facts?.some((f) => /issuer/i.test(f.label || "")) || ci?.issuerName), "Issuer");
      add(Boolean(ci?.people?.length || ci?.facts?.some((f) => /person|seller|account/i.test(f.label || ""))), "Seller");
      add(
        Boolean(
          ci?.transactions?.length ||
            ci?.facts?.some((f) => /share|units to be sold|market value/i.test(f.label || ""))
        ),
        "Shares / market value"
      );
    } else if (/13G|13D/.test(t)) {
      add(
        Boolean(ci?.people?.length || ci?.organizations?.length),
        "Reporting person / entity"
      );
      add(
        Boolean(ci?.facts?.some((f) => /%|percent|ownership|shares beneficially/i.test(f.label || ""))),
        "Ownership % or shares"
      );
      add(Boolean(ci?.headline || ci?.facts?.length), "Structured facts");
    } else {
      add(Boolean(parsed?.companyName), "Company name");
      add(Boolean(ci || (parsed?.metricsFound || 0) > 0), "Any structured extract");
    }

    const ratio = max ? score / max : 0;
    const level = ratio >= 0.75 ? "high" : ratio >= 0.4 ? "medium" : "low";
    return {
      level,
      score,
      max,
      checks,
      summary:
        level === "high"
          ? "Strong extract"
          : level === "medium"
          ? "Partial extract — open primary HTML if fields look thin"
          : "Thin extract — confirm form page finished loading, then re-extract"
    };
  }

  /**
   * SEC cover layout is typically:
   *   NVIDIA CORPORATION
   *   (Exact name of registrant as specified in its charter)
   *   Delaware
   *   (State or other jurisdiction of incorporation)
   * So the legal name is ABOVE the “Exact name…” label — not below.
   */
  function extractCompanyName(text, title) {
    const cover = String(text || "").slice(0, 14000);

    // 1) Name immediately above “(Exact name of registrant…)”
    const aboveExact = cover.match(
      /([A-Z][A-Za-z0-9&.,'\- ]{2,100}?)\s*[\n\r]+\s*\(\s*Exact name of (?:registrant|issuer)/i
    );
    if (aboveExact?.[1] && isPlausibleCompanyName(aboveExact[1])) {
      return cleanCompanyName(aboveExact[1]);
    }

    // 2) Same line patterns sometimes used in HTML linearization
    const sameLineExact = cover.match(
      /([A-Z][A-Za-z0-9&.,'\- ]{2,100}?)\s*\(\s*Exact name of (?:registrant|issuer)/i
    );
    if (sameLineExact?.[1] && isPlausibleCompanyName(sameLineExact[1])) {
      return cleanCompanyName(sameLineExact[1]);
    }

    // 3) Name after label (alternate layouts)
    const afterExact = cover.match(
      /Exact\s+name\s+of\s+(?:registrant|issuer)[^\n]{0,60}[\n\r\s]+([A-Z][A-Za-z0-9&.,'\- ]{2,100})/i
    );
    if (afterExact?.[1] && isPlausibleCompanyName(afterExact[1])) {
      return cleanCompanyName(afterExact[1]);
    }

    // 4) Legal entity line ending in CORPORATION / INC / etc. on cover
    const corpLines = [
      ...cover.matchAll(
        /(?:^|\n)\s*([A-Z][A-Z0-9&.,'\- ]{2,90}\b(?:INCORPORATED|INC\.?|CORP\.?|CORPORATION|COMPANY|CO\.|LTD\.?|LLC|L\.P\.|PLC|N\.?V\.?|S\.?A\.?))\s*(?:\n|$)/g
      )
    ];
    for (const m of corpLines) {
      if (m[1] && isPlausibleCompanyName(m[1])) {
        return cleanCompanyName(m[1]);
      }
    }

    // 5) "NVIDIA Corporation and Subsidiaries" on financial statement headers
    const stmtHeader = String(text || "").match(
      /([A-Z][A-Za-z0-9&.,'\- ]{2,70})\s+and\s+Subsidiaries/i
    );
    if (stmtHeader?.[1] && isPlausibleCompanyName(stmtHeader[1])) {
      return cleanCompanyName(stmtHeader[1]);
    }

    // 6) Browser tab title (Inline Viewer: NVIDIA CORP)
    const titleClean = String(title || "")
      .replace(/\s*[-|]\s*SEC\.gov.*$/i, "")
      .replace(/\bInline Viewer:?\s*/i, "")
      .replace(/\bFORM\b/i, "")
      .replace(
        /\b(10-Q\/A|10-K\/A|10-Q|10-K|8-K\/A|8-K|20-F|6-K|S-1|S-3|DEF\s*14A)\b.*$/i,
        ""
      )
      .replace(/\s*[-–—|].*$/, "")
      .trim();

    if (titleClean && isPlausibleCompanyName(titleClean)) {
      return cleanCompanyName(titleClean);
    }

    // 7) First plausible cover line that looks like an issuer (not a US state)
    const firstLines = cover
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 80);

    const skip = [
      /^UNITED STATES/i,
      /^SECURITIES AND EXCHANGE/i,
      /^WASHINGTON/i,
      /^FORM\s/i,
      /^COMMISSION\s+FILE/i,
      /^Table of Contents$/i,
      /^CIK/i,
      /^Accession/i,
      /^Filing Detail/i,
      /^SEC\.gov/i,
      /^Document Format Files/i,
      /^CURRENT REPORT/i,
      /^QUARTERLY REPORT/i,
      /^ANNUAL REPORT/i,
      /^For the quarterly period/i,
      /^For the fiscal year/i,
      /^\(/,
      /^Commission File/i,
      /^I\.?R\.?S\.?/i,
      /^Address of/i,
      /^Registrant/i,
      /^State or other/i,
      /^\(?\d{3}\)?/
    ];

    const candidate = firstLines.find(
      (line) =>
        line.length > 3 &&
        line.length < 100 &&
        !skip.some((re) => re.test(line)) &&
        isPlausibleCompanyName(line)
    );

    return cleanCompanyName(candidate || "Unknown issuer");
  }

  function isPlausibleCompanyName(value) {
    const v = String(value || "").trim();
    if (v.length < 3 || v.length > 100) return false;
    if (/^nvda-\d/i.test(v)) return false;
    if (/\.htm/i.test(v)) return false;
    if (/^\d+$/.test(v)) return false;
    if (/^[a-z]{1,6}$/.test(v)) return false; // bare ticker
    if (/^unknown/i.test(v)) return false;
    if (/^united states$/i.test(v)) return false;
    if (/^securities and exchange/i.test(v)) return false;
    if (/^washington,?\s*d\.?c/i.test(v)) return false;
    if (/^commission file/i.test(v)) return false;
    if (/^exact name/i.test(v)) return false;
    if (/^state or other/i.test(v)) return false;
    if (/jurisdiction of incorporation/i.test(v)) return false;
    // Reject US states (self-contained — no outer const / TDZ risk)
    if (isUsStateName(v)) return false;
    if (!/[A-Za-z]{2,}/.test(v)) return false;
    return true;
  }

  function isUsStateName(value) {
    const s = String(value || "").trim().toLowerCase();
    // Common incorporation jurisdictions that appear on SEC covers
    return (
      s === "delaware" ||
      s === "nevada" ||
      s === "california" ||
      s === "new york" ||
      s === "texas" ||
      s === "florida" ||
      s === "maryland" ||
      s === "virginia" ||
      s === "washington" ||
      s === "massachusetts" ||
      s === "pennsylvania" ||
      s === "new jersey" ||
      s === "ohio" ||
      s === "illinois" ||
      s === "georgia" ||
      s === "north carolina" ||
      s === "colorado" ||
      s === "minnesota" ||
      s === "michigan" ||
      s === "arizona" ||
      s === "oregon" ||
      s === "utah" ||
      s === "connecticut" ||
      s === "indiana" ||
      s === "wisconsin" ||
      s === "missouri" ||
      s === "tennessee" ||
      s === "alabama" ||
      s === "louisiana" ||
      s === "kentucky" ||
      s === "oklahoma" ||
      s === "iowa" ||
      s === "kansas" ||
      s === "arkansas" ||
      s === "mississippi" ||
      s === "nebraska" ||
      s === "new mexico" ||
      s === "west virginia" ||
      s === "idaho" ||
      s === "hawaii" ||
      s === "maine" ||
      s === "new hampshire" ||
      s === "rhode island" ||
      s === "montana" ||
      s === "south carolina" ||
      s === "south dakota" ||
      s === "north dakota" ||
      s === "alaska" ||
      s === "vermont" ||
      s === "wyoming" ||
      s === "district of columbia" ||
      s === "puerto rico"
    );
  }

  function cleanCompanyName(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .replace(/[|]+/g, " ")
      .replace(/^\(+|\)+$/g, "")
      .trim()
      .slice(0, 120);
  }

  /** Forms that are filed multiple times per year and need a quarter picker. */
  function formNeedsQuarter(formType) {
    const t = String(formType || "").toUpperCase();
    return t === "10-Q" || t === "10-Q/A";
  }

  function extractCikFromUrl(url) {
    const match = String(url || "").match(/\/data\/(\d+)\//i);
    return match ? match[1] : null;
  }


  /* ── Insurance metrics / risk / 8-K (rules-only) ─────── */

  const INSURANCE_METRIC_SPECS = [
    {
      key: "combinedRatio",
      label: "Combined Ratio",
      unit: "pct",
      labels: ["Combined ratio", "Combined ratios", "GAAP combined ratio", "Statutory combined ratio"],
      patterns: [/combined\s+ratio[s]?\b/i]
    },
    {
      key: "lossRatio",
      label: "Loss Ratio",
      unit: "pct",
      labels: ["Loss ratio", "Loss and LAE ratio", "Loss & LAE ratio", "Net loss ratio"],
      patterns: [/\bloss\s+(?:and\s+lae\s+)?ratio\b/i]
    },
    {
      key: "expenseRatio",
      label: "Expense Ratio",
      unit: "pct",
      labels: ["Expense ratio", "Underwriting expense ratio"],
      patterns: [/\b(?:underwriting\s+)?expense\s+ratio\b/i]
    },
    {
      key: "netPremiumsWritten",
      label: "Net Premiums Written",
      unit: "money",
      labels: ["Net premiums written", "Net written premiums", "NPW"],
      patterns: [/net\s+(?:premiums?\s+written|written\s+premiums?)\b/i]
    },
    {
      key: "netPremiumsEarned",
      label: "Net Premiums Earned",
      unit: "money",
      labels: ["Net premiums earned", "Net earned premiums", "NPE"],
      patterns: [/net\s+(?:premiums?\s+earned|earned\s+premiums?)\b/i]
    },
    {
      key: "catastropheLosses",
      label: "Catastrophe Losses",
      unit: "money",
      labels: ["Catastrophe losses", "Catastrophe loss", "Cat losses", "CAT losses"],
      patterns: [/cat(?:astrophe)?\s+losses?\b/i]
    },
    {
      key: "reserveDevelopment",
      label: "Prior-Year Reserve Development",
      unit: "money",
      labels: [
        "Prior year reserve development",
        "Prior-year reserve development",
        "Favorable prior year reserve development",
        "Unfavorable prior year reserve development",
        "Reserve development"
      ],
      patterns: [/(?:prior[- ]year\s+)?reserve\s+development\b/i, /(?:favorable|unfavourable|unfavorable)\s+(?:prior[- ]year\s+)?(?:loss\s+)?reserve/i]
    },
    {
      key: "reinsuranceRecoverables",
      label: "Reinsurance Recoverables",
      unit: "money",
      labels: ["Reinsurance recoverables", "Reinsurance recoverable"],
      patterns: [/reinsurance\s+recoverables?\b/i]
    },
    {
      key: "investmentIncome",
      label: "Net Investment Income",
      unit: "money",
      labels: ["Net investment income", "Investment income"],
      patterns: [/net\s+investment\s+income\b/i, /^investment\s+income\b/i]
    },
    {
      key: "returnOnEquity",
      label: "Return on Equity",
      unit: "pct",
      labels: ["Return on equity", "ROE"],
      patterns: [/\breturn\s+on\s+equity\b/i, /\bROE\b/]
    }
  ];

  const RISK_CATEGORIES = [
    {
      key: "cat_exposure",
      title: "Catastrophe exposure",
      keywords: [
        "hurricane", "wildfire", "earthquake", "flood", "catastrophe", "cat loss",
        "storm", "tornado", "geographic concentration", "severe weather", "convective storm"
      ],
      intensity: ["material", "significant", "substantial", "adverse", "concentrated"]
    },
    {
      key: "reserve",
      title: "Reserve adequacy",
      keywords: [
        "reserve development", "adverse development", "reserve strengthening",
        "loss reserve", "uncertainty", "actuarial", "prior year development", "reserve adequacy"
      ],
      intensity: ["adverse", "unfavorable", "unfavourable", "material", "significant", "deficient"]
    },
    {
      key: "reinsurance",
      title: "Reinsurance counterparty",
      keywords: [
        "reinsurance recoverable", "reinsurer", "ceded premium", "retrocession",
        "reinsurance program", "treaty", "collateralized reinsurance"
      ],
      intensity: ["concentration", "default", "credit risk", "material", "significant"]
    },
    {
      key: "regulatory",
      title: "Regulatory risk",
      keywords: [
        "department of insurance", "rate filing", "consent order", "regulatory",
        "doi investigation", "market conduct", "capital requirement", "rbc"
      ],
      intensity: ["investigation", "enforcement", "restriction", "material", "significant"]
    },
    {
      key: "litigation",
      title: "Litigation / social inflation",
      keywords: [
        "nuclear verdict", "litigation funding", "social inflation", "jury award",
        "class action", "bad faith", "extra-contractual"
      ],
      intensity: ["material", "significant", "adverse", "increasing"]
    },
    {
      key: "investment",
      title: "Investment portfolio",
      keywords: [
        "duration mismatch", "credit quality", "unrealized loss", "fixed income portfolio",
        "investment portfolio", "other-than-temporary", "ottti", "impairment"
      ],
      intensity: ["material", "significant", "adverse", "downgrade"]
    }
  ];

  const EIGHT_K_EVENTS = [
    {
      key: "executive_departure",
      label: "Executive departure / appointment",
      patterns: [/item\s*5\.02/i, /departure of directors/i, /\bresign(?:ed|ation)\b/i, /\bappointed\b.*\b(ceo|cfo|president|chief)\b/i],
      blurb: "Leadership change at an insurer can precede reserve restatements or strategy shifts. Cross-check recent 10-Q reserve language."
    },
    {
      key: "cat_loss",
      label: "Catastrophe / loss announcement",
      patterns: [/catastroph/i, /\bcat\s+loss/i, /estimated\s+losses?\b/i, /weather[- ]related/i],
      blurb: "Compare disclosed cat losses to prior-year CAT guidance and reinsurance attachment points in the last 10-Q."
    },
    {
      key: "rating_action",
      label: "Rating agency action",
      patterns: [/am\s*best/i, /moody'?s/i, /standard\s*&\s*poor/i, /\brating\s+(?:outlook|downgrade|upgrade)/i],
      blurb: "Rating moves can affect surplus-lines eligibility and reinsurance treaty triggers. Review capital and reinsurance notes."
    },
    {
      key: "regulatory",
      label: "Regulatory investigation / order",
      patterns: [/department of insurance/i, /consent order/i, /regulatory investigation/i, /market conduct/i],
      blurb: "Note jurisdiction and lines of business. Scan recent 10-K/Q for similar disclosures and capital impacts."
    },
    {
      key: "reinsurance_change",
      label: "Reinsurance program change",
      patterns: [/reinsurance\s+(?:program|treaty|agreement)/i, /ceded\s+reinsurance/i, /retrocession/i],
      blurb: "Treaty changes can alter retained cat exposure and earnings volatility. Map vs prior year reinsurance structure."
    },
    {
      key: "earnings",
      label: "Earnings / results release",
      patterns: [/item\s*2\.02/i, /results of operations/i, /earnings release/i, /financial results/i],
      blurb: "Use Extract on the attached exhibits or the related 10-Q for full ratio and reserve detail."
    },
    {
      key: "other",
      label: "Other material event",
      patterns: [/item\s*8\.01/i, /item\s*1\.01/i, /material definitive agreement/i],
      blurb: "Material event disclosed. Open the 8-K body and exhibits for insurance-specific impact."
    }
  ];

  function extractInsuranceMetrics(text, windows, scaleMap) {
    const out = {};
    const full = String(text || "");
    const lines = full.split(/\n+/);

    // Narrative KPI patterns (MD&A often uses prose, not table rows)
    const narrativePatterns = {
      combinedRatio: [
        /combined\s+ratio\s+(?:was|of|is|were)\s+(\d{1,3}(?:\.\d+)?)\s*%/i,
        /combined\s+ratio\s*[:=]\s*(\d{1,3}(?:\.\d+)?)\s*%/i,
        /(\d{1,3}(?:\.\d+)?)\s*%\s+combined\s+ratio/i
      ],
      lossRatio: [
        /loss\s+(?:and\s+lae\s+)?ratio\s+(?:was|of|is|were)\s+(\d{1,3}(?:\.\d+)?)\s*%/i,
        /loss\s+(?:and\s+lae\s+)?ratio\s*[:=]\s*(\d{1,3}(?:\.\d+)?)\s*%/i
      ],
      expenseRatio: [
        /(?:underwriting\s+)?expense\s+ratio\s+(?:was|of|is|were)\s+(\d{1,3}(?:\.\d+)?)\s*%/i,
        /(?:underwriting\s+)?expense\s+ratio\s*[:=]\s*(\d{1,3}(?:\.\d+)?)\s*%/i
      ]
    };

    for (const spec of INSURANCE_METRIC_SPECS) {
      let hit = null;

      // Prefer exact-ish line labels with nearby number
      for (const line of lines) {
        const trimmed = line.replace(/\s+/g, " ").trim();
        if (trimmed.length < 4 || trimmed.length > 280) continue;
        const labelHit = (spec.labels || []).some((lab) => {
          const tl = lab.toLowerCase();
          const ln = trimmed.toLowerCase();
          return ln === tl || ln.startsWith(tl + " ") || ln.startsWith(tl + ":") || ln.includes(tl);
        });
        const patHit = (spec.patterns || []).some((re) => re.test(trimmed));
        if (!labelHit && !patHit) continue;

        const nums = extractPercentOrMoneyFromLine(trimmed, spec.unit);
        if (!nums.current && nums.current !== 0) continue;

        // Sanity: ratios should be in a plausible band
        if (spec.unit === "pct" && (nums.current < 0 || nums.current > 300)) continue;

        hit = {
          key: spec.key,
          label: spec.label,
          unit: spec.unit,
          value: nums.current,
          prior: nums.prior,
          display: formatInsuranceValue(nums.current, spec.unit),
          priorDisplay: nums.prior != null ? formatInsuranceValue(nums.prior, spec.unit) : null,
          delta: nums.prior != null && nums.current != null ? nums.current - nums.prior : null,
          source: "table_or_line",
          confidence: "medium",
          line: trimmed.slice(0, 140),
          interpretation: interpretInsuranceMetric(spec.key, nums.current, nums.prior),
          tone: insuranceTone(spec.key, nums.current)
        };
        break;
      }

      // MD&A / narrative fallback for key ratios
      if (!hit && narrativePatterns[spec.key]) {
        for (const re of narrativePatterns[spec.key]) {
          const m = full.match(re);
          if (!m) continue;
          const v = Number(m[1]);
          if (!Number.isFinite(v) || v < 0 || v > 300) continue;
          hit = {
            key: spec.key,
            label: spec.label,
            unit: spec.unit,
            value: v,
            prior: null,
            display: formatInsuranceValue(v, spec.unit),
            priorDisplay: null,
            delta: null,
            source: "narrative_mda",
            confidence: "medium",
            line: m[0].slice(0, 140),
            interpretation: interpretInsuranceMetric(spec.key, v, null),
            tone: insuranceTone(spec.key, v)
          };
          break;
        }
      }

      if (hit) out[spec.key] = hit;
    }

    // Reserve development favourability from surrounding language
    if (out.reserveDevelopment) {
      const ctx = (out.reserveDevelopment.line || "").toLowerCase();
      if (/unfavourable|unfavorable|adverse/.test(ctx)) {
        out.reserveDevelopment.direction = "unfavourable";
      } else if (/favourable|favorable/.test(ctx)) {
        out.reserveDevelopment.direction = "favourable";
      } else {
        out.reserveDevelopment.direction = "not_classified";
      }
      out.reserveDevelopment.interpretation = interpretReserveDevelopment(
        out.reserveDevelopment.value,
        out.reserveDevelopment.direction
      );
    }

    return out;
  }

  function extractPercentOrMoneyFromLine(line, unit) {
    // Capture numbers like 94.2%, (1.2), 1,234.5, $2.3 billion handled elsewhere as raw
    const cleaned = line.replace(/\$/g, " ");
    const matches = [];
    const re = /\(?\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+\.\d+|\d+\)?/g;
    let m;
    while ((m = re.exec(cleaned)) !== null) {
      let raw = m[0];
      let neg = false;
      if (raw.startsWith("(") && raw.endsWith(")")) {
        neg = true;
        raw = raw.slice(1, -1);
      }
      // Skip years
      const n = Number(raw.replace(/,/g, ""));
      if (!Number.isFinite(n)) continue;
      if (n >= 1900 && n <= 2100 && !raw.includes(".")) continue;
      // For pct metrics, prefer numbers that look like ratios (0-200) near %
      matches.push({ n: neg ? -n : n, idx: m.index, hasPct: /%/.test(cleaned.slice(m.index, m.index + raw.length + 2)) });
    }

    if (!matches.length) return { current: null, prior: null };

    let candidates = matches;
    if (unit === "pct") {
      const pctish = matches.filter((x) => x.hasPct || (Math.abs(x.n) <= 250 && Math.abs(x.n) > 0));
      if (pctish.length) candidates = pctish;
    }

    const current = candidates[0]?.n ?? null;
    const prior = candidates[1]?.n ?? null;
    return { current, prior };
  }

  function formatInsuranceValue(value, unit) {
    if (value == null || !Number.isFinite(value)) return MISSING_METRIC;
    if (unit === "pct") {
      return `${value.toFixed(Math.abs(value) >= 10 ? 1 : 2)}%`;
    }
    // money — show compact if large
    const abs = Math.abs(value);
    const sign = value < 0 ? "-" : "";
    if (abs >= 1000) {
      return `${sign}${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value)}`;
    }
    return `${sign}${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value)}`;
  }

  function insuranceTone(key, value) {
    if (value == null || !Number.isFinite(value)) return "neutral";
    if (key === "combinedRatio") {
      if (value < 95) return "good";
      if (value <= 100) return "ok";
      if (value <= 105) return "warn";
      return "bad";
    }
    if (key === "lossRatio") {
      if (value < 60) return "good";
      if (value <= 70) return "ok";
      if (value <= 80) return "warn";
      return "bad";
    }
    if (key === "expenseRatio") {
      if (value < 30) return "good";
      if (value <= 35) return "ok";
      return "warn";
    }
    return "neutral";
  }

  function interpretInsuranceMetric(key, value, prior) {
    if (value == null || !Number.isFinite(value)) return "This metric was not disclosed in the extracted filing text.";
    const delta =
      prior != null && Number.isFinite(prior)
        ? ` Prior period ${formatInsuranceValue(prior, key.includes("Ratio") || key === "returnOnEquity" ? "pct" : "money")}; change ${
            value - prior >= 0 ? "+" : ""
          }${(value - prior).toFixed(1)}${key.includes("Ratio") || key === "returnOnEquity" ? " pts" : ""}.`
        : "";

    if (key === "combinedRatio") {
      if (value < 100) {
        return `Underwriting profitable on a combined-ratio basis (${value.toFixed(1)}% < 100%).${delta}`;
      }
      return `Combined ratio above 100% — underwriting loss on this measure (${value.toFixed(1)}%).${delta}`;
    }
    if (key === "lossRatio") {
      return `Loss ratio ${value.toFixed(1)}% of premiums (claims cost intensity).${delta}`;
    }
    if (key === "expenseRatio") {
      return `Expense ratio ${value.toFixed(1)}% — operating cost load vs premiums.${delta}`;
    }
    if (key === "netPremiumsWritten") {
      return `Net premiums written as reported in the filing extract.${delta}`;
    }
    if (key === "netPremiumsEarned") {
      return `Net premiums earned as reported in the filing extract.${delta}`;
    }
    if (key === "catastropheLosses") {
      return `Catastrophe losses flagged in text near CAT language.${delta}`;
    }
    if (key === "reinsuranceRecoverables") {
      return `Reinsurance recoverables — key solvency / counterparty signal when large vs surplus.${delta}`;
    }
    if (key === "investmentIncome") {
      return `Net investment income as labeled in the filing.${delta}`;
    }
    if (key === "returnOnEquity") {
      return `Return on equity ${value.toFixed(1)}% as disclosed.${delta}`;
    }
    return `Extracted from filing text.${delta}`;
  }

  function interpretReserveDevelopment(value, direction) {
    const amt =
      value != null && Number.isFinite(value)
        ? formatInsuranceValue(value, "money")
        : "amount not parsed";
    if (direction === "favourable") {
      return `Favourable prior-year reserve development (${amt}) — prior accident years developing better than expected.`;
    }
    if (direction === "unfavourable") {
      return `Unfavourable prior-year reserve development (${amt}) — watch reserve adequacy language in MD&A.`;
    }
    return `Reserve development mentioned (${amt}). Check whether development is favourable or adverse in context.`;
  }

  function scanInsuranceRisks(text, lower) {
    const results = [];
    // Prefer Item 1A window when present
    let hay = String(text || "");
    const riskIdx = lower.indexOf("risk factors");
    if (riskIdx >= 0) {
      hay = text.slice(riskIdx, riskIdx + 25000);
    }
    const hayLower = hay.toLowerCase();

    for (const cat of RISK_CATEGORIES) {
      let hits = 0;
      let intensity = 0;
      let snippet = "";
      for (const kw of cat.keywords) {
        const idx = hayLower.indexOf(kw);
        if (idx >= 0) {
          hits += 1;
          if (!snippet) {
            snippet = hay.slice(Math.max(0, idx - 40), Math.min(hay.length, idx + 120)).replace(/\s+/g, " ").trim();
          }
        }
      }
      for (const word of cat.intensity) {
        if (hayLower.includes(word) && hits > 0) intensity += 1;
      }
      if (!hits) continue;
      let level = "LOW";
      if (hits >= 3 || (hits >= 2 && intensity >= 2)) level = "HIGH";
      else if (hits >= 2 || intensity >= 1) level = "MEDIUM";

      results.push({
        key: cat.key,
        title: cat.title,
        level,
        hits,
        snippet: snippet.slice(0, 160),
        explanation: riskExplanation(cat.key, level)
      });
    }

    const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    results.sort((a, b) => order[a.level] - order[b.level] || b.hits - a.hits);
    return results.slice(0, 6);
  }

  function riskExplanation(key, level) {
    const base = {
      cat_exposure: "Language suggests catastrophe / geographic concentration themes.",
      reserve: "Reserve adequacy or development language appears in the extract.",
      reinsurance: "Reinsurance recoverables or program language is present.",
      regulatory: "Regulatory / DOI / rate-related language detected.",
      litigation: "Litigation or social-inflation style language detected.",
      investment: "Investment portfolio risk language detected."
    };
    return `${base[key] || "Keyword cluster detected."} Severity heuristic: ${level} (keyword density only — not a model opinion).`;
  }

  function classify8KEvent(text, lower) {
    for (const ev of EIGHT_K_EVENTS) {
      if (ev.patterns.some((re) => re.test(text) || re.test(lower))) {
        return {
          key: ev.key,
          label: ev.label,
          blurb: ev.blurb
        };
      }
    }
    return {
      key: "unclassified",
      label: "8-K material event",
      blurb: "Review the 8-K items and exhibits for material business impact."
    };
  }

  /* ── Corporate intelligence (8-K, ownership, insider, proxy) ─ */

  const EIGHT_K_ITEM_CATALOG = [
    { code: "1.01", label: "Entry into a Material Definitive Agreement" },
    { code: "1.02", label: "Termination of a Material Definitive Agreement" },
    { code: "1.03", label: "Bankruptcy or Receivership" },
    { code: "2.01", label: "Completion of Acquisition or Disposition of Assets" },
    { code: "2.02", label: "Results of Operations and Financial Condition" },
    { code: "2.03", label: "Creation of a Direct Financial Obligation" },
    { code: "2.04", label: "Triggering Events That Accelerate or Increase a Direct Financial Obligation" },
    { code: "2.05", label: "Costs Associated with Exit or Disposal Activities" },
    { code: "2.06", label: "Material Impairments" },
    { code: "3.01", label: "Notice of Delisting or Failure to Satisfy a Listing Rule" },
    { code: "3.02", label: "Unregistered Sales of Equity Securities" },
    { code: "3.03", label: "Material Modification to Rights of Security Holders" },
    { code: "4.01", label: "Changes in Registrant's Certifying Accountant" },
    { code: "4.02", label: "Non-Reliance on Previously Issued Financial Statements" },
    { code: "5.01", label: "Changes in Control of Registrant" },
    { code: "5.02", label: "Departure of Directors or Certain Officers; Election of Directors; Appointment of Certain Officers" },
    { code: "5.03", label: "Amendments to Articles of Incorporation or Bylaws; Change in Fiscal Year" },
    { code: "5.05", label: "Amendments to the Registrant's Code of Ethics" },
    { code: "5.07", label: "Submission of Matters to a Vote of Security Holders" },
    { code: "5.08", label: "Shareholder Director Nominations" },
    { code: "7.01", label: "Regulation FD Disclosure" },
    { code: "8.01", label: "Other Events" },
    { code: "9.01", label: "Financial Statements and Exhibits" }
  ];

  function filingIntelKind(filingType) {
    const t = String(filingType || "").toUpperCase().trim();
    if (t === "144" || /^FORM\s*144/.test(t)) return "form144";
    if (/^8-K/.test(t)) return "event";
    if (/13D|13G/.test(t) || /^SC\s*13/.test(t)) return "ownership";
    if (/^(3|4|5)$/.test(t) || /^FORM\s*[345]/.test(t)) return "insider";
    if (/DEF\s*14A|PROXY/.test(t)) return "proxy";
    if (/^(10-K|10-Q|20-F|6-K)/.test(t)) return "financial";
    if (/^S-/.test(t)) return "registration";
    return "other";
  }

  function emptyIntel(kind) {
    return {
      kind: kind || "other",
      formType: "",
      headline: "",
      items: [],
      people: [],
      organizations: [],
      facts: [],
      highlights: [],
      eventTags: [],
      transactions: [],
      sections: [],
      tables: [],
      remarks: ""
    };
  }

  /**
   * Ownership forms often render as xsl-transform/primary_doc.xml with a sibling
   * raw XML at .../accession/primary_doc.xml — that XML is the source of truth.
   * (Avoid star-slash sequences in this comment — they terminate block comments.)
   */
  async function fetchSiblingOwnershipXml(documentUrl) {
    const href = String(documentUrl || location.href || "");
    if (!/sec\.gov/i.test(href)) return "";
    const candidates = [];
    // .../xsl144X01/primary_doc.xml → .../primary_doc.xml
    if (/\/xsl[^/]+\//i.test(href)) {
      candidates.push(href.replace(/\/xsl[^/]+\/[^/]+$/i, "/primary_doc.xml"));
      candidates.push(href.replace(/\/xsl[^/]+\//i, "/"));
    }
    // already primary_doc path variants
    if (!/primary_doc\.xml$/i.test(href)) {
      const base = href.replace(/\/[^/]+$/, "/");
      candidates.push(`${base}primary_doc.xml`);
    }
    for (const url of [...new Set(candidates)]) {
      if (!url || url === href) continue;
      try {
        const res = await sendMessage({
          type: "calio:fetchDocumentText",
          payload: { documentUrl: url }
        });
        // fetchDocumentText strips HTML — for XML we need raw. Use secFetch via download?
        // Prefer raw fetch through background if text still has tags
        if (res?.ok && res.text && /issuerName|noOfUnitsSold|submissionType/i.test(res.text)) {
          return res.text;
        }
      } catch {
        /* try next */
      }
      try {
        const r = await fetch(url, { credentials: "omit" });
        if (!r.ok) continue;
        const body = await r.text();
        if (/issuerName|noOfUnitsSold|submissionType|edgarSubmission/i.test(body)) {
          return body;
        }
      } catch {
        /* next */
      }
    }
    return "";
  }

  /**
   * Form-adaptive structured intel. Each form pack returns its own sections/facts
   * — never force 10-Q line items onto a 144 / Form 4 / 13G.
   */
  function extractCorporateIntel(filingType, text, lower) {
    const kind = filingIntelKind(filingType);
    let intel = emptyIntel(kind);
    intel.formType = String(filingType || "");

    if (kind === "form144" || String(filingType) === "144") {
      intel = extractForm144Intel(text, lower);
    } else if (kind === "event" || /^8-K/i.test(filingType)) {
      Object.assign(intel, extractEightKIntel(text, lower));
      intel.sections = buildSectionsFromFactsAndLists(intel, {
        primaryTitle: "8-K items & signals"
      });
    } else if (kind === "ownership") {
      Object.assign(intel, extractOwnershipIntel(text, lower, filingType));
      intel.sections = buildSectionsFromFactsAndLists(intel, {
        primaryTitle: "Beneficial ownership"
      });
    } else if (kind === "insider") {
      Object.assign(intel, extractInsiderIntel(text, lower, filingType));
      intel.sections = buildSectionsFromFactsAndLists(intel, {
        primaryTitle: "Insider report"
      });
    } else if (kind === "proxy") {
      Object.assign(intel, extractProxyIntel(text, lower));
      intel.sections = buildSectionsFromFactsAndLists(intel, {
        primaryTitle: "Proxy / governance"
      });
    } else if (kind === "financial" || kind === "registration") {
      // Light people/orgs only — financials come from the separate financial pipeline
      intel.people = extractPeopleMentions(text).slice(0, 8);
      intel.organizations = extractOrganizationMentions(text).slice(0, 8);
      if (intel.people.length || intel.organizations.length) {
        intel.headline = "Names referenced in this filing";
        intel.sections = buildSectionsFromFactsAndLists(intel, {
          primaryTitle: "Referenced parties"
        });
      }
    } else {
      // Generic SEC form: labeled field scrape + parties
      Object.assign(intel, extractGenericFormIntel(text, lower, filingType));
    }

    intel.people = uniqueBy(intel.people || [], (p) =>
      String(p.name || p).toLowerCase()
    ).slice(0, 12);
    intel.organizations = uniqueBy(intel.organizations || [], (o) =>
      String(o.name || o).toLowerCase()
    ).slice(0, 12);
    intel.kind = intel.kind || kind;

    const hasSignal =
      (intel.sections && intel.sections.length) ||
      (intel.items && intel.items.length) ||
      (intel.people && intel.people.length) ||
      (intel.organizations && intel.organizations.length) ||
      (intel.facts && intel.facts.length) ||
      (intel.transactions && intel.transactions.length) ||
      (intel.tables && intel.tables.length) ||
      intel.remarks;
    return hasSignal ? intel : null;
  }

  function buildSectionsFromFactsAndLists(intel, { primaryTitle }) {
    const sections = [];
    if (intel.facts?.length) {
      sections.push({ title: primaryTitle || "Key facts", facts: intel.facts });
    }
    if (intel.items?.length) {
      sections.push({
        title: "Items",
        facts: intel.items.map((it) => ({
          label: `Item ${it.code}`,
          value: it.label
        }))
      });
    }
    if (intel.people?.length) {
      sections.push({
        title: "People",
        facts: intel.people.map((p) => ({
          label: p.name,
          value: p.role || ""
        }))
      });
    }
    if (intel.organizations?.length) {
      sections.push({
        title: "Organizations",
        facts: intel.organizations.map((o) => ({
          label: o.name,
          value: o.role || ""
        }))
      });
    }
    return sections;
  }

  /**
   * Form 144 — Notice of Proposed Sale (Rule 144).
   * Fields differ entirely from 10-Q: seller, broker, shares to sell, mkt value, etc.
   */
  function extractForm144Intel(text, lower) {
    const intel = emptyIntel("form144");
    intel.formType = "144";

    const labels = extractSecLabeledFields();
    const xml = extractForm144FromXmlText(text);
    const get = (...keys) => {
      for (const k of keys) {
        if (labels[k]) return labels[k];
        const hit = Object.entries(labels).find(([lk]) =>
          lk.toLowerCase().includes(String(k).toLowerCase())
        );
        if (hit) return hit[1];
      }
      return "";
    };

    // Merge XML (most accurate when page embeds or we have source)
    const issuerName =
      xml.issuerName ||
      get("Name of Issuer", "issuerName") ||
      text.match(/Name of Issuer\s+([A-Z][A-Za-z0-9&.,' \-]{2,60})/i)?.[1] ||
      "";
    const seller =
      xml.seller ||
      get(
        "Name of Person for Whose Account the Securities are To Be Sold",
        "nameOfPersonForWhoseAccountTheSecuritiesAreToBeSold"
      ) ||
      text.match(
        /Name of Person for Whose Account the Securities are To Be Sold\s+([A-Z][A-Za-z0-9&.,' \-.]{2,60})/i
      )?.[1] ||
      "";
    const relationship =
      xml.relationship ||
      get("Relationship to Issuer", "relationshipToIssuer") ||
      text.match(/Relationship to Issuer\s+([A-Za-z][A-Za-z0-9 \-/]{2,40})/i)?.[1] ||
      "";
    const phone =
      xml.phone || get("Phone", "issuerContactPhone") || "";
    const address =
      xml.address ||
      get("Address of Issuer", "issuerAddress") ||
      "";
    const secFile =
      xml.secFileNumber || get("SEC File Number", "secFileNumber") || "";
    const classTitle =
      xml.classTitle ||
      get("Title of the Class of Securities To Be Sold", "securitiesClassTitle") ||
      text.match(/Title of the Class[^\n]*\n?\s*(Common[^\n]*)/i)?.[1] ||
      "Common";
    const broker =
      xml.broker ||
      get("Name and Address of the Broker") ||
      text.match(
        /Name and Address of the Broker[\s\S]{0,40}?([A-Z][A-Za-z0-9&.,' \-]{3,60}(?:LLC|Inc|Corp|LP)?)/i
      )?.[1] ||
      "";
    const brokerAddr = xml.brokerAddress || "";
    const sharesToSell =
      xml.sharesToSell ||
      get("Number of Shares or Other Units To Be Sold", "noOfUnitsSold") ||
      "";
    const mktValue =
      xml.aggregateMarketValue ||
      get("Aggregate Market Value", "aggregateMarketValue") ||
      "";
    const outstanding =
      xml.outstanding ||
      get(
        "Number of Shares or Other Units Outstanding",
        "noOfUnitsOutstanding"
      ) ||
      "";
    const saleDate =
      xml.approxSaleDate ||
      get("Approximate Date of Sale", "approxSaleDate") ||
      "";
    const exchange =
      xml.exchange ||
      get("Name the Securities Exchange", "securitiesExchangeName") ||
      "";
    const acquiredDate = xml.acquiredDate || "";
    const acquisitionNature = xml.acquisitionNature || "";
    const acquiredFrom = xml.acquiredFrom || "";
    const amountAcquired = xml.amountAcquired || "";
    const paymentDate = xml.paymentDate || "";
    const remarks =
      xml.remarks ||
      text.match(/Remarks:?\s*([\s\S]{20,800}?)(?:NOTICE SIGNATURE|Signature|\/s\/)/i)?.[1] ||
      "";
    const noticeDate = xml.noticeDate || "";
    const signature = xml.signature || "";
    const filerCik = xml.filerCik || get("Filer CIK") || "";

    const fmtNum = (n) => {
      const x = String(n || "").replace(/[^\d.]/g, "");
      if (!x) return String(n || "");
      const num = Number(x);
      if (!Number.isFinite(num)) return String(n);
      return new Intl.NumberFormat("en-US").format(num);
    };
    const fmtMoney = (n) => {
      const x = String(n || "").replace(/[^\d.]/g, "");
      if (!x) return String(n || "");
      const num = Number(x);
      if (!Number.isFinite(num)) return String(n);
      if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
      if (num >= 1e3) return `$${new Intl.NumberFormat("en-US").format(num)}`;
      return `$${num}`;
    };

    // People / orgs with proper roles (not generic "referenced")
    if (seller) {
      intel.people.push({
        name: cleanEntityName(seller),
        role: relationship || "Seller (account)"
      });
    }
    if (issuerName) {
      intel.organizations.push({
        name: cleanEntityName(issuerName),
        role: "Issuer"
      });
    }
    if (broker) {
      intel.organizations.push({
        name: cleanEntityName(broker.split("\n")[0]),
        role: "Broker"
      });
    }

    // Structured sections for adaptive UI
    const issuerFacts = [
      { label: "Issuer", value: cleanEntityName(issuerName) },
      { label: "SEC file number", value: secFile },
      { label: "Issuer address", value: normalizeWhitespace(address) },
      { label: "Phone", value: phone }
    ].filter((f) => f.value);

    const sellerFacts = [
      { label: "Person for whose account securities are to be sold", value: cleanEntityName(seller) },
      { label: "Relationship to issuer", value: cleanEntityName(relationship) },
      { label: "Filer CIK", value: filerCik }
    ].filter((f) => f.value);

    const saleFacts = [
      { label: "Class of securities", value: cleanEntityName(classTitle) },
      { label: "Broker", value: cleanEntityName(String(broker).split("\n")[0]) },
      {
        label: "Broker address",
        value: normalizeWhitespace(brokerAddr || String(broker).split("\n").slice(1).join(", "))
      },
      {
        label: "Shares / units to be sold",
        value: sharesToSell ? fmtNum(sharesToSell) : ""
      },
      {
        label: "Aggregate market value",
        value: mktValue ? fmtMoney(mktValue) : ""
      },
      {
        label: "Shares / units outstanding",
        value: outstanding ? fmtNum(outstanding) : ""
      },
      { label: "Approximate date of sale", value: saleDate },
      { label: "Securities exchange", value: exchange }
    ].filter((f) => f.value);

    const acqFacts = [
      { label: "Date acquired", value: acquiredDate },
      { label: "Nature of acquisition", value: acquisitionNature },
      { label: "Acquired from", value: acquiredFrom },
      {
        label: "Amount acquired",
        value: amountAcquired ? fmtNum(amountAcquired) : ""
      },
      { label: "Date of payment", value: paymentDate }
    ].filter((f) => f.value);

    const noticeFacts = [
      { label: "Notice date", value: noticeDate },
      { label: "Signature", value: signature }
    ].filter((f) => f.value);

    intel.sections = [
      issuerFacts.length ? { title: "Issuer information", facts: issuerFacts } : null,
      sellerFacts.length ? { title: "Seller / account", facts: sellerFacts } : null,
      saleFacts.length
        ? { title: "Securities information (proposed sale)", facts: saleFacts }
        : null,
      acqFacts.length
        ? { title: "How the securities were acquired", facts: acqFacts }
        : null,
      noticeFacts.length ? { title: "Notice signature", facts: noticeFacts } : null
    ].filter(Boolean);

    if (remarks) {
      intel.remarks = normalizeWhitespace(remarks).slice(0, 600);
      intel.sections.push({
        title: "Remarks",
        facts: [{ label: "Remarks", value: intel.remarks }]
      });
    }

    // Flat facts for Excel + transactions row for proposed sale
    intel.facts = [...issuerFacts, ...sellerFacts, ...saleFacts, ...acqFacts, ...noticeFacts];
    if (sharesToSell || mktValue) {
      intel.transactions = [
        {
          security: classTitle || "Common",
          date: saleDate,
          code: "144",
          amount: sharesToSell ? fmtNum(sharesToSell) : "",
          acquiredDisposed: "Proposed sale",
          price: mktValue ? fmtMoney(mktValue) : "",
          ownedAfter: outstanding ? fmtNum(outstanding) : "",
          ownershipForm: exchange || ""
        }
      ];
    }

    intel.tables = [
      {
        title: "Proposed sale",
        headers: [
          "Class",
          "Broker",
          "Shares to sell",
          "Market value",
          "Outstanding",
          "Approx. sale date",
          "Exchange"
        ],
        rows: [
          [
            classTitle,
            cleanEntityName(String(broker).split("\n")[0]),
            sharesToSell ? fmtNum(sharesToSell) : "",
            mktValue ? fmtMoney(mktValue) : "",
            outstanding ? fmtNum(outstanding) : "",
            saleDate,
            exchange
          ]
        ]
      }
    ];

    intel.headline = seller
      ? `${cleanEntityName(seller)} — Form 144 proposed sale${
          sharesToSell ? ` · ${fmtNum(sharesToSell)} shares` : ""
        }${mktValue ? ` · ${fmtMoney(mktValue)}` : ""}`
      : "Form 144 — Notice of proposed sale";
    intel.highlights = [
      relationship || null,
      sharesToSell ? `${fmtNum(sharesToSell)} shares` : null,
      mktValue ? fmtMoney(mktValue) : null,
      saleDate || null,
      exchange || null
    ].filter(Boolean);

    // Issuer name for top-level companyName preference
    intel.issuerName = cleanEntityName(issuerName);

    return intel;
  }

  /** Parse Form 144 XML tags if present in page text / source. */
  function extractForm144FromXmlText(text) {
    const t = String(text || "");
    const tag = (name) => {
      const re = new RegExp(
        `<(?:[a-z]+:)?${name}[^>]*>([\\s\\S]*?)</(?:[a-z]+:)?${name}>`,
        "i"
      );
      const m = t.match(re);
      return m ? normalizeWhitespace(m[1].replace(/<[^>]+>/g, " ")) : "";
    };
    const street = [tag("street1"), tag("street2"), tag("city"), tag("stateOrCountry"), tag("zipCode")]
      .filter(Boolean)
      .join(", ");
    // broker block may have nested address — take first name after brokerOrMarketmakerDetails
    const brokerBlock = t.match(
      /brokerOrMarketmakerDetails[\s\S]{0,800}?<\/(?:[a-z]+:)?brokerOrMarketmakerDetails>/i
    );
    let broker = tag("name");
    let brokerAddress = "";
    if (brokerBlock) {
      const bn = brokerBlock[0].match(
        /<(?:[a-z]+:)?name[^>]*>([^<]+)/i
      );
      if (bn) broker = normalizeWhitespace(bn[1]);
      const ba = [
        brokerBlock[0].match(/street1[^>]*>([^<]+)/i)?.[1],
        brokerBlock[0].match(/street2[^>]*>([^<]+)/i)?.[1],
        brokerBlock[0].match(/city[^>]*>([^<]+)/i)?.[1],
        brokerBlock[0].match(/stateOrCountry[^>]*>([^<]+)/i)?.[1],
        brokerBlock[0].match(/zipCode[^>]*>([^<]+)/i)?.[1]
      ]
        .filter(Boolean)
        .map((x) => normalizeWhitespace(x));
      brokerAddress = ba.join(", ");
    }

    return {
      issuerName: tag("issuerName"),
      seller: tag("nameOfPersonForWhoseAccountTheSecuritiesAreToBeSold"),
      relationship: tag("relationshipToIssuer"),
      phone: tag("issuerContactPhone"),
      address: street,
      secFileNumber: tag("secFileNumber"),
      classTitle: tag("securitiesClassTitle"),
      broker,
      brokerAddress,
      sharesToSell: tag("noOfUnitsSold"),
      aggregateMarketValue: tag("aggregateMarketValue"),
      outstanding: tag("noOfUnitsOutstanding"),
      approxSaleDate: tag("approxSaleDate"),
      exchange: tag("securitiesExchangeName"),
      acquiredDate: tag("acquiredDate"),
      acquisitionNature: tag("natureOfAcquisitionTransaction"),
      acquiredFrom: tag("nameOfPersonfromWhomAcquired"),
      amountAcquired: tag("amountOfSecuritiesAcquired"),
      paymentDate: tag("paymentDate"),
      remarks: tag("remarks"),
      noticeDate: tag("noticeDate"),
      signature: tag("signature"),
      filerCik: tag("cik")
    };
  }

  /**
   * Generic labeled-field scrape for SEC HTML forms (td.label + value cell / fakeBox).
   */
  function extractSecLabeledFields() {
    const out = {};
    try {
      if (typeof document === "undefined" || !document.body) return out;
      // Standard EDGAR ownership / 144 layout
      document.querySelectorAll("tr").forEach((tr) => {
        const labelEl = tr.querySelector("td.label, th.label, .label");
        if (!labelEl) return;
        const label = normalizeWhitespace(labelEl.textContent || "");
        if (!label || label.length > 120) return;
        const valEl =
          tr.querySelector(".fakeBox, .fakeTextBox, td.tableClass, td.FormData") ||
          labelEl.nextElementSibling;
        if (!valEl) return;
        let val = normalizeWhitespace(valEl.textContent || "");
        if (!val || val === "XXXXXXXX") return;
        out[label] = val;
      });
      // Also pair consecutive tds when class is label
      document.querySelectorAll("td.label").forEach((td) => {
        const label = normalizeWhitespace(td.textContent || "");
        const sib = td.nextElementSibling;
        if (!label || !sib) return;
        const val = normalizeWhitespace(sib.textContent || "");
        if (val && val !== "XXXXXXXX") out[label] = val;
      });
    } catch {
      /* ignore */
    }
    return out;
  }

  /** Fallback for unknown form types: labeled fields + light NER */
  function extractGenericFormIntel(text, lower, filingType) {
    const intel = emptyIntel("other");
    intel.formType = String(filingType || "UNKNOWN");
    const labels = extractSecLabeledFields();
    const facts = Object.entries(labels)
      .slice(0, 40)
      .map(([label, value]) => ({ label, value }))
      .filter((f) => f.value && f.value.length < 400);
    intel.facts = facts;
    intel.people = extractPeopleMentions(text).slice(0, 8);
    intel.organizations = extractOrganizationMentions(text).slice(0, 8);
    intel.headline = `${filingType || "Filing"} — structured fields`;
    intel.sections = [];
    if (facts.length) {
      intel.sections.push({ title: "Disclosed fields", facts });
    }
    if (intel.people.length || intel.organizations.length) {
      intel.sections.push(
        ...buildSectionsFromFactsAndLists(intel, { primaryTitle: "Parties" }).filter(
          (s) => s.title === "People" || s.title === "Organizations"
        )
      );
    }
    return intel;
  }

  function uniqueBy(arr, keyFn) {
    const seen = new Set();
    const out = [];
    for (const item of arr || []) {
      const k = keyFn(item);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(item);
    }
    return out;
  }

  function extractEightKIntel(text, lower) {
    const items = [];
    for (const cat of EIGHT_K_ITEM_CATALOG) {
      const re = new RegExp(
        `Item\\s*${cat.code.replace(".", "\\.")}\\b`,
        "i"
      );
      if (re.test(text)) {
        items.push({
          code: cat.code,
          label: cat.label,
          present: true
        });
      }
    }

    // Multi-tag events (not just first match)
    const eventTags = [];
    for (const ev of EIGHT_K_EVENTS) {
      if (ev.patterns.some((re) => re.test(text) || re.test(lower))) {
        eventTags.push({ key: ev.key, label: ev.label, blurb: ev.blurb });
      }
    }

    const people = extractPeopleMentions(text);
    // Boost officer/director language near Item 5.02
    const m502 = text.match(
      /Item\s*5\.02[\s\S]{0,3500}/i
    );
    if (m502) {
      for (const p of extractPeopleMentions(m502[0])) {
        people.unshift({ ...p, context: p.context || "Item 5.02" });
      }
    }

    const orgs = extractOrganizationMentions(text);
    const facts = [];
    const vote = text.match(
      /Item\s*5\.07[\s\S]{0,2000}?(?:proposal|director|shares?\s+voted)[\s\S]{0,400}/i
    );
    if (vote) {
      facts.push({
        label: "Shareholder vote (excerpt)",
        value: normalizeWhitespace(vote[0]).slice(0, 220)
      });
    }

    const headline =
      items.find((i) => i.code === "5.02")
        ? "Management / director change (Item 5.02)"
        : items.find((i) => i.code === "2.02")
        ? "Results of operations (Item 2.02)"
        : items.find((i) => i.code === "5.07")
        ? "Shareholder vote (Item 5.07)"
        : items.find((i) => i.code === "1.01")
        ? "Material definitive agreement (Item 1.01)"
        : items.length
        ? `8-K items: ${items
            .slice(0, 4)
            .map((i) => i.code)
            .join(", ")}`
        : eventTags[0]?.label || "Current report event";

    const highlights = [
      items.length ? `${items.length} Item(s) disclosed` : null,
      people.length ? `${people.length} people named` : null,
      eventTags[0] ? eventTags[0].label : null
    ].filter(Boolean);

    return {
      kind: "event",
      headline,
      items,
      people,
      organizations: orgs,
      facts,
      highlights,
      eventTags
    };
  }

  function extractOwnershipIntel(text, lower, filingType) {
    const facts = [];
    const people = [];
    const organizations = [];

    // Reporting person(s)
    const namePatterns = [
      /Name\s+of\s+Reporting\s+Person[s]?\s*[:.]?\s*([A-Z][A-Za-z0-9&.,'\- ]{2,80})/gi,
      /NAMES?\s+OF\s+REPORTING\s+PERSONS?\s*[:.]?\s*([A-Z][A-Za-z0-9&.,'\- ]{2,80})/gi,
      /Reporting\s+Person[:\s]+([A-Z][A-Za-z0-9&.,'\- ]{2,80})/gi
    ];
    for (const re of namePatterns) {
      let m;
      while ((m = re.exec(text)) !== null) {
        const name = cleanEntityName(m[1]);
        if (!name || name.length < 3) continue;
        if (/^(cusip|irs|sec|schedule|check)/i.test(name)) continue;
        if (looksLikeOrg(name)) {
          organizations.push({ name, role: "Reporting person (entity)" });
        } else {
          people.push({ name, role: "Reporting person" });
        }
        if (people.length + organizations.length > 10) break;
      }
    }

    // Percent of class (13G/13D table rows + narrative)
    const pctPatterns = [
      /Percent\s+of\s+Class\s+Represented[^\d%]{0,60}(\d{1,3}(?:\.\d+)?)\s*%/i,
      /Percent of class represented by amount in Row[^\d%]{0,40}(\d{1,3}(?:\.\d+)?)/i,
      /(\d{1,3}(?:\.\d+)?)\s*%\s+of\s+(?:the\s+)?(?:class|shares|common)/i,
      /beneficially\s+owns?[^\d%]{0,40}(\d{1,3}(?:\.\d+)?)\s*%/i,
      /owns?\s+approximately\s+(\d{1,3}(?:\.\d+)?)\s*%/i
    ];
    for (const re of pctPatterns) {
      const m = text.match(re);
      if (m) {
        const n = Number(m[1]);
        if (Number.isFinite(n) && n >= 0 && n <= 100) {
          facts.push({
            label: "Beneficial ownership %",
            value: `${m[1]}%`
          });
          break;
        }
      }
    }

    // Shares beneficially owned
    const shares = text.match(
      /(?:Aggregate\s+)?(?:Amount\s+(?:of\s+Securities\s+)?)?Beneficially\s+Owned[^\d]{0,50}([\d,]{2,})/i
    ) || text.match(
      /Row\s*9[^\d]{0,40}([\d,]{3,})/i
    );
    if (shares) {
      facts.push({
        label: "Shares beneficially owned",
        value: shares[1]
      });
    }

    // Sole / shared voting power (common 13G fields)
    const soleVote = text.match(
      /Sole\s+(?:Voting|Dispositive)\s+Power[^\d]{0,30}([\d,]{1,})/i
    );
    if (soleVote) {
      facts.push({ label: "Sole voting / dispositive power", value: soleVote[1] });
    }
    const sharedVote = text.match(
      /Shared\s+(?:Voting|Dispositive)\s+Power[^\d]{0,30}([\d,]{1,})/i
    );
    if (sharedVote) {
      facts.push({ label: "Shared voting / dispositive power", value: sharedVote[1] });
    }

    // CUSIP
    const cusip = text.match(/\bCUSIP\b[^\nA-Z0-9]{0,20}([A-Z0-9]{6,9})\b/i);
    if (cusip) {
      facts.push({ label: "CUSIP", value: cusip[1].toUpperCase() });
    }

    // Purpose of transaction (13D)
    if (/13D/i.test(filingType) || /purpose of transaction/i.test(lower)) {
      const purpose = text.match(
        /Purpose\s+of\s+Transaction[:\s]*([\s\S]{40,500}?)(?:Item\s+\d|SIGNATURE|Exhibit)/i
      );
      if (purpose) {
        facts.push({
          label: "Purpose of transaction",
          value: normalizeWhitespace(purpose[1]).slice(0, 280)
        });
      }
    }

    // Group / passive vs active
    if (/13G/i.test(filingType)) {
      facts.push({
        label: "Schedule type",
        value: "13G — typically passive / institutional ownership"
      });
    } else if (/13D/i.test(filingType)) {
      facts.push({
        label: "Schedule type",
        value: "13D — may include activist or control intent"
      });
    }

    const primary =
      organizations[0]?.name || people[0]?.name || "Beneficial owner";
    const pct = facts.find((f) => /ownership %/i.test(f.label));
    const headline = pct
      ? `${primary} — ${pct.value} beneficial ownership`
      : `${primary} — ${String(filingType || "ownership").toUpperCase()} filing`;

    return {
      kind: "ownership",
      headline,
      items: [],
      people: people.concat(extractPeopleMentions(text).slice(0, 4)),
      organizations: organizations.concat(
        extractOrganizationMentions(text).slice(0, 4)
      ),
      facts,
      highlights: [
        pct ? pct.value + " of class" : null,
        organizations[0]?.name || people[0]?.name || null,
        /13D/i.test(filingType) ? "Schedule 13D" : "Schedule 13G"
      ].filter(Boolean),
      eventTags: []
    };
  }

  function extractInsiderIntel(text, lower, filingType) {
    const facts = [];
    const people = [];
    const organizations = [];
    const transactions = [];

    // Prefer DOM table parse when on a live Form 4 page
    const domTx = extractForm4FromDom();
    if (domTx.transactions.length) transactions.push(...domTx.transactions);
    if (domTx.ownerName) {
      people.push({
        name: domTx.ownerName,
        role: domTx.relationship || "Reporting owner"
      });
    }
    if (domTx.issuerName) {
      organizations.push({
        name: domTx.issuerName,
        role: domTx.ticker ? `Issuer (${domTx.ticker})` : "Issuer"
      });
    }
    for (const f of domTx.facts || []) facts.push(f);

    // Owner from linearized HTML
    if (!people.length) {
      const ownerPatterns = [
        /Name\s+and\s+Address\s+of\s+Reporting\s+Person[\s\S]{0,160}?([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/i,
        /rptOwnerName[^>]*>([^<]+)/i,
        /Reporting\s+Owner[:\s]+([A-Z][A-Za-z0-9&.,'\- ]{2,60})/i
      ];
      for (const re of ownerPatterns) {
        const m = text.match(re);
        if (!m?.[1]) continue;
        const name = cleanEntityName(m[1]);
        if (name && name.length >= 3 && !isBlockedPersonName(name)) {
          people.push({ name, role: "Reporting owner" });
          break;
        }
      }
    }

    // Issuer + ticker: "Blue Bird Corp [ BLBD ]"
    const issuer =
      text.match(
        /Issuer\s+Name\s+and\s+Ticker[\s\S]{0,120}?([A-Za-z][A-Za-z0-9&.,' \-]{2,60}?)\s*\[\s*([A-Z]{1,6})\s*\]/i
      ) || text.match(/([A-Z][A-Za-z0-9&.,' \-]{2,50}?)\s*\[\s*([A-Z]{1,6})\s*\]/);
    if (issuer) {
      const iname = cleanEntityName(issuer[1]);
      if (iname && !organizations.some((o) => o.name === iname)) {
        organizations.push({ name: iname, role: `Issuer (${issuer[2]})` });
      }
      facts.push({ label: "Issuer", value: `${iname} (${issuer[2]})` });
      facts.push({ label: "Ticker", value: issuer[2] });
    }

    const earliest = text.match(
      /Date\s+of\s+Earliest\s+Transaction[^\d]{0,40}(\d{1,2}\/\d{1,2}\/\d{2,4})/i
    );
    if (earliest) {
      facts.push({ label: "Earliest transaction date", value: earliest[1] });
    }

    // Relationship (Director / Officer / 10% Owner) — require checkbox X nearby
    const rels = [];
    const relBlock =
      (text.match(/Relationship of Reporting Person[\s\S]{0,500}/i) || [])[0] ||
      text.slice(0, 8000);
    if (/\bX\b[\s\S]{0,50}Director|Director[\s\S]{0,50}\bX\b/i.test(relBlock)) {
      rels.push("Director");
    }
    if (/\bX\b[\s\S]{0,50}Officer|Officer[\s\S]{0,50}\bX\b/i.test(relBlock)) {
      rels.push("Officer");
    }
    if (/10%\s*Owner/i.test(relBlock) && /\bX\b/i.test(relBlock)) {
      rels.push("10% Owner");
    }
    if (rels.length) {
      facts.push({ label: "Relationship", value: [...new Set(rels)].join(" · ") });
      if (people[0]) people[0].role = rels.join(" · ");
    }

    // Table I non-derivative transactions
    if (!transactions.length) {
      transactions.push(...parseForm4TransactionsFromText(text));
    }

    const tx0 = transactions[0];
    if (tx0) {
      if (tx0.security) facts.push({ label: "Security", value: tx0.security });
      if (tx0.date) facts.push({ label: "Transaction date", value: tx0.date });
      if (tx0.code) {
        facts.push({
          label: "Transaction code",
          value: `${tx0.code} (${form4CodeLabel(tx0.code)})`
        });
      }
      if (tx0.amount) {
        facts.push({
          label: "Shares acquired / disposed",
          value: `${tx0.amount}${
            tx0.acquiredDisposed
              ? ` (${tx0.acquiredDisposed === "A" ? "Acquired" : "Disposed"})`
              : ""
          }`
        });
      }
      if (tx0.price) facts.push({ label: "Price per share", value: tx0.price });
      if (tx0.ownedAfter) {
        facts.push({
          label: "Shares owned after transaction",
          value: tx0.ownedAfter
        });
      }
      if (tx0.ownershipForm) {
        facts.push({
          label: "Ownership form",
          value:
            tx0.ownershipForm === "D"
              ? "Direct (D)"
              : tx0.ownershipForm === "I"
              ? "Indirect (I)"
              : tx0.ownershipForm
        });
      }
    }

    const priceRange = text.match(
      /prices?\s+ranging\s+from\s+\$?([\d.]+)\s+to\s+\$?([\d.]+)/i
    );
    if (priceRange) {
      facts.push({
        label: "Price range (footnote)",
        value: `$${priceRange[1]} – $${priceRange[2]}`
      });
    }

    const signed = text.match(
      /Signature of Reporting Person[\s\S]{0,160}?(\d{1,2}\/\d{1,2}\/\d{2,4})/i
    );
    if (signed) facts.push({ label: "Form date", value: signed[1] });

    // Dedup facts
    const factSeen = new Set();
    const factsUnique = [];
    for (const f of facts) {
      const k = String(f.label || "").toLowerCase();
      if (!k || factSeen.has(k)) continue;
      factSeen.add(k);
      factsUnique.push(f);
    }

    const who = people[0]?.name || organizations[0]?.name || "Insider";
    const formLabel =
      filingType === "3"
        ? "Initial ownership (Form 3)"
        : filingType === "5"
        ? "Annual insider statement (Form 5)"
        : "Insider transaction (Form 4)";

    const actionBit = tx0
      ? [
          tx0.code ? form4CodeLabel(tx0.code) : null,
          tx0.amount ? `${tx0.amount} shares` : null,
          tx0.price || null
        ]
          .filter(Boolean)
          .join(" · ")
      : null;

    return {
      kind: "insider",
      headline: actionBit ? `${who} — ${actionBit}` : `${who} — ${formLabel}`,
      items: [],
      people,
      organizations,
      facts: factsUnique,
      transactions,
      highlights: [
        who,
        rels[0] || people[0]?.role || null,
        tx0?.code
          ? `${tx0.code} · ${tx0.amount || "?"} @ ${tx0.price || "n/a"}`
          : null,
        tx0?.ownedAfter ? `Owns ${tx0.ownedAfter} after` : null
      ].filter(Boolean),
      eventTags: []
    };
  }

  /**
   * Parse Form 4 Table I from linearized EDGAR HTML.
   * Example: Common Stock... 05/19/2026  P  300  A  $65.09  8,696  D
   */
  function parseForm4TransactionsFromText(text) {
    const out = [];
    const compact = String(text || "").replace(/\u00a0/g, " ");

    const rowRe =
      /(Common\s+Stock[^0-9]{0,100}?|Class\s+[A-Z]\s+Common[^0-9]{0,80}?|[A-Za-z][A-Za-z0-9 ,.$%\-]{4,80}?)\s+(\d{1,2}\/\d{1,2}\/\d{2,4})\s+([A-Z])\s+(?:V\s+)?([\d,]+)\s+([AD])\s+\$?\s*([\d,]+(?:\.\d+)?)\s+([\d,]+)\s+([DI])\b/gi;

    let m;
    while ((m = rowRe.exec(compact)) !== null) {
      const security = cleanEntityName(m[1]).replace(/\s+/g, " ").slice(0, 80);
      if (/table|transaction|title of security|non-derivative|instr/i.test(security)) {
        continue;
      }
      out.push({
        security: security || "Common Stock",
        date: m[2],
        code: m[3].toUpperCase(),
        amount: m[4],
        acquiredDisposed: m[5].toUpperCase(),
        price: `$${m[6]}`,
        ownedAfter: m[7],
        ownershipForm: m[8].toUpperCase()
      });
      if (out.length >= 12) break;
    }

    if (!out.length) {
      const loose = compact.match(
        /\b([PSAMFGCDV])\b\s+(?:V\s+)?([\d,]{1,10})\s+([AD])\s+\$?\s*([\d,.]+)\s+([\d,]{1,10})\s+([DI])\b/i
      );
      if (loose) {
        const dateM = compact.match(
          /Date of Earliest Transaction[^\d]{0,40}(\d{1,2}\/\d{1,2}\/\d{2,4})/i
        );
        out.push({
          security: "Common Stock",
          date: dateM ? dateM[1] : "",
          code: loose[1].toUpperCase(),
          amount: loose[2],
          acquiredDisposed: loose[3].toUpperCase(),
          price: `$${loose[4]}`,
          ownedAfter: loose[5],
          ownershipForm: loose[6].toUpperCase()
        });
      }
    }
    return out;
  }

  /** Live Form 4 page: owner, issuer, Table I from DOM. */
  function extractForm4FromDom() {
    const result = {
      ownerName: "",
      issuerName: "",
      ticker: "",
      relationship: "",
      transactions: [],
      facts: []
    };
    try {
      if (typeof document === "undefined" || !document.body) return result;
      const root = document.body;
      const pageText = root.innerText || "";

      const allLinks = [...root.querySelectorAll("a")].slice(0, 50);
      for (const a of allLinks) {
        const t = (a.textContent || "").replace(/\s+/g, " ").trim();
        if (
          t.length >= 5 &&
          t.length < 60 &&
          /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}$/.test(t) &&
          !/blue bird|form|edgar|sec\.gov|united states/i.test(t)
        ) {
          const parentText =
            (a.closest("table") || a.parentElement)?.textContent || "";
          if (
            /Reporting Person|Name and Address/i.test(parentText) ||
            !result.ownerName
          ) {
            result.ownerName = t;
            if (/Reporting Person|Name and Address/i.test(parentText)) break;
          }
        }
      }

      const iss = pageText.match(
        /([A-Za-z][A-Za-z0-9&.,' \-]{2,50}?)\s*\[\s*([A-Z]{1,6})\s*\]/
      );
      if (iss) {
        result.issuerName = cleanEntityName(iss[1]);
        result.ticker = iss[2];
      }

      if (
        /Relationship of Reporting Person[\s\S]{0,300}?\bX\b[\s\S]{0,40}?Director|Director[\s\S]{0,40}?\bX\b/i.test(
          pageText
        )
      ) {
        result.relationship = "Director";
      }

      for (const table of root.querySelectorAll("table")) {
        const head = (table.innerText || "").slice(0, 600);
        if (!/Transaction\s+Code|Securities\s+Acquired|Non-Derivative/i.test(head)) {
          continue;
        }
        for (const tr of table.querySelectorAll("tr")) {
          const cells = [...tr.querySelectorAll("td, th")].map((c) =>
            (c.textContent || "").replace(/\s+/g, " ").trim()
          );
          if (cells.length < 5) continue;
          const joined = cells.join(" | ");
          if (/Title of Security|Transaction Date|Instr\./i.test(joined)) continue;

          const dateCell = cells.find((c) =>
            /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(c)
          );
          const codeCell = cells.find(
            (c) => /^[A-Z]$/.test(c) && /[PSAMFGCDVI]/.test(c)
          );
          const priceCell = cells.find((c) => /^\$?\d[\d,]*\.\d{2}/.test(c));
          const adCell = cells.find((c) => c === "A" || c === "D");
          const nums = cells.filter(
            (c) => /^[\d,]+$/.test(c) && c.length <= 12
          );

          if (dateCell && (codeCell || nums.length >= 1)) {
            const security =
              cells.find(
                (c) => /stock|share|common|class/i.test(c) && c.length > 4
              ) || "Common Stock";
            // owned-after is usually the larger trailing share count
            let amount = "";
            let ownedAfter = "";
            if (nums.length >= 2) {
              amount = nums[0];
              ownedAfter = nums[nums.length - 1];
            } else if (nums.length === 1) {
              amount = nums[0];
            }
            result.transactions.push({
              security: security.slice(0, 80),
              date: dateCell,
              code: (codeCell || "").toUpperCase(),
              amount,
              acquiredDisposed: adCell || "",
              price: priceCell
                ? priceCell.startsWith("$")
                  ? priceCell
                  : `$${priceCell}`
                : "",
              ownedAfter,
              ownershipForm:
                cells.filter((c) => c === "D" || c === "I").pop() || ""
            });
          }
        }
        if (result.transactions.length) break;
      }
    } catch {
      /* ignore */
    }
    return result;
  }

  function form4CodeLabel(code) {
    const map = {
      P: "Open market purchase",
      S: "Open market sale",
      A: "Grant / award",
      D: "Disposition to issuer",
      F: "Tax withholding",
      M: "Option exercise",
      C: "Conversion",
      G: "Gift",
      V: "Voluntary report",
      I: "Discretionary transaction"
    };
    return map[String(code || "").toUpperCase()] || "See Form 4 instructions";
  }

  function extractProxyIntel(text, lower) {
    const people = [];
    const facts = [];
    const organizations = [];

    // Director nominees / board
    const boardBlock = text.match(
      /(?:BOARD\s+OF\s+DIRECTORS|NOMINEES?\s+FOR\s+ELECTION|DIRECTOR\s+NOMINEES?)([\s\S]{200,8000})/i
    );
    if (boardBlock) {
      const names = boardBlock[1].match(
        /\b([A-Z][a-z]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-z]+)+)\b/g
      );
      for (const n of names || []) {
        if (n.split(/\s+/).length < 2) continue;
        if (/Board Of|Annual Meeting|Proxy Statement|United States/i.test(n)) {
          continue;
        }
        people.push({ name: n, role: "Director / nominee" });
        if (people.length >= 12) break;
      }
    }

    people.push(...extractPeopleMentions(text).slice(0, 8));
    organizations.push(...extractOrganizationMentions(text).slice(0, 6));

    if (/say[- ]on[- ]pay/i.test(lower)) {
      facts.push({ label: "Ballot item", value: "Say-on-pay present" });
    }
    if (/auditor|independent registered public accounting/i.test(lower)) {
      const aud = text.match(
        /(?:independent registered public accounting firm|auditor)[:\s]+([A-Z][A-Za-z0-9&., ]{3,60})/i
      );
      if (aud) {
        organizations.push({
          name: cleanEntityName(aud[1]),
          role: "Auditor"
        });
      }
      facts.push({ label: "Auditor proposal", value: "Likely on ballot" });
    }

    return {
      kind: "proxy",
      headline: "Proxy statement — board, proposals, and key parties",
      items: [],
      people,
      organizations,
      facts,
      highlights: [
        people.length ? `${people.length} people named` : null,
        facts[0]?.value || null
      ].filter(Boolean),
      eventTags: []
    };
  }

  function looksLikeOrg(name) {
    return /\b(Inc|LLC|L\.L\.C|Ltd|Corp|Corporation|LP|L\.P|Trust|Partners|Capital|Holdings|Management|Advisors|Fund|Bank|Company|Co\.)\b/i.test(
      name
    );
  }

  function cleanEntityName(raw) {
    return String(raw || "")
      .replace(/\s+/g, " ")
      .replace(/^[\s:.\-–—]+|[\s:.\-–—]+$/g, "")
      .replace(/\s*\(Exact name.*$/i, "")
      .slice(0, 80)
      .trim();
  }

  /**
   * Lightweight people extractor — officer titles, appointment/resignation language.
   */
  function extractPeopleMentions(text) {
    const out = [];
    const patterns = [
      {
        re: /(?:appointed|elected|named)\s+([A-Z][a-z]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-z]+)+)\s+as\s+(?:the\s+)?([A-Za-z][A-Za-z\s/,&-]{2,50})/gi,
        roleFrom: 2,
        nameFrom: 1
      },
      {
        re: /([A-Z][a-z]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-z]+)+)\s+(?:has\s+)?(?:resigned|retired|stepped\s+down)\s+(?:as\s+)?([A-Za-z][A-Za-z\s/,&-]{2,40})?/gi,
        roleFrom: 2,
        nameFrom: 1,
        action: "Departure"
      },
      {
        re: /\b([A-Z][a-z]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-z]+)+)\s*[,–-]\s*((?:Chief\s+[A-Za-z ]{2,40}|President|CEO|CFO|COO|Chairman|Director)[A-Za-z ]{0,30})/g,
        roleFrom: 2,
        nameFrom: 1
      }
    ];

    for (const p of patterns) {
      let m;
      const re = new RegExp(p.re.source, p.re.flags);
      while ((m = re.exec(text)) !== null) {
        const name = cleanEntityName(m[p.nameFrom]);
        if (!name || name.split(/\s+/).length < 2) continue;
        if (isBlockedPersonName(name)) continue;
        const role = cleanEntityName(m[p.roleFrom] || p.action || "");
        out.push({
          name,
          role: role || undefined,
          context: p.action || undefined
        });
        if (out.length >= 15) break;
      }
    }
    return uniqueBy(out, (x) => x.name.toLowerCase());
  }

  function isBlockedPersonName(name) {
    return /^(United States|Securities And|Exchange Commission|Form|Item|Exhibit|Table Of|Page|Commission File|Washington|Delaware|New York|California)\b/i.test(
      name
    );
  }

  function extractOrganizationMentions(text) {
    const out = [];
    const re =
      /\b([A-Z][A-Za-z0-9&.,' ]{1,50}?\b(?:Inc|LLC|L\.L\.C|Ltd|Corp|Corporation|LP|L\.P|Trust|Partners|Capital|Holdings|Management|Advisors|Fund|Bank|Company)\.?)\b/g;
    let m;
    const cover = text.slice(0, 50000);
    while ((m = re.exec(cover)) !== null) {
      const name = cleanEntityName(m[1]);
      if (!name || name.length < 5) continue;
      if (/Securities And Exchange|United States Of/i.test(name)) continue;
      out.push({ name, role: "Referenced organization" });
      if (out.length >= 20) break;
    }
    return uniqueBy(out, (x) => x.name.toLowerCase());
  }

  /* ── Deterministic parser (section + scale aware) ────── */

  function parseFilingDocument(context) {
    // Merge page text + optional DOM table text for max recall.
    // skipDom: true when comparing remote filing text (avoid mixing current page tables).
    const domTableText = context.skipDom ? "" : extractDomTableText();
    const mergedRaw = [context.rawText || "", domTableText]
      .filter(Boolean)
      .join("\n\n");
    const text = normalizeStatementText(mergedRaw);
    const lower = text.toLowerCase();

    // Always re-derive identity from document body (not viewer chrome / filename).
    let filingType =
      detectFilingType(text, context.pageTitle || "", context.documentUrl || "") ||
      context.filingType ||
      "UNKNOWN";
    // Harden: URL / page title often wins when cover text is sparse (ownership XSL)
    if (
      (!filingType || filingType === "UNKNOWN") &&
      context.documentUrl
    ) {
      filingType =
        detectFilingType("", context.pageTitle || "", context.documentUrl) ||
        filingType;
    }
    const intelKindEarly = filingIntelKind(filingType);
    // Non-financial forms never run 10-Q line items / companyfacts XBRL.
    const skipFinancialPipeline =
      NON_FINANCIAL_KINDS.has(intelKindEarly) ||
      filingType === "144" ||
      intelKindEarly === "form144";

    let companyName =
      extractCompanyName(text, context.pageTitle || "") ||
      context.companyName ||
      "Unknown issuer";

    // Prefer issuer identity from ownership / 144 layouts
    if (skipFinancialPipeline) {
      const iss =
        text.match(
          /Name of Issuer\s+([A-Z][A-Za-z0-9&.,' \-]{2,60})/i
        ) ||
        text.match(
          /([A-Za-z][A-Za-z0-9&.,' \-]{2,50}?)\s*\[\s*([A-Z]{1,6})\s*\]/
        );
      if (iss?.[1] && !/united states|securities|issuer/i.test(iss[1])) {
        companyName = cleanEntityName(iss[1]);
      }
    }

    const filingDate = extractFilingDate(text);
    const periodEnd = skipFinancialPipeline ? null : extractPeriodEnd(text);
    const scaleMap = skipFinancialPipeline
      ? {
          income: { unit: "ones", multiplier: 1, label: "as reported", evidence: "" },
          balance: { unit: "ones", multiplier: 1, label: "as reported", evidence: "" },
          cashflow: { unit: "ones", multiplier: 1, label: "as reported", evidence: "" },
          global: { unit: "ones", multiplier: 1, label: "as reported", evidence: "" }
        }
      : detectReportingScales(text);
    const windows = skipFinancialPipeline ? { full: text } : buildStatementWindows(text);

    // Strategy A: DOM tables (most reliable on live /ix pages)
    const domFinancials =
      context.skipDom || skipFinancialPipeline
        ? {}
        : extractFinancialsFromDomTables(scaleMap);

    // Strategy B: section-aware line parser
    const financials = {};
    if (!skipFinancialPipeline) {
      for (const spec of FINANCIAL_SPECS) {
        financials[spec.key] =
          domFinancials[spec.key] ||
          extractLineItem(spec, windows, scaleMap, text) ||
          extractLineItemLoose(spec, text, scaleMap);
      }
    }

    const sections = {};
    const mentions = {};
    if (!skipFinancialPipeline) {
      for (const spec of SECTION_SPECS) {
        sections[spec.key] = hasSection(lower, spec.phrases);
      }
      for (const spec of MENTION_SPECS) {
        mentions[spec.key] = hasMention(lower, spec.patterns);
      }
    }

    const scaleSummary = skipFinancialPipeline
      ? { primaryLabel: "n/a", summary: "Non-financial form" }
      : summarizeScales(scaleMap);
    let foundCount = Object.values(financials).filter(Boolean).length;

    let insurance = skipFinancialPipeline
      ? {}
      : extractInsuranceMetrics(text, windows, scaleMap);
    const risks = skipFinancialPipeline ? [] : scanInsuranceRisks(text, lower);
    const eightK = filingType === "8-K" || filingType === "8-K/A"
      ? classify8KEvent(text, lower)
      : null;

    // Form-adaptive pack (144, 4, 13G, 8-K, proxy…) — not the financial catalog
    const corporateIntel = extractCorporateIntel(filingType, text, lower);
    if (corporateIntel?.issuerName) {
      companyName = corporateIntel.issuerName;
    }
    // Never leave UNKNOWN when intel knows the form pack
    if (
      (!filingType || filingType === "UNKNOWN") &&
      corporateIntel?.formType
    ) {
      filingType = corporateIntel.formType;
    }
    if (
      (!filingType || filingType === "UNKNOWN") &&
      corporateIntel?.kind === "form144"
    ) {
      filingType = "144";
    }

    const issuerType = skipFinancialPipeline
      ? {
          pack: "general",
          label:
            intelKindEarly === "form144"
              ? "Form 144 (Rule 144 sale notice)"
              : intelKindEarly === "insider"
              ? "Insider ownership form"
              : intelKindEarly === "ownership"
              ? "Beneficial ownership"
              : "Non-financial SEC form",
          reason: "Form type"
        }
      : detectIssuerType(text, context.sicDescription || context.sic || "");
    // Attach empty-state metadata for insurance KPIs when issuer is not insurance
    if (!skipFinancialPipeline && issuerType.pack !== "insurance") {
      for (const key of ["combinedRatio", "lossRatio", "expenseRatio", "netPremiumsWritten", "netPremiumsEarned", "catastropheLosses", "reserveDevelopment", "reinsuranceRecoverables"]) {
        if (!insurance[key]) {
          insurance[key] = {
            key,
            label: (INSURANCE_METRIC_SPECS.find((s) => s.key === key) || {}).label || key,
            unit: "pct",
            value: null,
            display: null,
            missingReason: "not_applicable",
            missingLabel: "Not applicable for this issuer type",
            interpretation: "Insurance underwriting metrics (e.g. combined ratio) are typically disclosed by P&C and similar insurers, not by this issuer type."
          };
        }
      }
    }

    // Merge optional XBRL facts (absolute USD) — never on Form 3/4/5 or 13D/G
    if (
      !skipFinancialPipeline &&
      context.xbrlFacts &&
      typeof context.xbrlFacts === "object"
    ) {
      const merged = mergeXbrlIntoFinancials(financials, context.xbrlFacts, scaleMap);
      Object.assign(financials, merged.financials);
      foundCount = Object.values(financials).filter((m) => m && m.display).length;
    }

    const metricsFound = Object.values(financials).filter((m) => m && m.display).length;
    const insuranceFound = Object.values(insurance).filter((m) => m && m.display).length;
    const intelKind = corporateIntel?.kind || intelKindEarly;
    const isNonFinancialPrimary =
      NON_FINANCIAL_KINDS.has(intelKind) ||
      intelKind === "form144" ||
      skipFinancialPipeline;

    let note = context.note || null;
    if (!note && metricsFound === 0 && insuranceFound === 0) {
      if (isNonFinancialPrimary && corporateIntel) {
        note = null; // intel panel carries the value — don't show financial empty noise
      } else if (isNonFinancialPrimary) {
        note =
          "This filing type is event / ownership / governance oriented. Open the full document HTML if signals look thin.";
      } else {
        note =
          "No matching line items in the text available on this page. Open the primary HTML financial statements (scroll if needed), then re-extract.";
      }
    }

    const quality = assessExtractQuality(filingType, {
      filingType,
      financials,
      metricsFound,
      companyName,
      periodEnd,
      filingDate,
      eightK,
      corporateIntel
    });
    if (quality.level === "low" && !note) {
      note = quality.summary;
    }

    return {
      companyName,
      filingType,
      filingDate,
      periodEnd,
      cik: context.cik,
      documentUrl: context.documentUrl,
      pageTitle: context.pageTitle,
      isSupported:
        SUPPORTED_FILINGS.has(filingType) ||
        isNonFinancialPrimary ||
        Boolean(corporateIntel),
      issuerType,
      intelKind,
      extractQuality: quality,
      note,
      source: context.source || null,
      pageKind: context.pageKind || null,
      financials,
      insurance,
      corporateIntel,
      risks,
      eightK,
      sections,
      mentions,
      scale: scaleSummary,
      textLength: text.length,
      metricsFound,
      insuranceFound,
      parsedAt: new Date().toISOString()
    };
  }

  function detectIssuerType(text, sicHint) {
    const hay = (String(sicHint || "") + "\n" + String(text || "").slice(0, 80000)).toLowerCase();
    const sic = String(sicHint || "").toLowerCase();
    // Insurance SIC 63xx / keywords
    if (
      /insurance|underwriting|premiums written|combined ratio|property and casualty|life insurance|reinsurance/.test(hay) ||
      /\b63\d{2}\b/.test(sic) ||
      sic.includes("insurance")
    ) {
      return { pack: "insurance", label: "Insurance / underwriting", reason: "SIC or filing language" };
    }
    if (/bank|depository|net interest income|federal reserve|\bloan\b portfolio/.test(hay) || /\b60\d{2}\b/.test(sic)) {
      return { pack: "bank", label: "Bank / depository", reason: "SIC or filing language" };
    }
    if (/broker|commission revenue|insurance brokerage/.test(hay)) {
      return { pack: "broker", label: "Broker / intermediary", reason: "Filing language" };
    }
    return { pack: "general", label: "General corporate", reason: "Default" };
  }

  function mergeXbrlIntoFinancials(financials, xbrlFacts, scaleMap) {
    const map = {
      revenue: [
        "RevenueFromContractWithCustomerExcludingAssessedTax",
        "SalesRevenueNet",
        "RevenueFromContractWithCustomerIncludingAssessedTax",
        "Revenues"
      ],
      costOfRevenue: [
        "CostOfGoodsAndServicesSold",
        "CostOfRevenue",
        "CostOfGoodsSold"
      ],
      grossProfit: ["GrossProfit"],
      rdExpense: [
        "ResearchAndDevelopmentExpense",
        "ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost"
      ],
      sgaExpense: [
        "SellingGeneralAndAdministrativeExpense",
        "SellingAndMarketingExpense",
        "GeneralAndAdministrativeExpense"
      ],
      operatingIncome: ["OperatingIncomeLoss"],
      interestExpense: ["InterestExpense", "InterestAndDebtExpense"],
      incomeTax: ["IncomeTaxExpenseBenefit"],
      netIncome: ["NetIncomeLoss", "ProfitLoss"],
      epsBasic: ["EarningsPerShareBasic"],
      epsDiluted: ["EarningsPerShareDiluted"],
      sharesBasic: ["WeightedAverageNumberOfSharesOutstandingBasic"],
      sharesDiluted: ["WeightedAverageNumberOfDilutedSharesOutstanding"],
      cashAndEquivalents: [
        "CashAndCashEquivalentsAtCarryingValue",
        "CashCashEquivalentsAndShortTermInvestments"
      ],
      totalAssets: ["Assets"],
      totalLiabilities: ["Liabilities"],
      stockholdersEquity: [
        "StockholdersEquity",
        "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"
      ],
      longTermDebt: ["LongTermDebtNoncurrent", "LongTermDebt"],
      goodwill: ["Goodwill"],
      operatingCashFlow: ["NetCashProvidedByUsedInOperatingActivities"],
      investingCashFlow: ["NetCashProvidedByUsedInInvestingActivities"],
      financingCashFlow: ["NetCashProvidedByUsedInFinancingActivities"],
      capex: [
        "PaymentsToAcquirePropertyPlantAndEquipment",
        "PaymentsToAcquireProductiveAssets"
      ]
    };
    const labelByKey = {};
    for (const spec of FINANCIAL_SPECS) labelByKey[spec.key] = spec.label;

    const next = { ...financials };
    for (const [key, tags] of Object.entries(map)) {
      // Keep high-confidence HTML; fill holes with period-matched XBRL
      if (next[key]?.display && next[key]?.source !== "xbrl" && next[key]?.confidence === "high") {
        continue;
      }
      if (next[key]?.display && next[key]?.source !== "xbrl") {
        // still allow XBRL to fill only when HTML missing — already have display
        continue;
      }
      for (const tag of tags) {
        const fact = xbrlFacts[tag] || xbrlFacts[tag.toLowerCase()];
        if (!fact || fact.value == null || !Number.isFinite(Number(fact.value))) {
          continue;
        }
        const isEps = key.startsWith("eps");
        const isShares = key.startsWith("shares");
        const value = Number(fact.value);
        const display = isEps
          ? formatPerShare(value)
          : isShares
          ? formatSharesCount(value)
          : formatMoneyAbsolute(value);

        next[key] = {
          label: labelByKey[key] || key,
          value,
          display,
          reported: value,
          reportedDisplay: String(value),
          scaleApplied: false,
          scaleLabel: "XBRL absolute",
          source: "xbrl",
          confidence: "high",
          xbrlTag: tag,
          periodEnd: fact.end || "",
          form: fact.form || "",
          accn: fact.accn || "",
          auditUrl: fact.auditUrl || "",
          ixbrlUrl: fact.ixbrlUrl || "",
          auditStatus: "SEC XBRL Verified"
        };
        break;
      }
    }
    return { financials: next };
  }

  function formatSharesCount(n) {
    if (!Number.isFinite(n)) return MISSING_METRIC;
    const abs = Math.abs(n);
    if (abs >= 1e9) return `${(abs / 1e9).toFixed(2)}B shares`;
    if (abs >= 1e6) return `${(abs / 1e6).toFixed(2)}M shares`;
    return `${new Intl.NumberFormat("en-US").format(abs)} shares`;
  }

  function formatMoneyAbsolute(n) {
    if (!Number.isFinite(n)) return MISSING_METRIC;
    const sign = n < 0 ? "-" : "";
    const abs = Math.abs(n);
    if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
    if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
    return `${sign}$${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(abs)}`;
  }

  function formatPerShare(n) {
    if (!Number.isFinite(n)) return MISSING_METRIC;
    return `$${Number(n).toFixed(2)}`;
  }

  /**
   * Flatten visible HTML tables into labeled rows (DOM-first strategy).
   */
  function extractDomTableText() {
    const parts = [];
    try {
      const docs = collectSearchableDocuments();
      for (const doc of docs) {
        doc.querySelectorAll("table").forEach((table) => {
          table.querySelectorAll("tr").forEach((tr) => {
            const cells = [...tr.querySelectorAll("th,td")]
              .map((c) => (c.innerText || c.textContent || "").replace(/\s+/g, " ").trim())
              .filter(Boolean);
            if (cells.length) parts.push(cells.join(" | "));
          });
        });
      }
    } catch {
      // ignore
    }
    return parts.join("\n");
  }

  function collectSearchableDocuments() {
    const docs = [document];
    try {
      document.querySelectorAll("iframe").forEach((frame) => {
        try {
          if (frame.contentDocument) docs.push(frame.contentDocument);
        } catch {
          // cross-origin
        }
      });
    } catch {
      // ignore
    }
    return docs;
  }

  /**
   * Map table rows → financial metrics using first numeric cell as current period.
   */
  function extractFinancialsFromDomTables(scaleMap) {
    const out = {};
    const rows = [];

    try {
      for (const doc of collectSearchableDocuments()) {
        doc.querySelectorAll("table tr").forEach((tr) => {
          const cells = [...tr.querySelectorAll("th,td")].map((c) =>
            (c.innerText || c.textContent || "").replace(/\s+/g, " ").trim()
          );
          if (!cells.length) return;
          rows.push(cells);
        });
      }
    } catch {
      return out;
    }

    // Also use pipe rows from extractDomTableText path already in `rows` as cells arrays

    for (const spec of FINANCIAL_SPECS) {
      if (out[spec.key]) continue;
      if (spec.kind === "perShare" || spec.special) continue;

      for (const cells of rows) {
        const labelCell = cells[0] || "";
        const labelNorm = labelCell.toLowerCase().replace(/\s+/g, " ").trim();
        const matched = (spec.exactLabels || []).some((lab) => {
          const t = lab.toLowerCase();
          return labelNorm === t || labelNorm.startsWith(t + " ") || labelNorm === t + ":";
        });
        if (!matched) continue;

        // Find first numeric cell after label
        const nums = [];
        for (let i = 1; i < cells.length; i += 1) {
          const cellNums = extractRowNumbers(cells[i]);
          if (cellNums[0]) nums.push(cellNums[0]);
        }
        // Sometimes all numbers share one cell string
        if (!nums.length) {
          const joined = cells.slice(1).join(" ");
          const cellNums = extractRowNumbers(joined);
          if (cellNums[0]) nums.push(...cellNums);
        }
        if (!nums.length) continue;

        const scale = scaleMap[spec.section] || scaleMap.global;
        out[spec.key] = finalizeMetric(
          {
            reported: nums[0].value,
            raw: nums[0].raw,
            line: cells.join(" | ").slice(0, 200),
            prior: nums[1] ? nums[1].value : null
          },
          spec,
          scale
        );
        break;
      }
    }

    // EPS from DOM
    extractEpsSharesFromDomRows(rows, scaleMap, out);

    return out;
  }

  function extractEpsSharesFromDomRows(rows, scaleMap, out) {
    let inEps = false;
    let inShares = false;
    const scale = scaleMap.income || scaleMap.global;

    for (const cells of rows) {
      const head = (cells[0] || "").toLowerCase();
      if (/net income per share/.test(head)) {
        inEps = true;
        inShares = false;
        continue;
      }
      if (/weighted average shares/.test(head)) {
        inShares = true;
        inEps = false;
        continue;
      }
      if (/^revenue\b|^cost of|^gross profit|^operating income|^net income$/.test(head)) {
        inEps = false;
        inShares = false;
      }

      const nums = extractRowNumbers(cells.slice(1).join(" ") || cells.join(" "));
      if (!nums[0]) continue;

      if (inEps && /^basic\b/i.test(cells[0] || "") && !out.epsBasic) {
        out.epsBasic = finalizeMetric(
          { reported: nums[0].value, raw: nums[0].raw, line: cells.join(" "), prior: null },
          { key: "epsBasic", label: "EPS — Basic", kind: "perShare" },
          scale
        );
      }
      if (inEps && /^diluted\b/i.test(cells[0] || "") && !out.epsDiluted) {
        out.epsDiluted = finalizeMetric(
          { reported: nums[0].value, raw: nums[0].raw, line: cells.join(" "), prior: null },
          { key: "epsDiluted", label: "EPS — Diluted", kind: "perShare" },
          scale
        );
      }
      if (inShares && /^basic\b/i.test(cells[0] || "") && !out.sharesBasic) {
        out.sharesBasic = finalizeMetric(
          { reported: nums[0].value, raw: nums[0].raw, line: cells.join(" "), prior: null },
          { key: "sharesBasic", label: "Weighted Avg Shares — Basic", kind: "shares" },
          scale
        );
      }
      if (inShares && /^diluted\b/i.test(cells[0] || "") && !out.sharesDiluted) {
        out.sharesDiluted = finalizeMetric(
          { reported: nums[0].value, raw: nums[0].raw, line: cells.join(" "), prior: null },
          { key: "sharesDiluted", label: "Weighted Avg Shares — Diluted", kind: "shares" },
          scale
        );
      }
    }
  }

  /**
   * Loose full-text fallback when strict line matching fails.
   * Prefer first number after label (current period).
   */
  function extractLineItemLoose(spec, fullText, scaleMap) {
    if (spec.special) return null;
    const scale = scaleMap[spec.section] || scaleMap.global;
    const labels = spec.exactLabels || [];

    for (const label of labels) {
      // Label ... number  (avoid "per share" for net income)
      const safe = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(
        safe +
          "\\s*(?:\\||:)?\\s*\\$?\\s*(\\(?\\s*[\\d,]{1,3}(?:,\\d{3})+(?:\\.\\d+)?\\s*\\)?|\\(?\\s*\\d+(?:\\.\\d+)?\\s*\\)?)",
        "i"
      );
      const m = fullText.match(re);
      if (!m) continue;
      if (spec.key === "netIncome") {
        const idx = m.index || 0;
        const window = fullText.slice(idx, idx + 40).toLowerCase();
        if (window.includes("per share")) continue;
      }
      if (spec.key === "revenue") {
        const idx = m.index || 0;
        if (/cost of revenue/i.test(fullText.slice(Math.max(0, idx - 12), idx + 20))) {
          continue;
        }
      }
      const reported = parseSignedNumberToken(m[1]);
      if (reported === null) continue;
      // Reject years
      if (reported >= 1900 && reported <= 2100 && !String(m[1]).includes(",")) continue;

      return finalizeMetric(
        { reported, raw: m[1], line: m[0].slice(0, 200), prior: null },
        spec,
        scale
      );
    }
    return null;
  }

  /** Preserve newlines (critical for row-level table parsing). */
  function normalizeStatementText(text) {
    return String(text || "")
      .replace(/\r/g, "\n")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
  }

  /**
   * Detect unit scale near each statement type.
   * NVIDIA example: "(In millions, except per share data)" → money × 1e6; EPS unscaled.
   */
  function detectReportingScales(text) {
    const defaults = {
      income: { unit: "ones", multiplier: 1, label: "as reported", evidence: "" },
      balance: { unit: "ones", multiplier: 1, label: "as reported", evidence: "" },
      cashflow: { unit: "ones", multiplier: 1, label: "as reported", evidence: "" },
      global: { unit: "ones", multiplier: 1, label: "as reported", evidence: "" }
    };

    const scaleRe =
      /\(([^)]*\b(?:in|and)\s+(?:thousands|millions|billions)\b[^)]*)\)/gi;
    const unitFrom = (phrase) => {
      const p = phrase.toLowerCase();
      if (/\bbillions\b/.test(p)) {
        return { unit: "billions", multiplier: 1e9, label: "billions" };
      }
      if (/\bmillions\b/.test(p)) {
        return { unit: "millions", multiplier: 1e6, label: "millions" };
      }
      if (/\bthousands\b/.test(p)) {
        return { unit: "thousands", multiplier: 1e3, label: "thousands" };
      }
      return null;
    };

    let m;
    while ((m = scaleRe.exec(text)) !== null) {
      const unit = unitFrom(m[1]);
      if (!unit) continue;
      const idx = m.index;
      const nearby = text.slice(Math.max(0, idx - 400), idx + 200).toLowerCase();
      const hit = {
        ...unit,
        evidence: m[0].replace(/\s+/g, " ").trim().slice(0, 120)
      };

      if (
        /statement[s]?\s+of\s+(income|operations|earnings)|income\s+statement|operations/i.test(
          nearby
        )
      ) {
        defaults.income = hit;
      } else if (/balance\s+sheet/i.test(nearby)) {
        defaults.balance = hit;
      } else if (/cash\s+flows?/i.test(nearby)) {
        defaults.cashflow = hit;
      } else if (!defaults.global.evidence) {
        defaults.global = hit;
      }
    }

    // Fallback: first global "in millions" anywhere in first 80k chars
    if (!defaults.global.evidence) {
      const head = text.slice(0, 80000);
      const g = head.match(
        /\([^)]*\bin\s+(thousands|millions|billions)\b[^)]*\)/i
      );
      if (g) {
        const unit = unitFrom(g[0]);
        if (unit) {
          defaults.global = {
            ...unit,
            evidence: g[0].replace(/\s+/g, " ").trim().slice(0, 120)
          };
        }
      }
    }

    // Inherit global when section-specific missing
    for (const key of ["income", "balance", "cashflow"]) {
      if (!defaults[key].evidence && defaults.global.evidence) {
        defaults[key] = { ...defaults.global };
      }
    }

    return defaults;
  }

  function summarizeScales(scaleMap) {
    const parts = [];
    for (const key of ["income", "balance", "cashflow"]) {
      const s = scaleMap[key];
      if (s?.evidence) {
        parts.push(`${key}: ${s.label}`);
      }
    }
    const primary = scaleMap.income?.evidence
      ? scaleMap.income
      : scaleMap.global;
    return {
      primaryUnit: primary?.unit || "ones",
      primaryLabel: primary?.label || "as reported",
      primaryEvidence: primary?.evidence || "",
      byStatement: {
        income: scaleMap.income,
        balance: scaleMap.balance,
        cashflow: scaleMap.cashflow
      },
      summary: parts.join(" · ") || "as reported (no unit footnote found)"
    };
  }

  /**
   * Slice major financial statement regions so labels resolve in the right table.
   */
  function buildStatementWindows(text) {
    const anchors = [
      {
        name: "income",
        re: /(?:condensed\s+)?consolidated\s+statements?\s+of\s+(?:income|operations|earnings)|statements?\s+of\s+(?:income|operations)|income\s+statements?/i
      },
      {
        name: "balance",
        re: /(?:condensed\s+)?consolidated\s+balance\s+sheets?|balance\s+sheets?/i
      },
      {
        name: "cashflow",
        re: /(?:condensed\s+)?consolidated\s+statements?\s+of\s+cash\s+flows?|statements?\s+of\s+cash\s+flows?/i
      },
      {
        name: "equity",
        re: /statements?\s+of\s+(?:stockholders|shareholders)['’]?\s+equity/i
      }
    ];

    const hits = [];
    for (const a of anchors) {
      const m = a.re.exec(text);
      if (m) hits.push({ name: a.name, start: m.index });
    }
    hits.sort((x, y) => x.start - y.start);

    const windows = { full: text };
    for (let i = 0; i < hits.length; i += 1) {
      const end = i + 1 < hits.length ? hits[i + 1].start : Math.min(text.length, hits[i].start + 35000);
      windows[hits[i].name] = text.slice(hits[i].start, end);
    }

    // Income fallback: look for "Three Months Ended" block
    if (!windows.income) {
      const m = text.match(/Three\s+Months\s+Ended[\s\S]{0,12000}?Net\s+income/i);
      if (m) windows.income = m[0];
    }

    return windows;
  }

  function extractLineItem(spec, windows, scaleMap, fullText) {
    const sectionText =
      (spec.section && windows[spec.section]) ||
      windows.income ||
      windows.full ||
      fullText;

    const scale =
      scaleMap[spec.section] || scaleMap.global || {
        unit: "ones",
        multiplier: 1,
        label: "as reported"
      };

    // Special handlers for EPS / share blocks (avoid grabbing revenue-scale numbers).
    if (spec.special === "epsBasic" || spec.special === "epsDiluted") {
      return extractEpsInSection(
        sectionText,
        spec.special === "epsDiluted" ? "diluted" : "basic",
        scale
      );
    }
    if (spec.special === "sharesBasic" || spec.special === "sharesDiluted") {
      return extractSharesInSection(
        sectionText,
        spec.special === "sharesDiluted" ? "diluted" : "basic",
        scale
      );
    }

    // 1) Prefer exact line-start labels inside the statement window
    const lines = sectionText.split("\n");
    for (const label of spec.exactLabels || []) {
      const hit = matchLineWithNumbers(lines, label, { exact: true });
      if (hit) return finalizeMetric(hit, spec, scale);
    }

    // 2) Pattern match on lines
    for (const re of spec.patterns || []) {
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i].trim();
        if (!line || line.length > 280) continue;
        if (!re.test(line) && !re.test(line.replace(/\s+/g, " "))) continue;
        // Avoid "Net income per share" when looking for Net income
        if (spec.key === "netIncome" && /per\s+share/i.test(line)) continue;
        if (spec.key === "revenue" && /cost of revenue/i.test(line)) continue;

        const nums = extractRowNumbers(line);
        if (nums.length) {
          return finalizeMetric(
            {
              reported: nums[0].value,
              raw: nums[0].raw,
              line: line.slice(0, 200),
              prior: nums[1] ? nums[1].value : null
            },
            spec,
            scale
          );
        }

        // Number may sit on the next line(s) after label-only row
        const joined = [line, lines[i + 1] || "", lines[i + 2] || ""].join(" ");
        const nums2 = extractRowNumbers(joined);
        if (nums2.length) {
          return finalizeMetric(
            {
              reported: nums2[0].value,
              raw: nums2[0].raw,
              line: joined.slice(0, 200),
              prior: nums2[1] ? nums2[1].value : null
            },
            spec,
            scale
          );
        }
      }
    }

    // 3) Last resort: whole-section search with strict label + first number
    for (const label of spec.exactLabels || []) {
      const re = new RegExp(
        label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
          "[^\\d\\-$]{0,40}(\\(?\\$?\\s*[\\d,]+(?:\\.\\d+)?\\)?)",
        "i"
      );
      const m = sectionText.match(re);
      if (m) {
        const parsed = parseSignedNumberToken(m[1]);
        if (parsed !== null) {
          return finalizeMetric(
            { reported: parsed, raw: m[1], line: m[0].slice(0, 200), prior: null },
            spec,
            scale
          );
        }
      }
    }

    return null;
  }

  function matchLineWithNumbers(lines, label, { exact }) {
    const target = label.toLowerCase();
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i].trim();
      if (!line) continue;
      const lower = line.toLowerCase();

      let ok = false;
      if (exact) {
        // Line starts with label, optional colon
        ok =
          lower === target ||
          lower.startsWith(target + " ") ||
          lower.startsWith(target + "$") ||
          lower.startsWith(target + ":");
        // Also allow label then numbers with only whitespace/symbols between
        if (!ok) {
          const stripped = lower.replace(/[^a-z0-9\s']/g, " ").replace(/\s+/g, " ").trim();
          ok =
            stripped === target ||
            stripped.startsWith(target + " ");
        }
      } else {
        ok = lower.includes(target);
      }
      if (!ok) continue;

      // Skip total operating expenses when looking for something else etc. handled by exact labels

      let nums = extractRowNumbers(line);
      if (!nums.length) {
        const joined = [line, lines[i + 1] || "", lines[i + 2] || ""].join(" ");
        nums = extractRowNumbers(joined);
      }
      if (!nums.length) continue;

      return {
        reported: nums[0].value,
        raw: nums[0].raw,
        line: line.slice(0, 200),
        prior: nums[1] ? nums[1].value : null
      };
    }
    return null;
  }

  /**
   * Pull ordered numeric cells from a statement row.
   * Prefers the first data column (current period), second = prior period.
   */
  function extractRowNumbers(line) {
    const s = String(line || "");
    const results = [];
    // Parenthetical negatives, optional $, commas
    const re = /\(\s*\$?\s*([\d,]+(?:\.\d+)?)\s*\)|\$\s*([\d,]+(?:\.\d+)?)|(-?[\d,]+(?:\.\d+)?)/g;
    let m;
    while ((m = re.exec(s)) !== null) {
      let raw;
      let negative = false;
      if (m[1] !== undefined) {
        raw = m[0];
        negative = true;
        var token = m[1];
      } else if (m[2] !== undefined) {
        raw = m[0];
        token = m[2];
      } else {
        raw = m[3];
        token = m[3];
        negative = String(token).trim().startsWith("-");
      }

      // Skip lone years
      const n = parseNumberToken(String(token).replace(/^-/, ""));
      if (n === null) continue;
      if (n >= 1900 && n <= 2100 && !String(token).includes(",") && !String(token).includes(".")) {
        continue;
      }
      // Skip tiny integers that are likely note refs when not decimals
      // (keep 0)
      results.push({
        value: negative ? -Math.abs(n) : n,
        raw: String(raw).trim()
      });
      if (results.length >= 4) break;
    }
    return results;
  }

  function finalizeMetric(hit, spec, scale) {
    const reported = hit.reported;
    if (reported === null || reported === undefined || !Number.isFinite(reported)) {
      return null;
    }

    const kind = spec.kind || "money";
    let absolute = reported;
    let scaleApplied = false;
    let scaleLabel = "as reported";

    if (kind === "money") {
      absolute = reported * (scale?.multiplier || 1);
      scaleApplied = (scale?.multiplier || 1) !== 1;
      scaleLabel = scale?.label || "as reported";
    } else if (kind === "shares") {
      // Share counts are often also "in millions"
      absolute = reported * (scale?.multiplier || 1);
      scaleApplied = (scale?.multiplier || 1) !== 1;
      scaleLabel = scale?.label || "as reported";
    } else if (kind === "perShare") {
      absolute = reported; // never scale EPS by millions
      scaleLabel = "per share (unscaled)";
    }

    const display =
      kind === "perShare"
        ? formatEps(absolute)
        : kind === "shares"
        ? formatShareCount(absolute, scaleApplied ? scaleLabel : null)
        : formatCurrency(absolute);

    const reportedDisplay =
      kind === "perShare"
        ? formatEps(reported)
        : new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(
            reported
          );

    return {
      label: spec.label || spec.key || "",
      reported,
      value: absolute,
      raw: hit.raw,
      line: hit.line || "",
      priorReported: hit.prior,
      kind,
      scaleApplied,
      scaleLabel,
      scaleEvidence: scale?.evidence || "",
      display,
      reportedDisplay,
      detail: scaleApplied
        ? `${reportedDisplay} ${scaleLabel} → ${display}`
        : display
    };
  }

  function extractEpsInSection(sectionText, which, scale) {
    // Prefer block under "Net income per share"
    const blockMatch = sectionText.match(
      /Net income per share:([\s\S]{0,400})/i
    );
    const block = blockMatch ? blockMatch[1] : sectionText;

    const label = which === "diluted" ? "Diluted" : "Basic";
    const lines = block.split("\n");
    for (const line of lines) {
      if (!new RegExp("^\\s*" + label + "\\b", "i").test(line.trim())) continue;
      const nums = extractRowNumbers(line);
      // EPS values are small (typically < 1000)
      const epsNum = nums.find((n) => Math.abs(n.value) < 1000);
      if (epsNum) {
        return finalizeMetric(
          { reported: epsNum.value, raw: epsNum.raw, line: line.trim(), prior: null },
          { kind: "perShare", key: which },
          scale
        );
      }
    }

    // Fallback regex
    const re =
      which === "diluted"
        ? /Diluted\s+\$?\s*([\d.]+)/i
        : /Basic\s+\$?\s*([\d.]+)/i;
    const m = block.match(re);
    if (m) {
      const v = parseNumberToken(m[1]);
      if (v !== null && Math.abs(v) < 1000) {
        return finalizeMetric(
          { reported: v, raw: m[1], line: m[0], prior: null },
          { kind: "perShare", key: which },
          scale
        );
      }
    }
    return null;
  }

  function extractSharesInSection(sectionText, which, scale) {
    const blockMatch = sectionText.match(
      /Weighted average shares used in per share computation:([\s\S]{0,500})/i
    );
    const block = blockMatch ? blockMatch[1] : sectionText;
    const label = which === "diluted" ? "Diluted" : "Basic";
    const lines = block.split("\n");
    for (const line of lines) {
      if (!new RegExp("^\\s*" + label + "\\b", "i").test(line.trim())) continue;
      const nums = extractRowNumbers(line);
      if (nums[0]) {
        return finalizeMetric(
          {
            reported: nums[0].value,
            raw: nums[0].raw,
            line: line.trim(),
            prior: nums[1] ? nums[1].value : null
          },
          { kind: "shares", key: which },
          scale
        );
      }
    }
    return null;
  }

  function extractFilingDate(text) {
    const head = text.slice(0, 20000);
    const patterns = [
      /Date\s+of\s+Report[^A-Za-z0-9]{0,40}([A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}-\d{2}-\d{2})/i,
      /(?:Filing|Filed)\s+Date[:\s]+([A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}-\d{2}-\d{2})/i,
      /For the quarterly period ended\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i
    ];
    for (const re of patterns) {
      const m = head.match(re);
      if (m?.[1]) return normalizeDateString(m[1]);
    }
    return null;
  }

  function extractPeriodEnd(text) {
    const head = text.slice(0, 25000);
    const patterns = [
      /(?:for\s+the\s+(?:quarterly|annual)\s+period\s+ended|period\s+ended|quarter\s+ended|year\s+ended)\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}-\d{2}-\d{2})/i,
      /Three\s+Months\s+Ended[^\n]{0,40}([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
      /(?:As\s+of|ended)\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i
    ];
    for (const re of patterns) {
      const m = head.match(re);
      if (m?.[1]) return normalizeDateString(m[1]);
    }
    return null;
  }

  function normalizeDateString(value) {
    return String(value || "").replace(/\s+/g, " ").trim().slice(0, 40);
  }

  function parseNumberToken(token) {
    const cleaned = String(token || "")
      .replace(/[$,\s]/g, "")
      .replace(/[()]/g, "")
      .trim();
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }

  function parseSignedNumberToken(token) {
    const t = String(token || "").trim();
    const neg = /^\(.*\)$/.test(t) || t.startsWith("-");
    const n = parseNumberToken(t);
    if (n === null) return null;
    return neg ? -Math.abs(n) : n;
  }

  function formatCurrency(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return MISSING_METRIC;
    const sign = n < 0 ? "-" : "";
    const abs = Math.abs(n);
    if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
    if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
    if (abs >= 1e3) {
      return `${sign}$${new Intl.NumberFormat("en-US", {
        maximumFractionDigits: 0
      }).format(abs)}`;
    }
    return `${sign}$${new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 2
    }).format(abs)}`;
  }

  function formatEps(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return MISSING_METRIC;
    const sign = n < 0 ? "-" : "";
    return `${sign}$${Math.abs(n).toFixed(2)}`;
  }

  function formatShareCount(value, scaleLabel) {
    const n = Number(value);
    if (!Number.isFinite(n)) return MISSING_METRIC;
    if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B shares`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M shares`;
    const base = new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 0
    }).format(n);
    return scaleLabel ? `${base} shares` : `${base} shares`;
  }

  function hasSection(lowerText, phrases) {
    return phrases.some((p) => lowerText.includes(p.toLowerCase()));
  }

  function hasMention(lowerText, patterns) {
    return patterns.some((re) => re.test(lowerText));
  }

  /* ── Compare ─────────────────────────────────────────── */

  async function runCompare(form) {
    const company = form.querySelector('[name="company"]')?.value?.trim() || "";
    const formType = form.querySelector('[name="formType"]')?.value || "10-Q";
    const yearA = form.querySelector('[name="yearA"]')?.value?.trim() || "";
    const yearB = form.querySelector('[name="yearB"]')?.value?.trim() || "";
    const urlA = form.querySelector('[name="urlA"]')?.value?.trim() || "";
    const urlB = form.querySelector('[name="urlB"]')?.value?.trim() || "";

    // Quarters only apply to 10-Q; other forms use latest filing in that year.
    const needsQ = formNeedsQuarter(formType);
    const quarterA = needsQ
      ? form.querySelector('[name="quarterA"]')?.value || "latest"
      : "latest";
    const quarterB = needsQ
      ? form.querySelector('[name="quarterB"]')?.value || "latest"
      : "latest";

    if (!urlA || !urlB) {
      if (!yearA || !yearB) {
        renderCompareError("Enter both years (or paste two document URLs).");
        return;
      }
      if (needsQ && (!quarterA || !quarterB)) {
        renderCompareError(
          "10-Q is filed up to four times a year — pick a quarter for each side (or Latest)."
        );
        return;
      }
    }

    state.isBusy = true;
    renderCompareLoading(company, formType, yearA, yearB, quarterA, quarterB);

    try {
      const response = await sendMessage({
        type: "calio:compareFilings",
        payload: {
          company,
          formType,
          yearA,
          yearB,
          quarterA,
          quarterB,
          urlA,
          urlB
        }
      });

      if (!response?.ok) {
        throw new Error(response?.error || "Compare failed.");
      }

      const leftCtx = {
        rawText: response.left.text,
        documentUrl: response.left.documentUrl,
        companyName:
          response.left.companyName ||
          extractCompanyName(response.left.text, response.left.pageTitle),
        filingType:
          detectFilingType(
            response.left.text,
            response.left.pageTitle,
            response.left.documentUrl
          ) || formType,
        cik: response.left.cik,
        pageTitle: response.left.pageTitle
      };
      const rightCtx = {
        rawText: response.right.text,
        documentUrl: response.right.documentUrl,
        companyName:
          response.right.companyName ||
          extractCompanyName(response.right.text, response.right.pageTitle),
        filingType:
          detectFilingType(
            response.right.text,
            response.right.pageTitle,
            response.right.documentUrl
          ) || formType,
        cik: response.right.cik,
        pageTitle: response.right.pageTitle
      };

      // Prefer filing-date year labels when available.
      leftCtx.companyName = leftCtx.companyName || company;
      rightCtx.companyName = rightCtx.companyName || company;

      const leftParsed = parseFilingDocument(leftCtx);
      const rightParsed = parseFilingDocument(rightCtx);

      // Attach SEC metadata dates when parser missed them.
      if (!leftParsed.filingDate && response.left.filingDate) {
        leftParsed.filingDate = response.left.filingDate;
      }
      if (!rightParsed.filingDate && response.right.filingDate) {
        rightParsed.filingDate = response.right.filingDate;
      }
      if (!leftParsed.periodEnd && response.left.reportDate) {
        leftParsed.periodEnd = response.left.reportDate;
      }
      if (!rightParsed.periodEnd && response.right.reportDate) {
        rightParsed.periodEnd = response.right.reportDate;
      }

      const diff = buildComparison(leftParsed, rightParsed, {
        labelA:
          response.left.label ||
          yearA ||
          response.left.filingDate ||
          "Filing A",
        labelB:
          response.right.label ||
          yearB ||
          response.right.filingDate ||
          "Filing B",
        formType
      });

      state.compareResult = {
        left: leftParsed,
        right: rightParsed,
        leftUrl: response.left.documentUrl,
        rightUrl: response.right.documentUrl,
        diff,
        formType,
        company: leftParsed.companyName
      };
      state.activeTab = "compare";
      renderMain();
    } catch (error) {
      state.activeTab = "compare";
      renderCompareError(error?.message || "Compare failed.");
    } finally {
      state.isBusy = false;
    }
  }

  function buildComparison(left, right, meta) {
    const financialRows = [];
    for (const spec of FINANCIAL_SPECS) {
      const a = left.financials?.[spec.key] || null;
      const b = right.financials?.[spec.key] || null;
      const row = {
        key: spec.key,
        label: spec.label,
        aDisplay: a?.display || MISSING_METRIC,
        bDisplay: b?.display || MISSING_METRIC,
        aValue: a?.value ?? null,
        bValue: b?.value ?? null,
        delta: null,
        deltaDisplay: "—",
        direction: "flat"
      };

      if (
        a?.value !== null &&
        a?.value !== undefined &&
        b?.value !== null &&
        b?.value !== undefined &&
        Number.isFinite(a.value) &&
        Number.isFinite(b.value)
      ) {
        const delta = b.value - a.value;
        row.delta = delta;
        const pct =
          a.value !== 0 ? (delta / Math.abs(a.value)) * 100 : null;
        row.deltaDisplay =
          pct === null
            ? formatSignedCurrencyLike(delta, a.display || b.display)
            : `${formatSignedCurrencyLike(delta, a.display || b.display)} (${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%)`;
        row.direction = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
      }

      financialRows.push(row);
    }

    const sectionRows = SECTION_SPECS.map((spec) => ({
      label: spec.label,
      a: Boolean(left.sections?.[spec.key]),
      b: Boolean(right.sections?.[spec.key]),
      changed: Boolean(left.sections?.[spec.key]) !== Boolean(right.sections?.[spec.key])
    }));

    const mentionRows = MENTION_SPECS.map((spec) => ({
      label: spec.label,
      a: Boolean(left.mentions?.[spec.key]),
      b: Boolean(right.mentions?.[spec.key]),
      changed: Boolean(left.mentions?.[spec.key]) !== Boolean(right.mentions?.[spec.key])
    }));

    const insights = buildTextInsights(financialRows, sectionRows, mentionRows, left, right, meta);

    return { financialRows, sectionRows, mentionRows, insights, meta };
  }

  function formatSignedCurrencyLike(delta, sampleDisplay) {
    const n = Number(delta);
    if (!Number.isFinite(n)) return "—";
    // EPS-like small values
    if (
      sampleDisplay &&
      /\$?-?\d+\.\d{2}$/.test(String(sampleDisplay).replace(/,/g, "")) &&
      Math.abs(n) < 1000
    ) {
      const sign = n > 0 ? "+" : n < 0 ? "-" : "";
      return `${sign}$${Math.abs(n).toFixed(2)}`;
    }
    const formatted = formatCurrency(Math.abs(n));
    if (n > 0) return `+${formatted}`;
    if (n < 0) return `-${formatted.replace(/^-/, "")}`;
    return formatted;
  }

  /**
   * Deterministic, text-only "insights" — no AI, no opinions like good/bad.
   * Only factual deltas and presence changes.
   */
  function buildTextInsights(financialRows, sectionRows, mentionRows, left, right, meta) {
    const out = [];

    out.push(
      `Compared <strong>${escapeHtml(meta.formType)}</strong> filings` +
        (left.companyName ? ` for <strong>${escapeHtml(left.companyName)}</strong>` : "") +
        `: <strong>${escapeHtml(meta.labelA)}</strong> vs <strong>${escapeHtml(meta.labelB)}</strong>.`
    );

    if (left.periodEnd || right.periodEnd) {
      out.push(
        `Period end: <strong>${escapeHtml(left.periodEnd || "n/a")}</strong> → <strong>${escapeHtml(right.periodEnd || "n/a")}</strong>.`
      );
    }

    const moved = financialRows.filter((r) => r.delta !== null);
    moved
      .slice()
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 8)
      .forEach((r) => {
        out.push(
          `<strong>${escapeHtml(r.label)}</strong>: ${escapeHtml(r.aDisplay)} → ${escapeHtml(r.bDisplay)} ` +
            `(Δ ${escapeHtml(r.deltaDisplay)}).`
        );
      });

    const missingA = financialRows.filter(
      (r) => r.aDisplay === MISSING_METRIC && r.bDisplay !== MISSING_METRIC
    );
    const missingB = financialRows.filter(
      (r) => r.bDisplay === MISSING_METRIC && r.aDisplay !== MISSING_METRIC
    );
    if (missingA.length) {
      out.push(
        `Found only in later filing: ${missingA.map((r) => escapeHtml(r.label)).join(", ")}.`
      );
    }
    if (missingB.length) {
      out.push(
        `Found only in earlier filing: ${missingB.map((r) => escapeHtml(r.label)).join(", ")}.`
      );
    }

    sectionRows
      .filter((r) => r.changed)
      .forEach((r) => {
        out.push(
          `Section <strong>${escapeHtml(r.label)}</strong>: ` +
            `${r.a ? "present" : "not detected"} → ${r.b ? "present" : "not detected"}.`
        );
      });

    mentionRows
      .filter((r) => r.changed)
      .forEach((r) => {
        out.push(
          `Mention <strong>${escapeHtml(r.label)}</strong>: ` +
            `${r.a ? "detected" : "not detected"} → ${r.b ? "detected" : "not detected"}.`
        );
      });

    if (out.length === 1) {
      out.push(
        "No numeric deltas could be computed from extractable line items. Open the raw HTML documents to verify table layout."
      );
    }

    return out;
  }


  /* ── Copy / CSV / watchlist ──────────────────────────── */

  function buildInsightText(parsed) {
    if (!parsed) return "";
    const bits = [
      `${parsed.companyName} · ${parsed.filingType}`,
      parsed.periodEnd ? `Period ${parsed.periodEnd}` : null
    ].filter(Boolean);

    const ins = parsed.insurance || {};
    if (ins.combinedRatio?.display) {
      bits.push(
        `Combined ratio ${ins.combinedRatio.display}` +
          (ins.combinedRatio.delta != null
            ? ` (${ins.combinedRatio.delta >= 0 ? "+" : ""}${ins.combinedRatio.delta.toFixed(1)} pts)`
            : "")
      );
    } else if (ins.lossRatio?.display) {
      bits.push(`Loss ratio ${ins.lossRatio.display}`);
    }

    const topRisk = (parsed.risks || [])[0];
    if (topRisk) bits.push(`Top risk flag: ${topRisk.title} (${topRisk.level})`);

    if (parsed.financials?.netIncome?.display) {
      bits.push(`Net income ${parsed.financials.netIncome.display}`);
    }

    bits.push("— C.A.L.I.O extract · verify on EDGAR");
    return bits.join(" · ");
  }

  async function copyInsight() {
    if (!state.parsed) {
      showInlineToast("Extract the filing first.", true);
      return;
    }
    const text = buildInsightText(state.parsed);
    try {
      await navigator.clipboard.writeText(text);
      showInlineToast("Insight copied to clipboard.");
    } catch {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        showInlineToast("Insight copied to clipboard.");
      } catch {
        showInlineToast("Could not copy — select text manually.", true);
      }
      ta.remove();
    }
  }

  function buildCsv(parsed) {
    const rows = [["field", "value", "prior", "source", "note"]];
    const push = (field, value, prior, source, note) => {
      rows.push([
        field,
        value ?? "",
        prior ?? "",
        source ?? "",
        (note || "").replace(/"/g, "'")
      ]);
    };

    push("company", parsed.companyName);
    push("filing_type", parsed.filingType);
    push("filing_date", parsed.filingDate || "");
    push("period_end", parsed.periodEnd || "");
    push("cik", parsed.cik || "");
    push("unit_scale", parsed.scale?.summary || "");

    for (const [key, m] of Object.entries(parsed.insurance || {})) {
      push(
        `insurance.${key}`,
        m.display || "",
        m.priorDisplay || "",
        m.source || "",
        m.interpretation || ""
      );
    }

    for (const spec of FINANCIAL_SPECS) {
      const m = parsed.financials?.[spec.key];
      push(
        `financial.${spec.key}`,
        m?.display || "",
        "",
        m?.source || "",
        m?.scaleApplied ? `scaled ${m.scaleLabel || ""}` : ""
      );
    }

    for (const r of parsed.risks || []) {
      push(`risk.${r.key}`, r.level, "", "keywords", r.title);
    }

    if (parsed.eightK) {
      push("eightk.event", parsed.eightK.label, "", "classifier", parsed.eightK.blurb);
    }

    return rows
      .map((cols) =>
        cols
          .map((c) => {
            const s = String(c ?? "");
            return /["\n,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
          })
          .join(",")
      )
      .join("\n");
  }


  async function exportExcel() {
    if (!state.parsed) {
      showInlineToast("Extract the filing first.", true);
      return;
    }
    setActionBusy("export-excel", true);
    try {
      const response = await sendMessage({
        type: "calio:downloadExcel",
        payload: {
          extract: {
            ...state.parsed,
            documentUrl: state.context?.documentUrl || ""
          }
        }
      });
      if (!response?.ok) throw new Error(response?.error || "Excel export failed.");
      showInlineToast(`Excel ready: ${response.filename || "export.xls"}`);
    } catch (error) {
      showInlineToast(error?.message || "Excel export failed.", true);
    } finally {
      setActionBusy("export-excel", false);
    }
  }

  async function exportCsv() {
    if (!state.parsed) {
      showInlineToast("Extract the filing first.", true);
      return;
    }
    setActionBusy("export-csv", true);
    try {
      const csv = buildCsv(state.parsed);
      const company = (state.parsed.companyName || "filing").replace(/\s+/g, "_").slice(0, 40);
      const ft = (state.parsed.filingType || "SEC").replace(/\s+/g, "");
      const response = await sendMessage({
        type: "calio:downloadText",
        payload: {
          text: csv,
          filename: `CALIO_${company}_${ft}_extract.csv`,
          mime: "text/csv;charset=utf-8"
        }
      });
      if (!response?.ok) throw new Error(response?.error || "CSV export failed.");
      showInlineToast(`CSV ready: ${response.filename || "export.csv"}`);
      sendMessage({
        type: "calio:recordRecent",
        payload: {
          companyName: state.parsed.companyName,
          filingType: state.parsed.filingType,
          sourceUrl: state.context?.documentUrl,
          action: "csv"
        }
      }).catch(() => {});
    } catch (error) {
      showInlineToast(error?.message || "CSV export failed.", true);
    } finally {
      setActionBusy("export-csv", false);
    }
  }

  async function toggleWatchlist() {
    if (!state.parsed) {
      showInlineToast("Extract the filing first.", true);
      return;
    }
    try {
      const snap =
        state.parsed.insurance?.combinedRatio?.display
          ? `CR ${state.parsed.insurance.combinedRatio.display}`
          : state.parsed.financials?.netIncome?.display
          ? `NI ${state.parsed.financials.netIncome.display}`
          : "";
      const response = await sendMessage({
        type: "calio:toggleWatchlist",
        payload: {
          companyName: state.parsed.companyName,
          cik: state.parsed.cik || "",
          sourceUrl: state.context?.documentUrl || location.href,
          filingType: state.parsed.filingType,
          snapshot: snap
        }
      });
      if (!response?.ok) throw new Error(response?.error || "Watchlist update failed.");
      state.watchlist = response.watchlist || [];
      state.watched = response.action === "added";
      showInlineToast(
        response.action === "added" ? "Added to watchlist." : "Removed from watchlist."
      );
      if (state.activeTab === "extract") renderMain();
    } catch (error) {
      showInlineToast(error?.message || "Watchlist failed.", true);
    }
  }

  /* ── Actions: download / pdf / email ─────────────────── */

  async function downloadHtml() {
    if (!state.context || !state.parsed) {
      showInlineToast("Parse the filing first.", true);
      return;
    }
    setActionBusy("download-html", true);
    try {
      const response = await sendMessage({
        type: "calio:downloadHtml",
        payload: {
          documentUrl: state.context.documentUrl,
          url: state.context.url,
          companyName: state.parsed.companyName,
          filingType: state.parsed.filingType,
          filingDate: state.parsed.filingDate || state.parsed.periodEnd || ""
        }
      });
      if (!response?.ok) throw new Error(response?.error || "Download failed.");
      showInlineToast(`HTML download started: ${response.filename || "filing.html"}`);
    } catch (error) {
      showInlineToast(error?.message || "Download failed.", true);
    } finally {
      setActionBusy("download-html", false);
    }
  }

  async function savePdf() {
    if (!state.context || !state.parsed) {
      showInlineToast("Parse the filing first.", true);
      return;
    }
    setActionBusy("save-pdf", true);
    try {
      // Attach human labels onto each metric for the report.
      const report = {
        ...state.parsed,
        financials: { ...state.parsed.financials }
      };
      for (const spec of FINANCIAL_SPECS) {
        if (report.financials[spec.key]) {
          report.financials[spec.key] = {
            ...report.financials[spec.key],
            label: spec.label
          };
        }
      }

      const response = await sendMessage({
        type: "calio:savePdf",
        payload: {
          documentUrl: state.context.documentUrl,
          url: state.context.url,
          companyName: state.parsed.companyName,
          filingType: state.parsed.filingType,
          filingDate: state.parsed.filingDate || state.parsed.periodEnd || "",
          periodEnd: state.parsed.periodEnd || "",
          report,
          factsSummary: buildFactsSummaryLines(state.parsed)
        }
      });
      if (!response?.ok) throw new Error(response?.error || "PDF export failed.");
      showInlineToast(
        response.message ||
          "C.A.L.I.O report opened — choose Save as PDF in the print dialog."
      );
    } catch (error) {
      showInlineToast(error?.message || "PDF export failed.", true);
    } finally {
      setActionBusy("save-pdf", false);
    }
  }

  async function sendEmail(form) {
    if (!state.context || !state.parsed) {
      showInlineToast("Parse the filing first.", true);
      return;
    }
    const email = form.querySelector('[name="email"]')?.value?.trim() || "";
    const mailClient = form.querySelector('[name="mailClient"]')?.value || "mailto";
    setActionBusy("send-email", true);
    try {
      const response = await sendMessage({
        type: "calio:sendEmail",
        payload: {
          email,
          mailClient,
          documentUrl: state.context.documentUrl,
          url: state.context.url,
          companyName: state.parsed.companyName,
          filingType: state.parsed.filingType,
          filingDate: state.parsed.filingDate || state.parsed.periodEnd || "",
          factsSummary: buildFactsSummaryLines(state.parsed)
        }
      });
      if (!response?.ok) throw new Error(response?.error || "Could not open email compose.");
      showInlineToast(response.message || "Email compose opened.");
    } catch (error) {
      showInlineToast(error?.message || "Email failed.", true);
    } finally {
      setActionBusy("send-email", false);
    }
  }

  function buildFactsSummaryLines(parsed) {
    const lines = [
      `Company: ${parsed.companyName}`,
      `Filing Type: ${parsed.filingType}`,
      parsed.filingDate ? `Filing Date: ${parsed.filingDate}` : null,
      parsed.periodEnd ? `Period End: ${parsed.periodEnd}` : null,
      parsed.cik ? `CIK: ${parsed.cik}` : null
    ].filter(Boolean);

    for (const m of Object.values(parsed.insurance || {})) {
      lines.push(`${m.label}: ${m.display || MISSING_METRIC}`);
    }

    for (const spec of FINANCIAL_SPECS) {
      const m = parsed.financials?.[spec.key];
      lines.push(`${spec.label}: ${m?.display || MISSING_METRIC}`);
    }

    if (parsed.eightK) {
      lines.push(`8-K event: ${parsed.eightK.label}`);
    }

    return lines;
  }

  function setActionBusy(action, busy) {
    const btn = state.refs.body.querySelector(`[data-action="${action}"]`);
    if (btn) btn.disabled = busy;
    const submit = state.refs.body.querySelector(`[data-busy-for="${action}"]`);
    if (submit) submit.disabled = busy;
  }

  function showInlineToast(message, isError = false) {
    let toast = state.refs.body.querySelector("[data-part='toast']");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "calio-toast";
      toast.setAttribute("data-part", "toast");
      state.refs.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("is-visible");
    toast.classList.toggle("error", Boolean(isError));
    toast.classList.toggle("info", !isError);
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 4200);
  }

  /* ── Rendering ───────────────────────────────────────── */

  function renderIdleState(context) {
    updateChrome();
    setBodyHtml(`
      <div class="calio-state-card">
        <div class="calio-eyebrow">Ready</div>
        <h2 class="calio-state-title">SEC page detected</h2>
        <p class="calio-muted">
          C.A.L.I.O works on filing indexes, inline XBRL viewers, and primary 10-K / 10-Q / 8-K documents.
          Click <strong>Extract</strong> above to pull insurance metrics, risk flags, and financials.
        </p>
        <div class="calio-chip-row">
          <span class="calio-chip accent">${escapeHtml(context.filingType)}</span>
          <span class="calio-chip">${escapeHtml(context.companyName)}</span>
          <span class="calio-chip">${escapeHtml(context.pageKind || "page")}</span>
        </div>
      </div>
      <div class="calio-section">
        <div class="calio-section-title">What you get</div>
        <div class="calio-feature-list">
          <div class="calio-feature-item">Insurance ratios (combined, loss, expense) when disclosed</div>
          <div class="calio-feature-item">Risk keyword scanner · 8-K event classifier</div>
          <div class="calio-feature-item">Compare filings · CSV / HTML / PDF · Email · Watchlist</div>
          <div class="calio-feature-item">Extract metrics, export Excel or PDF</div>
        </div>
      </div>
    `);
  }

  function renderLoadingState(context) {
    updateChrome();
    setBodyHtml(`
      <div class="calio-state-card">
        <div class="calio-eyebrow">Working</div>
        <h2 class="calio-state-title">Reading filing…</h2>
        <p class="calio-muted">
          Locating the primary document and extracting insurance metrics, risks, and financial line items.
        </p>
        <div class="calio-chip-row">
          <span class="calio-chip accent">${escapeHtml(context.filingType || "")}</span>
          <span class="calio-chip">${escapeHtml(context.companyName || "")}</span>
        </div>
        <div class="calio-loading-stack">
          <div class="calio-loading-line"></div>
          <div class="calio-loading-line short"></div>
          <div class="calio-loading-line"></div>
          <div class="calio-loading-line medium"></div>
        </div>
      </div>
    `);
  }

  function renderErrorState(message) {
    updateChrome();
    setBodyHtml(`
      <div class="calio-state-card">
        <div class="calio-eyebrow">Error</div>
        <h2 class="calio-state-title">Could not complete</h2>
        <p class="calio-muted">${escapeHtml(message)}</p>
        <p class="calio-hint">Use <strong>Extract</strong> in the top bar to try again.</p>
      </div>
    `);
  }

  function renderMain() {
    if (!state.parsed && state.activeTab !== "compare") {
      refreshContextAndRender();
      return;
    }

    updateChrome();

    let body = "";
    if (state.activeTab === "share") body = renderSharePanel();
    else if (state.activeTab === "compare") body = renderComparePanel();
    else body = renderExtractPanel();

    setBodyHtml(`${renderReviewPromptBanner()}${body}<div class="calio-toast" data-part="toast" aria-live="polite"></div>`);
  }

  function renderUsageBanner() {
    const u = state.usage || {};
    const count = Number(u.count) || 0;
    const limit = Number(u.freeLimit) || 5;
    if (count < 4) return "";
    if (count < 6) {
      return `
        <div class="calio-soft-banner">
          ${count} extracts this month · Pro will unlock unlimited extracts, history, and team share.
        </div>`;
    }
    return `
      <div class="calio-soft-banner warn">
        Heavy use this month (${count} extracts). You're on the founder free build — export &amp; watchlist stay open.
      </div>`;
  }

  function renderReviewPromptBanner() {
    if (!state.shouldPromptReview) return "";
    const count = state.reviewPromptCount || 3;
    return `
      <div class="calio-review-banner" style="margin: 0 0 16px 0; padding: 18px 16px; border-radius: 14px; background: #ffffff; border: 2px solid #0f766e; box-shadow: 0 10px 25px -5px rgba(15, 118, 110, 0.25); text-align: center;">
        <div style="display: inline-block; font-size: 11px; font-weight: 750; text-transform: uppercase; letter-spacing: 0.5px; color: #0f766e; background: rgba(15,118,110,0.1); padding: 3px 10px; border-radius: 999px; margin-bottom: 8px;">
          ${count} Extractions Completed
        </div>
        <div style="font-size: 15px; font-weight: 750; color: #0f172a; margin-bottom: 6px;">
          Finding CALIO useful?
        </div>
        <div style="font-size: 12px; color: #475569; line-height: 1.5; margin-bottom: 14px;">
          If CALIO is saving you time parsing SEC filings or building models, taking 30 seconds to leave a review on the Chrome Web Store helps us immensely.
        </div>
        <div style="display: flex; gap: 10px; justify-content: center; align-items: center;">
          <button type="button" class="calio-button secondary" data-action="review-dismiss" style="font-size: 12px; padding: 7px 16px; height: auto; min-height: 34px; border: 1px solid #cbd5e1; background: #f8fafc; color: #334155; border-radius: 8px; cursor: pointer; font-weight: 600;">
            Maybe later
          </button>
          <button type="button" class="calio-button" data-action="review-accept" style="font-size: 12px; padding: 7px 18px; height: auto; min-height: 34px; background: #0f766e; color: #ffffff; font-weight: 600; border-radius: 8px; cursor: pointer; border: none; box-shadow: 0 2px 4px rgba(15,118,110,0.3);">
            Leave a review
          </button>
        </div>
      </div>
    `;
  }

  function checkDrawerReviewPrompt() {
    sendMessage({ type: "calio:getReviewPromptState" })
      .then((res) => {
        if (res?.ok && res.shouldPromptReview) {
          state.shouldPromptReview = true;
          state.reviewPromptCount = res.count || 3;
          openDrawer();
          renderMain();
        }
      })
      .catch(() => {});
  }

  function renderInsuranceSection(parsed) {
    const metrics = Object.values(parsed.insurance || {}).filter(
      (m) => m && (m.display || m.missingLabel)
    );
    const disclosed = metrics.filter((m) => m.display);
    const pack = parsed.issuerType?.pack || "general";

    if (!disclosed.length) {
      const why =
        pack !== "insurance"
          ? "Combined ratio, loss ratio, and expense ratio are insurance underwriting metrics. They are typically not disclosed in non-insurer filings (for example technology or industrial companies)."
          : "These ratios usually appear in MD&A or key-metrics tables (not always on the face financial statements). They were not disclosed in the text available on this page.";
      return `
      <section class="calio-section">
        <div class="calio-section-title">Insurance metrics</div>
        <div class="calio-note-card">
          <strong>Not disclosed in this filing</strong> (for the insurance KPIs we track).<br/>
          ${escapeHtml(why)}
          ${
            parsed.issuerType?.label
              ? `<div class="calio-hint" style="margin-top:8px">Issuer type: ${escapeHtml(
                  parsed.issuerType.label
                )}</div>`
              : ""
          }
        </div>
      </section>`;
    }

    return `
      <section class="calio-section">
        <div class="calio-section-title">Insurance metrics</div>
        <p class="calio-hint" style="margin:0 0 10px">
          Combined / loss / expense ratios usually appear in MD&A or key metrics—not only on the income statement.
        </p>
        <div class="calio-metric-grid">
          ${metrics
            .map((m) => {
              if (!m.display) {
                return `
              <div class="calio-metric-card tone-neutral">
                <div class="calio-metric-label">${escapeHtml(m.label)}</div>
                <div class="calio-metric-value" style="font-size:14px;font-weight:650">
                  ${escapeHtml(m.missingLabel || MISSING_METRIC)}
                </div>
                <p class="calio-metric-note">${escapeHtml(m.interpretation || "")}</p>
              </div>`;
              }
              const tone = m.tone || "neutral";
              const delta =
                m.delta != null && Number.isFinite(m.delta)
                  ? `<span class="calio-metric-delta">${m.delta >= 0 ? "+" : ""}${m.delta.toFixed(1)}${
                      m.unit === "pct" ? " pts" : ""
                    }</span>`
                  : "";
              return `
              <div class="calio-metric-card tone-${escapeHtmlAttr(tone)}">
                <div class="calio-metric-label">${escapeHtml(m.label)}</div>
                <div class="calio-metric-value">${escapeHtml(m.display)}</div>
                <div class="calio-metric-meta">
                  ${m.priorDisplay ? `Prior ${escapeHtml(m.priorDisplay)}` : "As disclosed"}
                  ${delta}
                  ${m.source === "narrative_mda" ? " · MD&A" : ""}
                  ${m.source === "xbrl" ? " · XBRL" : ""}
                </div>
                <p class="calio-metric-note">${escapeHtml(m.interpretation || "")}</p>
              </div>`;
            })
            .join("")}
        </div>
      </section>`;
  }

  function renderRiskSection(parsed) {
    const risks = parsed.risks || [];
    if (!risks.length) {
      return `
      <section class="calio-section">
        <div class="calio-section-title">Risk scanner</div>
        <div class="calio-note-card">No insurance risk keyword clusters detected in the extract window.</div>
      </section>`;
    }
    return `
      <section class="calio-section">
        <div class="calio-section-title">Risk scanner</div>
        <div class="calio-risk-list">
          ${risks
            .map(
              (r) => `
            <div class="calio-risk-card level-${escapeHtmlAttr(r.level.toLowerCase())}">
              <div class="calio-risk-head">
                <span class="calio-risk-badge">${escapeHtml(r.level)}</span>
                <strong>${escapeHtml(r.title)}</strong>
              </div>
              <p class="calio-metric-note">${escapeHtml(r.explanation)}</p>
              ${
                r.snippet
                  ? `<div class="calio-snippet">“${escapeHtml(r.snippet)}”</div>`
                  : ""
              }
            </div>`
            )
            .join("")}
        </div>
      </section>`;
  }

  function renderCorporateIntelSection(parsed) {
    const ci = parsed.corporateIntel;
    if (!ci) return "";
    const items = ci.items || [];
    const people = ci.people || [];
    const orgs = ci.organizations || [];
    const facts = ci.facts || [];
    const txs = ci.transactions || [];
    if (
      !items.length &&
      !people.length &&
      !orgs.length &&
      !facts.length &&
      !txs.length
    ) {
      return "";
    }
    return `
      <section class="calio-section">
        <div class="calio-section-title">${escapeHtml(
          ci.headline || "Filing intelligence"
        )}</div>
        ${
          txs.length
            ? `<div class="calio-note-card" style="margin-bottom:10px">
                ${txs
                  .map(
                    (t) =>
                      `<div><strong>${escapeHtml(t.code || "Tx")}</strong> ${escapeHtml(
                        t.amount || ""
                      )} ${escapeHtml(t.security || "shares")} @ ${escapeHtml(
                        t.price || "n/a"
                      )} on ${escapeHtml(t.date || "—")}${
                        t.ownedAfter
                          ? ` · owns ${escapeHtml(t.ownedAfter)} after`
                          : ""
                      }</div>`
                  )
                  .join("")}
              </div>`
            : ""
        }
        ${
          facts.length
            ? `<div class="calio-fact-list" style="margin-bottom:10px">
                ${facts
                  .map(
                    (f) => `
                  <div class="calio-fact-row">
                    <div class="calio-fact-label">${escapeHtml(f.label)}</div>
                    <div class="calio-fact-value">${escapeHtml(f.value || "")}</div>
                  </div>`
                  )
                  .join("")}
              </div>`
            : ""
        }
        ${
          items.length
            ? `<div class="calio-note-card" style="margin-bottom:10px">
                <strong>Items:</strong>
                ${escapeHtml(items.map((i) => i.code).join(", "))}
              </div>`
            : ""
        }
        ${
          people.length
            ? `<p class="calio-hint" style="margin:0 0 6px"><strong>People</strong> — ${escapeHtml(
                people
                  .map((p) => p.name + (p.role ? ` (${p.role})` : ""))
                  .join("; ")
              )}</p>`
            : ""
        }
        ${
          orgs.length
            ? `<p class="calio-hint" style="margin:0"><strong>Organizations</strong> — ${escapeHtml(
                orgs
                  .map((o) => o.name + (o.role ? ` (${o.role})` : ""))
                  .join("; ")
              )}</p>`
            : ""
        }
      </section>`;
  }

  function renderEightKSection(parsed) {
    if (!parsed.eightK) return "";
    return `
      <section class="calio-section">
        <div class="calio-section-title">8-K event</div>
        <div class="calio-action-card">
          <div class="calio-action-card-title">${escapeHtml(parsed.eightK.label)}</div>
          <p class="calio-action-card-desc">${escapeHtml(parsed.eightK.blurb)}</p>
        </div>
      </section>`;
  }

  function renderExtractPanel() {
    const parsed = state.parsed;
    if (!parsed) {
      return `<div class="calio-empty-inline">Run Extract from the top bar.</div>`;
    }

    const scaleNote = parsed.scale?.primaryEvidence
      ? `Unit footnote: ${parsed.scale.primaryEvidence}. Money line items scaled to absolute USD when possible. EPS is never scaled.`
      : "No “in millions/thousands” footnote detected — values shown as reported.";

    const presenceItems = [
      ...SECTION_SPECS.map((s) => [s.label, parsed.sections?.[s.key]]),
      ...MENTION_SPECS.map((s) => [s.label, parsed.mentions?.[s.key]])
    ];

    return `
      ${renderUsageBanner()}

      <div class="calio-hero-card">
        <div class="calio-eyebrow">Structured extract</div>
        <h2 class="calio-state-title">${escapeHtml(parsed.companyName)}</h2>
        <div class="calio-chip-row">
          <span class="calio-chip accent">${escapeHtml(parsed.filingType)}</span>
          ${parsed.filingDate ? `<span class="calio-chip">${escapeHtml(parsed.filingDate)}</span>` : ""}
          ${parsed.periodEnd ? `<span class="calio-chip">Period ${escapeHtml(parsed.periodEnd)}</span>` : ""}
          ${
            parsed.scale?.primaryLabel && parsed.scale.primaryLabel !== "as reported"
              ? `<span class="calio-chip accent">Units: ${escapeHtml(parsed.scale.primaryLabel)}</span>`
              : ""
          }
          ${
            parsed.issuerType?.label
              ? `<span class="calio-chip">${escapeHtml(parsed.issuerType.label)}</span>`
              : ""
          }
          <span class="calio-chip">Structured extract</span>
        </div>
        ${
          parsed.note
            ? `<div class="calio-note-card" style="margin-top:12px">${escapeHtml(parsed.note)}</div>`
            : ""
        }
        <p class="calio-muted" style="margin-top:10px;font-size:12px">${escapeHtml(scaleNote)}</p>
      </div>

      <div class="calio-action-row calio-action-row-wrap" style="margin-top:12px">
        <button class="calio-button" data-action="copy-insight" type="button">Copy insight</button>
        <button class="calio-button secondary" data-action="export-excel" type="button">Download Excel</button>
        <button class="calio-button secondary" data-action="export-csv" type="button">CSV</button>
        <button class="calio-button secondary" data-action="toggle-watchlist" type="button">
          ${state.watched ? "Watchlisted" : "Watchlist"}
        </button>
        <button class="calio-button secondary" data-action="save-pdf" type="button">PDF report</button>
        <button class="calio-button secondary" data-action="open-app" type="button">Open app</button>
      </div>

      ${renderCorporateIntelSection(parsed)}
      ${renderInsuranceSection(parsed)}
      ${renderRiskSection(parsed)}
      ${renderEightKSection(parsed)}

      <section class="calio-section">
        <div class="calio-section-title">Financial line items</div>
        <div class="calio-fact-list">
          ${FINANCIAL_SPECS.map((spec) => {
            const metric = parsed.financials?.[spec.key];
            const found = Boolean(metric?.display);
            const sub = metric?.scaleApplied
              ? `Table: ${metric.reportedDisplay} ${metric.scaleLabel}`
              : metric?.line
              ? metric.line.slice(0, 80)
              : "";
            return `
            <div class="calio-fact-row">
              <div class="calio-fact-label">${escapeHtml(spec.label)}${
                sub ? `<div class="calio-hint">${escapeHtml(sub)}</div>` : ""
              }</div>
              <div class="calio-fact-value ${found ? "mono" : "muted"}">${escapeHtml(
                metric?.display || MISSING_METRIC
              )}${
                metric?.source === "xbrl"
                  ? `<div class="calio-hint">Source: XBRL${
                      metric.xbrlTag ? ` · ${metric.xbrlTag}` : ""
                    }</div>`
                  : ""
              }</div>
            </div>`;
          }).join("")}
        </div>
      </section>

      <section class="calio-section">
        <div class="calio-section-title">Sections & mentions</div>
        <div class="calio-presence-grid">
          ${presenceItems
            .map(
              ([label, present]) => `
            <div class="calio-presence-item ${present ? "is-present" : ""}">
              <span class="calio-presence-dot"></span>
              <span>${escapeHtml(label)}${present ? "" : " — not detected"}</span>
            </div>`
            )
            .join("")}
        </div>
      </section>
    `;
  }

  function renderSharePanel() {
    const parsed = state.parsed;
    if (!parsed) {
      return `<div class="calio-empty-inline">Run extract first, then share.</div>`;
    }

    return `
      <div class="calio-action-stack">
        <div class="calio-action-card">
          <div class="calio-action-card-title">Export report</div>
          <p class="calio-action-card-desc">
            Export a PDF report or a real Excel workbook (.xlsx) for desktop Excel and Google Sheets.
          </p>
          <div class="calio-action-row">
            <button class="calio-button" data-action="save-pdf" type="button">Save PDF report</button>
            <button class="calio-button secondary" data-action="export-excel" type="button">Download Excel</button>
          </div>
        </div>

        <div class="calio-action-card">
          <div class="calio-action-card-title">Email this filing</div>
          <p class="calio-action-card-desc">Opens your mail client with the EDGAR link and extracted facts. No server sends mail.</p>
          <form data-form="email">
            <div class="calio-email-row">
              <input class="calio-input" type="email" name="email" placeholder="name@company.com"
                value="${escapeHtmlAttr(state.prefs.lastEmail || "")}" required autocomplete="email" />
              <button class="calio-button" type="submit" data-busy-for="send-email">Send</button>
            </div>
            <div style="margin-top:10px">
              <select class="calio-select" name="mailClient">
                <option value="mailto" ${state.prefs.preferredMailClient !== "gmail" ? "selected" : ""}>Default mail app</option>
                <option value="gmail" ${state.prefs.preferredMailClient === "gmail" ? "selected" : ""}>Gmail (web)</option>
              </select>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  function renderComparePanel() {
    // Prefer parsed identity; never seed with US state false positives.
    let defaultCompany = state.parsed?.companyName || state.context?.companyName || "";
    if (!isPlausibleCompanyName(defaultCompany)) defaultCompany = "";

    let defaultType = state.parsed?.filingType || state.context?.filingType || "10-Q";
    if (!defaultType || defaultType === "UNKNOWN") defaultType = "10-Q";

    const formTypes = ["10-Q", "10-K", "8-K", "20-F", "6-K", "S-1", "S-3", "DEF 14A"];
    const showQuarters = formNeedsQuarter(defaultType);
    const quarterDisplay = showQuarters ? "" : "display:none";

    const quarterOptions = `
      <option value="Q1">Q1 (Jan–Mar report date)</option>
      <option value="Q2">Q2 (Apr–Jun report date)</option>
      <option value="Q3">Q3 (Jul–Sep report date)</option>
      <option value="Q4">Q4 (Oct–Dec report date)</option>
      <option value="latest" selected>Latest in that year</option>
    `;

    const formHtml = `
      <div class="calio-action-card">
        <div class="calio-action-card-title">Compare two filings</div>
        <p class="calio-action-card-desc">
          Enter company + form type + years. <strong>Quarters only appear for 10-Q</strong>
          (up to four per year). For 10-K / 8-K / others, CALIO uses the latest matching filing in each year.
          Or paste two EDGAR document URLs.
        </p>
        <form data-form="compare">
          <div class="calio-form-grid single">
            <label class="calio-field">
              <span class="calio-label">Company name or ticker</span>
              <input class="calio-input" name="company" placeholder="NVDA or NVIDIA Corporation" value="${escapeHtmlAttr(defaultCompany)}" />
            </label>
          </div>
          <div class="calio-form-grid" style="margin-top:10px">
            <label class="calio-field full">
              <span class="calio-label">Form type</span>
              <select class="calio-select" name="formType">
                ${formTypes
                  .map(
                    (t) =>
                      `<option value="${t}" ${t === defaultType ? "selected" : ""}>${t}</option>`
                  )
                  .join("")}
              </select>
            </label>
            <label class="calio-field">
              <span class="calio-label">Year A</span>
              <input class="calio-input" name="yearA" placeholder="2024" inputmode="numeric" />
            </label>
            <label class="calio-field" data-quarter-field style="${quarterDisplay}">
              <span class="calio-label">Quarter A</span>
              <select class="calio-select" name="quarterA">${quarterOptions}</select>
            </label>
            <label class="calio-field">
              <span class="calio-label">Year B</span>
              <input class="calio-input" name="yearB" placeholder="2025" inputmode="numeric" />
            </label>
            <label class="calio-field" data-quarter-field style="${quarterDisplay}">
              <span class="calio-label">Quarter B</span>
              <select class="calio-select" name="quarterB">${quarterOptions}</select>
            </label>
          </div>
          <div class="calio-form-grid single" style="margin-top:10px">
            <label class="calio-field">
              <span class="calio-label">Optional — Document URL A</span>
              <input class="calio-input" name="urlA" placeholder="https://www.sec.gov/Archives/..." />
            </label>
            <label class="calio-field">
              <span class="calio-label">Optional — Document URL B</span>
              <input class="calio-input" name="urlB" placeholder="https://www.sec.gov/Archives/..." />
            </label>
          </div>
          <div class="calio-action-row" style="margin-top:12px">
            <button class="calio-button" type="submit" data-busy-for="compare">Compare filings</button>
          </div>
          <p class="calio-hint" data-quarter-hint style="margin-top:8px;${quarterDisplay}">
            10-Q quarters use the SEC <em>report date</em> calendar month.
            If both URLs are set, company/year/quarter are ignored.
          </p>
        </form>
      </div>
    `;

    if (!state.compareResult) {
      return formHtml;
    }

    const { left, right, leftUrl, rightUrl, diff, formType, company } = state.compareResult;
    const labelA = diff.meta.labelA;
    const labelB = diff.meta.labelB;

    return `
      ${formHtml}

      <div class="calio-hero-card" style="margin-top:14px">
        <div class="calio-eyebrow">Comparison result</div>
        <h2 class="calio-state-title">${escapeHtml(company)}</h2>
        <div class="calio-chip-row">
          <span class="calio-chip accent">${escapeHtml(formType)}</span>
          <span class="calio-chip">${escapeHtml(String(labelA))} vs ${escapeHtml(String(labelB))}</span>
        </div>
        <div class="calio-compare-cols" style="margin-top:12px">
          <div class="calio-compare-head">${escapeHtml(String(labelA))}<br/><span style="font-weight:600;opacity:.8">${escapeHtml(left.periodEnd || left.filingDate || "")}</span></div>
          <div class="calio-compare-head">${escapeHtml(String(labelB))}<br/><span style="font-weight:600;opacity:.8">${escapeHtml(right.periodEnd || right.filingDate || "")}</span></div>
        </div>
        <p class="calio-muted" style="font-size:11px;word-break:break-all">
          <a data-action="open-document" data-url="${escapeHtmlAttr(leftUrl)}" style="color:#19443c;cursor:pointer">Open A</a>
          ·
          <a data-action="open-document" data-url="${escapeHtmlAttr(rightUrl)}" style="color:#19443c;cursor:pointer">Open B</a>
        </p>
      </div>

      <section class="calio-section">
        <div class="calio-section-title">Key differences (numeric)</div>
        <div class="calio-fact-list">
          <div class="calio-fact-row" style="background:var(--calio-mist)">
            <div class="calio-fact-label" style="font-weight:800">Metric</div>
            <div class="calio-fact-value muted" style="font-size:11px">${escapeHtml(String(labelA))} → ${escapeHtml(String(labelB))} · Δ</div>
          </div>
          ${diff.financialRows
            .map((r) => {
              const deltaClass =
                r.direction === "up" ? "up" : r.direction === "down" ? "down" : "muted";
              return `
              <div class="calio-fact-row">
                <div class="calio-fact-label">${escapeHtml(r.label)}
                  <div class="calio-hint">${escapeHtml(r.aDisplay)} → ${escapeHtml(r.bDisplay)}</div>
                </div>
                <div class="calio-fact-value ${deltaClass} mono">${escapeHtml(r.deltaDisplay)}</div>
              </div>`;
            })
            .join("")}
        </div>
      </section>

      <section class="calio-section">
        <div class="calio-section-title">Text insights (deterministic)</div>
        <ul class="calio-insight-list">
          ${diff.insights.map((line) => `<li>${line}</li>`).join("")}
        </ul>
      </section>

      <section class="calio-section">
        <div class="calio-section-title">Section presence changes</div>
        <div class="calio-presence-grid">
          ${diff.sectionRows
            .map(
              (r) => `
            <div class="calio-presence-item ${r.b ? "is-present" : ""}">
              <span class="calio-presence-dot"></span>
              <span>${escapeHtml(r.label)}: ${r.a ? "Y" : "N"} → ${r.b ? "Y" : "N"}${r.changed ? " (Changed)" : ""}</span>
            </div>`
            )
            .join("")}
        </div>
      </section>

      <div class="calio-disclaimer">
        Deltas are computed only from values CALIO could extract from each document’s text.
        Scale (thousands vs millions) may differ between filings — always verify in EDGAR.
      </div>
    `;
  }

  function renderCompareLoading(company, formType, yearA, yearB, quarterA, quarterB) {
    setBodyHtml(`
      <div class="calio-tabs">
        <button type="button" class="calio-tab" data-action="tab-extract">Extract</button>
        <button type="button" class="calio-tab" data-action="tab-share">Share</button>
        <button type="button" class="calio-tab is-active" data-action="tab-compare">Compare</button>
      </div>
      <div class="calio-state-card">
        <div class="calio-eyebrow">Comparing</div>
        <h2 class="calio-state-title">Fetching both filings…</h2>
        <p class="calio-muted">
          Resolving ${escapeHtml(company || "company")} ${escapeHtml(formType)}
          ${escapeHtml(yearA)} ${escapeHtml(quarterA || "")} vs
          ${escapeHtml(yearB)} ${escapeHtml(quarterB || "")} from EDGAR, then extracting with unit-scale awareness.
        </p>
        <div class="calio-loading-stack">
          <div class="calio-loading-line"></div>
          <div class="calio-loading-line medium"></div>
          <div class="calio-loading-line short"></div>
        </div>
      </div>
    `);
  }

  function renderCompareError(message) {
    state.compareResult = null;
    state.activeTab = "compare";
    setBodyHtml(`
      <div class="calio-tabs">
        <button type="button" class="calio-tab" data-action="tab-extract">Extract</button>
        <button type="button" class="calio-tab" data-action="tab-share">Share</button>
        <button type="button" class="calio-tab is-active" data-action="tab-compare">Compare</button>
      </div>
      <div class="calio-state-card">
        <div class="calio-eyebrow">Compare error</div>
        <h2 class="calio-state-title">Could not compare</h2>
        <p class="calio-muted">${escapeHtml(message)}</p>
      </div>
      <div style="margin-top:12px">${renderComparePanel()}</div>
    `);
  }

  /* ── Helpers ─────────────────────────────────────────── */

  function setBodyHtml(html) {
    state.refs.body.innerHTML = html;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeHtmlAttr(value) {
    return escapeHtml(value);
  }

  function normalizeWhitespace(text) {
    return String(text || "")
      .replace(/\r/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
  }

  function sendMessage(message) {
    return new Promise((resolve, reject) => {
      try {
        if (!chrome?.runtime?.id) {
          reject(new Error("Extension context invalidated."));
          return;
        }
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          resolve(response);
        });
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  function initSmartFootnotePeeker() {
    let popover = null;

    function getOrCreatePopover() {
      if (popover) return popover;
      popover = document.createElement("div");
      popover.id = "calio-footnote-popover";
      popover.style.cssText = `
        position: fixed;
        z-index: 2147483647;
        max-width: 440px;
        min-width: 260px;
        padding: 12px 16px;
        background: rgba(15, 46, 41, 0.96);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        color: #ffffff;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 12.5px;
        line-height: 1.5;
        border-radius: 10px;
        box-shadow: 0 16px 36px rgba(0, 0, 0, 0.28);
        border: 1px solid rgba(20, 184, 166, 0.35);
        pointer-events: none;
        opacity: 0;
        transform: translateY(6px);
        transition: opacity 0.15s ease, transform 0.15s ease;
      `;
      document.body.appendChild(popover);
      return popover;
    }

    document.addEventListener("mouseover", (e) => {
      const target = e.target;
      if (!target) return;

      const sup = target.closest("sup, a[href*='#'], [id*='foot'], [class*='foot']");
      if (!sup) return;

      const txt = sup.textContent.trim();
      if (!/^\(?[0-9a-zA-Z]{1,3}\)?$|^\[[0-9a-zA-Z]{1,3}\]$|^Note\s+[0-9]+/i.test(txt)) return;

      let resolvedText = "";
      const href = sup.getAttribute?.("href") || sup.querySelector?.("a")?.getAttribute?.("href");
      if (href && href.startsWith("#")) {
        const id = href.slice(1);
        const el = document.getElementById(id) || document.querySelector(`[name="${id}"]`);
        if (el) resolvedText = el.closest("tr, p, div, li")?.textContent?.trim() || el.textContent?.trim();
      }

      if (!resolvedText) {
        const cleanNum = txt.replace(/[\(\)\[\]]/g, "");
        const candidates = Array.from(document.querySelectorAll("p, tr, div, li"));
        for (const c of candidates) {
          const ct = c.textContent.trim();
          if (ct.startsWith(`(${cleanNum})`) || ct.startsWith(`[${cleanNum}]`) || ct.startsWith(`${cleanNum}.`)) {
            resolvedText = ct;
            break;
          }
        }
      }

      if (resolvedText && resolvedText.length > 5 && resolvedText !== txt) {
        const p = getOrCreatePopover();
        p.innerHTML = `
          <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px; font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:#5eead4;">
            <span>Footnote Preview</span>
            <span style="opacity:0.6;">· ${escapeHtml(txt)}</span>
          </div>
          <div style="color:#e2e8f0; max-height:160px; overflow-y:auto;">${escapeHtml(resolvedText.slice(0, 320))}${resolvedText.length > 320 ? "…" : ""}</div>
        `;
        const rect = sup.getBoundingClientRect();
        let top = rect.bottom + 8;
        let left = Math.max(12, rect.left - 20);
        if (left + 440 > window.innerWidth) left = window.innerWidth - 450;
        if (top + 160 > window.innerHeight) top = rect.top - 170;

        p.style.top = `${top}px`;
        p.style.left = `${left}px`;
        p.style.opacity = "1";
        p.style.transform = "translateY(0)";
      }
    });

    document.addEventListener("mouseout", (e) => {
      const target = e.target;
      if (target?.closest("sup, a[href*='#'], [id*='foot'], [class*='foot']")) {
        if (popover) {
          popover.style.opacity = "0";
          popover.style.transform = "translateY(6px)";
        }
      }
    });
  }

  /* ── Bootstrap last (after all consts/functions exist) ─── */
  if (!shouldRunOnPage()) {
    // no-op on non-SEC pages
  } else if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  } else {
    mount();
  }
})();
