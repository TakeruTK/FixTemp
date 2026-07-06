$ErrorActionPreference = 'SilentlyContinue'

# ── Helpers ──────────────────────────────────────────────────────────────────

function NullOrTrim {
    param([object]$v)
    if ($null -eq $v) { return $null }
    $s = [string]$v
    if ([string]::IsNullOrWhiteSpace($s)) { return $null }
    return $s.Trim()
}

function BytesToGb {
    param([object]$v)
    if ($null -eq $v) { return $null }
    $d = 0.0
    if (-not [double]::TryParse([string]$v, [ref]$d)) { return $null }
    if ($d -le 0) { return $null }
    return [math]::Round($d / 1073741824, 2)
}

function CimDateStr {
    param([object]$v)
    if ($null -eq $v) { return $null }
    try { return ([datetime]$v).ToString('yyyy-MM-dd HH:mm:ss') } catch {}
    try { return [System.Management.ManagementDateTimeConverter]::ToDateTime([string]$v).ToString('yyyy-MM-dd HH:mm:ss') } catch {}
    return $null
}

function ArchLabel {
    param([object]$a)
    if ($null -eq $a) { return $null }
    $n = [int]$a
    if ($n -eq 0)  { return 'x86' }
    if ($n -eq 6)  { return 'IA64' }
    if ($n -eq 9)  { return 'x64' }
    if ($n -eq 12) { return 'ARM64' }
    return "Arch-$n"
}

function MemTypeLabel {
    param([object]$t)
    if ($null -eq $t) { return $null }
    $n = [int]$t
    if ($n -eq 24) { return 'DDR3' }
    if ($n -eq 26) { return 'DDR4' }
    if ($n -eq 34) { return 'DDR5' }
    if ($n -eq 20) { return 'DDR2' }
    if ($n -eq 0 -or $n -eq 2) { return $null }
    return "Tipo-$n"
}

function BusLabel {
    param([string]$pnp, [string]$itype)
    if ($pnp -match '^PCI\\')              { return 'PCI Express' }
    if ($pnp -match '^USB')                { return 'USB' }
    if ($pnp -match 'VEN_NVME|NVMe')       { return 'NVMe' }
    if ($pnp -match '^SCSI\\DISK')         { return 'SCSI' }
    if ($pnp -match '^IDE\\')              { return 'IDE' }
    if (-not [string]::IsNullOrEmpty($itype)) { return $itype }
    return $null
}

function ParseMb {
    param([string]$s)
    if ([string]::IsNullOrEmpty($s)) { return $null }
    if ($s -match '([\d]+(?:[,\.]\d+)?)\s*(GB|MB|KB)') {
        $n = [double]($Matches[1] -replace ',', '')
        $u = $Matches[2].ToUpper()
        if ($u -eq 'GB') { return [int]($n * 1024) }
        if ($u -eq 'MB') { return [int]$n }
        if ($u -eq 'KB') { return [int]($n / 1024) }
    }
    return $null
}

# ── dxdiag (optional, 25s timeout) ───────────────────────────────────────────

$DX = @{ ok=$false; sys=@{}; disp=@(); snd=@() }

try {
    $tmp = [System.IO.Path]::GetTempFileName() -replace '\.tmp$', '.xml'
    $proc = Start-Process dxdiag.exe -ArgumentList "/whql:off /x `"$tmp`"" -WindowStyle Hidden -PassThru -ErrorAction Stop
    $done = $proc.WaitForExit(25000)
    if (-not $done) { $null = Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }

    if ($done -and (Test-Path $tmp)) {
        [xml]$xd = Get-Content $tmp -Raw -Encoding UTF8
        Remove-Item $tmp -Force -ErrorAction SilentlyContinue

        $si = $xd.DxDiag.SystemInformation
        if ($si) {
            $DX.sys = @{
                os       = NullOrTrim $si.OperatingSystem
                lang     = NullOrTrim $si.Language
                pageFile = NullOrTrim $si.PageFile
                dxVer    = NullOrTrim $si.DirectXVersion
                dxDiag   = NullOrTrim $si.DxDiagVersion
                miracast = NullOrTrim $si.Miracast
            }
            $DX.ok = $true
        }

        foreach ($dd in @($xd.DxDiag.DisplayDevices.DisplayDevice)) {
            if (-not $dd -or -not $dd.CardName) { continue }
            $DX.disp += @{
                name     = NullOrTrim $dd.CardName
                dedMem   = NullOrTrim $dd.DedicatedMemoryEnglish
                shrMem   = NullOrTrim $dd.SharedMemoryEnglish
                mode     = NullOrTrim $dd.CurrentMode
                hdr      = NullOrTrim $dd.HDRSupport
                monitor  = NullOrTrim $dd.MonitorName
                drvModel = NullOrTrim $dd.DriverModel
                ddi      = NullOrTrim $dd.DDI
                featLvl  = NullOrTrim $dd.FeatureLevels
            }
        }

        foreach ($sd in @($xd.DxDiag.DirectSound.SoundDevices.SoundDevice)) {
            if (-not $sd -or -not $sd.Description) { continue }
            $DX.snd += @{
                name    = NullOrTrim $sd.Description
                drvVer  = NullOrTrim $sd.DriverVersion
                drvDate = NullOrTrim $sd.DriverDateEnglish
                drvName = NullOrTrim $sd.DriverName
            }
        }
    }
} catch {}

# Lookup maps by name
$dxDisp = @{}
foreach ($d in $DX.disp) { if ($d.name) { $dxDisp[$d.name] = $d } }
$dxSnd  = @{}
foreach ($s in $DX.snd)  { if ($s.name) { $dxSnd[$s.name]  = $s } }

# ── DirectX fallback from registry ───────────────────────────────────────────

$dxVerFallback = $null
try {
    $rk = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\DirectX' -ErrorAction SilentlyContinue
    if ($rk -and $rk.Version) {
        $parts = ([string]$rk.Version).Split('.')
        if ($parts.Count -ge 2) {
            $maj = [int]$parts[1]
            if ($maj -ge 9)  { $dxVerFallback = 'DirectX 12' }
            elseif ($maj -ge 8) { $dxVerFallback = 'DirectX 11' }
        }
    }
} catch {}

# ── Language fallback ─────────────────────────────────────────────────────────

$langFallback = $null
try { $langFallback = (Get-Culture).DisplayName } catch {}

# ── WMI queries ───────────────────────────────────────────────────────────────

$wCS   = Get-CimInstance Win32_ComputerSystem        -ErrorAction SilentlyContinue
$wProd = Get-CimInstance Win32_ComputerSystemProduct -ErrorAction SilentlyContinue
$wBios = Get-CimInstance Win32_BIOS                  -ErrorAction SilentlyContinue
$wMB   = Get-CimInstance Win32_BaseBoard             -ErrorAction SilentlyContinue
$wCPU  = Get-CimInstance Win32_Processor             -ErrorAction SilentlyContinue | Select-Object -First 1
$wOS   = Get-CimInstance Win32_OperatingSystem       -ErrorAction SilentlyContinue
$wMemA = Get-CimInstance Win32_PhysicalMemoryArray   -ErrorAction SilentlyContinue | Select-Object -First 1

# ── Build result ──────────────────────────────────────────────────────────────

$out = [ordered]@{

    fetchedAt = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')

    system = [ordered]@{
        manufacturer  = NullOrTrim $wCS.Manufacturer
        model         = NullOrTrim $wCS.Model
        version       = NullOrTrim $wProd.Version
        serial        = NullOrTrim $wProd.IdentifyingNumber
        systemType    = NullOrTrim $wCS.SystemType
        totalMemoryGb = BytesToGb  $wCS.TotalPhysicalMemory
    }

    os = [ordered]@{
        name         = NullOrTrim $wOS.Caption
        version      = NullOrTrim $wOS.Version
        build        = NullOrTrim $wOS.BuildNumber
        architecture = NullOrTrim $wOS.OSArchitecture
        bootDevice   = NullOrTrim $wOS.BootDevice
        installDate  = CimDateStr $wOS.InstallDate
        lastBoot     = CimDateStr $wOS.LastBootUpTime
        pageFile     = if ($DX.sys.pageFile) { $DX.sys.pageFile } else { $null }
        language     = if ($DX.sys.lang)     { $DX.sys.lang }     else { $langFallback }
    }

    directx = [ordered]@{
        version         = if ($DX.sys.dxVer)  { $DX.sys.dxVer  } else { $dxVerFallback }
        dxDiagVersion   = $DX.sys.dxDiag
        miracast        = $DX.sys.miracast
    }

    bios = [ordered]@{
        vendor      = NullOrTrim $wBios.Manufacturer
        version     = NullOrTrim $wBios.SMBIOSBIOSVersion
        releaseDate = CimDateStr $wBios.ReleaseDate
    }

    baseboard = [ordered]@{
        manufacturer = NullOrTrim $wMB.Manufacturer
        model        = NullOrTrim $wMB.Product
        version      = NullOrTrim $wMB.Version
        serial       = NullOrTrim $wMB.SerialNumber
    }

    cpu = [ordered]@{
        manufacturer             = NullOrTrim $wCPU.Manufacturer
        vendor                   = NullOrTrim $wCPU.Manufacturer
        brand                    = NullOrTrim $wCPU.Name
        socket                   = NullOrTrim $wCPU.SocketDesignation
        architecture             = ArchLabel  $wCPU.Architecture
        speed                    = if ($wCPU.CurrentClockSpeed) { [math]::Round($wCPU.CurrentClockSpeed / 1000.0, 2) } else { $null }
        speedMax                 = if ($wCPU.MaxClockSpeed)     { [math]::Round($wCPU.MaxClockSpeed / 1000.0, 2) }     else { $null }
        cores                    = $wCPU.NumberOfLogicalProcessors
        physicalCores            = $wCPU.NumberOfCores
        processors               = $wCS.NumberOfProcessors
        l2CacheKb                = $wCPU.L2CacheSize
        l3CacheKb                = $wCPU.L3CacheSize
        stepping                 = NullOrTrim $wCPU.Stepping
        family                   = NullOrTrim $wCPU.Description
        virtualizationFirmwareEnabled = [bool]$wCS.HypervisorPresent
    }

    graphics = [ordered]@{
        controllers = @(
            Get-CimInstance Win32_VideoController -ErrorAction SilentlyContinue | ForEach-Object {
                $vc  = $_
                $dx  = $dxDisp[$vc.Name]

                # VRAM: dxdiag gives correct 64-bit value; WMI AdapterRAM is capped at ~4095 MB
                $vramMb = $null
                if ($dx) { $vramMb = ParseMb $dx.dedMem }
                if (-not $vramMb -and $vc.AdapterRAM -gt 0) { $vramMb = [int]($vc.AdapterRAM / 1MB) }

                # Current resolution fallback when dxdiag unavailable
                $modeFallback = $null
                if ($vc.CurrentHorizontalResolution -gt 0 -and $vc.CurrentVerticalResolution -gt 0) {
                    $modeFallback = "$($vc.CurrentHorizontalResolution) x $($vc.CurrentVerticalResolution)"
                    if ($vc.CurrentRefreshRate -gt 0) { $modeFallback += " @ $($vc.CurrentRefreshRate) Hz" }
                }

                [ordered]@{
                    vendor          = NullOrTrim $vc.AdapterCompatibility
                    model           = NullOrTrim $vc.Name
                    bus             = BusLabel $vc.PNPDeviceID $vc.AdapterDACType
                    pnpDeviceId     = NullOrTrim $vc.PNPDeviceID
                    pciAddress      = if ($vc.PNPDeviceID -match '^PCI\\') { NullOrTrim $vc.PNPDeviceID } else { $null }
                    vram            = $vramMb
                    driverVersion   = NullOrTrim $vc.DriverVersion
                    currentMode     = if ($dx -and $dx.mode)     { $dx.mode }     else { $modeFallback }
                    driverModel     = if ($dx -and $dx.drvModel)  { $dx.drvModel }  else { $null }
                    featureLevels   = if ($dx -and $dx.featLvl)   { $dx.featLvl }   else { $null }
                    ddi             = if ($dx -and $dx.ddi)       { $dx.ddi }       else { $null }
                    hdr             = if ($dx -and $dx.hdr)       { $dx.hdr }       else { $null }
                    dedicatedMemory = if ($dx -and $dx.dedMem)    { $dx.dedMem }    else { $null }
                    sharedMemory    = if ($dx -and $dx.shrMem)    { $dx.shrMem }    else { $null }
                    monitor         = if ($dx -and $dx.monitor)   { $dx.monitor }   else { $null }
                }
            }
        )
    }

    memory = @(
        Get-CimInstance Win32_PhysicalMemory -ErrorAction SilentlyContinue | ForEach-Object {
            [ordered]@{
                size         = if ($_.Capacity) { [double]$_.Capacity } else { $null }
                bank         = NullOrTrim $_.DeviceLocator
                slot         = NullOrTrim $_.BankLabel
                type         = MemTypeLabel $_.SMBIOSMemoryType
                clockSpeed   = $_.ConfiguredClockSpeed
                speedMax     = $_.Speed
                manufacturer = NullOrTrim $_.Manufacturer
                partNum      = NullOrTrim $_.PartNumber
                serial       = NullOrTrim $_.SerialNumber
            }
        }
    )

    memorySummary = [ordered]@{
        maxCapacityGb = if ($wMemA.MaxCapacityEx -gt 0) { [math]::Round($wMemA.MaxCapacityEx / 1048576, 0) } else { $null }
        slots         = $wMemA.MemoryDevices
        populated     = @(Get-CimInstance Win32_PhysicalMemory -ErrorAction SilentlyContinue).Count
    }

    disks = @(
        Get-CimInstance Win32_DiskDrive -ErrorAction SilentlyContinue | ForEach-Object {
            $dsk  = $_
            $parts = @(Get-CimAssociatedInstance -InputObject $dsk -Association Win32_DiskDriveToDiskPartition -ErrorAction SilentlyContinue)
            $vols  = @()
            foreach ($p in $parts) {
                $lvols = @(Get-CimAssociatedInstance -InputObject $p -Association Win32_LogicalDiskToPartition -ErrorAction SilentlyContinue)
                foreach ($lv in $lvols) {
                    $vols += [ordered]@{
                        letter     = NullOrTrim $lv.DeviceID
                        label      = NullOrTrim $lv.VolumeName
                        filesystem = NullOrTrim $lv.FileSystem
                        freeGb     = BytesToGb  $lv.FreeSpace
                        sizeGb     = BytesToGb  $lv.Size
                    }
                }
            }
            [ordered]@{
                name             = NullOrTrim $dsk.Model
                vendor           = NullOrTrim $dsk.Manufacturer
                type             = NullOrTrim $dsk.MediaType
                interfaceType    = NullOrTrim $dsk.InterfaceType
                bus              = BusLabel $dsk.PNPDeviceID $dsk.InterfaceType
                size             = if ($dsk.Size) { [double]$dsk.Size } else { $null }
                smartStatus      = NullOrTrim $dsk.Status
                serialNumber     = NullOrTrim $dsk.SerialNumber
                firmwareRevision = NullOrTrim $dsk.FirmwareRevision
                pnpDeviceId      = NullOrTrim $dsk.PNPDeviceID
                scsiPort         = $dsk.SCSIPort
                scsiTargetId     = $dsk.SCSITargetId
                partitions       = $parts.Count
                volumes          = $vols
            }
        }
    )

    audio = @(
        Get-CimInstance Win32_SoundDevice -ErrorAction SilentlyContinue | ForEach-Object {
            $sd  = $_
            $sdx = $dxSnd[$sd.Name]
            [ordered]@{
                name         = NullOrTrim $sd.Name
                manufacturer = NullOrTrim $sd.Manufacturer
                status       = NullOrTrim $sd.Status
                driverVersion = if ($sdx) { $sdx.drvVer  } else { $null }
                driverDate    = if ($sdx) { $sdx.drvDate } else { $null }
                driverName    = if ($sdx) { $sdx.drvName } else { $null }
            }
        }
    )

    network = @(
        Get-CimInstance Win32_NetworkAdapter -Filter 'NetEnabled=True' -ErrorAction SilentlyContinue | ForEach-Object {
            [ordered]@{
                iface        = NullOrTrim $_.NetConnectionID
                type         = NullOrTrim $_.AdapterType
                speed        = if ($_.Speed -gt 0) { [int]($_.Speed / 1000000) } else { $null }
                manufacturer = NullOrTrim $_.Manufacturer
                model        = NullOrTrim $_.Name
                mac          = NullOrTrim $_.MACAddress
                pnpDeviceId  = NullOrTrim $_.PNPDeviceID
            }
        }
    )

    monitors = @(
        Get-CimInstance Win32_DesktopMonitor -ErrorAction SilentlyContinue | ForEach-Object {
            [ordered]@{
                name         = NullOrTrim $_.Name
                status       = NullOrTrim $_.Status
                screenHeight = $_.ScreenHeight
                screenWidth  = $_.ScreenWidth
                pnpDeviceId  = NullOrTrim $_.PNPDeviceID
            }
        }
    )
}

# Output ONLY the JSON — single compressed line
Write-Output ($out | ConvertTo-Json -Depth 8 -Compress)
