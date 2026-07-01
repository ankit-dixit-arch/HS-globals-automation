import { cardHasPhoneIcon } from "./parser.js";

export function normalizeForMatching(value) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function containsCompleteTerm(titleText, keyword) {
  const normalizedTitle = normalizeForMatching(titleText);
  const normalizedKeyword = normalizeForMatching(keyword);
  if (!normalizedKeyword) return false;

  return (" " + normalizedTitle + " ").includes(" " + normalizedKeyword + " ");
}

export function matchMedicine(settings, titleText) {
  // Medicine keywords match ONLY against the product title (not the
  // whole card), so a keyword sitting in the buyer's purchase
  // history or "buyer also viewed" suggestions can't trigger a
  // false match for an unrelated lead.
  const matchedKeyword = settings.medicineKeywords.find((kw) =>
    containsCompleteTerm(titleText, kw)
  );
  const medicineMatch = settings.medicineKeywords.length > 0 && !!matchedKeyword;
  return { matchedKeyword, medicineMatch };
}

export function matchCountry(settings, fullText) {
  // Country is still checked against the full card text -- it only
  // ever appears once, cleanly, so there's no equivalent false-match
  // risk there.
  const matchedCountry = settings.targetCountries.find((c) =>
    fullText.includes(c.toLowerCase())
  );
  const countryMatch = settings.targetCountries.length === 0 || !!matchedCountry;
  return { matchedCountry, countryMatch };
}

export function phoneRequirementMatches(settings, card) {
  return settings.requirePhone ? cardHasPhoneIcon(card) : true;
}
