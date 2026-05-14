def test_hash_and_verify_password():
    from auth import hash_password, verify_password
    hashed = hash_password("secret123")
    assert verify_password("secret123", hashed)
    assert not verify_password("wrong", hashed)

def test_create_and_decode_token():
    from auth import create_access_token, decode_token
    token = create_access_token(user_id=1, username="admin", role="admin")
    payload = decode_token(token)
    assert payload["sub"] == "1"
    assert payload["username"] == "admin"
    assert payload["role"] == "admin"

def test_decode_invalid_token_raises():
    from auth import decode_token
    from fastapi import HTTPException
    import pytest
    with pytest.raises(HTTPException) as exc:
        decode_token("not.a.real.token")
    assert exc.value.status_code == 401
