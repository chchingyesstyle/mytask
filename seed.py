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
