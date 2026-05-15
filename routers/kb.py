import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, Form
from fastapi.responses import FileResponse
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

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
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
    task_id: Optional[int] = Query(default=None),
    global_only: bool = Query(default=False, alias="global"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    q = db.query(KBDocument).filter(KBDocument.owner_id == current_user.id)
    if task_id is not None:
        q = q.filter(KBDocument.task_id == task_id)
    elif global_only:
        q = q.filter(KBDocument.task_id == None)  # noqa: E711
    return [_doc_dict(d) for d in q.order_by(KBDocument.created_at.desc()).all()]


_CONTENT_TYPES = {
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "txt": "text/plain",
    "md": "text/markdown",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
}


@router.get("/{doc_id}/download")
def download_document(
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
    if not file_path.exists():
        raise HTTPException(404, "File not found on disk")
    media_type = _CONTENT_TYPES.get(doc.file_type, "application/octet-stream")
    return FileResponse(file_path, media_type=media_type, filename=doc.title)


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
