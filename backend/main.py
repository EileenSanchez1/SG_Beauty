import os
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from app.db import Base, engine, SessionLocal
from app.api import router
from app import models, seed
from app.migrate import run_migrations

BASE = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIST = os.path.join(os.path.dirname(BASE), "frontend", "dist")

app = FastAPI(title="Sistema de Gestión – Distribuidora de Belleza")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    Base.metadata.create_all(engine)
    try:
        run_migrations()
    except Exception as e:
        print("migrate warning:", e)
    with SessionLocal() as db:
        seed.run(db)


app.include_router(router)

# Static uploads (images)
uploads_dir = os.path.join(BASE, "static", "uploads")
os.makedirs(uploads_dir, exist_ok=True)
app.mount("/static/uploads", StaticFiles(directory=uploads_dir), name="uploads")

# Serve React production build if available
if os.path.isdir(FRONTEND_DIST):
    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIST, "assets")), name="assets")

    @app.get("/{full_path:path}")
    def spa(full_path: str):
        # API already handled by router
        index = os.path.join(FRONTEND_DIST, "index.html")
        if os.path.isfile(index):
            return FileResponse(index)
        return {"detail": "Frontend no construido. Ejecuta npm run build en /frontend"}
else:
    @app.get("/")
    def root():
        return {
            "message": "Belleza POS API",
            "docs": "/docs",
            "note": "Construye el frontend (cd frontend && npm i && npm run build) para servir la UI"
        }
