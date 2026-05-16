# Table View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Notion-style spreadsheet/table view as a fifth tab on the Tasks page with inline cell editing, subtask expansion, and column visibility controls.

**Architecture:** Pure frontend — new `renderTable()` in `app.js`, new HTML structure, CSS styles. Uses existing `PUT /api/tasks/{id}` for saves. Column visibility and sort preferences stored in localStorage.

**Tech Stack:** Vanilla JS, CSS custom properties, localStorage.

---

## Files

| File | Change |
|------|--------|
| `static/index.html` | Add `⊞ Table` view tab; add `#view-table` container with toolbar + scroll div |
| `static/style.css` | Add all `.task-table`, `.table-*`, `.col-expand` styles |
| `static/app.js` | Add state vars, `TABLE_COLS`, `renderTable()`, `buildTableRow()`, `buildSubtaskRow()`, `buildTableToolbar()`, column picker, inline editing |

---

### Task 1: HTML structure + CSS styles

**Files:**
- Modify: `static/index.html`
- Modify: `static/style.css`

- [ ] **Step 1: Add Table view tab to index.html**

In `static/index.html`, find the view switcher (the `<div class="view-tabs">` block with the existing List/Board/Calendar/Timeline tabs). Add the Table tab as the fifth entry:

```html
<button class="view-tab" data-view="table">&#8862; Table</button>
```

- [ ] **Step 2: Add view container to index.html**

In `static/index.html`, find the block of view containers (`<div id="view-list" ...>`, `<div id="view-board" ...>`, etc.). Add after the last one:

```html
<div id="view-table" class="view-container" style="display:none">
  <div id="table-toolbar" class="table-toolbar"></div>
  <div id="table-scroll" class="table-scroll">
    <table id="task-table" class="task-table"></table>
  </div>
</div>
```

- [ ] **Step 3: Add CSS styles**

Append to the bottom of `static/style.css`:

```css
.table-toolbar { display:flex; align-items:center; gap:8px; padding:8px 12px;
  border-bottom:1px solid var(--border); background:var(--bg-panel); flex-shrink:0; }
.table-scroll { overflow-x:auto; overflow-y:auto; flex:1; }
.task-table { width:100%; border-collapse:collapse; font-size:12px; min-width:600px; }
.task-table thead th { padding:6px 10px; text-align:left; color:var(--text-dim);
  font-weight:600; background:var(--bg-panel); border-bottom:2px solid var(--border);
  white-space:nowrap; user-select:none; }
.task-table thead th.sortable { cursor:pointer; }
.task-table thead th.sortable:hover { color:var(--text); }
.task-table tbody tr { border-bottom:1px solid var(--border); }
.task-table tbody tr:hover { background:rgba(255,255,255,.02); }
body.light .task-table tbody tr:hover { background:rgba(0,0,0,.02); }
.task-table td { padding:6px 10px; vertical-align:middle; color:var(--text); }
.table-row-sub td { background:rgba(74,144,217,.02); color:var(--text-dim); font-size:11px; }
.table-row-sub td:first-child { border-left:2px solid var(--accent); }
.col-expand { width:24px; text-align:center; cursor:pointer; color:var(--text-dim); font-size:10px; }
.table-new-row td { color:var(--text-dim); font-size:11px; cursor:pointer; padding:8px 10px; }
.table-new-row:hover td { color:var(--accent); }
.table-cell-edit input, .table-cell-edit select { font-size:12px; padding:2px 6px;
  background:var(--bg-input); border:1px solid var(--accent); border-radius:var(--r);
  color:var(--text); outline:none; width:100%; box-sizing:border-box; }
.table-notes-popover { position:absolute; background:var(--bg-card); border:1px solid var(--border);
  border-radius:var(--r); padding:8px; z-index:50; box-shadow:0 4px 12px rgba(0,0,0,.3); }
.table-notes-popover textarea { width:200px; height:120px; resize:vertical;
  font-size:12px; font-family:inherit; background:var(--bg-input);
  border:1px solid var(--border); color:var(--text); border-radius:var(--r); padding:6px; }
.table-col-picker { position:absolute; background:var(--bg-card); border:1px solid var(--border);
  border-radius:var(--r); padding:8px; z-index:50; min-width:160px; box-shadow:0 4px 12px rgba(0,0,0,.3); }
.table-col-picker label { display:flex; align-items:center; gap:6px; padding:4px 0;
  font-size:12px; cursor:pointer; color:var(--text); }
```

- [ ] **Step 4: Hot-copy and verify static appearance**

```bash
docker cp static/index.html mytask-mytask-1:/app/static/index.html
docker cp static/style.css mytask-mytask-1:/app/static/style.css
```

Open http://10.0.0.149:8080. You should see a "⊞ Table" tab in the view switcher. Clicking it shows an empty container (no JS wired yet). No console errors.

- [ ] **Step 5: Commit**

```bash
git add static/index.html static/style.css
git commit -m "feat: add table view HTML structure and CSS styles"
```

---

### Task 2: State variables, TABLE_COLS, renderCurrentView wiring

**Files:**
- Modify: `static/app.js`

- [ ] **Step 1: Add module-level state variables**

In `static/app.js`, find the block of module-level state variables (near the top, where `var expandedTaskId`, `var editingTaskId`, etc. are declared). Add these three variables after the existing state vars:

```javascript
var tableSort = { col: null, dir: 'asc' };
var tableExpanded = {};
var tableHiddenCols = JSON.parse(localStorage.getItem('tableHiddenCols') || '[]');
```

- [ ] **Step 2: Add TABLE_COLS constant**

Immediately after the state variables block (before or after `var allTasks = []` — keep it near the top of the file), add:

```javascript
var TABLE_COLS = [
  { key: 'title',      label: 'Title',      sortable: true,  always: true  },
  { key: 'status',     label: 'Status',     sortable: true,  always: false },
  { key: 'priority',   label: 'Priority',   sortable: true,  always: false },
  { key: 'start_date', label: 'Start Date', sortable: true,  always: false },
  { key: 'due_date',   label: 'Due Date',   sortable: true,  always: false },
  { key: 'project',    label: 'Project',    sortable: true,  always: false },
  { key: 'tags',       label: 'Tags',       sortable: false, always: false },
  { key: 'notes',      label: 'Notes',      sortable: false, always: false }
];
```

- [ ] **Step 3: Wire table view in renderCurrentView**

In `static/app.js`, find the `renderCurrentView()` function. It has a chain of `if/else if` blocks checking `currentView`. Add the table branch:

```javascript
  else if (currentView === 'table') renderTable();
```

Place it after the existing `else if (currentView === 'timeline')` branch (or whichever is last before the closing `}`).

- [ ] **Step 4: Add stub renderTable function**

Add this stub function to `app.js` (place it near the other render functions like `renderBoard`, `renderCalendar`):

```javascript
function renderTable() {
  var toolbar = document.getElementById('table-toolbar');
  var table = document.getElementById('task-table');
  if (!toolbar || !table) return;
  toolbar.textContent = 'Table view loading...';
  table.textContent = '';
}
```

- [ ] **Step 5: Hot-copy and verify**

```bash
docker cp static/app.js mytask-mytask-1:/app/static/app.js
```

Open http://10.0.0.149:8080 and click the "⊞ Table" tab. You should see "Table view loading..." text. No console errors.

- [ ] **Step 6: Commit**

```bash
git add static/app.js
git commit -m "feat: wire table view state vars and renderCurrentView"
```

---

### Task 3: Toolbar with column picker and sort indicator

**Files:**
- Modify: `static/app.js`

- [ ] **Step 1: Add buildTableToolbar function**

Replace the stub `renderTable()` with the full version that calls the toolbar builder. First add `buildTableToolbar()`:

```javascript
function buildTableToolbar(toolbar) {
  toolbar.textContent = '';

  var colBtn = document.createElement('button');
  colBtn.className = 'btn-secondary';
  colBtn.style.cssText = 'font-size:11px;padding:4px 10px;position:relative';
  colBtn.textContent = 'Columns';
  colBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    var existing = document.querySelector('.table-col-picker');
    if (existing) { existing.remove(); return; }
    var picker = document.createElement('div');
    picker.className = 'table-col-picker';
    TABLE_COLS.forEach(function(col) {
      if (col.always) return;
      var lbl = document.createElement('label');
      var chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.checked = !tableHiddenCols.includes(col.key);
      chk.addEventListener('change', function() {
        if (this.checked) {
          tableHiddenCols = tableHiddenCols.filter(function(k) { return k !== col.key; });
        } else {
          if (!tableHiddenCols.includes(col.key)) tableHiddenCols.push(col.key);
        }
        localStorage.setItem('tableHiddenCols', JSON.stringify(tableHiddenCols));
        picker.remove();
        renderTable();
      });
      lbl.appendChild(chk);
      lbl.appendChild(document.createTextNode(' ' + col.label));
      picker.appendChild(lbl);
    });
    var rect = colBtn.getBoundingClientRect();
    picker.style.top = (rect.bottom + window.scrollY + 4) + 'px';
    picker.style.left = rect.left + 'px';
    document.body.appendChild(picker);
    document.addEventListener('click', function removePicker() {
      picker.remove();
      document.removeEventListener('click', removePicker);
    });
  });
  toolbar.appendChild(colBtn);

  if (tableSort.col) {
    var sortIndicator = document.createElement('span');
    sortIndicator.style.cssText = 'font-size:11px;color:var(--text-dim);cursor:pointer';
    var col = TABLE_COLS.find(function(c) { return c.key === tableSort.col; });
    sortIndicator.textContent = '↕ ' + (col ? col.label : tableSort.col) + ' ' + (tableSort.dir === 'asc' ? '↑' : '↓') + '  ×';
    sortIndicator.addEventListener('click', function() {
      tableSort = { col: null, dir: 'asc' };
      renderTable();
    });
    toolbar.appendChild(sortIndicator);
  }
}
```

- [ ] **Step 2: Add getVisibleCols helper**

```javascript
function getVisibleCols() {
  return TABLE_COLS.filter(function(c) { return c.always || !tableHiddenCols.includes(c.key); });
}
```

- [ ] **Step 3: Add sortedFilteredTasks helper**

```javascript
function sortedFilteredTasks() {
  var tasks = filteredTasks().filter(function(t) { return !t.parent_id; });
  if (!tableSort.col) return tasks;
  var col = tableSort.col;
  var dir = tableSort.dir === 'asc' ? 1 : -1;
  return tasks.slice().sort(function(a, b) {
    var va, vb;
    if (col === 'title') { va = (a.title || '').toLowerCase(); vb = (b.title || '').toLowerCase(); return va.localeCompare(vb) * dir; }
    if (col === 'status') { va = (a.status_name || '').toLowerCase(); vb = (b.status_name || '').toLowerCase(); return va.localeCompare(vb) * dir; }
    if (col === 'priority') {
      var order = { high: 0, medium: 1, low: 2 };
      va = order[a.priority] !== undefined ? order[a.priority] : 3;
      vb = order[b.priority] !== undefined ? order[b.priority] : 3;
      return (va - vb) * dir;
    }
    if (col === 'project') { va = (a.project_name || '').toLowerCase(); vb = (b.project_name || '').toLowerCase(); return va.localeCompare(vb) * dir; }
    if (col === 'start_date' || col === 'due_date') {
      va = a[col] || 'zzzz'; vb = b[col] || 'zzzz';
      return va.localeCompare(vb) * dir;
    }
    return 0;
  });
}
```

- [ ] **Step 4: Update renderTable to use toolbar builder**

Replace the stub `renderTable()` with:

```javascript
function renderTable() {
  var toolbar = document.getElementById('table-toolbar');
  var table = document.getElementById('task-table');
  if (!toolbar || !table) return;

  buildTableToolbar(toolbar);

  var visibleCols = getVisibleCols();
  var tasks = sortedFilteredTasks();

  // Build thead
  var thead = document.createElement('thead');
  var headerRow = document.createElement('tr');
  var expandTh = document.createElement('th');
  expandTh.className = 'col-expand';
  headerRow.appendChild(expandTh);
  visibleCols.forEach(function(col) {
    var th = document.createElement('th');
    th.dataset.col = col.key;
    th.textContent = col.label;
    if (col.sortable) {
      th.className = 'sortable';
      if (tableSort.col === col.key) {
        th.textContent += ' ' + (tableSort.dir === 'asc' ? '↑' : '↓');
      }
      th.addEventListener('click', function() {
        if (tableSort.col === col.key) {
          tableSort.dir = tableSort.dir === 'asc' ? 'desc' : 'asc';
          if (tableSort.dir === 'asc' && tableSort.col === col.key) {
            tableSort = { col: null, dir: 'asc' };
          }
        } else {
          tableSort = { col: col.key, dir: 'asc' };
        }
        renderTable();
      });
    }
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);

  // Build tbody
  var tbody = document.createElement('tbody');
  tasks.forEach(function(t) {
    tbody.appendChild(buildTableRow(t, visibleCols));
    if (tableExpanded[t.id] && t.children && t.children.length) {
      t.children.forEach(function(child) {
        tbody.appendChild(buildSubtaskRow(child, visibleCols));
      });
    }
  });

  // New task row
  var newRow = document.createElement('tr');
  newRow.className = 'table-new-row';
  var newTd = document.createElement('td');
  newTd.colSpan = visibleCols.length + 1;
  newTd.textContent = '+ New task…';
  newRow.appendChild(newTd);
  newRow.addEventListener('click', function() {
    var projectId = null;
    if (activeFilter && activeFilter.startsWith('project:')) {
      projectId = parseInt(activeFilter.split(':')[1], 10);
    }
    openNewTaskModal(projectId);
  });
  tbody.appendChild(newRow);

  table.textContent = '';
  table.appendChild(thead);
  table.appendChild(tbody);
}
```

- [ ] **Step 5: Hot-copy and test toolbar**

```bash
docker cp static/app.js mytask-mytask-1:/app/static/app.js
```

Open http://10.0.0.149:8080, click Table tab. You should see:
- "Columns" button in toolbar
- Clicking "Columns" opens a popover with checkboxes for Status, Priority, Start Date, Due Date, Project, Tags, Notes
- Toggling a checkbox re-renders the table (empty but no errors)
- Table headers visible for all visible columns
- Headers with sort arrows when clicked

- [ ] **Step 6: Commit**

```bash
git add static/app.js
git commit -m "feat: add table toolbar, column picker, and sort controls"
```

---

### Task 4: Row rendering (cell display, expand, subtasks)

**Files:**
- Modify: `static/app.js`

- [ ] **Step 1: Add buildTableCell helper for read-state display**

```javascript
function buildTableCell(t, colKey) {
  var td = document.createElement('td');
  td.dataset.col = colKey;

  if (colKey === 'title') {
    td.style.fontWeight = '600';
    td.textContent = t.title || '';
    if (!tableExpanded[t.id] && t.subtask_count > 0) {
      var badge = document.createElement('span');
      badge.style.cssText = 'margin-left:6px;font-size:10px;color:var(--text-dim);font-weight:400';
      badge.textContent = '↳ ' + t.subtask_count;
      td.appendChild(badge);
    }
    return td;
  }

  if (colKey === 'status') {
    if (t.status_name) {
      var pill = document.createElement('span');
      pill.className = 'status-pill';
      pill.textContent = t.status_name;
      if (t.status_color) pill.style.background = t.status_color + '33';
      td.appendChild(pill);
    } else {
      td.textContent = '—';
    }
    return td;
  }

  if (colKey === 'priority') {
    if (t.priority) {
      var dot = document.createElement('span');
      dot.style.cssText = 'display:inline-flex;align-items:center;gap:4px';
      var colors = { high: '#ef4444', medium: '#f59e0b', low: '#6b7280' };
      dot.innerHTML = '<span style="width:7px;height:7px;border-radius:50%;background:' + (colors[t.priority] || '#6b7280') + '"></span>' + t.priority;
      td.appendChild(dot);
    } else {
      td.textContent = '—';
    }
    return td;
  }

  if (colKey === 'start_date' || colKey === 'due_date') {
    var val = t[colKey];
    if (!val) { td.textContent = '—'; return td; }
    var isOverdue = colKey === 'due_date' && val < new Date().toISOString().slice(0,10) && t.status_name !== 'Done';
    td.textContent = (isOverdue ? '⚠ ' : '') + val;
    if (isOverdue) td.style.color = '#ef4444';
    return td;
  }

  if (colKey === 'project') {
    td.textContent = t.project_name || '—';
    return td;
  }

  if (colKey === 'tags') {
    if (t.tags && t.tags.length) {
      t.tags.forEach(function(tag) {
        var p = document.createElement('span');
        p.className = 'tag-pill';
        p.textContent = tag.name;
        p.style.background = hexToRgba(tag.color, 0.2);
        p.style.color = tag.color;
        p.style.marginRight = '3px';
        td.appendChild(p);
      });
    } else {
      td.textContent = '—';
    }
    return td;
  }

  if (colKey === 'notes') {
    var notes = t.notes || '';
    td.textContent = notes.length > 40 ? notes.slice(0, 40) + '…' : (notes || '—');
    return td;
  }

  return td;
}
```

- [ ] **Step 2: Add buildTableRow function**

```javascript
function buildTableRow(t, visibleCols) {
  var tr = document.createElement('tr');
  tr.className = 'table-row-root priority-' + (t.priority || 'none');
  tr.dataset.taskId = t.id;

  // Expand cell
  var expandTd = document.createElement('td');
  expandTd.className = 'col-expand';
  if (t.subtask_count > 0) {
    expandTd.textContent = tableExpanded[t.id] ? '▼' : '►';
    expandTd.addEventListener('click', function(e) {
      e.stopPropagation();
      if (tableExpanded[t.id]) {
        delete tableExpanded[t.id];
      } else {
        tableExpanded[t.id] = true;
      }
      renderTable();
    });
  }
  tr.appendChild(expandTd);

  visibleCols.forEach(function(col) {
    var td = buildTableCell(t, col.key);
    td.addEventListener('click', function() { openTableCellEdit(t, col.key, td); });
    tr.appendChild(td);
  });

  return tr;
}
```

- [ ] **Step 3: Add buildSubtaskRow function**

```javascript
function buildSubtaskRow(child, visibleCols) {
  var tr = document.createElement('tr');
  tr.className = 'table-row-sub';
  tr.dataset.taskId = child.id;

  var expandTd = document.createElement('td');
  expandTd.className = 'col-expand';
  tr.appendChild(expandTd);

  visibleCols.forEach(function(col) {
    var td;
    if (col.key === 'title') {
      td = document.createElement('td');
      td.style.paddingLeft = '28px';
      td.textContent = '↳ ' + (child.title || '');
    } else {
      td = buildTableCell(child, col.key);
    }
    td.addEventListener('click', function() { openTableCellEdit(child, col.key, td); });
    tr.appendChild(td);
  });

  return tr;
}
```

- [ ] **Step 4: Add stub openTableCellEdit (will be implemented in Task 5)**

```javascript
function openTableCellEdit(t, colKey, td) {
  // inline editing — implemented in Task 5
}
```

- [ ] **Step 5: Hot-copy and test row rendering**

```bash
docker cp static/app.js mytask-mytask-1:/app/static/app.js
```

Open http://10.0.0.149:8080, click Table tab. You should see:
- All root tasks listed as rows
- Status pills, priority dots, dates, project name, tag pills all rendering correctly
- Tasks with subtasks show ▶ in expand column — clicking toggles ▼ and reveals child rows
- Subtask rows indented with ↳ prefix and faint left border
- "+ New task…" row at bottom
- Clicking any cell does nothing yet (stub)

- [ ] **Step 6: Commit**

```bash
git add static/app.js
git commit -m "feat: add table row rendering with expand/collapse and cell display"
```

---

### Task 5: Inline cell editing

**Files:**
- Modify: `static/app.js`

- [ ] **Step 1: Add saveTableCell helper**

```javascript
function saveTableCell(taskId, field, value, onDone) {
  var body = {};
  body[field] = value;
  fetch('/api/tasks/' + taskId, {
    method: 'PUT',
    headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
    body: JSON.stringify(body)
  }).then(function(r) { return r.json(); }).then(function() {
    loadTasks();
    if (onDone) onDone();
  }).catch(function(err) { console.error('saveTableCell failed', err); });
}
```

- [ ] **Step 2: Implement openTableCellEdit**

Replace the stub `openTableCellEdit` with:

```javascript
function openTableCellEdit(t, colKey, td) {
  if (td.classList.contains('table-cell-edit')) return;
  td.classList.add('table-cell-edit');
  var original = td.cloneNode(true);

  function cancel() {
    td.classList.remove('table-cell-edit');
    td.textContent = '';
    while (original.firstChild) td.appendChild(original.firstChild.cloneNode(true));
  }

  if (colKey === 'title') {
    var inp = document.createElement('input');
    inp.type = 'text';
    inp.value = t.title || '';
    td.textContent = '';
    td.appendChild(inp);
    inp.focus();
    inp.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && inp.value.trim()) {
        saveTableCell(t.id, 'title', inp.value.trim());
      }
      if (e.key === 'Escape') cancel();
    });
    inp.addEventListener('blur', function() {
      if (inp.value.trim() && inp.value.trim() !== t.title) {
        saveTableCell(t.id, 'title', inp.value.trim());
      } else {
        cancel();
      }
    });
    return;
  }

  if (colKey === 'status') {
    var sel = document.createElement('select');
    allStatuses.forEach(function(s) {
      var opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.name;
      if (s.id === t.status_id) opt.selected = true;
      sel.appendChild(opt);
    });
    td.textContent = '';
    td.appendChild(sel);
    sel.focus();
    sel.addEventListener('change', function() { saveTableCell(t.id, 'status_id', parseInt(sel.value, 10)); });
    sel.addEventListener('blur', cancel);
    return;
  }

  if (colKey === 'priority') {
    var sel2 = document.createElement('select');
    ['high', 'medium', 'low'].forEach(function(p) {
      var opt = document.createElement('option');
      opt.value = p; opt.textContent = p.charAt(0).toUpperCase() + p.slice(1);
      if (p === t.priority) opt.selected = true;
      sel2.appendChild(opt);
    });
    td.textContent = '';
    td.appendChild(sel2);
    sel2.focus();
    sel2.addEventListener('change', function() { saveTableCell(t.id, 'priority', sel2.value); });
    sel2.addEventListener('blur', cancel);
    return;
  }

  if (colKey === 'start_date' || colKey === 'due_date') {
    var dateinp = document.createElement('input');
    dateinp.type = 'date';
    dateinp.value = t[colKey] || '';
    td.textContent = '';
    td.appendChild(dateinp);
    dateinp.focus();
    dateinp.addEventListener('blur', function() {
      saveTableCell(t.id, colKey, dateinp.value || null);
    });
    dateinp.addEventListener('keydown', function(e) { if (e.key === 'Escape') cancel(); });
    return;
  }

  if (colKey === 'project') {
    var sel3 = document.createElement('select');
    var noOpt = document.createElement('option');
    noOpt.value = ''; noOpt.textContent = 'No project';
    if (!t.project_id) noOpt.selected = true;
    sel3.appendChild(noOpt);
    allProjects.forEach(function(p) {
      var opt = document.createElement('option');
      opt.value = p.id; opt.textContent = p.name;
      if (p.id === t.project_id) opt.selected = true;
      sel3.appendChild(opt);
    });
    td.textContent = '';
    td.appendChild(sel3);
    sel3.focus();
    sel3.addEventListener('change', function() {
      saveTableCell(t.id, 'project_id', sel3.value ? parseInt(sel3.value, 10) : null);
    });
    sel3.addEventListener('blur', cancel);
    return;
  }

  if (colKey === 'tags') {
    var popover = document.createElement('div');
    popover.className = 'table-col-picker';
    var currentTagIds = (t.tags || []).map(function(tg) { return tg.id; });
    allTags.forEach(function(tag) {
      var lbl = document.createElement('label');
      var chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.checked = currentTagIds.indexOf(tag.id) !== -1;
      chk.addEventListener('change', function() {
        if (this.checked) {
          currentTagIds.push(tag.id);
        } else {
          currentTagIds = currentTagIds.filter(function(id) { return id !== tag.id; });
        }
        saveTableCell(t.id, 'tag_ids', currentTagIds);
      });
      lbl.appendChild(chk);
      var dot = document.createElement('span');
      dot.style.cssText = 'display:inline-block;width:8px;height:8px;border-radius:50%;background:' + tag.color + ';margin:0 4px';
      lbl.appendChild(dot);
      lbl.appendChild(document.createTextNode(tag.name));
      popover.appendChild(lbl);
    });
    var rect2 = td.getBoundingClientRect();
    popover.style.position = 'fixed';
    popover.style.top = (rect2.bottom + 4) + 'px';
    popover.style.left = rect2.left + 'px';
    document.body.appendChild(popover);
    td.classList.remove('table-cell-edit');
    var removePopover = function() {
      popover.remove();
      document.removeEventListener('click', removePopover);
    };
    setTimeout(function() { document.addEventListener('click', removePopover); }, 0);
    return;
  }

  if (colKey === 'notes') {
    var popover2 = document.createElement('div');
    popover2.className = 'table-notes-popover';
    popover2.style.position = 'fixed';
    var rect3 = td.getBoundingClientRect();
    popover2.style.top = (rect3.bottom + 4) + 'px';
    popover2.style.left = rect3.left + 'px';
    var ta = document.createElement('textarea');
    ta.value = t.notes || '';
    popover2.appendChild(ta);
    var saveBtn = document.createElement('button');
    saveBtn.className = 'btn-primary';
    saveBtn.style.cssText = 'margin-top:6px;font-size:11px;padding:3px 8px;display:block';
    saveBtn.textContent = '✓ Save';
    saveBtn.addEventListener('click', function() {
      saveTableCell(t.id, 'notes', ta.value || null);
      popover2.remove();
    });
    popover2.appendChild(saveBtn);
    document.body.appendChild(popover2);
    ta.focus();
    td.classList.remove('table-cell-edit');
    var removeNotes = function(e) {
      if (!popover2.contains(e.target)) {
        saveTableCell(t.id, 'notes', ta.value || null);
        popover2.remove();
        document.removeEventListener('click', removeNotes);
      }
    };
    setTimeout(function() { document.addEventListener('click', removeNotes); }, 0);
    return;
  }

  cancel();
}
```

- [ ] **Step 3: Hot-copy and test inline editing**

```bash
docker cp static/app.js mytask-mytask-1:/app/static/app.js
```

Open http://10.0.0.149:8080, click Table tab. Test each cell type:
1. Click Title cell → inline text input; Enter saves, Escape cancels
2. Click Status cell → dropdown; change saves immediately
3. Click Priority cell → dropdown with High/Medium/Low
4. Click Start Date / Due Date → date picker; blur saves
5. Click Project → dropdown with all projects + "No project"
6. Click Tags → popover with checkboxes; toggling saves immediately
7. Click Notes → popover with textarea and Save button
8. After any save, table re-renders with updated data

- [ ] **Step 4: Commit**

```bash
git add static/app.js
git commit -m "feat: add table view inline cell editing for all column types"
```

---

### Task 6: Tests + final hot-copy

**Files:**
- Test: `tests/test_tasks.py` (smoke check — no new backend endpoints)

- [ ] **Step 1: Run full test suite**

```bash
python3 -m pytest -v
```

Expected: all tests pass. The table view is pure frontend; no backend changes were made.

- [ ] **Step 2: Full hot-copy of all changed static files**

```bash
docker cp static/index.html mytask-mytask-1:/app/static/index.html
docker cp static/style.css mytask-mytask-1:/app/static/style.css
docker cp static/app.js mytask-mytask-1:/app/static/app.js
```

- [ ] **Step 3: Full end-to-end verification**

Open http://10.0.0.149:8080 and verify:
1. "⊞ Table" tab is visible and clickable
2. All tasks appear as rows with correct column data
3. Columns button opens picker; hiding/showing columns persists after page refresh
4. Clicking a sortable column header sorts rows; clicking again reverses; indicator shows in toolbar
5. Tasks with subtasks show ▶ toggle; clicking expands subtask rows inline
6. All 7 inline edit types work correctly and save to the backend
7. "+ New task…" row opens the new task modal
8. No console errors

- [ ] **Step 4: Push to GitHub**

```bash
git push origin master
```
