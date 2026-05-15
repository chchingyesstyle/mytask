# Task & Step Edit Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add inline edit forms to task cards and subtask rows so users can modify title, due date, priority, and notes without leaving the task list.

**Architecture:** All changes are frontend-only (`static/app.js` and `static/style.css`). The backend `PUT /api/tasks/{id}` endpoint already accepts `title`, `priority`, `due_date`, and `notes`, so no Python changes are needed. Two new module-level state variables (`editingTaskId`, `editingStepId`) track which form is open; only one may be open at a time.

**Tech Stack:** Vanilla JavaScript (ES5-style, no build step), CSS custom properties, existing FastAPI `PUT /api/tasks/{id}` endpoint.

---

## File Map

| File | Change |
|------|--------|
| `static/style.css` | Append `.task-edit-form` block and `.step-edit-btn` styles |
| `static/app.js` | Add state vars; add Edit button to `buildTaskCard()`; add `showTaskEditForm`, `hideTaskEditForm`, `saveTaskEdit`; modify `loadAndRenderSubtasks` to add pencil button + row IDs; add `showStepEditRow`, `saveStepEdit` |

---

## Task 1: CSS — Edit form and pencil button styles

**Files:**
- Modify: `static/style.css` (append to end of file)

- [ ] **Step 1: Append the new CSS block to `static/style.css`**

Add this block to the **end** of `static/style.css`:

```css
/* Task inline edit form */
.task-edit-form {
  border: 1px solid var(--accent);
  border-radius: var(--r);
  padding: 10px;
  margin-top: 8px;
  background: var(--bg-panel);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.task-edit-form .edit-label {
  font-size: 10px;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.4px;
  margin-bottom: 2px;
}
.task-edit-form .edit-row-2col { display: flex; gap: 8px; }
.task-edit-form .edit-row-2col > div { flex: 1; min-width: 0; }
.task-edit-form .edit-actions { display: flex; gap: 6px; justify-content: flex-end; margin-top: 2px; }
.task-edit-form input, .task-edit-form select, .task-edit-form textarea {
  font-size: 11px; padding: 4px 8px;
}
.task-edit-form textarea { resize: vertical; min-height: 48px; font-family: inherit; }

/* Step pencil edit button */
.step-edit-btn {
  background: none;
  border: 1px solid var(--border);
  color: var(--text-dim);
  border-radius: 3px;
  padding: 1px 6px;
  font-size: 10px;
  cursor: pointer;
  flex-shrink: 0;
  margin-left: auto;
}
.step-edit-btn:hover { border-color: var(--accent); color: var(--accent); opacity: 1; }
```

- [ ] **Step 2: Verify CSS loads without errors**

Open the app in a browser (or reload). Open DevTools Console — confirm no CSS errors.

- [ ] **Step 3: Commit**

```bash
git add static/style.css
git commit -m "style: add task edit form and step pencil button styles"
```

---

## Task 2: Task edit button and inline form

**Files:**
- Modify: `static/app.js`

### Background — what you're editing

`buildTaskCard(t)` (line ~202) builds each task card DOM node. The section you'll touch is the **actions row** (lines ~264–282):

```javascript
var actions = document.createElement('div');
actions.className = 'task-detail-actions';
var statusSel = document.createElement('select');
// ... status options ...
statusSel.addEventListener('change', function() { updateTaskStatus(t.id, statusSel.value); });
var delBtn = document.createElement('button');
delBtn.className = 'btn-danger';
delBtn.textContent = 'Delete';
delBtn.addEventListener('click', function() { deleteTask(t.id); });
actions.appendChild(statusSel);
actions.appendChild(delBtn);       // ← insert editBtn BEFORE this line
detail.appendChild(actions);
```

State variables live at the very top of the file (lines 1–8):
```javascript
let expandedTaskId = null;
```

- [ ] **Step 1: Add `editingTaskId` state variable**

In `static/app.js`, find the state block at the top (the line `let expandedTaskId = null;`). Add the new variable on the line immediately after it:

```javascript
let expandedTaskId = null;
let editingTaskId = null;
```

- [ ] **Step 2: Add Edit button to `buildTaskCard`**

Find this exact block in `buildTaskCard` (the two `appendChild` lines before `detail.appendChild(actions)`):

```javascript
  actions.appendChild(statusSel);
  actions.appendChild(delBtn);
  detail.appendChild(actions);
```

Replace it with:

```javascript
  var editBtn = document.createElement('button');
  editBtn.className = 'btn-secondary';
  editBtn.textContent = '✏ Edit';
  editBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    if (editingTaskId === t.id) {
      hideTaskEditForm(detail, t.id);
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
```

- [ ] **Step 3: Add `showTaskEditForm`, `hideTaskEditForm`, `saveTaskEdit` functions**

Find the `deleteTask` function (around line ~380):
```javascript
async function deleteTask(id) {
  if (!confirm('Delete this task?')) return;
  ...
}
```

Add the three new functions **immediately after** `deleteTask`:

```javascript
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

  var cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn-secondary';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.cssText = 'font-size:11px;padding:4px 10px';

  titleInp.addEventListener('input', function() {
    saveBtn.disabled = !titleInp.value.trim();
  });

  cancelBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    hideTaskEditForm(detail, t.id);
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
    if (e.key === 'Escape') { e.stopPropagation(); hideTaskEditForm(detail, t.id); }
  });

  actionsDiv.appendChild(cancelBtn);
  actionsDiv.appendChild(saveBtn);
  form.appendChild(actionsDiv);

  detail.appendChild(form);
  titleInp.focus();
  titleInp.select();
}

function hideTaskEditForm(detail, taskId) {
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
```

- [ ] **Step 4: Run existing tests**

```bash
cd /u01/project/mytask
python3 -m pytest -v
```

Expected: all 74 tests pass (backend tests unaffected by frontend changes).

- [ ] **Step 5: Manual browser test — task edit**

Open the app. Expand any task.

1. Confirm **✏ Edit** button appears in the actions row (between status select and Delete).
2. Click Edit → confirm inline form appears with Title, Due Date, Priority, Notes all pre-filled.
3. Change the title to something different → click Save → confirm card refreshes with new title.
4. Click Edit again → press Escape → confirm form closes, title unchanged.
5. Click Edit on Task A, then click Edit on Task B → confirm Task A's form closes.
6. Clear the title field → confirm Save button is disabled.

- [ ] **Step 6: Commit**

```bash
git add static/app.js
git commit -m "feat: add inline edit form to task cards"
```

---

## Task 3: Step edit button and inline edit

**Files:**
- Modify: `static/app.js`

### Background — what you're editing

`loadAndRenderSubtasks(parentId, container)` (line ~399) fetches and renders subtask rows. The `children.forEach` block (lines ~406–428) builds each row — you'll add a row ID, an optional due-date span, and a pencil button. Currently:

```javascript
    children.forEach(function(child) {
      var row = document.createElement('div');
      row.className = 'subtask-row' + (child.status === 'done' ? ' done' : '');
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
      row.appendChild(cb);
      row.appendChild(titleSpan);
      if (child.subtask_count > 0) {
        var hint = document.createElement('span');
        hint.className = 'subtask-nested-hint';
        hint.textContent = '↳ ' + child.subtask_count + ' steps';
        row.appendChild(hint);
      }
      container.appendChild(row);
    });
```

- [ ] **Step 1: Add `editingStepId` state variable**

In `static/app.js`, find the state block at the top. Add after `let editingTaskId = null;`:

```javascript
let editingTaskId = null;
let editingStepId = null;
```

- [ ] **Step 2: Replace the `children.forEach` block in `loadAndRenderSubtasks`**

Find the entire `children.forEach` block shown above and replace it with:

```javascript
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
```

- [ ] **Step 3: Add `showStepEditRow` and `saveStepEdit` functions**

Find `showAddStepInput` (around line ~450). Add the two new functions **immediately after** `showAddStepInput`:

```javascript
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
  editRow.className = 'subtask-row';
  editRow.id = 'step-edit-' + child.id;

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

  function doCancel() {
    editingStepId = null;
    editRow.remove();
    originalRow.style.display = '';
  }

  function doSave() {
    if (!titleInp.value.trim()) return;
    saveStepEdit(child.id, titleInp.value.trim(), dateInp.value || null,
                 parentId, container, editRow, originalRow);
  }

  cancelBtn.addEventListener('click', function(e) { e.stopPropagation(); doCancel(); });
  saveBtn.addEventListener('click', function(e) { e.stopPropagation(); doSave(); });
  titleInp.addEventListener('keydown', function(e) {
    e.stopPropagation();
    if (e.key === 'Enter') doSave();
    if (e.key === 'Escape') doCancel();
  });

  editRow.appendChild(titleInp);
  editRow.appendChild(dateInp);
  editRow.appendChild(cancelBtn);
  editRow.appendChild(saveBtn);

  container.insertBefore(editRow, originalRow.nextSibling);
  titleInp.focus();
  titleInp.select();
}

async function saveStepEdit(stepId, title, dueDate, parentId, container, editRow, originalRow) {
  var resp = await fetch('/api/tasks/' + stepId, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({ title: title, due_date: dueDate }),
  });
  if (!resp.ok) { console.warn('Save step edit failed:', resp.status); return; }
  editingStepId = null;
  editRow.remove();
  originalRow.style.display = '';
  await loadAndRenderSubtasks(parentId, container);
  await loadTasks();
}
```

- [ ] **Step 4: Run existing tests**

```bash
cd /u01/project/mytask
python3 -m pytest -v
```

Expected: all 74 tests pass.

- [ ] **Step 5: Manual browser test — step edit**

Open the app. Expand a task that has subtask steps.

1. Confirm each step row shows a small **✏** button on the right edge.
2. Click ✏ on a step → confirm the row is replaced with an edit row containing a title input, date input, ✕, and ✓.
3. Change the title and set a date → click ✓ → confirm the row refreshes with the new title and date shown.
4. Click ✏ on a step → press Escape → confirm the original row is restored.
5. Click ✏ on step A, then ✏ on step B → confirm step A's edit row disappears and step B opens.
6. Clear the title → click ✓ → confirm nothing happens (empty title is blocked).

- [ ] **Step 6: Commit**

```bash
git add static/app.js
git commit -m "feat: add inline edit to subtask/step rows"
```
