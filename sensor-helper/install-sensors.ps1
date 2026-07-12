param(
    [Parameter(Mandatory = $true)][string]$InstallDir,
    [switch]$EnableAppStartup,
    [switch]$RelaunchApp,
    [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'
$taskName = 'FixTemp Sensors'
$startupTaskName = 'FixTemp Startup'
$legacyTaskName = 'PulseGuard Sensors'
$legacyStartupTaskName = 'PulseGuard Startup'
$dataDirectory = Join-Path $env:ProgramData 'FixTemp'
$snapshot = Join-Path $dataDirectory 'sensors.json'
$logFile = Join-Path $dataDirectory 'sensor-install.log'

function Write-InstallLog([string]$Message) {
    New-Item -ItemType Directory -Path $dataDirectory -Force | Out-Null
    Add-Content -LiteralPath $logFile -Value "$(Get-Date -Format o) $Message" -Encoding UTF8
}

function Start-FixTempRelaunch {
    $appExecutable = Join-Path $InstallDir 'FixTemp.exe'
    if (!(Test-Path -LiteralPath $appExecutable)) {
        Write-InstallLog "No se pudo relanzar FixTemp: no existe $appExecutable."
        return
    }

    $cmdPath = Join-Path $env:TEMP 'FixTemp-Relaunch.cmd'
    $startupShortcutPath = $null
    try {
        $startupFolder = [Environment]::GetFolderPath('Startup')
        if (![string]::IsNullOrWhiteSpace($startupFolder) -and (Test-Path -LiteralPath $startupFolder)) {
            $startupShortcutPath = Join-Path $startupFolder 'FixTemp-Relaunch.lnk'
        }
    } catch {}
    $cmd = @"
@echo off
set "APP=$appExecutable"
set "STARTUP_LINK=$startupShortcutPath"
timeout /t 18 /nobreak >nul
for /l %%i in (1,1,8) do (
  start "" "%APP%"
  timeout /t 8 /nobreak >nul
  tasklist /FI "IMAGENAME eq FixTemp.exe" 2>nul | find /I "FixTemp.exe" >nul && goto done
)
:done
if not "%STARTUP_LINK%"=="" del "%STARTUP_LINK%" >nul 2>nul
del "%~f0" >nul 2>nul
"@
    Set-Content -LiteralPath $cmdPath -Value $cmd -Encoding ASCII -Force

    try {
        if ($startupShortcutPath) {
            $wsh = New-Object -ComObject WScript.Shell
            $shortcut = $wsh.CreateShortcut($startupShortcutPath)
            $shortcut.TargetPath = $cmdPath
            $shortcut.WorkingDirectory = Split-Path -Parent $cmdPath
            $shortcut.Description = 'Relanzar FixTemp despues de actualizar'
            $shortcut.Save()
        }
    } catch {
        Write-InstallLog "No se pudo crear acceso de inicio temporal: $($_.Exception.Message)"
    }

    Start-Process -FilePath explorer.exe -ArgumentList "`"$cmdPath`""
    Start-Process -FilePath $cmdPath -WindowStyle Hidden
    Write-InstallLog "Relanzado diferido de FixTemp programado con $cmdPath."
}

if ($Uninstall) {
    Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
    Stop-ScheduledTask -TaskName $startupTaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $startupTaskName -Confirm:$false -ErrorAction SilentlyContinue
    Stop-ScheduledTask -TaskName $legacyTaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $legacyTaskName -Confirm:$false -ErrorAction SilentlyContinue
    Stop-ScheduledTask -TaskName $legacyStartupTaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $legacyStartupTaskName -Confirm:$false -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $dataDirectory -Recurse -Force -ErrorAction SilentlyContinue
    exit 0
}

try {
Write-InstallLog 'Iniciando instalacion del lector de sensores.'

Stop-ScheduledTask -TaskName $legacyTaskName -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $legacyTaskName -Confirm:$false -ErrorAction SilentlyContinue
Stop-ScheduledTask -TaskName $legacyStartupTaskName -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $legacyStartupTaskName -Confirm:$false -ErrorAction SilentlyContinue

$sensorDirectory = Join-Path $InstallDir 'resources\sensor-helper'
$sensorExecutable = Join-Path $sensorDirectory 'FixTemp.Sensors.exe'
$driverInstaller = Join-Path $sensorDirectory 'PawnIO_setup.exe'
if (!(Test-Path -LiteralPath $sensorExecutable)) { throw 'No se encontro FixTemp.Sensors.exe' }
if (!(Test-Path -LiteralPath $driverInstaller)) { throw 'No se encontro PawnIO_setup.exe' }

New-Item -ItemType Directory -Path $dataDirectory -Force | Out-Null
$pawnService = Get-Service -Name 'PawnIO' -ErrorAction SilentlyContinue
$pawnInstalled = $null -ne $pawnService -or (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\PawnIO')
if (!$pawnInstalled) {
    $driver = Start-Process -FilePath $driverInstaller -ArgumentList '-install', '-silent' -WindowStyle Hidden -Wait -PassThru
    if ($driver.ExitCode -ne 0) { throw "PawnIO termino con codigo $($driver.ExitCode)" }
    Start-Sleep -Seconds 2
    $pawnService = Get-Service -Name 'PawnIO' -ErrorAction SilentlyContinue
}
if (!$pawnService) {
    throw 'PawnIO no quedo registrado como servicio despues de la instalacion.'
}
if ($pawnService.Status -ne 'Running') {
    Start-Service -Name 'PawnIO'
    for ($serviceAttempt = 0; $serviceAttempt -lt 15; $serviceAttempt++) {
        Start-Sleep -Seconds 1
        $pawnService.Refresh()
        if ($pawnService.Status -eq 'Running') { break }
    }
}
if ($pawnService.Status -ne 'Running') {
    throw "PawnIO no logro iniciar correctamente. Estado actual: $($pawnService.Status)"
}

$action = New-ScheduledTaskAction -Execute $sensorExecutable -Argument "--snapshot `"$snapshot`""
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Lectura local de sensores CPU para FixTemp' -Force | Out-Null
Start-ScheduledTask -TaskName $taskName

Unregister-ScheduledTask -TaskName $startupTaskName -Confirm:$false -ErrorAction SilentlyContinue
if ($EnableAppStartup) {
    $appExecutable = Join-Path $InstallDir 'FixTemp.exe'
    if (!(Test-Path -LiteralPath $appExecutable)) { throw 'No se encontro FixTemp.exe para configurar el inicio automatico.' }
    $interactiveUser = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    $startupAction = New-ScheduledTaskAction -Execute $appExecutable
    $startupTrigger = New-ScheduledTaskTrigger -AtLogOn -User $interactiveUser
    $startupPrincipal = New-ScheduledTaskPrincipal -UserId $interactiveUser -LogonType Interactive -RunLevel Highest
    $startupSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero)
    Register-ScheduledTask -TaskName $startupTaskName -Action $startupAction -Trigger $startupTrigger -Principal $startupPrincipal -Settings $startupSettings -Description 'Inicia FixTemp al ingresar a Windows' -Force | Out-Null
    Write-InstallLog "Inicio automatico habilitado para $interactiveUser."
} else {
    Write-InstallLog 'Inicio automatico deshabilitado por el usuario.'
}

$validReading = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Seconds 1
    if (!(Test-Path -LiteralPath $snapshot)) { continue }
    try {
        $reading = Get-Content -LiteralPath $snapshot -Raw | ConvertFrom-Json
        if ($null -ne $reading.timestamp) {
            $sampleTime = [DateTimeOffset]::FromUnixTimeMilliseconds([long]$reading.timestamp).UtcDateTime
        } elseif ($null -ne $reading.sampledAt) {
            $sampleTime = ([DateTime]$reading.sampledAt).ToUniversalTime()
        } else {
            continue
        }
        $age = ((Get-Date).ToUniversalTime() - $sampleTime).TotalSeconds
        if ($null -ne $reading.cpu.temperature -and [double]$reading.cpu.temperature -gt 0 -and $age -le 5) {
            $validReading = $true
            break
        }
    } catch {
        # The helper replaces the snapshot atomically; retry while it starts.
    }
}

if (!$validReading) {
    throw 'El lector no entrego una temperatura real del procesador dentro de 30 segundos.'
}

Write-InstallLog "Lector verificado: CPU $($reading.cpu.temperature) C, fuente $($reading.cpu.temperatureSource)."
if ($RelaunchApp) {
    Start-FixTempRelaunch
}
exit 0
} catch {
    Write-InstallLog "ERROR: $($_.Exception.Message)"
    Write-Error $_
    exit 1
}
