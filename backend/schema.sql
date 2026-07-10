-- ============================================================
-- GUIOSPRO FLOSS — Alineación del esquema en pgAdmin4
-- ============================================================
-- Ejecuta este script UNA VEZ en pgAdmin4:
--   1. Click derecho sobre la base "GUIOSPRO_FLOSS" → Query Tool
--   2. Pega este archivo completo → Execute (F5)
--
-- Es seguro ejecutarlo aunque las tablas ya existan: usa
-- IF NOT EXISTS / ADD COLUMN IF NOT EXISTS, así que NO borra
-- ni duplica información.
-- ============================================================

CREATE TABLE IF NOT EXISTS software_evaluado (
    id_software           SERIAL PRIMARY KEY,
    nombre_software       VARCHAR(150) NOT NULL,
    descripcion_software  TEXT,
    fecha_creacion        TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS factor (
    id_factor         SERIAL PRIMARY KEY,
    nombre_factor     VARCHAR(100) NOT NULL UNIQUE,
    alcance_default   VARCHAR(10),
    es_personalizado  BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS subfactor (
    id_subfactor  SERIAL PRIMARY KEY,
    id_factor     INTEGER REFERENCES factor(id_factor),
    descripcion   TEXT,
    orden         INTEGER
);

CREATE TABLE IF NOT EXISTS evaluacion (
    id_evaluacion        SERIAL PRIMARY KEY,
    id_software          INTEGER REFERENCES software_evaluado(id_software),
    fecha_evaluacion     TIMESTAMP DEFAULT NOW(),
    estado               VARCHAR(20) DEFAULT 'Completada',
    recomendacion_final  VARCHAR(1)
);

-- ⚠️ Columnas nuevas requeridas por el frontend (nombre del
--    evaluador y empresa, capturados en la pantalla de bienvenida).
--    Si tu tabla `evaluacion` ya existía sin estas columnas, este
--    ALTER las agrega sin afectar los datos existentes.
ALTER TABLE evaluacion ADD COLUMN IF NOT EXISTS nombre_evaluador VARCHAR(150);
ALTER TABLE evaluacion ADD COLUMN IF NOT EXISTS empresa          VARCHAR(150);

CREATE TABLE IF NOT EXISTS detalle_evaluacion_factor (
    id_detalle_factor    SERIAL PRIMARY KEY,
    id_evaluacion        INTEGER REFERENCES evaluacion(id_evaluacion),
    id_factor            INTEGER REFERENCES factor(id_factor),
    importancia_usuario  INTEGER,
    alcance_usuario      VARCHAR(10)
);

CREATE TABLE IF NOT EXISTS detalle_evaluacion_subfactor (
    id_detalle_subfactor  SERIAL PRIMARY KEY,
    id_evaluacion         INTEGER REFERENCES evaluacion(id_evaluacion),
    id_subfactor          INTEGER REFERENCES subfactor(id_subfactor),
    puntuacion            INTEGER
);

CREATE TABLE IF NOT EXISTS resultado_evaluacion (
    id_resultado        SERIAL PRIMARY KEY,
    id_evaluacion       INTEGER REFERENCES evaluacion(id_evaluacion),
    id_factor           INTEGER REFERENCES factor(id_factor),
    ponderacion_media   NUMERIC(3,2),
    clasificacion_foda  VARCHAR(12)
);

CREATE TABLE IF NOT EXISTS pdf_generado (
    id_pdf                SERIAL PRIMARY KEY,
    id_evaluacion         INTEGER REFERENCES evaluacion(id_evaluacion),
    nombre_archivo        VARCHAR(255),
    ruta_almacenamiento   VARCHAR(500),
    fecha_generacion      TIMESTAMP DEFAULT NOW(),
    tamano_bytes          INTEGER
);

-- Índices útiles para las consultas de historial
CREATE INDEX IF NOT EXISTS idx_evaluacion_software ON evaluacion(id_software);
CREATE INDEX IF NOT EXISTS idx_detalle_factor_eval ON detalle_evaluacion_factor(id_evaluacion);
CREATE INDEX IF NOT EXISTS idx_detalle_subfactor_eval ON detalle_evaluacion_subfactor(id_evaluacion);
CREATE INDEX IF NOT EXISTS idx_resultado_eval ON resultado_evaluacion(id_evaluacion);
