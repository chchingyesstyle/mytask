# Table (Spreadsheet) View Design Spec

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Notion-style spreadsheet/table view as a fifth tab on the Tasks page. All task fields are visible as columns, each cell is inline-editable, and root tasks can expand to reveal subtasks.

**Architecture:** Pure frontend. A new `renderTable()` function and supporting helpers added to `app.js`. New HTML added to `index.html`. CSS in `style.css`. No backend changes — uses existing `/api/tasks` PUT endpoint for saves.

**Tech Stack:** Vanilla JS, CSS custom properties, localStorage for column visibility and sort preferences.

---

## View Tab

Add a fifth tab to the view switcher in `index.html`:

```html
<button class="view-tab" data-view="table">⊞ Table</button>
```

Add the container div alongside the other view containers:

```html
<div id="view-table" class="view-container" style="display:none">
  <div id="table-toolbar" class="table-toolbar"></div>
  <div id="table-scroll" class="table-scroll">
    <table id="task-table" class="task-table"></table>
  </div>
</div>
```

Register in `renderCurrentView()` in `app.js`:

```javascript
else if (currentView === 'table') renderTable();
```

---

## State Variables (module-level, `app.js`)

```javascript
var tableSort = { col: null, dir: 'asc' };        // active sort column + direction
var tableExpanded = {};                             // { taskId: true } for expanded root tasks
var tableHiddenCols = JSON.parse(localStorage.getItem('tableHiddenCols') || '[]');
// e.g. ['notes', 'start_date'] — columns the user has hidden
```

---

## Columns Definition

Defined as a constant array so order and metadata are in one place:

```javascript
var TABLE_COLS = [
  { key: 'title',      label: 'Title',      sortable: true,  always: true  },
  { key: 'status',     label: 'Status',     sortable: true,  always: false },
  { key: 'priority',   label: 'Priority',   sortable: true,  always: false },
  { key: 'start_date', label: 'Start Date', sortable: true,  always: false },
  { key: 'due_date',   label: 'Due Date',   sortable: true,  always: false },
  { key: 'project',    label: 'Project',    sortable: true,  always: false },
  { key: 'tags',       label: 'Tags',       sortable: false, always: false },
  { key: 'notes',      label: 'Notes',      sortable: false, always: false },
];
```

`always: true` columns cannot be hidden. Visible columns = `TABLE_COLS.filter(c => c.always || !tableHiddenCols.includes(c.key))`.

---

## Toolbar

Rendered inside `#table-toolbar`. Contains:

- **"Columns" button** — opens the column picker popover (see below)
- **"Sort" indicator** — shows current sort column if active (e.g. "↕ Due Date ↑"), click to clear

```css
.table-toolbar { display:flex; align-items:center; gap:8px; padding:8px 12px;
  border-bottom:1px solid var(--border); background:var(--bg-panel); }
```

### Column picker popover

A small floating `<div>` that appears below the "Columns" button. Contains a checkbox for each non-`always` column. Checking/unchecking updates `tableHiddenCols` and saves to `localStorage.setItem('tableHiddenCols', JSON.stringify(tableHiddenCols))`, then calls `renderTable()`.

```css
.table-col-picker { position:absolute; background:var(--bg-card); border:1px solid var(--border);
  border-radius:var(--r); padding:8px; z-index:50; min-width:160px; box-shadow:0 4px 12px rgba(0,0,0,.3); }
.table-col-picker label { display:flex; align-items:center; gap:6px; padding:4px 0;
  font-size:12px; cursor:pointer; color:var(--text); }
```

---

## Table Structure

```
<table class="task-table">
  <thead>
    <tr>
      <th class="col-expand"></th>   <!-- expand toggle, no label -->
      <th data-col="title">Title ↕</th>
      <th data-col="status">Status ↕</th>
      ...visible columns...
    </tr>
  </thead>
  <tbody>
    <!-- root task rows + expanded subtask rows -->
    <tr class="table-new-row">
      <td colspan="N">+ New task…</td>
    </tr>
  </tbody>
</table>
```

### Sorting

Clicking a sortable column header toggles: no sort → asc → desc → no sort. Updates `tableSort` and re-renders. Sort applied to `filteredTasks()` result before rendering. Subtasks are not independently sorted — they stay under their parent.

Sort logic per column:
- `title`, `project`: alphabetical (`localeCompare`)
- `status`: by `status_name` alphabetical
- `priority`: high → medium → low
- `start_date`, `due_date`: chronological (null values last)

---

## Row Rendering

### Root task rows

```javascript
function buildTableRow(t, visibleCols) { ... }
```

Each `<tr>` has:
- `data-task-id` attribute
- Class `table-row-root`
- Class `priority-{t.priority}` (left border color, reuse existing CSS)

**Expand cell** (`col-expand`):
- If `t.subtask_count > 0`: shows `▶` (collapsed) or `▼` (expanded). Click toggles `tableExpanded[t.id]` and calls `renderTable()`.
- If no subtasks: empty cell.

**Title cell**: `font-weight: 600`. If collapsed with subtasks, shows `↳ N` count badge.

### Subtask rows

Rendered immediately after the parent row when `tableExpanded[t.id]` is true. Fetched from `t.children` (already loaded via `selectin`).

```javascript
function buildSubtaskRow(child, visibleCols) { ... }
```

- Class `table-row-sub`
- Expand cell: empty
- Title cell: indented with `padding-left: 28px`, prefixed `↳ `, dimmer color
- Same cell structure and inline editing as root rows

---

## Inline Cell Editing

Click any non-title cell → becomes editable in place. Click title → inline `<input>`. Only one cell editable at a time. Pressing **Escape** cancels. Pressing **Enter** (or blur for most fields) saves via `PUT /api/tasks/{id}`.

| Column | Edit control | Save trigger |
|--------|-------------|--------------|
| Title | `<input type="text">` replacing cell text | Enter or blur |
| Status | `<select>` with `allStatuses` options | `change` event |
| Priority | `<select>` with high/medium/low | `change` event |
| Start Date | `<input type="date">` | blur |
| Due Date | `<input type="date">` | blur |
| Project | `<select>` with `allProjects` + "No project" | `change` event |
| Tags | Tag-picker popover (checkbox list of `allTags`) | Close popover |
| Notes | Popover `<textarea>` (200×120px) | blur or ✓ button |

On save: call `PUT /api/tasks/{id}` with the changed field only (using `model_fields_set` pattern already in the backend), then call `loadTasks()` to refresh `allTasks` and re-render.

### Cell display (read state)

| Column | Display |
|--------|---------|
| Title | Text |
| Status | Coloured pill (reuse board card style) |
| Priority | Coloured dot + label |
| Start/Due Date | `YYYY-MM-DD` text; due date overdue → red + ⚠; empty → `—` |
| Project | Project name or `—` |
| Tags | Coloured tag pills (same as list view) |
| Notes | Truncated to 40 chars with `…`; empty → `—` |

---

## "+ New task" Row

Last `<tr>` in `<tbody>`. Click anywhere in the row → opens the existing `openNewTaskModal()`. Respects the active project filter (pre-fills project if `activeFilter` starts with `'project:'`).

---

## CSS

```css
.table-scroll { overflow-x: auto; overflow-y: auto; }
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
```

---

## Files Changed

| File | Change |
|------|--------|
| `static/index.html` | Add `⊞ Table` view tab; add `#view-table` container with toolbar + scroll div |
| `static/style.css` | Add all `.task-table`, `.table-*`, `.col-expand` styles |
| `static/app.js` | Add `tableSort`, `tableExpanded`, `tableHiddenCols` state; `TABLE_COLS` constant; `renderTable()`, `buildTableRow()`, `buildSubtaskRow()`, `buildTableToolbar()`, column picker logic, inline cell editing handlers |

---

## Out of Scope

- Drag-to-reorder rows (use timeline/board for ordering)
- Column resizing by drag
- Multi-row select / bulk edit
- Freeze first column (title) on horizontal scroll — deferred; complex to implement cleanly
