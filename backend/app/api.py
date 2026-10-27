import os, uuid, io, json
from datetime import date, datetime, timedelta
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select, func
from sqlalchemy.orm import Session, joinedload

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable

from .db import get_db
from .models import *
from .security import current_user, admin_only, hash_password, verify_password, make_token

router = APIRouter(prefix="/api")
METHODS = ["efectivo", "nequi", "daviplata", "tarjeta", "qr", "addi", "sistecredito"]
FINANCE_METHODS = {"addi", "sistecredito"}
FINANCE_RATE = 0.08
MOVE_KINDS = ["cadena", "ahorro", "aseo", "gasto", "propina", "proveedor", "otro"]
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static", "uploads")

DEFAULT_SETTINGS = {
    "business_name": "Distribuidora de Belleza",
    "boss_phone": "",
    "business_whatsapp": "",  # WhatsApp Business del local (Opción A)
    "tax_rate": "0",
    "receipt_footer": "¡Gracias por tu compra! 💖",
    "allow_negative_stock": "0",  # 0 = no vender sin stock (admin puede forzar)
}


# ───────────── helpers ─────────────
def iso(d):
    return d.isoformat(timespec="seconds") if d else None


def get_settings(db):
    s = dict(DEFAULT_SETTINGS)
    for r in db.scalars(select(Setting)):
        s[r.key] = r.value
    return s


def log_audit(db: Session, user: User | None, action: str, entity: str = "", entity_id: int | None = None, detail: str = ""):
    db.add(AuditLog(
        user_id=user.id if user else None,
        username=user.username if user else "",
        action=action, entity=entity, entity_id=entity_id, detail=detail[:2000],
    ))


def log_stock(db: Session, product: Product, qty: int, kind: str, user: User | None,
              ref_type: str = "", ref_id: int | None = None, note: str = ""):
    """qty positivo = entra a bodega; negativo = sale."""
    product.stock = int(product.stock) + int(qty)
    db.add(InventoryMovement(
        product_id=product.id, qty=qty, kind=kind, ref_type=ref_type, ref_id=ref_id,
        note=note, stock_after=product.stock, user_id=user.id if user else None,
    ))



def product_out(p: Product, admin: bool):
    sup_name = p.supplier or ""
    if getattr(p, "supplier_id", None) and getattr(p, "supplier_rel", None):
        sup_name = p.supplier_rel.name
    d = dict(
        id=p.id, sku=p.sku, barcode=p.barcode, name=p.name, category_id=p.category_id,
        category=p.category.name if p.category else "", category_code=p.category.code if p.category else None,
        emoji=p.category.emoji if p.category else "🛍️", origin=p.origin, supplier=sup_name,
        supplier_id=getattr(p, "supplier_id", None),
        price=p.price, stock=p.stock, min_stock=p.min_stock, image=p.image, active=p.active,
        low=p.stock <= p.min_stock,
    )
    if admin:
        d["cost"] = p.cost
    return d


def sale_out(s: Sale, admin: bool):
    items = []
    for i in s.items:
        it = dict(sku=i.sku, name=i.name, qty=i.qty, unit_price=i.unit_price, line_total=i.qty * i.unit_price)
        if admin:
            it["unit_cost"] = i.unit_cost
        items.append(it)
    net = (s.subtotal or 0) - (s.discount or 0)
    finance_fee = round(net * FINANCE_RATE) if s.method in FINANCE_METHODS else 0
    return dict(
        id=s.id, number=s.number, method=s.method, subtotal=s.subtotal, discount=s.discount,
        discount_reason=s.discount_reason, tax=s.tax, finance_fee=finance_fee, total=s.total, received=s.received,
        change=max(0, s.received - s.total) if s.method == "efectivo" and s.received else 0,
        customer_name=s.customer_name, customer_phone=s.customer_phone, status=s.status,
        whatsapp_sent_at=iso(getattr(s, "whatsapp_sent_at", None)),
        whatsapp_phone=getattr(s, "whatsapp_phone", "") or "",
        created_at=iso(s.created_at), seller=s.user.full_name if s.user else "", items=items,
    )


def session_summary(db: Session, cs: CashSession):
    sales = db.scalars(select(Sale).where(Sale.session_id == cs.id, Sale.status == "ok")).all()
    by_method = {m: 0 for m in METHODS}
    for s in sales:
        by_method[s.method] = by_method.get(s.method, 0) + s.total
    moves = db.scalars(select(CashMovement).where(CashMovement.session_id == cs.id)
                       .order_by(CashMovement.created_at.desc())).all()
    gastos = sum(m.amount for m in moves)
    ventas = sum(by_method.values())
    efectivo_esperado = cs.base + by_method["efectivo"] - gastos
    return dict(
        id=cs.id, status=cs.status, base=cs.base, opened_at=iso(cs.opened_at), closed_at=iso(cs.closed_at),
        n_sales=len(sales), ventas_total=ventas, by_method=by_method,
        descuentos=sum(s.discount for s in sales), gastos=gastos,
        total_formula=cs.base + ventas - gastos,           # Ventas + Base − Gastos (según propuesta)
        efectivo_esperado=efectivo_esperado,               # solo billetes/monedas que debe haber en la caja
        digital=ventas - by_method["efectivo"],            # Nequi + Daviplata + Tarjeta
        counted_cash=cs.counted_cash,
        diferencia=(cs.counted_cash - (cs.expected_cash if cs.expected_cash is not None else efectivo_esperado))
        if cs.counted_cash is not None else None,
        notes=cs.notes,
        movements=[dict(id=m.id, kind=m.kind, amount=m.amount, concept=m.concept, created_at=iso(m.created_at)) for m in moves],
    )


def open_session(db) -> CashSession | None:
    return db.scalar(select(CashSession).where(CashSession.status == "abierta").order_by(CashSession.id.desc()))


def parse_day(s: str | None, default: date) -> date:
    try:
        return date.fromisoformat(s) if s else default
    except ValueError:
        raise HTTPException(400, "Fecha inválida (AAAA-MM-DD)")


# ───────────── auth ─────────────
class LoginIn(BaseModel):
    username: str
    password: str


def user_out(u: User):
    return dict(id=u.id, username=u.username, full_name=u.full_name, role=u.role, active=u.active)


@router.post("/auth/login")
def login(data: LoginIn, db: Session = Depends(get_db)):
    u = db.scalar(select(User).where(func.lower(User.username) == data.username.strip().lower()))
    if not u or not u.active or not verify_password(data.password, u.password_hash):
        raise HTTPException(401, "Usuario o contraseña incorrectos")
    return dict(token=make_token(u), user=user_out(u))


@router.get("/auth/me")
def me(u: User = Depends(current_user)):
    return user_out(u)


# ───────────── usuarios ─────────────
class UserIn(BaseModel):
    username: str
    full_name: str
    role: str = "vendedor"
    password: str = ""
    active: bool = True


@router.get("/users")
def users(db: Session = Depends(get_db), _: User = Depends(admin_only)):
    return [user_out(u) for u in db.scalars(select(User).order_by(User.id))]


@router.post("/users")
def user_create(d: UserIn, db: Session = Depends(get_db), _: User = Depends(admin_only)):
    if d.role not in ("admin", "vendedor"):
        raise HTTPException(400, "Rol inválido")
    if len(d.password) < 6:
        raise HTTPException(400, "La contraseña debe tener mínimo 6 caracteres")
    if db.scalar(select(User).where(func.lower(User.username) == d.username.strip().lower())):
        raise HTTPException(400, "Ese usuario ya existe")
    u = User(username=d.username.strip(), full_name=d.full_name.strip(), role=d.role,
             password_hash=hash_password(d.password), active=d.active)
    db.add(u); db.commit()
    return user_out(u)


@router.put("/users/{uid}")
def user_update(uid: int, d: UserIn, db: Session = Depends(get_db), me: User = Depends(admin_only)):
    u = db.get(User, uid)
    if not u:
        raise HTTPException(404, "No existe")
    if uid == me.id and (d.role != "admin" or not d.active):
        raise HTTPException(400, "No puedes quitarte tu propio acceso de administrador")
    u.full_name, u.role, u.active = d.full_name.strip(), d.role, d.active
    if d.password:
        if len(d.password) < 6:
            raise HTTPException(400, "La contraseña debe tener mínimo 6 caracteres")
        u.password_hash = hash_password(d.password)
    db.commit()
    return user_out(u)


# ───────────── configuración ─────────────
@router.get("/settings")
def settings_get(db: Session = Depends(get_db), _: User = Depends(current_user)):
    return get_settings(db)


@router.put("/settings")
def settings_put(d: dict, db: Session = Depends(get_db), _: User = Depends(admin_only)):
    for k, v in d.items():
        if k not in DEFAULT_SETTINGS:
            continue
        if k == "tax_rate":
            try:
                v = str(max(0.0, min(100.0, float(v))))
            except ValueError:
                raise HTTPException(400, "Impuesto inválido")
        row = db.get(Setting, k)
        if row:
            row.value = str(v)
        else:
            db.add(Setting(key=k, value=str(v)))
    db.commit()
    return get_settings(db)


# ───────────── categorías ─────────────
class CategoryIn(BaseModel):
    code: int = Field(ge=100, le=9999)
    name: str
    emoji: str = "🛍️"


def cat_out(c: Category):
    return dict(id=c.id, code=c.code, name=c.name, emoji=c.emoji, next_sku=f"{c.code}-{c.next_seq:03d}")


@router.get("/categories")
def categories(db: Session = Depends(get_db), _: User = Depends(current_user)):
    return [cat_out(c) for c in db.scalars(select(Category).order_by(Category.code))]


@router.post("/categories")
def category_create(d: CategoryIn, db: Session = Depends(get_db), _: User = Depends(admin_only)):
    if db.scalar(select(Category).where(Category.code == d.code)):
        raise HTTPException(400, f"Ya existe la categoría {d.code}")
    c = Category(code=d.code, name=d.name.strip(), emoji=d.emoji or "🛍️")
    db.add(c); db.commit()
    return cat_out(c)


@router.put("/categories/{cid}")
def category_update(cid: int, d: CategoryIn, db: Session = Depends(get_db), _: User = Depends(admin_only)):
    c = db.get(Category, cid)
    if not c:
        raise HTTPException(404, "No existe")
    c.name, c.emoji = d.name.strip(), d.emoji or c.emoji  # el código no cambia (ya hay SKUs creados)
    db.commit()
    return cat_out(c)


# ───────────── productos ─────────────
class ProductIn(BaseModel):
    name: str
    category_id: int
    barcode: str | None = None
    origin: str = "propio"
    supplier: str = ""
    supplier_id: int | None = None
    cost: int = Field(0, ge=0)
    price: int = Field(0, ge=0)
    stock: int = Field(0, ge=0)
    min_stock: int = Field(0, ge=0)
    image: str | None = None
    active: bool = True


@router.get("/products")
def products(q: str = "", category_id: int | None = None, low: bool = False, all: bool = False,
             db: Session = Depends(get_db), u: User = Depends(current_user)):
    stmt = select(Product).options(joinedload(Product.category), joinedload(Product.supplier_rel)).order_by(Product.sku)
    if not (all and u.role == "admin"):
        stmt = stmt.where(Product.active == True)  # noqa
    if category_id:
        stmt = stmt.where(Product.category_id == category_id)
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(func.lower(Product.name).like(like) | func.lower(Product.sku).like(like) | (Product.barcode == q))
    rows = db.scalars(stmt).unique().all()
    if low:
        rows = [p for p in rows if p.stock <= p.min_stock]
    return [product_out(p, u.role == "admin") for p in rows]


@router.post("/products")
def product_create(d: ProductIn, db: Session = Depends(get_db), me: User = Depends(admin_only)):
    cat = db.get(Category, d.category_id)
    if not cat:
        raise HTTPException(400, "Categoría inválida")
    barcode = (d.barcode or "").strip() or None
    if barcode and db.scalar(select(Product).where(Product.barcode == barcode)):
        raise HTTPException(400, "Ese código de barras ya está en otro producto")
    sku = f"{cat.code}-{cat.next_seq:03d}"
    cat.next_seq += 1
    p = Product(sku=sku, barcode=barcode, name=d.name.strip(), category_id=cat.id,
                origin="fabrica" if d.origin == "fabrica" else "propio", supplier=d.supplier.strip(),
                supplier_id=d.supplier_id, cost=d.cost, price=d.price, stock=0, min_stock=d.min_stock,
                image=d.image, active=d.active)
    db.add(p); db.flush()
    if d.stock > 0:
        entry = StockEntry(product_id=p.id, qty=d.stock, unit_cost=d.cost, supplier=d.supplier,
                           supplier_id=d.supplier_id, note="Stock inicial", user_id=me.id)
        db.add(entry); db.flush()
        log_stock(db, p, d.stock, "entrada", me, ref_type="entry", ref_id=entry.id, note="Stock inicial")
    log_audit(db, me, "product_create", "product", p.id, f"{p.sku} {p.name}")
    db.commit()
    return product_out(db.get(Product, p.id), True)


@router.put("/products/{pid}")
def product_update(pid: int, d: ProductIn, db: Session = Depends(get_db), me: User = Depends(admin_only)):
    p = db.get(Product, pid)
    if not p:
        raise HTTPException(404, "No existe")
    cat = db.get(Category, d.category_id)
    if not cat:
        raise HTTPException(400, "Categoría inválida")
    barcode = (d.barcode or "").strip() or None
    if barcode:
        other = db.scalar(select(Product).where(Product.barcode == barcode, Product.id != pid))
        if other:
            raise HTTPException(400, "Ese código de barras ya está en otro producto")
    old_cat = p.category_id
    p.name = d.name.strip()
    p.barcode = barcode
    if d.supplier_id:
        srow = db.get(Supplier, d.supplier_id)
        if not srow:
            raise HTTPException(400, "Proveedor inválido")
        p.supplier_id = srow.id
        p.supplier = srow.name
    else:
        p.supplier_id = None
        p.supplier = (d.supplier or "").strip()
    p.origin = "fabrica" if d.origin == "fabrica" else "propio"
    p.cost, p.price, p.min_stock, p.active = d.cost, d.price, d.min_stock, d.active
    if d.category_id != old_cat:
        new_sku = f"{cat.code}-{cat.next_seq:03d}"
        while db.scalar(select(Product).where(Product.sku == new_sku)):
            cat.next_seq += 1
            new_sku = f"{cat.code}-{cat.next_seq:03d}"
        p.sku = new_sku
        cat.next_seq += 1
    p.category_id = cat.id
    if d.image is not None:
        p.image = d.image or None
    log_audit(db, me, "product_update", "product", p.id, p.sku)
    db.commit()
    p = db.scalars(select(Product).options(joinedload(Product.category), joinedload(Product.supplier_rel)).where(Product.id == pid)).unique().first()
    return product_out(p, True)


@router.get("/products/code/{code}")
def product_by_code(code: str, db: Session = Depends(get_db), u: User = Depends(current_user)):
    p = db.scalar(select(Product).options(joinedload(Product.category))
                  .where(Product.active == True, (Product.sku == code) | (Product.barcode == code)))  # noqa
    if not p:
        raise HTTPException(404, "Código no encontrado")
    return product_out(p, u.role == "admin")


@router.post("/products/{pid}/image")
async def product_image(pid: int, file: UploadFile = File(...), db: Session = Depends(get_db), _: User = Depends(admin_only)):
    p = db.get(Product, pid)
    if not p:
        raise HTTPException(404, "No existe")
    ext = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}.get(file.content_type)
    if not ext:
        raise HTTPException(400, "Solo se permiten imágenes JPG, PNG o WEBP")
    data = await file.read()
    if len(data) > 3 * 1024 * 1024:
        raise HTTPException(400, "La foto no puede pesar más de 3 MB")
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    name = f"{uuid.uuid4().hex}.{ext}"
    with open(os.path.join(UPLOAD_DIR, name), "wb") as f:
        f.write(data)
    p.image = f"/static/uploads/{name}"
    db.commit()
    return dict(image=p.image)


# ───────────── inventario ─────────────
class EntryIn(BaseModel):
    product_id: int
    qty: int = Field(gt=0)
    unit_cost: int | None = Field(None, ge=0)
    supplier: str = ""
    note: str = ""


class AdjustIn(BaseModel):
    product_id: int
    new_stock: int = Field(ge=0)
    note: str = "Ajuste de inventario"


@router.post("/inventory/entry")
def inv_entry(d: EntryIn, db: Session = Depends(get_db), me: User = Depends(admin_only)):
    p = db.get(Product, d.product_id)
    if not p:
        raise HTTPException(404, "Producto no existe")
    if d.unit_cost is not None:
        p.cost = d.unit_cost
    if d.supplier:
        p.supplier = d.supplier
    entry = StockEntry(product_id=p.id, qty=d.qty, unit_cost=p.cost, supplier=p.supplier or d.supplier,
                       note=d.note, user_id=me.id)
    db.add(entry)
    db.flush()
    log_stock(db, p, d.qty, "entrada", me, ref_type="entry", ref_id=entry.id, note=d.note or "Entrada de mercancía")
    log_audit(db, me, "inventory_entry", "product", p.id, f"+{d.qty} {p.sku} {p.name}")
    db.commit()
    return product_out(p, True)


@router.post("/inventory/adjust")
def inv_adjust(d: AdjustIn, db: Session = Depends(get_db), me: User = Depends(admin_only)):
    p = db.get(Product, d.product_id)
    if not p:
        raise HTTPException(404, "Producto no existe")
    diff = d.new_stock - p.stock
    log_stock(db, p, diff, "ajuste", me, ref_type="adjust", note=d.note or "Ajuste de inventario")
    log_audit(db, me, "inventory_adjust", "product", p.id, f"{p.sku}: diff {diff} -> stock {p.stock}. {d.note}")
    db.commit()
    return product_out(p, True)


@router.get("/inventory/entries")
def inv_entries(limit: int = 100, db: Session = Depends(get_db), _: User = Depends(admin_only)):
    rows = db.scalars(select(StockEntry).options(joinedload(StockEntry.product)).order_by(StockEntry.id.desc()).limit(limit)).all()
    return [dict(id=e.id, product=e.product.name, sku=e.product.sku, qty=e.qty, unit_cost=e.unit_cost,
                 supplier=e.supplier, note=e.note, created_at=iso(e.created_at)) for e in rows]


@router.get("/inventory/reorder")
def inv_reorder(db: Session = Depends(get_db), _: User = Depends(admin_only)):
    """Lista automática de pedido: todo lo que está en o bajo el stock mínimo, agrupado por proveedor."""
    rows = db.scalars(select(Product).options(joinedload(Product.category))
                      .where(Product.active == True).order_by(Product.supplier, Product.name)).unique().all()  # noqa
    groups: dict[str, list] = {}
    for p in rows:
        if p.stock <= p.min_stock:
            suggested = max(p.min_stock * 2 - p.stock, 1)
            groups.setdefault(p.supplier or "Sin proveedor", []).append(dict(
                id=p.id, sku=p.sku, name=p.name, stock=p.stock, min_stock=p.min_stock,
                suggested=suggested, cost=p.cost, est_total=suggested * p.cost))
    return [dict(supplier=k, items=v, est_total=sum(i["est_total"] for i in v)) for k, v in groups.items()]


# ───────────── caja ─────────────
class OpenIn(BaseModel):
    base: int = Field(ge=0)


class MoveIn(BaseModel):
    kind: str
    amount: int = Field(gt=0)
    concept: str = ""


class CloseIn(BaseModel):
    counted_cash: int = Field(ge=0)
    notes: str = ""


@router.get("/cash/current")
def cash_current(db: Session = Depends(get_db), _: User = Depends(current_user)):
    cs = open_session(db)
    return session_summary(db, cs) if cs else None


@router.post("/cash/open")
def cash_open(d: OpenIn, db: Session = Depends(get_db), me: User = Depends(current_user)):
    if open_session(db):
        raise HTTPException(400, "Ya hay una caja abierta")
    cs = CashSession(base=d.base, opened_by=me.id)
    db.add(cs); db.commit()
    return session_summary(db, cs)


@router.post("/cash/movements")
def cash_move(d: MoveIn, db: Session = Depends(get_db), me: User = Depends(current_user)):
    cs = open_session(db)
    if not cs:
        raise HTTPException(400, "Primero abre la caja")
    if d.kind not in MOVE_KINDS:
        raise HTTPException(400, "Tipo de salida inválido")
    db.add(CashMovement(session_id=cs.id, kind=d.kind, amount=d.amount, concept=d.concept.strip(), user_id=me.id))
    db.commit()
    return session_summary(db, cs)


@router.delete("/cash/movements/{mid}")
def cash_move_delete(mid: int, db: Session = Depends(get_db), _: User = Depends(admin_only)):
    m = db.get(CashMovement, mid)
    if not m:
        raise HTTPException(404, "No existe")
    cs = db.get(CashSession, m.session_id)
    if cs.status != "abierta":
        raise HTTPException(400, "La caja ya está cerrada")
    db.delete(m); db.commit()
    return session_summary(db, cs)


@router.post("/cash/close")
def cash_close(d: CloseIn, db: Session = Depends(get_db), me: User = Depends(current_user)):
    cs = open_session(db)
    if not cs:
        raise HTTPException(400, "No hay caja abierta")
    sm = session_summary(db, cs)
    cs.counted_cash, cs.expected_cash = d.counted_cash, sm["efectivo_esperado"]
    cs.notes, cs.closed_at, cs.status = d.notes.strip(), now(), "cerrada"
    db.commit()
    return session_summary(db, cs)


@router.get("/cash/sessions")
def cash_sessions(limit: int = 30, db: Session = Depends(get_db), _: User = Depends(current_user)):
    rows = db.scalars(select(CashSession).order_by(CashSession.id.desc()).limit(limit)).all()
    out = []
    for cs in rows:
        s = session_summary(db, cs)
        s.pop("movements")
        out.append(s)
    return out


@router.get("/cash/sessions/{sid}")
def cash_session(sid: int, db: Session = Depends(get_db), _: User = Depends(current_user)):
    cs = db.get(CashSession, sid)
    if not cs:
        raise HTTPException(404, "No existe")
    return session_summary(db, cs)


# ───────────── ventas / POS ─────────────
class ItemIn(BaseModel):
    product_id: int
    qty: int = Field(gt=0)


class SaleIn(BaseModel):
    items: list[ItemIn] = Field(min_length=1)
    method: str
    discount: int = Field(0, ge=0)
    discount_reason: str = ""
    received: int | None = Field(0, ge=0)
    customer_name: str = ""
    customer_phone: str = ""


@router.post("/sales")
def sale_create(d: SaleIn, db: Session = Depends(get_db), me: User = Depends(current_user)):
    if d.method not in METHODS:
        raise HTTPException(400, "Método de pago inválido")
    cs = open_session(db)
    if not cs:
        raise HTTPException(400, "La caja está cerrada. Pídele al administrador que la abra.")
    settings = get_settings(db)
    allow_neg = settings.get("allow_negative_stock") == "1"
    merged: dict[int, int] = {}
    for it in d.items:
        merged[it.product_id] = merged.get(it.product_id, 0) + it.qty
    sale_items, subtotal = [], 0
    products_used = []
    for pid, qty in merged.items():
        p = db.get(Product, pid)
        if not p or not p.active:
            raise HTTPException(400, "Un producto ya no está disponible")
        if qty > p.stock and not (allow_neg and me.role == "admin"):
            raise HTTPException(400, f"Solo quedan {p.stock} de «{p.name}»")
        subtotal += qty * p.price
        sale_items.append(SaleItem(product_id=p.id, sku=p.sku, name=p.name, qty=qty, unit_price=p.price, unit_cost=p.cost))
        products_used.append((p, qty))
    if d.discount > subtotal:
        raise HTTPException(400, "El descuento no puede ser mayor que la venta")
    if d.discount > 0 and not d.discount_reason.strip():
        raise HTTPException(400, "Escribe el motivo del descuento")
    net = subtotal - d.discount
    rate = float(settings.get("tax_rate") or 0)
    vat = round(net * rate / 100)
    finance = round(net * FINANCE_RATE) if d.method in FINANCE_METHODS else 0
    tax = vat + finance
    total = net + tax
    if d.method == "efectivo" and d.received and d.received < total:
        raise HTTPException(400, "El dinero recibido es menor al total")
    last = db.scalar(select(func.max(Sale.number))) or 0
    sale = Sale(number=last + 1, session_id=cs.id, user_id=me.id, method=d.method, subtotal=subtotal,
                discount=d.discount, discount_reason=d.discount_reason.strip(), tax=tax, total=total,
                received=(d.received if d.received is not None else total) if d.method == "efectivo" else total,
                customer_name=d.customer_name.strip(), customer_phone=d.customer_phone.strip(), items=sale_items)
    db.add(sale); db.flush()
    low_after = []
    for p, qty in products_used:
        log_stock(db, p, -qty, "venta", me, ref_type="sale", ref_id=sale.id, note=f"Venta #{sale.number}")
        if p.stock <= p.min_stock:
            low_after.append(dict(id=p.id, sku=p.sku, name=p.name, stock=p.stock, min_stock=p.min_stock))
    db.commit()
    db.refresh(sale)
    out = sale_out(sale, me.role == "admin")
    out["low_stock"] = low_after
    return out


@router.get("/sales")
def sales_list(
    date_from: str | None = None,
    date_to: str | None = None,
    method: str | None = None,
    db: Session = Depends(get_db),
    me: User = Depends(current_user),
):
    today = now().date()
    if me.role != "admin":
        d1 = d2 = today
    else:
        d1 = parse_day(date_from, today)
        d2 = parse_day(date_to, today)
    stmt = (select(Sale).options(joinedload(Sale.items), joinedload(Sale.user))
            .where(Sale.created_at >= datetime.combine(d1, datetime.min.time()),
                   Sale.created_at < datetime.combine(d2 + timedelta(days=1), datetime.min.time()))
            .order_by(Sale.id.desc()))
    if me.role != "admin":
        stmt = stmt.where(Sale.user_id == me.id)
    if method and method in METHODS:
        stmt = stmt.where(Sale.method == method)
    rows = db.scalars(stmt).unique().all()
    out = [sale_out(s, me.role == "admin") for s in rows]
    by_method = {m: 0 for m in METHODS}
    n_ok = total_ok = 0
    for s in rows:
        if s.status != "ok":
            continue
        n_ok += 1
        total_ok += s.total
        by_method[s.method] = by_method.get(s.method, 0) + s.total
    return dict(
        sales=out,
        summary=dict(date_from=d1.isoformat(), date_to=d2.isoformat(), count=n_ok, total=total_ok, by_method=by_method),
    )


@router.get("/sales/{sid}")
def sale_get(sid: int, db: Session = Depends(get_db), me: User = Depends(current_user)):
    s = db.get(Sale, sid)
    if not s or (me.role != "admin" and s.user_id != me.id):
        raise HTTPException(404, "No existe")
    return sale_out(s, me.role == "admin")


@router.post("/sales/{sid}/void")
def sale_void(sid: int, db: Session = Depends(get_db), me: User = Depends(admin_only)):
    s = db.scalars(select(Sale).options(joinedload(Sale.items)).where(Sale.id == sid)).unique().first()
    if not s:
        raise HTTPException(404, "No existe")
    if s.status in ("anulada", "devuelta"):
        raise HTTPException(400, "Ya está anulada o devuelta")
    cs = db.get(CashSession, s.session_id)
    if cs.status != "abierta":
        raise HTTPException(400, "Esa venta es de una caja ya cerrada")
    for i in s.items:
        if i.product_id:
            p = db.get(Product, i.product_id)
            if p:
                log_stock(db, p, i.qty, "anulacion", me, ref_type="sale", ref_id=s.id, note=f"Anulación #{s.number}")
    s.status = "anulada"
    log_audit(db, me, "void_sale", "sale", s.id, f"Anuló comprobante #{s.number} total {s.total}")
    db.commit()
    return sale_out(s, True)


@router.post("/sales/{sid}/return")
def sale_return(sid: int, db: Session = Depends(get_db), me: User = Depends(admin_only)):
    """Devolución completa: reingresa stock y marca la venta como devuelta (caja abierta)."""
    s = db.scalars(select(Sale).options(joinedload(Sale.items)).where(Sale.id == sid)).unique().first()
    if not s:
        raise HTTPException(404, "No existe")
    if s.status != "ok":
        raise HTTPException(400, "Solo se pueden devolver ventas activas")
    cs = db.get(CashSession, s.session_id)
    if not cs or cs.status != "abierta":
        raise HTTPException(400, "La caja de esa venta ya está cerrada")
    for i in s.items:
        if i.product_id:
            p = db.get(Product, i.product_id)
            if p:
                log_stock(db, p, i.qty, "devolucion", me, ref_type="sale", ref_id=s.id, note=f"Devolución #{s.number}")
    s.status = "devuelta"
    log_audit(db, me, "return_sale", "sale", s.id, f"Devolución comprobante #{s.number} total {s.total}")
    db.commit()
    return sale_out(s, True)


@router.post("/sales/{sid}/whatsapp-sent")
def sale_whatsapp_sent(sid: int, body: dict | None = None, db: Session = Depends(get_db), me: User = Depends(current_user)):
    """Marca el comprobante como enviado por WhatsApp Business del local."""
    s = db.get(Sale, sid)
    if not s or (me.role != "admin" and s.user_id != me.id):
        raise HTTPException(404, "No existe")
    phone = ""
    if body and body.get("phone"):
        phone = str(body.get("phone")).strip()
    phone = phone or s.customer_phone or ""
    s.whatsapp_sent_at = now()
    s.whatsapp_phone = phone
    log_audit(db, me, "whatsapp_send", "sale", s.id, f"#{s.number} -> {phone}")
    db.commit()
    return sale_out(s, me.role == "admin")


# ───────────── reportes ─────────────
@router.get("/dashboard")
@router.get("/reports/dashboard")
def dashboard(db: Session = Depends(get_db), _: User = Depends(admin_only)):
    today = now().date()
    start = today - timedelta(days=6)
    sales = db.scalars(select(Sale).where(Sale.status == "ok",
                                          Sale.created_at >= datetime.combine(start, datetime.min.time()))).all()
    days = {(start + timedelta(days=i)).isoformat(): 0 for i in range(7)}
    for s in sales:
        days[s.created_at.date().isoformat()] += s.total
    today_sales = [s for s in sales if s.created_at.date() == today]
    low = db.scalars(select(Product).options(joinedload(Product.category)).where(Product.active == True)  # noqa
                     .order_by(Product.stock)).unique().all()
    low = [product_out(p, True) for p in low if p.stock <= p.min_stock]
    cs = open_session(db)
    cash_open = cs is not None
    if not cs:
        # Última sesión (hoy o la más reciente) para que el inicio no quede en "—"
        cs = db.scalar(select(CashSession).order_by(CashSession.id.desc()).limit(1))
    cash_info = session_summary(db, cs) if cs else None
    if cash_info is not None:
        cash_info = dict(cash_info)
        cash_info["is_open"] = cash_open
    return dict(
        today_total=sum(s.total for s in today_sales),
        today_count=len(today_sales),
        week=[dict(day=k, total=v) for k, v in days.items()],
        low_count=len(low),
        low=low[:8],
        cash=cash_info,
    )


def _build_report(db: Session, date_from: str | None, date_to: str | None):
    """Construye el resumen de reportes para un rango de fechas (usado por JSON y PDF)."""
    today = now().date()
    d1, d2 = parse_day(date_from, today - timedelta(days=6)), parse_day(date_to, today)
    if d2 < d1 or (d2 - d1).days > 366:
        raise HTTPException(400, "Rango de fechas inválido")
    lo, hi = datetime.combine(d1, datetime.min.time()), datetime.combine(d2 + timedelta(days=1), datetime.min.time())
    sales = db.scalars(select(Sale).options(joinedload(Sale.items).joinedload(SaleItem.product).joinedload(Product.category))
                       .where(Sale.status == "ok", Sale.created_at >= lo, Sale.created_at < hi)).unique().all()
    days = {(d1 + timedelta(days=i)).isoformat(): 0 for i in range((d2 - d1).days + 1)}
    by_method = {m: 0 for m in METHODS}
    top: dict[str, dict] = {}
    by_cat: dict[str, int] = {}
    revenue = cost = discounts = 0
    for s in sales:
        days[s.created_at.date().isoformat()] += s.total
        by_method[s.method] += s.total
        discounts += s.discount
        for i in s.items:
            line = i.qty * i.unit_price
            revenue += line
            cost += i.qty * i.unit_cost
            t = top.setdefault(i.sku, dict(sku=i.sku, name=i.name, qty=0, sales=0, profit=0, total=0))
            t["qty"] += i.qty
            t["sales"] += line
            t["total"] += line
            t["profit"] += i.qty * (i.unit_price - i.unit_cost)
            cname = i.product.category.name if i.product and i.product.category else "Otros"
            by_cat[cname] = by_cat.get(cname, 0) + line
    profit = revenue - discounts - cost
    net_rev = revenue - discounts
    moves = db.scalars(select(CashMovement).where(CashMovement.created_at >= lo, CashMovement.created_at < hi)).all()
    exp: dict[str, int] = {}
    for m in moves:
        exp[m.kind] = exp.get(m.kind, 0) + m.amount
    total = sum(s.total for s in sales)
    n = len(sales)
    return dict(
        date_from=d1.isoformat(), date_to=d2.isoformat(),
        n_sales=n, count=n, total=total, discounts=discounts,
        profit=profit, margin=round(profit * 100 / net_rev, 1) if net_rev else 0,
        avg_ticket=round(total / n) if n else 0,
        expenses=sum(exp.values()), expenses_by_kind=exp,
        days=[dict(day=k, total=v) for k, v in days.items()], by_method=by_method,
        top=sorted(top.values(), key=lambda x: -x["qty"])[:15],
        by_category=sorted([dict(name=k, total=v) for k, v in by_cat.items()], key=lambda x: -x["total"]),
    )


@router.get("/reports/summary")
def report_summary(date_from: str | None = None, date_to: str | None = None,
                   db: Session = Depends(get_db), _: User = Depends(admin_only)):
    return _build_report(db, date_from, date_to)


@router.get("/reports/period")
def report_period(
    from_: str | None = Query(None, alias="from"),
    to: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(admin_only),
):
    """Alias compatible con el frontend (params from/to o date_from/date_to)."""
    return _build_report(db, from_ or date_from, to or date_to)


def _money_pdf(n):
    n = int(round(float(n or 0)))
    sign = "-" if n < 0 else ""
    return f"{sign}${abs(n):,}".replace(",", ".")


def _pdf_styles():
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="TitlePink", parent=styles["Title"], fontSize=16, textColor=colors.HexColor("#9b2d5a")))
    styles.add(ParagraphStyle(name="Sub", parent=styles["Normal"], fontSize=10, textColor=colors.HexColor("#555555")))
    styles.add(ParagraphStyle(name="Small", parent=styles["Normal"], fontSize=8, textColor=colors.HexColor("#666666")))
    return styles


@router.get("/reports/pdf")
def report_pdf(
    date_from: str | None = None,
    date_to: str | None = None,
    from_: str | None = Query(None, alias="from"),
    to: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(admin_only),
):
    """PDF del reporte del periodo (ventas, márgenes, top productos, gastos)."""
    data = _build_report(db, from_ or date_from, to or date_to)
    settings = get_settings(db)
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=letter, leftMargin=18 * mm, rightMargin=18 * mm,
                            topMargin=15 * mm, bottomMargin=15 * mm)
    styles = _pdf_styles()
    story = []
    story.append(Paragraph(settings.get("business_name") or "Distribuidora de Belleza", styles["TitlePink"]))
    story.append(Paragraph(
        f"Reporte de ventas · {data['date_from']} a {data['date_to']}", styles["Sub"]))
    story.append(Spacer(1, 6))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#e8a0bf")))
    story.append(Spacer(1, 10))

    summary_data = [
        ["Ventas del periodo", _money_pdf(data["total"]), "Nº comprobantes", str(data["n_sales"])],
        ["Descuentos", _money_pdf(data["discounts"]), "Ticket promedio", _money_pdf(data["avg_ticket"])],
        ["Ganancia estimada", _money_pdf(data["profit"]), "Margen %", f"{data['margin']}%"],
        ["Gastos / salidas", _money_pdf(data["expenses"]), "", ""],
    ]
    t = Table(summary_data, colWidths=[40 * mm, 40 * mm, 40 * mm, 40 * mm])
    t.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#666")),
        ("TEXTCOLOR", (2, 0), (2, -1), colors.HexColor("#666")),
        ("FONTNAME", (1, 0), (1, -1), "Helvetica-Bold"),
        ("FONTNAME", (3, 0), (3, -1), "Helvetica-Bold"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(t)
    story.append(Spacer(1, 12))

    # Métodos de pago
    story.append(Paragraph("Por método de pago", styles["Heading3"]))
    method_rows = [["Método", "Total"]]
    labels = {"efectivo": "Efectivo", "nequi": "Nequi", "daviplata": "Daviplata", "tarjeta": "Tarjeta"}
    for k, v in data["by_method"].items():
        method_rows.append([labels.get(k, k), _money_pdf(v)])
    mt = Table(method_rows, colWidths=[80 * mm, 40 * mm])
    mt.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#fce4ec")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#f0c0d0")),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(mt)
    story.append(Spacer(1, 12))

    # Top productos
    story.append(Paragraph("Productos más vendidos", styles["Heading3"]))
    top_rows = [["SKU", "Producto", "Unidades", "Total", "Ganancia"]]
    for p in data["top"][:12]:
        top_rows.append([
            p.get("sku", ""), p.get("name", "")[:36],
            str(p.get("qty", 0)), _money_pdf(p.get("total") or p.get("sales")),
            _money_pdf(p.get("profit")),
        ])
    if len(top_rows) == 1:
        top_rows.append(["—", "Sin ventas en el periodo", "0", "$0", "$0"])
    tt = Table(top_rows, colWidths=[28 * mm, 70 * mm, 22 * mm, 30 * mm, 30 * mm])
    tt.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#fce4ec")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#f0c0d0")),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("ALIGN", (2, 1), (-1, -1), "RIGHT"),
    ]))
    story.append(tt)
    story.append(Spacer(1, 12))

    # Categorías
    if data["by_category"]:
        story.append(Paragraph("Ventas por categoría", styles["Heading3"]))
        cat_rows = [["Categoría", "Total"]]
        for c in data["by_category"]:
            cat_rows.append([c["name"], _money_pdf(c["total"])])
        ct = Table(cat_rows, colWidths=[100 * mm, 40 * mm])
        ct.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#fce4ec")),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#f0c0d0")),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        story.append(ct)
        story.append(Spacer(1, 12))

    # Gastos
    if data["expenses_by_kind"]:
        story.append(Paragraph("Salidas de caja (gastos / cadenas / ahorros)", styles["Heading3"]))
        kind_labels = {"cadena": "Cadena diaria", "ahorro": "Ahorro del jefe", "aseo": "Aseo / tinto",
                       "gasto": "Gasto", "otro": "Otro"}
        exp_rows = [["Tipo", "Monto"]]
        for k, v in data["expenses_by_kind"].items():
            exp_rows.append([kind_labels.get(k, k), _money_pdf(v)])
        et = Table(exp_rows, colWidths=[80 * mm, 40 * mm])
        et.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#fce4ec")),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#f0c0d0")),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        story.append(et)

    story.append(Spacer(1, 16))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#cccccc")))
    story.append(Paragraph(
        f"Generado el {datetime.now().strftime('%d/%m/%Y %H:%M')} · Documento interno (sin validez DIAN)",
        styles["Small"]))
    doc.build(story)
    buf.seek(0)
    fname = f"reporte_{data['date_from']}_{data['date_to']}.pdf"
    return StreamingResponse(
        buf, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@router.get("/sales/{sid}/receipt.pdf")
def sale_receipt_pdf(sid: int, db: Session = Depends(get_db), me: User = Depends(current_user)):
    """Comprobante digital interno en PDF (sin DIAN)."""
    s = db.scalars(
        select(Sale).options(joinedload(Sale.items)).where(Sale.id == sid)
    ).unique().first()
    if not s or (me.role != "admin" and s.user_id != me.id):
        raise HTTPException(404, "No existe")
    settings = get_settings(db)
    items = list(s.items) if s.items else []

    buf = io.BytesIO()
    # Ticket angosto
    page = (80 * mm, 200 * mm)
    doc = SimpleDocTemplate(buf, pagesize=page, leftMargin=6 * mm, rightMargin=6 * mm,
                            topMargin=6 * mm, bottomMargin=6 * mm)
    styles = _pdf_styles()
    styles.add(ParagraphStyle(name="Center", parent=styles["Normal"], alignment=1, fontSize=9))
    styles.add(ParagraphStyle(name="CenterB", parent=styles["Normal"], alignment=1, fontSize=11,
                              fontName="Helvetica-Bold", textColor=colors.HexColor("#9b2d5a")))
    styles.add(ParagraphStyle(name="Tiny", parent=styles["Normal"], fontSize=7, alignment=1,
                              textColor=colors.HexColor("#666")))
    story = []
    story.append(Paragraph(settings.get("business_name") or "Distribuidora de Belleza", styles["CenterB"]))
    story.append(Paragraph("Comprobante interno", styles["Tiny"]))
    story.append(Spacer(1, 4))
    story.append(HRFlowable(width="100%", thickness=0.8, color=colors.HexColor("#e8a0bf")))
    story.append(Spacer(1, 4))
    story.append(Paragraph(f"<b>Nº {str(s.number).zfill(5)}</b>", styles["Center"]))
    created = s.created_at.strftime("%d/%m/%Y %H:%M") if s.created_at else ""
    story.append(Paragraph(created, styles["Tiny"]))
    if s.customer_name:
        story.append(Paragraph(f"Cliente: {s.customer_name}", styles["Tiny"]))
    story.append(Spacer(1, 6))

    rows = [["Producto", "Cant", "Total"]]
    for i in items:
        rows.append([i.name[:22], str(i.qty), _money_pdf(i.qty * i.unit_price)])
    rt = Table(rows, colWidths=[42 * mm, 12 * mm, 20 * mm])
    rt.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 7),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("LINEBELOW", (0, 0), (-1, 0), 0.4, colors.HexColor("#e8a0bf")),
    ]))
    story.append(rt)
    story.append(Spacer(1, 6))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#cccccc")))
    story.append(Spacer(1, 3))
    if s.discount:
        story.append(Paragraph(f"Subtotal: {_money_pdf(s.subtotal)}", styles["Tiny"]))
        story.append(Paragraph(f"Descuento: -{_money_pdf(s.discount)}", styles["Tiny"]))
    story.append(Paragraph(f"<b>TOTAL: {_money_pdf(s.total)}</b>", styles["CenterB"]))
    method_labels = {"efectivo": "Efectivo", "nequi": "Nequi", "daviplata": "Daviplata", "tarjeta": "Tarjeta"}
    story.append(Paragraph(f"Pago: {method_labels.get(s.method, s.method)}", styles["Tiny"]))
    if s.method == "efectivo" and s.received:
        story.append(Paragraph(f"Recibido: {_money_pdf(s.received)} · Cambio: {_money_pdf(max(0, s.received - s.total))}", styles["Tiny"]))
    if s.status == "anulada":
        story.append(Paragraph("<b>*** ANULADO ***</b>", styles["Center"]))
    story.append(Spacer(1, 8))
    footer = settings.get("receipt_footer") or "¡Gracias por tu compra!"
    story.append(Paragraph(footer, styles["Tiny"]))
    story.append(Paragraph("Documento interno · Sin validez tributaria DIAN", styles["Tiny"]))
    doc.build(story)
    buf.seek(0)
    return StreamingResponse(
        buf, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="comprobante_{str(s.number).zfill(5)}.pdf"'},
    )


# ───────────── proveedores ─────────────
class SupplierIn(BaseModel):
    name: str
    phone: str = ""
    email: str = ""
    notes: str = ""
    active: bool = True


def supplier_out(s: Supplier):
    return dict(id=s.id, name=s.name, phone=s.phone, email=s.email, notes=s.notes,
                active=s.active, created_at=iso(s.created_at))


@router.get("/suppliers")
def suppliers_list(db: Session = Depends(get_db), _: User = Depends(current_user)):
    rows = db.scalars(select(Supplier).order_by(Supplier.name)).all()
    return [supplier_out(s) for s in rows]


@router.post("/suppliers")
def supplier_create(d: SupplierIn, db: Session = Depends(get_db), me: User = Depends(admin_only)):
    s = Supplier(name=d.name.strip(), phone=d.phone.strip(), email=d.email.strip(),
                 notes=d.notes.strip(), active=d.active)
    db.add(s); db.commit()
    log_audit(db, me, "supplier_create", "supplier", s.id, s.name)
    db.commit()
    return supplier_out(s)


@router.put("/suppliers/{sid}")
def supplier_update(sid: int, d: SupplierIn, db: Session = Depends(get_db), me: User = Depends(admin_only)):
    s = db.get(Supplier, sid)
    if not s:
        raise HTTPException(404, "No existe")
    s.name, s.phone, s.email, s.notes, s.active = d.name.strip(), d.phone.strip(), d.email.strip(), d.notes.strip(), d.active
    log_audit(db, me, "supplier_update", "supplier", s.id, s.name)
    db.commit()
    return supplier_out(s)


# ───────────── movimientos de inventario ─────────────
@router.get("/inventory/movements")
def inv_movements(product_id: int | None = None, kind: str | None = None,
                  date_from: str | None = None, date_to: str | None = None,
                  limit: int = Query(100, ge=1, le=500),
                  db: Session = Depends(get_db), _: User = Depends(admin_only)):
    today = now().date()
    d1 = parse_day(date_from, today - timedelta(days=30))
    d2 = parse_day(date_to, today)
    lo = datetime.combine(d1, datetime.min.time())
    hi = datetime.combine(d2 + timedelta(days=1), datetime.min.time())
    stmt = (select(InventoryMovement)
            .options(joinedload(InventoryMovement.product), joinedload(InventoryMovement.user))
            .where(InventoryMovement.created_at >= lo, InventoryMovement.created_at < hi)
            .order_by(InventoryMovement.id.desc()).limit(limit))
    if product_id:
        stmt = stmt.where(InventoryMovement.product_id == product_id)
    if kind:
        stmt = stmt.where(InventoryMovement.kind == kind)
    rows = db.scalars(stmt).unique().all()
    return [dict(
        id=m.id, product_id=m.product_id, sku=m.product.sku if m.product else "",
        name=m.product.name if m.product else "", qty=m.qty, kind=m.kind,
        ref_type=m.ref_type, ref_id=m.ref_id, note=m.note, stock_after=m.stock_after,
        user=m.user.full_name if m.user else "", created_at=iso(m.created_at),
    ) for m in rows]


# ───────────── auditoría ─────────────
@router.get("/audit")
def audit_list(limit: int = Query(100, ge=1, le=500),
               db: Session = Depends(get_db), _: User = Depends(admin_only)):
    rows = db.scalars(select(AuditLog).order_by(AuditLog.id.desc()).limit(limit)).all()
    return [dict(id=a.id, username=a.username, action=a.action, entity=a.entity,
                 entity_id=a.entity_id, detail=a.detail, created_at=iso(a.created_at)) for a in rows]


# ───────────── export Excel ─────────────
def _xlsx_response(wb, filename: str):
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/export/sales.xlsx")
def export_sales_xlsx(date_from: str | None = None, date_to: str | None = None,
                      db: Session = Depends(get_db), _: User = Depends(admin_only)):
    from openpyxl import Workbook
    data = _build_report(db, date_from, date_to)
    today = now().date()
    d1 = parse_day(date_from, today - timedelta(days=30))
    d2 = parse_day(date_to, today)
    lo = datetime.combine(d1, datetime.min.time())
    hi = datetime.combine(d2 + timedelta(days=1), datetime.min.time())
    sales = db.scalars(
        select(Sale).options(joinedload(Sale.items), joinedload(Sale.user))
        .where(Sale.created_at >= lo, Sale.created_at < hi).order_by(Sale.id)
    ).unique().all()
    wb = Workbook()
    ws = wb.active
    ws.title = "Ventas"
    ws.append(["Nº", "Fecha", "Vendedor", "Método", "Subtotal", "Descuento", "Total", "Estado",
               "Cliente", "Teléfono", "WhatsApp enviado"])
    for s in sales:
        ws.append([
            s.number, iso(s.created_at), s.user.full_name if s.user else "", s.method,
            s.subtotal, s.discount, s.total, s.status, s.customer_name, s.customer_phone,
            iso(s.whatsapp_sent_at) if s.whatsapp_sent_at else "",
        ])
    ws2 = wb.create_sheet("Resumen")
    ws2.append(["Desde", data["date_from"], "Hasta", data["date_to"]])
    ws2.append(["Ventas", data["total"], "Comprobantes", data["n_sales"]])
    ws2.append(["Ganancia", data["profit"], "Margen %", data["margin"]])
    ws2.append(["Gastos", data["expenses"]])
    return _xlsx_response(wb, f"ventas_{data['date_from']}_{data['date_to']}.xlsx")


@router.get("/export/inventory.xlsx")
def export_inventory_xlsx(db: Session = Depends(get_db), _: User = Depends(admin_only)):
    from openpyxl import Workbook
    rows = db.scalars(
        select(Product).options(joinedload(Product.category), joinedload(Product.supplier_rel))
        .order_by(Product.sku)
    ).unique().all()
    wb = Workbook()
    ws = wb.active
    ws.title = "Inventario"
    ws.append(["SKU", "Producto", "Categoría", "Proveedor", "Stock", "Mínimo", "Costo", "Precio", "Estado", "Activo"])
    for p in rows:
        sup = p.supplier_rel.name if p.supplier_rel else p.supplier
        ws.append([p.sku, p.name, p.category.name if p.category else "", sup, p.stock, p.min_stock,
                   p.cost, p.price, "Por surtir" if p.stock <= p.min_stock else "OK", "Sí" if p.active else "No"])
    return _xlsx_response(wb, "inventario.xlsx")


@router.get("/export/order.xlsx")
def export_order_xlsx(db: Session = Depends(get_db), _: User = Depends(admin_only)):
    from openpyxl import Workbook
    rows = db.scalars(
        select(Product).options(joinedload(Product.category), joinedload(Product.supplier_rel))
        .where(Product.active == True).order_by(Product.sku)  # noqa
    ).unique().all()
    wb = Workbook()
    ws = wb.active
    ws.title = "Pedido proveedores"
    ws.append(["SKU", "Producto", "Proveedor", "Stock", "Mínimo", "Pedir sugerido", "Tel. proveedor"])
    for p in rows:
        if p.stock > p.min_stock:
            continue
        suggested = max(p.min_stock * 2 - p.stock, p.min_stock or 1)
        sup = p.supplier_rel.name if p.supplier_rel else p.supplier
        phone = p.supplier_rel.phone if p.supplier_rel else ""
        ws.append([p.sku, p.name, sup, p.stock, p.min_stock, suggested, phone])
    return _xlsx_response(wb, "pedido_proveedores.xlsx")


# ───────────── backup JSON ─────────────
@router.get("/backup.json")
def backup_json(db: Session = Depends(get_db), me: User = Depends(admin_only)):
    products = db.scalars(select(Product).options(joinedload(Product.category))).unique().all()
    cats = db.scalars(select(Category)).all()
    users = db.scalars(select(User)).all()
    suppliers = db.scalars(select(Supplier)).all()
    settings = get_settings(db)
    payload = {
        "exported_at": iso(now()),
        "by": me.username,
        "settings": settings,
        "categories": [dict(id=c.id, code=c.code, name=c.name, emoji=c.emoji) for c in cats],
        "suppliers": [supplier_out(s) for s in suppliers],
        "products": [product_out(p, True) for p in products],
        "users": [dict(id=u.id, username=u.username, full_name=u.full_name, role=u.role, active=u.active) for u in users],
    }
    log_audit(db, me, "backup_export", "system", None, "Export JSON")
    db.commit()
    buf = io.BytesIO(json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8"))
    return StreamingResponse(
        buf, media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="backup_belleza_{now().strftime("%Y%m%d_%H%M")}.json"'},
    )


# ───────────── alerta stock bajo (link WhatsApp jefe) ─────────────
@router.get("/alerts/low-stock-whatsapp")
def low_stock_whatsapp(db: Session = Depends(get_db), me: User = Depends(current_user)):
    settings = get_settings(db)
    phone = (settings.get("boss_phone") or settings.get("business_whatsapp") or "").strip()
    lows = [p for p in db.scalars(select(Product).where(Product.active == True)).all()  # noqa
            if p.stock <= p.min_stock]
    if not lows:
        return dict(phone=phone, message="", url="", count=0)
    lines = [f"*Alerta stock bajo – {settings.get('business_name', 'Local')}*", f"{len(lows)} producto(s):", ""]
    for p in lows[:30]:
        lines.append(f"• {p.sku} {p.name}: {p.stock} (mín {p.min_stock})")
    msg = "\n".join(lines)
    pnorm = "".join(c for c in phone if c.isdigit())
    if len(pnorm) == 10:
        pnorm = "57" + pnorm
    url = f"https://wa.me/{pnorm}?text={__import__('urllib.parse').parse.quote(msg)}" if pnorm else ""
    return dict(phone=phone, message=msg, url=url, count=len(lows))
