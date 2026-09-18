/**
 * NOTE ON SELECTORS: the logic below walks up from each "Contact Buyer
 * Now" button to find the enclosing lead card. IndiaMART's exact page
 * markup can change, so EXTENSION_SETUP.md explains how to inspect it.
 */

export const CONTACT_BUTTON_SELECTOR = "button";
export const PRODUCT_TITLE_SELECTOR = ".BuyLdC_m6";
export const LEAD_CARD_ID_SELECTOR = '[id^="BLCard"]';

export function findContactButtons() {
  const buttons = Array.from(document.querySelectorAll(CONTACT_BUTTON_SELECTOR));
  return buttons.filter((b) => b.textContent.trim().includes("Contact Buyer Now"));
}

export function getCardForButton(button) {
  // IndiaMART has changed the number of wrapper elements around the
  // button before. Find the card by its stable id instead of assuming a
  // fixed parent depth.
  return button.closest(LEAD_CARD_ID_SELECTOR);
}
