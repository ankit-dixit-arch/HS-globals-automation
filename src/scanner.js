import {
  MAX_CLICK_DELAY_MS,
  MIN_CLICK_DELAY_MS,
  MUTATION_DEBOUNCE_MS,
} from "./constants.js";
import { matchCountry, matchMedicine } from "./filters.js";
import { logEvent } from "./logger.js";
import { setupPopupAutoDismiss } from "./modalCloser.js";
import {
  cardHasEmailIcon,
  cardHasPhoneIcon,
  getCardFingerprint,
  getProductTitle,
} from "./parser.js";
import {
  CONTACT_BUTTON_SELECTOR,
  LEAD_CARD_ID_SELECTOR,
  findContactButtons,
  getCardForButton,
} from "./selectors.js";
import { getSettings } from "./storage.js";
import { sleep } from "./utils.js";

// A scan can take long enough for IndiaMART to insert more cards while it is
// running.  Never discard those triggers: keep one coalesced follow-up pass
// queued and run it before the scanner becomes idle again.
let scanLoopPromise = null;
const pendingScanReasons = new Set();
let mutationSettleTimer = null;
const clickedFingerprintsThisPage = new Set();

if (!window.__indiaMartModalCloserStarted) {
  window.__indiaMartModalCloserStarted = true;
  setupPopupAutoDismiss(logEvent);
}

function getLeadCountryText(card) {
  // Current cards keep the location in the same small row as the country
  // flag. This is deliberately DOM-based: a full-card text fallback could
  // make a lead match because a different country appears elsewhere in it.
  const flag = card.querySelector('img[src*="country-flags/"]');
  const locationRow = flag?.closest(".SLC_dflx");
  const countryLabel = locationRow?.querySelector("strong");
  if (countryLabel) {
    return Array.from(countryLabel.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent)
      .join(" ")
      .trim();
  }

  // A narrowly scoped fallback for the older card layout. Do not return all
  // card text when the label is absent; an unknown country must not pass a
  // configured country filter.
  const labelWithTooltip = Array.from(card.querySelectorAll("strong")).find((el) =>
    /click here to view buyleads from/i.test(el.textContent || "")
  );
  return labelWithTooltip
    ? Array.from(labelWithTooltip.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent)
        .join(" ")
        .trim()
    : "";
}

export function scanAndClick(reason = "interval") {
  pendingScanReasons.add(reason);

  if (!scanLoopPromise) {
    scanLoopPromise = drainPendingScans().finally(() => {
      scanLoopPromise = null;
      // A trigger can arrive while the loop is settling. Start a new loop
      // instead of leaving that work for the periodic safety-net scan.
      if (pendingScanReasons.size > 0) scanAndClick("queued");
    });
  }

  return scanLoopPromise;
}

function takeNextScanReason() {
  // Keep the most useful reason in the activity log when several triggers
  // arrive together. A lead insertion takes priority over timer noise.
  const priority = ["mutation", "mutation-settled", "visibility", "forced", "alarm", "initial", "interval", "queued"];
  const reason = priority.find((candidate) => pendingScanReasons.has(candidate)) || "queued";
  pendingScanReasons.clear();
  return reason;
}

async function drainPendingScans() {
  while (pendingScanReasons.size > 0) {
    const reason = takeNextScanReason();
    try {
      await scanPageAndClick(reason);
    } catch (e) {
      // An individual pass must not strand leads that arrived while it ran.
      console.error("[IndiaMART Auto-Click] scan failed:", e);
      try {
        await logEvent("ERROR during scan: " + (e?.message || String(e)));
      } catch (_) {
        // Logging must not stop the queued scanner.
      }
    }
  }
}

async function scanPageAndClick(reason) {
  const settings = await getSettings();

    if (settings.botEnabled === false) {
      await chrome.storage.local.set({ lastScanAt: Date.now(), lastScanReason: "paused" });
      return;
    }

    // const clicksToday = await getClicksToday();

    await chrome.storage.local.set({ lastScanAt: Date.now(), lastScanReason: reason });

    // if (clicksToday >= settings.maxClicksPerDay) {
    //   await logEvent("Daily cap reached (" + clicksToday + "/" + settings.maxClicksPerDay + "). Skipping scan. [" + reason + "]");
    //   return;
    // }

    const buttons = findContactButtons();
    await logEvent("Scanned page [" + reason + "]: found " + buttons.length + " lead card(s).");

    // Keep this page-session set across queued passes so a card that remains
    // visible while IndiaMART processes the click is never clicked twice.
    // Do not seed it from storage: BLCard ids are reused after page reloads.
    const clickedSet = clickedFingerprintsThisPage;

    for (const button of buttons) {
      // const currentClicks = await getClicksToday();
      // if (currentClicks >= settings.maxClicksPerDay) {
      //   await logEvent("Reached daily cap mid-scan. Stopping.");
      //   break;
      // }

      const card = getCardForButton(button);
      if (!card) {
        await logEvent("Skipped a Contact Buyer button outside a recognized lead card.");
        continue;
      }
      const titleText = getProductTitle(card).toLowerCase();
      const countryText = getLeadCountryText(card);
      const snippet = (card.textContent || "").trim().slice(0, 150);
      const fingerprint = getCardFingerprint(card);

      if (clickedSet.has(fingerprint)) continue;

      const { matchedKeyword, medicineMatch } = matchMedicine(settings, titleText);
      const { matchedCountry, countryMatch } = matchCountry(settings, countryText);

      const hasPhone = cardHasPhoneIcon(card);
      const hasEmail = cardHasEmailIcon(card);

      let contactOk = true;
      if (settings.requirePhone && settings.requireEmail) {
        contactOk = hasPhone || hasEmail;
      } else if (settings.requirePhone) {
        contactOk = hasPhone;
      } else if (settings.requireEmail) {
        contactOk = hasEmail;
      }

      const wouldClick = medicineMatch && countryMatch && contactOk;
      const willClick = wouldClick && !settings.testMode;

      const reasons = [];
      if (!medicineMatch) {
        reasons.push(
          settings.medicineKeywords.length === 0
            ? "No medicine keywords configured"
            : "No complete keyword or phrase matched"
        );
      }
      if (!countryMatch) reasons.push("No country matched");

      if (!contactOk) {
        if (settings.requirePhone && settings.requireEmail) {
          reasons.push("No phone or email available");
        } else if (settings.requirePhone) {
          reasons.push("Phone number unavailable");
        } else if (settings.requireEmail) {
          reasons.push("Email ID unavailable");
        }
      }

      console.log("==================================");
      console.log("TITLE:", titleText);
      console.log("KEYWORDS:", settings.medicineKeywords);
      console.log("MATCHED KEYWORD:", matchedKeyword);
      console.log("COUNTRY TEXT:", countryText);
      console.log("Keyword:", medicineMatch ? "✅" : "❌");
      console.log("Country:", countryMatch ? "✅" : "❌");
      console.log(
        "Phone:",
        settings.requirePhone ? "toggle ON" : "toggle OFF",
        "| Card has phone:",
        hasPhone ? "✅" : "❌"
      );
      console.log(
        "Email:",
        settings.requireEmail ? "toggle ON" : "toggle OFF",
        "| Card has email:",
        hasEmail ? "✅" : "❌"
      );
      console.log("Contact requirement:", contactOk ? "✅" : "❌");

      console.log(
        "Will click:",
        willClick ? "✅ YES" : wouldClick && settings.testMode ? "TEST MODE - would click" : "❌ NO"
      );

      console.log("Reason:", reasons.length === 0 ? "All filters matched" : reasons.join("; "));
      console.log("==================================");

      if (medicineMatch && countryMatch && contactOk) {
        const why = "(matched keyword: \"" + (matchedKeyword || "any") + "\", country: \"" + (matchedCountry || "any") + "\")";

        if (settings.testMode) {
          await logEvent("[TEST MODE] Would have clicked " + why + ": \"" + snippet + "\"");
          continue;
        }

        try {
          button.click();
          // await incrementClicksToday();
           clickedSet.add(fingerprint);
          // await chrome.storage.local.set({ clickedFingerprints: Array.from(clickedSet) });
          await logEvent("CLICKED matching lead " + why + ": \"" + snippet + "\"");
        } catch (e) {
          await logEvent("ERROR clicking lead: " + e.message);
        }

        const delay = MIN_CLICK_DELAY_MS + Math.random() * (MAX_CLICK_DELAY_MS - MIN_CLICK_DELAY_MS);
        await sleep(delay);
      }
    }
}

export function mutationLooksRelevant(mutations) {
  for (const m of mutations) {
    for (const node of m.addedNodes) {
      if (node.nodeType !== 1) continue;
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
  // Start work immediately. The old code waited for a debounce timer and
  // then silently lost the request when another scan was already active.
  scanAndClick("mutation");

  // One inexpensive settled pass catches fields that IndiaMART fills just
  // after inserting a card. Do not reset this timer for every mutation:
  // a busy burst must have a bounded follow-up, not an endlessly postponed
  // debounce.
  if (mutationSettleTimer) return;
  mutationSettleTimer = setTimeout(() => {
    mutationSettleTimer = null;
    scanAndClick("mutation-settled");
  }, MUTATION_DEBOUNCE_MS);
}
