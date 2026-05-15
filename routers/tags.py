from typing import Optional
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

class TagUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None

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
    tag = db.query(models.Tag).filter(models.Tag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    db.delete(tag)
    db.commit()
    return Response(status_code=204)

@router.put("/{tag_id}")
def update_tag(
    tag_id: int,
    req: TagUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    tag = db.query(models.Tag).filter(models.Tag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    if req.name is not None and req.name != tag.name:
        if db.query(models.Tag).filter(models.Tag.name == req.name).first():
            raise HTTPException(status_code=409, detail="Tag name already exists")
        tag.name = req.name
    if req.color is not None:
        tag.color = req.color
    db.commit()
    db.refresh(tag)
    return _tag_dict(tag)
