import json
import asyncio
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from database import get_db
from auth import get_current_user
from ai.agent import client, MODEL, TOOLS, build_system_prompt, execute_tool
from routers.tasks import task_to_dict
import models

router = APIRouter(prefix="/api/chat", tags=["chat"])

class ChatRequest(BaseModel):
    message: str
    history: list[dict] = []

@router.post("")
async def chat(
    req: ChatRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    tasks = db.query(models.Task).filter(models.Task.owner_id == current_user.id).all()
    system_prompt = build_system_prompt([task_to_dict(t) for t in tasks])

    global_docs = db.query(models.KBDocument).filter(
        models.KBDocument.owner_id == current_user.id,
        models.KBDocument.task_id == None  # noqa: E711
    ).order_by(models.KBDocument.created_at.desc()).limit(5).all()

    kb_text = "\n\n".join(
        f"[{doc.title}]\n{doc.extracted_text[:2000]}"
        for doc in global_docs if doc.extracted_text
    )
    if kb_text:
        system_prompt += f"\n\nKnowledge base:\n---\n{kb_text}\n---"

    messages = [{"role": "system", "content": system_prompt}]
    for msg in req.history[-10:]:
        messages.append(msg)
    messages.append({"role": "user", "content": req.message})

    async def generate():
        try:
            collected_content = ""
            collected_tool_calls = []

            stream = await client.chat.completions.create(
                model=MODEL, messages=messages, tools=TOOLS, stream=True
            )

            async for chunk in stream:
                if not chunk.choices:
                    continue
                delta = chunk.choices[0].delta
                if delta.content:
                    collected_content += delta.content
                    yield "data: {}\n\n".format(json.dumps({"type": "token", "content": delta.content}))
                if delta.tool_calls:
                    for tc in delta.tool_calls:
                        idx = tc.index if tc.index is not None else 0
                        while len(collected_tool_calls) <= idx:
                            collected_tool_calls.append({"id": "", "name": "", "arguments": ""})
                        if tc.id:
                            collected_tool_calls[idx]["id"] = tc.id
                        if tc.function and tc.function.name:
                            collected_tool_calls[idx]["name"] = tc.function.name
                        if tc.function and tc.function.arguments:
                            collected_tool_calls[idx]["arguments"] += tc.function.arguments

            if collected_tool_calls:
                tool_results = []
                for tc in collected_tool_calls:
                    try:
                        args = json.loads(tc["arguments"])
                    except Exception:
                        args = {}
                    result = await asyncio.get_event_loop().run_in_executor(
                        None, execute_tool, tc["name"], args, db, current_user.id
                    )
                    tool_results.append({"tool_call_id": tc["id"], "name": tc["name"], "result": result})
                yield "data: {}\n\n".format(json.dumps({"type": "tool_executed", "results": tool_results}))

                messages.append({
                    "role": "assistant",
                    "content": collected_content or None,
                    "tool_calls": [
                        {"id": tc["id"], "type": "function",
                         "function": {"name": tc["name"], "arguments": tc["arguments"]}}
                        for tc in collected_tool_calls
                    ],
                })
                for tr in tool_results:
                    messages.append({"role": "tool", "tool_call_id": tr["tool_call_id"], "content": tr["result"]})

                follow_up = await client.chat.completions.create(model=MODEL, messages=messages, stream=True)
                async for chunk in follow_up:
                    if chunk.choices and chunk.choices[0].delta.content:
                        content = chunk.choices[0].delta.content
                        yield "data: {}\n\n".format(json.dumps({"type": "token", "content": content}))

            yield "data: {}\n\n".format(json.dumps({"type": "done"}))

        except Exception as e:
            yield "data: {}\n\n".format(json.dumps({"type": "error", "message": str(e)}))

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
