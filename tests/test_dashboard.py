from unittest.mock import patch, AsyncMock

def test_dashboard_requires_auth(seeded_client):
    resp = seeded_client.get("/api/dashboard")
    assert resp.status_code == 401

def test_dashboard_counts_zero(admin_headers):
    client, headers = admin_headers
    with patch("routers.dashboard.client.chat.completions.create", new=AsyncMock(side_effect=Exception("skip"))):
        resp = client.get("/api/dashboard", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["overdue"] == 0
    assert data["due_today"] == 0
    assert data["due_week"] == 0
    assert data["ai_briefing"] is None

def test_dashboard_overdue_count(admin_headers):
    from datetime import date, timedelta
    client, headers = admin_headers
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    client.post("/api/tasks", json={"title": "Overdue Task", "due_date": yesterday, "status": "todo"}, headers=headers)
    with patch("routers.dashboard.client.chat.completions.create", new=AsyncMock(side_effect=Exception("skip"))):
        resp = client.get("/api/dashboard", headers=headers)
    assert resp.json()["overdue"] == 1

def test_dashboard_due_today_count(admin_headers):
    from datetime import date
    client, headers = admin_headers
    today = date.today().isoformat()
    client.post("/api/tasks", json={"title": "Today Task", "due_date": today}, headers=headers)
    with patch("routers.dashboard.client.chat.completions.create", new=AsyncMock(side_effect=Exception("skip"))):
        resp = client.get("/api/dashboard", headers=headers)
    assert resp.json()["due_today"] == 1

def test_dashboard_due_week_count(admin_headers):
    from datetime import date, timedelta
    client, headers = admin_headers
    in_3_days = (date.today() + timedelta(days=3)).isoformat()
    client.post("/api/tasks", json={"title": "Week Task", "due_date": in_3_days}, headers=headers)
    with patch("routers.dashboard.client.chat.completions.create", new=AsyncMock(side_effect=Exception("skip"))):
        resp = client.get("/api/dashboard", headers=headers)
    assert resp.json()["due_week"] == 1

def test_dashboard_done_tasks_excluded(admin_headers):
    from datetime import date, timedelta
    client, headers = admin_headers
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    client.post("/api/tasks", json={"title": "Done Overdue", "due_date": yesterday, "status_id": 3}, headers=headers)
    with patch("routers.dashboard.client.chat.completions.create", new=AsyncMock(side_effect=Exception("skip"))):
        resp = client.get("/api/dashboard", headers=headers)
    assert resp.json()["overdue"] == 0

def test_dashboard_ai_briefing_present(admin_headers):
    client, headers = admin_headers
    mock_resp = AsyncMock()
    mock_resp.choices = [AsyncMock()]
    mock_resp.choices[0].message.content = "Focus on overdue tasks first."
    with patch("routers.dashboard.client.chat.completions.create", new=AsyncMock(return_value=mock_resp)):
        resp = client.get("/api/dashboard", headers=headers)
    assert resp.json()["ai_briefing"] == "Focus on overdue tasks first."

def test_dashboard_ai_failure_returns_null(admin_headers):
    client, headers = admin_headers
    with patch("routers.dashboard.client.chat.completions.create", new=AsyncMock(side_effect=Exception("API down"))):
        resp = client.get("/api/dashboard", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["ai_briefing"] is None

def test_dashboard_overdue_tasks_list(admin_headers):
    from datetime import date, timedelta
    client, headers = admin_headers
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    client.post("/api/tasks", json={"title": "Fix server", "due_date": yesterday, "priority": "high"}, headers=headers)
    with patch("routers.dashboard.client.chat.completions.create", new=AsyncMock(side_effect=Exception("skip"))):
        resp = client.get("/api/dashboard", headers=headers)
    data = resp.json()
    assert len(data["overdue_tasks"]) == 1
    assert data["overdue_tasks"][0]["title"] == "Fix server"
    assert data["overdue_tasks"][0]["priority"] == "high"

def test_dashboard_today_tasks_list(admin_headers):
    from datetime import date
    client, headers = admin_headers
    today = date.today().isoformat()
    client.post("/api/tasks", json={"title": "Deploy hotfix", "due_date": today}, headers=headers)
    with patch("routers.dashboard.client.chat.completions.create", new=AsyncMock(side_effect=Exception("skip"))):
        resp = client.get("/api/dashboard", headers=headers)
    data = resp.json()
    assert len(data["today_tasks"]) == 1
    assert data["today_tasks"][0]["title"] == "Deploy hotfix"

def test_dashboard_projects_stats(admin_headers):
    client, headers = admin_headers
    proj_r = client.post("/api/projects", json={"name": "Alpha"}, headers=headers)
    proj_id = proj_r.json()["id"]
    client.post("/api/tasks", json={"title": "T1", "project_id": proj_id}, headers=headers)
    t2 = client.post("/api/tasks", json={"title": "T2", "project_id": proj_id}, headers=headers).json()
    client.put(f"/api/tasks/{t2['id']}", json={"status_id": 3}, headers=headers)
    with patch("routers.dashboard.client.chat.completions.create", new=AsyncMock(side_effect=Exception("skip"))):
        resp = client.get("/api/dashboard", headers=headers)
    projects = resp.json()["projects"]
    alpha = next(p for p in projects if p["name"] == "Alpha")
    assert alpha["total"] == 2
    assert alpha["done"] == 1

def test_dashboard_completed_7d(admin_headers):
    client, headers = admin_headers
    t = client.post("/api/tasks", json={"title": "Completed now"}, headers=headers).json()
    client.put(f"/api/tasks/{t['id']}", json={"status_id": 3}, headers=headers)
    with patch("routers.dashboard.client.chat.completions.create", new=AsyncMock(side_effect=Exception("skip"))):
        resp = client.get("/api/dashboard", headers=headers)
    c7d = resp.json()["completed_7d"]
    assert len(c7d) == 7
    assert c7d[6] >= 1

def test_dashboard_recent_activity(admin_headers):
    client, headers = admin_headers
    client.post("/api/tasks", json={"title": "Recent work"}, headers=headers)
    with patch("routers.dashboard.client.chat.completions.create", new=AsyncMock(side_effect=Exception("skip"))):
        resp = client.get("/api/dashboard", headers=headers)
    activity = resp.json()["recent_activity"]
    assert len(activity) >= 1
    assert activity[0]["title"] == "Recent work"
    assert "updated_at" in activity[0]
