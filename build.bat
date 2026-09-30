@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo.
echo  SRTR Pitwall - surum derlemesi
echo  ==========================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [HATA] Node.js bulunamadi. https://nodejs.org adresinden kurun.
  pause
  exit /b 1
)

where cargo >nul 2>nul
if errorlevel 1 (
  echo [HATA] Rust bulunamadi. https://rustup.rs adresinden kurun.
  echo        Visual Studio C++ Build Tools da gereklidir.
  pause
  exit /b 1
)

echo [1/2] Bagimliliklar kuruluyor...
call npm install --no-audit --no-fund
if errorlevel 1 goto :fail

echo.
echo [2/2] Derleniyor (ilk seferde birkac dakika surebilir)...
call npm run app:build
if errorlevel 1 goto :fail

echo.
echo  Tamamlandi!
echo.
echo  Tasinabilir exe : src-tauri\target\release\pitwall.exe
echo  Kurulum dosyasi : src-tauri\target\release\bundle\nsis\
echo.
explorer "src-tauri\target\release\bundle\nsis"
pause
exit /b 0

:fail
echo.
echo [HATA] Derleme basarisiz. Yukaridaki hata mesajina bakin.
pause
exit /b 1
