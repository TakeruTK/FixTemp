'use strict'

const express = require('express')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')

// ── Config ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3500
const ADMIN_USER = process.env.ADMIN_USER || 'Admin'
const ADMIN_PASS = process.env.ADMIN_PASS || 'Admin123'
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'scores.json')

// ── JSON "base de datos" ──────────────────────────────────────────────────────
function loadDb() {
  try {
    if (fs.existsSync(DB_PATH)) {
      return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'))
    }
  } catch {}
  return { records: [], nextId: 1 }
}

function saveDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8')
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function basicAuth(req, res, next) {
  const auth = req.headers.authorization || ''
  const [scheme, token] = auth.split(' ')
  if (scheme !== 'Basic' || !token) {
    return res.status(401).set('WWW-Authenticate', 'Basic realm="PulseGuard Admin"').json({ error: 'Unauthorized' })
  }
  const [user, pass] = Buffer.from(token, 'base64').toString().split(':')
  if (user !== ADMIN_USER || pass !== ADMIN_PASS) return res.status(403).json({ error: 'Forbidden' })
  next()
}

function getStats(records) {
  if (!records.length) return { total: 0, avg: null, max: null, min: null }
  const scores = records.map(r => r.score)
  return {
    total: records.length,
    avg: scores.reduce((a, b) => a + b, 0) / scores.length,
    max: Math.max(...scores),
    min: Math.min(...scores)
  }
}

function addRanks(records) {
  const sorted = [...records].sort((a, b) => b.score - a.score)
  const rankMap = new Map()
  sorted.forEach((r, i) => rankMap.set(r.id, i + 1))
  return records.map(r => ({ ...r, rank: rankMap.get(r.id) }))
}

// ── App ───────────────────────────────────────────────────────────────────────
const app = express()
app.use(express.json())
app.use(express.static(path.join(__dirname, 'public')))

// CORS para la app Electron
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

// ── POST /api/submit ──────────────────────────────────────────────────────────
app.post('/api/submit', (req, res) => {
  const d = req.body
  if (!d || typeof d.score !== 'number') return res.status(400).json({ error: 'score requerido' })

  const db = loadDb()
  const machineId = d.machineId || crypto.createHash('sha256')
    .update(`${d.hostname || '?'}:${d.cpuModel || '?'}`).digest('hex').slice(0, 16)

  const record = {
    id: db.nextId++,
    machine_id: machineId,
    hostname: d.hostname || null,
    score: Math.round(d.score * 10) / 10,
    coverage: d.coverage || null,
    cpu_model: d.cpuModel || null,
    cpu_score: d.cpuScore || null,
    gpu_model: d.gpuModel || null,
    gpu_fps: d.gpuFps || null,
    ram_gb: d.ramGb || null,
    disk_read: d.diskReadMbps || null,
    disk_write: d.diskWriteMbps || null,
    cpu_temp: d.cpuPeakTemp || null,
    gpu_temp: d.gpuPeakTemp || null,
    cpu_power: d.cpuPeakPower || null,
    gpu_power: d.gpuPeakPower || null,
    os_name: d.osName || null,
    notes: d.notes || [],
    tested_at: d.testedAt || Date.now(),
    created_at: Date.now()
  }

  db.records.push(record)
  saveDb(db)

  // Calcular rank y percentil
  const sorted = db.records.slice().sort((a, b) => b.score - a.score)
  const rank = sorted.findIndex(r => r.id === record.id) + 1
  const total = db.records.length
  const below = db.records.filter(r => r.score <= record.score).length
  const percentile = Math.round((below / total) * 100)

  res.json({ ok: true, machineId, rank, total, percentile })
})

// ── GET /api/rankings ──────────────────────────────────────────────────────────
app.get('/api/rankings', (req, res) => {
  const db = loadDb()
  const limit = Math.min(Number(req.query.limit) || 50, 200)
  const offset = Number(req.query.offset) || 0

  const sorted = db.records.slice().sort((a, b) => b.score - a.score)
  const ranked = sorted.map((r, i) => ({
    rank: i + 1,
    score: r.score,
    coverage: r.coverage,
    cpu_model: r.cpu_model,
    gpu_model: r.gpu_model,
    ram_gb: r.ram_gb,
    disk_read: r.disk_read,
    disk_write: r.disk_write,
    os_name: r.os_name,
    tested_at: r.tested_at
  }))

  const stats = getStats(db.records)
  res.json({ total: db.records.length, stats, rows: ranked.slice(offset, offset + limit) })
})

// ── GET /api/rankings/machine/:machineId ──────────────────────────────────────
app.get('/api/rankings/machine/:machineId', (req, res) => {
  const db = loadDb()
  const rows = db.records.filter(r => r.machine_id === req.params.machineId)
    .sort((a, b) => b.tested_at - a.tested_at).slice(0, 10)
  res.json({ rows })
})

// ── GET /api/admin/scores ─────────────────────────────────────────────────────
app.get('/api/admin/scores', basicAuth, (req, res) => {
  const db = loadDb()
  const limit = Math.min(Number(req.query.limit) || 100, 1000)
  const offset = Number(req.query.offset) || 0
  const q = req.query.q ? req.query.q.toLowerCase() : null

  const sorted = db.records.slice().sort((a, b) => b.tested_at - a.tested_at)
  const rankMap = new Map()
  const byScore = db.records.slice().sort((a, b) => b.score - a.score)
  byScore.forEach((r, i) => rankMap.set(r.id, i + 1))

  const filtered = q
    ? sorted.filter(r => (r.hostname || '').toLowerCase().includes(q) || (r.cpu_model || '').toLowerCase().includes(q))
    : sorted

  const rows = filtered.slice(offset, offset + limit).map(r => ({ ...r, rank: rankMap.get(r.id) }))
  res.json({ total: filtered.length, rows })
})

// ── DELETE /api/admin/scores/:id ──────────────────────────────────────────────
app.delete('/api/admin/scores/:id', basicAuth, (req, res) => {
  const db = loadDb()
  const id = Number(req.params.id)
  db.records = db.records.filter(r => r.id !== id)
  saveDb(db)
  res.json({ ok: true })
})

// ── GET /api/stats ────────────────────────────────────────────────────────────
app.get('/api/stats', (req, res) => {
  const db = loadDb()
  const stats = getStats(db.records)
  const byOs = {}
  const byCpu = {}
  db.records.forEach(r => {
    if (r.os_name) byOs[r.os_name] = (byOs[r.os_name] || 0) + 1
    if (r.cpu_model) {
      if (!byCpu[r.cpu_model]) byCpu[r.cpu_model] = { sum: 0, count: 0 }
      byCpu[r.cpu_model].sum += r.score
      byCpu[r.cpu_model].count++
    }
  })
  res.json({
    stats,
    byOs: Object.entries(byOs).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([os_name, count]) => ({ os_name, count })),
    byCpu: Object.entries(byCpu).sort((a, b) => b[1].sum / b[1].count - a[1].sum / a[1].count).slice(0, 10).map(([cpu_model, v]) => ({ cpu_model, avg_score: v.sum / v.count, count: v.count }))
  })
})

// ── Actualizaciones ──────────────────────────────────────────────────────────
const UPDATES_DIR = path.join(__dirname, 'updates')
if (!fs.existsSync(UPDATES_DIR)) fs.mkdirSync(UPDATES_DIR, { recursive: true })

// Sirve archivos de instalador: PUT el .exe en ranking-server/updates/
app.use('/updates/files', express.static(UPDATES_DIR))

// Manifiesto de última versión
// Para publicar una nueva versión, crea ranking-server/updates/latest.json:
// { "version": "0.6.1", "downloadUrl": "http://TU_IP:3500/updates/files/PulseGuard-Setup-v0.6.1.exe", "changelog": "..." }
app.get('/updates/latest', (_req, res) => {
  const manifestPath = path.join(UPDATES_DIR, 'latest.json')
  if (!fs.existsSync(manifestPath)) {
    return res.status(404).json({ error: 'No hay actualización publicada aún.' })
  }
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    res.json(manifest)
  } catch {
    res.status(500).json({ error: 'Manifiesto corrupto.' })
  }
})

// ── Admin páginas ─────────────────────────────────────────────────────────────
app.get('/admin', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'))
})
app.get('/admin-panel', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'))
})

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`PulseGuard Ranking Server → http://localhost:${PORT}`)
  console.log(`Admin → http://localhost:${PORT}/admin  (${ADMIN_USER} / ${ADMIN_PASS})`)
  console.log(`Datos → ${DB_PATH}`)
})
