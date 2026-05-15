# CLAUDE.md — MyTask

## Project Overview

Personal AI task manager. FastAPI backend, SQLite database, vanilla JS frontend (no build step), Docker Compose deployment behind Nginx.

## Commands

```bash
# Run tests
python3 -m pytest -v

# Run a specific test file
python3 -m pytest tests/test_tasks.py -v

# Rebuild and redeploy
./docker.sh rebuild

# View logs
./docker.sh logs
```

## Architecture

- `main.py` — app entry point; runs `Base.metadata.create_all()` then `_migrate()` (adds new columns to existing DB) then `seed_admin()`
- `models.py` — all SQLAlchemy models: `User`, `Project`, `Tag`, `Task`, `task_tags` junction table
- `database.py` — engine + `get_db` dependency; in-memory SQLite for tests via `conftest.py` override
- `routers/` — one file per resource; all routes prefixed `/api/`
- `ai/agent.py` — tool-calling loop; sync but uses `AsyncOpenAI`; tools operate directly on the DB session passed in from `routers/chat.py`
- `static/` — pure HTML/CSS/JS served by FastAPI's `StaticFiles`; no build step, no bundler

## Key Conventions

**Models:**
- `Task.parent_id` is a nullable self-referential FK; root tasks have `parent_id = None`
- `Task.children` uses `lazy="selectin"` — always loaded; no N+1 risk but included in every query
- `Task.tags` uses `lazy="selectin"` via `task_tags` junction table
- When filtering `parent_id IS NULL` in SQLAlchemy use `Task.parent_id == None  # noqa: E711`

**API:**
- `GET /api/tasks` returns root tasks only by default; pass `?parent_id=N` for children
- `task_to_dict()` in `routers/tasks.py` must include `tags`, `subtask_count`, `completed_subtasks` — the frontend depends on all three
- Tag assignment after task creation requires `db.flush()` first (to get the task ID before commit)
- `PUT /api/tasks/{id}` uses `req.model_fields_set` (not `model_dump(exclude_none=True)`) to iterate update fields — this allows explicitly-sent `null` values (e.g. clearing `due_date` or `notes`) to correctly set the column to NULL

**Auth:**
- `get_current_user` dependency in `auth.py` — inject via `Depends(get_current_user)`
- Admin-only routes check `current_user.role != "admin"` and raise `HTTPException(403)`

**Frontend:**
- `hexToRgba(hex, alpha)` helper converts tag hex colours to rgba for inline styles
- Tag pills get background/color set inline by JS — `.tag-pill` CSS class is structural only
- `loadDashboard()` is called from `loadTasks()` on every task list refresh
- `editingTaskId` and `editingStepId` — module-level vars (like `expandedTaskId`) tracking which task/step edit form is open; both reset to `null` inside `toggleTask()` on card collapse
- `showTaskEditForm(t, detail)` — builds `.task-edit-form` inside the expanded card; Save disabled when title is blank; Escape cancels
- `hideTaskEditForm(taskId)` — removes the form element and resets `editingTaskId`
- `saveTaskEdit(taskId, data)` — `PUT /api/tasks/{id}`; on success calls `loadTasks()`; on failure logs to console and leaves form open
- `showStepEditRow(child, originalRow, parentId, container)` — hides original row, inserts inline edit inputs; Enter saves, Escape cancels; enforces one-at-a-time via `editingStepId`
- `saveStepEdit(...)` — `PUT /api/tasks/{id}` with title + due_date; on success calls `loadTasks()` only (not a redundant `loadAndRenderSubtasks`)
- Only one edit form (task or step) may be open at a time; opening a second collapses the first
- `body { height: 100vh; overflow: hidden; }` in `style.css` is required for the main split-panel layout; `admin.html` overrides this with `<style>body { overflow-y: auto; height: auto; }</style>` in its own `<head>` to allow scrolling

**AI agent:**
- Tools: `create_task`, `update_task`, `delete_task`, `list_tasks`, `create_subtask`, `add_tag_to_task`, `remove_tag_from_task`
- `create_subtask` validates parent ownership before creating
- `add_tag_to_task` does case-insensitive tag name lookup via `.ilike()`
- Dashboard AI briefing uses a separate non-streaming call in `routers/dashboard.py`; falls back to `null` on any error

## Database Migration Pattern

`main.py` runs `_migrate()` on startup to add columns that `create_all()` won't add to existing tables. When adding a new nullable column to an existing model, also add a corresponding `ALTER TABLE ... ADD COLUMN` in `_migrate()`.

## Tests

- `tests/conftest.py` — `client` (unauthenticated), `seeded_client` (has data), `admin_headers` (returns `(client, headers)` tuple)
- Tests use in-memory SQLite — the `conftest.py` overrides the engine before app import
- Async AI calls in dashboard/agent are mocked with `AsyncMock` + `patch("routers.dashboard.client.chat.completions.create", ...)`
- 74 tests; all must pass before merging

## Deployment

- Runs on Docker Compose; app on port 8080, Nginx on 443/8080
- Database persisted at `./data/mytask.db` (bind-mounted volume — survives rebuilds)
- SSL certs in `./certs/`; Cloudflare Full SSL mode at `uat.lvcopy.com`
- `.env` holds `SECRET_KEY`, `ADMIN_PASSWORD`, `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`
