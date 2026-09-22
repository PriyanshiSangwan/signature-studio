"""Signature Studio backend regression tests.
Covers auth (login/forgot/reset), portfolio + categories CRUD, featured toggle,
role enforcement (OWNER vs MANAGER), and team invite flow.
"""
import os
import subprocess
import time
import uuid

import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
OWNER_EMAIL = "signaturestudio02@gmail.com"
OWNER_PASSWORD = "NewSecure!2026PW"


def _mongo_eval(js: str) -> str:
    out = subprocess.run(
        ["mongosh", "--quiet", "--eval",
         f'db=connect("mongodb://localhost:27017/test_database"); {js}'],
        capture_output=True, text=True, timeout=15,
    )
    return (out.stdout or "") + (out.stderr or "")


@pytest.fixture
def owner_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD})
    assert r.status_code == 200, r.text
    return s


# ---------- Auth ----------
class TestAuth:
    def test_register_endpoint_removed(self):
        r = requests.post(f"{BASE_URL}/api/auth/register", json={"email": "x@y.com", "password": "Passw0rd!"})
        assert r.status_code in (404, 405)
        g = requests.get(f"{BASE_URL}/api/auth/register")
        assert g.status_code in (404, 405)

    def test_login_success_and_me(self, owner_session):
        me = owner_session.get(f"{BASE_URL}/api/auth/me")
        assert me.status_code == 200
        body = me.json()
        assert body["email"] == OWNER_EMAIL
        assert body["role"] == "OWNER"
        assert "access_token" in owner_session.cookies

    def test_login_wrong_password(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": OWNER_EMAIL, "password": "wrongpassword123"})
        assert r.status_code == 401
        assert "incorrect" in r.json().get("detail", "").lower()

    def test_forgot_password_returns_ok_for_unknown(self):
        r = requests.post(f"{BASE_URL}/api/auth/forgot-password", json={"email": "nonexistent-xyz@example.com"})
        assert r.status_code == 200
        assert r.json() == {"ok": True}

    def test_forgot_and_reset_password_flow(self):
        # trigger token creation
        r = requests.post(f"{BASE_URL}/api/auth/forgot-password", json={"email": OWNER_EMAIL})
        assert r.status_code == 200
        time.sleep(0.5)
        out = _mongo_eval(
            'JSON.stringify(db.password_reset_tokens.find({used:false}).sort({created_at:-1}).limit(1).toArray())'
        )
        assert "token" in out, out
        # extract token via simple parse
        import json, re
        match = re.search(r'\[.*\]', out, re.S)
        assert match, out
        docs = json.loads(match.group(0))
        assert docs, "no reset token created"
        token = docs[0]["token"]

        new_pwd = OWNER_PASSWORD  # reset to same so subsequent tests still work
        rr = requests.post(f"{BASE_URL}/api/auth/reset-password", json={"token": token, "password": new_pwd})
        assert rr.status_code == 200
        # token cannot be reused
        rr2 = requests.post(f"{BASE_URL}/api/auth/reset-password", json={"token": token, "password": new_pwd})
        assert rr2.status_code == 400
        # login still works
        s = requests.Session()
        assert s.post(f"{BASE_URL}/api/auth/login", json={"email": OWNER_EMAIL, "password": new_pwd}).status_code == 200

    def test_password_reset_ttl_index(self):
        out = _mongo_eval('JSON.stringify(db.password_reset_tokens.getIndexes())')
        assert "expireAfterSeconds" in out, out

    def test_unauth_admin_endpoints_return_401(self):
        for path in ["/api/admin/portfolio", "/api/admin/categories", "/api/admin/team"]:
            r = requests.get(f"{BASE_URL}{path}")
            assert r.status_code == 401, f"{path} => {r.status_code}"


# ---------- Public endpoints ----------
class TestPublic:
    def test_categories_public(self):
        r = requests.get(f"{BASE_URL}/api/portfolio/categories")
        assert r.status_code == 200
        cats = r.json()["categories"]
        assert isinstance(cats, list) and len(cats) >= 1

    def test_portfolio_public(self):
        r = requests.get(f"{BASE_URL}/api/portfolio")
        assert r.status_code == 200
        assert isinstance(r.json()["items"], list)


# ---------- Portfolio CRUD + featured ----------
class TestPortfolio:
    def test_crud_and_featured_ordering(self, owner_session):
        cat = "TEST_Featured Cat " + uuid.uuid4().hex[:6]
        # need category to exist for hidden-toggle test later; portfolio itself doesn't require it
        payload = {
            "category": cat, "media_type": "design", "title": "TEST A",
            "label": "TEST", "media_url": "https://picsum.photos/300",
            "media_data": "", "mime_type": "", "featured": False,
        }
        a = owner_session.post(f"{BASE_URL}/api/admin/portfolio", json=payload).json()
        b = owner_session.post(f"{BASE_URL}/api/admin/portfolio",
                               json={**payload, "title": "TEST B"}).json()
        # mark second as featured
        r = owner_session.patch(f"{BASE_URL}/api/admin/portfolio/{b['id']}/featured", params={"featured": "true"})
        assert r.status_code == 200 and r.json()["featured"] is True

        pub = requests.get(f"{BASE_URL}/api/portfolio", params={"category": cat}).json()["items"]
        assert pub[0]["id"] == b["id"], "featured item should appear first"

        # update
        upd = owner_session.put(f"{BASE_URL}/api/admin/portfolio/{a['id']}",
                                json={**payload, "title": "TEST A2"})
        assert upd.status_code == 200 and upd.json()["title"] == "TEST A2"
        # delete
        for i in (a["id"], b["id"]):
            assert owner_session.delete(f"{BASE_URL}/api/admin/portfolio/{i}").status_code == 200


# ---------- Categories ----------
class TestCategories:
    def test_create_rename_hide_delete_and_public_visibility(self, owner_session):
        name = "TEST_Cat_" + uuid.uuid4().hex[:6]
        r = owner_session.post(f"{BASE_URL}/api/admin/categories", json={"name": name, "hidden": False})
        assert r.status_code == 200
        cid = r.json()["id"]
        # visible in public
        pub = requests.get(f"{BASE_URL}/api/portfolio/categories").json()["categories"]
        assert name in pub

        # rename
        new_name = name + "_r"
        r = owner_session.patch(f"{BASE_URL}/api/admin/categories/{cid}", json={"name": new_name})
        assert r.status_code == 200 and r.json()["name"] == new_name

        # hide
        r = owner_session.patch(f"{BASE_URL}/api/admin/categories/{cid}", json={"hidden": True})
        assert r.status_code == 200 and r.json()["hidden"] is True
        pub = requests.get(f"{BASE_URL}/api/portfolio/categories").json()["categories"]
        assert new_name not in pub, "hidden category must not be public"

        # cannot delete category with works
        work = owner_session.post(f"{BASE_URL}/api/admin/portfolio", json={
            "category": new_name, "media_type": "design", "title": "TEST work",
            "media_url": "https://picsum.photos/301", "media_data": "", "mime_type": "", "label": "",
        }).json()
        r = owner_session.delete(f"{BASE_URL}/api/admin/categories/{cid}")
        assert r.status_code == 400

        # cleanup work, then delete category succeeds
        owner_session.delete(f"{BASE_URL}/api/admin/portfolio/{work['id']}")
        r = owner_session.delete(f"{BASE_URL}/api/admin/categories/{cid}")
        assert r.status_code == 200


# ---------- Team / role enforcement ----------
class TestTeam:
    def test_owner_lists_team_and_invites(self, owner_session):
        r = owner_session.get(f"{BASE_URL}/api/admin/team")
        assert r.status_code == 200
        members = r.json()["members"]
        assert any(m["email"] == OWNER_EMAIL and m["role"] == "OWNER" for m in members)

        invite_email = f"test_invite_{uuid.uuid4().hex[:8]}@example.com"
        r = owner_session.post(f"{BASE_URL}/api/admin/team/invite",
                               json={"email": invite_email, "name": "TEST Invitee", "role": "MANAGER"})
        # invite might fail email delivery but still 200 if endpoint continues; we accept 200 or 502 depending on Resend
        # Reading server.py: HTTPException on email is caught; so this should be 200.
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["invited"] is True
        assert body["role"] == "MANAGER"
        new_user_id = body["id"]

        # invitation token stored in db
        out = _mongo_eval(
            'JSON.stringify(db.invitations.find({used:false}).sort({created_at:-1}).limit(1).toArray())'
        )
        assert "token" in out

        # owner cannot demote self
        me = owner_session.get(f"{BASE_URL}/api/auth/me").json()
        r = owner_session.patch(f"{BASE_URL}/api/admin/team/{me['id']}", json={"role": "MANAGER"})
        assert r.status_code == 400
        r = owner_session.patch(f"{BASE_URL}/api/admin/team/{me['id']}", json={"is_active": False})
        assert r.status_code == 400
        r = owner_session.delete(f"{BASE_URL}/api/admin/team/{me['id']}")
        assert r.status_code == 400

        # cleanup invited user
        owner_session.delete(f"{BASE_URL}/api/admin/team/{new_user_id}")

    def test_manager_role_enforcement(self, owner_session):
        # create manager directly via mongo with a known password hash
        import bcrypt
        raw_pwd = "Manager@Pwd12345"
        h = bcrypt.hashpw(raw_pwd.encode(), bcrypt.gensalt()).decode()
        mgr_email = f"test_mgr_{uuid.uuid4().hex[:6]}@example.com"
        out = _mongo_eval(
            f'JSON.stringify(db.users.insertOne({{email:"{mgr_email}",password_hash:"{h}",name:"TEST Mgr",role:"MANAGER",is_active:true,created_at:new Date()}}).insertedId)'
        )
        assert "ObjectId" in out or '"' in out, out

        mgr = requests.Session()
        r = mgr.post(f"{BASE_URL}/api/auth/login", json={"email": mgr_email, "password": raw_pwd})
        assert r.status_code == 200, r.text
        assert r.json()["role"] == "MANAGER"

        # manager can access portfolio+categories
        assert mgr.get(f"{BASE_URL}/api/admin/portfolio").status_code == 200
        assert mgr.get(f"{BASE_URL}/api/admin/categories").status_code == 200
        # but not team
        r = mgr.get(f"{BASE_URL}/api/admin/team")
        assert r.status_code == 403

        # cleanup
        _mongo_eval(f'db.users.deleteOne({{email:"{mgr_email}"}})')
