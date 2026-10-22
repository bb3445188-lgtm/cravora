import json
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import AuditEvent, User

security_scheme = HTTPBearer(auto_error=False)

# Rate limiting buckets: key -> list of timestamps
_rate_limit_buckets: Dict[str, List[float]] = defaultdict(list)
_rate_limit_events: List[Dict[str, Any]] = []


def hash_password(password: str) -> str:
    salt = bcrypt.gensalt(rounds=12)
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            hashed_password.encode("utf-8"),
        )
    except Exception:
        return False


def create_access_token(user_id: int, email: str, role: str, expires_delta: Optional[timedelta] = None) -> str:
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    payload = {
        "sub": str(user_id),
        "email": email,
        "role": role,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    try:
        return jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
    except Exception:
        return None


def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> Optional[User]:
    if not credentials or not credentials.credentials:
        return None
    payload = decode_access_token(credentials.credentials)
    if not payload or "sub" not in payload:
        return None
    try:
        user_id = int(payload["sub"])
    except (ValueError, TypeError):
        return None
    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    return user


def get_current_user(
    user: Optional[User] = Depends(get_optional_user),
) -> User:
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please log in to continue.",
        )
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator privileges required for this action.",
        )
    return user


def require_staff_or_admin(user: User = Depends(get_current_user)) -> User:
    if user.role not in ("admin", "staff"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Staff or Administrator privileges required for this action.",
        )
    return user


def check_rate_limit(bucket_key: str, max_requests: int = 30, window_seconds: int = 60) -> None:
    now = time.time()
    cutoff = now - window_seconds
    timestamps = [t for t in _rate_limit_buckets[bucket_key] if t > cutoff]
    if len(timestamps) >= max_requests:
        _rate_limit_events.append({
            "bucket_key": bucket_key,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "max_requests": max_requests,
            "window_seconds": window_seconds,
        })
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Rate limit exceeded ({max_requests} requests per {window_seconds}s). Please wait briefly and try again.",
        )
    timestamps.append(now)
    _rate_limit_buckets[bucket_key] = timestamps


def get_rate_limit_events() -> List[Dict[str, Any]]:
    return list(reversed(_rate_limit_events[-50:]))


def record_audit_event(
    db: Session,
    actor_user_id: Optional[int],
    actor_role: str,
    action: str,
    entity_type: str,
    entity_id: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
    ip_address: Optional[str] = None,
) -> None:
    event = AuditEvent(
        actor_user_id=actor_user_id,
        actor_role=actor_role,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id is not None else None,
        details_json=json.dumps(details or {}),
        ip_address=ip_address,
    )
    db.add(event)
    db.commit()
