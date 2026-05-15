from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session
from database import get_db
from auth import get_current_user
import models

router = APIRouter(prefix="/api/statuses", tags=["statuses"])

class StatusCreate(BaseModel):
    name: str
    color: str
    project_id: Optional[int] = None

class StatusUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None

class ReorderRequest(BaseModel):
    ids: list[int]

def _check_ownership(status: models.Status, current_user: models.User, db: Session):
    if status.project_id is None:
        if current_user.role != "admin":
            raise HTTPException(403, "Only admins can modify the default status set")
    else:
        project = db.query(models.Project).filter(models.Project.id == status.project_id).first()
        if not project or (project.owner_id != current_user.id and current_user.role != "admin"):
            raise HTTPException(403, "Not authorized to modify this project's statuses")

def _status_to_dict(s: models.Status) -> dict:
    return {"id": s.id, "name": s.name, "color": s.color, "position": s.position, "project_id": s.project_id}

@router.get("")
def list_statuses(
    project_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    query = db.query(models.Status)
    if project_id is not None:
        query = query.filter(models.Status.project_id == project_id)
    else:
        query = query.filter(models.Status.project_id == None)  # noqa: E711
    return [_status_to_dict(s) for s in query.order_by(models.Status.position).all()]

@router.post("", status_code=201)
def create_status(
    req: StatusCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if req.project_id is None:
        if current_user.role != "admin":
            raise HTTPException(403, "Only admins can add to the default status set")
    else:
        project = db.query(models.Project).filter(models.Project.id == req.project_id).first()
        if not project:
            raise HTTPException(404, "Project not found")
        if project.owner_id != current_user.id and current_user.role != "admin":
            raise HTTPException(403, "Not authorized")
    max_pos = db.query(models.Status).filter(
        models.Status.project_id == req.project_id
    ).count()
    status = models.Status(
        name=req.name, color=req.color, position=max_pos, project_id=req.project_id
    )
    db.add(status)
    db.commit()
    db.refresh(status)
    return _status_to_dict(status)

# IMPORTANT: /reorder MUST be declared before /{status_id}
@router.put("/reorder")
def reorder_statuses(
    req: ReorderRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    for idx, sid in enumerate(req.ids):
        status = db.query(models.Status).filter(models.Status.id == sid).first()
        if not status:
            raise HTTPException(404, f"Status {sid} not found")
        _check_ownership(status, current_user, db)
        status.position = idx
    db.commit()
    return {"reordered": len(req.ids)}

@router.put("/{status_id}")
def update_status(
    status_id: int,
    req: StatusUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    status = db.query(models.Status).filter(models.Status.id == status_id).first()
    if not status:
        raise HTTPException(404, "Status not found")
    _check_ownership(status, current_user, db)
    for field in req.model_fields_set:
        setattr(status, field, getattr(req, field))
    db.commit()
    db.refresh(status)
    return _status_to_dict(status)

@router.delete("/{status_id}", status_code=204)
def delete_status(
    status_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    status = db.query(models.Status).filter(models.Status.id == status_id).first()
    if not status:
        raise HTTPException(404, "Status not found")
    _check_ownership(status, current_user, db)
    siblings = db.query(models.Status).filter(
        models.Status.project_id == status.project_id
    ).count()
    if siblings <= 1:
        raise HTTPException(400, "Cannot delete the last status of a project")
    first = (
        db.query(models.Status)
        .filter(models.Status.project_id == status.project_id, models.Status.id != status_id)
        .order_by(models.Status.position)
        .first()
    )
    db.query(models.Task).filter(models.Task.status_id == status_id).update(
        {"status_id": first.id}, synchronize_session=False
    )
    db.delete(status)
    db.commit()
    return Response(status_code=204)
