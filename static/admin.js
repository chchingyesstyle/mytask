async function adminInit() {
  if (!getToken()) { location.href = '/'; return; }
  try {
    var resp = await fetch('/api/auth/me', { headers: authHeaders() });
    if (!resp.ok) { location.href = '/'; return; }
    var user = await resp.json();
    if (user.role !== 'admin') { location.href = '/'; return; }
    document.getElementById('admin-app').style.display = 'flex';
    document.getElementById('nav-username').textContent = user.username;
    await loadAdminTags();
    await loadUsers();
  } catch (e) { location.href = '/'; }
}

async function loadAdminTags() {
  var resp = await fetch('/api/tags', { headers: authHeaders() });
  if (!resp.ok) return;
  var tags = await resp.json();
  var container = document.getElementById('tag-list');
  while (container.firstChild) container.removeChild(container.firstChild);

  if (tags.length === 0) {
    var empty = document.createElement('span');
    empty.style.cssText = 'color:var(--text-dim);font-size:12px';
    empty.textContent = 'No tags yet.';
    container.appendChild(empty);
    return;
  }

  tags.forEach(function(tag) {
    var item = document.createElement('div');
    item.style.cssText = 'display:flex;align-items:center;gap:6px;background:var(--bg-card);border:1px solid var(--border);border-radius:6px;padding:4px 10px';

    var swatch = document.createElement('span');
    swatch.style.cssText = 'width:10px;height:10px;border-radius:50%;background:' + tag.color + ';flex-shrink:0;display:inline-block';

    var name = document.createElement('span');
    name.style.fontSize = '12px';
    name.textContent = tag.name;

    var delBtn = document.createElement('button');
    delBtn.className = 'btn-danger';
    delBtn.textContent = '✕';
    delBtn.style.cssText = 'padding:2px 6px;font-size:11px';
    delBtn.addEventListener('click', function() { deleteAdminTag(tag.id, tag.name); });

    item.appendChild(swatch);
    item.appendChild(name);
    item.appendChild(delBtn);
    container.appendChild(item);
  });
}

async function createAdminTag() {
  var name = document.getElementById('new-tag-name').value.trim();
  var color = document.getElementById('new-tag-color').value;
  var errEl = document.getElementById('tag-error');
  errEl.style.display = 'none';

  if (!name) {
    errEl.textContent = 'Tag name is required.';
    errEl.style.display = 'block';
    return;
  }

  var resp = await fetch('/api/tags', {
    method: 'POST', headers: authHeaders(),
    body: JSON.stringify({ name: name, color: color }),
  });

  if (!resp.ok) {
    var data = await resp.json();
    errEl.textContent = data.detail || 'Error creating tag.';
    errEl.style.display = 'block';
    return;
  }

  document.getElementById('new-tag-name').value = '';
  await loadAdminTags();
}

async function deleteAdminTag(id, name) {
  if (!confirm('Delete tag "' + name + '"? It will be removed from all tasks.')) return;
  await fetch('/api/tags/' + id, { method: 'DELETE', headers: authHeaders() });
  await loadAdminTags();
}

async function loadUsers() {
  var resp = await fetch('/api/users', { headers: authHeaders() });
  if (!resp.ok) return;
  var users = await resp.json();
  var tbody = document.getElementById('user-tbody');
  while (tbody.firstChild) tbody.removeChild(tbody.firstChild);

  users.forEach(function(u) {
    var tr = document.createElement('tr');

    [String(u.id), u.username, u.role, u.created_at.split('T')[0]].forEach(function(val) {
      var td = document.createElement('td');
      td.textContent = val;
      tr.appendChild(td);
    });

    var actionTd = document.createElement('td');
    var delBtn = document.createElement('button');
    delBtn.className = 'btn-danger';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', function() { deleteUser(u.id, u.username); });
    actionTd.appendChild(delBtn);
    tr.appendChild(actionTd);

    tbody.appendChild(tr);
  });
}

async function createUser() {
  var username = document.getElementById('new-username').value.trim();
  var password = document.getElementById('new-password').value;
  var errEl = document.getElementById('create-error');
  errEl.style.display = 'none';

  if (!username || !password) {
    errEl.textContent = 'Username and password are required.';
    errEl.style.display = 'block';
    return;
  }

  var resp = await fetch('/api/users', {
    method: 'POST', headers: authHeaders(),
    body: JSON.stringify({ username: username, password: password }),
  });

  if (!resp.ok) {
    var data = await resp.json();
    errEl.textContent = data.detail || 'Error creating user.';
    errEl.style.display = 'block';
    return;
  }

  document.getElementById('new-username').value = '';
  document.getElementById('new-password').value = '';
  await loadUsers();
}

async function deleteUser(id, username) {
  if (!confirm('Delete user "' + username + '"? Their tasks will also be deleted.')) return;
  var resp = await fetch('/api/users/' + id, { method: 'DELETE', headers: authHeaders() });
  if (!resp.ok) {
    var d = await resp.json();
    alert(d.detail);
    return;
  }
  await loadUsers();
}

document.addEventListener('DOMContentLoaded', function() {
  adminInit();
  document.getElementById('logout-btn').addEventListener('click', logout);
  document.getElementById('create-user-btn').addEventListener('click', createUser);
  document.getElementById('create-tag-btn').addEventListener('click', createAdminTag);
});
