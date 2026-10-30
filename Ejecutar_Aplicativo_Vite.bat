@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
title Aplicativo Gestion Horas Extra - Vite

set "BASE=C:\Users\MSI KATANA\Downloads\Aplicativo_Gestion_Horas_Extra_Vite"

echo ============================================================
echo   APLICATIVO GESTION HORAS EXTRA - INSTALAR, ACTUALIZAR Y EJECUTAR
echo ============================================================
echo.

REM ---------- 1. Verificar carpeta ----------
if not exist "%BASE%" (
  echo [ERROR] No existe la carpeta:
  echo         %BASE%
  echo Extrae el ZIP en esa ruta y vuelve a ejecutar.
  goto :fin
)

REM Buscar package.json (raiz o una subcarpeta creada por el ZIP)
set "PROY="
if exist "%BASE%\package.json" set "PROY=%BASE%"
if not defined PROY (
  for /d %%D in ("%BASE%\*") do (
    if not defined PROY if exist "%%~fD\package.json" set "PROY=%%~fD"
  )
)
if not defined PROY (
  for /d %%D in ("%BASE%\*") do for /d %%E in ("%%~fD\*") do (
    if not defined PROY if exist "%%~fE\package.json" set "PROY=%%~fE"
  )
)
if not defined PROY (
  echo [ERROR] No se encontro package.json dentro de %BASE%
  goto :fin
)
cd /d "%PROY%"
echo [OK] Proyecto encontrado en: %PROY%
echo.

REM ---------- 2. Verificar / instalar Node.js ----------
where node >nul 2>&1
if errorlevel 1 (
  echo [!] Node.js no esta instalado. Intentando instalar con winget...
  where winget >nul 2>&1
  if errorlevel 1 (
    echo [ERROR] winget no disponible. Instala Node.js LTS desde https://nodejs.org
    start "" https://nodejs.org/
    goto :fin
  )
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  set "PATH=%PATH%;C:\Program Files\nodejs"
  where node >nul 2>&1
  if errorlevel 1 (
    echo [!] Node.js instalado. Cierra esta ventana y ejecuta el BAT de nuevo.
    goto :fin
  )
)
for /f "tokens=1 delims=v." %%v in ('node -v') do set "NODEMAJOR=%%v"
for /f "delims=" %%v in ('node -v') do echo [OK] Node.js %%v
if !NODEMAJOR! LSS 20 (
  echo [!] Vite requiere Node 20.19+ o 22.12+. Actualizando Node.js LTS...
  winget upgrade -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  echo [!] Cierra esta ventana y ejecuta el BAT de nuevo.
  goto :fin
)
for /f "delims=" %%v in ('npm -v') do echo [OK] npm %%v
echo.

REM ---------- 3. Variables de entorno ----------
if not exist ".env" (
  if exist ".env.example" (
    copy /y ".env.example" ".env" >nul
    echo [OK] Se creo .env a partir de .env.example
    echo [!] Completa VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY si usas Supabase real.
    start "" notepad ".env"
  ) else (
    echo [!] No hay .env.example; se continua sin .env
  )
) else (
  echo [OK] .env ya existe, no se modifica
)
echo.

REM ---------- 4. Descargar dependencias faltantes ----------
echo ---- Instalando dependencias (npm install) ----
call npm install
if errorlevel 1 (
  echo [!] Fallo npm install. Limpiando cache y reintentando...
  call npm cache clean --force
  if exist node_modules rmdir /s /q node_modules
  call npm install
  if errorlevel 1 (
    echo [ERROR] No se pudieron instalar las dependencias. Revisa internet/proxy.
    goto :fin
  )
)
echo.

REM ---------- 5. Actualizar lo faltante (seguro, sin romper versiones) ----------
echo ---- Actualizando dependencias compatibles (npm update) ----
call npm update
echo ---- Corrigiendo vulnerabilidades seguras (npm audit fix) ----
call npm audit fix
echo ---- Dependencias desactualizadas (solo informativo) ----
call npm outdated
echo.

REM ---------- 6. Validar y compilar ----------
echo ---- Validacion TypeScript ----
call npm run typecheck --if-present
echo ---- Pruebas ----
call npm test --if-present
echo ---- Compilando produccion (npm run build) ----
call npm run build
if errorlevel 1 (
  echo [ERROR] La compilacion fallo. Revisa los mensajes de arriba.
  goto :fin
)
echo [OK] Build generado en: %PROY%\dist
echo.

REM ---------- 7. Ejecutar ----------
echo Elige como ejecutar:
echo   1 = Servidor de desarrollo  (npm run dev)
echo   2 = Previsualizar produccion (npm run preview)
choice /c 12 /n /m "Opcion [1/2]: "
if errorlevel 2 (
  echo Iniciando preview... cierra esta ventana para detenerlo.
  call npm run preview -- --open
) else (
  echo Iniciando servidor de desarrollo... cierra esta ventana para detenerlo.
  call npm run dev -- --open
)

:fin
echo.
pause
endlocal
