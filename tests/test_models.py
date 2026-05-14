def test_user_model(db_session):
    from models import User
    from auth import hash_password
    user = User(username="testuser", password_hash=hash_password("pass"), role="user")
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    assert user.id is not None
    assert user.username == "testuser"
    assert user.role == "user"

def test_project_model(db_session):
    from models import User, Project
    from auth import hash_password
    user = User(username="u", password_hash=hash_password("p"), role="user")
    db_session.add(user)
    db_session.commit()
    project = Project(name="Infra", owner_id=user.id)
    db_session.add(project)
    db_session.commit()
    db_session.refresh(project)
    assert project.id is not None
    assert project.name == "Infra"

def test_task_model(db_session):
    from models import User, Task
    from auth import hash_password
    user = User(username="u2", password_hash=hash_password("p"), role="user")
    db_session.add(user)
    db_session.commit()
    task = Task(title="Do backup", status="todo", priority="high", owner_id=user.id)
    db_session.add(task)
    db_session.commit()
    db_session.refresh(task)
    assert task.id is not None
    assert task.title == "Do backup"
    assert task.status == "todo"
