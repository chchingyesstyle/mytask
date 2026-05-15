def test_admin_create_tag(admin_headers):
    client, headers = admin_headers
    resp = client.post("/api/tags", json={"name": "urgent", "color": "#e74c3c"}, headers=headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "urgent"
    assert data["color"] == "#e74c3c"
    assert "id" in data

def test_list_tags_any_user(admin_headers):
    client, headers = admin_headers
    client.post("/api/tags", json={"name": "server", "color": "#4a90d9"}, headers=headers)
    resp = client.get("/api/tags", headers=headers)
    assert resp.status_code == 200
    assert any(t["name"] == "server" for t in resp.json())

def test_non_admin_can_create_tag(client):
    from tests.conftest import TestingSessionLocal
    from auth import hash_password
    import models
    db = TestingSessionLocal()
    db.add(models.User(username="regular", password_hash=hash_password("pw"), role="user"))
    db.commit()
    db.close()
    token = client.post("/api/auth/login", json={"username": "regular", "password": "pw"}).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    resp = client.post("/api/tags", json={"name": "test", "color": "#ffffff"}, headers=headers)
    assert resp.status_code == 201

def test_admin_delete_tag(admin_headers):
    client, headers = admin_headers
    tag_id = client.post("/api/tags", json={"name": "todelete", "color": "#000000"}, headers=headers).json()["id"]
    del_resp = client.delete(f"/api/tags/{tag_id}", headers=headers)
    assert del_resp.status_code == 204
    tags = client.get("/api/tags", headers=headers).json()
    assert not any(t["id"] == tag_id for t in tags)

def test_non_admin_can_delete_tag(client):
    from tests.conftest import TestingSessionLocal
    from auth import hash_password
    import models
    db = TestingSessionLocal()
    db.add(models.User(username="regular2", password_hash=hash_password("pw"), role="user"))
    db.commit()
    db.close()
    token = client.post("/api/auth/login", json={"username": "regular2", "password": "pw"}).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    tag_id = client.post("/api/tags", json={"name": "usertag", "color": "#123456"}, headers=headers).json()["id"]
    resp = client.delete(f"/api/tags/{tag_id}", headers=headers)
    assert resp.status_code == 204

def test_tag_name_unique(admin_headers):
    client, headers = admin_headers
    client.post("/api/tags", json={"name": "dup", "color": "#fff"}, headers=headers)
    resp = client.post("/api/tags", json={"name": "dup", "color": "#000"}, headers=headers)
    assert resp.status_code == 409

def test_list_tags_requires_auth(seeded_client):
    resp = seeded_client.get("/api/tags")
    assert resp.status_code == 401
