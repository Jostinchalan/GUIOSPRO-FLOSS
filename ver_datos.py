import sys
import os

# Agrega la carpeta backend para importar db y models
sys.path.append(os.path.join(os.path.dirname(__file__), "backend"))

# pyrefly: ignore [missing-import]
from db import SessionLocal
# pyrefly: ignore [missing-import]
import models

def print_db_summary():
    db = SessionLocal()
    try:
        print("=======================================================")
        print("          RESUMEN DE DATOS - GUIOSPRO _FLOSS           ")
        print("=======================================================")
        
        # 1. Software Evaluado
        softwares = db.query(models.SoftwareEvaluado).all()
        print(f"\n📁 SOFTWARE EVALUADO ({len(softwares)} registros):")
        if softwares:
            for s in softwares:
                print(f"  - ID: {s.id_software} | Nombre: {s.nombre_software} | Creado: {s.fecha_creacion}")
        else:
            print("  (Sin registros en esta tabla)")

        # 2. Evaluaciones
        evaluaciones = db.query(models.Evaluacion).all()
        print(f"\n📋 EVALUACIONES ({len(evaluaciones)} registros):")
        if evaluaciones:
            for ev in evaluaciones:
                sw_name = ev.software.nombre_software if ev.software else "Desconocido"
                print(f"  - ID: {ev.id_evaluacion} | Software: {sw_name} | Evaluador: {ev.nombre_evaluador} | Empresa: {ev.empresa} | Rec: {ev.recomendacion_final} | Fecha: {ev.fecha_evaluacion}")
        else:
            print("  (Sin registros en esta tabla)")

        # 3. Resultados (FODA)
        resultados = db.query(models.ResultadoEvaluacion).all()
        print(f"\n📊 CLASIFICACIONES FODA Y PONDERACIONES ({len(resultados)} registros):")
        if resultados:
            for r in resultados:
                factor_name = r.factor.nombre_factor if r.factor else "Desconocido"
                print(f"  - Eval ID: {r.id_evaluacion} | Factor: {factor_name} | FODA: {r.clasificacion_foda} | Peso: {r.ponderacion_media}")
        else:
            print("  (Sin registros en esta tabla)")

        # 4. PDFs Generados
        pdfs = db.query(models.PdfGenerado).all()
        print(f"\n📄 ARCHIVOS PDF REGISTRADOS ({len(pdfs)} registros):")
        if pdfs:
            for p in pdfs:
                print(f"  - Nombre: {p.nombre_archivo} | Tamaño: {p.tamano_bytes} bytes | Ruta: {p.ruta_almacenamiento}")
        else:
            print("  (Sin registros en esta tabla)")

        print("\n=======================================================")
        print("Nota: El sistema guarda los datos automáticamente")
        print("cuando finalizas una evaluación y descargas el PDF.")
        print("=======================================================")
    except Exception as e:
        print(f"Error al leer la base de datos: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    print_db_summary()
