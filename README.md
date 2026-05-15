# MyTask — Personal AI Task Manager `v1.0`

A personal task manager with an integrated AI assistant, built on FastAPI, SQLite, and vanilla JavaScript.

## Features

- **Sidebar navigation** — Fixed left sidebar (Tasks, Dashboard, Projects, Tags, Admin); floating 💬 chat widget expands from the bottom-right corner
- **Task management** — Create, update, and delete tasks with priorities, due dates, projects, and notes
- **Sub-tasks** — Nested checklist steps under any task; toggle done/todo inline
- **Colour-coded tags** — Admin-defined tags assignable to tasks; filter the task list by tag
- **AI daily briefing** — Dashboard panel showing overdue/today/this-week counts with an AI-generated focus note
- **AI chat assistant** — Conversational AI that can create tasks, sub-tasks, assign tags, and update status via tool calls
- **Projects** — Group tasks under named projects
- **Inline task editing** — ✏ Edit button on expanded task cards to update title, due date, priority, and notes without leaving the page
- **Inline step editing** — ✏ pencil button on each subtask row to edit title, due date, and notes in-place
- **Admin panel** — Manage users and tags (scrollable, accessible on any screen height)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | FastAPI, SQLAlchemy 2, SQLite |
| Auth | JWT (python-jose), bcrypt |
| AI | Any OpenAI-compatible API (LiteLLM, NVIDIA NIM, OpenAI, etc.) |
| Frontend | Vanilla JS, CSS custom properties — no build step |
| Infra | Docker Compose, Nginx reverse proxy, SSL |

## Quick Start

### Prerequisites

- Docker + Docker Compose
- An OpenAI-compatible API endpoint and key (LiteLLM proxy, NVIDIA NIM, OpenAI, etc.)

### 1. Configure environment

Copy the example and fill in your values:

```bash
cp .env.example .env
```

`.env` variables:

```
JWT_SECRET_KEY=your-jwt-secret
ADMIN_PASSWORD=your-admin-password

# AI — point at any OpenAI-compatible endpoint
OPENAI_API_KEY=your-api-key
OPENAI_BASE_URL=http://your-litellm-host:4000   # or https://api.openai.com/v1, etc.
OPENAI_MODEL=gpt-5-mini                          # any model name exposed by the endpoint
```

### 2. Start

```bash
./docker.sh start
```

Open `http://localhost:8080`. Default admin login: `admin` / value of `ADMIN_PASSWORD`.

### 3. Other commands

```bash
./docker.sh rebuild   # rebuild image and restart
./docker.sh stop      # stop containers
./docker.sh logs      # follow app logs
```

## Project Structure

```
├── main.py              # FastAPI app, startup migration
├── models.py            # SQLAlchemy models (User, Task, Project, Tag, task_tags)
├── database.py          # Engine + session setup
├── auth.py              # JWT helpers, password hashing
├── seed.py              # Seeds the admin user on first start
├── routers/
│   ├── auth.py          # POST /api/auth/login, GET /api/auth/me
│   ├── tasks.py         # CRUD /api/tasks — subtasks, tags, filtering
│   ├── tags.py          # CRUD /api/tags (admin create/delete)
│   ├── dashboard.py     # GET /api/dashboard — counts + AI briefing
│   ├── projects.py      # CRUD /api/projects
│   ├── users.py         # Admin user management
│   └── chat.py          # POST /api/chat — SSE streaming AI chat
├── ai/
│   └── agent.py         # Tool-calling AI agent loop
├── static/
│   ├── index.html       # Main app shell
│   ├── app.js           # All frontend logic
│   ├── style.css        # Dark-mode CSS with custom properties
│   ├── admin.html       # Admin panel
│   └── admin.js         # Admin panel logic
└── tests/               # pytest test suite
```

## API Overview

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/login` | — | Login, returns JWT |
| GET | `/api/auth/me` | user | Current user info |
| GET | `/api/tasks` | user | List root tasks (filter: `?parent_id=N`, `?tag_id=N`) |
| POST | `/api/tasks` | user | Create task (supports `parent_id`, `tag_ids`) |
| PUT | `/api/tasks/{id}` | user | Update task |
| DELETE | `/api/tasks/{id}` | user | Delete task (cascades to children) |
| POST | `/api/tasks/{id}/tags/{tag_id}` | user | Assign tag |
| DELETE | `/api/tasks/{id}/tags/{tag_id}` | user | Remove tag |
| GET | `/api/dashboard` | user | Overdue/today/week counts + AI briefing |
| GET | `/api/tags` | user | List all tags |
| POST | `/api/tags` | user | Create tag |
| DELETE | `/api/tags/{id}` | user | Delete tag |
| POST | `/api/chat` | user | SSE streaming AI chat |
| GET | `/api/info` | — | Active model name (used by UI to label the chat panel) |

## Running Tests

```bash
cd /u01/project/mytask
python3 -m pytest -v
```

75 tests covering auth, tasks, subtasks, tags, dashboard, projects, users, and AI agent tools.
