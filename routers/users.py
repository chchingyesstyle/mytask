from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from auth import require_admin, hash_password
import models

router = APIRouter(prefix="/api/users", tags=["users"])

class UserCreate(BaseModel):
    username: str
    password: str

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
    user = models.User(username=req.username, password_hash=hash_password(req.password), role="user")
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"id": user.id, "username": user.username, "role": user.role, "created_at": user.created_at.isoformat()}

@router.delete("/{user_id}", status_code=204)
def delete_user(user_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(require_admin)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    db.delete(user)
    db.commit()
    return Response(status_code=204)
