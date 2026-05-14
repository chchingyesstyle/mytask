from unittest.mock import patch, MagicMock, AsyncMock

class _AsyncIter:
    def __init__(self, tokens):
        self._items = iter(tokens)

    def __aiter__(self):
        return self

    async def __anext__(self):
        try:
            token = next(self._items)
        except StopIteration:
            raise StopAsyncIteration
        chunk = MagicMock()
        chunk.choices = [MagicMock()]
        chunk.choices[0].delta = MagicMock()
        chunk.choices[0].delta.content = token
        chunk.choices[0].delta.tool_calls = None
        return chunk

def test_chat_streams_tokens(admin_headers):
    client, headers = admin_headers
    mock_stream = _AsyncIter(["Hello", " world"])
    with patch("routers.chat.client.chat.completions.create", new=AsyncMock(return_value=mock_stream)):
        resp = client.post(
            "/api/chat",
            json={"message": "hello", "history": []},
            headers=headers,
        )
    assert resp.status_code == 200
    assert "Hello" in resp.text
    assert "world" in resp.text
    assert '"type": "done"' in resp.text
    assert resp.headers["content-type"].startswith("text/event-stream")
    assert resp.headers["cache-control"] == "no-cache"

def test_chat_requires_auth(seeded_client):
    resp = seeded_client.post("/api/chat", json={"message": "hi", "history": []})
    assert resp.status_code == 401
