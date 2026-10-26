import os, uuid
from datetime import date, datetime, timedelta
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy import select, func
from sqlalchemy.orm import Session, joinedload

from .db import get_db
from .models import *
from .security import current_user, admin_only, hash_password, verify_password, make_token

router = APIRouter(prefix="/api")
METHODS = ["efectivo", "nequi", "daviplata", "tarjeta"]
MOVE_KINDS = ["cadena", "ahorro", "aseo", "gasto", "otro"]
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static", "uploads")

DEFAULT_SETTINGS = {
    "business_name": "Distribuidora de Belleza",
    "boss_phone": "",
    "tax_rate": "0",
    "receipt_footer": "¡Gracias por tu compra! 💖",
}


# ───────────── helpers ─────────────
def iso(d):
    return d.isoformat(timespec="seconds") if d else None


def get_settings(db):
    s = dict(DEFAULT_SETTINGS)
    for r in db.scalars(select(Setting)):
        s[r.key] = r.value
    return s


def product_out(p: Product, admin: bool):
    d = dict(
        id=p.id, sku=p.sku, barcode=p.barcode, name=p.name, category_id=p.category_id,
        category=p.category.name if p.category else "", category_code=p.category.code if p.category else None,
        emoji=p.category.emoji if p.category else "🛍️", origin=p.origin, supplier=p.supplier,
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
    return dict(
        id=s.id, number=s.number, method=s.method, subtotal=s.subtotal, discount=s.discount,
        discount_reason=s.discount_reason, tax=s.tax, total=s.total, received=s.received,
        change=max(0, s.received - s.total) if s.method == "efectivo" and s.received else 0,
        customer_name=s.customer_name, customer_phone=s.customer_phone, status=s.status,
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
    cost: int = Field(0, ge=0)
    price: int = Field(0, ge=0)
    stock: int = Field(0, ge=0)
    min_stock: int = Field(0, ge=0)
    image: str | None = None
    active: bool = True


@router.get("/products")
def products(q: str = "", category_id: int | None = None, low: bool = False, all: bool = False,
             db: Session = Depends(get_db), u: User = Depends(current_user)):
    stmt = select(Product).options(joinedload(Product.category)).order_by(Product.sku)
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
                cost=d.cost, price=d.price, stock=d.stock, min_stock=d.min_stock, image=d.image, active=d.active)
    db.add(p); db.flush()
    if d.stock > 0:
        db.add(StockEntry(product_id=p.id, qty=d.stock, unit_cost=d.cost, supplier=d.supplier, note="Stock inicial", user_id=me.id))
    db.commit()
    return product_out(db.get(Product, p.id), True)


@router.put("/products/{pid}")
def product_update(pid: int, d: ProductIn, db: Session = Depends(get_db), _: User = Depends(admin_only)):
    p = db.get(Product, pid)
    if not p:
        raise HTTPException(404, "No existe")
    barcode = (d.barcode or "").strip() or None
    if barcode:
        other = db.scalar(select(Product).where(Product.barcode == barcode, Product.id != pid))
        if other:
            raise HTTPException(400, "Ese código de barras ya está en otro producto")
    p.name, p.barcode, p.supplier = d.name.strip(), barcode, d.supplier.strip()
    p.origin = "fabrica" if d.origin == "fabrica" else "propio"
    p.cost, p.price, p.min_stock, p.active = d.cost, d.price, d.min_stock, d.active
    if d.image is not None:
        p.image = d.image or None
    # El stock se cambia con "Entrada de mercancía" o "Ajuste", para dejar historial
    db.commit()
    return product_out(db.get(Product, pid), True)


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
    p.stock += d.qty
    if d.unit_cost is not None:
        p.cost = d.unit_cost
    if d.supplier:
        p.supplier = d.supplier
    db.add(StockEntry(product_id=p.id, qty=d.qty, unit_cost=p.cost, supplier=p.supplier, note=d.note, user_id=me.id))
    db.commit()
    return product_out(p, True)


@router.post("/inventory/adjust")
def inv_adjust(d: AdjustIn, db: Session = Depends(get_db), me: User = Depends(admin_only)):
    p = db.get(Product, d.product_id)
    if not p:
        raise HTTPException(404, "Producto no existe")
    diff = d.new_stock - p.stock
    p.stock = d.new_stock
    db.add(StockEntry(product_id=p.id, qty=diff, unit_cost=p.cost, supplier=p.supplier, note=d.note or "Ajuste", user_id=me.id))
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
def cash_open(d: OpenIn, db: Session = Depends(get_db), me: User = Depends(admin_only)):
    if open_session(db):
        raise HTTPException(400, "Ya hay una caja abierta")
    cs = CashSession(base=d.base, opened_by=me.id)
    db.add(cs); db.commit()
    return session_summary(db, cs)


@router.post("/cash/movements")
def cash_move(d: MoveIn, db: Session = Depends(get_db), me: User = Depends(admin_only)):
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
def cash_close(d: CloseIn, db: Session = Depends(get_db), _: User = Depends(admin_only)):
    cs = open_session(db)
    if not cs:
        raise HTTPException(400, "No hay caja abierta")
    sm = session_summary(db, cs)
    cs.counted_cash, cs.expected_cash = d.counted_cash, sm["efectivo_esperado"]
    cs.notes, cs.closed_at, cs.status = d.notes.strip(), now(), "cerrada"
    db.commit()
    return session_summary(db, cs)


@router.get("/cash/sessions")
def cash_sessions(limit: int = 30, db: Session = Depends(get_db), _: User = Depends(admin_only)):
    rows = db.scalars(select(CashSession).order_by(CashSession.id.desc()).limit(limit)).all()
    out = []
    for cs in rows:
        s = session_summary(db, cs)
        s.pop("movements")
        out.append(s)
    return out


@router.get("/cash/sessions/{sid}")
def cash_session(sid: int, db: Session = Depends(get_db), _: User = Depends(admin_only)):
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
    received: int = Field(0, ge=0)
    customer_name: str = ""
    customer_phone: str = ""


@router.post("/sales")
def sale_create(d: SaleIn, db: Session = Depends(get_db), me: User = Depends(current_user)):
    if d.method not in METHODS:
        raise HTTPException(400, "Método de pago inválido")
    cs = open_session(db)
    if not cs:
        raise HTTPException(400, "La caja está cerrada. Pídele al administrador que la abra.")
    merged: dict[int, int] = {}
    for it in d.items:
        merged[it.product_id] = merged.get(it.product_id, 0) + it.qty
    sale_items, subtotal = [], 0
    for pid, qty in merged.items():
        p = db.get(Product, pid)
        if not p or not p.active:
            raise HTTPException(400, "Un producto ya no está disponible")
        if qty > p.stock:
            raise HTTPException(400, f"Solo quedan {p.stock} de «{p.name}»")
        p.stock -= qty
        subtotal += qty * p.price
        sale_items.append(SaleItem(product_id=p.id, sku=p.sku, name=p.name, qty=qty, unit_price=p.price, unit_cost=p.cost))
    if d.discount > subtotal:
        raise HTTPException(400, "El descuento no puede ser mayor que la venta")
    if d.discount > 0 and not d.discount_reason.strip():
        raise HTTPException(400, "Escribe el motivo del descuento")
    rate = float(get_settings(db)["tax_rate"] or 0)
    tax = round((subtotal - d.discount) * rate / 100)
    total = subtotal - d.discount + tax
    if d.method == "efectivo" and d.received and d.received < total:
        raise HTTPException(400, "El dinero recibido es menor al total")
    last = db.scalar(select(func.max(Sale.number))) or 0
    sale = Sale(number=last + 1, session_id=cs.id, user_id=me.id, method=d.method, subtotal=subtotal,
                discount=d.discount, discount_reason=d.discount_reason.strip(), tax=tax, total=total,
                received=d.received if d.method == "efectivo" else total,
                customer_name=d.customer_name.strip(), customer_phone=d.customer_phone.strip(), items=sale_items)
    db.add(sale); db.commit()
    return sale_out(sale, me.role == "admin")


@router.get("/sales")
def sales_list(date_from: str | None = None, date_to: str | None = None, db: Session = Depends(get_db), me: User = Depends(current_user)):
    today = now().date()
    if me.role != "admin":  # vendedor: solo sus ventas de hoy
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
    return [sale_out(s, me.role == "admin") for s in db.scalars(stmt).unique()]


@router.get("/sales/{sid}")
def sale_get(sid: int, db: Session = Depends(get_db), me: User = Depends(current_user)):
    s = db.get(Sale, sid)
    if not s or (me.role != "admin" and s.user_id != me.id):
        raise HTTPException(404, "No existe")
    return sale_out(s, me.role == "admin")


@router.post("/sales/{sid}/void")
def sale_void(sid: int, db: Session = Depends(get_db), _: User = Depends(admin_only)):
    s = db.get(Sale, sid)
    if not s:
        raise HTTPException(404, "No existe")
    if s.status == "anulada":
        raise HTTPException(400, "Ya está anulada")
    cs = db.get(CashSession, s.session_id)
    if cs.status != "abierta":
        raise HTTPException(400, "Esa venta es de una caja ya cerrada")
    for i in s.items:
        if i.product_id:
            p = db.get(Product, i.product_id)
            if p:
                p.stock += i.qty
    s.status = "anulada"
    db.commit()
    return sale_out(s, True)


# ───────────── reportes ─────────────
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
    return dict(today_total=sum(s.total for s in today_sales), today_count=len(today_sales),
                week=[dict(day=k, total=v) for k, v in days.items()], low_count=len(low), low=low[:8],
                cash=session_summary(db, cs) if cs else None)


@router.get("/reports/summary")
def report_summary(date_from: str | None = None, date_to: str | None = None,
                   db: Session = Depends(get_db), _: User = Depends(admin_only)):
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
            t = top.setdefault(i.sku, dict(sku=i.sku, name=i.name, qty=0, sales=0, profit=0))
            t["qty"] += i.qty; t["sales"] += line; t["profit"] += i.qty * (i.unit_price - i.unit_cost)
            cname = i.product.category.name if i.product and i.product.category else "Otros"
            by_cat[cname] = by_cat.get(cname, 0) + line
    profit = revenue - discounts - cost
    net_rev = revenue - discounts
    moves = db.scalars(select(CashMovement).where(CashMovement.created_at >= lo, CashMovement.created_at < hi)).all()
    exp: dict[str, int] = {}
    for m in moves:
        exp[m.kind] = exp.get(m.kind, 0) + m.amount
    total = sum(s.total for s in sales)
    return dict(
        date_from=d1.isoformat(), date_to=d2.isoformat(), n_sales=len(sales), total=total, discounts=discounts,
        profit=profit, margin=round(profit * 100 / net_rev, 1) if net_rev else 0,
        avg_ticket=round(total / len(sales)) if sales else 0,
        expenses=sum(exp.values()), expenses_by_kind=exp,
        days=[dict(day=k, total=v) for k, v in days.items()], by_method=by_method,
        top=sorted(top.values(), key=lambda x: -x["qty"])[:10],
        by_category=sorted([dict(name=k, total=v) for k, v in by_cat.items()], key=lambda x: -x["total"]),
    )
