def test_login_success(seeded_client):
    resp = seeded_client.post("/api/auth/login", json={"username": "admin", "password": "yesasia"})
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"

def test_login_wrong_password(seeded_client):
    resp = seeded_client.post("/api/auth/login", json={"username": "admin", "password": "wrong"})
    assert resp.status_code == 401

def test_login_unknown_user(seeded_client):
    resp = seeded_client.post("/api/auth/login", json={"username": "nobody", "password": "x"})
    assert resp.status_code == 401

def test_me_returns_current_user(admin_headers):
    client, headers = admin_headers
    resp = client.get("/api/auth/me", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["username"] == "admin"
    assert data["role"] == "admin"

def test_me_requires_auth(seeded_client):
    resp = seeded_client.get("/api/auth/me")
    assert resp.status_code == 401
