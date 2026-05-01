# HireTrack — Reforms
> Everything broken, missing, or dangerous right now.
> This is the pre-launch punch list. Nothing in here is optional.
> Version 1.0 | April 2026

---

## 0. Severity Guide

- 🔴 **Critical** — Breaks the extension or destroys user data. Fix before anything else.
- 🟠 **High** — Breaks visible UI or creates a bad first impression. Fix before publishing.
- 🟡 **Medium** — Functional gap that users will notice and complain about. Fix in Phase 1.
- 🟢 **Low** — Polish, optimization, or future-proofing. Fix when time allows.

---

## 1. Critical Bugs 🔴

### BUG-01 — CV Storage Will Destroy User Data

**Severity:** 🔴 Critical — Silent data loss
**File:** `popup/popup.js` → `handleCVUpload()`

**What's happening:**
The current code reads the uploaded CV file and converts it to a base64-encoded string, then stores that string inside `chrome.storage.local`:
```js
reader.readAsDataURL(file);  // converts file to base64 string
cvs.push({ data: ev.target.result });  // stores the whole thing
```
`chrome.storage.local` has a hard **10MB total limit** for everything the extension stores — jobs, CVs, templates, snippets, the entire state combined. A 1.5MB PDF becomes approximately 2.0–2.7MB in base64. Upload three CVs and you've consumed 6–8MB of the 10MB budget. The fourth CV upload silently fails — no error message, no warning, the save just does nothing. The user thinks it worked. The data is gone.

**The fix:**
Split CV storage. Keep only tiny metadata (name, filename, id, uploadedAt) in `chrome.storage.local`. Store the actual file blob in `IndexedDB`, which has no meaningful size limit.

```js
// Step 1: Create IndexedDB store (run once on extension startup)
function openCVDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('HireTrackCVs', 1);
    req.onupgradeneeded = e => {
      e.target.result.createObjectStore('files', { keyPath: 'id' });
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = reject;
  });
}

// Step 2: Modified handleCVUpload
async function handleCVUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const name = prompt('Label this CV:', file.name.replace(/\.[^.]+$/, ''));
  if (!name) return;

  const id = Date.now().toString();
  const blob = new Blob([await file.arrayBuffer()], { type: file.type });

  // Save file blob to IndexedDB
  const db = await openCVDB();
  await new Promise((res, rej) => {
    const tx = db.transaction('files', 'readwrite');
    tx.objectStore('files').put({ id, blob });
    tx.oncomplete = res;
    tx.onerror = rej;
  });

  // Save only metadata to chrome.storage
  cvs.push({ id, name, filename: file.name, uploadedAt: new Date().toISOString() });
  await store.set('cvs', cvs);
  renderCVs();
  e.target.value = '';
}
```

**Also needed:** A `getCVBlob(id)` function for CV preview, and a migration script that runs once to move any existing base64 CVs from `chrome.storage.local` to IndexedDB and replaces them with metadata-only entries.

---

### BUG-02 — No Error Handling on Storage Calls

**Severity:** 🔴 Critical — Silent failures in incognito and at quota
**Files:** `popup/popup.js`, `pipeline/pipeline.js` — every `chrome.storage` call

**What's happening:**
Every `chrome.storage.local.set()` and `chrome.storage.local.get()` call in the codebase has no error handling. If storage fails — which happens automatically in incognito mode and whenever the 10MB quota is hit — the call fails silently. The user clicks "Save job" and nothing happens. No feedback, no explanation.

Chrome's storage API returns errors via the `chrome.runtime.lastError` property, which is reset after each callback. If you don't check it, errors are invisible.

**The fix:**
Wrap every storage operation. The simplest approach is to centralise it in the `store` object already used in `popup.js`:

```js
// Replace the existing store object with this
store = {
  get: (key) => new Promise((resolve, reject) => {
    chrome.storage.local.get(key, (data) => {
      if (chrome.runtime.lastError) {
        console.error('Storage get failed:', chrome.runtime.lastError.message);
        reject(chrome.runtime.lastError);
      } else {
        resolve(data[key] || []);
      }
    });
  }),
  set: (key, val) => new Promise((resolve, reject) => {
    chrome.storage.local.set({ [key]: val }, () => {
      if (chrome.runtime.lastError) {
        console.error('Storage set failed:', chrome.runtime.lastError.message);
        showStorageError(); // show a brief UI message
        reject(chrome.runtime.lastError);
      } else {
        resolve();
      }
    });
  }),
};

function showStorageError() {
  // Show a brief message in the popup
  const msg = document.createElement('div');
  msg.textContent = 'Save failed — check storage space or try outside incognito.';
  msg.style.cssText = 'position:fixed;bottom:10px;left:10px;right:10px;background:#c0392b;color:#fff;padding:8px 12px;border-radius:6px;font-size:12px;z-index:999;';
  document.body.appendChild(msg);
  setTimeout(() => msg.remove(), 3500);
}
```

**Do the same in `pipeline.js`** — wrap the `chrome.storage.local.get()` and `.set()` calls in `DOMContentLoaded` and `persist()`.

---

## 2. High Bugs — Broken Visible UI 🟠

### BUG-03 — Pipeline Cancel Button Does Nothing

**Severity:** 🟠 High — Broken UI, obvious to every user
**File:** `pipeline/pipeline.js` → `bindModal()`

**What's happening:**
The Cancel button exists in `pipeline.html` with id `modal-cancel`. The `bindModal()` function binds the close button, save button, delete button, and URL button — but not the cancel button. Clicking Cancel does nothing. The modal stays open.

**The fix:**
```js
// In bindModal(), add this one line:
document.getElementById('modal-cancel').addEventListener('click', closeModal);
```

---

### BUG-04 — Pipeline Modal Title Never Updates

**Severity:** 🟠 High — Every edit modal shows wrong or blank title
**File:** `pipeline/pipeline.js` → `openEditModal()`

**What's happening:**
The Pipeline modal has a heading element `#modal-job-title` designed to show the job's name when editing (e.g. "Editing — Senior Designer at Stripe"). The `openEditModal()` function populates every other field — title input, company input, status, CV, notes, URL — but never sets this heading element. It always shows its default placeholder text or stays blank.

**The fix:**
```js
// In openEditModal(), after finding the job, add:
document.getElementById('modal-job-title').textContent = job.title;
```

---

### BUG-05 — Stat Card Colour Stripes Are Invisible

**Severity:** 🟠 High — Visual bug, noticeable immediately
**File:** `pipeline/pipeline.js` → `renderStats()`

**What's happening:**
The Pipeline stat cards (Total / Applied / Interviews / Offers / Rejected) have coloured stripes across the top — teal, blue, amber, green, red — defined in `pipeline.css` using a `data-k` attribute selector:
```css
.stat-card[data-k="total"]     { --stripe-color: var(--teal); }
.stat-card[data-k="applied"]   { --stripe-color: var(--blue); }
/* etc. */
```
The CSS is complete and correct. But `renderStats()` in `pipeline.js` creates the cards without ever adding `data-k`:
```js
// Current (broken):
`<div class="stat-card">`

// Fix:
`<div class="stat-card" data-k="${k}">`
```

One word change. Every stat card immediately gets its colour stripe.

---

### BUG-06 — Company Extraction Is Wrong for Most Job Boards

**Severity:** 🟠 High — Core feature produces garbage data
**File:** `popup/popup.js` → `extractCompany()`

**What's happening:**
When saving a job, the company name is guessed from the browser tab title:
```js
function extractCompany(title) {
  if (title.includes(' at ')) return title.split(' at ')[1].split(' - ')[0].trim();
  if (title.includes(' | '))  return title.split(' | ')[1].split(' - ')[0].trim();
  return 'Unknown company';
}
```
This only handles two English-language separator patterns. Most job boards don't use these. Results:
- LinkedIn (English): "Senior Engineer at Stripe" → ✅ Works
- Rekrute.ma: "Développeur Full Stack — Casablanca | Rekrute" → ❌ Returns "Rekrute" (wrong)
- Bayt.com: "Software Engineer | Bayt.com" → ❌ Returns "Bayt.com" (wrong)
- Indeed: "Software Engineer - Google - Cairo" → ❌ Returns "Unknown company"
- Most Arabic boards: Wrong or "Unknown company"

**Phase 1 fix (title parsing — better but still imperfect):**
```js
function extractCompany(title) {
  // Remove common job board suffixes first
  const boardNames = ['LinkedIn', 'Indeed', 'Rekrute', 'Bayt.com', 'Glassdoor',
                      'Emploi.ma', 'Wuzzuf', 'Akhtaboot', 'Greenhouse', 'Lever'];
  let t = title;
  boardNames.forEach(b => { t = t.replace(new RegExp(`\\s*[|\\-—]\\s*${b}.*$`, 'i'), ''); });

  // Try separators in priority order
  if (t.includes(' at ')) return t.split(' at ').pop().split(/[|\\-—]/)[0].trim();
  if (t.includes(' chez ')) return t.split(' chez ').pop().split(/[|\\-—]/)[0].trim();  // French
  if (t.includes(' | ')) return t.split(' | ').slice(-1)[0].trim();
  if (t.includes(' - ')) return t.split(' - ').slice(-1)[0].trim();
  if (t.includes(' — ')) return t.split(' — ').slice(-1)[0].trim();
  return '';  // Return empty — better than "Unknown company", user can fill it in
}
```

**Phase 3 fix (proper — use `content.js` to pull from the DOM directly for top boards). See IMPROVEMENT-03.**

---

## 3. Medium Issues — Functional Gaps 🟡

### MISSING-01 — No Search or Filter in Jobs List

**Severity:** 🟡 Medium — App becomes unusable past ~20 saved jobs
**File:** `popup/popup.js` and `popup/popup.html`

**What's happening:**
The jobs list renders all saved jobs with no ability to search or filter. A user with 30 jobs can't find the one they want without scrolling through all of them.

**The fix:**
Add to `popup.html` above the jobs list:
```html
<div style="display:flex;gap:6px;margin-bottom:10px;">
  <input id="job-search" placeholder="Search jobs..." style="flex:1;border:1px solid #eee;border-radius:6px;padding:6px 9px;font-size:12px;font-family:inherit;outline:none;" />
  <select id="status-filter" style="border:1px solid #eee;border-radius:6px;padding:6px;font-size:12px;font-family:inherit;outline:none;color:#888;">
    <option value="">All</option>
    <option value="saved">Saved</option>
    <option value="applied">Applied</option>
    <option value="interview">Interview</option>
    <option value="offer">Offer</option>
    <option value="rejected">Rejected</option>
  </select>
</div>
```

In `popup.js`, filter jobs before rendering:
```js
function getFilteredJobs() {
  const q = document.getElementById('job-search')?.value.toLowerCase() || '';
  const s = document.getElementById('status-filter')?.value || '';
  return jobs.filter(j =>
    (!q || j.title.toLowerCase().includes(q) || j.company.toLowerCase().includes(q)) &&
    (!s || j.status === s)
  );
}
```
Call `getFilteredJobs()` inside `renderJobs()` instead of using `jobs` directly. Add input event listeners to both controls to re-render on change.

---

### MISSING-02 — No CSV Export

**Severity:** 🟡 Medium — Data recovery is impossible without this
**File:** `popup/popup.js`

**What's happening:**
Users have no way to get their data out of the extension. If chrome.storage is wiped, everything is gone with no recovery path. Export must be free and must ship before launch — this is a trust feature.

**The fix:**
```js
function exportJobsCSV() {
  const headers = ['Title', 'Company', 'Status', 'URL', 'Emailed', 'Notes', 'Saved', 'Updated'];
  const rows = jobs.map(j => [
    j.title, j.company, j.status, j.url,
    j.emailed ? 'Yes' : 'No',
    (j.notes || '').replace(/\n/g, ' '),
    j.savedAt?.slice(0, 10) || '',
    j.updatedAt?.slice(0, 10) || ''
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));

  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `hiretrack-export-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
```
Add an "Export CSV" button to the Jobs tab footer.

---

### MISSING-03 — No Onboarding Screen

**Severity:** 🟡 Medium — New users see "0 jobs saved" with no guidance
**File:** `popup/popup.js`

**What's happening:**
When someone installs HireTrack and opens the popup for the first time, they see "0 jobs saved" and a "+ Save this job" button. That's it. No explanation of what the extension does, how job detection works, or what to do first. First-time users who don't immediately understand the value will uninstall.

**The fix:**
On first run, show a one-time welcome screen before the normal popup. Set a flag in `chrome.storage.local` after dismissal so it never shows again.

```js
// Check on DOMContentLoaded
const { onboarded } = await chrome.storage.local.get('onboarded');
if (!onboarded) {
  showOnboarding();
  return;
}

function showOnboarding() {
  document.getElementById('main-content').innerHTML = `
    <div style="padding:20px;text-align:center;">
      <div style="font-size:24px;margin-bottom:8px;">👋</div>
      <div style="font-weight:600;font-size:14px;margin-bottom:12px;">Welcome to HireTrack</div>
      <div style="font-size:12px;color:#666;line-height:1.6;text-align:left;margin-bottom:16px;">
        <p>• Browse to any job listing and click <strong>+ Save this job</strong></p>
        <p style="margin-top:6px;">• Track your applications on the <strong>Kanban pipeline</strong></p>
        <p style="margin-top:6px;">• Store your CVs, email templates, and snippets here</p>
      </div>
      <button id="start-btn" style="width:100%;background:#1D9E75;color:#fff;border:none;border-radius:8px;padding:10px;font-size:13px;cursor:pointer;">
        Got it — let's start
      </button>
    </div>`;
  document.getElementById('start-btn').addEventListener('click', async () => {
    await chrome.storage.local.set({ onboarded: true });
    location.reload();
  });
}
```

---

### MISSING-04 — content.js Does Nothing

**Severity:** 🟡 Medium — Company/title extraction is manual and often wrong
**File:** `content/content.js` and `manifest.json`

**What's happening:**
`content.js` is a placeholder with a comment. Job title and company are extracted by splitting the browser tab title, which fails for most non-English job boards. Content scripts can read the actual page DOM — a far more reliable source.

**The fix (Phase 3 — after launch):**
```js
// content.js
const extractors = {
  'linkedin.com': () => ({
    title: document.querySelector('h1.job-details-jobs-unified-top-card__job-title')?.innerText?.trim(),
    company: document.querySelector('.job-details-jobs-unified-top-card__company-name a')?.innerText?.trim(),
  }),
  'indeed.com': () => ({
    title: document.querySelector('h1[data-testid="jobsearch-JobInfoHeader-title"]')?.innerText?.trim(),
    company: document.querySelector('[data-testid="inlineHeader-companyName"]')?.innerText?.trim(),
  }),
  'greenhouse.io': () => ({
    title: document.querySelector('h1.app-title')?.innerText?.trim(),
    company: document.querySelector('.company-name')?.innerText?.trim(),
  }),
  'lever.co': () => ({
    title: document.querySelector('.posting-headline h2')?.innerText?.trim(),
    company: document.querySelector('.main-header-text .large-category-label')?.innerText?.trim(),
  }),
  'rekrute.com': () => ({
    title: document.querySelector('h1.job_title, .job-header h1')?.innerText?.trim(),
    company: document.querySelector('.company-name, .recruiter-name')?.innerText?.trim(),
  }),
};

const host = location.hostname.replace('www.', '');
const extractor = Object.entries(extractors).find(([k]) => host.includes(k));
if (extractor) {
  const data = extractor[1]();
  if (data.title || data.company) {
    chrome.runtime.sendMessage({ type: 'JOB_DATA', ...data });
  }
}
```

**Also update `manifest.json`** to expand content script matches:
```json
"content_scripts": [{
  "matches": [
    "*://*.linkedin.com/*",
    "*://*.indeed.com/*",
    "*://*.greenhouse.io/*",
    "*://*.lever.co/*",
    "*://*.rekrute.com/*",
    "*://*.bayt.com/*",
    "*://*.wuzzuf.net/*",
    "*://*.glassdoor.com/*"
  ],
  "js": ["content/content.js"]
}]
```

---

### MISSING-05 — No CV Preview

**Severity:** 🟡 Medium — You can store CVs but never look at them
**File:** `popup/popup.js` → `renderCVs()`

**What's happening:**
The CV Vault lets you upload and store CVs. There is no way to view them. The "Copy" button copies just the name and filename as text — not useful. You cannot verify the right CV is attached to a job.

**The fix:**
```js
// In renderCVs(), add a Preview button to each CV card
// Add this button alongside existing Copy and Delete buttons:
`<button class="btn-sm" data-preview="${c.id}">View</button>`

// Bind the preview action:
list.querySelectorAll('[data-preview]').forEach(btn =>
  btn.addEventListener('click', async () => {
    const db = await openCVDB();
    const result = await new Promise(res => {
      const tx = db.transaction('files', 'readonly');
      const req = tx.objectStore('files').get(btn.dataset.preview);
      req.onsuccess = () => res(req.result);
    });
    if (result?.blob) {
      const url = URL.createObjectURL(result.blob);
      chrome.tabs.create({ url });
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
  })
);
```

---

## 4. Performance and Architecture Issues 🟡🟢

### PERF-01 — Event Listener Re-attachment on Every Render

**Severity:** 🟡 Medium — Memory leak in long extension sessions
**Files:** `popup/popup.js` → `renderJobs()`, `renderCVs()`, `renderTemplates()`, `renderSnippets()`

**What's happening:**
Every time any of these render functions runs, it rebuilds the entire HTML via `innerHTML` and then attaches new event listeners to the new elements. This is fine for small lists. The problem is that each render also destroys the old elements (via innerHTML overwrite) before creating new ones — so the old listeners are garbage collected. However, any in-progress interactions (hover states, mid-click) are disrupted. More importantly, any render triggered mid-interaction can cause unexpected behavior.

**The fix (simple, sufficient for this scale):**
Add `data-` attributes to elements for delegated event handling — attach one listener to the parent container instead of individual elements:

```js
// Instead of:
list.querySelectorAll('.job-card').forEach(card =>
  card.addEventListener('click', () => openJobModal(card.dataset.id))
);

// Use event delegation:
list.addEventListener('click', (e) => {
  const card = e.target.closest('.job-card');
  if (card) openJobModal(card.dataset.id);
});
```
Attach the container listener once on DOMContentLoaded, not inside the render function. This is cleaner, more performant, and more robust.

---

### PERF-02 — No Virtualisation for Large Job Lists

**Severity:** 🟢 Low — Only matters at 100+ saved jobs, not at launch
**File:** `popup/popup.js` → `renderJobs()`

**What's happening:**
All saved jobs are rendered to the DOM at once. At 20 jobs this is fine. At 100 jobs it starts to feel sluggish on first open. At 200+ jobs it is noticeably slow.

**The fix (Phase 3, not urgent):**
Add simple pagination — show 20 jobs at a time with "Load more" or page controls. True virtualisation (only rendering visible rows) is overkill for a popup.

---

### PERF-03 — Fonts Loaded from Google CDN on Every Pipeline Open

**Severity:** 🟢 Low — Slow first load if user is offline or CDN is slow
**File:** `pipeline/pipeline.html`

**What's happening:**
The Pipeline page imports three font families from Google Fonts CDN on every load. If the user is offline or has a slow connection, the fonts fail silently and fallback fonts are used (fine). But the CDN request adds 50–200ms to first meaningful paint.

**The fix (Phase 2):**
Download the font files and bundle them with the extension. Reference them via relative paths. This also removes the network dependency and the CDN privacy concern (Google sees the request).

---

### ARCH-01 — Single Modal Element Reused for Multiple Purposes in Popup

**Severity:** 🟡 Medium — Brittle code, causes bugs if render order changes
**File:** `popup/popup.js`

**What's happening:**
The popup uses a single modal div (`#job-modal`) for three completely different purposes:
1. Editing a saved job (`openJobModal()`)
2. Creating/editing email templates (`openModal('template', ...)`)
3. Creating/editing snippets (`openModal('snippet', ...)`)

This works right now because each function overwrites `modal-body` with its own HTML. But the `modal-title` element is set differently by each function, and closing the modal via `closeModal()` resets `editingJobId` even when the modal was showing a template form. If the render order or calling order ever changes, subtle bugs appear.

**The fix (Phase 2):**
Give templates/snippets their own dedicated modal elements, or pass a `type` flag to `closeModal()` so it knows what state to clean up. The current architecture works but is technical debt that will bite you when adding Pro features.

---

### ARCH-02 — manifest.json Content Script Matches Are Too Narrow

**Severity:** 🟡 Medium — Job detection claims to support 300+ boards but content scripts only inject into 4
**File:** `manifest.json`

**What's happening:**
`jobDetection.js` knows about 300+ job board domains. But the `content_scripts` entry in `manifest.json` only injects `content.js` into 4 domains:
```json
"matches": ["*://*.linkedin.com/*", "*://*.indeed.com/*", "*://*.greenhouse.io/*", "*://*.lever.co/*"]
```
Since `content.js` is currently a placeholder this doesn't matter yet. But when you implement real DOM extraction (MISSING-04), only these 4 domains will get it. The mismatch is a future bug.

**The fix:** When implementing MISSING-04, expand the matches list to cover the top ~15 job boards with DOM extractors. Don't try to match all 300+ domains in content scripts — that's overkill and unnecessary since most job boards are detected via URL pattern, not DOM extraction.

---

### ARCH-03 — No Input Sanitization Beyond escHtml in Some Places

**Severity:** 🟡 Medium — XSS risk in popup.js rendering
**File:** `popup/popup.js` → `renderTemplates()`, `renderSnippets()`

**What's happening:**
`pipeline.js` uses `escHtml()` consistently when rendering user data into innerHTML. `popup.js` does NOT use escHtml in several places — for example, template names and snippet labels are inserted directly into innerHTML in `renderTemplates()` and `renderSnippets()`:
```js
`<div class="cv-name">${t.name}</div>` // no escHtml — XSS risk
```
If a user (or a malicious actor with access to their storage) saved a template with a name like `<img src=x onerror=alert(1)>`, it would execute.

**The fix:**
Apply `escHtml()` (already defined in pipeline.js but not imported in popup.js) to every user-provided string before inserting it into innerHTML. Add `escHtml` to popup.js as well:

```js
function escHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
```

Then use it everywhere in `popup.js` when inserting user data into innerHTML.

---

## 5. Pre-Pro Technical Preparation 🟡

These aren't bugs right now — but if you don't do them before building Pro, you'll have to do them under pressure while also building Pro features.

### PREP-01 — Add syncedAt and remindAt Fields to Job Object

Before building cloud sync, add these optional fields to the job object structure:
```js
{
  ...existingFields,
  syncedAt: null,    // set when cloud sync succeeds — null means not yet synced
  remindAt: null,    // follow-up reminder date (ISO string) — null means no reminder
}
```
They are null for all free users. Pro sync and reminder features just populate them. No migration needed — adding new fields to an existing object is backward-compatible.

---

### PREP-02 — Add a planCache to chrome.storage

When Pro launches, every popup open will need to check if the user is Pro or Free. This check should not require a network call every time — that's slow and fails offline.

Cache the plan status locally:
```js
// After Pro login and on each sync:
await chrome.storage.local.set({
  planCache: {
    plan: 'pro',
    validUntil: '2027-05-01',
    cachedAt: new Date().toISOString()
  }
});

// On popup open, read from cache first
// Re-validate against Supabase only if cachedAt > 24 hours ago
```

---

### PREP-03 — Add a Consistent Job ID Strategy

Current IDs are `Date.now().toString()` — a Unix timestamp in milliseconds. This is fine for single-device local use. But for cloud sync, if the same user installs on two devices and saves a job within the same millisecond (unlikely but possible), you get an ID collision in Supabase.

**Better strategy:** Use a short UUID for IDs from launch. `crypto.randomUUID()` is available in Chrome extension contexts with no extra library:
```js
id: crypto.randomUUID()
```
Implement this for all new jobs. Existing local jobs keep their timestamp IDs — that's fine.

---

## 6. Launch Checklist

### Before submitting to Chrome Web Store:
- [ ] BUG-01: CV storage moved to IndexedDB ← most important
- [ ] BUG-02: Error handling added to all storage calls
- [ ] BUG-03: Pipeline Cancel button bound
- [ ] BUG-04: Pipeline modal title populated
- [ ] BUG-05: Stat card `data-k` attributes added
- [ ] BUG-06: Company extraction improved
- [ ] MISSING-01: Search and filter added to jobs list
- [ ] MISSING-02: CSV export implemented
- [ ] MISSING-03: Onboarding screen implemented
- [ ] ARCH-03: escHtml applied everywhere in popup.js
- [ ] PREP-01: syncedAt and remindAt fields added to job model
- [ ] PREP-03: Switch new job IDs to crypto.randomUUID()
- [ ] Privacy policy written and hosted on GitHub Pages
- [ ] Extension JS minified with Terser for Web Store submission
- [ ] Chrome Web Store listing written with screenshots
- [ ] GitHub repo opened with BSL license and README

### Before building Pro (Phase 4):
- [ ] MISSING-04: content.js DOM extraction for top job boards
- [ ] MISSING-05: CV preview implemented
- [ ] PERF-01: Event delegation refactor
- [ ] ARCH-01: Modal reuse cleaned up
- [ ] ARCH-02: manifest.json matches expanded
- [ ] PREP-02: planCache strategy implemented
- [ ] PERF-03: Fonts bundled locally
