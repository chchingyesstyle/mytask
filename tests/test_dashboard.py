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
