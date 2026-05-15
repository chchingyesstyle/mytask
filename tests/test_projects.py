def test_create_project(admin_headers):
    client, headers = admin_headers
    resp = client.post("/api/projects", json={"name": "Server Infra"}, headers=headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Server Infra"
    assert len(data["statuses"]) == 3

def test_list_projects_empty(admin_headers):
    client, headers = admin_headers
    resp = client.get("/api/projects", headers=headers)
    assert resp.status_code == 200
    assert resp.json() == []

def test_list_projects(admin_headers):
    client, headers = admin_headers
    client.post("/api/projects", json={"name": "Proj A"}, headers=headers)
    client.post("/api/projects", json={"name": "Proj B"}, headers=headers)
    resp = client.get("/api/projects", headers=headers)
    assert len(resp.json()) == 2

def test_delete_project(admin_headers):
    client, headers = admin_headers
    proj_id = client.post("/api/projects", json={"name": "To Delete"}, headers=headers).json()["id"]
    assert client.delete(f"/api/projects/{proj_id}", headers=headers).status_code == 204
    assert client.get("/api/projects", headers=headers).json() == []

def test_regular_user_sees_only_own_projects(client):
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

    client.post("/api/projects", json={"name": "Alice Proj"}, headers=alice_h)
    client.post("/api/projects", json={"name": "Bob Proj"}, headers=bob_h)

    alice_projects = client.get("/api/projects", headers=alice_h).json()
    assert len(alice_projects) == 1
    assert alice_projects[0]["name"] == "Alice Proj"

def test_project_creation_seeds_statuses(admin_headers):
    client, headers = admin_headers
    proj_id = client.post("/api/projects", json={"name": "My Project"}, headers=headers).json()["id"]
    resp = client.get(f"/api/statuses?project_id={proj_id}", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 3
    assert data[0]["name"] == "Todo"
    assert data[1]["name"] == "In Progress"
    assert data[2]["name"] == "Done"
    assert all(s["project_id"] == proj_id for s in data)
