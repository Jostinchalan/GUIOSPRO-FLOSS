# GUIOSPRO FLOSS

Herramienta de evaluación de adopción de software FLOSS (Free/Libre Open
Source Software). Frontend en **React + TypeScript + Vite**, backend en
**Python (FastAPI)**, conectado a una base de datos **PostgreSQL**
administrada desde **pgAdmin4**.

---

## 1. Requisitos previos

- Node.js 18+ (para el frontend)
- Python 3.11+ (para el backend)
- PostgreSQL con tu base **GUIOSPRO_FLOSS** ya creada en pgAdmin4 (la que
  se ve en tu diagrama ER con las 8 tablas)

---

## 2. Abrir el proyecto en Visual Studio Code

1. Descomprime este ZIP.
2. Abre la carpeta resultante en VS Code (`File → Open Folder…`).
3. Verás dos partes principales:
   - `src/`, `index.html`, `package.json` → **Frontend (React)**
   - `backend/` → **Backend (Python / FastAPI)**

---

## 3. Configurar el backend (Python) y conectarlo a tu PostgreSQL

Abre una terminal en VS Code (**Terminal → New Terminal**) y ejecuta:

```bash
cd backend
python -m venv venv

# Activar el entorno virtual:
# Windows:
venv\Scripts\activate
# Mac/Linux:
source venv/bin/activate

pip install -r requirements.txt
```

### 3.1. Indicarle al backend cómo conectarse a TU base de datos

1. Copia el archivo `backend/.env.example` y renómbralo a **`backend/.env`**.
2. Ábrelo y coloca los datos de tu servidor de pgAdmin4:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=GUIOSPRO_FLOSS
DB_USER=postgres
DB_PASSWORD=tu_password_real
```

   Estos son los mismos datos con los que te conectas a tu servidor
   "UNEMI" en pgAdmin4 (click derecho sobre el servidor → Properties →
   pestaña Connection, para ver host/puerto/usuario).

### 3.2. Alinear las tablas de tu base de datos (una sola vez)

Tu base de datos ya tiene las 8 tablas correctas (se ve en tu captura de
pgAdmin4), pero le **faltan 2 columnas** en la tabla `evaluacion` para
guardar el nombre del evaluador y la empresa (datos que pide la pantalla
de bienvenida del frontend y que hoy no tienen dónde guardarse).

1. En pgAdmin4, click derecho sobre la base `GUIOSPRO_FLOSS` → **Query Tool**.
2. Abre el archivo `backend/schema.sql` de este proyecto, copia todo su
   contenido y pégalo en el Query Tool.
3. Ejecuta (F5).

Es seguro ejecutarlo aunque las tablas ya existan: usa
`CREATE TABLE IF NOT EXISTS` y `ADD COLUMN IF NOT EXISTS`, así que
**no borra ni duplica nada** de lo que ya tienes.

> ¿No quieres tocar pgAdmin manualmente? El backend también crea las
> tablas automáticamente al arrancar (`Base.metadata.create_all`), pero
> **no** puede agregar las 2 columnas nuevas a una tabla que ya existe
> (eso solo lo hace un `ALTER TABLE`, por eso conviene correr igual el
> script `schema.sql` una vez).

### 3.3. Cargar los 18 factores/subfactores por defecto en la base de datos

El sistema trae 18 factores predefinidos (Compatibilidad, Usabilidad,
Soporte, etc.) que hoy solo viven en el archivo
`src/app/data/guiosad-data.ts` del frontend. Para que también existan en
tu base de datos (y así se puedan enlazar con las evaluaciones
guardadas), corre una sola vez:

```bash
cd backend
python seed_factores.py
```

Verás algo como: `✅ Factores creados: 18 · Ya existían: 0`.
Si lo vuelves a correr por accidente, no duplica nada (detecta los que
ya existen por nombre).

### 3.4. Arrancar el backend

```bash
uvicorn main:app --reload --port 8000
```

Si todo quedó bien conectado, verás en la consola:
`✅ Conectado a PostgreSQL y tablas verificadas/creadas.`

Puedes probar los endpoints en `http://localhost:8000/docs`
(documentación interactiva automática de FastAPI).

---

## 4. Configurar y arrancar el frontend (React)

En **otra** terminal de VS Code (deja la del backend corriendo):

```bash
npm install
npm run dev
```

Abre la URL que te muestre Vite (normalmente `http://localhost:5173`).

---

## 5. ¿Qué queda conectado a la base de datos ahora?

Con estos cambios, la aplicación ya persiste en PostgreSQL:

- **Guardar evaluación**: cada vez que el usuario da clic en
  **"Descargar PDF"** (Paso 5 y 6), además de descargar el archivo, el
  frontend envía toda la evaluación al backend (`POST /api/evaluaciones`),
  que la guarda en las tablas `software_evaluado`, `evaluacion`,
  `detalle_evaluacion_factor`, `detalle_evaluacion_subfactor`,
  `resultado_evaluacion` y `pdf_generado`.
- **Historial**: el panel "Ver Historial" ahora carga las evaluaciones
  guardadas en PostgreSQL (`GET /api/evaluaciones`) al abrir la app, no
  solo lo que había en memoria del navegador. Si recargas la página, el
  historial de análisis anteriores sigue apareciendo.
- **Descargar PDF de un análisis antiguo**: si el detalle completo no
  está en memoria (por ejemplo, porque acabas de recargar la página), el
  frontend lo trae de la base de datos (`GET /api/evaluaciones/{id}`)
  antes de regenerar el PDF.

Si el backend o la base de datos no están disponibles en ese momento
(por ejemplo, olvidaste arrancar `uvicorn`), la app **no se rompe**: el
PDF se sigue descargando normalmente, solo que esa evaluación no queda
guardada en la base de datos hasta que el backend vuelva a estar
disponible.

Los endpoints de inteligencia artificial (`API_PUNTO_1`, `API_PUNTO_2`,
`API_PUNTO_3`, análisis de archivos) siguen funcionando con respuestas
simuladas, tal como venían en el proyecto original — ahí no se pidió
conectar un LLM real, solo la base de datos. Si más adelante quieres
conectar un modelo real (Claude, GPT, etc.), las instrucciones ya están
comentadas dentro de `backend/main.py`.

---

## 6. Resumen de lo que se revisó/agregó en el código

- El proyecto original **no tenía ninguna conexión a base de datos**: el
  historial de análisis solo vivía en memoria de React y se perdía al
  recargar la página. Por eso "conectar con pgAdmin4" no era solo cambiar
  una URL: había que construir toda la capa de persistencia.
- Se agregaron `backend/db.py` (conexión SQLAlchemy) y `backend/models.py`
  (los modelos ORM, uno por cada una de tus 8 tablas).
- Se agregó `backend/schema.sql` con las 2 columnas que le faltaban a la
  tabla `evaluacion` (`nombre_evaluador`, `empresa`) — el resto de tu
  diseño de base de datos ya estaba correcto y no necesitó cambios.
- Se agregó `backend/seed_factores.py` para cargar el catálogo de
  factores/subfactores por defecto en tu base de datos.
- Se agregaron 3 endpoints nuevos en `backend/main.py`:
  `POST /api/evaluaciones`, `GET /api/evaluaciones`,
  `GET /api/evaluaciones/{id}`.
- Se modificó `src/app/App.tsx` para cargar el historial desde la base de
  datos al iniciar, y para guardar cada evaluación al descargar el PDF.
- El resto del código (frontend y backend) se revisó y no se
  encontraron errores de lógica ni de compilación: el build de
  producción (`npm run build`) se probó y termina sin errores.
