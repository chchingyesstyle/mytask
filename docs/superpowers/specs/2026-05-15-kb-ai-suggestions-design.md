# Knowledge Base + AI Suggestions Design Spec

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let users upload documents (PDF, DOCX, TXT, MD, PNG, JPG) to a global Knowledge Base and attach them to individual tasks. The AI can reference KB content in the chat panel and via dedicated action buttons on each task (meeting prep, draft email, summarise docs, extract action items).

**Architecture:** New `kb_documents` DB table. Files stored on disk at `./data/uploads/`. Text extracted at upload time and stored in DB. New `/api/kb` router. Four AI action endpoints on tasks. Chat panel updated to inject KB context into system prompt. New KB page in the sidebar.

**Tech Stack:** FastAPI (UploadFile), SQLAlchemy, SQLite, `pdfplumber` (PDF), `python-docx` (DOCX), OpenAI Vision API (images), existing `AsyncOpenAI` client, vanilla JS.

---

## Data Model

### New table: `kb_documents`

```python
class KBDocument(Base):
    __tablename__ = "kb_documents"
    id             = Column(Integer, primary_key=True)
    title          = Column(String, nullable=False)        # original filename
    filename       = Column(String, nullable=False)        # stored filename (uuid-based)
    file_type      = Column(String, nullable=False)        # "pdf", "docx", "txt", "md", "jpg", "png"
    file_size      = Column(Integer, nullable=False)       # bytes
    extracted_text = Column(Text, nullable=True)           # extracted at upload time
    task_id        = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=True)
    # NULL task_id = global KB doc; set task_id = attached to that task
    owner_id       = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at     = Column(DateTime, default=datetime.utcnow)
```

### Migration (`_migrate()` in `main.py`)

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

### Upload directory

Created on app startup in `main.py`:

```python
UPLOAD_DIR = Path("./data/uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
```

---

## Text Extraction (`kb/extract.py`)

New module `kb/extract.py` with a single function:

```python
async def extract_text(file_path: Path, file_type: str, openai_client) -> str:
    """Extract text from a file. Returns extracted string (may be empty)."""
```

| File type | Method |
|-----------|--------|
| `txt`, `md` | `file_path.read_text(encoding='utf-8', errors='ignore')` |
| `pdf` | `pdfplumber.open(file_path)` — concatenate `page.extract_text()` for all pages |
| `docx` | `python-docx`: join `para.text` for all paragraphs |
| `jpg`, `jpeg`, `png` | OpenAI Vision API: send image as base64 with prompt `"Extract all text visible in this image. Return only the text, no commentary."` using `gpt-4o` model. Falls back to empty string on error. |

Dependencies to add to `requirements.txt`: `pdfplumber`, `python-docx`.

---

## API — `/api/kb` (`routers/kb.py`)

All routes require authentication.

### `POST /api/kb` — upload document

- Accepts `multipart/form-data` with fields: `file` (UploadFile), `task_id` (optional int form field)
- Validates file extension against allowlist: `{pdf, docx, txt, md, jpg, jpeg, png}`
- Rejects files > 20 MB
- Saves file to `./data/uploads/{uuid4()}.{ext}`
- Calls `extract_text()` asynchronously
- Creates `KBDocument` row
- Returns `_doc_dict(doc)`

### `GET /api/kb` — list documents

Query params:
- `task_id=N` — docs attached to task N
- `global=true` — global KB docs only (task_id IS NULL)
- No params — all docs owned by the current user

Returns list of `_doc_dict`.

### `DELETE /api/kb/{doc_id}` — delete document

- Deletes DB row and file from disk
- Returns 204

### Response shape `_doc_dict`

```python
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
```

`extracted_text` is never returned to the frontend — it is only used server-side for AI context.

---

## AI Actions — `/api/tasks/{task_id}/ai-action` (`routers/tasks.py`)

### `POST /api/tasks/{task_id}/ai-action`

Request body:

```python
class AIActionRequest(BaseModel):
    action: str  # "meeting_prep" | "draft_email" | "summarise" | "action_items"
```

Logic:
1. Load the task (title, notes, project name, due date, status)
2. Load all `KBDocument` rows where `task_id = task_id` OR `task_id IS NULL` (global), ordered by `created_at`. Concatenate their `extracted_text` up to **12,000 characters** total (truncate oldest-first if over limit).
3. Build a system prompt with task context + KB text
4. Call `AsyncOpenAI` with the action-specific user prompt (non-streaming)
5. Return `{"result": "<generated text>"}`

### System prompt template

```
You are a productivity assistant. The user is working on a task.

Task: {task.title}
Project: {project_name or "none"}
Due: {task.due_date or "not set"}
Status: {task.status_name}
Notes: {task.notes or "none"}

Knowledge base documents:
---
{concatenated_extracted_text}
---
```

### Action-specific user prompts

| Action | User prompt |
|--------|------------|
| `meeting_prep` | `"Based on the task details and documents above, generate a concise meeting preparation brief: objective, suggested attendees, agenda with time allocations, and key questions to address."` |
| `draft_email` | `"Based on the task details and documents above, draft a professional email. Include a subject line, greeting, body, and sign-off. Keep it concise and action-oriented."` |
| `summarise` | `"Summarise the key points from the attached documents in relation to this task. Use bullet points. Be concise."` |
| `action_items` | `"Extract a clear list of action items and next steps from the task details and attached documents. Format as a numbered list with owner and deadline where identifiable."` |

On any OpenAI error: return `{"result": null, "error": "AI unavailable"}` with status 200 (frontend shows a gentle error message).

---

## Chat Panel KB Context (`routers/chat.py`)

The existing chat endpoint builds a system prompt. Update it to append global KB documents:

```python
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

Up to 5 most recent global docs, 2,000 characters each, appended to existing system prompt.

---

## Frontend

### Sidebar

Add a "📚 KB" entry to the sidebar and mobile drawer in `index.html`, between Tags and the bottom buttons. Add `#page-kb` div. Register in `navigateTo()` to call `renderKBPage()`.

### KB Page (`renderKBPage()` in `app.js`)

Two sections:

**Global Documents**
- List of doc cards: icon (by file type) + filename + size + upload date + delete button
- Upload button at the top opens a hidden `<input type="file" multiple accept=".pdf,.docx,.txt,.md,.jpg,.jpeg,.png">`. On file select, `POST /api/kb` for each file (sequential). Shows uploading state per file.
- On upload complete: reload and re-render.

**Task-attached Documents**
- Same card style, but subtitle shows "attached to {task title}" as a link.

### Task card — attached docs + AI actions

In the expanded task card detail area (`toggleTask()` in `app.js`), after the existing content, add two new sections:

**Attached docs section**
- Fetched via `GET /api/kb?task_id={t.id}` when the card expands
- Shows doc pills with filename + delete button
- "+ Attach" button opens a file picker (same as KB page, but sends `task_id` in the form data)

**AI actions section**
- Four buttons: `📝 Meeting prep`, `✉️ Draft email`, `📋 Summarise docs`, `✅ Action items`
- On click: button shows loading spinner, calls `POST /api/tasks/{id}/ai-action`, renders result in a text box below the buttons with **Copy** and **Regenerate** buttons
- If `error` in response: show "AI unavailable, please try again"
- Only one action result shown at a time (new action replaces old output)

---

## Files Created / Modified

| File | Change |
|------|--------|
| `models.py` | Add `KBDocument` model |
| `main.py` | Add migration for `kb_documents` table; create `./data/uploads/` dir; include KB router |
| `kb/extract.py` | New — text extraction for all file types |
| `routers/kb.py` | New — upload, list, delete endpoints |
| `routers/tasks.py` | Add `POST /api/tasks/{id}/ai-action` endpoint |
| `routers/chat.py` | Inject global KB docs into system prompt |
| `requirements.txt` | Add `pdfplumber`, `python-docx` |
| `static/index.html` | Add KB sidebar entry; `#page-kb` div; AI action sections in task cards |
| `static/style.css` | KB page styles, doc pill styles, AI action button/output styles |
| `static/app.js` | `renderKBPage()`, file upload logic, task card doc section, AI action handlers |

---

## Out of Scope

- Semantic search / embeddings (full-text concatenation is sufficient for a personal app)
- Document versioning or editing
- Sharing KB docs between users
- Per-project KB (global + per-task is sufficient)
- Streaming AI output for action buttons (non-streaming keeps implementation simple)
