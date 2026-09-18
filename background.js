/**
 * IndiaMART Contact Buyer Auto-Click - Background Service Worker
 * =================================================================
 * WHY THIS FILE EXISTS:
 * Chrome throttles JS timers (setInterval/setTimeout) in tabs that are
 * not visible -- minimized, backgrounded, or a different tab is active.
 * After ~1 minute hidden, a page's timers are capped to roughly once a
 * minute regardless of what interval you asked for. That's the real
 * reason a content-script-only scanner can feel "paused" when you switch
 * away from the BuyLeads tab.
 *
 * chrome.alarms is exempt from that throttling -- Chrome guarantees it
 * fires on schedule (down to its 1-minute minimum granularity) even if
 * the tab is hidden and even if this service worker itself was asleep.
 * So this worker's only job is: wake up every minute, find any open
 * BuyLeads tab(s), and tell the content script "scan right now,"
 * independent of whatever throttled state that tab's own timers are in.
 *
 * This is a SUPPLEMENT to, not a replacement for, the content script's
 * own MutationObserver (instant, event-driven, not timer-based) and its
 * own setInterval (still useful while the tab is focused/visible).
 *
 * LIMITATION THIS CANNOT FIX: if the BuyLeads tab itself is closed, or
 * the whole Chrome process is closed/suspended (e.g. laptop fully
 * asleep), nothing runs -- there is no way for an extension to act when
 * its browser isn't running. Keeping Chrome open (even minimized) and
 * the BuyLeads tab open is still required.
 */

const ALARM_NAME = "indiamart-scan-tick";
const ALARM_PERIOD_MINUTES = 1; // 1 minute is the minimum chrome.alarms allows

function ensureAlarm() {
  chrome.alarms.get(ALARM_NAME, (existing) => {
    if (!existing) {
      chrome.alarms.create(ALARM_NAME, { periodInMinutes: ALARM_PERIOD_MINUTES });
    }
  });
}

chrome.runtime.onInstalled.addListener(ensureAlarm);
chrome.runtime.onStartup.addListener(ensureAlarm);
// Belt-and-suspenders: also check right away when the worker first loads,
// since onInstalled/onStartup don't fire on every service-worker wakeup.
ensureAlarm();

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  pingAllLeadTabs();
});

async function pingAllLeadTabs() {
  try {
    const tabs = await chrome.tabs.query({ url: "https://seller.indiamart.com/bltxn/*" });
    for (const tab of tabs) {
      if (typeof tab.id !== "number") continue;
      chrome.tabs.sendMessage(tab.id, { type: "FORCE_SCAN", source: "alarm" }, () => {
        // No listener yet (page still loading) is expected sometimes --
        // swallow it instead of throwing an unhandled error.
        void chrome.runtime.lastError;
      });
    }
  } catch (e) {
    console.log("[IndiaMART Auto-Click] background tick error:", e.message);
  }
}
