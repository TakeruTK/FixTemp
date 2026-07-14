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

    $launcherPath = Join-Path $env:TEMP 'FixTemp-Relaunch.vbs'
    $startupShortcutPath = $null
    try {
        $startupFolder = [Environment]::GetFolderPath('Startup')
        if (![string]::IsNullOrWhiteSpace($startupFolder) -and (Test-Path -LiteralPath $startupFolder)) {
            $startupShortcutPath = Join-Path $startupFolder 'FixTemp-Relaunch.lnk'
        }
    } catch {}
    $escapedAppExecutable = $appExecutable.Replace("""", """""")
    $escapedStartupShortcutPath = if ($startupShortcutPath) { $startupShortcutPath.Replace("""", """""") } else { '' }
    $escapedLogFile = $logFile.Replace("""", """""")
    $launcher = @"
On Error Resume Next
Dim shell, fso, app, startupLink, logFile, log
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
app = "$escapedAppExecutable"
startupLink = "$escapedStartupShortcutPath"
logFile = "$escapedLogFile"

Sub WriteLog(message)
  On Error Resume Next
  Set log = fso.OpenTextFile(logFile, 8, True)
  log.WriteLine Now & " " & message
  log.Close
End Sub

WriteLog "Relanzador silencioso iniciado: " & app
WScript.Sleep 12000
Dim i
For i = 1 To 10
  If IsRunning() Then
    WriteLog "FixTemp ya esta abierto; no se relanza de nuevo"
    Exit For
  End If
  If fso.FileExists(app) Then
    shell.Run """" & app & """", 1, False
    WriteLog "Intento de relanzar FixTemp #" & i
  Else
    WriteLog "No existe el ejecutable en el intento #" & i
  End If
  WScript.Sleep 5000
Next

If startupLink <> "" Then
  If fso.FileExists(startupLink) Then fso.DeleteFile startupLink, True
End If
fso.DeleteFile WScript.ScriptFullName, True

Function IsRunning()
  On Error Resume Next
  Dim svc, processes
  Set svc = GetObject("winmgmts:\\.\root\cimv2")
  Set processes = svc.ExecQuery("SELECT ProcessId FROM Win32_Process WHERE Name='FixTemp.exe'")
  IsRunning = processes.Count > 0
End Function
"@
    Set-Content -LiteralPath $launcherPath -Value $launcher -Encoding ASCII -Force

    try {
        if ($startupShortcutPath) {
            $wsh = New-Object -ComObject WScript.Shell
            $shortcut = $wsh.CreateShortcut($startupShortcutPath)
            $shortcut.TargetPath = "$env:WINDIR\System32\wscript.exe"
            $shortcut.Arguments = "//B //Nologo `"$launcherPath`""
            $shortcut.WorkingDirectory = Split-Path -Parent $launcherPath
            $shortcut.WindowStyle = 7
            $shortcut.Description = 'Relanzar FixTemp despues de actualizar'
            $shortcut.Save()
        }
    } catch {
        Write-InstallLog "No se pudo crear acceso de inicio temporal: $($_.Exception.Message)"
    }

    try {
        Start-Process -FilePath $appExecutable -WindowStyle Normal
        Write-InstallLog 'Relanzado directo de FixTemp solicitado.'
    } catch {
        Write-InstallLog "No se pudo hacer relanzado directo: $($_.Exception.Message)"
    }

    Start-Process -FilePath "$env:WINDIR\System32\wscript.exe" -ArgumentList @('//B', '//Nologo', $launcherPath) -WindowStyle Hidden
    Write-InstallLog "Relanzado diferido de FixTemp programado con $launcherPath."
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

New-Item -ItemType Directory -Path $dataDirectory -Force | Out-Null
$pawnService = Get-Service -Name 'PawnIO' -ErrorAction SilentlyContinue
$pawnInstalled = $null -ne $pawnService -or (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\PawnIO')
if (!$pawnInstalled -and (Test-Path -LiteralPath $driverInstaller)) {
    $driver = Start-Process -FilePath $driverInstaller -ArgumentList @('-install', '-silent') -WindowStyle Hidden -Wait -PassThru
    if ($driver.ExitCode -ne 0) { throw "PawnIO termino con codigo $($driver.ExitCode)" }
    Start-Sleep -Seconds 2
    $pawnService = Get-Service -Name 'PawnIO' -ErrorAction SilentlyContinue
}
if (!$pawnService) {
    Write-InstallLog 'PawnIO no esta incluido en este instalador; se usara lectura LibreHardwareMonitor sin driver avanzado.'
} elseif ($pawnService.Status -ne 'Running') {
    Start-Service -Name 'PawnIO'
    for ($serviceAttempt = 0; $serviceAttempt -lt 15; $serviceAttempt++) {
        Start-Sleep -Seconds 1
        $pawnService.Refresh()
        if ($pawnService.Status -eq 'Running') { break }
    }
    if ($pawnService.Status -ne 'Running') {
        Write-InstallLog "PawnIO no logro iniciar correctamente. Estado actual: $($pawnService.Status). Se continua en modo lectura local limitada."
    }
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
    if ($RelaunchApp) {
        try {
            Start-FixTempRelaunch
            Write-InstallLog 'FixTemp se relanzara en modo limitado porque el lector avanzado no se pudo activar.'
        } catch {
            Write-InstallLog "No se pudo relanzar FixTemp despues del error: $($_.Exception.Message)"
        }
    }
    exit 0
}
