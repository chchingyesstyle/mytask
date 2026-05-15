from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from auth import get_current_user
import models

router = APIRouter(prefix="/api/tags", tags=["tags"])

class TagCreate(BaseModel):
    name: str
    color: str

def _tag_dict(tag: models.Tag) -> dict:
    return {"id": tag.id, "name": tag.name, "color": tag.color}

@router.get("")
def list_tags(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return [_tag_dict(t) for t in db.query(models.Tag).all()]

@router.post("", status_code=201)
def create_tag(
    req: TagCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if db.query(models.Tag).filter(models.Tag.name == req.name).first():
        raise HTTPException(status_code=409, detail="Tag name already exists")
    tag = models.Tag(name=req.name, color=req.color)
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return _tag_dict(tag)

@router.delete("/{tag_id}", status_code=204)
def delete_tag(
    tag_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    tag = db.query(models.Tag).filter(models.Tag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    db.delete(tag)
    db.commit()
    return Response(status_code=204)
