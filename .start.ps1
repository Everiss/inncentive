param(
  [ValidateSet("all", "app", "node", "python")]
  [string]$Target = "all",
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Start-ServiceProcess {
  param(
    [string]$Name,
    [string]$WorkingDirectory,
    [string]$Command
  )

  if ($DryRun) {
    Write-Host "[DRY-RUN] $Name :: cd $WorkingDirectory && $Command"
    return
  }

  Start-Process powershell `
    -WorkingDirectory $WorkingDirectory `
    -ArgumentList @(
      "-NoExit",
      "-ExecutionPolicy", "Bypass",
      "-Command", $Command
    ) | Out-Null

  Write-Host "[STARTED] $Name"
}

function Start-App {
  Start-ServiceProcess -Name "backend" -WorkingDirectory "backend" -Command "npm.cmd run start:dev"
  Start-ServiceProcess -Name "frontend" -WorkingDirectory "frontend" -Command "npm.cmd run dev"
}

function Start-NodeServices {
  Start-ServiceProcess -Name "import-service" -WorkingDirectory "services/import-service" -Command "npm.cmd run dev"
  Start-ServiceProcess -Name "file-hub" -WorkingDirectory "services/file-hub" -Command "npm.cmd run dev"
  Start-ServiceProcess -Name "notification-service" -WorkingDirectory "services/notification-service" -Command "npm.cmd run dev"
}

function Start-PythonServices {
  Start-ServiceProcess -Name "ai-service" -WorkingDirectory "services/ai-service" -Command "python -m uvicorn app.main:app --reload --port 8020"
  Start-ServiceProcess -Name "pdf-extractor" -WorkingDirectory "services/pdf-extractor" -Command "python -m uvicorn app.main:app --reload --port 8010"
}

switch ($Target) {
  "all" {
    Start-App
    Start-NodeServices
    Start-PythonServices
    break
  }
  "app" { Start-App; break }
  "node" { Start-NodeServices; break }
  "python" { Start-PythonServices; break }
}
