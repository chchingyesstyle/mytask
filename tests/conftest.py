import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient

SQLALCHEMY_TEST_URL = "sqlite://"

engine = create_engine(SQLALCHEMY_TEST_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture(autouse=True)
def setup_db():
    import models  # noqa: F401 — ensures all models are registered to Base
    from database import Base
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)

@pytest.fixture
def db_session(setup_db):
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

@pytest.fixture
def client(setup_db):
    from database import get_db
    from main import app

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()

@pytest.fixture
def seeded_client(client):
    from seed import seed_admin
    db = TestingSessionLocal()
    seed_admin(db)
    db.close()
    return client

@pytest.fixture
def admin_headers(seeded_client):
    resp = seeded_client.post("/api/auth/login", json={"username": "admin", "password": "yesasia"})
    assert resp.status_code == 200
    token = resp.json()["access_token"]
    return seeded_client, {"Authorization": f"Bearer {token}"}
