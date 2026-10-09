// ── State ────────────────────────────────────────────────────────
// `store` comes from ../storage.js
let jobs = [], cvs = [], templates = [], snippets = [];
let profile = {}, settings = {};
let editingJobId = null;
let applyEnabled = false;   // the user has allowed HireTrackr to act on pages (autofill / CV drop)
let draggedCV = null;       // { id, tabId, until, ready } while a CV card is being dragged

// The same page is used as the side panel and as the popup (sidepanel.html?popup)
const IS_POPUP = new URLSearchParams(location.search).has('popup');
if (IS_POPUP) document.documentElement.classList.add('popup');

const ALL_SITES = { origins: ['*://*/*'] };
const STATUSES = ['saved', 'applied', 'interview', 'offer', 'rejected'];
const MAX_CV_SIZE = 5 * 1024 * 1024; // 5MB

const PROFILE_FIELDS = [
  { key: 'firstName', label: 'First name', pair: true },
  { key: 'lastName',  label: 'Last name',  pair: true },
  { key: 'email',     label: 'Email',      type: 'email', placeholder: 'name@example.com' },
  { key: 'phone',     label: 'Phone',      type: 'tel',   placeholder: '+212 6 12 34 56 78' },
  { key: 'city',      label: 'City',       pair: true },
  { key: 'country',   label: 'Country',    pair: true },
  { key: 'linkedin',  label: 'LinkedIn',   type: 'url', placeholder: 'https://linkedin.com/in/you' },
  { key: 'github',    label: 'GitHub',     type: 'url', placeholder: 'https://github.com/you' },
  { key: 'website',   label: 'Website or portfolio', type: 'url', placeholder: 'https://you.dev' },
];

// ── IndexedDB for CV files ────────────────────────────────────────
function openCVDB() {
  return new Promise((resolve, reject) => {
    // Keeps its pre-rename name: changing it would orphan CVs already stored.
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

// Migrates old base64 CVs from chrome.storage into IndexedDB.
// Runs once, then sets a flag so it never runs again.
async function migrateCVsToIndexedDB() {
  const { cvMigrated } = await chrome.storage.local.get('cvMigrated');
  if (cvMigrated) return;

  const migrated = new Set();
  for (const cv of cvs.filter(c => c.data)) {
    try {
      // Convert base64 data URL back to blob
      const res = await fetch(cv.data);
      const blob = await res.blob();
      await saveCVBlob(cv.id, blob);
      migrated.add(cv.id);
    } catch (err) {
      // Migration failed silently - CV will remain in old format
    }
  }

  if (migrated.size > 0) {
    // save cleaned metadata (base64 removed)
    cvs = await store.update('cvs', list => list.map(c => {
      if (!migrated.has(c.id)) return c;
      const { data, ...meta } = c;
      return meta;
    }));
  }
  await chrome.storage.local.set({ cvMigrated: true });
}

// Pro will call setPlanCache() after login.
// Free tier reads it and gets { plan: 'free' } back.
async function getPlanCache() {
  const { planCache } = await chrome.storage.local.get('planCache');
  return planCache || { plan: 'free', validUntil: null, cachedAt: null };
}

async function setPlanCache(plan, validUntil) {
  await chrome.storage.local.set({
    planCache: { plan, validUntil, cachedAt: new Date().toISOString() }
  });
}

// ── Small helpers ────────────────────────────────────────────────
function escHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// el('div', { className: 'card', textContent: 'Hi', dataset: { id } }, child, ...)
function el(tag, props = {}, ...children) {
  const { dataset, ...rest } = props;
  const node = Object.assign(document.createElement(tag), rest);
  if (dataset) Object.assign(node.dataset, dataset);
  node.append(...children.filter(Boolean));
  return node;
}

function field(label, control) {
  return el('div', { className: 'field' }, el('label', { textContent: label, htmlFor: control.id }), control);
}

function selectOf(id, options, value) {
  const select = el('select', { id });
  for (const [val, text] of options) select.append(el('option', { value: val, textContent: text }));
  select.value = value;
  return select;
}

function emptyState(title, body) {
  return el('div', { className: 'empty' }, el('strong', { textContent: title }), body);
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// ── Feedback: toasts and in-panel dialogs ────────────────────────
// Used instead of alert / confirm / prompt so everything behaves the same
// in the side panel and in the popup.
function toast(message, kind = 'info') {
  const t = el('div', { className: `toast toast-${kind}`, textContent: message });
  document.getElementById('toasts').replaceChildren(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, kind === 'error' ? 5000 : 2600);
}

// Resolves to true / false. With `input`, resolves to the typed text or null.
// onOk runs synchronously inside the click, for calls that need the user gesture.
function ask({ title, message = '', okLabel = 'OK', cancelLabel = 'Cancel', input = null, onOk = null }) {
  return new Promise(resolve => {
    const layer = document.getElementById('dialog');
    const text = input ? el('input', { value: input.value || '', placeholder: input.placeholder || '', maxLength: 100 }) : null;
    const ok = el('button', { className: 'btn btn-primary', textContent: okLabel });
    const cancel = el('button', { className: 'btn', textContent: cancelLabel });

    const close = (result) => {
      layer.classList.remove('open');
      layer.removeEventListener('keydown', onKey);
      resolve(result);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close(text ? null : false);
      if (e.key === 'Enter' && text) ok.click();
    };

    ok.addEventListener('click', () => {
      if (onOk) onOk();
      close(text ? text.value.trim() : true);
    });
    cancel.addEventListener('click', () => close(text ? null : false));
    layer.addEventListener('keydown', onKey);

    document.getElementById('dialog-box').replaceChildren(
      el('div', { className: 'alert-title', textContent: title }),
      message ? el('div', { className: 'alert-message', textContent: message }) : null,
      text,
      el('div', { className: 'alert-actions' }, cancel, ok),
    );
    layer.classList.add('open');
    (text || ok).focus();
    if (text) text.select();
  });
}

// Flashes the Save button with a result, then puts its label back
function flashButton(id, text) {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.textContent = text;
  setTimeout(() => { btn.textContent = 'Save this job'; }, 2000);
}

// ── Boot (runs when the side panel HTML is ready) ────────────────
document.addEventListener('DOMContentLoaded', async () => {
  store.onWriteError = () =>
    toast('Save failed. Storage may be full, or unavailable in incognito.', 'error');

  jobs      = await store.get('jobs');
  cvs       = await store.get('cvs');
  templates = await store.get('templates');
  snippets  = await store.get('snippets');
  profile   = await store.get('profile', {});
  settings  = await store.get('settings', {});
  applyEnabled = await chrome.permissions.contains(ALL_SITES).catch(() => false);
  applyTheme(settings.theme);   // from ../theme.js

  // Stay in step with changes made from the pipeline page or another window's panel
  store.onChange((key, val) => {
    if      (key === 'jobs')      jobs      = val || [];
    else if (key === 'cvs')       cvs       = val || [];
    else if (key === 'templates') templates = val || [];
    else if (key === 'snippets')  snippets  = val || [];
    else if (key === 'settings')  { settings = val || {}; applyTheme(settings.theme); }
    else if (key === 'profile') {
      profile = val || {};
      // don't replace the form under the user's fingers
      if (!document.getElementById('profile-form').contains(document.activeElement)) renderProfile();
      return;
    }
    else return;
    renderAll();
  });

  const onPermissionChange = async () => {
    applyEnabled = await chrome.permissions.contains(ALL_SITES).catch(() => false);
    renderSettings();
    renderCVs();
  };
  chrome.permissions.onAdded.addListener(onPermissionChange);
  chrome.permissions.onRemoved.addListener(onPermissionChange);
  chrome.runtime.onMessage.addListener(onPageMessage);

  bindTabs();
  bindButtons();
  bindHelp();
  await migrateCVsToIndexedDB();
  renderAll();
  renderProfile();

  // First run: start on the welcome screen
  const { onboarded } = await chrome.storage.local.get('onboarded');
  if (!onboarded) showHelp(true);
});

// ── Help / first-run screen ──────────────────────────────────────
function showHelp(show) {
  document.getElementById('onboarding').hidden = !show;
  document.getElementById('main-app').hidden = show;
}

function bindHelp() {
  document.getElementById('help-icon').addEventListener('click', () => showHelp(true));
  document.getElementById('close-help-btn').addEventListener('click', async () => {
    showHelp(false);
    await chrome.storage.local.set({ onboarded: true });
  });

  // Protect support email from scrapers - inject dynamically with obfuscation
  const supportEmailLink = document.getElementById('support-email');
  // Obfuscated email - split and reversed to prevent simple scraping
  const user = ['m', 'o', 'c', '.', 't', 'r', 'a', 'c', 'k', 'e', 'r', 'i', 'h'].reverse().join('');
  const domain = ['m', 'o', 'c', '.', 'l', 'i', 'a', 'm', 'g'].reverse().join('');
  supportEmailLink.href = 'mailto:' + user + '@' + domain;
}

// ── Render all panels ────────────────────────────────────────────
function renderAll() {
  renderJobs();
  renderCVs();
  renderTemplates();
  renderSnippets();
  renderSettings();
  document.getElementById('job-count').textContent =
    `${jobs.length} job${jobs.length !== 1 ? 's' : ''} saved`;
}

// ── Tabs ─────────────────────────────────────────────────────────
function showTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach(p => { p.hidden = p.id !== 'tab-' + name; });
}

function bindTabs() {
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => showTab(btn.dataset.tab));
  });
}

// ── Bind main buttons ─────────────────────────────────────────────
function bindButtons() {
  document.getElementById('save-job-btn').addEventListener('click', saveCurrentJob);
  document.getElementById('autofill-btn').addEventListener('click', autofillPage);
  document.getElementById('add-job-manual-btn').addEventListener('click', () => openJobModal(null));
  document.getElementById('cv-upload').addEventListener('change', handleCVUpload);
  document.getElementById('add-template-btn').addEventListener('click', () => openModal('template'));
  document.getElementById('add-snippet-btn').addEventListener('click', () => openModal('snippet'));
  document.getElementById('open-pipeline').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('pipeline/pipeline.html') });
  });
  document.getElementById('close-modal').addEventListener('click', closeModal);
  document.getElementById('job-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });
  document.getElementById('job-search').addEventListener('input', renderJobs);
  document.getElementById('status-filter').addEventListener('change', renderJobs);
  document.getElementById('export-csv-btn').addEventListener('click', exportJobsCSV);
  document.getElementById('save-profile-btn').addEventListener('click', saveProfile);
  document.getElementById('profile-form').addEventListener('submit', e => { e.preventDefault(); saveProfile(); });
  document.getElementById('open-as').addEventListener('click', e => {
    const seg = e.target.closest('[data-open-as]');
    if (seg) setOpenAs(seg.dataset.openAs);
  });
  document.getElementById('apply-toggle').addEventListener('click', toggleApplyPermission);
  document.getElementById('theme-choice').addEventListener('click', e => {
    const seg = e.target.closest('[data-theme-choice]');
    if (seg) setTheme(seg.dataset.themeChoice);
  });

  // Event delegation for job cards - prevents memory leaks
  document.getElementById('jobs-list').addEventListener('click', (e) => {
    const jobCard = e.target.closest('.job-card');
    if (jobCard && jobCard.dataset.id) openJobModal(jobCard.dataset.id);
  });

  // Event delegation for CV actions - prevents memory leaks
  document.getElementById('cvs-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const id = btn.closest('.cv-card').dataset.id;
    const cv = cvs.find(c => c.id === id);
    if (!cv) return;

    if (btn.dataset.act === 'attach') {
      attachCV(id);
    } else if (btn.dataset.act === 'preview') {
      previewCV(id);
    } else if (btn.dataset.act === 'copy') {
      navigator.clipboard.writeText(`CV: ${cv.name}\nFile: ${cv.filename}`);
      flashCopied(btn);
    } else if (btn.dataset.act === 'delete') {
      await deleteCVBlob(id).catch(() => {}); // Silently ignore blob delete failures
      cvs = await store.update('cvs', list => list.filter(c => c.id !== id));
      renderCVs();
    }
  });

  // Event delegation for templates - prevents memory leaks
  document.getElementById('templates-list').addEventListener('click', async (e) => {
    const copyBtn = e.target.closest('[data-copy-t]');
    const editBtn = e.target.closest('[data-edit-t]');
    const delBtn = e.target.closest('[data-del-t]');

    if (copyBtn) {
      const t = templates.find(x => x.id === copyBtn.dataset.copyT);
      if (t) {
        navigator.clipboard.writeText(`Subject: ${t.subject}\n\n${t.body}`);
        flashCopied(copyBtn);
      }
    } else if (editBtn) {
      const template = templates.find(x => x.id === editBtn.dataset.editT);
      if (template) openModal('template', template);
    } else if (delBtn) {
      const id = delBtn.dataset.delT;
      templates = await store.update('templates', list => list.filter(x => x.id !== id));
      renderTemplates();
    }
  });

  // Event delegation for snippets - prevents memory leaks
  document.getElementById('snippets-list').addEventListener('click', async (e) => {
    const copyBtn = e.target.closest('[data-copy-s]');
    const editBtn = e.target.closest('[data-edit-s]');
    const delBtn = e.target.closest('[data-del-s]');

    if (copyBtn) {
      const s = snippets.find(x => x.id === copyBtn.dataset.copyS);
      if (s) {
        navigator.clipboard.writeText(s.content);
        flashCopied(copyBtn);
      }
    } else if (editBtn) {
      const snippet = snippets.find(x => x.id === editBtn.dataset.editS);
      if (snippet) openModal('snippet', snippet);
    } else if (delBtn) {
      const id = delBtn.dataset.delS;
      snippets = await store.update('snippets', list => list.filter(x => x.id !== id));
      renderSnippets();
    }
  });
}

function flashCopied(btn) {
  const originalText = btn.textContent;
  btn.textContent = 'Copied';
  setTimeout(() => { btn.textContent = originalText; }, 1500);
}

// ── SAVE JOB ──────────────────────────────────────────────────────
function newJob({ title, company, url }) {
  return {
    id: crypto.randomUUID(),
    title,
    company,
    url,
    status: 'saved',
    cvId: null,
    emailed: false,
    notes: '',
    savedAt: new Date().toISOString(),
    syncedAt:  null,   // ISO string — set when synced to cloud (Pro only). null = not synced.
    remindAt:  null,   // ISO string — follow-up reminder date (Pro only). null = no reminder.
  };
}

// Asks content.js on the tab for the title/company it can read from the page.
// Gives empty strings on pages where content.js isn't running.
async function getPageJobData(tabId) {
  try {
    const data = await chrome.tabs.sendMessage(tabId, { type: 'GET_JOB_DATA' });
    return {
      title:   typeof data?.title   === 'string' ? data.title.trim().slice(0, 200)   : '',
      company: typeof data?.company === 'string' ? data.company.trim().slice(0, 100) : '',
    };
  } catch (e) {
    return { title: '', company: '' };
  }
}

async function saveCurrentJob() {
  const tab = await activeTab();

  // Browser pages (new tab, settings...) have nothing to save — "Add manually" covers those
  if (!/^https?:/.test(tab?.url || '')) {
    flashButton('save-job-btn', 'No web page open');
    return;
  }

  const exists = jobs.find(j => j.url === tab.url);
  if (exists) {
    flashButton('save-job-btn', 'Already saved');
    return;
  }

  // Detection only decides whether to ask first — the user always has the last word
  const check = isLikelyJobPage(tab.url, tab.title);
  if (!check.ok || check.warning) {
    const go = await ask({
      title: 'Save this page?',
      message: check.ok
        ? 'This page might not be a job listing.'
        : 'This page doesn\'t look like a job listing.',
      okLabel: 'Save anyway',
    });
    if (!go) return;
  }

  const page = await getPageJobData(tab.id);
  const tabTitle = tab.title || '';
  const rawTitle = tabTitle.split(' - ')[0].split(' | ')[0].trim() || 'Untitled Job';

  const job = newJob({
    title:   (page.title   || rawTitle).slice(0, 200),
    company: (page.company || extractCompany(tabTitle)).slice(0, 100),
    url:     tab.url,
  });
  jobs = await store.update('jobs', list =>
    list.some(j => j.url === job.url) ? list : [job, ...list]
  );
  flashButton('save-job-btn', jobs.includes(job) ? 'Saved' : 'Already saved');
  renderAll();
}

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
    t = t.replace(new RegExp(`\\s*[|\\-—]\\s*${b.replace('.', '\\.')}.*$`, 'i'), '');
  });

  // Try separator patterns in priority order
  if (t.includes(' at '))    return t.split(' at ').pop().split(/[|\-—]/)[0].trim();
  if (t.includes(' chez '))  return t.split(' chez ').pop().split(/[|\-—]/)[0].trim(); // French
  if (t.includes(' bei '))   return t.split(' bei ').pop().split(/[|\-—]/)[0].trim();  // German
  if (t.includes(' | '))     return t.split(' | ').filter(Boolean).pop().trim();
  if (t.includes(' — ')) return t.split(' — ').filter(Boolean).pop().trim();
  if (t.includes(' - '))     return t.split(' - ').filter(Boolean).pop().trim();

  return ''; // Empty is better than "Unknown company" — user can fill it in
}

function getFilteredJobs() {
  const q = (document.getElementById('job-search')?.value || '').toLowerCase().trim();
  const s = document.getElementById('status-filter')?.value || '';
  return jobs.filter(j =>
    (!q || j.title.toLowerCase().includes(q) || j.company.toLowerCase().includes(q)) &&
    (!s || j.status === s)
  );
}

function exportJobsCSV() {
  if (!jobs.length) {
    toast('No jobs to export yet');
    return;
  }

  try {
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

    const csv = '﻿' + [headers.join(','), ...rows].join('\n'); // BOM for Excel compatibility
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));

    const a = el('a', { href: url, download: `hiretrackr-export-${new Date().toISOString().slice(0, 10)}.csv` });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    toast('Export failed. Try again.', 'error');
  }
}

// ── RENDER JOBS ───────────────────────────────────────────────────
function renderJobs() {
  const list = document.getElementById('jobs-list');
  if (!list) return;
  const filteredJobs = getFilteredJobs();

  if (!jobs.length) {
    list.replaceChildren(emptyState('Save your first job', 'Open a job listing and press Save this job.'));
    return;
  }

  if (!filteredJobs.length) {
    list.replaceChildren(emptyState('No matches', 'Try a different search or status.'));
    return;
  }
  list.innerHTML = filteredJobs.map(j => {
    const cv = cvs.find(c => c.id === j.cvId);
    const meta = [cv && cv.name, j.emailed && 'Emailed'].filter(Boolean).join(' · ');
    return `
      <div class="card job-card" data-id="${escHtml(j.id)}">
        <div class="job-top">
          <div>
            <div class="job-title">${escHtml(j.title)}</div>
            <div class="job-company">${escHtml(j.company)}</div>
          </div>
          <span class="pill pill-${escHtml(j.status)}">${escHtml(j.status)}</span>
        </div>
        ${meta ? `<div class="job-meta">${escHtml(meta)}</div>` : ''}
      </div>`;
  }).join('');
  // Event delegation - single listener handles all job card clicks
}

// ── JOB MODAL ────────────────────────────────────────────────────
// id = null opens the same form empty, to add a job by hand
function openJobModal(id) {
  const isNew = id === null;
  const job = isNew ? newJob({ title: '', company: '', url: '' }) : jobs.find(j => j.id === id);
  if (!job) return;
  editingJobId = id;
  document.getElementById('modal-title').textContent = isNew ? 'Add a job manually' : job.title;

  const url = el('input', { id: 'm-url', value: job.url });
  if (isNew) url.placeholder = 'https://...  (optional)';
  else url.readOnly = true;

  const actions = el('div', { className: 'sheet-actions' },
    el('button', { className: 'btn btn-primary btn-block', id: 'save-job-modal', textContent: isNew ? 'Add job' : 'Save changes', onclick: saveJobModal }),
    isNew ? null : el('button', { className: 'btn btn-plain btn-danger btn-block', id: 'delete-job', textContent: 'Delete job', onclick: deleteJob }),
  );

  document.getElementById('modal-body').replaceChildren(
    field('Job title', el('input', { id: 'm-title', value: job.title })),
    field('Company', el('input', { id: 'm-company', value: job.company })),
    field('Status', selectOf('m-status', STATUSES.map(s => [s, s.charAt(0).toUpperCase() + s.slice(1)]), job.status)),
    field('CV used', selectOf('m-cv', [['', 'None'], ...cvs.map(c => [c.id, c.name])], job.cvId || '')),
    field('Emailed recruiter?', selectOf('m-emailed', [['false', 'No'], ['true', 'Yes']], String(!!job.emailed))),
    field('Notes', el('textarea', { id: 'm-notes', placeholder: 'Interview notes, salary, contact...', value: job.notes || '' })),
    field('Link', url),
    actions,
  );
  openSheet();
}

async function saveJobModal() {
  const fields = {
    title:   document.getElementById('m-title').value.trim().slice(0, 200),
    company: document.getElementById('m-company').value.trim().slice(0, 100),
    status:  document.getElementById('m-status').value,
    cvId:    document.getElementById('m-cv').value || null,
    emailed: document.getElementById('m-emailed').value === 'true',
    notes:   document.getElementById('m-notes').value.trim().slice(0, 5000),
  };

  if (editingJobId === null) {
    // Adding by hand: only the title is required
    const url = document.getElementById('m-url').value.trim();
    if (!fields.title) { toast('Enter a job title', 'error'); return; }
    if (url && !/^https?:\/\/\S+$/i.test(url)) { toast('The link must start with http:// or https://', 'error'); return; }
    if (url && jobs.some(j => j.url === url)) { toast('A job with this link is already saved', 'error'); return; }
    const job = { ...newJob({ title: fields.title, company: fields.company, url }), ...fields };
    jobs = await store.update('jobs', list => [job, ...list]);
  } else {
    const id = editingJobId;
    jobs = await store.update('jobs', list => list.map(j => j.id !== id ? j : {
      ...j,
      ...fields,
      title:   fields.title   || j.title,
      company: fields.company || j.company,
    }));
  }
  renderAll();
  closeModal();
}

async function deleteJob() {
  const id = editingJobId;
  jobs = await store.update('jobs', list => list.filter(j => j.id !== id));
  renderAll();
  closeModal();
}

// ── CV VAULT ─────────────────────────────────────────────────────
// Decides the file type from its first bytes, not from its name.
// Returns the MIME type, or null for anything that isn't a PDF or Word file.
function sniffCVType(bytes) {
  const starts = (...sig) => sig.every((b, i) => bytes[i] === b);
  if (starts(0x25, 0x50, 0x44, 0x46, 0x2D)) return 'application/pdf';                       // %PDF-
  if (starts(0x50, 0x4B, 0x03, 0x04)) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'; // .docx (zip)
  if (starts(0xD0, 0xCF, 0x11, 0xE0)) return 'application/msword';                          // .doc
  return null;
}

async function handleCVUpload(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;

  if (file.size > MAX_CV_SIZE) {
    toast('That file is over 5 MB. Choose a smaller one.', 'error');
    return;
  }

  const buffer = await file.arrayBuffer();
  const type = sniffCVType(new Uint8Array(buffer.slice(0, 8)));
  if (!type || !/\.(pdf|docx|doc)$/i.test(file.name)) {
    toast('Upload a PDF or Word file', 'error');
    return;
  }

  const name = await ask({
    title: 'Name this CV',
    message: 'For example "Frontend CV" or "General CV".',
    input: { value: file.name.replace(/\.[^.]+$/, '') },
    okLabel: 'Save',
  });
  if (!name) return;

  const id = crypto.randomUUID();
  try {
    await saveCVBlob(id, new Blob([buffer], { type }));
    const cv = {
      id,
      name,
      filename: file.name,
      uploadedAt: new Date().toISOString(),
      sizeBytes: file.size
    };
    cvs = await store.update('cvs', list => [...list, cv]);
    renderCVs();
  } catch (err) {
    toast('Couldn\'t save that CV. Try again.', 'error');
  }
}

async function previewCV(id) {
  try {
    const blob = await getCVBlob(id);
    if (!blob) throw new Error('missing');
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (err) {
    toast('Couldn\'t open that CV', 'error');
  }
}

function renderCVs() {
  const list = document.getElementById('cvs-list');
  if (!list) return;

  document.getElementById('cv-hint').textContent = IS_POPUP
    ? 'Press Attach to put a CV in the upload field of the page you\'re applying on.'
    : 'Drag a CV onto the upload field of the page you\'re applying on, or press Attach.';

  if (!cvs.length) {
    list.replaceChildren(emptyState('Add your first CV', 'Keep each version here and drop it straight into applications.'));
    return;
  }

  list.replaceChildren(...cvs.map(c => {
    const card = el('div', { className: 'card cv-card', draggable: !IS_POPUP, dataset: { id: c.id } },
      el('div', { className: 'item-name', textContent: c.name }),
      el('div', { className: 'item-note', textContent: c.filename }),
      el('div', { className: 'item-actions' },
        el('button', { className: 'btn btn-small btn-tinted', textContent: 'Attach', dataset: { act: 'attach' } }),
        el('button', { className: 'btn btn-small', textContent: 'Preview', dataset: { act: 'preview' } }),
        el('button', { className: 'btn btn-small', textContent: 'Copy name', dataset: { act: 'copy' } }),
        el('button', { className: 'btn btn-small btn-danger', textContent: 'Delete', dataset: { act: 'delete' } }),
      ),
    );
    card.addEventListener('dragstart', e => onCVDragStart(e, c.id, card));
    card.addEventListener('dragend', () => onCVDragEnd(card));
    return card;
  }));
}

// ── APPLYING: autofill + putting a CV on the page ────────────────
// All of it happens through content/apply.js, which is injected into the
// page only at the moment the user asks for one of these actions.

// Runs fn inside the page — every frame unless frameIds is given — after making
// sure content/apply.js is there. Resolves to [{ frameId, result }].
async function inPage(tabId, fn, args = [], frameIds = null) {
  const target = frameIds ? { tabId, frameIds } : { tabId, allFrames: true };
  await chrome.scripting.executeScript({ target, files: ['content/apply.js'] });
  return chrome.scripting.executeScript({ target, func: fn, args });
}

// Chrome's own pages (new tab, settings, the Web Store) are closed to every extension.
// Says so and returns null there; otherwise returns the tab.
async function webPageTab() {
  const tab = await activeTab();
  if (/^https?:/.test(tab?.url || '')) return tab;
  toast('Chrome doesn\'t let extensions work on this page. Open the application page first.', 'error');
  return null;
}

// Shows Chrome's permission box. Must be called straight from a click.
// Resolves to true once access is granted, and says why when it isn't.
function requestApplyPermission() {
  return chrome.permissions.request(ALL_SITES).then(granted => {
    if (!granted) toast('Not turned on. Chrome shows its own box for this: press Allow there.', 'error');
    return granted;
  }, err => {
    toast(`Chrome refused the request: ${err.message}`, 'error');
    return false;
  });
}

// Asks once for permission to act on the pages the user applies on.
async function ensureApplyPermission() {
  if (applyEnabled) return true;
  let request = null;
  const go = await ask({
    title: 'Let HireTrackr work on this page?',
    message: 'To type your details and attach your CV, HireTrackr needs your permission to act on the sites you apply on. It only does so when you press Autofill or Attach, or drop a CV. Chrome will now show its own box: press Allow.',
    okLabel: 'Continue',
    // must start inside the click, or Chrome refuses to show its box
    onOk: () => { request = requestApplyPermission(); },
  });
  if (!go) return false;
  applyEnabled = await request;
  renderSettings();
  return applyEnabled;
}

async function autofillPage() {
  if (!Object.values(profile).some(Boolean)) {
    showTab('profile');
    toast('Fill in your profile first');
    return;
  }
  const tab = await webPageTab();
  if (!tab || !await ensureApplyPermission()) return;

  try {
    const frames = await inPage(tab.id, p => globalThis.__hiretrackr.fill(p), [profile]);
    const filled = frames.reduce((sum, f) => sum + (f.result || 0), 0);
    toast(filled ? `Filled ${filled} field${filled !== 1 ? 's' : ''}` : 'No empty fields to fill on this page');
  } catch (err) {
    toast('HireTrackr can\'t fill this page', 'error');
  }
}

// What the page needs to rebuild the file: name, type and the bytes as base64
async function cvPayload(id) {
  const cv = cvs.find(c => c.id === id);
  const blob = cv && await getCVBlob(id);
  if (!blob) return null;
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  return { name: cv.filename, type: blob.type || 'application/pdf', b64: dataUrl.slice(dataUrl.indexOf(',') + 1) };
}

// "Attach" button: finds the page's CV upload field and puts the file in it
async function attachCV(id) {
  const tab = await webPageTab();
  if (!tab || !await ensureApplyPermission()) return;

  try {
    const data = await cvPayload(id);
    if (!data) { toast('Couldn\'t read that CV', 'error'); return; }

    const scans = await inPage(tab.id, f => globalThis.__hiretrackr.scanUpload(f), [{ name: data.name, type: data.type }]);
    const best = scans.reduce((a, b) => (b.result || 0) > (a?.result || 0) ? b : a, null);
    if (!best) {
      toast(IS_POPUP
        ? 'No CV upload field found on this page'
        : 'No upload field found. Try dragging the CV onto the upload area.', 'error');
      return;
    }
    await inPage(tab.id, d => globalThis.__hiretrackr.attach(d), [data], [best.frameId]);
    toast(`Attached ${data.name}`);
  } catch (err) {
    toast('HireTrackr can\'t attach a CV on this page', 'error');
  }
}

// Dragging a CV card onto the page. The drag carries no file — it can't — so
// we tell the page a CV is on its way, and hand over the file when it lands.
function onCVDragStart(e, id, card) {
  if (!applyEnabled) {
    // Chrome's permission prompt can't be shown mid-drag: ask now, drag after
    e.preventDefault();
    ensureApplyPermission();
    return;
  }
  e.dataTransfer.effectAllowed = 'copy';
  e.dataTransfer.setData('application/x-hiretrackr-cv', id);
  card.classList.add('dragging');

  const drag = { id, tabId: null, until: Infinity, ready: null };
  drag.ready = (async () => {
    const tab = await webPageTab();
    if (!tab) return;
    drag.tabId = tab.id;
    await inPage(tab.id, () => globalThis.__hiretrackr.dragStart());
  })().catch(() => {
    toast('HireTrackr can\'t drop a CV on this page', 'error');
  });
  draggedCV = drag;
}

function onCVDragEnd(card) {
  card.classList.remove('dragging');
  const drag = draggedCV;
  if (!drag) return;
  drag.until = Date.now() + 5000;   // the page may still be asking for the file
  drag.ready.then(() => {
    if (drag.tabId !== null) inPage(drag.tabId, () => globalThis.__hiretrackr.dragEnd()).catch(() => {});
  });
}

// Messages from content/apply.js after a drop
function onPageMessage(msg, sender, sendResponse) {
  const drag = draggedCV;
  if (sender.id !== chrome.runtime.id || !sender.tab) return;
  // Only the panel the CV was dragged from answers, and only for that tab and moment
  if (!drag || drag.tabId !== sender.tab.id || Date.now() > drag.until) return;

  if (msg?.type === 'HT_GET_DRAGGED_CV') {
    cvPayload(drag.id).then(sendResponse, () => sendResponse(null));
    return true;   // answer comes later
  }
  if (msg?.type === 'HT_DROP_RESULT') {
    if (!msg.ok) toast('Couldn\'t drop that CV', 'error');
    else if (msg.via === 'input') toast('CV attached');
    else toast('CV dropped. Check the page shows it.');
  }
}

// ── PROFILE + SETTINGS ───────────────────────────────────────────
function renderProfile() {
  const form = document.getElementById('profile-form');
  const nodes = [];
  for (let i = 0; i < PROFILE_FIELDS.length; i++) {
    const make = f => field(f.label, el('input', {
      id: 'p-' + f.key,
      type: f.type || 'text',
      placeholder: f.placeholder || '',
      value: profile[f.key] || '',
      maxLength: 200,
    }));
    const f = PROFILE_FIELDS[i];
    if (f.pair && PROFILE_FIELDS[i + 1]?.pair) {
      nodes.push(el('div', { className: 'field-pair' }, make(f), make(PROFILE_FIELDS[++i])));
    } else {
      nodes.push(make(f));
    }
  }
  form.replaceChildren(...nodes);
}

async function saveProfile() {
  const next = {};
  for (const f of PROFILE_FIELDS) {
    next[f.key] = document.getElementById('p-' + f.key).value.trim().slice(0, 200);
  }
  profile = await store.update('profile', () => next, {});
  toast('Profile saved');
}

function renderSettings() {
  const theme = settings.theme === 'light' || settings.theme === 'dark' ? settings.theme : 'system';
  document.querySelectorAll('#theme-choice .seg').forEach(seg =>
    seg.classList.toggle('active', seg.dataset.themeChoice === theme));

  const openAs = settings.openAs === 'popup' ? 'popup' : 'panel';
  document.querySelectorAll('#open-as .seg').forEach(seg =>
    seg.classList.toggle('active', seg.dataset.openAs === openAs));

  document.getElementById('apply-status').textContent = applyEnabled
    ? 'On. HireTrackr acts on a page only when you ask it to.'
    : 'Off. Turn on to fill forms and attach CVs.';
  const toggle = document.getElementById('apply-toggle');
  toggle.textContent = applyEnabled ? 'Turn off' : 'Turn on';
  toggle.classList.toggle('btn-tinted', !applyEnabled);
}

// The pipeline page follows too: it listens for the settings change
async function setTheme(theme) {
  applyTheme(theme);
  settings = await store.update('settings', s => ({ ...s, theme }), {});
  renderSettings();
}

async function setOpenAs(openAs) {
  if ((settings.openAs === 'popup' ? 'popup' : 'panel') === openAs) return;
  // background.js picks this up and changes what the toolbar icon does
  settings = await store.update('settings', s => ({ ...s, openAs }), {});
  renderSettings();
  toast(openAs === 'popup'
    ? 'The toolbar icon now opens a popup'
    : 'The toolbar icon now opens the side panel');
}

async function toggleApplyPermission() {
  // called straight from the click, so Chrome will show its prompt
  if (applyEnabled) await chrome.permissions.remove(ALL_SITES).catch(() => {});
  else await requestApplyPermission();
  applyEnabled = await chrome.permissions.contains(ALL_SITES).catch(() => false);
  renderSettings();
}

// ── EMAIL TEMPLATES + SNIPPETS ────────────────────────────────────
function openModal(type, existing = null) {
  const isTemplate = type === 'template';
  editingJobId = null;
  document.getElementById('modal-title').textContent =
    existing ? `Edit ${type}` : `New ${isTemplate ? 'email template' : 'snippet'}`;

  const save = el('button', {
    className: 'btn btn-primary btn-block',
    id: 'modal-save-btn',
    textContent: isTemplate ? 'Save template' : 'Save snippet',
    onclick: () => isTemplate ? saveTemplate(existing?.id) : saveSnippet(existing?.id),
  });

  document.getElementById('modal-body').replaceChildren(...(isTemplate ? [
    field('Template name', el('input', { id: 't-name', placeholder: 'Follow-up email', value: existing?.name || '' })),
    field('Subject line', el('input', { id: 't-subject', placeholder: 'Re: Application for {{role}}', value: existing?.subject || '' })),
    field('Body', el('textarea', { id: 't-body', placeholder: 'Hi {{name}},\n\nI wanted to follow up...', value: existing?.body || '' })),
    el('p', { className: 'hint', textContent: 'Use {{company}}, {{role}}, {{name}} as placeholders.' }),
  ] : [
    field('Label', el('input', { id: 's-label', placeholder: 'My bio', value: existing?.label || '' })),
    field('Content', el('textarea', { id: 's-content', placeholder: 'Paste your reusable text here...', value: existing?.content || '' })),
  ]), el('div', { className: 'sheet-actions' }, save));
  openSheet();
}

async function saveTemplate(existingId) {
  const t = {
    id: existingId || crypto.randomUUID(),
    name:    document.getElementById('t-name').value.trim().slice(0, 100),
    subject: document.getElementById('t-subject').value.trim().slice(0, 200),
    body:    document.getElementById('t-body').value.trim().slice(0, 10000),
  };
  if (!t.name || !t.body) { toast('Enter a name and a body', 'error'); return; }
  templates = await store.update('templates', list =>
    existingId ? list.map(x => x.id === existingId ? t : x) : [t, ...list]
  );
  renderTemplates();
  closeModal();
}

function renderTemplates() {
  const list = document.getElementById('templates-list');
  if (!list) return;
  if (!templates.length) {
    list.replaceChildren(emptyState('Write your first template', 'Follow-ups and applications, ready to copy.'));
    return;
  }
  list.innerHTML = templates.map(t => `
    <div class="card">
      <div class="item-name">${escHtml(t.name)}</div>
      <div class="item-note">${escHtml(t.subject)}</div>
      <div class="item-actions">
        <button class="btn btn-small btn-tinted" data-copy-t="${escHtml(t.id)}">Copy</button>
        <button class="btn btn-small" data-edit-t="${escHtml(t.id)}">Edit</button>
        <button class="btn btn-small btn-danger" data-del-t="${escHtml(t.id)}">Delete</button>
      </div>
    </div>`).join('');
  // Event delegation handled in bindButtons - prevents memory leaks
}

async function saveSnippet(existingId) {
  const s = {
    id: existingId || crypto.randomUUID(),
    label:   document.getElementById('s-label').value.trim().slice(0, 100),
    content: document.getElementById('s-content').value.trim().slice(0, 10000),
  };
  if (!s.label || !s.content) { toast('Enter a label and some content', 'error'); return; }
  snippets = await store.update('snippets', list =>
    existingId ? list.map(x => x.id === existingId ? s : x) : [s, ...list]
  );
  renderSnippets();
  closeModal();
}

function renderSnippets() {
  const list = document.getElementById('snippets-list');
  if (!list) return;
  if (!snippets.length) {
    list.replaceChildren(emptyState('Save your first snippet', 'Bios, skill lists, answers you keep retyping.'));
    return;
  }
  list.innerHTML = snippets.map(s => `
    <div class="card">
      <div class="item-name">${escHtml(s.label)}</div>
      <div class="item-note">${escHtml(s.content.length > 60 ? s.content.substring(0, 60) + '...' : s.content)}</div>
      <div class="item-actions">
        <button class="btn btn-small btn-tinted" data-copy-s="${escHtml(s.id)}">Copy</button>
        <button class="btn btn-small" data-edit-s="${escHtml(s.id)}">Edit</button>
        <button class="btn btn-small btn-danger" data-del-s="${escHtml(s.id)}">Delete</button>
      </div>
    </div>`).join('');
  // Event delegation handled in bindButtons - prevents memory leaks
}

// ── UTILS ─────────────────────────────────────────────────────────
function openSheet() {
  document.getElementById('job-modal').classList.add('open');
}

function closeModal() {
  document.getElementById('job-modal').classList.remove('open');
  editingJobId = null;
}
