@echo off
setlocal
pushd "%~dp0"

if not exist ".env.local" (
  echo .env.local is missing. Copy .env.local.example to .env.local and fill in the Supabase anon key.
  goto :fail
)

set "NEXT_PUBLIC_BASE_PATH=/budget"
call npx next build
if errorlevel 1 goto :fail

if exist docs rmdir /s /q docs
xcopy out docs /E /I /Q /Y >nul
if errorlevel 1 goto :fail
type nul > docs\.nojekyll

echo.
echo Deployed build is in docs\. Commit and push to publish.
popd
pause
exit /b 0

:fail
echo.
echo Deploy failed.
popd
pause
exit /b 1
