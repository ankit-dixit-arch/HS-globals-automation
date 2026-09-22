/**
 * IndiaMART Contact Buyer Auto-Click - Content Script
 * =====================================================
 * Runs on the BuyLeads (Recent) page. Initializes the scanner, coordinates
 * its triggers, and keeps all browser event listeners in one place.
 *
 * SCANNING IS TRIGGERED FOUR WAYS NOW:
 *  1. MutationObserver -- triggers a scan as soon as IndiaMART inserts a
 *     lead card into the page.
 *  2. setInterval -- checks the visible page every 400 ms. Chrome slows
 *     page timers to roughly once a minute once the tab is hidden.
 *  3. chrome.alarms (via background.js) -- the background service
 *     worker pings this content script roughly once a minute regardless
 *     of tab visibility, as a backstop against the throttled interval.
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

  // Scan immediately when IndiaMART adds a new lead card. The scanner queues
  // a follow-up pass if another scan is already in progress.
  const observer = new MutationObserver((mutations) => {
    if (mutationLooksRelevant(mutations)) {
      scheduleMutationScan();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  logEvent("MutationObserver attached -- watching for new leads in real time.");

  setTimeout(() => scanAndClick("initial"), 200);
  setInterval(() => scanAndClick("interval"), SCAN_INTERVAL_MS);

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
