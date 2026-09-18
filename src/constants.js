export const ANCESTOR_LEVELS = 2; // CONFIRMED via real IndiaMART markup inspection:
// button -> parent (div.SLC_dflx.SLC_.pr) -> parent (div.BuyLdC_cont#BLCard...)
// That outer div.BuyLdC_cont is the actual whole lead card.
export const SCAN_INTERVAL_MS = 5000; // periodic safety-net re-scan while visible
export const MUTATION_DEBOUNCE_MS = 750; // one bounded follow-up after IndiaMART finishes populating a new card
export const MIN_CLICK_DELAY_MS = 0; // no delay between detecting a match and clicking
export const MAX_CLICK_DELAY_MS = 0;

export const DEFAULT_SETTINGS = {
  medicineKeywords: [],
  targetCountries: [],
  requirePhone: true,
  requireEmail: false,
  maxClicksPerDay: 7,
  // clickedFingerprints: [],
  testMode: false,
  botEnabled: true,
};
