# Phase 1 Features — Sub-tasks, Tags & Dashboard Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add three features to MyTask — nested sub-tasks, predefined colour-coded tags, and an AI daily briefing dashboard panel.

**Architecture:** Self-referential FK on Task for sub-tasks; new Tag + TaskTag tables for many-to-many tagging; dedicated `/api/dashboard` endpoint with a non-streaming AI briefing call. All new features integrate into the existing FastAPI/SQLAlchemy/vanilla-JS stack without structural changes to auth, projects, or chat.

**Tech Stack:** FastAPI, SQLAlchemy 2, SQLite, AsyncOpenAI, vanilla JS (no build step)

---

## 1. Data Model

### 1.1 Task — add `parent_id`

Add a nullable self-referential FK to the existing `Task` model:

```python
parent_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=True)
children  = relationship("Task", backref=backref("parent", remote_side="Task.id"),
                         cascade="all, delete-orphan", lazy="dynamic")
```

- Root tasks have `parent_id = None`.
- Sub-tasks at any depth point to their direct parent.
- Deleting a task cascades to all descendants.

### 1.2 Tag — new table

```python
class Tag(Base):
    __tablename__ = "tags"
    id         = Column(Integer, primary_key=True)
    name       = Column(String, unique=True, nullable=False)
    color      = Column(String(7), nullable=False)   # hex e.g. "#e74c3c"
    created_at = Column(DateTime, default=datetime.utcnow)
```

- Global — not per-user or per-project.
- Only admins can create or delete tags.
- Any user can assign tags to their own tasks.

### 1.3 TaskTag — junction table

```python
task_tags = Table(
    "task_tags", Base.metadata,
    Column("task_id", Integer, ForeignKey("tasks.id",  ondelete="CASCADE"), primary_key=True),
    Column("tag_id",  Integer, ForeignKey("tags.id",   ondelete="CASCADE"), primary_key=True),
)
```

Add relationship on Task:
```python
tags = relationship("Tag", secondary=task_tags, lazy="selectin")
```

---

## 2. API Endpoints

### 2.1 New router — `routers/tags.py`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/tags` | any user | List all tags |
| POST | `/api/tags` | admin only | Create tag `{name, color}` |
| DELETE | `/api/tags/{id}` | admin only | Delete tag (cascades TaskTag rows) |

### 2.2 New router — `routers/dashboard.py`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/dashboard` | any user | Returns counts + AI briefing |

Response shape:
```json
{
  "overdue": 2,
  "due_today": 3,
  "due_week": 7,
  "ai_briefing": "Focus on 'Review server logs' first — it's overdue and high priority."
}
```

`ai_briefing` is generated with a single non-streaming call to the model using a compact prompt. If the model call fails, `ai_briefing` falls back to `null` — the counts always return regardless.

### 2.3 Modified — `routers/tasks.py`

**POST `/api/tasks`** — accepts two new optional fields:
```json
{ "parent_id": 5, "tag_ids": [1, 3] }
```

**PUT `/api/tasks/{id}`** — accepts optional `tag_ids[]` to replace the full tag set.

**GET `/api/tasks`** — each task in the list response gains:
```json
{ "tags": [{"id":1,"name":"server","color":"#4a90d9"}], "subtask_count": 3, "completed_subtasks": 1 }
```
Only root tasks (`parent_id = null`) are returned by default — this is intentional so sub-tasks do not appear twice (once inline and once in the main list). Pass `?parent_id=5` to fetch direct children of a task. The `task_to_dict()` helper used by `chat.py` must also be updated to include `tags` and `subtask_count`.

**GET `/api/tasks/{id}`** — returns full task with:
```json
{ "tags": [...], "children": [...] }
```
`children` is one level deep; the frontend recurses as needed.

**POST `/api/tasks/{id}/tags/{tag_id}`** — add a tag to a task (idempotent).

**DELETE `/api/tasks/{id}/tags/{tag_id}`** — remove a tag from a task.

---

## 3. Frontend

### 3.1 Dashboard Panel (above task list, below filter bar)

Shown on login and refreshed on every `loadTasks()` call. Calls `GET /api/dashboard`.

```
┌─────────────────────────────────────────┐
│  2 Overdue │ 3 Due Today │ 7 This Week  │
│  🤖 Focus on: Review server logs first. │
└─────────────────────────────────────────┘
```

- Three stat boxes: overdue (red), due today (orange), this week (green).
- AI briefing line below the boxes. Hidden if `ai_briefing` is null.
- Entire panel hidden if all counts are zero.

### 3.2 Tags on Task Cards

- Coloured pills rendered below the task title for each assigned tag.
- Tag filter buttons appear in the filter bar (alongside All / Today / Overdue).
- Clicking a tag filter shows only tasks with that tag.
- In the expanded task detail: a tag picker (select from predefined list) + remove button per tag.

### 3.3 Sub-tasks Checklist

- Expanded task card shows an inline checklist of direct children.
- Each sub-task row: checkbox (toggles status done/todo) + title + optional nested indicator ("↳ N steps") if it has its own children.
- "＋ Add step" at the bottom opens a small inline input (title only, inherits parent priority).
- Clicking a nested indicator expands that sub-task's own children inline.
- Sub-task count shown on collapsed card: "☑ 1/3 steps".

### 3.4 Admin Page — Tag Management

New section above the user table in `admin.html`:

- List of existing tags with colour swatch, name, delete button.
- Create form: name input + colour picker (hex input with a small swatch preview) + Create button.
- No role field (tags are global).

### 3.5 Files Changed

| File | Change |
|------|--------|
| `models.py` | Add `parent_id`, `Tag`, `task_tags`, relationships |
| `routers/tags.py` | New — tag CRUD |
| `routers/dashboard.py` | New — dashboard endpoint |
| `routers/tasks.py` | Add parent_id, tag_ids, subtask fields |
| `ai/agent.py` | Add 3 new tools |
| `main.py` | Register new routers |
| `static/app.js` | Dashboard panel, tag pills, sub-task checklist, tag filters |
| `static/style.css` | Tag pill styles, dashboard strip styles, subtask indent styles |
| `static/index.html` | Dashboard panel HTML structure |
| `static/admin.html` | Tag management section |
| `static/admin.js` | Tag CRUD functions |

---

## 4. AI Agent — New Tools

Added to the `TOOLS` list in `ai/agent.py`:

**`create_subtask`**
```json
{ "parent_id": 5, "title": "Test connectivity", "priority": "medium", "due_date": "2026-05-20", "notes": null }
```
Creates a Task with `parent_id` set. Returns `"Created sub-task 'X' under task ID 5."`.

**`add_tag_to_task`**
```json
{ "task_id": 3, "tag_name": "server" }
```
Looks up tag by name (case-insensitive). Returns error string if tag doesn't exist.

**`remove_tag_from_task`**
```json
{ "task_id": 3, "tag_name": "urgent" }
```
Silently succeeds if tag wasn't assigned.

---

## 5. Testing

| File | Coverage |
|------|----------|
| `tests/test_tags.py` | Admin create/delete, any-user list, assign to task, filter tasks by tag, cascade on tag delete |
| `tests/test_subtasks.py` | Create sub-task, nested sub-task (depth 2), subtask_count on parent, cascade delete, GET ?parent_id |
| `tests/test_dashboard.py` | Correct overdue/today/week counts, ai_briefing field present (mocked), zero-count behaviour |
| `tests/test_agent.py` | Extended — covers create_subtask, add_tag_to_task, remove_tag_from_task |
