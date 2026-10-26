import os, hmac, hashlib, secrets, time
import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from .db import get_db
from .models import User

SECRET = os.getenv("SECRET_KEY", "cambia-esta-clave-en-Secrets-de-Replit")
bearer = HTTPBearer(auto_error=False)


def hash_password(p: str) -> str:
    salt = secrets.token_hex(8)
    h = hashlib.pbkdf2_hmac("sha256", p.encode(), salt.encode(), 120_000).hex()
    return f"{salt}${h}"


def verify_password(p: str, stored: str) -> bool:
    try:
        salt, h = stored.split("$")
    except ValueError:
        return False
    calc = hashlib.pbkdf2_hmac("sha256", p.encode(), salt.encode(), 120_000).hex()
    return hmac.compare_digest(calc, h)


def make_token(user: User) -> str:
    return jwt.encode({"sub": str(user.id), "role": user.role, "exp": int(time.time()) + 12 * 3600}, SECRET, "HS256")


def current_user(cred: HTTPAuthorizationCredentials = Depends(bearer), db: Session = Depends(get_db)) -> User:
    if not cred:
        raise HTTPException(401, "Inicia sesión")
    try:
        data = jwt.decode(cred.credentials, SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(401, "Sesión vencida, vuelve a entrar")
    user = db.get(User, int(data["sub"]))
    if not user or not user.active:
        raise HTTPException(401, "Usuario inactivo")
    return user


def admin_only(user: User = Depends(current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(403, "Solo el administrador puede hacer esto")
    return user
