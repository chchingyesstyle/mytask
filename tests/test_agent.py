def test_execute_tool_create_task(db_session):
    from ai.agent import execute_tool
    from models import User, Task
    from auth import hash_password
    user = User(username="u", password_hash=hash_password("p"), role="user")
    db_session.add(user)
    db_session.commit()
    result = execute_tool("create_task", {"title": "New Task", "priority": "high"}, db_session, user.id)
    assert "New Task" in result
    assert db_session.query(Task).filter(Task.owner_id == user.id).first() is not None

def test_execute_tool_update_task_by_title(db_session):
    from ai.agent import execute_tool
    from models import User, Task
    from auth import hash_password
    user = User(username="u2", password_hash=hash_password("p"), role="user")
    db_session.add(user)
    db_session.commit()
    task = Task(title="DB Migration", status="todo", priority="high", owner_id=user.id)
    db_session.add(task)
    db_session.commit()
    result = execute_tool("update_task", {"title_search": "DB Migration", "status": "in-progress"}, db_session, user.id)
    assert "DB Migration" in result
    db_session.refresh(task)
    assert task.status == "in-progress"

def test_execute_tool_delete_task(db_session):
    from ai.agent import execute_tool
    from models import User, Task
    from auth import hash_password
    user = User(username="u3", password_hash=hash_password("p"), role="user")
    db_session.add(user)
    db_session.commit()
    task = Task(title="Remove Me", status="todo", priority="low", owner_id=user.id)
    db_session.add(task)
    db_session.commit()
    result = execute_tool("delete_task", {"title_search": "Remove Me"}, db_session, user.id)
    assert "Remove Me" in result
    assert db_session.query(Task).filter(Task.owner_id == user.id).count() == 0

def test_execute_tool_list_tasks(db_session):
    from ai.agent import execute_tool
    from models import User, Task
    from auth import hash_password
    user = User(username="u4", password_hash=hash_password("p"), role="user")
    db_session.add(user)
    db_session.commit()
    db_session.add(Task(title="Task A", status="todo", priority="high", owner_id=user.id))
    db_session.commit()
    result = execute_tool("list_tasks", {}, db_session, user.id)
    assert "Task A" in result

def test_build_system_prompt_includes_tasks():
    from datetime import datetime
    from ai.agent import build_system_prompt
    tasks = [{"id": 1, "title": "DB Migrate", "status": "todo", "priority": "high", "due_date": None, "project_name": None}]
    prompt = build_system_prompt(tasks)
    assert "DB Migrate" in prompt
    assert "todo" in prompt
    assert datetime.utcnow().strftime("%Y-%m-%d") in prompt
