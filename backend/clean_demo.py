"""Borra productos, ventas y caja de DEMOSTRACIÓN para empezar con datos reales.
Conserva usuarios, categorías y configuración.   Uso:  python clean_demo.py"""
from app.db import SessionLocal
from app.models import *
db = SessionLocal()
for M in (SaleItem, Sale, CashMovement, CashSession, StockEntry, Product):
    db.query(M).delete()
for c in db.query(Category).all():
    c.next_seq = 1
db.commit()
print("Listo: datos de demostración eliminados.")
