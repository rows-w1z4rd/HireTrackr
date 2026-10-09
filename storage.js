// ── Shared storage (side panel + pipeline) ────────────────────────
// Load before sidepanel.js / pipeline.js.
//
// Every page keeps its own in-memory copy of the lists, so a page must never
// write that copy back as-is: it may be older than what another page saved.
// store.update() re-reads the stored value, applies one change to it, and
// writes the result.
//
// Values are lists by default; pass a fallback of {} for the object-shaped
// ones (profile, settings).

const store = (() => {
  // Updates run one after another so two changes on the same page
  // can't read the same starting list.
  let queue = Promise.resolve();

  function read(key, fallback = []) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(key, (data) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(data[key] || fallback);
        }
      });
    });
  }

  function write(key, val) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ [key]: val }, () => {
        if (chrome.runtime.lastError) {
          if (api.onWriteError) api.onWriteError(chrome.runtime.lastError.message);
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
  }

  const api = {
    // Set by a page that wants to show something when a save fails.
    onWriteError: null,

    get: read,

    // change(value) must return the new value (or the same one for "no change").
    // Resolves to the value that is now stored.
    update(key, change, fallback = []) {
      const run = queue.then(async () => {
        const current = await read(key, fallback);
        const next = change(current);
        if (next !== current) await write(key, next);
        return next;
      });
      queue = run.catch(() => {});
      return run;
    },

    // Calls fn(key, newValue) whenever any page changes a stored value.
    onChange(fn) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        for (const [key, change] of Object.entries(changes)) fn(key, change.newValue);
      });
    },
  };

  return api;
})();
