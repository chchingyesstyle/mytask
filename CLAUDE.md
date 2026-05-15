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

# Hot-copy static files (no rebuild needed for JS/CSS/HTML changes)
docker cp static/app.js mytask-mytask-1:/app/static/app.js
docker cp static/style.css mytask-mytask-1:/app/static/style.css
docker cp static/index.html mytask-mytask-1:/app/static/index.html
```

## Architecture

- `main.py` — app entry point; runs `Base.metadata.create_all()` then `_migrate()` (adds new columns to existing DB) then `seed_admin()`
- `models.py` — all SQLAlchemy models: `User`, `Project`, `Tag`, `Task`, `task_tags` junction table, `KBDocument`
- `database.py` — engine + `get_db` dependency; in-memory SQLite for tests via `conftest.py` override
- `routers/` — one file per resource; all routes prefixed `/api/`
- `ai/agent.py` — tool-calling loop; sync but uses `AsyncOpenAI`; tools operate directly on the DB session passed in from `routers/chat.py`
- `static/` — pure HTML/CSS/JS served by FastAPI's `StaticFiles`; no build step, no bundler
- `seed.py` — `seed_admin()` reads `ADMIN_PASSWORD` from env; always upserts password hash on startup (changing env + rebuild updates it)
- `kb/extract.py` — async `extract_text(file_path, file_type, openai_client)` for txt/md/pdf/docx/jpg/png
- `routers/kb.py` — `POST /api/kb` (upload), `GET /api/kb` (list), `DELETE /api/kb/{id}`; files stored at `./data/uploads/`

## Key Conventions

**Models:**
- `Task.parent_id` is a nullable self-referential FK; root tasks have `parent_id = None`
- `Task.children` uses `lazy="selectin"` — always loaded; no N+1 risk but included in every query
- `Task.tags` uses `lazy="selectin"` via `task_tags` junction table
- When filtering `parent_id IS NULL` in SQLAlchemy use `Task.parent_id == None  # noqa: E711`
- `KBDocument` — `task_id=None` = global KB doc; `task_id=N` = task-attached; `extracted_text` stored at upload time; never returned to frontend

**API:**
- `GET /api/tasks` returns root tasks only by default; pass `?parent_id=N` for children
- `task_to_dict()` in `routers/tasks.py` must include `tags`, `subtask_count`, `completed_subtasks` — the frontend depends on all three
- Tag assignment after task creation requires `db.flush()` first (to get the task ID before commit)
- `PUT /api/tasks/{id}` uses `req.model_fields_set` (not `model_dump(exclude_none=True)`) to iterate update fields — this allows explicitly-sent `null` values (e.g. clearing `due_date` or `notes`) to correctly set the column to NULL
- `GET /api/info` — unauthenticated; returns `{"model": MODEL}`; used by frontend to label the chat panel
- `POST /api/tags` and `DELETE /api/tags/{id}` — open to all authenticated users (not admin-only)
- `POST /api/tasks/{id}/ai-action` — body `{action, custom_prompt?}`; action one of meeting_prep/draft_email/summarise/action_items/custom
- `GET /api/kb` accepts `?global=true` or `?task_id=N`; `global` is a Python reserved word — use `Query(alias="global")` in FastAPI
- `PUT /api/auth/password` — body `{current_password, new_password}`; verifies current hash, min 6 chars; any authenticated user

**Auth:**
- `get_current_user` dependency in `auth.py` — inject via `Depends(get_current_user)`
- Admin-only routes check `current_user.role != "admin"` and raise `HTTPException(403)`

**Frontend:**
- `hexToRgba(hex, alpha)` helper converts tag hex colours to rgba for inline styles
- Tag pills get background/color set inline by JS — `.tag-pill` CSS class is structural only
- `loadDashboard()` is called from `loadTasks()` on every task list refresh, and from `navigateTo('dashboard')` when the user switches to the Dashboard page
- `editingTaskId` and `editingStepId` — module-level vars (like `expandedTaskId`) tracking which task/step edit form is open; both reset to `null` inside `toggleTask()` on card collapse
- `showTaskEditForm(t, detail)` — builds `.task-edit-form` inside the expanded card; Save disabled when title is blank; Escape cancels
- `hideTaskEditForm(taskId)` — removes the form element and resets `editingTaskId`
- `saveTaskEdit(taskId, data)` — `PUT /api/tasks/{id}`; on success calls `loadTasks()`; on failure logs to console and leaves form open
- `showStepEditRow(child, originalRow, parentId, container)` — hides original row, inserts inline edit inputs; Enter saves, Escape cancels; enforces one-at-a-time via `editingStepId`
- `saveStepEdit(...)` — `PUT /api/tasks/{id}` with title + due_date + notes; on success calls `loadTasks()` only (not a redundant `loadAndRenderSubtasks`)
- Only one edit form (task or step) may be open at a time; opening a second collapses the first
- Layout is a fixed left sidebar (140px) + flex `main-content`; body is `overflow: hidden` on desktop; `@media (max-width: 768px)` overrides to `overflow: auto`; `admin.html` also overrides with `<style>body { overflow-y: auto; height: auto; }</style>`
- `currentPage`, `chatOpen`, `drawerOpen` — module-level state vars for the layout (alongside `editingTaskId` etc.)
- `navigateTo(page)` — canonical owner of page-switching: shows/hides `.page` divs, updates sidebar active class, updates `#mobile-page-title`, calls `loadDashboard()` when page is `'dashboard'`; call `navigateTo(currentPage)` at end of `initApp()` to initialise state from JS (not hardcoded HTML)
- `toggleChat()` — shows/hides `#chat-widget`, flips FAB emoji between 💬 and ✕, scrolls messages and focuses input when opening
- `toggleDrawer()` — toggles `.open` on `#mobile-drawer` and shows/hides `#drawer-overlay`
- Nav item click listeners go in `DOMContentLoaded`, NOT inside `initApp()` — placing them in `initApp()` accumulates duplicate listeners on every login call
- Admin users need both `admin-link` (sidebar) and `admin-link-drawer` (mobile drawer) revealed in `initApp()`
- CSS z-index stack: `.modal-overlay` 400 > `.mobile-drawer` 300 > `.drawer-overlay` 299 > `.chat-fab`/`.chat-widget` 200

**Mobile / CSS gotchas:**
- `overflow-y: auto` on a flex item does nothing without `min-height: 0` — the item won't shrink below its content height
- iOS Safari changes viewport height as the address bar shows/hides — never rely on items pinned to the bottom of a flex container being visible; put them *inside* the scroll container with a `flex:1` `.drawer-spacer` div above them
- Use `height: 100vh; height: 100dvh` (both declarations) for full-height fixed elements on iOS
- Add `-webkit-overflow-scrolling: touch` to any scrollable container for iOS momentum scrolling
- `body.light` CSS class overrides all `--bg-*`/`--border`/`--text` vars; `applyTheme(theme)` syncs class + localStorage + button labels
- `TABLE_COLS`, `tableSort`, `tableExpanded`, `tableHiddenCols` (localStorage) — table view state vars
- `renderTable()`, `buildTableRow()`, `buildSubtaskRow()`, `openTableCellEdit()` — table view; wired via `renderCurrentView()`
- `renderKBPage()`, `buildKBDocCard()` — KB sidebar page; register in `navigateTo()` and add click listeners in `DOMContentLoaded`
- `renderTaskDocs(task, detailEl)`, `renderTaskAIActions(task, detailEl)` — called from `toggleTask()` when card expands
- Calendar and timeline both span `start_date` → `due_date`; don't index only by `due_date`
- `showToast(msg)` — fixed bottom notification; use for save/action confirmations

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
- 100 tests; all must pass before merging
- `seeded_client` fixture takes `monkeypatch` and sets `ADMIN_PASSWORD` env var — required since seed.py reads it from env

## Deployment

- Runs on Docker Compose; app on port 8080, Nginx on 443/8080
- Database persisted at `./data/mytask.db` (bind-mounted volume — survives rebuilds)
- KB uploads persisted at `./data/uploads/` — same `./data:/app/data` bind mount; survives rebuilds
- SSL certs in `./certs/`; Cloudflare Full SSL mode at `uat.lvcopy.com`
- `.env` holds `JWT_SECRET_KEY`, `ADMIN_PASSWORD`, `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`
- App container name: `mytask-mytask-1`; Nginx: `mytask-nginx-1`
- Python/backend changes require `./docker.sh rebuild`; static file changes can use `docker cp`
- LiteLLM proxy at `/u01/litellm` (config: `config.yaml`, key: in `.env`); reachable from container at `http://172.20.0.1:4000`
- No browser (Chrome/Playwright) is installed on the server — MCP browser tools fail; UI verification requires the user to open the app manually at http://10.0.0.149:8080
