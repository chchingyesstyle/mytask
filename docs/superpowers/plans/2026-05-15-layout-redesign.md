# Layout Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the split-panel layout with a labelled left sidebar, floating chat widget, and a hamburger drawer on mobile.

**Architecture:** Pure frontend change to three files: `static/index.html` (new shell structure), `static/style.css` (remove old nav/split-view, add sidebar/widget/mobile styles), `static/app.js` (add `navigateTo`, `toggleChat`, `toggleDrawer`, update `initApp` wiring). No backend changes. All existing task/dashboard/tag logic is preserved untouched.

**Tech Stack:** Vanilla JS (ES5-style var/function), CSS custom properties, no build step.

---

## Context for the implementer

The current app has a horizontal split: topnav across the top, task panel on the left (42% width), chat panel on the right (flex:1). We're replacing this with:

- **Left sidebar** (140px, always visible on desktop) — logo, nav items (Tasks/Dashboard/Projects/Tags), username + Logout at the bottom
- **Main content area** (flex:1) — shows one page at a time via show/hide divs
- **Chat FAB** (fixed, bottom-right) — 💬 button, clicking slides up a 280×340 panel
- **Mobile** (≤768px) — sidebar hidden, ☰ hamburger in a slim top bar opens a slide-in drawer

Key IDs that must be preserved (referenced by existing JS logic):
`task-list`, `filter-bar`, `filter-all`, `filter-today`, `filter-overdue`, `project-filters`, `tag-filters`, `new-task-btn`, `task-modal`, `mt-title`, `mt-priority`, `mt-due`, `mt-project`, `mt-notes`, `modal-create-btn`, `modal-cancel-btn`, `dashboard-strip`, `dashboard-briefing`, `briefing-text`, `stat-overdue-num`, `stat-today-num`, `stat-week-num`, `chat-messages`, `chat-input`, `send-btn`, `ai-dot`, `chat-model-label`, `login-screen`, `login-username`, `login-password`, `login-btn`, `login-error`

IDs changing:
- `nav-username` → `sidebar-username` (also add `drawer-username` for mobile)
- `logout-btn` → stays same ID, moves to sidebar
- `admin-link` → stays same ID, moves to sidebar
- `workspace-label` → removed
- `overdue-badge` → moves inside Tasks sidebar item

New IDs: `chat-fab`, `chat-widget`, `chat-close-btn`, `hamburger-btn`, `mobile-drawer`, `drawer-overlay`, `mobile-page-title`, `page-tasks`, `page-dashboard`, `page-projects`, `page-tags`

---

## Task 1: Rewrite index.html

**Files:**
- Modify: `static/index.html`

- [ ] **Step 1: Replace the entire file**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MyTask</title>
  <link rel="stylesheet" href="/static/style.css">
</head>
<body>

  <!-- Login Screen -->
  <div id="login-screen" class="login-screen">
    <div class="login-box">
      <div class="login-logo">MyTask</div>
      <p class="login-sub">Personal AI Task Manager</p>
      <div id="login-error" class="error-msg" style="display:none"></div>
      <input id="login-username" type="text" placeholder="Username" autocomplete="username">
      <input id="login-password" type="password" placeholder="Password" autocomplete="current-password">
      <button id="login-btn">Login</button>
    </div>
  </div>

  <!-- Main App -->
  <div id="app" style="display:none">

    <!-- Sidebar (desktop) -->
    <aside class="sidebar">
      <div class="sidebar-logo">MyTask</div>
      <nav class="sidebar-nav">
        <button class="sidebar-item active" data-page="tasks">
          <span class="sidebar-icon">✓</span>
          <span class="sidebar-label">Tasks</span>
          <span id="overdue-badge" class="overdue-badge" style="display:none"></span>
        </button>
        <button class="sidebar-item" data-page="dashboard">
          <span class="sidebar-icon">📊</span>
          <span class="sidebar-label">Dashboard</span>
        </button>
        <button class="sidebar-item" data-page="projects">
          <span class="sidebar-icon">📁</span>
          <span class="sidebar-label">Projects</span>
        </button>
        <button class="sidebar-item" data-page="tags">
          <span class="sidebar-icon">🏷</span>
          <span class="sidebar-label">Tags</span>
        </button>
        <a id="admin-link" href="/admin" class="sidebar-item" style="display:none">
          <span class="sidebar-icon">⚙</span>
          <span class="sidebar-label">Admin</span>
        </a>
      </nav>
      <div class="sidebar-footer">
        <span id="sidebar-username" class="sidebar-username"></span>
        <button id="logout-btn" class="sidebar-logout">Logout</button>
      </div>
    </aside>

    <!-- Mobile top bar -->
    <div class="mobile-topbar">
      <button id="hamburger-btn" class="hamburger-btn">☰</button>
      <span id="mobile-page-title" class="mobile-page-title">Tasks</span>
    </div>

    <!-- Mobile drawer -->
    <div id="mobile-drawer" class="mobile-drawer">
      <div class="sidebar-logo">MyTask</div>
      <nav class="sidebar-nav">
        <button class="drawer-item active" data-page="tasks">
          <span class="sidebar-icon">✓</span>
          <span class="sidebar-label">Tasks</span>
        </button>
        <button class="drawer-item" data-page="dashboard">
          <span class="sidebar-icon">📊</span>
          <span class="sidebar-label">Dashboard</span>
        </button>
        <button class="drawer-item" data-page="projects">
          <span class="sidebar-icon">📁</span>
          <span class="sidebar-label">Projects</span>
        </button>
        <button class="drawer-item" data-page="tags">
          <span class="sidebar-icon">🏷</span>
          <span class="sidebar-label">Tags</span>
        </button>
        <a id="admin-link-drawer" href="/admin" class="drawer-item" style="display:none">
          <span class="sidebar-icon">⚙</span>
          <span class="sidebar-label">Admin</span>
        </a>
      </nav>
      <div class="sidebar-footer">
        <span id="drawer-username" class="sidebar-username"></span>
      </div>
    </div>
    <div id="drawer-overlay" class="drawer-overlay" style="display:none"></div>

    <!-- Main content -->
    <main class="main-content">

      <!-- Tasks page -->
      <div id="page-tasks" class="page">
        <div class="filter-bar" id="filter-bar">
          <button class="filter-btn active" id="filter-all">All</button>
          <button class="filter-btn" id="filter-today">Today</button>
          <button class="filter-btn" id="filter-overdue">Overdue</button>
          <span id="project-filters"></span>
          <span id="tag-filters"></span>
        </div>
        <div id="task-list" class="task-list"></div>
        <div class="task-panel-footer">
          <button class="new-task-btn" id="new-task-btn">+ New Task</button>
        </div>
      </div>

      <!-- Dashboard page -->
      <div id="page-dashboard" class="page" style="display:none">
        <div class="page-header"><h2>Dashboard</h2></div>
        <div class="dashboard-page-content">
          <div id="dashboard-strip" class="dashboard-strip" style="display:block">
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

      <!-- Projects page -->
      <div id="page-projects" class="page" style="display:none">
        <div class="page-header"><h2>Projects</h2></div>
        <div class="placeholder-page">
          <div class="placeholder-icon">📁</div>
          <p>Projects page coming soon</p>
        </div>
      </div>

      <!-- Tags page -->
      <div id="page-tags" class="page" style="display:none">
        <div class="page-header"><h2>Tags</h2></div>
        <div class="placeholder-page">
          <div class="placeholder-icon">🏷</div>
          <p>Tags page coming soon</p>
        </div>
      </div>

    </main>
  </div>

  <!-- New Task Modal -->
  <div id="task-modal" class="modal-overlay" style="display:none">
    <div class="modal-box">
      <h3>New Task</h3>
      <input id="mt-title" type="text" placeholder="Task title (required)">
      <select id="mt-priority">
        <option value="high">High Priority</option>
        <option value="medium" selected>Medium Priority</option>
        <option value="low">Low Priority</option>
      </select>
      <input id="mt-due" type="date">
      <select id="mt-project">
        <option value="">No Project</option>
      </select>
      <textarea id="mt-notes" placeholder="Notes (optional)" rows="3"></textarea>
      <div class="modal-actions">
        <button id="modal-create-btn">Create Task</button>
        <button class="btn-secondary" id="modal-cancel-btn">Cancel</button>
      </div>
    </div>
  </div>

  <!-- Chat FAB -->
  <button id="chat-fab" class="chat-fab" style="display:none" aria-label="Open AI chat">💬</button>

  <!-- Chat widget -->
  <div id="chat-widget" class="chat-widget" style="display:none">
    <div class="chat-header">
      <div class="ai-dot" id="ai-dot"></div>
      <span class="chat-title">AI Assistant</span>
      <span class="chat-model" id="chat-model-label"></span>
      <button id="chat-close-btn" class="chat-close-btn" aria-label="Close chat">✕</button>
    </div>
    <div id="chat-messages" class="chat-messages"></div>
    <div class="chat-input-row">
      <input id="chat-input" type="text"
        placeholder="Tell me what to do... e.g. add task: review firewall logs">
      <button id="send-btn">Send</button>
    </div>
  </div>

  <script src="/static/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Verify the file saved correctly**

```bash
grep -c "sidebar\|chat-fab\|page-tasks\|mobile-drawer" /u01/project/mytask/static/index.html
```

Expected: output ≥ 10 (confirms all new elements are present)

- [ ] **Step 3: Commit**

```bash
cd /u01/project/mytask
git add static/index.html
git commit -m "feat: restructure index.html — sidebar shell, page divs, chat FAB"
```

---

## Task 2: Update style.css

**Files:**
- Modify: `static/style.css`

This task replaces the entire CSS file. All existing rules for login, inputs, buttons, task cards, subtasks, tags, modal, admin, inline edit, dashboard stats are preserved. Removed: `.topnav` and its children, `.split-view`, `.task-panel` (old sizing), `.chat-panel` (old panel), old `@media (max-width: 640px)`. Added: sidebar, mobile topbar, drawer, chat FAB, chat widget, page layout, responsive rules.

- [ ] **Step 1: Replace style.css with the complete new file**

```css
:root {
  --bg-base: #13152a;
  --bg-panel: #161929;
  --bg-card: #1e2235;
  --bg-input: #0f1525;
  --border: #2d3352;
  --text: #e0e0e0;
  --text-dim: #a8b8d8;
  --accent: #4a90d9;
  --danger: #e74c3c;
  --warning: #e67e22;
  --success: #2ecc71;
  --r: 6px;
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: var(--bg-base);
  color: var(--text);
  height: 100vh;
  overflow: hidden;
}

/* ── Login ── */
.login-screen {
  display: flex; align-items: center; justify-content: center;
  height: 100vh;
  background: radial-gradient(ellipse at center, #1a1f3a 0%, #0d0f1e 100%);
}
.login-box {
  background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px;
  padding: 40px 36px; width: 320px; display: flex; flex-direction: column; gap: 14px;
}
.login-logo { font-size: 24px; font-weight: 700; color: var(--accent); text-align: center; }
.login-sub { text-align: center; color: var(--text-dim); font-size: 13px; }
.login-box input, .login-box button { width: 100%; }

/* ── Shared inputs / buttons ── */
input, select, textarea {
  background: var(--bg-input); border: 1px solid var(--border); color: var(--text);
  padding: 8px 12px; border-radius: var(--r); font-size: 13px; outline: none;
  transition: border-color .15s;
}
input:focus, select:focus, textarea:focus { border-color: var(--accent); }
button {
  background: var(--accent); color: #fff; border: none;
  padding: 8px 16px; border-radius: var(--r); font-size: 13px;
  cursor: pointer; transition: opacity .15s;
}
button:hover { opacity: .85; }
button.btn-secondary { background: var(--border); }
.error-msg {
  background: #3d1515; color: var(--danger);
  border: 1px solid var(--danger); padding: 8px 12px;
  border-radius: var(--r); font-size: 12px;
}

/* ── App shell ── */
#app { display: flex; height: 100vh; overflow: hidden; }

/* ── Sidebar (desktop) ── */
.sidebar {
  width: 140px; flex-shrink: 0;
  background: var(--bg-panel); border-right: 1px solid var(--border);
  display: flex; flex-direction: column; overflow: hidden;
}
.sidebar-logo {
  padding: 16px 14px 14px;
  font-size: 16px; font-weight: 700; color: var(--accent);
  border-bottom: 1px solid var(--border); flex-shrink: 0;
}
.sidebar-nav {
  flex: 1; display: flex; flex-direction: column;
  padding: 6px 0; overflow-y: auto;
}
.sidebar-item {
  display: flex; align-items: center; gap: 8px;
  padding: 9px 14px; font-size: 12px; color: var(--text-dim);
  background: none; border: none; border-radius: 0; border-right: 2px solid transparent;
  cursor: pointer; text-decoration: none; text-align: left;
  width: 100%; transition: background .15s, color .15s;
}
.sidebar-item:hover { background: var(--bg-card); color: var(--text); opacity: 1; }
.sidebar-item.active {
  background: rgba(74,144,217,.12); color: var(--accent);
  border-right-color: var(--accent);
}
.sidebar-icon { font-size: 14px; flex-shrink: 0; }
.sidebar-label { flex: 1; }
.sidebar-footer {
  padding: 10px 14px; border-top: 1px solid var(--border);
  display: flex; flex-direction: column; gap: 6px; flex-shrink: 0;
}
.sidebar-username { color: var(--text-dim); font-size: 11px; }
.sidebar-logout {
  background: none; border: 1px solid var(--border);
  color: var(--text-dim); font-size: 11px; padding: 5px 8px; width: 100%;
}
.overdue-badge {
  background: var(--danger); color: #fff;
  font-size: 10px; padding: 1px 5px; border-radius: 8px; flex-shrink: 0;
}

/* ── Mobile top bar ── */
.mobile-topbar {
  display: none; align-items: center; gap: 12px;
  padding: 0 14px; height: 48px; flex-shrink: 0;
  background: var(--bg-panel); border-bottom: 1px solid var(--border);
}
.hamburger-btn {
  background: none; border: none; color: var(--text-dim);
  font-size: 20px; cursor: pointer; padding: 4px 2px; line-height: 1;
}
.hamburger-btn:hover { opacity: 1; color: var(--text); }
.mobile-page-title { font-size: 14px; font-weight: 600; }

/* ── Mobile drawer ── */
.mobile-drawer {
  position: fixed; top: 0; left: -200px; width: 200px; height: 100vh;
  background: var(--bg-panel); border-right: 1px solid var(--border);
  z-index: 300; display: flex; flex-direction: column;
  transition: left .25s ease;
}
.mobile-drawer.open { left: 0; }
.drawer-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,.5); z-index: 299;
}
.drawer-item {
  display: flex; align-items: center; gap: 8px;
  padding: 11px 16px; font-size: 13px; color: var(--text-dim);
  background: none; border: none; cursor: pointer;
  text-decoration: none; width: 100%; text-align: left;
  transition: background .15s, color .15s;
}
.drawer-item:hover { background: var(--bg-card); color: var(--text); opacity: 1; }
.drawer-item.active { color: var(--accent); background: rgba(74,144,217,.1); }

/* ── Main content ── */
.main-content {
  flex: 1; display: flex; flex-direction: column;
  overflow: hidden; min-width: 0;
}

/* ── Pages ── */
.page { display: flex; flex-direction: column; flex: 1; overflow: hidden; }
.page-header {
  padding: 14px 16px 12px; border-bottom: 1px solid var(--border); flex-shrink: 0;
}
.page-header h2 { font-size: 16px; font-weight: 600; }
.placeholder-page {
  flex: 1; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 12px; color: var(--text-dim);
}
.placeholder-icon { font-size: 48px; opacity: .35; }
.placeholder-page p { font-size: 14px; }

/* ── Filter bar ── */
.filter-bar {
  padding: 10px 12px; border-bottom: 1px solid var(--border);
  display: flex; flex-wrap: wrap; gap: 6px; align-items: center; flex-shrink: 0;
}
.filter-btn {
  background: var(--border); color: var(--text-dim);
  font-size: 11px; padding: 3px 10px; border-radius: 10px; border: none;
}
.filter-btn.active { background: var(--accent); color: #fff; }
.task-list { flex: 1; overflow-y: auto; padding: 10px; }
.task-panel-footer { padding: 10px 12px; border-top: 1px solid var(--border); flex-shrink: 0; }
.new-task-btn { width: 100%; }

/* ── Task cards ── */
.task-group-label {
  font-size: 10px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .5px; padding: 6px 4px 4px; margin-bottom: 4px;
}
.task-group-label.overdue { color: var(--danger); }
.task-group-label.in-progress { color: var(--accent); }
.task-group-label.todo { color: var(--text-dim); }
.task-group-label.done { color: var(--success); }
.task-card {
  background: var(--bg-card); border-left: 3px solid var(--border);
  border-radius: var(--r); padding: 8px 10px; margin-bottom: 6px;
  cursor: pointer; transition: border-color .15s;
}
.task-card:hover { border-left-color: var(--accent); }
.task-card.priority-high { border-left-color: var(--danger); }
.task-card.priority-medium { border-left-color: var(--warning); }
.task-card.priority-low { border-left-color: var(--success); }
.task-card.status-done { opacity: .55; }
.task-card-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 6px; }
.task-title { font-size: 13px; font-weight: 500; }
.priority-badge { font-size: 9px; padding: 1px 6px; border-radius: 8px; flex-shrink: 0; text-transform: uppercase; }
.priority-badge.high { background: rgba(231,76,60,.15); color: var(--danger); }
.priority-badge.medium { background: rgba(230,126,34,.15); color: var(--warning); }
.priority-badge.low { background: rgba(45,51,82,.5); color: var(--text-dim); }
.task-meta { color: var(--text-dim); font-size: 11px; margin-top: 3px; }
.task-detail { display: none; margin-top: 8px; border-top: 1px solid var(--border); padding-top: 8px; }
.task-detail.open { display: block; }
.task-detail-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.task-detail-actions button, .task-detail-actions select { font-size: 11px; padding: 4px 10px; }
.task-notes { color: var(--text-dim); font-size: 12px; margin-top: 6px; }
.btn-danger { background: var(--danger); }

/* ── Chat FAB ── */
.chat-fab {
  position: fixed; bottom: 20px; right: 20px;
  width: 42px; height: 42px; border-radius: 50%;
  background: var(--accent); color: #fff; font-size: 18px; border: none;
  cursor: pointer; box-shadow: 0 4px 16px rgba(0,0,0,.4);
  z-index: 200; display: flex; align-items: center; justify-content: center;
  padding: 0; transition: transform .15s;
}
.chat-fab:hover { transform: scale(1.08); opacity: 1; }

/* ── Chat widget ── */
.chat-widget {
  position: fixed; bottom: 74px; right: 20px;
  width: 280px; height: 340px;
  background: var(--bg-panel); border: 1px solid var(--accent);
  border-radius: 10px 10px 0 10px;
  display: flex; flex-direction: column;
  box-shadow: 0 8px 32px rgba(0,0,0,.4);
  z-index: 200;
  animation: chatSlideUp .2s ease;
}
@keyframes chatSlideUp {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}
.chat-header {
  padding: 10px 12px; border-bottom: 1px solid var(--border);
  display: flex; align-items: center; gap: 8px; flex-shrink: 0;
}
.ai-dot { width: 8px; height: 8px; background: var(--success); border-radius: 50%; flex-shrink: 0; }
.chat-title { font-size: 13px; font-weight: 500; }
.chat-model { color: var(--text-dim); font-size: 11px; flex: 1; }
.chat-close-btn {
  background: none; border: none; color: var(--text-dim);
  font-size: 16px; cursor: pointer; padding: 0; line-height: 1; flex-shrink: 0;
}
.chat-close-btn:hover { color: var(--text); opacity: 1; }
.chat-messages {
  flex: 1; overflow-y: auto; padding: 10px;
  display: flex; flex-direction: column; gap: 8px;
}
.chat-input-row {
  padding: 8px 10px; border-top: 1px solid var(--border);
  display: flex; gap: 6px; flex-shrink: 0;
}
.chat-input-row input { flex: 1; font-size: 12px; padding: 6px 10px; }
.chat-input-row button { font-size: 12px; padding: 6px 12px; }

/* ── Messages ── */
.msg { display: flex; gap: 8px; align-items: flex-start; }
.msg.user { flex-direction: row-reverse; }
.msg-avatar {
  width: 28px; height: 28px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 600; flex-shrink: 0;
}
.msg.ai .msg-avatar { background: var(--accent); }
.msg.user .msg-avatar { background: var(--border); }
.msg-bubble {
  background: var(--bg-card); color: var(--text); font-size: 12px;
  padding: 7px 11px; border-radius: 4px 10px 10px 10px;
  max-width: 85%; line-height: 1.55; white-space: pre-wrap; word-break: break-word;
}
.msg.user .msg-bubble {
  background: rgba(74,144,217,.12); border: 1px solid rgba(74,144,217,.25);
  border-radius: 10px 4px 10px 10px;
}
.msg-bubble.streaming::after { content: '\25AE'; animation: blink .7s infinite; }
@keyframes blink { 0%,100% { opacity:1; } 50% { opacity:0; } }
.tool-notice { color: var(--text-dim); font-size: 11px; font-style: italic; margin-top: 4px; }

/* ── Modal ── */
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,.6);
  display: flex; align-items: center; justify-content: center; z-index: 100;
}
.modal-box {
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: 10px; padding: 24px; width: 360px;
  display: flex; flex-direction: column; gap: 12px;
}
.modal-box h3 { font-size: 16px; }
.modal-box input, .modal-box select, .modal-box textarea { width: 100%; }
.modal-actions { display: flex; gap: 10px; }

/* ── Admin ── */
.admin-content { padding: 24px; max-width: 800px; margin: 0 auto; }
.admin-content h2 { font-size: 20px; margin-bottom: 20px; }
.create-user-form {
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: 8px; padding: 20px; margin-bottom: 24px;
  display: flex; flex-direction: column; gap: 12px;
}
.create-user-form h3 { font-size: 15px; }
.create-user-form input, .create-user-form select { width: 100%; }
.user-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.user-table th, .user-table td {
  text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--border);
}
.user-table th { color: var(--text-dim); font-weight: 600; font-size: 11px; text-transform: uppercase; }
.user-table tr:hover td { background: var(--bg-card); }

/* ── Dashboard page ── */
.dashboard-page-content { flex: 1; overflow-y: auto; padding: 16px; }
.dashboard-strip { background: none; border: none; padding: 0; }
.dashboard-stats { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
.dashboard-stat {
  flex: 1; min-width: 80px; border-radius: var(--r); padding: 10px 12px; text-align: center;
  border: 1px solid transparent;
}
.dashboard-stat.overdue { background: #3d1515; border-color: var(--danger); }
.dashboard-stat.today   { background: #2a1e0f; border-color: var(--warning); }
.dashboard-stat.week    { background: #0f1f15; border-color: var(--success); }
.stat-num { font-size: 22px; font-weight: 700; }
.dashboard-stat.overdue .stat-num { color: var(--danger); }
.dashboard-stat.today   .stat-num { color: var(--warning); }
.dashboard-stat.week    .stat-num { color: var(--success); }
.stat-label { color: var(--text-dim); font-size: 10px; margin-top: 2px; }
.briefing-line {
  background: var(--bg-card); border-radius: var(--r); padding: 10px 12px;
  font-size: 12px; color: var(--text-dim); line-height: 1.5;
  display: flex; gap: 8px; align-items: flex-start; margin-top: 4px;
}
.briefing-icon { flex-shrink: 0; }

/* ── Tag pills ── */
.tag-pills { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 5px; align-items: center; }
.tag-pill { font-size: 9px; padding: 1px 7px; border-radius: 8px; border: 1px solid transparent; }

/* ── Subtask rows ── */
.subtask-indicator { color: var(--text-dim); font-size: 10px; }
.subtask-section { margin-top: 8px; border-top: 1px solid var(--border); padding-top: 8px; }
.subtask-row { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; font-size: 11px; }
.subtask-row input[type="checkbox"] { cursor: pointer; flex-shrink: 0; accent-color: var(--success); }
.subtask-row.done > span:first-of-type { text-decoration: line-through; color: var(--text-dim); }
.subtask-nested-hint { color: var(--accent); font-size: 9px; cursor: pointer; flex-shrink: 0; }
.add-step-row { color: var(--accent); font-size: 11px; cursor: pointer; margin-top: 4px; padding: 2px 0; }
.add-step-row:hover { text-decoration: underline; }

/* ── Tag picker ── */
.tag-picker-section { margin-top: 8px; border-top: 1px solid var(--border); padding-top: 8px; }
.tag-picker-label { color: var(--text-dim); font-size: 10px; text-transform: uppercase; letter-spacing: .4px; margin-bottom: 5px; }
.tag-picker-list { display: flex; gap: 5px; flex-wrap: wrap; }
.tag-picker-item {
  cursor: pointer; font-size: 10px; padding: 2px 9px; border-radius: 8px;
  border: 1px solid transparent; transition: opacity .15s;
}
.tag-picker-item.assigned { opacity: 1; }
.tag-picker-item:not(.assigned) { opacity: 0.4; }
.tag-picker-item:hover { opacity: 1; }
input[type="color"] { width: 40px; height: 32px; padding: 2px; cursor: pointer; background: none; border: 1px solid var(--border); border-radius: var(--r); }

/* ── Task inline edit form ── */
.task-edit-form {
  border: 1px solid var(--accent); border-radius: var(--r);
  padding: 10px; margin-top: 8px; background: var(--bg-panel);
  display: flex; flex-direction: column; gap: 6px;
}
.task-edit-form .edit-label {
  font-size: 10px; color: var(--text-dim);
  text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 2px;
}
.task-edit-form .edit-row-2col { display: flex; gap: 8px; }
.task-edit-form .edit-row-2col > div { flex: 1; min-width: 0; }
.task-edit-form .edit-actions { display: flex; gap: 6px; justify-content: flex-end; margin-top: 2px; }
.task-edit-form input, .task-edit-form select, .task-edit-form textarea { font-size: 11px; padding: 4px 8px; }
.task-edit-form textarea { resize: vertical; min-height: 48px; font-family: inherit; }

/* ── Step pencil edit button ── */
.step-edit-btn {
  background: none; border: 1px solid var(--border);
  color: var(--text-dim); border-radius: 3px;
  padding: 1px 6px; font-size: 10px; cursor: pointer; flex-shrink: 0;
}
.step-edit-btn:hover { border-color: var(--accent); color: var(--accent); opacity: 1; }

/* ── Responsive (mobile ≤ 768px) ── */
@media (max-width: 768px) {
  body { overflow: auto; }
  #app { flex-direction: column; height: auto; min-height: 100vh; overflow: visible; }
  .sidebar { display: none; }
  .mobile-topbar { display: flex; }
  .main-content { overflow: visible; }
  .page { overflow: visible; }
  .task-list { overflow: visible; }
  .chat-widget { width: calc(100vw - 24px); right: 12px; }
  .chat-fab { bottom: 16px; right: 16px; }
}
```

- [ ] **Step 2: Verify no syntax errors by checking line count**

```bash
wc -l /u01/project/mytask/static/style.css
```

Expected: around 280–320 lines

- [ ] **Step 3: Commit**

```bash
git add static/style.css
git commit -m "feat: replace split-view CSS with sidebar, chat widget, mobile drawer styles"
```

---

## Task 3: Update app.js — navigation, chat widget, mobile drawer

**Files:**
- Modify: `static/app.js`

This task makes four targeted edits to `app.js`. Do NOT rewrite the whole file — only the changes described below.

- [ ] **Step 1: Add new state variables after the existing state block (after line 10)**

Find this block at the top of the file:
```javascript
let editingTaskId = null;
let editingStepId = null;
```

Add immediately after it:
```javascript
let currentPage = 'tasks';
let chatOpen = false;
let drawerOpen = false;
```

- [ ] **Step 2: Replace the `initApp` function**

Find and replace the entire `initApp` function (currently lines 47–69):

```javascript
async function initApp() {
  if (!getToken()) { showLogin(); return; }
  try {
    var resp = await fetch('/api/auth/me', { headers: authHeaders() });
    if (!resp.ok) { showLogin(); return; }
    currentUser = await resp.json();
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    document.getElementById('sidebar-username').textContent = currentUser.username;
    document.getElementById('drawer-username').textContent = currentUser.username;
    if (currentUser.role === 'admin') {
      document.getElementById('admin-link').style.display = 'flex';
      document.getElementById('admin-link-drawer').style.display = 'flex';
    }
    fetch('/api/info').then(function(r) { return r.json(); }).then(function(d) {
      var el = document.getElementById('chat-model-label');
      if (el) el.textContent = d.model || '';
    });
    document.getElementById('chat-fab').style.display = 'flex';
    // Wire sidebar nav items
    document.querySelectorAll('.sidebar-item[data-page]').forEach(function(el) {
      el.addEventListener('click', function() { navigateTo(el.dataset.page); });
    });
    document.querySelectorAll('.drawer-item[data-page]').forEach(function(el) {
      el.addEventListener('click', function() { navigateTo(el.dataset.page); if (drawerOpen) toggleDrawer(); });
    });
    await loadProjects();
    await loadTags();
    await loadTasks();
    addAiMessage('Hello ' + currentUser.username + '! I am your AI assistant. Tell me what tasks you need help with.');
  } catch (e) { showLogin(); }
}
```

- [ ] **Step 3: Replace the `showLogin` function**

Find and replace:
```javascript
function showLogin() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
}
```

Replace with:
```javascript
function showLogin() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
  document.getElementById('chat-fab').style.display = 'none';
  if (chatOpen) toggleChat();
}
```

- [ ] **Step 4: Add the three new functions after `showLogin`**

Insert the following three functions immediately after the `showLogin` function:

```javascript
function navigateTo(page) {
  currentPage = page;
  var pages = ['tasks', 'dashboard', 'projects', 'tags'];
  pages.forEach(function(p) {
    var el = document.getElementById('page-' + p);
    if (el) el.style.display = p === page ? 'flex' : 'none';
  });
  // Update sidebar active state
  document.querySelectorAll('.sidebar-item[data-page]').forEach(function(el) {
    el.classList.toggle('active', el.dataset.page === page);
  });
  document.querySelectorAll('.drawer-item[data-page]').forEach(function(el) {
    el.classList.toggle('active', el.dataset.page === page);
  });
  // Update mobile page title
  var titles = { tasks: 'Tasks', dashboard: 'Dashboard', projects: 'Projects', tags: 'Tags' };
  var titleEl = document.getElementById('mobile-page-title');
  if (titleEl) titleEl.textContent = titles[page] || page;
  // Load dashboard data when switching to that page
  if (page === 'dashboard') loadDashboard();
}

function toggleChat() {
  chatOpen = !chatOpen;
  var widget = document.getElementById('chat-widget');
  var fab = document.getElementById('chat-fab');
  widget.style.display = chatOpen ? 'flex' : 'none';
  fab.textContent = chatOpen ? '✕' : '💬';
  if (chatOpen) {
    var msgs = document.getElementById('chat-messages');
    msgs.scrollTop = msgs.scrollHeight;
    document.getElementById('chat-input').focus();
  }
}

function toggleDrawer() {
  drawerOpen = !drawerOpen;
  var drawer = document.getElementById('mobile-drawer');
  var overlay = document.getElementById('drawer-overlay');
  drawer.classList.toggle('open', drawerOpen);
  overlay.style.display = drawerOpen ? 'block' : 'none';
}
```

- [ ] **Step 5: Replace the `DOMContentLoaded` event wiring block**

Find the existing block starting with `document.addEventListener('DOMContentLoaded', function() {` (near the end of the file, ~line 943) and replace the entire block:

```javascript
document.addEventListener('DOMContentLoaded', function() {
  if (!document.getElementById('login-screen')) return;

  initApp();

  document.getElementById('login-btn').addEventListener('click', login);
  document.getElementById('logout-btn').addEventListener('click', logout);
  document.getElementById('login-password').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') login();
  });
  document.getElementById('send-btn').addEventListener('click', sendMessage);
  document.getElementById('chat-input').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') sendMessage();
  });
  document.getElementById('chat-fab').addEventListener('click', toggleChat);
  document.getElementById('chat-close-btn').addEventListener('click', toggleChat);
  document.getElementById('hamburger-btn').addEventListener('click', toggleDrawer);
  document.getElementById('drawer-overlay').addEventListener('click', toggleDrawer);
  document.getElementById('new-task-btn').addEventListener('click', showNewTaskForm);
  document.getElementById('modal-create-btn').addEventListener('click', createTask);
  document.getElementById('modal-cancel-btn').addEventListener('click', closeModal);
  document.getElementById('task-modal').addEventListener('click', function(e) {
    if (e.target === this) closeModal();
  });
  document.getElementById('filter-all').addEventListener('click', function() { setFilter('all', this); });
  document.getElementById('filter-today').addEventListener('click', function() { setFilter('today', this); });
  document.getElementById('filter-overdue').addEventListener('click', function() { setFilter('overdue', this); });
});
```

- [ ] **Step 6: Run the backend tests to confirm no breakage**

```bash
cd /u01/project/mytask
python3 -m pytest -v -q 2>&1 | tail -5
```

Expected: `74 passed` (or similar — all green, no failures)

- [ ] **Step 7: Commit**

```bash
git add static/app.js
git commit -m "feat: add navigateTo, toggleChat, toggleDrawer; update initApp for sidebar layout"
```

---

## Task 4: Deploy and manual verify

**Files:** none

- [ ] **Step 1: Rebuild the Docker container**

```bash
cd /u01/project/mytask
./docker.sh rebuild 2>&1 | tail -8
```

Expected: `MyTask rebuilt — open http://10.0.0.149:8080`

- [ ] **Step 2: Verify desktop layout**

Open `http://10.0.0.149:8080` in a browser (desktop window, > 768px wide).

Checklist:
- [ ] Sidebar visible on left with Tasks/Dashboard/Projects/Tags items
- [ ] Tasks item active (highlighted) by default
- [ ] Task list loads and shows tasks
- [ ] Clicking Dashboard shows stats + AI briefing
- [ ] Clicking Projects shows "coming soon" placeholder
- [ ] Clicking Tags shows "coming soon" placeholder
- [ ] Admin link visible when logged in as admin; hidden for regular users
- [ ] Logout button works
- [ ] 💬 FAB visible bottom-right
- [ ] Clicking 💬 opens chat panel; ✕ closes it; message history persists across page switches
- [ ] Inline task edit (✏ Edit) still works
- [ ] Inline step edit (✏ pencil) still works
- [ ] New Task modal still works

- [ ] **Step 3: Verify mobile layout**

In browser DevTools, switch to a mobile viewport (e.g. iPhone 12 — 390px wide).

Checklist:
- [ ] Sidebar is hidden
- [ ] ☰ top bar visible with page title
- [ ] Tapping ☰ slides in drawer from left
- [ ] Tapping a nav item navigates and closes drawer
- [ ] Tapping overlay behind drawer closes it
- [ ] 💬 FAB visible; chat panel opens correctly at mobile width

- [ ] **Step 4: Push to GitHub**

```bash
git push origin master
```

---

## Spec coverage check

| Spec requirement | Covered by |
|-----------------|-----------|
| Left sidebar 140px, logo + nav items | Task 1 (HTML) + Task 2 (CSS) |
| Tasks/Dashboard/Projects/Tags nav | Task 1 + Task 3 `navigateTo` |
| Admin link conditional on role | Task 3 `initApp` |
| Username + Logout in sidebar footer | Task 1 (HTML) |
| Top nav removed | Task 1 (HTML) + Task 2 (CSS) |
| Dashboard as own page, strip removed from tasks | Task 1 (HTML) |
| Chat FAB fixed bottom-right | Task 1 (HTML) + Task 2 (CSS) |
| Chat panel slides up on click | Task 3 `toggleChat` + Task 2 CSS animation |
| ✕ closes chat, FAB toggles | Task 3 event wiring |
| Chat history persists across pages | Existing `chatHistory` array unchanged |
| `currentPage`, `chatOpen`, `drawerOpen` state | Task 3 |
| Mobile sidebar hidden | Task 2 CSS media query |
| Mobile hamburger + drawer | Task 1 (HTML) + Task 2 (CSS) + Task 3 `toggleDrawer` |
| Overlay closes drawer | Task 3 event wiring |
| Projects/Tags placeholders | Task 1 (HTML) |
| No backend changes | ✓ only frontend files touched |
