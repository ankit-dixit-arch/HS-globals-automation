import { PRODUCT_TITLE_SELECTOR } from "./selectors.js";
import { simpleHash } from "./utils.js";

export function getProductTitle(cardEl) {
  // The product/medicine name lives in its own span, confirmed from real
  // markup (BLCard1 "25mg Proviron Tablet", BLCard2 "0.05% Tretiheal
  // Tretinoin Cream, 20 Gm" both used this exact class string). Matching
  // against ONLY this text -- instead of the whole card -- avoids false
  // positives from unrelated fields that share the card's textContent,
  // e.g. the buyer's "Buys: X, Y, Z" purchase-history line or the
  // "Buyer also viewed" suggested-product block, which can contain drug
  // names that have nothing to do with this particular lead.
  const titleEl = cardEl.querySelector(PRODUCT_TITLE_SELECTOR);
  if (titleEl) return (titleEl.textContent || "").trim();
  // Fallback if the markup changes and this class disappears: better to
  // fall back to whole-card text (old behavior) than to silently match
  // nothing.
  return cardEl.textContent || "";
}

export function getCardFingerprint(cardEl) {
  // Prefer IndiaMART's own card id (e.g. id="BLCard13") -- confirmed via
  // real markup inspection. This is exact and stable, unlike a text hash
  // which could theoretically collide between two different leads with
  // very similar opening text.
  if (cardEl.id && cardEl.id.startsWith("BLCard")) {
    return cardEl.id;
  }
  // Fallback: hash of the card's text if no id is found (e.g. markup changes)
  const snippet = (cardEl.textContent || "").trim().slice(0, 150);
  return simpleHash(snippet);
}

export function cardHasPhoneIcon(cardEl) {
  // Confirmed from real IndiaMART markup: when a phone number is
  // available, the lead card contains a tooltip element with this exact
  // text: <p class="tooltip_vfr">Mobile Number Available</p>
  // Checking for the phrase directly is more reliable than guessing at
  // aria-label/title attributes, since this text is always present
  // (even if visually hidden as a tooltip) when a phone IS available.
  const text = (cardEl.textContent || "").toLowerCase();
  return text.includes("mobile number available");
}
