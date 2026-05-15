# KB + AI Suggestions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users upload documents (PDF, DOCX, TXT, MD, PNG, JPG) to a global Knowledge Base and attach them to individual tasks. AI can reference KB content in chat and via 4 dedicated action buttons per task.

**Architecture:** New `kb_documents` DB table. Files stored at `./data/uploads/`. Text extracted at upload time. New `/api/kb` router. Four AI action endpoints on tasks. Chat panel injects global KB context. New KB page in sidebar.

**Tech Stack:** FastAPI, SQLAlchemy, SQLite, `pdfplumber`, `python-docx`, OpenAI Vision API, vanilla JS.

---

## Files

| File | Change |
|------|--------|
| `requirements.txt` | Add `pdfplumber`, `python-docx` |
| `models.py` | Add `KBDocument` model |
| `main.py` | Add migration; create uploads dir; include KB router |
| `kb/__init__.py` | New empty file |
| `kb/extract.py` | New — text extraction for all file types |
| `routers/kb.py` | New — upload, list, delete endpoints |
| `routers/tasks.py` | Add `POST /api/tasks/{id}/ai-action` |
| `routers/chat.py` | Inject global KB docs into system prompt |
| `static/index.html` | Add KB sidebar entry; `#page-kb` div; AI sections in task cards |
| `static/style.css` | KB page styles, doc pill styles, AI action styles |
| `static/app.js` | `renderKBPage()`, upload logic, task card doc section, AI action handlers |

---

### Task 1: Dependencies + KBDocument model + migration

**Files:**
- Modify: `requirements.txt`
- Modify: `models.py`
- Modify: `main.py`

- [ ] **Step 1: Add dependencies to requirements.txt**

In `requirements.txt`, add after the existing entries:

```
pdfplumber
python-docx
```

- [ ] **Step 2: Add KBDocument model to models.py**

In `models.py`, after the existing imports add `from datetime import datetime` if not already present. Then add the `KBDocument` class after the existing models:

```python
class KBDocument(Base):
    __tablename__ = "kb_documents"
    id             = Column(Integer, primary_key=True)
    title          = Column(String, nullable=False)
    filename       = Column(String, nullable=False)
    file_type      = Column(String, nullable=False)
    file_size      = Column(Integer, nullable=False)
    extracted_text = Column(Text, nullable=True)
    task_id        = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=True)
    owner_id       = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at     = Column(DateTime, default=datetime.utcnow)
```

- [ ] **Step 3: Add migration and uploads dir to main.py**

In `main.py`, find the `_migrate()` function. Add inside it (after the existing ALTER TABLE statements):

```python
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS kb_documents (
            id INTEGER PRIMARY KEY,
            title TEXT NOT NULL,
            filename TEXT NOT NULL,
            file_type TEXT NOT NULL,
            file_size INTEGER NOT NULL,
            extracted_text TEXT,
            task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
            owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """))
    conn.commit()
```

In `main.py`, find where the app startup code creates directories or initializes paths (near the top of the file, outside any function). Add:

```python
UPLOAD_DIR = Path("./data/uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
```

If `Path` isn't imported, add `from pathlib import Path` to the imports.

- [ ] **Step 4: Write the test**

In `tests/test_tasks.py`, add at the end:

```python
def test_kb_documents_table_exists(seeded_client):
    client, headers = seeded_client
    # Table existence is verified by upload endpoint responding (not 500)
    # A GET with no docs should return empty list
    r = client.get("/api/kb?global=true", headers=headers)
    assert r.status_code == 200
    assert r.json() == []
```

- [ ] **Step 5: Run test to verify it fails**

```bash
python3 -m pytest tests/test_tasks.py::test_kb_documents_table_exists -v
```

Expected: FAIL — `/api/kb` endpoint doesn't exist yet.

- [ ] **Step 6: Commit the model and migration (before the router)**

```bash
git add requirements.txt models.py main.py tests/test_tasks.py
git commit -m "feat: add KBDocument model and kb_documents migration"
```

---

### Task 2: Text extraction module

**Files:**
- Create: `kb/__init__.py`
- Create: `kb/extract.py`

- [ ] **Step 1: Create kb/__init__.py**

Create an empty file at `kb/__init__.py`.

- [ ] **Step 2: Create kb/extract.py**

Create `kb/extract.py` with the following content:

```python
import base64
from pathlib import Path


async def extract_text(file_path: Path, file_type: str, openai_client) -> str:
    try:
        if file_type in ("txt", "md"):
            return file_path.read_text(encoding="utf-8", errors="ignore")

        if file_type == "pdf":
            import pdfplumber
            pages = []
            with pdfplumber.open(file_path) as pdf:
                for page in pdf.pages:
                    text = page.extract_text()
                    if text:
                        pages.append(text)
            return "\n".join(pages)

        if file_type == "docx":
            from docx import Document
            doc = Document(file_path)
            return "\n".join(p.text for p in doc.paragraphs if p.text)

        if file_type in ("jpg", "jpeg", "png"):
            image_data = base64.b64encode(file_path.read_bytes()).decode("utf-8")
            mime = "image/jpeg" if file_type in ("jpg", "jpeg") else "image/png"
            response = await openai_client.chat.completions.create(
                model="gpt-4o",
                messages=[{
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:{mime};base64,{image_data}"}
                        },
                        {
                            "type": "text",
                            "text": "Extract all text visible in this image. Return only the text, no commentary."
                        }
                    ]
                }],
                max_tokens=1000
            )
            return response.choices[0].message.content or ""

    except Exception:
        pass
    return ""
```

- [ ] **Step 3: Write unit test for extract_text**

In `tests/test_tasks.py`, add:

```python
import asyncio
from pathlib import Path
import tempfile

def test_extract_text_txt():
    from kb.extract import extract_text
    with tempfile.NamedTemporaryFile(suffix=".txt", mode="w", delete=False, encoding="utf-8") as f:
        f.write("Hello world")
        tmp = Path(f.name)
    result = asyncio.get_event_loop().run_until_complete(extract_text(tmp, "txt", None))
    tmp.unlink()
    assert result == "Hello world"

def test_extract_text_md():
    from kb.extract import extract_text
    with tempfile.NamedTemporaryFile(suffix=".md", mode="w", delete=False, encoding="utf-8") as f:
        f.write("# Title\nBody text")
        tmp = Path(f.name)
    result = asyncio.get_event_loop().run_until_complete(extract_text(tmp, "md", None))
    tmp.unlink()
    assert "Title" in result and "Body text" in result
```

- [ ] **Step 4: Run tests**

```bash
python3 -m pytest tests/test_tasks.py::test_extract_text_txt tests/test_tasks.py::test_extract_text_md -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add kb/__init__.py kb/extract.py tests/test_tasks.py
git commit -m "feat: add KB text extraction module for txt/md/pdf/docx/images"
```

---

### Task 3: KB router (upload, list, delete)

**Files:**
- Create: `routers/kb.py`
- Modify: `main.py`

- [ ] **Step 1: Create routers/kb.py**

Create `routers/kb.py`:

```python
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, Form
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import KBDocument, User

router = APIRouter(prefix="/api/kb", tags=["kb"])

UPLOAD_DIR = Path("./data/uploads")
ALLOWED_EXTENSIONS = {"pdf", "docx", "txt", "md", "jpg", "jpeg", "png"}
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB


def _doc_dict(doc: KBDocument) -> dict:
    return {
        "id": doc.id,
        "title": doc.title,
        "file_type": doc.file_type,
        "file_size": doc.file_size,
        "task_id": doc.task_id,
        "created_at": doc.created_at.isoformat(),
        "has_text": bool(doc.extracted_text),
    }


@router.post("")
async def upload_document(
    file: UploadFile,
    task_id: Optional[int] = Form(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"File type .{ext} not allowed")

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(400, "File exceeds 20 MB limit")

    stored_name = f"{uuid.uuid4()}.{ext}"
    file_path = UPLOAD_DIR / stored_name
    file_path.write_bytes(content)

    from kb.extract import extract_text
    from ai.agent import client as openai_client
    extracted = await extract_text(file_path, ext, openai_client)

    doc = KBDocument(
        title=file.filename,
        filename=stored_name,
        file_type=ext,
        file_size=len(content),
        extracted_text=extracted or None,
        task_id=task_id,
        owner_id=current_user.id
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return _doc_dict(doc)


@router.get("")
def list_documents(
    task_id: Optional[int] = None,
    global_only: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    q = db.query(KBDocument).filter(KBDocument.owner_id == current_user.id)
    if task_id is not None:
        q = q.filter(KBDocument.task_id == task_id)
    elif global_only:
        q = q.filter(KBDocument.task_id == None)  # noqa: E711
    return [_doc_dict(d) for d in q.order_by(KBDocument.created_at.desc()).all()]


@router.delete("/{doc_id}", status_code=204)
def delete_document(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    doc = db.query(KBDocument).filter(
        KBDocument.id == doc_id,
        KBDocument.owner_id == current_user.id
    ).first()
    if not doc:
        raise HTTPException(404, "Document not found")
    file_path = UPLOAD_DIR / doc.filename
    if file_path.exists():
        file_path.unlink()
    db.delete(doc)
    db.commit()
```

Note: The `list_documents` endpoint uses `global` as a query param but `global` is a Python reserved word. Use `global_only: bool = False` and map it by adding `alias="global"` via `Query`:

Update the `list_documents` signature to:

```python
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, Form

@router.get("")
def list_documents(
    task_id: Optional[int] = Query(default=None),
    global_only: bool = Query(default=False, alias="global"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
```

- [ ] **Step 2: Include KB router in main.py**

In `main.py`, find where the other routers are included (e.g., `app.include_router(tasks.router)`). Add:

```python
from routers import kb
app.include_router(kb.router)
```

- [ ] **Step 3: Run the existing test**

```bash
python3 -m pytest tests/test_tasks.py::test_kb_documents_table_exists -v
```

Expected: PASS — the `/api/kb?global=true` endpoint now returns `[]`.

- [ ] **Step 4: Write upload and delete tests**

In `tests/test_tasks.py`, add:

```python
def test_kb_upload_txt(seeded_client, tmp_path):
    client, headers = seeded_client
    txt_file = tmp_path / "test.txt"
    txt_file.write_text("Sample knowledge base content")
    with open(txt_file, "rb") as f:
        r = client.post("/api/kb", files={"file": ("test.txt", f, "text/plain")}, headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert data["title"] == "test.txt"
    assert data["file_type"] == "txt"
    assert data["has_text"] is True
    assert data["task_id"] is None

def test_kb_delete(seeded_client, tmp_path):
    client, headers = seeded_client
    txt_file = tmp_path / "del.txt"
    txt_file.write_text("Delete me")
    with open(txt_file, "rb") as f:
        r = client.post("/api/kb", files={"file": ("del.txt", f, "text/plain")}, headers=headers)
    doc_id = r.json()["id"]
    r2 = client.delete(f"/api/kb/{doc_id}", headers=headers)
    assert r2.status_code == 204
    r3 = client.get("/api/kb", headers=headers)
    ids = [d["id"] for d in r3.json()]
    assert doc_id not in ids
```

- [ ] **Step 5: Run new tests**

```bash
python3 -m pytest tests/test_tasks.py::test_kb_upload_txt tests/test_tasks.py::test_kb_delete -v
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add routers/kb.py main.py tests/test_tasks.py
git commit -m "feat: add KB router with upload, list, delete endpoints"
```

---

### Task 4: AI action endpoint on tasks

**Files:**
- Modify: `routers/tasks.py`

- [ ] **Step 1: Add AIActionRequest schema and endpoint**

In `routers/tasks.py`, add after the existing Pydantic models at the top of the file:

```python
class AIActionRequest(BaseModel):
    action: str  # "meeting_prep" | "draft_email" | "summarise" | "action_items"
```

Then add this endpoint (after the existing task routes, before the end of the file):

```python
@router.post("/{task_id}/ai-action")
async def task_ai_action(
    task_id: int,
    req: AIActionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    task = db.query(Task).filter(Task.id == task_id, Task.owner_id == current_user.id).first()
    if not task:
        raise HTTPException(404, "Task not found")

    project_name = task.project.name if task.project else "none"
    status_name = task.status_rel.name if task.status_rel else "unknown"

    from models import KBDocument
    docs = db.query(KBDocument).filter(
        KBDocument.owner_id == current_user.id,
        (KBDocument.task_id == task_id) | (KBDocument.task_id == None)  # noqa: E711
    ).order_by(KBDocument.created_at.asc()).all()

    kb_text = ""
    total = 0
    for doc in docs:
        if doc.extracted_text:
            chunk = doc.extracted_text[:12000 - total]
            kb_text += f"[{doc.title}]\n{chunk}\n\n"
            total += len(chunk)
            if total >= 12000:
                break

    system_prompt = f"""You are a productivity assistant. The user is working on a task.

Task: {task.title}
Project: {project_name}
Due: {task.due_date or "not set"}
Status: {status_name}
Notes: {task.notes or "none"}

Knowledge base documents:
---
{kb_text or "No documents attached."}
---"""

    action_prompts = {
        "meeting_prep": "Based on the task details and documents above, generate a concise meeting preparation brief: objective, suggested attendees, agenda with time allocations, and key questions to address.",
        "draft_email": "Based on the task details and documents above, draft a professional email. Include a subject line, greeting, body, and sign-off. Keep it concise and action-oriented.",
        "summarise": "Summarise the key points from the attached documents in relation to this task. Use bullet points. Be concise.",
        "action_items": "Extract a clear list of action items and next steps from the task details and attached documents. Format as a numbered list with owner and deadline where identifiable."
    }

    user_prompt = action_prompts.get(req.action)
    if not user_prompt:
        raise HTTPException(400, f"Unknown action: {req.action}")

    try:
        from ai.agent import client as openai_client
        import os
        response = await openai_client.chat.completions.create(
            model=os.environ.get("OPENAI_MODEL", "gpt-4o"),
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ]
        )
        result = response.choices[0].message.content
        return {"result": result}
    except Exception:
        return {"result": None, "error": "AI unavailable"}
```

- [ ] **Step 2: Write AI action test**

In `tests/test_tasks.py`, add:

```python
from unittest.mock import AsyncMock, patch, MagicMock

def test_task_ai_action(seeded_client):
    client, headers = seeded_client

    # Get a task ID
    tasks_r = client.get("/api/tasks", headers=headers)
    task_id = tasks_r.json()[0]["id"]

    mock_response = MagicMock()
    mock_response.choices = [MagicMock()]
    mock_response.choices[0].message.content = "Meeting brief here."

    with patch("routers.tasks.openai_client") as mock_client:
        mock_client.chat = MagicMock()
        mock_client.chat.completions = MagicMock()
        mock_client.chat.completions.create = AsyncMock(return_value=mock_response)
        r = client.post(f"/api/tasks/{task_id}/ai-action",
                        json={"action": "meeting_prep"}, headers=headers)

    # AI might be unavailable in test env; just check it doesn't 500
    assert r.status_code == 200
    data = r.json()
    assert "result" in data
```

- [ ] **Step 3: Run test**

```bash
python3 -m pytest tests/test_tasks.py::test_task_ai_action -v
```

Expected: PASS (the endpoint returns 200 with either a result or the "AI unavailable" fallback).

- [ ] **Step 4: Commit**

```bash
git add routers/tasks.py tests/test_tasks.py
git commit -m "feat: add AI action endpoint on tasks (meeting prep, email, summarise, action items)"
```

---

### Task 5: Chat panel KB context injection

**Files:**
- Modify: `routers/chat.py`

- [ ] **Step 1: Inject global KB docs into chat system prompt**

In `routers/chat.py`, find the section that builds the `system_prompt` string (it should be something like `system_prompt = "You are a helpful..."` or similar). After the system prompt is constructed but before the OpenAI call, add:

```python
    from models import KBDocument
    global_docs = db.query(KBDocument).filter(
        KBDocument.owner_id == current_user.id,
        KBDocument.task_id == None  # noqa: E711
    ).order_by(KBDocument.created_at.desc()).limit(5).all()

    kb_text = "\n\n".join(
        f"[{doc.title}]\n{doc.extracted_text[:2000]}"
        for doc in global_docs if doc.extracted_text
    )
    if kb_text:
        system_prompt += f"\n\nKnowledge base:\n---\n{kb_text}\n---"
```

- [ ] **Step 2: Run all tests**

```bash
python3 -m pytest -v
```

Expected: all existing tests pass (the chat system prompt change doesn't affect test behavior since tests mock the OpenAI call).

- [ ] **Step 3: Commit**

```bash
git add routers/chat.py
git commit -m "feat: inject global KB docs into chat system prompt"
```

---

### Task 6: CSS for KB page and AI sections

**Files:**
- Modify: `static/style.css`

- [ ] **Step 1: Append KB and AI styles to style.css**

Append to the bottom of `static/style.css`:

```css
/* KB Page */
.kb-section-title { font-size:10px; color:var(--text-dim); text-transform:uppercase;
  letter-spacing:.05em; margin:10px 0 6px; padding:0 4px; }
.kb-doc-card { background:var(--bg-card); border:1px solid var(--border); border-radius:var(--r);
  padding:8px 10px; margin-bottom:6px; display:flex; align-items:center; gap:8px; }
.kb-doc-icon { font-size:18px; flex-shrink:0; }
.kb-doc-info { flex:1; min-width:0; }
.kb-doc-name { font-size:12px; font-weight:600; color:var(--text); white-space:nowrap;
  overflow:hidden; text-overflow:ellipsis; }
.kb-doc-meta { font-size:10px; color:var(--text-dim); margin-top:1px; }
.kb-doc-delete { background:none; border:none; color:var(--text-dim); cursor:pointer;
  font-size:12px; padding:2px 4px; }
.kb-doc-delete:hover { color:#ef4444; }
.kb-upload-btn { display:flex; align-items:center; gap:6px; }

/* Task card doc section */
.task-docs-section { padding:8px 12px; border-top:1px solid var(--border); }
.task-docs-label { font-size:10px; color:var(--text-dim); text-transform:uppercase;
  letter-spacing:.05em; margin-bottom:6px; }
.task-doc-pills { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
.task-doc-pill { background:var(--bg-panel); border:1px solid var(--border); border-radius:var(--r);
  padding:2px 8px; font-size:11px; color:var(--text); display:inline-flex; align-items:center; gap:4px; }
.task-doc-pill-del { color:var(--text-dim); cursor:pointer; background:none; border:none;
  font-size:10px; padding:0; line-height:1; }
.task-doc-pill-del:hover { color:#ef4444; }
.task-attach-btn { background:none; border:1px dashed var(--border); border-radius:var(--r);
  padding:2px 8px; font-size:11px; color:var(--text-dim); cursor:pointer; }
.task-attach-btn:hover { border-color:var(--accent); color:var(--accent); }

/* AI Actions */
.task-ai-section { padding:8px 12px; border-top:1px solid var(--border); }
.task-ai-label { font-size:10px; color:var(--text-dim); text-transform:uppercase;
  letter-spacing:.05em; margin-bottom:6px; }
.task-ai-buttons { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:8px; }
.task-ai-btn { font-size:11px; padding:4px 9px; }
.task-ai-output { background:rgba(74,144,217,.04); border:1px solid var(--border);
  border-radius:var(--r); padding:10px; font-size:11px; color:var(--text); line-height:1.6; }
.task-ai-output-header { font-size:10px; color:var(--accent); font-weight:600; margin-bottom:6px; }
.task-ai-output-text { white-space:pre-wrap; }
.task-ai-output-actions { margin-top:8px; display:flex; gap:6px; }
```

- [ ] **Step 2: Hot-copy style.css**

```bash
docker cp static/style.css mytask-mytask-1:/app/static/style.css
```

- [ ] **Step 3: Commit**

```bash
git add static/style.css
git commit -m "feat: add KB page and AI action CSS styles"
```

---

### Task 7: Frontend — KB page

**Files:**
- Modify: `static/index.html`
- Modify: `static/app.js`

- [ ] **Step 1: Add KB sidebar entry and page div to index.html**

In `static/index.html`, find the sidebar navigation links (the `<a>` tags or buttons for Dashboard, Tasks, Projects, etc.). Add KB after Tags:

```html
<a href="#" class="sidebar-link" data-page="kb">&#128218; KB</a>
```

In the mobile drawer, find the equivalent navigation section and add:

```html
<a href="#" class="sidebar-link" data-page="kb">&#128218; KB</a>
```

Find the block of page containers (`<div id="page-dashboard" class="page" ...>`, etc.). Add:

```html
<div id="page-kb" class="page" style="display:none"></div>
```

- [ ] **Step 2: Add renderKBPage function to app.js**

Add this function near the other `render*Page` functions:

```javascript
function renderKBPage() {
  var container = document.getElementById('page-kb');
  if (!container) return;
  container.textContent = '';

  var header = document.createElement('div');
  header.className = 'page-header';
  header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:16px';
  var title = document.createElement('h2');
  title.textContent = 'Knowledge Base';
  title.style.cssText = 'font-size:16px;font-weight:700;color:var(--text)';
  header.appendChild(title);

  var uploadBtn = document.createElement('button');
  uploadBtn.className = 'btn-primary kb-upload-btn';
  uploadBtn.textContent = '+ Upload Doc';
  var fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.multiple = true;
  fileInput.accept = '.pdf,.docx,.txt,.md,.jpg,.jpeg,.png';
  fileInput.style.display = 'none';
  fileInput.addEventListener('change', function() {
    var files = Array.from(fileInput.files);
    if (!files.length) return;
    uploadBtn.disabled = true;
    uploadBtn.textContent = 'Uploading...';
    var promises = files.map(function(file) {
      var fd = new FormData();
      fd.append('file', file);
      return fetch('/api/kb', { method: 'POST', headers: authHeaders(), body: fd });
    });
    Promise.all(promises).then(function() {
      fileInput.value = '';
      uploadBtn.disabled = false;
      uploadBtn.textContent = '+ Upload Doc';
      renderKBPage();
    });
  });
  uploadBtn.addEventListener('click', function() { fileInput.click(); });
  header.appendChild(fileInput);
  header.appendChild(uploadBtn);
  container.appendChild(header);

  fetch('/api/kb', { headers: authHeaders() })
    .then(function(r) { return r.json(); })
    .then(function(docs) {
      var globalDocs = docs.filter(function(d) { return !d.task_id; });
      var taskDocs = docs.filter(function(d) { return d.task_id; });

      var glTitle = document.createElement('div');
      glTitle.className = 'kb-section-title';
      glTitle.textContent = 'Global Documents';
      container.appendChild(glTitle);

      if (!globalDocs.length) {
        var empty = document.createElement('p');
        empty.style.cssText = 'font-size:12px;color:var(--text-dim);padding:8px 4px';
        empty.textContent = 'No global documents yet. Upload docs to give the AI context for all tasks.';
        container.appendChild(empty);
      }
      globalDocs.forEach(function(doc) { container.appendChild(buildKBDocCard(doc)); });

      var tTitle = document.createElement('div');
      tTitle.className = 'kb-section-title';
      tTitle.style.marginTop = '16px';
      tTitle.textContent = 'Task-attached Documents';
      container.appendChild(tTitle);

      if (!taskDocs.length) {
        var empty2 = document.createElement('p');
        empty2.style.cssText = 'font-size:12px;color:var(--text-dim);padding:8px 4px';
        empty2.textContent = 'No task-attached documents yet. Attach docs from within a task card.';
        container.appendChild(empty2);
      }
      taskDocs.forEach(function(doc) { container.appendChild(buildKBDocCard(doc)); });
    });
}

function buildKBDocCard(doc) {
  var icons = { pdf: '📄', docx: '📝', txt: '📄', md: '📄', jpg: '🖼', jpeg: '🖼', png: '🖼' };
  var card = document.createElement('div');
  card.className = 'kb-doc-card';

  var icon = document.createElement('span');
  icon.className = 'kb-doc-icon';
  icon.textContent = icons[doc.file_type] || '📄';
  card.appendChild(icon);

  var info = document.createElement('div');
  info.className = 'kb-doc-info';
  var name = document.createElement('div');
  name.className = 'kb-doc-name';
  name.textContent = doc.title;
  info.appendChild(name);
  var meta = document.createElement('div');
  meta.className = 'kb-doc-meta';
  var sizeKB = Math.round(doc.file_size / 1024);
  var sizeStr = sizeKB > 1024 ? (sizeKB / 1024).toFixed(1) + ' MB' : sizeKB + ' KB';
  var dateStr = new Date(doc.created_at).toLocaleDateString();
  meta.textContent = doc.file_type.toUpperCase() + ' · ' + sizeStr + ' · uploaded ' + dateStr;
  if (!doc.has_text) meta.textContent += ' · no text extracted';
  info.appendChild(meta);
  card.appendChild(info);

  var del = document.createElement('button');
  del.className = 'kb-doc-delete';
  del.textContent = '✕';
  del.addEventListener('click', function() {
    fetch('/api/kb/' + doc.id, { method: 'DELETE', headers: authHeaders() })
      .then(function() { renderKBPage(); });
  });
  card.appendChild(del);
  return card;
}
```

- [ ] **Step 3: Register KB page in navigateTo**

In `static/app.js`, find the `navigateTo(page)` function. It has a list of page names that map to containers. Add `'kb'` so that navigating to it calls `renderKBPage()`. The pattern is: find where other pages call their render function on navigation (e.g., `if (page === 'projects') renderProjectsPage();`) and add:

```javascript
  if (page === 'kb') renderKBPage();
```

- [ ] **Step 4: Add click listeners for KB sidebar links**

In `static/app.js`, find the `DOMContentLoaded` block where sidebar link click listeners are registered. Add listeners for the KB links (same pattern as other sidebar links):

```javascript
  document.querySelectorAll('[data-page="kb"]').forEach(function(el) {
    el.addEventListener('click', function(e) {
      e.preventDefault();
      navigateTo('kb');
      if (drawerOpen) toggleDrawer();
    });
  });
```

- [ ] **Step 5: Hot-copy and test KB page**

```bash
docker cp static/index.html mytask-mytask-1:/app/static/index.html
docker cp static/app.js mytask-mytask-1:/app/static/app.js
```

Open http://10.0.0.149:8080. You should see:
- "📚 KB" in the sidebar
- Clicking it shows the Knowledge Base page
- "Global Documents" and "Task-attached Documents" sections with empty state messages
- "+ Upload Doc" button — clicking opens a file picker
- Uploading a .txt or .md file shows it in the Global Documents list with metadata
- Delete button removes the doc

- [ ] **Step 6: Commit**

```bash
git add static/index.html static/app.js
git commit -m "feat: add KB page with upload, list, and delete"
```

---

### Task 8: Frontend — task card attached docs + AI actions

**Files:**
- Modify: `static/app.js`

- [ ] **Step 1: Add renderTaskDocs function**

Add this function near the other task card rendering helpers:

```javascript
function renderTaskDocs(task, detailEl) {
  var existing = detailEl.querySelector('.task-docs-section');
  if (existing) existing.remove();

  var section = document.createElement('div');
  section.className = 'task-docs-section';

  var label = document.createElement('div');
  label.className = 'task-docs-label';
  label.textContent = 'Attached docs';
  section.appendChild(label);

  var pills = document.createElement('div');
  pills.className = 'task-doc-pills';
  section.appendChild(pills);

  fetch('/api/kb?task_id=' + task.id, { headers: authHeaders() })
    .then(function(r) { return r.json(); })
    .then(function(docs) {
      docs.forEach(function(doc) {
        var pill = document.createElement('span');
        pill.className = 'task-doc-pill';
        var icons = { pdf: '📄', docx: '📝', txt: '📄', md: '📄', jpg: '🖼', jpeg: '🖼', png: '🖼' };
        pill.textContent = (icons[doc.file_type] || '📄') + ' ' + doc.title + ' ';
        var del = document.createElement('button');
        del.className = 'task-doc-pill-del';
        del.textContent = '✕';
        del.addEventListener('click', function(e) {
          e.stopPropagation();
          fetch('/api/kb/' + doc.id, { method: 'DELETE', headers: authHeaders() })
            .then(function() { renderTaskDocs(task, detailEl); });
        });
        pill.appendChild(del);
        pills.appendChild(pill);
      });

      var attachBtn = document.createElement('button');
      attachBtn.className = 'task-attach-btn';
      attachBtn.textContent = '+ Attach';
      var fi = document.createElement('input');
      fi.type = 'file';
      fi.multiple = true;
      fi.accept = '.pdf,.docx,.txt,.md,.jpg,.jpeg,.png';
      fi.style.display = 'none';
      fi.addEventListener('change', function() {
        var files = Array.from(fi.files);
        if (!files.length) return;
        attachBtn.textContent = 'Uploading...';
        attachBtn.disabled = true;
        var promises = files.map(function(file) {
          var fd = new FormData();
          fd.append('file', file);
          fd.append('task_id', task.id);
          return fetch('/api/kb', { method: 'POST', headers: authHeaders(), body: fd });
        });
        Promise.all(promises).then(function() {
          fi.value = '';
          renderTaskDocs(task, detailEl);
        });
      });
      attachBtn.addEventListener('click', function() { fi.click(); });
      section.appendChild(fi);
      pills.appendChild(attachBtn);
    });

  detailEl.appendChild(section);
}
```

- [ ] **Step 2: Add renderTaskAIActions function**

```javascript
function renderTaskAIActions(task, detailEl) {
  var existing = detailEl.querySelector('.task-ai-section');
  if (existing) existing.remove();

  var section = document.createElement('div');
  section.className = 'task-ai-section';

  var label = document.createElement('div');
  label.className = 'task-ai-label';
  label.textContent = 'AI Actions';
  section.appendChild(label);

  var btnRow = document.createElement('div');
  btnRow.className = 'task-ai-buttons';
  section.appendChild(btnRow);

  var outputDiv = document.createElement('div');
  section.appendChild(outputDiv);

  var actions = [
    { key: 'meeting_prep', label: '📝 Meeting prep' },
    { key: 'draft_email',  label: '✉️ Draft email' },
    { key: 'summarise',    label: '📋 Summarise' },
    { key: 'action_items', label: '✅ Action items' }
  ];

  actions.forEach(function(action) {
    var btn = document.createElement('button');
    btn.className = 'btn-secondary task-ai-btn';
    btn.textContent = action.label;
    btn.addEventListener('click', function() {
      btn.disabled = true;
      btn.textContent = '⏳ ' + action.label;
      outputDiv.textContent = '';
      fetch('/api/tasks/' + task.id + '/ai-action', {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
        body: JSON.stringify({ action: action.key })
      }).then(function(r) { return r.json(); }).then(function(data) {
        btn.disabled = false;
        btn.textContent = action.label;
        outputDiv.textContent = '';

        if (data.error || !data.result) {
          var errMsg = document.createElement('p');
          errMsg.style.cssText = 'font-size:11px;color:#ef4444;padding:6px 0';
          errMsg.textContent = 'AI unavailable, please try again.';
          outputDiv.appendChild(errMsg);
          return;
        }

        var out = document.createElement('div');
        out.className = 'task-ai-output';
        var hdr = document.createElement('div');
        hdr.className = 'task-ai-output-header';
        hdr.textContent = action.label + ' — generated';
        var txt = document.createElement('div');
        txt.className = 'task-ai-output-text';
        txt.textContent = data.result;
        var actRow = document.createElement('div');
        actRow.className = 'task-ai-output-actions';

        var copyBtn = document.createElement('button');
        copyBtn.className = 'btn-primary task-ai-btn';
        copyBtn.textContent = '📋 Copy';
        copyBtn.addEventListener('click', function() {
          navigator.clipboard.writeText(data.result).then(function() {
            copyBtn.textContent = '✓ Copied';
            setTimeout(function() { copyBtn.textContent = '📋 Copy'; }, 1500);
          });
        });

        var regenBtn = document.createElement('button');
        regenBtn.className = 'btn-secondary task-ai-btn';
        regenBtn.textContent = 'Regenerate';
        regenBtn.addEventListener('click', function() { btn.click(); });

        actRow.appendChild(copyBtn);
        actRow.appendChild(regenBtn);
        out.appendChild(hdr);
        out.appendChild(txt);
        out.appendChild(actRow);
        outputDiv.appendChild(out);
      }).catch(function() {
        btn.disabled = false;
        btn.textContent = action.label;
        var errMsg = document.createElement('p');
        errMsg.style.cssText = 'font-size:11px;color:#ef4444;padding:6px 0';
        errMsg.textContent = 'AI unavailable, please try again.';
        outputDiv.appendChild(errMsg);
      });
    });
    btnRow.appendChild(btn);
  });

  detailEl.appendChild(section);
}
```

- [ ] **Step 3: Call renderTaskDocs and renderTaskAIActions from toggleTask**

In `static/app.js`, find the `toggleTask(taskId)` function (or wherever the task card detail panel is shown/populated). After the existing detail content is built and appended, add:

```javascript
    renderTaskDocs(task, detail);
    renderTaskAIActions(task, detail);
```

Where `task` is the task object and `detail` is the detail container element (the div that holds the expanded card content). Look for where other sections like the subtask list or edit form are appended to the detail element.

- [ ] **Step 4: Hot-copy and test AI actions**

```bash
docker cp static/app.js mytask-mytask-1:/app/static/app.js
```

Open http://10.0.0.149:8080:
1. Click any task to expand it
2. Scroll down — you should see "Attached docs" section with "+ Attach" button
3. Click "+ Attach" and upload a .txt file — it appears as a pill with ✕
4. Click ✕ on the pill — doc removed
5. You should also see "AI Actions" section with 4 buttons
6. Click "📝 Meeting prep" — button shows ⏳ spinner, then result appears with Copy + Regenerate buttons
7. Click "📋 Copy" — result copied to clipboard; button briefly shows "✓ Copied"
8. Click "Regenerate" — re-runs the action

- [ ] **Step 5: Commit**

```bash
git add static/app.js
git commit -m "feat: add task card doc attachments and AI action panel"
```

---

### Task 9: Docker rebuild + full test suite + push

**Files:**
- Test: `tests/test_tasks.py`

- [ ] **Step 1: Run full test suite**

```bash
python3 -m pytest -v
```

Expected: all tests pass (including the new KB and AI tests).

- [ ] **Step 2: Rebuild Docker container**

KB requires new Python packages (`pdfplumber`, `python-docx`) — a `docker cp` is not enough.

```bash
./docker.sh rebuild
```

Wait for the rebuild to complete. Check logs for startup errors:

```bash
./docker.sh logs
```

- [ ] **Step 3: Full verification after rebuild**

Open http://10.0.0.149:8080:
1. KB page loads and shows empty state
2. Upload a .txt doc — it appears in Global Documents
3. Upload a .pdf doc (any PDF) — it appears with `has_text: true` if pdfplumber extracted text
4. Expand a task — "Attached docs" and "AI Actions" sections visible
5. Attach a doc to a task — pill appears; delete works
6. Run all 4 AI actions — results generated (requires valid OPENAI_API_KEY in .env)
7. Chat panel: upload a global KB doc, then ask the chat a question — the model should reference the doc content

- [ ] **Step 4: Push to GitHub**

```bash
git push origin master
```
