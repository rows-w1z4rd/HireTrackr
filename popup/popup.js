// ── State ────────────────────────────────────────────────────────
let store = null;
let jobs = [], cvs = [], templates = [], snippets = [];
let editingJobId = null;

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
    get: (key) => new Promise(res => chrome.storage.local.get(key, d => res(d[key] || []))),
    set: (key, val) => new Promise(res => chrome.storage.local.set({ [key]: val }, res)),
  };

  jobs      = await store.get('jobs');
  cvs       = await store.get('cvs');
  templates = await store.get('templates');
  snippets  = await store.get('snippets');

  renderAll();
  bindTabs();
  bindButtons();
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
    id: Date.now().toString(),
    title: tab.title.split(' - ')[0] || 'Untitled Job',
    company: extractCompany(tab.title),
    url: tab.url,
    status: 'saved',
    cvId: null,
    emailed: false,
    notes: '',
    savedAt: new Date().toISOString(),
  };
  jobs.unshift(job);
  await store.set('jobs', jobs);
  flashButton('save-job-btn', 'Saved ✓', '#1D9E75');
  renderJobs();
  document.getElementById('job-count').textContent = `${jobs.length} jobs saved`;
}

function extractCompany(title) {
  if (title.includes(' at ')) return title.split(' at ')[1].split(' - ')[0].trim();
  if (title.includes(' | '))  return title.split(' | ')[1].split(' - ')[0].trim();
  return 'Unknown company';
}

// ── RENDER JOBS ───────────────────────────────────────────────────
function renderJobs() {
  const list = document.getElementById('jobs-list');
  if (!list) return;
  if (!jobs.length) {
    list.innerHTML = '<p style="color:#aaa;font-size:12px;text-align:center;padding:20px 0;">No jobs saved yet.<br>Browse a job listing and click "+ Save this job"</p>';
    return;
  }
  list.innerHTML = jobs.map(j => {
    const cv = cvs.find(c => c.id === j.cvId);
    return `
      <div class="job-card" data-id="${j.id}">
        <div class="job-top">
          <div>
            <div class="job-title">${j.title}</div>
            <div class="job-company">${j.company}</div>
          </div>
          <span class="pill pill-${j.status}">${j.status}</span>
        </div>
        <div class="job-meta">
          <span class="cv-tag">${cv ? cv.name : 'No CV attached'}</span>
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
        ${cvs.map(c => `<option value="${c.id}" ${job.cvId===c.id?'selected':''}>${c.name}</option>`).join('')}
      </select></div>
    <div class="field"><label>Emailed recruiter?</label>
      <select id="m-emailed">
        <option value="false" ${!job.emailed?'selected':''}>No</option>
        <option value="true" ${job.emailed?'selected':''}>Yes</option>
      </select></div>
    <div class="field"><label>Notes</label>
      <textarea id="m-notes" placeholder="Interview notes, salary, contact...">${job.notes}</textarea></div>
    <div class="field"><label>Link</label>
      <input id="m-url" value="${job.url}" readonly style="color:#888;" /></div>
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
  job.status  = document.getElementById('m-status').value;
  job.cvId    = document.getElementById('m-cv').value || null;
  job.emailed = document.getElementById('m-emailed').value === 'true';
  job.notes   = document.getElementById('m-notes').value;
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
  const reader = new FileReader();
  reader.onload = async (ev) => {
    cvs.push({ id: Date.now().toString(), name, filename: file.name, data: ev.target.result });
    await store.set('cvs', cvs);
    renderCVs();
  };
  reader.readAsDataURL(file);
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
      <div><div class="cv-name">${c.name}</div><div class="cv-type">${c.filename}</div></div>
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
      cvs = cvs.filter(c => c.id !== btn.dataset.del);
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
    id: existingId || Date.now().toString(),
    name: document.getElementById('t-name').value,
    subject: document.getElementById('t-subject').value,
    body: document.getElementById('t-body').value,
  };
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
      <div><div class="cv-name">${t.name}</div><div class="cv-type">${t.subject}</div></div>
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
    id: existingId || Date.now().toString(),
    label: document.getElementById('s-label').value,
    content: document.getElementById('s-content').value,
  };
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
      <div><div class="cv-name">${s.label}</div><div class="cv-type">${s.content.substring(0,40)}...</div></div>
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
