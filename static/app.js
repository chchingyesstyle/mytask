// State
let currentUser = null;
let allTasks = [];
let allProjects = [];
let chatHistory = [];
let activeFilter = 'all';
let expandedTaskId = null;

// Auth
function getToken() { return localStorage.getItem('mytask_token'); }
function authHeaders() {
  return { 'Authorization': 'Bearer ' + getToken(), 'Content-Type': 'application/json' };
}

async function login() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  errEl.style.display = 'none';
  try {
    const resp = await fetch('/api/auth/login', {
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
    const resp = await fetch('/api/auth/me', { headers: authHeaders() });
    if (!resp.ok) { showLogin(); return; }
    currentUser = await resp.json();
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    document.getElementById('nav-username').textContent = currentUser.username;
    document.getElementById('workspace-label').textContent = currentUser.username + "'s Workspace";
    if (currentUser.role === 'admin') {
      document.getElementById('admin-link').style.display = 'inline';
    }
    await loadProjects();
    await loadTasks();
    addAiMessage('Hello ' + currentUser.username + '! I am your AI assistant. Tell me what tasks you need help with.');
  } catch (e) { showLogin(); }
}

function showLogin() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
}

// Projects
async function loadProjects() {
  const resp = await fetch('/api/projects', { headers: authHeaders() });
  if (!resp.ok) { if (resp.status === 401) showLogin(); return; }
  allProjects = await resp.json();
  renderProjectFilters();
  populateProjectDropdown();
}

function renderProjectFilters() {
  const container = document.getElementById('project-filters');
  while (container.firstChild) container.removeChild(container.firstChild);
  allProjects.forEach(function(p) {
    const btn = document.createElement('button');
    btn.className = 'filter-btn';
    btn.textContent = p.name;
    btn.addEventListener('click', function() { setProjectFilter(p.id, btn); });
    container.appendChild(btn);
  });
}

function populateProjectDropdown() {
  const sel = document.getElementById('mt-project');
  if (!sel) return;
  while (sel.options.length > 1) sel.remove(1);
  allProjects.forEach(function(p) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    sel.appendChild(opt);
  });
}

// Tasks
async function loadTasks() {
  const resp = await fetch('/api/tasks', { headers: authHeaders() });
  if (!resp.ok) { if (resp.status === 401) showLogin(); return; }
  allTasks = await resp.json();
  renderTasks();
  updateOverdueBadge();
}

function setFilter(filter, btn) {
  activeFilter = filter;
  document.querySelectorAll('.filter-btn').forEach(function(b) { b.classList.remove('active'); });
  btn.classList.add('active');
  renderTasks();
}

function setProjectFilter(projectId, btn) {
  activeFilter = 'project:' + projectId;
  document.querySelectorAll('.filter-btn').forEach(function(b) { b.classList.remove('active'); });
  btn.classList.add('active');
  renderTasks();
}

function filteredTasks() {
  var today = new Date().toISOString().split('T')[0];
  if (activeFilter === 'today') return allTasks.filter(function(t) { return t.due_date === today; });
  if (activeFilter === 'overdue') return allTasks.filter(function(t) { return t.due_date && t.due_date < today && t.status !== 'done'; });
  if (activeFilter.indexOf('project:') === 0) {
    var pid = parseInt(activeFilter.split(':')[1]);
    return allTasks.filter(function(t) { return t.project_id === pid; });
  }
  return allTasks;
}

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

  var metaParts = [];
  if (t.project_name) metaParts.push(t.project_name);
  if (t.due_date) metaParts.push('Due ' + t.due_date);
  if (metaParts.length) {
    var meta = document.createElement('div');
    meta.className = 'task-meta';
    meta.textContent = metaParts.join(' · ');
    card.appendChild(meta);
  }

  var detail = document.createElement('div');
  detail.className = 'task-detail' + (expandedTaskId === t.id ? ' open' : '');
  detail.id = 'task-detail-' + t.id;
  detail.addEventListener('click', function(e) { e.stopPropagation(); });

  var actions = document.createElement('div');
  actions.className = 'task-detail-actions';

  var statusSel = document.createElement('select');
  [['todo','To Do'], ['in-progress','In Progress'], ['done','Done']].forEach(function(pair) {
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

  actions.appendChild(statusSel);
  actions.appendChild(delBtn);
  detail.appendChild(actions);

  if (t.notes) {
    var notesEl = document.createElement('div');
    notesEl.className = 'task-notes';
    notesEl.textContent = t.notes;
    detail.appendChild(notesEl);
  }

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
    { key: 'overdue',     label: 'Overdue',      tasks: tasks.filter(function(t) { return t.due_date && t.due_date < today && t.status !== 'done'; }) },
    { key: 'in-progress', label: 'In Progress',   tasks: tasks.filter(function(t) { return t.status === 'in-progress'; }) },
    { key: 'todo',        label: 'To Do',         tasks: tasks.filter(function(t) { return t.status === 'todo' && !(t.due_date && t.due_date < today); }) },
    { key: 'done',        label: 'Done',          tasks: tasks.filter(function(t) { return t.status === 'done'; }) },
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

// Event wiring — only runs on the main app page (index.html)
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
