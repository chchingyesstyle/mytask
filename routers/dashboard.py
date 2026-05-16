from datetime import date, timedelta, datetime as dt
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from auth import get_current_user
from ai.agent import client, MODEL
import models

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


def _task_mini(t):
    return {
        "id": t.id,
        "title": t.title,
        "priority": t.priority,
        "due_date": t.due_date.isoformat() if t.due_date else None,
        "project_name": t.project.name if t.project else None,
    }


@router.get("")
async def dashboard(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    today = date.today()
    week_end = today + timedelta(days=7)

    done_status_ids = [
        s.id for s in db.query(models.Status).filter(models.Status.name.ilike("done")).all()
    ]
    done_id_set = set(done_status_ids)

    base = db.query(models.Task).filter(
        models.Task.owner_id == current_user.id,
        models.Task.parent_id == None,  # noqa: E711
        ~models.Task.status_id.in_(done_status_ids) if done_status_ids else True,
    )

    overdue_tasks = base.filter(models.Task.due_date < today).all()
    today_tasks = base.filter(models.Task.due_date == today).all()
    week_count = base.filter(
        models.Task.due_date > today,
        models.Task.due_date <= week_end,
    ).count()

    # Project progress
    projects = db.query(models.Project).filter(
        models.Project.owner_id == current_user.id
    ).all()
    project_stats = []
    for proj in projects:
        proj_tasks = db.query(models.Task).filter(
            models.Task.owner_id == current_user.id,
            models.Task.project_id == proj.id,
            models.Task.parent_id == None,  # noqa: E711
        ).all()
        total = len(proj_tasks)
        if total == 0:
            continue
        done = sum(1 for t in proj_tasks if t.status_id in done_id_set)
        project_stats.append({"id": proj.id, "name": proj.name, "total": total, "done": done})

    # 7-day sparkline
    seven_days_ago = dt.utcnow().replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=6)
    completed_tasks = db.query(models.Task).filter(
        models.Task.owner_id == current_user.id,
        models.Task.parent_id == None,  # noqa: E711
        models.Task.completed_at >= seven_days_ago,
    ).all()
    completed_7d = [0] * 7
    for t in completed_tasks:
        delta = (today - t.completed_at.date()).days
        if 0 <= delta <= 6:
            completed_7d[6 - delta] += 1

    # Recent activity (last 5 root tasks by updated_at)
    recent = db.query(models.Task).filter(
        models.Task.owner_id == current_user.id,
        models.Task.parent_id == None,  # noqa: E711
    ).order_by(models.Task.updated_at.desc()).limit(5).all()
    recent_activity = [
        {
            "id": t.id,
            "title": t.title,
            "priority": t.priority,
            "updated_at": t.updated_at.isoformat(),
        }
        for t in recent
    ]

    ai_briefing = None
    try:
        task_lines = ", ".join(
            f"'{t.title}' ({'overdue' if t.due_date < today else 'due today'})"
            for t in (overdue_tasks + today_tasks)[:5]
        )
        prompt = (
            f"IT manager's urgent tasks: {task_lines or 'none'}. "
            f"Stats: {len(overdue_tasks)} overdue, {len(today_tasks)} due today. "
            "In one sentence, what should they focus on first?"
        )
        resp = await client.chat.completions.create(
            model=MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=80,
            stream=False,
        )
        ai_briefing = resp.choices[0].message.content.strip()
    except Exception:
        pass

    return {
        "overdue": len(overdue_tasks),
        "due_today": len(today_tasks),
        "due_week": week_count,
        "ai_briefing": ai_briefing,
        "overdue_tasks": [_task_mini(t) for t in overdue_tasks],
        "today_tasks": [_task_mini(t) for t in today_tasks],
        "projects": project_stats,
        "completed_7d": completed_7d,
        "recent_activity": recent_activity,
    }
