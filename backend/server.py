from dotenv import load_dotenv
load_dotenv()

import ipaddress
import logging
import os
import re
import secrets
from datetime import datetime, timedelta, timezone
from html import escape
from html.parser import HTMLParser
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

import bcrypt
import httpx
import jwt
from bson import ObjectId
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field


# =========================================================
# APP / DATABASE
# =========================================================

ROOT_DIR = Path(__file__).parent

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI(title="Signature Studio API")
api = APIRouter(prefix="/api")

JWT_ALGORITHM = "HS256"

EMAIL_BASE_URL = "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ["EMERGENT_EMAIL_KEY"]
EMAIL_FROM_NAME = os.environ["EMAIL_FROM_NAME"]
EMAIL_REPLY_TO = os.environ.get("EMAIL_REPLY_TO")

FRONTEND_URL = os.environ["FRONTEND_URL"].rstrip("/")

logger = logging.getLogger(__name__)


# =========================================================
# ROLES / CATEGORIES
# =========================================================

ROLE_OWNER = "OWNER"
ROLE_MANAGER = "MANAGER"

ALL_ROLES = {
    ROLE_OWNER,
    ROLE_MANAGER,
}

DEFAULT_CATEGORIES = [
    "Restaurant / Café",
    "Gym / Fitness",
    "Healthcare",
    "Fashion / Retail",
    "Hotel & Resort",
    "Creator / Brand",
]


# =========================================================
# PASSWORD + JWT
# =========================================================

def password_hash(password: str) -> str:
    return bcrypt.hashpw(
        password.encode(),
        bcrypt.gensalt()
    ).decode()


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(
        password.encode(),
        hashed.encode()
    )


def token(
    user_id: str,
    email: str,
    token_type: str,
    minutes: int
) -> str:
    return jwt.encode(
        {
            "sub": user_id,
            "email": email,
            "type": token_type,
            "exp": datetime.now(timezone.utc)
            + timedelta(minutes=minutes),
        },
        os.environ["JWT_SECRET"],
        algorithm=JWT_ALGORITHM,
    )


def set_session(
    response: Response,
    user_id: str,
    email: str
) -> None:
    access = token(
        user_id,
        email,
        "access",
        60,
    )

    refresh = token(
        user_id,
        email,
        "refresh",
        10080,
    )

    response.set_cookie(
        "access_token",
        access,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=3600,
        path="/",
    )

    response.set_cookie(
        "refresh_token",
        refresh,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=604800,
        path="/",
    )


async def get_current_user(
    request: Request
) -> dict:

    raw = request.cookies.get("access_token")

    if not raw:
        header = request.headers.get(
            "Authorization",
            ""
        )

        raw = (
            header[7:]
            if header.startswith("Bearer ")
            else None
        )

    if not raw:
        raise HTTPException(
            401,
            "Not authenticated"
        )

    try:
        payload = jwt.decode(
            raw,
            os.environ["JWT_SECRET"],
            algorithms=[JWT_ALGORITHM],
        )

        if payload.get("type") != "access":
            raise HTTPException(
                401,
                "Invalid token"
            )

        user = await db.users.find_one(
            {
                "_id": ObjectId(
                    payload["sub"]
                )
            }
        )

        if not user or not user.get(
            "is_active",
            True
        ):
            raise HTTPException(
                401,
                "User not available"
            )

        return _clean_user(user)

    except (
        jwt.ExpiredSignatureError,
        jwt.InvalidTokenError,
        KeyError,
        ValueError,
    ):
        raise HTTPException(
            401,
            "Session expired"
        )


async def require_manager(
    user: dict = Depends(get_current_user)
) -> dict:

    if user["role"] not in ALL_ROLES:
        raise HTTPException(
            403,
            "Manager or Owner access required"
        )

    return user


async def require_owner(
    user: dict = Depends(get_current_user)
) -> dict:

    if user["role"] != ROLE_OWNER:
        raise HTTPException(
            403,
            "Owner access required"
        )

    return user


def _clean_user(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "email": doc["email"],
        "name": doc.get(
            "name",
            "Team Member"
        ),
        "role": doc.get(
            "role",
            ROLE_MANAGER
        ),
        "is_active": doc.get(
            "is_active",
            True
        ),
        "invited": doc.get(
            "password_hash"
        ) is None,
        "created_at": (
            doc["created_at"].isoformat()
            if isinstance(
                doc.get("created_at"),
                datetime
            )
            else doc.get(
                "created_at",
                ""
            )
        ),
    }


# =========================================================
# EMAIL
# =========================================================

_SHORTENERS = (
    "bit.ly",
    "tinyurl.com",
    "t.co",
    "is.gd",
    "cutt.ly",
    "goo.gl",
    "rebrand.ly",
)

_CRED_ASK = (
    "reply with your password",
    "reply with the code",
    "send your password",
    "cvv",
    "send us your password",
    "enter your password below",
    "confirm your card number",
    "your full card number",
    "seed phrase",
    "recovery phrase",
    "verify your card",
    "social security number",
    "confirm your bank details",
)

_HOSTISH = re.compile(
    r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})",
    re.I,
)


def _host_ok(host: str) -> bool:

    if not host or "xn--" in host:
        return False

    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass

    return not any(
        host == s or host.endswith("." + s)
        for s in _SHORTENERS
    )


def _same_site(
    shown: str,
    real: str
) -> bool:
    return (
        shown == real
        or real.endswith("." + shown)
        or shown.endswith("." + real)
    )


class _EmailScan(HTMLParser):

    def __init__(self):
        super().__init__()

        self.tags = set()
        self.urls = []
        self.anchors = []

        self._href = None
        self._text = []

    def handle_starttag(
        self,
        tag,
        attrs
    ):
        self.tags.add(
            tag.lower()
        )

        self.urls += [
            v
            for k, v in attrs
            if k.lower()
            in ("href", "src")
            and v
        ]

        if tag.lower() == "a":

            self._href = dict(
                (k.lower(), v)
                for k, v in attrs
            ).get("href")

            self._text = []

    def handle_data(
        self,
        data
    ):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(
        self,
        tag
    ):
        if (
            tag.lower() == "a"
            and self._href is not None
        ):
            self.anchors.append(
                (
                    self._href,
                    "".join(self._text),
                )
            )

            self._href = None
            self._text = []


def _assert_safe_email(
    subject: str,
    html: str
) -> None:

    scan = _EmailScan()
    scan.feed(html)

    if scan.tags & {
        "form",
        "input",
        "textarea",
        "select",
    }:
        raise ValueError(
            "No forms or input fields in email (G2)"
        )

    body = (
        f"{subject}\n{html}"
    ).lower()

    for p in _CRED_ASK:
        if p in body:
            raise ValueError(
                f"Email asks the recipient for credentials: {p!r} (G2)"
            )

    for url in scan.urls:

        low = url.strip().lower()

        if low.startswith(
            (
                "mailto:",
                "tel:",
                "cid:",
                "#",
            )
        ):
            continue

        if not low.startswith("https://"):
            raise ValueError(
                f"Email links/assets must be absolute https: {url!r} (G3)"
            )

        parsed = urlparse(low)
        host = parsed.hostname or ""

        if (
            not _host_ok(host)
            or parsed.username is not None
        ):
            raise ValueError(
                f"Shortened, numeric-host or credential-bearing URL: {url!r} (G3)"
            )

    for href, text in scan.anchors:

        real = (
            urlparse(
                href.strip().lower()
            ).hostname
            or ""
        )

        if not real:
            continue

        for m in _HOSTISH.finditer(text):
            if not _same_site(
                m.group(1).lower(),
                real
            ):
                raise ValueError(
                    f"Anchor text {m.group(1)!r} != real host {real!r} (G3)"
                )


async def send_email(
    *,
    to: str,
    subject: str,
    html: str
) -> Optional[str]:

    _assert_safe_email(
        subject,
        html
    )

    payload = {
        "to": [to],
        "subject": subject,
        "html": html,
        "from_name": EMAIL_FROM_NAME,
    }

    if EMAIL_REPLY_TO:
        payload["contact_email"] = EMAIL_REPLY_TO

    try:

        async with httpx.AsyncClient(
            timeout=30
        ) as http:

            resp = await http.post(
                f"{EMAIL_BASE_URL}/api/v1/email/send",
                headers={
                    "X-Email-Key": EMAIL_KEY
                },
                json=payload,
            )

        resp.raise_for_status()

        return resp.json().get("id")

    except httpx.HTTPStatusError as exc:

        logger.error(
            "Email send failed: %s %s",
            exc.response.status_code,
            exc.response.text,
        )

        raise HTTPException(
            502,
            "Failed to send email"
        )

    except Exception as exc:

        logger.error(
            "Email send error: %s",
            exc,
        )

        raise HTTPException(
            500,
            "Failed to send email"
        )


def _wrap_email(
    preview: str,
    body_html: str
) -> str:

    footer = escape(
        EMAIL_FROM_NAME
    )

    return (
        '<table role="presentation" width="100%" '
        'style="background:#0a0a0a;padding:32px 12px;'
        'font-family:Arial,sans-serif">'
        '<tr><td align="center">'
        '<table role="presentation" width="560" '
        'style="max-width:560px;background:#111218;'
        'border:1px solid #24252d;border-radius:6px;'
        'padding:28px 30px;color:#f2f0eb">'
        '<tr><td style="font-family:Arial,sans-serif;'
        'color:#f2f0eb">'
        f"{body_html}"
        f'<p style="font-size:11px;color:#7c7e89;'
        f'margin-top:26px;letter-spacing:.08em">'
        f'Sent by {footer}. We never ask for your '
        f'password or card details by email.</p>'
        '</td></tr></table>'
        '</td></tr></table>'
    )


async def send_password_reset_email(
    email: str,
    reset_url: str
) -> None:

    body = (
        '<h2 style="margin:0 0 14px;'
        'font-family:Arial,sans-serif;'
        'color:#f2f0eb">'
        'Reset your Signature Studio password'
        '</h2>'

        '<p>'
        'Someone (hopefully you) asked to reset '
        'the password for this Signature Studio '
        'owner account.'
        '</p>'

        f'<p><a href="{escape(reset_url)}" '
        'style="display:inline-block;'
        'background:#e3a13e;color:#101116;'
        'padding:12px 20px;text-decoration:none;'
        'font-weight:700;border-radius:4px">'
        'Set a new password'
        '</a></p>'

        '<p style="color:#9b9ca5;font-size:12px">'
        'This link expires in 1 hour. If you did not '
        'request this, you can safely ignore this email.'
        '</p>'
    )

    await send_email(
        to=email,
        subject="Reset your Signature Studio password",
        html=_wrap_email(
            "password reset",
            body
        ),
    )


async def send_invite_email(
    email: str,
    invite_url: str,
    role: str,
    inviter: str
) -> None:

    body = (
        '<h2 style="margin:0 0 14px;'
        'font-family:Arial,sans-serif;'
        'color:#f2f0eb">'
        'You are invited to Signature Studio'
        '</h2>'

        f'<p>{escape(inviter)} has invited you '
        f'to join the Signature Studio team as a '
        f'<strong>{escape(role)}</strong>.</p>'

        f'<p><a href="{escape(invite_url)}" '
        'style="display:inline-block;'
        'background:#e3a13e;color:#101116;'
        'padding:12px 20px;text-decoration:none;'
        'font-weight:700;border-radius:4px">'
        'Accept invitation & set password'
        '</a></p>'

        '<p style="color:#9b9ca5;font-size:12px">'
        'This invitation expires in 72 hours.'
        '</p>'
    )

    await send_email(
        to=email,
        subject="Signature Studio team invitation",
        html=_wrap_email(
            "invitation",
            body
        ),
    )


# =========================================================
# PYDANTIC MODELS
# =========================================================

class LoginInput(BaseModel):

    email: EmailStr

    password: str = Field(
        min_length=8
    )


class ForgotInput(BaseModel):

    email: EmailStr


class ResetInput(BaseModel):

    token: str = Field(
        min_length=10
    )

    password: str = Field(
        min_length=8,
        max_length=128
    )


class InviteInput(BaseModel):

    email: EmailStr

    name: str = Field(
        default="Team Member",
        min_length=2,
        max_length=80,
    )

    role: str


class UpdateUserInput(BaseModel):

    role: Optional[str] = None

    is_active: Optional[bool] = None


class PortfolioInput(BaseModel):

    category: str = Field(
        min_length=1,
        max_length=80,
    )

    media_type: str

    title: str = Field(
        default="",
        max_length=120,
    )

    label: str = Field(
        default="",
        max_length=120,
    )

    media_url: str = ""

    media_data: str = ""

    mime_type: str = ""

    featured: bool = False


class CategoryInput(BaseModel):

    name: str = Field(
        min_length=1,
        max_length=80,
    )

    hidden: bool = False


class CategoryUpdate(BaseModel):

    name: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=80,
    )

    hidden: Optional[bool] = None


# =========================================================
# SERIALIZERS
# =========================================================

def clean_item(item: dict) -> dict:

    return {
        "id": str(item["_id"]),
        "category": item["category"],
        "media_type": item["media_type"],
        "title": item.get(
            "title",
            ""
        ),
        "label": item.get(
            "label",
            ""
        ),
        "media_url": item.get(
            "media_url",
            ""
        ),
        "media_data": item.get(
            "media_data",
            ""
        ),
        "mime_type": item.get(
            "mime_type",
            ""
        ),
        "featured": bool(
            item.get(
                "featured",
                False
            )
        ),
        "created_at": (
            item["created_at"].isoformat()
            if isinstance(
                item.get("created_at"),
                datetime
            )
            else item.get(
                "created_at",
                ""
            )
        ),
    }


def clean_category(
    doc: dict
) -> dict:

    return {
        "id": str(doc["_id"]),
        "name": doc["name"],
        "hidden": bool(
            doc.get(
                "hidden",
                False
            )
        ),
    }


# =========================================================
# ROOT
# =========================================================

@api.get("/")
async def root():

    return {
        "message": "Signature Studio API"
    }


# =========================================================
# AUTH
# =========================================================

@api.post("/auth/login")
async def login(
    payload: LoginInput,
    response: Response
):

    user = await db.users.find_one(
        {
            "email": payload.email.lower()
        }
    )

    if (
        not user
        or not user.get("password_hash")
        or not user.get(
            "is_active",
            True
        )
        or not verify_password(
            payload.password,
            user["password_hash"],
        )
    ):
        raise HTTPException(
            401,
            "Email or password is incorrect"
        )

    set_session(
        response,
        str(user["_id"]),
        user["email"],
    )

    return _clean_user(user)


@api.post("/auth/logout")
async def logout(
    response: Response
):

    response.delete_cookie(
        "access_token",
        path="/"
    )

    response.delete_cookie(
        "refresh_token",
        path="/"
    )

    return {
        "ok": True
    }


@api.get("/auth/me")
async def me(
    user: dict = Depends(
        get_current_user
    )
):

    return user


@api.post("/auth/forgot-password")
async def forgot_password(
    payload: ForgotInput
):

    email = payload.email.lower()

    user = await db.users.find_one(
        {
            "email": email,
            "is_active": True,
        }
    )

    if user and user.get(
        "password_hash"
    ):

        raw = secrets.token_urlsafe(
            32
        )

        await db.password_reset_tokens.insert_one(
            {
                "user_id": user["_id"],
                "token": raw,
                "expires_at": (
                    datetime.now(timezone.utc)
                    + timedelta(hours=1)
                ),
                "used": False,
                "created_at": datetime.now(
                    timezone.utc
                ),
            }
        )

        reset_url = (
            f"{FRONTEND_URL}"
            f"/reset-password?token={raw}"
        )

        try:

            await send_password_reset_email(
                email,
                reset_url
            )

        except Exception:

            logger.exception(
                "password reset email delivery failed for %s",
                email,
            )

    return {
        "ok": True
    }


@api.post("/auth/reset-password")
async def reset_password(
    payload: ResetInput
):

    now = datetime.now(
        timezone.utc
    )

    record = await db.password_reset_tokens.find_one(
        {
            "token": payload.token,
            "used": False,
            "expires_at": {
                "$gt": now
            },
        }
    )

    if not record:

        raise HTTPException(
            400,
            "This reset link is invalid or has expired."
        )

    result = await db.users.update_one(
        {
            "_id": record["user_id"],
            "is_active": True,
        },
        {
            "$set": {
                "password_hash": password_hash(
                    payload.password
                ),
                "updated_at": now,
            }
        },
    )

    if not result.matched_count:

        raise HTTPException(
            400,
            "Account not available."
        )

    await db.password_reset_tokens.update_one(
        {
            "_id": record["_id"]
        },
        {
            "$set": {
                "used": True,
                "used_at": now,
            }
        },
    )