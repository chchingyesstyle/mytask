import os
from fastapi import FastAPI
from fastapi.responses import FileResponse
from database import engine, Base
from seed import seed_admin
from routers import auth as auth_router

os.makedirs("data", exist_ok=True)
os.makedirs("static", exist_ok=True)

Base.metadata.create_all(bind=engine)

app = FastAPI(title="MyTask")

app.include_router(auth_router.router)

# Routers registered in later tasks (Tasks 6–10):
# app.include_router(tasks_router, prefix="/api")
# app.include_router(projects_router, prefix="/api")
# app.include_router(users_router, prefix="/api")
# app.include_router(chat_router, prefix="/api")

@app.on_event("startup")
def startup():
    seed_admin()

@app.get("/")
def root():
    return FileResponse("static/index.html")

@app.get("/admin")
def admin_page():
    return FileResponse("static/admin.html")
