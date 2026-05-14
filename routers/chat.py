import json
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
def chat(
    req: ChatRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    tasks = db.query(models.Task).filter(models.Task.owner_id == current_user.id).all()
    system_prompt = build_system_prompt([task_to_dict(t) for t in tasks])

    messages = [{"role": "system", "content": system_prompt}]
    for msg in req.history[-10:]:
        messages.append(msg)
    messages.append({"role": "user", "content": req.message})

    def generate():
        try:
            collected_content = ""
            collected_tool_calls = []

            stream = client.chat.completions.create(
                model=MODEL, messages=messages, tools=TOOLS, stream=True
            )

            for chunk in stream:
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
                    result = execute_tool(tc["name"], args, db, current_user.id)
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

                follow_up = client.chat.completions.create(model=MODEL, messages=messages, stream=True)
                for chunk in follow_up:
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
