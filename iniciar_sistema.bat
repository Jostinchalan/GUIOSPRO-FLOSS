@echo off
chcp 65001 > NUL
echo =======================================================
echo          GUIOSPRO FLOSS — Iniciador del Sistema
echo =======================================================
echo.
echo [1/3] Iniciando el Backend (FastAPI)...
start "Backend - FastAPI" cmd /k "cd backend && venv\Scripts\activate && uvicorn main:app --reload --port 8000"

echo [2/3] Iniciando el Frontend (React + Vite)...
start "Frontend - React" cmd /k "npm run dev"

echo [3/3] Esperando que los servidores estén listos...
timeout /t 4 /nobreak > NUL

echo.
echo [OK] Abriendo el navegador en http://localhost:5173
start http://localhost:5173

echo.
echo =======================================================
echo ¡Todo listo! Los servidores están corriendo en ventanas separadas.
echo.
echo - Backend corriendo en: http://localhost:8000/docs
echo - Frontend corriendo en: http://localhost:5173
echo.
echo Para cerrarlos, simplemente cierra las ventanas negras de CMD
echo o presiona CTRL+C en ellas.
echo =======================================================
echo.
pause
