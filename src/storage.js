import { DEFAULT_SETTINGS } from "./constants.js";

export function getTodayKey() {
  const d = new Date();
  return "clicks_" + d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
}

// Settings are cached in memory so a scan never has to wait on a
// chrome.storage round trip before it can click. The cache is kept in sync
// synchronously via storage.onChanged, so popup changes still apply instantly.
let cachedSettings = null;

async function loadSettings() {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
  cachedSettings = { ...DEFAULT_SETTINGS, ...stored };
  return cachedSettings;
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !cachedSettings) return;
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (key in changes) {
      const next = changes[key].newValue;
      cachedSettings[key] = next === undefined ? DEFAULT_SETTINGS[key] : next;
    }
  }
});

export async function getSettings() {
  return cachedSettings || loadSettings();
}

export async function getClicksToday() {
  const key = getTodayKey();
  const result = await chrome.storage.local.get([key]);
  return result[key] || 0;
}

export async function incrementClicksToday() {
  const key = getTodayKey();
  const current = await getClicksToday();
  await chrome.storage.local.set({ [key]: current + 1 });
}
