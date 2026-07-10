"""
GUIOSPRO FLOSS — Modelos ORM (SQLAlchemy)
==========================================
Estos modelos reflejan EXACTAMENTE las 8 tablas que ya existen en tu
base de datos "GUIOSPRO_FLOSS" (esquema public) vista en pgAdmin4:

    software_evaluado
    evaluacion
    factor
    subfactor
    detalle_evaluacion_factor
    detalle_evaluacion_subfactor
    resultado_evaluacion
    pdf_generado

⚠️ IMPORTANTE — Cambios necesarios en tu base de datos:
La tabla `evaluacion` que se ve en tu diagrama de pgAdmin NO tiene
columnas para guardar el nombre del evaluador ni la empresa (datos que
el formulario de bienvenida del frontend sí pide). Se agregaron aquí
dos columnas nuevas:

    nombre_evaluador VARCHAR(150)
    empresa          VARCHAR(150)

Ejecuta el script `schema.sql` (incluido en esta carpeta) una sola vez
en pgAdmin4 (Query Tool) para crear estas columnas si no existen, y de
paso confirmar que el resto de las tablas están completas. El script
usa `IF NOT EXISTS`, así que es seguro ejecutarlo aunque las tablas ya
existan — no borra ni duplica nada.
"""

from sqlalchemy import (
    Column, Integer, String, Text, Boolean, TIMESTAMP, Numeric, ForeignKey
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from db import Base


class SoftwareEvaluado(Base):
    __tablename__ = "software_evaluado"

    id_software = Column(Integer, primary_key=True, index=True)
    nombre_software = Column(String(150), nullable=False)
    descripcion_software = Column(Text)
    fecha_creacion = Column(TIMESTAMP(timezone=False), server_default=func.now())

    evaluaciones = relationship("Evaluacion", back_populates="software")


class Factor(Base):
    __tablename__ = "factor"

    id_factor = Column(Integer, primary_key=True, index=True)
    nombre_factor = Column(String(100), nullable=False, unique=True)
    alcance_default = Column(String(10))       # "Interno" | "Externo" | "Ambos"
    es_personalizado = Column(Boolean, default=False)

    subfactores = relationship("Subfactor", back_populates="factor")


class Subfactor(Base):
    __tablename__ = "subfactor"

    id_subfactor = Column(Integer, primary_key=True, index=True)
    id_factor = Column(Integer, ForeignKey("factor.id_factor"))
    descripcion = Column(Text)
    orden = Column(Integer)

    factor = relationship("Factor", back_populates="subfactores")


class Evaluacion(Base):
    __tablename__ = "evaluacion"

    id_evaluacion = Column(Integer, primary_key=True, index=True)
    id_software = Column(Integer, ForeignKey("software_evaluado.id_software"))
    fecha_evaluacion = Column(TIMESTAMP(timezone=False), server_default=func.now())
    estado = Column(String(20), default="Completada")
    recomendacion_final = Column(String(1))    # "A" | "B" | "C"

    # ── Columnas nuevas (ver nota arriba / schema.sql) ──
    nombre_evaluador = Column(String(150))
    empresa = Column(String(150))

    software = relationship("SoftwareEvaluado", back_populates="evaluaciones")
    detalles_factor = relationship("DetalleEvaluacionFactor", back_populates="evaluacion", cascade="all, delete-orphan")
    detalles_subfactor = relationship("DetalleEvaluacionSubfactor", back_populates="evaluacion", cascade="all, delete-orphan")
    resultados = relationship("ResultadoEvaluacion", back_populates="evaluacion", cascade="all, delete-orphan")
    pdfs = relationship("PdfGenerado", back_populates="evaluacion", cascade="all, delete-orphan")


class DetalleEvaluacionFactor(Base):
    __tablename__ = "detalle_evaluacion_factor"

    id_detalle_factor = Column(Integer, primary_key=True, index=True)
    id_evaluacion = Column(Integer, ForeignKey("evaluacion.id_evaluacion"))
    id_factor = Column(Integer, ForeignKey("factor.id_factor"))
    importancia_usuario = Column(Integer)      # 1-4 (decisorImportance)
    alcance_usuario = Column(String(10))       # "Interno" | "Externo"

    evaluacion = relationship("Evaluacion", back_populates="detalles_factor")
    factor = relationship("Factor")


class DetalleEvaluacionSubfactor(Base):
    __tablename__ = "detalle_evaluacion_subfactor"

    id_detalle_subfactor = Column(Integer, primary_key=True, index=True)
    id_evaluacion = Column(Integer, ForeignKey("evaluacion.id_evaluacion"))
    id_subfactor = Column(Integer, ForeignKey("subfactor.id_subfactor"))
    puntuacion = Column(Integer)                # peso 1-5 asignado por el usuario

    evaluacion = relationship("Evaluacion", back_populates="detalles_subfactor")
    subfactor = relationship("Subfactor")


class ResultadoEvaluacion(Base):
    __tablename__ = "resultado_evaluacion"

    id_resultado = Column(Integer, primary_key=True, index=True)
    id_evaluacion = Column(Integer, ForeignKey("evaluacion.id_evaluacion"))
    id_factor = Column(Integer, ForeignKey("factor.id_factor"))
    ponderacion_media = Column(Numeric(3, 2))
    clasificacion_foda = Column(String(12))     # Fortaleza/Debilidad/Oportunidad/Amenaza

    evaluacion = relationship("Evaluacion", back_populates="resultados")
    factor = relationship("Factor")


class PdfGenerado(Base):
    __tablename__ = "pdf_generado"

    id_pdf = Column(Integer, primary_key=True, index=True)
    id_evaluacion = Column(Integer, ForeignKey("evaluacion.id_evaluacion"))
    nombre_archivo = Column(String(255))
    ruta_almacenamiento = Column(String(500))
    fecha_generacion = Column(TIMESTAMP(timezone=False), server_default=func.now())
    tamano_bytes = Column(Integer)

    evaluacion = relationship("Evaluacion", back_populates="pdfs")
