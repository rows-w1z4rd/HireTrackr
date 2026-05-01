const STATUSES = ['saved', 'applied', 'interview', 'offer', 'rejected'];
const STATUS_LABELS = {
  saved: 'Saved', applied: 'Applied',
  interview: 'Interview', offer: 'Offer', rejected: 'Rejected'
};

// ── State ─────────────────────────────────────────────────────────
let jobs = [];
let cvs  = [];
let editingId = null;
let dragId    = null;

// ── Boot ──────────────────────────────────────────────────────────
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

// ── Persist ───────────────────────────────────────────────────────
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

// ── Render everything ─────────────────────────────────────────────
function renderAll() {
  renderStats();
  renderKanban();
  renderRecent();
  const el = document.getElementById('last-updated');
  if (el) el.textContent = 'Last updated ' + new Date().toLocaleTimeString();
}

// ── Stats ─────────────────────────────────────────────────────────
function renderStats() {
  const counts = {
    total:     jobs.length,
    applied:   jobs.filter(j => j.status === 'applied').length,
    interview: jobs.filter(j => j.status === 'interview').length,
    offer:     jobs.filter(j => j.status === 'offer').length,
    rejected:  jobs.filter(j => j.status === 'rejected').length,
  };
  const labels = {
    total: 'Total saved', applied: 'Applied',
    interview: 'Interviews', offer: 'Offers', rejected: 'Rejected'
  };
  const colors = {
    total: 'c-teal', applied: 'c-blue',
    interview: 'c-amber', offer: 'c-green', rejected: 'c-red'
  };
  document.getElementById('stats').innerHTML =
    Object.keys(counts).map(k => `
      <div class="stat-card" data-k="${k}">
        <div class="stat-num ${colors[k]}">${counts[k]}</div>
        <div class="stat-label">${labels[k]}</div>
      </div>`).join('');
}

// ── Kanban ────────────────────────────────────────────────────────
function renderKanban() {
  const kanban = document.getElementById('kanban');
  kanban.innerHTML = STATUSES.map(status => {
    const colJobs = jobs.filter(j => j.status === status);
    return `
      <div class="k-col" data-status="${status}" id="col-${status}">
        <div class="k-header">
          <span class="k-name">${STATUS_LABELS[status]}</span>
          <span class="k-count" id="count-${status}">${colJobs.length}</span>
        </div>
        <div class="k-cards" id="cards-${status}">
          ${colJobs.length === 0
            ? '<div class="k-empty" id="empty-'+status+'">Drop here</div>'
            : colJobs.map(j => cardHTML(j)).join('')
          }
        </div>
      </div>`;
  }).join('');

  // Bind drag events on cards
  kanban.querySelectorAll('.k-card').forEach(card => bindCardEvents(card));

  // Bind drop zones on columns
  kanban.querySelectorAll('.k-col').forEach(col => bindColDrop(col));
}

function cardHTML(j) {
  const cv = cvs.find(c => c.id === j.cvId);
  return `
    <div class="k-card ${j.status}" data-id="${j.id}" draggable="true">
      <div class="k-title">${escHtml(j.title)}</div>
      <div class="k-company">${escHtml(j.company)}</div>
      <div class="k-card-footer">
        ${cv ? `<span class="k-cv">${escHtml(cv.name)}</span>` : ''}
        ${j.notes ? '<span class="k-note-dot" title="Has notes"></span>' : ''}
      </div>
      <div class="k-actions">
        <button class="k-btn k-btn-edit" data-id="${j.id}" title="Edit">Edit</button>
        <button class="k-btn k-btn-link" data-url="${escHtml(j.url)}" title="Open job">↗</button>
      </div>
    </div>`;
}

function bindCardEvents(card) {
  // Drag
  card.addEventListener('dragstart', e => {
    dragId = card.dataset.id;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragId);
  });
  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    document.querySelectorAll('.k-col').forEach(c => c.classList.remove('drag-over'));
    dragId = null;
  });

  // Edit button
  card.querySelector('.k-btn-edit').addEventListener('click', e => {
    e.stopPropagation();
    openEditModal(card.dataset.id);
  });

  // Open URL button
  card.querySelector('.k-btn-link').addEventListener('click', e => {
    e.stopPropagation();
    const url = e.currentTarget.dataset.url;
    if (url) chrome.tabs.create({ url });
  });
}

function bindColDrop(col) {
  col.addEventListener('dragover', e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    col.classList.add('drag-over');
  });
  col.addEventListener('dragleave', e => {
    // Only remove if leaving the column entirely
    if (!col.contains(e.relatedTarget)) {
      col.classList.remove('drag-over');
    }
  });
  col.addEventListener('drop', async e => {
    e.preventDefault();
    col.classList.remove('drag-over');
    const id = e.dataTransfer.getData('text/plain') || dragId;
    if (!id) return;
    const newStatus = col.dataset.status;
    const job = jobs.find(j => j.id === id);
    if (!job || job.status === newStatus) return;
    job.status = newStatus;
    job.updatedAt = new Date().toISOString();
    await persist();
    renderAll();
  });
}

// ── Edit Modal ────────────────────────────────────────────────────
function bindModal() {
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
  });
  document.getElementById('modal-save').addEventListener('click', saveModal);
  document.getElementById('modal-delete').addEventListener('click', deleteJob);
  document.getElementById('modal-open-url').addEventListener('click', () => {
    const job = jobs.find(j => j.id === editingId);
    if (job) chrome.tabs.create({ url: job.url });
  });
}

function openEditModal(id) {
  const job = jobs.find(j => j.id === id);
  if (!job) return;
  editingId = id;

  // Add this line right after: const job = jobs.find(j => j.id === id);
  document.getElementById('modal-job-title').textContent = job.title;

  document.getElementById('m-title').value   = job.title;
  document.getElementById('m-company').value = job.company;
  document.getElementById('m-status').value  = job.status;
  document.getElementById('m-emailed').value = job.emailed ? 'true' : 'false';
  document.getElementById('m-notes').value   = job.notes || '';
  document.getElementById('m-url-display').textContent = job.url;

  // Populate CV dropdown
  const cvSel = document.getElementById('m-cv');
  cvSel.innerHTML = '<option value="">— No CV attached —</option>' +
    cvs.map(c => `<option value="${c.id}" ${job.cvId === c.id ? 'selected' : ''}>${escHtml(c.name)}</option>`).join('');

  document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  editingId = null;
}

async function saveModal() {
  const job = jobs.find(j => j.id === editingId);
  if (!job) return;

  const newTitle   = document.getElementById('m-title').value.trim();
  const newCompany = document.getElementById('m-company').value.trim();
  const newStatus  = document.getElementById('m-status').value;
  const prevStatus = job.status;

  job.title     = newTitle   || job.title;
  job.company   = newCompany || job.company;
  job.status    = newStatus;
  job.cvId      = document.getElementById('m-cv').value || null;
  job.emailed   = document.getElementById('m-emailed').value === 'true';
  job.notes     = document.getElementById('m-notes').value;
  job.updatedAt = new Date().toISOString();

  // Log status change in activity if status changed
  if (prevStatus !== newStatus) {
    job.statusHistory = job.statusHistory || [];
    job.statusHistory.push({ from: prevStatus, to: newStatus, at: job.updatedAt });
  }

  await persist();
  closeModal();
  renderAll();

  // Flash the updated card briefly
  setTimeout(() => {
    const card = document.querySelector(`.k-card[data-id="${job.id}"]`);
    if (card) { card.classList.add('just-updated'); setTimeout(() => card.classList.remove('just-updated'), 800); }
  }, 50);
}

async function deleteJob() {
  if (!confirm('Delete this job? This cannot be undone.')) return;
  jobs = jobs.filter(j => j.id !== editingId);
  await persist();
  closeModal();
  renderAll();
}

// ── Recent activity ───────────────────────────────────────────────
function renderRecent(jobs_list = jobs) {
  const el = document.getElementById('recent');
  const sorted = [...jobs_list]
    .sort((a, b) => new Date(b.updatedAt || b.savedAt) - new Date(a.updatedAt || a.savedAt))
    .slice(0, 8);

  if (!sorted.length) {
    el.innerHTML = '<div class="recent-empty">No activity yet — save your first job to get started.</div>';
    return;
  }
  el.innerHTML = sorted.map(j => `
    <div class="recent-row">
      <span class="recent-title">${escHtml(j.title)} — ${escHtml(j.company)}</span>
      <span class="pill pill-${j.status}">${j.status}</span>
      <span class="recent-time">${timeAgo(j.updatedAt || j.savedAt)}</span>
    </div>`).join('');
}

// ── Utils ─────────────────────────────────────────────────────────
function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60)  return mins <= 1 ? 'just now' : `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function escHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
