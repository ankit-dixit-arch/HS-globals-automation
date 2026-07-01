/**
 * IndiaMART Contact Buyer Auto-Click - Content Script
 * =====================================================
 * Runs on the BuyLeads (Recent) page. Initializes the scanner, coordinates
 * its triggers, and keeps all browser event listeners in one place.
 *
 * SCANNING IS TRIGGERED FOUR WAYS NOW:
 *  1. MutationObserver -- fires the instant new lead cards are inserted
 *     into the DOM (e.g. IndiaMART's own auto-refresh/infinite-scroll
 *     adding leads). This is event-driven, not timer-based, so it is
 *     NOT subject to Chrome's background-tab timer throttling -- it
 *     still fires while the tab is minimized or another tab is active.
 *  2. setInterval -- a periodic safety-net scan. Reliable while the tab
 *     is focused/visible; gets throttled to ~once/minute by Chrome once
 *     the tab is hidden (this is a browser-level limitation, not
 *     something fixable from inside the page).
 *  3. chrome.alarms (via background.js) -- the background service
 *     worker pings this content script roughly once a minute regardless
 *     of tab visibility, as a backstop against #2 being throttled.
 *  4. visibilitychange -- an immediate scan the moment you switch back
 *     to this tab, to catch up on anything missed while away.
 */

(async function initializeExtension() {
  const moduleBaseUrl = chrome.runtime.getURL("src/");
  const [{ SCAN_INTERVAL_MS }, { logEvent }, scanner] = await Promise.all([
    import(moduleBaseUrl + "constants.js"),
    import(moduleBaseUrl + "logger.js"),
    import(moduleBaseUrl + "scanner.js"),
  ]);
  const { mutationLooksRelevant, scanAndClick, scheduleMutationScan } = scanner;

  // ---------------------------------------------------------------------------
  // 1. MutationObserver -- near-instant detection of new leads as they're
  //    inserted into the DOM, regardless of tab visibility.
  // ---------------------------------------------------------------------------

  function setupMutationObserver() {
    const observer = new MutationObserver((mutations) => {
      if (mutationLooksRelevant(mutations)) {
        scheduleMutationScan();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    logEvent("MutationObserver attached -- watching for new leads in real time.");
  }

  // ---------------------------------------------------------------------------
  // 2. Periodic safety-net scan (throttled by Chrome to ~1/min once hidden,
  //    but still useful while the tab is focused, and as a fallback if a
  //    page update doesn't trigger a DOM mutation the observer catches).
  // ---------------------------------------------------------------------------

  setTimeout(() => scanAndClick("initial"), 1000);
  setInterval(() => scanAndClick("interval"), SCAN_INTERVAL_MS);
  setupMutationObserver();

  // ---------------------------------------------------------------------------
  // 3. chrome.alarms backstop -- background.js wakes this tab up roughly
  //    once a minute even while backgrounded/minimized, independent of
  //    timer throttling.
  // ---------------------------------------------------------------------------

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && message.type === "PING") {
      sendResponse({
        alive: true,
        url: window.location.href,
      });
      return;
    }
    if (message && message.type === "FORCE_SCAN") {
      scanAndClick(message.source || "forced");
      sendResponse({ ok: true });
      return;
    }
  });

  // ---------------------------------------------------------------------------
  // 4. Catch up immediately when you switch back to this tab.
  // ---------------------------------------------------------------------------

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      scanAndClick("visibility");
    }
  });
})();
