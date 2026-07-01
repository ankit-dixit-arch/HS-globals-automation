import {
  MAX_CLICK_DELAY_MS,
  MIN_CLICK_DELAY_MS,
  MUTATION_DEBOUNCE_MS,
} from "./constants.js";
import { matchCountry, matchMedicine, phoneRequirementMatches } from "./filters.js";
import { logEvent } from "./logger.js";
import { getCardFingerprint, getProductTitle } from "./parser.js";
import {
  CONTACT_BUTTON_SELECTOR,
  LEAD_CARD_ID_SELECTOR,
  findContactButtons,
  getCardForButton,
} from "./selectors.js";
import { getClicksToday, getSettings, incrementClicksToday } from "./storage.js";
import { sleep } from "./utils.js";

let isProcessing = false;
let mutationDebounceTimer = null;

export async function scanAndClick(reason = "interval") {
  if (isProcessing) return;
  isProcessing = true;

  try {
    const settings = await getSettings();

    if (settings.botEnabled === false) {
      // Master toggle is off (set from the popup) -- skip scanning and
      // clicking entirely until the user flips it back on. Still record
      // a heartbeat so the popup's "Last scan" line reflects reality.
      await chrome.storage.local.set({ lastScanAt: Date.now(), lastScanReason: "paused" });
      return;
    }

    const clicksToday = await getClicksToday();

    await chrome.storage.local.set({ lastScanAt: Date.now(), lastScanReason: reason });

    if (clicksToday >= settings.maxClicksPerDay) {
      await logEvent("Daily cap reached (" + clicksToday + "/" + settings.maxClicksPerDay + "). Skipping scan. [" + reason + "]");
      isProcessing = false;
      return;
    }

    const buttons = findContactButtons();
    await logEvent("Scanned page [" + reason + "]: found " + buttons.length + " lead card(s).");

    // const clickedSet = new Set(settings.clickedFingerprints);
     const clickedSet = new Set();
    for (const button of buttons) {
      const currentClicks = await getClicksToday();
      if (currentClicks >= settings.maxClicksPerDay) {
        await logEvent("Reached daily cap mid-scan. Stopping.");
        break;
      }

      const card = getCardForButton(button);
      const titleText = getProductTitle(card).toLowerCase();
      const fullText = (card.textContent || "").toLowerCase();
      const snippet = (card.textContent || "").trim().slice(0, 150);
      const fingerprint = getCardFingerprint(card);

      if (clickedSet.has(fingerprint)) continue;

      const { matchedKeyword, medicineMatch } = matchMedicine(settings, titleText);
      const { matchedCountry, countryMatch } = matchCountry(settings, fullText);
      const phoneOk = phoneRequirementMatches(settings, card);
      const reasons = [];
      if (!medicineMatch) {
        reasons.push(
          settings.medicineKeywords.length === 0
            ? "No medicine keywords configured"
            : "No complete keyword or phrase matched"
        );
      }
      if (!countryMatch) reasons.push("No country matched");
      if (!phoneOk) reasons.push("Phone number unavailable");

      console.log("==================================");
      console.log("TITLE:", titleText);
      console.log("KEYWORDS:", settings.medicineKeywords);
      console.log("MATCHED KEYWORD:", matchedKeyword);
      console.log("FULL TEXT:", fullText);
      console.log("Keyword:", medicineMatch ? "✅" : "❌");
      console.log("Country:", countryMatch ? "✅" : "❌");
      console.log("Phone:", phoneOk ? "✅" : "❌");
      console.log("Reason:", reasons.length === 0 ? "All filters matched" : reasons.join("; "));
      console.log("==================================");

      if (medicineMatch && countryMatch && phoneOk) {
        const why = "(matched keyword: \"" + (matchedKeyword || "any") + "\", country: \"" + (matchedCountry || "any") + "\")";
        if (settings.testMode) {
          // TEST MODE: log what WOULD have happened, but don't click,
          // don't spend a daily-cap slot, and don't mark it as handled
          // (so it shows up again next scan -- useful for repeated checks
          // while you're tuning your filters).
          await logEvent("[TEST MODE] Would have clicked " + why + ": \"" + snippet + "\"");
          continue;
        }

        try {
          button.click();
          await incrementClicksToday();
          clickedSet.add(fingerprint);
          await chrome.storage.local.set({ clickedFingerprints: Array.from(clickedSet) });
          await logEvent("CLICKED matching lead " + why + ": \"" + snippet + "\"");
        } catch (e) {
          await logEvent("ERROR clicking lead: " + e.message);
        }

        // Human-like pause between clicks
        const delay = MIN_CLICK_DELAY_MS + Math.random() * (MAX_CLICK_DELAY_MS - MIN_CLICK_DELAY_MS);
        await sleep(delay);
      }
    }
  } finally {
    isProcessing = false;
  }
}

export function mutationLooksRelevant(mutations) {
  for (const m of mutations) {
    for (const node of m.addedNodes) {
      if (node.nodeType !== 1) continue; // elements only
      if (node.id && node.id.startsWith("BLCard")) return true;
      if (typeof node.querySelector === "function") {
        if (node.querySelector(LEAD_CARD_ID_SELECTOR)) return true;
        const btns = node.querySelectorAll ? node.querySelectorAll(CONTACT_BUTTON_SELECTOR) : [];
        for (const b of btns) {
          if (b.textContent && b.textContent.includes("Contact Buyer Now")) return true;
        }
      }
    }
  }
  return false;
}

export function scheduleMutationScan() {
  clearTimeout(mutationDebounceTimer);
  // Debounce: IndiaMART may insert several cards in one burst (e.g. a
  // page of results loading at once) -- wait for things to settle so we
  // scan once instead of once per individual node insertion.
  mutationDebounceTimer = setTimeout(() => {
    scanAndClick("mutation");
  }, MUTATION_DEBOUNCE_MS);
}
