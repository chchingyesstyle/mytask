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
    from models import User, Task, Status
    from auth import hash_password
    user = User(username="u2", password_hash=hash_password("p"), role="user")
    db_session.add(user)
    db_session.commit()
    # Seed an "In Progress" status for the test DB
    in_progress = Status(name="In Progress", color="#4a90d9", position=2, project_id=None)
    db_session.add(in_progress)
    db_session.commit()
    task = Task(title="DB Migration", priority="high", owner_id=user.id)
    db_session.add(task)
    db_session.commit()
    result = execute_tool("update_task", {"title_search": "DB Migration", "status_name": "In Progress"}, db_session, user.id)
    assert "DB Migration" in result
    db_session.refresh(task)
    assert task.status_id == in_progress.id

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
    tasks = [{"id": 1, "title": "DB Migrate", "status_name": "Todo", "priority": "high", "due_date": None, "project_name": None}]
    prompt = build_system_prompt(tasks)
    assert "DB Migrate" in prompt
    assert "Todo" in prompt
    assert datetime.utcnow().strftime("%Y-%m-%d") in prompt

def test_create_subtask_tool(db_session):
    from ai.agent import execute_tool
    from models import User, Task
    from auth import hash_password
    user = User(username="u_sub", password_hash=hash_password("p"), role="user")
    db_session.add(user)
    db_session.commit()
    parent = Task(title="Parent Task", status="todo", priority="high", owner_id=user.id)
    db_session.add(parent)
    db_session.commit()

    result = execute_tool("create_subtask", {"parent_id": parent.id, "title": "Step 1"}, db_session, user.id)
    assert "Step 1" in result

    child = db_session.query(Task).filter(Task.parent_id == parent.id).first()
    assert child is not None
    assert child.title == "Step 1"
    assert child.priority == "high"  # inherits parent priority

def test_create_subtask_tool_parent_not_found(db_session):
    from ai.agent import execute_tool
    from models import User
    from auth import hash_password
    user = User(username="u_nosub", password_hash=hash_password("p"), role="user")
    db_session.add(user)
    db_session.commit()
    result = execute_tool("create_subtask", {"parent_id": 9999, "title": "Orphan"}, db_session, user.id)
    assert "not found" in result.lower()

def test_add_tag_to_task_tool(db_session):
    from ai.agent import execute_tool
    from models import User, Task, Tag
    from auth import hash_password
    user = User(username="u_tag", password_hash=hash_password("p"), role="user")
    db_session.add(user)
    db_session.commit()
    task = Task(title="Tag Me", status="todo", priority="medium", owner_id=user.id)
    tag = Tag(name="urgent", color="#e74c3c")
    db_session.add_all([task, tag])
    db_session.commit()

    result = execute_tool("add_tag_to_task", {"task_id": task.id, "tag_name": "urgent"}, db_session, user.id)
    assert "urgent" in result.lower()

    db_session.refresh(task)
    assert any(t.name == "urgent" for t in task.tags)

def test_add_tag_to_task_tool_tag_not_found(db_session):
    from ai.agent import execute_tool
    from models import User, Task
    from auth import hash_password
    user = User(username="u_tagmiss", password_hash=hash_password("p"), role="user")
    db_session.add(user)
    db_session.commit()
    task = Task(title="No Tag", status="todo", priority="medium", owner_id=user.id)
    db_session.add(task)
    db_session.commit()
    result = execute_tool("add_tag_to_task", {"task_id": task.id, "tag_name": "nonexistent"}, db_session, user.id)
    assert "not found" in result.lower()

def test_remove_tag_from_task_tool(db_session):
    from ai.agent import execute_tool
    from models import User, Task, Tag
    from auth import hash_password
    user = User(username="u_rmtag", password_hash=hash_password("p"), role="user")
    db_session.add(user)
    db_session.commit()
    task = Task(title="Remove Tag", status="todo", priority="medium", owner_id=user.id)
    tag = Tag(name="server", color="#4a90d9")
    db_session.add_all([task, tag])
    db_session.commit()
    task.tags.append(tag)
    db_session.commit()

    result = execute_tool("remove_tag_from_task", {"task_id": task.id, "tag_name": "server"}, db_session, user.id)
    assert isinstance(result, str)
    db_session.refresh(task)
    assert not any(t.name == "server" for t in task.tags)

def test_remove_tag_silently_succeeds_if_not_assigned(db_session):
    from ai.agent import execute_tool
    from models import User, Task, Tag
    from auth import hash_password
    user = User(username="u_rmtag2", password_hash=hash_password("p"), role="user")
    db_session.add(user)
    db_session.commit()
    task = Task(title="Clean Task", status="todo", priority="medium", owner_id=user.id)
    tag = Tag(name="review", color="#2ecc71")
    db_session.add_all([task, tag])
    db_session.commit()
    # tag not assigned to task — should still succeed
    result = execute_tool("remove_tag_from_task", {"task_id": task.id, "tag_name": "review"}, db_session, user.id)
    assert isinstance(result, str)
