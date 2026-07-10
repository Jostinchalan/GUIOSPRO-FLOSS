"""
GUIOSPRO FLOSS — Script de siembra (seed) de factores y subfactores
=====================================================================
Ejecuta este script UNA SOLA VEZ después de configurar tu archivo .env
para cargar en la base de datos los 18 factores y sus subfactores que
el sistema trae por defecto (los mismos que están en
src/app/data/guiosad-data.ts). Si un factor ya existe (por nombre),
el script lo salta, así que se puede ejecutar más de una vez sin
duplicar datos.

Uso:
    cd backend
    python seed_factores.py
"""

from db import SessionLocal, engine, Base
import models
from models import Factor, Subfactor

FACTORES_DEFAULT = [
    {
        "name": "Compatibilidad",
        "scope": "Externo",
        "subfactors": [
            {"name": "Una empresa proporciona una infraestructura de nube lista para usar para este software", "weight": 1},
            {"name": "Los programas informáticos pueden exportar formatos propietarios", "weight": 1},
            {"name": "El software interactúa y se integra con el software propietario existente", "weight": 1},
            {"name": "El software está certificado para operar en su nicho de mercado", "weight": 1},
            {"name": "El software es compatible con los casos de uso y las funcionalidades más comunes", "weight": 1},
            {"name": "El software es compatible con múltiples componentes de hardware", "weight": 1},
            {"name": "El software utiliza formatos estándar", "weight": 1},
            {"name": "El software es compatible con varios sistemas operativos diferentes (el software es multiplataforma)", "weight": 1},
        ],
    },
    {
        "name": "Personalización",
        "scope": "Externo",
        "subfactors": [
            {"name": "El acceso al código fuente es un incentivo para la organización", "weight": 1},
            {"name": "El software se puede ampliar fácilmente para satisfacer las necesidades de la organización modificando el código fuente", "weight": 1},
            {"name": "Las innovaciones se introducen en el software a un ritmo rápido", "weight": 1},
            {"name": "El software es fácil de personalizar sin necesidad de modificar el código fuente", "weight": 1},
            {"name": "El software soporta nuevas funciones a través de módulos (el software es modular)", "weight": 1},
            {"name": "Hay un repositorio público de extensiones para este software", "weight": 1},
        ],
    },
    {
        "name": "Prueba",
        "scope": "Externo",
        "subfactors": [
            {"name": "El software es fácil de desplegar y de probar", "weight": 1},
        ],
    },
    {
        "name": "Fiabilidad",
        "scope": "Externo",
        "subfactors": [
            {"name": "El software es fiable y estable", "weight": 1},
            {"name": "El software tiene un buen historial en cuanto a errores de seguridad (el software es seguro)", "weight": 1},
            {"name": "El software es más flexible que la solución propietaria", "weight": 1},
            {"name": "El software es más confiable que la solución propietaria", "weight": 1},
            {"name": "El programa proporciona una amplia variedad de funciones de control de acceso", "weight": 1},
        ],
    },
    {
        "name": "Reusabilidad",
        "scope": "Externo",
        "subfactors": [
            {"name": "La licencia permite extensiones propietarias", "weight": 1},
            {"name": "El software se ofrece como una biblioteca / marco de trabajo", "weight": 1},
        ],
    },
    {
        "name": "Usabilidad",
        "scope": "Externo",
        "subfactors": [
            {"name": "El software proporciona una interfaz gráfica de usuario (GUI)", "weight": 1},
            {"name": "El software es más fácil de usar que la alternativa propietaria", "weight": 1},
            {"name": "El software es fácil de aprender", "weight": 1},
            {"name": "El usuario está descontento con el software propietario", "weight": 1},
        ],
    },
    {
        "name": "Mantenibilidad",
        "scope": "Externo",
        "subfactors": [
            {"name": "El software es mantenido activamente por los desarrolladores", "weight": 1},
        ],
    },
    {
        "name": "Portabilidad",
        "scope": "Externo",
        "subfactors": [
            {"name": "Una versión de aplicación móvil de este software está disponible", "weight": 1},
            {"name": "El software es una sistemas de administración de base de datos independiente", "weight": 1},
        ],
    },
    {
        "name": "Documentación",
        "scope": "Externo",
        "subfactors": [
            {"name": "El software está bien documentado", "weight": 1},
            {"name": "La documentación de desarrollo cubre todas las características", "weight": 1},
            {"name": "La documentación está disponible en múltiples formatos", "weight": 1},
            {"name": "La documentación es fácil de entender", "weight": 1},
            {"name": "La documentación está actualizada", "weight": 1},
            {"name": "La documentación está escrita por escritores especializados (no desarrolladores)", "weight": 1},
            {"name": "La documentación del software es de alta calidad", "weight": 1},
            {"name": "El software viene con documentación de desarrollo", "weight": 1},
            {"name": "El software viene con documentación de usuario", "weight": 1},
            {"name": "La documentación del usuario cubre todas las características", "weight": 1},
            {"name": "Los formatos de datos están bien documentados", "weight": 1},
        ],
    },
    {
        "name": "Formación",
        "scope": "Interno",
        "subfactors": [
            {"name": "La adopción de este software permite a los usuarios mejorar las habilidades técnicas de TI", "weight": 1},
            {"name": "El personal de la organización puede aprender fácilmente por sí mismo a utilizar este software", "weight": 1},
            {"name": "El personal de la organización está capacitado para resolver problemas tecnológicos", "weight": 1},
            {"name": "Los planes de entrenamiento de este software están disponibles", "weight": 1},
        ],
    },
    {
        "name": "Tiempo de adopción",
        "scope": "Interno",
        "subfactors": [
            {"name": "Los requisitos de instalación y despliegue del software son fáciles de cumplir", "weight": 1},
            {"name": "El tiempo requerido para adoptar este software es bajo", "weight": 1},
        ],
    },
    {
        "name": "Casos de estudio de adopción FLOSS",
        "scope": "Externo",
        "subfactors": [
            {"name": "Hay informes públicos disponibles en Internet que describen el éxito de la adopción de este software", "weight": 1},
        ],
    },
    {
        "name": "Centralidad de la tecnología de la información",
        "scope": "Interno",
        "subfactors": [
            {"name": "La adopción de este software mejora el entorno de trabajo de los usuarios", "weight": 1},
            {"name": "Centralizar la infraestructura de TI ayuda a acelerar la adopción de este software", "weight": 1},
        ],
    },
    {
        "name": "Apoyo de la alta dirección",
        "scope": "Interno",
        "subfactors": [
            {"name": "La alta dirección apoya la adopción exitosa de este software", "weight": 1},
        ],
    },
    {
        "name": "Bloqueo de proveedores",
        "scope": "Externo",
        "subfactors": [
            {"name": "El software reduce las dependencias de los proveedores en su entorno", "weight": 1},
        ],
    },
    {
        "name": "Soporte",
        "scope": "Ambos",
        "subfactors": [
            {"name": "El soporte de la comunidad para este software está disponible", "weight": 1},
            {"name": "Soporte de expertos y consultores externos para consultas específicas está disponible", "weight": 1},
            {"name": "El soporte comercial de este software está disponible 24/7/365", "weight": 1},
            {"name": "Hay desarrolladores en su organización que saben cómo desarrollar este software", "weight": 1},
            {"name": "Soporte comercial para la personalización de software está disponible", "weight": 1},
            {"name": "Es fácil contratar personal informático en la comunidad que conozca este software", "weight": 1},
        ],
    },
    {
        "name": "Actitud hacia el cambio",
        "scope": "Interno",
        "subfactors": [
            {"name": "El personal de la organización muestra poca resistencia al cambio tecnológico", "weight": 1},
            {"name": "El personal técnico encargado del despliegue y soporte en la organización respalda la adopción de este software", "weight": 1},
        ],
    },
    {
        "name": "Coste total de propiedad",
        "scope": "Interno",
        "subfactors": [
            {"name": "Es poco probable que haya costos ocultos al adoptar este software", "weight": 1},
            {"name": "La adopción de este software es menos costosa que la alternativa patentada", "weight": 1},
        ],
    },
]


def seed():
    # Crea las tablas si no existieran (no afecta a las existentes)
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    creados, existentes = 0, 0
    sub_creados = 0
    try:
        for f in FACTORES_DEFAULT:
            existing = db.query(Factor).filter(Factor.nombre_factor == f["name"]).first()
            if existing:
                existentes += 1
                factor_id = existing.id_factor
            else:
                factor = Factor(
                    nombre_factor=f["name"],
                    alcance_default=f["scope"],
                    es_personalizado=False,
                )
                db.add(factor)
                db.flush()  # obtiene el id_factor generado
                factor_id = factor.id_factor
                creados += 1
            
            # Check if subfactors exist for this factor
            sub_count = db.query(Subfactor).filter(Subfactor.id_factor == factor_id).count()
            if sub_count == 0:
                for orden, sub in enumerate(f["subfactors"], start=1):
                    db.add(Subfactor(id_factor=factor_id, descripcion=sub["name"], orden=orden))
                    sub_creados += 1
        db.commit()
        print(f"[OK] Factores creados: {creados} (Existian: {existentes}) | Subfactores creados: {sub_creados}")
    except Exception as e:
        db.rollback()
        print(f"[ERROR] Error al sembrar factores: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
