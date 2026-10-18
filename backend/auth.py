"""
Authentication module for AlertOps.

Provides JWT-based authentication with two roles: admin and user.
- admin: full access including user management and folder access assignment
- user: read-only access to all data, plus edit access to folders assigned by admin

Authentication can be disabled via AUTH_ENABLED=false in .env for local development.
"""

import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from fastapi import Depends, HTTPException, Request
from passlib.context import CryptContext

from config import settings
from models import User
from storage import storage

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, password_hash: str) -> bool:
    return pwd_context.verify(plain_password, password_hash)


def create_access_token(username: str, role: str) -> str:
    """Create a JWT token with username and role claims."""
    expire = datetime.now(timezone.utc) + timedelta(hours=settings.auth_jwt_expiration_hours)
    payload = {
        "sub": username,
        "role": role,
        "exp": expire,
    }
    return jwt.encode(payload, settings.auth_jwt_secret, algorithm="HS256")


def decode_token(token: str) -> dict:
    """Decode and validate a JWT token. Raises HTTPException on failure."""
    try:
        payload = jwt.decode(token, settings.auth_jwt_secret, algorithms=["HS256"])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


def get_current_user(request: Request) -> Optional[dict]:
    """Extract and validate the current user from the Authorization header.
    
    Returns None if auth is disabled. Returns a dict with 'username', 'role', and 'folders'.
    Raises 401 if auth is enabled but no valid token is provided.
    """
    if not settings.auth_enabled:
        return {"username": "anonymous", "role": "admin", "folders": None}
    
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    token = auth_header[7:]  # Strip "Bearer "
    payload = decode_token(token)
    
    # Verify the user still exists and is active
    username = payload.get("sub")
    role = payload.get("role")
    
    # Check if user exists in storage (for non-default users)
    users = storage.list("users")
    user_record = None
    for u in users:
        if u.get("username") == username:
            user_record = u
            break
    
    # If no user record found, check if it's the default admin from config
    if not user_record:
        if username == settings.auth_admin_username:
            # Default admin from config — always valid
            return {"username": username, "role": "admin", "folders": None}
        else:
            raise HTTPException(status_code=401, detail="User not found or deactivated")
    
    # Check if user is active
    if not user_record.get("active", True):
        raise HTTPException(status_code=401, detail="User deactivated")
    
    # Get assigned folders (None means all folders for admin)
    folders = user_record.get("folders", [])
    
    return {"username": username, "role": role, "folders": folders}


def require_admin(request: Request) -> dict:
    """Dependency that requires the current user to have the admin role.
    
    Raises 403 if the user is authenticated but does not have admin role.
    """
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin role required")
    return user


def require_folder_access(request: Request, folder_name: Optional[str] = None) -> dict:
    """Dependency that checks if the user has access to modify the specified folder.
    
    Admins always have access. Users can only modify folders assigned to them.
    If folder_name is None or empty, checks if user has any folder access.
    """
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    if user["role"] == "admin":
        return user
    
    # User role - check folder access
    user_folders = user.get("folders") or []
    
    if folder_name is None or folder_name == "":
        # No specific folder - check if user has any access
        if not user_folders:
            raise HTTPException(status_code=403, detail="No folder access granted")
        return user
    
    if folder_name not in user_folders:
        raise HTTPException(status_code=403, detail=f"No access to folder '{folder_name}'")
    
    return user


def require_auth(request: Request) -> dict:
    """Dependency that requires any authenticated user (user or admin)."""
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


def get_user_by_id(user_id: str) -> Optional[dict]:
    """Get a user by ID from storage."""
    return storage.get("users", user_id)


def list_users() -> list:
    """List all users from storage."""
    return storage.list("users")


def create_user(username: str, password: str, role: str = "user", folders: list = None) -> dict:
    """Create a new user in storage."""
    now = datetime.now(timezone.utc).isoformat()
    user = {
        "id": str(uuid.uuid4()),
        "username": username,
        "password_hash": hash_password(password),
        "role": role,
        "active": True,
        "folders": folders or [],
        "created_at": now,
        "updated_at": now,
    }
    storage.save("users", user["id"], user)
    return user


def update_user(user_id: str, updates: dict) -> Optional[dict]:
    """Update a user's fields in storage."""
    user = storage.get("users", user_id)
    if not user:
        return None
    
    if "role" in updates and updates["role"] is not None:
        user["role"] = updates["role"]
    if "active" in updates and updates["active"] is not None:
        user["active"] = updates["active"]
    if "password" in updates and updates["password"]:
        user["password_hash"] = hash_password(updates["password"])
    if "folders" in updates and updates["folders"] is not None:
        user["folders"] = updates["folders"]
    
    user["updated_at"] = datetime.now(timezone.utc).isoformat()
    storage.save("users", user_id, user)
    return user


def delete_user(user_id: str) -> bool:
    """Delete a user from storage."""
    return storage.delete("users", user_id)


def find_user_by_username(username: str) -> Optional[dict]:
    """Find a user by username."""
    users = storage.list("users")
    for u in users:
        if u.get("username") == username:
            return u
    return None
