import os
from datetime import datetime, date
from openai import OpenAI
from sqlalchemy.orm import Session
import models

client = OpenAI(
    base_url="https://integrate.api.nvidia.com/v1",
    api_key=os.getenv("NVIDIA_API_KEY", ""),
)
MODEL = os.getenv("MODEL_NAME", "deepseek-ai/deepseek-v4-flash")

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "list_tasks",
            "description": "List tasks with optional filters",
            "parameters": {
                "type": "object",
                "properties": {
                    "status": {"type": "string", "enum": ["todo", "in-progress", "done"]},
                    "priority": {"type": "string", "enum": ["high", "medium", "low"]},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_task",
            "description": "Create a new task for the user",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "status": {"type": "string", "enum": ["todo", "in-progress", "done"]},
                    "priority": {"type": "string", "enum": ["high", "medium", "low"]},
                    "due_date": {"type": "string", "description": "ISO date YYYY-MM-DD, optional"},
                    "notes": {"type": "string"},
                },
                "required": ["title"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_task",
            "description": "Update an existing task by id or partial title match",
            "parameters": {
                "type": "object",
                "properties": {
                    "task_id": {"type": "integer"},
                    "title_search": {"type": "string", "description": "Partial title if id unknown"},
                    "status": {"type": "string", "enum": ["todo", "in-progress", "done"]},
                    "priority": {"type": "string", "enum": ["high", "medium", "low"]},
                    "due_date": {"type": "string"},
                    "notes": {"type": "string"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delete_task",
            "description": "Delete a task by id or partial title match",
            "parameters": {
                "type": "object",
                "properties": {
                    "task_id": {"type": "integer"},
                    "title_search": {"type": "string"},
                },
            },
        },
    },
]

def build_system_prompt(tasks: list[dict]) -> str:
    task_lines = "\n".join(
        "- ID:{} [{}] [{}] {}".format(t["id"], t["status"], t["priority"], t["title"])
        + (" (due {})".format(t["due_date"]) if t.get("due_date") else "")
        + (" [project: {}]".format(t["project_name"]) if t.get("project_name") else "")
        for t in tasks
    )
    today = datetime.utcnow().strftime("%Y-%m-%d")
    return (
        "You are a personal task manager assistant for an IT manager. Today is {}.\n\n"
        "Current tasks:\n{}\n\n"
        "You can manage tasks using the provided tools. "
        "When you perform an action, confirm it clearly. Be concise and professional."
    ).format(today, task_lines or "(no tasks yet)")

def _find_task(args: dict, db: Session, owner_id: int):
    if args.get("task_id"):
        return db.query(models.Task).filter(
            models.Task.id == args["task_id"],
            models.Task.owner_id == owner_id,
        ).first()
    if args.get("title_search"):
        return db.query(models.Task).filter(
            models.Task.title.ilike("%{}%".format(args["title_search"])),
            models.Task.owner_id == owner_id,
        ).first()
    return None

def execute_tool(name: str, args: dict, db: Session, owner_id: int) -> str:
    if name == "list_tasks":
        query = db.query(models.Task).filter(models.Task.owner_id == owner_id)
        if args.get("status"):
            query = query.filter(models.Task.status == args["status"])
        if args.get("priority"):
            query = query.filter(models.Task.priority == args["priority"])
        tasks = query.all()
        if not tasks:
            return "No tasks found matching those filters."
        return "\n".join(
            "- [{}] [{}] {}".format(t.status, t.priority, t.title)
            + (" (due {})".format(t.due_date) if t.due_date else "")
            for t in tasks
        )

    if name == "create_task":
        due = None
        if args.get("due_date"):
            try:
                due = date.fromisoformat(args["due_date"])
            except ValueError:
                pass
        task = models.Task(
            title=args["title"],
            status=args.get("status", "todo"),
            priority=args.get("priority", "medium"),
            due_date=due,
            notes=args.get("notes"),
            owner_id=owner_id,
        )
        db.add(task)
        db.commit()
        db.refresh(task)
        return "Created task '{}' (ID: {}).".format(task.title, task.id)

    if name == "update_task":
        task = _find_task(args, db, owner_id)
        if not task:
            return "Task not found."
        for field in ("status", "priority", "notes"):
            if args.get(field) is not None:
                setattr(task, field, args[field])
        if args.get("due_date"):
            try:
                task.due_date = date.fromisoformat(args["due_date"])
            except ValueError:
                pass
        task.updated_at = datetime.utcnow()
        db.commit()
        return "Updated task '{}'.".format(task.title)

    if name == "delete_task":
        task = _find_task(args, db, owner_id)
        if not task:
            return "Task not found."
        title = task.title
        db.delete(task)
        db.commit()
        return "Deleted task '{}'.".format(title)
