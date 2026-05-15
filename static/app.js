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
let currentPage = 'tasks';
let chatOpen = false;
let drawerOpen = false;
let currentView = 'list';
let currentCalendarMonth = null;  // { year, month } — initialised in Task 8
let currentTimelineOffset = 0;    // days shifted — used in Task 9
let allStatuses = [];             // statuses for the active project filter (or default set)
let expandedProjectId = null;
let projectStatusMap = {};

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
    document.getElementById('sidebar-username').textContent = currentUser.username;
    document.getElementById('drawer-username').textContent = currentUser.username;
    if (currentUser.role === 'admin') {
      document.getElementById('admin-link').style.display = 'flex';
      document.getElementById('admin-link-drawer').style.display = 'flex';
    }
    fetch('/api/info').then(function(r) { return r.json(); }).then(function(d) {
      var el = document.getElementById('chat-model-label');
      if (el) el.textContent = d.model || '';
    });
    document.getElementById('chat-fab').style.display = 'flex';
    await loadProjects();
    await loadTags();
    await loadTasks();
    var now = new Date();
    currentCalendarMonth = { year: now.getFullYear(), month: now.getMonth() };
    navigateTo(currentPage);
    addAiMessage('Hello ' + currentUser.username + '! I am your AI assistant. Tell me what tasks you need help with.');
  } catch (e) { showLogin(); }
}

function showLogin() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
  document.getElementById('chat-fab').style.display = 'none';
  if (chatOpen) toggleChat();
}

function navigateTo(page) {
  currentPage = page;
  var pages = ['tasks', 'dashboard', 'projects', 'tags'];
  pages.forEach(function(p) {
    var el = document.getElementById('page-' + p);
    if (el) el.style.display = p === page ? 'flex' : 'none';
  });
  // Update sidebar active state
  document.querySelectorAll('.sidebar-item[data-page]').forEach(function(el) {
    el.classList.toggle('active', el.dataset.page === page);
  });
  document.querySelectorAll('.drawer-item[data-page]').forEach(function(el) {
    el.classList.toggle('active', el.dataset.page === page);
  });
  // Update mobile page title
  var titles = { tasks: 'Tasks', dashboard: 'Dashboard', projects: 'Projects', tags: 'Tags' };
  var titleEl = document.getElementById('mobile-page-title');
  if (titleEl) titleEl.textContent = titles[page] || page;
  // Load dashboard data when switching to that page
  if (page === 'dashboard') loadDashboard();
  if (page === 'projects') renderProjectsPage();
  if (page === 'tags') renderTagsPage();
}

function toggleChat() {
  chatOpen = !chatOpen;
  var widget = document.getElementById('chat-widget');
  var fab = document.getElementById('chat-fab');
  if (!widget || !fab) return;
  widget.style.display = chatOpen ? 'flex' : 'none';
  fab.textContent = chatOpen ? '✕' : '💬';
  if (chatOpen) {
    var msgs = document.getElementById('chat-messages');
    msgs.scrollTop = msgs.scrollHeight;
    document.getElementById('chat-input').focus();
  }
}

function toggleDrawer() {
  drawerOpen = !drawerOpen;
  var drawer = document.getElementById('mobile-drawer');
  var overlay = document.getElementById('drawer-overlay');
  drawer.classList.toggle('open', drawerOpen);
  overlay.style.display = drawerOpen ? 'block' : 'none';
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

// Statuses
async function loadStatuses(projectId) {
  var url = '/api/statuses';
  if (projectId !== undefined && projectId !== null) url += '?project_id=' + projectId;
  var resp = await fetch(url, { headers: authHeaders() });
  if (!resp.ok) return;
  allStatuses = await resp.json();
}

function renderProjectFilters() {
  var container = document.getElementById('project-filters');
  while (container.firstChild) container.removeChild(container.firstChild);
  allProjects.forEach(function(p) {
    var btn = document.createElement('button');
    btn.className = 'filter-btn';
    btn.dataset.projectId = p.id;
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
  var _pid = activeFilter.indexOf('project:') === 0 ? parseInt(activeFilter.split(':')[1]) : undefined;
  await loadStatuses(_pid);
  renderCurrentView();
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
  // Reload statuses for the selected project (or defaults if "All")
  if (filter.indexOf('project:') === 0) {
    var pid = parseInt(filter.split(':')[1]);
    loadStatuses(pid).then(function() { renderCurrentView(); });
  } else {
    loadStatuses().then(function() { renderCurrentView(); });
  }
  // If board is active and we lose project filter, switch back to list
  if (filter.indexOf('project:') !== 0 && currentView === 'board') switchView('list');
}

function filteredTasks() {
  var today = new Date().toISOString().split('T')[0];
  if (activeFilter === 'today') {
    return allTasks.filter(function(t) { return t.due_date === today; });
  }
  if (activeFilter === 'overdue') {
    return allTasks.filter(function(t) {
      return t.due_date && t.due_date < today && t.status_name !== 'Done';
    });
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
  card.className = 'task-card priority-' + t.priority + (t.status_name === 'Done' ? ' status-done' : '');
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
  allStatuses.forEach(function(s) {
    var opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.name;
    if (t.status_id === s.id) opt.selected = true;
    statusSel.appendChild(opt);
  });
  statusSel.addEventListener('change', function() {
    updateTaskStatus(t.id, parseInt(statusSel.value));
  });
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

  var overdueGroup = tasks.filter(function(t) {
    return t.due_date && t.due_date < today && t.status_name !== 'Done';
  });
  var remaining = tasks.filter(function(t) {
    return !(t.due_date && t.due_date < today && t.status_name !== 'Done');
  });

  if (overdueGroup.length > 0) {
    var label = document.createElement('div');
    label.className = 'task-group-label overdue';
    label.textContent = 'OVERDUE';
    container.appendChild(label);
    overdueGroup.forEach(function(t) { container.appendChild(buildTaskCard(t)); });
  }

  // Group remaining tasks by status name
  var statusOrder = allStatuses.length > 0
    ? allStatuses.map(function(s) { return s.name; })
    : ['Todo', 'In Progress', 'Done'];

  statusOrder.forEach(function(sName) {
    var group = remaining.filter(function(t) { return t.status_name === sName; });
    if (group.length === 0) return;
    var label = document.createElement('div');
    var cssKey = sName === 'Done' ? 'done' : sName === 'In Progress' ? 'in-progress' : 'todo';
    label.className = 'task-group-label ' + cssKey;
    label.textContent = sName.toUpperCase();
    container.appendChild(label);
    group.forEach(function(t) { container.appendChild(buildTaskCard(t)); });
  });

  // Tasks whose status_name doesn't match any known status
  var knownNames = new Set(statusOrder);
  var unknown = remaining.filter(function(t) { return !knownNames.has(t.status_name); });
  unknown.forEach(function(t) { container.appendChild(buildTaskCard(t)); });
}

// View switching
function renderCurrentView() {
  if (currentView === 'list') renderTasks();
  else if (currentView === 'board') renderBoard();
  else if (currentView === 'calendar') renderCalendar();
  else if (currentView === 'timeline') renderTimeline();
}

function switchView(view) {
  currentView = view;
  ['list', 'board', 'calendar', 'timeline'].forEach(function(v) {
    var el = document.getElementById('view-' + v);
    if (el) el.style.display = v === view ? 'flex' : 'none';
  });
  document.querySelectorAll('.view-tab').forEach(function(tab) {
    tab.classList.toggle('active', tab.dataset.view === view);
  });
  renderCurrentView();
}

function renderCalendar() {
  var grid = document.getElementById('calendar-grid');
  var label = document.getElementById('cal-month-label');
  if (!grid || !label || !currentCalendarMonth) return;
  while (grid.firstChild) grid.removeChild(grid.firstChild);

  var y = currentCalendarMonth.year;
  var m = currentCalendarMonth.month;
  var monthNames = ['January','February','March','April','May','June',
    'July','August','September','October','November','December'];
  label.textContent = monthNames[m] + ' ' + y;

  // Day headers
  ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(function(d) {
    var h = document.createElement('div');
    h.className = 'cal-day-header';
    h.textContent = d;
    grid.appendChild(h);
  });

  var firstDay = new Date(y, m, 1).getDay();  // 0=Sun
  var daysInMonth = new Date(y, m + 1, 0).getDate();
  var daysInPrev = new Date(y, m, 0).getDate();
  var today = new Date().toISOString().split('T')[0];

  // Build task index by due_date
  var tasksByDate = {};
  filteredTasks().forEach(function(t) {
    if (t.due_date) {
      if (!tasksByDate[t.due_date]) tasksByDate[t.due_date] = [];
      tasksByDate[t.due_date].push(t);
    }
  });

  // Leading cells from previous month
  for (var i = firstDay - 1; i >= 0; i--) {
    var cell = document.createElement('div');
    cell.className = 'cal-cell other-month';
    var dateEl = document.createElement('div');
    dateEl.className = 'cal-date';
    dateEl.textContent = daysInPrev - i;
    cell.appendChild(dateEl);
    grid.appendChild(cell);
  }

  // Current month cells
  for (var d = 1; d <= daysInMonth; d++) {
    var dateStr = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    var cell = document.createElement('div');
    cell.className = 'cal-cell' + (dateStr === today ? ' today' : '');
    var dateEl = document.createElement('div');
    dateEl.className = 'cal-date';
    dateEl.textContent = d;
    cell.appendChild(dateEl);
    // Task pills
    (tasksByDate[dateStr] || []).forEach(function(t) {
      var pill = document.createElement('div');
      pill.className = 'cal-task-pill priority-' + t.priority;
      pill.textContent = t.title;
      pill.title = t.title;
      pill.addEventListener('click', function(e) {
        e.stopPropagation();
        navigateTo('tasks');
        switchView('list');
        // Expand the task in list view
        expandedTaskId = t.id;
        renderTasks();
      });
      cell.appendChild(pill);
    });
    // Click empty area to open new task modal with pre-filled date
    cell.addEventListener('click', function(captured_date) {
      return function() { openNewTaskModal(captured_date, null, null); };
    }(dateStr));
    grid.appendChild(cell);
  }

  // Trailing cells
  var totalCells = firstDay + daysInMonth;
  var trailing = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
  for (var t2 = 1; t2 <= trailing; t2++) {
    var cell = document.createElement('div');
    cell.className = 'cal-cell other-month';
    var dateEl = document.createElement('div');
    dateEl.className = 'cal-date';
    dateEl.textContent = t2;
    cell.appendChild(dateEl);
    grid.appendChild(cell);
  }
}

function renderTimeline() {
  var rowsEl = document.getElementById('timeline-rows');
  var rangeLabel = document.getElementById('tl-range-label');
  if (!rowsEl || !rangeLabel) return;
  while (rowsEl.firstChild) rowsEl.removeChild(rowsEl.firstChild);

  var tasksWithDate = filteredTasks().filter(function(t) { return t.due_date; });
  var tasksNoDate   = filteredTasks().filter(function(t) { return !t.due_date; });

  if (tasksWithDate.length === 0 && tasksNoDate.length === 0) {
    var empty = document.createElement('div');
    empty.className = 'tl-empty';
    empty.textContent = 'No tasks with due dates yet';
    rowsEl.appendChild(empty);
    rangeLabel.textContent = '';
    return;
  }

  // Compute date window
  var dates = tasksWithDate.length > 0
    ? tasksWithDate.map(function(t) { return new Date(t.due_date + 'T00:00:00'); })
    : [new Date()];
  var minDate = new Date(Math.min.apply(null, dates));
  var maxDate = new Date(Math.max.apply(null, dates));

  minDate.setDate(minDate.getDate() - 3 + currentTimelineOffset);
  maxDate.setDate(maxDate.getDate() + 7 + currentTimelineOffset);

  var windowDays = Math.max(14, Math.round((maxDate - minDate) / 86400000) + 1);
  maxDate = new Date(minDate);
  maxDate.setDate(minDate.getDate() + windowDays - 1);

  var fmt = function(d) { return (d.getMonth()+1) + '/' + d.getDate(); };
  rangeLabel.textContent = fmt(minDate) + ' — ' + fmt(maxDate);

  function dateToPercent(dateStr) {
    var d = new Date(dateStr + 'T00:00:00');
    var diff = Math.round((d - minDate) / 86400000);
    return (diff / windowDays) * 100;
  }

  // Date header ticks (every 7 days)
  var header = document.createElement('div');
  header.className = 'tl-date-header';
  for (var i = 0; i < windowDays; i += 7) {
    var tick = document.createElement('div');
    tick.className = 'tl-date-tick';
    var d = new Date(minDate); d.setDate(minDate.getDate() + i);
    tick.textContent = fmt(d);
    tick.style.width = Math.min(7, windowDays - i) / windowDays * 100 + '%';
    header.appendChild(tick);
  }
  rowsEl.appendChild(header);

  // Task rows
  tasksWithDate.forEach(function(t) {
    var row = document.createElement('div');
    row.className = 'tl-row';
    var lbl = document.createElement('div');
    lbl.className = 'tl-row-label';
    lbl.textContent = t.title;
    lbl.title = t.title;
    row.appendChild(lbl);
    var barArea = document.createElement('div');
    barArea.className = 'tl-row-bar-area';
    var bar = document.createElement('div');
    bar.className = 'gantt-bar priority-' + t.priority;
    var leftPct = dateToPercent(t.due_date);
    var widthPct = (1 / windowDays) * 100;
    bar.style.left = leftPct + '%';
    bar.style.width = widthPct + '%';
    bar.title = t.title + ' · due ' + t.due_date;

    // Drag to change due date
    var dragStartX = null;
    var origLeft = null;
    bar.addEventListener('mousedown', function(e) {
      e.preventDefault();
      dragStartX = e.clientX;
      origLeft = leftPct;
      var barAreaRect = barArea.getBoundingClientRect();
      var barAreaWidth = barAreaRect.width;
      function onMove(ev) {
        var dx = ev.clientX - dragStartX;
        var daysDelta = Math.round((dx / barAreaWidth) * windowDays);
        var newPct = Math.max(0, Math.min(origLeft + (daysDelta / windowDays) * 100, 100 - widthPct));
        bar.style.left = newPct + '%';
      }
      function onUp(ev) {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        var dx = ev.clientX - dragStartX;
        var daysDelta = Math.round((dx / barAreaRect.width) * windowDays);
        if (daysDelta !== 0) {
          var origDate = new Date(t.due_date + 'T00:00:00');
          origDate.setDate(origDate.getDate() + daysDelta);
          var newDate = origDate.toISOString().split('T')[0];
          fetch('/api/tasks/' + t.id, {
            method: 'PUT', headers: authHeaders(),
            body: JSON.stringify({ due_date: newDate }),
          }).then(function() { loadTasks(); });
        } else {
          bar.style.left = leftPct + '%';
        }
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    barArea.appendChild(bar);
    row.appendChild(barArea);
    rowsEl.appendChild(row);
  });

  // "No due date" section
  if (tasksNoDate.length > 0) {
    var sep = document.createElement('div');
    sep.className = 'tl-separator';
    sep.textContent = 'No due date (' + tasksNoDate.length + ')';
    rowsEl.appendChild(sep);
    tasksNoDate.forEach(function(t) {
      var row = document.createElement('div');
      row.className = 'tl-row';
      var lbl = document.createElement('div');
      lbl.className = 'tl-row-label';
      lbl.textContent = t.title;
      row.appendChild(lbl);
      var dash = document.createElement('div');
      dash.style.cssText = 'flex:1;color:var(--text-dim);font-size:10px;display:flex;align-items:center;padding-left:8px';
      dash.textContent = '— no date';
      row.appendChild(dash);
      rowsEl.appendChild(row);
    });
  }
}

function renderBoard() {
  var container = document.getElementById('board-columns');
  if (!container) return;
  while (container.firstChild) container.removeChild(container.firstChild);

  // Board requires a project to be selected
  if (activeFilter.indexOf('project:') !== 0) {
    var msg = document.createElement('div');
    msg.className = 'board-disabled-msg';
    msg.textContent = 'Board view requires a project — click a project name in the filter bar above';
    container.appendChild(msg);
    return;
  }

  var tasks = filteredTasks();

  allStatuses.forEach(function(status) {
    var col = document.createElement('div');
    col.className = 'board-column';
    col.dataset.statusId = status.id;

    // Column header
    var header = document.createElement('div');
    header.className = 'board-column-header';
    var dot = document.createElement('span');
    dot.className = 'board-column-dot';
    dot.style.background = status.color;
    var nameEl = document.createElement('span');
    nameEl.className = 'board-column-name';
    nameEl.textContent = status.name;
    var countEl = document.createElement('span');
    countEl.className = 'board-column-count';
    var colTasks = tasks.filter(function(t) { return t.status_id === status.id; });
    countEl.textContent = colTasks.length;
    header.appendChild(dot);
    header.appendChild(nameEl);
    header.appendChild(countEl);
    col.appendChild(header);

    // Cards area
    var cards = document.createElement('div');
    cards.className = 'board-column-cards';
    colTasks.forEach(function(t) { cards.appendChild(buildBoardCard(t)); });
    col.appendChild(cards);

    // Drag-and-drop on column
    col.addEventListener('dragover', function(e) {
      e.preventDefault();
      col.classList.add('drag-over');
    });
    col.addEventListener('dragleave', function() { col.classList.remove('drag-over'); });
    col.addEventListener('drop', function(e) {
      e.preventDefault();
      col.classList.remove('drag-over');
      var taskId = parseInt(e.dataTransfer.getData('text/plain'));
      if (taskId) {
        fetch('/api/tasks/' + taskId, {
          method: 'PUT', headers: authHeaders(),
          body: JSON.stringify({ status_id: status.id }),
        }).then(function(r) {
          if (!r.ok) alert('Failed to move task. Please try again.');
          loadTasks();
        }).catch(function() { loadTasks(); });
      }
    });

    // "+ Add card" footer
    var addBtn = document.createElement('button');
    addBtn.className = 'board-add-card-btn';
    addBtn.textContent = '+ Add card';
    addBtn.addEventListener('click', function() {
      var activePid = activeFilter.indexOf('project:') === 0 ? parseInt(activeFilter.split(':')[1]) : null;
      openNewTaskModal(null, activePid, status.id);
    });
    col.appendChild(addBtn);

    container.appendChild(col);
  });

  // "+ Add status" column
  var addCol = document.createElement('div');
  addCol.className = 'board-add-column';
  var addColBtn = document.createElement('button');
  addColBtn.className = 'board-add-column-btn';
  addColBtn.textContent = '+ Add status';
  addColBtn.addEventListener('click', function() { showAddStatusForm(addCol, addColBtn); });
  addCol.appendChild(addColBtn);
  container.appendChild(addCol);
}

function buildBoardCard(t) {
  var card = document.createElement('div');
  card.className = 'board-card priority-' + t.priority;
  card.draggable = true;
  card.dataset.taskId = t.id;
  card.addEventListener('dragstart', function(e) {
    e.dataTransfer.setData('text/plain', t.id);
    card.classList.add('dragging');
  });
  card.addEventListener('dragend', function() { card.classList.remove('dragging'); });
  var title = document.createElement('div');
  title.className = 'board-card-title';
  title.textContent = t.title;
  card.appendChild(title);
  var metaParts = [];
  if (t.due_date) metaParts.push('Due ' + t.due_date);
  if (t.tags && t.tags.length > 0) metaParts.push(t.tags.map(function(tg) { return tg.name; }).join(', '));
  if (metaParts.length) {
    var meta = document.createElement('div');
    meta.className = 'board-card-meta';
    meta.textContent = metaParts.join(' · ');
    card.appendChild(meta);
  }
  return card;
}

function showAddStatusForm(container, triggerBtn) {
  var existing = document.getElementById('add-status-form');
  if (existing) { existing.remove(); triggerBtn.style.display = 'block'; return; }
  triggerBtn.style.display = 'none';
  var form = document.createElement('div');
  form.id = 'add-status-form';
  form.style.cssText = 'display:flex;flex-direction:column;gap:6px';
  var nameInp = document.createElement('input');
  nameInp.type = 'text'; nameInp.placeholder = 'Status name';
  nameInp.style.cssText = 'font-size:11px;padding:4px 8px';
  var colorInp = document.createElement('input');
  colorInp.type = 'color'; colorInp.value = '#4a90d9';
  var row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:4px';
  var saveBtn = document.createElement('button');
  saveBtn.textContent = '✓'; saveBtn.style.cssText = 'font-size:10px;padding:2px 8px';
  var cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn-secondary'; cancelBtn.textContent = '✕';
  cancelBtn.style.cssText = 'font-size:10px;padding:2px 8px';
  row.appendChild(colorInp); row.appendChild(saveBtn); row.appendChild(cancelBtn);
  async function doCreate() {
    var name = nameInp.value.trim();
    if (!name) return;
    var pid = parseInt(activeFilter.split(':')[1]);
    if (isNaN(pid)) return;
    var resp = await fetch('/api/statuses', {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ name: name, color: colorInp.value, project_id: pid }),
    });
    if (!resp.ok) {
      var err = await resp.json().catch(function() { return {}; });
      alert(err.detail || 'Failed to create status');
      return;
    }
    await loadStatuses(pid);
    await loadTasks();
  }
  saveBtn.addEventListener('click', doCreate);
  cancelBtn.addEventListener('click', function() { form.remove(); triggerBtn.style.display = 'block'; });
  nameInp.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') doCreate();
    if (e.key === 'Escape') { form.remove(); triggerBtn.style.display = 'block'; }
  });
  form.appendChild(nameInp); form.appendChild(row);
  container.insertBefore(form, triggerBtn);
  nameInp.focus();
}

function toggleTask(id) {
  editingTaskId = null;
  editingStepId = null;
  expandedTaskId = (expandedTaskId === id) ? null : id;
  renderTasks();
}

async function updateTaskStatus(id, statusId) {
  await fetch('/api/tasks/' + id, {
    method: 'PUT', headers: authHeaders(),
    body: JSON.stringify({ status_id: statusId }),
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
  var count = allTasks.filter(function(t) { return t.due_date && t.due_date < today && t.status_name !== 'Done'; }).length;
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
      row.className = 'subtask-row' + (child.status_name === 'Done' ? ' done' : '');
      row.id = 'step-row-' + child.id;
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = child.status_name === 'Done';
      cb.addEventListener('change', function(e) {
        e.stopPropagation();
        toggleSubtask(child.id, cb.checked, parentId, container);
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

function findStatusId(name) {
  var s = allStatuses.find(function(s) { return s.name.toLowerCase() === name.toLowerCase(); });
  return s ? s.id : null;
}

async function toggleSubtask(id, isDone, parentId, container) {
  var statusId = isDone ? findStatusId('Done') : findStatusId('Todo');
  if (!statusId) return;
  await fetch('/api/tasks/' + id, {
    method: 'PUT', headers: authHeaders(), body: JSON.stringify({ status_id: statusId }),
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
function openNewTaskModal(dueDate, projectId, statusId) {
  var modal = document.getElementById('task-modal');
  var dueDateInp = document.getElementById('mt-due');
  var projectSel = document.getElementById('mt-project');
  if (dueDate) dueDateInp.value = dueDate;
  if (projectId) projectSel.value = projectId;
  modal.dataset.preselectStatusId = statusId || '';
  modal.style.display = 'flex';
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
  var preselectStatusId = document.getElementById('task-modal').dataset.preselectStatusId;
  var body = {
    title: title,
    priority: document.getElementById('mt-priority').value,
    due_date: document.getElementById('mt-due').value || null,
    project_id: parseInt(document.getElementById('mt-project').value) || null,
    notes: document.getElementById('mt-notes').value.trim() || null,
    tag_ids: [],
  };
  if (preselectStatusId) body.status_id = parseInt(preselectStatusId);
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

// ── Projects page ──────────────────────────────────────────────────────────

async function renderProjectsPage() {
  await Promise.all(allProjects.map(async function(p) {
    var resp = await fetch('/api/statuses?project_id=' + p.id, { headers: authHeaders() });
    if (resp.ok) projectStatusMap[p.id] = await resp.json();
  }));
  _renderProjectsList();
}

function _renderProjectsList() {
  var page = document.getElementById('page-projects');
  while (page.firstChild) page.removeChild(page.firstChild);

  var hdr = document.createElement('div');
  hdr.className = 'proj-page-header';
  var title = document.createElement('h2');
  title.textContent = 'Projects';
  var list = document.createElement('div');
  list.className = 'proj-list';
  var newBtn = document.createElement('button');
  newBtn.textContent = '+ New Project';
  newBtn.addEventListener('click', function() { showNewProjectForm(list); });
  hdr.appendChild(title);
  hdr.appendChild(newBtn);
  page.appendChild(hdr);

  if (allProjects.length === 0) {
    var empty = document.createElement('div');
    empty.className = 'proj-empty';
    empty.textContent = 'No projects yet. Create one to get started.';
    list.appendChild(empty);
  } else {
    allProjects.forEach(function(p) {
      list.appendChild(buildProjectCard(p, list));
    });
  }
  page.appendChild(list);
}

function showNewProjectForm(list) {
  var existing = document.getElementById('new-proj-form');
  if (existing) { existing.remove(); return; }
  var form = document.createElement('div');
  form.id = 'new-proj-form';
  form.className = 'proj-new-form';
  var input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Project name';
  var saveBtn = document.createElement('button');
  saveBtn.textContent = 'Create';
  var cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn-secondary';
  cancelBtn.textContent = 'Cancel';
  async function doCreate() {
    var name = input.value.trim();
    if (!name) return;
    var resp = await fetch('/api/projects', {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ name: name }),
    });
    if (resp.ok) {
      var created = await resp.json();
      projectStatusMap[created.id] = created.statuses;
      await loadProjects();
      _renderProjectsList();
    } else {
      alert('Failed to create project');
    }
  }
  saveBtn.addEventListener('click', doCreate);
  cancelBtn.addEventListener('click', function() { form.remove(); });
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') doCreate();
    if (e.key === 'Escape') form.remove();
  });
  form.appendChild(input);
  form.appendChild(saveBtn);
  form.appendChild(cancelBtn);
  list.insertBefore(form, list.firstChild);
  input.focus();
}

function buildProjectCard(p, list) {
  var statuses = projectStatusMap[p.id] || [];
  var taskCount = allTasks.filter(function(t) { return t.project_id === p.id; }).length;
  var isExpanded = expandedProjectId === p.id;

  var card = document.createElement('div');
  card.className = 'proj-card';

  var hdr = document.createElement('div');
  hdr.className = 'proj-card-header';
  var nameEl = document.createElement('span');
  nameEl.className = 'proj-card-name';
  nameEl.textContent = p.name;
  var countEl = document.createElement('span');
  countEl.className = 'proj-card-count';
  countEl.textContent = taskCount + ' task' + (taskCount !== 1 ? 's' : '');
  var chevron = document.createElement('span');
  chevron.className = 'proj-card-chevron';
  chevron.textContent = isExpanded ? '↑' : '↓';
  var viewTasksBtn = document.createElement('button');
  viewTasksBtn.className = 'proj-card-view-tasks';
  viewTasksBtn.textContent = 'View Tasks';
  viewTasksBtn.title = 'Go to Tasks filtered by this project';
  viewTasksBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    navigateTo('tasks');
    var filterBtn = document.querySelector('#project-filters [data-project-id="' + p.id + '"]');
    setFilter('project:' + p.id, filterBtn);
  });

  var delBtn = document.createElement('button');
  delBtn.className = 'proj-card-del';
  delBtn.textContent = '✕';
  delBtn.title = 'Delete project';
  delBtn.addEventListener('click', async function(e) {
    e.stopPropagation();
    if (!confirm('Delete project "' + p.name + '"? Tasks assigned to it will become unassigned.')) return;
    var resp = await fetch('/api/projects/' + p.id, { method: 'DELETE', headers: authHeaders() });
    if (resp.ok) {
      delete projectStatusMap[p.id];
      if (expandedProjectId === p.id) expandedProjectId = null;
      await loadProjects();
      await loadTasks();
      _renderProjectsList();
    } else {
      alert('Failed to delete project');
    }
  });
  hdr.appendChild(nameEl);
  hdr.appendChild(countEl);
  hdr.appendChild(chevron);
  hdr.appendChild(viewTasksBtn);
  hdr.appendChild(delBtn);
  hdr.addEventListener('click', function() {
    expandedProjectId = isExpanded ? null : p.id;
    _renderProjectsList();
  });
  card.appendChild(hdr);

  var chips = document.createElement('div');
  chips.className = 'proj-status-chips';
  statuses.forEach(function(s) {
    var chip = document.createElement('span');
    chip.className = 'proj-status-chip';
    var dot = document.createElement('span');
    dot.className = 'proj-status-dot';
    dot.style.background = s.color;
    chip.appendChild(dot);
    chip.appendChild(document.createTextNode(s.name));
    chips.appendChild(chip);
  });
  card.appendChild(chips);

  if (isExpanded) {
    var body = document.createElement('div');
    body.className = 'proj-card-body';

    var renameRow = document.createElement('div');
    renameRow.className = 'proj-rename-row';
    var renameInput = document.createElement('input');
    renameInput.type = 'text';
    renameInput.value = p.name;
    var saveRename = document.createElement('button');
    saveRename.textContent = 'Save';
    var cancelRename = document.createElement('button');
    cancelRename.className = 'btn-secondary';
    cancelRename.textContent = 'Cancel';
    async function doRename() {
      var name = renameInput.value.trim();
      if (!name) return;
      var resp = await fetch('/api/projects/' + p.id, {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({ name: name }),
      });
      if (resp.ok) { await loadProjects(); _renderProjectsList(); }
      else { alert('Failed to rename project'); }
    }
    saveRename.addEventListener('click', doRename);
    cancelRename.addEventListener('click', function() { expandedProjectId = null; _renderProjectsList(); });
    renameInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') doRename();
      if (e.key === 'Escape') { expandedProjectId = null; _renderProjectsList(); }
    });
    renameRow.appendChild(renameInput);
    renameRow.appendChild(saveRename);
    renameRow.appendChild(cancelRename);
    body.appendChild(renameRow);

    var statusLabel = document.createElement('div');
    statusLabel.className = 'proj-section-label';
    statusLabel.textContent = 'Statuses';
    body.appendChild(statusLabel);

    var statusList = document.createElement('div');
    statusList.className = 'proj-status-list';
    statuses.forEach(function(s) {
      statusList.appendChild(buildStatusRow(s, statuses, p.id));
    });
    body.appendChild(statusList);

    var addStatusBtn = document.createElement('button');
    addStatusBtn.className = 'proj-add-status-btn';
    addStatusBtn.textContent = '+ Add Status';
    addStatusBtn.addEventListener('click', function() {
      var existing = statusList.querySelector('.proj-add-status-form');
      if (existing) { existing.remove(); return; }
      buildAddStatusForm(p.id, statusList);
    });
    body.appendChild(addStatusBtn);
    card.appendChild(body);
  }

  return card;
}

function buildStatusRow(s, allProjectStatuses, projectId) {
  var row = document.createElement('div');
  row.className = 'proj-status-row';
  var swatch = document.createElement('span');
  swatch.className = 'proj-status-swatch';
  swatch.style.background = s.color;
  var nameEl = document.createElement('span');
  nameEl.className = 'proj-status-name';
  nameEl.textContent = s.name;
  var controls = document.createElement('span');
  controls.className = 'proj-status-controls';

  var editBtn = document.createElement('button');
  editBtn.className = 'proj-status-btn';
  editBtn.textContent = 'Edit';
  editBtn.addEventListener('click', function() {
    var editRow = buildStatusEditRow(s, projectId, row);
    row.replaceWith(editRow);
    editRow.querySelector('input[type="text"]').focus();
  });

  var idx = allProjectStatuses.findIndex(function(x) { return x.id === s.id; });

  var upBtn = document.createElement('button');
  upBtn.className = 'proj-status-btn';
  upBtn.textContent = '↑';
  upBtn.disabled = idx === 0;
  upBtn.addEventListener('click', async function() {
    var ids = allProjectStatuses.map(function(x) { return x.id; });
    ids.splice(idx - 1, 0, ids.splice(idx, 1)[0]);
    var resp = await fetch('/api/statuses/reorder', {
      method: 'PUT', headers: authHeaders(),
      body: JSON.stringify({ ids: ids }),
    });
    if (resp.ok) {
      var r2 = await fetch('/api/statuses?project_id=' + projectId, { headers: authHeaders() });
      if (r2.ok) projectStatusMap[projectId] = await r2.json();
      _renderProjectsList();
    }
  });

  var downBtn = document.createElement('button');
  downBtn.className = 'proj-status-btn';
  downBtn.textContent = '↓';
  downBtn.disabled = idx === allProjectStatuses.length - 1;
  downBtn.addEventListener('click', async function() {
    var ids = allProjectStatuses.map(function(x) { return x.id; });
    ids.splice(idx + 1, 0, ids.splice(idx, 1)[0]);
    var resp = await fetch('/api/statuses/reorder', {
      method: 'PUT', headers: authHeaders(),
      body: JSON.stringify({ ids: ids }),
    });
    if (resp.ok) {
      var r2 = await fetch('/api/statuses?project_id=' + projectId, { headers: authHeaders() });
      if (r2.ok) projectStatusMap[projectId] = await r2.json();
      _renderProjectsList();
    }
  });

  var delBtn = document.createElement('button');
  delBtn.className = 'proj-status-btn';
  delBtn.textContent = '✕';
  delBtn.disabled = allProjectStatuses.length <= 1;
  delBtn.title = allProjectStatuses.length <= 1 ? 'Cannot delete the last status' : 'Delete status';
  delBtn.addEventListener('click', async function() {
    if (allProjectStatuses.length <= 1) return;
    if (!confirm('Delete status "' + s.name + '"? Tasks will be moved to the next remaining status.')) return;
    var resp = await fetch('/api/statuses/' + s.id, { method: 'DELETE', headers: authHeaders() });
    if (resp.ok) {
      var r2 = await fetch('/api/statuses?project_id=' + projectId, { headers: authHeaders() });
      if (r2.ok) projectStatusMap[projectId] = await r2.json();
      _renderProjectsList();
    } else {
      var err = await resp.json().catch(function() { return {}; });
      alert(err.detail || 'Failed to delete status');
    }
  });

  controls.appendChild(editBtn);
  controls.appendChild(upBtn);
  controls.appendChild(downBtn);
  controls.appendChild(delBtn);
  row.appendChild(swatch);
  row.appendChild(nameEl);
  row.appendChild(controls);
  return row;
}

function buildStatusEditRow(s, projectId, originalRow) {
  var row = document.createElement('div');
  row.className = 'proj-status-row proj-status-edit-row';
  var swatch = document.createElement('span');
  swatch.className = 'proj-status-swatch';
  swatch.style.background = s.color;
  var nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.value = s.name;
  nameInput.style.cssText = 'font-size:12px;padding:3px 8px;width:120px;';
  var colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.value = s.color;
  colorInput.style.cssText = 'width:28px;height:24px;padding:1px;cursor:pointer;border:none;';
  colorInput.addEventListener('input', function() { swatch.style.background = colorInput.value; });
  var saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save';
  saveBtn.style.cssText = 'font-size:11px;padding:3px 10px;';
  var cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn-secondary';
  cancelBtn.textContent = '✕';
  cancelBtn.style.cssText = 'font-size:11px;padding:3px 7px;';
  async function doSave() {
    var name = nameInput.value.trim();
    if (!name) return;
    var resp = await fetch('/api/statuses/' + s.id, {
      method: 'PUT', headers: authHeaders(),
      body: JSON.stringify({ name: name, color: colorInput.value }),
    });
    if (resp.ok) {
      var r2 = await fetch('/api/statuses?project_id=' + projectId, { headers: authHeaders() });
      if (r2.ok) projectStatusMap[projectId] = await r2.json();
      _renderProjectsList();
    } else {
      alert('Failed to update status');
    }
  }
  saveBtn.addEventListener('click', doSave);
  cancelBtn.addEventListener('click', function() { row.replaceWith(originalRow); });
  nameInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') doSave();
    if (e.key === 'Escape') row.replaceWith(originalRow);
  });
  row.appendChild(swatch);
  row.appendChild(nameInput);
  row.appendChild(colorInput);
  row.appendChild(saveBtn);
  row.appendChild(cancelBtn);
  return row;
}

function buildAddStatusForm(projectId, statusList) {
  var form = document.createElement('div');
  form.className = 'proj-add-status-form';
  var nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.placeholder = 'Status name';
  nameInput.style.cssText = 'font-size:12px;padding:3px 8px;width:120px;';
  var colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.value = '#4a90d9';
  colorInput.style.cssText = 'width:28px;height:24px;padding:1px;cursor:pointer;border:none;';
  var saveBtn = document.createElement('button');
  saveBtn.textContent = '✓';
  saveBtn.style.cssText = 'font-size:11px;padding:3px 8px;';
  var cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn-secondary';
  cancelBtn.textContent = '✕';
  cancelBtn.style.cssText = 'font-size:11px;padding:3px 7px;';
  async function doCreate() {
    var name = nameInput.value.trim();
    if (!name) return;
    var resp = await fetch('/api/statuses', {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ name: name, color: colorInput.value, project_id: projectId }),
    });
    if (resp.ok) {
      var r2 = await fetch('/api/statuses?project_id=' + projectId, { headers: authHeaders() });
      if (r2.ok) projectStatusMap[projectId] = await r2.json();
      _renderProjectsList();
    } else {
      var err = await resp.json().catch(function() { return {}; });
      alert(err.detail || 'Failed to create status');
    }
  }
  saveBtn.addEventListener('click', doCreate);
  cancelBtn.addEventListener('click', function() { form.remove(); });
  nameInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') doCreate();
    if (e.key === 'Escape') form.remove();
  });
  form.appendChild(nameInput);
  form.appendChild(colorInput);
  form.appendChild(saveBtn);
  form.appendChild(cancelBtn);
  statusList.appendChild(form);
  nameInput.focus();
}

// ── Tags page ──────────────────────────────────────────────────────────────

function renderTagsPage() {
  var page = document.getElementById('page-tags');
  while (page.firstChild) page.removeChild(page.firstChild);

  var hdr = document.createElement('div');
  hdr.className = 'tag-page-header';
  var title = document.createElement('h2');
  title.textContent = 'Tags';
  var list = document.createElement('div');
  list.className = 'tag-list-page';
  var newBtn = document.createElement('button');
  newBtn.textContent = '+ New Tag';
  newBtn.addEventListener('click', function() {
    var existing = document.getElementById('new-tag-page-form');
    if (existing) { existing.remove(); return; }
    var form = buildTagCreateForm(list);
    list.insertBefore(form, list.firstChild);
    form.querySelector('input[type="text"]').focus();
  });
  hdr.appendChild(title);
  hdr.appendChild(newBtn);
  page.appendChild(hdr);

  if (allTags.length === 0) {
    var empty = document.createElement('div');
    empty.className = 'tag-empty';
    empty.textContent = 'No tags yet. Create one to get started.';
    list.appendChild(empty);
  } else {
    allTags.forEach(function(tag) {
      list.appendChild(buildTagRow(tag, list));
    });
  }
  page.appendChild(list);
}

function buildTagRow(tag, list) {
  var row = document.createElement('div');
  row.className = 'tag-row';
  var swatch = document.createElement('span');
  swatch.className = 'tag-swatch';
  swatch.style.background = tag.color;
  var nameEl = document.createElement('span');
  nameEl.className = 'tag-row-name';
  nameEl.textContent = tag.name;
  var controls = document.createElement('span');
  controls.className = 'tag-row-controls';
  var editBtn = document.createElement('button');
  editBtn.className = 'tag-row-btn';
  editBtn.textContent = 'Edit';
  editBtn.addEventListener('click', function() {
    var existingEdit = list.querySelector('.tag-edit-row');
    if (existingEdit) existingEdit.remove();
    var editRow = buildTagEditRow(tag, list);
    row.after(editRow);
    editRow.querySelector('input[type="text"]').focus();
  });
  var delBtn = document.createElement('button');
  delBtn.className = 'tag-row-btn';
  delBtn.textContent = '✕';
  delBtn.title = 'Delete tag';
  delBtn.addEventListener('click', async function() {
    if (!confirm('Delete tag "' + tag.name + '"? It will be removed from all tasks.')) return;
    var resp = await fetch('/api/tags/' + tag.id, { method: 'DELETE', headers: authHeaders() });
    if (resp.ok) { await loadTags(); renderTagsPage(); }
    else { alert('Failed to delete tag'); }
  });
  controls.appendChild(editBtn);
  controls.appendChild(delBtn);
  row.appendChild(swatch);
  row.appendChild(nameEl);
  row.appendChild(controls);
  return row;
}

function buildTagEditRow(tag, list) {
  var row = document.createElement('div');
  row.className = 'tag-edit-row';
  var swatch = document.createElement('span');
  swatch.className = 'tag-swatch';
  swatch.style.background = tag.color;
  var nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.value = tag.name;
  nameInput.style.cssText = 'font-size:12px;padding:4px 8px;width:150px;';
  var colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.value = tag.color;
  colorInput.style.cssText = 'width:28px;height:26px;padding:1px;cursor:pointer;border:none;';
  colorInput.addEventListener('input', function() { swatch.style.background = colorInput.value; });
  var errEl = document.createElement('span');
  errEl.className = 'tag-inline-err';
  errEl.style.display = 'none';
  var saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save';
  saveBtn.style.cssText = 'font-size:11px;padding:4px 10px;';
  var cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn-secondary';
  cancelBtn.textContent = '✕';
  cancelBtn.style.cssText = 'font-size:11px;padding:4px 7px;';
  async function doSave() {
    var name = nameInput.value.trim();
    if (!name) return;
    errEl.style.display = 'none';
    var resp = await fetch('/api/tags/' + tag.id, {
      method: 'PUT', headers: authHeaders(),
      body: JSON.stringify({ name: name, color: colorInput.value }),
    });
    if (resp.ok) { await loadTags(); renderTagsPage(); }
    else if (resp.status === 409) { errEl.textContent = 'Name already in use'; errEl.style.display = 'inline'; }
    else { alert('Failed to update tag'); }
  }
  saveBtn.addEventListener('click', doSave);
  cancelBtn.addEventListener('click', function() { row.remove(); });
  nameInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') doSave();
    if (e.key === 'Escape') row.remove();
  });
  row.appendChild(swatch);
  row.appendChild(nameInput);
  row.appendChild(colorInput);
  row.appendChild(errEl);
  row.appendChild(saveBtn);
  row.appendChild(cancelBtn);
  return row;
}

function buildTagCreateForm(list) {
  var form = document.createElement('div');
  form.id = 'new-tag-page-form';
  form.className = 'tag-create-form';
  var nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.placeholder = 'Tag name';
  nameInput.style.cssText = 'font-size:12px;padding:4px 8px;width:150px;';
  var colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.value = '#4a90d9';
  colorInput.style.cssText = 'width:28px;height:26px;padding:1px;cursor:pointer;border:none;';
  var errEl = document.createElement('span');
  errEl.className = 'tag-inline-err';
  errEl.style.display = 'none';
  var saveBtn = document.createElement('button');
  saveBtn.textContent = 'Create';
  saveBtn.style.cssText = 'font-size:11px;padding:4px 10px;';
  var cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn-secondary';
  cancelBtn.textContent = '✕';
  cancelBtn.style.cssText = 'font-size:11px;padding:4px 7px;';
  async function doCreate() {
    var name = nameInput.value.trim();
    if (!name) return;
    errEl.style.display = 'none';
    var resp = await fetch('/api/tags', {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ name: name, color: colorInput.value }),
    });
    if (resp.ok) { await loadTags(); renderTagsPage(); }
    else if (resp.status === 409) { errEl.textContent = 'Name already in use'; errEl.style.display = 'inline'; }
    else { alert('Failed to create tag'); }
  }
  saveBtn.addEventListener('click', doCreate);
  cancelBtn.addEventListener('click', function() { form.remove(); });
  nameInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') doCreate();
    if (e.key === 'Escape') form.remove();
  });
  form.appendChild(nameInput);
  form.appendChild(colorInput);
  form.appendChild(errEl);
  form.appendChild(saveBtn);
  form.appendChild(cancelBtn);
  return form;
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
  document.getElementById('chat-fab').addEventListener('click', toggleChat);
  document.getElementById('chat-close-btn').addEventListener('click', toggleChat);
  document.getElementById('hamburger-btn').addEventListener('click', toggleDrawer);
  document.getElementById('drawer-overlay').addEventListener('click', toggleDrawer);
  document.querySelectorAll('.sidebar-item[data-page]').forEach(function(el) {
    el.addEventListener('click', function() { navigateTo(el.dataset.page); });
  });
  document.querySelectorAll('.drawer-item[data-page]').forEach(function(el) {
    el.addEventListener('click', function() { navigateTo(el.dataset.page); if (drawerOpen) toggleDrawer(); });
  });
  document.getElementById('new-task-btn').addEventListener('click', function() {
    openNewTaskModal(null, null, null);
  });
  document.getElementById('modal-create-btn').addEventListener('click', createTask);
  document.getElementById('modal-cancel-btn').addEventListener('click', closeModal);
  document.getElementById('task-modal').addEventListener('click', function(e) {
    if (e.target === this) closeModal();
  });
  document.getElementById('filter-all').addEventListener('click', function() { setFilter('all', this); });
  document.getElementById('filter-today').addEventListener('click', function() { setFilter('today', this); });
  document.getElementById('filter-overdue').addEventListener('click', function() { setFilter('overdue', this); });
  // View tab listeners
  document.querySelectorAll('.view-tab[data-view]').forEach(function(tab) {
    tab.addEventListener('click', function() {
      if (tab.disabled) return;
      switchView(tab.dataset.view);
    });
  });
  var calPrev = document.getElementById('cal-prev');
  var calNext = document.getElementById('cal-next');
  if (calPrev) calPrev.addEventListener('click', function() {
    if (!currentCalendarMonth) return;
    if (currentCalendarMonth.month === 0) {
      currentCalendarMonth = { year: currentCalendarMonth.year - 1, month: 11 };
    } else {
      currentCalendarMonth = { year: currentCalendarMonth.year, month: currentCalendarMonth.month - 1 };
    }
    renderCalendar();
  });
  if (calNext) calNext.addEventListener('click', function() {
    if (!currentCalendarMonth) return;
    if (currentCalendarMonth.month === 11) {
      currentCalendarMonth = { year: currentCalendarMonth.year + 1, month: 0 };
    } else {
      currentCalendarMonth = { year: currentCalendarMonth.year, month: currentCalendarMonth.month + 1 };
    }
    renderCalendar();
  });
  var tlPrev = document.getElementById('tl-prev');
  var tlNext = document.getElementById('tl-next');
  if (tlPrev) tlPrev.addEventListener('click', function() {
    currentTimelineOffset -= 7;
    renderTimeline();
  });
  if (tlNext) tlNext.addEventListener('click', function() {
    currentTimelineOffset += 7;
    renderTimeline();
  });
});
