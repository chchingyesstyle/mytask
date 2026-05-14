import os
from fastapi import FastAPI
from fastapi.responses import FileResponse
from database import engine, Base
from seed import seed_admin
from routers import auth as auth_router
from routers import tasks as tasks_router
from routers import projects as projects_router
from routers import users as users_router
from routers import chat as chat_router

os.makedirs("data", exist_ok=True)
os.makedirs("static", exist_ok=True)

Base.metadata.create_all(bind=engine)

app = FastAPI(title="MyTask")

app.include_router(auth_router.router)
app.include_router(tasks_router.router)
app.include_router(projects_router.router)
app.include_router(users_router.router)
app.include_router(chat_router.router)

@app.on_event("startup")
def startup():
    seed_admin()

@app.get("/")
def root():
    return FileResponse("static/index.html")

@app.get("/admin")
def admin_page():
    return FileResponse("static/admin.html")
