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

# KB tests

def test_kb_documents_table_exists(admin_headers):
    client, headers = admin_headers
    r = client.get("/api/kb?global=true", headers=headers)
    assert r.status_code == 200
    assert r.json() == []

import asyncio
from pathlib import Path
import tempfile

def test_extract_text_txt():
    from kb.extract import extract_text
    with tempfile.NamedTemporaryFile(suffix=".txt", mode="w", delete=False, encoding="utf-8") as f:
        f.write("Hello world")
        tmp = Path(f.name)
    result = asyncio.get_event_loop().run_until_complete(extract_text(tmp, "txt", None))
    tmp.unlink()
    assert result == "Hello world"

def test_extract_text_md():
    from kb.extract import extract_text
    with tempfile.NamedTemporaryFile(suffix=".md", mode="w", delete=False, encoding="utf-8") as f:
        f.write("# Title\nBody text")
        tmp = Path(f.name)
    result = asyncio.get_event_loop().run_until_complete(extract_text(tmp, "md", None))
    tmp.unlink()
    assert "Title" in result and "Body text" in result

def test_kb_upload_txt(admin_headers, tmp_path):
    client, headers = admin_headers
    txt_file = tmp_path / "test.txt"
    txt_file.write_text("Sample knowledge base content")
    with open(txt_file, "rb") as f:
        r = client.post("/api/kb", files={"file": ("test.txt", f, "text/plain")}, headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert data["title"] == "test.txt"
    assert data["file_type"] == "txt"
    assert data["has_text"] is True
    assert data["task_id"] is None

def test_kb_delete(admin_headers, tmp_path):
    client, headers = admin_headers
    txt_file = tmp_path / "del.txt"
    txt_file.write_text("Delete me")
    with open(txt_file, "rb") as f:
        r = client.post("/api/kb", files={"file": ("del.txt", f, "text/plain")}, headers=headers)
    doc_id = r.json()["id"]
    r2 = client.delete(f"/api/kb/{doc_id}", headers=headers)
    assert r2.status_code == 204
    r3 = client.get("/api/kb", headers=headers)
    ids = [d["id"] for d in r3.json()]
    assert doc_id not in ids

from unittest.mock import AsyncMock, patch, MagicMock

def test_task_ai_action(admin_headers):
    client, headers = admin_headers
    tasks_r = client.post("/api/tasks", json={"title": "Test AI Task"}, headers=headers)
    task_id = tasks_r.json()["id"]

    mock_response = MagicMock()
    mock_response.choices = [MagicMock()]
    mock_response.choices[0].message.content = "Meeting brief here."

    with patch("routers.tasks.openai_client") as mock_client:
        mock_client.chat = MagicMock()
        mock_client.chat.completions = MagicMock()
        mock_client.chat.completions.create = AsyncMock(return_value=mock_response)
        r = client.post(f"/api/tasks/{task_id}/ai-action",
                        json={"action": "meeting_prep"}, headers=headers)

    assert r.status_code == 200
    data = r.json()
    assert "result" in data

def test_change_password(admin_headers):
    client, headers = admin_headers
    # Wrong current password
    r = client.put("/api/auth/password",
                   json={"current_password": "wrongpass", "new_password": "newpass123"},
                   headers=headers)
    assert r.status_code == 400
    assert "incorrect" in r.json()["detail"].lower()

    # Too short new password
    r = client.put("/api/auth/password",
                   json={"current_password": "yesasia", "new_password": "abc"},
                   headers=headers)
    assert r.status_code == 400

    # Successful change
    r = client.put("/api/auth/password",
                   json={"current_password": "yesasia", "new_password": "newpass123"},
                   headers=headers)
    assert r.status_code == 200

    # Can log in with new password
    r2 = client.post("/api/auth/login", json={"username": "admin", "password": "newpass123"})
    assert r2.status_code == 200
