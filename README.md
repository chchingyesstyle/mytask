# MyTask — Personal AI Task Manager `v2.1`

A personal task manager with an integrated AI assistant, built on FastAPI, SQLite, and vanilla JavaScript.

## Features

### Task Management
- **Multiple views** — List, Board (Kanban), Calendar, Timeline (Gantt), Table (spreadsheet)
- **Task management** — Create, update, and delete tasks with priorities, start/due dates, projects, tags, and notes
- **Markdown notes** — Full GitHub Flavored Markdown in task notes: always rendered in the task card; Edit / Preview toggle in the edit form. Supports headings, bold, italic, lists, blockquotes, code blocks, tables, strikethrough, and links
- **Sub-tasks** — Nested checklist steps under any task; toggle done/todo inline; inline editing
- **Inline editing** — Edit any field directly in the task card or in the table view cells
- **Board view** — Kanban with project-specific status columns
- **Calendar view** — Month grid; tasks appear across their full start → due date range
- **Timeline view** — Gantt-style bars spanning start → due date; drag to shift dates
- **Table view** — Notion-style spreadsheet with sortable columns, column visibility picker, and inline cell editing for all field types

### Projects & Tags
- **Projects** — Group tasks; project-specific status columns in the board view
- **Colour-coded tags** — Assignable to tasks; filter any view by tag

### AI
- **AI chat assistant** — Conversational AI that can create tasks, sub-tasks, assign tags, and update status via tool calls; global KB documents injected as context
- **AI daily briefing** — Dashboard panel with overdue/today/this-week counts and AI-generated focus note
- **AI action buttons** — Per-task (behind a disclosure toggle): Meeting prep, Draft email, Summarise docs, Action items
- **Custom AI prompt** — Free-text input on any task card; sends your question with full task + KB context (Ctrl+Enter to submit)

### Dashboard
- **Stat cards** — Overdue, Due Today, This Week, Coming Up (8-30 days); click Overdue or Today to jump to the filtered task list
- **Project progress** — Completion bars across all active projects
- **7-day sparkline** — Bar chart of tasks completed over the last 7 days
- **Recent activity** — List of recently updated tasks with relative timestamps

### Knowledge Base
- **Global KB** — Upload PDF, DOCX, TXT, MD, PNG, JPG files as global reference documents; text extracted at upload (images via OpenAI Vision OCR)
- **Task attachments** — Attach documents directly to individual tasks
- **AI context injection** — KB docs automatically included in AI action calls and chat panel

### UI & UX
- **OKLCH color system** — Perceptually uniform color across all themes
- **5 color themes** — Dark, Light, Forest (green dark), Amber (warm light), Midnight (violet dark); cycle with the theme button in the sidebar; persists across sessions via localStorage
- **Relative dates** — Task card meta shows "Due today", "Due tomorrow", "in 3 days", "2d overdue" instead of raw ISO strings
- **Undo-on-delete** — Deleting any task, tag, project, or status shows an 8-second undo toast; no confirm dialogs anywhere
- **Mobile responsive** — Hamburger drawer nav for small screens; iOS viewport and auto-zoom fixes; touch-optimised inputs
- **Change password** — Any user can change their own password from the sidebar footer
- **Admin panel** — Manage users and tags
- **Keyboard navigation** — Full focus-visible rings; Escape closes modals; Enter/Ctrl+Enter shortcuts throughout

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | FastAPI, SQLAlchemy 2, SQLite |
| Auth | JWT (python-jose), bcrypt |
| AI | Any OpenAI-compatible API (LiteLLM, NVIDIA NIM, OpenAI, etc.) |
| Doc extraction | pdfplumber (PDF), python-docx (DOCX), OpenAI Vision (images) |
| Frontend | Vanilla JS, CSS custom properties (OKLCH) — no build step |
| Infra | Docker Compose, Nginx reverse proxy, SSL |

## Quick Start

### Prerequisites

- Docker + Docker Compose
- An OpenAI-compatible API endpoint and key

### 1. Configure environment

```bash
cp .env.example .env
```

`.env` variables:

```
ADMIN_PASSWORD=your-admin-password
JWT_SECRET_KEY=your-jwt-secret

# AI — point at any OpenAI-compatible endpoint
OPENAI_API_KEY=your-api-key
OPENAI_BASE_URL=http://your-litellm-host:4000
OPENAI_MODEL=gpt-4o
```

### 2. Start

```bash
./docker.sh start
```

Open `http://localhost:8080`. Login: `admin` / value of `ADMIN_PASSWORD`.

> **Password changes:** Update `ADMIN_PASSWORD` in `.env` and run `./docker.sh rebuild` — the password is synced on every startup.

### 3. Other commands

```bash
./docker.sh rebuild   # rebuild image and restart (required for Python/dependency changes)
./docker.sh stop      # stop containers
./docker.sh logs      # follow app logs
```

Static file changes (JS/CSS/HTML) can be hot-copied without a rebuild:

```bash
docker cp static/app.js mytask-mytask-1:/app/static/app.js
docker cp static/style.css mytask-mytask-1:/app/static/style.css
docker cp static/index.html mytask-mytask-1:/app/static/index.html
```

## Project Structure

```
├── main.py              # FastAPI app, startup migration, UPLOAD_DIR creation
├── models.py            # SQLAlchemy models (User, Task, Project, Tag, KBDocument, ...)
├── database.py          # Engine + session setup
├── auth.py              # JWT helpers, password hashing
├── seed.py              # Seeds admin user on startup (reads ADMIN_PASSWORD from env)
├── routers/
│   ├── auth.py          # POST /api/auth/login, GET /api/auth/me, PUT /api/auth/password
│   ├── tasks.py         # CRUD /api/tasks; POST /api/tasks/{id}/ai-action
│   ├── tags.py          # CRUD /api/tags
│   ├── dashboard.py     # GET /api/dashboard — counts + sparkline + activity + AI briefing
│   ├── projects.py      # CRUD /api/projects + /api/statuses
│   ├── users.py         # Admin user management
│   ├── chat.py          # POST /api/chat — SSE streaming AI chat + KB context
│   └── kb.py            # POST/GET/DELETE /api/kb — document upload and management
├── kb/
│   └── extract.py       # Text extraction: txt/md/pdf/docx/jpg/png
├── ai/
│   └── agent.py         # Tool-calling AI agent loop
├── data/
│   ├── mytask.db        # SQLite database (persisted, bind-mounted)
│   └── uploads/         # KB uploaded files (persisted, bind-mounted)
├── static/
│   ├── index.html       # Main app shell
│   ├── app.js           # All frontend logic (~3500 lines)
│   ├── style.css        # CSS with OKLCH custom properties; body.light/forest/amber/midnight theme overrides
│   ├── admin.html       # Admin panel
│   └── admin.js         # Admin panel logic
├── .impeccable/
│   └── critique/        # UX critique snapshots (impeccable tool)
└── tests/               # pytest test suite (107 tests)
```

## API Overview

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/login` | — | Login, returns JWT |
| GET | `/api/auth/me` | user | Current user info |
| PUT | `/api/auth/password` | user | Change own password (requires current password) |
| GET | `/api/info` | — | Active model name |
| GET | `/api/tasks` | user | List root tasks (`?parent_id=N`, `?tag_id=N`) |
| POST | `/api/tasks` | user | Create task |
| PUT | `/api/tasks/{id}` | user | Update task (supports null to clear fields) |
| DELETE | `/api/tasks/{id}` | user | Delete task (cascades) |
| POST | `/api/tasks/{id}/ai-action` | user | AI action: meeting_prep / draft_email / summarise / action_items / custom |
| GET | `/api/dashboard` | user | Counts + sparkline + activity + AI briefing |
| GET/POST/DELETE | `/api/tags` | user | Tag management |
| GET/POST/DELETE | `/api/projects` | user | Project management |
| GET/POST/DELETE | `/api/statuses` | user | Project status management |
| POST | `/api/chat` | user | SSE streaming AI chat |
| POST | `/api/kb` | user | Upload document (multipart; optional `task_id`) |
| GET | `/api/kb` | user | List docs (`?global=true` or `?task_id=N`) |
| DELETE | `/api/kb/{id}` | user | Delete document |

## Running Tests

```bash
python3 -m pytest -v
```

107 tests covering auth, tasks, subtasks, tags, dashboard, projects, users, AI agent tools, and KB endpoints.

## Data Persistence

Both the database and uploaded files live under `./data/`, which is bind-mounted into the container:

```
./data/mytask.db     ← database
./data/uploads/      ← KB uploaded files
```

Both survive `./docker.sh rebuild`.
