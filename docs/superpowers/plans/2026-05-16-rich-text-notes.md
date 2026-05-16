# Rich Text Notes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add GFM markdown rendering to task notes — always rendered in the expanded card, edit/preview toggle in the task edit form.

**Architecture:** Frontend-only. `marked.js` + `DOMPurify` from CDN. Notes already stored as TEXT in SQLite — no backend or schema changes. `setMarkdownContent()` uses `DOMParser` + `importNode` to avoid `innerHTML` (required by pre-commit hook).

**Tech Stack:** marked.js (CDN), DOMPurify (CDN), vanilla JS, CSS custom properties (OKLCH).

---

## File map

| File | Change |
|------|--------|
| `static/index.html` | Add 2 CDN `<script>` tags before `app.js` |
| `static/style.css` | Replace `.task-notes` plain style; add `.notes-rendered` prose + `.notes-tabs` / `.notes-tab` / `.notes-editor` / `.notes-preview` toggle UI |
| `static/app.js` | Add `setMarkdownContent()`, `renderNotesDisplay()`, `buildNotesToggle()`; update `buildTaskCard()` notes block; update `showTaskEditForm()` notes field |
| `README.md` | Bump version to 2.1; add markdown notes to features list |
| `CLAUDE.md` | Add notes conventions; bump version reference |

---

## Task 1: Load CDN libraries

**Files:**
- Modify: `static/index.html:297`

- [ ] **Step 1: Add marked.js and DOMPurify script tags**

Open `static/index.html`. Find the line:
```html
  <script src="/static/app.js"></script>
```
Replace it with:
```html
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/dompurify/dist/purify.min.js"></script>
  <script src="/static/app.js"></script>
```

- [ ] **Step 2: Verify libraries load**

Hot-copy and open the browser console at http://10.0.0.149:8080. Run:
```javascript
marked.parse('**hello**')
DOMPurify.sanitize('<b>ok</b>')
```
Expected: `'<p><strong>hello</strong></p>\n'` and `'<b>ok</b>'` — no errors.

```bash
docker cp static/index.html mytask-mytask-1:/app/static/index.html
```

- [ ] **Step 3: Commit**

```bash
git add static/index.html
git commit -m "feat: load marked.js and DOMPurify from CDN"
```

---

## Task 2: CSS — prose styles and toggle UI

**Files:**
- Modify: `static/style.css:240`

- [ ] **Step 1: Replace the plain `.task-notes` rule and add all new note classes**

In `static/style.css`, find line 240:
```css
.task-notes { color: var(--text-dim); font-size: 12px; margin-top: 6px; }
```
Replace it with:
```css
.task-notes-container { margin-top: 8px; }

/* ── Rendered markdown output ── */
.notes-rendered { font-size: 12px; line-height: 1.7; color: var(--text); }
.notes-rendered p { margin: 0 0 8px; }
.notes-rendered h1, .notes-rendered h2 { font-size: 14px; font-weight: 700; color: var(--text); margin: 10px 0 4px; }
.notes-rendered h3, .notes-rendered h4 { font-size: 12px; font-weight: 600; color: var(--text); margin: 8px 0 4px; }
.notes-rendered ul, .notes-rendered ol { padding-left: 18px; margin: 0 0 8px; }
.notes-rendered ul { list-style: disc; }
.notes-rendered ol { list-style: decimal; }
.notes-rendered li { margin-bottom: 2px; }
.notes-rendered blockquote { border-left: 2px solid var(--accent); margin: 0 0 8px; padding-left: 10px; color: var(--text-dim); font-style: italic; }
.notes-rendered code { background: var(--bg-input); border-radius: var(--r-sm); padding: 1px 4px; font-family: monospace; font-size: 11px; color: var(--accent); }
.notes-rendered pre { background: var(--bg-input); border-radius: var(--r-sm); padding: 8px 10px; margin: 0 0 8px; overflow-x: auto; }
.notes-rendered pre code { background: none; padding: 0; color: var(--text); display: block; }
.notes-rendered table { border-collapse: collapse; width: 100%; margin-bottom: 8px; font-size: 11px; }
.notes-rendered th, .notes-rendered td { border: 1px solid var(--border); padding: 4px 8px; text-align: left; }
.notes-rendered th { color: var(--text-dim); font-weight: 500; }
.notes-rendered a { color: var(--accent); text-decoration: none; }
.notes-rendered a:hover { text-decoration: underline; }
.notes-rendered strong { color: var(--text); font-weight: 600; }
.notes-rendered em { color: var(--text-dim); }
.notes-rendered del { opacity: 0.5; }
.notes-display-label { font-size: 10px; color: var(--text-dim); text-transform: uppercase; letter-spacing: .05em; margin-bottom: 6px; }

/* ── Edit / Preview toggle ── */
.notes-tabs { display: flex; border-bottom: 1px solid var(--border); margin-bottom: 0; }
.notes-tab { background: none; border: 1px solid var(--border); border-bottom: none; border-radius: var(--r-sm) var(--r-sm) 0 0; color: var(--text-dim); font-size: 11px; padding: 3px 12px; cursor: pointer; margin-right: 2px; }
.notes-tab.active { background: var(--bg-input); color: var(--accent); }
.notes-editor { display: block; width: 100%; box-sizing: border-box; background: var(--bg-input); border: 1px solid var(--border); border-top: none; border-radius: 0 0 var(--r-sm) var(--r-sm); color: var(--text); font-family: monospace; font-size: 11px; padding: 8px; min-height: 120px; resize: vertical; }
.notes-preview { background: var(--bg-input); border: 1px solid var(--border); border-top: none; border-radius: 0 0 var(--r-sm) var(--r-sm); padding: 10px 12px; min-height: 120px; }
```

- [ ] **Step 2: Hot-copy and verify styles load without errors**

```bash
docker cp static/style.css mytask-mytask-1:/app/static/style.css
```

Open browser devtools — no CSS parse errors in console.

- [ ] **Step 3: Commit**

```bash
git add static/style.css
git commit -m "feat: notes-rendered prose styles and edit/preview toggle CSS"
```

---

## Task 3: JS helpers — setMarkdownContent and renderNotesDisplay

**Files:**
- Modify: `static/app.js` — add two functions near the top of the file, after the module-level state vars (around line 20)

- [ ] **Step 1: Add setMarkdownContent and renderNotesDisplay**

In `static/app.js`, find the line:
```javascript
let chatOpen = false;
```
After that line (and any other `let`/`var` module-level declarations that follow), find the first function definition. Insert these two functions immediately before it:

```javascript
function setMarkdownContent(el, mdText) {
  var html = DOMPurify.sanitize(marked.parse(mdText || ''));
  var doc = new DOMParser().parseFromString(html, 'text/html');
  el.textContent = '';
  Array.from(doc.body.childNodes).forEach(function(node) {
    el.appendChild(document.importNode(node, true));
  });
}

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

- [ ] **Step 2: Hot-copy and smoke-test in console**

```bash
docker cp static/app.js mytask-mytask-1:/app/static/app.js
```

In browser console (after logging in):
```javascript
var div = document.createElement('div');
renderNotesDisplay('## Hello\n- item **one**\n- item two', div);
console.log(div.querySelector('h2').textContent); // "Hello"
console.log(div.querySelectorAll('li').length);   // 2
```

- [ ] **Step 3: Run backend tests**

```bash
python3 -m pytest -v --tb=short 2>&1 | tail -5
```
Expected: `107 passed`

- [ ] **Step 4: Commit**

```bash
git add static/app.js
git commit -m "feat: setMarkdownContent and renderNotesDisplay helpers"
```

---

## Task 4: JS — buildNotesToggle

**Files:**
- Modify: `static/app.js` — add function immediately after `renderNotesDisplay`

- [ ] **Step 1: Add buildNotesToggle**

Immediately after the closing brace of `renderNotesDisplay`, insert:

```javascript
function buildNotesToggle(initialValue) {
  var wrapper = document.createElement('div');

  var tabs = document.createElement('div');
  tabs.className = 'notes-tabs';

  var editTab = document.createElement('button');
  editTab.className = 'notes-tab active';
  editTab.textContent = 'Edit';
  editTab.type = 'button';

  var previewTab = document.createElement('button');
  previewTab.className = 'notes-tab';
  previewTab.textContent = 'Preview';
  previewTab.type = 'button';

  tabs.appendChild(editTab);
  tabs.appendChild(previewTab);

  var textarea = document.createElement('textarea');
  textarea.className = 'notes-editor';
  textarea.value = initialValue || '';
  textarea.placeholder = 'Notes — markdown supported';

  var preview = document.createElement('div');
  preview.className = 'notes-preview';
  preview.style.display = 'none';

  editTab.addEventListener('click', function(e) {
    e.stopPropagation();
    editTab.classList.add('active');
    previewTab.classList.remove('active');
    textarea.style.display = '';
    preview.style.display = 'none';
  });

  previewTab.addEventListener('click', function(e) {
    e.stopPropagation();
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

- [ ] **Step 2: Hot-copy and verify in console**

```bash
docker cp static/app.js mytask-mytask-1:/app/static/app.js
```

In browser console:
```javascript
var tog = buildNotesToggle('**bold**');
document.body.appendChild(tog.el);
// You should see the Edit/Preview tab strip appear at page bottom
console.log(tog.getValue()); // "**bold**"
```

Remove it after: `tog.el.remove()`

- [ ] **Step 3: Commit**

```bash
git add static/app.js
git commit -m "feat: buildNotesToggle — Edit/Preview tab widget"
```

---

## Task 5: Wire up — task card display and edit form

**Files:**
- Modify: `static/app.js:823-828` (notes block in `buildTaskCard`)
- Modify: `static/app.js:2221-2222,2250,2283` (notes field in `showTaskEditForm`)

- [ ] **Step 1: Replace plain-text notes block in buildTaskCard**

Find this block in `buildTaskCard` (around line 823):
```javascript
  if (t.notes) {
    var notesEl = document.createElement('div');
    notesEl.className = 'task-notes';
    notesEl.textContent = t.notes;
    detail.appendChild(notesEl);
  }
```
Replace it with:
```javascript
  var notesContainer = document.createElement('div');
  notesContainer.className = 'task-notes-container';
  renderNotesDisplay(t.notes, notesContainer);
  detail.appendChild(notesContainer);
```

- [ ] **Step 2: Replace plain textarea in showTaskEditForm**

Find these two lines in `showTaskEditForm` (around line 2221):
```javascript
  var notesArea = document.createElement('textarea');
  notesArea.value = t.notes || '';
```
Replace them with:
```javascript
  var notesToggle = buildNotesToggle(t.notes);
```

Find this line (around line 2250):
```javascript
  form.appendChild(field('Notes', notesArea));
```
Replace it with:
```javascript
  form.appendChild(field('Notes', notesToggle.el));
```

Find this line in the save handler (around line 2283):
```javascript
      notes: notesArea.value.trim() || null,
```
Replace it with:
```javascript
      notes: notesToggle.getValue().trim() || null,
```

- [ ] **Step 3: Hot-copy and manually verify**

```bash
docker cp static/app.js mytask-mytask-1:/app/static/app.js
```

Open http://10.0.0.149:8080 and verify each item:

1. Create a task with these notes:
```
## Scope
- Check **eth0** rules
- Verify `iptables -L INPUT`

> Confirm with vendor before removing.

| Rule | Port |
|------|------|
| allow-ssh | 22 |
```
2. Save — expanded card shows rendered headings, bullet, code, blockquote, table.
3. Click Edit — the Edit tab is active; textarea shows raw markdown.
4. Click Preview tab — rendered HTML appears.
5. Clear notes entirely, save — notes section is gone (no empty block).
6. New Task modal — plain textarea, no toggle.
7. Toggle to light mode — colors use CSS vars correctly.
8. XSS: set notes to `<script>alert(1)</script>`, save — no alert fires.

- [ ] **Step 4: Run backend tests**

```bash
python3 -m pytest -v --tb=short 2>&1 | tail -5
```
Expected: `107 passed`

- [ ] **Step 5: Commit**

```bash
git add static/app.js
git commit -m "feat: render markdown notes in task card; Edit/Preview toggle in edit form"
```

---

## Task 6: Version bump — README, CLAUDE.md, hot-copy all files

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Bump README version and add markdown notes feature**

In `README.md`, find:
```markdown
# MyTask — Personal AI Task Manager `v2.0`
```
Replace with:
```markdown
# MyTask — Personal AI Task Manager `v2.1`
```

Find the task management features list and add after the notes bullet:
```markdown
- **Markdown notes** — Full GitHub Flavored Markdown in task notes: always rendered in the task card; Edit / Preview toggle in the edit form. Supports headings, bold, italic, lists, blockquotes, code blocks, tables, strikethrough, and links.
```

- [ ] **Step 2: Update CLAUDE.md**

In `CLAUDE.md`, find the Frontend section and add these conventions:

```markdown
**Notes / Markdown:**
- Notes are stored as plain markdown TEXT in the DB (`Task.notes`) — no HTML stored, ever
- `setMarkdownContent(el, mdText)` — safe markdown-to-DOM: `marked.parse()` → `DOMPurify.sanitize()` → `DOMParser` + `importNode`; no `innerHTML`
- `renderNotesDisplay(notesText, container)` — renders notes with label into a container div; no-ops on empty/null
- `buildNotesToggle(initialValue)` — returns `{ el, getValue() }`: Edit/Preview tabs + `.notes-editor` textarea + `.notes-preview` div
- `showTaskEditForm()` uses `buildNotesToggle(t.notes)` — read value via `notesToggle.getValue()`
- New Task modal keeps plain `<textarea id="mt-notes">` — no toggle (fast capture)
- marked.js + DOMPurify loaded from CDN in `index.html` before `app.js`
```

- [ ] **Step 3: Hot-copy all three static files**

```bash
docker cp static/index.html mytask-mytask-1:/app/static/index.html
docker cp static/style.css mytask-mytask-1:/app/static/style.css
docker cp static/app.js mytask-mytask-1:/app/static/app.js
```

- [ ] **Step 4: Final verification**

Run full test suite:
```bash
python3 -m pytest -v 2>&1 | tail -5
```
Expected: `107 passed`

Open http://10.0.0.149:8080 — do one complete flow: create task with GFM notes, save, view rendered output, open edit form, switch to Preview tab, save again.

- [ ] **Step 5: Final commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs: bump to v2.1; document markdown notes conventions"
```
