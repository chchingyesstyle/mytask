async function adminInit() {
  if (!getToken()) { location.href = '/'; return; }
  try {
    var resp = await fetch('/api/auth/me', { headers: authHeaders() });
    if (!resp.ok) { location.href = '/'; return; }
    var user = await resp.json();
    if (user.role !== 'admin') { location.href = '/'; return; }
    document.getElementById('admin-app').style.display = 'flex';
    document.getElementById('nav-username').textContent = user.username;
    await loadUsers();
  } catch (e) { location.href = '/'; }
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
});
