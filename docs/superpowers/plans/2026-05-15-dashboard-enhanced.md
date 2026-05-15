# Enhanced Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the dashboard from bare stat counts into an actionable page with clickable task lists, per-project progress bars, a 7-day completion sparkline, and a recent-activity feed.

**Architecture:** Three additive layers — (A) backend expansion of `GET /api/dashboard` to return task lists, project stats, sparkline data, and recent activity; (B) new HTML containers in the dashboard page; (C) JS rendering functions called from the existing `loadDashboard()`. A new `completed_at` datetime column on `Task` drives the sparkline; it is set/cleared by the `PUT /api/tasks/{id}` endpoint whenever `status_id` changes to or from a "Done" status.

**Tech Stack:** FastAPI, SQLAlchemy 2, SQLite, vanilla JS, CSS custom properties. No new dependencies.

**DOM note:** The codebase never uses `innerHTML`. Always use DOM methods (`createElement`, `textContent`, `appendChild`, `removeChild`). To clear a container use `while (el.firstChild) el.removeChild(el.firstChild);`

---

## File Map

| File | Change |
|------|--------|
| `models.py` | Add `completed_at` nullable DateTime column to `Task` |
| `main.py` | Add `ALTER TABLE tasks ADD COLUMN completed_at` to `_migrate()` |
| `routers/tasks.py` | Set/clear `task.completed_at` when `status_id` is updated to/from Done |
| `routers/dashboard.py` | Return `overdue_tasks`, `today_tasks`, `projects`, `completed_7d`, `recent_activity` |
| `tests/test_dashboard.py` | Add tests for new response fields |
| `tests/test_tasks.py` | Add test for `completed_at` being set on status change |
| `static/index.html` | Add container divs for task lists, projects, sparkline, activity |
| `static/app.js` | Expand `loadDashboard()` with five new render helpers |
| `static/style.css` | Styles for all new dashboard elements |

---

## Task 1: Add `completed_at` column and set it on status change

**Files:**
- Modify: `models.py`
- Modify: `main.py`
- Modify: `routers/tasks.py`
- Test: `tests/test_tasks.py`

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_tasks.py`:

```python
def test_completed_at_set_when_status_done(admin_headers):
    client, headers = admin_headers
    r = client.post("/api/tasks", json={"title": "Finish me"}, headers=headers)
    task_id = r.json()["id"]
    r2 = client.put(f"/api/tasks/{task_id}", json={"status_id": 3}, headers=headers)
    assert r2.status_code == 200
    assert r2.json()["completed_at"] is not None

def test_completed_at_cleared_when_status_not_done(admin_headers):
    client, headers = admin_headers
    r = client.post("/api/tasks", json={"title": "Undo me"}, headers=headers)
    task_id = r.json()["id"]
    client.put(f"/api/tasks/{task_id}", json={"status_id": 3}, headers=headers)
    r2 = client.put(f"/api/tasks/{task_id}", json={"status_id": 1}, headers=headers)
    assert r2.json()["completed_at"] is None
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
python3 -m pytest tests/test_tasks.py::test_completed_at_set_when_status_done -v
```

Expected: FAIL — `KeyError: 'completed_at'`

- [ ] **Step 3: Add `completed_at` to `models.py`**

In `models.py` inside `class Task`, add after `updated_at`:

```python
    completed_at = Column(DateTime, nullable=True)
```

- [ ] **Step 4: Add migration in `main.py`**

Inside `_migrate()`, after the `if "status_id" not in task_cols` block and before the `CREATE TABLE IF NOT EXISTS kb_documents` block, add:

```python
        if "completed_at" not in task_cols:
            conn.execute(text("ALTER TABLE tasks ADD COLUMN completed_at DATETIME"))
            conn.commit()
```

- [ ] **Step 5: Expose `completed_at` in `task_to_dict` in `routers/tasks.py`**

Find the `task_to_dict` function. Add `completed_at` to the returned dict:

```python
    "completed_at": task.completed_at.isoformat() if task.completed_at else None,
```

- [ ] **Step 6: Set/clear `completed_at` in the PUT handler in `routers/tasks.py`**

In the `update_task` function, after the `for field in req.model_fields_set` loop and before `task.updated_at = datetime.utcnow()`, add:

```python
    if "status_id" in req.model_fields_set:
        is_done = False
        if req.status_id:
            done_s = db.query(models.Status).filter(
                models.Status.id == req.status_id,
                models.Status.name.ilike("done")
            ).first()
            is_done = done_s is not None
        if is_done and not task.completed_at:
            task.completed_at = datetime.utcnow()
        elif not is_done:
            task.completed_at = None
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
python3 -m pytest tests/test_tasks.py::test_completed_at_set_when_status_done tests/test_tasks.py::test_completed_at_cleared_when_status_not_done -v
```

Expected: PASS

- [ ] **Step 8: Run full suite**

```bash
python3 -m pytest -v 2>&1 | tail -5
```

Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add models.py main.py routers/tasks.py tests/test_tasks.py
git commit -m "feat: add completed_at to Task; set/clear on status_id change"
```

---

## Task 2: Expand `GET /api/dashboard` response

**Files:**
- Modify: `routers/dashboard.py`
- Test: `tests/test_dashboard.py`

- [ ] **Step 1: Write failing tests**

Add to `tests/test_dashboard.py`:

```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
python3 -m pytest tests/test_dashboard.py::test_dashboard_overdue_tasks_list tests/test_dashboard.py::test_dashboard_projects_stats -v
```

Expected: FAIL — `KeyError: 'overdue_tasks'`

- [ ] **Step 3: Rewrite `routers/dashboard.py`**

Replace the entire file:

```python
from datetime import date, timedelta, datetime as dt
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from auth import get_current_user
from ai.agent import client, MODEL
import models

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


def _task_mini(t):
    return {
        "id": t.id,
        "title": t.title,
        "priority": t.priority,
        "due_date": t.due_date.isoformat() if t.due_date else None,
        "project_name": t.project.name if t.project else None,
    }


@router.get("")
async def dashboard(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    today = date.today()
    week_end = today + timedelta(days=7)

    done_status_ids = [
        s.id for s in db.query(models.Status).filter(models.Status.name.ilike("done")).all()
    ]
    done_id_set = set(done_status_ids)

    base = db.query(models.Task).filter(
        models.Task.owner_id == current_user.id,
        models.Task.parent_id == None,  # noqa: E711
        ~models.Task.status_id.in_(done_status_ids) if done_status_ids else True,
    )

    overdue_tasks = base.filter(models.Task.due_date < today).all()
    today_tasks = base.filter(models.Task.due_date == today).all()
    week_count = base.filter(
        models.Task.due_date > today,
        models.Task.due_date <= week_end,
    ).count()

    # Project progress
    projects = db.query(models.Project).filter(
        models.Project.owner_id == current_user.id
    ).all()
    project_stats = []
    for proj in projects:
        proj_tasks = db.query(models.Task).filter(
            models.Task.owner_id == current_user.id,
            models.Task.project_id == proj.id,
            models.Task.parent_id == None,  # noqa: E711
        ).all()
        total = len(proj_tasks)
        if total == 0:
            continue
        done = sum(1 for t in proj_tasks if t.status_id in done_id_set)
        project_stats.append({"id": proj.id, "name": proj.name, "total": total, "done": done})

    # 7-day sparkline
    seven_days_ago = dt.utcnow().replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=6)
    completed_tasks = db.query(models.Task).filter(
        models.Task.owner_id == current_user.id,
        models.Task.parent_id == None,  # noqa: E711
        models.Task.completed_at >= seven_days_ago,
    ).all()
    completed_7d = [0] * 7
    for t in completed_tasks:
        delta = (today - t.completed_at.date()).days
        if 0 <= delta <= 6:
            completed_7d[6 - delta] += 1

    # Recent activity (last 5 root tasks by updated_at)
    recent = db.query(models.Task).filter(
        models.Task.owner_id == current_user.id,
        models.Task.parent_id == None,  # noqa: E711
    ).order_by(models.Task.updated_at.desc()).limit(5).all()
    recent_activity = [
        {
            "id": t.id,
            "title": t.title,
            "priority": t.priority,
            "updated_at": t.updated_at.isoformat(),
        }
        for t in recent
    ]

    ai_briefing = None
    try:
        task_lines = ", ".join(
            f"'{t.title}' ({'overdue' if t.due_date < today else 'due today'})"
            for t in (overdue_tasks + today_tasks)[:5]
        )
        prompt = (
            f"IT manager's urgent tasks: {task_lines or 'none'}. "
            f"Stats: {len(overdue_tasks)} overdue, {len(today_tasks)} due today. "
            "In one sentence, what should they focus on first?"
        )
        resp = await client.chat.completions.create(
            model=MODEL,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=80,
            stream=False,
        )
        ai_briefing = resp.choices[0].message.content.strip()
    except Exception:
        pass

    return {
        "overdue": len(overdue_tasks),
        "due_today": len(today_tasks),
        "due_week": week_count,
        "ai_briefing": ai_briefing,
        "overdue_tasks": [_task_mini(t) for t in overdue_tasks],
        "today_tasks": [_task_mini(t) for t in today_tasks],
        "projects": project_stats,
        "completed_7d": completed_7d,
        "recent_activity": recent_activity,
    }
```

- [ ] **Step 4: Run new dashboard tests**

```bash
python3 -m pytest tests/test_dashboard.py -v
```

Expected: all dashboard tests pass.

- [ ] **Step 5: Run full suite**

```bash
python3 -m pytest -v 2>&1 | tail -5
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add routers/dashboard.py tests/test_dashboard.py
git commit -m "feat: expand dashboard API with task lists, project stats, sparkline, activity"
```

---

## Task 3: Dashboard HTML containers + CSS

**Files:**
- Modify: `static/index.html`
- Modify: `static/style.css`

- [ ] **Step 1: Replace the dashboard page block in `static/index.html`**

Find this block:

```html
      <!-- Dashboard page -->
      <div id="page-dashboard" class="page" style="display:none">
        <div class="page-header"><h2>Dashboard</h2></div>
        <div class="dashboard-page-content">
          <div id="dashboard-strip" class="dashboard-strip">
            <div class="dashboard-stats">
              <div class="dashboard-stat overdue">
                <div class="stat-num" id="stat-overdue-num">0</div>
                <div class="stat-label">Overdue</div>
              </div>
              <div class="dashboard-stat today">
                <div class="stat-num" id="stat-today-num">0</div>
                <div class="stat-label">Due Today</div>
              </div>
              <div class="dashboard-stat week">
                <div class="stat-num" id="stat-week-num">0</div>
                <div class="stat-label">This Week</div>
              </div>
            </div>
            <div id="dashboard-briefing" class="briefing-line" style="display:none">
              <span class="briefing-icon">🤖</span>
              <span id="briefing-text"></span>
            </div>
          </div>
        </div>
      </div>
```

Replace with:

```html
      <!-- Dashboard page -->
      <div id="page-dashboard" class="page" style="display:none">
        <div class="page-header"><h2>Dashboard</h2></div>
        <div class="dashboard-page-content">
          <div id="dashboard-strip" class="dashboard-strip">
            <div class="dashboard-stats">
              <div class="dashboard-stat overdue">
                <div class="stat-num" id="stat-overdue-num">0</div>
                <div class="stat-label">Overdue</div>
              </div>
              <div class="dashboard-stat today">
                <div class="stat-num" id="stat-today-num">0</div>
                <div class="stat-label">Due Today</div>
              </div>
              <div class="dashboard-stat week">
                <div class="stat-num" id="stat-week-num">0</div>
                <div class="stat-label">This Week</div>
              </div>
            </div>
            <div id="dashboard-briefing" class="briefing-line" style="display:none">
              <span class="briefing-icon">🤖</span>
              <span id="briefing-text"></span>
            </div>
          </div>
          <div id="dashboard-task-lists"></div>
          <div id="dashboard-projects"></div>
          <div class="dashboard-bottom-row">
            <div id="dashboard-sparkline"></div>
            <div id="dashboard-activity"></div>
          </div>
        </div>
      </div>
```

- [ ] **Step 2: Add CSS to `static/style.css`**

Find `.briefing-icon { flex-shrink: 0; }` and add after it:

```css
/* ── Dashboard: task lists ─────────────────────────────── */
.dash-task-list { margin-bottom: 20px; }
.dash-task-list-title {
  font-size: 11px; font-weight: 600; text-transform: uppercase;
  letter-spacing: .05em; color: var(--text-dim); margin-bottom: 8px;
}
.dash-task-item {
  display: flex; align-items: center; gap: 8px;
  padding: 7px 10px; border-radius: 6px; cursor: pointer;
  background: var(--bg-card); border: 1px solid var(--border);
  margin-bottom: 5px; font-size: 13px;
}
.dash-task-item:hover { border-color: var(--accent); }
.dash-task-title { flex: 1; }
.dash-task-project { font-size: 11px; color: var(--text-dim); }
.dash-task-due { font-size: 11px; color: var(--danger); }
.dash-priority-dot {
  width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
}
.dash-priority-dot.high   { background: var(--danger); }
.dash-priority-dot.medium { background: var(--warning); }
.dash-priority-dot.low    { background: var(--success); }

/* ── Dashboard: project progress ──────────────────────── */
.dash-section-title {
  font-size: 11px; font-weight: 600; text-transform: uppercase;
  letter-spacing: .05em; color: var(--text-dim); margin-bottom: 10px;
}
.dash-project-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 10px; margin-bottom: 20px;
}
.dash-project-card {
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: 8px; padding: 12px 14px; cursor: pointer;
}
.dash-project-card:hover { border-color: var(--accent); }
.dash-project-name { font-size: 13px; font-weight: 600; margin-bottom: 5px; }
.dash-project-counts { font-size: 11px; color: var(--text-dim); margin-bottom: 6px; }
.dash-progress-track {
  height: 5px; border-radius: 3px; background: var(--border); overflow: hidden;
}
.dash-progress-fill {
  height: 100%; border-radius: 3px; background: var(--success); transition: width .3s;
}

/* ── Dashboard: bottom row ────────────────────────────── */
.dashboard-bottom-row { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 4px; }
.dashboard-bottom-row > div { flex: 1; min-width: 220px; }

/* ── Dashboard: sparkline ─────────────────────────────── */
.dash-sparkline {
  display: flex; align-items: flex-end; gap: 5px;
  height: 60px; margin: 8px 0 4px;
}
.dash-spark-bar-wrap {
  flex: 1; display: flex; flex-direction: column; align-items: center; gap: 3px;
}
.dash-spark-bar {
  width: 100%; border-radius: 3px 3px 0 0; background: var(--accent); min-height: 3px;
}
.dash-spark-label { font-size: 10px; color: var(--text-dim); }
.dash-sparkline-total { font-size: 11px; color: var(--text-dim); }

/* ── Dashboard: activity feed ─────────────────────────── */
.dash-activity-item {
  display: flex; align-items: center; gap: 8px;
  padding: 7px 10px; border-radius: 6px; cursor: pointer;
  background: var(--bg-card); border: 1px solid var(--border);
  margin-bottom: 5px; font-size: 13px;
}
.dash-activity-item:hover { border-color: var(--accent); }
.dash-activity-title-text { flex: 1; }
.dash-activity-time { font-size: 11px; color: var(--text-dim); flex-shrink: 0; }
```

- [ ] **Step 3: Commit**

```bash
git add static/index.html static/style.css
git commit -m "feat: dashboard HTML containers and CSS for task lists, projects, sparkline, activity"
```

---

## Task 4: Frontend — task lists under stat cards (Option A)

**Files:**
- Modify: `static/app.js`

- [ ] **Step 1: Replace `loadDashboard` and add `renderDashTaskLists`**

In `static/app.js`, find the entire `loadDashboard` function and replace it with:

```javascript
async function loadDashboard() {
  try {
    var resp = await fetch('/api/dashboard', { headers: authHeaders() });
    if (!resp.ok) return;
    var data = await resp.json();

    var strip = document.getElementById('dashboard-strip');
    if (strip) {
      strip.style.display = 'block';
      document.getElementById('stat-overdue-num').textContent = data.overdue;
      document.getElementById('stat-today-num').textContent = data.due_today;
      document.getElementById('stat-week-num').textContent = data.due_week;
      var briefingEl = document.getElementById('dashboard-briefing');
      if (briefingEl) {
        if (data.ai_briefing) {
          document.getElementById('briefing-text').textContent = data.ai_briefing;
          briefingEl.style.display = 'flex';
        } else {
          briefingEl.style.display = 'none';
        }
      }
    }

    if (currentPage !== 'dashboard') return;
    renderDashTaskLists(data);
    renderDashProjects(data);
    renderDashSparkline(data);
    renderDashActivity(data);
  } catch (e) { console.warn('Dashboard load failed:', e); }
}

function _clearEl(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

function renderDashTaskLists(data) {
  var container = document.getElementById('dashboard-task-lists');
  if (!container) return;
  _clearEl(container);

  function makeList(tasks, title, dueLabelFn) {
    if (!tasks || tasks.length === 0) return;
    var wrap = document.createElement('div');
    wrap.className = 'dash-task-list';
    var h = document.createElement('div');
    h.className = 'dash-task-list-title';
    h.textContent = title + ' (' + tasks.length + ')';
    wrap.appendChild(h);
    tasks.forEach(function(t) {
      var row = document.createElement('div');
      row.className = 'dash-task-item';
      var dot = document.createElement('span');
      dot.className = 'dash-priority-dot ' + (t.priority || 'medium');
      row.appendChild(dot);
      var titleEl = document.createElement('span');
      titleEl.className = 'dash-task-title';
      titleEl.textContent = t.title;
      row.appendChild(titleEl);
      if (t.project_name) {
        var proj = document.createElement('span');
        proj.className = 'dash-task-project';
        proj.textContent = t.project_name;
        row.appendChild(proj);
      }
      if (t.due_date) {
        var due = document.createElement('span');
        due.className = 'dash-task-due';
        due.textContent = dueLabelFn(t.due_date);
        row.appendChild(due);
      }
      row.addEventListener('click', function() { navigateTo('tasks'); });
      wrap.appendChild(row);
    });
    container.appendChild(wrap);
  }

  function overdueLabel(d) {
    var days = Math.round((new Date() - new Date(d + 'T00:00:00')) / 86400000);
    return days === 1 ? '1 day overdue' : days + ' days overdue';
  }

  makeList(data.overdue_tasks, 'Overdue', overdueLabel);
  makeList(data.today_tasks, 'Due Today', function() { return 'today'; });
}
```

- [ ] **Step 2: Hot-copy and verify**

```bash
docker cp static/app.js mytask-mytask-1:/app/static/app.js
```

Open http://10.0.0.149:8080, go to Dashboard. Stat counts show. If tasks are overdue or due today, their titles appear as rows below the stat cards.

- [ ] **Step 3: Commit**

```bash
git add static/app.js
git commit -m "feat: dashboard task lists — overdue and today tasks shown by title"
```

---

## Task 5: Frontend — project progress panel (Option B)

**Files:**
- Modify: `static/app.js`

- [ ] **Step 1: Add `renderDashProjects` after `renderDashTaskLists`**

```javascript
function renderDashProjects(data) {
  var container = document.getElementById('dashboard-projects');
  if (!container) return;
  _clearEl(container);
  if (!data.projects || data.projects.length === 0) return;

  var title = document.createElement('div');
  title.className = 'dash-section-title';
  title.textContent = 'Project Progress';
  container.appendChild(title);

  var grid = document.createElement('div');
  grid.className = 'dash-project-grid';

  data.projects.forEach(function(proj) {
    var card = document.createElement('div');
    card.className = 'dash-project-card';

    var name = document.createElement('div');
    name.className = 'dash-project-name';
    name.textContent = proj.name;
    card.appendChild(name);

    var counts = document.createElement('div');
    counts.className = 'dash-project-counts';
    counts.textContent = proj.done + ' / ' + proj.total + ' done';
    card.appendChild(counts);

    var track = document.createElement('div');
    track.className = 'dash-progress-track';
    var fill = document.createElement('div');
    fill.className = 'dash-progress-fill';
    fill.style.width = (proj.total > 0 ? Math.round((proj.done / proj.total) * 100) : 0) + '%';
    track.appendChild(fill);
    card.appendChild(track);

    card.addEventListener('click', function() {
      navigateTo('tasks');
      var btn = document.querySelector('[data-project-id="' + proj.id + '"]');
      if (btn) btn.click();
    });

    grid.appendChild(card);
  });
  container.appendChild(grid);
}
```

- [ ] **Step 2: Hot-copy and verify**

```bash
docker cp static/app.js mytask-mytask-1:/app/static/app.js
```

Open Dashboard. Project cards with names, done/total counts, and progress bars appear below the task lists. Clicking navigates to Tasks page.

- [ ] **Step 3: Commit**

```bash
git add static/app.js
git commit -m "feat: dashboard project progress panel with completion bars"
```

---

## Task 6: Frontend — sparkline + activity feed (Option C)

**Files:**
- Modify: `static/app.js`

- [ ] **Step 1: Add `renderDashSparkline` and `renderDashActivity`**

```javascript
function renderDashSparkline(data) {
  var container = document.getElementById('dashboard-sparkline');
  if (!container) return;
  _clearEl(container);
  if (!data.completed_7d) return;

  var title = document.createElement('div');
  title.className = 'dash-section-title';
  title.textContent = 'Completed Last 7 Days';
  container.appendChild(title);

  var chart = document.createElement('div');
  chart.className = 'dash-sparkline';
  var maxVal = Math.max.apply(null, data.completed_7d) || 1;
  var dayLabels = ['6d', '5d', '4d', '3d', '2d', 'Ytd', 'Today'];
  data.completed_7d.forEach(function(count, i) {
    var wrap = document.createElement('div');
    wrap.className = 'dash-spark-bar-wrap';
    var bar = document.createElement('div');
    bar.className = 'dash-spark-bar';
    bar.style.height = Math.round((count / maxVal) * 100) + '%';
    bar.title = count + ' completed';
    wrap.appendChild(bar);
    var lbl = document.createElement('div');
    lbl.className = 'dash-spark-label';
    lbl.textContent = dayLabels[i];
    wrap.appendChild(lbl);
    chart.appendChild(wrap);
  });
  container.appendChild(chart);

  var total = data.completed_7d.reduce(function(a, b) { return a + b; }, 0);
  var tot = document.createElement('div');
  tot.className = 'dash-sparkline-total';
  tot.textContent = total + ' task' + (total !== 1 ? 's' : '') + ' completed this week';
  container.appendChild(tot);
}

function renderDashActivity(data) {
  var container = document.getElementById('dashboard-activity');
  if (!container) return;
  _clearEl(container);
  if (!data.recent_activity || data.recent_activity.length === 0) return;

  var title = document.createElement('div');
  title.className = 'dash-section-title';
  title.textContent = 'Recent Activity';
  container.appendChild(title);

  function relTime(iso) {
    var diff = Date.now() - new Date(iso).getTime();
    var mins = Math.floor(diff / 60000);
    if (mins < 2) return 'just now';
    if (mins < 60) return mins + 'm ago';
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    var days = Math.floor(hrs / 24);
    return days === 1 ? 'yesterday' : days + 'd ago';
  }

  data.recent_activity.forEach(function(t) {
    var row = document.createElement('div');
    row.className = 'dash-activity-item';
    var dot = document.createElement('span');
    dot.className = 'dash-priority-dot ' + (t.priority || 'medium');
    row.appendChild(dot);
    var ttl = document.createElement('span');
    ttl.className = 'dash-activity-title-text';
    ttl.textContent = t.title;
    row.appendChild(ttl);
    var time = document.createElement('span');
    time.className = 'dash-activity-time';
    time.textContent = relTime(t.updated_at);
    row.appendChild(time);
    row.addEventListener('click', function() { navigateTo('tasks'); });
    container.appendChild(row);
  });
}
```

- [ ] **Step 2: Hot-copy and verify**

```bash
docker cp static/app.js mytask-mytask-1:/app/static/app.js
```

Open Dashboard. Bottom row shows the 7-bar sparkline on the left and the recent activity list on the right.

- [ ] **Step 3: Commit**

```bash
git add static/app.js
git commit -m "feat: dashboard sparkline (7d completion chart) and recent activity feed"
```

---

## Task 7: Full rebuild and deploy

- [ ] **Step 1: Run full test suite**

```bash
python3 -m pytest -v 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 2: Rebuild Docker image** (required for models.py + routers changes)

```bash
./docker.sh rebuild
```

- [ ] **Step 3: Hot-copy static files**

```bash
docker cp static/app.js mytask-mytask-1:/app/static/app.js
docker cp static/style.css mytask-mytask-1:/app/static/style.css
docker cp static/index.html mytask-mytask-1:/app/static/index.html
```

- [ ] **Step 4: Smoke-test the Dashboard page**

Open http://10.0.0.149:8080, log in, navigate to Dashboard. Verify:
- Stats strip shows numbers and AI briefing
- Overdue / Today task lists appear as clickable rows (if tasks are due)
- Project cards with progress bars render (if projects have tasks)
- Sparkline bars appear (index 6 = today)
- Recent activity lists last 5 tasks with relative timestamps
- Clicking any row or project card navigates to the Tasks page
