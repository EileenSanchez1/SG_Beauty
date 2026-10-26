"""Migraciones ligeras para columnas nuevas en SQLite/Postgres (sin Alembic)."""
from sqlalchemy import text, inspect
from .db import engine


def _cols(table: str) -> set[str]:
    try:
        insp = inspect(engine)
        return {c["name"] for c in insp.get_columns(table)}
    except Exception:
        return set()


def run_migrations():
    dialect = engine.dialect.name
    with engine.begin() as conn:
        # sales: whatsapp
        sc = _cols("sales")
        if sc:
            if "whatsapp_sent_at" not in sc:
                conn.execute(text("ALTER TABLE sales ADD COLUMN whatsapp_sent_at DATETIME"))
            if "whatsapp_phone" not in sc:
                if dialect == "sqlite":
                    conn.execute(text("ALTER TABLE sales ADD COLUMN whatsapp_phone VARCHAR(30) DEFAULT ''"))
                else:
                    conn.execute(text("ALTER TABLE sales ADD COLUMN whatsapp_phone VARCHAR(30) DEFAULT ''"))
        # products: supplier_id
        pc = _cols("products")
        if pc and "supplier_id" not in pc:
            conn.execute(text("ALTER TABLE products ADD COLUMN supplier_id INTEGER"))
        # stock_entries: supplier_id
        ec = _cols("stock_entries")
        if ec and "supplier_id" not in ec:
            conn.execute(text("ALTER TABLE stock_entries ADD COLUMN supplier_id INTEGER"))
