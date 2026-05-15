// State
let currentUser = null;
let allTasks = [];
let allProjects = [];
let allTags = [];
let chatHistory = [];
let activeFilter = 'all';
let expandedTaskId = null;
let editingTaskId = null;
let editingStepId = null;

// Auth
function getToken() { return localStorage.getItem('mytask_token'); }
function authHeaders() {
  return { 'Authorization': 'Bearer ' + getToken(), 'Content-Type': 'application/json' };
}

async function login() {
  var username = document.getElementById('login-username').value.trim();
  var password = document.getElementById('login-password').value;
  var errEl = document.getElementById('login-error');
  errEl.style.display = 'none';
  try {
    var resp = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!resp.ok) {
      errEl.textContent = 'Invalid username or password.';
      errEl.style.display = 'block';
      return;
    }
    localStorage.setItem('mytask_token', (await resp.json()).access_token);
    await initApp();
  } catch (e) {
    errEl.textContent = 'Connection error.';
    errEl.style.display = 'block';
  }
}

function logout() {
  localStorage.removeItem('mytask_token');
  location.reload();
}

async function initApp() {
  if (!getToken()) { showLogin(); return; }
  try {
    var resp = await fetch('/api/auth/me', { headers: authHeaders() });
    if (!resp.ok) { showLogin(); return; }
    currentUser = await resp.json();
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    document.getElementById('nav-username').textContent = currentUser.username;
    document.getElementById('workspace-label').textContent = currentUser.username + "'s Workspace";
    if (currentUser.role === 'admin') {
      document.getElementById('admin-link').style.display = 'inline';
    }
    fetch('/api/info').then(function(r) { return r.json(); }).then(function(d) {
      var el = document.getElementById('chat-model-label');
      if (el) el.textContent = d.model || '';
    });
    await loadProjects();
    await loadTags();
    await loadTasks();
    addAiMessage('Hello ' + currentUser.username + '! I am your AI assistant. Tell me what tasks you need help with.');
  } catch (e) { showLogin(); }
}

function showLogin() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
}

// Colour helper
function hexToRgba(hex, alpha) {
  var r = parseInt(hex.slice(1, 3), 16);
  var g = parseInt(hex.slice(3, 5), 16);
  var b = parseInt(hex.slice(5, 7), 16);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
}

// Projects
async function loadProjects() {
  var resp = await fetch('/api/projects', { headers: authHeaders() });
  if (!resp.ok) { if (resp.status === 401) showLogin(); return; }
  allProjects = await resp.json();
  renderProjectFilters();
  populateProjectDropdown();
}

function renderProjectFilters() {
  var container = document.getElementById('project-filters');
  while (container.firstChild) container.removeChild(container.firstChild);
  allProjects.forEach(function(p) {
    var btn = document.createElement('button');
    btn.className = 'filter-btn';
    btn.textContent = p.name;
    btn.addEventListener('click', function() { setFilter('project:' + p.id, btn); });
    container.appendChild(btn);
  });
}

function populateProjectDropdown() {
  var sel = document.getElementById('mt-project');
  if (!sel) return;
  while (sel.options.length > 1) sel.remove(1);
  allProjects.forEach(function(p) {
    var opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    sel.appendChild(opt);
  });
}

// Tags
async function loadTags() {
  var resp = await fetch('/api/tags', { headers: authHeaders() });
  if (!resp.ok) return;
  allTags = await resp.json();
  renderTagFilters();
}

function renderTagFilters() {
  var container = document.getElementById('tag-filters');
  while (container.firstChild) container.removeChild(container.firstChild);
  allTags.forEach(function(tag) {
    var wrap = document.createElement('span');
    wrap.style.cssText = 'position:relative;display:inline-flex;align-items:center';

    var btn = document.createElement('button');
    btn.className = 'filter-btn';
    btn.dataset.tagId = tag.id;
    btn.textContent = tag.name;
    btn.style.cssText = (
      'background:' + hexToRgba(tag.color, 0.15) + ';' +
      'color:' + tag.color + ';' +
      'border:1px solid ' + hexToRgba(tag.color, 0.3) + ';' +
      'padding-right:18px;'
    );
    btn.addEventListener('click', function() { setFilter('tag:' + tag.id, btn); });

    var del = document.createElement('span');
    del.textContent = '×';
    del.title = 'Delete tag';
    del.style.cssText = (
      'position:absolute;right:4px;top:50%;transform:translateY(-50%);' +
      'font-size:11px;line-height:1;cursor:pointer;opacity:0;transition:opacity .15s;' +
      'color:' + tag.color + ';'
    );
    del.addEventListener('click', async function(e) {
      e.stopPropagation();
      if (!confirm('Delete tag "' + tag.name + '"?')) return;
      var resp = await fetch('/api/tags/' + tag.id, { method: 'DELETE', headers: authHeaders() });
      if (resp.ok) { await loadTags(); } else { alert('Failed to delete tag'); }
    });

    wrap.addEventListener('mouseenter', function() { del.style.opacity = '1'; });
    wrap.addEventListener('mouseleave', function() { del.style.opacity = '0'; });

    wrap.appendChild(btn);
    wrap.appendChild(del);
    container.appendChild(wrap);
  });

  // "+ New tag" toggle button
  var addBtn = document.createElement('button');
  addBtn.className = 'filter-btn';
  addBtn.textContent = '+ Tag';
  addBtn.style.cssText = 'opacity:0.5;font-size:10px;';
  addBtn.addEventListener('click', function() {
    var existing = document.getElementById('new-tag-form');
    if (existing) { existing.remove(); return; }
    var form = document.createElement('span');
    form.id = 'new-tag-form';
    form.style.cssText = 'display:inline-flex;align-items:center;gap:4px;margin-left:4px';
    var nameInp = document.createElement('input');
    nameInp.type = 'text';
    nameInp.placeholder = 'Tag name';
    nameInp.style.cssText = 'font-size:11px;padding:2px 6px;width:90px';
    var colorInp = document.createElement('input');
    colorInp.type = 'color';
    colorInp.value = '#4a90d9';
    colorInp.style.cssText = 'width:26px;height:22px;padding:1px;cursor:pointer;border:none';
    var saveBtn = document.createElement('button');
    saveBtn.textContent = '✓';
    saveBtn.style.cssText = 'font-size:10px;padding:1px 6px';
    var cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn-secondary';
    cancelBtn.textContent = '✕';
    cancelBtn.style.cssText = 'font-size:10px;padding:1px 6px';
    async function doCreate() {
      var name = nameInp.value.trim();
      if (!name) return;
      var resp = await fetch('/api/tags', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ name: name, color: colorInp.value }),
      });
      if (resp.ok) { await loadTags(); } else {
        var err = await resp.json().catch(function() { return {}; });
        alert(err.detail || 'Failed to create tag');
      }
    }
    saveBtn.addEventListener('click', doCreate);
    cancelBtn.addEventListener('click', function() { form.remove(); });
    nameInp.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') doCreate();
      if (e.key === 'Escape') form.remove();
    });
    form.appendChild(nameInp);
    form.appendChild(colorInp);
    form.appendChild(saveBtn);
    form.appendChild(cancelBtn);
    container.appendChild(form);
    nameInp.focus();
  });
  container.appendChild(addBtn);
}

// Tasks
async function loadTasks() {
  var resp = await fetch('/api/tasks', { headers: authHeaders() });
  if (!resp.ok) { if (resp.status === 401) showLogin(); return; }
  allTasks = await resp.json();
  renderTasks();
  updateOverdueBadge();
  loadDashboard();
}

// Dashboard
async function loadDashboard() {
  try {
    var resp = await fetch('/api/dashboard', { headers: authHeaders() });
    if (!resp.ok) return;
    var data = await resp.json();
    var strip = document.getElementById('dashboard-strip');
    if (data.overdue === 0 && data.due_today === 0 && data.due_week === 0) {
      strip.style.display = 'none';
      return;
    }
    strip.style.display = 'block';
    document.getElementById('stat-overdue-num').textContent = data.overdue;
    document.getElementById('stat-today-num').textContent = data.due_today;
    document.getElementById('stat-week-num').textContent = data.due_week;
    var briefingEl = document.getElementById('dashboard-briefing');
    if (data.ai_briefing) {
      document.getElementById('briefing-text').textContent = data.ai_briefing;
      briefingEl.style.display = 'flex';
    } else {
      briefingEl.style.display = 'none';
    }
  } catch (e) { console.warn('Dashboard load failed:', e); }
}

// Filters
function setFilter(filter, btn) {
  activeFilter = filter;
  document.querySelectorAll('.filter-btn').forEach(function(b) { b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  renderTasks();
}

function filteredTasks() {
  var today = new Date().toISOString().split('T')[0];
  if (activeFilter === 'today') {
    return allTasks.filter(function(t) { return t.due_date === today; });
  }
  if (activeFilter === 'overdue') {
    return allTasks.filter(function(t) { return t.due_date && t.due_date < today && t.status !== 'done'; });
  }
  if (activeFilter.indexOf('project:') === 0) {
    var pid = parseInt(activeFilter.split(':')[1]);
    return allTasks.filter(function(t) { return t.project_id === pid; });
  }
  if (activeFilter.indexOf('tag:') === 0) {
    var tid = parseInt(activeFilter.split(':')[1]);
    return allTasks.filter(function(t) {
      return t.tags && t.tags.some(function(tag) { return tag.id === tid; });
    });
  }
  return allTasks;
}

// Task cards
function buildTaskCard(t) {
  var today = new Date().toISOString().split('T')[0];
  var card = document.createElement('div');
  card.className = 'task-card priority-' + t.priority + ' status-' + t.status;
  card.id = 'task-card-' + t.id;

  var top = document.createElement('div');
  top.className = 'task-card-top';
  var titleEl = document.createElement('div');
  titleEl.className = 'task-title';
  titleEl.textContent = t.title;
  var badge = document.createElement('span');
  badge.className = 'priority-badge ' + t.priority;
  badge.textContent = t.priority.toUpperCase();
  top.appendChild(titleEl);
  top.appendChild(badge);
  card.appendChild(top);

  // Due date / project meta
  var metaParts = [];
  if (t.project_name) metaParts.push(t.project_name);
  if (t.due_date) metaParts.push('Due ' + t.due_date);
  if (metaParts.length) {
    var meta = document.createElement('div');
    meta.className = 'task-meta';
    meta.textContent = metaParts.join(' · ');
    card.appendChild(meta);
  }

  // Tag pills + subtask indicator row
  var hasInfo = false;
  var infoRow = document.createElement('div');
  infoRow.className = 'tag-pills';
  if (t.tags && t.tags.length > 0) {
    t.tags.forEach(function(tag) {
      var pill = document.createElement('span');
      pill.className = 'tag-pill';
      pill.textContent = tag.name;
      pill.style.cssText = (
        'background:' + hexToRgba(tag.color, 0.2) + ';' +
        'color:' + tag.color + ';' +
        'border-color:' + hexToRgba(tag.color, 0.35) + ';'
      );
      infoRow.appendChild(pill);
      hasInfo = true;
    });
  }
  if (t.subtask_count > 0) {
    var indicator = document.createElement('span');
    indicator.className = 'subtask-indicator';
    indicator.textContent = '☑ ' + t.completed_subtasks + '/' + t.subtask_count + ' steps';
    infoRow.appendChild(indicator);
    hasInfo = true;
  }
  if (hasInfo) card.appendChild(infoRow);

  // Expanded detail
  var detail = document.createElement('div');
  detail.className = 'task-detail' + (expandedTaskId === t.id ? ' open' : '');
  detail.id = 'task-detail-' + t.id;
  detail.addEventListener('click', function(e) { e.stopPropagation(); });

  // Status + delete actions
  var actions = document.createElement('div');
  actions.className = 'task-detail-actions';
  var statusSel = document.createElement('select');
  [['todo', 'To Do'], ['in-progress', 'In Progress'], ['done', 'Done']].forEach(function(pair) {
    var opt = document.createElement('option');
    opt.value = pair[0];
    opt.textContent = pair[1];
    if (t.status === pair[0]) opt.selected = true;
    statusSel.appendChild(opt);
  });
  statusSel.addEventListener('change', function() { updateTaskStatus(t.id, statusSel.value); });
  var delBtn = document.createElement('button');
  delBtn.className = 'btn-danger';
  delBtn.textContent = 'Delete';
  delBtn.addEventListener('click', function() { deleteTask(t.id); });
  var editBtn = document.createElement('button');
  editBtn.className = 'btn-secondary';
  editBtn.textContent = '✏ Edit';
  editBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    if (editingTaskId === t.id) {
      hideTaskEditForm(t.id);
    } else {
      if (editingTaskId !== null) {
        var prevForm = document.getElementById('task-edit-form-' + editingTaskId);
        if (prevForm) prevForm.remove();
        editingTaskId = null;
      }
      editingTaskId = t.id;
      showTaskEditForm(t, detail);
    }
  });
  actions.appendChild(statusSel);
  actions.appendChild(editBtn);
  actions.appendChild(delBtn);
  detail.appendChild(actions);

  if (t.notes) {
    var notesEl = document.createElement('div');
    notesEl.className = 'task-notes';
    notesEl.textContent = t.notes;
    detail.appendChild(notesEl);
  }

  // Tag picker
  if (allTags.length > 0) {
    var tagSection = document.createElement('div');
    tagSection.className = 'tag-picker-section';
    var tagLabel = document.createElement('div');
    tagLabel.className = 'tag-picker-label';
    tagLabel.textContent = 'Tags';
    tagSection.appendChild(tagLabel);
    var tagList = document.createElement('div');
    tagList.className = 'tag-picker-list';
    allTags.forEach(function(tag) {
      var assigned = t.tags && t.tags.some(function(tt) { return tt.id === tag.id; });
      var item = document.createElement('span');
      item.className = 'tag-picker-item' + (assigned ? ' assigned' : '');
      item.textContent = tag.name;
      item.style.cssText = (
        'background:' + hexToRgba(tag.color, 0.2) + ';' +
        'color:' + tag.color + ';' +
        'border-color:' + hexToRgba(tag.color, 0.35) + ';'
      );
      item.addEventListener('click', function(e) {
        e.stopPropagation();
        if (assigned) {
          removeTagFromTask(t.id, tag.id);
        } else {
          addTagToTask(t.id, tag.id);
        }
      });
      tagList.appendChild(item);
    });
    tagSection.appendChild(tagList);
    detail.appendChild(tagSection);
  }

  // Subtask checklist
  var subtaskSection = document.createElement('div');
  subtaskSection.className = 'subtask-section';
  if (expandedTaskId === t.id) {
    loadAndRenderSubtasks(t.id, subtaskSection);
  }
  detail.appendChild(subtaskSection);

  card.appendChild(detail);
  card.addEventListener('click', function() { toggleTask(t.id); });
  return card;
}

function renderTasks() {
  var tasks = filteredTasks();
  var today = new Date().toISOString().split('T')[0];
  var container = document.getElementById('task-list');
  while (container.firstChild) container.removeChild(container.firstChild);

  if (tasks.length === 0) {
    var p = document.createElement('p');
    p.style.cssText = 'color:var(--text-dim);font-size:13px;padding:12px';
    p.textContent = 'No tasks here. Tell the AI to create one!';
    container.appendChild(p);
    return;
  }

  var groups = [
    { key: 'overdue',     label: 'Overdue',    tasks: tasks.filter(function(t) { return t.due_date && t.due_date < today && t.status !== 'done'; }) },
    { key: 'in-progress', label: 'In Progress', tasks: tasks.filter(function(t) { return t.status === 'in-progress'; }) },
    { key: 'todo',        label: 'To Do',       tasks: tasks.filter(function(t) { return t.status === 'todo' && !(t.due_date && t.due_date < today); }) },
    { key: 'done',        label: 'Done',        tasks: tasks.filter(function(t) { return t.status === 'done'; }) },
  ].filter(function(g) { return g.tasks.length > 0; });

  groups.forEach(function(g) {
    var label = document.createElement('div');
    label.className = 'task-group-label ' + g.key;
    label.textContent = g.label.toUpperCase();
    container.appendChild(label);
    g.tasks.forEach(function(t) { container.appendChild(buildTaskCard(t)); });
  });
}

function toggleTask(id) {
  editingTaskId = null;
  editingStepId = null;
  expandedTaskId = (expandedTaskId === id) ? null : id;
  renderTasks();
}

async function updateTaskStatus(id, status) {
  await fetch('/api/tasks/' + id, {
    method: 'PUT', headers: authHeaders(), body: JSON.stringify({ status: status }),
  });
  await loadTasks();
}

async function deleteTask(id) {
  if (!confirm('Delete this task?')) return;
  await fetch('/api/tasks/' + id, { method: 'DELETE', headers: authHeaders() });
  await loadTasks();
}

function showTaskEditForm(t, detail) {
  var form = document.createElement('div');
  form.className = 'task-edit-form';
  form.id = 'task-edit-form-' + t.id;

  function field(labelText, inputEl) {
    var wrap = document.createElement('div');
    var lbl = document.createElement('div');
    lbl.className = 'edit-label';
    lbl.textContent = labelText;
    wrap.appendChild(lbl);
    wrap.appendChild(inputEl);
    return wrap;
  }

  var titleInp = document.createElement('input');
  titleInp.type = 'text';
  titleInp.value = t.title;

  var dateInp = document.createElement('input');
  dateInp.type = 'date';
  if (t.due_date) dateInp.value = t.due_date;

  var priSel = document.createElement('select');
  ['high', 'medium', 'low'].forEach(function(p) {
    var opt = document.createElement('option');
    opt.value = p;
    opt.textContent = p.charAt(0).toUpperCase() + p.slice(1);
    if (t.priority === p) opt.selected = true;
    priSel.appendChild(opt);
  });

  var notesArea = document.createElement('textarea');
  notesArea.value = t.notes || '';

  var row2 = document.createElement('div');
  row2.className = 'edit-row-2col';
  row2.appendChild(field('Due Date', dateInp));
  row2.appendChild(field('Priority', priSel));

  form.appendChild(field('Title', titleInp));
  form.appendChild(row2);
  form.appendChild(field('Notes', notesArea));

  var actionsDiv = document.createElement('div');
  actionsDiv.className = 'edit-actions';

  var saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save';
  saveBtn.style.cssText = 'font-size:11px;padding:4px 10px';
  saveBtn.disabled = !titleInp.value.trim();

  var cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn-secondary';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.cssText = 'font-size:11px;padding:4px 10px';

  titleInp.addEventListener('input', function() {
    saveBtn.disabled = !titleInp.value.trim();
  });

  cancelBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    hideTaskEditForm(t.id);
  });

  saveBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    if (!titleInp.value.trim()) return;
    saveTaskEdit(t.id, {
      title: titleInp.value.trim(),
      due_date: dateInp.value || null,
      priority: priSel.value,
      notes: notesArea.value.trim() || null,
    });
  });

  form.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') { e.stopPropagation(); hideTaskEditForm(t.id); }
  });

  actionsDiv.appendChild(cancelBtn);
  actionsDiv.appendChild(saveBtn);
  form.appendChild(actionsDiv);

  detail.appendChild(form);
  titleInp.focus();
  titleInp.select();
}

function hideTaskEditForm(taskId) {
  editingTaskId = null;
  var form = document.getElementById('task-edit-form-' + taskId);
  if (form) form.remove();
}

async function saveTaskEdit(taskId, data) {
  var resp = await fetch('/api/tasks/' + taskId, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(data),
  });
  if (!resp.ok) { console.warn('Save task edit failed:', resp.status); return; }
  editingTaskId = null;
  await loadTasks();
}

function updateOverdueBadge() {
  var today = new Date().toISOString().split('T')[0];
  var count = allTasks.filter(function(t) { return t.due_date && t.due_date < today && t.status !== 'done'; }).length;
  var badge = document.getElementById('overdue-badge');
  if (count > 0) {
    badge.textContent = count + ' overdue';
    badge.style.display = 'inline';
  } else {
    badge.style.display = 'none';
  }
}

// Subtask checklist
async function loadAndRenderSubtasks(parentId, container) {
  try {
    var resp = await fetch('/api/tasks?parent_id=' + parentId, { headers: authHeaders() });
    if (!resp.ok) return;
    var children = await resp.json();
    while (container.firstChild) container.removeChild(container.firstChild);

    children.forEach(function(child) {
      var row = document.createElement('div');
      row.className = 'subtask-row' + (child.status === 'done' ? ' done' : '');
      row.id = 'step-row-' + child.id;
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = child.status === 'done';
      cb.addEventListener('change', function(e) {
        e.stopPropagation();
        var newStatus = cb.checked ? 'done' : 'todo';
        toggleSubtask(child.id, newStatus, parentId, container);
      });
      var titleSpan = document.createElement('span');
      titleSpan.textContent = child.title;
      titleSpan.style.flex = '1';
      row.appendChild(cb);
      row.appendChild(titleSpan);
      if (child.due_date) {
        var dateSpan = document.createElement('span');
        dateSpan.className = 'subtask-nested-hint';
        dateSpan.textContent = child.due_date;
        row.appendChild(dateSpan);
      }
      if (child.subtask_count > 0) {
        var hint = document.createElement('span');
        hint.className = 'subtask-nested-hint';
        hint.textContent = '↳ ' + child.subtask_count + ' steps';
        row.appendChild(hint);
      }
      var editStepBtn = document.createElement('button');
      editStepBtn.className = 'step-edit-btn';
      editStepBtn.textContent = '✏';
      editStepBtn.title = 'Edit step';
      editStepBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        showStepEditRow(child, row, parentId, container);
      });
      row.appendChild(editStepBtn);
      container.appendChild(row);
    });

    // "＋ Add step" button
    var addRow = document.createElement('div');
    addRow.className = 'add-step-row';
    addRow.textContent = '+ Add step';
    addRow.addEventListener('click', function(e) {
      e.stopPropagation();
      showAddStepInput(parentId, container, addRow);
    });
    container.appendChild(addRow);
  } catch (e) { console.warn('Subtask load failed:', e); }
}

async function toggleSubtask(id, status, parentId, container) {
  await fetch('/api/tasks/' + id, {
    method: 'PUT', headers: authHeaders(), body: JSON.stringify({ status: status }),
  });
  await loadAndRenderSubtasks(parentId, container);
  await loadTasks();
}

function showAddStepInput(parentId, container, addRowEl) {
  addRowEl.style.display = 'none';
  var inputRow = document.createElement('div');
  inputRow.className = 'subtask-row';
  var inp = document.createElement('input');
  inp.type = 'text';
  inp.placeholder = 'Step title...';
  inp.style.cssText = 'flex:1;font-size:11px;padding:3px 6px';
  var cancelSpan = document.createElement('span');
  cancelSpan.textContent = '✕';
  cancelSpan.style.cssText = 'color:var(--text-dim);cursor:pointer;font-size:11px;flex-shrink:0';
  cancelSpan.addEventListener('click', function(e) {
    e.stopPropagation();
    inputRow.remove();
    addRowEl.style.display = '';
  });
  inp.addEventListener('keydown', async function(e) {
    e.stopPropagation();
    if (e.key === 'Enter' && inp.value.trim()) {
      await fetch('/api/tasks', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ title: inp.value.trim(), parent_id: parentId }),
      });
      await loadAndRenderSubtasks(parentId, container);
      await loadTasks();
    }
    if (e.key === 'Escape') { inputRow.remove(); addRowEl.style.display = ''; }
  });
  inputRow.appendChild(inp);
  inputRow.appendChild(cancelSpan);
  container.insertBefore(inputRow, addRowEl);
  inp.focus();
}

function showStepEditRow(child, originalRow, parentId, container) {
  if (editingStepId !== null) {
    var prev = document.getElementById('step-edit-' + editingStepId);
    if (prev) prev.remove();
    var prevRow = document.getElementById('step-row-' + editingStepId);
    if (prevRow) prevRow.style.display = '';
  }
  editingStepId = child.id;
  originalRow.style.display = 'none';

  var editRow = document.createElement('div');
  editRow.id = 'step-edit-' + child.id;
  editRow.style.cssText = 'display:flex;flex-direction:column;gap:4px;margin-bottom:4px';

  var topRow = document.createElement('div');
  topRow.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:11px';

  var titleInp = document.createElement('input');
  titleInp.type = 'text';
  titleInp.value = child.title;
  titleInp.style.cssText = 'flex:1;font-size:11px;padding:3px 6px;min-width:0';

  var dateInp = document.createElement('input');
  dateInp.type = 'date';
  if (child.due_date) dateInp.value = child.due_date;
  dateInp.style.cssText = 'font-size:10px;padding:3px 5px;width:110px;flex-shrink:0';
  dateInp.title = 'Due date (optional)';

  var cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn-secondary';
  cancelBtn.textContent = '✕';
  cancelBtn.style.cssText = 'font-size:10px;padding:2px 7px;flex-shrink:0';

  var saveBtn = document.createElement('button');
  saveBtn.textContent = '✓';
  saveBtn.style.cssText = 'font-size:10px;padding:2px 7px;flex-shrink:0';

  var notesInp = document.createElement('textarea');
  notesInp.value = child.notes || '';
  notesInp.placeholder = 'Notes (optional)';
  notesInp.style.cssText = 'font-size:11px;padding:4px 6px;resize:vertical;min-height:40px;font-family:inherit;width:100%;box-sizing:border-box';

  function doCancel() {
    editingStepId = null;
    editRow.remove();
    originalRow.style.display = '';
  }

  function doSave() {
    if (!titleInp.value.trim()) return;
    saveStepEdit(child.id, titleInp.value.trim(), dateInp.value || null,
                 notesInp.value.trim() || null,
                 parentId, container, editRow, originalRow);
  }

  cancelBtn.addEventListener('click', function(e) { e.stopPropagation(); doCancel(); });
  saveBtn.addEventListener('click', function(e) { e.stopPropagation(); doSave(); });
  titleInp.addEventListener('keydown', function(e) {
    e.stopPropagation();
    if (e.key === 'Enter') doSave();
    if (e.key === 'Escape') doCancel();
  });
  notesInp.addEventListener('keydown', function(e) { e.stopPropagation(); if (e.key === 'Escape') doCancel(); });

  topRow.appendChild(titleInp);
  topRow.appendChild(dateInp);
  topRow.appendChild(cancelBtn);
  topRow.appendChild(saveBtn);
  editRow.appendChild(topRow);
  editRow.appendChild(notesInp);

  container.insertBefore(editRow, originalRow.nextSibling);
  titleInp.focus();
  titleInp.select();
}

async function saveStepEdit(stepId, title, dueDate, notes, parentId, container, editRow, originalRow) {
  var resp = await fetch('/api/tasks/' + stepId, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({ title: title, due_date: dueDate, notes: notes }),
  });
  if (!resp.ok) { console.warn('Save step edit failed:', resp.status); return; }
  editingStepId = null;
  editRow.remove();
  originalRow.style.display = '';
  await loadTasks();
}

// Tag management on tasks
async function addTagToTask(taskId, tagId) {
  await fetch('/api/tasks/' + taskId + '/tags/' + tagId, { method: 'POST', headers: authHeaders() });
  await loadTasks();
}

async function removeTagFromTask(taskId, tagId) {
  await fetch('/api/tasks/' + taskId + '/tags/' + tagId, { method: 'DELETE', headers: authHeaders() });
  await loadTasks();
}

// New Task Modal
function showNewTaskForm() {
  document.getElementById('task-modal').style.display = 'flex';
  document.getElementById('mt-title').focus();
}

function closeModal() {
  document.getElementById('task-modal').style.display = 'none';
  document.getElementById('mt-title').value = '';
  document.getElementById('mt-notes').value = '';
  document.getElementById('mt-due').value = '';
}

async function createTask() {
  var title = document.getElementById('mt-title').value.trim();
  if (!title) { alert('Title is required.'); return; }
  var body = {
    title: title,
    priority: document.getElementById('mt-priority').value,
    due_date: document.getElementById('mt-due').value || null,
    project_id: parseInt(document.getElementById('mt-project').value) || null,
    notes: document.getElementById('mt-notes').value.trim() || null,
  };
  var createResp = await fetch('/api/tasks', { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) });
  if (!createResp.ok) {
    var errData = await createResp.json();
    alert(errData.detail || 'Error creating task.');
    return;
  }
  closeModal();
  await loadTasks();
}

// Chat
function buildMsgEl(role, content) {
  var div = document.createElement('div');
  div.className = 'msg ' + role;

  var avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.textContent = role === 'ai' ? 'AI' : (currentUser ? currentUser.username.slice(0, 2).toUpperCase() : 'Me');

  var bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.textContent = content;

  div.appendChild(avatar);
  div.appendChild(bubble);
  return div;
}

function addAiMessage(content) {
  var container = document.getElementById('chat-messages');
  var el = buildMsgEl('ai', content);
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
  return el;
}

async function sendMessage() {
  var input = document.getElementById('chat-input');
  var message = input.value.trim();
  if (!message) return;
  input.value = '';
  document.getElementById('send-btn').disabled = true;

  var container = document.getElementById('chat-messages');

  var userEl = buildMsgEl('user', message);
  container.appendChild(userEl);
  container.scrollTop = container.scrollHeight;

  var aiDiv = document.createElement('div');
  aiDiv.className = 'msg ai';
  var aiAvatar = document.createElement('div');
  aiAvatar.className = 'msg-avatar';
  aiAvatar.textContent = 'AI';
  var bubble = document.createElement('div');
  bubble.className = 'msg-bubble streaming';
  aiDiv.appendChild(aiAvatar);
  aiDiv.appendChild(bubble);
  container.appendChild(aiDiv);
  container.scrollTop = container.scrollHeight;

  var aiContent = '';
  try {
    var resp = await fetch('/api/chat', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ message: message, history: chatHistory }),
    });

    var reader = resp.body.getReader();
    var decoder = new TextDecoder();
    var buf = '';

    while (true) {
      var read = await reader.read();
      if (read.done) break;
      buf += decoder.decode(read.value, { stream: true });
      var lines = buf.split('\n');
      buf = lines.pop();
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (line.indexOf('data: ') !== 0) continue;
        var data = JSON.parse(line.slice(6));
        if (data.type === 'token') {
          aiContent += data.content;
          bubble.textContent = aiContent;
          container.scrollTop = container.scrollHeight;
        } else if (data.type === 'tool_executed') {
          await loadTasks();
          var notice = document.createElement('div');
          notice.className = 'tool-notice';
          notice.textContent = 'Task list updated';
          aiDiv.appendChild(notice);
        }
      }
    }
  } catch (e) {
    bubble.textContent = 'Error connecting to AI. Please try again.';
  }

  bubble.classList.remove('streaming');
  chatHistory.push({ role: 'user', content: message });
  chatHistory.push({ role: 'assistant', content: aiContent });
  if (chatHistory.length > 20) chatHistory = chatHistory.slice(-20);
  document.getElementById('send-btn').disabled = false;
}

// Event wiring
document.addEventListener('DOMContentLoaded', function() {
  if (!document.getElementById('login-screen')) return;

  initApp();

  document.getElementById('login-btn').addEventListener('click', login);
  document.getElementById('logout-btn').addEventListener('click', logout);
  document.getElementById('login-password').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') login();
  });
  document.getElementById('send-btn').addEventListener('click', sendMessage);
  document.getElementById('chat-input').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') sendMessage();
  });
  document.getElementById('new-task-btn').addEventListener('click', showNewTaskForm);
  document.getElementById('modal-create-btn').addEventListener('click', createTask);
  document.getElementById('modal-cancel-btn').addEventListener('click', closeModal);
  document.getElementById('task-modal').addEventListener('click', function(e) {
    if (e.target === this) closeModal();
  });
  document.getElementById('filter-all').addEventListener('click', function() { setFilter('all', this); });
  document.getElementById('filter-today').addEventListener('click', function() { setFilter('today', this); });
  document.getElementById('filter-overdue').addEventListener('click', function() { setFilter('overdue', this); });
});
