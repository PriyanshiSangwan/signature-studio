from dotenv import load_dotenv
load_dotenv()

import base64
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import bcrypt
import jwt
from bson import ObjectId
from fastapi import APIRouter, Depends, FastAPI, HTTPException, Request, Response, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr

ROOT_DIR = Path(__file__).parent
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]
app = FastAPI(title="Signature Studio API")
api = APIRouter(prefix="/api")
JWT_ALGORITHM = "HS256"

def password_hash(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())

def token(user_id: str, email: str, token_type: str, minutes: int) -> str:
    return jwt.encode({"sub": user_id, "email": email, "type": token_type, "exp": datetime.now(timezone.utc) + timedelta(minutes=minutes)}, os.environ["JWT_SECRET"], algorithm=JWT_ALGORITHM)

async def current_admin(request: Request) -> dict:
    raw = request.cookies.get("access_token")
    if not raw:
        header = request.headers.get("Authorization", "")
        raw = header[7:] if header.startswith("Bearer ") else None
    if not raw:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(raw, os.environ["JWT_SECRET"], algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(401, "Invalid token")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])}, {"_id": 1, "email": 1, "role": 1, "name": 1})
        if not user or user.get("role") != "admin":
            raise HTTPException(403, "Admin access required")
        return {"id": str(user["_id"]), "email": user["email"], "role": user["role"], "name": user.get("name", "Owner")}
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError, KeyError, ValueError):
        raise HTTPException(401, "Session expired")

class LoginInput(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)

class RegisterInput(LoginInput):
    name: str = Field(default="Studio Owner", min_length=2, max_length=80)

class PortfolioInput(BaseModel):
    category: str = Field(min_length=1, max_length=80)
    media_type: str
    title: str = Field(default="", max_length=120)
    label: str = Field(default="", max_length=120)
    media_url: str = ""
    media_data: str = ""
    mime_type: str = ""

def clean_item(item: dict) -> dict:
    return {"id": str(item["_id"]), "category": item["category"], "media_type": item["media_type"], "title": item.get("title", ""), "label": item.get("label", ""), "media_url": item.get("media_url", ""), "media_data": item.get("media_data", ""), "mime_type": item.get("mime_type", ""), "created_at": item.get("created_at", "").isoformat() if isinstance(item.get("created_at"), datetime) else item.get("created_at", "")}

@api.get("/")
async def root():
    return {"message": "Signature Studio API"}

@api.post("/auth/login")
async def login(payload: LoginInput, response: Response, request: Request):
    user = await db.users.find_one({"email": payload.email.lower()})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(401, "Email or password is incorrect")
    access = token(str(user["_id"]), user["email"], "access", 15)
    refresh = token(str(user["_id"]), user["email"], "refresh", 10080)
    response.set_cookie("access_token", access, httponly=True, secure=True, samesite="none", max_age=900, path="/")
    response.set_cookie("refresh_token", refresh, httponly=True, secure=True, samesite="none", max_age=604800, path="/")
    return {"id": str(user["_id"]), "email": user["email"], "role": user["role"], "name": user.get("name", "Owner")}

@api.post("/auth/register")
async def register(payload: RegisterInput, response: Response):
    if await db.users.count_documents({"role": "admin"}, limit=1):
        raise HTTPException(409, "An owner account already exists. Please sign in instead.")
    email = payload.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(409, "That email is already registered.")
    result = await db.users.insert_one({"email": email, "password_hash": password_hash(payload.password), "name": payload.name, "role": "admin", "created_at": datetime.now(timezone.utc)})
    access = token(str(result.inserted_id), email, "access", 15)
    refresh = token(str(result.inserted_id), email, "refresh", 10080)
    response.set_cookie("access_token", access, httponly=True, secure=True, samesite="none", max_age=900, path="/")
    response.set_cookie("refresh_token", refresh, httponly=True, secure=True, samesite="none", max_age=604800, path="/")
    return {"id": str(result.inserted_id), "email": email, "role": "admin", "name": payload.name}

@api.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}

@api.get("/auth/me")
async def me(user: dict = Depends(current_admin)):
    return user

@api.get("/portfolio/categories")
async def categories():
    stored = await db.portfolio.distinct("category")
    defaults = ["Restaurant / Café", "Gym / Fitness", "Healthcare", "Fashion / Retail", "Hotel & Resort", "Creator / Brand"]
    return {"categories": list(dict.fromkeys(stored + defaults))}

@api.get("/portfolio")
async def portfolio(category: Optional[str] = None, media_type: Optional[str] = None):
    query = {}
    if category: query["category"] = category
    if media_type: query["media_type"] = media_type
    docs = await db.portfolio.find(query, {"_id": 1, "category": 1, "media_type": 1, "title": 1, "label": 1, "media_url": 1, "media_data": 1, "mime_type": 1, "created_at": 1}).sort("created_at", -1).to_list(200)
    return {"items": [clean_item(item) for item in docs]}

@api.get("/admin/portfolio")
async def admin_portfolio(user: dict = Depends(current_admin)):
    docs = await db.portfolio.find({}).sort("created_at", -1).to_list(200)
    return {"items": [clean_item(item) for item in docs]}

@api.post("/admin/portfolio")
async def create_item(payload: PortfolioInput, user: dict = Depends(current_admin)):
    if payload.media_type not in {"reel", "design"} or not (payload.media_url or payload.media_data):
        raise HTTPException(400, "Choose a reel or design and add media")
    doc = payload.model_dump()
    doc["created_at"] = datetime.now(timezone.utc)
    result = await db.portfolio.insert_one(doc)
    return clean_item({**doc, "_id": result.inserted_id})

@api.put("/admin/portfolio/{item_id}")
async def update_item(item_id: str, payload: PortfolioInput, user: dict = Depends(current_admin)):
    if not (payload.media_url or payload.media_data):
        raise HTTPException(400, "Media is required")
    result = await db.portfolio.update_one({"_id": ObjectId(item_id)}, {"$set": payload.model_dump()})
    if not result.matched_count: raise HTTPException(404, "Portfolio item not found")
    item = await db.portfolio.find_one({"_id": ObjectId(item_id)})
    return clean_item(item)

@api.delete("/admin/portfolio/{item_id}")
async def delete_item(item_id: str, user: dict = Depends(current_admin)):
    result = await db.portfolio.delete_one({"_id": ObjectId(item_id)})
    if not result.deleted_count: raise HTTPException(404, "Portfolio item not found")
    return {"ok": True}

async def seed_admin():
    email = os.environ["ADMIN_EMAIL"].lower()
    existing = await db.users.find_one({"email": email})
    if not existing:
        await db.users.insert_one({"email": email, "password_hash": password_hash(os.environ["ADMIN_PASSWORD"]), "name": "Studio Owner", "role": "admin", "created_at": datetime.now(timezone.utc)})
    elif not verify_password(os.environ["ADMIN_PASSWORD"], existing["password_hash"]):
        await db.users.update_one({"_id": existing["_id"]}, {"$set": {"password_hash": password_hash(os.environ["ADMIN_PASSWORD"])}})
    await db.users.create_index("email", unique=True)

@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)

app.include_router(api)
app.add_middleware(CORSMiddleware, allow_origins=[os.environ["FRONTEND_URL"]], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
@app.on_event("shutdown")
async def shutdown():
    client.close()