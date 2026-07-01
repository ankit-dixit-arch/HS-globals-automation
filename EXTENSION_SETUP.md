# IndiaMART Auto-Click Extension - Setup Guide

-------------------------------------------------------------------------------
## What this is

A Chrome extension version of the Contact Buyer auto-click bot. Instead of
a separate automated browser (Selenium), this runs as part of YOUR normal
Chrome session -- it only works while you have a BuyLeads tab open in your
regular browser.

-------------------------------------------------------------------------------
-------------------------------------------------------------------------------
## Updating from the previous version?

This version adds a `background.js` service worker (for the alarm-based
backstop) and a MutationObserver in `content.js` (for instant detection).
If you already have the old version loaded:
1. Replace the whole folder's contents with this version's files (keep
   the same folder path Chrome already points at, or re-point it)
2. Go to chrome://extensions and click the refresh icon on this extension
3. Reload your open BuyLeads tab

-------------------------------------------------------------------------------
## STEP 1: Load the extension (Developer Mode)

1. Unzip the folder you downloaded somewhere permanent (don't delete it
   after loading -- Chrome reads the files live from that folder)
2. Open Chrome, go to: chrome://extensions
3. Toggle "Developer mode" ON (top-right corner)
4. Click "Load unpacked"
5. Select the unzipped "indiamart_extension" folder
6. The extension should now appear in your extensions list and in the
   toolbar (puzzle-piece icon -> pin it for easy access)

-------------------------------------------------------------------------------
## STEP 2: Configure your filters

You can either set one filter directly, or save multiple named profiles
and switch between them:

**Saving a profile:**
1. Click the extension icon
2. Fill in medicine keywords, countries, phone requirement, max clicks
3. Type a name in the "Profile name" box (e.g. "Mounjaro - Germany")
4. Click "Save as New Profile"

**Switching to a different saved filter:**
- Just pick it from the "Saved Filter Profiles" dropdown -- it loads
  those values into the form AND makes it the active filter immediately
  (no extra "Save"/"Apply" click needed when switching).

**Editing a saved profile's values:**
- Select it from the dropdown, change the fields, click "Update Selected"
  (this overwrites that profile) -- or click "Apply These Settings Now"
  which both applies them live AND updates the currently-selected profile.

**Deleting a profile:**
- Select it, click "Delete Selected Profile"

**One-off filter without saving a profile:**
- Just fill in the fields and click "Apply These Settings Now" without
  selecting/naming a profile -- it becomes the active filter but isn't
  saved as a reusable named profile.

-------------------------------------------------------------------------------
## STEP 3: Use it

1. Log into seller.indiamart.com normally, like you always do
2. Navigate to your BuyLeads (Recent) page
   (https://seller.indiamart.com/bltxn/?pref=recent)
3. The extension now scans in three overlapping ways, so leads get caught
   close to instantly and the bot keeps working even if you switch tabs
   or minimize the window:
   - A MutationObserver watches the page itself and reacts the moment a
     new lead card is inserted into the DOM -- this is event-driven, not
     a timer, so it isn't slowed down by the tab being hidden.
   - A 20-second timer re-scans everything currently on screen as a
     safety net (this one does slow down to roughly once a minute once
     the tab is hidden -- a Chrome limitation, not something an
     extension can override).
   - A background "alarm" (separate from the page itself) pings the tab
     about once a minute no matter what, as a backstop for the above.
4. Click the extension icon anytime to see:
   - Today's click count vs your daily cap
   - "Last scan" -- how long ago the bot last actually scanned the page,
     and why (instant detection, timer, background tick, etc.) -- this
     is the quickest way to confirm it's still alive while minimized
   - A live log of what it's finding and clicking

-------------------------------------------------------------------------------
## IMPORTANT LIMITATIONS (read this)

- Only works while that BuyLeads tab is open in a running Chrome window.
  Close the tab, close Chrome, or let the computer fully sleep, and it
  stops completely -- no extension can act while its browser isn't
  running. Minimizing the window or switching tabs is fine; closing
  Chrome is not.
- Chrome can sometimes "discard" (unload) a tab that's been backgrounded
  for a long time to save memory, especially under the Memory Saver
  setting. A discarded tab has to reload before scanning resumes. If you
  rely on long unattended stretches, consider pinning the BuyLeads tab
  and turning off Memory Saver for that site (chrome://settings/performance).
- The MutationObserver only reacts to NEW leads IndiaMART inserts into
  the page on its own (auto-refresh / infinite scroll). It still won't
  fetch brand-new leads that only appear after a manual page reload --
  if leads stop showing up entirely, refresh the tab.

-------------------------------------------------------------------------------
## SELECTOR TROUBLESHOOTING (same caveat as the Python version)

The script grabs each lead's surrounding "card" by walking 4 parent
elements up from each "Contact Buyer Now" button (see ANCESTOR_LEVELS at
the top of content.js). If matches aren't triggering when they obviously
should:

1. Right-click a "Contact Buyer Now" button on the real page -> Inspect
2. In DevTools, click up through parent <div> elements until the
   highlighted area covers the WHOLE lead card (product name down to the
   button)
3. Count how many parents that took, update ANCESTOR_LEVELS in content.js
   to match
4. Go to chrome://extensions -> click the refresh icon on this extension
   to reload your changes, then reload the BuyLeads page

For the phone-icon detection, same idea: Inspect the phone/call icon on a
lead that clearly has a number, check its actual aria-label/title
attribute, and update the matching logic inside cardHasPhoneIcon() in
content.js if it differs from "mobile"/"call".

If you'd rather just send me a DevTools screenshot of the button and the
phone icon's HTML, I can write the exact selectors for you directly.

-------------------------------------------------------------------------------
## Risk reminder

Same as before: this automates clicks on IndiaMART's real site. The daily
cap and pauses between clicks reduce (not eliminate) the chance of this
looking automated to their systems.
