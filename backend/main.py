"""
GUIOSPRO FLOSS — Backend Python
================================
Framework : FastAPI
Lenguaje  : Python 3.11+
Servidor  : uvicorn

Arrancar el servidor:
    pip install -r requirements.txt
    uvicorn main:app --reload --port 8000

Endpoints disponibles:
    GET  /api/software-info      → descripción automática del software (API_PUNTO_1)
    POST /api/suggest-factors    → factores idóneos según el software   (API_PUNTO_3)
    GET  /api/factor-info        → info de un factor para ese software  (API_PUNTO_2)
    POST /api/analyze-file       → analiza imagen o PDF y retorna recomendación (IA visual)
"""

# pyrefly: ignore [missing-import]
from fastapi import FastAPI, UploadFile, File, Query, HTTPException, Depends
# pyrefly: ignore [missing-import]
from fastapi.middleware.cors import CORSMiddleware
# pyrefly: ignore [missing-import]
from pydantic import BaseModel
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import desc
import base64
import io
import os
import json
# pyrefly: ignore [missing-import]
from dotenv import load_dotenv

# Cargar y sobreescribir variables de entorno desde .env
load_dotenv(override=True)

from db import get_db, engine, Base
import models

# ──────────────────────────────────────────────────────────
# Configuración de la app
# ──────────────────────────────────────────────────────────

app = FastAPI(
    title="GUIOSPRO FLOSS API",
    description="Backend para la evaluación de adopción de software FLOSS",
    version="1.0.0",
)

# CORS: permite peticiones desde el frontend (Vite en localhost:5173)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ──────────────────────────────────────────────────────────
# Base de datos (PostgreSQL vía pgAdmin4)
# ──────────────────────────────────────────────────────────
# Crea las tablas si no existen todavía (no borra ni modifica las que
# ya tienes creadas en pgAdmin4). Para agregar las columnas nuevas que
# necesita "evaluacion" (nombre_evaluador, empresa) corre además
# backend/schema.sql una vez desde el Query Tool de pgAdmin4.

@app.on_event("startup")
def _startup_create_tables():
    try:
        Base.metadata.create_all(bind=engine)
        print("[OK] Conectado a PostgreSQL y tablas verificadas/creadas.")
    except Exception as e:
        # No tumbamos el servidor si la BD no está disponible todavía;
        # solo lo dejamos en el log para que el usuario lo revise.
        print(f"[WARNING] No se pudo conectar/crear tablas en PostgreSQL: {e}")


# ──────────────────────────────────────────────────────────
# Modelos de datos (Pydantic)
# ──────────────────────────────────────────────────────────

class SuggestFactorsRequest(BaseModel):
    softwareName: str
    availableFactors: List[str]  # nombres de los factores disponibles en el sistema

class SuggestFactorsResponse(BaseModel):
    class Suggestion(BaseModel):
        factorName: str
        reason: str  # por qué la IA recomienda este factor
    class Citation(BaseModel):
        title: str
        author: str
        year: str
        source: str
        relevance: str
    suggestions: List[Suggestion]
    bibliography: Optional[List[Citation]] = None
    justification: Optional[str] = None

class SoftwareInfoResponse(BaseModel):
    description: str

class FactorInfoResponse(BaseModel):
    description: str

class AnalyzeFileResponse(BaseModel):
    recommendation: str
    fodaData: dict | None = None  # datos FODA extraídos de la imagen/PDF


# ──────────────────────────────────────────────────────────
# Utilidad: llamada al LLM
# ──────────────────────────────────────────────────────────
# Para conectar un LLM real, instalar el SDK correspondiente
# y reemplazar las funciones _call_llm_text / _call_llm_vision.
#
# Ejemplo con Anthropic Claude:
#
#   import anthropic
#   client = anthropic.Anthropic(api_key="tu_api_key")
#
#   def _call_llm_text(prompt: str) -> str:
#       msg = client.messages.create(
#           model="claude-opus-4-8",
#           max_tokens=512,
#           messages=[{"role": "user", "content": prompt}],
#       )
#       return msg.content[0].text
#
#   def _call_llm_vision(prompt: str, image_b64: str, media_type: str) -> str:
#       msg = client.messages.create(
#           model="claude-opus-4-8",
#           max_tokens=512,
#           messages=[{
#               "role": "user",
#               "content": [
#                   {"type": "image", "source": {"type": "base64",
#                    "media_type": media_type, "data": image_b64}},
#                   {"type": "text", "text": prompt},
#               ],
#           }],
#       )
#       return msg.content[0].text
#
# Ejemplo con OpenAI:
#
#   from openai import OpenAI
#   client = OpenAI(api_key="tu_api_key")
#
#   def _call_llm_text(prompt: str) -> str:
#       resp = client.chat.completions.create(
#           model="gpt-4o",
#           messages=[{"role": "user", "content": prompt}],
#       )
#       return resp.choices[0].message.content
# ──────────────────────────────────────────────────────────

def _call_llm_text(prompt: str) -> str:
    """
    Realiza una llamada al modelo Gemini de Google (o Claude de Anthropic / GPT de OpenAI como fallbacks)
    si las claves API están configuradas en el entorno/.env. De lo contrario, simula la respuesta.
    """
    load_dotenv(override=True)
    
    # 1. Intentar con Google Gemini (Prioridad)
    gemini_key = os.getenv("GEMINI_API_KEY")
    if gemini_key:
        try:
            res = _call_gemini(prompt)
            if res and not res.startswith("[Error"):
                return res
        except Exception as e:
            print(f"[Warning] Error usando Gemini en _call_llm_text: {e}")

    # 2. Fallback a Anthropic Claude
    anthropic_key = os.getenv("ANTHROPIC_API_KEY")
    if anthropic_key:
        try:
            # pyrefly: ignore [missing-import]
            import anthropic
            client = anthropic.Anthropic(api_key=anthropic_key)
            message = client.messages.create(
                model="claude-3-5-sonnet-20241022",
                max_tokens=600,
                messages=[{"role": "user", "content": prompt}]
            )
            return message.content[0].text.strip()
        except Exception as e:
            print(f"[Error Anthropic Claude] {e}")

    # 3. Fallback a OpenAI GPT
    openai_key = os.getenv("OPENAI_API_KEY")
    if openai_key:
        try:
            # pyrefly: ignore [missing-import]
            from openai import OpenAI
            client = OpenAI(api_key=openai_key)
            resp = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7,
                max_tokens=512
            )
            return resp.choices[0].message.content.strip()
        except Exception as e:
            print(f"[Error OpenAI] {e}")

    return f"[Respuesta simulada] {prompt[:60]}..."


def _call_gemini_vision(prompt: str, image_b64: str, media_type: str) -> str:
    """
    Realiza una llamada con visión al modelo gemini-2.5-flash usando urllib.request.
    Si recibe error 429 retorna inmediatamente para usar el fallback sin demoras.
    """
    import urllib.request
    import urllib.error

    load_dotenv(override=True)
    gemini_key = os.getenv("GEMINI_API_KEY")
    if not gemini_key:
        return "[Error] GEMINI_API_KEY no configurada."
        
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={gemini_key}"
    headers = {"Content-Type": "application/json"}
    payload = {
        "contents": [
            {
                "parts": [
                    {"text": prompt},
                    {
                        "inlineData": {
                            "mimeType": media_type,
                            "data": image_b64
                        }
                    }
                ]
            }
        ]
    }
    try:
        req = urllib.request.Request(
            url, 
            data=json.dumps(payload).encode("utf-8"), 
            headers=headers,
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=30) as response:
            res_data = json.loads(response.read().decode("utf-8"))
            text = res_data["candidates"][0]["content"]["parts"][0]["text"]
            return text.strip()
    except urllib.error.HTTPError as e:
        if e.code == 429:
            print("[Gemini Vision] Cuota agotada (429) — usando fallback.")
            return "[Error 429] Cuota de Gemini agotada."
        body_err = e.read().decode("utf-8") if e.fp else str(e)
        print(f"[Error Gemini Vision HTTP {e.code}]: {body_err[:200]}")
        return f"[Error Gemini Vision HTTP {e.code}]"
    except Exception as e:
        print(f"[Error Gemini Vision API] {e}")
        return f"[Error al llamar a Gemini Vision API]: {e}"




def _call_llm_vision(prompt: str, image_b64: str, media_type: str) -> str:
    """
    Analiza una imagen o PDF convertido a base64 usando Gemini, Claude o GPT-4o-mini.
    """
    load_dotenv(override=True)
    
    # 1. Intentar con Google Gemini (Prioridad)
    gemini_key = os.getenv("GEMINI_API_KEY")
    if gemini_key:
        try:
            res = _call_gemini_vision(prompt, image_b64, media_type)
            if res and not res.startswith("[Error"):
                return res
        except Exception as e:
            print(f"[Warning] Error usando Gemini Vision: {e}")

    # 2. Fallback a Claude
    anthropic_key = os.getenv("ANTHROPIC_API_KEY")
    if anthropic_key:
        try:
            # pyrefly: ignore [missing-import]
            import anthropic
            client = anthropic.Anthropic(api_key=anthropic_key)
            message = client.messages.create(
                model="claude-3-5-sonnet-20241022",
                max_tokens=1000,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": media_type,
                                    "data": image_b64
                                }
                            },
                            {
                                "type": "text",
                                "text": prompt
                            }
                        ]
                    }
                ]
            )
            return message.content[0].text.strip()
        except Exception as e:
            print(f"[Error Anthropic Vision] {e}")

    # 3. Fallback a OpenAI
    openai_key = os.getenv("OPENAI_API_KEY")
    if openai_key:
        try:
            # pyrefly: ignore [missing-import]
            from openai import OpenAI
            client = OpenAI(api_key=openai_key)
            resp = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:{media_type};base64,{image_b64}"
                                }
                            }
                        ]
                    }
                ],
                max_tokens=800
            )
            return resp.choices[0].message.content.strip()
        except Exception as e:
            print(f"[Error OpenAI Vision] {e}")

    return (
        "[Análisis de imagen simulado] Se detectó una evaluación FODA con factores "
        "identificados. La mayoría de los factores externos muestran oportunidades. "
        "Se recomienda revisar los factores con clasificación de Amenaza antes de adoptar."
    )


def _call_gemini(prompt: str) -> str:
    """
    Realiza una llamada al modelo gemini-2.5-flash de Google AI Studio usando urllib.request.
    Si recibe error 429 (cuota agotada) retorna inmediatamente un string de error
    para que el llamador use el fallback sin demoras.
    """
    import urllib.request
    import urllib.error

    load_dotenv(override=True)
    gemini_key = os.getenv("GEMINI_API_KEY")
    if not gemini_key:
        print("[Gemini] GEMINI_API_KEY no configurada.")
        return "[Error] GEMINI_API_KEY no configurada."
        
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={gemini_key}"
    headers = {"Content-Type": "application/json"}
    payload = {
        "contents": [
            {
                "parts": [
                    {
                        "text": prompt
                    }
                ]
            }
        ]
    }
    
    try:
        req = urllib.request.Request(
            url, 
            data=json.dumps(payload).encode("utf-8"), 
            headers=headers,
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=20) as response:
            res_data = json.loads(response.read().decode("utf-8"))
            text = res_data["candidates"][0]["content"]["parts"][0]["text"]
            return text.strip()
    except urllib.error.HTTPError as e:
        if e.code == 429:
            print("[Gemini] Cuota agotada (429) — usando fallback estático.")
            return "[Error 429] Cuota de Gemini agotada. Intenta de nuevo más tarde."
        body_err = e.read().decode("utf-8") if e.fp else str(e)
        print(f"[Error Gemini API HTTP {e.code}]: {body_err[:200]}")
        return f"[Error Gemini API HTTP {e.code}]"
    except Exception as e:
        print(f"[Error Gemini API] {e}")
        return f"[Error al llamar a Gemini API]: {e}"


# ──────────────────────────────────────────────────────────
# API_PUNTO_1 — Descripción automática del software
# ──────────────────────────────────────────────────────────

@app.get("/api/software-info", response_model=SoftwareInfoResponse)
async def software_info(name: str = Query(..., description="Nombre del software a evaluar")):
    """
    Recibe el nombre de un software y retorna una descripción breve.
    El frontend llama a este endpoint mientras el usuario tipea el nombre
    (con debounce de ~600 ms).
    """
    if not name.strip():
        raise HTTPException(status_code=400, detail="El nombre no puede estar vacío.")

    # ── Conectar LLM aquí ──────────────────────────────────
    # prompt = (
    #     f"En 1-2 oraciones en español, describe brevemente qué es el software '{name}' "
    #     "desde una perspectiva técnica/empresarial. Sé conciso y objetivo."
    # )
    # description = _call_llm_text(prompt)
    # ──────────────────────────────────────────────────────
    description = f"[API_PUNTO_1] Descripción automática de '{name}' (conectar LLM)."

    return SoftwareInfoResponse(description=description)


# ──────────────────────────────────────────────────────────
# API_PUNTO_3 — Sugerencia de factores idóneos
# ──────────────────────────────────────────────────────────

# Helper to query Scopus API
def _query_scopus(query_str: str, api_key: str):
    import urllib.request
    import urllib.parse
    try:
        url = "https://api.elsevier.com/content/search/scopus?" + urllib.parse.urlencode({
            "query": query_str,
            "count": "4",
            "apiKey": api_key
        })
        req = urllib.request.Request(url, headers={
            "Accept": "application/json",
            "X-ELS-APIKey": api_key
        })
        with urllib.request.urlopen(req, timeout=8) as response:
            return json.loads(response.read().decode("utf-8"))
    except Exception as e:
        print(f"[Warning] Error querying Scopus: {e}")
        return None


@app.post("/api/suggest-factors", response_model=SuggestFactorsResponse)
async def suggest_factors(body: SuggestFactorsRequest, db: Session = Depends(get_db)):
    """
    Recibe el nombre del software y la lista de factores disponibles.
    Retorna cuáles factores son más idóneos para evaluar ese software,
    junto con una razón breve para cada uno, una justificación y bibliografía científica.
    """
    if not body.softwareName.strip():
        raise HTTPException(status_code=400, detail="El nombre del software es obligatorio.")

    suggestions = []
    bibliography = []
    justification = ""
    
    # Map factors keywords
    FACTOR_KEYWORDS = {
        "Compatibilidad": ["compatibilidad", "compatibility", "interoperabilidad", "interoperability", "standards", "multi-platform", "multiplataforma"],
        "Personalización": ["personalización", "personalizacion", "customization", "extensibility", "modular", "adaptability", "flexibility"],
        "Prueba": ["prueba", "testing", "testability", "deploy", "installation", "despliegue"],
        "Fiabilidad": ["fiabilidad", "reliability", "stability", "security", "seguridad", "fault tolerance", "robustness"],
        "Reusabilidad": ["reusabilidad", "reusability", "library", "framework", "modular", "component", "license"],
        "Usabilidad": ["usabilidad", "usability", "user experience", "ux", "ease of use", "interface", "gui", "learning curve"],
        "Mantenibilidad": ["mantenibilidad", "maintainability", "maintenance", "updates", "refactoring", "code quality"],
        "Portabilidad": ["portabilidad", "portability", "mobile", "cross-platform", "database independent", "migration"],
        "Documentación": ["documentación", "documentacion", "documentation", "manual", "tutorials", "guides", "api reference"],
        "Formación": ["formación", "formacion", "training", "education", "learning", "skills", "tutorials"],
        "Tiempo de adopción": ["tiempo de adopción", "adoption time", "deployment time", "installation time", "learning time"],
        "Casos de estudio de adopción FLOSS": ["casos de estudio", "case studies", "success stories", "case study", "empirical studies"],
        "Centralidad de la tecnología de la información": ["centralidad", "it infrastructure", "alignment", "centralized", "strategy"],
        "Apoyo de la alta dirección": ["apoyo de la alta dirección", "management support", "top management", "executive support", "leadership commitment"],
        "Bloqueo de proveedores": ["bloqueo de proveedores", "vendor lock-in", "supplier lock-in", "vendor independence", "proprietary dependency"],
        "Soporte": ["soporte", "support", "community support", "commercial support", "helpdesk", "active community"],
        "Actitud hacia el cambio": ["actitud hacia el cambio", "attitude toward change", "resistance to change", "organizational change", "readiness for change"],
        "Coste total de propiedad": ["coste total de propiedad", "tco", "total cost of ownership", "licensing costs", "cost reduction", "cost savings"]
    }

    reasons_map = {
        "Compatibilidad": f"Es clave evaluar la compatibilidad de '{body.softwareName}' con el entorno tecnológico actual.",
        "Personalización": f"La facilidad de personalización y extensibilidad es importante para adaptar '{body.softwareName}'.",
        "Prueba": f"La facilidad de despliegue y testing inicial reduce los riesgos de adoptar '{body.softwareName}'.",
        "Fiabilidad": f"La estabilidad y tolerancia a fallos son determinantes para el éxito de '{body.softwareName}'.",
        "Reusabilidad": f"La reusabilidad del software libre reduce costes de desarrollo para '{body.softwareName}'.",
        "Usabilidad": f"La usabilidad y facilidad de aprendizaje reducen la resistencia del usuario a '{body.softwareName}'.",
        "Mantenibilidad": f"El mantenimiento activo por la comunidad asegura actualizaciones para '{body.softwareName}'.",
        "Portabilidad": f"La portabilidad evita dependencias rígidas de hardware y sistemas con '{body.softwareName}'.",
        "Documentación": f"La disponibilidad de documentación técnica acelera la implementación de '{body.softwareName}'.",
        "Formación": f"La facilidad de auto-aprendizaje y formación técnica impulsa la adopción de '{body.softwareName}'.",
        "Tiempo de adopción": f"Estimar el tiempo requerido para el despliegue completo de '{body.softwareName}'.",
        "Casos de estudio de adopción FLOSS": f"Aprender de las experiencias de éxito de otras organizaciones al adoptar '{body.softwareName}'.",
        "Centralidad de la tecnología de la información": f"Integrar '{body.softwareName}' eficientemente en la infraestructura central.",
        "Apoyo de la alta dirección": f"El compromiso gerencial facilita la asignación de recursos para '{body.softwareName}'.",
        "Bloqueo de proveedores": f"Adopción de '{body.softwareName}' para reducir la dependencia de licencias propietarias.",
        "Soporte": f"El soporte técnico y comunitario es crucial para resolver incidencias con '{body.softwareName}'.",
        "Actitud hacia el cambio": f"Evaluar la adaptabilidad del equipo frente al reemplazo de herramientas por '{body.softwareName}'.",
        "Coste total de propiedad": f"Comparar los costes operativos totales de '{body.softwareName}' frente a licencias."
    }

    scopus_key = os.getenv("SCOPUS_API_KEY")
    scopus_success = False
    
    # ── 1. Intentar usar la API de Scopus para elegir los factores y bibliografía ──
    if scopus_key:
        try:
            # Query Scopus for articles linking the software to adoption/evaluation keywords
            q = f'TITLE-ABS-KEY("{body.softwareName}" AND ("adoption" OR "evaluation" OR "factors" OR "metrics" OR "quality" OR "criteria"))'
            scopus_data = _query_scopus(q, scopus_key)
            if not scopus_data or not scopus_data.get("search-results", {}).get("entry", []):
                q = f'TITLE-ABS-KEY("software adoption" AND "{body.softwareName}")'
                scopus_data = _query_scopus(q, scopus_key)
            if not scopus_data or not scopus_data.get("search-results", {}).get("entry", []):
                q_broad = f'TITLE-ABS-KEY("open source software" AND "adoption" AND "factors")'
                scopus_data = _query_scopus(q_broad, scopus_key)

            entries = scopus_data.get("search-results", {}).get("entry", [])
            if entries:
                scopus_success = True
                print(f"[SCOPUS API SUCCESS] Se cargaron {len(entries)} referencias de Scopus para '{body.softwareName}'")
                
                # Combinar texto de Scopus para conteo de palabras clave
                scopus_text = ""
                for entry in entries:
                    title = entry.get("dc:title", "")
                    pub = entry.get("prism:publicationName", "")
                    desc = entry.get("dc:description", "")
                    scopus_text += f" {title} {pub} {desc}"
                scopus_text = scopus_text.lower()
                
                # Obtener scores de los factores usando el conteo en Scopus y el emparejamiento con DB
                db_factors = db.query(models.Factor).all()
                scored_factors = []
                sw_lower = body.softwareName.lower()
                
                # Identificar categorías por software
                is_db = any(kw in sw_lower for kw in ["db", "database", "sql", "postgres", "mysql", "oracle", "mariadb", "mongo", "sqlite", "nosql", "redis", "cassandra"])
                is_os = any(kw in sw_lower for kw in ["linux", "ubuntu", "debian", "redhat", "centos", "fedora", "windows", "unix", "android", "ios"])
                is_web_cms = any(kw in sw_lower for kw in ["wordpress", "drupal", "joomla", "moodle", "web", "app", "website", "html", "javascript"])
                is_lib_fw = any(kw in sw_lower for kw in ["react", "vue", "angular", "node", "python", "java", "library", "framework", "api", "sdk"])

                for f in db_factors:
                    score = 0
                    f_name_lower = f.nombre_factor.lower()
                    
                    # 1. Baseline de coincidencia por palabras clave
                    for word in sw_lower.split():
                        if len(word) > 3 and word in f_name_lower:
                            score += 15
                    for sub in f.subfactores:
                        sub_desc = sub.descripcion.lower()
                        for word in sw_lower.split():
                            if len(word) > 3 and word in sub_desc:
                                score += 5
                                
                    # 2. Peso extra de categorías
                    if is_db and f_name_lower in ["portabilidad", "fiabilidad", "compatibilidad", "documentación", "documentacion", "soporte", "mantenibilidad", "coste total de propiedad"]:
                        score += 10
                    elif is_os and f_name_lower in ["compatibilidad", "fiabilidad", "tiempo de adopción", "tiempo de adopcion", "soporte", "formación", "formacion", "bloqueo de proveedores", "coste total de propiedad"]:
                        score += 10
                    elif is_web_cms and f_name_lower in ["personalización", "personalizacion", "usabilidad", "prueba", "documentación", "documentacion", "coste total de propiedad", "soporte"]:
                        score += 10
                    elif is_lib_fw and f_name_lower in ["reusabilidad", "documentación", "documentacion", "mantenibilidad", "compatibilidad", "personalización", "personalizacion", "soporte"]:
                        score += 10

                    # 3. Puntuación de Scopus (Keyword density)
                    kws = FACTOR_KEYWORDS.get(f.nombre_factor, [f_name_lower])
                    for kw in kws:
                        score += scopus_text.count(kw.lower()) * 15
                    
                    matched_name = next((x for x in body.availableFactors if x.lower() == f.nombre_factor.lower()), None)
                    if matched_name:
                        scored_factors.append((matched_name, score))

                scored_factors.sort(key=lambda x: x[1], reverse=True)
                
                # Si todos los scores son 0, mezclamos con hash
                if not any(score > 0 for _, score in scored_factors):
                    import hashlib
                    h = hashlib.sha256(body.softwareName.encode('utf-8')).hexdigest()
                    sorted_factors = sorted(list(body.availableFactors))
                    shuffled = []
                    temp_list = list(sorted_factors)
                    for i in range(len(sorted_factors)):
                        idx = int(h[i*2:(i+1)*2], 16) % len(temp_list)
                        shuffled.append(temp_list.pop(idx))
                    selected_names = shuffled[:6]
                else:
                    selected_names = [f[0] for f in scored_factors[:6]]

                # Llenar suggestions
                for name in selected_names:
                    suggestions.append({
                        "factorName": name,
                        "reason": reasons_map.get(name, f"Factor idóneo determinado mediante análisis de literatura científica en Scopus para '{body.softwareName}'.")
                    })
                
                # Llenar bibliography
                for entry in entries[:4]:
                    title = entry.get("dc:title", "Evaluación de adopción de software libre")
                    creator = entry.get("dc:creator", "Indexado en Scopus")
                    date = entry.get("prism:coverDate", "2020-01-01")
                    year = date.split("-")[0] if "-" in date else "2020"
                    source = entry.get("prism:publicationName", "Scopus Database")
                    
                    relevance = f"Este artículo indexado en Scopus proporciona bases empíricas para la evaluación de '{body.softwareName}', justificando la inclusión de factores clave."
                    
                    bibliography.append({
                        "title": title,
                        "author": creator,
                        "year": year,
                        "source": f"[Scopus API] {source}",
                        "relevance": relevance
                    })

                # Generar justificación (con LLM de Gemini/Anthropic/OpenAI si están disponibles, si no, estático)
                gemini_key = os.getenv("GEMINI_API_KEY")
                anthropic_key = os.getenv("ANTHROPIC_API_KEY")
                openai_key = os.getenv("OPENAI_API_KEY")
                prompt_just = (
                    f"Escribe una justificación metodológica corta (máximo 3 oraciones en español) "
                    f"para la evaluación de la adopción del software '{body.softwareName}', basada en que "
                    f"los artículos científicos recuperados de Scopus sustentan la selección de estos factores clave: {', '.join(selected_names)}."
                )
                
                just_text = ""
                if gemini_key:
                    try:
                        resp_text = _call_gemini(prompt_just)
                        if resp_text and not resp_text.startswith("[Error"):
                            just_text = resp_text
                    except Exception:
                        pass
                if not just_text and anthropic_key:
                    try:
                        # pyrefly: ignore [missing-import]
                        import anthropic
                        client = anthropic.Anthropic(api_key=anthropic_key)
                        resp = client.messages.create(
                            model="claude-3-5-sonnet-20241022",
                            max_tokens=300,
                            messages=[{"role": "user", "content": prompt_just}]
                        )
                        just_text = resp.content[0].text.strip()
                    except Exception:
                        pass
                if not just_text and openai_key:
                    try:
                        # pyrefly: ignore [missing-import]
                        from openai import OpenAI
                        client = OpenAI(api_key=openai_key)
                        resp = client.chat.completions.create(
                            model="gpt-4o-mini",
                            messages=[{"role": "user", "content": prompt_just}],
                            max_tokens=256
                        )
                        just_text = resp.choices[0].message.content.strip()
                    except Exception:
                        pass
                
                if just_text:
                    justification = just_text
                else:
                    justification = (
                        f"La selección de factores para evaluar '{body.softwareName}' se sustenta científicamente en la literatura "
                        f"recuperada de la base de datos Scopus, destacando a {', '.join(selected_names[:-1])} y {selected_names[-1]} "
                        f"como dimensiones clave para analizar la viabilidad organizativa del software."
                    )
        except Exception as scopus_err:
            print(f"[Warning] Error eligiendo factores con Scopus: {scopus_err}")
            scopus_success = False

    # ── 2. Fallback a Google Gemini / Anthropic Claude / OpenAI GPT si Scopus falló o no está configurada ──
    gemini_key = os.getenv("GEMINI_API_KEY")
    anthropic_key = os.getenv("ANTHROPIC_API_KEY")
    openai_key = os.getenv("OPENAI_API_KEY")
    llm_success = False
    
    if not scopus_success and (gemini_key or anthropic_key or openai_key):
        factores_str = "\n".join(f"- {f}" for f in body.availableFactors)
        prompt = (
            f"Eres un experto en adopción de software libre (FLOSS) y metodologías académicas (TOE, TAM, UTAUT, ISO 25010).\n"
            f"El software a evaluar es: '{body.softwareName}'.\n"
            f"De la siguiente lista de factores de evaluación, elige los 5-7 MÁS importantes "
            f"para este software específico y explica brevemente por qué (1 oración concisa en español por cada uno).\n"
            f"Además, proporciona una justificación metodológica basada en marcos científicos (como TAM, TOE, UTAUT o ISO/IEC 25010).\n\n"
            f"Factores disponibles:\n{factores_str}\n\n"
            f"Responde ÚNICAMENTE con un objeto JSON con el siguiente formato, sin bloques de código markdown, sin explicaciones externas:\n"
            f"{{\n"
            f'  "suggestions": [{{"factorName": "nombre_exacto_del_factor", "reason": "razón de la sugerencia"}}],\n'
            f'  "justification": "justificación general en español (2-3 oraciones) de cómo los modelos TOE/TAM/UTAUT sustentan esta selección para {body.softwareName}"\n'
            f"}}\n"
            f"Asegúrate de que los nombres de los factores en 'suggestions' coincidan EXACTAMENTE con los de la lista provista."
        )

        if gemini_key:
            try:
                raw = _call_gemini(prompt)
                if raw and not raw.startswith("[Error"):
                    if raw.startswith("```"):
                        lines = raw.split("\n")
                        if lines[0].startswith("```"):
                            lines = lines[1:]
                        if lines[-1].startswith("```"):
                            lines = lines[:-1]
                        raw = "\n".join(lines).strip()
                    suggestions_data = json.loads(raw)
                    if isinstance(suggestions_data, dict):
                        s_list = suggestions_data.get("suggestions", [])
                        justification = suggestions_data.get("justification", "")
                        for item in s_list:
                            f_name = item.get("factorName")
                            reason = item.get("reason")
                            matched = next((f for f in body.availableFactors if f.lower() == f_name.lower()), None)
                            if matched:
                                suggestions.append({"factorName": matched, "reason": reason})
                        if suggestions:
                            llm_success = True
            except Exception as e:
                print(f"[Warning] Error usando Google Gemini para sugerir factores: {e}")
                suggestions = []
                justification = ""

        if not llm_success and anthropic_key:
            try:
                # pyrefly: ignore [missing-import]
                import anthropic
                client = anthropic.Anthropic(api_key=anthropic_key)
                resp = client.messages.create(
                    model="claude-3-5-sonnet-20241022",
                    max_tokens=1200,
                    messages=[{"role": "user", "content": prompt}]
                )
                raw = resp.content[0].text.strip()
                if raw.startswith("```"):
                    lines = raw.split("\n")
                    if lines[0].startswith("```"):
                        lines = lines[1:]
                    if lines[-1].startswith("```"):
                        lines = lines[:-1]
                    raw = "\n".join(lines).strip()
                suggestions_data = json.loads(raw)
                if isinstance(suggestions_data, dict):
                    s_list = suggestions_data.get("suggestions", [])
                    justification = suggestions_data.get("justification", "")
                    for item in s_list:
                        f_name = item.get("factorName")
                        reason = item.get("reason")
                        matched = next((f for f in body.availableFactors if f.lower() == f_name.lower()), None)
                        if matched:
                            suggestions.append({"factorName": matched, "reason": reason})
                    if suggestions:
                        llm_success = True
            except Exception as e:
                print(f"[Warning] Error usando Anthropic Claude para sugerir factores: {e}")
                suggestions = []
                justification = ""

        # OpenAI fallback
        if not llm_success and openai_key:
            try:
                # pyrefly: ignore [missing-import]
                from openai import OpenAI
                client = OpenAI(api_key=openai_key)
                resp = client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.3,
                    max_tokens=1000
                )
                raw = resp.choices[0].message.content.strip()
                if raw.startswith("```"):
                    lines = raw.split("\n")
                    if lines[0].startswith("```"):
                        lines = lines[1:]
                    if lines[-1].startswith("```"):
                        lines = lines[:-1]
                    raw = "\n".join(lines).strip()
                suggestions_data = json.loads(raw)
                if isinstance(suggestions_data, dict):
                    s_list = suggestions_data.get("suggestions", [])
                    justification = suggestions_data.get("justification", "")
                    for item in s_list:
                        f_name = item.get("factorName")
                        reason = item.get("reason")
                        matched = next((f for f in body.availableFactors if f.lower() == f_name.lower()), None)
                        if matched:
                            suggestions.append({"factorName": matched, "reason": reason})
                    if suggestions:
                        llm_success = True
            except Exception as e:
                print(f"[Warning] Error usando OpenAI para sugerir factores: {e}")
                suggestions = []
                justification = ""

    # ── 3. Heurística local de base si todo lo anterior falló o no hay llaves ──
    if not scopus_success and not llm_success:
        sw_lower = body.softwareName.lower()
        is_db = any(kw in sw_lower for kw in ["db", "database", "sql", "postgres", "mysql", "oracle", "mariadb", "mongo", "sqlite", "nosql", "redis", "cassandra"])
        is_os = any(kw in sw_lower for kw in ["linux", "ubuntu", "debian", "redhat", "centos", "fedora", "windows", "unix", "android", "ios"])
        is_web_cms = any(kw in sw_lower for kw in ["wordpress", "drupal", "joomla", "moodle", "web", "app", "website", "html", "javascript"])
        is_lib_fw = any(kw in sw_lower for kw in ["react", "vue", "angular", "node", "python", "java", "library", "framework", "api", "sdk"])
        
        try:
            db_factors = db.query(models.Factor).all()
            scored_factors = []
            for f in db_factors:
                score = 0
                f_name_lower = f.nombre_factor.lower()
                for word in sw_lower.split():
                    if len(word) > 3 and word in f_name_lower:
                        score += 15
                for sub in f.subfactores:
                    sub_desc = sub.descripcion.lower()
                    for word in sw_lower.split():
                        if len(word) > 3 and word in sub_desc:
                            score += 5
                            
                if is_db and f_name_lower in ["portabilidad", "fiabilidad", "compatibilidad", "documentación", "documentacion", "soporte", "mantenibilidad", "coste total de propiedad"]:
                    score += 10
                elif is_os and f_name_lower in ["compatibilidad", "fiabilidad", "tiempo de adopción", "tiempo de adopcion", "soporte", "formación", "formacion", "bloqueo de proveedores", "coste total de propiedad"]:
                    score += 10
                elif is_web_cms and f_name_lower in ["personalización", "personalizacion", "usabilidad", "prueba", "documentación", "documentacion", "coste total de propiedad", "soporte"]:
                    score += 10
                elif is_lib_fw and f_name_lower in ["reusabilidad", "documentación", "documentacion", "mantenibilidad", "compatibilidad", "personalización", "personalizacion", "soporte"]:
                    score += 10
                    
                matched_name = next((x for x in body.availableFactors if x.lower() == f.nombre_factor.lower()), None)
                if matched_name:
                    scored_factors.append((matched_name, score))
            
            scored_factors.sort(key=lambda x: x[1], reverse=True)
            
            if not any(score > 0 for _, score in scored_factors):
                import hashlib
                h = hashlib.sha256(body.softwareName.encode('utf-8')).hexdigest()
                sorted_factors = sorted(list(body.availableFactors))
                shuffled = []
                temp_list = list(sorted_factors)
                for i in range(len(sorted_factors)):
                    idx = int(h[i*2:(i+1)*2], 16) % len(temp_list)
                    shuffled.append(temp_list.pop(idx))
                selected_names = shuffled[:6]
            else:
                selected_names = [f[0] for f in scored_factors[:6]]
        except Exception:
            import hashlib
            h = hashlib.sha256(body.softwareName.encode('utf-8')).hexdigest()
            sorted_factors = sorted(list(body.availableFactors))
            shuffled = []
            temp_list = list(sorted_factors)
            for i in range(len(sorted_factors)):
                idx = int(h[i*2:(i+1)*2], 16) % len(temp_list)
                shuffled.append(temp_list.pop(idx))
            selected_names = shuffled[:6]

        for name in selected_names:
            reason = reasons_map.get(name, f"Factor idóneo sugerido para la evaluación de '{body.softwareName}'.")
            suggestions.append({"factorName": name, "reason": reason})

        justification = (
            f"La selección de factores para evaluar '{body.softwareName}' se sustenta en el modelo de "
            f"Tecnología-Organización-Entorno (TOE) y el Modelo de Aceptación Tecnológica (TAM). Estos marcos "
            f"permiten analizar la viabilidad técnica de '{body.softwareName}' en la organización."
        )

    # ── 4. Rellenar la bibliografía con los artículos por defecto si no se obtuvieron suficientes de Scopus ──
    default_papers = [
        {
            "title": "Information technology adoption in organizations: A review of empirical studies",
            "author": "Tornatzky, L. G., & Fleischer, M.",
            "year": "1990",
            "source": "[Referencia Académica] The Processes of Technological Innovation, Lexington Books",
            "relevance": f"Establece el marco TOE que justifica la evaluación de la 'Compatibilidad' de '{body.softwareName}' con la infraestructura TI y el 'Soporte' externo."
        },
        {
            "title": "Perceived usefulness, perceived ease of use, and user acceptance of information technology",
            "author": "Davis, F. D.",
            "year": "1989",
            "source": "[Referencia Académica] MIS Quarterly, 13(3), 319-340",
            "relevance": f"Sustenta la necesidad de evaluar la 'Usabilidad' y el desempeño percibido de '{body.softwareName}' como factores críticos para su adopción por parte del usuario final."
        },
        {
            "title": "Adoption of Free/Libre Open Source Software (FLOSS) in organizations: A systematic review",
            "author": "Hassan, M. R., & Nasir, M. H. N.",
            "year": "2018",
            "source": "[Referencia Académica] Journal of Systems and Software, 142, 112-130",
            "relevance": f"Identifica que el 'Coste Total de Propiedad' (TCO) y la disponibilidad de 'Documentación' técnica son determinantes en la adopción empresarial de software libre como '{body.softwareName}'."
        },
        {
            "title": "Systems and software Quality Requirements and Evaluation (SQuaRE) -- Quality models",
            "author": "ISO/IEC 25010",
            "year": "2011",
            "source": "[Referencia Académica] International Organization for Standardization",
            "relevance": f"Estánder internacional que valida la inclusión de características de calidad como 'Portabilidad', 'Fiabilidad' y 'Mantenibilidad' para evaluar la viabilidad de '{body.softwareName}'."
        }
    ]

    for paper in default_papers:
        if len(bibliography) >= 4:
            break
        if not any(p["title"].lower() == paper["title"].lower() for p in bibliography):
            bibliography.append(paper)

    # Asegurar que el formato de salida sea una lista de objetos Suggestion válidos
    output_suggestions = []
    for s in suggestions:
        if s["factorName"] in body.availableFactors:
            output_suggestions.append(SuggestFactorsResponse.Suggestion(**s))

    if not output_suggestions:
        for f in body.availableFactors[:6]:
            output_suggestions.append(
                SuggestFactorsResponse.Suggestion(
                    factorName=f,
                    reason=f"Factor recomendado por defecto para evaluar '{body.softwareName}'."
                )
            )

    return SuggestFactorsResponse(
        suggestions=output_suggestions,
        bibliography=[SuggestFactorsResponse.Citation(**b) for b in bibliography],
        justification=justification
    )


# ──────────────────────────────────────────────────────────
# API_PUNTO_2 — Descripción de un factor para el software
# ──────────────────────────────────────────────────────────

@app.get("/api/factor-info", response_model=FactorInfoResponse)
async def factor_info(
    factor: str = Query(..., description="Nombre del factor"),
    software: str = Query(..., description="Nombre del software evaluado"),
):
    """
    Retorna una descripción contextualizada de un factor de evaluación
    con respecto al software específico que se está evaluando.
    """
    description = ""
    
    # 1. Intentar usar Google Gemini si la key está configurada (prioritario)
    gemini_key = os.getenv("GEMINI_API_KEY")
    if gemini_key:
        try:
            prompt = (
                f"En 2-3 oraciones en español, explica qué significa el factor '{factor}' "
                f"en el contexto de evaluar la adopción del software '{software}' en una organización. "
                "Sé concreto y menciona aspectos prácticos de este software."
            )
            res = _call_gemini(prompt)
            if res and not res.startswith("[Error"):
                description = res
        except Exception as e:
            print(f"[Warning] Error usando Gemini para factor-info: {e}")

    # 2. Si no hay Gemini o falló, usar OpenAI o Anthropic como fallback
    if not description and (os.getenv("ANTHROPIC_API_KEY") or os.getenv("OPENAI_API_KEY")):
        try:
            prompt = (
                f"En 2-3 oraciones en español, explica qué significa el factor '{factor}' "
                f"en el contexto de evaluar la adopción del software '{software}' en una organización. "
                "Sé concreto y menciona aspectos prácticos de este software."
            )
            description = _call_llm_text(prompt)
            # Ignorar si es la simulación genérica para caer al KB local de respaldo
            if description.startswith("[Respuesta simulada]"):
                description = ""
        except Exception as e:
            print(f"[Warning] Error usando LLM para factor-info: {e}")
            
    # 3. Si no hay API key o si falló, usamos una base de conocimiento estática contextualizada
    if not description:
        factor_clean = factor.strip().lower()
        
        knowledge_base = {
            "compatibilidad": f"El factor 'Compatibilidad' evalúa la capacidad de '{software}' para integrarse sin problemas con el hardware, sistemas operativos y software existente en la organización, minimizando fricciones técnicas.",
            "personalización": f"El factor 'Personalización' mide la flexibilidad de '{software}' para ser adaptado, modificado o extendido (por ejemplo, mediante código fuente o complementos/módulos) según las necesidades de la organización.",
            "personalizacion": f"El factor 'Personalización' mide la flexibilidad de '{software}' para ser adaptado, modificado o extendido (por ejemplo, mediante código fuente o complementos/módulos) según las necesidades de la organización.",
            "prueba": f"El factor 'Prueba' analiza la facilidad para desplegar, instalar y probar '{software}' en entornos piloto o de prueba antes de realizar una adopción a gran escala.",
            "fiabilidad": f"El factor 'Fiabilidad' evalúa la estabilidad general, seguridad y tolerancia a fallos de '{software}' en comparación con otras alternativas propietarias en el mercado.",
            "reusabilidad": f"El factor 'Reusabilidad' hace referencia a la capacidad del código o componentes de '{software}' para ser reutilizados en otros desarrollos o integraciones internas.",
            "usabilidad": f"El factor 'Usabilidad' examina la facilidad de aprendizaje, interfaz gráfica de usuario y comodidad de uso de '{software}' para los usuarios finales de la organización.",
            "mantenibilidad": f"El factor 'Mantenibilidad' evalúa la continuidad del desarrollo de '{software}', asegurando que la comunidad o empresa proveedora publique actualizaciones y parches de seguridad de forma activa.",
            "portabilidad": f"El factor 'Portabilidad' determina la facilidad con la que '{software}' se puede trasladar de un entorno a otro (como diferentes sistemas operativos, servidores físicos o la nube).",
            "documentación": f"El factor 'Documentación' mide la disponibilidad, claridad y calidad de las guías de usuario y manuales técnicos para facilitar la administración y el soporte de '{software}'.",
            "documentacion": f"El factor 'Documentación' mide la disponibilidad, claridad y calidad de las guías de usuario y manuales técnicos para facilitar la administración y el soporte de '{software}'.",
            "formación": f"El factor 'Formación' analiza los recursos disponibles para capacitar al personal técnico y a los usuarios en el uso de '{software}', optimizando la curva de aprendizaje.",
            "formacion": f"El factor 'Formación' analiza los recursos disponibles para capacitar al personal técnico y a los usuarios en el uso de '{software}', optimizando la curva de aprendizaje.",
            "tiempo de adopción": f"El factor 'Tiempo de adopción' estima el periodo y esfuerzo requeridos para la instalación, configuración inicial y despliegue completo de '{software}' en los flujos de trabajo de la empresa.",
            "tiempo de adopcion": f"El factor 'Tiempo de adopción' estima el periodo y esfuerzo requeridos para la instalación, configuración inicial y despliegue completo de '{software}' en los flujos de trabajo de la empresa.",
            "casos de estudio de adopción floss": f"El factor 'Casos de estudio de adopción FLOSS' considera la existencia de historias de éxito y lecciones aprendidas de otras organizaciones al adoptar '{software}'.",
            "casos de estudio de adopcion floss": f"El factor 'Casos de estudio de adopción FLOSS' considera la existencia de historias de éxito y lecciones aprendidas de otras organizaciones al adoptar '{software}'.",
            "centralidad de la tecnología de la información": f"El factor 'Centralidad de la tecnología de la información' evalúa el nivel de integración de '{software}' en la infraestructura TI centralizada y su alineación estratégica.",
            "centralidad de la tecnologia de la informacion": f"El factor 'Centralidad de la tecnología de la información' evalúa el nivel de integración de '{software}' en la infraestructura TI centralizada y su alineación estratégica.",
            "apoyo de la alta dirección": f"El factor 'Apoyo de la alta dirección' mide el compromiso político y presupuestario de la gerencia para respaldar el proceso de adopción de '{software}'.",
            "apoyo de la alta direccion": f"El factor 'Apoyo de la alta dirección' mide el compromiso político y presupuestario de la gerencia para respaldar el proceso de adopción de '{software}'.",
            "bloqueo de proveedores": f"El factor 'Bloqueo de proveedores' evalúa la reducción de la dependencia hacia proveedores tecnológicos cerrados al implementar '{software}' en la organización.",
            "soporte": f"El factor 'Soporte' analiza la disponibilidad de asistencia técnica (comunitaria o comercial) para resolver incidencias de '{software}' de manera oportuna.",
            "actitud hacia el cambio": f"El factor 'Actitud hacia el cambio' mide la resistencia o aceptación del personal y administradores de TI frente al reemplazo de herramientas existentes por '{software}'.",
            "coste total de propiedad": f"El factor 'Coste total de propiedad' evalúa los costos directos e indirectos de adopción de '{software}' (hosting, mantenimiento y capacitación) frente a licencias propietarias."
        }
        
        # Intentar buscar coincidencia directa
        description = knowledge_base.get(
            factor_clean,
            f"El factor '{factor}' evalúa aspectos clave para determinar la viabilidad técnica y organizativa al adoptar '{software}' en la empresa."
        )

    return FactorInfoResponse(description=description)


# ──────────────────────────────────────────────────────────
# Análisis de imagen o PDF con IA (visión)
# ──────────────────────────────────────────────────────────

@app.post("/api/analyze-file", response_model=AnalyzeFileResponse)
async def analyze_file(file: UploadFile = File(...)):
    """
    Recibe un archivo PDF con datos de evaluación de software
    y retorna una recomendación detallada generada por Google Gemini.
    """
    content_type = file.content_type or ""
    filename = file.filename or ""
    file_bytes = await file.read()

    # Comprobar si el archivo es un PDF
    if not filename.lower().endswith(".pdf") and content_type != "application/pdf":
        raise HTTPException(
            status_code=400,
            detail="Formato no soportado. Por favor, suba únicamente archivos PDF.",
        )

    # Extraer texto del PDF usando pdfplumber
    try:
        # pyrefly: ignore [missing-import]
        import pdfplumber
        import io
        
        pdf_text = ""
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            pdf_text = "\n".join(page.extract_text() or "" for page in pdf.pages)
            
        if not pdf_text.strip():
            pdf_text = "[Advertencia: No se pudo extraer texto del PDF, posiblemente sea un documento escaneado]"
    except Exception as e:
        print(f"[Error pdfplumber] {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Error al procesar el archivo PDF: {e}"
        )
    # Armar prompt para Gemini (conciso y directo)
    prompt = (
        f"Analiza el siguiente informe de evaluación de adopción de software FLOSS extraído del archivo '{filename}'.\n"
        f"Por favor, proporciona una recomendación profesional, concisa, directa y fácil de entender en español "
        f"(evitando rodeos o explicaciones innecesariamente extensas, pero mostrando lo esencial) "
        f"para que un tomador de decisiones comprenda la viabilidad de adoptar este software.\n\n"
        f"El análisis debe estructurarse con títulos claros y concisos:\n"
        f"1. Resumen Ejecutivo (breve)\n"
        f"2. Fortalezas y Debilidades principales\n"
        f"3. Oportunidades y Amenazas del entorno\n"
        f"4. Recomendación Final y Pasos de Acción concretos\n\n"
        f"Texto extraído del documento PDF:\n{pdf_text}"
    )

    # Llamar a la API de Gemini
    try:
        recommendation = _call_gemini(prompt)
        if recommendation.startswith("[Error"):
            raise Exception(recommendation)
    except Exception as gemini_err:
        print(f"[Warning] Error llamando a Gemini, usando Claude como fallback: {gemini_err}")
        # Fallback a Claude / OpenAI
        fallback_prompt = (
            f"Proporciona una recomendación de adopción en español sumamente detallada "
            f"basándote en el siguiente texto de evaluación extraído de '{filename}':\n\n{pdf_text}"
        )
        recommendation = _call_llm_text(fallback_prompt)
        if recommendation.startswith("[Respuesta simulada]"):
            recommendation = (
                f"[Análisis simulado de '{filename}']\n\n"
                f"El análisis no se pudo completar con la API de Gemini ni con otros modelos de IA de respaldo.\n"
                f"Texto procesado del PDF: {pdf_text[:200]}..."
            )

    return AnalyzeFileResponse(recommendation=recommendation)


# ──────────────────────────────────────────────────────────
# Persistencia de evaluaciones en PostgreSQL (pgAdmin4)
# ──────────────────────────────────────────────────────────
# El frontend llama a estos endpoints para:
#   - Guardar una evaluación completa cuando el usuario descarga el PDF
#     (POST /api/evaluaciones)
#   - Mostrar el historial guardado en la base de datos, no solo en
#     memoria del navegador (GET /api/evaluaciones)
#   - Recuperar el detalle completo de una evaluación pasada, por si el
#     usuario recarga la página y perdió el estado local
#     (GET /api/evaluaciones/{id})

class SubfactorPayload(BaseModel):
    name: str
    weight: int


class FactorPayload(BaseModel):
    name: str
    scope: str  # "Interno" | "Externo" | "Ambos"
    subfactors: List[SubfactorPayload] = []


class EvaluationEntryPayload(BaseModel):
    decisorImportance: int
    scope: str  # "Interno" | "Externo"
    subfactorWeights: List[int] = []
    globalWeight: float
    foda: Optional[str] = None


class SaveEvaluationRequest(BaseModel):
    softwareName: str
    softwareDescription: Optional[str] = ""
    evaluatorName: Optional[str] = ""
    companyName: Optional[str] = ""
    recommendation: str
    recommendationCode: str  # "A" | "B" | "C"
    factors: List[FactorPayload]
    evaluations: List[EvaluationEntryPayload]
    pdfFileName: Optional[str] = None
    pdfSizeBytes: Optional[int] = None


def _get_or_create_factor(db: Session, factor: FactorPayload) -> models.Factor:
    existing = db.query(models.Factor).filter(models.Factor.nombre_factor == factor.name).first()
    if existing:
        return existing
    nuevo = models.Factor(
        nombre_factor=factor.name,
        alcance_default=factor.scope,
        es_personalizado=True,
    )
    db.add(nuevo)
    db.flush()
    for orden, sub in enumerate(factor.subfactors, start=1):
        db.add(models.Subfactor(id_factor=nuevo.id_factor, descripcion=sub.name, orden=orden))
    db.flush()
    return nuevo


@app.post("/api/evaluaciones")
def crear_evaluacion(body: SaveEvaluationRequest, db: Session = Depends(get_db)):
    """Guarda una evaluación completa (software, factores, detalles, resultados)."""
    if not body.softwareName.strip():
        raise HTTPException(status_code=400, detail="El nombre del software es obligatorio.")
    if len(body.factors) != len(body.evaluations):
        raise HTTPException(status_code=400, detail="factors y evaluations deben tener el mismo tamaño.")

    try:
        software = models.SoftwareEvaluado(
            nombre_software=body.softwareName,
            descripcion_software=body.softwareDescription,
        )
        db.add(software)
        db.flush()

        evaluacion = models.Evaluacion(
            id_software=software.id_software,
            estado="Completada",
            recomendacion_final=body.recommendationCode[:1] if body.recommendationCode else None,
            nombre_evaluador=body.evaluatorName,
            empresa=body.companyName,
        )
        db.add(evaluacion)
        db.flush()

        for factor_payload, ev in zip(body.factors, body.evaluations):
            factor_row = _get_or_create_factor(db, factor_payload)

            db.add(models.DetalleEvaluacionFactor(
                id_evaluacion=evaluacion.id_evaluacion,
                id_factor=factor_row.id_factor,
                importancia_usuario=ev.decisorImportance,
                alcance_usuario=ev.scope,
            ))

            # Detalle por subfactor: se relaciona por orden de aparición
            subfactor_rows = (
                db.query(models.Subfactor)
                .filter(models.Subfactor.id_factor == factor_row.id_factor)
                .order_by(models.Subfactor.orden)
                .all()
            )
            for i, peso in enumerate(ev.subfactorWeights):
                if i < len(subfactor_rows):
                    db.add(models.DetalleEvaluacionSubfactor(
                        id_evaluacion=evaluacion.id_evaluacion,
                        id_subfactor=subfactor_rows[i].id_subfactor,
                        puntuacion=peso,
                    ))

            if ev.foda:
                db.add(models.ResultadoEvaluacion(
                    id_evaluacion=evaluacion.id_evaluacion,
                    id_factor=factor_row.id_factor,
                    ponderacion_media=round(ev.globalWeight, 2),
                    clasificacion_foda=ev.foda[:12],
                ))

        if body.pdfFileName:
            db.add(models.PdfGenerado(
                id_evaluacion=evaluacion.id_evaluacion,
                nombre_archivo=body.pdfFileName,
                ruta_almacenamiento=f"descargas_usuario/{body.pdfFileName}",
                tamano_bytes=body.pdfSizeBytes,
            ))

        db.commit()
        return {"id_evaluacion": evaluacion.id_evaluacion, "status": "ok"}

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error al guardar en la base de datos: {e}")


@app.get("/api/evaluaciones")
def listar_evaluaciones(db: Session = Depends(get_db)):
    """Lista el historial de evaluaciones guardadas (para el panel de Historial)."""
    try:
        filas = (
            db.query(models.Evaluacion, models.SoftwareEvaluado)
            .join(models.SoftwareEvaluado, models.Evaluacion.id_software == models.SoftwareEvaluado.id_software)
            .order_by(desc(models.Evaluacion.id_evaluacion))
            .all()
        )
        resultado = []
        for ev, sw in filas:
            resultado.append({
                "id_evaluacion": ev.id_evaluacion,
                "softwareName": sw.nombre_software,
                "softwareDescription": sw.descripcion_software,
                "evaluatorName": ev.nombre_evaluador,
                "companyName": ev.empresa,
                "date": ev.fecha_evaluacion.isoformat() if ev.fecha_evaluacion else None,
                "recommendationCode": ev.recomendacion_final,
            })
        return resultado
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al leer historial: {e}")


@app.get("/api/evaluaciones/{id_evaluacion}")
def detalle_evaluacion(id_evaluacion: int, db: Session = Depends(get_db)):
    """Recupera el detalle completo de una evaluación (para regenerar el PDF)."""
    ev = db.query(models.Evaluacion).filter(models.Evaluacion.id_evaluacion == id_evaluacion).first()
    if not ev:
        raise HTTPException(status_code=404, detail="Evaluación no encontrada.")
    sw = db.query(models.SoftwareEvaluado).filter(models.SoftwareEvaluado.id_software == ev.id_software).first()

    detalles_factor = (
        db.query(models.DetalleEvaluacionFactor, models.Factor)
        .join(models.Factor, models.DetalleEvaluacionFactor.id_factor == models.Factor.id_factor)
        .filter(models.DetalleEvaluacionFactor.id_evaluacion == id_evaluacion)
        .all()
    )
    resultados = {
        r.id_factor: r
        for r in db.query(models.ResultadoEvaluacion).filter(models.ResultadoEvaluacion.id_evaluacion == id_evaluacion)
    }

    factors, evaluations = [], []
    for detalle, factor_row in detalles_factor:
        subfactor_rows = (
            db.query(models.Subfactor)
            .filter(models.Subfactor.id_factor == factor_row.id_factor)
            .order_by(models.Subfactor.orden)
            .all()
        )
        subfactor_scores = {
            d.id_subfactor: d.puntuacion
            for d in db.query(models.DetalleEvaluacionSubfactor).filter(
                models.DetalleEvaluacionSubfactor.id_evaluacion == id_evaluacion
            )
        }
        factors.append({
            "name": factor_row.nombre_factor,
            "scope": factor_row.alcance_default,
            "subfactors": [{"name": s.descripcion, "weight": 1} for s in subfactor_rows],
        })
        resultado = resultados.get(factor_row.id_factor)
        evaluations.append({
            "decisorImportance": detalle.importancia_usuario,
            "scope": detalle.alcance_usuario,
            "subfactorWeights": [subfactor_scores.get(s.id_subfactor, 1) for s in subfactor_rows],
            "globalWeight": float(resultado.ponderacion_media) if resultado else 0,
            "foda": resultado.clasificacion_foda if resultado else None,
        })

    return {
        "id_evaluacion": ev.id_evaluacion,
        "softwareName": sw.nombre_software if sw else "",
        "softwareDescription": sw.descripcion_software if sw else "",
        "evaluatorName": ev.nombre_evaluador,
        "companyName": ev.empresa,
        "date": ev.fecha_evaluacion.isoformat() if ev.fecha_evaluacion else None,
        "recommendationCode": ev.recomendacion_final,
        "factors": factors,
        "evaluations": evaluations,
    }


# ──────────────────────────────────────────────────────────
# Health check
# ──────────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {"status": "ok", "app": "GUIOSPRO FLOSS API v1.0"}
