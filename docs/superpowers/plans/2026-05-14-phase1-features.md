# Phase 1 Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add nested sub-tasks, predefined colour-coded tags, and an AI daily briefing dashboard panel to MyTask.

**Architecture:** Self-referential FK on Task for sub-tasks; new Tag + TaskTag tables for many-to-many tagging; dedicated `/api/dashboard` endpoint with a non-streaming AI briefing call. All new features integrate into the existing FastAPI/SQLAlchemy/vanilla-JS stack without structural changes to auth, projects, or chat.

**Tech Stack:** FastAPI, SQLAlchemy 2, SQLite, AsyncOpenAI, vanilla JS (no build step)

---

## File Map

| File | Change |
|------|--------|
| `models.py` | Add `parent_id`, `Tag`, `task_tags`, relationships |
| `routers/tags.py` | New — tag CRUD |
| `routers/dashboard.py` | New — dashboard endpoint |
| `routers/tasks.py` | Add parent_id, tag_ids, subtask fields, tag assignment endpoints, GET by ID |
| `ai/agent.py` | Add 3 new tools + update system prompt |
| `main.py` | Register new routers |
| `static/index.html` | Dashboard panel HTML |
| `static/admin.html` | Tag management section |
| `static/style.css` | Dashboard, tag pill, subtask styles |
| `static/app.js` | Dashboard, tag filters/pills, subtask checklist, tag picker |
| `static/admin.js` | Tag CRUD functions |
| `tests/test_tags.py` | New — tag CRUD + assignment tests |
| `tests/test_subtasks.py` | New — sub-task creation, cascade, counts |
| `tests/test_dashboard.py` | New — dashboard counts + AI briefing |
| `tests/test_agent.py` | Extended — covers 3 new tools |

---

## Task 1: Data Model — parent_id, Tag, task_tags

**Files:**
- Modify: `models.py`

- [ ] **Step 1: Update models.py**

Replace the entire file content:

```python
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Date, ForeignKey, Text, Table
from sqlalchemy.orm import relationship, backref
from database import Base

task_tags = Table(
    "task_tags",
    Base.metadata,
    Column("task_id", Integer, ForeignKey("tasks.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", Integer, ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    role = Column(String, default="user")
    created_at = Column(DateTime, default=datetime.utcnow)
    tasks = relationship("Task", back_populates="owner", cascade="all, delete-orphan")
    projects = relationship("Project", back_populates="owner", cascade="all, delete-orphan")

class Project(Base):
    __tablename__ = "projects"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    owner = relationship("User", back_populates="projects")
    tasks = relationship("Task", back_populates="project")

class Tag(Base):
    __tablename__ = "tags"
    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True, nullable=False)
    color = Column(String(7), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class Task(Base):
    __tablename__ = "tasks"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    status = Column(String, default="todo")
    priority = Column(String, default="medium")
    due_date = Column(Date, nullable=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    notes = Column(Text, nullable=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    parent_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    owner = relationship("User", back_populates="tasks")
    project = relationship("Project", back_populates="tasks")
    children = relationship(
        "Task",
        foreign_keys="[Task.parent_id]",
        backref=backref("parent", remote_side="[Task.id]"),
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    tags = relationship("Tag", secondary=task_tags, lazy="selectin")
```

- [ ] **Step 2: Verify existing tests still pass**

Run: `cd /u01/project/mytask && python -m pytest tests/test_tasks.py tests/test_auth.py tests/test_models.py -v`

Expected: all pass (new fields are backwards-compatible)

- [ ] **Step 3: Commit**

```bash
cd /u01/project/mytask
git add models.py
git commit -m "feat: add parent_id, Tag, task_tags to data model"
```

---

## Task 2: Tags Router + Tests

**Files:**
- Create: `routers/tags.py`
- Modify: `main.py`
- Create: `tests/test_tags.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/test_tags.py`:

```python
def test_admin_create_tag(admin_headers):
    client, headers = admin_headers
    resp = client.post("/api/tags", json={"name": "urgent", "color": "#e74c3c"}, headers=headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "urgent"
    assert data["color"] == "#e74c3c"
    assert "id" in data

def test_list_tags_any_user(admin_headers):
    client, headers = admin_headers
    client.post("/api/tags", json={"name": "server", "color": "#4a90d9"}, headers=headers)
    resp = client.get("/api/tags", headers=headers)
    assert resp.status_code == 200
    assert any(t["name"] == "server" for t in resp.json())

def test_non_admin_cannot_create_tag(client):
    from tests.conftest import TestingSessionLocal
    from auth import hash_password
    import models
    db = TestingSessionLocal()
    db.add(models.User(username="regular", password_hash=hash_password("pw"), role="user"))
    db.commit()
    db.close()
    token = client.post("/api/auth/login", json={"username": "regular", "password": "pw"}).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    resp = client.post("/api/tags", json={"name": "test", "color": "#ffffff"}, headers=headers)
    assert resp.status_code == 403

def test_admin_delete_tag(admin_headers):
    client, headers = admin_headers
    tag_id = client.post("/api/tags", json={"name": "todelete", "color": "#000000"}, headers=headers).json()["id"]
    del_resp = client.delete(f"/api/tags/{tag_id}", headers=headers)
    assert del_resp.status_code == 204
    tags = client.get("/api/tags", headers=headers).json()
    assert not any(t["id"] == tag_id for t in tags)

def test_tag_name_unique(admin_headers):
    client, headers = admin_headers
    client.post("/api/tags", json={"name": "dup", "color": "#fff"}, headers=headers)
    resp = client.post("/api/tags", json={"name": "dup", "color": "#000"}, headers=headers)
    assert resp.status_code == 409

def test_list_tags_requires_auth(seeded_client):
    resp = seeded_client.get("/api/tags")
    assert resp.status_code == 401
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd /u01/project/mytask && python -m pytest tests/test_tags.py -v`

Expected: `404 Not Found` errors (router doesn't exist yet)

- [ ] **Step 3: Create routers/tags.py**

```python
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from auth import get_current_user
import models

router = APIRouter(prefix="/api/tags", tags=["tags"])

class TagCreate(BaseModel):
    name: str
    color: str

def _tag_dict(tag: models.Tag) -> dict:
    return {"id": tag.id, "name": tag.name, "color": tag.color}

@router.get("")
def list_tags(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return [_tag_dict(t) for t in db.query(models.Tag).all()]

@router.post("", status_code=201)
def create_tag(
    req: TagCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    if db.query(models.Tag).filter(models.Tag.name == req.name).first():
        raise HTTPException(status_code=409, detail="Tag name already exists")
    tag = models.Tag(name=req.name, color=req.color)
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return _tag_dict(tag)

@router.delete("/{tag_id}", status_code=204)
def delete_tag(
    tag_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    tag = db.query(models.Tag).filter(models.Tag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    db.delete(tag)
    db.commit()
    return Response(status_code=204)
```

- [ ] **Step 4: Register router in main.py**

Add to `main.py` after the existing router imports and `include_router` calls:

```python
from routers import tags as tags_router
# ...
app.include_router(tags_router.router)
```

Full updated `main.py`:

```python
import os
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from database import engine, Base
from seed import seed_admin
from routers import auth as auth_router
from routers import tasks as tasks_router
from routers import projects as projects_router
from routers import users as users_router
from routers import chat as chat_router
from routers import tags as tags_router
from routers import dashboard as dashboard_router

os.makedirs("data", exist_ok=True)
os.makedirs("static", exist_ok=True)

Base.metadata.create_all(bind=engine)

app = FastAPI(title="MyTask")

app.include_router(auth_router.router)
app.include_router(tasks_router.router)
app.include_router(projects_router.router)
app.include_router(users_router.router)
app.include_router(chat_router.router)
app.include_router(tags_router.router)
app.include_router(dashboard_router.router)

@app.on_event("startup")
def startup():
    seed_admin()

app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
def root():
    return FileResponse("static/index.html")

@app.get("/admin")
def admin_page():
    return FileResponse("static/admin.html")
```

Note: `dashboard_router` import will fail until Task 3 creates the file. Either create a stub first or defer this import until Task 3. For now, add only `tags_router` and add `dashboard_router` in Task 3.

Actual `main.py` after this task (without dashboard_router):

```python
import os
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from database import engine, Base
from seed import seed_admin
from routers import auth as auth_router
from routers import tasks as tasks_router
from routers import projects as projects_router
from routers import users as users_router
from routers import chat as chat_router
from routers import tags as tags_router

os.makedirs("data", exist_ok=True)
os.makedirs("static", exist_ok=True)

Base.metadata.create_all(bind=engine)

app = FastAPI(title="MyTask")

app.include_router(auth_router.router)
app.include_router(tasks_router.router)
app.include_router(projects_router.router)
app.include_router(users_router.router)
app.include_router(chat_router.router)
app.include_router(tags_router.router)

@app.on_event("startup")
def startup():
    seed_admin()

app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
def root():
    return FileResponse("static/index.html")

@app.get("/admin")
def admin_page():
    return FileResponse("static/admin.html")
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /u01/project/mytask && python -m pytest tests/test_tags.py -v`

Expected: all 6 tests pass

- [ ] **Step 6: Commit**

```bash
cd /u01/project/mytask
git add routers/tags.py main.py tests/test_tags.py
git commit -m "feat: add tags router with admin CRUD and tests"
```

---

## Task 3: Dashboard Router + Tests

**Files:**
- Create: `routers/dashboard.py`
- Modify: `main.py`
- Create: `tests/test_dashboard.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/test_dashboard.py`:

```python
from unittest.mock import patch, AsyncMock

def test_dashboard_requires_auth(seeded_client):
    resp = seeded_client.get("/api/dashboard")
    assert resp.status_code == 401

def test_dashboard_counts_zero(admin_headers):
    client, headers = admin_headers
    with patch("routers.dashboard.client.chat.completions.create", new=AsyncMock(side_effect=Exception("skip"))):
        resp = client.get("/api/dashboard", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["overdue"] == 0
    assert data["due_today"] == 0
    assert data["due_week"] == 0
    assert data["ai_briefing"] is None

def test_dashboard_overdue_count(admin_headers):
    from datetime import date, timedelta
    client, headers = admin_headers
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    client.post("/api/tasks", json={"title": "Overdue Task", "due_date": yesterday, "status": "todo"}, headers=headers)
    with patch("routers.dashboard.client.chat.completions.create", new=AsyncMock(side_effect=Exception("skip"))):
        resp = client.get("/api/dashboard", headers=headers)
    assert resp.json()["overdue"] == 1

def test_dashboard_due_today_count(admin_headers):
    from datetime import date
    client, headers = admin_headers
    today = date.today().isoformat()
    client.post("/api/tasks", json={"title": "Today Task", "due_date": today}, headers=headers)
    with patch("routers.dashboard.client.chat.completions.create", new=AsyncMock(side_effect=Exception("skip"))):
        resp = client.get("/api/dashboard", headers=headers)
    assert resp.json()["due_today"] == 1

def test_dashboard_due_week_count(admin_headers):
    from datetime import date, timedelta
    client, headers = admin_headers
    in_3_days = (date.today() + timedelta(days=3)).isoformat()
    client.post("/api/tasks", json={"title": "Week Task", "due_date": in_3_days}, headers=headers)
    with patch("routers.dashboard.client.chat.completions.create", new=AsyncMock(side_effect=Exception("skip"))):
        resp = client.get("/api/dashboard", headers=headers)
    assert resp.json()["due_week"] == 1

def test_dashboard_done_tasks_excluded(admin_headers):
    from datetime import date, timedelta
    client, headers = admin_headers
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    client.post("/api/tasks", json={"title": "Done Overdue", "due_date": yesterday, "status": "done"}, headers=headers)
    with patch("routers.dashboard.client.chat.completions.create", new=AsyncMock(side_effect=Exception("skip"))):
        resp = client.get("/api/dashboard", headers=headers)
    assert resp.json()["overdue"] == 0

def test_dashboard_ai_briefing_present(admin_headers):
    client, headers = admin_headers
    mock_resp = AsyncMock()
    mock_resp.choices = [AsyncMock()]
    mock_resp.choices[0].message.content = "Focus on overdue tasks first."
    with patch("routers.dashboard.client.chat.completions.create", new=AsyncMock(return_value=mock_resp)):
        resp = client.get("/api/dashboard", headers=headers)
    assert resp.json()["ai_briefing"] == "Focus on overdue tasks first."

def test_dashboard_ai_failure_returns_null(admin_headers):
    client, headers = admin_headers
    with patch("routers.dashboard.client.chat.completions.create", new=AsyncMock(side_effect=Exception("API down"))):
        resp = client.get("/api/dashboard", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["ai_briefing"] is None
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd /u01/project/mytask && python -m pytest tests/test_dashboard.py -v`

Expected: errors (module `routers.dashboard` not found)

- [ ] **Step 3: Create routers/dashboard.py**

```python
from datetime import date, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from auth import get_current_user
from ai.agent import client, MODEL
import models

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

@router.get("")
async def dashboard(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    today = date.today()
    week_end = today + timedelta(days=7)

    base = db.query(models.Task).filter(
        models.Task.owner_id == current_user.id,
        models.Task.status != "done",
    )

    overdue_tasks = base.filter(models.Task.due_date < today).all()
    today_tasks = base.filter(models.Task.due_date == today).all()
    week_count = base.filter(
        models.Task.due_date > today,
        models.Task.due_date <= week_end,
    ).count()

    ai_briefing = None
    try:
        task_lines = ", ".join(
            f"'{t.title}' ({'overdue' if t.due_date < today else 'due today'})"
            for t in (overdue_tasks + today_tasks)[:5]
        )
        prompt = (
            f"IT manager's urgent tasks: {task_lines or 'none'}. "
            f"Stats: {len(overdue_tasks)} overdue, {len(today_tasks)} due today. "
            "In one sentence, what should they focus on first?"
        )
        resp = await client.chat.completions.create(
            model=MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=80,
            stream=False,
        )
        ai_briefing = resp.choices[0].message.content.strip()
    except Exception:
        pass

    return {
        "overdue": len(overdue_tasks),
        "due_today": len(today_tasks),
        "due_week": week_count,
        "ai_briefing": ai_briefing,
    }
```

- [ ] **Step 4: Register dashboard router in main.py**

Add to `main.py`:

```python
from routers import dashboard as dashboard_router
# ...
app.include_router(dashboard_router.router)
```

Full updated imports + include_router section:

```python
from routers import auth as auth_router
from routers import tasks as tasks_router
from routers import projects as projects_router
from routers import users as users_router
from routers import chat as chat_router
from routers import tags as tags_router
from routers import dashboard as dashboard_router
# ...
app.include_router(auth_router.router)
app.include_router(tasks_router.router)
app.include_router(projects_router.router)
app.include_router(users_router.router)
app.include_router(chat_router.router)
app.include_router(tags_router.router)
app.include_router(dashboard_router.router)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /u01/project/mytask && python -m pytest tests/test_dashboard.py -v`

Expected: all 8 tests pass

- [ ] **Step 6: Commit**

```bash
cd /u01/project/mytask
git add routers/dashboard.py main.py tests/test_dashboard.py
git commit -m "feat: add dashboard router with task counts and AI briefing"
```

---

## Task 4: Tasks Router Updates + Sub-task Tests

**Files:**
- Modify: `routers/tasks.py`
- Create: `tests/test_subtasks.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/test_subtasks.py`:

```python
def test_create_subtask(admin_headers):
    client, headers = admin_headers
    parent = client.post("/api/tasks", json={"title": "Parent Task"}, headers=headers).json()
    resp = client.post("/api/tasks", json={"title": "Sub Step", "parent_id": parent["id"]}, headers=headers)
    assert resp.status_code == 201
    assert resp.json()["parent_id"] == parent["id"]

def test_subtask_count_on_parent(admin_headers):
    client, headers = admin_headers
    parent = client.post("/api/tasks", json={"title": "Parent"}, headers=headers).json()
    client.post("/api/tasks", json={"title": "Child 1", "parent_id": parent["id"]}, headers=headers)
    client.post("/api/tasks", json={"title": "Child 2", "parent_id": parent["id"]}, headers=headers)
    client.put(f"/api/tasks/{parent['id']}", json={"status": "in-progress"}, headers=headers)
    tasks = client.get("/api/tasks", headers=headers).json()
    p = next(t for t in tasks if t["id"] == parent["id"])
    assert p["subtask_count"] == 2
    assert p["completed_subtasks"] == 0

def test_completed_subtasks_count(admin_headers):
    client, headers = admin_headers
    parent = client.post("/api/tasks", json={"title": "Parent"}, headers=headers).json()
    child = client.post("/api/tasks", json={"title": "Child", "parent_id": parent["id"]}, headers=headers).json()
    client.put(f"/api/tasks/{child['id']}", json={"status": "done"}, headers=headers)
    tasks = client.get("/api/tasks", headers=headers).json()
    p = next(t for t in tasks if t["id"] == parent["id"])
    assert p["completed_subtasks"] == 1

def test_root_tasks_only_in_default_list(admin_headers):
    client, headers = admin_headers
    parent = client.post("/api/tasks", json={"title": "Root"}, headers=headers).json()
    client.post("/api/tasks", json={"title": "Child", "parent_id": parent["id"]}, headers=headers)
    tasks = client.get("/api/tasks", headers=headers).json()
    assert all(t["parent_id"] is None for t in tasks)

def test_get_children_by_parent_id(admin_headers):
    client, headers = admin_headers
    parent = client.post("/api/tasks", json={"title": "Parent"}, headers=headers).json()
    child = client.post("/api/tasks", json={"title": "Child", "parent_id": parent["id"]}, headers=headers).json()
    resp = client.get(f"/api/tasks?parent_id={parent['id']}", headers=headers)
    data = resp.json()
    assert len(data) == 1
    assert data[0]["id"] == child["id"]

def test_delete_parent_cascades_to_children(admin_headers):
    client, headers = admin_headers
    parent = client.post("/api/tasks", json={"title": "Parent"}, headers=headers).json()
    child = client.post("/api/tasks", json={"title": "Child", "parent_id": parent["id"]}, headers=headers).json()
    client.delete(f"/api/tasks/{parent['id']}", headers=headers)
    children = client.get(f"/api/tasks?parent_id={parent['id']}", headers=headers).json()
    assert len(children) == 0

def test_get_task_by_id_includes_children(admin_headers):
    client, headers = admin_headers
    parent = client.post("/api/tasks", json={"title": "Parent"}, headers=headers).json()
    client.post("/api/tasks", json={"title": "Child", "parent_id": parent["id"]}, headers=headers)
    resp = client.get(f"/api/tasks/{parent['id']}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["children"]) == 1
    assert data["children"][0]["title"] == "Child"

def test_assign_tags_on_create(admin_headers):
    client, headers = admin_headers
    tag_id = client.post("/api/tags", json={"name": "infra", "color": "#4a90d9"}, headers=headers).json()["id"]
    resp = client.post("/api/tasks", json={"title": "Tagged Task", "tag_ids": [tag_id]}, headers=headers)
    assert resp.status_code == 201
    assert any(t["id"] == tag_id for t in resp.json()["tags"])

def test_replace_tags_on_update(admin_headers):
    client, headers = admin_headers
    tag1 = client.post("/api/tags", json={"name": "tag-a", "color": "#e74c3c"}, headers=headers).json()["id"]
    tag2 = client.post("/api/tags", json={"name": "tag-b", "color": "#2ecc71"}, headers=headers).json()["id"]
    task = client.post("/api/tasks", json={"title": "My Task", "tag_ids": [tag1]}, headers=headers).json()
    client.put(f"/api/tasks/{task['id']}", json={"tag_ids": [tag2]}, headers=headers)
    detail = client.get(f"/api/tasks/{task['id']}", headers=headers).json()
    tag_ids = [t["id"] for t in detail["tags"]]
    assert tag2 in tag_ids
    assert tag1 not in tag_ids

def test_add_remove_tag_endpoints(admin_headers):
    client, headers = admin_headers
    tag_id = client.post("/api/tags", json={"name": "net", "color": "#fff"}, headers=headers).json()["id"]
    task_id = client.post("/api/tasks", json={"title": "Net Task"}, headers=headers).json()["id"]
    # add
    resp = client.post(f"/api/tasks/{task_id}/tags/{tag_id}", headers=headers)
    assert resp.status_code == 200
    assert any(t["id"] == tag_id for t in resp.json()["tags"])
    # remove
    del_resp = client.delete(f"/api/tasks/{task_id}/tags/{tag_id}", headers=headers)
    assert del_resp.status_code == 204

def test_filter_tasks_by_tag(admin_headers):
    client, headers = admin_headers
    tag_id = client.post("/api/tags", json={"name": "filter-me", "color": "#fff"}, headers=headers).json()["id"]
    task_id = client.post("/api/tasks", json={"title": "Tagged"}, headers=headers).json()["id"]
    client.post(f"/api/tasks/{task_id}/tags/{tag_id}", headers=headers)
    client.post("/api/tasks", json={"title": "Untagged"}, headers=headers)
    resp = client.get(f"/api/tasks?tag_id={tag_id}", headers=headers)
    assert len(resp.json()) == 1
    assert resp.json()[0]["title"] == "Tagged"

def test_nested_depth_2(admin_headers):
    client, headers = admin_headers
    root = client.post("/api/tasks", json={"title": "Root"}, headers=headers).json()
    child = client.post("/api/tasks", json={"title": "Child", "parent_id": root["id"]}, headers=headers).json()
    client.post("/api/tasks", json={"title": "Grandchild", "parent_id": child["id"]}, headers=headers)
    children = client.get(f"/api/tasks?parent_id={root['id']}", headers=headers).json()
    assert children[0]["subtask_count"] == 1
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd /u01/project/mytask && python -m pytest tests/test_subtasks.py -v`

Expected: failures on parent_id, subtask_count, filter_tasks_by_tag

- [ ] **Step 3: Replace routers/tasks.py**

```python
from datetime import date, datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from auth import get_current_user
import models

router = APIRouter(prefix="/api/tasks", tags=["tasks"])

class TaskCreate(BaseModel):
    title: str
    status: str = "todo"
    priority: str = "medium"
    due_date: Optional[date] = None
    project_id: Optional[int] = None
    notes: Optional[str] = None
    parent_id: Optional[int] = None
    tag_ids: list[int] = []

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    due_date: Optional[date] = None
    project_id: Optional[int] = None
    notes: Optional[str] = None
    tag_ids: Optional[list[int]] = None

def task_to_dict(task: models.Task) -> dict:
    return {
        "id": task.id,
        "title": task.title,
        "status": task.status,
        "priority": task.priority,
        "due_date": task.due_date.isoformat() if task.due_date else None,
        "project_id": task.project_id,
        "project_name": task.project.name if task.project else None,
        "notes": task.notes,
        "owner_id": task.owner_id,
        "parent_id": task.parent_id,
        "created_at": task.created_at.isoformat(),
        "updated_at": task.updated_at.isoformat() if task.updated_at else None,
        "tags": [{"id": t.id, "name": t.name, "color": t.color} for t in task.tags],
        "subtask_count": len(task.children),
        "completed_subtasks": sum(1 for c in task.children if c.status == "done"),
    }

@router.get("")
def list_tasks(
    status: Optional[str] = None,
    priority: Optional[str] = None,
    project_id: Optional[int] = None,
    user_id: Optional[int] = None,
    parent_id: Optional[int] = None,
    tag_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    query = db.query(models.Task)
    if current_user.role != "admin":
        query = query.filter(models.Task.owner_id == current_user.id)
    elif user_id is not None:
        query = query.filter(models.Task.owner_id == user_id)
    # parent_id filter: None means root tasks only, int means children of that task
    if parent_id is None:
        query = query.filter(models.Task.parent_id == None)  # noqa: E711
    else:
        query = query.filter(models.Task.parent_id == parent_id)
    if status is not None:
        query = query.filter(models.Task.status == status)
    if priority is not None:
        query = query.filter(models.Task.priority == priority)
    if project_id is not None:
        query = query.filter(models.Task.project_id == project_id)
    if tag_id is not None:
        query = query.join(
            models.task_tags,
            models.task_tags.c.task_id == models.Task.id,
        ).filter(models.task_tags.c.tag_id == tag_id)
    return [task_to_dict(t) for t in query.all()]

@router.get("/{task_id}")
def get_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.owner_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    d = task_to_dict(task)
    d["children"] = [task_to_dict(c) for c in task.children]
    return d

@router.post("", status_code=201)
def create_task(
    req: TaskCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    task_data = req.model_dump(exclude={"tag_ids"})
    task = models.Task(**task_data, owner_id=current_user.id)
    db.add(task)
    db.flush()
    if req.tag_ids:
        task.tags = db.query(models.Tag).filter(models.Tag.id.in_(req.tag_ids)).all()
    db.commit()
    db.refresh(task)
    return task_to_dict(task)

@router.put("/{task_id}")
def update_task(
    task_id: int,
    req: TaskUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.owner_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    for field, value in req.model_dump(exclude_none=True, exclude={"tag_ids"}).items():
        setattr(task, field, value)
    if req.tag_ids is not None:
        task.tags = db.query(models.Tag).filter(models.Tag.id.in_(req.tag_ids)).all()
    task.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(task)
    return task_to_dict(task)

@router.delete("/{task_id}", status_code=204)
def delete_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.owner_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    db.delete(task)
    db.commit()
    return Response(status_code=204)

@router.post("/{task_id}/tags/{tag_id}")
def add_tag_to_task(
    task_id: int,
    tag_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.owner_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    tag = db.query(models.Tag).filter(models.Tag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    if tag not in task.tags:
        task.tags.append(tag)
        db.commit()
        db.refresh(task)
    return task_to_dict(task)

@router.delete("/{task_id}/tags/{tag_id}", status_code=204)
def remove_tag_from_task(
    task_id: int,
    tag_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.owner_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    task.tags = [t for t in task.tags if t.id != tag_id]
    db.commit()
    return Response(status_code=204)
```

- [ ] **Step 4: Run all tests**

Run: `cd /u01/project/mytask && python -m pytest tests/test_subtasks.py tests/test_tasks.py tests/test_tags.py -v`

Expected: all pass. Note: `test_list_tasks_empty` and `test_list_tasks_returns_own` still pass because created tasks have no parent_id (they are root tasks by default).

- [ ] **Step 5: Commit**

```bash
cd /u01/project/mytask
git add routers/tasks.py tests/test_subtasks.py
git commit -m "feat: tasks router — parent_id, tag support, subtask counts, GET by ID"
```

---

## Task 5: AI Agent New Tools

**Files:**
- Modify: `ai/agent.py`
- Modify: `tests/test_agent.py`

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_agent.py`:

```python
def test_create_subtask_tool(db_session):
    from ai.agent import execute_tool
    from models import User, Task
    from auth import hash_password
    user = User(username="u_sub", password_hash=hash_password("p"), role="user")
    db_session.add(user)
    db_session.commit()
    parent = Task(title="Parent Task", status="todo", priority="high", owner_id=user.id)
    db_session.add(parent)
    db_session.commit()

    result = execute_tool("create_subtask", {"parent_id": parent.id, "title": "Step 1"}, db_session, user.id)
    assert "Step 1" in result

    child = db_session.query(Task).filter(Task.parent_id == parent.id).first()
    assert child is not None
    assert child.title == "Step 1"
    assert child.priority == "high"  # inherits parent priority

def test_create_subtask_tool_parent_not_found(db_session):
    from ai.agent import execute_tool
    from models import User
    from auth import hash_password
    user = User(username="u_nosub", password_hash=hash_password("p"), role="user")
    db_session.add(user)
    db_session.commit()
    result = execute_tool("create_subtask", {"parent_id": 9999, "title": "Orphan"}, db_session, user.id)
    assert "not found" in result.lower()

def test_add_tag_to_task_tool(db_session):
    from ai.agent import execute_tool
    from models import User, Task, Tag
    from auth import hash_password
    user = User(username="u_tag", password_hash=hash_password("p"), role="user")
    db_session.add(user)
    db_session.commit()
    task = Task(title="Tag Me", status="todo", priority="medium", owner_id=user.id)
    tag = Tag(name="urgent", color="#e74c3c")
    db_session.add_all([task, tag])
    db_session.commit()

    result = execute_tool("add_tag_to_task", {"task_id": task.id, "tag_name": "urgent"}, db_session, user.id)
    assert "urgent" in result.lower()

    db_session.refresh(task)
    assert any(t.name == "urgent" for t in task.tags)

def test_add_tag_to_task_tool_tag_not_found(db_session):
    from ai.agent import execute_tool
    from models import User, Task
    from auth import hash_password
    user = User(username="u_tagmiss", password_hash=hash_password("p"), role="user")
    db_session.add(user)
    db_session.commit()
    task = Task(title="No Tag", status="todo", priority="medium", owner_id=user.id)
    db_session.add(task)
    db_session.commit()
    result = execute_tool("add_tag_to_task", {"task_id": task.id, "tag_name": "nonexistent"}, db_session, user.id)
    assert "not found" in result.lower()

def test_remove_tag_from_task_tool(db_session):
    from ai.agent import execute_tool
    from models import User, Task, Tag
    from auth import hash_password
    user = User(username="u_rmtag", password_hash=hash_password("p"), role="user")
    db_session.add(user)
    db_session.commit()
    task = Task(title="Remove Tag", status="todo", priority="medium", owner_id=user.id)
    tag = Tag(name="server", color="#4a90d9")
    db_session.add_all([task, tag])
    db_session.commit()
    task.tags.append(tag)
    db_session.commit()

    result = execute_tool("remove_tag_from_task", {"task_id": task.id, "tag_name": "server"}, db_session, user.id)
    assert isinstance(result, str)
    db_session.refresh(task)
    assert not any(t.name == "server" for t in task.tags)

def test_remove_tag_silently_succeeds_if_not_assigned(db_session):
    from ai.agent import execute_tool
    from models import User, Task, Tag
    from auth import hash_password
    user = User(username="u_rmtag2", password_hash=hash_password("p"), role="user")
    db_session.add(user)
    db_session.commit()
    task = Task(title="Clean Task", status="todo", priority="medium", owner_id=user.id)
    tag = Tag(name="review", color="#2ecc71")
    db_session.add_all([task, tag])
    db_session.commit()
    # tag not assigned to task — should still succeed
    result = execute_tool("remove_tag_from_task", {"task_id": task.id, "tag_name": "review"}, db_session, user.id)
    assert isinstance(result, str)
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd /u01/project/mytask && python -m pytest tests/test_agent.py -v -k "subtask or tag"`

Expected: `Unknown tool: create_subtask` / `Unknown tool: add_tag_to_task`

- [ ] **Step 3: Add the 3 new tools to TOOLS list in ai/agent.py**

After the existing 4 tool dicts in `TOOLS`, append:

```python
    {
        "type": "function",
        "function": {
            "name": "create_subtask",
            "description": "Create a sub-task under an existing task",
            "parameters": {
                "type": "object",
                "properties": {
                    "parent_id": {"type": "integer", "description": "ID of the parent task"},
                    "title": {"type": "string"},
                    "priority": {"type": "string", "enum": ["high", "medium", "low"]},
                    "due_date": {"type": "string", "description": "ISO date YYYY-MM-DD, optional"},
                    "notes": {"type": "string"},
                },
                "required": ["parent_id", "title"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "add_tag_to_task",
            "description": "Add a predefined tag to a task by tag name (case-insensitive)",
            "parameters": {
                "type": "object",
                "properties": {
                    "task_id": {"type": "integer"},
                    "tag_name": {"type": "string"},
                },
                "required": ["task_id", "tag_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "remove_tag_from_task",
            "description": "Remove a tag from a task (succeeds silently if not assigned)",
            "parameters": {
                "type": "object",
                "properties": {
                    "task_id": {"type": "integer"},
                    "tag_name": {"type": "string"},
                },
                "required": ["task_id", "tag_name"],
            },
        },
    },
```

- [ ] **Step 4: Add execute_tool branches in ai/agent.py**

After the `delete_task` branch and before `return "Unknown tool: {}.".format(name)`, add:

```python
    if name == "create_subtask":
        parent = db.query(models.Task).filter(
            models.Task.id == args["parent_id"],
            models.Task.owner_id == owner_id,
        ).first()
        if not parent:
            return "Parent task {} not found.".format(args["parent_id"])
        due = None
        if args.get("due_date"):
            try:
                due = date.fromisoformat(args["due_date"])
            except ValueError:
                return "Invalid due_date '{}', expected YYYY-MM-DD.".format(args["due_date"])
        task = models.Task(
            title=args["title"],
            status="todo",
            priority=args.get("priority") or parent.priority,
            due_date=due,
            notes=args.get("notes"),
            owner_id=owner_id,
            parent_id=args["parent_id"],
        )
        db.add(task)
        db.commit()
        db.refresh(task)
        return "Created sub-task '{}' under task ID {}.".format(task.title, args["parent_id"])

    if name == "add_tag_to_task":
        tag = db.query(models.Tag).filter(
            models.Tag.name.ilike(args["tag_name"])
        ).first()
        if not tag:
            return "Tag '{}' not found. Ask an admin to create it first.".format(args["tag_name"])
        task = db.query(models.Task).filter(
            models.Task.id == args["task_id"],
            models.Task.owner_id == owner_id,
        ).first()
        if not task:
            return "Task {} not found.".format(args["task_id"])
        if tag not in task.tags:
            task.tags.append(tag)
            db.commit()
        return "Added tag '{}' to task '{}'.".format(tag.name, task.title)

    if name == "remove_tag_from_task":
        task = db.query(models.Task).filter(
            models.Task.id == args["task_id"],
            models.Task.owner_id == owner_id,
        ).first()
        if not task:
            return "Task {} not found.".format(args["task_id"])
        tag = db.query(models.Tag).filter(
            models.Tag.name.ilike(args["tag_name"])
        ).first()
        if tag and tag in task.tags:
            task.tags = [t for t in task.tags if t.id != tag.id]
            db.commit()
        return "Removed tag '{}' from task '{}'.".format(args["tag_name"], task.title)
```

- [ ] **Step 5: Add Tag import to ai/agent.py imports**

The existing `import models` at the top covers `models.Tag`, so no additional import is needed.

- [ ] **Step 6: Update build_system_prompt to include tag and subtask info**

In `build_system_prompt`, update the `task_lines` format string:

```python
def build_system_prompt(tasks: list[dict]) -> str:
    task_lines = "\n".join(
        "- ID:{} [{}] [{}] {}".format(t["id"], t["status"], t["priority"], t["title"])
        + (" (due {})".format(t["due_date"]) if t.get("due_date") else "")
        + (" [project: {}]".format(t["project_name"]) if t.get("project_name") else "")
        + (" [tags: {}]".format(", ".join(tg["name"] for tg in t.get("tags", []))) if t.get("tags") else "")
        + (" [{}/{} steps done]".format(t.get("completed_subtasks", 0), t.get("subtask_count", 0)) if t.get("subtask_count", 0) > 0 else "")
        for t in tasks
    )
    today = datetime.utcnow().strftime("%Y-%m-%d")
    return (
        "You are a helpful personal assistant for an IT manager. Today is {}.\n\n"
        "Current tasks:\n{}\n\n"
        "You can chat normally AND manage tasks using the provided tools when the user asks to "
        "create, update, delete, list tasks, create sub-tasks, or add/remove tags. "
        "For general conversation, just reply naturally. "
        "When you perform a task action, confirm it clearly. Be concise and friendly."
    ).format(today, task_lines or "(no tasks yet)")
```

- [ ] **Step 7: Run all agent tests**

Run: `cd /u01/project/mytask && python -m pytest tests/test_agent.py -v`

Expected: all tests pass (existing 5 + new 6 = 11 total)

- [ ] **Step 8: Run full test suite**

Run: `cd /u01/project/mytask && python -m pytest -v`

Expected: all pass

- [ ] **Step 9: Commit**

```bash
cd /u01/project/mytask
git add ai/agent.py tests/test_agent.py
git commit -m "feat: AI agent — create_subtask, add_tag_to_task, remove_tag_from_task tools"
```

---

## Task 6: Frontend HTML + CSS

**Files:**
- Modify: `static/index.html`
- Modify: `static/admin.html`
- Modify: `static/style.css`

- [ ] **Step 1: Add dashboard panel HTML to index.html**

In `static/index.html`, insert the dashboard panel inside `.task-panel`, before the `<div class="filter-bar"` line:

```html
      <!-- Left: Task Panel -->
      <div class="task-panel">
        <!-- Dashboard Panel -->
        <div id="dashboard-strip" class="dashboard-strip" style="display:none">
          <div class="dashboard-stats">
            <div class="dashboard-stat overdue">
              <div class="stat-num" id="stat-overdue-num">0</div>
              <div class="stat-label">Overdue</div>
            </div>
            <div class="dashboard-stat today">
              <div class="stat-num" id="stat-today-num">0</div>
              <div class="stat-label">Due Today</div>
            </div>
            <div class="dashboard-stat week">
              <div class="stat-num" id="stat-week-num">0</div>
              <div class="stat-label">This Week</div>
            </div>
          </div>
          <div id="dashboard-briefing" class="briefing-line" style="display:none">
            <span class="briefing-icon">🤖</span>
            <span id="briefing-text"></span>
          </div>
        </div>
        <div class="filter-bar" id="filter-bar">
```

Full updated `static/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MyTask</title>
  <link rel="stylesheet" href="/static/style.css">
</head>
<body>

  <!-- Login Screen -->
  <div id="login-screen" class="login-screen">
    <div class="login-box">
      <div class="login-logo">MyTask</div>
      <p class="login-sub">Personal AI Task Manager</p>
      <div id="login-error" class="error-msg" style="display:none"></div>
      <input id="login-username" type="text" placeholder="Username" autocomplete="username">
      <input id="login-password" type="password" placeholder="Password" autocomplete="current-password">
      <button id="login-btn">Login</button>
    </div>
  </div>

  <!-- Main App -->
  <div id="app" style="display:none">
    <nav class="topnav">
      <div class="nav-left">
        <span class="app-logo">MyTask</span>
        <span id="workspace-label" class="workspace-label"></span>
      </div>
      <div class="nav-right">
        <span id="overdue-badge" class="overdue-badge" style="display:none"></span>
        <span id="nav-username" class="nav-username"></span>
        <a id="admin-link" href="/admin" class="nav-link" style="display:none">Admin</a>
        <button id="logout-btn" class="nav-btn">Logout</button>
      </div>
    </nav>

    <div class="split-view">
      <!-- Left: Task Panel -->
      <div class="task-panel">

        <!-- Dashboard Panel -->
        <div id="dashboard-strip" class="dashboard-strip" style="display:none">
          <div class="dashboard-stats">
            <div class="dashboard-stat overdue">
              <div class="stat-num" id="stat-overdue-num">0</div>
              <div class="stat-label">Overdue</div>
            </div>
            <div class="dashboard-stat today">
              <div class="stat-num" id="stat-today-num">0</div>
              <div class="stat-label">Due Today</div>
            </div>
            <div class="dashboard-stat week">
              <div class="stat-num" id="stat-week-num">0</div>
              <div class="stat-label">This Week</div>
            </div>
          </div>
          <div id="dashboard-briefing" class="briefing-line" style="display:none">
            <span class="briefing-icon">🤖</span>
            <span id="briefing-text"></span>
          </div>
        </div>

        <div class="filter-bar" id="filter-bar">
          <button class="filter-btn active" id="filter-all">All</button>
          <button class="filter-btn" id="filter-today">Today</button>
          <button class="filter-btn" id="filter-overdue">Overdue</button>
          <span id="project-filters"></span>
          <span id="tag-filters"></span>
        </div>
        <div id="task-list" class="task-list"></div>
        <div class="task-panel-footer">
          <button class="new-task-btn" id="new-task-btn">+ New Task</button>
        </div>
      </div>

      <!-- Right: Chat Panel -->
      <div class="chat-panel">
        <div class="chat-header">
          <div class="ai-dot" id="ai-dot"></div>
          <span class="chat-title">AI Assistant</span>
          <span class="chat-model">Llama 3.3 70B - NVIDIA</span>
        </div>
        <div id="chat-messages" class="chat-messages"></div>
        <div class="chat-input-row">
          <input id="chat-input" type="text"
            placeholder="Tell me what to do... e.g. add task: review firewall logs, high priority">
          <button id="send-btn">Send</button>
        </div>
      </div>
    </div>
  </div>

  <!-- New Task Modal -->
  <div id="task-modal" class="modal-overlay" style="display:none">
    <div class="modal-box">
      <h3>New Task</h3>
      <input id="mt-title" type="text" placeholder="Task title (required)">
      <select id="mt-priority">
        <option value="high">High Priority</option>
        <option value="medium" selected>Medium Priority</option>
        <option value="low">Low Priority</option>
      </select>
      <input id="mt-due" type="date">
      <select id="mt-project">
        <option value="">No Project</option>
      </select>
      <textarea id="mt-notes" placeholder="Notes (optional)" rows="3"></textarea>
      <div class="modal-actions">
        <button id="modal-create-btn">Create Task</button>
        <button class="btn-secondary" id="modal-cancel-btn">Cancel</button>
      </div>
    </div>
  </div>

  <script src="/static/app.js"></script>
</body>
</html>
```

Key change from original: added `#dashboard-strip` before filter-bar, and added `<span id="tag-filters"></span>` in the filter bar.

- [ ] **Step 2: Add tag management section to admin.html**

In `static/admin.html`, inside `.admin-content`, insert before `<h2>User Management</h2>`:

```html
    <div class="admin-content">
      <h2>Tag Management</h2>
      <div class="create-user-form">
        <div id="tag-error" class="error-msg" style="display:none"></div>
        <div id="tag-list" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;min-height:32px"></div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <input id="new-tag-name" type="text" placeholder="Tag name" style="flex:1;min-width:120px">
          <input id="new-tag-color" type="color" value="#4a90d9" style="width:40px;padding:2px;cursor:pointer">
          <button id="create-tag-btn">Create Tag</button>
        </div>
      </div>

      <h2>User Management</h2>
```

Full updated `static/admin.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MyTask Admin</title>
  <link rel="stylesheet" href="/static/style.css">
</head>
<body>
  <div id="admin-app" style="display:none;flex-direction:column;min-height:100vh">
    <nav class="topnav">
      <div class="nav-left">
        <a href="/" class="app-logo">MyTask</a>
        <span class="workspace-label">Admin Panel</span>
      </div>
      <div class="nav-right">
        <span id="nav-username" class="nav-username"></span>
        <button id="logout-btn" class="nav-btn">Logout</button>
      </div>
    </nav>

    <div class="admin-content">
      <h2>Tag Management</h2>
      <div class="create-user-form">
        <div id="tag-error" class="error-msg" style="display:none"></div>
        <div id="tag-list" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;min-height:32px"></div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <input id="new-tag-name" type="text" placeholder="Tag name" style="flex:1;min-width:120px">
          <input id="new-tag-color" type="color" value="#4a90d9" style="width:40px;padding:2px;cursor:pointer">
          <button id="create-tag-btn">Create Tag</button>
        </div>
      </div>

      <h2>User Management</h2>

      <div class="create-user-form">
        <h3>Create New User</h3>
        <div id="create-error" class="error-msg" style="display:none"></div>
        <input id="new-username" type="text" placeholder="Username">
        <input id="new-password" type="password" placeholder="Password">
        <button id="create-user-btn">Create User</button>
      </div>

      <table class="user-table">
        <thead>
          <tr>
            <th>ID</th><th>Username</th><th>Role</th><th>Created</th><th>Action</th>
          </tr>
        </thead>
        <tbody id="user-tbody"></tbody>
      </table>
    </div>
  </div>

  <script src="/static/app.js"></script>
  <script src="/static/admin.js"></script>
</body>
</html>
```

- [ ] **Step 3: Add new CSS rules to style.css**

Append to the end of `static/style.css`:

```css
/* Dashboard strip */
.dashboard-strip {
  background: var(--bg-base); border-bottom: 1px solid var(--border);
  padding: 10px 12px; flex-shrink: 0;
}
.dashboard-stats { display: flex; gap: 6px; margin-bottom: 8px; }
.dashboard-stat {
  flex: 1; border-radius: var(--r); padding: 6px 8px; text-align: center;
  border: 1px solid transparent;
}
.dashboard-stat.overdue { background: #3d1515; border-color: var(--danger); }
.dashboard-stat.today   { background: #2a1e0f; border-color: var(--warning); }
.dashboard-stat.week    { background: #0f1f15; border-color: var(--success); }
.stat-num { font-size: 18px; font-weight: 700; }
.dashboard-stat.overdue .stat-num { color: var(--danger); }
.dashboard-stat.today   .stat-num { color: var(--warning); }
.dashboard-stat.week    .stat-num { color: var(--success); }
.stat-label { color: var(--text-dim); font-size: 10px; }
.briefing-line {
  background: var(--bg-card); border-radius: var(--r); padding: 6px 10px;
  font-size: 11px; color: var(--text-dim); line-height: 1.5;
  display: flex; gap: 6px; align-items: flex-start;
}
.briefing-icon { flex-shrink: 0; }

/* Tag pills on task cards */
.tag-pills { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 5px; align-items: center; }
.tag-pill { font-size: 9px; padding: 1px 7px; border-radius: 8px; border: 1px solid transparent; }

/* Subtask indicator on collapsed card */
.subtask-indicator { color: var(--text-dim); font-size: 10px; }

/* Subtask checklist in expanded task */
.subtask-section { margin-top: 8px; border-top: 1px solid var(--border); padding-top: 8px; }
.subtask-row { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; font-size: 11px; }
.subtask-row input[type="checkbox"] { cursor: pointer; flex-shrink: 0; accent-color: var(--success); }
.subtask-row.done > span:first-of-type { text-decoration: line-through; color: var(--text-dim); }
.subtask-nested-hint { color: var(--accent); font-size: 9px; cursor: pointer; flex-shrink: 0; }
.add-step-row { color: var(--accent); font-size: 11px; cursor: pointer; margin-top: 4px; padding: 2px 0; }
.add-step-row:hover { text-decoration: underline; }

/* Tag picker in expanded task */
.tag-picker-section { margin-top: 8px; border-top: 1px solid var(--border); padding-top: 8px; }
.tag-picker-label { color: var(--text-dim); font-size: 10px; text-transform: uppercase; letter-spacing: .4px; margin-bottom: 5px; }
.tag-picker-list { display: flex; gap: 5px; flex-wrap: wrap; }
.tag-picker-item {
  cursor: pointer; font-size: 10px; padding: 2px 9px; border-radius: 8px;
  border: 1px solid transparent; transition: opacity .15s;
}
.tag-picker-item.assigned { opacity: 1; }
.tag-picker-item:not(.assigned) { opacity: 0.4; }
.tag-picker-item:hover { opacity: 1; }
```

- [ ] **Step 4: Commit**

```bash
cd /u01/project/mytask
git add static/index.html static/admin.html static/style.css
git commit -m "feat: dashboard panel HTML, tag management in admin, new CSS"
```

---

## Task 7: Frontend JavaScript — app.js

**Files:**
- Modify: `static/app.js`

- [ ] **Step 1: Replace static/app.js with the full updated version**

```javascript
// State
let currentUser = null;
let allTasks = [];
let allProjects = [];
let allTags = [];
let chatHistory = [];
let activeFilter = 'all';
let expandedTaskId = null;

// Auth
function getToken() { return localStorage.getItem('mytask_token'); }
function authHeaders() {
  return { 'Authorization': 'Bearer ' + getToken(), 'Content-Type': 'application/json' };
}

async function login() {
  var username = document.getElementById('login-username').value.trim();
  var password = document.getElementById('login-password').value;
  var errEl = document.getElementById('login-error');
  errEl.style.display = 'none';
  try {
    var resp = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!resp.ok) {
      errEl.textContent = 'Invalid username or password.';
      errEl.style.display = 'block';
      return;
    }
    localStorage.setItem('mytask_token', (await resp.json()).access_token);
    await initApp();
  } catch (e) {
    errEl.textContent = 'Connection error.';
    errEl.style.display = 'block';
  }
}

function logout() {
  localStorage.removeItem('mytask_token');
  location.reload();
}

async function initApp() {
  if (!getToken()) { showLogin(); return; }
  try {
    var resp = await fetch('/api/auth/me', { headers: authHeaders() });
    if (!resp.ok) { showLogin(); return; }
    currentUser = await resp.json();
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    document.getElementById('nav-username').textContent = currentUser.username;
    document.getElementById('workspace-label').textContent = currentUser.username + "'s Workspace";
    if (currentUser.role === 'admin') {
      document.getElementById('admin-link').style.display = 'inline';
    }
    await loadProjects();
    await loadTags();
    await loadTasks();
    addAiMessage('Hello ' + currentUser.username + '! I am your AI assistant. Tell me what tasks you need help with.');
  } catch (e) { showLogin(); }
}

function showLogin() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
}

// Colour helper
function hexToRgba(hex, alpha) {
  var r = parseInt(hex.slice(1, 3), 16);
  var g = parseInt(hex.slice(3, 5), 16);
  var b = parseInt(hex.slice(5, 7), 16);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
}

// Projects
async function loadProjects() {
  var resp = await fetch('/api/projects', { headers: authHeaders() });
  if (!resp.ok) { if (resp.status === 401) showLogin(); return; }
  allProjects = await resp.json();
  renderProjectFilters();
  populateProjectDropdown();
}

function renderProjectFilters() {
  var container = document.getElementById('project-filters');
  while (container.firstChild) container.removeChild(container.firstChild);
  allProjects.forEach(function(p) {
    var btn = document.createElement('button');
    btn.className = 'filter-btn';
    btn.textContent = p.name;
    btn.addEventListener('click', function() { setFilter('project:' + p.id, btn); });
    container.appendChild(btn);
  });
}

function populateProjectDropdown() {
  var sel = document.getElementById('mt-project');
  if (!sel) return;
  while (sel.options.length > 1) sel.remove(1);
  allProjects.forEach(function(p) {
    var opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    sel.appendChild(opt);
  });
}

// Tags
async function loadTags() {
  var resp = await fetch('/api/tags', { headers: authHeaders() });
  if (!resp.ok) return;
  allTags = await resp.json();
  renderTagFilters();
}

function renderTagFilters() {
  var container = document.getElementById('tag-filters');
  while (container.firstChild) container.removeChild(container.firstChild);
  allTags.forEach(function(tag) {
    var btn = document.createElement('button');
    btn.className = 'filter-btn';
    btn.dataset.tagId = tag.id;
    btn.textContent = tag.name;
    btn.style.cssText = (
      'background:' + hexToRgba(tag.color, 0.15) + ';' +
      'color:' + tag.color + ';' +
      'border:1px solid ' + hexToRgba(tag.color, 0.3) + ';'
    );
    btn.addEventListener('click', function() { setFilter('tag:' + tag.id, btn); });
    container.appendChild(btn);
  });
}

// Tasks
async function loadTasks() {
  var resp = await fetch('/api/tasks', { headers: authHeaders() });
  if (!resp.ok) { if (resp.status === 401) showLogin(); return; }
  allTasks = await resp.json();
  renderTasks();
  updateOverdueBadge();
  loadDashboard();
}

// Dashboard
async function loadDashboard() {
  try {
    var resp = await fetch('/api/dashboard', { headers: authHeaders() });
    if (!resp.ok) return;
    var data = await resp.json();
    var strip = document.getElementById('dashboard-strip');
    if (data.overdue === 0 && data.due_today === 0 && data.due_week === 0) {
      strip.style.display = 'none';
      return;
    }
    strip.style.display = 'block';
    document.getElementById('stat-overdue-num').textContent = data.overdue;
    document.getElementById('stat-today-num').textContent = data.due_today;
    document.getElementById('stat-week-num').textContent = data.due_week;
    var briefingEl = document.getElementById('dashboard-briefing');
    if (data.ai_briefing) {
      document.getElementById('briefing-text').textContent = data.ai_briefing;
      briefingEl.style.display = 'flex';
    } else {
      briefingEl.style.display = 'none';
    }
  } catch (e) {}
}

// Filters
function setFilter(filter, btn) {
  activeFilter = filter;
  document.querySelectorAll('.filter-btn').forEach(function(b) { b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  renderTasks();
}

function filteredTasks() {
  var today = new Date().toISOString().split('T')[0];
  if (activeFilter === 'today') {
    return allTasks.filter(function(t) { return t.due_date === today; });
  }
  if (activeFilter === 'overdue') {
    return allTasks.filter(function(t) { return t.due_date && t.due_date < today && t.status !== 'done'; });
  }
  if (activeFilter.indexOf('project:') === 0) {
    var pid = parseInt(activeFilter.split(':')[1]);
    return allTasks.filter(function(t) { return t.project_id === pid; });
  }
  if (activeFilter.indexOf('tag:') === 0) {
    var tid = parseInt(activeFilter.split(':')[1]);
    return allTasks.filter(function(t) {
      return t.tags && t.tags.some(function(tag) { return tag.id === tid; });
    });
  }
  return allTasks;
}

// Task cards
function buildTaskCard(t) {
  var today = new Date().toISOString().split('T')[0];
  var card = document.createElement('div');
  card.className = 'task-card priority-' + t.priority + ' status-' + t.status;
  card.id = 'task-card-' + t.id;

  var top = document.createElement('div');
  top.className = 'task-card-top';
  var titleEl = document.createElement('div');
  titleEl.className = 'task-title';
  titleEl.textContent = t.title;
  var badge = document.createElement('span');
  badge.className = 'priority-badge ' + t.priority;
  badge.textContent = t.priority.toUpperCase();
  top.appendChild(titleEl);
  top.appendChild(badge);
  card.appendChild(top);

  // Due date / project meta
  var metaParts = [];
  if (t.project_name) metaParts.push(t.project_name);
  if (t.due_date) metaParts.push('Due ' + t.due_date);
  if (metaParts.length) {
    var meta = document.createElement('div');
    meta.className = 'task-meta';
    meta.textContent = metaParts.join(' · ');
    card.appendChild(meta);
  }

  // Tag pills + subtask indicator row
  var hasInfo = false;
  var infoRow = document.createElement('div');
  infoRow.className = 'tag-pills';
  if (t.tags && t.tags.length > 0) {
    t.tags.forEach(function(tag) {
      var pill = document.createElement('span');
      pill.className = 'tag-pill';
      pill.textContent = tag.name;
      pill.style.cssText = (
        'background:' + hexToRgba(tag.color, 0.2) + ';' +
        'color:' + tag.color + ';' +
        'border-color:' + hexToRgba(tag.color, 0.35) + ';'
      );
      infoRow.appendChild(pill);
      hasInfo = true;
    });
  }
  if (t.subtask_count > 0) {
    var indicator = document.createElement('span');
    indicator.className = 'subtask-indicator';
    indicator.textContent = '☑ ' + t.completed_subtasks + '/' + t.subtask_count + ' steps';
    infoRow.appendChild(indicator);
    hasInfo = true;
  }
  if (hasInfo) card.appendChild(infoRow);

  // Expanded detail
  var detail = document.createElement('div');
  detail.className = 'task-detail' + (expandedTaskId === t.id ? ' open' : '');
  detail.id = 'task-detail-' + t.id;
  detail.addEventListener('click', function(e) { e.stopPropagation(); });

  // Status + delete actions
  var actions = document.createElement('div');
  actions.className = 'task-detail-actions';
  var statusSel = document.createElement('select');
  [['todo', 'To Do'], ['in-progress', 'In Progress'], ['done', 'Done']].forEach(function(pair) {
    var opt = document.createElement('option');
    opt.value = pair[0];
    opt.textContent = pair[1];
    if (t.status === pair[0]) opt.selected = true;
    statusSel.appendChild(opt);
  });
  statusSel.addEventListener('change', function() { updateTaskStatus(t.id, statusSel.value); });
  var delBtn = document.createElement('button');
  delBtn.className = 'btn-danger';
  delBtn.textContent = 'Delete';
  delBtn.addEventListener('click', function() { deleteTask(t.id); });
  actions.appendChild(statusSel);
  actions.appendChild(delBtn);
  detail.appendChild(actions);

  if (t.notes) {
    var notesEl = document.createElement('div');
    notesEl.className = 'task-notes';
    notesEl.textContent = t.notes;
    detail.appendChild(notesEl);
  }

  // Tag picker
  if (allTags.length > 0) {
    var tagSection = document.createElement('div');
    tagSection.className = 'tag-picker-section';
    var tagLabel = document.createElement('div');
    tagLabel.className = 'tag-picker-label';
    tagLabel.textContent = 'Tags';
    tagSection.appendChild(tagLabel);
    var tagList = document.createElement('div');
    tagList.className = 'tag-picker-list';
    allTags.forEach(function(tag) {
      var assigned = t.tags && t.tags.some(function(tt) { return tt.id === tag.id; });
      var item = document.createElement('span');
      item.className = 'tag-picker-item' + (assigned ? ' assigned' : '');
      item.textContent = tag.name;
      item.style.cssText = (
        'background:' + hexToRgba(tag.color, 0.2) + ';' +
        'color:' + tag.color + ';' +
        'border-color:' + hexToRgba(tag.color, 0.35) + ';'
      );
      item.addEventListener('click', function(e) {
        e.stopPropagation();
        if (assigned) {
          removeTagFromTask(t.id, tag.id);
        } else {
          addTagToTask(t.id, tag.id);
        }
      });
      tagList.appendChild(item);
    });
    tagSection.appendChild(tagList);
    detail.appendChild(tagSection);
  }

  // Subtask checklist
  var subtaskSection = document.createElement('div');
  subtaskSection.className = 'subtask-section';
  if (expandedTaskId === t.id) {
    loadAndRenderSubtasks(t.id, subtaskSection);
  }
  detail.appendChild(subtaskSection);

  card.appendChild(detail);
  card.addEventListener('click', function() { toggleTask(t.id); });
  return card;
}

function renderTasks() {
  var tasks = filteredTasks();
  var today = new Date().toISOString().split('T')[0];
  var container = document.getElementById('task-list');
  while (container.firstChild) container.removeChild(container.firstChild);

  if (tasks.length === 0) {
    var p = document.createElement('p');
    p.style.cssText = 'color:var(--text-dim);font-size:13px;padding:12px';
    p.textContent = 'No tasks here. Tell the AI to create one!';
    container.appendChild(p);
    return;
  }

  var groups = [
    { key: 'overdue',     label: 'Overdue',    tasks: tasks.filter(function(t) { return t.due_date && t.due_date < today && t.status !== 'done'; }) },
    { key: 'in-progress', label: 'In Progress', tasks: tasks.filter(function(t) { return t.status === 'in-progress'; }) },
    { key: 'todo',        label: 'To Do',       tasks: tasks.filter(function(t) { return t.status === 'todo' && !(t.due_date && t.due_date < today); }) },
    { key: 'done',        label: 'Done',        tasks: tasks.filter(function(t) { return t.status === 'done'; }) },
  ].filter(function(g) { return g.tasks.length > 0; });

  groups.forEach(function(g) {
    var label = document.createElement('div');
    label.className = 'task-group-label ' + g.key;
    label.textContent = g.label.toUpperCase();
    container.appendChild(label);
    g.tasks.forEach(function(t) { container.appendChild(buildTaskCard(t)); });
  });
}

function toggleTask(id) {
  expandedTaskId = (expandedTaskId === id) ? null : id;
  renderTasks();
}

async function updateTaskStatus(id, status) {
  await fetch('/api/tasks/' + id, {
    method: 'PUT', headers: authHeaders(), body: JSON.stringify({ status: status }),
  });
  await loadTasks();
}

async function deleteTask(id) {
  if (!confirm('Delete this task?')) return;
  await fetch('/api/tasks/' + id, { method: 'DELETE', headers: authHeaders() });
  await loadTasks();
}

function updateOverdueBadge() {
  var today = new Date().toISOString().split('T')[0];
  var count = allTasks.filter(function(t) { return t.due_date && t.due_date < today && t.status !== 'done'; }).length;
  var badge = document.getElementById('overdue-badge');
  if (count > 0) {
    badge.textContent = count + ' overdue';
    badge.style.display = 'inline';
  } else {
    badge.style.display = 'none';
  }
}

// Subtask checklist
async function loadAndRenderSubtasks(parentId, container) {
  try {
    var resp = await fetch('/api/tasks?parent_id=' + parentId, { headers: authHeaders() });
    if (!resp.ok) return;
    var children = await resp.json();
    while (container.firstChild) container.removeChild(container.firstChild);

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

    // "＋ Add step" button
    var addRow = document.createElement('div');
    addRow.className = 'add-step-row';
    addRow.textContent = '+ Add step';
    addRow.addEventListener('click', function(e) {
      e.stopPropagation();
      showAddStepInput(parentId, container, addRow);
    });
    container.appendChild(addRow);
  } catch (e) {}
}

async function toggleSubtask(id, status, parentId, container) {
  await fetch('/api/tasks/' + id, {
    method: 'PUT', headers: authHeaders(), body: JSON.stringify({ status: status }),
  });
  await loadAndRenderSubtasks(parentId, container);
  await loadTasks();
}

function showAddStepInput(parentId, container, addRowEl) {
  addRowEl.style.display = 'none';
  var inputRow = document.createElement('div');
  inputRow.className = 'subtask-row';
  var inp = document.createElement('input');
  inp.type = 'text';
  inp.placeholder = 'Step title...';
  inp.style.cssText = 'flex:1;font-size:11px;padding:3px 6px';
  var cancelSpan = document.createElement('span');
  cancelSpan.textContent = '✕';
  cancelSpan.style.cssText = 'color:var(--text-dim);cursor:pointer;font-size:11px;flex-shrink:0';
  cancelSpan.addEventListener('click', function(e) {
    e.stopPropagation();
    inputRow.remove();
    addRowEl.style.display = '';
  });
  inp.addEventListener('keydown', async function(e) {
    e.stopPropagation();
    if (e.key === 'Enter' && inp.value.trim()) {
      await fetch('/api/tasks', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ title: inp.value.trim(), parent_id: parentId }),
      });
      await loadAndRenderSubtasks(parentId, container);
      await loadTasks();
    }
    if (e.key === 'Escape') { inputRow.remove(); addRowEl.style.display = ''; }
  });
  inputRow.appendChild(inp);
  inputRow.appendChild(cancelSpan);
  container.insertBefore(inputRow, addRowEl);
  inp.focus();
}

// Tag management on tasks
async function addTagToTask(taskId, tagId) {
  await fetch('/api/tasks/' + taskId + '/tags/' + tagId, { method: 'POST', headers: authHeaders() });
  await loadTasks();
}

async function removeTagFromTask(taskId, tagId) {
  await fetch('/api/tasks/' + taskId + '/tags/' + tagId, { method: 'DELETE', headers: authHeaders() });
  await loadTasks();
}

// New Task Modal
function showNewTaskForm() {
  document.getElementById('task-modal').style.display = 'flex';
  document.getElementById('mt-title').focus();
}

function closeModal() {
  document.getElementById('task-modal').style.display = 'none';
  document.getElementById('mt-title').value = '';
  document.getElementById('mt-notes').value = '';
  document.getElementById('mt-due').value = '';
}

async function createTask() {
  var title = document.getElementById('mt-title').value.trim();
  if (!title) { alert('Title is required.'); return; }
  var body = {
    title: title,
    priority: document.getElementById('mt-priority').value,
    due_date: document.getElementById('mt-due').value || null,
    project_id: parseInt(document.getElementById('mt-project').value) || null,
    notes: document.getElementById('mt-notes').value.trim() || null,
  };
  var createResp = await fetch('/api/tasks', { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) });
  if (!createResp.ok) {
    var errData = await createResp.json();
    alert(errData.detail || 'Error creating task.');
    return;
  }
  closeModal();
  await loadTasks();
}

// Chat
function buildMsgEl(role, content) {
  var div = document.createElement('div');
  div.className = 'msg ' + role;
  var avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.textContent = role === 'ai' ? 'AI' : (currentUser ? currentUser.username.slice(0, 2).toUpperCase() : 'Me');
  var bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.textContent = content;
  div.appendChild(avatar);
  div.appendChild(bubble);
  return div;
}

function addAiMessage(content) {
  var container = document.getElementById('chat-messages');
  var el = buildMsgEl('ai', content);
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
  return el;
}

async function sendMessage() {
  var input = document.getElementById('chat-input');
  var message = input.value.trim();
  if (!message) return;
  input.value = '';
  document.getElementById('send-btn').disabled = true;

  var container = document.getElementById('chat-messages');
  var userEl = buildMsgEl('user', message);
  container.appendChild(userEl);
  container.scrollTop = container.scrollHeight;

  var aiDiv = document.createElement('div');
  aiDiv.className = 'msg ai';
  var aiAvatar = document.createElement('div');
  aiAvatar.className = 'msg-avatar';
  aiAvatar.textContent = 'AI';
  var bubble = document.createElement('div');
  bubble.className = 'msg-bubble streaming';
  aiDiv.appendChild(aiAvatar);
  aiDiv.appendChild(bubble);
  container.appendChild(aiDiv);
  container.scrollTop = container.scrollHeight;

  var aiContent = '';
  try {
    var resp = await fetch('/api/chat', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ message: message, history: chatHistory }),
    });
    var reader = resp.body.getReader();
    var decoder = new TextDecoder();
    var buf = '';
    while (true) {
      var read = await reader.read();
      if (read.done) break;
      buf += decoder.decode(read.value, { stream: true });
      var lines = buf.split('\n');
      buf = lines.pop();
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (line.indexOf('data: ') !== 0) continue;
        var data = JSON.parse(line.slice(6));
        if (data.type === 'token') {
          aiContent += data.content;
          bubble.textContent = aiContent;
          container.scrollTop = container.scrollHeight;
        } else if (data.type === 'tool_executed') {
          await loadTasks();
          var notice = document.createElement('div');
          notice.className = 'tool-notice';
          notice.textContent = 'Task list updated';
          aiDiv.appendChild(notice);
        }
      }
    }
  } catch (e) {
    bubble.textContent = 'Error connecting to AI. Please try again.';
  }

  bubble.classList.remove('streaming');
  chatHistory.push({ role: 'user', content: message });
  chatHistory.push({ role: 'assistant', content: aiContent });
  if (chatHistory.length > 20) chatHistory = chatHistory.slice(-20);
  document.getElementById('send-btn').disabled = false;
}

// Event wiring
document.addEventListener('DOMContentLoaded', function() {
  if (!document.getElementById('login-screen')) return;

  initApp();

  document.getElementById('login-btn').addEventListener('click', login);
  document.getElementById('logout-btn').addEventListener('click', logout);
  document.getElementById('login-password').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') login();
  });
  document.getElementById('send-btn').addEventListener('click', sendMessage);
  document.getElementById('chat-input').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') sendMessage();
  });
  document.getElementById('new-task-btn').addEventListener('click', showNewTaskForm);
  document.getElementById('modal-create-btn').addEventListener('click', createTask);
  document.getElementById('modal-cancel-btn').addEventListener('click', closeModal);
  document.getElementById('task-modal').addEventListener('click', function(e) {
    if (e.target === this) closeModal();
  });
  document.getElementById('filter-all').addEventListener('click', function() { setFilter('all', this); });
  document.getElementById('filter-today').addEventListener('click', function() { setFilter('today', this); });
  document.getElementById('filter-overdue').addEventListener('click', function() { setFilter('overdue', this); });
});
```

- [ ] **Step 2: Commit**

```bash
cd /u01/project/mytask
git add static/app.js
git commit -m "feat: app.js — dashboard panel, tag pills, tag filters, subtask checklist"
```

---

## Task 8: Admin Tag Management JS

**Files:**
- Modify: `static/admin.js`

- [ ] **Step 1: Replace static/admin.js with the full updated version**

```javascript
async function adminInit() {
  if (!getToken()) { location.href = '/'; return; }
  try {
    var resp = await fetch('/api/auth/me', { headers: authHeaders() });
    if (!resp.ok) { location.href = '/'; return; }
    var user = await resp.json();
    if (user.role !== 'admin') { location.href = '/'; return; }
    document.getElementById('admin-app').style.display = 'flex';
    document.getElementById('nav-username').textContent = user.username;
    await loadAdminTags();
    await loadUsers();
  } catch (e) { location.href = '/'; }
}

async function loadAdminTags() {
  var resp = await fetch('/api/tags', { headers: authHeaders() });
  if (!resp.ok) return;
  var tags = await resp.json();
  var container = document.getElementById('tag-list');
  while (container.firstChild) container.removeChild(container.firstChild);

  if (tags.length === 0) {
    var empty = document.createElement('span');
    empty.style.cssText = 'color:var(--text-dim);font-size:12px';
    empty.textContent = 'No tags yet.';
    container.appendChild(empty);
    return;
  }

  tags.forEach(function(tag) {
    var item = document.createElement('div');
    item.style.cssText = 'display:flex;align-items:center;gap:6px;background:var(--bg-card);border:1px solid var(--border);border-radius:6px;padding:4px 10px';

    var swatch = document.createElement('span');
    swatch.style.cssText = 'width:10px;height:10px;border-radius:50%;background:' + tag.color + ';flex-shrink:0;display:inline-block';

    var name = document.createElement('span');
    name.style.fontSize = '12px';
    name.textContent = tag.name;

    var delBtn = document.createElement('button');
    delBtn.className = 'btn-danger';
    delBtn.textContent = '✕';
    delBtn.style.cssText = 'padding:2px 6px;font-size:11px';
    delBtn.addEventListener('click', function() { deleteAdminTag(tag.id, tag.name); });

    item.appendChild(swatch);
    item.appendChild(name);
    item.appendChild(delBtn);
    container.appendChild(item);
  });
}

async function createAdminTag() {
  var name = document.getElementById('new-tag-name').value.trim();
  var color = document.getElementById('new-tag-color').value;
  var errEl = document.getElementById('tag-error');
  errEl.style.display = 'none';

  if (!name) {
    errEl.textContent = 'Tag name is required.';
    errEl.style.display = 'block';
    return;
  }

  var resp = await fetch('/api/tags', {
    method: 'POST', headers: authHeaders(),
    body: JSON.stringify({ name: name, color: color }),
  });

  if (!resp.ok) {
    var data = await resp.json();
    errEl.textContent = data.detail || 'Error creating tag.';
    errEl.style.display = 'block';
    return;
  }

  document.getElementById('new-tag-name').value = '';
  await loadAdminTags();
}

async function deleteAdminTag(id, name) {
  if (!confirm('Delete tag "' + name + '"? It will be removed from all tasks.')) return;
  await fetch('/api/tags/' + id, { method: 'DELETE', headers: authHeaders() });
  await loadAdminTags();
}

async function loadUsers() {
  var resp = await fetch('/api/users', { headers: authHeaders() });
  if (!resp.ok) return;
  var users = await resp.json();
  var tbody = document.getElementById('user-tbody');
  while (tbody.firstChild) tbody.removeChild(tbody.firstChild);

  users.forEach(function(u) {
    var tr = document.createElement('tr');
    [String(u.id), u.username, u.role, u.created_at.split('T')[0]].forEach(function(val) {
      var td = document.createElement('td');
      td.textContent = val;
      tr.appendChild(td);
    });
    var actionTd = document.createElement('td');
    var delBtn = document.createElement('button');
    delBtn.className = 'btn-danger';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', function() { deleteUser(u.id, u.username); });
    actionTd.appendChild(delBtn);
    tr.appendChild(actionTd);
    tbody.appendChild(tr);
  });
}

async function createUser() {
  var username = document.getElementById('new-username').value.trim();
  var password = document.getElementById('new-password').value;
  var errEl = document.getElementById('create-error');
  errEl.style.display = 'none';

  if (!username || !password) {
    errEl.textContent = 'Username and password are required.';
    errEl.style.display = 'block';
    return;
  }

  var resp = await fetch('/api/users', {
    method: 'POST', headers: authHeaders(),
    body: JSON.stringify({ username: username, password: password }),
  });

  if (!resp.ok) {
    var data = await resp.json();
    errEl.textContent = data.detail || 'Error creating user.';
    errEl.style.display = 'block';
    return;
  }

  document.getElementById('new-username').value = '';
  document.getElementById('new-password').value = '';
  await loadUsers();
}

async function deleteUser(id, username) {
  if (!confirm('Delete user "' + username + '"? Their tasks will also be deleted.')) return;
  var resp = await fetch('/api/users/' + id, { method: 'DELETE', headers: authHeaders() });
  if (!resp.ok) {
    var d = await resp.json();
    alert(d.detail);
    return;
  }
  await loadUsers();
}

document.addEventListener('DOMContentLoaded', function() {
  adminInit();
  document.getElementById('logout-btn').addEventListener('click', logout);
  document.getElementById('create-user-btn').addEventListener('click', createUser);
  document.getElementById('create-tag-btn').addEventListener('click', createAdminTag);
});
```

- [ ] **Step 2: Run full test suite one final time**

Run: `cd /u01/project/mytask && python -m pytest -v`

Expected: all tests pass

- [ ] **Step 3: Rebuild and test in browser**

```bash
cd /u01/project/mytask
./docker.sh rebuild
```

Test the following in the browser at `https://uat.lvcopy.com` (or `http://localhost:8080`):
1. Login — dashboard strip is hidden (no tasks with due dates)
2. Create a task with due date = yesterday — dashboard shows 1 Overdue
3. Create a tag via Admin panel — Admin > Tag Management
4. Assign tag to task — click task, see tag picker, click tag
5. Tag pill appears on task card
6. Tag filter button appears in filter bar, clicking it filters tasks
7. Expand task — "+ Add step" appears, add a subtask
8. Subtask checkbox toggles, "☑ 1/1 steps" appears on collapsed card
9. AI briefing appears (may take a moment to load from NVIDIA API)

- [ ] **Step 4: Commit**

```bash
cd /u01/project/mytask
git add static/admin.js
git commit -m "feat: admin tag management UI — list, create, delete tags"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] Task 1 — parent_id, Tag, task_tags (spec §1)
- [x] Task 2 — /api/tags CRUD, admin-only create/delete (spec §2.1)
- [x] Task 3 — /api/dashboard with counts + AI briefing fallback (spec §2.2)
- [x] Task 4 — task_to_dict updated, tag_ids, subtask_count, GET by ID, ?parent_id, tag endpoints (spec §2.3)
- [x] Task 5 — create_subtask, add_tag_to_task, remove_tag_from_task tools (spec §4)
- [x] Task 6 — dashboard panel HTML, admin tag section, CSS (spec §3.1, 3.4)
- [x] Task 7 — tag pills, tag filter buttons, subtask checklist, tag picker (spec §3.2, 3.3)
- [x] Task 8 — admin.js tag CRUD (spec §3.4)
- [x] Test coverage: test_tags.py, test_subtasks.py, test_dashboard.py, extended test_agent.py (spec §5)

**Test files referenced in spec §5 but addressed:**
- `tests/test_tags.py` → Task 2
- `tests/test_subtasks.py` → Task 4
- `tests/test_dashboard.py` → Task 3
- `tests/test_agent.py` extended → Task 5
