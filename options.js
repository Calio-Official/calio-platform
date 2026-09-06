/**
 * C.A.L.I.O — User preferences & membership tiers
 */
document.addEventListener("DOMContentLoaded", init);

async function init() {
  const form = document.getElementById("settingsForm");
  form.addEventListener("submit", onSave);
  document.getElementById("clearRecentButton").addEventListener("click", onClearRecent);
  document.getElementById("clearWatchlistButton").addEventListener("click", onClearWatchlist);
  document.getElementById("clearAllButton").addEventListener("click", onClearAll);
  document.getElementById("signInButton").addEventListener("click", onSignInLocal);
  document.getElementById("signOutButton").addEventListener("click", onSignOutLocal);

  document.querySelectorAll("[data-action='select-tier']").forEach((btn) => {
    btn.addEventListener("click", () => {
      const plan = btn.getAttribute("data-tier");
      if (plan) selectPlan(plan);
    });
  });

  const btnActivate = document.getElementById("btnActivateLicense");
  if (btnActivate) {
    btnActivate.addEventListener("click", onActivateLicense);
  }

  // Always use product teal + white on this page
  document.body.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-theme");

  await loadSettings();
  await loadTiers();
  await loadUsage();
}

async function loadTiers() {
  try {
    const res = await sendMessage({ type: "calio:getTiers" });
    if (!res?.ok) return;
    const currentPlan = res.currentPlan || "free";
    updateTierUi(currentPlan);
  } catch {
    /* ignore */
  }
}

function updateTierUi(activePlan = "free") {
  const tiers = ["free", "pro", "institutional"];
  tiers.forEach((t) => {
    const card = document.getElementById(`tierCard${t.charAt(0).toUpperCase() + t.slice(1)}`);
    const btn = document.getElementById(`btnSelect${t.charAt(0).toUpperCase() + t.slice(1)}`);
    const isActive = t === activePlan;
    if (card) {
      card.classList.toggle("is-active-tier", isActive);
    }
    if (btn) {
      btn.classList.toggle("is-current", isActive);
      btn.disabled = isActive;
      if (isActive) {
        btn.textContent = "Current Plan";
      } else if (t === "free") {
        btn.textContent = "Select Free Plan";
      } else if (t === "pro") {
        btn.textContent = "Upgrade to Pro ($35/mo)";
      } else if (t === "institutional") {
        btn.textContent = "Upgrade to Institutional ($55/mo)";
      }
    }
  });
}

async function selectPlan(planId) {
  try {
    const res = await sendMessage({
      type: "calio:selectPlan",
      payload: { plan: planId }
    });
    if (!res?.ok) {
      throw new Error(res?.error || "Could not update plan.");
    }
    updateTierUi(res.plan);
    await loadUsage();

    const notice = document.getElementById("planUpgradeNotice");
    if (notice) {
      const t = res.tier || {};
      notice.textContent = `Your account is now on the ${t.name} plan! Extract limit: ${t.monthlyExtractLimit}/month · Pace limit: ${t.hourlyExtractLimit}/hour.`;
      notice.hidden = false;
      setTimeout(() => {
        notice.hidden = true;
      }, 7000);
    }
  } catch (err) {
    showStatus(err?.message || "Plan update failed.", true);
  }
}

async function onActivateLicense() {
  const input = document.getElementById("licenseKeyInput");
  const status = document.getElementById("licenseStatus");
  const key = String(input?.value || "").trim().toUpperCase();
  if (!key) {
    if (status) status.textContent = "Please enter an activation or license key.";
    return;
  }

  let planToActivate = "pro";
  if (key.includes("INSTITUTIONAL") || key.includes("ENT") || key.includes("DESK") || key.includes("55")) {
    planToActivate = "institutional";
  } else if (key.includes("FREE")) {
    planToActivate = "free";
  }

  await selectPlan(planToActivate);
  if (status) {
    status.textContent = `Activation key applied: Activated ${planToActivate === "institutional" ? "Institutional Desk ($55/mo)" : "Pro Analyst ($35/mo)"}.`;
    status.style.color = "#0f766e";
    status.style.fontWeight = "600";
  }
}

async function loadSettings() {
  try {
    const response = await sendMessage({ type: "calio:getSettings" });
    if (!response?.ok) {
      throw new Error(response?.error || "Unable to load preferences.");
    }

    const s = response.settings || {};
    const accountEmail = s.accountEmail || s.lastEmail || "";
    document.getElementById("accountEmail").value = accountEmail;
    document.getElementById("productUpdatesOptIn").checked = Boolean(
      s.productUpdatesOptIn
    );
    document.getElementById("preferredMailClient").value =
      s.preferredMailClient === "gmail" ? "gmail" : "mailto";

    const status = document.getElementById("accountStatus");
    if (accountEmail) {
      status.textContent = s.productUpdatesOptIn
        ? `Signed in as ${accountEmail} · product updates on`
        : `Signed in as ${accountEmail} · product updates off`;
    } else {
      status.textContent =
        "Not signed in. History stays local to this browser only.";
    }
  } catch (error) {
    showStatus(error?.message || "Unable to load preferences.", true);
  }
}

async function loadUsage() {
  try {
    const response = await sendMessage({ type: "calio:getUsage" });
    if (!response?.ok) return;
    const u = response.usage || {};
    const count = Number(u.count) || 0;
    const limit = Number(u.monthlyExtractLimit || u.freeLimit) || 80;
    const hourCount = Number(u.hourCount) || 0;
    const hourLimit = Number(u.hourlyExtractLimit) || 25;
    const tierName = u.tierName || (u.plan === "pro" ? "Pro Analyst ($35/mo)" : u.plan === "institutional" ? "Institutional Desk ($55/mo)" : "Free Starter");

    document.getElementById("usageTitle").textContent = `${count} / ${limit} extracts (${tierName})`;
    document.getElementById("usageDetail").textContent =
      `Month ${u.month || "—"}. Hourly pace: ${hourCount} / ${hourLimit} extracts/hr. ` +
      `Current plan: ${tierName}. Limits follow SEC fair-access guidelines.`;
  } catch {
    /* ignore */
  }
}

async function collectPayload() {
  const accountEmail = document.getElementById("accountEmail").value.trim();
  return {
    accountEmail,
    lastEmail: accountEmail,
    productUpdatesOptIn: document.getElementById("productUpdatesOptIn").checked,
    preferredMailClient: document.getElementById("preferredMailClient").value,
    theme: "teal"
  };
}

async function onSave(event) {
  event.preventDefault();
  try {
    const payload = await collectPayload();
    if (payload.accountEmail && !isValidEmail(payload.accountEmail)) {
      throw new Error("Enter a valid email address, or leave it blank.");
    }
    if (payload.productUpdatesOptIn && !payload.accountEmail) {
      throw new Error("Add your email to opt in to product updates.");
    }

    const response = await sendMessage({
      type: "calio:saveSettings",
      payload
    });
    if (!response?.ok) {
      throw new Error(response?.error || "Unable to save preferences.");
    }
    await loadSettings();
    showStatus("Preferences saved.");
  } catch (error) {
    showStatus(error?.message || "Unable to save preferences.", true);
  }
}

async function onSignInLocal() {
  try {
    const payload = await collectPayload();
    if (!payload.accountEmail || !isValidEmail(payload.accountEmail)) {
      throw new Error("Enter your email to save an account on this device.");
    }
    payload.signedInAt = new Date().toISOString();
    const response = await sendMessage({
      type: "calio:saveSettings",
      payload
    });
    if (!response?.ok) throw new Error(response?.error || "Sign-in failed.");
    await loadSettings();
    showStatus(
      payload.productUpdatesOptIn
        ? "Account saved. You’re opted in to product updates."
        : "Account saved on this device."
    );
  } catch (error) {
    showStatus(error?.message || "Sign-in failed.", true);
  }
}

async function onSignOutLocal() {
  try {
    const response = await sendMessage({
      type: "calio:saveSettings",
      payload: {
        accountEmail: "",
        lastEmail: "",
        productUpdatesOptIn: false,
        signedInAt: "",
        theme: "teal"
      }
    });
    if (!response?.ok) throw new Error(response?.error || "Sign-out failed.");
    document.getElementById("accountEmail").value = "";
    document.getElementById("productUpdatesOptIn").checked = false;
    await loadSettings();
    showStatus("Signed out on this device.");
  } catch (error) {
    showStatus(error?.message || "Sign-out failed.", true);
  }
}

async function onClearRecent() {
  try {
    const response = await sendMessage({ type: "calio:clearRecent" });
    if (!response?.ok) throw new Error(response?.error || "Unable to clear history.");
    // Also clear app search history key if present
    try {
      localStorage.removeItem("calioSearchHistory");
    } catch {
      /* ignore */
    }
    showStatus("History cleared.");
  } catch (error) {
    showStatus(error?.message || "Unable to clear history.", true);
  }
}

async function onClearWatchlist() {
  try {
    const response = await sendMessage({ type: "calio:clearWatchlist" });
    if (!response?.ok) throw new Error(response?.error || "Unable to clear watchlist.");
    showStatus("Watchlist cleared.");
  } catch (error) {
    showStatus(error?.message || "Unable to clear watchlist.", true);
  }
}

async function onClearAll() {
  if (
    !confirm(
      "Clear recent activity, search history, watchlist, last extract, and alerts on this device?"
    )
  ) {
    return;
  }
  try {
    const response = await sendMessage({ type: "calio:clearLocalData" });
    if (!response?.ok) throw new Error(response?.error || "Unable to clear data.");
    try {
      localStorage.removeItem("calioSearchHistory");
    } catch {
      /* ignore */
    }
    showStatus("Local data cleared. Preferences kept.");
    await loadUsage();
  } catch (error) {
    showStatus(error?.message || "Unable to clear data.", true);
  }
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || "").trim());
}

function showStatus(message, isError = false) {
  const el = document.getElementById("statusMessage");
  el.textContent = message;
  el.classList.add("is-visible");
  el.classList.toggle("error", Boolean(isError));
  clearTimeout(showStatus._timer);
  showStatus._timer = setTimeout(() => {
    el.classList.remove("is-visible");
    el.classList.remove("error");
  }, 4500);
}

function sendMessage(message) {
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
