import os
from pathlib import Path
from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse
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
from routers import statuses as statuses_router
from routers import kb as kb_router

os.makedirs("data", exist_ok=True)
os.makedirs("static", exist_ok=True)
UPLOAD_DIR = Path("./data/uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

Base.metadata.create_all(bind=engine)

# Add columns introduced after initial deployment (create_all won't alter existing tables)
def _migrate():
    import sqlalchemy
    text = sqlalchemy.text
    with engine.connect() as conn:
        task_cols = {row[1] for row in conn.execute(text("PRAGMA table_info(tasks)"))}
        if "parent_id" not in task_cols:
            conn.execute(text("ALTER TABLE tasks ADD COLUMN parent_id INTEGER REFERENCES tasks(id)"))
            conn.commit()
        if "start_date" not in task_cols:
            conn.execute(text("ALTER TABLE tasks ADD COLUMN start_date DATE"))
            conn.commit()
        if "status_id" not in task_cols:
            conn.execute(text("ALTER TABLE tasks ADD COLUMN status_id INTEGER REFERENCES statuses(id)"))
            conn.commit()
            # Seed defaults before backfill (INSERT OR IGNORE is idempotent)
            conn.execute(text(
                "INSERT OR IGNORE INTO statuses (id, name, color, position, project_id) VALUES "
                "(1, 'Todo', '#6b7280', 0, NULL), "
                "(2, 'In Progress', '#4a90d9', 1, NULL), "
                "(3, 'Done', '#2ecc71', 2, NULL)"
            ))
            conn.commit()
            # Backfill existing tasks using old status string
            conn.execute(text(
                "UPDATE tasks SET status_id = "
                "(SELECT id FROM statuses WHERE project_id IS NULL AND name = 'Todo') "
                "WHERE status = 'todo'"
            ))
            conn.execute(text(
                "UPDATE tasks SET status_id = "
                "(SELECT id FROM statuses WHERE project_id IS NULL AND name = 'In Progress') "
                "WHERE status IN ('in-progress', 'in_progress')"
            ))
            conn.execute(text(
                "UPDATE tasks SET status_id = "
                "(SELECT id FROM statuses WHERE project_id IS NULL AND name = 'Done') "
                "WHERE status = 'done'"
            ))
            # Any remaining tasks get first default status
            conn.execute(text(
                "UPDATE tasks SET status_id = "
                "(SELECT id FROM statuses WHERE project_id IS NULL ORDER BY position LIMIT 1) "
                "WHERE status_id IS NULL"
            ))
            conn.commit()
        if "completed_at" not in task_cols:
            conn.execute(text("ALTER TABLE tasks ADD COLUMN completed_at DATETIME"))
            conn.commit()
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS kb_documents (
                id INTEGER PRIMARY KEY,
                title TEXT NOT NULL,
                filename TEXT NOT NULL,
                file_type TEXT NOT NULL,
                file_size INTEGER NOT NULL,
                extracted_text TEXT,
                task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
                owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """))
        conn.commit()

_migrate()

app = FastAPI(title="MyTask", version="1.0.0")

app.include_router(auth_router.router)
app.include_router(tasks_router.router)
app.include_router(projects_router.router)
app.include_router(users_router.router)
app.include_router(chat_router.router)
app.include_router(tags_router.router)
app.include_router(dashboard_router.router)
app.include_router(statuses_router.router)
app.include_router(kb_router.router)

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

@app.get("/api/info")
def api_info():
    from ai.agent import MODEL
    return JSONResponse({"model": MODEL})
