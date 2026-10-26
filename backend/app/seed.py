"""Datos iniciales. Se ejecuta solo cuando la base de datos está vacía."""
import os, random
from datetime import timedelta, datetime
from sqlalchemy import select
from sqlalchemy.orm import Session
from .models import *
from .security import hash_password
from .api import DEFAULT_SETTINGS

CATEGORIES = [(100, "Esmaltes y Uñas", "💅"), (200, "Depilación y Cejas", "🌸"), (300, "Cabello y Capilar", "💇‍♀️")]

# (cat, nombre, costo, precio, stock inicial, mínimo, proveedor)
DEMO = [
    (100, "Esmalte Rojo Pasión", 2500, 4500, 40, 10, "Distribuciones Rosa"),
    (100, "Esmalte Semipermanente", 11000, 18000, 25, 8, "Distribuciones Rosa"),
    (100, "Removedor de esmalte 120ml", 3500, 6000, 30, 8, "Distribuciones Rosa"),
    (100, "Lima profesional", 1200, 2500, 60, 15, "Beauty Import"),
    (100, "Stickers decoración uñas", 1500, 3000, 50, 10, "Beauty Import"),
    (200, "Cera Miel 500g", 14000, 22000, 18, 6, "Beauty Import"),
    (200, "Bandas Depilatorias x100", 9000, 15000, 20, 6, "Beauty Import"),
    (200, "Gel fijador de cejas", 5000, 9000, 22, 6, "Distribuciones Rosa"),
    (200, "Pinza de cejas", 3500, 7000, 35, 8, "Distribuciones Rosa"),
    (300, "Shampoo Profesional 500ml", 18000, 28000, 24, 8, "Capilar Total"),
    (300, "Tratamiento Keratina", 30000, 45000, 15, 5, "Capilar Total"),
    (300, "Gel fijador cabello", 4500, 8000, 40, 10, "Capilar Total"),
    (300, "Aceite de argán 60ml", 11000, 19000, 20, 6, "Capilar Total"),
    (300, "Ganchos de cabello x12", 2200, 5000, 70, 15, "Beauty Import"),
]


def run(db: Session):
    if db.scalar(select(User)):
        return
    for k, v in DEFAULT_SETTINGS.items():
        db.add(Setting(key=k, value=v))
    admin_pw = os.getenv("ADMIN_PASSWORD", "admin123")
    db.add(User(username="admin", full_name="Administradora", role="admin", password_hash=hash_password(admin_pw)))
    db.add(User(username="vendedor", full_name="Vendedora", role="vendedor", password_hash=hash_password("vendedor123")))
    cats = {}
    for code, name, emoji in CATEGORIES:
        c = Category(code=code, name=name, emoji=emoji)
        db.add(c); cats[code] = c
    db.flush()
    if os.getenv("SEED_DEMO", "1") == "1":
        demo(db, cats)
    db.commit()


def demo(db: Session, cats):
    """Productos de ejemplo + 6 días de ventas para que los reportes no salgan vacíos.
    Para empezar limpio con datos reales: ejecuta  python clean_demo.py"""
    rnd = random.Random(7)
    prods = []
    for code, name, cost, price, stock, mn, sup in DEMO:
        c = cats[code]
        p = Product(sku=f"{code}-{c.next_seq:03d}", name=name, category_id=c.id, cost=cost, price=price,
                    stock=stock + 40, min_stock=mn, supplier=sup, origin="propio")
        c.next_seq += 1
        db.add(p); prods.append(p)
    db.flush()
    admin = db.scalar(select(User).where(User.username == "admin"))
    seller = db.scalar(select(User).where(User.username == "vendedor"))
    today = now().date()
    number = 0
    for back in range(6, 0, -1):
        day = today - timedelta(days=back)
        cs = CashSession(base=100000, opened_by=admin.id, opened_at=datetime.combine(day, datetime.min.time()) + timedelta(hours=8),
                         status="cerrada", closed_at=datetime.combine(day, datetime.min.time()) + timedelta(hours=19))
        db.add(cs); db.flush()
        cash_sales = 0
        for _ in range(rnd.randint(7, 14)):
            number += 1
            items, sub = [], 0
            for p in rnd.sample(prods, rnd.randint(1, 3)):
                q = rnd.randint(1, 3)
                p.stock -= q
                items.append(SaleItem(product_id=p.id, sku=p.sku, name=p.name, qty=q, unit_price=p.price, unit_cost=p.cost))
                sub += q * p.price
            m = rnd.choice(["efectivo", "efectivo", "nequi", "daviplata", "tarjeta"])
            when = datetime.combine(day, datetime.min.time()) + timedelta(hours=rnd.randint(9, 18), minutes=rnd.randint(0, 59))
            db.add(Sale(number=number, session_id=cs.id, user_id=rnd.choice([admin.id, seller.id]), method=m, subtotal=sub,
                        total=sub, received=sub, items=items, created_at=when))
            if m == "efectivo":
                cash_sales += sub
        moves = [("cadena", 20000, "Cuota diaria de la cadena"), ("aseo", 4000, "Tinto y aseo")]
        for k, a, c in moves:
            db.add(CashMovement(session_id=cs.id, kind=k, amount=a, concept=c, user_id=admin.id, created_at=cs.opened_at + timedelta(hours=3)))
        cs.expected_cash = 100000 + cash_sales - 24000
        cs.counted_cash = cs.expected_cash - (2000 if back == 3 else 0)
    # Algunos productos quedan bajos para mostrar las alertas rojas
    for p in prods:
        p.stock = max(p.stock - 40, 0)
    for name, st in [("Esmalte Rojo Pasión", 6), ("Cera Miel 500g", 4), ("Tratamiento Keratina", 5), ("Pinza de cejas", 3)]:
        next(p for p in prods if p.name == name).stock = st
