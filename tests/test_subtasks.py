def test_create_subtask(admin_headers):
    client, headers = admin_headers
    parent = client.post("/api/tasks", json={"title": "Parent Task"}, headers=headers).json()
    resp = client.post("/api/tasks", json={"title": "Sub Step", "parent_id": parent["id"]}, headers=headers)
    assert resp.status_code == 201
    assert resp.json()["parent_id"] == parent["id"]

def test_subtask_count_on_parent(admin_headers):
    client, headers = admin_headers
    parent = client.post("/api/tasks", json={"title": "Parent"}, headers=headers).json()
    client.post("/api/tasks", json={"title": "Child 1", "parent_id": parent["id"]}, headers=headers)
    client.post("/api/tasks", json={"title": "Child 2", "parent_id": parent["id"]}, headers=headers)
    client.put(f"/api/tasks/{parent['id']}", json={"status": "in-progress"}, headers=headers)
    tasks = client.get("/api/tasks", headers=headers).json()
    p = next(t for t in tasks if t["id"] == parent["id"])
    assert p["subtask_count"] == 2
    assert p["completed_subtasks"] == 0

def test_completed_subtasks_count(admin_headers):
    client, headers = admin_headers
    parent = client.post("/api/tasks", json={"title": "Parent"}, headers=headers).json()
    child = client.post("/api/tasks", json={"title": "Child", "parent_id": parent["id"]}, headers=headers).json()
    client.put(f"/api/tasks/{child['id']}", json={"status": "done"}, headers=headers)
    tasks = client.get("/api/tasks", headers=headers).json()
    p = next(t for t in tasks if t["id"] == parent["id"])
    assert p["completed_subtasks"] == 1

def test_root_tasks_only_in_default_list(admin_headers):
    client, headers = admin_headers
    parent = client.post("/api/tasks", json={"title": "Root"}, headers=headers).json()
    client.post("/api/tasks", json={"title": "Child", "parent_id": parent["id"]}, headers=headers)
    tasks = client.get("/api/tasks", headers=headers).json()
    assert all(t["parent_id"] is None for t in tasks)

def test_get_children_by_parent_id(admin_headers):
    client, headers = admin_headers
    parent = client.post("/api/tasks", json={"title": "Parent"}, headers=headers).json()
    child = client.post("/api/tasks", json={"title": "Child", "parent_id": parent["id"]}, headers=headers).json()
    resp = client.get(f"/api/tasks?parent_id={parent['id']}", headers=headers)
    data = resp.json()
    assert len(data) == 1
    assert data[0]["id"] == child["id"]

def test_delete_parent_cascades_to_children(admin_headers):
    client, headers = admin_headers
    parent = client.post("/api/tasks", json={"title": "Parent"}, headers=headers).json()
    child = client.post("/api/tasks", json={"title": "Child", "parent_id": parent["id"]}, headers=headers).json()
    client.delete(f"/api/tasks/{parent['id']}", headers=headers)
    children = client.get(f"/api/tasks?parent_id={parent['id']}", headers=headers).json()
    assert len(children) == 0

def test_get_task_by_id_includes_children(admin_headers):
    client, headers = admin_headers
    parent = client.post("/api/tasks", json={"title": "Parent"}, headers=headers).json()
    client.post("/api/tasks", json={"title": "Child", "parent_id": parent["id"]}, headers=headers)
    resp = client.get(f"/api/tasks/{parent['id']}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["children"]) == 1
    assert data["children"][0]["title"] == "Child"

def test_assign_tags_on_create(admin_headers):
    client, headers = admin_headers
    tag_id = client.post("/api/tags", json={"name": "infra", "color": "#4a90d9"}, headers=headers).json()["id"]
    resp = client.post("/api/tasks", json={"title": "Tagged Task", "tag_ids": [tag_id]}, headers=headers)
    assert resp.status_code == 201
    assert any(t["id"] == tag_id for t in resp.json()["tags"])

def test_replace_tags_on_update(admin_headers):
    client, headers = admin_headers
    tag1 = client.post("/api/tags", json={"name": "tag-a", "color": "#e74c3c"}, headers=headers).json()["id"]
    tag2 = client.post("/api/tags", json={"name": "tag-b", "color": "#2ecc71"}, headers=headers).json()["id"]
    task = client.post("/api/tasks", json={"title": "My Task", "tag_ids": [tag1]}, headers=headers).json()
    client.put(f"/api/tasks/{task['id']}", json={"tag_ids": [tag2]}, headers=headers)
    detail = client.get(f"/api/tasks/{task['id']}", headers=headers).json()
    tag_ids = [t["id"] for t in detail["tags"]]
    assert tag2 in tag_ids
    assert tag1 not in tag_ids

def test_add_remove_tag_endpoints(admin_headers):
    client, headers = admin_headers
    tag_id = client.post("/api/tags", json={"name": "net", "color": "#fff"}, headers=headers).json()["id"]
    task_id = client.post("/api/tasks", json={"title": "Net Task"}, headers=headers).json()["id"]
    # add
    resp = client.post(f"/api/tasks/{task_id}/tags/{tag_id}", headers=headers)
    assert resp.status_code == 200
    assert any(t["id"] == tag_id for t in resp.json()["tags"])
    # remove
    del_resp = client.delete(f"/api/tasks/{task_id}/tags/{tag_id}", headers=headers)
    assert del_resp.status_code == 204

def test_filter_tasks_by_tag(admin_headers):
    client, headers = admin_headers
    tag_id = client.post("/api/tags", json={"name": "filter-me", "color": "#fff"}, headers=headers).json()["id"]
    task_id = client.post("/api/tasks", json={"title": "Tagged"}, headers=headers).json()["id"]
    client.post(f"/api/tasks/{task_id}/tags/{tag_id}", headers=headers)
    client.post("/api/tasks", json={"title": "Untagged"}, headers=headers)
    resp = client.get(f"/api/tasks?tag_id={tag_id}", headers=headers)
    assert len(resp.json()) == 1
    assert resp.json()[0]["title"] == "Tagged"

def test_nested_depth_2(admin_headers):
    client, headers = admin_headers
    root = client.post("/api/tasks", json={"title": "Root"}, headers=headers).json()
    child = client.post("/api/tasks", json={"title": "Child", "parent_id": root["id"]}, headers=headers).json()
    client.post("/api/tasks", json={"title": "Grandchild", "parent_id": child["id"]}, headers=headers)
    children = client.get(f"/api/tasks?parent_id={root['id']}", headers=headers).json()
    assert children[0]["subtask_count"] == 1

def test_cannot_attach_subtask_to_other_users_task(client):
    from tests.conftest import TestingSessionLocal
    from auth import hash_password
    import models
    db = TestingSessionLocal()
    alice = models.User(username="alice_sub", password_hash=hash_password("pw"), role="user")
    bob = models.User(username="bob_sub", password_hash=hash_password("pw"), role="user")
    db.add_all([alice, bob])
    db.commit()
    db.close()
    alice_token = client.post("/api/auth/login", json={"username": "alice_sub", "password": "pw"}).json()["access_token"]
    bob_token = client.post("/api/auth/login", json={"username": "bob_sub", "password": "pw"}).json()["access_token"]
    alice_h = {"Authorization": f"Bearer {alice_token}"}
    bob_h = {"Authorization": f"Bearer {bob_token}"}
    alice_task = client.post("/api/tasks", json={"title": "Alice Task"}, headers=alice_h).json()
    resp = client.post("/api/tasks", json={"title": "Bob Sub", "parent_id": alice_task["id"]}, headers=bob_h)
    assert resp.status_code == 403
