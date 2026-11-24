@echo off
cd /d "%~dp0"
if not exist dist call npm run build
start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --app=http://localhost:4173
call npm start
