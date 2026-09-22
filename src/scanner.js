import {
  MAX_CLICKS_PER_SCAN,
  MUTATION_DEBOUNCE_MS,
} from "./constants.js";
import { matchCountry, matchMedicine } from "./filters.js";
import { logEvent } from "./logger.js";
import { setupPopupAutoDismiss } from "./modalCloser.js";
import {
  cardHasEmailIcon,
  cardHasPhoneIcon,
  getProductTitle,
} from "./parser.js";
import {
  CONTACT_BUTTON_SELECTOR,
  LEAD_CARD_ID_SELECTOR,
  findContactButtons,
  getCardForButton,
} from "./selectors.js";
import { getSettings } from "./storage.js";

// Per-card console output is useful when debugging filters but costs time on
// every scan (5s timer + every mutation). Flip to true only while debugging.
const DEBUG_CONSOLE = false;

// A scan can take long enough for IndiaMART to insert more cards while it is
// running.  Never discard those triggers: keep one coalesced follow-up pass
// queued and run it before the scanner becomes idle again.
let scanLoopPromise = null;
const pendingScanReasons = new Set();
let mutationSettleTimer = null;

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
  const settings = await getSettings(); // in-memory after the first call

  // Status bookkeeping for the popup. Fire-and-forget: nothing here may
  // delay the click.
  const status = { lastScanAt: Date.now(), lastScanReason: settings.botEnabled === false ? "paused" : reason };
  chrome.storage.local.set(status).catch(() => {});

  if (settings.botEnabled === false) return;

  const buttons = findContactButtons();
  logEvent("Scanned page [" + reason + "]: found " + buttons.length + " lead card(s).");

  // Phase 1 collects matches; phase 2 fires them all together.
  const queue = [];

  for (const button of buttons) {
    const card = getCardForButton(button);
    if (!card) {
      logEvent("Skipped a Contact Buyer button outside a recognized lead card.");
      continue;
    }

    const titleText = getProductTitle(card).toLowerCase();
    const countryText = getLeadCountryText(card);

    // Cheapest checks first; skip the rest for cards that can't match.
    const { matchedKeyword, medicineMatch } = matchMedicine(settings, titleText);
    const { matchedCountry, countryMatch } = matchCountry(settings, countryText);
    if (!DEBUG_CONSOLE && !(medicineMatch && countryMatch)) continue;

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

    if (DEBUG_CONSOLE) {
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
        if (settings.requirePhone && settings.requireEmail) reasons.push("No phone or email available");
        else if (settings.requirePhone) reasons.push("Phone number unavailable");
        else if (settings.requireEmail) reasons.push("Email ID unavailable");
      }
      console.log("==================================");
      console.log("TITLE:", titleText);
      console.log("KEYWORDS:", settings.medicineKeywords);
      console.log("MATCHED KEYWORD:", matchedKeyword);
      console.log("COUNTRY TEXT:", countryText);
      console.log("Keyword:", medicineMatch ? "✅" : "❌");
      console.log("Country:", countryMatch ? "✅" : "❌");
      console.log("Phone:", settings.requirePhone ? "toggle ON" : "toggle OFF", "| Card has phone:", hasPhone ? "✅" : "❌");
      console.log("Email:", settings.requireEmail ? "toggle ON" : "toggle OFF", "| Card has email:", hasEmail ? "✅" : "❌");
      console.log("Contact requirement:", contactOk ? "✅" : "❌");
      console.log("Will click:", willClick ? "✅ YES" : wouldClick && settings.testMode ? "TEST MODE - would click" : "❌ NO");
      console.log("Reason:", reasons.length === 0 ? "All filters matched" : reasons.join("; "));
      console.log("==================================");
    }

    if (!wouldClick) continue;

    const why = "(matched keyword: \"" + (matchedKeyword || "any") + "\", country: \"" + (matchedCountry || "any") + "\")";
    const snippet = (card.textContent || "").trim().slice(0, 150);

    if (settings.testMode) {
      logEvent("[TEST MODE] Would have clicked " + why + ": \"" + snippet + "\"");
      continue;
    }

    queue.push({ button, why, snippet, title: titleText, country: countryText });

    // Cap per scan. Matches beyond the cap are NOT marked as clicked, so the
    // next scan (settle pass or 5s timer) picks them up.
    if (queue.length >= MAX_CLICKS_PER_SCAN) break;
  }

  if (queue.length === 0) return;

  // Phase 2: fire every queued click back to back in one tight loop. Nothing
  // else runs between them -- no filtering, no bookkeeping, no logging, no
  // awaits -- so all clicks land in the same JS task, before the browser can
  // render or run any other work. (A page's JS is single-threaded, so this is
  // as simultaneous as a click can get; IndiaMART's own handlers then run
  // and their network requests overlap.)
  for (const item of queue) {
    try {
      item.button.click();
      item.ok = true;
    } catch (e) {
      item.error = e;
    }
  }

  // Logging only after every click has been sent. No click history is kept:
  // a clicked card leaves the page, so the next scan simply won't see it.
  for (const item of queue) {
    if (item.ok) {
      console.log("[IndiaMART Auto-Click] CLICKED matching lead:", {
        product: item.title,
        country: item.country,
        match: item.why,
      });
      logEvent("CLICKED matching lead " + item.why + ": \"" + item.snippet + "\"");
    } else {
      logEvent("ERROR clicking lead: " + item.error.message);
    }
  }
  if (queue.length >= MAX_CLICKS_PER_SCAN) {
    logEvent("Per-scan click limit (" + MAX_CLICKS_PER_SCAN + ") reached [" + reason + "]; further matches wait for the next scan.");
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
