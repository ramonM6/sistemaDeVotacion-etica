@echo off
rem ==========================================================================
rem  Sistema de Votacion de Electivos - inicio con doble clic (Windows)
rem  Verifica Node.js, instala dependencias, comprueba Supabase y arranca
rem  la API y la web. La logica esta en scripts\iniciar.mjs.
rem  Requiere apps\api\.env configurado con las conexiones y claves del equipo.
rem  No necesita Docker. Conserva la BD compartida en Supabase.
rem ==========================================================================
setlocal
chcp 65001 >nul
title Votacion de Electivos

rem pushd funciona con rutas con espacios y con carpetas de red (UNC).
pushd "%~dp0" || (
  echo ERROR: no se pudo entrar a la carpeta del proyecto: "%~dp0"
  goto :error
)

where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo ERROR: no se encontro Node.js.
  echo   Instala la version LTS ^(20 o superior^) desde https://nodejs.org
  echo   y vuelve a ejecutar iniciar.bat. Si ya lo instalaste, cierra y abre de nuevo esta ventana.
  goto :error
)

where npm >nul 2>&1
if errorlevel 1 (
  echo.
  echo ERROR: no se encontro npm. Reinstala Node.js desde https://nodejs.org
  goto :error
)

node "%~dp0scripts\iniciar.mjs" %*
if errorlevel 1 goto :error

popd
endlocal
exit /b 0

:error
echo.
echo La aplicacion se detuvo o no pudo iniciar. Revisa los mensajes de arriba.
popd 2>nul
pause
endlocal
exit /b 1
