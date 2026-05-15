# Layout Redesign — Design Spec

## Goal

Replace the current split-panel layout (task list left, chat right, top nav) with a sidebar-based shell: labelled left sidebar for navigation, chat collapsed to a floating widget, and a responsive mobile layout using a hamburger drawer.

## Architecture

Pure frontend change — `static/index.html`, `static/app.js`, and `static/style.css` only. No backend changes. The existing page content (task list, dashboard, etc.) is preserved; only the shell around it changes.

## Layout — Desktop (> 768px)

### Sidebar

- Fixed left sidebar, 140px wide
- **Top:** MyTask logo
- **Nav items (top to bottom):** Tasks · Dashboard · Projects · Tags
- **Admin link:** shown only when `currentUser.role === 'admin'`
- **Bottom (pinned):** username display + Logout button
- Active item highlighted (accent background + text colour)
- Sidebar is always visible; no collapse on desktop

### Main content area

- Fills remaining width to the right of the sidebar
- Contains a slim page title bar at the top (page name only — no top nav)
- Below that: existing page content (filter bar + task list for Tasks page, etc.)

### Removed

- Top `<nav class="topnav">` — fully removed; logo, username, admin link, logout move into sidebar
- Dashboard strip (`#dashboard-strip`) inside the task panel — Dashboard becomes its own page
- Chat split-panel (`<div class="chat-panel">`) — replaced by floating widget

## Chat Widget

### Collapsed state

- 💬 FAB button, fixed position, bottom-right (20px from edges)
- 42px diameter, accent colour, subtle drop shadow
- Always visible regardless of current page

### Expanded state

- Triggered by clicking the FAB
- A panel (280px wide, 340px tall) slides up from the bottom-right corner
- Anchored to bottom-right; does not cover the sidebar
- Panel contains: header (AI dot + "AI Assistant" + model label + ✕ close), message list, input row
- ✕ button or clicking the FAB again closes the panel
- Chat state (message history) persists while navigating between pages

## Navigation & Pages

Clicking a sidebar item swaps the main content area. Each page is a `<div>` shown/hidden by JS — no full page reload.

| Page | Nav label | Content |
|------|-----------|---------|
| Tasks | ✓ Tasks | Existing filter bar + task list + new task footer |
| Dashboard | 📊 Dashboard | Existing dashboard stats + AI briefing (full page) |
| Projects | 📁 Projects | Placeholder — "coming soon" panel for now |
| Tags | 🏷 Tags | Placeholder — "coming soon" panel for now |

`currentPage` module-level variable (string: `'tasks'`, `'dashboard'`, `'projects'`, `'tags'`) tracks active page. `navigateTo(page)` shows the correct content div and updates sidebar active state.

## Layout — Mobile (≤ 768px)

- Sidebar hidden by default (`display: none`)
- Slim top bar visible: ☰ hamburger (left) + page title (centre)
- Tapping ☰ slides a drawer in from the left (same nav items as desktop sidebar)
- Semi-transparent overlay covers the content behind the open drawer; tapping it closes the drawer
- Navigating to a page closes the drawer automatically
- 💬 FAB and chat panel work identically to desktop
- Task list uses full screen width (no sidebar taking space)

## State Management

- `currentPage` — active nav page (`'tasks'` default)
- `chatOpen` — boolean, whether chat panel is visible
- `drawerOpen` — boolean (mobile only), whether hamburger drawer is open
- Existing state vars (`expandedTaskId`, `editingTaskId`, `editingStepId`) unchanged

## Files Changed

| File | Change |
|------|--------|
| `static/index.html` | Replace topnav + split-view structure with sidebar shell + page divs + chat FAB |
| `static/app.js` | Add `navigateTo()`, `toggleChat()`, `toggleDrawer()`; move init wiring; preserve all existing task/dashboard/tag logic |
| `static/style.css` | Add sidebar, page-content, chat-fab, chat-widget, mobile drawer styles; remove topnav and split-view styles |

## Error Handling

- Dashboard page load failure: show existing fallback (null briefing) — no change
- Chat widget: existing error handling unchanged

## Testing

Manual verification:
1. Desktop — sidebar visible, all 4 nav items work, active state highlights correctly
2. Desktop — 💬 opens chat panel from corner, ✕ closes it, message history persists across page switches
3. Desktop — Tasks page: filter bar, task list, inline edit all work as before
4. Desktop — Dashboard page: stats and AI briefing render correctly
5. Desktop — Projects/Tags pages: placeholder shown
6. Mobile — sidebar hidden, ☰ opens drawer, tapping nav item navigates and closes drawer
7. Mobile — overlay tap closes drawer
8. Mobile — chat FAB and panel work correctly at small screen size
9. Admin user sees Admin link in sidebar; non-admin does not
