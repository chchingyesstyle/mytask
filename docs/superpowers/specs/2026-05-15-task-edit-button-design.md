# Task & Step Edit Button — Design Spec

## Goal

Add inline editing to task cards and subtask/step rows so users can modify task title, due date, priority, and notes, and step title and due date, directly from the task list — without leaving the page or opening a separate modal.

## Architecture

All edits go through the existing `PUT /api/tasks/{id}` endpoint, which already accepts `title`, `priority`, `due_date`, and `notes`. No backend changes are required. The feature is entirely a frontend change to `static/app.js` and `static/style.css`.

## Task Card Editing

### Trigger
An **✏ Edit** button is added to the existing actions row in the task detail panel (the expanded section), placed between the status select and the Delete button.

### Behaviour
- Clicking **Edit** reveals an inline edit form below the actions row, inside the same card.
- The form contains: **title** (text input), **due date** (date input), **priority** (select: high/medium/low), **notes** (textarea, resizable).
- All fields are pre-filled with the task's current values.
- **Save** calls `PUT /api/tasks/{id}` with the updated fields, then reloads the task list (which re-renders the card in normal mode).
- **Cancel** or pressing **Escape** dismisses the form with no network call, restoring normal view.
- Only one task edit form may be open at a time. Opening a second collapses the first.

### Fields
| Field | Input type | Maps to API field |
|-------|-----------|-------------------|
| Title | `<input type="text">` | `title` |
| Due date | `<input type="date">` | `due_date` (empty string → `null`) |
| Priority | `<select>` high/medium/low | `priority` |
| Notes | `<textarea>` | `notes` (empty string → `null`) |

## Step / Subtask Row Editing

### Trigger
Each subtask row gains a small **✏ pencil button** on the right edge.

### Behaviour
- Clicking ✏ replaces the row's title span with an inline title input and an optional date input.
- Fields are pre-filled with the step's current title and due date (if any).
- **✓ (save)** calls `PUT /api/tasks/{id}` with `title` and `due_date`, then re-renders the subtask list.
- **✕ (cancel)** or **Escape** restores the row with no network call.
- **Enter** key saves.
- Only one step row may be in edit mode at a time.

### Fields
| Field | Input type | Maps to API field |
|-------|-----------|-------------------|
| Title | `<input type="text">` | `title` |
| Due date | `<input type="date">` | `due_date` (optional, empty → `null`) |

## Files Changed

| File | Change |
|------|--------|
| `static/app.js` | Add Edit button + inline form to `buildTaskCard()`; add pencil button + inline edit to `loadAndRenderSubtasks()` |
| `static/style.css` | Add `.task-edit-form` styles (bordered panel, label+input rows, save/cancel button row) |

No changes to backend routers, models, or tests.

## State Management

- `editingTaskId` — module-level variable (like `expandedTaskId`) tracks which task's edit form is open. `null` = none.
- `editingStepId` — tracks which subtask row is in edit mode. `null` = none.
- Both are reset on any successful save or cancel.

## Error Handling

- If the Save fetch fails (non-2xx), log to console and leave the form open so the user can retry.
- Title field must be non-empty before Save is enabled (disable the Save button if blank).

## Testing

Existing 74 tests are backend-only and unaffected. Manual verification:
1. Expand a task → click Edit → all fields pre-filled.
2. Change title, date, priority, notes → Save → card updates.
3. Click Edit → Escape → no change.
4. Open edit on task A → click Edit on task B → task A form closes.
5. Expand subtask list → click ✏ on a step → edit title and date → ✓ → row updates.
6. Edit step → Escape → no change.
7. Save with empty title → Save button disabled.
