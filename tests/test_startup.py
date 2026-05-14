def test_app_health(client):
    resp = client.get("/")
    assert resp.status_code == 200

def test_seed_creates_admin(db_session):
    from seed import seed_admin
    from models import User
    seed_admin(db_session)
    admin = db_session.query(User).filter(User.username == "admin").first()
    assert admin is not None
    assert admin.role == "admin"

def test_seed_is_idempotent(db_session):
    from seed import seed_admin
    from models import User
    seed_admin(db_session)
    seed_admin(db_session)
    count = db_session.query(User).filter(User.username == "admin").count()
    assert count == 1
