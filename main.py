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

# Add columns introduced after initial deployment (create_all won't alter existing tables)
def _migrate():
    with engine.connect() as conn:
        existing = {row[1] for row in conn.execute(__import__('sqlalchemy').text("PRAGMA table_info(tasks)"))}
        if "parent_id" not in existing:
            conn.execute(__import__('sqlalchemy').text(
                "ALTER TABLE tasks ADD COLUMN parent_id INTEGER REFERENCES tasks(id)"
            ))
            conn.commit()

_migrate()

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
