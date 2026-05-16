# Light Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a light/dark theme toggle pinned to the sidebar bottom, persisted in localStorage, using CSS custom property overrides on `body.light`.

**Architecture:** `body.light` CSS class overrides all `--bg-*`, `--border`, `--text`, `--text-dim` variables. A toggle button in the sidebar and mobile drawer switches the class and saves to localStorage. An IIFE at the top of `app.js` applies the saved theme before first paint to prevent flash.

**Tech Stack:** Vanilla CSS custom properties, vanilla JS, localStorage.

---

## Files

| File | Change |
|------|--------|
| `static/style.css` | Add `body.light { ... }` block + `.sidebar-theme-toggle` style |
| `static/index.html` | Add `#theme-toggle` button to sidebar; `#theme-toggle-drawer` to mobile drawer |
| `static/app.js` | IIFE at top; `applyTheme()`; toggle click handlers in `DOMContentLoaded` |

---

### Task 1: CSS theme variables + toggle button style

**Files:**
- Modify: `static/style.css` (after line 14, after the `:root` block)

- [ ] **Step 1: Add `body.light` variable overrides**

In `static/style.css`, insert this block immediately after the closing `}` of the `:root` block (after line 14):

```css
body.light {
  --bg-base:  #f8f9fc;
  --bg-panel: #f0f2f7;
  --bg-card:  #ffffff;
  --bg-input: #ffffff;
  --border:   #d0d5e0;
  --text:     #1a2035;
  --text-dim: #5a6478;
}
```

- [ ] **Step 2: Add toggle button style**

Append to the bottom of `static/style.css`:

```css
.sidebar-theme-toggle {
  display: flex; align-items: center; gap: 8px;
  width: 100%; background: none; border: none;
  color: var(--text-dim); font-size: 12px;
  padding: 8px 16px; cursor: pointer; text-align: left;
  border-top: 1px solid var(--border);
}
.sidebar-theme-toggle:hover { color: var(--text); }
```

- [ ] **Step 3: Verify visually**

Hot-copy: `docker cp static/style.css mytask-mytask-1:/app/static/style.css`

Open http://10.0.0.149:8080 in a browser. The app should look unchanged (dark). No errors in console.

- [ ] **Step 4: Commit**

```bash
git add static/style.css
git commit -m "feat: add light mode CSS variables and toggle button style"
```

---

### Task 2: Toggle buttons in HTML

**Files:**
- Modify: `static/index.html`

- [ ] **Step 1: Add toggle to desktop sidebar**

In `static/index.html`, find the `<div class="sidebar-footer">` block (around line 52). Add the toggle button **before** that div, as the last child of `<aside class="sidebar">`:

```html
      <button id="theme-toggle" class="sidebar-theme-toggle">☀️ Light</button>
```

The full sidebar bottom should look like:

```html
      <button id="theme-toggle" class="sidebar-theme-toggle">☀️ Light</button>
      <div class="sidebar-footer">
        <span id="sidebar-username" class="sidebar-username"></span>
        <button id="logout-btn" class="sidebar-logout">Logout</button>
      </div>
    </aside>
```

- [ ] **Step 2: Add toggle to mobile drawer**

In `static/index.html`, find `<div id="mobile-drawer"`. Add the drawer toggle button **before** `<div class="sidebar-footer">` inside the drawer, mirroring the sidebar:

```html
      <button id="theme-toggle-drawer" class="sidebar-theme-toggle">☀️ Light</button>
      <div class="sidebar-footer">
        <span id="drawer-username" class="sidebar-username"></span>
      </div>
```

- [ ] **Step 3: Hot-copy and verify**

```bash
docker cp static/index.html mytask-mytask-1:/app/static/index.html
```

Open http://10.0.0.149:8080 — you should see a "☀️ Light" button at the bottom of the sidebar. Clicking it does nothing yet (no JS wired).

- [ ] **Step 4: Commit**

```bash
git add static/index.html
git commit -m "feat: add theme toggle buttons to sidebar and mobile drawer"
```

---

### Task 3: JavaScript — IIFE, applyTheme, click handlers

**Files:**
- Modify: `static/app.js`

- [ ] **Step 1: Add flash-prevention IIFE at the very top of app.js**

Insert this as the **first lines** of `static/app.js`, before `// State`:

```javascript
(function() {
  if (localStorage.getItem('theme') === 'light') {
    document.body.classList.add('light');
  }
})();
```

- [ ] **Step 2: Add `applyTheme` function**

Add this function after the `authHeaders()` function (around line 25):

```javascript
function applyTheme(theme) {
  document.body.classList.toggle('light', theme === 'light');
  localStorage.setItem('theme', theme);
  var isDark = theme !== 'light';
  var label = isDark ? '☀️ Light' : '🌙 Dark';
  var t1 = document.getElementById('theme-toggle');
  var t2 = document.getElementById('theme-toggle-drawer');
  if (t1) t1.textContent = label;
  if (t2) t2.textContent = label;
}
```

- [ ] **Step 3: Wire click handlers in DOMContentLoaded**

In the `DOMContentLoaded` listener (around line 2139), add after the existing button listeners:

```javascript
  function onThemeToggle() {
    var current = localStorage.getItem('theme') || 'dark';
    applyTheme(current === 'light' ? 'dark' : 'light');
  }
  var tt = document.getElementById('theme-toggle');
  var ttd = document.getElementById('theme-toggle-drawer');
  if (tt) tt.addEventListener('click', onThemeToggle);
  if (ttd) ttd.addEventListener('click', onThemeToggle);
```

- [ ] **Step 4: Sync label on page load**

At the **end** of the `initApp()` function (the last line before the closing `}`), add:

```javascript
  applyTheme(localStorage.getItem('theme') || 'dark');
```

- [ ] **Step 5: Hot-copy and test**

```bash
docker cp static/app.js mytask-mytask-1:/app/static/app.js
```

Open http://10.0.0.149:8080:
1. Click "☀️ Light" → app switches to light grey theme, button label changes to "🌙 Dark"
2. Refresh the page → light theme persists (no flash)
3. Click "🌙 Dark" → switches back to dark theme
4. Refresh → dark theme persists

- [ ] **Step 6: Commit**

```bash
git add static/app.js
git commit -m "feat: wire light/dark theme toggle with localStorage persistence"
```

---

### Task 4: Tests + push

**Files:**
- Test: `tests/test_tasks.py` (smoke check — no backend changes, just verify tests still pass)

- [ ] **Step 1: Run full test suite**

```bash
python3 -m pytest -v
```

Expected: all 93 tests pass (no backend changes were made).

- [ ] **Step 2: Push to GitHub**

```bash
git push origin master
```

- [ ] **Step 3: Hot-copy all changed static files**

```bash
docker cp static/style.css mytask-mytask-1:/app/static/style.css
docker cp static/index.html mytask-mytask-1:/app/static/index.html
docker cp static/app.js mytask-mytask-1:/app/static/app.js
```

No rebuild needed — all changes are static files only.
