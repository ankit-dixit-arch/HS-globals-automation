/**
 * NOTE ON SELECTORS: the logic below walks up from each "Contact Buyer
 * Now" button to find the enclosing lead card. IndiaMART's exact page
 * markup can change, so EXTENSION_SETUP.md explains how to inspect it.
 */

import { ANCESTOR_LEVELS } from "./constants.js";

export const CONTACT_BUTTON_SELECTOR = "button";
export const PRODUCT_TITLE_SELECTOR = ".BuyLdC_m6";
export const LEAD_CARD_ID_SELECTOR = '[id^="BLCard"]';

export function findContactButtons() {
  const buttons = Array.from(document.querySelectorAll(CONTACT_BUTTON_SELECTOR));
  return buttons.filter((b) => b.textContent.trim().includes("Contact Buyer Now"));
}

export function getCardForButton(button) {
  let el = button;
  for (let i = 0; i < ANCESTOR_LEVELS; i++) {
    if (el.parentElement) el = el.parentElement;
  }
  return el;
}
