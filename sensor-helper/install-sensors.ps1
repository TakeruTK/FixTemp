param(
    [Parameter(Mandatory = $true)][string]$InstallDir,
    [switch]$EnableAppStartup,
    [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'
$taskName = 'FixTemp Sensors'
$startupTaskName = 'FixTemp Startup'
$dataDirectory = Join-Path $env:ProgramData 'FixTemp'
$snapshot = Join-Path $dataDirectory 'sensors.json'
$logFile = Join-Path $dataDirectory 'sensor-install.log'

function Write-InstallLog([string]$Message) {
    New-Item -ItemType Directory -Path $dataDirectory -Force | Out-Null
    Add-Content -LiteralPath $logFile -Value "$(Get-Date -Format o) $Message" -Encoding UTF8
}

if ($Uninstall) {
    Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
    Stop-ScheduledTask -TaskName $startupTaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $startupTaskName -Confirm:$false -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $dataDirectory -Recurse -Force -ErrorAction SilentlyContinue
    exit 0
}

try {
Write-InstallLog 'Iniciando instalacion del lector de sensores.'

$sensorDirectory = Join-Path $InstallDir 'resources\sensor-helper'
$sensorExecutable = Join-Path $sensorDirectory 'FixTemp.Sensors.exe'
$driverInstaller = Join-Path $sensorDirectory 'PawnIO_setup.exe'
if (!(Test-Path -LiteralPath $sensorExecutable)) { throw 'No se encontro FixTemp.Sensors.exe' }
if (!(Test-Path -LiteralPath $driverInstaller)) { throw 'No se encontro PawnIO_setup.exe' }

New-Item -ItemType Directory -Path $dataDirectory -Force | Out-Null
$pawnService = Get-Service -Name 'PawnIO' -ErrorAction SilentlyContinue
$pawnInstalled = $null -ne $pawnService -or (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\PawnIO')
if (!$pawnInstalled) {
    $driver = Start-Process -FilePath $driverInstaller -ArgumentList '-install' -Wait -PassThru
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
exit 0
} catch {
    Write-InstallLog "ERROR: $($_.Exception.Message)"
    Write-Error $_
    exit 1
}
