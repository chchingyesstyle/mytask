# Projects & Tags Pages Design

**Date:** 2026-05-15
**Status:** Approved

## Overview

Replace the two placeholder pages (`#page-projects`, `#page-tags`) with fully functional CRUD management UIs. Both pages require minor new backend endpoints alongside purely frontend rendering.

---

## Section 1: Architecture

### Backend additions

Two new PUT endpoints are the only backend changes required. The existing `/api/statuses` CRUD (list, create, update, delete, reorder) already covers status management within projects.

| Endpoint | Purpose |
|---|---|
| `PUT /api/projects/{id}` | Rename a project |
| `PUT /api/tags/{id}` | Update a tag's name and/or color |

### Frontend additions

- `renderProjectsPage()` — builds the Projects page content inside `#page-projects`; called from `navigateTo('projects')`
- `renderTagsPage()` — builds the Tags page content inside `#page-tags`; called from `navigateTo('tags')`
- `navigateTo()` extended to call the relevant render function on page switch

All data is drawn from `allProjects` and `allTags` (already loaded at app init). Mutations call `loadProjects()` or `loadTags()` then re-render the page.

### Files changed

| File | Change |
|---|---|
| `routers/projects.py` | Add `PUT /{id}` rename endpoint |
| `routers/tags.py` | Add `PUT /{id}` update endpoint |
| `static/app.js` | Add `renderProjectsPage()`, `renderTagsPage()`, extend `navigateTo()` |
| `static/index.html` | Remove placeholder content inside `#page-projects` and `#page-tags` |
| `tests/test_projects.py` | Add rename tests |
| `tests/test_tags.py` | Add update tests |

---

## Section 2: Projects Page

### Layout

`#page-projects` contains:
- A `+ New Project` button (top right or header area)
- A vertical list of project cards

### Project card — collapsed state

```
┌─────────────────────────────────────────────────┐
│  Project Name            [3 tasks]  ↓  ✕        │
│  ● Todo  ● In Progress  ● Done                  │
└─────────────────────────────────────────────────┘
```

- Project name (bold)
- Task count badge (computed client-side: `allTasks.filter(t => t.project_id === p.id).length`)
- Status chips: colored dot + status name for each status in the project
- Chevron `↓` / `↑` to expand/collapse
- `✕` delete button — confirm dialog before deletion

### Project card — expanded state

```
┌─────────────────────────────────────────────────┐
│  [ New project name          ]  [Save] [Cancel]  │
│                                                  │
│  Statuses:                                       │
│  ■ Todo          [Edit] [↑] [↓] [✕]             │
│  ■ In Progress   [Edit] [↑] [↓] [✕]             │
│  ■ Done          [Edit] [↑] [↓] [✕]             │
│  [ + Add Status ]                                │
└─────────────────────────────────────────────────┘
```

- Rename field: text input pre-filled with current name; Save on Enter or Save button; Escape/Cancel discards
- Status list: one row per status with color swatch, name, and controls
- Status row edit: click Edit → inline rename + color picker on that row; Save/Cancel
- Delete status: blocked (button disabled) if it's the last remaining status; confirm dialog otherwise
- Up/Down arrows reorder statuses (calls `POST /api/statuses/reorder`)
- `+ Add Status` opens an inline form at the bottom: name input + color picker + Save/Cancel

### New project form

Clicking `+ New Project` shows an inline form above the card list:
- Text input for project name
- Save (Enter or button) → `POST /api/projects`, then `loadProjects()`, then re-render
- Cancel → dismiss form
- Duplicate names are allowed across different users (server enforces no unique constraint per-user, so no special handling needed client-side)

### Deletion

- Clicking `✕` on a project card shows: `"Delete project 'Name'? Tasks assigned to this project will become unassigned."` with OK/Cancel
- On confirm: `DELETE /api/projects/{id}`; on success `loadProjects()` and `loadTasks()` then re-render

---

## Section 3: Tags Page

### Layout

`#page-tags` contains:
- A `+ New Tag` button
- An inline create form (appears when button is clicked, dismissed after creation or cancel)
- A list of tag rows

### Tag row

```
┌──────────────────────────────────────────┐
│  ■ Tag Name                [Edit] [✕]   │
└──────────────────────────────────────────┘
```

- Color swatch (colored square, `20×20px`)
- Tag name
- `Edit` button → expands an inline edit row below this row
- `✕` delete button — confirm dialog; deletion cascades via `task_tags.ondelete="CASCADE"` (DB level)

### Inline edit row (tag)

```
┌──────────────────────────────────────────┐
│  ■ [ tag name input ]  [🎨] [Save] [✕] │
└──────────────────────────────────────────┘
```

- Text input pre-filled with current name
- Color picker input pre-filled with current color
- Save → `PUT /api/tags/{id}` with `{name, color}`; on success `loadTags()` and re-render
- Cancel → dismiss edit row
- 409 response: show inline error "Name already in use"

### New tag form (inline, top of list)

- Appears when `+ New Tag` is clicked
- Text input for name, color picker (default `#4a90d9`)
- Save → `POST /api/tags`; on success `loadTags()` and re-render
- Cancel → dismiss
- Only one new-tag form open at a time

### Deletion

- Confirm dialog: `"Delete tag 'Name'? It will be removed from all tasks."`
- On confirm: `DELETE /api/tags/{id}`; on success `loadTags()` and re-render

---

## Section 4: Backend Endpoints

### `PUT /api/projects/{id}`

```python
class ProjectUpdate(BaseModel):
    name: str

@router.put("/{project_id}")
def update_project(project_id: int, req: ProjectUpdate, ...):
    # 404 if not found
    # 403 if not owner and not admin
    # Update project.name
    # Return {"id", "name", "owner_id"}
```

No uniqueness constraint on project names (different users may share names; same user can have duplicates — by design).

### `PUT /api/tags/{id}`

```python
from typing import Optional

class TagUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None

@router.put("/{tag_id}")
def update_tag(tag_id: int, req: TagUpdate, ...):
    # 404 if not found
    # 409 if req.name conflicts with another existing tag name
    # Apply non-None fields
    # Return {"id", "name", "color"}
```

Tags are global (not user-scoped) per existing model — any authenticated user can update any tag.

---

## Section 5: Testing

### `tests/test_projects.py` additions

- `test_rename_project` — owner renames, gets updated name back
- `test_rename_project_not_owner` — 403
- `test_rename_project_not_found` — 404

### `tests/test_tags.py` additions (new file)

- `test_update_tag_name_and_color` — success, fields updated
- `test_update_tag_name_conflict` — 409 when name already taken
- `test_update_tag_not_found` — 404

### Existing tests

All 75+ existing tests must continue to pass. No changes to existing test logic.
