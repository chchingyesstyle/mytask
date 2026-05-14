# MyTask — Personal AI Task Manager: Design Spec

**Date:** 2026-05-14  
**Author:** IT Manager (admin)  
**Status:** Approved

---

## Overview

A personal AI-powered task manager web application for an IT manager. The primary interface is a split-view: a task list panel on the left and an AI chatbot panel on the right. All task operations (create, update, delete, prioritize, summarize) can be performed through natural language chat. The app supports multi-user login with an admin role that can manage other users.

---

## Stack

| Layer | Choice |
|---|---|
| Backend | Python 3.11 + FastAPI |
| Frontend | Vanilla JS + CSS (no build step), served as static files by FastAPI |
| Database | SQLite via SQLAlchemy |
| AI | NVIDIA API — `deepseek-ai/deepseek-v4-flash` |
| Auth | JWT (python-jose), bcrypt password hashing |
| Deployment | Docker Compose + `docker.sh` management script |

---

## Architecture

A single FastAPI process serves both the static frontend and all API routes. No separate frontend server.

```
Browser (Split View UI)
  ├── Task Panel   →  REST  /api/tasks
  ├── Chat Panel   →  POST  /api/chat  (streaming SSE)
  ├── Auth         →  POST  /api/auth/login
  └── Admin        →  REST  /api/users  (admin only)

FastAPI App (Docker)
  ├── SQLite DB (volume-mounted, persists across rebuilds)
  └── NVIDIA API  (deepseek-ai/deepseek-v4-flash)
```

**AI tool call flow:** On each chat message, the backend fetches the user's current tasks, injects them into the system prompt, and exposes 4 tools to the AI. When the AI calls a tool, the server executes it against SQLite and streams a confirmation back to the browser. The task panel refreshes automatically after any tool call.

---

## Data Model

### users
| Field | Type | Notes |
|---|---|---|
| id | INTEGER PK | auto-increment |
| username | TEXT UNIQUE | login name |
| password_hash | TEXT | bcrypt |
| role | TEXT | `admin` or `user` |
| created_at | DATETIME | |

### projects
| Field | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| name | TEXT | e.g. "Server Infra" |
| owner_id | INTEGER FK | references users |
| created_at | DATETIME | |

### tasks
| Field | Type | Notes |
|---|---|---|
| id | INTEGER PK | |
| title | TEXT | required |
| status | TEXT | `todo`, `in-progress`, `done` |
| priority | TEXT | `high`, `medium`, `low` |
| due_date | DATE | nullable |
| project_id | INTEGER FK | nullable, references projects |
| notes | TEXT | nullable, free-form |
| owner_id | INTEGER FK | references users |
| created_at | DATETIME | |
| updated_at | DATETIME | auto-updated |

---

## AI Agent

**Model:** `deepseek-ai/deepseek-v4-flash` via `https://integrate.api.nvidia.com/v1`

**Tools exposed to the AI:**

| Tool | Description |
|---|---|
| `list_tasks` | Query tasks — filters: status, priority, project, due_date range |
| `create_task` | Create a new task with all fields |
| `update_task` | Update any field(s) of an existing task by id or title |
| `delete_task` | Delete a task by id or title |

**System prompt context:** Each request includes the user's full task list (id, title, status, priority, due_date, project) so the AI can reference tasks by name.

**Streaming:** The `/api/chat` endpoint uses Server-Sent Events (SSE) to stream tokens to the browser as they arrive from NVIDIA API.

---

## API Endpoints

### Auth
- `POST /api/auth/login` — returns JWT token
- `GET /api/auth/me` — returns current user info

### Tasks
- `GET /api/tasks` — list tasks; regular users see only their own, admin sees all users' tasks (optional filters: status, priority, project_id, user_id)
- `POST /api/tasks` — create task (assigned to current user)
- `PUT /api/tasks/{id}` — update task (owner or admin only)
- `DELETE /api/tasks/{id}` — delete task (owner or admin only)

### Projects
- `GET /api/projects` — list projects; regular users see only their own, admin sees all
- `POST /api/projects` — create project (assigned to current user)
- `DELETE /api/projects/{id}` — delete project (owner or admin only)

### Chat
- `POST /api/chat` — send message, returns SSE stream of AI response + tool call results

### Users (admin only)
- `GET /api/users` — list all users
- `POST /api/users` — create user
- `DELETE /api/users/{id}` — delete user

---

## Frontend (Vanilla JS)

Single `index.html` with two panels:

**Left — Task Panel**
- Filter bar: All / Today / Overdue / by Project
- Tasks grouped by status with color-coded priority borders
- Click task to expand and edit inline
- "+ New Task" button (also available via chat)
- Auto-refreshes after any AI tool call

**Right — Chat Panel**
- Message history with AI and user bubbles
- Input field at the bottom
- Streaming token display as AI responds
- Green indicator when AI is connected

**Top Nav**
- App name + current user workspace label
- Username display + overdue task count badge
- Logout button

**Admin Page (`/admin`)**
- Accessible only to admin role
- Table of users with create/delete actions

**Mobile:** Responsive CSS — on small screens, panels stack vertically (chat on top, tasks below).

---

## Auth & Security

- Passwords hashed with bcrypt (never stored plain)
- JWT tokens expire after 24 hours
- All `/api/*` routes (except `/api/auth/login`) require valid JWT
- `/api/users` routes require `role = admin`
- Users can only read/write their own tasks (enforced server-side by `owner_id`)
- NVIDIA API key stored in `.env`, never exposed to frontend

---

## User Management

- Admin user `admin` / `yesasia` seeded on first startup (via `seed.py` run inside Docker entrypoint)
- Admin can create users with username + password via `/admin` page
- Admin can delete users (their tasks are also deleted)
- Regular users cannot access `/admin` or `/api/users`

---

## Project Structure

```
mytask/
├── main.py                  # FastAPI app, mounts routers and static files
├── database.py              # SQLAlchemy engine, session, Base
├── models.py                # ORM models: User, Project, Task
├── auth.py                  # JWT creation/verification, password hashing
├── seed.py                  # Seeds admin user (called at container startup)
├── routers/
│   ├── tasks.py             # Task CRUD endpoints
│   ├── projects.py          # Project CRUD endpoints
│   ├── users.py             # User management endpoints (admin only)
│   └── chat.py              # AI chat + tool call handler (SSE streaming)
├── ai/
│   └── agent.py             # NVIDIA API client, tool definitions, tool executor
├── static/
│   ├── index.html           # Split-view UI shell
│   ├── app.js               # Task panel + chat panel logic
│   └── style.css            # Dark theme, responsive layout
├── requirements.txt
├── Dockerfile
├── docker-compose.yml
├── docker.sh                # start | stop | restart | rebuild | status | logs
└── .env                     # NVIDIA_API_KEY, MODEL_NAME, JWT_SECRET_KEY
```

---

## Docker Setup

**`docker-compose.yml`** runs a single service (`mytask`) built from the local `Dockerfile`. The SQLite database file is volume-mounted at `./data/mytask.db` so it persists across image rebuilds.

**`docker.sh` commands:**

| Command | Action |
|---|---|
| `./docker.sh start` | Start containers in detached mode |
| `./docker.sh stop` | Stop and remove containers |
| `./docker.sh restart` | Stop then start (no rebuild) |
| `./docker.sh rebuild` | Rebuild image and restart (use after code changes) |
| `./docker.sh status` | Show running container status |
| `./docker.sh logs` | Tail live container logs |

**`.env` file (user must populate before first run):**
```
NVIDIA_API_KEY=your_key_here
MODEL_NAME=deepseek-ai/deepseek-v4-flash
JWT_SECRET_KEY=change_this_to_a_random_secret
```

---

## Out of Scope

- Email/notification reminders
- File attachments on tasks
- Task comments/history log
- OAuth / SSO login
- Recurring tasks
