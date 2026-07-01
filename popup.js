function getTodayKey() {
  const d = new Date();
  return `clicks_${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function readFormValues() {
  return {
    medicineKeywords: document
      .getElementById("keywords")
      .value.split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
    targetCountries: document
      .getElementById("countries")
      .value.split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
    requirePhone: document.getElementById("requirePhone").checked,
    testMode: document.getElementById("testMode").checked,
    maxClicksPerDay: parseInt(document.getElementById("maxClicks").value, 10) || 7,
  };
}

function writeFormValues(profile) {
  document.getElementById("keywords").value = (profile.medicineKeywords || []).join("\n");
  document.getElementById("countries").value = (profile.targetCountries || []).join("\n");
  document.getElementById("requirePhone").checked = !!profile.requirePhone;
  document.getElementById("testMode").checked = !!profile.testMode;
  document.getElementById("maxClicks").value = profile.maxClicksPerDay || 7;
}

async function getProfiles() {
  const { profiles = {} } = await chrome.storage.local.get(["profiles"]);
  return profiles;
}

async function saveProfiles(profiles) {
  await chrome.storage.local.set({ profiles });
}

async function getActiveProfileName() {
  const { activeProfileName = "" } = await chrome.storage.local.get(["activeProfileName"]);
  return activeProfileName;
}

async function refreshProfileDropdown(selectName) {
  const profiles = await getProfiles();
  const select = document.getElementById("profileSelect");
  select.innerHTML = "";

  const blank = document.createElement("option");
  blank.value = "";
  blank.textContent = "-- none selected --";
  select.appendChild(blank);

  Object.keys(profiles).forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  });

  if (selectName && profiles[selectName]) {
    select.value = selectName;
  }
}

async function applySettingsToActive(values) {
  await chrome.storage.local.set(values);
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

async function getBotEnabled() {
  const { botEnabled = true } = await chrome.storage.local.get(["botEnabled"]);
  return botEnabled;
}

async function refreshMasterToggle() {
  const enabled = await getBotEnabled();
  const btn = document.getElementById("masterToggle");
  if (enabled) {
    btn.textContent = "● Bot is ON -- click to Pause";
    btn.className = "toggle-btn on";
  } else {
    btn.textContent = "○ Bot is PAUSED -- click to Resume";
    btn.className = "toggle-btn off";
  }
}

document.getElementById("masterToggle").addEventListener("click", async () => {
  const enabled = await getBotEnabled();
  const next = !enabled;
  await chrome.storage.local.set({ botEnabled: next });
  await refreshMasterToggle();
  document.getElementById("status").textContent = next
    ? "Bot resumed -- scanning and clicking will continue."
    : "Bot paused -- no scans or clicks will happen until resumed.";
});

document.getElementById("profileSelect").addEventListener("change", async (e) => {
  const name = e.target.value;
  if (!name) return;
  const profiles = await getProfiles();
  const profile = profiles[name];
  if (!profile) return;

  writeFormValues(profile);
  document.getElementById("profileName").value = name;

  // Switching profiles immediately makes it the active one the bot uses
  await applySettingsToActive(profile);
  await chrome.storage.local.set({ activeProfileName: name });
  document.getElementById("status").textContent = `Switched to profile "${name}" -- now active.`;
  await refreshStatus();
});

document.getElementById("saveAsProfile").addEventListener("click", async () => {
  const name = document.getElementById("profileName").value.trim();
  if (!name) {
    alert("Type a profile name first (e.g. 'Mounjaro - Germany').");
    return;
  }
  const profiles = await getProfiles();
  if (profiles[name]) {
    if (!confirm(`A profile named "${name}" already exists. Overwrite it?`)) return;
  }
  profiles[name] = readFormValues();
  await saveProfiles(profiles);
  await refreshProfileDropdown(name);
  document.getElementById("status").textContent = `Saved profile "${name}".`;
});

document.getElementById("updateProfile").addEventListener("click", async () => {
  const select = document.getElementById("profileSelect");
  const name = select.value;
  if (!name) {
    alert("Select a profile from the dropdown first, or use 'Save as New Profile'.");
    return;
  }
  const profiles = await getProfiles();
  profiles[name] = readFormValues();
  await saveProfiles(profiles);
  document.getElementById("status").textContent = `Updated profile "${name}".`;
});

document.getElementById("deleteProfile").addEventListener("click", async () => {
  const select = document.getElementById("profileSelect");
  const name = select.value;
  if (!name) {
    alert("Select a profile to delete first.");
    return;
  }
  if (!confirm(`Delete profile "${name}"? This cannot be undone.`)) return;

  const profiles = await getProfiles();
  delete profiles[name];
  await saveProfiles(profiles);

  const activeName = await getActiveProfileName();
  if (activeName === name) {
    await chrome.storage.local.set({ activeProfileName: "" });
  }

  document.getElementById("profileName").value = "";
  await refreshProfileDropdown();
  document.getElementById("status").textContent = `Deleted profile "${name}".`;
});

document.getElementById("save").addEventListener("click", async () => {
  const values = readFormValues();
  await applySettingsToActive(values);

  // If a profile is currently selected, this also counts as updating it,
  // so flipping back to it later doesn't lose these tweaks unless you
  // explicitly wanted a separate one (use "Save as New Profile" for that).
  const select = document.getElementById("profileSelect");
  if (select.value) {
    const profiles = await getProfiles();
    profiles[select.value] = values;
    await saveProfiles(profiles);
  }

  document.getElementById("status").textContent = "Settings applied -- bot will use these now.";
  await refreshStatus();
});

document.getElementById("resetToday").addEventListener("click", async () => {
  const key = getTodayKey();
  await chrome.storage.local.set({ [key]: 0 });
  await refreshStatus();
});

async function refreshStatus() {
  const key = getTodayKey();
  const result = await chrome.storage.local.get([key, "maxClicksPerDay", "testMode"]);
  const clicksToday = result[key] || 0;
  const maxClicks = result.maxClicksPerDay || 7;
  const activeName = await getActiveProfileName();
  const activeLabel = activeName ? ` | Active profile: "${activeName}"` : "";
  const testLabel = result.testMode ? " | ⚠ TEST MODE ON (not clicking for real)" : "";
  document.getElementById("status").textContent =
    `Today: ${clicksToday} / ${maxClicks} clicks used.${activeLabel}${testLabel} Make sure a BuyLeads tab is open.`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function classifyLogLine(message) {
  if (/^\[TEST MODE\]/.test(message)) return "test";
  if (/^CLICKED/.test(message)) return "clicked";
  if (/^ERROR/i.test(message)) return "error";
  if (/Daily cap reached/i.test(message)) return "cap";
  if (/^Scanned page/i.test(message)) return "scan";
  if (/paused/i.test(message) || /MutationObserver attached/i.test(message)) return "paused";
  return "default";
}

function parseLogLine(line) {
  // Stored format is "${new Date().toLocaleString()} - ${message}"
  const sepIndex = line.indexOf(" - ");
  if (sepIndex === -1) return { time: "", message: line };
  return { time: line.slice(0, sepIndex), message: line.slice(sepIndex + 3) };
}

async function refreshLog() {
  const { eventLog = [] } = await chrome.storage.local.get(["eventLog"]);
  const panel = document.getElementById("log");

  // Don't yank the user's scroll position around on every 3s auto-refresh
  // unless they were already at the bottom (i.e. following live activity).
  const wasNearBottom = panel.scrollHeight - panel.scrollTop - panel.clientHeight < 20;

  const recent = eventLog.slice(-50);
  if (recent.length === 0) {
    panel.innerHTML = `<div class="log-empty">No activity yet -- open a BuyLeads tab to start.</div>`;
    return;
  }

  panel.innerHTML = recent
    .map((line) => {
      const { time, message } = parseLogLine(line);
      const type = classifyLogLine(message);
      // Drop the date portion (e.g. "6/30/2026,") since this popup is
      // always about "right now" -- the full timestamp is kept in the
      // downloaded log file instead.
      const timeShort = time.replace(/^\d{1,2}\/\d{1,2}\/\d{4},?\s*/, "");
      return `<div class="log-entry ${type}"><span class="log-time">${escapeHtml(timeShort)}</span><span class="log-msg">${escapeHtml(message)}</span></div>`;
    })
    .join("");

  if (wasNearBottom) {
    panel.scrollTop = panel.scrollHeight;
  }
}

document.getElementById("downloadLog").addEventListener("click", async () => {
  const { eventLog = [] } = await chrome.storage.local.get(["eventLog"]);
  if (eventLog.length === 0) {
    alert("No log entries to download yet.");
    return;
  }
  const text = eventLog.join("\n");
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const filename = `indiamart-autoclick-log-${stamp}.txt`;
  const dataUrl = "data:text/plain;charset=utf-8," + encodeURIComponent(text);

  if (chrome.downloads && chrome.downloads.download) {
    chrome.downloads.download({ url: dataUrl, filename, saveAs: true });
  } else {
    // Fallback if the downloads permission isn't available for some reason
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
});

document.getElementById("clearLog").addEventListener("click", async () => {
  if (!confirm("Clear the activity log? Download it first if you want to keep a copy -- this can't be undone.")) return;
  await chrome.storage.local.set({ eventLog: [] });
  await refreshLog();
});

async function refreshLiveStatus() {
  const liveStatusEl = document.getElementById("liveStatus");

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.url || !tab.url.includes("seller.indiamart.com/bltxn")) {
      liveStatusEl.className = "live-status inactive";
      liveStatusEl.innerHTML = `<span class="dot"></span><span class="badge">Inactive</span><span>open your BuyLeads page in this tab</span>`;
      return;
    }

    chrome.tabs.sendMessage(tab.id, { type: "PING" }, (response) => {
      if (chrome.runtime.lastError || !response || !response.alive) {
        liveStatusEl.className = "live-status inactive";
        liveStatusEl.innerHTML = `<span class="dot"></span><span class="badge">Inactive</span><span>try reloading the BuyLeads page</span>`;
      } else {
        liveStatusEl.className = "live-status active";
        liveStatusEl.innerHTML = `<span class="dot"></span><span class="badge">Active</span><span>scanning this BuyLeads tab</span>`;
      }
    });
  } catch (e) {
    liveStatusEl.className = "live-status inactive";
    liveStatusEl.innerHTML = `<span class="dot"></span><span class="badge">Inactive</span><span>couldn't check tab status</span>`;
  }
}

async function refreshLastScan() {
  const el = document.getElementById("lastScan");
  const { lastScanAt, lastScanReason } = await chrome.storage.local.get(["lastScanAt", "lastScanReason"]);
  if (!lastScanAt) {
    el.textContent = "Last scan: -- (no BuyLeads tab scanned yet)";
    return;
  }
  const secondsAgo = Math.max(0, Math.round((Date.now() - lastScanAt) / 1000));
  const label = secondsAgo < 60 ? `${secondsAgo}s ago` : `${Math.round(secondsAgo / 60)}m ago`;
  const reasonLabel = { initial: "page load", interval: "timer", mutation: "instant (new lead detected)", alarm: "background tick", visibility: "tab refocused", forced: "background tick", paused: "paused -- not actively scanning" }[lastScanReason] || lastScanReason || "";
  el.textContent = `Last scan: ${label}${reasonLabel ? ` (${reasonLabel})` : ""}`;
}

async function loadSettings() {
  const defaults = {
    medicineKeywords: [],
    targetCountries: [],
    requirePhone: true,
    testMode: false,
    maxClicksPerDay: 7,
  };
  const stored = await chrome.storage.local.get(Object.keys(defaults));
  const settings = { ...defaults, ...stored };
  writeFormValues(settings);

  const activeName = await getActiveProfileName();
  await refreshProfileDropdown(activeName);
  if (activeName) {
    document.getElementById("profileName").value = activeName;
  }

  await refreshStatus();
  await refreshLog();
  await refreshMasterToggle();
}

loadSettings();
refreshLiveStatus();
refreshLastScan();
setInterval(refreshLog, 3000);
setInterval(refreshStatus, 3000);
setInterval(refreshLiveStatus, 3000);
setInterval(refreshLastScan, 3000);
setInterval(refreshMasterToggle, 3000);
