# Light Mode Design Spec

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a light/dark theme toggle to MyTask, defaulting to the existing dark theme, with user preference persisted in localStorage.

**Architecture:** A `body.light` CSS class overrides all custom properties. A toggle button at the bottom of the sidebar (and mobile drawer) adds/removes that class and saves the preference. No backend changes.

**Tech Stack:** Vanilla CSS custom properties, vanilla JS, localStorage.

---

## Theme Variables

Add a `body.light { ... }` block to `static/style.css` immediately after the existing `:root` block:

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

The following variables are **unchanged** between themes (they work on both backgrounds):
- `--accent: #4a90d9`
- `--danger: #e74c3c`
- `--warning: #e67e22`
- `--success: #2ecc71`
- `--r: 6px`

---

## Toggle Button

### Placement
- **Desktop sidebar** (`index.html`): a `<button id="theme-toggle">` added as the last item inside `.sidebar`, below the existing nav items and above nothing — pinned to the bottom via `margin-top: auto` on a wrapper div.
- **Mobile drawer** (`index.html`): same button duplicated as `<button id="theme-toggle-drawer">` at the bottom of `#mobile-drawer`.
- `admin.html` and `login.html` do **not** get a toggle (admin page has its own layout; login page is transient).

### Appearance
- Button class: `sidebar-theme-toggle`
- Label: `☀️ Light` when currently in dark mode (click → go light); `🌙 Dark` when currently in light mode (click → go dark)
- Style: same as other sidebar items but smaller, dimmer — matches `.sidebar-item` styling without the active highlight

### CSS for the toggle
```css
.sidebar-theme-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  background: none;
  border: none;
  color: var(--text-dim);
  font-size: 12px;
  padding: 8px 16px;
  cursor: pointer;
  text-align: left;
  border-top: 1px solid var(--border);
  margin-top: auto;
}
.sidebar-theme-toggle:hover { color: var(--text); }
```

---

## JavaScript (`static/app.js`)

### On page load (before `initApp`)
Read the stored preference and apply immediately to prevent a flash of the wrong theme:

```javascript
(function() {
  if (localStorage.getItem('theme') === 'light') {
    document.body.classList.add('light');
  }
})();
```

This IIFE must run before `DOMContentLoaded` fires (place it at the top of `app.js`, before any function definitions).

### `applyTheme(theme)`
```javascript
function applyTheme(theme) {
  document.body.classList.toggle('light', theme === 'light');
  localStorage.setItem('theme', theme);
  var label = theme === 'light' ? '🌙 Dark' : '☀️ Light';
  var t1 = document.getElementById('theme-toggle');
  var t2 = document.getElementById('theme-toggle-drawer');
  if (t1) t1.textContent = label;
  if (t2) t2.textContent = label;
}
```

### Toggle click handler (in `DOMContentLoaded`)
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

### Initial label sync (inside `initApp` or end of `DOMContentLoaded`)
```javascript
applyTheme(localStorage.getItem('theme') || 'dark');
```

---

## Files Changed

| File | Change |
|------|--------|
| `static/style.css` | Add `body.light { ... }` variable overrides + `.sidebar-theme-toggle` style |
| `static/index.html` | Add `#theme-toggle` button to sidebar bottom; `#theme-toggle-drawer` to mobile drawer |
| `static/app.js` | IIFE at top for flash prevention; `applyTheme()`; toggle click handlers in `DOMContentLoaded` |

---

## Out of Scope
- Per-user theme stored server-side (localStorage is sufficient for a personal app)
- System `prefers-color-scheme` media query auto-detection (user controls it manually)
- `admin.html` toggle (admin page is rarely used)
