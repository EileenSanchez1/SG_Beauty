# Belleza POS — Frontend (React) + Backend (FastAPI)

Proyecto dividido según la propuesta técnica v3.0.

## Estructura

```
belleza-pos-split/
├── backend/          # FastAPI + SQLAlchemy + PostgreSQL/SQLite
│   ├── app/
│   │   ├── api.py
│   │   ├── models.py
│   │   ├── db.py
│   │   ├── security.py
│   │   └── seed.py
│   ├── main.py
│   ├── requirements.txt
│   └── clean_demo.py
└── frontend/         # React + Vite
    ├── src/
    │   ├── components/
    │   ├── views/
    │   ├── context/
    │   ├── utils/
    │   └── app.css   # Estilos originales (rosa)
    ├── package.json
    └── vite.config.js
```

## Cómo correr

### 1. Backend
```bash
cd backend
pip install -r requirements.txt
# Opcional: export DATABASE_URL=postgresql://...
# Opcional: export SECRET_KEY=tu-clave-secreta
uvicorn main:app --reload --port 8000
```

### 2. Frontend (desarrollo)
```bash
cd frontend
npm install
npm run dev
```
Abre http://localhost:5173 (proxy automático a la API en :8000).

### 3. Producción (servir React desde FastAPI)
```bash
cd frontend && npm run build
cd ../backend && uvicorn main:app --host 0.0.0.0 --port 8000
```
La UI queda en http://localhost:8000

## Credenciales demo
- **admin** / **admin123** (Administradora)
- **vendedor** / **vendedor123** (Vendedora)

## Módulos implementados
1. Productos y códigos por categoría (SKU automático)
2. Inventario + alertas + lista de pedido
3. POS multiproducto + escáner + catálogo visual
4. Caja chica (base, cadenas, ahorros, gastos)
5. Comprobantes digitales
6. Cierre de caja (arqueo) y reportes
7. Usuarios y roles

Diseño original en tonos rosa conservado en React.
