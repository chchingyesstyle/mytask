def test_default_statuses_exist(admin_headers):
    client, headers = admin_headers
    resp = client.get("/api/statuses", headers=headers)
    # Router doesn't exist yet — expect 404 or 405, not 200
    # Once router is added in Task 2 this test will need to pass with 200.
    # For Task 1, just verify the DB has defaults via a direct model check.
    from tests.conftest import TestingSessionLocal
    import models
    db = TestingSessionLocal()
    defaults = db.query(models.Status).filter(models.Status.project_id == None).all()  # noqa: E711
    db.close()
    assert len(defaults) == 3
    names = {s.name for s in defaults}
    assert names == {"Todo", "In Progress", "Done"}

# ── LIST ───────────────────────────────────────────────────────────────────

def test_list_default_statuses(admin_headers):
    client, headers = admin_headers
    resp = client.get("/api/statuses", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 3
    assert data[0]["name"] == "Todo"
    assert data[1]["name"] == "In Progress"
    assert data[2]["name"] == "Done"

def test_list_statuses_for_project(admin_headers):
    client, headers = admin_headers
    proj_id = client.post("/api/projects", json={"name": "P1"}, headers=headers).json()["id"]
    resp = client.get(f"/api/statuses?project_id={proj_id}", headers=headers)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)

def test_list_statuses_requires_auth(seeded_client):
    resp = seeded_client.get("/api/statuses")
    assert resp.status_code == 401

# ── CREATE ─────────────────────────────────────────────────────────────────

def test_create_status_for_project(admin_headers):
    client, headers = admin_headers
    proj_id = client.post("/api/projects", json={"name": "Proj"}, headers=headers).json()["id"]
    resp = client.post("/api/statuses",
        json={"name": "Review", "color": "#9b59b6", "project_id": proj_id},
        headers=headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Review"
    assert data["project_id"] == proj_id

def test_create_status_non_owner_forbidden(client):
    from tests.conftest import TestingSessionLocal
    from auth import hash_password
    import models
    db = TestingSessionLocal()
    alice = models.User(username="alice_st", password_hash=hash_password("pw"), role="user")
    bob = models.User(username="bob_st", password_hash=hash_password("pw"), role="user")
    db.add_all([alice, bob])
    db.commit()
    db.close()
    alice_tok = client.post("/api/auth/login", json={"username": "alice_st", "password": "pw"}).json()["access_token"]
    bob_tok = client.post("/api/auth/login", json={"username": "bob_st", "password": "pw"}).json()["access_token"]
    alice_h = {"Authorization": f"Bearer {alice_tok}"}
    bob_h = {"Authorization": f"Bearer {bob_tok}"}
    proj_id = client.post("/api/projects", json={"name": "Alice Proj"}, headers=alice_h).json()["id"]
    resp = client.post("/api/statuses",
        json={"name": "X", "color": "#fff", "project_id": proj_id},
        headers=bob_h)
    assert resp.status_code == 403

# ── UPDATE ─────────────────────────────────────────────────────────────────

def test_update_status(admin_headers):
    client, headers = admin_headers
    proj_id = client.post("/api/projects", json={"name": "P"}, headers=headers).json()["id"]
    sid = client.post("/api/statuses",
        json={"name": "Draft", "color": "#fff", "project_id": proj_id},
        headers=headers).json()["id"]
    resp = client.put(f"/api/statuses/{sid}",
        json={"name": "Published", "color": "#2ecc71"},
        headers=headers)
    assert resp.status_code == 200
    assert resp.json()["name"] == "Published"

# ── DELETE ─────────────────────────────────────────────────────────────────

def test_delete_status_last_rejected(admin_headers):
    client, headers = admin_headers
    proj_id = client.post("/api/projects", json={"name": "P"}, headers=headers).json()["id"]
    # Project seeds 3 statuses. Delete 2 of them, then try to delete the last.
    statuses = client.get(f"/api/statuses?project_id={proj_id}", headers=headers).json()
    assert len(statuses) == 3
    client.delete(f"/api/statuses/{statuses[0]['id']}", headers=headers)
    client.delete(f"/api/statuses/{statuses[1]['id']}", headers=headers)
    resp = client.delete(f"/api/statuses/{statuses[2]['id']}", headers=headers)
    assert resp.status_code == 400

def test_delete_status_reassigns_tasks(admin_headers):
    client, headers = admin_headers
    proj_id = client.post("/api/projects", json={"name": "P"}, headers=headers).json()["id"]
    # Use the seeded statuses (position 0 = Todo, position 1 = In Progress)
    statuses = client.get(f"/api/statuses?project_id={proj_id}", headers=headers).json()
    s1 = statuses[0]["id"]  # first by position
    s2 = statuses[1]["id"]  # second by position
    task_id = client.post("/api/tasks",
        json={"title": "T", "project_id": proj_id, "status_id": s2},
        headers=headers).json()["id"]
    resp = client.delete(f"/api/statuses/{s2}", headers=headers)
    assert resp.status_code == 204
    task = client.get(f"/api/tasks/{task_id}", headers=headers).json()
    assert task["status_id"] == s1

# ── REORDER ────────────────────────────────────────────────────────────────

def test_reorder_statuses(admin_headers):
    client, headers = admin_headers
    proj_id = client.post("/api/projects", json={"name": "P"}, headers=headers).json()["id"]
    # Use the 3 seeded statuses (Todo, In Progress, Done)
    statuses = client.get(f"/api/statuses?project_id={proj_id}", headers=headers).json()
    s1, s2, s3 = statuses[0]["id"], statuses[1]["id"], statuses[2]["id"]
    # Reorder: s2, s3, s1
    resp = client.put("/api/statuses/reorder", json={"ids": [s2, s3, s1]}, headers=headers)
    assert resp.status_code == 200
    listed = client.get(f"/api/statuses?project_id={proj_id}", headers=headers).json()
    assert listed[0]["id"] == s2
    assert listed[1]["id"] == s3
    assert listed[2]["id"] == s1
