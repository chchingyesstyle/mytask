def test_list_users_as_admin(admin_headers):
    client, headers = admin_headers
    resp = client.get("/api/users", headers=headers)
    assert resp.status_code == 200
    assert any(u["username"] == "admin" for u in resp.json())

def test_create_user_as_admin(admin_headers):
    client, headers = admin_headers
    resp = client.post("/api/users", json={"username": "alice", "password": "pass123"}, headers=headers)
    assert resp.status_code == 201
    assert resp.json()["username"] == "alice"
    assert resp.json()["role"] == "user"

def test_create_duplicate_user(admin_headers):
    client, headers = admin_headers
    client.post("/api/users", json={"username": "bob", "password": "pass"}, headers=headers)
    resp = client.post("/api/users", json={"username": "bob", "password": "other"}, headers=headers)
    assert resp.status_code == 400

def test_delete_user_as_admin(admin_headers):
    client, headers = admin_headers
    uid = client.post("/api/users", json={"username": "todelete", "password": "x"}, headers=headers).json()["id"]
    assert client.delete(f"/api/users/{uid}", headers=headers).status_code == 204

def test_cannot_delete_self(admin_headers):
    client, headers = admin_headers
    me = client.get("/api/auth/me", headers=headers).json()
    resp = client.delete(f"/api/users/{me['id']}", headers=headers)
    assert resp.status_code == 400

def test_users_requires_auth(seeded_client):
    resp = seeded_client.get("/api/users")
    assert resp.status_code == 401
