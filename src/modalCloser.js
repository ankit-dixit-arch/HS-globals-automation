const MODAL_SELECTOR = ".Bl_admin_modal-content";
const QUOTE_FORM_SELECTOR = ".bl_quote_form";

const BUTTON_SELECTORS = [
  ".ok_cstm_cls",
  "button#Yes.send_quo.ys_quo.w_1", // expired lead popup: Ok
];

const handledElements = new WeakSet();

function findModalButton(modalEl) {
  for (const selector of BUTTON_SELECTORS) {
    const button = modalEl.querySelector(selector);
    if (button) return button;
  }
  return null;
}

// Cached so closing a popup never waits on a chrome.storage round trip.
let botEnabledCache = null;

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.botEnabled) {
    botEnabledCache = changes.botEnabled.newValue !== false;
  }
});

async function botIsEnabled() {
  if (botEnabledCache !== null) return botEnabledCache;
  const { botEnabled } = await chrome.storage.local.get({ botEnabled: true });
  if (botEnabledCache === null) botEnabledCache = botEnabled !== false;
  return botEnabledCache;
}

async function closeModal(modalEl, logEvent) {
  if (!modalEl || handledElements.has(modalEl)) return false;
  if (!(await botIsEnabled())) return false;

  const button = findModalButton(modalEl);
  if (!button) return false;

  handledElements.add(modalEl);

  const text = (modalEl.textContent || "").trim().slice(0, 80);

  try {
  const buttonLabel = (
    button.textContent ||
    button.value ||
    button.getAttribute("aria-label") ||
    button.className ||
    "unnamed button"
  ).trim();

  button.click();

  console.log("IndiaMART modal closed:", {
    button: buttonLabel,
    popup: text,
  });

  if (logEvent) {
    Promise.resolve(
      logEvent(
        'Auto-clicked modal button "' + buttonLabel +
        '" | Popup: "' + text + '"'
      )
    ).catch(() => {});
  }

  return true;
} catch (e) {
  console.warn("IndiaMART modal close failed:", e);
  return false;
}
}

async function closeQuoteForm(formEl, logEvent) {
  if (!formEl || handledElements.has(formEl)) return false;
  if (!(await botIsEnabled())) return false;

  const closeBtn = formEl.querySelector("#cls_btn");
  if (!closeBtn) return false;

  handledElements.add(formEl);

  try {
    const buttonLabel = (
      closeBtn.textContent ||
      closeBtn.value ||
      closeBtn.getAttribute("aria-label") ||
      closeBtn.className ||
      "close button"
    ).trim();
    closeBtn.click();

      console.log("IndiaMART successful lead panel closed.");

      if (logEvent) {
        Promise.resolve(
          logEvent('Auto-closed successful lead panel using "' + buttonLabel + '".')
        ).catch(() => {});
      }

      return true;
  } catch (e) {
    console.warn("IndiaMART successful lead panel close failed:", e);
    return false;
  }
}

function closeAllOpenPanels(logEvent) {
  document.querySelectorAll(MODAL_SELECTOR).forEach((modal) => {
    closeModal(modal, logEvent);
  });

  document.querySelectorAll(QUOTE_FORM_SELECTOR).forEach((form) => {
    closeQuoteForm(form, logEvent);
  });
}

export function setupPopupAutoDismiss(logEvent) {
  closeAllOpenPanels(logEvent);

  const observer = new MutationObserver((mutations) => {
    // Only nodes being ADDED can be a new popup; removals and other churn
    // used to trigger two full-document queries each time.
    if (mutations.some((m) => m.addedNodes.length > 0)) {
      closeAllOpenPanels(logEvent);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  return observer;
}