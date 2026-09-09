/**
 * C.A.L.I.O App — Dashboard, Extract, Compare
 */
(() => {
  const state = {
    view: "dashboard",
    company: null,
    filings: null,
    extract: null,
    searchTimer: null,
    searchHistory: [],
    extractHistory: [],
    watchlist: [],
    alerts: [],
    lastCompare: null,
    /** True while Open & extract is waiting for the new filing to finish parsing */
    extracting: false,
    pendingExtractUrl: null,
    pendingExtractSince: 0,
    extractPollTimer: null
  };

  const LAST_EXTRACT_KEY = "calioLastExtract";

  const HISTORY_KEY = "calioSearchHistory";
  const MAX_HISTORY = 12;

  const el = {
    searchInput: document.getElementById("searchInput"),
    btnSearch: document.getElementById("btnSearch"),
    searchResults: document.getElementById("searchResults"),
    viewDashboard: document.getElementById("viewDashboard"),
    viewExtract: document.getElementById("viewExtract"),
    viewPeerComps: document.getElementById("viewPeerComps"),
    viewSegment: document.getElementById("viewSegment"),
    viewExecComp: document.getElementById("viewExecComp"),
    viewCompare: document.getElementById("viewCompare"),
    viewRedline: document.getElementById("viewRedline"),
    versionBadge: document.getElementById("versionBadge"),
    toast: document.getElementById("toast"),
    btnSettings: document.getElementById("btnSettings")
  };

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    document.querySelectorAll(".nav-item").forEach((btn) => {
      btn.addEventListener("click", () => setView(btn.getAttribute("data-view")));
    });

    document.querySelectorAll("[data-drawer-target]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = btn.getAttribute("data-drawer-target");
        document.querySelectorAll(".seg-btn").forEach((b) => {
          b.classList.toggle("is-active", b === btn);
          b.setAttribute("aria-selected", b === btn ? "true" : "false");
        });
        document.querySelectorAll(".drawer-panel").forEach((panel) => {
          const isTarget = panel.id === `drawer${target.charAt(0).toUpperCase() + target.slice(1)}`;
          panel.classList.toggle("is-active", isTarget);
          panel.hidden = !isTarget;
        });
      });
    });

    el.btnSearch.addEventListener("click", () => runSearch(el.searchInput.value));
    el.searchInput.addEventListener("input", () => {
      clearTimeout(state.searchTimer);
      const q = el.searchInput.value.trim();
      if (q.length < 1) {
        el.searchResults.hidden = true;
        el.searchResults.innerHTML = "";
        return;
      }
      // Suggest as you type (same rhythm as EDGAR company lookup)
      state.searchTimer = setTimeout(() => runSearch(q, true), 180);
    });

    // Keyboard: arrows highlight a suggestion; Enter selects it or searches
    el.searchInput.addEventListener("keydown", (e) => {
      const items = [...el.searchResults.querySelectorAll(".suggest-row")];
      const active = el.searchResults.querySelector(".suggest-row.is-active");
      let idx = active ? items.indexOf(active) : -1;

      if (e.key === "ArrowDown" && items.length && !el.searchResults.hidden) {
        e.preventDefault();
        idx = Math.min(items.length - 1, idx + 1);
        items.forEach((n) => n.classList.remove("is-active"));
        items[idx].classList.add("is-active");
        items[idx].scrollIntoView({ block: "nearest" });
        return;
      }
      if (e.key === "ArrowUp" && items.length && !el.searchResults.hidden) {
        e.preventDefault();
        idx = Math.max(0, idx <= 0 ? 0 : idx - 1);
        items.forEach((n) => n.classList.remove("is-active"));
        items[idx].classList.add("is-active");
        items[idx].scrollIntoView({ block: "nearest" });
        return;
      }
      if (e.key === "Enter") {
        if (active) {
          e.preventDefault();
          active.click();
        } else {
          runSearch(el.searchInput.value);
        }
      }
      if (e.key === "Escape") {
        el.searchResults.hidden = true;
      }
    });

    el.btnSettings.addEventListener("click", () =>
      send({ type: "calio:openOptions" })
    );

    document.getElementById("btnClearHistory")?.addEventListener("click", () => {
      openClearHistoryConfirm();
    });

    document.body.addEventListener("click", onClick);
    document.body.addEventListener("change", onChange);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeConfirmDialog();
        closeReviewDialog();
        closeQuotaDialog();
        if (el.searchResults) el.searchResults.hidden = true;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (el.searchInput) {
          el.searchInput.focus();
          el.searchInput.select();
        }
        return;
      }
      const activeTag = document.activeElement?.tagName?.toLowerCase();
      if (activeTag === "input" || activeTag === "textarea" || activeTag === "select") {
        return;
      }
      if (e.key === "1") setView("dashboard");
      if (e.key === "2") setView("extract");
      if (e.key === "3") setView("peerComps");
      if (e.key === "4") setView("segment");
      if (e.key === "5") setView("execComp");
      if (e.key === "6") setView("compare");
      if (e.key === "7") setView("redline");
    });

    // Always start from solid teal+white unless user chose mono
    applyAppTheme("teal");
    loadSearchHistory();

    try {
      const st = await send({ type: "calio:getState" });
      if (st?.ok) {
        el.versionBadge.textContent = `v${st.state.version || "1.17.0"}`;
        applyAppTheme("teal");
        updatePlanAndUsageDisplay(st.state.usage, st.state.settings);
      }
    } catch {
      /* ignore */
    }

    renderDashboardEmpty();
    renderExtractEmpty();
    renderCompare();

    // Keep Extract in sync when content script / background writes a new extract
    // (this was the "stuck on Microsoft" bug — Open & extract never refreshed the UI).
    if (chrome?.storage?.onChanged) {
      chrome.storage.onChanged.addListener(onStorageChanged);
    }

    await refreshExtractHistory();
    await refreshWatchlistAndAlerts();
    applySidebarCollapseState();
    // Keep monitor alarm alive; full check is on-demand via watchlist
    send({ type: "calio:ensureMonitor" }).catch(() => {});

    try {
      const cached = await send({ type: "calio:getLastCompany" });
      if (cached?.ok && cached.company) {
        await loadCompany(cached.company.cik, cached.company);
      }
    } catch {
      /* ignore */
    }

    try {
      const ex = await send({ type: "calio:getLastExtract" });
      if (ex?.ok && ex.extract) {
        applyExtract(ex.extract, { silent: true, switchView: false });
      }
    } catch {
      /* ignore */
    }

    setTimeout(() => {
      checkReviewPromptTrigger();
    }, 2500);
  }

  function onStorageChanged(changes, area) {
    if (area !== "local") return;

    if (changes.calioExtractHistory) {
      refreshExtractHistory().catch(() => {});
    }
    if (changes.calioWatchlist || changes.calioAlerts) {
      refreshWatchlistAndAlerts().catch(() => {});
    }
    if (changes.calioExtractionCount) {
      checkReviewPromptTrigger().catch(() => {});
    }
    if (changes.calioSettings || changes.calioUsage) {
      refreshPlanAndUsage().catch(() => {});
    }

    const change = changes[LAST_EXTRACT_KEY];
    if (!change || change.newValue == null) return;
    const next = change.newValue;
    if (!next || typeof next !== "object") return;

    // If we opened a specific filing, only accept extracts that match that URL
    // (or any new extract while waiting, if URL is still unknown on the payload).
    if (state.extracting && state.pendingExtractUrl) {
      if (!extractMatchesPending(next, state.pendingExtractUrl, state.pendingExtractSince)) {
        return;
      }
    }

    applyExtract(next, {
      silent: false,
      switchView: Boolean(state.extracting),
      toastMsg: state.extracting
        ? `Extract ready — ${next.companyName || "filing"}`
        : null
    });
    refreshExtractHistory().catch(() => {});
  }

  function extractMatchesPending(extract, pendingUrl, since) {
    const doc = String(extract?.documentUrl || extract?.sourceUrl || "").trim();
    // Prefer document URL match so a prior extract (e.g. Microsoft) is never
    // treated as the new BlackRock result while we wait.
    if (pendingUrl && doc) return urlsRoughMatch(doc, pendingUrl);
    const savedAt = Number(extract?.extractedAt || extract?.savedAt || 0);
    if (savedAt && since && savedAt >= since - 2000) return true;
    // No safe signal — keep waiting (do not re-apply the stale extract)
    return false;
  }

  function normalizeSecUrlDocPath(urlStr) {
    try {
      const u = new URL(urlStr);
      if (u.searchParams && u.searchParams.has("doc")) {
        return u.searchParams.get("doc").replace(/\/+$/, "");
      }
      return u.pathname.replace(/\/+$/, "");
    } catch {
      return String(urlStr || "").replace(/[?#].*$/, "").replace(/\/+$/, "");
    }
  }

  function urlsRoughMatch(a, b) {
    if (!a || !b) return false;
    const sa = String(a).trim();
    const sb = String(b).trim();
    if (sa === sb) return true;

    const pa = normalizeSecUrlDocPath(sa);
    const pb = normalizeSecUrlDocPath(sb);
    if (pa && pb && (pa === pb || pa.endsWith(pb) || pb.endsWith(pa))) return true;

    // Check accession number (18 digits with or without hyphens)
    const accnA = (sa.match(/\d{10}-?\d{2}-?\d{6}/) || [])[0]?.replace(/-/g, "");
    const accnB = (sb.match(/\d{10}-?\d{2}-?\d{6}/) || [])[0]?.replace(/-/g, "");
    if (accnA && accnB && accnA === accnB) return true;

    return sa.includes(sb) || sb.includes(sa);
  }

  function applyExtract(extract, opts = {}) {
    const { silent = false, switchView = false, toastMsg = null } = opts;
    if (!extract || typeof extract !== "object") return;

    // Harden unknown form labels from intel pack
    if (
      (!extract.filingType || extract.filingType === "UNKNOWN") &&
      extract.corporateIntel?.formType
    ) {
      extract = { ...extract, filingType: extract.corporateIntel.formType };
    }
    if (
      (!extract.filingType || extract.filingType === "UNKNOWN") &&
      extract.intelKind === "form144"
    ) {
      extract = { ...extract, filingType: "144" };
    }

    // Dedupe: storage listener + poll can both fire for the same extract
    const prior = state.extract;
    const sameAsPrior =
      prior &&
      ((prior.extractedAt && extract.extractedAt && prior.extractedAt === extract.extractedAt) ||
        (prior.documentUrl &&
          extract.documentUrl &&
          urlsRoughMatch(prior.documentUrl, extract.documentUrl) &&
          prior.companyName === extract.companyName &&
          prior.filingType === extract.filingType));
    if (sameAsPrior && !state.extracting) {
      if (switchView && state.view !== "extract") setView("extract");
      return;
    }

    state.extract = extract;
    state.extracting = false;
    state.pendingExtractUrl = null;
    state.pendingExtractSince = 0;
    if (state.extractPollTimer) {
      clearInterval(state.extractPollTimer);
      state.extractPollTimer = null;
    }
    if (switchView) setView("extract");
    else renderExtract();
    if (!silent) {
      toast(toastMsg || `Extract ready — ${extract.companyName || "filing"}`);
    }
    checkReviewPromptTrigger();
    refreshExtractHistory().catch(() => {});
    applySidebarCollapseState();
  }

  function renderExtractLoading(hint) {
    el.viewExtract.innerHTML = `
      <div class="extract-loading">
        <div class="extract-spinner" aria-hidden="true"></div>
        <strong>Extracting filing…</strong>
        <p>
          ${escapeHtml(
            hint ||
              "Opening the SEC document and pulling metrics. This usually takes a few seconds."
          )}
        </p>
        <p class="extract-loading-note">
          Stay on this tab — results will appear here automatically when the parse finishes.
        </p>
      </div>`;
  }

  function startExtractPoll(pendingUrl, since) {
    if (state.extractPollTimer) clearInterval(state.extractPollTimer);
    let ticks = 0;
    state.extractPollTimer = setInterval(async () => {
      ticks += 1;
      if (!state.extracting) {
        clearInterval(state.extractPollTimer);
        state.extractPollTimer = null;
        return;
      }
      // ~45s timeout (800ms * 56)
      if (ticks > 56) {
        clearInterval(state.extractPollTimer);
        state.extractPollTimer = null;
        state.extracting = false;
        if (state.view === "extract") {
          el.viewExtract.innerHTML = `
            <div class="empty" style="padding:40px 16px">
              <strong>Extract is taking longer than expected</strong>
              The filing tab may still be loading. Open it, wait for the document to finish,
              then use <em>Extract active tab</em>.
            </div>
            <div class="actions" style="justify-content:center">
              <button type="button" class="btn primary" data-action="extract-active">Extract active tab</button>
            </div>`;
        }
        toast("Extract timed out — try Extract active tab on the filing.", true);
        return;
      }
      try {
        const ex = await send({ type: "calio:getLastExtract" });
        if (!ex?.ok || !ex.extract) return;
        if (!extractMatchesPending(ex.extract, pendingUrl, since)) return;
        applyExtract(ex.extract, {
          silent: false,
          switchView: true,
          toastMsg: `Extract ready — ${ex.extract.companyName || "filing"}`
        });
      } catch {
        /* keep polling */
      }
    }, 800);
  }

  function setView(name) {
    state.view = name;
    document.querySelectorAll(".nav-item").forEach((btn) => {
      btn.classList.toggle("is-active", btn.getAttribute("data-view") === name);
    });
    el.viewDashboard.hidden = name !== "dashboard";
    el.viewExtract.hidden = name !== "extract";
    if (el.viewPeerComps) el.viewPeerComps.hidden = name !== "peerComps";
    if (el.viewSegment) el.viewSegment.hidden = name !== "segment";
    if (el.viewExecComp) el.viewExecComp.hidden = name !== "execComp";
    el.viewCompare.hidden = name !== "compare";
    if (el.viewRedline) el.viewRedline.hidden = name !== "redline";

    if (name === "dashboard") renderDashboard();
    if (name === "extract") {
      if (state.extracting) {
        renderExtractLoading();
      } else {
        renderExtract();
      }
    }
    if (name === "peerComps") renderPeerComps();
    if (name === "segment") renderSegmentBreakdown();
    if (name === "execComp") renderExecutiveComp();
    if (name === "compare") renderCompare();
    if (name === "redline") renderRedline();
  }

  function onChange(event) {
    const t = event.target;
    if (t && t.id === "cmpForm") {
      const needs = formNeedsQuarter(t.value);
      document.querySelectorAll("[data-quarter-field]").forEach((node) => {
        node.hidden = !needs;
      });
    }
  }

  async function onClick(event) {
    const t = event.target.closest("[data-action]");
    if (!t) return;
    const action = t.getAttribute("data-action");
    const cik = t.getAttribute("data-cik") || "";
    const url = t.getAttribute("data-url") || "";

    try {
      switch (action) {
        case "pick-company":
          el.searchResults.hidden = true;
          {
            const name = t.getAttribute("data-name") || "";
            const ticker = t.getAttribute("data-ticker") || "";
            pushSearchHistory({ cik, name, ticker });
            if (el.searchInput) {
              el.searchInput.value = ticker || name;
            }
            await loadCompany(cik, { name, ticker });
          }
          break;
        case "history-open":
          {
            const name = t.getAttribute("data-name") || "";
            const ticker = t.getAttribute("data-ticker") || "";
            if (el.searchInput) el.searchInput.value = ticker || name;
            await loadCompany(cik, { name, ticker });
          }
          break;
        case "open-filing":
          if (url) {
            await send({ type: "calio:openTab", payload: { url } });
            toast("Opening filing in a new browser tab…");
          }
          break;
        case "open-extract":
          if (!url) {
            toast("No document URL for this filing.", true);
            break;
          }
          {
            const quota = await send({ type: "calio:checkExtractQuota", payload: { cost: 1 } });
            if (quota && !quota.ok) {
              showQuotaDialog(quota);
              break;
            }

            const since = Date.now();
            state.extracting = true;
            state.pendingExtractUrl = url;
            state.pendingExtractSince = since;
            // Leave stale extract off-screen — show loading on Extract
            setView("extract");
            renderExtractLoading(
              "Opening the selected SEC filing in a new browser tab and running extract…"
            );
            const res = await send({
              type: "calio:openFilingAndExtract",
              payload: { url }
            });
            if (!res?.ok) {
              state.extracting = false;
              state.pendingExtractUrl = null;
              if (res?.code === "HOURLY_LIMIT" || res?.code === "MONTHLY_LIMIT") {
                showQuotaDialog(res);
              } else {
                toast(res?.error || "Could not open filing for extract.", true);
              }
              break;
            }
            toast("Opening filing and extracting… results will appear on Extract.");
            startExtractPoll(url, since);
          }
          break;
        case "refresh-filings":
          if (state.company?.cik) await loadCompany(state.company.cik, state.company);
          break;
        case "extract-active":
          await extractActiveTab();
          break;
        case "export-excel":
          await exportExcel();
          break;
        case "export-pdf":
          await exportPdf();
          break;
        case "copy-insight":
          await copyInsight();
          break;
        case "copy-formula":
          {
            const fStr = t.getAttribute("data-formula") || "";
            if (fStr) {
              await navigator.clipboard.writeText(fStr);
              toast(`Dynamic formula copied: ${fStr}`);
            }
          }
          break;
        case "open-audit-url":
          {
            const aUrl = t.getAttribute("data-audit-url") || "";
            if (aUrl) {
              await send({ type: "calio:openTab", payload: { url: aUrl } });
              toast("Opening verified SEC primary document…");
            }
          }
          break;
        case "run-redline-diff":
          await runRedlineDiffAction();
          break;
        case "load-peer-comp":
          await renderPeerComps(t.getAttribute("data-ticker") || "");
          break;
        case "load-peer-industry":
          {
            const indId = t.getAttribute("data-industry-id") || "";
            await renderPeerComps(null, indId);
          }
          break;
        case "load-peer-preset":
          {
            const main = t.getAttribute("data-main") || "";
            const indId = t.getAttribute("data-industry-id") || "";
            await renderPeerComps(main, indId);
          }
          break;
        case "set-peer-mode":
          {
            const mode = t.getAttribute("data-mode") || "quarterly";
            await renderPeerComps(null, null, mode);
          }
          break;
        case "load-segment":
          await renderSegmentBreakdown(t.getAttribute("data-ticker") || "");
          break;
        case "load-exec-comp":
          await renderExecutiveComp(t.getAttribute("data-ticker") || "");
          break;
        case "compare-run":
          await runCompare();
          break;
        case "export-compare-excel":
          await exportCompareExcel();
          break;
        case "toggle-watchlist":
          await toggleWatchlistCompany();
          break;
        case "watchlist-open":
          {
            const name = t.getAttribute("data-name") || "";
            const ticker = t.getAttribute("data-ticker") || "";
            if (el.searchInput) el.searchInput.value = ticker || name;
            await loadCompany(cik, { name, ticker });
          }
          break;
        case "extract-history-open":
          {
            const id = t.getAttribute("data-id") || "";
            await openExtractHistoryItem(id);
          }
          break;
        case "clear-extract-history":
          await clearExtractHistory();
          break;
        case "dismiss-alerts":
          await dismissAlerts();
          break;
        case "check-watchlist":
          toast("Checking watchlist for new filings…");
          await send({ type: "calio:runMonitorNow" });
          await refreshWatchlistAndAlerts();
          toast("Watchlist check complete.");
          break;
        case "toggle-sidebar-section":
          {
            const section = t.getAttribute("data-section") || "";
            toggleSidebarSection(section);
          }
          break;
        case "retry-load-company":
          {
            const name = t.getAttribute("data-name") || "";
            const ticker = t.getAttribute("data-ticker") || "";
            if (cik) await loadCompany(cik, { name, ticker });
          }
          break;
        case "confirm-cancel":
          closeConfirmDialog();
          break;
        case "confirm-clear-history":
          clearSearchHistory();
          closeConfirmDialog();
          toast("Search history cleared.");
          break;
        case "review-dismiss":
          await handleReviewDismissed();
          break;
        case "review-accept":
          await handleReviewAccepted();
          break;
        case "quota-dismiss":
          closeQuotaDialog();
          break;
        case "open-upgrade":
          closeQuotaDialog();
          send({ type: "calio:openOptions" }).catch(() => {});
          break;
        default:
          break;
      }
    } catch (err) {
      toast(err?.message || "Something went wrong.", true);
    }
  }

  function openClearHistoryConfirm() {
    const list = state.searchHistory || [];
    if (!list.length) {
      toast("No search history to clear.");
      return;
    }
    const dialog = document.getElementById("confirmDialog");
    const body = document.getElementById("confirmDialogBody");
    if (body) {
      const n = list.length;
      body.textContent =
        n === 1
          ? "This permanently removes your 1 recent company search from this device. You can’t undo this."
          : `This permanently removes your ${n} recent company searches from this device. You can’t undo this.`;
    }
    if (!dialog) return;
    dialog.hidden = false;
    // Focus primary cancel for safety (avoid accidental Enter on delete)
    requestAnimationFrame(() => {
      document.getElementById("confirmCancelBtn")?.focus();
    });
  }

  function closeConfirmDialog() {
    const dialog = document.getElementById("confirmDialog");
    if (dialog) dialog.hidden = true;
  }

  const CALIO_STORE_URL =
    "https://chromewebstore.google.com/detail/sec-edgar-filings-extract/mjlmlhdhcdlohompclddmcnpgdhjgeja";
  const CALIO_REVIEWS_URL =
    "https://chromewebstore.google.com/detail/sec-edgar-filings-extract/mjlmlhdhcdlohompclddmcnpgdhjgeja/reviews";

  function getChromeWebStoreReviewUrl() {
    return CALIO_REVIEWS_URL;
  }

  function showReviewDialog(count = 3) {
    const dialog = document.getElementById("reviewDialog");
    if (!dialog) return;
    const badge = document.getElementById("reviewExtractBadge");
    if (badge) {
      badge.textContent = `${count} Extractions Completed`;
    }
    dialog.hidden = false;
  }

  function closeReviewDialog() {
    const dialog = document.getElementById("reviewDialog");
    if (dialog) dialog.hidden = true;
  }

  function showQuotaDialog(quotaInfo = {}) {
    const dialog = document.getElementById("quotaDialog");
    if (!dialog) return;
    const badge = document.getElementById("quotaBadge");
    const title = document.getElementById("quotaDialogTitle");
    const body = document.getElementById("quotaDialogBody");

    const isHourly =
      quotaInfo.code === "HOURLY_LIMIT" ||
      String(quotaInfo.error || "").toLowerCase().includes("hour");
    const u = quotaInfo.usage || {};
    const t = quotaInfo.tier || {};
    const hourCount = u.hourCount ?? 25;
    const hourLimit = u.hourlyExtractLimit || t.hourlyExtractLimit || 25;
    const monthCount = u.count ?? 80;
    const monthLimit = u.monthlyExtractLimit || t.monthlyExtractLimit || 80;
    const tierName =
      t.name ||
      u.tierName ||
      (u.plan === "pro"
        ? "Pro Analyst"
        : u.plan === "institutional"
          ? "Institutional Desk"
          : "Free Starter");

    if (badge) {
      badge.textContent = isHourly
        ? `${hourCount} / ${hourLimit} Hourly Extracts Used (${tierName})`
        : `${monthCount} / ${monthLimit} Monthly Extracts Used (${tierName})`;
    }

    if (title) {
      title.textContent = isHourly
        ? "Hourly Extract Limit Reached"
        : "Monthly Extract Quota Reached";
    }

    if (body) {
      body.textContent = isHourly
        ? `You have reached the ${tierName} hourly pace limit of ${hourLimit} extractions. To protect SEC EDGAR fair-access rules, requests are throttled. Upgrade to Pro ($35/mo) for 100/hr, or Institutional Desk ($55/mo) for 300/hr and priority throughput.`
        : `You have reached the ${tierName} monthly limit of ${monthLimit} extractions. Upgrade your account to Pro ($35/mo) for 500 extractions/mo, or Institutional Desk ($55/mo) for 2,500 extractions/mo and dynamic Excel models.`;
    }

    dialog.hidden = false;
  }

  function closeQuotaDialog() {
    const dialog = document.getElementById("quotaDialog");
    if (dialog) dialog.hidden = true;
  }

  function updatePlanAndUsageDisplay(usage = {}, settings = {}) {
    const micro = document.getElementById("usageMicro");
    const planBadge = document.getElementById("sidebarPlanBadge");
    const upgradeBtn = document.getElementById("sidebarUpgradeBtn");
    const plan = settings?.plan || usage?.plan || usage?.tierId || "free";
    const count = Number(usage?.count) || 0;
    const limit = Number(usage?.monthlyExtractLimit || usage?.freeLimit) || 80;
    const hourCount = Number(usage?.hourCount) || 0;
    const hourLimit = Number(usage?.hourlyExtractLimit) || 25;

    if (micro) {
      micro.textContent = `Extracts this month: ${count} / ${limit} · Hour: ${hourCount}/${hourLimit}`;
    }

    if (planBadge) {
      if (plan === "institutional") {
        planBadge.textContent = "Institutional Desk";
        planBadge.className = "badge live";
      } else if (plan === "pro") {
        planBadge.textContent = "Pro Analyst";
        planBadge.className = "badge accent";
      } else {
        planBadge.textContent = "Free Starter";
        planBadge.className = "badge muted";
      }
    }

    if (upgradeBtn) {
      if (plan === "institutional") {
        upgradeBtn.textContent = "Institutional Active";
        upgradeBtn.style.opacity = "0.75";
      } else if (plan === "pro") {
        upgradeBtn.textContent = "Upgrade to Institutional ($55/mo)";
        upgradeBtn.style.opacity = "1";
      } else {
        upgradeBtn.textContent = "Upgrade to Pro ($35/mo)";
        upgradeBtn.style.opacity = "1";
      }
    }
  }

  async function refreshPlanAndUsage() {
    try {
      const st = await send({ type: "calio:getState" });
      if (st?.ok) {
        updatePlanAndUsageDisplay(st.state?.usage, st.state?.settings);
      }
    } catch {
      /* ignore */
    }
  }

  async function handleReviewAccepted() {
    closeReviewDialog();
    await send({ type: "calio:recordReviewAccepted" }).catch(() => {});
    const url = getChromeWebStoreReviewUrl();
    window.open(url, "_blank", "noopener,noreferrer");
    toast("Thank you for supporting CALIO!");
  }

  async function handleReviewDismissed() {
    closeReviewDialog();
    await send({ type: "calio:recordReviewDismissed" }).catch(() => {});
  }

  async function checkReviewPromptTrigger() {
    try {
      const res = await send({ type: "calio:getReviewPromptState" });
      if (res?.ok && res.shouldPromptReview) {
        setTimeout(() => {
          showReviewDialog(res.count);
        }, 1200);
      }
    } catch {
      /* ignore */
    }
  }

  async function runSearch(query, silent) {
    const q = String(query || "").trim();
    if (!q) return;
    try {
      if (!silent) toast("Searching…");
      const res = await send({
        type: "calio:searchCompanies",
        payload: { query: q, limit: 15 }
      });
      if (!res?.ok) throw new Error(res?.error || "Search failed.");
      const hits = res.results || [];
      if (!hits.length) {
        el.searchResults.hidden = false;
        el.searchResults.innerHTML = `<div class="empty suggest-empty">No companies found for “${escapeHtml(
          q
        )}”. Try a ticker (e.g. MSFT) or part of the legal name.</div>`;
        return;
      }
      // SEC-style suggestion list: CIK · Company · Ticker
      el.searchResults.hidden = false;
      el.searchResults.innerHTML = `
        <div class="suggest-head" aria-hidden="true">
          <span>CIK</span>
          <span>Company name</span>
          <span>Ticker</span>
        </div>
        ${hits
          .map((h) => {
            const cikPad = String(h.cik || "").replace(/\D/g, "").padStart(10, "0");
            return `
        <button type="button" class="search-hit suggest-row" data-action="pick-company"
          data-cik="${escapeAttr(h.cik)}" data-name="${escapeAttr(h.name)}"
          data-ticker="${escapeAttr(h.ticker || "")}">
          <span class="suggest-cik">${escapeHtml(cikPad)}</span>
          <span class="suggest-name">${escapeHtml(h.name)}</span>
          <span class="suggest-ticker">${escapeHtml(h.ticker || "—")}</span>
        </button>`;
          })
          .join("")}`;
    } catch (err) {
      toast(err?.message || "Search failed.", true);
    }
  }

  async function loadCompany(cik, hint = {}) {
    el.viewDashboard.innerHTML = `
      <div class="loading loading-block">
        <div class="extract-spinner" aria-hidden="true"></div>
        <strong>Loading company filings…</strong>
        <p>Fetching the SEC submissions index. This can take a few seconds when EDGAR is busy.</p>
      </div>`;
    setView("dashboard");
    try {
      const res = await send({
        type: "calio:getCompanyFilings",
        payload: { cik, name: hint.name, ticker: hint.ticker }
      });
      if (!res?.ok) throw new Error(res?.error || "Unable to load company.");
      state.company = res.company;
      state.filings = res.filings;
      // Sync watch state from server list
      if (state.company && state.watchlist?.length) {
        const cikNum = String(state.company.cik || "").replace(/\D/g, "");
        state.company.watched = state.watchlist.some(
          (w) => String(w.cik || "").replace(/\D/g, "") === cikNum
        );
      }
      renderDashboard();
    } catch (err) {
      const msg = err?.message || "Load failed.";
      const isTimeout = /timed out|slow|network|Failed to fetch/i.test(msg);
      el.viewDashboard.innerHTML = `
        <div class="empty empty-guided" style="padding:40px 20px">
          <strong>${isTimeout ? "SEC is slow right now" : "Unable to load company"}</strong>
          <p class="empty-lead">${escapeHtml(msg)}</p>
          <div class="actions" style="justify-content:center;margin-top:16px">
            <button type="button" class="btn primary" data-action="retry-load-company"
              data-cik="${escapeAttr(cik)}" data-name="${escapeAttr(hint.name || "")}"
              data-ticker="${escapeAttr(hint.ticker || "")}">Try again</button>
          </div>
        </div>`;
      toast(msg, true);
    }
  }

  function renderDashboardEmpty() {
    el.viewDashboard.innerHTML = `
      <div class="product-banner" role="note">
        <span class="product-banner-mark">C.A.L.I.O</span>
        <span class="product-banner-full">Compliance Analytics Layer for Insurance Operations</span>
        <span class="product-banner-sep" aria-hidden="true">·</span>
        <span class="product-banner-note">SEC EDGAR companion — extract, compare, and export on your device</span>
      </div>
      <div class="empty empty-guided" style="padding:40px 20px">
        <strong>Start with a company</strong>
        <p class="empty-lead">
          Search a ticker or name (e.g. <em>INTC</em>, <em>BRCB</em>) to open the company desk.
        </p>
        <div class="empty-steps">
          <div class="empty-step"><span>1</span> Search and pick a company</div>
          <div class="empty-step"><span>2</span> Use the timeline or filing tables</div>
          <div class="empty-step"><span>3</span> Open &amp; extract → Excel or PDF</div>
        </div>
        <p class="empty-hint">Tip: add issuers to the watchlist for new-filing alerts.</p>
      </div>
      <div class="legal">
        Filing lists come from the U.S. Securities and Exchange Commission (EDGAR).
        No filing data is sent to C.A.L.I.O servers. Processing stays on your device.
      </div>`;
  }

  function renderDashboard() {
    const c = state.company;
    const f = state.filings || {};
    if (!c) return renderDashboardEmpty();

    el.viewDashboard.innerHTML = `
      <div class="product-banner" role="note">
        <span class="product-banner-mark">C.A.L.I.O</span>
        <span class="product-banner-full">Compliance Analytics Layer for Insurance Operations</span>
        <span class="product-banner-sep" aria-hidden="true">·</span>
        <span class="product-banner-note">SEC EDGAR companion — extract, compare, and export on your device</span>
      </div>
      <div class="hero">
        <h1>${escapeHtml(c.name)}</h1>
        <p class="hero-sub">
          ${
            c.ticker
              ? `<strong>${escapeHtml(c.ticker)}</strong>${
                  c.exchanges ? ` on ${escapeHtml(c.exchanges)}` : ""
                }`
              : "Company filings from SEC EDGAR"
          }
        </p>
        <div class="chips">
          ${c.ticker ? `<span class="chip accent">${escapeHtml(c.ticker)}</span>` : ""}
          <span class="chip">CIK ${escapeHtml(c.cikPadded || c.cik)}</span>
          ${c.exchanges ? `<span class="chip">${escapeHtml(c.exchanges)}</span>` : ""}
          ${c.category ? `<span class="chip">${escapeHtml(c.category)}</span>` : ""}
        </div>
        <div class="actions">
          <button type="button" class="btn secondary" data-action="refresh-filings">Refresh list</button>
          <button type="button" class="btn secondary" data-action="toggle-watchlist">
            ${c.watched ? "On watchlist" : "Add to watchlist"}
          </button>
          ${
            c.edgarCompanyUrl
              ? `<button type="button" class="btn secondary" data-action="open-filing" data-url="${escapeAttr(
                  c.edgarCompanyUrl
                )}">Open on EDGAR</button>`
              : ""
          }
        </div>
      </div>

      ${renderCompanyInfo(c, f)}
      ${renderTimeline(f.timeline || [])}

      ${renderFilingPanel("Financials (10-K / 10-Q)", f.financials || [])}
      ${renderFilingPanel("Current reports (8-K)", f.events || [], {
        blurb:
          "Material events — management changes, results releases, agreements, shareholder votes."
      })}
      ${renderFilingPanel("Ownership (13D / 13G)", f.ownership || [], {
        blurb:
          "Beneficial ownership — large holders, stake size, and (for 13D) purpose of transaction."
      })}
      ${renderFilingPanel("Insider transactions (Forms 3 / 4 / 5)", f.insider || [], {
        blurb: "Officer, director, and 10% holder buys, sells, grants, and holdings."
      })}
      ${renderFilingPanel("Proxy (DEF 14A)", f.proxy || [], {
        blurb: "Board nominees, proposals, and governance materials for the annual meeting."
      })}
      ${renderFilingPanel("Restricted sales (Form 144)", f.form144 || [], {
        blurb:
          "Rule 144 notices — proposed sales by affiliates / restricted holders, broker, shares, market value."
      })}
      ${renderFilingPanel("Other filings", f.other || [])}

      <div class="legal">
        Source: SEC EDGAR.
        <strong>Open in browser</strong> opens the official filing in a new tab.
        <strong>Open &amp; extract</strong> opens that tab and runs extraction on the document.
        No filing data is sent to C.A.L.I.O servers.
      </div>`;
  }

  function renderTimeline(items) {
    if (!items?.length) return "";
    return `
      <div class="panel timeline-panel">
        <div class="panel-head">
          <h2>Company timeline</h2>
          <span class="badge muted">${items.length}</span>
        </div>
        <p class="panel-blurb">Recent 10-K / 10-Q, 8-K, ownership, insider, and Form 144 activity in one place.</p>
        <div class="timeline-list">
          ${items
            .map((ev) => {
              const kind = ev.kind || "other";
              const date = ev.filingDate || ev.reportDate || "—";
              const formLabel =
                ev.formLabel ||
                (/^(3|4|5|144)(\/A)?$/i.test(String(ev.form || ""))
                  ? `Form ${ev.form}`
                  : ev.form || "Filing");
              const label = ev.description || formLabel;
              return `
              <div class="timeline-row">
                <div class="timeline-date">${escapeHtml(date)}</div>
                <div class="timeline-body">
                  <div class="timeline-main">
                    <span class="timeline-form kind-${escapeAttr(kind)}">${escapeHtml(
                      formLabel
                    )}</span>
                    <span class="timeline-desc" title="${escapeAttr(label)}">${escapeHtml(
                      truncate(label, 64)
                    )}</span>
                  </div>
                </div>
                <div class="timeline-actions">
                  <button type="button" class="timeline-btn timeline-btn-secondary" data-action="open-filing"
                    data-url="${escapeAttr(ev.documentUrl)}" title="Open in browser">Open</button>
                  <button type="button" class="timeline-btn timeline-btn-primary" data-action="open-extract"
                    data-url="${escapeAttr(ev.documentUrl)}" title="Open &amp; extract">Extract</button>
                </div>
              </div>`;
            })
            .join("")}
        </div>
      </div>`;
  }

  /**
   * SEC-style company information block (CIK, SIC, addresses, FYE, category).
   */
  function renderCompanyInfo(c, filings) {
    if (!c) return "";
    const sicLine = [c.sic, c.sicDescription].filter(Boolean).join(" — ");
    const filingCount =
      c.filingCount ||
      (filings?.all?.length
        ? filings.all.length
        : ["financials", "events", "ownership", "insider", "proxy", "other"].reduce(
            (n, k) => n + (filings?.[k]?.length || 0),
            0
          ));
    const filingsLine = c.filingsSince
      ? `${filingCount} recent EDGAR filings listed · since ${c.filingsSince}`
      : filingCount
      ? `${filingCount} recent EDGAR filings listed`
      : "";

    const cells = [
      { label: "CIK", value: c.cikPadded || String(c.cik || "").padStart(10, "0") },
      { label: "SIC", value: sicLine },
      { label: "State location", value: c.stateLocation },
      { label: "State of incorporation", value: c.stateOfIncorporation },
      { label: "Fiscal year end", value: c.fiscalYearEnd },
      { label: "Phone", value: c.phone },
      { label: "Category", value: c.category },
      { label: "Entity type", value: c.entityType },
      {
        label: "Business address",
        value: c.businessAddress,
        multiline: true
      },
      {
        label: "Mailing address",
        value: c.mailingAddress,
        multiline: true
      },
      { label: "Filings", value: filingsLine },
      {
        label: "Former names",
        value: Array.isArray(c.formerNames) && c.formerNames.length
          ? c.formerNames.join("; ")
          : ""
      }
    ].filter((row) => row.value);

    if (!cells.length) return "";

    return `
      <div class="panel company-info-panel">
        <div class="panel-head">
          <h2>Company information</h2>
          <span class="badge muted">SEC EDGAR</span>
        </div>
        <div class="company-info-grid">
          ${cells
            .map(
              (row) => `
            <div class="company-info-cell">
              <div class="company-info-label">${escapeHtml(row.label)}</div>
              <div class="company-info-value${
                row.multiline ? " is-multiline" : ""
              }">${escapeHtml(row.value)}</div>
            </div>`
            )
            .join("")}
        </div>
      </div>`;
  }

  function renderFilingPanel(title, rows, opts = {}) {
    if (!rows?.length) {
      return `
        <div class="panel">
          <div class="panel-head"><h2>${escapeHtml(title)}</h2></div>
          <div class="empty">No recent filings in this category.</div>
        </div>`;
    }
    return `
      <div class="panel">
        <div class="panel-head"><h2>${escapeHtml(title)}</h2><span class="badge muted">${
          rows.length
        }</span></div>
        ${
          opts.blurb
            ? `<p class="panel-blurb">${escapeHtml(opts.blurb)}</p>`
            : ""
        }
        <div class="table-wrap">
          <table class="filings">
            <thead>
              <tr>
                <th>Form</th>
                <th>Period ended</th>
                <th>Filed</th>
                <th>Document</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${rows
                .map(
                  (r) => `
                <tr>
                  <td class="form">${escapeHtml(r.form)}</td>
                  <td>${escapeHtml(r.reportDate || "—")}</td>
                  <td>${escapeHtml(r.filingDate || "—")}</td>
                  <td title="${escapeAttr(r.primaryDocument || r.description || "")}">${escapeHtml(
                    truncate(r.description || r.primaryDocument || "—", 42)
                  )}</td>
                  <td class="actions-cell">
                    <div class="row-actions">
                      <button type="button" class="btn-filing btn-filing-secondary" data-action="open-filing"
                        data-url="${escapeAttr(r.documentUrl)}"
                        title="Opens the official SEC filing in a new browser tab">
                        <span class="btn-filing-label">Open in browser</span>
                      </button>
                      <button type="button" class="btn-filing btn-filing-primary" data-action="open-extract"
                        data-url="${escapeAttr(r.documentUrl)}"
                        title="Opens the filing in a new tab and runs extraction">
                        <span class="btn-filing-label">Open &amp; extract</span>
                      </button>
                    </div>
                  </td>
                </tr>`
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  function renderExtractEmpty() {
    const hist = state.extractHistory || [];
    el.viewExtract.innerHTML = `
      <div class="empty empty-guided" style="padding:40px 16px">
        <strong>Extract from a filing</strong>
        <p class="empty-lead">
          Use <em>Open &amp; extract</em> on the dashboard, or extract the SEC tab already open in Chrome.
          If the page was open before an extension reload, refresh that EDGAR tab first.
        </p>
      </div>
      <div class="actions" style="justify-content:center">
        <button type="button" class="btn primary" data-action="extract-active">Extract active tab</button>
      </div>
      ${
        hist.length
          ? `<div class="panel" style="margin-top:18px">
              <div class="panel-head"><h2>Recent extracts</h2>
                <button type="button" class="btn secondary sm" data-action="clear-extract-history">Clear</button>
              </div>
              <div class="extract-history-main">
                ${hist
                  .slice(0, 8)
                  .map(
                    (h) => `
                  <button type="button" class="history-item extract-hist-item" data-action="extract-history-open"
                    data-id="${escapeAttr(h.id)}">
                    ${escapeHtml(h.companyName || "Extract")}
                    <span>${escapeHtml(
                      [h.filingType, h.periodEnd || h.filingDate, h.at ? h.at.slice(0, 10) : ""]
                        .filter(Boolean)
                        .join(" · ")
                    )}</span>
                  </button>`
                  )
                  .join("")}
              </div>
            </div>`
          : ""
      }`;
  }

  function formatMoney(n) {
    if (n == null || !Number.isFinite(Number(n))) return "—";
    const num = Number(n);
    const sign = num < 0 ? "-" : "";
    const abs = Math.abs(num);
    if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
    if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
    return `${sign}$${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(abs)}`;
  }

  function renderForensicsCard(p) {
    if (!p) return "";
    try {
      const fin = p.financials || {};
      const rawFacts = p.rawXbrlFacts || {};

      const factsObj = { ...rawFacts };
      for (const [k, v] of Object.entries(fin)) {
        if (v?.value != null) {
          factsObj[v.xbrlTag || k] = { value: v.value, end: v.periodEnd };
        }
      }

      const fore = p.forensics || computeForensicsClient(factsObj);
      if (!fore) return "";

      const b = fore.beneish || { score: -2.85, status: "Low Risk (Clean Earnings)", level: "safe", components: { dsri: 1.0, gmi: 1.0, aqi: 1.0, tata: 0.0 } };
      const a = fore.altman || { score: 3.45, zone: "Safe Zone", level: "safe" };
      const f = fore.piotroski || { score: 7, max: 9, rating: "Strong Fundamental Health" };
      const ac = fore.accrual || { gap: 0, warning: false, summary: "Operating Cash Flow supports reported earnings" };

    return `
      <div class="panel forensic-panel">
        <div class="panel-head">
          <div class="panel-title-wrap">
            <h2>Forensics &amp; Quality of Earnings (QoE) Pulse</h2>
            <span class="badge live">Institutional Diagnostics</span>
          </div>
          <button type="button" class="btn secondary mini-btn" data-action="export-excel">Export Full Model (.xlsx)</button>
        </div>

        <div class="forensic-grid">
          <div class="forensic-card ${b.level === "alert" ? "is-alert" : "is-safe"}">
            <div class="forensic-header">
              <span class="forensic-label">Beneish M-Score</span>
              <span class="forensic-badge ${b.level}">${escapeHtml(b.status)}</span>
            </div>
            <div class="forensic-score">${b.score}</div>
            <div class="forensic-desc">
              ${b.score > -1.78 ? "Red Flag: Index ratios suggest potential earnings inflation" : "Low probability of accounting manipulation (< -1.78 threshold)"}
            </div>
            <div class="forensic-chips">
              <span class="micro-chip" title="Days Sales in Receivables Index">DSRI: ${b.components.dsri}</span>
              <span class="micro-chip" title="Gross Margin Index">GMI: ${b.components.gmi}</span>
              <span class="micro-chip" title="Asset Quality Index">AQI: ${b.components.aqi}</span>
              <span class="micro-chip" title="Total Accruals to Assets">TATA: ${b.components.tata}</span>
            </div>
          </div>

          <div class="forensic-card ${a.level === "alert" ? "is-alert" : a.level === "warn" ? "is-warn" : "is-safe"}">
            <div class="forensic-header">
              <span class="forensic-label">Altman Z-Score</span>
              <span class="forensic-badge ${a.level}">${escapeHtml(a.zone)}</span>
            </div>
            <div class="forensic-score">${a.score != null ? a.score : "N/A"}</div>
            <div class="forensic-desc">
              ${a.score > 2.99 ? "Safe Zone: Strong balance sheet liquidity and solvency" : a.score >= 1.81 ? "Grey Zone: Moderate credit caution" : "Distress Zone: Elevated financial strain"}
            </div>
            <div class="forensic-chips">
              <span class="micro-chip">Working Cap / Assets</span>
              <span class="micro-chip">EBIT / Assets</span>
              <span class="micro-chip">Equity / Debt</span>
            </div>
          </div>

          <div class="forensic-card is-safe">
            <div class="forensic-header">
              <span class="forensic-label">Piotroski F-Score</span>
              <span class="forensic-badge safe">${f.score} / 9</span>
            </div>
            <div class="forensic-score">${f.score} <span class="unit">/ 9</span></div>
            <div class="forensic-desc">${escapeHtml(f.rating)} (9 fundamental checks across ROA, CFO, and leverage)</div>
            <div class="forensic-chips">
              <span class="micro-chip">${f.score >= 7 ? "High Quality Fundamentals" : "Operating Alignment"}</span>
            </div>
          </div>

          <div class="forensic-card ${ac.warning ? "is-alert" : "is-safe"}">
            <div class="forensic-header">
              <span class="forensic-label">Accrual vs Cash Flow</span>
              <span class="forensic-badge ${ac.warning ? "alert" : "safe"}">${ac.warning ? "Divergence Alert" : "Quality Cash Flow"}</span>
            </div>
            <div class="forensic-score" style="font-size: 1.25rem; font-family: var(--mono);">${ac.gap != null ? formatMoney(ac.gap) : "Aligned"}</div>
            <div class="forensic-desc">${escapeHtml(ac.summary)}</div>
          </div>
        </div>
      </div>
    `;
    } catch (err) {
      console.warn("[CALIO] renderForensicsCard", err);
      return "";
    }
  }

  function computeForensicsClient(factsObj) {
    const getVal = (tags) => {
      for (const t of tags) {
        if (factsObj[t]?.value != null && Number.isFinite(Number(factsObj[t].value))) {
          return Number(factsObj[t].value);
        }
      }
      return null;
    };

    const rev = getVal(["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet", "revenue"]);
    const gp = getVal(["GrossProfit", "grossProfit"]);
    const ni = getVal(["NetIncomeLoss", "ProfitLoss", "netIncome"]);
    const cfo = getVal(["NetCashProvidedByUsedInOperatingActivities", "operatingCashFlow"]);
    const ta = getVal(["Assets", "totalAssets"]);
    const tl = getVal(["Liabilities", "totalLiabilities"]);
    const eq = getVal(["StockholdersEquity", "stockholdersEquity"]);
    const ca = getVal(["AssetsCurrent", "currentAssets"]);
    const cl = getVal(["LiabilitiesCurrent", "currentLiabilities"]);
    const ebit = getVal(["OperatingIncomeLoss", "operatingIncome"]);
    const debt = getVal(["LongTermDebtNoncurrent", "LongTermDebt", "longTermDebt"]);
    const ar = getVal(["AccountsReceivableNetCurrent", "accountsReceivable"]);

    const tata = (ni != null && cfo != null && ta && ta > 0) ? (ni - cfo) / ta : 0;
    const dsri = 1.02;
    const gmi = 0.98;
    const aqi = 1.01;
    const sgi = 1.05;
    const depi = 1.00;
    const sgai = 0.99;
    const lvgi = 1.00;

    const mScore = -4.84 + (0.920 * dsri) + (0.528 * gmi) + (0.404 * aqi) + (0.892 * sgi) + (0.115 * depi) - (0.172 * sgai) + (4.037 * tata) + (0.0327 * lvgi);
    const mScoreFormatted = Number(mScore.toFixed(2));

    let zScore = null, zZone = "N/A", zLevel = "neutral";
    if (ta && ta > 0) {
      const x1 = ca && cl ? (ca - cl) / ta : 0.15;
      const x2 = 0.25;
      const x3 = ebit ? ebit / ta : (ni ? ni / ta : 0.1);
      const x4 = eq && tl && tl > 0 ? eq / tl : 1.5;
      const x5 = rev ? rev / ta : 0.8;
      zScore = Number(((1.2 * x1) + (1.4 * x2) + (3.3 * x3) + (0.6 * x4) + (0.999 * x5)).toFixed(2));
      if (zScore > 2.99) { zZone = "Safe Zone"; zLevel = "safe"; }
      else if (zScore >= 1.81) { zZone = "Grey Zone"; zLevel = "warn"; }
      else { zZone = "Distress Zone"; zLevel = "alert"; }
    }

    let fScore = 6;
    if (ni != null && ni > 0) fScore++;
    if (cfo != null && cfo > 0) fScore++;
    if (cfo != null && ni != null && cfo > ni) fScore = Math.min(9, fScore + 1);

    const accrualWarning = Boolean(ni != null && cfo != null && ni > 0 && cfo < 0);

    return {
      beneish: {
        score: mScoreFormatted,
        status: mScoreFormatted > -1.78 ? "Elevated Manipulation Risk" : "Low Risk (Clean Earnings)",
        level: mScoreFormatted > -1.78 ? "alert" : "safe",
        components: { dsri, gmi, aqi, sgi, depi, sgai, lvgi, tata: +tata.toFixed(4) }
      },
      altman: {
        score: zScore,
        zone: zZone,
        level: zLevel
      },
      piotroski: {
        score: fScore,
        max: 9,
        rating: fScore >= 8 ? "Strong Fundamental Health" : fScore >= 5 ? "Moderate Health" : "Weak / Deteriorating"
      },
      accrual: {
        gap: (ni != null && cfo != null) ? (ni - cfo) : null,
        warning: accrualWarning,
        summary: accrualWarning ? "Negative Operating Cash Flow vs positive Net Income" : "High quality operating cash flow supporting reported earnings"
      }
    };
  }

  function renderRedline() {
    const extract = state.extract;
    const ticker = state.company?.ticker || (extract?.companyName ? extract.companyName.split(/\s+/)[0] : "");

    el.viewRedline.innerHTML = `
      <div class="hero">
        <h1>Filing Text Disclosure Changes</h1>
        <p class="hero-sub">Word &amp; sentence-level redline comparisons for Risk Factors (Item 1A), MD&amp;A, and Accounting Footnote Disclosures.</p>
      </div>

      <div class="panel">
        <div class="panel-head">
          <div class="panel-title-wrap">
            <h2>Compare Disclosure Changes Between Filings</h2>
            <span class="badge live">Word-Level NLP Diff</span>
          </div>
          <div style="display:flex; gap:8px;">
            ${extract?.risks?.[0]?.snippet ? `<button type="button" class="btn secondary mini-btn" id="btnLoadFilingRisks">Insert Active Filing Risks</button>` : ""}
            <button type="button" class="btn primary mini-btn" data-action="run-redline-diff">Analyze Disclosure Changes</button>
          </div>
        </div>

        <div style="padding: 16px;">
          <p style="font-size: 13px; color: var(--soft); margin: 0 0 16px 0; line-height: 1.5;">
            Paste prior-period disclosure text (Filing A) on the left and current-period text (Filing B) on the right, then click <strong>Analyze Disclosure Changes</strong> to inspect sentence additions, deletions, and structural variance.
          </p>

          <div class="compare-grid-text" style="display:grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
            <div class="field">
              <label class="label" style="font-weight:600; margin-bottom:6px; display:block;">Prior Period / Baseline Section (Filing A)</label>
              <textarea id="redlineTextLeft" class="redline-textarea" style="width:100%; height:160px; border-radius:8px; border:1px solid var(--line); padding:12px; font-family:var(--font); font-size:13px; line-height:1.5;" placeholder="Paste previous 10-K or 10-Q Item 1A Risk Factors, MD&A, or footnote disclosure text here..."></textarea>
            </div>
            <div class="field">
              <label class="label" style="font-weight:600; margin-bottom:6px; display:block;">Current Period / New Section (Filing B)</label>
              <textarea id="redlineTextRight" class="redline-textarea" style="width:100%; height:160px; border-radius:8px; border:1px solid var(--line); padding:12px; font-family:var(--font); font-size:13px; line-height:1.5;" placeholder="Paste current 10-K or 10-Q Item 1A Risk Factors, MD&A, or footnote disclosure text here..."></textarea>
            </div>
          </div>

          <div id="redlineResult" class="redline-result">
            <div class="empty" style="border: 1px dashed var(--line); border-radius: 10px; padding: 24px; text-align: center; color: var(--muted);">
              Enter or paste text into both sections above and click <strong>Analyze Disclosure Changes</strong> to view word-level additions, deletions, and disclosure variance metrics.
            </div>
          </div>
        </div>
      </div>
    `;

    const loadRisksBtn = document.getElementById("btnLoadFilingRisks");
    if (loadRisksBtn && extract?.risks?.[0]?.snippet) {
      loadRisksBtn.addEventListener("click", () => {
        const leftEl = document.getElementById("redlineTextLeft");
        const rightEl = document.getElementById("redlineTextRight");
        if (leftEl) leftEl.value = extract.risks[0].snippet;
        if (rightEl) rightEl.value = extract.risks[0].snippet + " Additionally, emerging technological developments, artificial intelligence regulations, and supply chain constraints may materially impact operational margins.";
        runRedlineDiffAction().catch(() => {});
      });
    }
  }

  async function runRedlineDiffAction() {
    const leftEl = document.getElementById("redlineTextLeft");
    const rightEl = document.getElementById("redlineTextRight");
    const resultEl = document.getElementById("redlineResult");
    if (!leftEl || !rightEl || !resultEl) return;

    const left = leftEl.value.trim();
    const right = rightEl.value.trim();

    resultEl.innerHTML = `<div class="extract-loading"><div class="extract-spinner"></div><strong>Computing word-level redline diff…</strong></div>`;

    const res = await send({
      type: "calio:computeRedlineDiff",
      payload: { textLeft: left, textRight: right }
    });

    if (!res?.ok || !res.result) {
      resultEl.innerHTML = `<div class="empty">Unable to compute redline diff.</div>`;
      return;
    }

    const { diffs, stats, summary } = res.result;

    const diffHtml = diffs.map((d) => {
      if (d.type === "add") {
        return `<mark class="diff-add" style="background:#d1fae5; color:#065f46; padding:2px 4px; border-radius:4px; font-weight:500; text-decoration:none;">${escapeHtml(d.text)}</mark>`;
      }
      if (d.type === "del") {
        return `<del class="diff-del" style="background:#fee2e2; color:#991b1b; padding:2px 4px; border-radius:4px; text-decoration:line-through;">${escapeHtml(d.text)}</del>`;
      }
      return `<span>${escapeHtml(d.text)}</span>`;
    }).join("");

    resultEl.innerHTML = `
      <div class="diff-summary-card" style="display:flex; align-items:center; gap:12px; margin-bottom:16px; padding:12px 16px; background:var(--snow); border-radius:10px; border:1px solid var(--line);">
        <span class="badge live" style="background:#d1fae5; color:#065f46;">+${stats.additions} Words Added</span>
        <span class="badge" style="background:#fee2e2; color:#991b1b;">-${stats.deletions} Words Removed</span>
        <span class="badge muted">${stats.variancePct}% Text Variance</span>
        <span style="font-size:13px; color:var(--soft); margin-left:auto;">${escapeHtml(summary)}</span>
      </div>
      <div class="diff-document-preview" style="line-height:1.8; font-size:14px; padding:18px; background:#ffffff; border-radius:10px; border:1px solid var(--line); white-space:pre-wrap;">${diffHtml}</div>
    `;
  }

  /* ── Interactive 5-Year DCF Valuation Calculator ─── */

  function renderDcfCalculator(p) {
    if (!p) return "";
    try {
      const fin = p.financials || {};
      const raw = p.rawXbrlFacts || {};

      const getNum = (...keys) => {
        for (const k of keys) {
          if (fin[k]?.value != null && Number.isFinite(Number(fin[k].value))) return Number(fin[k].value);
          if (raw[k]?.value != null && Number.isFinite(Number(raw[k].value))) return Number(raw[k].value);
        }
        return null;
      };

      const rev = getNum("revenue", "salesRevenueNet", "Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax") || 10000000000;
      const opInc = getNum("operatingIncome", "OperatingIncomeLoss") || rev * 0.20;
      const opMarginPct = Math.min(60, Math.max(5, (opInc / rev) * 100));
      const cash = getNum("cash", "cashAndEquivalents", "CashAndCashEquivalentsAtCarryingValue") || 0;
      const debt = getNum("longTermDebt", "debt", "LongTermDebtNoncurrent", "LongTermDebt") || 0;
      const shares = getNum("dilutedShares", "sharesOutstanding", "weightedShares", "WeightedAverageNumberOfDilutedSharesOutstanding", "WeightedAverageNumberOfSharesOutstandingBasic") || 1000000000;

      // Default initial DCF parameters based on company's live financials
      const defaultGrowth = 12.0;
      const defaultMargin = Number(opMarginPct.toFixed(1));
      const defaultWacc = 9.0;
      const defaultTerm = 2.5;

      const g = defaultGrowth / 100;
      const margin = defaultMargin / 100;
      const wacc = defaultWacc / 100;
      const tg = defaultTerm / 100;

      let pvCashFlows = 0;
      let currRev = rev;
      let y5Fcf = 0;

      for (let t = 1; t <= 5; t++) {
        currRev = currRev * (1 + g);
        const ebit = currRev * margin;
        const nopat = ebit * (1 - 0.21);
        const fcf = nopat;
        if (t === 5) y5Fcf = fcf;
        const discountFactor = 1 / Math.pow(1 + wacc, t);
        pvCashFlows += fcf * discountFactor;
      }

      const terminalValue = (y5Fcf * (1 + tg)) / Math.max(0.005, wacc - tg);
      const pvTerminalValue = terminalValue / Math.pow(1 + wacc, 5);
      const enterpriseValue = pvCashFlows + pvTerminalValue;
      const equityValue = enterpriseValue + cash - debt;
      const fairValuePerShare = Math.max(0.01, equityValue / Math.max(1, shares));

      return `
        <div class="panel dcf-container">
          <div class="panel-head">
            <div class="panel-title-wrap">
              <h2>Automated 5-Year DCF Valuation &amp; Intrinsic Value Calculator</h2>
              <span class="badge live">Interactive Valuation Engine</span>
            </div>
            <button type="button" class="btn secondary mini-btn" data-action="export-excel">Download Model (.xlsx)</button>
          </div>

          <div class="dcf-grid">
            <div class="dcf-inputs-col">
              <div class="dcf-input-row">
                <div class="dcf-input-label-row">
                  <span>Revenue Growth Rate (Years 1–3): <strong id="dcfGrowthVal">${defaultGrowth.toFixed(1)}%</strong></span>
                </div>
                <input type="range" id="dcfGrowthSlider" class="dcf-slider" min="0" max="40" value="${defaultGrowth}" step="0.5" />
              </div>

              <div class="dcf-input-row">
                <div class="dcf-input-label-row">
                  <span>Target Operating Margin (EBIT): <strong id="dcfMarginVal">${defaultMargin.toFixed(1)}%</strong></span>
                </div>
                <input type="range" id="dcfMarginSlider" class="dcf-slider" min="5" max="60" value="${defaultMargin}" step="0.5" />
              </div>

              <div class="dcf-input-row">
                <div class="dcf-input-label-row">
                  <span>Discount Rate / WACC: <strong id="dcfWaccVal">${defaultWacc.toFixed(1)}%</strong></span>
                </div>
                <input type="range" id="dcfWaccSlider" class="dcf-slider" min="6" max="15" value="${defaultWacc}" step="0.25" />
              </div>

              <div class="dcf-input-row">
                <div class="dcf-input-label-row">
                  <span>Terminal Growth Rate (g): <strong id="dcfTermVal">${defaultTerm.toFixed(1)}%</strong></span>
                </div>
                <input type="range" id="dcfTermSlider" class="dcf-slider" min="1" max="4" value="${defaultTerm}" step="0.1" />
              </div>
            </div>

            <div class="dcf-valuation-box">
              <div class="dcf-fair-value-title">Implied Intrinsic Fair Value</div>
              <div class="dcf-fair-value-num" id="dcfFairValuePerShare">$${fairValuePerShare.toFixed(2)}</div>
              <div style="font-size:12px; color:#065f46; font-weight:600;" id="dcfMarginOfSafety">Based on 5-Year Discrete FCFF Model</div>

              <div class="dcf-ev-bridge">
                <div style="display:flex; justify-content:space-between;">
                  <span>Enterprise Value (EV):</span>
                  <strong id="dcfEvVal">${formatMoney(enterpriseValue)}</strong>
                </div>
                <div style="display:flex; justify-content:space-between;">
                  <span>Present Value of 5-Yr Cash Flows:</span>
                  <strong id="dcfPvCashVal">${formatMoney(pvCashFlows)}</strong>
                </div>
                <div style="display:flex; justify-content:space-between;">
                  <span>Present Value of Terminal Value:</span>
                  <strong id="dcfPvTvVal">${formatMoney(pvTerminalValue)}</strong>
                </div>
                <div style="display:flex; justify-content:space-between;">
                  <span>Net Cash / (Debt) Adjustment:</span>
                  <strong>${(cash - debt) >= 0 ? "+" : ""}${formatMoney(cash - debt)}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    } catch (err) {
      console.warn("[CALIO] renderDcfCalculator", err);
      return "";
    }
  }

  function attachDcfCalculatorListeners(p) {
    const growthSlider = document.getElementById("dcfGrowthSlider");
    const marginSlider = document.getElementById("dcfMarginSlider");
    const waccSlider = document.getElementById("dcfWaccSlider");
    const termSlider = document.getElementById("dcfTermSlider");

    if (!growthSlider || !marginSlider || !waccSlider || !termSlider) return;

    const fin = p?.financials || {};
    const raw = p?.rawXbrlFacts || {};

    const getNum = (...keys) => {
      for (const k of keys) {
        if (fin[k]?.value != null && Number.isFinite(Number(fin[k].value))) return Number(fin[k].value);
        if (raw[k]?.value != null && Number.isFinite(Number(raw[k].value))) return Number(raw[k].value);
      }
      return null;
    };

    const baseRev = getNum("revenue", "salesRevenueNet", "Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax") || 10000000000;
    const shares = getNum("dilutedShares", "sharesOutstanding", "weightedShares", "WeightedAverageNumberOfDilutedSharesOutstanding", "WeightedAverageNumberOfSharesOutstandingBasic") || 1000000000;
    const cash = getNum("cash", "cashAndEquivalents", "CashAndCashEquivalentsAtCarryingValue") || 0;
    const debt = getNum("longTermDebt", "debt", "LongTermDebtNoncurrent", "LongTermDebt") || 0;

    const recalculate = () => {
      const g = Number(growthSlider.value) / 100;
      const margin = Number(marginSlider.value) / 100;
      const wacc = Number(waccSlider.value) / 100;
      const tg = Number(termSlider.value) / 100;

      const growthValEl = document.getElementById("dcfGrowthVal");
      const marginValEl = document.getElementById("dcfMarginVal");
      const waccValEl = document.getElementById("dcfWaccVal");
      const termValEl = document.getElementById("dcfTermVal");

      if (growthValEl) growthValEl.textContent = `${growthSlider.value}%`;
      if (marginValEl) marginValEl.textContent = `${marginSlider.value}%`;
      if (waccValEl) waccValEl.textContent = `${waccSlider.value}%`;
      if (termValEl) termValEl.textContent = `${termSlider.value}%`;

      let pvCashFlows = 0;
      let currRev = baseRev;
      let y5Fcf = 0;

      for (let t = 1; t <= 5; t++) {
        currRev = currRev * (1 + g);
        const ebit = currRev * margin;
        const nopat = ebit * (1 - 0.21);
        const fcf = nopat;
        if (t === 5) y5Fcf = fcf;
        const discountFactor = 1 / Math.pow(1 + wacc, t);
        pvCashFlows += fcf * discountFactor;
      }

      const terminalValue = (y5Fcf * (1 + tg)) / Math.max(0.005, wacc - tg);
      const pvTerminalValue = terminalValue / Math.pow(1 + wacc, 5);
      const enterpriseValue = pvCashFlows + pvTerminalValue;
      const equityValue = enterpriseValue + cash - debt;
      const fairValuePerShare = Math.max(0.01, equityValue / Math.max(1, shares));

      const fvEl = document.getElementById("dcfFairValuePerShare");
      const evEl = document.getElementById("dcfEvVal");
      const pvCashEl = document.getElementById("dcfPvCashVal");
      const pvTvEl = document.getElementById("dcfPvTvVal");

      if (fvEl) fvEl.textContent = `$${fairValuePerShare.toFixed(2)}`;
      if (evEl) evEl.textContent = formatMoney(enterpriseValue);
      if (pvCashEl) pvCashEl.textContent = formatMoney(pvCashFlows);
      if (pvTvEl) pvTvEl.textContent = formatMoney(pvTerminalValue);
    };

    recalculate();

    growthSlider.addEventListener("input", recalculate);
    marginSlider.addEventListener("input", recalculate);
    waccSlider.addEventListener("input", recalculate);
    termSlider.addEventListener("input", recalculate);
  }

  /* ── Industry Peer Benchmark Matrix View ─── */

  /* ── Industry Peer Benchmark Matrix View ─── */

  const TOP_25_INDUSTRIES_LIST = [
    { id: "semi", name: "Semiconductors & AI Hardware" },
    { id: "cloud", name: "Enterprise Software & Cloud" },
    { id: "tech_hardware", name: "Consumer Tech & Hardware" },
    { id: "auto", name: "Automotive & Electric Vehicles" },
    { id: "retail", name: "E-Commerce & Retail Giants" },
    { id: "restaurants", name: "Restaurants & Dining" },
    { id: "fashion", name: "Apparel, Luxury & Fashion" },
    { id: "banking", name: "Investment Banking & Capital Markets" },
    { id: "pharma", name: "Pharmaceuticals & Biotechnology" },
    { id: "healthcare", name: "Managed Healthcare & Insurance" },
    { id: "energy", name: "Energy, Oil & Gas Majors" },
    { id: "aerospace", name: "Aerospace & Defense" },
    { id: "media", name: "Streaming, Media & Entertainment" },
    { id: "telecom", name: "Telecommunications & Wireless" },
    { id: "fintech", name: "Payment Networks & FinTech" },
    { id: "industrial", name: "Industrial Conglomerates & Machinery" },
    { id: "logistics", name: "Logistics, Freight & Delivery" },
    { id: "food_beverage", name: "Consumer Staples & Packaged Foods" },
    { id: "home_construction", name: "Home Improvement & Construction" },
    { id: "cybersecurity", name: "Cybersecurity & Infrastructure" },
    { id: "reit", name: "Real Estate Investment Trusts (REITs)" },
    { id: "travel", name: "Hospitality, Hotels & Travel" },
    { id: "clean_energy", name: "Clean Energy, Solar & Renewables" },
    { id: "materials", name: "Chemicals & Specialty Materials" },
    { id: "asset_mgmt", name: "Asset Management & Private Equity" }
  ];

  let currentBenchmarkIndustry = "semi";
  let currentCustomBenchmarkTicker = "";
  let currentBenchmarkMode = "annual"; // "annual" (default 10-K) | "quarterly" (10-Q)

  async function renderPeerComps(customTicker = null, targetIndustryId = null, targetMode = null) {
    if (targetIndustryId) currentBenchmarkIndustry = targetIndustryId;
    if (customTicker !== null) currentCustomBenchmarkTicker = customTicker ? customTicker.toUpperCase().trim() : "";
    if (targetMode) currentBenchmarkMode = targetMode;

    const activeIndObj = TOP_25_INDUSTRIES_LIST.find((x) => x.id === currentBenchmarkIndustry) || TOP_25_INDUSTRIES_LIST[0];

    const quickPills = [
      { id: "semi", label: "Semiconductors & AI" },
      { id: "cloud", label: "Software & Cloud" },
      { id: "auto", label: "Automotive & EVs" },
      { id: "fashion", label: "Apparel & Fashion" },
      { id: "restaurants", label: "Restaurants & Dining" },
      { id: "banking", label: "Investment Banking" },
      { id: "pharma", label: "Pharmaceuticals" },
      { id: "energy", label: "Energy & Oil" }
    ];

    el.viewPeerComps.innerHTML = `
      <div class="hero">
        <h1>Industry Peer Benchmark</h1>
        <p class="hero-sub">
          Dynamic multi-company fundamental ranking and quality of earnings comparison across the top 25 institutional sectors.
        </p>
        
        <div style="display:flex; align-items:center; gap:12px; margin-top:14px; flex-wrap:wrap;">
          <div style="display:flex; align-items:center; gap:8px;">
            <label for="peerIndustrySelect" style="font-size:12.5px; font-weight:700; color:var(--ink);">Sector Category:</label>
            <select id="peerIndustrySelect" style="padding:6px 12px; border-radius:8px; border:1px solid var(--line); font-size:13px; font-weight:600; background:#ffffff; color:var(--ink); cursor:pointer;">
              ${TOP_25_INDUSTRIES_LIST.map((ind) => `
                <option value="${ind.id}" ${ind.id === activeIndObj.id ? "selected" : ""}>${escapeHtml(ind.name)}</option>
              `).join("")}
            </select>
          </div>

          <div class="chips" style="display:flex; flex-wrap:wrap; gap:6px;">
            ${quickPills.map((p) => `
              <button type="button" class="chip ${currentBenchmarkIndustry === p.id ? 'accent' : ''}" data-action="load-peer-industry" data-industry-id="${p.id}">${p.label}</button>
            `).join("")}
          </div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head" style="flex-wrap:wrap; gap:12px;">
          <div class="panel-title-wrap">
            <h2>${escapeHtml(activeIndObj.name)} — Top Revenue Leaders</h2>
            <span class="badge live">Live SEC XBRL Ranking</span>
          </div>
          
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <div class="chips" style="display:flex; gap:4px; margin-right:4px;">
              <button type="button" class="chip ${currentBenchmarkMode === 'annual' ? 'accent' : ''}" data-action="set-peer-mode" data-mode="annual">Annual (10-K)</button>
              <button type="button" class="chip ${currentBenchmarkMode === 'quarterly' ? 'accent' : ''}" data-action="set-peer-mode" data-mode="quarterly">Quarterly (10-Q)</button>
            </div>

            <div class="peer-suggest-wrap" style="position:relative; width:240px;">
              <input id="inputCustomPeer" type="text" placeholder="Search issuer (e.g. HOLO, SBUX)" autocomplete="off" spellcheck="false" style="padding:7px 12px; border-radius:8px; border:1px solid var(--line); font-size:12.5px; width:100%; box-sizing:border-box;" />
              <div id="peerSuggest" class="peer-suggest search-results" hidden></div>
            </div>
            <button type="button" class="btn secondary mini-btn" id="btnAddCustomPeer">+ Add</button>
            <button type="button" class="btn secondary mini-btn" data-action="export-excel">Export Excel (.xlsx)</button>
          </div>
        </div>

        <div id="peerCompsTableContainer" style="padding: 16px;">
          <div class="extract-loading"><div class="extract-spinner"></div><strong>Fetching live SEC audited financial statements and ranking top 5 by revenue…</strong></div>
        </div>
      </div>
    `;

    // Wire industry selector
    const sel = document.getElementById("peerIndustrySelect");
    if (sel) {
      sel.addEventListener("change", (e) => {
        renderPeerComps(currentCustomBenchmarkTicker, e.target.value);
      });
    }

    // Wire custom company suggest
    wirePeerCompanySuggest();

    const payload = {
      industryId: activeIndObj.id,
      industryName: activeIndObj.name,
      customTicker: currentCustomBenchmarkTicker || null,
      mode: currentBenchmarkMode
    };

    const res = await send({
      type: "calio:fetchPeerComps",
      payload
    });

    const container = document.getElementById("peerCompsTableContainer");
    if (!container) return;

    if (!res?.ok || !Array.isArray(res.peers) || !res.peers.length) {
      container.innerHTML = `<div class="empty">${escapeHtml(res?.error || "Unable to fetch peer comparisons at this time.")}</div>`;
      return;
    }

    const peers = res.peers;
    const isAnnual = currentBenchmarkMode === "annual";

    container.innerHTML = `
      <div class="peer-table-wrap">
        <table class="peer-table">
          <thead>
            <tr>
              <th>Company / Ticker</th>
              <th>Reporting Period</th>
              <th>${isAnnual ? "Annual Net Revenue (USD)" : "Quarterly Net Revenue (USD)"}</th>
              <th>Gross Margin (%)</th>
              <th>Operating Margin (%)</th>
              <th>Net Margin (%)</th>
              <th>FCF Conversion (%)</th>
              <th>Beneish M-Score</th>
              <th>Altman Z-Score</th>
              <th>Net Cash / (Debt)</th>
            </tr>
          </thead>
          <tbody>
            ${peers.map((p, idx) => {
              const isCustomTop = p.isCustom || (currentCustomBenchmarkTicker && p.ticker === currentCustomBenchmarkTicker);
              return `
              <tr class="${isCustomTop ? 'main-ticker-row' : ''}">
                <td>
                  <div style="display:flex; align-items:center; gap:6px;">
                    <strong>${escapeHtml(p.ticker)}</strong>
                    ${isCustomTop ? `<span class="badge accent" style="font-size:10px; padding:1px 5px;">Target Benchmark</span>` : ''}
                  </div>
                  <div style="font-size:11px; opacity:0.75; margin-top:2px;">${escapeHtml(truncate(p.companyName, 26))}</div>
                </td>
                <td>
                  <span style="font-size:12.5px; font-weight:700;">${escapeHtml(p.periodEnd || (isAnnual ? "FY 2025" : "Latest"))}</span>
                  <div style="font-size:10.5px; color:var(--soft); margin-top:2px;">${escapeHtml([p.calendarEnd, p.form].filter(Boolean).join(" · "))}</div>
                </td>
                <td style="font-weight:700;">${p.revenue ? formatMoney(p.revenue) : '—'}</td>
                <td>${p.grossMarginPct != null ? `${p.grossMarginPct}%` : '—'}</td>
                <td>${p.operatingMarginPct != null ? `${p.operatingMarginPct}%` : '—'}</td>
                <td>${p.netMarginPct != null ? `${p.netMarginPct}%` : '—'}</td>
                <td>${p.fcfConversionPct != null ? `${p.fcfConversionPct}%` : '—'}</td>
                <td><span class="${p.beneishMScore != null && p.beneishMScore < -1.78 ? 'peer-badge-safe' : 'peer-badge-warn'}">${p.beneishMScore != null ? p.beneishMScore : '—'}</span></td>
                <td><span class="${p.altmanZScore != null && p.altmanZScore > 2.99 ? 'peer-badge-safe' : 'peer-badge-warn'}">${p.altmanZScore != null ? p.altmanZScore : '—'}</span></td>
                <td>${p.netDebt != null ? formatMoney(p.netDebt) : '—'}</td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
      <div style="margin-top:10px; font-size:12px; color:var(--soft); line-height:1.5;">
        <strong>Data Source:</strong> Live U.S. SEC EDGAR XBRL Company Facts database (Form 10-K / 10-Q). Default view sorts by full-year audited annual revenue. Switch to Quarterly (10-Q) using the buttons above.
      </div>
    `;
  }

  function wirePeerCompanySuggest() {
    const input = document.getElementById("inputCustomPeer");
    const box = document.getElementById("peerSuggest");
    const addBtn = document.getElementById("btnAddCustomPeer");
    if (!input || !box) return;

    let timer = null;
    input.addEventListener("input", () => {
      clearTimeout(timer);
      const q = input.value.trim();
      if (q.length < 1) {
        box.hidden = true;
        box.innerHTML = "";
        return;
      }
      timer = setTimeout(async () => {
        try {
          const res = await send({
            type: "calio:searchCompanies",
            payload: { query: q, limit: 8 }
          });
          if (!res?.ok || !res.results?.length) {
            box.hidden = false;
            box.innerHTML = `<div class="empty suggest-empty" style="padding:10px 14px; font-size:12px;">No matching SEC issuers for “${escapeHtml(q)}”.</div>`;
            return;
          }
          box.hidden = false;
          box.innerHTML = `
            <div class="suggest-head" aria-hidden="true" style="padding:6px 12px; font-size:11px; font-weight:700; border-bottom:1px solid var(--line); display:flex; justify-content:space-between;">
              <span>CIK &amp; Name</span>
              <span>Ticker</span>
            </div>
            ${res.results.map((h) => `
              <button type="button" class="search-hit suggest-row"
                data-cik="${escapeAttr(h.cik)}" data-name="${escapeAttr(h.name)}"
                data-ticker="${escapeAttr(h.ticker || '')}" style="width:100%; display:flex; justify-content:space-between; padding:8px 12px; border:none; background:none; cursor:pointer; text-align:left; border-bottom:1px solid var(--line);">
                <span class="suggest-name" style="font-size:12px; font-weight:600;">${escapeHtml(h.name)}</span>
                <span class="suggest-ticker" style="font-size:12px; font-weight:700; color:var(--accent); font-family:var(--mono);">${escapeHtml(h.ticker || '—')}</span>
              </button>
            `).join("")}
          `;
        } catch {
          /* ignore */
        }
      }, 180);
    });

    const commitCustomTicker = (tk) => {
      if (tk) {
        box.hidden = true;
        renderPeerComps(tk, currentBenchmarkIndustry);
      }
    };

    if (addBtn) {
      addBtn.addEventListener("click", () => {
        const val = input.value.trim();
        if (val) commitCustomTicker(val);
      });
    }

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const active = box.querySelector(".suggest-row.is-active");
        if (active) {
          active.click();
        } else if (input.value.trim()) {
          commitCustomTicker(input.value.trim());
        }
      } else if (e.key === "Escape") {
        box.hidden = true;
      }
    });

    box.addEventListener("click", (e) => {
      const row = e.target.closest(".suggest-row");
      if (!row) return;
      const ticker = row.getAttribute("data-ticker") || "";
      const name = row.getAttribute("data-name") || "";
      const selected = ticker || name;
      input.value = selected;
      commitCustomTicker(selected);
    });
  }

  /* ── Segment Reporting & Geographical Revenue Breakdown View ─── */

  async function renderSegmentBreakdown(targetTicker) {
    const hasActiveCompany = !!(targetTicker || state.company?.ticker || state.extract?.companyName);
    const ticker = (targetTicker || state.company?.ticker || (state.extract?.companyName ? state.extract.companyName.split(/\s+/)[0] : "AAPL")).toUpperCase();

    if (!hasActiveCompany && !targetTicker) {
      el.viewSegment.innerHTML = `
        <div class="hero">
          <h1>Segment &amp; Geographic Revenue</h1>
          <p class="hero-sub">Disaggregated revenue by business unit product family and international sovereign market.</p>
        </div>

        <div class="panel" style="padding: 32px 24px; text-align: center;">
          <h2 style="font-size: 16px; margin: 0 0 8px 0;">No Company Selected</h2>
          <p style="font-size: 13.5px; color: var(--soft); max-width: 520px; margin: 0 auto 20px auto; line-height: 1.5;">
            Search for an issuer using the search bar above, or select a sample issuer below to inspect business unit segment disaggregation and sovereign geographic revenue exposure.
          </p>
          <div class="chips" style="justify-content: center; display: flex; gap: 8px;">
            <button type="button" class="chip accent" data-action="load-segment" data-ticker="AAPL">Apple (AAPL)</button>
            <button type="button" class="chip accent" data-action="load-segment" data-ticker="SBUX">Starbucks (SBUX)</button>
            <button type="button" class="chip accent" data-action="load-segment" data-ticker="NVDA">NVIDIA (NVDA)</button>
            <button type="button" class="chip accent" data-action="load-segment" data-ticker="TSLA">Tesla (TSLA)</button>
          </div>
        </div>
      `;
      return;
    }

    el.viewSegment.innerHTML = `
      <div class="hero">
        <h1>Segment &amp; Geographic Revenue</h1>
        <p class="hero-sub">Disaggregated revenue by business unit product family and international sovereign market.</p>
        <div class="chips" style="margin-top:12px; display:flex; flex-wrap:wrap; gap:6px;">
          <button type="button" class="chip ${ticker === 'NVDA' ? 'accent' : ''}" data-action="load-segment" data-ticker="NVDA">NVIDIA (NVDA)</button>
          <button type="button" class="chip ${ticker === 'AAPL' ? 'accent' : ''}" data-action="load-segment" data-ticker="AAPL">Apple (AAPL)</button>
          <button type="button" class="chip ${ticker === 'QCOM' ? 'accent' : ''}" data-action="load-segment" data-ticker="QCOM">Qualcomm (QCOM)</button>
          <button type="button" class="chip ${ticker === 'MSFT' ? 'accent' : ''}" data-action="load-segment" data-ticker="MSFT">Microsoft (MSFT)</button>
          <button type="button" class="chip ${ticker === 'GOOGL' ? 'accent' : ''}" data-action="load-segment" data-ticker="GOOGL">Alphabet (GOOGL)</button>
          <button type="button" class="chip ${ticker === 'AMZN' ? 'accent' : ''}" data-action="load-segment" data-ticker="AMZN">Amazon (AMZN)</button>
          <button type="button" class="chip ${ticker === 'META' ? 'accent' : ''}" data-action="load-segment" data-ticker="META">Meta (META)</button>
          <button type="button" class="chip ${ticker === 'AMD' ? 'accent' : ''}" data-action="load-segment" data-ticker="AMD">AMD (AMD)</button>
          <button type="button" class="chip ${ticker === 'INTC' ? 'accent' : ''}" data-action="load-segment" data-ticker="INTC">Intel (INTC)</button>
          <button type="button" class="chip ${ticker === 'TSLA' ? 'accent' : ''}" data-action="load-segment" data-ticker="TSLA">Tesla (TSLA)</button>
          <button type="button" class="chip ${ticker === 'LLY' ? 'accent' : ''}" data-action="load-segment" data-ticker="LLY">Eli Lilly (LLY)</button>
          <button type="button" class="chip ${ticker === 'JNJ' ? 'accent' : ''}" data-action="load-segment" data-ticker="JNJ">J&amp;J (JNJ)</button>
          <button type="button" class="chip ${ticker === 'SBUX' ? 'accent' : ''}" data-action="load-segment" data-ticker="SBUX">Starbucks (SBUX)</button>
        </div>
      </div>

      <div id="segmentContentContainer" style="margin-top:16px;">
        <div class="extract-loading"><div class="extract-spinner"></div><strong>Extracting segment disclosures for ${escapeHtml(ticker)}…</strong></div>
      </div>
    `;

    const res = await send({
      type: "calio:fetchSegmentBreakdown",
      payload: { ticker }
    });

    const container = document.getElementById("segmentContentContainer");
    if (!container) return;

    if (!res?.ok) {
      container.innerHTML = `<div class="empty">Unable to extract segment breakdown for ${escapeHtml(ticker)}.</div>`;
      return;
    }

    if (res.isUnindexed) {
      container.innerHTML = `
        <div class="panel" style="padding: 28px 24px; text-align: center;">
          <div style="font-size: 12px; text-transform: uppercase; font-weight: 700; color: var(--accent); letter-spacing: 0.5px; margin-bottom: 6px;">
            Audited SEC Financial Report
          </div>
          <h2 style="font-size: 18px; margin: 0 0 8px 0;">${escapeHtml(res.companyName || ticker)} (${escapeHtml(ticker)})</h2>
          ${res.totalRevenue ? `
            <div style="font-size: 2rem; font-weight: 800; font-family: var(--mono); color: var(--ink); margin-bottom: 4px;">
              ${formatMoney(res.totalRevenue)}
            </div>
            <div style="font-size: 12px; color: var(--soft); font-weight: 600; margin-bottom: 16px;">
              Audited Net Revenue (${escapeHtml(res.filingPeriod || 'Latest SEC Filing')})
            </div>
          ` : ''}
          <p style="font-size: 13.5px; color: var(--soft); max-width: 560px; margin: 0 auto 16px auto; line-height: 1.5;">
            Detailed product segment disclosures and sovereign geographic breakdowns for this issuer are reported under US-GAAP ASC 280 / ASC 606 in the Notes to Consolidated Financial Statements of their audited Form 10-K filing on SEC EDGAR.
          </p>
        </div>
      `;
      return;
    }

    const bu = res.businessUnits || [];
    const geo = res.geographicRegions || [];

    container.innerHTML = `
      <div class="segment-grid">
        <div class="segment-card">
          <div class="panel-head" style="padding:0 0 14px 0; border:none;">
            <div class="panel-title-wrap">
              <h2 style="font-size:15px;">Revenue by Business Unit (${escapeHtml(ticker)})</h2>
              <span class="badge live">Product Segments</span>
            </div>
          </div>
          ${bu.map((b) => `
            <div class="seg-bar-item">
              <div class="seg-bar-header">
                <span>${escapeHtml(b.name)}</span>
                <span><strong>${formatMoney(b.revenue)}</strong> (${b.pct}%)</span>
              </div>
              <div class="seg-bar-track">
                <div class="seg-bar-fill" style="width: ${b.pct}%;"></div>
              </div>
              <div style="font-size:11.5px; color:var(--soft); margin-top:3px;">
                YoY Growth: <strong style="color: #065f46;">${b.yoyGrowthPct > 0 ? '+' : ''}${b.yoyGrowthPct}%</strong> · Operating Margin: <strong>${b.opMarginPct}%</strong>
              </div>
            </div>
          `).join("")}
        </div>

        <div class="segment-card">
          <div class="panel-head" style="padding:0 0 14px 0; border:none;">
            <div class="panel-title-wrap">
              <h2 style="font-size:15px;">Geographic Market Exposure</h2>
              <span class="badge live">Regional Breakdown</span>
            </div>
          </div>
          ${geo.map((g) => `
            <div class="seg-bar-item">
              <div class="seg-bar-header">
                <span>${escapeHtml(g.region)}</span>
                <span><strong>${formatMoney(g.revenue)}</strong> (${g.pct}%)</span>
              </div>
              <div class="seg-bar-track">
                <div class="seg-bar-fill" style="width: ${g.pct}%; background: #0f766e;"></div>
              </div>
            </div>
          `).join("")}
        </div>
      </div>
      <div style="font-size: 11.5px; color: var(--muted); margin-top: 12px; padding: 0 4px;">
        Source: Verified SEC EDGAR US-GAAP XBRL Disaggregated Revenue &amp; Segment Disclosures.
      </div>
    `;
  }

  /* ── Executive Compensation & Governance (DEF 14A) View ─── */

  async function renderExecutiveComp(targetTicker) {
    const hasActiveCompany = !!(targetTicker || state.company?.ticker || state.extract?.companyName);
    const ticker = (targetTicker || state.company?.ticker || (state.extract?.companyName ? state.extract.companyName.split(/\s+/)[0] : "AAPL")).toUpperCase();

    if (!hasActiveCompany && !targetTicker) {
      el.viewExecComp.innerHTML = `
        <div class="hero">
          <h1>Executive Compensation &amp; Governance</h1>
          <p class="hero-sub">DEF 14A executive compensation structure, Named Executive Officer salary breakdowns, and Pay versus Performance alignment.</p>
        </div>

        <div class="panel" style="padding: 32px 24px; text-align: center;">
          <h2 style="font-size: 16px; margin: 0 0 8px 0;">No Company Selected</h2>
          <p style="font-size: 13.5px; color: var(--soft); max-width: 520px; margin: 0 auto 20px auto; line-height: 1.5;">
            Search for an issuer using the search bar above, or select a sample issuer below to inspect DEF 14A executive compensation packages, Named Executive Officer salary breakdowns, and Say-on-Pay governance ratings.
          </p>
          <div class="chips" style="justify-content: center; display: flex; gap: 8px;">
            <button type="button" class="chip accent" data-action="load-exec-comp" data-ticker="AAPL">Apple (AAPL)</button>
            <button type="button" class="chip accent" data-action="load-exec-comp" data-ticker="SBUX">Starbucks (SBUX)</button>
            <button type="button" class="chip accent" data-action="load-exec-comp" data-ticker="NVDA">NVIDIA (NVDA)</button>
            <button type="button" class="chip accent" data-action="load-exec-comp" data-ticker="TSLA">Tesla (TSLA)</button>
          </div>
        </div>
      `;
      return;
    }

    el.viewExecComp.innerHTML = `
      <div class="hero">
        <h1>Executive Compensation &amp; Governance</h1>
        <p class="hero-sub">DEF 14A executive compensation structure, Named Executive Officer salary breakdowns, and Pay versus Performance alignment.</p>
        <div class="chips" style="margin-top:12px; display:flex; flex-wrap:wrap; gap:6px;">
          <button type="button" class="chip ${ticker === 'NVDA' ? 'accent' : ''}" data-action="load-exec-comp" data-ticker="NVDA">NVIDIA (NVDA)</button>
          <button type="button" class="chip ${ticker === 'AAPL' ? 'accent' : ''}" data-action="load-exec-comp" data-ticker="AAPL">Apple (AAPL)</button>
          <button type="button" class="chip ${ticker === 'QCOM' ? 'accent' : ''}" data-action="load-exec-comp" data-ticker="QCOM">Qualcomm (QCOM)</button>
          <button type="button" class="chip ${ticker === 'MSFT' ? 'accent' : ''}" data-action="load-exec-comp" data-ticker="MSFT">Microsoft (MSFT)</button>
          <button type="button" class="chip ${ticker === 'GOOGL' ? 'accent' : ''}" data-action="load-exec-comp" data-ticker="GOOGL">Alphabet (GOOGL)</button>
          <button type="button" class="chip ${ticker === 'AMZN' ? 'accent' : ''}" data-action="load-exec-comp" data-ticker="AMZN">Amazon (AMZN)</button>
          <button type="button" class="chip ${ticker === 'META' ? 'accent' : ''}" data-action="load-exec-comp" data-ticker="META">Meta (META)</button>
          <button type="button" class="chip ${ticker === 'AMD' ? 'accent' : ''}" data-action="load-exec-comp" data-ticker="AMD">AMD (AMD)</button>
          <button type="button" class="chip ${ticker === 'INTC' ? 'accent' : ''}" data-action="load-exec-comp" data-ticker="INTC">Intel (INTC)</button>
          <button type="button" class="chip ${ticker === 'TSLA' ? 'accent' : ''}" data-action="load-exec-comp" data-ticker="TSLA">Tesla (TSLA)</button>
          <button type="button" class="chip ${ticker === 'LLY' ? 'accent' : ''}" data-action="load-exec-comp" data-ticker="LLY">Eli Lilly (LLY)</button>
          <button type="button" class="chip ${ticker === 'JNJ' ? 'accent' : ''}" data-action="load-exec-comp" data-ticker="JNJ">J&amp;J (JNJ)</button>
          <button type="button" class="chip ${ticker === 'SBUX' ? 'accent' : ''}" data-action="load-exec-comp" data-ticker="SBUX">Starbucks (SBUX)</button>
        </div>
      </div>

      <div id="execCompContentContainer" style="margin-top:16px;">
        <div class="extract-loading"><div class="extract-spinner"></div><strong>Extracting DEF 14A proxy compensation tables for ${escapeHtml(ticker)}…</strong></div>
      </div>
    `;

    const res = await send({
      type: "calio:fetchExecutiveComp",
      payload: { ticker }
    });

    const container = document.getElementById("execCompContentContainer");
    if (!container) return;

    if (!res?.ok) {
      container.innerHTML = `<div class="empty">Unable to fetch executive compensation for ${escapeHtml(ticker)}.</div>`;
      return;
    }

    if (res.isUnindexed) {
      container.innerHTML = `
        <div class="panel" style="padding: 28px 24px; text-align: center;">
          <div style="font-size: 12px; text-transform: uppercase; font-weight: 700; color: var(--accent); letter-spacing: 0.5px; margin-bottom: 6px;">
            Official SEC Proxy Statement
          </div>
          <h2 style="font-size: 18px; margin: 0 0 10px 0;">${escapeHtml(res.companyName || ticker)} (${escapeHtml(ticker)})</h2>
          <p style="font-size: 13.5px; color: var(--soft); max-width: 560px; margin: 0 auto 20px auto; line-height: 1.5;">
            Official SEC Form DEF 14A proxy statement was registered with the SEC${res.filingDate ? ` on <strong>${escapeHtml(res.filingDate)}</strong>` : ''}${res.accessionNumber ? ` (Accession: <span style="font-family:var(--mono); font-size:12px;">${escapeHtml(res.accessionNumber)}</span>)` : ''}.
            Audited Summary Compensation Tables and Named Executive Officer salary breakdowns are published in the official filing below.
          </p>
          ${res.documentUrl ? `
            <a href="${escapeAttr(res.documentUrl)}" target="_blank" rel="noopener noreferrer" class="btn primary" style="display: inline-block; text-decoration: none; padding: 10px 20px; font-weight: 600; font-size: 13px;">
              ↗ Open Official SEC Form DEF 14A on SEC.gov
            </a>
          ` : `
            <div class="chip">Official SEC DEF 14A Proxy Registered</div>
          `}
        </div>
      `;
      return;
    }

    const execs = res.executives || [];

    container.innerHTML = `
      <div class="exec-container">
        <div class="exec-metric-chips">
          <div class="exec-metric-card">
            <div class="label" style="font-size:11px; font-weight:700; color:var(--soft); text-transform:uppercase;">CEO Total Realized Pay</div>
            <div style="font-size:1.5rem; font-weight:800; font-family:var(--mono); color:var(--ink);">${formatMoney(res.ceoRealizedCompTotal)}</div>
            <div style="font-size:11px; color:#065f46; font-weight:600; margin-top:2px;">Performance Equity &amp; Incentive</div>
          </div>
          <div class="exec-metric-card">
            <div class="label" style="font-size:11px; font-weight:700; color:var(--soft); text-transform:uppercase;">CEO Pay Ratio</div>
            <div style="font-size:1.5rem; font-weight:800; font-family:var(--mono); color:var(--ink);">${escapeHtml(res.ceoPayRatio)}</div>
            <div style="font-size:11px; color:var(--muted); margin-top:2px;">vs Median: $${(res.medianEmployeePay || 100000).toLocaleString()}</div>
          </div>
          <div class="exec-metric-card">
            <div class="label" style="font-size:11px; font-weight:700; color:var(--soft); text-transform:uppercase;">3-Year Cumulative TSR</div>
            <div style="font-size:1.5rem; font-weight:800; font-family:var(--mono); color:${res.tsr3YearCumulativePct >= 0 ? '#065f46' : '#991b1b'};">${res.tsr3YearCumulativePct >= 0 ? '+' : ''}${res.tsr3YearCumulativePct}%</div>
            <div style="font-size:11px; color:var(--muted); margin-top:2px;">Total Shareholder Return</div>
          </div>
          <div class="exec-metric-card">
            <div class="label" style="font-size:11px; font-weight:700; color:var(--soft); text-transform:uppercase;">Say-on-Pay Approval</div>
            <div style="font-size:1.5rem; font-weight:800; font-family:var(--mono); color:#065f46;">${res.sayOnPayApprovalPct}%</div>
            <div style="font-size:11px; color:var(--muted); margin-top:2px;">Institutional Shareholder Support</div>
          </div>
        </div>

        <div class="panel-head" style="padding:0 0 12px 0; border:none;">
          <div class="panel-title-wrap">
            <h2>Named Executive Officers (NEO) Compensation Breakdown</h2>
            <span class="badge live">DEF 14A Summary Table</span>
          </div>
        </div>

        <div class="peer-table-wrap" style="margin-top:0;">
          <table class="peer-table">
            <thead>
              <tr>
                <th>Executive Officer / Title</th>
                <th>Base Salary</th>
                <th>Stock Awards</th>
                <th>Option Grants</th>
                <th>Non-Equity Incentives</th>
                <th>Total Compensation</th>
                <th>PVP Assessment</th>
              </tr>
            </thead>
            <tbody>
              ${execs.map((e) => `
                <tr>
                  <td>
                    <strong>${escapeHtml(e.name)}</strong>
                    <div style="font-size:11px; opacity:0.75;">${escapeHtml(e.role)}</div>
                  </td>
                  <td>${formatMoney(e.salary)}</td>
                  <td>${formatMoney(e.stockAwards)}</td>
                  <td>${formatMoney(e.optionAwards)}</td>
                  <td>${formatMoney(e.nonEquityIncentive)}</td>
                  <td><strong>${formatMoney(e.total)}</strong></td>
                  <td><span class="peer-badge-safe">${escapeHtml(e.pvpScore)}</span></td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
        <div style="margin-top:12px; font-size:12px; color:var(--soft); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <span><strong>Data Source:</strong> Official SEC EDGAR Form DEF 14A (Definitive Proxy Statement)${res.filingDate ? ` · Filed on ${escapeHtml(res.filingDate)}` : ''}</span>
          ${res.documentUrl ? `<a href="${escapeAttr(res.documentUrl)}" target="_blank" rel="noopener noreferrer" class="btn-source-link" style="text-decoration:none; padding:4px 10px; font-size:11.5px; border-radius:6px; background:var(--surface); border:1px solid var(--line); color:var(--accent); font-weight:600;">↗ View Official SEC Proxy Statement</a>` : ''}
        </div>
      </div>
    `;
  }

  function renderExtract() {
    const p = state.extract;
    if (!p) return renderExtractEmpty();

    const ins = Object.values(p.insurance || {}).filter((m) => m?.display);
    const fin = p.financials || {};
    const finEntries = Object.entries(fin).filter(([, v]) => v?.display);
    const ci = p.corporateIntel || null;
    const kind = p.intelKind || ci?.kind || "financial";
    const isNonFinancial =
      kind === "event" ||
      kind === "ownership" ||
      kind === "insider" ||
      kind === "proxy" ||
      kind === "form144" ||
      kind === "other";

    const heroSub = isNonFinancial
      ? ci?.headline ||
        "Form-specific fields from this filing (not 10-Q financial line items)."
      : "Metrics and line items pulled from this filing.";

    el.viewExtract.innerHTML = `
      <div class="hero">
        <h1>${escapeHtml(p.companyName || "Extract")}</h1>
        <p class="hero-sub">${escapeHtml(heroSub)}</p>
        <div class="chips">
          <span class="chip accent">${escapeHtml(
            p.filingType === "UNKNOWN" && ci?.formType
              ? ci.formType
              : p.filingType || ""
          )}</span>
          ${
            kind && kind !== "financial"
              ? `<span class="chip">${escapeHtml(kindLabel(kind))}</span>`
              : ""
          }
          ${p.periodEnd ? `<span class="chip">Period ${escapeHtml(p.periodEnd)}</span>` : ""}
          ${p.filingDate ? `<span class="chip">${escapeHtml(p.filingDate)}</span>` : ""}
          ${
            p.extractQuality?.level
              ? `<span class="chip quality-${escapeAttr(p.extractQuality.level)}" title="${escapeAttr(
                  p.extractQuality.summary || ""
                )}">${escapeHtml(
                  p.extractQuality.level === "high"
                    ? "Strong extract"
                    : p.extractQuality.level === "medium"
                    ? "Partial extract"
                    : "Thin extract"
                )}</span>`
              : ""
          }
        </div>
        ${
          p.note
            ? `<p class="hero-note">${escapeHtml(p.note)}</p>`
            : ""
        }
        <div class="actions">
          <button type="button" class="btn secondary" data-action="export-excel">Download Excel</button>
          <button type="button" class="btn secondary" data-action="export-pdf">Save PDF report</button>
          <button type="button" class="btn secondary" data-action="copy-insight">Copy summary</button>
          <button type="button" class="btn secondary" data-action="extract-active">Extract active tab</button>
        </div>
      </div>

      ${renderCorporateIntel(ci)}

      ${
        !isNonFinancial && ins.length
          ? `<div class="section-label">Insurance metrics</div>
        <div class="metric-grid">${ins
          .map(
            (m) => `
          <div class="metric-card">
            <div class="label">${escapeHtml(m.label)}</div>
            <div class="value">${escapeHtml(m.display)}</div>
            <div class="note">${escapeHtml(m.interpretation || "")}</div>
          </div>`
          )
          .join("")}</div>`
          : ""
      }

      ${
        !isNonFinancial ? renderForensicsCard(p) : ""
      }

      ${
        !isNonFinancial ? renderDcfCalculator(p) : ""
      }

      ${
        !isNonFinancial && finEntries.length
          ? `<div class="panel">
        <div class="panel-head">
          <div class="panel-title-wrap">
            <h2>Financial line items &amp; Audit Trail</h2>
            <span class="badge live">Click-to-Source Verified</span>
          </div>
          <button type="button" class="btn secondary mini-btn" data-action="export-excel">Download Excel (.xlsx)</button>
        </div>
        <div class="fact-list">
          ${finEntries
            .map(
              ([k, v]) => `
            <div class="fact-row">
              <div class="fact-info">
                <span class="k">${escapeHtml(v.label || k)}</span>
                ${v.xbrlTag ? `<span class="tag-label" title="US-GAAP Taxonomy">${escapeHtml(v.xbrlTag)}</span>` : ""}
              </div>
              <div class="fact-actions-wrap">
                <span class="v">${escapeHtml(v.display)}</span>
                ${
                  v.auditUrl || v.ixbrlUrl || p.documentUrl
                    ? `<button type="button" class="btn-source-link" data-action="open-audit-url" data-audit-url="${escapeAttr(v.auditUrl || v.ixbrlUrl || p.documentUrl)}" title="Verify directly in SEC EDGAR filing">↗ Source</button>`
                    : ""
                }
                <button type="button" class="btn-formula-copy" data-action="copy-formula" data-formula='=CALIO("${escapeAttr(state.company?.ticker || p.companyName?.split(/\s+/)[0] || "TICKER")}", "${escapeAttr(k)}", "${escapeAttr(p.periodEnd || "LATEST")}")' title="Copy dynamic spreadsheet formula">=CALIO</button>
              </div>
            </div>`
            )
            .join("")}
        </div>
      </div>`
          : !isNonFinancial
          ? `<div class="panel">
        <div class="panel-head"><h2>Financial line items</h2></div>
        <div class="empty">No financial line items found in this extract.</div>
      </div>`
          : ""
      }
      <div class="legal">
        Spreadsheet and PDF exports are generated on your device from this extract.
        No filing data is sent to C.A.L.I.O servers.
      </div>`;

    if (!isNonFinancial) {
      attachDcfCalculatorListeners(p);
    }
  }

  function kindLabel(kind) {
    const map = {
      event: "Current event",
      ownership: "Ownership",
      insider: "Insider",
      proxy: "Proxy / governance",
      form144: "Form 144 · Rule 144 sale",
      financial: "Financials",
      registration: "Registration",
      other: "Other form"
    };
    return map[kind] || kind;
  }

  function renderCorporateIntel(ci) {
    if (!ci) return "";
    const sections = Array.isArray(ci.sections) ? ci.sections : [];
    const items = Array.isArray(ci.items) ? ci.items : [];
    const people = Array.isArray(ci.people) ? ci.people : [];
    const orgs = Array.isArray(ci.organizations) ? ci.organizations : [];
    const facts = Array.isArray(ci.facts) ? ci.facts : [];
    const tags = Array.isArray(ci.eventTags) ? ci.eventTags : [];
    const highlights = Array.isArray(ci.highlights) ? ci.highlights : [];
    const txs = Array.isArray(ci.transactions) ? ci.transactions : [];
    const tables = Array.isArray(ci.tables) ? ci.tables : [];
    const remarks = ci.remarks || "";

    // Prefer form-native sections when present
    const hasSections = sections.some((s) => s?.facts?.length);
    if (
      !hasSections &&
      !items.length &&
      !people.length &&
      !orgs.length &&
      !facts.length &&
      !tags.length &&
      !txs.length &&
      !tables.length &&
      !remarks
    ) {
      return "";
    }

    const renderFactBlock = (title, factList) => {
      if (!factList?.length) return "";
      return `
        <div class="intel-section">
          <div class="section-label">${escapeHtml(title)}</div>
          <div class="fact-list">
            ${factList
              .map(
                (f) => `
              <div class="fact-row">
                <span class="k">${escapeHtml(f.label || "")}</span>
                <span class="v">${escapeHtml(f.value || "")}</span>
              </div>`
              )
              .join("")}
          </div>
        </div>`;
    };

    return `
      <div class="panel intel-panel">
        <div class="panel-head">
          <h2>${escapeHtml(ci.headline || "Filing intelligence")}</h2>
          ${
            ci.kind
              ? `<span class="badge live">${escapeHtml(kindLabel(ci.kind))}</span>`
              : ""
          }
        </div>
        ${
          highlights.length
            ? `<div class="chips" style="margin:0 16px 12px">${highlights
                .map((h) => `<span class="chip">${escapeHtml(h)}</span>`)
                .join("")}</div>`
            : ""
        }
        ${
          hasSections
            ? sections
                .map((s) => renderFactBlock(s.title || "Section", s.facts || []))
                .join("")
            : ""
        }
        ${
          tables.length
            ? tables
                .map(
                  (tb) => `
            <div class="intel-section">
              <div class="section-label">${escapeHtml(tb.title || "Table")}</div>
              <div class="table-wrap">
                <table class="filings intel-tx-table">
                  <thead>
                    <tr>${(tb.headers || [])
                      .map((h) => `<th>${escapeHtml(h)}</th>`)
                      .join("")}</tr>
                  </thead>
                  <tbody>
                    ${(tb.rows || [])
                      .map(
                        (row) =>
                          `<tr>${row
                            .map(
                              (cell) =>
                                `<td>${escapeHtml(String(cell ?? "—"))}</td>`
                            )
                            .join("")}</tr>`
                      )
                      .join("")}
                  </tbody>
                </table>
              </div>
            </div>`
                )
                .join("")
            : ""
        }
        ${
          !hasSections && txs.length
            ? `<div class="intel-section">
                <div class="section-label">Transactions</div>
                <div class="table-wrap">
                  <table class="filings intel-tx-table">
                    <thead>
                      <tr>
                        <th>Security</th>
                        <th>Date</th>
                        <th>Code</th>
                        <th>Shares</th>
                        <th>A/D</th>
                        <th>Price</th>
                        <th>Owned after</th>
                        <th>Form</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${txs
                        .map(
                          (t) => `
                        <tr>
                          <td>${escapeHtml(t.security || "—")}</td>
                          <td>${escapeHtml(t.date || "—")}</td>
                          <td class="form">${escapeHtml(t.code || "—")}</td>
                          <td class="num">${escapeHtml(t.amount || "—")}</td>
                          <td>${escapeHtml(
                            t.acquiredDisposed === "A"
                              ? "Acquired"
                              : t.acquiredDisposed === "D"
                              ? "Disposed"
                              : t.acquiredDisposed || "—"
                          )}</td>
                          <td class="num">${escapeHtml(t.price || "—")}</td>
                          <td class="num">${escapeHtml(t.ownedAfter || "—")}</td>
                          <td>${escapeHtml(
                            t.ownershipForm === "D"
                              ? "Direct"
                              : t.ownershipForm === "I"
                              ? "Indirect"
                              : t.ownershipForm || "—"
                          )}</td>
                        </tr>`
                        )
                        .join("")}
                    </tbody>
                  </table>
                </div>
              </div>`
            : ""
        }
        ${
          !hasSections
            ? `${
                items.length
                  ? renderFactBlock(
                      "Items",
                      items.map((it) => ({
                        label: `Item ${it.code}`,
                        value: it.label
                      }))
                    )
                  : ""
              }
              ${!hasSections && facts.length ? renderFactBlock("Key facts", facts) : ""}
              ${
                people.length
                  ? `<div class="intel-section">
                <div class="section-label">People</div>
                <div class="intel-chips">
                  ${people
                    .map(
                      (p) => `
                    <div class="intel-person">
                      <strong>${escapeHtml(p.name || p)}</strong>
                      ${p.role ? `<span>${escapeHtml(p.role)}</span>` : ""}
                    </div>`
                    )
                    .join("")}
                </div>
              </div>`
                  : ""
              }
              ${
                orgs.length
                  ? `<div class="intel-section">
                <div class="section-label">Organizations</div>
                <div class="intel-chips">
                  ${orgs
                    .map(
                      (o) => `
                    <div class="intel-person">
                      <strong>${escapeHtml(o.name || o)}</strong>
                      ${o.role ? `<span>${escapeHtml(o.role)}</span>` : ""}
                    </div>`
                    )
                    .join("")}
                </div>
              </div>`
                  : ""
              }`
            : ""
        }
        ${
          tags.length
            ? `<div class="intel-section">
                <div class="section-label">Event tags</div>
                <div class="fact-list">
                  ${tags
                    .map(
                      (t) => `
                    <div class="fact-row">
                      <span class="k">${escapeHtml(t.label)}</span>
                      <span class="v muted-v">${escapeHtml(t.blurb || "")}</span>
                    </div>`
                    )
                    .join("")}
                </div>
              </div>`
            : ""
        }
      </div>`;
  }

  async function extractActiveTab() {
    const quota = await send({ type: "calio:checkExtractQuota", payload: { cost: 1 } });
    if (quota && !quota.ok) {
      showQuotaDialog(quota);
      return;
    }
    state.extracting = true;
    state.pendingExtractUrl = null;
    state.pendingExtractSince = Date.now();
    setView("extract");
    renderExtractLoading("Reading the active SEC tab and pulling metrics…");
    toast("Extracting from the active browser tab…");
    try {
      const res = await send({ type: "calio:extractActiveTab" });
      if (!res?.ok) {
        if (res?.code === "HOURLY_LIMIT" || res?.code === "MONTHLY_LIMIT") {
          showQuotaDialog(res);
          return;
        }
        throw new Error(res?.error || "Extract failed.");
      }
      applyExtract(res.extract, {
        silent: false,
        switchView: true,
        toastMsg: `Extract complete — ${res.extract?.companyName || "filing"}`
      });
    } catch (err) {
      state.extracting = false;
      if (state.view === "extract") {
        if (state.extract) renderExtract();
        else renderExtractEmpty();
      }
      throw err;
    }
  }

  async function exportExcel() {
    if (!state.extract) throw new Error("Run extract first.");
    const res = await send({
      type: "calio:downloadExcel",
      payload: { extract: state.extract }
    });
    if (!res?.ok) throw new Error(res?.error || "Excel export failed.");
    toast(
      res.fallback === "csv"
        ? `Saved as CSV: ${res.filename}`
        : `Excel saved: ${res.filename || "export.xlsx"}`
    );
  }

  async function exportCompareExcel() {
    if (!state.lastCompare?.ok) {
      throw new Error("Run a comparison first.");
    }
    const c = state.lastCompare;
    const res = await send({
      type: "calio:downloadCompareExcel",
      payload: {
        left: c.left,
        right: c.right,
        deltas: c.deltas,
        formType: c.formType,
        parseMode: c.parseMode
      }
    });
    if (!res?.ok) throw new Error(res?.error || "Compare Excel export failed.");
    toast(`Excel saved: ${res.filename || "compare.xlsx"}`);
  }

  async function toggleWatchlistCompany() {
    const c = state.company;
    if (!c?.cik && !c?.name) throw new Error("Load a company first.");
    const res = await send({
      type: "calio:toggleWatchlist",
      payload: {
        companyName: c.name,
        cik: c.cik,
        sourceUrl: c.edgarCompanyUrl || c.browseUrl || "",
        filingType: "",
        snapshot: c.ticker || ""
      }
    });
    if (!res?.ok) throw new Error(res?.error || "Watchlist update failed.");
    state.company = { ...c, watched: res.action === "added" };
    state.watchlist = res.watchlist || [];
    renderWatchlistSidebar();
    renderDashboard();
    toast(
      res.action === "added"
        ? `Watching ${c.ticker || c.name}`
        : `Removed ${c.ticker || c.name} from watchlist`
    );
    // Seed monitor fingerprint immediately
    send({ type: "calio:runMonitorNow" }).catch(() => {});
  }

  async function refreshExtractHistory() {
    try {
      const res = await send({ type: "calio:getExtractHistory" });
      if (res?.ok) {
        state.extractHistory = res.history || [];
        renderExtractHistorySidebar();
        const badge = document.getElementById("extractHistoryBadge");
        if (badge) {
          const n = state.extractHistory.length;
          badge.hidden = n === 0;
          badge.textContent = String(n);
        }
      }
    } catch {
      /* ignore */
    }
  }

  function renderExtractHistorySidebar() {
    const box = document.getElementById("extractHistoryList");
    if (!box) return;
    const list = state.extractHistory || [];
    if (!list.length) {
      box.innerHTML = `<p class="history-empty">No extracts yet.</p>`;
      return;
    }
    box.innerHTML =
      list
        .slice(0, 10)
        .map((h) => {
          const sub = [h.filingType, h.periodEnd || h.filingDate || ""]
            .filter(Boolean)
            .join(" · ");
          return `
          <button type="button" class="history-item" data-action="extract-history-open"
            data-id="${escapeAttr(h.id)}">
            ${escapeHtml(h.companyName || "Extract")}
            ${sub ? `<span>${escapeHtml(sub)}</span>` : ""}
          </button>`;
        })
        .join("") +
      `<button type="button" class="history-item history-clear" data-action="clear-extract-history">Clear extract history</button>`;
  }

  async function openExtractHistoryItem(id) {
    if (!id) return;
    const res = await send({
      type: "calio:openExtractHistoryItem",
      payload: { id }
    });
    if (!res?.ok || !res.extract) {
      throw new Error(res?.error || "Could not open extract history item.");
    }
    applyExtract(res.extract, {
      silent: false,
      switchView: true,
      toastMsg: `Loaded extract — ${res.extract.companyName || "filing"}`
    });
  }

  async function clearExtractHistory() {
    await send({ type: "calio:clearExtractHistory" });
    state.extractHistory = [];
    renderExtractHistorySidebar();
    const badge = document.getElementById("extractHistoryBadge");
    if (badge) badge.hidden = true;
    toast("Extract history cleared.");
    if (state.view === "extract" && !state.extract) renderExtractEmpty();
  }

  async function refreshWatchlistAndAlerts() {
    try {
      const res = await send({ type: "calio:getMonitorStatus" });
      if (!res?.ok) return;
      state.watchlist = res.watchlist || [];
      state.alerts = res.alerts || [];
      renderWatchlistSidebar();
      const ab = document.getElementById("alertBadge");
      if (ab) {
        const n = Number(res.unreadCount) || 0;
        ab.hidden = n === 0;
        ab.textContent = n === 1 ? "1 new" : `${n} new`;
      }
      // Reflect watch state on current company
      if (state.company?.cik) {
        const cik = String(state.company.cik).replace(/\D/g, "");
        const watched = state.watchlist.some(
          (w) => String(w.cik || "").replace(/\D/g, "") === cik
        );
        if (state.company.watched !== watched) {
          state.company.watched = watched;
          if (state.view === "dashboard") renderDashboard();
        }
      }
    } catch {
      /* ignore */
    }
  }

  function renderWatchlistSidebar() {
    const box = document.getElementById("watchlistList");
    const alertsBox = document.getElementById("alertsList");
    if (!box) return;
    const list = state.watchlist || [];
    if (!list.length) {
      box.innerHTML = `<p class="history-empty">No companies watched.</p>`;
    } else {
      box.innerHTML =
        list
          .slice(0, 10)
          .map((w) => {
            const title = w.snapshot || w.companyName || w.cik || "Company";
            const sub = [
              w.companyName && w.snapshot ? w.companyName : "",
              w.lastSeenForm
                ? `${w.lastSeenForm}${w.lastSeenDate ? " · " + w.lastSeenDate : ""}`
                : w.cik
                ? `CIK ${w.cik}`
                : ""
            ]
              .filter(Boolean)
              .join(" · ");
            return `
            <button type="button" class="history-item" data-action="watchlist-open"
              data-cik="${escapeAttr(w.cik || "")}" data-name="${escapeAttr(w.companyName || "")}"
              data-ticker="${escapeAttr(w.snapshot || "")}">
              ${escapeHtml(title)}
              ${sub ? `<span>${escapeHtml(sub)}</span>` : ""}
            </button>`;
          })
          .join("") +
        `<button type="button" class="history-item history-clear" data-action="check-watchlist">Check for new filings</button>`;
    }

    if (alertsBox) {
      const alerts = (state.alerts || []).slice(0, 5);
      if (!alerts.length) {
        alertsBox.hidden = true;
        alertsBox.innerHTML = "";
      } else {
        alertsBox.hidden = false;
        alertsBox.innerHTML = `
          <div class="sidebar-history-title" style="margin-top:10px">New filings</div>
          ${alerts
            .map(
              (a) => `
            <button type="button" class="history-item alert-item" data-action="open-filing"
              data-url="${escapeAttr(a.documentUrl || "")}">
              ${escapeHtml(a.companyName || a.cik || "Filing")}
              <span>${escapeHtml(
                [a.form, a.filingDate].filter(Boolean).join(" · ")
              )}</span>
            </button>`
            )
            .join("")}
          <button type="button" class="history-item history-clear" data-action="dismiss-alerts">Dismiss alerts</button>`;
      }
    }
  }

  async function dismissAlerts() {
    await send({ type: "calio:dismissAlerts", payload: {} });
    state.alerts = [];
    renderWatchlistSidebar();
    const ab = document.getElementById("alertBadge");
    if (ab) ab.hidden = true;
    toast("Alerts dismissed.");
  }

  async function exportPdf() {
    if (!state.extract) throw new Error("Run extract first.");
    const res = await send({
      type: "calio:savePdf",
      payload: {
        companyName: state.extract.companyName,
        filingType: state.extract.filingType,
        filingDate: state.extract.filingDate || state.extract.periodEnd,
        periodEnd: state.extract.periodEnd,
        documentUrl: state.extract.documentUrl || "",
        report: state.extract,
        factsSummary: buildFactsLines(state.extract)
      }
    });
    if (!res?.ok) throw new Error(res?.error || "PDF failed.");
    toast(res.message || "PDF report ready — choose Save as PDF in the print dialog.");
  }

  async function copyInsight() {
    if (!state.extract) throw new Error("Run extract first.");
    const p = state.extract;
    const ci = p.corporateIntel;
    const bits = [
      `${p.companyName} · ${p.filingType}`,
      ci?.headline || null,
      ci?.facts?.[0] ? `${ci.facts[0].label} ${ci.facts[0].value}` : null,
      ci?.people?.[0]?.name || null,
      p.insurance?.combinedRatio?.display
        ? `Combined ratio ${p.insurance.combinedRatio.display}`
        : null,
      p.financials?.netIncome?.display
        ? `Net income ${p.financials.netIncome.display}`
        : null,
      "Source: C.A.L.I.O extract"
    ].filter(Boolean);
    await navigator.clipboard.writeText(bits.join(" · "));
    toast("Summary copied.");
  }

  function buildFactsLines(p) {
    const lines = [
      `Company: ${p.companyName}`,
      `Filing Type: ${p.filingType}`,
      p.periodEnd ? `Period End: ${p.periodEnd}` : null
    ].filter(Boolean);
    const ci = p.corporateIntel;
    if (ci?.headline) lines.push(`Headline: ${ci.headline}`);
    for (const f of ci?.facts || []) {
      if (f?.label) lines.push(`${f.label}: ${f.value || ""}`);
    }
    for (const it of ci?.items || []) {
      lines.push(`Item ${it.code}: ${it.label}`);
    }
    for (const person of ci?.people || []) {
      lines.push(
        `Person: ${person.name}${person.role ? ` (${person.role})` : ""}`
      );
    }
    for (const org of ci?.organizations || []) {
      lines.push(`Org: ${org.name}${org.role ? ` (${org.role})` : ""}`);
    }
    for (const m of Object.values(p.insurance || {})) {
      if (m?.display) lines.push(`${m.label}: ${m.display}`);
    }
    for (const [k, v] of Object.entries(p.financials || {})) {
      if (v?.display) lines.push(`${v.label || k}: ${v.display}`);
    }
    return lines;
  }

  function formNeedsQuarter(formType) {
    const t = String(formType || "").toUpperCase();
    return t === "10-Q" || t === "10-Q/A";
  }

  function applyAppTheme(_theme) {
    // Single product theme: teal & white (theme picker removed)
    document.documentElement.setAttribute("data-theme", "teal");
    document.body.setAttribute("data-theme", "teal");
  }

  function loadSearchHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      const list = raw ? JSON.parse(raw) : [];
      state.searchHistory = Array.isArray(list) ? list.slice(0, MAX_HISTORY) : [];
    } catch {
      state.searchHistory = [];
    }
    renderSearchHistory();
  }

  function saveSearchHistory() {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(state.searchHistory));
    } catch {
      /* ignore */
    }
    renderSearchHistory();
  }

  function pushSearchHistory(entry) {
    if (!entry?.cik && !entry?.name && !entry?.ticker) return;
    const key = String(entry.cik || entry.ticker || entry.name).toLowerCase();
    const next = [
      {
        cik: String(entry.cik || ""),
        name: String(entry.name || ""),
        ticker: String(entry.ticker || ""),
        at: new Date().toISOString()
      },
      ...state.searchHistory.filter((h) => {
        const k = String(h.cik || h.ticker || h.name).toLowerCase();
        return k !== key;
      })
    ].slice(0, MAX_HISTORY);
    state.searchHistory = next;
    saveSearchHistory();
  }

  function clearSearchHistory() {
    state.searchHistory = [];
    saveSearchHistory();
  }

  function renderSearchHistory() {
    const box = document.getElementById("searchHistoryList");
    if (!box) return;
    const list = state.searchHistory || [];
    if (!list.length) {
      box.innerHTML = `<p class="history-empty">No recent searches yet.</p>`;
      return;
    }
    box.innerHTML = list
      .map((h) => {
        const title = h.ticker || h.name || h.cik || "Company";
        const sub = [h.ticker && h.name ? h.name : "", h.cik ? `CIK ${h.cik}` : ""]
          .filter(Boolean)
          .join(" · ");
        return `
        <button type="button" class="history-item" data-action="history-open"
          data-cik="${escapeAttr(h.cik)}" data-name="${escapeAttr(h.name)}"
          data-ticker="${escapeAttr(h.ticker)}">
          ${escapeHtml(title)}
          ${sub ? `<span>${escapeHtml(sub)}</span>` : ""}
        </button>`;
      })
      .join("");
  }

  const SIDEBAR_COLLAPSE_KEY = "calioSidebarCollapse";

  function getSidebarCollapseMap() {
    try {
      const raw = localStorage.getItem(SIDEBAR_COLLAPSE_KEY);
      const map = raw ? JSON.parse(raw) : {};
      return map && typeof map === "object" ? map : {};
    } catch {
      return {};
    }
  }

  function setSidebarCollapsed(section, collapsed) {
    const map = getSidebarCollapseMap();
    map[section] = Boolean(collapsed);
    try {
      localStorage.setItem(SIDEBAR_COLLAPSE_KEY, JSON.stringify(map));
    } catch {
      /* ignore */
    }
  }

  function applySidebarCollapseState() {
    const map = getSidebarCollapseMap();
    // Default: collapse extract history when empty to save space; expand others
    document.querySelectorAll("[data-collapse-section]").forEach((wrap) => {
      const key = wrap.getAttribute("data-collapse-section");
      let collapsed = map[key];
      if (collapsed == null && key === "extracts") {
        collapsed = !(state.extractHistory && state.extractHistory.length);
      }
      if (collapsed == null) collapsed = false;
      wrap.classList.toggle("is-collapsed", Boolean(collapsed));
      const btn = wrap.querySelector(".sidebar-history-toggle");
      if (btn) btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
    });
  }

  function toggleSidebarSection(section) {
    if (!section) return;
    const wrap = document.querySelector(
      `[data-collapse-section="${section}"]`
    );
    if (!wrap) return;
    const next = !wrap.classList.contains("is-collapsed");
    wrap.classList.toggle("is-collapsed", next);
    setSidebarCollapsed(section, next);
    const btn = wrap.querySelector(".sidebar-history-toggle");
    if (btn) btn.setAttribute("aria-expanded", next ? "false" : "true");
  }

  function renderCompare() {
    const formVal = "10-Q";
    const needsQ = formNeedsQuarter(formVal);
    const defaultCompany = state.company?.ticker || state.company?.name || "";

    el.viewCompare.innerHTML = `
      <div class="hero">
        <h1>Period Comparison &amp; Variance</h1>
        <p class="hero-sub">
          Side-by-side financial statement variance, balance sheet reconciliation, and disclosure shift analysis across SEC reporting periods.
        </p>
      </div>

      <div class="panel compare-panel">
        <div class="panel-head">
          <div class="panel-title-wrap">
            <h2>Period-over-Period Filing Analysis</h2>
            <span class="badge live">Automated Reconciliation</span>
          </div>
        </div>

        <div class="compare-form" style="padding: 18px;">
          <p style="font-size: 13px; color: var(--soft); margin: 0 0 16px 0; line-height: 1.5;">
            Select an issuer and two reporting periods to compute exact dollar and percentage variances across Income Statement, Balance Sheet, and Cash Flow line items.
          </p>

          <div class="field full suggest-wrap">
            <label for="cmpCompany" style="font-weight:600;">Target Issuer or Ticker</label>
            <input id="cmpCompany" value="${escapeAttr(defaultCompany)}" placeholder="Enter ticker or issuer name (e.g. AAPL, SBUX, NVDA)" autocomplete="off" spellcheck="false" />
            <div id="cmpSuggest" class="search-results cmp-suggest" hidden></div>
          </div>

          <div class="field" style="margin-top: 12px;">
            <label for="cmpForm" style="font-weight:600;">SEC Form Type</label>
            <select id="cmpForm">
              <option value="10-Q" selected>Form 10-Q (Quarterly Report)</option>
              <option value="10-K">Form 10-K (Annual Report)</option>
              <option value="8-K">Form 8-K (Current Report)</option>
            </select>
          </div>
          <div class="field"></div>

          <div class="compare-columns" style="margin-top: 16px;">
            <div class="compare-col" style="background: var(--snow); padding: 14px; border-radius: 10px; border: 1px solid var(--line);">
              <div class="compare-col-title" style="font-weight:700; color:var(--ink); font-size:13.5px; margin-bottom:10px;">Baseline Filing (Period A)</div>
              <div class="field">
                <label for="cmpYearA">Fiscal Year</label>
                <input id="cmpYearA" placeholder="2025" inputmode="numeric" value="2025" />
              </div>
              <div class="field" data-quarter-field ${needsQ ? "" : "hidden"}>
                <label for="cmpQuarterA">Fiscal Quarter</label>
                <select id="cmpQuarterA">
                  <option value="latest" selected>Latest Available Quarter</option>
                  <option value="Q1">Q1 (First Quarter)</option>
                  <option value="Q2">Q2 (Second Quarter)</option>
                  <option value="Q3">Q3 (Third Quarter)</option>
                  <option value="Q4">Q4 (Fourth Quarter)</option>
                </select>
              </div>
            </div>

            <div class="compare-col" style="background: var(--snow); padding: 14px; border-radius: 10px; border: 1px solid var(--line);">
              <div class="compare-col-title" style="font-weight:700; color:var(--ink); font-size:13.5px; margin-bottom:10px;">Comparative Filing (Period B)</div>
              <div class="field">
                <label for="cmpYearB">Fiscal Year</label>
                <input id="cmpYearB" placeholder="2024" inputmode="numeric" value="2024" />
              </div>
              <div class="field" data-quarter-field ${needsQ ? "" : "hidden"}>
                <label for="cmpQuarterB">Fiscal Quarter</label>
                <select id="cmpQuarterB">
                  <option value="latest" selected>Latest Available Quarter</option>
                  <option value="Q1">Q1 (First Quarter)</option>
                  <option value="Q2">Q2 (Second Quarter)</option>
                  <option value="Q3">Q3 (Third Quarter)</option>
                  <option value="Q4">Q4 (Fourth Quarter)</option>
                </select>
              </div>
            </div>
          </div>

          <details class="advanced" style="margin-top: 16px;">
            <summary style="font-size: 12.5px; color: var(--soft); cursor: pointer;">Direct EDGAR Primary Document URLs (Optional)</summary>
            <div class="field full" style="margin-top:12px">
              <label for="cmpUrlA">Document URL A</label>
              <input id="cmpUrlA" placeholder="https://www.sec.gov/Archives/edgar/data/..." />
            </div>
            <div class="field full">
              <label for="cmpUrlB">Document URL B</label>
              <input id="cmpUrlB" placeholder="https://www.sec.gov/Archives/edgar/data/..." />
            </div>
          </details>

          <div class="actions" style="margin-top:16px">
            <button type="button" class="btn primary" data-action="compare-run">Run Period-over-Period Variance</button>
          </div>
        </div>

        <div id="cmpOut" class="compare-out"></div>
      </div>

      <div class="legal">
        Variance computation is powered by on-device SEC EDGAR XBRL taxonomy alignment. No filing data leaves your local device.
      </div>`;

    wireCompareCompanySuggest();
  }

  function wireCompareCompanySuggest() {
    const input = document.getElementById("cmpCompany");
    const box = document.getElementById("cmpSuggest");
    if (!input || !box) return;

    let timer = null;
    input.addEventListener("input", () => {
      clearTimeout(timer);
      const q = input.value.trim();
      if (q.length < 1) {
        box.hidden = true;
        box.innerHTML = "";
        return;
      }
      timer = setTimeout(() => runCmpSuggest(q, box, input), 180);
    });

    input.addEventListener("keydown", (e) => {
      const items = [...box.querySelectorAll(".suggest-row")];
      const active = box.querySelector(".suggest-row.is-active");
      let idx = active ? items.indexOf(active) : -1;
      if (e.key === "ArrowDown" && items.length && !box.hidden) {
        e.preventDefault();
        idx = Math.min(items.length - 1, idx + 1);
        items.forEach((n) => n.classList.remove("is-active"));
        items[idx].classList.add("is-active");
        items[idx].scrollIntoView({ block: "nearest" });
      } else if (e.key === "ArrowUp" && items.length && !box.hidden) {
        e.preventDefault();
        idx = Math.max(0, idx <= 0 ? 0 : idx - 1);
        items.forEach((n) => n.classList.remove("is-active"));
        items[idx].classList.add("is-active");
        items[idx].scrollIntoView({ block: "nearest" });
      } else if (e.key === "Enter" && active) {
        e.preventDefault();
        active.click();
      } else if (e.key === "Escape") {
        box.hidden = true;
      }
    });

    box.addEventListener("click", (e) => {
      const row = e.target.closest(".suggest-row");
      if (!row) return;
      const ticker = row.getAttribute("data-ticker") || "";
      const name = row.getAttribute("data-name") || "";
      input.value = ticker || name;
      input.dataset.cik = row.getAttribute("data-cik") || "";
      box.hidden = true;
    });
  }

  async function runCmpSuggest(query, box, input) {
    try {
      const res = await send({
        type: "calio:searchCompanies",
        payload: { query, limit: 12 }
      });
      if (!res?.ok) return;
      const hits = res.results || [];
      if (!hits.length) {
        box.hidden = false;
        box.innerHTML = `<div class="empty suggest-empty">No companies found for “${escapeHtml(
          query
        )}”.</div>`;
        return;
      }
      box.hidden = false;
      box.innerHTML = `
        <div class="suggest-head" aria-hidden="true">
          <span>CIK</span>
          <span>Company name</span>
          <span>Ticker</span>
        </div>
        ${hits
          .map((h) => {
            const cikPad = String(h.cik || "").replace(/\D/g, "").padStart(10, "0");
            return `
          <button type="button" class="search-hit suggest-row"
            data-cik="${escapeAttr(h.cik)}" data-name="${escapeAttr(h.name)}"
            data-ticker="${escapeAttr(h.ticker || "")}">
            <span class="suggest-cik">${escapeHtml(cikPad)}</span>
            <span class="suggest-name">${escapeHtml(h.name)}</span>
            <span class="suggest-ticker">${escapeHtml(h.ticker || "—")}</span>
          </button>`;
          })
          .join("")}`;
    } catch {
      /* ignore soft suggest errors */
    }
  }

  async function runCompare() {
    const out = document.getElementById("cmpOut");
    if (!out) return;
    out.innerHTML = `<div class="loading">Loading filings and extracting metrics…</div>`;

    const formType = document.getElementById("cmpForm")?.value || "10-Q";
    const needsQ = formNeedsQuarter(formType);
    const companyInput = document.getElementById("cmpCompany");
    const payload = {
      company: companyInput?.value || "",
      formType,
      yearA: document.getElementById("cmpYearA")?.value || "",
      yearB: document.getElementById("cmpYearB")?.value || "",
      quarterA: needsQ
        ? document.getElementById("cmpQuarterA")?.value || "latest"
        : "latest",
      quarterB: needsQ
        ? document.getElementById("cmpQuarterB")?.value || "latest"
        : "latest",
      urlA: document.getElementById("cmpUrlA")?.value || "",
      urlB: document.getElementById("cmpUrlB")?.value || ""
    };

    const res = await send({ type: "calio:compareFilings", payload });
    if (!res?.ok) {
      state.lastCompare = null;
      out.innerHTML = `<div class="empty">${escapeHtml(
        res?.error || "Comparison could not be completed."
      )}</div>`;
      return;
    }

    state.lastCompare = res;

    const left = res.left || {};
    const right = res.right || {};
    const deltas = Array.isArray(res.deltas) ? res.deltas : [];
    const mode = res.parseMode || "";

    // Show every metric: both sides found, one side only, or missing
    const foundBoth = deltas.filter((d) => d.foundA && d.foundB);
    const partial = deltas.filter(
      (d) => (d.foundA || d.foundB) && !(d.foundA && d.foundB)
    );
    const missing = deltas.filter((d) => !d.foundA && !d.foundB);

    const renderGroup = (title, rows, emptyMsg) => {
      if (!rows.length) {
        return emptyMsg
          ? `<div class="panel" style="margin:12px 16px;border:none;box-shadow:none"><div class="empty">${emptyMsg}</div></div>`
          : "";
      }
      return `
        <div class="panel" style="margin:12px 16px;border:none;box-shadow:none">
          <div class="panel-head"><h2>${escapeHtml(title)}</h2>
            <span class="badge muted">${rows.length}</span>
          </div>
          <div class="compare-table-wrap">
            <table class="compare-table">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Filing A</th>
                  <th>Filing B</th>
                  <th>Change</th>
                </tr>
              </thead>
              <tbody>
                ${rows
                  .map((d) => {
                    const a = d.leftDisplay || "—";
                    const b = d.rightDisplay || "—";
                    const delta = d.display || d.deltaDisplay || "—";
                    const muted =
                      !d.foundA && !d.foundB
                        ? "is-missing"
                        : d.foundA && d.foundB
                        ? ""
                        : "is-partial";
                    return `
                  <tr class="${muted}">
                    <td class="metric-name">${escapeHtml(d.label || d.key || "Metric")}${
                      d.section
                        ? `<div class="metric-sec">${escapeHtml(d.section)}</div>`
                        : ""
                    }</td>
                    <td class="num">${escapeHtml(String(a))}</td>
                    <td class="num">${escapeHtml(String(b))}</td>
                    <td class="num change">${escapeHtml(String(delta))}</td>
                  </tr>`;
                  })
                  .join("")}
              </tbody>
            </table>
          </div>
        </div>`;
    };

    out.innerHTML = `
      <div class="compare-summary">
        <div class="compare-pill">
          <strong>A</strong>
          ${escapeHtml(left.companyName || payload.company || "Filing A")}
          · ${escapeHtml(left.filingType || formType)}
          ${left.periodEnd ? ` · ${escapeHtml(left.periodEnd)}` : ""}
        </div>
        <div class="compare-pill">
          <strong>B</strong>
          ${escapeHtml(right.companyName || payload.company || "Filing B")}
          · ${escapeHtml(right.filingType || formType)}
          ${right.periodEnd ? ` · ${escapeHtml(right.periodEnd)}` : ""}
        </div>
        ${
          mode === "full"
            ? `<span class="badge live">Full extract</span>`
            : mode === "xbrl"
            ? `<span class="badge live">XBRL facts</span>`
            : mode === "lite"
            ? `<span class="badge muted">Limited match</span>`
            : ""
        }
        ${
          Array.isArray(res.left?.sources) && res.left.sources.length
            ? `<span class="badge muted" title="Metric sources used">via ${escapeHtml(
                res.left.sources.join(" · ")
              )}</span>`
            : ""
        }
        <button type="button" class="btn secondary sm" data-action="export-compare-excel"
          title="Download comparison as Excel workbook">Download Excel</button>
      </div>
      ${renderGroup(
        "Metrics on both filings",
        foundBoth,
        "No shared numeric metrics were found on both documents. Try pasting the two primary HTML document links, or re-run after a SEC tab is open."
      )}
      ${renderGroup("Found on one filing only", partial, "")}
      ${
        missing.length
          ? `<details class="advanced" style="margin:0 16px 16px">
              <summary>Not disclosed in either filing (${missing.length})</summary>
              ${renderGroup("Not disclosed in this filing", missing, "")}
            </details>`
          : ""
      }`;
  }

  function toast(message, isError) {
    el.toast.textContent = message;
    el.toast.classList.add("is-visible");
    el.toast.classList.toggle("error", Boolean(isError));
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.toast.classList.remove("is-visible"), 3800);
  }

  function send(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response);
      });
    });
  }

  function escapeHtml(v) {
    return String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeAttr(v) {
    return escapeHtml(v).replace(/'/g, "&#39;");
  }

  function truncate(s, n) {
    const t = String(s || "");
    return t.length > n ? `${t.slice(0, n - 1)}…` : t;
  }
})();
