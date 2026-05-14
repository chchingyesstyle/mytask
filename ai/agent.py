import os
from datetime import datetime, date
from openai import AsyncOpenAI
from sqlalchemy.orm import Session
import models

client = AsyncOpenAI(
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
    {
        "type": "function",
        "function": {
            "name": "create_subtask",
            "description": "Create a sub-task under an existing task",
            "parameters": {
                "type": "object",
                "properties": {
                    "parent_id": {"type": "integer", "description": "ID of the parent task"},
                    "title": {"type": "string"},
                    "priority": {"type": "string", "enum": ["high", "medium", "low"]},
                    "due_date": {"type": "string", "description": "ISO date YYYY-MM-DD, optional"},
                    "notes": {"type": "string"},
                },
                "required": ["parent_id", "title"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "add_tag_to_task",
            "description": "Add a predefined tag to a task by tag name (case-insensitive)",
            "parameters": {
                "type": "object",
                "properties": {
                    "task_id": {"type": "integer"},
                    "tag_name": {"type": "string"},
                },
                "required": ["task_id", "tag_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "remove_tag_from_task",
            "description": "Remove a tag from a task (succeeds silently if not assigned)",
            "parameters": {
                "type": "object",
                "properties": {
                    "task_id": {"type": "integer"},
                    "tag_name": {"type": "string"},
                },
                "required": ["task_id", "tag_name"],
            },
        },
    },
]

def build_system_prompt(tasks: list[dict]) -> str:
    task_lines = "\n".join(
        "- ID:{} [{}] [{}] {}".format(t["id"], t["status"], t["priority"], t["title"])
        + (" (due {})".format(t["due_date"]) if t.get("due_date") else "")
        + (" [project: {}]".format(t["project_name"]) if t.get("project_name") else "")
        + (" [tags: {}]".format(", ".join(tg["name"] for tg in t.get("tags", []))) if t.get("tags") else "")
        + (" [{}/{} steps done]".format(t.get("completed_subtasks", 0), t.get("subtask_count", 0)) if t.get("subtask_count", 0) > 0 else "")
        for t in tasks
    )
    today = datetime.utcnow().strftime("%Y-%m-%d")
    return (
        "You are a helpful personal assistant for an IT manager. Today is {}.\n\n"
        "Current tasks:\n{}\n\n"
        "You can chat normally AND manage tasks using the provided tools when the user asks to "
        "create, update, delete, list tasks, create sub-tasks, or add/remove tags. "
        "For general conversation, just reply naturally. "
        "When you perform a task action, confirm it clearly. Be concise and friendly."
    ).format(today, task_lines or "(no tasks yet)")

def _find_task(args: dict, db: Session, owner_id: int):
    if args.get("task_id") is not None:
        return db.query(models.Task).filter(
            models.Task.id == args["task_id"],
            models.Task.owner_id == owner_id,
        ).first()
    if args.get("title_search"):
        matches = db.query(models.Task).filter(
            models.Task.title.ilike("%{}%".format(args["title_search"])),
            models.Task.owner_id == owner_id,
        ).all()
        if len(matches) > 1:
            return "AMBIGUOUS:{}".format(args["title_search"])
        return matches[0] if matches else None
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
                return "Invalid due_date '{}', expected YYYY-MM-DD.".format(args["due_date"])
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
        if isinstance(task, str):
            return "Multiple tasks match '{}', please specify task_id.".format(args.get("title_search"))
        if not task:
            return "Task not found."
        for field in ("status", "priority", "notes"):
            if args.get(field) is not None:
                setattr(task, field, args[field])
        if args.get("due_date"):
            try:
                task.due_date = date.fromisoformat(args["due_date"])
            except ValueError:
                return "Invalid due_date '{}', expected YYYY-MM-DD.".format(args["due_date"])
        task.updated_at = datetime.utcnow()
        db.commit()
        return "Updated task '{}'.".format(task.title)

    if name == "delete_task":
        task = _find_task(args, db, owner_id)
        if isinstance(task, str):
            return "Multiple tasks match '{}', please specify task_id.".format(args.get("title_search"))
        if not task:
            return "Task not found."
        title = task.title
        db.delete(task)
        db.commit()
        return "Deleted task '{}'.".format(title)

    if name == "create_subtask":
        parent = db.query(models.Task).filter(
            models.Task.id == args["parent_id"],
            models.Task.owner_id == owner_id,
        ).first()
        if not parent:
            return "Parent task {} not found.".format(args["parent_id"])
        due = None
        if args.get("due_date"):
            try:
                due = date.fromisoformat(args["due_date"])
            except ValueError:
                return "Invalid due_date '{}', expected YYYY-MM-DD.".format(args["due_date"])
        task = models.Task(
            title=args["title"],
            status="todo",
            priority=args.get("priority") or parent.priority,
            due_date=due,
            notes=args.get("notes"),
            owner_id=owner_id,
            parent_id=args["parent_id"],
        )
        db.add(task)
        db.commit()
        db.refresh(task)
        return "Created sub-task '{}' under task ID {}.".format(task.title, args["parent_id"])

    if name == "add_tag_to_task":
        tag = db.query(models.Tag).filter(
            models.Tag.name.ilike(args["tag_name"])
        ).first()
        if not tag:
            return "Tag '{}' not found. Ask an admin to create it first.".format(args["tag_name"])
        task = db.query(models.Task).filter(
            models.Task.id == args["task_id"],
            models.Task.owner_id == owner_id,
        ).first()
        if not task:
            return "Task {} not found.".format(args["task_id"])
        if tag not in task.tags:
            task.tags.append(tag)
            db.commit()
        return "Added tag '{}' to task '{}'.".format(tag.name, task.title)

    if name == "remove_tag_from_task":
        task = db.query(models.Task).filter(
            models.Task.id == args["task_id"],
            models.Task.owner_id == owner_id,
        ).first()
        if not task:
            return "Task {} not found.".format(args["task_id"])
        tag = db.query(models.Tag).filter(
            models.Tag.name.ilike(args["tag_name"])
        ).first()
        if tag and tag in task.tags:
            task.tags = [t for t in task.tags if t.id != tag.id]
            db.commit()
        return "Removed tag '{}' from task '{}'.".format(args["tag_name"], task.title)

    return "Unknown tool: {}.".format(name)
