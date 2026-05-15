from database import SessionLocal, engine
from models import User, Status
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
        # Seed default status set (project_id = NULL) if not present
        if db.query(Status).filter(Status.project_id == None).count() == 0:  # noqa: E711
            db.add_all([
                Status(id=1, name="Todo",        color="#6b7280", position=0, project_id=None),
                Status(id=2, name="In Progress", color="#4a90d9", position=1, project_id=None),
                Status(id=3, name="Done",        color="#2ecc71", position=2, project_id=None),
            ])
            db.commit()
    finally:
        if close:
            db.close()

if __name__ == "__main__":
    seed_admin()
    print("Admin user and default statuses seeded.")
