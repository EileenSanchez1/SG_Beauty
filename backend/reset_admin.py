"""Restablece admin / admin123 (o ADMIN_PASSWORD del .env).
Uso desde backend con venv:  python reset_admin.py
"""
import os
from pathlib import Path

env_path = Path(__file__).parent / ".env"
if env_path.exists():
    for line in env_path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

from app.db import SessionLocal, Base, engine
from app.models import User
from app.security import hash_password
from sqlalchemy import select

Base.metadata.create_all(engine)
pw = os.getenv("ADMIN_PASSWORD", "admin123")
db = SessionLocal()
u = db.scalar(select(User).where(User.username == "admin"))
if u:
    u.password_hash = hash_password(pw)
    u.active = True
    u.role = "admin"
    db.commit()
    print(f"OK: contraseña de 'admin' restablecida a: {pw}")
else:
    db.add(User(username="admin", full_name="Administradora", role="admin",
                password_hash=hash_password(pw), active=True))
    db.commit()
    print(f"OK: usuario 'admin' creado con contraseña: {pw}")

v = db.scalar(select(User).where(User.username == "vendedor"))
if not v:
    db.add(User(username="vendedor", full_name="Vendedora", role="vendedor",
                password_hash=hash_password("vendedor123"), active=True))
    db.commit()
    print("OK: usuario 'vendedor' / vendedor123 creado")
else:
    print("Usuario vendedor ya existe (contraseña no modificada)")
db.close()
