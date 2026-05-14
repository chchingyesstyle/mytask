def test_create_project(admin_headers):
    client, headers = admin_headers
    resp = client.post("/api/projects", json={"name": "Server Infra"}, headers=headers)
    assert resp.status_code == 201
    assert resp.json()["name"] == "Server Infra"

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
