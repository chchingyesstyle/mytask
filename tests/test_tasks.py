def test_create_task(admin_headers):
    client, headers = admin_headers
    resp = client.post("/api/tasks", json={"title": "DB Migration", "priority": "high"}, headers=headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["title"] == "DB Migration"
    assert data["priority"] == "high"
    assert data["status"] == "todo"

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
    resp = client.put(f"/api/tasks/{task_id}", json={"status": "done", "title": "New Title"}, headers=headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "done"
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
    client.post("/api/tasks", json={"title": "Todo Task", "status": "todo"}, headers=headers)
    client.post("/api/tasks", json={"title": "Done Task", "status": "done"}, headers=headers)
    resp = client.get("/api/tasks?status=done", headers=headers)
    assert len(resp.json()) == 1
    assert resp.json()[0]["title"] == "Done Task"
