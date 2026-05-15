from datetime import date, datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from auth import get_current_user
import models

router = APIRouter(prefix="/api/tasks", tags=["tasks"])

class TaskCreate(BaseModel):
    title: str
    status_id: Optional[int] = None
    priority: str = "medium"
    start_date: Optional[date] = None
    due_date: Optional[date] = None
    project_id: Optional[int] = None
    notes: Optional[str] = None
    parent_id: Optional[int] = None
    tag_ids: list[int] = []

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    status_id: Optional[int] = None
    priority: Optional[str] = None
    start_date: Optional[date] = None
    due_date: Optional[date] = None
    project_id: Optional[int] = None
    notes: Optional[str] = None
    tag_ids: Optional[list[int]] = None

def task_to_dict(task: models.Task) -> dict:
    status_name = task.status_rel.name if task.status_rel else "Todo"
    return {
        "id": task.id,
        "title": task.title,
        "status_id": task.status_id,
        "status_name": status_name,
        "priority": task.priority,
        "start_date": task.start_date.isoformat() if task.start_date else None,
        "due_date": task.due_date.isoformat() if task.due_date else None,
        "project_id": task.project_id,
        "project_name": task.project.name if task.project else None,
        "notes": task.notes,
        "owner_id": task.owner_id,
        "parent_id": task.parent_id,
        "created_at": task.created_at.isoformat(),
        "updated_at": task.updated_at.isoformat() if task.updated_at else None,
        "tags": [{"id": t.id, "name": t.name, "color": t.color} for t in task.tags],
        "subtask_count": len(task.children),
        "completed_subtasks": sum(
            1 for c in task.children
            if c.status_rel and c.status_rel.name.lower() == "done"
        ),
    }

@router.get("")
def list_tasks(
    status: Optional[str] = None,
    priority: Optional[str] = None,
    project_id: Optional[int] = None,
    user_id: Optional[int] = None,
    parent_id: Optional[int] = None,
    tag_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    query = db.query(models.Task)
    if current_user.role != "admin":
        query = query.filter(models.Task.owner_id == current_user.id)
    elif user_id is not None:
        query = query.filter(models.Task.owner_id == user_id)
    if parent_id is None:
        query = query.filter(models.Task.parent_id == None)  # noqa: E711
    else:
        query = query.filter(models.Task.parent_id == parent_id)
    if status is not None:
        query = query.join(models.Status, models.Task.status_id == models.Status.id).filter(
            models.Status.name.ilike(status)
        )
    if priority is not None:
        query = query.filter(models.Task.priority == priority)
    if project_id is not None:
        query = query.filter(models.Task.project_id == project_id)
    if tag_id is not None:
        query = query.join(
            models.task_tags,
            models.task_tags.c.task_id == models.Task.id,
        ).filter(models.task_tags.c.tag_id == tag_id)
    return [task_to_dict(t) for t in query.all()]

@router.get("/{task_id}")
def get_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.owner_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    d = task_to_dict(task)
    d["children"] = [task_to_dict(c) for c in task.children]
    return d

@router.post("", status_code=201)
def create_task(
    req: TaskCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    task_data = req.model_dump(exclude={"tag_ids"})

    if task_data.get("parent_id"):
        parent = db.query(models.Task).filter(models.Task.id == task_data["parent_id"]).first()
        if not parent:
            raise HTTPException(status_code=404, detail="Parent task not found")
        if parent.owner_id != current_user.id and current_user.role != "admin":
            raise HTTPException(status_code=403, detail="Not authorized to attach to this parent")

    # Default status_id to first status of the task's project (or default set)
    if task_data.get("status_id") is None:
        pid = task_data.get("project_id")
        first_status = (
            db.query(models.Status)
            .filter(
                models.Status.project_id == pid
                if pid is not None
                else models.Status.project_id == None  # noqa: E711
            )
            .order_by(models.Status.position)
            .first()
        )
        if first_status:
            task_data["status_id"] = first_status.id

    task = models.Task(**task_data, owner_id=current_user.id)
    db.add(task)
    db.flush()
    if req.tag_ids:
        task.tags = db.query(models.Tag).filter(models.Tag.id.in_(req.tag_ids)).all()
    db.commit()
    db.refresh(task)
    return task_to_dict(task)

@router.put("/{task_id}")
def update_task(
    task_id: int,
    req: TaskUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.owner_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    update_data = req.model_dump(exclude={"tag_ids"})
    for field in req.model_fields_set - {"tag_ids"}:
        setattr(task, field, update_data[field])
    if req.tag_ids is not None:
        task.tags = db.query(models.Tag).filter(models.Tag.id.in_(req.tag_ids)).all()
    task.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(task)
    return task_to_dict(task)

@router.delete("/{task_id}", status_code=204)
def delete_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.owner_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    db.delete(task)
    db.commit()
    return Response(status_code=204)

@router.post("/{task_id}/tags/{tag_id}")
def add_tag_to_task(
    task_id: int,
    tag_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.owner_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    tag = db.query(models.Tag).filter(models.Tag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    if tag not in task.tags:
        task.tags.append(tag)
        db.commit()
        db.refresh(task)
    return task_to_dict(task)

@router.delete("/{task_id}/tags/{tag_id}", status_code=204)
def remove_tag_from_task(
    task_id: int,
    tag_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.owner_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")
    task.tags = [t for t in task.tags if t.id != tag_id]
    db.commit()
    return Response(status_code=204)
