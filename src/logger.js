// Logging must never sit on the click path. Entries are buffered in memory
// and written in batches; logEvent() returns immediately, so callers can
// `await` it (or not) without waiting on chrome.storage.
let pending = [];
let flushing = false;

async function flush() {
  flushing = true;
  try {
    while (pending.length > 0) {
      const batch = pending;
      pending = [];
      const { eventLog = [] } = await chrome.storage.local.get(["eventLog"]);
      // keep last 200 entries only
      await chrome.storage.local.set({ eventLog: eventLog.concat(batch).slice(-200) });
    }
  } catch (_) {
    // Logging failures must never affect scanning or clicking.
  } finally {
    flushing = false;
  }
}

export function logEvent(message) {
  pending.push(new Date().toLocaleString() + " - " + message);
  if (!flushing) flush();
  return Promise.resolve();
}
