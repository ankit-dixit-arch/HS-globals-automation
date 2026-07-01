export async function logEvent(message) {
  console.log("[IndiaMART Auto-Click] " + message);
  const { eventLog = [] } = await chrome.storage.local.get(["eventLog"]);
  eventLog.push(new Date().toLocaleString() + " - " + message);
  // keep last 200 entries only
  await chrome.storage.local.set({ eventLog: eventLog.slice(-200) });
}
