"""
GUIOSPRO FLOSS — Conexión a base de datos (PostgreSQL / Neon)
==================================================================
Soporta tanto DATABASE_URL completa (Neon / Vercel) como variables
individuales (desarrollo local). Prioriza DATABASE_URL si está definida.
"""

import os
import re
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

try:
    from dotenv import load_dotenv
    load_dotenv(override=True)
except ImportError:
    pass

# ── Construir DATABASE_URL ─────────────────────────────────────────────────
# Prioridad 1: variable DATABASE_URL completa (Neon / Vercel env vars)
# Prioridad 2: variables individuales DB_HOST, DB_PORT, etc. (desarrollo local)

DATABASE_URL = os.getenv("DATABASE_URL", "")

if not DATABASE_URL:
    DB_HOST     = os.getenv("DB_HOST",     "localhost")
    DB_PORT     = os.getenv("DB_PORT",     "5432")
    DB_NAME     = os.getenv("DB_NAME",     "neondb")
    DB_USER     = os.getenv("DB_USER",     "neondb_owner")
    DB_PASSWORD = os.getenv("DB_PASSWORD", "postgres")
    DATABASE_URL = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}?sslmode=require"

# Limpiar parámetros no soportados por psycopg2 (ej. channel_binding de Neon)
DATABASE_URL = re.sub(r"[&?]channel_binding=[^&]*", "", DATABASE_URL)

# Asegurar que SQLAlchemy use el driver psycopg2
if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg2://", 1)
elif DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+psycopg2://", 1)

# ── Engine ─────────────────────────────────────────────────────────────────
# pool_pre_ping: reconecta si la conexión quedó inactiva (serverless/Neon)
# pool_size / max_overflow: importante para entornos serverless
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
    connect_args={"connect_timeout": 10},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """Dependency de FastAPI: entrega una sesión y la cierra al terminar."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
