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
      // Migration failed silently - CV will remain in old format
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
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(data[key] || []);
        }
      });
    }),
    set: (key, val) => new Promise((resolve, reject) => {
      chrome.storage.local.set({ [key]: val }, () => {
        if (chrome.runtime.lastError) {
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
    document.getElementById('close-help-btn').addEventListener('click', async () => {
      await new Promise(res => chrome.storage.local.set({ onboarded: true }, res));
      document.getElementById('onboarding').style.display = 'none';
      document.getElementById('main-app').style.display = 'block';
      await migrateCVsToIndexedDB();
      renderAll();
      bindTabs();
      bindButtons();
    });
    return;
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

  // Protect support email from scrapers - inject dynamically with obfuscation
  const supportEmailLink = document.getElementById('support-email');
  if (supportEmailLink) {
    // Obfuscated email - split and reversed to prevent simple scraping
    const user = ['m', 'o', 'c', '.', 't', 'r', 'a', 'c', 'k', 'e', 'r', 'i', 'h'].reverse().join('');
    const domain = ['m', 'o', 'c', '.', 'l', 'i', 'a', 'm', 'g'].reverse().join('');
    const email = user + '@' + domain;
    
    supportEmailLink.href = 'mailto:' + email;
    supportEmailLink.textContent = 'Contact Support';
  }

  // Listen for job data extracted by content.js
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    // Only accept messages from our own content scripts
    // Verify sender has a tab (content script) and valid origin
    if (!sender.tab || !sender.url) return;
    
    // Additional security: verify the sender is from a known job board domain
    try {
      const senderUrl = new URL(sender.url);
      const knownJobBoards = [
        'linkedin.com', 'indeed.com', 'greenhouse.io', 'lever.co', 'glassdoor.com',
        'rekrute.com', 'bayt.com', 'wuzzuf.net', 'akhtaboot.com', 'emploi.ma',
        'myworkday.com', 'ashbyhq.com'
      ];
      
      // Check if sender URL contains any known job board domain
      const isKnownJobBoard = knownJobBoards.some(board => 
        senderUrl.hostname.includes(board) || senderUrl.hostname.endsWith('.' + board)
      );
      
      if (!isKnownJobBoard) return;
    } catch (e) {
      // Invalid URL, reject message
      return;
    }

    // Validate message structure
    if (!msg || typeof msg !== 'object' || msg.type !== 'JOB_DATA') return;
    
    // Validate fields exist and are strings before using them
    const title   = typeof msg.title   === 'string' ? msg.title.trim().slice(0, 200)   : '';
    const company = typeof msg.company === 'string' ? msg.company.trim().slice(0, 100) : '';

    // Pre-fill the save form if data arrives (optional enhancement for content.js)
    if (title) {
      const btn = document.getElementById('save-job-btn');
      if (btn) btn.dataset.prefillTitle   = title;
      if (btn) btn.dataset.prefillCompany = company;
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
  
  // Event delegation for job cards - prevents memory leaks
  const jobsList = document.getElementById('jobs-list');
  if (jobsList) {
    jobsList.addEventListener('click', (e) => {
      const jobCard = e.target.closest('.job-card');
      if (jobCard && jobCard.dataset.id) {
        openJobModal(jobCard.dataset.id);
      }
    });
  }
  
  // Event delegation for CV actions - prevents memory leaks
  const cvsList = document.getElementById('cvs-list');
  if (cvsList) {
    cvsList.addEventListener('click', async (e) => {
      const copyBtn = e.target.closest('[data-copy]');
      const delBtn = e.target.closest('[data-del]');
      
      if (copyBtn) {
        const cv = cvs.find(c => c.id === copyBtn.dataset.copy);
        if (cv) {
          navigator.clipboard.writeText(`CV: ${cv.name}\nFile: ${cv.filename}`);
          const originalText = copyBtn.textContent;
          copyBtn.textContent = 'Copied!';
          setTimeout(() => {
            copyBtn.textContent = originalText;
          }, 1500);
        }
      } else if (delBtn) {
        const id = delBtn.dataset.del;
        await deleteCVBlob(id).catch(() => {}); // Silently ignore blob delete failures
        cvs = cvs.filter(c => c.id !== id);
        await store.set('cvs', cvs);
        renderCVs();
      }
    });
  }
  
  // Event delegation for templates - prevents memory leaks
  const templatesList = document.getElementById('templates-list');
  if (templatesList) {
    templatesList.addEventListener('click', async (e) => {
      const copyBtn = e.target.closest('[data-copy-t]');
      const editBtn = e.target.closest('[data-edit-t]');
      const delBtn = e.target.closest('[data-del-t]');
      
      if (copyBtn) {
        const t = templates.find(x => x.id === copyBtn.dataset.copyT);
        if (t) {
          navigator.clipboard.writeText(`Subject: ${t.subject}\n\n${t.body}`);
          const originalText = copyBtn.textContent;
          copyBtn.textContent = 'Copied!';
          setTimeout(() => {
            copyBtn.textContent = originalText;
          }, 1500);
        }
      } else if (editBtn) {
        const template = templates.find(x => x.id === editBtn.dataset.editT);
        if (template) openModal('template', template);
      } else if (delBtn) {
        templates = templates.filter(x => x.id !== delBtn.dataset.delT);
        await store.set('templates', templates);
        renderTemplates();
      }
    });
  }
  
  // Event delegation for snippets - prevents memory leaks
  const snippetsList = document.getElementById('snippets-list');
  if (snippetsList) {
    snippetsList.addEventListener('click', async (e) => {
      const copyBtn = e.target.closest('[data-copy-s]');
      const editBtn = e.target.closest('[data-edit-s]');
      const delBtn = e.target.closest('[data-del-s]');
      
      if (copyBtn) {
        const s = snippets.find(x => x.id === copyBtn.dataset.copyS);
        if (s) {
          navigator.clipboard.writeText(s.content);
          const originalText = copyBtn.textContent;
          copyBtn.textContent = 'Copied!';
          setTimeout(() => {
            copyBtn.textContent = originalText;
          }, 1500);
        }
      } else if (editBtn) {
        const snippet = snippets.find(x => x.id === editBtn.dataset.editS);
        if (snippet) openModal('snippet', snippet);
      } else if (delBtn) {
        snippets = snippets.filter(x => x.id !== delBtn.dataset.delS);
        await store.set('snippets', snippets);
        renderSnippets();
      }
    });
  }
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

  const btn = document.getElementById('save-job-btn');
  const prefillTitle   = btn?.dataset.prefillTitle   || '';
  const prefillCompany = btn?.dataset.prefillCompany || '';
  const rawTitle = tab.title.split(' - ')[0].split(' | ')[0].trim() || 'Untitled Job';

  const job = {
    id: crypto.randomUUID(),
    title: (prefillTitle || rawTitle).slice(0, 200),
    company: (prefillCompany || extractCompany(tab.title)).slice(0, 100),
    url: tab.url,
    status: 'saved',
    cvId: null,
    emailed: false,
    notes: '',
    savedAt: new Date().toISOString(),
    syncedAt:  null,   // ISO string — set when synced to cloud (Pro only). null = not synced.
    remindAt:  null,   // ISO string — follow-up reminder date (Pro only). null = no reminder.
  };
  if (btn) { delete btn.dataset.prefillTitle; delete btn.dataset.prefillCompany; }
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

    const csv = '\uFEFF' + [headers.join(','), ...rows].join('\n'); // BOM for Excel compatibility
    
    // Create blob with error handling
    let blob;
    try {
      blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    } catch (blobError) {
      throw new Error('Failed to create CSV file. Your browser may not support this feature.');
    }
    
    // Create download URL with error handling
    let url;
    try {
      url = URL.createObjectURL(blob);
    } catch (urlError) {
      throw new Error('Failed to create download link. Please try again.');
    }
    
    // Create and trigger download
    const a = document.createElement('a');
    a.href = url;
    a.download = `hiretrack-export-${new Date().toISOString().slice(0, 10)}.csv`;
    
    try {
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (downloadError) {
      throw new Error('Failed to start download. Please check your browser settings.');
    }
    
    // Clean up URL object
    setTimeout(() => {
      try {
        URL.revokeObjectURL(url);
      } catch (revokeError) {
        // Silently ignore cleanup errors
      }
    }, 1000);
    
  } catch (error) {
    // Show user-friendly error message
    const errorMessage = error.message || 'An unexpected error occurred while exporting CSV.';
    alert(`Export failed: ${errorMessage}`);
  }
}

// ── RENDER JOBS ───────────────────────────────────────────────────
function renderJobs() {
  const list = document.getElementById('jobs-list');
  if (!list) return;
  const filteredJobs = getFilteredJobs();
  
  if (!jobs.length) {
    list.innerHTML = '<p style="color:#aaa;font-size:12px;text-align:center;padding:20px 0;">No jobs saved yet.<br>Browse a job listing and click \'+ Save this job\'</p>';
    return;
  }
  
  if (!filteredJobs.length) {
    list.innerHTML = '<p style="color:#aaa;font-size:12px;text-align:center;padding:20px 0;">No jobs match your search. Try adjusting the filter.</p>';
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
  // Event delegation - single listener handles all job card clicks
  // This prevents memory leaks from accumulating event listeners
}

// ── JOB MODAL ────────────────────────────────────────────────────
function openJobModal(id) {
  const job = jobs.find(j => j.id === id);
  if (!job) return;
  editingJobId = id;
  document.getElementById('modal-title').textContent = job.title;
  
  // Clear modal body safely
  const modalBody = document.getElementById('modal-body');
  modalBody.innerHTML = '';
  
  // Create title field
  const titleField = document.createElement('div');
  titleField.className = 'field';
  const titleLabel = document.createElement('label');
  titleLabel.textContent = 'Job Title';
  titleField.appendChild(titleLabel);
  
  const titleInput = document.createElement('input');
  titleInput.id = 'm-title';
  titleInput.value = job.title;
  titleField.appendChild(titleInput);
  modalBody.appendChild(titleField);
  
  // Create company field
  const companyField = document.createElement('div');
  companyField.className = 'field';
  const companyLabel = document.createElement('label');
  companyLabel.textContent = 'Company';
  companyField.appendChild(companyLabel);
  
  const companyInput = document.createElement('input');
  companyInput.id = 'm-company';
  companyInput.value = job.company;
  companyField.appendChild(companyInput);
  modalBody.appendChild(companyField);
  
  // Create status field
  const statusField = document.createElement('div');
  statusField.className = 'field';
  const statusLabel = document.createElement('label');
  statusLabel.textContent = 'Status';
  statusField.appendChild(statusLabel);
  
  const statusSelect = document.createElement('select');
  statusSelect.id = 'm-status';
  ['saved','applied','interview','offer','rejected'].forEach(s => {
    const option = document.createElement('option');
    option.value = s;
    option.textContent = s.charAt(0).toUpperCase() + s.slice(1);
    if (job.status === s) option.selected = true;
    statusSelect.appendChild(option);
  });
  statusField.appendChild(statusSelect);
  modalBody.appendChild(statusField);
  
  // Create CV field
  const cvField = document.createElement('div');
  cvField.className = 'field';
  const cvLabel = document.createElement('label');
  cvLabel.textContent = 'CV Used';
  cvField.appendChild(cvLabel);
  
  const cvSelect = document.createElement('select');
  cvSelect.id = 'm-cv';
  const noneOption = document.createElement('option');
  noneOption.value = '';
  noneOption.textContent = 'None';
  cvSelect.appendChild(noneOption);
  
  cvs.forEach(c => {
    const option = document.createElement('option');
    option.value = c.id;
    option.textContent = c.name; // Safe: textContent automatically escapes
    if (job.cvId === c.id) option.selected = true;
    cvSelect.appendChild(option);
  });
  cvField.appendChild(cvSelect);
  modalBody.appendChild(cvField);
  
  // Create emailed field
  const emailedField = document.createElement('div');
  emailedField.className = 'field';
  const emailedLabel = document.createElement('label');
  emailedLabel.textContent = 'Emailed recruiter?';
  emailedField.appendChild(emailedLabel);
  
  const emailedSelect = document.createElement('select');
  emailedSelect.id = 'm-emailed';
  const noOption = document.createElement('option');
  noOption.value = 'false';
  noOption.textContent = 'No';
  if (!job.emailed) noOption.selected = true;
  emailedSelect.appendChild(noOption);
  
  const yesOption = document.createElement('option');
  yesOption.value = 'true';
  yesOption.textContent = 'Yes';
  if (job.emailed) yesOption.selected = true;
  emailedSelect.appendChild(yesOption);
  emailedField.appendChild(emailedSelect);
  modalBody.appendChild(emailedField);
  
  // Create notes field
  const notesField = document.createElement('div');
  notesField.className = 'field';
  const notesLabel = document.createElement('label');
  notesLabel.textContent = 'Notes';
  notesField.appendChild(notesLabel);
  
  const notesTextarea = document.createElement('textarea');
  notesTextarea.id = 'm-notes';
  notesTextarea.placeholder = 'Interview notes, salary, contact...';
  notesTextarea.value = job.notes; // Safe: textarea value automatically escapes
  notesField.appendChild(notesTextarea);
  modalBody.appendChild(notesField);
  
  // Create URL field
  const urlField = document.createElement('div');
  urlField.className = 'field';
  const urlLabel = document.createElement('label');
  urlLabel.textContent = 'Link';
  urlField.appendChild(urlLabel);
  
  const urlInput = document.createElement('input');
  urlInput.id = 'm-url';
  urlInput.value = job.url; // Safe: input value automatically escapes
  urlInput.readOnly = true;
  urlInput.style.color = '#888';
  urlField.appendChild(urlInput);
  modalBody.appendChild(urlField);
  
  // Create save button
  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn-primary modal-save';
  saveBtn.id = 'save-job-modal';
  saveBtn.textContent = 'Save changes';
  modalBody.appendChild(saveBtn);
  
  // Create delete button
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'btn-sm btn-danger';
  deleteBtn.id = 'delete-job';
  deleteBtn.textContent = 'Delete job';
  deleteBtn.style.width = '100%';
  deleteBtn.style.marginTop = '6px';
  modalBody.appendChild(deleteBtn);
  
  // Add event listeners
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

  // File validation - 5MB limit and allowed MIME types
  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
  const ALLOWED_MIME_TYPES = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
    'application/msword', // .doc
    'text/plain', // .txt
    'application/rtf' // .rtf
  ];

  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    alert('File size exceeds 5MB limit. Please choose a smaller file.');
    e.target.value = '';
    return;
  }

  // Check MIME type
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    alert('Invalid file type. Please upload a PDF, Word document, or text file.');
    e.target.value = '';
    return;
  }

  // Additional validation: check file extension matches MIME type
  const allowedExtensions = ['.pdf', '.docx', '.doc', '.txt', '.rtf'];
  const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
  if (!allowedExtensions.includes(fileExtension)) {
    alert('Invalid file extension. Please upload a PDF, Word document, or text file.');
    e.target.value = '';
    return;
  }

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
    alert('Failed to save CV. Please try again.');
  }
  e.target.value = '';
}

function renderCVs() {
  const list = document.getElementById('cvs-list');
  if (!list) return;
  list.innerHTML = '';
  
  if (!cvs.length) {
    const emptyMsg = document.createElement('p');
    emptyMsg.style.cssText = 'color:#aaa;font-size:12px;text-align:center;padding:20px 0;';
    emptyMsg.textContent = 'No CVs uploaded yet.';
    list.appendChild(emptyMsg);
    return;
  }
  
  cvs.forEach(c => {
    const card = document.createElement('div');
    card.className = 'cv-card';
    
    const infoDiv = document.createElement('div');
    const nameDiv = document.createElement('div');
    nameDiv.className = 'cv-name';
    nameDiv.textContent = c.name;
    const typeDiv = document.createElement('div');
    typeDiv.className = 'cv-type';
    typeDiv.textContent = c.filename;
    infoDiv.appendChild(nameDiv);
    infoDiv.appendChild(typeDiv);
    
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'cv-actions';
    
    const copyBtn = document.createElement('button');
    copyBtn.className = 'btn-sm';
    copyBtn.dataset.copy = c.id;
    copyBtn.textContent = 'Copy';
    
    const previewBtn = document.createElement('button');
    previewBtn.className = 'btn-sm btn-preview';
    previewBtn.dataset.preview = c.id;
    previewBtn.textContent = 'Preview';
    previewBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        const blob = await getCVBlob(c.id);
        if (blob) {
          const url = URL.createObjectURL(blob);
          window.open(url, '_blank');
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
      } catch (err) {
        alert('Failed to preview CV. Please try again.');
      }
    });
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-sm btn-danger';
    deleteBtn.dataset.del = c.id;
    deleteBtn.textContent = '✕';
    
    actionsDiv.appendChild(copyBtn);
    actionsDiv.appendChild(previewBtn);
    actionsDiv.appendChild(deleteBtn);
    
    card.appendChild(infoDiv);
    card.appendChild(actionsDiv);
    list.appendChild(card);
  });
  // Event delegation handled in bindButtons - prevents memory leaks
}

// ── EMAIL TEMPLATES ───────────────────────────────────────────────
function openModal(type, existing = null) {
  const isTemplate = type === 'template';
  document.getElementById('modal-title').textContent =
    existing ? `Edit ${type}` : `New ${isTemplate ? 'email template' : 'snippet'}`;

  // Clear modal body safely
  const modalBody = document.getElementById('modal-body');
  modalBody.innerHTML = '';

  if (isTemplate) {
    // Template name field
    const nameField = document.createElement('div');
    nameField.className = 'field';
    const nameLabel = document.createElement('label');
    nameLabel.textContent = 'Template name';
    nameField.appendChild(nameLabel);
    
    const nameInput = document.createElement('input');
    nameInput.id = 't-name';
    nameInput.placeholder = 'e.g. Follow-up email';
    nameInput.value = existing?.name || '';
    nameField.appendChild(nameInput);
    modalBody.appendChild(nameField);

    // Subject field
    const subjectField = document.createElement('div');
    subjectField.className = 'field';
    const subjectLabel = document.createElement('label');
    subjectLabel.textContent = 'Subject line';
    subjectField.appendChild(subjectLabel);
    
    const subjectInput = document.createElement('input');
    subjectInput.id = 't-subject';
    subjectInput.placeholder = 'Re: Application for {{role}}';
    subjectInput.value = existing?.subject || '';
    subjectField.appendChild(subjectInput);
    modalBody.appendChild(subjectField);

    // Body field
    const bodyField = document.createElement('div');
    bodyField.className = 'field';
    const bodyLabel = document.createElement('label');
    bodyLabel.textContent = 'Body';
    bodyField.appendChild(bodyLabel);
    
    const bodyTextarea = document.createElement('textarea');
    bodyTextarea.id = 't-body';
    bodyTextarea.placeholder = 'Hi {{name}},\n\nI wanted to follow up...';
    bodyTextarea.value = existing?.body || '';
    bodyField.appendChild(bodyTextarea);
    modalBody.appendChild(bodyField);

    // Help text
    const helpText = document.createElement('p');
    helpText.style.fontSize = '10px';
    helpText.style.color = '#aaa';
    helpText.style.marginBottom = '10px';
    helpText.textContent = 'Use {{company}}, {{role}}, {{name}} as placeholders.';
    modalBody.appendChild(helpText);

    // Save button
    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn-primary';
    saveBtn.id = 'modal-save-btn';
    saveBtn.textContent = 'Save template';
    modalBody.appendChild(saveBtn);
  } else {
    // Snippet label field
    const labelField = document.createElement('div');
    labelField.className = 'field';
    const labelLabel = document.createElement('label');
    labelLabel.textContent = 'Label';
    labelField.appendChild(labelLabel);
    
    const labelInput = document.createElement('input');
    labelInput.id = 's-label';
    labelInput.placeholder = 'e.g. My bio, Core skills';
    labelInput.value = existing?.label || '';
    labelField.appendChild(labelInput);
    modalBody.appendChild(labelField);

    // Content field
    const contentField = document.createElement('div');
    contentField.className = 'field';
    const contentLabel = document.createElement('label');
    contentLabel.textContent = 'Content';
    contentField.appendChild(contentLabel);
    
    const contentTextarea = document.createElement('textarea');
    contentTextarea.id = 's-content';
    contentTextarea.placeholder = 'Paste your reusable text here...';
    contentTextarea.value = existing?.content || '';
    contentField.appendChild(contentTextarea);
    modalBody.appendChild(contentField);

    // Save button
    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn-primary';
    saveBtn.id = 'modal-save-btn';
    saveBtn.textContent = 'Save snippet';
    modalBody.appendChild(saveBtn);
  }

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
  // Event delegation handled in bindButtons - prevents memory leaks
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
  // Event delegation handled in bindButtons - prevents memory leaks
}

// ── UTILS ─────────────────────────────────────────────────────────
function closeModal() {
  document.getElementById('job-modal').classList.add('hidden');
  editingJobId = null;
}
