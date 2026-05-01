// ── State ────────────────────────────────────────────────────────
let store = null;
let jobs = [], cvs = [], templates = [], snippets = [];
let editingJobId = null;

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

function escHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// ── Flash helper ─────────────────────────────────────────────────
function flashButton(id, text, color) {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.textContent = text;
  btn.style.background = color;
  setTimeout(() => {
    btn.textContent = '+ Save this job';
    btn.style.background = '';
  }, 2000);
}

// ── Boot (runs when popup HTML is ready) ─────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
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

  jobs      = await store.get('jobs');
  cvs       = await store.get('cvs');
  templates = await store.get('templates');
  snippets  = await store.get('snippets');

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
      document.getElementById('main-app').style.display = 'block';
    });
    return; // don't render the rest yet
  }

  // Add this line right after loading cvs and before renderAll():
  await migrateCVsToIndexedDB();

  renderAll();
  bindTabs();
  bindButtons();

  // Wire help icon to open help screen
  document.getElementById('help-icon')?.addEventListener('click', () => {
    document.getElementById('main-app').style.display = 'none';
    document.getElementById('onboarding').style.display = 'block';
  });

  // Hard-wire the Help Screen Close Button
  const closeHelpBtn = document.getElementById('close-help-btn');
  if (closeHelpBtn) {
    closeHelpBtn.addEventListener('click', () => {
      document.getElementById('onboarding').style.display = 'none';
      document.getElementById('main-app').style.display = 'block';
    });
  }

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
});

// ── Render all panels ────────────────────────────────────────────
function renderAll() {
  renderJobs();
  renderCVs();
  renderTemplates();
  renderSnippets();
  const el = document.getElementById('job-count');
  if (el) el.textContent = `${jobs.length} job${jobs.length !== 1 ? 's' : ''} saved`;
}

// ── Tabs ─────────────────────────────────────────────────────────
function bindTabs() {
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
      btn.classList.add('active');
      const panel = document.getElementById('tab-' + btn.dataset.tab);
      if (panel) panel.classList.remove('hidden');
    });
  });
}

// ── Bind main buttons ─────────────────────────────────────────────
function bindButtons() {
  document.getElementById('save-job-btn').addEventListener('click', saveCurrentJob);
  document.getElementById('cv-upload').addEventListener('change', handleCVUpload);
  document.getElementById('add-template-btn').addEventListener('click', () => openModal('template'));
  document.getElementById('add-snippet-btn').addEventListener('click', () => openModal('snippet'));
  document.getElementById('open-pipeline').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('pipeline/pipeline.html') });
  });
  document.getElementById('close-modal').addEventListener('click', closeModal);
  document.getElementById('job-search')
    ?.addEventListener('input', renderJobs);
  document.getElementById('status-filter')
    ?.addEventListener('change', renderJobs);
  document.getElementById('export-csv-btn')
    ?.addEventListener('click', exportJobsCSV);
}

// ── SAVE JOB ──────────────────────────────────────────────────────
async function saveCurrentJob() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  const exists = jobs.find(j => j.url === tab.url);
  if (exists) {
    flashButton('save-job-btn', 'Already saved ✓', '#888');
    return;
  }

  const check = isLikelyJobPage(tab.url, tab.title);
  if (!check.ok) {
    flashButton('save-job-btn', 'Not a job page', '#c0392b');
    return;
  }
  if (check.warning) {
    const go = confirm('This page might not be a job listing. Save anyway?');
    if (!go) return;
  }

  const job = {
    id: crypto.randomUUID(),
    title: tab.title.split(' - ')[0] || 'Untitled Job',
    company: extractCompany(tab.title),
    url: tab.url,
    status: 'saved',
    cvId: null,
    emailed: false,
    notes: '',
    savedAt: new Date().toISOString(),
    syncedAt:  null,   // ISO string — set when synced to cloud (Pro only). null = not synced.
    remindAt:  null,   // ISO string — follow-up reminder date (Pro only). null = no reminder.
  };
  jobs.unshift(job);
  await store.set('jobs', jobs);
  flashButton('save-job-btn', 'Saved ✓', '#1D9E75');
  renderJobs();
  document.getElementById('job-count').textContent = `${jobs.length} jobs saved`;
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

// ── RENDER JOBS ───────────────────────────────────────────────────
function renderJobs() {
  const list = document.getElementById('jobs-list');
  if (!list) return;
  const filteredJobs = getFilteredJobs();
  if (!filteredJobs.length) {
    list.innerHTML = '<p style="color:#aaa;font-size:12px;text-align:center;padding:20px 0;">No jobs match your filters.<br>Try adjusting search or filter criteria.</p>';
    return;
  }
  list.innerHTML = filteredJobs.map(j => {
    const cv = cvs.find(c => c.id === j.cvId);
    return `
      <div class="job-card" data-id="${j.id}">
        <div class="job-top">
          <div>
            <div class="job-title">${escHtml(j.title)}</div>
            <div class="job-company">${escHtml(j.company)}</div>
          </div>
          <span class="pill pill-${j.status}">${escHtml(j.status)}</span>
        </div>
        <div class="job-meta">
          <span class="cv-tag">${cv ? escHtml(cv.name) : 'No CV attached'}</span>
          <span class="email-indicator ${j.emailed ? 'emailed' : 'not-emailed'}"></span>
          <span style="font-size:10px;color:#888;">${j.emailed ? 'Emailed' : 'Not emailed'}</span>
        </div>
      </div>`;
  }).join('');
  list.querySelectorAll('.job-card').forEach(card => {
    card.addEventListener('click', () => openJobModal(card.dataset.id));
  });
}

// ── JOB MODAL ────────────────────────────────────────────────────
function openJobModal(id) {
  const job = jobs.find(j => j.id === id);
  if (!job) return;
  editingJobId = id;
  document.getElementById('modal-title').textContent = job.title;
  document.getElementById('modal-body').innerHTML = `
    <div class="field"><label>Status</label>
      <select id="m-status">
        ${['saved','applied','interview','offer','rejected'].map(s =>
          `<option value="${s}" ${job.status===s?'selected':''}>${s.charAt(0).toUpperCase()+s.slice(1)}</option>`
        ).join('')}
      </select></div>
    <div class="field"><label>CV Used</label>
      <select id="m-cv">
        <option value="">None</option>
        ${cvs.map(c => `<option value="${c.id}" ${job.cvId===c.id?'selected':''}>${escHtml(c.name)}</option>`).join('')}
      </select></div>
    <div class="field"><label>Emailed recruiter?</label>
      <select id="m-emailed">
        <option value="false" ${!job.emailed?'selected':''}>No</option>
        <option value="true" ${job.emailed?'selected':''}>Yes</option>
      </select></div>
    <div class="field"><label>Notes</label>
      <textarea id="m-notes" placeholder="Interview notes, salary, contact...">${escHtml(job.notes)}</textarea></div>
    <div class="field"><label>Link</label>
      <input id="m-url" value="${escHtml(job.url)}" readonly style="color:#888;" /></div>
    <button class="btn-primary modal-save" id="save-job-modal">Save changes</button>
    <button class="btn-sm btn-danger" id="delete-job" style="width:100%;margin-top:6px;">Delete job</button>
  `;
  document.getElementById('save-job-modal').addEventListener('click', saveJobModal);
  document.getElementById('delete-job').addEventListener('click', deleteJob);
  document.getElementById('job-modal').classList.remove('hidden');
}

async function saveJobModal() {
  const job = jobs.find(j => j.id === editingJobId);
  if (!job) return;
  job.title   = document.getElementById('m-title').value.trim().slice(0, 200)   || job.title;
  job.company = document.getElementById('m-company')?.value.trim().slice(0, 100) || job.company;
  job.status  = document.getElementById('m-status').value;
  job.cvId    = document.getElementById('m-cv').value || null;
  job.emailed = document.getElementById('m-emailed').value === 'true';
  job.notes   = document.getElementById('m-notes').value.trim().slice(0, 5000);
  await store.set('jobs', jobs);
  renderJobs();
  closeModal();
}

async function deleteJob() {
  jobs = jobs.filter(j => j.id !== editingJobId);
  await store.set('jobs', jobs);
  renderAll();
  closeModal();
}

// ── CV VAULT ─────────────────────────────────────────────────────
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

function renderCVs() {
  const list = document.getElementById('cvs-list');
  if (!list) return;
  if (!cvs.length) {
    list.innerHTML = '<p style="color:#aaa;font-size:12px;text-align:center;padding:20px 0;">No CVs uploaded yet.</p>';
    return;
  }
  list.innerHTML = cvs.map(c => `
    <div class="cv-card">
      <div><div class="cv-name">${escHtml(c.name)}</div><div class="cv-type">${escHtml(c.filename)}</div></div>
      <div class="cv-actions">
        <button class="btn-sm" data-copy="${c.id}">Copy</button>
        <button class="btn-sm btn-danger" data-del="${c.id}">✕</button>
      </div>
    </div>`).join('');
  list.querySelectorAll('[data-copy]').forEach(btn =>
    btn.addEventListener('click', () => {
      const cv = cvs.find(c => c.id === btn.dataset.copy);
      navigator.clipboard.writeText(`CV: ${cv.name}\nFile: ${cv.filename}`);
      btn.textContent = 'Copied!';
      setTimeout(() => btn.textContent = 'Copy', 1500);
    })
  );
  list.querySelectorAll('[data-del]').forEach(btn =>
    btn.addEventListener('click', async () => {
      const id = btn.dataset.del;
      await deleteCVBlob(id).catch(e => console.error('Blob delete failed:', e));
      cvs = cvs.filter(c => c.id !== id);
      await store.set('cvs', cvs);
      renderCVs();
    })
  );
}

// ── EMAIL TEMPLATES ───────────────────────────────────────────────
function openModal(type, existing = null) {
  const isTemplate = type === 'template';
  document.getElementById('modal-title').textContent =
    existing ? `Edit ${type}` : `New ${isTemplate ? 'email template' : 'snippet'}`;

  document.getElementById('modal-body').innerHTML = isTemplate ? `
    <div class="field"><label>Template name</label>
      <input id="t-name" placeholder="e.g. Follow-up email" value="${existing?.name||''}" /></div>
    <div class="field"><label>Subject line</label>
      <input id="t-subject" placeholder="Re: Application for {{role}}" value="${existing?.subject||''}" /></div>
    <div class="field"><label>Body</label>
      <textarea id="t-body" placeholder="Hi {{name}},\n\nI wanted to follow up...">${existing?.body||''}</textarea></div>
    <p style="font-size:10px;color:#aaa;margin-bottom:10px;">Use {{company}}, {{role}}, {{name}} as placeholders.</p>
    <button class="btn-primary" id="modal-save-btn">Save template</button>
  ` : `
    <div class="field"><label>Label</label>
      <input id="s-label" placeholder="e.g. My bio, Core skills" value="${existing?.label||''}" /></div>
    <div class="field"><label>Content</label>
      <textarea id="s-content" placeholder="Paste your reusable text here...">${existing?.content||''}</textarea></div>
    <button class="btn-primary" id="modal-save-btn">Save snippet</button>
  `;

  document.getElementById('modal-save-btn').addEventListener('click', () =>
    isTemplate ? saveTemplate(existing?.id) : saveSnippet(existing?.id)
  );
  document.getElementById('job-modal').classList.remove('hidden');
}

async function saveTemplate(existingId) {
  const t = {
    id: existingId || crypto.randomUUID(),
    name:    document.getElementById('t-name').value.trim().slice(0, 100),
    subject: document.getElementById('t-subject').value.trim().slice(0, 200),
    body:    document.getElementById('t-body').value.trim().slice(0, 10000),
  };
  if (!t.name || !t.body) { alert('Name and body are required.'); return; }
  templates = existingId ? templates.map(x => x.id === existingId ? t : x) : [t, ...templates];
  await store.set('templates', templates);
  renderTemplates();
  closeModal();
}

function renderTemplates() {
  const list = document.getElementById('templates-list');
  if (!list) return;
  if (!templates.length) {
    list.innerHTML = '<p style="color:#aaa;font-size:12px;text-align:center;padding:20px 0;">No templates yet.</p>';
    return;
  }
  list.innerHTML = templates.map(t => `
    <div class="cv-card">
      <div><div class="cv-name">${escHtml(t.name)}</div><div class="cv-type">${escHtml(t.subject)}</div></div>
      <div class="cv-actions">
        <button class="btn-sm" data-copy-t="${t.id}">Copy</button>
        <button class="btn-sm" data-edit-t="${t.id}">Edit</button>
        <button class="btn-sm btn-danger" data-del-t="${t.id}">✕</button>
      </div>
    </div>`).join('');
  list.querySelectorAll('[data-copy-t]').forEach(b => b.addEventListener('click', () => {
    const t = templates.find(x => x.id === b.dataset.copyT);
    navigator.clipboard.writeText(`Subject: ${t.subject}\n\n${t.body}`);
    b.textContent = 'Copied!';
    setTimeout(() => b.textContent = 'Copy', 1500);
  }));
  list.querySelectorAll('[data-edit-t]').forEach(b => b.addEventListener('click', () =>
    openModal('template', templates.find(x => x.id === b.dataset.editT))
  ));
  list.querySelectorAll('[data-del-t]').forEach(b => b.addEventListener('click', async () => {
    templates = templates.filter(x => x.id !== b.dataset.delT);
    await store.set('templates', templates);
    renderTemplates();
  }));
}

// ── SNIPPETS ──────────────────────────────────────────────────────
async function saveSnippet(existingId) {
  const s = {
    id: existingId || crypto.randomUUID(),
    label:   document.getElementById('s-label').value.trim().slice(0, 100),
    content: document.getElementById('s-content').value.trim().slice(0, 10000),
  };
  if (!s.label || !s.content) { alert('Label and content are required.'); return; }
  snippets = existingId ? snippets.map(x => x.id === existingId ? s : x) : [s, ...snippets];
  await store.set('snippets', snippets);
  renderSnippets();
  closeModal();
}

function renderSnippets() {
  const list = document.getElementById('snippets-list');
  if (!list) return;
  if (!snippets.length) {
    list.innerHTML = '<p style="color:#aaa;font-size:12px;text-align:center;padding:20px 0;">No snippets yet.</p>';
    return;
  }
  list.innerHTML = snippets.map(s => `
    <div class="cv-card">
      <div><div class="cv-name">${escHtml(s.label)}</div><div class="cv-type">${escHtml(s.content.substring(0,40))}...</div></div>
      <div class="cv-actions">
        <button class="btn-sm" data-copy-s="${s.id}">Copy</button>
        <button class="btn-sm" data-edit-s="${s.id}">Edit</button>
        <button class="btn-sm btn-danger" data-del-s="${s.id}">✕</button>
      </div>
    </div>`).join('');
  list.querySelectorAll('[data-copy-s]').forEach(b => b.addEventListener('click', () => {
    navigator.clipboard.writeText(snippets.find(x => x.id === b.dataset.copyS).content);
    b.textContent = 'Copied!';
    setTimeout(() => b.textContent = 'Copy', 1500);
  }));
  list.querySelectorAll('[data-edit-s]').forEach(b => b.addEventListener('click', () =>
    openModal('snippet', snippets.find(x => x.id === b.dataset.editS))
  ));
  list.querySelectorAll('[data-del-s]').forEach(b => b.addEventListener('click', async () => {
    snippets = snippets.filter(x => x.id !== b.dataset.delS);
    await store.set('snippets', snippets);
    renderSnippets();
  }));
}

// ── UTILS ─────────────────────────────────────────────────────────
function closeModal() {
  document.getElementById('job-modal').classList.add('hidden');
  editingJobId = null;
}
