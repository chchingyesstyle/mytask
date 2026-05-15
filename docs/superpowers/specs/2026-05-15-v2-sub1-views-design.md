# MyTask v2.0 — Sub-project 1: Views Design Spec

## Goal

Add three new views to the Tasks page — Board (Kanban), Calendar, and Timeline/Gantt — alongside the existing List view. Introduce a `statuses` table replacing the hardcoded `task.status` string with per-project customisable status columns.

## Architecture

Backend: one new `statuses` table, one new `/api/statuses` router, a DB migration mapping existing status strings to seeded status rows, and a FK column `Task.status_id`. Frontend: a view switcher tab bar replaces the existing filter bar header; four independent rendering functions (`renderList`, `renderBoard`, `renderCalendar`, `renderTimeline`) swap in/out below it. No changes to any other router or model.

**Tech Stack:** FastAPI, SQLAlchemy, SQLite, Vanilla JS, CSS custom properties.

---

## Data Model

### New table: `statuses`

```python
class Status(Base):
    __tablename__ = "statuses"
    id         = Column(Integer, primary_key=True)
    name       = Column(String, nullable=False)
    color      = Column(String(7), nullable=False)   # hex e.g. "#4a90d9"
    position   = Column(Integer, nullable=False)     # sort order within project
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=True)
    # NULL project_id = default set (for tasks with no project)
```

### Changes to `Task`

- Remove `status` string column
- Add `status_id = Column(Integer, ForeignKey("statuses.id"), nullable=True)`
- `nullable=True` so tasks created before migration have no status yet (treated as first status in default set)

### Migration (`_migrate()` in `main.py`)

1. Create `statuses` table if not exists
2. Seed default status set (`project_id IS NULL`):
   - id 1 · "Todo" · `#6b7280` · position 0
   - id 2 · "In Progress" · `#4a90d9` · position 1
   - id 3 · "Done" · `#2ecc71` · position 2
3. Add `status_id` column to `tasks` if not exists
4. Backfill: `UPDATE tasks SET status_id = (SELECT id FROM statuses WHERE project_id IS NULL AND name = 'Todo') WHERE status = 'todo'` (and In Progress, Done equivalents)
5. Keep old `status` column but stop writing to it — SQLite ALTER TABLE DROP COLUMN requires 3.35+ and table recreation; safer to leave the column unused and document it as deprecated

### On project creation

`POST /api/projects` seeds 3 default statuses for the new project (Todo · In Progress · Done) by copying the default set's names and colors with that project's id.

---

## API — `/api/statuses`

All routes require authentication. Reorder and mutate routes require the requesting user to own the project (or be admin for the default set).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/statuses?project_id=N` | List statuses for project N (ordered by position). Omit param → default set. |
| POST | `/api/statuses` | Create status. Body: `{name, color, project_id}`. |
| PUT | `/api/statuses/{id}` | Update name or color. |
| DELETE | `/api/statuses/{id}` | Delete. Tasks using this status are reassigned to the first status of the same project. |
| PUT | `/api/statuses/reorder` | Body: `{ids: [3,1,2]}` — sets position by array index. |

---

## Frontend

### View switcher

Replaces the current filter bar header. Rendered once inside `#page-tasks`, above the filter bar (filter bar stays, just moves below the switcher).

```
[ ≡ List ]  [ ⊞ Board ]  [ 📅 Calendar ]  [ ⟶ Timeline ]     [project filter ▾]
```

Active view stored in module-level `let currentView = 'list'`. `switchView(view)` shows/hides the correct container div and updates the active tab style.

### Board view (`#view-board`)

- **Board view requires a project to be selected.** When "All projects" is active, the Board tab is disabled with a tooltip: "Select a project to use Board view". This avoids mixing incompatible status sets across projects.
- Renders one column per status, each containing filtered task cards
- Task cards: title, priority badge, due date, tag pills — same as list view cards
- **Drag to change status:** HTML5 drag-and-drop. `dragstart` stores task id; `drop` on a column calls `PUT /api/tasks/{id}` with `{status_id: N}`
- **"+ Add status" column** at the end opens an inline form (name + color picker) → `POST /api/statuses`
- Column `⋯` menu: rename, change colour, delete
- **"+ Add card"** footer in each column: opens the existing new-task modal with status pre-filled

### Calendar view (`#view-calendar`)

- Month grid (7 columns × 5–6 rows)
- `‹` / `›` navigation updates `currentCalendarMonth` (year+month integer)
- Each cell renders task title pills for tasks with `due_date` matching that date, colour-coded by priority
- Tasks with no due date not shown in the grid
- **Click empty date cell:** opens new-task modal with `due_date` pre-filled
- **Click task pill:** expands that task card (same as clicking in list view)
- `loadCalendar()` uses `allTasks` already in memory — no extra API call

### Timeline view (`#view-timeline`)

- Horizontal Gantt. Date range: earliest task due date − 3 days to latest + 7 days, minimum 14-day window, centered if fewer tasks
- Each task row: name label (130px fixed) + bar positioned as percentage of date range
- Bar width represents a single day at the due date (v2.0 has no start date — Sub-project 2 adds dependencies; bars will gain start dates then)
- Bar color = priority color
- Tasks without due date collected in a "No due date" section below a dashed separator
- **Drag bar horizontally** to change due date: `mousedown` + `mousemove` + `mouseup` updates `PUT /api/tasks/{id}` with new `due_date` on drop
- `‹` / `›` shifts the visible date window by 7 days

### State variables added to `app.js`

```javascript
let currentView = 'list';          // 'list' | 'board' | 'calendar' | 'timeline'
let currentCalendarMonth = null;   // { year, month } object, initialised to today
let currentTimelineOffset = 0;     // days shifted from auto-fit baseline
```

---

## Files Changed

| File | Change |
|------|--------|
| `models.py` | Add `Status` model; add `Task.status_id` FK; remove `Task.status` string |
| `main.py` | Migration: create statuses table, seed defaults, backfill tasks, drop old column; seed on project create |
| `routers/statuses.py` | New file — full CRUD for statuses |
| `routers/tasks.py` | Update `task_to_dict()` to include `status_id` and `status_name`; remove old `status` field |
| `routers/projects.py` | On `POST /api/projects`, seed 3 default statuses for new project |
| `static/index.html` | Add view switcher bar + `#view-board`, `#view-calendar`, `#view-timeline` divs inside `#page-tasks` |
| `static/app.js` | Add `switchView`, `renderBoard`, `renderCalendar`, `renderTimeline`, drag handlers, calendar nav, timeline nav |
| `static/style.css` | Add `.view-switcher`, `.board-column`, `.calendar-grid`, `.calendar-cell`, `.timeline-row`, `.gantt-bar` styles |
| `tests/test_statuses.py` | New test file — CRUD, reorder, project ownership, delete-reassign |

---

## Error Handling

- Deleting a status with tasks: reassign tasks to `position = 0` status of same project before delete
- Deleting the last status of a project: rejected with 400 — a project must always have at least one status
- Timeline with no tasks having due dates: show empty state "No tasks with due dates yet"
- Calendar month with no tasks: show empty grid (normal behaviour)

---

## Testing

Manual verification checklist:
1. Board view loads correct columns for selected project; "All projects" uses default set
2. Drag a card from "Todo" to "In Progress" → status updates, card moves column
3. Add a new status column → appears immediately in board
4. Delete a status with tasks → tasks move to first column
5. Calendar shows tasks on correct dates; click empty date → new task modal with date pre-filled
6. Timeline bars positioned correctly; drag bar → due date updates
7. Tasks with no due date appear in Timeline "No due date" section
8. Switching views preserves filter state (active project filter, tag filter)
9. All 75 existing tests still pass after migration

---

## Notes

- Sub-project 2 (Richer tasks) will add `start_date` to tasks — Timeline bars will then represent true duration
- Sub-project 2 will also add dependencies — Timeline will draw dependency arrows between bars at that point
- The `Status` model intentionally has no `owner_id` — ownership is inferred via `project.owner_id`
