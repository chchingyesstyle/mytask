def test_default_statuses_exist(admin_headers):
    client, headers = admin_headers
    resp = client.get("/api/statuses", headers=headers)
    # Router doesn't exist yet — expect 404 or 405, not 200
    # Once router is added in Task 2 this test will need to pass with 200.
    # For Task 1, just verify the DB has defaults via a direct model check.
    from tests.conftest import TestingSessionLocal
    import models
    db = TestingSessionLocal()
    defaults = db.query(models.Status).filter(models.Status.project_id == None).all()  # noqa: E711
    db.close()
    assert len(defaults) == 3
    names = {s.name for s in defaults}
    assert names == {"Todo", "In Progress", "Done"}
