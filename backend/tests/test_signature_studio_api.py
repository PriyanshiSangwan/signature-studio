import os
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
EMAIL = "signaturestudio02@gmail.com"
PASSWORD = "Studio@LbwV8MnVtFsm7w7P"


def test_public_and_admin_crud_flow():
    assert BASE_URL
    session = requests.Session()
    categories = session.get(f"{BASE_URL}/api/portfolio/categories")
    assert categories.status_code == 200
    assert "Social Media" in categories.json()["categories"]
    public = session.get(f"{BASE_URL}/api/portfolio")
    assert public.status_code == 200 and isinstance(public.json()["items"], list)
    assert session.get(f"{BASE_URL}/api/admin/portfolio").status_code == 401

    login = session.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
    assert login.status_code == 200
    assert "access_token" in session.cookies and "refresh_token" in session.cookies
    assert session.get(f"{BASE_URL}/api/auth/me").json()["role"] == "admin"

    payload = {"category": "TEST_Social Media", "media_type": "design", "title": "TEST Design", "label": "TEST", "media_url": "https://images.unsplash.com/photo-1567016376408-0226e4d0c1ea", "media_data": "", "mime_type": ""}
    created = session.post(f"{BASE_URL}/api/admin/portfolio", json=payload)
    assert created.status_code == 200
    item_id = created.json()["id"]
    assert session.get(f"{BASE_URL}/api/portfolio", params={"category": payload["category"], "media_type": "design"}).json()["items"][0]["title"] == "TEST Design"
    updated = dict(payload, title="TEST Updated")
    assert session.put(f"{BASE_URL}/api/admin/portfolio/{item_id}", json=updated).status_code == 200
    assert session.get(f"{BASE_URL}/api/admin/portfolio").json()["items"][0]["title"] == "TEST Updated"
    assert session.delete(f"{BASE_URL}/api/admin/portfolio/{item_id}").status_code == 200
    assert session.post(f"{BASE_URL}/api/auth/logout").status_code == 200
    assert session.get(f"{BASE_URL}/api/admin/portfolio").status_code == 401