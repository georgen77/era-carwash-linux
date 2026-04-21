$ErrorActionPreference = 'SilentlyContinue'

Write-Host '=== ERA Bot Deploy ===' -ForegroundColor Cyan

# Скачиваем обновления
Write-Host 'Скачиваем обновления с GitHub...' -ForegroundColor Cyan
git -C C:\era-bot pull origin main
Write-Host "Версия: $(git -C C:\era-bot log --oneline -1)" -ForegroundColor Gray

# Перезапускаем бота
& "$PSScriptRoot\restart.ps1"
