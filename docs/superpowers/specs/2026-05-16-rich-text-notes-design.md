# Rich Text Notes — Design Spec

**Goal:** Add full GitHub Flavored Markdown (GFM) support to task notes: always-rendered display in the expanded task card, and a toggle (Edit / Preview) in the task edit form.

**Architecture:** Frontend-only change. Notes already stored as plain TEXT in SQLite — no schema migration needed. Two CDN libraries added (marked.js + DOMPurify). A safe DOM-builder helper avoids `innerHTML` to satisfy the pre-commit security hook.

**Tech Stack:** marked.js (CDN), DOMPurify (CDN), vanilla JS, CSS custom properties.

---

## What changes

### index.html

Add two `<script>` tags before `app.js`:

```html
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/dompurify/dist/purify.min.js"></script>
```

### style.css

**`.notes-rendered`** — prose styles for rendered markdown output:
- `p`, `h1`–`h4`: margin, font-size, color via `var(--text)` / `var(--text-dim)`
- `ul`, `ol`: left padding, `list-style: disc / decimal`, line-height 1.7
- `blockquote`: `border-left: 2px solid var(--accent)`, left padding, italic, `var(--text-dim)` color
- `code` (inline): `background: var(--bg-input)`, `border-radius: var(--r-sm)`, monospace, `var(--accent)` color
- `pre code` (block): same background, `display: block`, padding, `overflow-x: auto`
- `table`: `border-collapse: collapse`, full width; `th`/`td`: `border: 1px solid var(--border)`, padding `4px 8px`; `th`: `var(--text-dim)`, left-aligned
- `a`: `color: var(--accent)`, no underline by default, underline on hover
- `strong`: `color: var(--text)`
- `em`: `color: var(--text-dim)`

**`.notes-tabs`** — toggle strip:
- `display: flex`, no gap, `border-bottom: 1px solid var(--border)`, `margin-bottom: 0`

**`.notes-tab`** — individual tab:
- `background: none`, `border: 1px solid var(--border)`, `border-bottom: none`, `border-radius: var(--r-sm) var(--r-sm) 0 0`
- `color: var(--text-dim)`, `font-size: 11px`, `padding: 3px 12px`, `cursor: pointer`

**`.notes-tab.active`** — active tab:
- `background: var(--bg-input)`, `color: var(--accent)`, `border-color: var(--border)`

**`.notes-editor`** — textarea in edit mode:
- Same styles as existing task edit textareas; `border-top: none`, `border-radius: 0 0 var(--r-sm) var(--r-sm)`, `font-family: monospace`, `font-size: 11px`, `min-height: 120px`, `resize: vertical`

**`.notes-preview`** — rendered preview div:
- `background: var(--bg-input)`, `border: 1px solid var(--border)`, `border-top: none`, `border-radius: 0 0 var(--r-sm) var(--r-sm)`, `padding: 10px 12px`, `min-height: 120px`

### app.js

#### New helper: `setMarkdownContent(el, mdText)`

Parses markdown and inserts rendered DOM nodes without using `innerHTML` (required by pre-commit hook):

```javascript
function setMarkdownContent(el, mdText) {
  var html = DOMPurify.sanitize(marked.parse(mdText || ''));
  var doc = new DOMParser().parseFromString(html, 'text/html');
  el.textContent = '';
  Array.from(doc.body.childNodes).forEach(function(node) {
    el.appendChild(document.importNode(node, true));
  });
}
```

#### New function: `renderNotesDisplay(notesText, container)`

Called from `toggleTask()` when expanding a card that has notes:

```javascript
function renderNotesDisplay(notesText, container) {
  container.textContent = '';
  if (!notesText || !notesText.trim()) return;
  var label = document.createElement('div');
  label.className = 'notes-display-label';
  label.textContent = 'Notes';
  var body = document.createElement('div');
  body.className = 'notes-rendered';
  setMarkdownContent(body, notesText);
  container.appendChild(label);
  container.appendChild(body);
}
```

#### New function: `buildNotesToggle(initialValue)`

Returns `{ el, getValue }` — the toggle UI element and a function to read the current value:

```javascript
function buildNotesToggle(initialValue) {
  var wrapper = document.createElement('div');
  var tabs = document.createElement('div');
  tabs.className = 'notes-tabs';

  var editTab = document.createElement('button');
  editTab.className = 'notes-tab active';
  editTab.textContent = 'Edit';
  var previewTab = document.createElement('button');
  previewTab.className = 'notes-tab';
  previewTab.textContent = 'Preview';
  tabs.appendChild(editTab);
  tabs.appendChild(previewTab);

  var textarea = document.createElement('textarea');
  textarea.className = 'notes-editor';
  textarea.value = initialValue || '';

  var preview = document.createElement('div');
  preview.className = 'notes-preview';
  preview.style.display = 'none';

  editTab.addEventListener('click', function() {
    editTab.classList.add('active');
    previewTab.classList.remove('active');
    textarea.style.display = '';
    preview.style.display = 'none';
  });

  previewTab.addEventListener('click', function() {
    previewTab.classList.add('active');
    editTab.classList.remove('active');
    textarea.style.display = 'none';
    preview.style.display = '';
    setMarkdownContent(preview, textarea.value);
  });

  wrapper.appendChild(tabs);
  wrapper.appendChild(textarea);
  wrapper.appendChild(preview);

  return { el: wrapper, getValue: function() { return textarea.value; } };
}
```

#### Changes to `showTaskEditForm(t, detail)`

Replace the plain notes `<textarea>` with `buildNotesToggle()`:

- Remove: `var notesInput = document.createElement('textarea'); notesInput.id = 'te-notes'; ...`
- Add: `var notesToggle = buildNotesToggle(t.notes);`
- Append `notesToggle.el` instead of `notesInput`
- In the save handler, read `notesToggle.getValue()` instead of `notesInput.value`

#### Changes to `toggleTask(taskId)`

In the expanded card render block, after the existing status/tag/subtask zones, call `renderNotesDisplay(t.notes, notesContainer)` where `notesContainer` is a dedicated `<div>` appended to the detail panel.

This replaces the current plain-text notes display (if any).

---

## What does NOT change

- **New Task modal** — stays as plain `<textarea>`. Fast capture; user formats notes after creation.
- **Table view** — notes cells remain plain text. Rendering markdown inside table cells adds overhead and layout complexity.
- **Board / Calendar / Timeline views** — card titles and bars are unchanged.
- **Backend** — no route changes, no model changes, no migration.
- **`task_to_dict()`** — already returns `notes` field as-is.

---

## Security

- `DOMPurify.sanitize()` runs before any DOM insertion, stripping `<script>`, `onerror`, `javascript:` hrefs, and all other XSS vectors.
- `setMarkdownContent()` uses `DOMParser` + `importNode` — no direct `innerHTML` assignment — satisfying the pre-commit hook.
- Single-user personal app, but sanitization is applied regardless.

---

## Testing

- Existing 107 tests are backend-only and unaffected.
- Manual verification:
  1. Create a task with full GFM notes (headings, bold, italic, list, blockquote, inline code, code block, table, link, strikethrough).
  2. Save — expanded card shows rendered HTML.
  3. Open edit form — Edit tab shows raw markdown; Preview tab renders it correctly.
  4. Clear notes, save — notes section disappears (no empty rendered block).
  5. New Task modal — plain textarea, no toggle.
  6. Light mode — rendered notes use correct `--text` / `--bg-input` vars.
  7. XSS probe: enter `<script>alert(1)</script>` in notes — must not execute.

---

## Version

App version bumped to **2.1** in README and CLAUDE.md after implementation.
