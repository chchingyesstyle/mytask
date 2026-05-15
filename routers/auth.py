from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from auth import verify_password, hash_password, create_access_token, get_current_user
import models

router = APIRouter(prefix="/api/auth", tags=["auth"])

class LoginRequest(BaseModel):
    username: str
    password: str

@router.post("/login")
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == req.username).first()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials", headers={"WWW-Authenticate": "Bearer"})
    token = create_access_token(user.id, user.username, user.role)
    return {"access_token": token, "token_type": "bearer"}

@router.get("/me")
def me(current_user: models.User = Depends(get_current_user)):
    return {"id": current_user.id, "username": current_user.username, "role": current_user.role}

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

@router.put("/password")
def change_password(
    req: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    if not verify_password(req.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if len(req.new_password) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters")
    current_user.password_hash = hash_password(req.new_password)
    db.commit()
    return {"message": "Password changed successfully"}
