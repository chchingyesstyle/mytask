from unittest.mock import patch, MagicMock

def _mock_stream(tokens):
    chunks = []
    for token in tokens:
        chunk = MagicMock()
        chunk.choices = [MagicMock()]
        chunk.choices[0].delta = MagicMock()
        chunk.choices[0].delta.content = token
        chunk.choices[0].delta.tool_calls = None
        chunks.append(chunk)
    return iter(chunks)

def test_chat_streams_tokens(admin_headers):
    client, headers = admin_headers
    mock_resp = MagicMock()
    mock_resp.__iter__ = lambda self: _mock_stream(["Hello", " world"])
    with patch("routers.chat.client.chat.completions.create", return_value=mock_resp):
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
