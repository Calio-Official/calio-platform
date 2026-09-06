document.addEventListener("DOMContentLoaded", init);

async function init() {
  document.getElementById("settingsButton").addEventListener("click", async () => {
    await sendMessage({ type: "calio:openOptions" });
  });

  document.getElementById("openAppButton").addEventListener("click", async () => {
    await sendMessage({ type: "calio:openApp" });
    window.close();
  });

  // Auto-open desk when popup opens (fast path)
  try {
    await sendMessage({ type: "calio:openApp" });
    setTimeout(() => window.close(), 120);
  } catch {
    /* stay on popup if window create fails */
  }
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
