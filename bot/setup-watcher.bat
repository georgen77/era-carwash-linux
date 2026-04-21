@echo off
echo Creating ERA-Bot-Watcher task...
schtasks /delete /tn "ERA-Bot-Watcher" /f 2>nul
schtasks /create /tn "ERA-Bot-Watcher" /tr "powershell -ExecutionPolicy Bypass -WindowStyle Hidden -File C:\era-bot\watcher.ps1" /sc onstart /ru SYSTEM /f
echo Starting ERA-Bot-Watcher...
schtasks /run /tn "ERA-Bot-Watcher"
echo Done! Watcher is running.
pause
