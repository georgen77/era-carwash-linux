$triggerFile = "C:\era-bot\deploy_trigger.txt"
$deployScript = "C:\era-bot\deploy.ps1"
$logFile = "C:\era-bot\watcher.log"

Add-Content $logFile "$(Get-Date) - Watcher started"

while ($true) {
    if (Test-Path $triggerFile) {
        Add-Content $logFile "$(Get-Date) - Trigger detected, running deploy..."
        Remove-Item $triggerFile -Force
        try {
            & powershell -ExecutionPolicy Bypass -File $deployScript
            Add-Content $logFile "$(Get-Date) - Deploy completed successfully"
        } catch {
            Add-Content $logFile "$(Get-Date) - Deploy error: $_"
        }
    }
    Start-Sleep -Seconds 10
}
