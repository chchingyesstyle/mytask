def test_create_task(admin_headers):
    client, headers = admin_headers
    resp = client.post("/api/tasks", json={"title": "DB Migration", "priority": "high"}, headers=headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["title"] == "DB Migration"
    assert data["priority"] == "high"
    assert data["status_name"] == "Todo"

def test_list_tasks_empty(admin_headers):
    client, headers = admin_headers
    resp = client.get("/api/tasks", headers=headers)
    assert resp.status_code == 200
    assert resp.json() == []

def test_list_tasks_returns_own(admin_headers):
    client, headers = admin_headers
    client.post("/api/tasks", json={"title": "Task A"}, headers=headers)
    resp = client.get("/api/tasks", headers=headers)
    assert len(resp.json()) == 1

def test_update_task(admin_headers):
    client, headers = admin_headers
    create_resp = client.post("/api/tasks", json={"title": "Old Title"}, headers=headers)
    task_id = create_resp.json()["id"]
    resp = client.put(f"/api/tasks/{task_id}", json={"status_id": 3, "title": "New Title"}, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["status_name"] == "Done"
    assert resp.json()["title"] == "New Title"

def test_delete_task(admin_headers):
    client, headers = admin_headers
    create_resp = client.post("/api/tasks", json={"title": "To Delete"}, headers=headers)
    task_id = create_resp.json()["id"]
    del_resp = client.delete(f"/api/tasks/{task_id}", headers=headers)
    assert del_resp.status_code == 204
    assert client.get("/api/tasks", headers=headers).json() == []

def test_task_requires_auth(seeded_client):
    resp = seeded_client.get("/api/tasks")
    assert resp.status_code == 401

def test_filter_by_status(admin_headers):
    client, headers = admin_headers
    client.post("/api/tasks", json={"title": "Todo Task", "status_id": 1}, headers=headers)
    client.post("/api/tasks", json={"title": "Done Task", "status_id": 3}, headers=headers)
    resp = client.get("/api/tasks?status=done", headers=headers)
    assert len(resp.json()) == 1
    assert resp.json()[0]["title"] == "Done Task"

def test_filter_by_priority(admin_headers):
    client, headers = admin_headers
    client.post("/api/tasks", json={"title": "High Task", "priority": "high"}, headers=headers)
    client.post("/api/tasks", json={"title": "Low Task", "priority": "low"}, headers=headers)
    resp = client.get("/api/tasks?priority=high", headers=headers)
    assert len(resp.json()) == 1
    assert resp.json()[0]["title"] == "High Task"

def test_regular_user_sees_only_own_tasks(client):
    from tests.conftest import TestingSessionLocal
    from auth import hash_password
    import models
    db = TestingSessionLocal()
    db.add(models.User(username="alice", password_hash=hash_password("alicepw"), role="user"))
    db.add(models.User(username="bob", password_hash=hash_password("bobpw"), role="user"))
    db.commit()
    db.close()

    alice_token = client.post("/api/auth/login", json={"username": "alice", "password": "alicepw"}).json()["access_token"]
    bob_token = client.post("/api/auth/login", json={"username": "bob", "password": "bobpw"}).json()["access_token"]
    alice_h = {"Authorization": f"Bearer {alice_token}"}
    bob_h = {"Authorization": f"Bearer {bob_token}"}

    client.post("/api/tasks", json={"title": "Alice Task"}, headers=alice_h)
    client.post("/api/tasks", json={"title": "Bob Task"}, headers=bob_h)

    alice_tasks = client.get("/api/tasks", headers=alice_h).json()
    assert len(alice_tasks) == 1
    assert alice_tasks[0]["title"] == "Alice Task"

    bob_tasks = client.get("/api/tasks", headers=bob_h).json()
    assert len(bob_tasks) == 1
    assert bob_tasks[0]["title"] == "Bob Task"

def test_task_response_has_status_id_and_name(admin_headers):
    client, headers = admin_headers
    resp = client.post("/api/tasks", json={"title": "New Task"}, headers=headers)
    assert resp.status_code == 201
    data = resp.json()
    assert "status_id" in data
    assert "status_name" in data
    assert data["status_name"] == "Todo"
    assert "status" not in data  # old field removed
