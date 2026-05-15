from datetime import date, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from auth import get_current_user
from ai.agent import client, MODEL
import models

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

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
    base = db.query(models.Task).filter(
        models.Task.owner_id == current_user.id,
        ~models.Task.status_id.in_(done_status_ids) if done_status_ids else True,
    )

    overdue_tasks = base.filter(models.Task.due_date < today).all()
    today_tasks = base.filter(models.Task.due_date == today).all()
    week_count = base.filter(
        models.Task.due_date > today,
        models.Task.due_date <= week_end,
    ).count()

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
    }
