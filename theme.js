// HireTrackr — theme.js
// Loaded in <head>, before the stylesheet, so the saved appearance is applied
// before the page first paints (no flash of the wrong theme).
//
// The choice itself lives in settings.theme (chrome.storage). localStorage
// keeps a copy only because it can be read synchronously, right here.

function applyTheme(theme) {
  const value = theme === 'light' || theme === 'dark' ? theme : 'system';
  document.documentElement.dataset.theme = value;
  try { localStorage.setItem('theme', value); } catch (e) { /* storage blocked: system theme is used */ }
}

try { applyTheme(localStorage.getItem('theme')); } catch (e) { applyTheme('system'); }
