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
- `GET /api/dashboard` returns: `overdue`, `due_today`, `due_week`, `due_30` (Coming Up, 8-30 days), `ai_briefing`, `overdue_tasks`, `today_tasks`, `projects`, `completed_7d`, `recent_activity`

**Auth:**
- `get_current_user` dependency in `auth.py` — inject via `Depends(get_current_user)`
- Admin-only routes check `current_user.role != "admin"` and raise `HTTPException(403)`

**Frontend:**
- Never use `innerHTML` for dynamic DOM — the pre-commit security hook rejects it; always use `document.createElement` + `textContent`
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

**Destructive actions — undo-toast pattern (no confirm dialogs):**
- All deletions (task, tag, project, status) use optimistic removal + 8-second undo toast
- `deleteTask(id)` — removes from `allTasks`, calls `renderCurrentView()`, schedules `fetch DELETE` after 8s; undo cancels the timeout and calls `loadTasks()`
- Tag/project/status deletions follow the same pattern: remove from in-memory array, re-render, schedule DELETE, undo = cancel + reload
- `window.confirm()` is not used anywhere in the main app — it cannot be styled and breaks the dark UI
- `showToast(msg, actionLabel?, actionFn?)` — if `actionLabel`/`actionFn` provided, renders an Undo button and shows for 8s; plain toasts show for 2.5s

**Date display:**
- `relativeDate(iso)` — converts an ISO date string to human-readable: "today", "tomorrow", "yesterday", "in N days", "Nd overdue"
- Applied to task card meta (list view and board view); table and timeline still use raw ISO for precision

**Dashboard:**
- Stat cards (Overdue, Due Today, This Week, Coming Up) are clickable — Overdue and Today navigate to the Tasks page with the matching filter applied
- `loadDashboard()` renders stat cards, AI briefing, task lists, project progress bars, 7-day sparkline, and recent activity
- AI briefing uses a separate non-streaming call in `routers/dashboard.py`; falls back to `null` on any error

**AI actions:**
- `renderTaskAIActions(task, detailEl)` — renders a `▸ AI Actions` disclosure toggle; body hidden by default, expands on click
- When collapsed, the expanded task card shows 5 zones (status, edit, tags, subtasks, AI toggle); full AI interface only visible when expanded
- Error messages use `var(--danger)` (not hardcoded `#ef4444`)

**Notes / Markdown:**
- Notes are stored as plain markdown TEXT in the DB (`Task.notes`) — no HTML stored, ever
- `setMarkdownContent(el, mdText)` — safe markdown-to-DOM: `marked.parse()` → `DOMPurify.sanitize()` → `DOMParser` + `importNode`; no `innerHTML`
- `renderNotesDisplay(notesText, container)` — renders notes with label into a container div; no-ops on empty/null
- `buildNotesToggle(initialValue)` — returns `{ el, getValue() }`: Edit/Preview tabs + `.notes-editor` textarea + `.notes-preview` div
- `showTaskEditForm()` uses `buildNotesToggle(t.notes)` — read value via `notesToggle.getValue()`
- New Task modal keeps plain `<textarea id="mt-notes">` — no toggle (fast capture)
- marked.js + DOMPurify loaded from CDN in `index.html` before `app.js`

**Color system:**
- CSS custom properties use OKLCH throughout; no hardcoded hex colors in `style.css` (except `rgba(0,0,0,...)` for shadows/overlays)
- Dark mode vars defined on `:root`; additional themes override the same custom properties via body class
- Theme cycler: `THEMES = ['dark','light','forest','amber','midnight']` in app.js; `applyTheme(theme)` strips all theme classes then adds the active one; FOUC snippet at top of app.js applies saved non-dark theme class before render
- Theme CSS classes: `body.light` (slate-mist), `body.forest` (deep greens/emerald), `body.amber` (warm honey light), `body.midnight` (violet dark) — each overrides `--bg-*`, `--border`, `--text`, `--accent`, `color-scheme`
- Sidebar icons use Unicode geometric symbols (✓ ◈ ⊡ # ◎ ⚙) — no emoji

**Accessibility:**
- `button:focus-visible` and `input:focus-visible` show a 2px accent-color outline; `outline: none` is set on elements but `:focus-visible` overrides it for keyboard users
- `#overdue-badge` has `role="status"` and `aria-live="polite"`; `#ai-dot` has `role="status"` and `aria-label="AI ready"`
- `@media (prefers-reduced-motion: reduce)` disables all transitions/animations
- `loadTasks()` is wrapped in try/catch; network failures render an inline `.load-error` div with a retry button

**Mobile / CSS gotchas:**
- `overflow-y: auto` on a flex item does nothing without `min-height: 0` — the item won't shrink below its content height
- iOS Safari changes viewport height as the address bar shows/hides — never rely on items pinned to the bottom of a flex container being visible; put them *inside* the scroll container with a `flex:1` `.drawer-spacer` div above them
- Use `height: 100vh; height: 100dvh` (both declarations) for full-height fixed elements on iOS
- Add `-webkit-overflow-scrolling: touch` to any scrollable container for iOS momentum scrolling
- iOS Safari ignores `color` on `input`/`select`/`textarea` — use `-webkit-text-fill-color: var(--text)` instead; `::placeholder` also needs `-webkit-text-fill-color: var(--text-dim)` and `opacity: 1` (Firefox strips opacity by default)
- Declare `color-scheme: dark` on `:root` and `color-scheme: light` on `body.light` — without it, OS-level input styling overrides your theme colors on iOS
- Use `:not(:empty)` to avoid phantom margins on conditionally-populated containers: `.task-notes-container:not(:empty) { margin-top: 8px; }` — plain `margin-top` on the container adds space even when empty
- `input[type="date"]` must be a direct flex child with `flex:1;min-width:0` to be constrained on iOS — wrapping in a div and using `width:100%` does NOT work; iOS date inputs have an intrinsic minimum width that `width:100%` cannot override
- Mobile media query font-size overrides need `!important` — component selectors like `.chat-input-row input` (specificity 0,1,1) beat bare `input` (0,0,1) without it
- `TABLE_COLS`, `tableSort`, `tableExpanded`, `tableHiddenCols` (localStorage) — table view state vars
- `renderTable()`, `buildTableRow()`, `buildSubtaskRow()`, `openTableCellEdit()` — table view; wired via `renderCurrentView()`
- `renderKBPage()`, `buildKBDocCard()` — KB sidebar page (label: "Knowledge"); register in `navigateTo()` and add click listeners in `DOMContentLoaded`
- `renderTaskDocs(task, detailEl)`, `renderTaskAIActions(task, detailEl)` — called from `toggleTask()` when card expands
- Calendar and timeline both span `start_date` → `due_date`; don't index only by `due_date`
- `showToast(msg, actionLabel?, actionFn?)` — fixed bottom notification; supports optional Undo button; use for save/action confirmations

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
- 107 tests; all must pass before merging
- `seeded_client` fixture takes `monkeypatch` and sets `ADMIN_PASSWORD` env var — required since seed.py reads it from env

## Deployment

- Runs on Docker Compose; app on port 8080, Nginx on 443/8080
- Database persisted at `./data/mytask.db` (bind-mounted volume — survives rebuilds)
- KB uploads persisted at `./data/uploads/` — same `./data:/app/data` bind mount; survives rebuilds
- SSL certs in `./certs/`; Cloudflare Full SSL mode at `cchk.uk`
- `.env` holds `JWT_SECRET_KEY`, `ADMIN_PASSWORD`, `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`
- App container name: `mytask-mytask-1`; Nginx: `mytask-nginx-1`
- Python/backend changes require `./docker.sh rebuild`; static file changes can use `docker cp`
- `.env` changes require `./docker.sh rebuild` — `docker compose restart` does NOT reload env vars; verify with `docker exec mytask-mytask-1 env | grep -E "OPENAI|MODEL"` and `curl -s http://localhost:8080/api/info`
- LiteLLM proxy at `/u01/litellm` (config: `config.yaml`, key: in `.env`); reachable from container at `http://172.20.0.1:4000`
- No browser (Chrome/Playwright) is installed on the server — MCP browser tools fail; UI verification requires the user to open the app manually at http://10.0.0.149:8080
