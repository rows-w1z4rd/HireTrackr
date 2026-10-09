const STATUSES = ['saved', 'applied', 'interview', 'offer', 'rejected'];
const STATUS_LABELS = {
  saved: 'Saved', applied: 'Applied',
  interview: 'Interview', offer: 'Offer', rejected: 'Rejected'
};

// ── State ─────────────────────────────────────────────────────────
// `store` comes from ../storage.js
let jobs = [];
let cvs  = [];
let editingId = null;
let dragId    = null;

// ── Boot ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  try {
    jobs = await store.get('jobs');
    cvs  = await store.get('cvs');
  } catch (err) {
    jobs = [];
    cvs = [];
  }
  renderAll();
  bindModal();

  // Stay in step with jobs saved or edited from the side panel while this tab is open
  store.onChange((key, val) => {
    if (key === 'settings') { applyTheme(val?.theme); return; }   // from ../theme.js
    if      (key === 'jobs') jobs = val || [];
    else if (key === 'cvs')  cvs  = val || [];
    else return;
    renderAll();
  });
});

// ── Persist ───────────────────────────────────────────────────────
// Applies a change to one job on top of the latest stored list.
// change(job) returns the fields to overwrite.
async function updateJob(id, change) {
  jobs = await store.update('jobs', list =>
    list.map(j => j.id === id ? { ...j, ...change(j) } : j)
  );
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
  const statsContainer = document.getElementById('stats');
  statsContainer.innerHTML = '';
  
  Object.keys(counts).forEach(k => {
    const statCard = document.createElement('div');
    statCard.className = 'stat-card';
    statCard.dataset.k = k;
    
    const statNum = document.createElement('div');
    statNum.className = `stat-num ${colors[k]}`;
    statNum.textContent = counts[k];
    
    const statLabel = document.createElement('div');
    statLabel.className = 'stat-label';
    statLabel.textContent = labels[k];
    
    statCard.appendChild(statNum);
    statCard.appendChild(statLabel);
    statsContainer.appendChild(statCard);
  });
}

// ── Kanban ────────────────────────────────────────────────────────
function renderKanban() {
  const kanban = document.getElementById('kanban');
  kanban.innerHTML = '';

  STATUSES.forEach(status => {
    const colJobs = jobs.filter(j => j.status === status);
    
    // Create column
    const col = document.createElement('div');
    col.className = 'k-col';
    col.dataset.status = status;
    col.id = `col-${status}`;
    
    // Create header
    const header = document.createElement('div');
    header.className = 'k-header';
    
    const nameSpan = document.createElement('span');
    nameSpan.className = 'k-name';
    nameSpan.textContent = STATUS_LABELS[status];
    
    const countSpan = document.createElement('span');
    countSpan.className = 'k-count';
    countSpan.id = `count-${status}`;
    countSpan.textContent = colJobs.length;
    
    header.appendChild(nameSpan);
    header.appendChild(countSpan);
    
    // Create cards container
    const cardsContainer = document.createElement('div');
    cardsContainer.className = 'k-cards';
    cardsContainer.id = `cards-${status}`;
    
    if (colJobs.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'k-empty';
      emptyDiv.id = `empty-${status}`;
      emptyDiv.textContent = 'Drop here';
      cardsContainer.appendChild(emptyDiv);
    } else {
      colJobs.forEach(job => {
        const cardElement = createCardElement(job);
        cardsContainer.appendChild(cardElement);
      });
    }
    
    col.appendChild(header);
    col.appendChild(cardsContainer);
    kanban.appendChild(col);
  });

  // Bind drag events on cards
  kanban.querySelectorAll('.k-card').forEach(card => bindCardEvents(card));

  // Bind drop zones on columns
  kanban.querySelectorAll('.k-col').forEach(col => bindColDrop(col));
}

function createCardElement(job) {
  const cv = cvs.find(c => c.id === job.cvId);
  
  const card = document.createElement('div');
  card.className = `k-card ${job.status}`;
  card.dataset.id = job.id;
  card.draggable = true;
  
  const title = document.createElement('div');
  title.className = 'k-title';
  title.textContent = job.title;
  
  const company = document.createElement('div');
  company.className = 'k-company';
  company.textContent = job.company;
  
  const footer = document.createElement('div');
  footer.className = 'k-card-footer';
  
  if (cv) {
    const cvSpan = document.createElement('span');
    cvSpan.className = 'k-cv';
    cvSpan.textContent = cv.name;
    footer.appendChild(cvSpan);
  }
  
  if (job.notes) {
    const noteDot = document.createElement('span');
    noteDot.className = 'k-note-dot';
    noteDot.title = 'Has notes';
    footer.appendChild(noteDot);
  }
  
  const actions = document.createElement('div');
  actions.className = 'k-actions';
  
  const editBtn = document.createElement('button');
  editBtn.className = 'k-btn k-btn-edit';
  editBtn.dataset.id = job.id;
  editBtn.title = 'Edit';
  editBtn.textContent = 'Edit';
  
  actions.appendChild(editBtn);

  // Jobs added by hand may have no link
  if (job.url) {
    const linkBtn = document.createElement('button');
    linkBtn.className = 'k-btn k-btn-link';
    linkBtn.dataset.url = job.url;
    linkBtn.title = 'Open job';
    linkBtn.textContent = '↗';
    actions.appendChild(linkBtn);
  }
  
  card.appendChild(title);
  card.appendChild(company);
  card.appendChild(footer);
  card.appendChild(actions);
  
  return card;
}

function bindCardEvents(card) {
  // Drag events only - click events handled by event delegation
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
    await updateJob(id, () => ({ status: newStatus, updatedAt: new Date().toISOString() }));
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
    if (job?.url) chrome.tabs.create({ url: job.url });
  });
  
  // Event delegation for kanban cards - prevents memory leaks
  const kanban = document.getElementById('kanban');
  if (kanban) {
    kanban.addEventListener('click', (e) => {
      const editBtn = e.target.closest('.k-btn-edit');
      const linkBtn = e.target.closest('.k-btn-link');
      
      if (editBtn) {
        e.stopPropagation();
        openEditModal(editBtn.dataset.id);
      } else if (linkBtn) {
        e.stopPropagation();
        chrome.tabs.create({ url: linkBtn.dataset.url });
      }
    });
  }
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
  document.getElementById('m-url-display').textContent = job.url || 'No link saved';
  document.getElementById('modal-open-url').style.display = job.url ? '' : 'none';

  // Populate CV dropdown
  const cvSel = document.getElementById('m-cv');
  cvSel.innerHTML = '';
  
  const noneOption = document.createElement('option');
  noneOption.value = '';
  noneOption.textContent = '— No CV attached —';
  cvSel.appendChild(noneOption);
  
  cvs.forEach(c => {
    const option = document.createElement('option');
    option.value = c.id;
    option.textContent = c.name;
    if (job.cvId === c.id) option.selected = true;
    cvSel.appendChild(option);
  });

  document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  editingId = null;
}

async function saveModal() {
  const id = editingId;
  if (!jobs.some(j => j.id === id)) return;

  const newTitle   = document.getElementById('m-title').value.trim();
  const newCompany = document.getElementById('m-company').value.trim();
  const newStatus  = document.getElementById('m-status').value;
  const cvId       = document.getElementById('m-cv').value || null;
  const emailed    = document.getElementById('m-emailed').value === 'true';
  const notes      = document.getElementById('m-notes').value;
  const updatedAt  = new Date().toISOString();

  await updateJob(id, job => {
    const changes = {
      title:   newTitle   || job.title,
      company: newCompany || job.company,
      status:  newStatus,
      cvId, emailed, notes, updatedAt,
    };
    // Log status change in activity if status changed
    if (job.status !== newStatus) {
      changes.statusHistory = [...(job.statusHistory || []), { from: job.status, to: newStatus, at: updatedAt }];
    }
    return changes;
  });

  closeModal();
  renderAll();

  // Flash the updated card briefly
  setTimeout(() => {
    const card = document.querySelector(`.k-card[data-id="${id}"]`);
    if (card) { card.classList.add('just-updated'); setTimeout(() => card.classList.remove('just-updated'), 800); }
  }, 50);
}

async function deleteJob() {
  if (!confirm('Delete this job? This cannot be undone.')) return;
  const id = editingId;
  jobs = await store.update('jobs', list => list.filter(j => j.id !== id));
  closeModal();
  renderAll();
}

// ── Recent activity ───────────────────────────────────────────────
function renderRecent(jobs_list = jobs) {
  const el = document.getElementById('recent');
  const sorted = [...jobs_list]
    .sort((a, b) => new Date(b.updatedAt || b.savedAt) - new Date(a.updatedAt || a.savedAt))
    .slice(0, 8);

  el.innerHTML = '';

  if (!sorted.length) {
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'recent-empty';
    emptyDiv.textContent = 'No activity yet — save your first job to get started.';
    el.appendChild(emptyDiv);
    return;
  }

  sorted.forEach(j => {
    const row = document.createElement('div');
    row.className = 'recent-row';
    
    const titleSpan = document.createElement('span');
    titleSpan.className = 'recent-title';
    titleSpan.textContent = `${j.title} — ${j.company}`;
    
    const statusSpan = document.createElement('span');
    statusSpan.className = `pill pill-${j.status}`;
    statusSpan.textContent = j.status;
    
    const timeSpan = document.createElement('span');
    timeSpan.className = 'recent-time';
    timeSpan.textContent = timeAgo(j.updatedAt || j.savedAt);
    
    row.appendChild(titleSpan);
    row.appendChild(statusSpan);
    row.appendChild(timeSpan);
    el.appendChild(row);
  });
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
