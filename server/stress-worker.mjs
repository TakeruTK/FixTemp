import { parentPort, workerData } from 'node:worker_threads'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

let running = true
const stats = { operations: 0, bytesProcessed: 0, errors: 0, verified: true }
parentPort.on('message', (message) => { if (message === 'stop') running = false })

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const report = () => parentPort.postMessage({ type: 'progress', stats })
const reporter = setInterval(report, 500)
reporter.unref()

// Mixed floating-point and integer work. The evolving checksum prevents V8 from
// eliminating the workload and gives every logical CPU a sustained, real load.
async function cpuStress() {
  const duty = Math.max(0.1, Math.min(1, workerData.intensity / 100))
  let checksum = (workerData.workerIndex + 1) * 2654435761
  while (running) {
    const cycleStart = performance.now()
    while (running && performance.now() - cycleStart < 100 * duty) {
      for (let i = 1; i <= 12000; i++) {
        checksum = Math.imul(checksum ^ i, 1664525) + 1013904223
        checksum ^= Math.trunc(Math.sqrt((checksum >>> 0) + i) * 1000)
      }
      stats.operations += 12000
    }
    if (!Number.isFinite(checksum)) { stats.errors++; stats.verified = false }
    await sleep(Math.max(1, 100 * (1 - duty)))
  }
}

// Allocates physical pages, writes deterministic patterns and verifies sampled
// bytes on every pass. This detects corruption instead of merely reserving RAM.
async function memoryStress() {
  const chunks = []
  const chunkSize = 8 * 1024 * 1024
  const targetMb = Math.max(64, Math.min(workerData.targetMb || 512, 4096))
  try {
    while (running && chunks.length * 8 < targetMb) {
      const seed = (chunks.length * 37 + 0x5a) & 0xff
      const chunk = Buffer.allocUnsafe(chunkSize)
      chunk.fill(seed)
      chunks.push({ chunk, seed })
      stats.bytesProcessed += chunk.length
      await sleep(15)
    }
    while (running) {
      for (const item of chunks) {
        for (let offset = 0; offset < item.chunk.length; offset += 4096) {
          if (item.chunk[offset] !== item.seed) { stats.errors++; stats.verified = false }
          item.chunk[offset] = item.seed ^ 0xff
          item.chunk[offset] = item.seed
          stats.bytesProcessed += 4096
          stats.operations++
        }
        if (!running) break
      }
      await sleep(Math.max(1, 105 - workerData.intensity))
    }
  } finally { chunks.length = 0 }
}

// Uses synchronous-to-disk writes plus reads and byte verification. The file is
// always removed, including cancellation and worker errors.
async function diskStress() {
  const filename = path.join(os.tmpdir(), `pulseguard-stress-${process.pid}-${workerData.workerIndex || 0}.tmp`)
  const blockSize = 4 * 1024 * 1024
  const block = Buffer.alloc(blockSize, 0xa5)
  const blocksPerPass = Math.max(2, Math.ceil(24 * workerData.intensity / 100))
  try {
    while (running) {
      const handle = await fs.open(filename, 'w')
      try {
        for (let i = 0; i < blocksPerPass && running; i++) {
          await handle.write(block)
          stats.bytesProcessed += block.length
          stats.operations++
        }
        await handle.sync()
      } finally { await handle.close() }
      if (!running) break
      const readBack = await fs.readFile(filename)
      stats.bytesProcessed += readBack.length
      for (let offset = 0; offset < readBack.length; offset += 64 * 1024) {
        if (readBack[offset] !== 0xa5) { stats.errors++; stats.verified = false }
      }
      await fs.rm(filename, { force: true })
      if (workerData.intensity < 100) await sleep(Math.max(1, 105 - workerData.intensity))
    }
  } finally { await fs.rm(filename, { force: true }).catch(() => {}) }
}

const task = workerData.type === 'memory' ? memoryStress() : workerData.type === 'disk' ? diskStress() : cpuStress()
task.then(() => { clearInterval(reporter); report(); parentPort.postMessage('done') })
  .catch((error) => { stats.errors++; stats.verified = false; parentPort.postMessage({ error: error.message }) })
