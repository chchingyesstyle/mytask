# Projects & Tags Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two placeholder pages with full CRUD UIs for Projects (with status management) and Tags (with inline name/color editing).

**Architecture:** Two new backend PUT endpoints cover rename-project and update-tag. The frontend adds `renderProjectsPage()` and `renderTagsPage()` that build the page DOM from cached `allProjects`/`allTags` arrays; `navigateTo()` calls them on page switch. Project status data is fetched per-project into a module-level `projectStatusMap` cache; mutations refresh only the affected project's slice.

**Tech Stack:** FastAPI + SQLAlchemy (backend), Vanilla JS / ES2017 async-await, no bundler (frontend), in-memory SQLite (tests via pytest).

---

## File Map

| File | Change |
|---|---|
| `routers/projects.py` | Add `ProjectUpdate` model + `PUT /{project_id}` |
| `routers/tags.py` | Add `TagUpdate` model + `PUT /{tag_id}` |
| `tests/test_projects.py` | Add 3 rename tests |
| `tests/test_tags.py` | Add 3 update tests |
| `static/index.html` | Strip placeholder content from `#page-projects` and `#page-tags` |
| `static/style.css` | Append ~55 lines for project cards and tag rows |
| `static/app.js` | Add 2 state vars, 10 functions, extend `navigateTo()` twice |

---

### Task 1: Backend — rename project (`PUT /api/projects/{id}`)

**Files:**
- Modify: `routers/projects.py`
- Modify: `tests/test_projects.py`

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_projects.py`:

```python
def test_rename_project(admin_headers):
    client, headers = admin_headers
    proj_id = client.post("/api/projects", json={"name": "Old Name"}, headers=headers).json()["id"]
    resp = client.put(f"/api/projects/{proj_id}", json={"name": "New Name"}, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "New Name"
    assert data["id"] == proj_id

def test_rename_project_not_owner(client):
    from tests.conftest import TestingSessionLocal
    from auth import hash_password
    import models
    db = TestingSessionLocal()
    db.add(models.User(username="alice", password_hash=hash_password("pw"), role="user"))
    db.add(models.User(username="bob", password_hash=hash_password("pw"), role="user"))
    db.commit()
    db.close()
    alice_token = client.post("/api/auth/login", json={"username": "alice", "password": "pw"}).json()["access_token"]
    bob_token = client.post("/api/auth/login", json={"username": "bob", "password": "pw"}).json()["access_token"]
    alice_h = {"Authorization": f"Bearer {alice_token}"}
    bob_h = {"Authorization": f"Bearer {bob_token}"}
    proj_id = client.post("/api/projects", json={"name": "Alice Project"}, headers=alice_h).json()["id"]
    resp = client.put(f"/api/projects/{proj_id}", json={"name": "Hacked"}, headers=bob_h)
    assert resp.status_code == 403

def test_rename_project_not_found(admin_headers):
    client, headers = admin_headers
    resp = client.put("/api/projects/9999", json={"name": "Ghost"}, headers=headers)
    assert resp.status_code == 404
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
python3 -m pytest tests/test_projects.py::test_rename_project tests/test_projects.py::test_rename_project_not_owner tests/test_projects.py::test_rename_project_not_found -v
```

Expected: all FAIL with `405 Method Not Allowed`.

- [ ] **Step 3: Implement the endpoint**

In `routers/projects.py`, after the `ProjectCreate` class (line ~17), add:

```python
class ProjectUpdate(BaseModel):
    name: str

@router.put("/{project_id}")
def update_project(project_id: int, req: ProjectUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.owner_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    project.name = req.name
    db.commit()
    db.refresh(project)
    return {"id": project.id, "name": project.name, "owner_id": project.owner_id}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
python3 -m pytest tests/test_projects.py -v
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add routers/projects.py tests/test_projects.py
git commit -m "feat: add PUT /api/projects/{id} rename endpoint"
```

---

### Task 2: Backend — update tag (`PUT /api/tags/{id}`)

**Files:**
- Modify: `routers/tags.py`
- Modify: `tests/test_tags.py`

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_tags.py`:

```python
def test_update_tag_name_and_color(admin_headers):
    client, headers = admin_headers
    tag_id = client.post("/api/tags", json={"name": "oldie", "color": "#ffffff"}, headers=headers).json()["id"]
    resp = client.put(f"/api/tags/{tag_id}", json={"name": "newie", "color": "#000000"}, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "newie"
    assert data["color"] == "#000000"

def test_update_tag_name_conflict(admin_headers):
    client, headers = admin_headers
    client.post("/api/tags", json={"name": "existing", "color": "#ffffff"}, headers=headers)
    tag_id = client.post("/api/tags", json={"name": "other", "color": "#000000"}, headers=headers).json()["id"]
    resp = client.put(f"/api/tags/{tag_id}", json={"name": "existing"}, headers=headers)
    assert resp.status_code == 409

def test_update_tag_not_found(admin_headers):
    client, headers = admin_headers
    resp = client.put("/api/tags/9999", json={"name": "nope"}, headers=headers)
    assert resp.status_code == 404
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
python3 -m pytest tests/test_tags.py::test_update_tag_name_and_color tests/test_tags.py::test_update_tag_name_conflict tests/test_tags.py::test_update_tag_not_found -v
```

Expected: all FAIL with `405 Method Not Allowed`.

- [ ] **Step 3: Implement the endpoint**

`routers/tags.py` currently has no `Optional` import. Add `from typing import Optional` at the top, then after the `TagCreate` class add:

```python
from typing import Optional  # add to imports at top of file

class TagUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None

@router.put("/{tag_id}")
def update_tag(tag_id: int, req: TagUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    tag = db.query(models.Tag).filter(models.Tag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    if req.name is not None and req.name != tag.name:
        if db.query(models.Tag).filter(models.Tag.name == req.name).first():
            raise HTTPException(status_code=409, detail="Tag name already exists")
        tag.name = req.name
    if req.color is not None:
        tag.color = req.color
    db.commit()
    db.refresh(tag)
    return _tag_dict(tag)
```

- [ ] **Step 4: Run full test suite**

```bash
python3 -m pytest -v
```

Expected: all tests pass (was 75 before; 78 now with 3 new tag tests + 3 new project tests from Task 1).

- [ ] **Step 5: Commit**

```bash
git add routers/tags.py tests/test_tags.py
git commit -m "feat: add PUT /api/tags/{id} update endpoint"
```

---

### Task 3: Projects page frontend

**Files:**
- Modify: `static/index.html`
- Modify: `static/style.css`
- Modify: `static/app.js`

- [ ] **Step 1: Strip placeholder from index.html**

In `static/index.html`, find and replace the `#page-projects` block:

Old:
```html
      <!-- Projects page -->
      <div id="page-projects" class="page" style="display:none">
        <div class="page-header"><h2>Projects</h2></div>
        <div class="placeholder-page">
          <div class="placeholder-icon">📁</div>
          <p>Projects page coming soon</p>
        </div>
      </div>
```

New:
```html
      <!-- Projects page -->
      <div id="page-projects" class="page" style="display:none"></div>
```

- [ ] **Step 2: Add project page CSS**

Append to the end of `static/style.css`:

```css
/* ── Projects page ── */
.proj-list { padding: 12px; display: flex; flex-direction: column; gap: 8px; overflow-y: auto; flex: 1; }
.proj-page-header { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
.proj-page-header h2 { font-size: 15px; font-weight: 600; }
.proj-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--r); }
.proj-card-header { display: flex; align-items: center; gap: 8px; padding: 10px 14px; cursor: pointer; user-select: none; border-radius: var(--r); }
.proj-card-header:hover { background: rgba(255,255,255,.03); }
.proj-card-name { font-weight: 600; font-size: 13px; flex: 1; }
.proj-card-count { font-size: 11px; color: var(--text-dim); white-space: nowrap; }
.proj-card-chevron { font-size: 11px; color: var(--text-dim); width: 14px; text-align: center; }
.proj-card-del { background: none; border: none; color: var(--text-dim); font-size: 13px; padding: 2px 6px; line-height: 1; cursor: pointer; border-radius: var(--r); }
.proj-card-del:hover { color: var(--danger); opacity: 1; }
.proj-status-chips { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 14px 10px; }
.proj-status-chip { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: var(--text-dim); }
.proj-status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.proj-card-body { border-top: 1px solid var(--border); padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; }
.proj-rename-row { display: flex; align-items: center; gap: 8px; }
.proj-rename-row input { flex: 1; max-width: 280px; font-size: 13px; padding: 6px 10px; }
.proj-section-label { font-size: 11px; color: var(--text-dim); font-weight: 600; text-transform: uppercase; letter-spacing: .05em; }
.proj-status-list { display: flex; flex-direction: column; }
.proj-status-row { display: flex; align-items: center; gap: 8px; padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,.04); }
.proj-status-row:last-child { border-bottom: none; }
.proj-status-swatch { width: 14px; height: 14px; border-radius: 3px; flex-shrink: 0; }
.proj-status-name { flex: 1; font-size: 12px; }
.proj-status-controls { display: flex; gap: 4px; }
.proj-status-btn { background: none; border: 1px solid var(--border); color: var(--text-dim); font-size: 11px; padding: 2px 7px; line-height: 1.4; cursor: pointer; border-radius: var(--r); }
.proj-status-btn:hover { color: var(--text); opacity: 1; }
.proj-status-btn:disabled { opacity: .25; cursor: not-allowed; }
.proj-add-status-btn { background: none; border: none; color: var(--text-dim); font-size: 12px; padding: 6px 0 2px; cursor: pointer; text-align: left; }
.proj-add-status-btn:hover { color: var(--accent); opacity: 1; }
.proj-status-edit-row, .proj-add-status-form { display: flex; align-items: center; gap: 6px; padding: 5px 0; }
.proj-new-form { background: var(--bg-panel); border: 1px dashed var(--border); border-radius: var(--r); padding: 10px 14px; display: flex; align-items: center; gap: 8px; }
.proj-new-form input { font-size: 13px; padding: 6px 10px; }
.proj-empty { color: var(--text-dim); font-size: 13px; text-align: center; padding: 40px 16px; }
```

- [ ] **Step 3: Add state vars to app.js**

At the top of `static/app.js`, after line 17 (`let allStatuses = [];`), add:

```javascript
let expandedProjectId = null;
let projectStatusMap = {};
```

- [ ] **Step 4: Add project page functions to app.js**

Insert the block below immediately before the `// Event wiring` comment (which is immediately before `document.addEventListener('DOMContentLoaded', ...)`).

```javascript
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
```

- [ ] **Step 5: Extend navigateTo for projects**

In `static/app.js`, find the end of `navigateTo()` (around line 109):

```javascript
  if (page === 'dashboard') loadDashboard();
}
```

Replace with:

```javascript
  if (page === 'dashboard') loadDashboard();
  if (page === 'projects') renderProjectsPage();
}
```

- [ ] **Step 6: Hot-copy and smoke test**

```bash
docker cp static/app.js mytask-mytask-1:/app/static/app.js
docker cp static/style.css mytask-mytask-1:/app/static/style.css
docker cp static/index.html mytask-mytask-1:/app/static/index.html
```

Open http://10.0.0.149:8080. Navigate to Projects. Verify each of these manually:

1. Empty state shows "No projects yet" message
2. Click "+ New Project" → inline form appears with name input; pressing Escape or Cancel closes it
3. Create a project → card appears with Todo/In Progress/Done chips and task count badge
4. Click the card header → expands showing rename field + status list; click again → collapses
5. Rename: change name + Save → card header updates; Escape discards
6. Status ↑/↓ buttons: first status has ↑ disabled; last has ↓ disabled; reordering updates chip order
7. Status Edit: inline form replaces row; color picker updates swatch live; Save/Cancel work
8. Add Status: inline form at bottom of status list; creates new status visible in chips
9. Delete status with >1 statuses: confirm dialog, then status removed; with only 1 status: ✕ button disabled
10. Delete project: confirm dialog; card removed

- [ ] **Step 7: Run tests**

```bash
python3 -m pytest -v
```

Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add static/index.html static/style.css static/app.js
git commit -m "feat: implement Projects page with rename and status management"
```

---

### Task 4: Tags page frontend

**Files:**
- Modify: `static/index.html`
- Modify: `static/style.css`
- Modify: `static/app.js`

- [ ] **Step 1: Strip placeholder from index.html**

In `static/index.html`, find and replace the `#page-tags` block:

Old:
```html
      <!-- Tags page -->
      <div id="page-tags" class="page" style="display:none">
        <div class="page-header"><h2>Tags</h2></div>
        <div class="placeholder-page">
          <div class="placeholder-icon">🏷</div>
          <p>Tags page coming soon</p>
        </div>
      </div>
```

New:
```html
      <!-- Tags page -->
      <div id="page-tags" class="page" style="display:none"></div>
```

- [ ] **Step 2: Add tag page CSS**

Append to the end of `static/style.css`:

```css
/* ── Tags page ── */
.tag-page-header { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
.tag-page-header h2 { font-size: 15px; font-weight: 600; }
.tag-list-page { padding: 0; display: flex; flex-direction: column; overflow-y: auto; flex: 1; }
.tag-row { display: flex; align-items: center; gap: 10px; padding: 10px 16px; border-bottom: 1px solid var(--border); }
.tag-row:hover { background: rgba(255,255,255,.02); }
.tag-swatch { width: 20px; height: 20px; border-radius: 4px; flex-shrink: 0; }
.tag-row-name { flex: 1; font-size: 13px; }
.tag-row-controls { display: flex; gap: 6px; }
.tag-row-btn { background: none; border: 1px solid var(--border); color: var(--text-dim); font-size: 11px; padding: 3px 9px; cursor: pointer; border-radius: var(--r); }
.tag-row-btn:hover { color: var(--text); opacity: 1; }
.tag-edit-row { display: flex; align-items: center; gap: 8px; padding: 8px 16px; background: var(--bg-panel); border-bottom: 1px solid var(--border); }
.tag-create-form { display: flex; align-items: center; gap: 8px; padding: 10px 16px; background: var(--bg-panel); border-bottom: 1px solid var(--border); }
.tag-inline-err { color: var(--danger); font-size: 11px; }
.tag-empty { color: var(--text-dim); font-size: 13px; text-align: center; padding: 40px 16px; }
```

- [ ] **Step 3: Add tag page functions to app.js**

Insert the block below immediately before the `// Event wiring` comment (after the Projects page functions added in Task 3):

```javascript
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
```

- [ ] **Step 4: Extend navigateTo for tags**

In `static/app.js`, find the end of `navigateTo()` (already has the projects line from Task 3):

```javascript
  if (page === 'dashboard') loadDashboard();
  if (page === 'projects') renderProjectsPage();
}
```

Replace with:

```javascript
  if (page === 'dashboard') loadDashboard();
  if (page === 'projects') renderProjectsPage();
  if (page === 'tags') renderTagsPage();
}
```

- [ ] **Step 5: Hot-copy and smoke test**

```bash
docker cp static/app.js mytask-mytask-1:/app/static/app.js
docker cp static/style.css mytask-mytask-1:/app/static/style.css
docker cp static/index.html mytask-mytask-1:/app/static/index.html
```

Open http://10.0.0.149:8080. Navigate to Tags. Verify each of these manually:

1. Empty state shows "No tags yet" message (if no tags exist); or existing tags listed as rows
2. Each tag row shows: colored swatch (20×20px), name, Edit button, ✕ button
3. Click Edit → inline edit row appears below the tag row with pre-filled name + color picker; other edit rows close
4. Change name + color in edit row; color picker updates swatch preview live
5. Save with Enter or Save button → row updates; Escape or ✕ cancels
6. Try saving a name that's already taken → "Name already in use" error inline (no alert)
7. Click ✕ on a tag → confirm dialog; on OK tag row removed from list
8. Click "+ New Tag" → create form appears at top of list; second click closes it
9. Create with Enter or Create button → new tag row added; 409 shows inline error
10. Navigate back to Tasks → Tags filter bar still shows all tags correctly (tags page and filter bar are separate)

- [ ] **Step 6: Run full test suite**

```bash
python3 -m pytest -v
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add static/index.html static/style.css static/app.js
git commit -m "feat: implement Tags page with inline create and edit"
```
