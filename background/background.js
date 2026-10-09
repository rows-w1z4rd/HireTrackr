// HireTrackr — background.js

// The toolbar icon opens the side panel (default) or a popup, per the user's
// setting in Profile > Settings. Both show the same page.
async function applyOpenMode() {
  const { settings } = await chrome.storage.local.get('settings');
  const popup = settings?.openAs === 'popup';
  await chrome.action.setPopup({ popup: popup ? 'sidepanel/sidepanel.html?popup' : '' });
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: !popup });
}

chrome.runtime.onInstalled.addListener(() => applyOpenMode().catch(() => {}));
chrome.runtime.onStartup.addListener(() => applyOpenMode().catch(() => {}));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) applyOpenMode().catch(() => {});
});
