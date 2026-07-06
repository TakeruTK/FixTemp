import { copyFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const output = path.join(root, 'publish', 'win-x64')
await mkdir(output, { recursive: true })
for (const [source, target] of [
  ['install-sensors.ps1', 'install-sensors.ps1'],
  ['vendor/PawnIO_setup.exe', 'PawnIO_setup.exe'],
  ['vendor/LibreHardwareMonitor-LICENSE.txt', 'LibreHardwareMonitor-LICENSE.txt'],
  ['vendor/THIRD-PARTY-NOTICES.txt', 'THIRD-PARTY-NOTICES.txt']
]) await copyFile(path.join(root, source), path.join(output, target))
