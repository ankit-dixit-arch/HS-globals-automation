import { DEFAULT_SETTINGS } from "./constants.js";

export function getTodayKey() {
  const d = new Date();
  return "clicks_" + d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
}

export async function getSettings() {
  const defaults = DEFAULT_SETTINGS;
  const stored = await chrome.storage.local.get(Object.keys(defaults));
  return { ...defaults, ...stored };
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
