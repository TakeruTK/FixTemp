import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import path from 'node:path'

const manifest = JSON.parse(await fs.readFile('dist/manifest.webmanifest', 'utf8'))
const index = await fs.readFile('dist/index.html', 'utf8')
const worker = await fs.readFile('dist/sw.js', 'utf8')

assert.equal(manifest.display, 'standalone')
assert.ok(manifest.icons.some(icon => icon.sizes === '512x512' && icon.purpose.includes('maskable')))
assert.ok(index.includes('name="viewport"'))
assert.ok(index.includes('rel="manifest"'))
assert.ok(worker.includes("startsWith('/api/')"), 'El service worker no debe almacenar telemetría')
assert.ok(worker.includes("caches.match('/')"), 'Debe existir una pantalla offline')

for (const icon of manifest.icons) {
  const iconPath = path.join('dist', icon.src.replace(/^\//, ''))
  const stats = await fs.stat(iconPath)
  assert.ok(stats.size > 1000, `Icono inválido: ${iconPath}`)
}

const cssFile = (await fs.readdir('dist/assets')).find(file => file.endsWith('.css'))
const css = await fs.readFile(path.join('dist/assets', cssFile), 'utf8')
assert.ok(css.includes('@media(max-width:760px)'), 'Falta el breakpoint para tablet/móvil')
assert.ok(css.includes('.health-page'), 'Falta la interfaz de salud móvil')

console.log(JSON.stringify({ passed: true, installable: true, offlineShell: true, apiExcludedFromCache: true, responsiveBreakpoint: 760, iconBytes: (await fs.stat('dist/icon.png')).size }, null, 2))
