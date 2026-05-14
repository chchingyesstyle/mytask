# MyTask Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a personal AI task manager web app with split-view UI, FastAPI backend, SQLite storage, NVIDIA DeepSeek AI chat, JWT auth, multi-user management, and Docker Compose deployment.

**Architecture:** Single FastAPI process serves both the static Vanilla JS frontend and all REST API routes. The AI chat endpoint streams responses via SSE and executes tool calls (create/update/delete/list tasks) directly against SQLite. JWT tokens protect all API routes. Admin user is seeded at startup.

**Tech Stack:** Python 3.11, FastAPI, SQLAlchemy 2 + SQLite, python-jose (JWT), passlib[bcrypt], openai SDK (NVIDIA-compatible), Vanilla JS + CSS, Docker Compose.

---

## File Map

```
mytask/
├── main.py                   # FastAPI app: routers, static mount, startup seed
├── database.py               # SQLAlchemy engine, SessionLocal, Base, get_db
├── models.py                 # ORM models: User, Project, Task
├── auth.py                   # hash_password, verify_password, create_access_token,
│                             #   decode_token, get_current_user, require_admin
├── seed.py                   # seed_admin() — creates admin/yesasia on first run
├── routers/
│   ├── __init__.py
│   ├── auth.py               # POST /api/auth/login, GET /api/auth/me
│   ├── tasks.py              # GET/POST /api/tasks, PUT/DELETE /api/tasks/{id}
│   ├── projects.py           # GET/POST /api/projects, DELETE /api/projects/{id}
│   ├── users.py              # GET/POST /api/users, DELETE /api/users/{id} (admin)
│   └── chat.py               # POST /api/chat — SSE streaming + tool executor
├── ai/
│   ├── __init__.py
│   └── agent.py              # NVIDIA client, TOOLS, build_system_prompt, execute_tool
├── static/
│   ├── index.html            # Split-view shell: login + app layout
│   ├── style.css             # Dark theme, responsive
│   ├── app.js                # Auth, task panel, chat panel (safe DOM methods only)
│   ├── admin.html            # Admin user management page
│   └── admin.js              # Admin: list/create/delete users
├── tests/
│   ├── conftest.py           # TestClient, in-memory SQLite, fixtures
│   ├── test_models.py
│   ├── test_auth_utils.py
│   ├── test_startup.py
│   ├── test_auth.py
│   ├── test_tasks.py
│   ├── test_projects.py
│   ├── test_users.py
│   └── test_chat.py
├── requirements.txt
├── Dockerfile
├── docker-compose.yml
├── .dockerignore
├── .env.example
├── .gitignore
└── docker.sh
```

---

## Task 1: Project Scaffold

**Files:**
- Create: `requirements.txt`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `routers/__init__.py`, `ai/__init__.py`, `tests/__init__.py`

- [ ] **Step 1: Create requirements.txt**

```
fastapi==0.115.0
uvicorn[standard]==0.30.6
sqlalchemy==2.0.35
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
python-multipart==0.0.12
openai==1.51.2
python-dotenv==1.0.1
pytest==8.3.3
httpx==0.27.2
```

- [ ] **Step 2: Create .env.example**

```
NVIDIA_API_KEY=your_nvidia_api_key_here
MODEL_NAME=deepseek-ai/deepseek-v4-flash
JWT_SECRET_KEY=change_this_to_a_long_random_string_at_least_32_chars
DATABASE_URL=sqlite:///./data/mytask.db
```

- [ ] **Step 3: Create .gitignore**

```
.env
data/
__pycache__/
*.pyc
.pytest_cache/
*.db
.superpowers/
```

- [ ] **Step 4: Create empty package init files**

Create `routers/__init__.py`, `ai/__init__.py`, `tests/__init__.py` — all empty.

- [ ] **Step 5: Install dependencies**

```bash
pip install -r requirements.txt
```

Expected: all packages install without errors.

- [ ] **Step 6: Commit**

```bash
git add requirements.txt .env.example .gitignore routers/__init__.py ai/__init__.py tests/__init__.py
git commit -m "feat: project scaffold"
```

---

## Task 2: Database Layer

**Files:**
- Create: `database.py`
- Create: `models.py`
- Create: `tests/conftest.py`
- Create: `tests/test_models.py`

- [ ] **Step 1: Write failing test**

Create `tests/test_models.py`:

```python
def test_user_model(db_session):
    from models import User
    from auth import hash_password
    user = User(username="testuser", password_hash=hash_password("pass"), role="user")
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    assert user.id is not None
    assert user.username == "testuser"
    assert user.role == "user"

def test_project_model(db_session):
    from models import User, Project
    from auth import hash_password
    user = User(username="u", password_hash=hash_password("p"), role="user")
    db_session.add(user)
    db_session.commit()
    project = Project(name="Infra", owner_id=user.id)
    db_session.add(project)
    db_session.commit()
    db_session.refresh(project)
    assert project.id is not None
    assert project.name == "Infra"

def test_task_model(db_session):
    from models import User, Task
    from auth import hash_password
    user = User(username="u2", password_hash=hash_password("p"), role="user")
    db_session.add(user)
    db_session.commit()
    task = Task(title="Do backup", status="todo", priority="high", owner_id=user.id)
    db_session.add(task)
    db_session.commit()
    db_session.refresh(task)
    assert task.id is not None
    assert task.title == "Do backup"
    assert task.status == "todo"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest tests/test_models.py -v
```

Expected: ImportError — `database` and `models` not yet created.

- [ ] **Step 3: Create database.py**

```python
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./data/mytask.db")

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

class Base(DeclarativeBase):
    pass

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

- [ ] **Step 4: Create models.py**

```python
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Date, ForeignKey, Text
from sqlalchemy.orm import relationship
from database import Base

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
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    owner = relationship("User", back_populates="tasks")
    project = relationship("Project", back_populates="tasks")
```

- [ ] **Step 5: Create tests/conftest.py**

```python
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient

SQLALCHEMY_TEST_URL = "sqlite://"

engine = create_engine(SQLALCHEMY_TEST_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture(autouse=True)
def setup_db():
    from database import Base
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)

@pytest.fixture
def db_session(setup_db):
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

@pytest.fixture
def client(setup_db):
    from database import get_db
    from main import app

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()

@pytest.fixture
def seeded_client(client):
    from seed import seed_admin
    db = TestingSessionLocal()
    seed_admin(db)
    db.close()
    return client

@pytest.fixture
def admin_headers(seeded_client):
    resp = seeded_client.post("/api/auth/login", json={"username": "admin", "password": "yesasia"})
    assert resp.status_code == 200
    token = resp.json()["access_token"]
    return seeded_client, {"Authorization": f"Bearer {token}"}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
pytest tests/test_models.py -v
```

Expected: 3 PASSED.

- [ ] **Step 7: Commit**

```bash
git add database.py models.py tests/conftest.py tests/test_models.py
git commit -m "feat: database layer and ORM models"
```

---

## Task 3: Auth Utilities

**Files:**
- Create: `auth.py`
- Create: `tests/test_auth_utils.py`

- [ ] **Step 1: Write failing test**

Create `tests/test_auth_utils.py`:

```python
def test_hash_and_verify_password():
    from auth import hash_password, verify_password
    hashed = hash_password("secret123")
    assert verify_password("secret123", hashed)
    assert not verify_password("wrong", hashed)

def test_create_and_decode_token():
    from auth import create_access_token, decode_token
    token = create_access_token(user_id=1, username="admin", role="admin")
    payload = decode_token(token)
    assert payload["sub"] == "1"
    assert payload["username"] == "admin"
    assert payload["role"] == "admin"

def test_decode_invalid_token_raises():
    from auth import decode_token
    from fastapi import HTTPException
    import pytest
    with pytest.raises(HTTPException) as exc:
        decode_token("not.a.real.token")
    assert exc.value.status_code == 401
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest tests/test_auth_utils.py -v
```

Expected: ImportError — `auth` not yet created.

- [ ] **Step 3: Create auth.py**

```python
import os
from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from database import get_db

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-secret-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)

def create_access_token(user_id: int, username: str, role: str) -> str:
    expire = datetime.utcnow() + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    payload = {"sub": str(user_id), "username": username, "role": role, "exp": expire}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    import models
    payload = decode_token(token)
    user = db.query(models.User).filter(models.User.id == int(payload["sub"])).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user

def require_admin(current_user=Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_auth_utils.py -v
```

Expected: 3 PASSED.

- [ ] **Step 5: Commit**

```bash
git add auth.py tests/test_auth_utils.py
git commit -m "feat: auth utilities — bcrypt hashing and JWT"
```

---

## Task 4: Seed Script + Main App Skeleton

**Files:**
- Create: `seed.py`
- Create: `main.py`
- Create: `static/index.html` (placeholder)
- Create: `static/admin.html` (placeholder)
- Create: `tests/test_startup.py`

- [ ] **Step 1: Write failing test**

Create `tests/test_startup.py`:

```python
def test_app_health(client):
    resp = client.get("/")
    assert resp.status_code == 200

def test_seed_creates_admin(db_session):
    from seed import seed_admin
    from models import User
    seed_admin(db_session)
    admin = db_session.query(User).filter(User.username == "admin").first()
    assert admin is not None
    assert admin.role == "admin"

def test_seed_is_idempotent(db_session):
    from seed import seed_admin
    from models import User
    seed_admin(db_session)
    seed_admin(db_session)
    count = db_session.query(User).filter(User.username == "admin").count()
    assert count == 1
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest tests/test_startup.py -v
```

Expected: ImportError — `seed` and `main` not yet created.

- [ ] **Step 3: Create seed.py**

```python
from database import SessionLocal, engine
from models import User
from auth import hash_password

def seed_admin(db=None):
    close = False
    if db is None:
        db = SessionLocal()
        close = True
    try:
        if not db.query(User).filter(User.username == "admin").first():
            db.add(User(username="admin", password_hash=hash_password("yesasia"), role="admin"))
            db.commit()
    finally:
        if close:
            db.close()

if __name__ == "__main__":
    seed_admin()
    print("Admin user seeded.")
```

- [ ] **Step 4: Create main.py**

```python
import os
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from database import engine, Base, SessionLocal
from seed import seed_admin

Base.metadata.create_all(bind=engine)

app = FastAPI(title="MyTask")

os.makedirs("static", exist_ok=True)
os.makedirs("data", exist_ok=True)

@app.on_event("startup")
def startup():
    db = SessionLocal()
    try:
        seed_admin(db)
    finally:
        db.close()

@app.get("/")
def root():
    return FileResponse("static/index.html")

@app.get("/admin")
def admin_page():
    return FileResponse("static/admin.html")
```

- [ ] **Step 5: Create placeholder static files**

`static/index.html`:
```html
<!DOCTYPE html><html><body>MyTask Loading...</body></html>
```

`static/admin.html`:
```html
<!DOCTYPE html><html><body>Admin Loading...</body></html>
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
pytest tests/test_startup.py -v
```

Expected: 3 PASSED.

- [ ] **Step 7: Commit**

```bash
git add seed.py main.py static/index.html static/admin.html tests/test_startup.py
git commit -m "feat: seed script and FastAPI app skeleton"
```

---

## Task 5: Auth Router

**Files:**
- Create: `routers/auth.py`
- Create: `tests/test_auth.py`
- Modify: `main.py` — include auth router

- [ ] **Step 1: Write failing test**

Create `tests/test_auth.py`:

```python
def test_login_success(seeded_client):
    resp = seeded_client.post("/api/auth/login", json={"username": "admin", "password": "yesasia"})
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"

def test_login_wrong_password(seeded_client):
    resp = seeded_client.post("/api/auth/login", json={"username": "admin", "password": "wrong"})
    assert resp.status_code == 401

def test_login_unknown_user(seeded_client):
    resp = seeded_client.post("/api/auth/login", json={"username": "nobody", "password": "x"})
    assert resp.status_code == 401

def test_me_returns_current_user(admin_headers):
    client, headers = admin_headers
    resp = client.get("/api/auth/me", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["username"] == "admin"
    assert data["role"] == "admin"

def test_me_requires_auth(seeded_client):
    resp = seeded_client.get("/api/auth/me")
    assert resp.status_code == 401
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest tests/test_auth.py -v
```

Expected: 404 errors — router not yet registered.

- [ ] **Step 3: Create routers/auth.py**

```python
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from auth import verify_password, create_access_token, get_current_user
import models

router = APIRouter(prefix="/api/auth", tags=["auth"])

class LoginRequest(BaseModel):
    username: str
    password: str

@router.post("/login")
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == req.username).first()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    token = create_access_token(user.id, user.username, user.role)
    return {"access_token": token, "token_type": "bearer"}

@router.get("/me")
def me(current_user: models.User = Depends(get_current_user)):
    return {"id": current_user.id, "username": current_user.username, "role": current_user.role}
```

- [ ] **Step 4: Register router in main.py**

Add after `app = FastAPI(title="MyTask")`:

```python
from routers import auth as auth_router
app.include_router(auth_router.router)
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pytest tests/test_auth.py -v
```

Expected: 5 PASSED.

- [ ] **Step 6: Commit**

```bash
git add routers/auth.py main.py tests/test_auth.py
git commit -m "feat: auth router — login and me endpoints"
```

---

## Task 6: Task Router

**Files:**
- Create: `routers/tasks.py`
- Create: `tests/test_tasks.py`
- Modify: `main.py` — include tasks router

- [ ] **Step 1: Write failing test**

Create `tests/test_tasks.py`:

```python
def test_create_task(admin_headers):
    client, headers = admin_headers
    resp = client.post("/api/tasks", json={"title": "DB Migration", "priority": "high"}, headers=headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["title"] == "DB Migration"
    assert data["priority"] == "high"
    assert data["status"] == "todo"

def test_list_tasks_empty(admin_headers):
    client, headers = admin_headers
    resp = client.get("/api/tasks", headers=headers)
    assert resp.status_code == 200
    assert resp.json() == []

def test_list_tasks_returns_own(admin_headers):
    client, headers = admin_headers
    client.post("/api/tasks", json={"title": "Task A"}, headers=headers)
    resp = client.get("/api/tasks", headers=headers)
    assert len(resp.json()) == 1

def test_update_task(admin_headers):
    client, headers = admin_headers
    create_resp = client.post("/api/tasks", json={"title": "Old Title"}, headers=headers)
    task_id = create_resp.json()["id"]
    resp = client.put(f"/api/tasks/{task_id}", json={"status": "done", "title": "New Title"}, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "done"
    assert resp.json()["title"] == "New Title"

def test_delete_task(admin_headers):
    client, headers = admin_headers
    create_resp = client.post("/api/tasks", json={"title": "To Delete"}, headers=headers)
    task_id = create_resp.json()["id"]
    del_resp = client.delete(f"/api/tasks/{task_id}", headers=headers)
    assert del_resp.status_code == 204
    assert client.get("/api/tasks", headers=headers).json() == []

def test_task_requires_auth(seeded_client):
    resp = seeded_client.get("/api/tasks")
    assert resp.status_code == 401

def test_filter_by_status(admin_headers):
    client, headers = admin_headers
    client.post("/api/tasks", json={"title": "Todo Task", "status": "todo"}, headers=headers)
    client.post("/api/tasks", json={"title": "Done Task", "status": "done"}, headers=headers)
    resp = client.get("/api/tasks?status=done", headers=headers)
    assert len(resp.json()) == 1
    assert resp.json()[0]["title"] == "Done Task"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest tests/test_tasks.py -v
```

Expected: 404 errors — router not registered.

- [ ] **Step 3: Create routers/tasks.py**

```python
from datetime import date, datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
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

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    due_date: Optional[date] = None
    project_id: Optional[int] = None
    notes: Optional[str] = None

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
        "created_at": task.created_at.isoformat(),
        "updated_at": task.updated_at.isoformat() if task.updated_at else None,
    }

@router.get("")
def list_tasks(
    status: Optional[str] = None,
    priority: Optional[str] = None,
    project_id: Optional[int] = None,
    user_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    query = db.query(models.Task)
    if current_user.role != "admin":
        query = query.filter(models.Task.owner_id == current_user.id)
    elif user_id:
        query = query.filter(models.Task.owner_id == user_id)
    if status:
        query = query.filter(models.Task.status == status)
    if priority:
        query = query.filter(models.Task.priority == priority)
    if project_id:
        query = query.filter(models.Task.project_id == project_id)
    return [task_to_dict(t) for t in query.all()]

@router.post("", status_code=201)
def create_task(
    req: TaskCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    task = models.Task(**req.model_dump(), owner_id=current_user.id)
    db.add(task)
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
    for field, value in req.model_dump(exclude_none=True).items():
        setattr(task, field, value)
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
```

- [ ] **Step 4: Register router in main.py**

```python
from routers import tasks as tasks_router
app.include_router(tasks_router.router)
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pytest tests/test_tasks.py -v
```

Expected: 7 PASSED.

- [ ] **Step 6: Commit**

```bash
git add routers/tasks.py main.py tests/test_tasks.py
git commit -m "feat: task CRUD router"
```

---

## Task 7: Project Router

**Files:**
- Create: `routers/projects.py`
- Create: `tests/test_projects.py`
- Modify: `main.py` — include projects router

- [ ] **Step 1: Write failing test**

Create `tests/test_projects.py`:

```python
def test_create_project(admin_headers):
    client, headers = admin_headers
    resp = client.post("/api/projects", json={"name": "Server Infra"}, headers=headers)
    assert resp.status_code == 201
    assert resp.json()["name"] == "Server Infra"

def test_list_projects_empty(admin_headers):
    client, headers = admin_headers
    resp = client.get("/api/projects", headers=headers)
    assert resp.status_code == 200
    assert resp.json() == []

def test_list_projects(admin_headers):
    client, headers = admin_headers
    client.post("/api/projects", json={"name": "Proj A"}, headers=headers)
    client.post("/api/projects", json={"name": "Proj B"}, headers=headers)
    resp = client.get("/api/projects", headers=headers)
    assert len(resp.json()) == 2

def test_delete_project(admin_headers):
    client, headers = admin_headers
    proj_id = client.post("/api/projects", json={"name": "To Delete"}, headers=headers).json()["id"]
    assert client.delete(f"/api/projects/{proj_id}", headers=headers).status_code == 204
    assert client.get("/api/projects", headers=headers).json() == []
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest tests/test_projects.py -v
```

Expected: 404 errors.

- [ ] **Step 3: Create routers/projects.py**

```python
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from auth import get_current_user
import models

router = APIRouter(prefix="/api/projects", tags=["projects"])

class ProjectCreate(BaseModel):
    name: str

@router.get("")
def list_projects(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    query = db.query(models.Project)
    if current_user.role != "admin":
        query = query.filter(models.Project.owner_id == current_user.id)
    return [{"id": p.id, "name": p.name, "owner_id": p.owner_id} for p in query.all()]

@router.post("", status_code=201)
def create_project(req: ProjectCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    project = models.Project(name=req.name, owner_id=current_user.id)
    db.add(project)
    db.commit()
    db.refresh(project)
    return {"id": project.id, "name": project.name, "owner_id": project.owner_id}

@router.delete("/{project_id}", status_code=204)
def delete_project(project_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.owner_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    db.delete(project)
    db.commit()
```

- [ ] **Step 4: Register router in main.py**

```python
from routers import projects as projects_router
app.include_router(projects_router.router)
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pytest tests/test_projects.py -v
```

Expected: 4 PASSED.

- [ ] **Step 6: Commit**

```bash
git add routers/projects.py main.py tests/test_projects.py
git commit -m "feat: project CRUD router"
```

---

## Task 8: User Management Router (Admin Only)

**Files:**
- Create: `routers/users.py`
- Create: `tests/test_users.py`
- Modify: `main.py` — include users router

- [ ] **Step 1: Write failing test**

Create `tests/test_users.py`:

```python
def test_list_users_as_admin(admin_headers):
    client, headers = admin_headers
    resp = client.get("/api/users", headers=headers)
    assert resp.status_code == 200
    assert any(u["username"] == "admin" for u in resp.json())

def test_create_user_as_admin(admin_headers):
    client, headers = admin_headers
    resp = client.post("/api/users", json={"username": "alice", "password": "pass123"}, headers=headers)
    assert resp.status_code == 201
    assert resp.json()["username"] == "alice"
    assert resp.json()["role"] == "user"

def test_create_duplicate_user(admin_headers):
    client, headers = admin_headers
    client.post("/api/users", json={"username": "bob", "password": "pass"}, headers=headers)
    resp = client.post("/api/users", json={"username": "bob", "password": "other"}, headers=headers)
    assert resp.status_code == 400

def test_delete_user_as_admin(admin_headers):
    client, headers = admin_headers
    uid = client.post("/api/users", json={"username": "todelete", "password": "x"}, headers=headers).json()["id"]
    assert client.delete(f"/api/users/{uid}", headers=headers).status_code == 204

def test_cannot_delete_self(admin_headers):
    client, headers = admin_headers
    me = client.get("/api/auth/me", headers=headers).json()
    resp = client.delete(f"/api/users/{me['id']}", headers=headers)
    assert resp.status_code == 400

def test_users_requires_auth(seeded_client):
    resp = seeded_client.get("/api/users")
    assert resp.status_code == 401
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest tests/test_users.py -v
```

Expected: 404 errors.

- [ ] **Step 3: Create routers/users.py**

```python
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from auth import require_admin, hash_password
import models

router = APIRouter(prefix="/api/users", tags=["users"])

class UserCreate(BaseModel):
    username: str
    password: str
    role: str = "user"

@router.get("")
def list_users(db: Session = Depends(get_db), _: models.User = Depends(require_admin)):
    return [
        {"id": u.id, "username": u.username, "role": u.role, "created_at": u.created_at.isoformat()}
        for u in db.query(models.User).all()
    ]

@router.post("", status_code=201)
def create_user(req: UserCreate, db: Session = Depends(get_db), _: models.User = Depends(require_admin)):
    if db.query(models.User).filter(models.User.username == req.username).first():
        raise HTTPException(status_code=400, detail="Username already exists")
    user = models.User(username=req.username, password_hash=hash_password(req.password), role=req.role)
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"id": user.id, "username": user.username, "role": user.role}

@router.delete("/{user_id}", status_code=204)
def delete_user(user_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(require_admin)):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    db.delete(user)
    db.commit()
```

- [ ] **Step 4: Register router in main.py**

```python
from routers import users as users_router
app.include_router(users_router.router)
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pytest tests/test_users.py -v
```

Expected: 6 PASSED.

- [ ] **Step 6: Commit**

```bash
git add routers/users.py main.py tests/test_users.py
git commit -m "feat: user management router — admin only"
```

---

## Task 9: AI Agent

**Files:**
- Create: `ai/agent.py`
- Create: `tests/test_agent.py`

- [ ] **Step 1: Write failing test**

Create `tests/test_agent.py`:

```python
def test_execute_tool_create_task(db_session):
    from ai.agent import execute_tool
    from models import User, Task
    from auth import hash_password
    user = User(username="u", password_hash=hash_password("p"), role="user")
    db_session.add(user)
    db_session.commit()
    result = execute_tool("create_task", {"title": "New Task", "priority": "high"}, db_session, user.id)
    assert "New Task" in result
    assert db_session.query(Task).filter(Task.owner_id == user.id).first() is not None

def test_execute_tool_update_task_by_title(db_session):
    from ai.agent import execute_tool
    from models import User, Task
    from auth import hash_password
    user = User(username="u2", password_hash=hash_password("p"), role="user")
    db_session.add(user)
    db_session.commit()
    task = Task(title="DB Migration", status="todo", priority="high", owner_id=user.id)
    db_session.add(task)
    db_session.commit()
    result = execute_tool("update_task", {"title_search": "DB Migration", "status": "in-progress"}, db_session, user.id)
    assert "DB Migration" in result
    db_session.refresh(task)
    assert task.status == "in-progress"

def test_execute_tool_delete_task(db_session):
    from ai.agent import execute_tool
    from models import User, Task
    from auth import hash_password
    user = User(username="u3", password_hash=hash_password("p"), role="user")
    db_session.add(user)
    db_session.commit()
    task = Task(title="Remove Me", status="todo", priority="low", owner_id=user.id)
    db_session.add(task)
    db_session.commit()
    result = execute_tool("delete_task", {"title_search": "Remove Me"}, db_session, user.id)
    assert "Remove Me" in result
    assert db_session.query(Task).filter(Task.owner_id == user.id).count() == 0

def test_execute_tool_list_tasks(db_session):
    from ai.agent import execute_tool
    from models import User, Task
    from auth import hash_password
    user = User(username="u4", password_hash=hash_password("p"), role="user")
    db_session.add(user)
    db_session.commit()
    db_session.add(Task(title="Task A", status="todo", priority="high", owner_id=user.id))
    db_session.commit()
    result = execute_tool("list_tasks", {}, db_session, user.id)
    assert "Task A" in result

def test_build_system_prompt_includes_tasks():
    from ai.agent import build_system_prompt
    tasks = [{"id": 1, "title": "DB Migrate", "status": "todo", "priority": "high", "due_date": None, "project_name": None}]
    prompt = build_system_prompt(tasks)
    assert "DB Migrate" in prompt
    assert "todo" in prompt
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest tests/test_agent.py -v
```

Expected: ImportError — `ai.agent` not yet created.

- [ ] **Step 3: Create ai/agent.py**

```python
import os
from datetime import datetime, date
from openai import OpenAI
from sqlalchemy.orm import Session
import models

client = OpenAI(
    base_url="https://integrate.api.nvidia.com/v1",
    api_key=os.getenv("NVIDIA_API_KEY", ""),
)
MODEL = os.getenv("MODEL_NAME", "deepseek-ai/deepseek-v4-flash")

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "list_tasks",
            "description": "List tasks with optional filters",
            "parameters": {
                "type": "object",
                "properties": {
                    "status": {"type": "string", "enum": ["todo", "in-progress", "done"]},
                    "priority": {"type": "string", "enum": ["high", "medium", "low"]},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_task",
            "description": "Create a new task for the user",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "status": {"type": "string", "enum": ["todo", "in-progress", "done"]},
                    "priority": {"type": "string", "enum": ["high", "medium", "low"]},
                    "due_date": {"type": "string", "description": "ISO date YYYY-MM-DD, optional"},
                    "notes": {"type": "string"},
                },
                "required": ["title"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_task",
            "description": "Update an existing task by id or partial title match",
            "parameters": {
                "type": "object",
                "properties": {
                    "task_id": {"type": "integer"},
                    "title_search": {"type": "string", "description": "Partial title if id unknown"},
                    "status": {"type": "string", "enum": ["todo", "in-progress", "done"]},
                    "priority": {"type": "string", "enum": ["high", "medium", "low"]},
                    "due_date": {"type": "string"},
                    "notes": {"type": "string"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delete_task",
            "description": "Delete a task by id or partial title match",
            "parameters": {
                "type": "object",
                "properties": {
                    "task_id": {"type": "integer"},
                    "title_search": {"type": "string"},
                },
            },
        },
    },
]

def build_system_prompt(tasks: list[dict]) -> str:
    task_lines = "\n".join(
        "- ID:{} [{}] [{}] {}".format(t["id"], t["status"], t["priority"], t["title"])
        + (" (due {})".format(t["due_date"]) if t.get("due_date") else "")
        + (" [project: {}]".format(t["project_name"]) if t.get("project_name") else "")
        for t in tasks
    )
    today = datetime.utcnow().strftime("%Y-%m-%d")
    return (
        "You are a personal task manager assistant for an IT manager. Today is {}.\n\n"
        "Current tasks:\n{}\n\n"
        "You can manage tasks using the provided tools. "
        "When you perform an action, confirm it clearly. Be concise and professional."
    ).format(today, task_lines or "(no tasks yet)")

def _find_task(args: dict, db: Session, owner_id: int):
    if args.get("task_id"):
        return db.query(models.Task).filter(
            models.Task.id == args["task_id"],
            models.Task.owner_id == owner_id,
        ).first()
    if args.get("title_search"):
        return db.query(models.Task).filter(
            models.Task.title.ilike("%{}%".format(args["title_search"])),
            models.Task.owner_id == owner_id,
        ).first()
    return None

def execute_tool(name: str, args: dict, db: Session, owner_id: int) -> str:
    if name == "list_tasks":
        query = db.query(models.Task).filter(models.Task.owner_id == owner_id)
        if args.get("status"):
            query = query.filter(models.Task.status == args["status"])
        if args.get("priority"):
            query = query.filter(models.Task.priority == args["priority"])
        tasks = query.all()
        if not tasks:
            return "No tasks found matching those filters."
        return "\n".join(
            "- [{}] [{}] {}".format(t.status, t.priority, t.title)
            + (" (due {})".format(t.due_date) if t.due_date else "")
            for t in tasks
        )

    if name == "create_task":
        due = None
        if args.get("due_date"):
            try:
                due = date.fromisoformat(args["due_date"])
            except ValueError:
                pass
        task = models.Task(
            title=args["title"],
            status=args.get("status", "todo"),
            priority=args.get("priority", "medium"),
            due_date=due,
            notes=args.get("notes"),
            owner_id=owner_id,
        )
        db.add(task)
        db.commit()
        db.refresh(task)
        return "Created task '{}' (ID: {}).".format(task.title, task.id)

    if name == "update_task":
        task = _find_task(args, db, owner_id)
        if not task:
            return "Task not found."
        for field in ("status", "priority", "notes"):
            if args.get(field) is not None:
                setattr(task, field, args[field])
        if args.get("due_date"):
            try:
                task.due_date = date.fromisoformat(args["due_date"])
            except ValueError:
                pass
        task.updated_at = datetime.utcnow()
        db.commit()
        return "Updated task '{}'.".format(task.title)

    if name == "delete_task":
        task = _find_task(args, db, owner_id)
        if not task:
            return "Task not found."
        title = task.title
        db.delete(task)
        db.commit()
        return "Deleted task '{}'.".format(title)

    return "Unknown tool: {}".format(name)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pytest tests/test_agent.py -v
```

Expected: 5 PASSED.

- [ ] **Step 5: Commit**

```bash
git add ai/agent.py tests/test_agent.py
git commit -m "feat: AI agent — NVIDIA tool definitions and executor"
```

---

## Task 10: Chat Router

**Files:**
- Create: `routers/chat.py`
- Create: `tests/test_chat.py`
- Modify: `main.py` — include chat router

- [ ] **Step 1: Write failing test**

Create `tests/test_chat.py`:

```python
from unittest.mock import patch, MagicMock

def _mock_stream(tokens):
    chunks = []
    for token in tokens:
        chunk = MagicMock()
        chunk.choices = [MagicMock()]
        chunk.choices[0].delta = MagicMock()
        chunk.choices[0].delta.content = token
        chunk.choices[0].delta.tool_calls = None
        chunks.append(chunk)
    return iter(chunks)

def test_chat_streams_tokens(admin_headers):
    client, headers = admin_headers
    mock_resp = MagicMock()
    mock_resp.__iter__ = lambda self: _mock_stream(["Hello", " world"])
    with patch("routers.chat.client.chat.completions.create", return_value=mock_resp):
        resp = client.post(
            "/api/chat",
            json={"message": "hello", "history": []},
            headers=headers,
        )
    assert resp.status_code == 200
    assert "Hello" in resp.text
    assert "world" in resp.text

def test_chat_requires_auth(seeded_client):
    resp = seeded_client.post("/api/chat", json={"message": "hi", "history": []})
    assert resp.status_code == 401
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest tests/test_chat.py -v
```

Expected: 404 errors.

- [ ] **Step 3: Create routers/chat.py**

```python
import json
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from auth import get_current_user
from ai.agent import client, MODEL, TOOLS, build_system_prompt, execute_tool
from routers.tasks import task_to_dict
import models

router = APIRouter(prefix="/api/chat", tags=["chat"])

class ChatRequest(BaseModel):
    message: str
    history: list[dict] = []

@router.post("")
def chat(
    req: ChatRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    tasks = db.query(models.Task).filter(models.Task.owner_id == current_user.id).all()
    system_prompt = build_system_prompt([task_to_dict(t) for t in tasks])

    messages = [{"role": "system", "content": system_prompt}]
    for msg in req.history[-10:]:
        messages.append(msg)
    messages.append({"role": "user", "content": req.message})

    def generate():
        collected_content = ""
        collected_tool_calls = []

        stream = client.chat.completions.create(
            model=MODEL, messages=messages, tools=TOOLS, stream=True
        )

        for chunk in stream:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta
            if delta.content:
                collected_content += delta.content
                yield "data: {}\n\n".format(json.dumps({"type": "token", "content": delta.content}))
            if delta.tool_calls:
                for tc in delta.tool_calls:
                    idx = tc.index or 0
                    while len(collected_tool_calls) <= idx:
                        collected_tool_calls.append({"id": "", "name": "", "arguments": ""})
                    if tc.id:
                        collected_tool_calls[idx]["id"] = tc.id
                    if tc.function.name:
                        collected_tool_calls[idx]["name"] = tc.function.name
                    if tc.function.arguments:
                        collected_tool_calls[idx]["arguments"] += tc.function.arguments

        if collected_tool_calls:
            tool_results = []
            for tc in collected_tool_calls:
                try:
                    args = json.loads(tc["arguments"])
                except Exception:
                    args = {}
                result = execute_tool(tc["name"], args, db, current_user.id)
                tool_results.append({"tool_call_id": tc["id"], "name": tc["name"], "result": result})
            yield "data: {}\n\n".format(json.dumps({"type": "tool_executed", "results": tool_results}))

            messages.append({
                "role": "assistant",
                "content": collected_content or None,
                "tool_calls": [
                    {"id": tc["id"], "type": "function",
                     "function": {"name": tc["name"], "arguments": tc["arguments"]}}
                    for tc in collected_tool_calls
                ],
            })
            for tr in tool_results:
                messages.append({"role": "tool", "tool_call_id": tr["tool_call_id"], "content": tr["result"]})

            follow_up = client.chat.completions.create(model=MODEL, messages=messages, stream=True)
            for chunk in follow_up:
                if chunk.choices and chunk.choices[0].delta.content:
                    content = chunk.choices[0].delta.content
                    yield "data: {}\n\n".format(json.dumps({"type": "token", "content": content}))

        yield "data: {}\n\n".format(json.dumps({"type": "done"}))

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
```

- [ ] **Step 4: Register router in main.py**

```python
from routers import chat as chat_router
app.include_router(chat_router.router)
```

- [ ] **Step 5: Run all tests**

```bash
pytest tests/ -v
```

Expected: all tests PASSED.

- [ ] **Step 6: Commit**

```bash
git add routers/chat.py main.py tests/test_chat.py
git commit -m "feat: chat router — SSE streaming with AI tool calls"
```

---

## Task 11: Frontend HTML Shell

**Files:**
- Modify: `static/index.html`

- [ ] **Step 1: Replace static/index.html with the full split-view shell**

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
        <div class="filter-bar" id="filter-bar">
          <button class="filter-btn active" id="filter-all">All</button>
          <button class="filter-btn" id="filter-today">Today</button>
          <button class="filter-btn" id="filter-overdue">Overdue</button>
          <span id="project-filters"></span>
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
          <span class="chat-model">DeepSeek v4 Flash - NVIDIA</span>
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

- [ ] **Step 2: Commit**

```bash
git add static/index.html
git commit -m "feat: frontend HTML split-view shell"
```

---

## Task 12: Frontend CSS

**Files:**
- Create: `static/style.css`

- [ ] **Step 1: Create static/style.css**

```css
:root {
  --bg-base: #13152a;
  --bg-panel: #161929;
  --bg-card: #1e2235;
  --bg-input: #0f1525;
  --border: #2d3352;
  --text: #e0e0e0;
  --text-dim: #a8b8d8;
  --accent: #4a90d9;
  --danger: #e74c3c;
  --warning: #e67e22;
  --success: #2ecc71;
  --r: 6px;
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: var(--bg-base);
  color: var(--text);
  height: 100vh;
  overflow: hidden;
}

/* Login */
.login-screen {
  display: flex; align-items: center; justify-content: center;
  height: 100vh;
  background: radial-gradient(ellipse at center, #1a1f3a 0%, #0d0f1e 100%);
}
.login-box {
  background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px;
  padding: 40px 36px; width: 320px; display: flex; flex-direction: column; gap: 14px;
}
.login-logo { font-size: 24px; font-weight: 700; color: var(--accent); text-align: center; }
.login-sub { text-align: center; color: var(--text-dim); font-size: 13px; }
.login-box input, .login-box button { width: 100%; }

/* Shared inputs/buttons */
input, select, textarea {
  background: var(--bg-input); border: 1px solid var(--border); color: var(--text);
  padding: 8px 12px; border-radius: var(--r); font-size: 13px; outline: none;
  transition: border-color .15s;
}
input:focus, select:focus, textarea:focus { border-color: var(--accent); }
button {
  background: var(--accent); color: #fff; border: none;
  padding: 8px 16px; border-radius: var(--r); font-size: 13px;
  cursor: pointer; transition: opacity .15s;
}
button:hover { opacity: .85; }
button.btn-secondary { background: var(--border); }
.error-msg {
  background: #3d1515; color: var(--danger);
  border: 1px solid var(--danger); padding: 8px 12px;
  border-radius: var(--r); font-size: 12px;
}

/* Nav */
.topnav {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 16px; height: 48px;
  background: #1e2235; border-bottom: 1px solid var(--border); flex-shrink: 0;
}
.nav-left, .nav-right { display: flex; align-items: center; gap: 12px; }
.app-logo { color: var(--accent); font-weight: 700; font-size: 16px; text-decoration: none; }
.workspace-label {
  background: var(--border); color: var(--text-dim);
  font-size: 11px; padding: 2px 10px; border-radius: 10px;
}
.nav-username { color: var(--text-dim); font-size: 13px; }
.nav-link { color: var(--accent); font-size: 13px; text-decoration: none; }
.nav-btn { background: transparent; color: var(--text-dim); border: 1px solid var(--border); padding: 4px 12px; font-size: 12px; }
.overdue-badge { background: var(--danger); color: #fff; font-size: 11px; padding: 2px 8px; border-radius: 10px; }

/* App layout */
#app { display: flex; flex-direction: column; height: 100vh; }
.split-view { display: flex; flex: 1; overflow: hidden; }

/* Task panel */
.task-panel {
  width: 42%; min-width: 280px;
  background: var(--bg-panel); border-right: 1px solid var(--border);
  display: flex; flex-direction: column; overflow: hidden;
}
.filter-bar {
  padding: 10px 12px; border-bottom: 1px solid var(--border);
  display: flex; flex-wrap: wrap; gap: 6px; align-items: center; flex-shrink: 0;
}
.filter-btn {
  background: var(--border); color: var(--text-dim);
  font-size: 11px; padding: 3px 10px; border-radius: 10px; border: none;
}
.filter-btn.active { background: var(--accent); color: #fff; }
.task-list { flex: 1; overflow-y: auto; padding: 10px; }
.task-panel-footer { padding: 10px 12px; border-top: 1px solid var(--border); flex-shrink: 0; }
.new-task-btn { width: 100%; }

/* Task cards */
.task-group-label {
  font-size: 10px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .5px; padding: 6px 4px 4px; margin-bottom: 4px;
}
.task-group-label.overdue { color: var(--danger); }
.task-group-label.in-progress { color: var(--accent); }
.task-group-label.todo { color: var(--text-dim); }
.task-group-label.done { color: var(--success); }

.task-card {
  background: var(--bg-card); border-left: 3px solid var(--border);
  border-radius: var(--r); padding: 8px 10px; margin-bottom: 6px;
  cursor: pointer; transition: border-color .15s;
}
.task-card:hover { border-left-color: var(--accent); }
.task-card.priority-high { border-left-color: var(--danger); }
.task-card.priority-medium { border-left-color: var(--warning); }
.task-card.status-done { opacity: .55; }

.task-card-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 6px; }
.task-title { font-size: 13px; font-weight: 500; }
.priority-badge { font-size: 9px; padding: 1px 6px; border-radius: 8px; flex-shrink: 0; text-transform: uppercase; }
.priority-badge.high { background: rgba(231,76,60,.15); color: var(--danger); }
.priority-badge.medium { background: rgba(230,126,34,.15); color: var(--warning); }
.priority-badge.low { background: rgba(45,51,82,.5); color: var(--text-dim); }
.task-meta { color: var(--text-dim); font-size: 11px; margin-top: 3px; }

.task-detail { display: none; margin-top: 8px; border-top: 1px solid var(--border); padding-top: 8px; }
.task-detail.open { display: block; }
.task-detail-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.task-detail-actions button, .task-detail-actions select { font-size: 11px; padding: 4px 10px; }
.task-notes { color: var(--text-dim); font-size: 12px; margin-top: 6px; }
.btn-danger { background: var(--danger); }

/* Chat panel */
.chat-panel {
  flex: 1; background: var(--bg-base);
  display: flex; flex-direction: column; overflow: hidden;
}
.chat-header {
  padding: 10px 14px; border-bottom: 1px solid var(--border);
  display: flex; align-items: center; gap: 8px; flex-shrink: 0;
}
.ai-dot { width: 8px; height: 8px; background: var(--success); border-radius: 50%; flex-shrink: 0; }
.chat-title { font-size: 13px; font-weight: 500; }
.chat-model { color: var(--text-dim); font-size: 11px; }
.chat-messages {
  flex: 1; overflow-y: auto; padding: 14px;
  display: flex; flex-direction: column; gap: 10px;
}
.chat-input-row {
  padding: 10px 12px; border-top: 1px solid var(--border);
  display: flex; gap: 8px; flex-shrink: 0;
}
.chat-input-row input { flex: 1; }

/* Messages */
.msg { display: flex; gap: 8px; align-items: flex-start; }
.msg.user { flex-direction: row-reverse; }
.msg-avatar {
  width: 28px; height: 28px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 600; flex-shrink: 0;
}
.msg.ai .msg-avatar { background: var(--accent); }
.msg.user .msg-avatar { background: var(--border); }
.msg-bubble {
  background: var(--bg-card); color: var(--text); font-size: 13px;
  padding: 9px 13px; border-radius: 4px 10px 10px 10px;
  max-width: 85%; line-height: 1.55; white-space: pre-wrap; word-break: break-word;
}
.msg.user .msg-bubble {
  background: rgba(74,144,217,.12); border: 1px solid rgba(74,144,217,.25);
  border-radius: 10px 4px 10px 10px;
}
.msg-bubble.streaming::after { content: '\25AE'; animation: blink .7s infinite; }
@keyframes blink { 0%,100% { opacity:1; } 50% { opacity:0; } }
.tool-notice { color: var(--text-dim); font-size: 11px; font-style: italic; margin-top: 4px; }

/* Modal */
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,.6);
  display: flex; align-items: center; justify-content: center; z-index: 100;
}
.modal-box {
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: 10px; padding: 24px; width: 360px;
  display: flex; flex-direction: column; gap: 12px;
}
.modal-box h3 { font-size: 16px; }
.modal-box input, .modal-box select, .modal-box textarea { width: 100%; }
.modal-actions { display: flex; gap: 10px; }

/* Admin */
.admin-content { padding: 24px; max-width: 800px; margin: 0 auto; }
.admin-content h2 { font-size: 20px; margin-bottom: 20px; }
.create-user-form {
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: 8px; padding: 20px; margin-bottom: 24px;
  display: flex; flex-direction: column; gap: 12px;
}
.create-user-form h3 { font-size: 15px; }
.create-user-form input, .create-user-form select { width: 100%; }
.user-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.user-table th, .user-table td {
  text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--border);
}
.user-table th { color: var(--text-dim); font-weight: 600; font-size: 11px; text-transform: uppercase; }
.user-table tr:hover td { background: var(--bg-card); }

/* Responsive */
@media (max-width: 640px) {
  body { overflow: auto; }
  #app { height: auto; }
  .split-view { flex-direction: column; }
  .task-panel { width: 100%; min-width: unset; border-right: none; border-bottom: 1px solid var(--border); max-height: 45vh; }
  .chat-panel { max-height: 55vh; }
}
```

- [ ] **Step 2: Commit**

```bash
git add static/style.css
git commit -m "feat: dark theme CSS — split view and responsive layout"
```

---

## Task 13: Frontend JavaScript

**Files:**
- Create: `static/app.js`

Note: All DOM manipulation uses `textContent` and `createElement` — no `innerHTML` with user data.

- [ ] **Step 1: Create static/app.js**

```javascript
// State
let currentUser = null;
let allTasks = [];
let allProjects = [];
let chatHistory = [];
let activeFilter = 'all';
let expandedTaskId = null;

// Auth
function getToken() { return localStorage.getItem('mytask_token'); }
function authHeaders() {
  return { 'Authorization': 'Bearer ' + getToken(), 'Content-Type': 'application/json' };
}

async function login() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  errEl.style.display = 'none';
  try {
    const resp = await fetch('/api/auth/login', {
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
    const resp = await fetch('/api/auth/me', { headers: authHeaders() });
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
    await loadTasks();
    addAiMessage('Hello ' + currentUser.username + '! I am your AI assistant. Tell me what tasks you need help with.');
  } catch (e) { showLogin(); }
}

function showLogin() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
}

// Projects
async function loadProjects() {
  const resp = await fetch('/api/projects', { headers: authHeaders() });
  allProjects = await resp.json();
  renderProjectFilters();
  populateProjectDropdown();
}

function renderProjectFilters() {
  const container = document.getElementById('project-filters');
  while (container.firstChild) container.removeChild(container.firstChild);
  allProjects.forEach(function(p) {
    const btn = document.createElement('button');
    btn.className = 'filter-btn';
    btn.textContent = p.name;
    btn.addEventListener('click', function() { setProjectFilter(p.id, btn); });
    container.appendChild(btn);
  });
}

function populateProjectDropdown() {
  const sel = document.getElementById('mt-project');
  if (!sel) return;
  while (sel.options.length > 1) sel.remove(1);
  allProjects.forEach(function(p) {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    sel.appendChild(opt);
  });
}

// Tasks
async function loadTasks() {
  const resp = await fetch('/api/tasks', { headers: authHeaders() });
  allTasks = await resp.json();
  renderTasks();
  updateOverdueBadge();
}

function setFilter(filter, btn) {
  activeFilter = filter;
  document.querySelectorAll('.filter-btn').forEach(function(b) { b.classList.remove('active'); });
  btn.classList.add('active');
  renderTasks();
}

function setProjectFilter(projectId, btn) {
  activeFilter = 'project:' + projectId;
  document.querySelectorAll('.filter-btn').forEach(function(b) { b.classList.remove('active'); });
  btn.classList.add('active');
  renderTasks();
}

function filteredTasks() {
  var today = new Date().toISOString().split('T')[0];
  if (activeFilter === 'today') return allTasks.filter(function(t) { return t.due_date === today; });
  if (activeFilter === 'overdue') return allTasks.filter(function(t) { return t.due_date && t.due_date < today && t.status !== 'done'; });
  if (activeFilter.indexOf('project:') === 0) {
    var pid = parseInt(activeFilter.split(':')[1]);
    return allTasks.filter(function(t) { return t.project_id === pid; });
  }
  return allTasks;
}

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

  var metaParts = [];
  if (t.project_name) metaParts.push(t.project_name);
  if (t.due_date) metaParts.push('Due ' + t.due_date);
  if (metaParts.length) {
    var meta = document.createElement('div');
    meta.className = 'task-meta';
    meta.textContent = metaParts.join(' · ');
    card.appendChild(meta);
  }

  var detail = document.createElement('div');
  detail.className = 'task-detail' + (expandedTaskId === t.id ? ' open' : '');
  detail.id = 'task-detail-' + t.id;
  detail.addEventListener('click', function(e) { e.stopPropagation(); });

  var actions = document.createElement('div');
  actions.className = 'task-detail-actions';

  var statusSel = document.createElement('select');
  [['todo','To Do'], ['in-progress','In Progress'], ['done','Done']].forEach(function(pair) {
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
    { key: 'overdue',     label: 'Overdue',      tasks: tasks.filter(function(t) { return t.due_date && t.due_date < today && t.status !== 'done'; }) },
    { key: 'in-progress', label: 'In Progress',   tasks: tasks.filter(function(t) { return t.status === 'in-progress'; }) },
    { key: 'todo',        label: 'To Do',         tasks: tasks.filter(function(t) { return t.status === 'todo' && !(t.due_date && t.due_date < today); }) },
    { key: 'done',        label: 'Done',          tasks: tasks.filter(function(t) { return t.status === 'done'; }) },
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
  await fetch('/api/tasks', { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) });
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
git add static/app.js
git commit -m "feat: frontend JS — auth, task panel, AI chat SSE streaming"
```

---

## Task 14: Admin UI

**Files:**
- Modify: `static/admin.html`
- Create: `static/admin.js`

- [ ] **Step 1: Replace static/admin.html**

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
      <h2>User Management</h2>

      <div class="create-user-form">
        <h3>Create New User</h3>
        <div id="create-error" class="error-msg" style="display:none"></div>
        <input id="new-username" type="text" placeholder="Username">
        <input id="new-password" type="password" placeholder="Password">
        <select id="new-role">
          <option value="user">User</option>
          <option value="admin">Admin</option>
        </select>
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

- [ ] **Step 2: Create static/admin.js**

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
    await loadUsers();
  } catch (e) { location.href = '/'; }
}

async function loadUsers() {
  var resp = await fetch('/api/users', { headers: authHeaders() });
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
  var role = document.getElementById('new-role').value;
  var errEl = document.getElementById('create-error');
  errEl.style.display = 'none';

  if (!username || !password) {
    errEl.textContent = 'Username and password are required.';
    errEl.style.display = 'block';
    return;
  }

  var resp = await fetch('/api/users', {
    method: 'POST', headers: authHeaders(),
    body: JSON.stringify({ username: username, password: password, role: role }),
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
});
```

- [ ] **Step 3: Commit**

```bash
git add static/admin.html static/admin.js
git commit -m "feat: admin UI — user list, create, delete"
```

---

## Task 15: Docker Setup

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `.dockerignore`

- [ ] **Step 1: Create Dockerfile**

```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
RUN mkdir -p data

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 2: Create docker-compose.yml**

```yaml
version: "3.9"

services:
  mytask:
    build: .
    ports:
      - "8000:8000"
    volumes:
      - ./data:/app/data
    env_file:
      - .env
    restart: unless-stopped
```

- [ ] **Step 3: Create .dockerignore**

```
.env
.git
.superpowers/
__pycache__/
*.pyc
*.pyo
data/
.pytest_cache/
tests/
docs/
*.db
```

- [ ] **Step 4: Copy .env.example to .env and populate**

```bash
cp .env.example .env
# Edit .env — set NVIDIA_API_KEY and JWT_SECRET_KEY
```

- [ ] **Step 5: Test Docker build**

```bash
docker build -t mytask .
```

Expected: Build completes with no errors.

- [ ] **Step 6: Commit**

```bash
git add Dockerfile docker-compose.yml .dockerignore
git commit -m "feat: Docker setup"
```

---

## Task 16: docker.sh + Final Smoke Test

**Files:**
- Create: `docker.sh`

- [ ] **Step 1: Create docker.sh**

```bash
#!/bin/bash
set -e
COMPOSE="docker compose"

case "$1" in
  start)
    $COMPOSE up -d
    echo "MyTask running — open http://$(hostname -I | awk '{print $1}'):8000"
    ;;
  stop)
    $COMPOSE down
    echo "MyTask stopped."
    ;;
  restart)
    $COMPOSE restart
    echo "MyTask restarted."
    ;;
  rebuild)
    $COMPOSE down
    $COMPOSE build --no-cache
    $COMPOSE up -d
    echo "MyTask rebuilt — open http://$(hostname -I | awk '{print $1}'):8000"
    ;;
  status)
    $COMPOSE ps
    ;;
  logs)
    $COMPOSE logs -f
    ;;
  *)
    echo "Usage: ./docker.sh {start|stop|restart|rebuild|status|logs}"
    exit 1
    ;;
esac
```

- [ ] **Step 2: Make executable**

```bash
chmod +x docker.sh
```

- [ ] **Step 3: Run full test suite**

```bash
pytest tests/ -v
```

Expected: all tests PASSED.

- [ ] **Step 4: Open port 8000 in VM firewall**

```bash
sudo iptables -I INPUT 4 -p tcp --dport 8000 -m state --state NEW -j ACCEPT
```

- [ ] **Step 5: Start the app**

```bash
./docker.sh start
```

Expected: Container starts. Open `http://140.245.106.36:8000`.

- [ ] **Step 6: Smoke test in browser**
  - Login with `admin` / `yesasia`
  - Go to `/admin`, create a project (e.g. "Server Infra")
  - In chat: type `add a high priority task called DB Migration due 2026-05-20`
  - Verify task appears in the task panel on the left
  - In chat: type `mark DB Migration as in progress`
  - Verify the task status updates in the panel
  - On mobile: resize browser below 640px, verify panels stack vertically

- [ ] **Step 7: Final commit**

```bash
git add docker.sh
git commit -m "feat: docker.sh management script"
```

---

## Summary

| Task | Deliverable |
|---|---|
| 1 | requirements.txt, .env.example, .gitignore, init files |
| 2 | database.py, models.py, conftest.py |
| 3 | auth.py — bcrypt + JWT |
| 4 | seed.py, main.py skeleton |
| 5 | routers/auth.py |
| 6 | routers/tasks.py |
| 7 | routers/projects.py |
| 8 | routers/users.py (admin only) |
| 9 | ai/agent.py — NVIDIA tools + executor |
| 10 | routers/chat.py — SSE streaming |
| 11 | static/index.html |
| 12 | static/style.css |
| 13 | static/app.js |
| 14 | static/admin.html + admin.js |
| 15 | Dockerfile + docker-compose.yml |
| 16 | docker.sh + smoke test |
