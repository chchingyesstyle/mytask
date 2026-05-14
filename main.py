import os
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from database import engine, Base, SessionLocal
from seed import seed_admin

os.makedirs("static", exist_ok=True)
os.makedirs("data", exist_ok=True)

Base.metadata.create_all(bind=engine)

app = FastAPI(title="MyTask")

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
