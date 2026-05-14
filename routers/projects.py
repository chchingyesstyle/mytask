from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from auth import get_current_user
import models

router = APIRouter(prefix="/api/projects", tags=["projects"])

class ProjectCreate(BaseModel):
    name: str

@router.get("")
def list_projects(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    query = db.query(models.Project)
    if current_user.role != "admin":
        query = query.filter(models.Project.owner_id == current_user.id)
    return [{"id": p.id, "name": p.name, "owner_id": p.owner_id} for p in query.all()]

@router.post("", status_code=201)
def create_project(req: ProjectCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    project = models.Project(name=req.name, owner_id=current_user.id)
    db.add(project)
    db.commit()
    db.refresh(project)
    return {"id": project.id, "name": project.name, "owner_id": project.owner_id}

@router.delete("/{project_id}", status_code=204)
def delete_project(project_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.owner_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    db.delete(project)
    db.commit()
    return Response(status_code=204)
