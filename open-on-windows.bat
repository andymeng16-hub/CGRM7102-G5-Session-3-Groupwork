@echo off
rem ============================================================
rem  Sharp Island: one route, one island
rem  Double-click this file to read the guide on Windows.
rem
rem  It does two things. First it clears the mark Windows puts on
rem  files that came out of a downloaded ZIP, which some browser
rem  settings treat as a reason to hold back pictures and scripts.
rem  Then it serves this folder over a local address, which avoids
rem  the question altogether, and opens the guide there.
rem
rem  Nothing is installed and nothing leaves this computer. The
rem  server is Python or Node, whichever is already present. Close
rem  the small window called "Sharp Island" to stop it.
rem ============================================================

setlocal EnableExtensions
title Sharp Island
cd /d "%~dp0"

if not exist "index.html" goto wrongfolder

echo.
echo  Sharp Island: starting a local server for this folder.
echo.

echo  [1/2] Clearing the downloaded-file mark...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -LiteralPath '.' -Recurse -File -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue" >nul 2>&1

echo  [2/2] Looking for Python or Node...
set PORT=8765

where py >nul 2>&1
if not errorlevel 1 goto usepy
where python >nul 2>&1
if not errorlevel 1 goto usepython
where node >nul 2>&1
if not errorlevel 1 goto usenode
goto nofound

:usepy
start "Sharp Island" /min py -m http.server %PORT% --bind 127.0.0.1
goto open

:usepython
start "Sharp Island" /min python -m http.server %PORT% --bind 127.0.0.1
goto open

:usenode
start "Sharp Island" /min npx --yes http-server -p %PORT% -a 127.0.0.1 -c-1 .
goto open

:open
timeout /t 3 /nobreak >nul
echo  Serving on http://127.0.0.1:%PORT%/index.html
start "" "http://127.0.0.1:%PORT%/index.html"
echo.
echo  The guide is open in your browser.
echo  Close the window called "Sharp Island" to stop the server,
echo  then close this window.
echo.
pause
exit /b 0

:nofound
echo.
echo  Neither Python nor Node was found on this computer, so the
echo  guide is opened directly from the folder instead.
echo.
echo  If the photographs do not appear, open ABOUT.txt and read the
echo  section PLATFORMS AND HOW TO OPEN IT.
echo.
start "" "index.html"
timeout /t 4 /nobreak >nul
exit /b 0

:wrongfolder
echo.
echo  index.html is not in this folder.
echo  Extract the whole repository folder first, then run this file
echo  from the folder that holds index.html, styles.css and app.js.
echo.
pause
exit /b 1
