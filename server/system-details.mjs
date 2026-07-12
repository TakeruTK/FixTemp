import os from 'node:os'
import path from 'node:path'
import si from 'systeminformation'

const round = (value, digits = 1) => Number.isFinite(value) ? Number(value.toFixed(digits)) : null
const gb = value => Number.isFinite(value) ? Number((value / 1024 ** 3).toFixed(value >= 1024 ** 3 * 100 ? 0 : 1)) : null
const asArray = value => Array.isArray(value) ? value : []
const safe = async (task, fallback) => {
  try { return await task() } catch { return fallback }
}

function pulseGuardDataRoot() {
  if (process.platform === 'win32') {
    return process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'FixTemp')
      : path.join(os.homedir(), 'AppData', 'Local', 'FixTemp')
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'FixTemp')
  }
  const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config')
  return path.join(base, 'FixTemp')
}

export function getOverlayConfigPath() {
  return path.join(pulseGuardDataRoot(), 'overlay.json')
}

function normalizeDeviceName(value) {
  return String(value || '')
    .trim()
    .replace(/^\/dev\//i, '')
    .replace(/p?\d+$/, '')
    .toLowerCase()
}

function preferredLabel(value, fallback) {
  const normalized = String(value || '').trim()
  return normalized || fallback || null
}

function mapAudioDevices(audioInfo) {
  const devices = Array.isArray(audioInfo?.devices) ? audioInfo.devices : asArray(audioInfo)
  return devices.map(device => ({
    name: device.name || device.deviceName || device.id || null,
    manufacturer: device.manufacturer || device.vendor || null,
    status: device.status || device.state || null,
    driverVersion: device.driverVersion || null,
    driverDate: device.driverDate || null,
    driverName: device.driver || device.driverName || null
  }))
}

export async function readPortableSystemDetails(metrics) {
  const [
    system,
    osInfo,
    bios,
    baseboard,
    cpu,
    cpuCache,
    memLayout,
    mem,
    graphics,
    diskLayout,
    blockDevices,
    fsSize,
    audio,
    networkInterfaces
  ] = await Promise.all([
    safe(() => si.system(), {}),
    safe(() => si.osInfo(), {}),
    safe(() => si.bios(), {}),
    safe(() => si.baseboard(), {}),
    safe(() => si.cpu(), {}),
    safe(() => si.cpuCache(), {}),
    safe(() => si.memLayout(), []),
    safe(() => si.mem(), {}),
    safe(() => si.graphics(), {}),
    safe(() => si.diskLayout(), []),
    safe(() => si.blockDevices(), []),
    safe(() => si.fsSize(), []),
    safe(() => si.audio(), []),
    safe(() => si.networkInterfaces(), [])
  ])

  const volumesByDisk = new Map()
  for (const device of blockDevices.filter(item => item.mount)) {
    const key = normalizeDeviceName(device.name || device.identifier || device.device)
    const entry = {
      mount: device.mount || null,
      letter: device.mount || null,
      label: device.label || device.name || null,
      filesystem: device.fstype || device.fsType || null,
      freeGb: gb(device.fsAvailable ?? device.available),
      sizeGb: gb(device.size)
    }
    if (!volumesByDisk.has(key)) volumesByDisk.set(key, [])
    volumesByDisk.get(key).push(entry)
  }

  const unassignedVolumes = fsSize
    .filter(volume => volume.mount)
    .map(volume => ({
      mount: volume.mount || null,
      letter: volume.mount || null,
      label: volume.fs || volume.mount || null,
      filesystem: volume.type || volume.fsType || null,
      freeGb: Number.isFinite(volume.size - volume.used) ? round((volume.size - volume.used) / 1024 ** 3, 1) : null,
      sizeGb: gb(volume.size)
    }))

  const disks = diskLayout.map(disk => {
    const key = normalizeDeviceName(disk.device || disk.name || disk.id || disk.serialNum)
    const volumes = volumesByDisk.get(key) || []
    return {
      name: preferredLabel(disk.name, disk.device || disk.type),
      vendor: disk.vendor || disk.manufacturer || null,
      type: disk.type || null,
      interfaceType: disk.interfaceType || disk.busType || null,
      bus: disk.busType || disk.interfaceType || null,
      size: Number.isFinite(disk.size) ? disk.size : null,
      smartStatus: disk.smartStatus || null,
      serialNumber: disk.serialNum || disk.serial || null,
      serialNum: disk.serialNum || disk.serial || null,
      firmwareRevision: disk.firmwareRevision || null,
      pnpDeviceId: disk.device || null,
      scsiPort: null,
      scsiTargetId: null,
      partitions: Array.isArray(volumes) ? volumes.length : null,
      volumes
    }
  })

  if (!disks.length && unassignedVolumes.length) {
    disks.push({
      name: 'Logical storage',
      vendor: null,
      type: null,
      interfaceType: null,
      bus: null,
      size: null,
      smartStatus: null,
      serialNumber: null,
      serialNum: null,
      firmwareRevision: null,
      pnpDeviceId: null,
      scsiPort: null,
      scsiTargetId: null,
      partitions: unassignedVolumes.length,
      volumes: unassignedVolumes
    })
  }

  const modules = memLayout.map(module => ({
    size: Number.isFinite(module.size) ? module.size : null,
    bank: module.bank || module.bankLocator || null,
    slot: module.slot || module.deviceLocator || null,
    type: module.type || module.memoryType || null,
    clockSpeed: Number.isFinite(module.clockSpeed) ? module.clockSpeed : Number.isFinite(module.configuredClockSpeed) ? module.configuredClockSpeed : null,
    speedMax: Number.isFinite(module.clockSpeedMax) ? module.clockSpeedMax : Number.isFinite(module.maxClockSpeed) ? module.maxClockSpeed : null,
    manufacturer: module.manufacturer || null,
    partNum: module.partNum || module.partNumber || null,
    serial: module.serialNum || module.serialNumber || null
  }))

  const summary = {
    maxCapacityGb: null,
    slots: modules.length || null,
    populated: modules.filter(module => Number.isFinite(module.size) && module.size > 0).length || null
  }

  const displays = asArray(graphics?.displays).map(display => ({
    name: display.model || display.deviceName || display.vendor || null,
    status: display.connection || display.main ? 'Connected' : null,
    screenHeight: Number.isFinite(display.currentResY) ? display.currentResY : null,
    screenWidth: Number.isFinite(display.currentResX) ? display.currentResX : null,
    pnpDeviceId: display.deviceName || null
  }))

  const controllers = asArray(graphics?.controllers).map(controller => ({
    vendor: controller.vendor || null,
    model: controller.model || controller.name || null,
    bus: controller.bus || controller.interfaceType || null,
    pnpDeviceId: controller.pciID || controller.subDeviceId || null,
    pciAddress: controller.busAddress || controller.pciID || null,
    location: controller.busAddress || null,
    vram: Number.isFinite(controller.vram) ? controller.vram : Number.isFinite(controller.memoryTotal) ? controller.memoryTotal : null,
    driverVersion: controller.driverVersion || null,
    driverDate: controller.driverDate || null,
    currentMode: controller.currentResX && controller.currentResY ? `${controller.currentResX} x ${controller.currentResY}` : null,
    driverModel: controller.driverModel || null,
    featureLevels: null,
    ddi: null,
    hdr: displays[0]?.name ? 'Display detected' : null,
    dedicatedMemory: null,
    sharedMemory: null,
    monitor: displays[0]?.name || null
  }))

  const details = {
    fetchedAt: new Date().toISOString(),
    limited: false,
    warning: null,
    system: {
      manufacturer: system.manufacturer || null,
      model: system.model || system.sku || null,
      version: system.version || null,
      serial: system.serial || null,
      systemType: system.virtual ? 'Virtual machine' : system.model ? 'Physical system' : null,
      totalMemoryGb: gb(mem.total)
    },
    os: {
      name: [osInfo.distro, osInfo.release].filter(Boolean).join(' ').trim() || `${os.type()} ${os.release()}`,
      version: osInfo.release || null,
      build: osInfo.build || null,
      architecture: osInfo.arch || process.arch,
      bootDevice: osInfo.kernel || null,
      installDate: null,
      lastBoot: osInfo.lastBoot || null,
      pageFile: null,
      language: Intl.DateTimeFormat().resolvedOptions().locale || null
    },
    directx: process.platform === 'linux'
      ? { version: 'Vulkan / OpenGL', dxDiagVersion: null, databaseVersion: null, miracast: null }
      : { version: null, dxDiagVersion: null, databaseVersion: null, miracast: null },
    bios: {
      vendor: bios.vendor || null,
      version: bios.version || null,
      releaseDate: bios.releaseDate || null
    },
    baseboard: {
      manufacturer: baseboard.manufacturer || null,
      model: baseboard.model || baseboard.name || null,
      version: baseboard.version || null,
      serial: baseboard.serial || null
    },
    cpu: {
      manufacturer: cpu.manufacturer || null,
      brand: cpu.brand || metrics.cpu.model || null,
      vendor: cpu.vendor || null,
      socket: cpu.socket || null,
      architecture: osInfo.arch || process.arch,
      speed: Number.isFinite(Number(cpu.speed)) ? Number(cpu.speed) : null,
      speedMax: Number.isFinite(Number(cpu.speedMax)) ? Number(cpu.speedMax) : null,
      cores: cpu.cores || metrics.cpu.cores,
      physicalCores: cpu.physicalCores || metrics.cpu.physicalCores,
      processors: cpu.processors || 1,
      l2CacheKb: Number.isFinite(cpuCache?.l2) ? cpuCache.l2 / 1024 : null,
      l3CacheKb: Number.isFinite(cpuCache?.l3) ? cpuCache.l3 / 1024 : null,
      stepping: cpu.stepping || null,
      family: cpu.family || null,
      virtualizationFirmwareEnabled: null,
      estimatedTdp: metrics.cpu.tdp
    },
    graphics: { controllers },
    memory: modules,
    memorySummary: summary,
    disks,
    audio: mapAudioDevices(audio),
    network: networkInterfaces.map(adapter => ({
      iface: adapter.iface || adapter.ifaceName || null,
      type: adapter.type || null,
      speed: Number.isFinite(adapter.speed) ? adapter.speed : null,
      manufacturer: adapter.vendor || null,
      model: adapter.ifaceName || adapter.iface || null,
      mac: adapter.mac || null,
      pnpDeviceId: adapter.iface || null
    })),
    monitors: displays
  }

  const hasInventory = details.cpu.brand || details.system.model || details.memory.length || details.disks.length || details.graphics.controllers.length
  if (!hasInventory) {
    details.limited = true
    details.warning = 'El sistema operativo no expuso el inventario completo.'
  }
  return details
}
