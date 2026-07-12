// xlsx-export.mjs - Pure Node.js XLSX generator (no external deps)
// Generates a complete .xlsx workbook with multiple sheets and embedded charts.
// Uses only built-in node:zlib for ZIP deflate compression.

import { deflateRawSync } from 'node:zlib'

// --- CRC32 --------------------------------------------------------------------

const CRC_TABLE = new Uint32Array(256)
for (let i = 0; i < 256; i++) {
 let c = i
 for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
 CRC_TABLE[i] = c
}
function crc32(buf) {
 let c = 0xFFFFFFFF
 for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8)
 return (c ^ 0xFFFFFFFF) >>> 0
}

// --- Binary helpers ----------------------------------------------------------

function w16(b, o, v) { b[o] = v & 0xFF; b[o + 1] = (v >> 8) & 0xFF }
function w32(b, o, v) { b[o] = v & 0xFF; b[o + 1] = (v >> 8) & 0xFF; b[o + 2] = (v >> 16) & 0xFF; b[o + 3] = (v >>> 24) & 0xFF }

// --- ZIP writer ---------------------------------------------------------------
// files: Array<{ name: string, data: Buffer|string }>

function buildZip(files) {
 const parts = []
 const dir = []
 let pos = 0

 for (const { name, data } of files) {
 const nameBuf = Buffer.from(name, 'utf8')
 const raw = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8')
 const deflated = deflateRawSync(raw, { level: 6 })
 const body = deflated.length < raw.length ? deflated : raw
 const method = deflated.length < raw.length ? 8 : 0
 const crc = crc32(raw)

 const lh = Buffer.alloc(30 + nameBuf.length)
 w32(lh, 0, 0x04034B50); w16(lh, 4, 20); w16(lh, 6, 0); w16(lh, 8, method)
 w16(lh, 10, 0); w16(lh, 12, 0)
 w32(lh, 14, crc); w32(lh, 18, body.length); w32(lh, 22, raw.length)
 w16(lh, 26, nameBuf.length); w16(lh, 28, 0)
 nameBuf.copy(lh, 30)

 dir.push({ nameBuf, crc, method, cs: body.length, us: raw.length, pos })
 parts.push(lh, body)
 pos += lh.length + body.length
 }

 const cdStart = pos
 const cdParts = dir.map(e => {
 const cd = Buffer.alloc(46 + e.nameBuf.length)
 w32(cd, 0, 0x02014B50); w16(cd, 4, 20); w16(cd, 6, 20); w16(cd, 8, 0)
 w16(cd, 10, e.method); w16(cd, 12, 0); w16(cd, 14, 0)
 w32(cd, 16, e.crc); w32(cd, 20, e.cs); w32(cd, 24, e.us)
 w16(cd, 28, e.nameBuf.length); w16(cd, 30, 0); w16(cd, 32, 0)
 w16(cd, 34, 0); w16(cd, 36, 0); w32(cd, 38, 0); w32(cd, 42, e.pos)
 e.nameBuf.copy(cd, 46)
 return cd
 })
 const cdSize = cdParts.reduce((s, p) => s + p.length, 0)

 const eocd = Buffer.alloc(22)
 w32(eocd, 0, 0x06054B50); w16(eocd, 4, 0); w16(eocd, 6, 0)
 w16(eocd, 8, dir.length); w16(eocd, 10, dir.length)
 w32(eocd, 12, cdSize); w32(eocd, 16, cdStart); w16(eocd, 20, 0)

 return Buffer.concat([...parts, ...cdParts, eocd])
}

// --- XML helpers -------------------------------------------------------------

const xmlEsc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const v = val => val === null || val === undefined ? '' : String(val)

// --- Shared strings ----------------------------------------------------------

class SharedStrings {
 constructor() { this.map = new Map(); this.list = [] }
 idx(s) {
 const key = String(s)
 if (!this.map.has(key)) { this.map.set(key, this.list.length); this.list.push(key) }
 return this.map.get(key)
 }
 xml() {
 const items = this.list.map(s => `<si><t xml:space="preserve">${xmlEsc(s)}</t></si>`).join('')
 return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
 `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${this.list.length}" uniqueCount="${this.list.length}">${items}</sst>`
 }
}

// --- Styles ------------------------------------------------------------------
// Style indices (must match styles.xml below):
// 0 = normal
// 1 = bold header (dark bg, white text)
// 2 = section header (medium bg)
// 3 = number (1 decimal)
// 4 = number (0 decimal, integer)
// 5 = bold normal

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
 <numFmts count="2">
 <numFmt numFmtId="164" formatCode="0.0"/>
 <numFmt numFmtId="165" formatCode="0"/>
 </numFmts>
 <fonts count="4">
 <font><sz val="10"/><color rgb="FF111827"/><name val="Calibri"/></font>
 <font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
 <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
 <font><b/><sz val="10"/><color rgb="FF1E293B"/><name val="Calibri"/></font>
 </fonts>
 <fills count="5">
 <fill><patternFill patternType="none"/></fill>
 <fill><patternFill patternType="gray125"/></fill>
 <fill><patternFill patternType="solid"><fgColor rgb="FF334155"/></patternFill></fill>
 <fill><patternFill patternType="solid"><fgColor rgb="FF1E3A5F"/></patternFill></fill>
 <fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F9"/></patternFill></fill>
 </fills>
 <borders count="2">
 <border><left/><right/><top/><bottom/><diagonal/></border>
 <border><left style="thin"><color rgb="FFD1D5DB"/></left><right style="thin"><color rgb="FFD1D5DB"/></right><top style="thin"><color rgb="FFD1D5DB"/></top><bottom style="thin"><color rgb="FFD1D5DB"/></bottom><diagonal/></border>
 </borders>
 <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
 <cellXfs count="6">
 <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
 <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
 <xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
 <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1"/>
 <xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1"/>
 <xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
 </cellXfs>
</styleSheet>`

// --- Cell builder -------------------------------------------------------------

function cell(col, row, value, ss, styleIdx = 0) {
 const ref = `${col}${row}`
 if (value === null || value === undefined || value === '') {
 return `<c r="${ref}" s="${styleIdx}"><v></v></c>`
 }
 if (typeof value === 'number' && isFinite(value)) {
 return `<c r="${ref}" t="n" s="${styleIdx}"><v>${value}</v></c>`
 }
 const str = String(value)
 const idx = ss.idx(str)
 return `<c r="${ref}" t="s" s="${styleIdx}"><v>${idx}</v></c>`
}

const COLS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
function colLetter(i) { return i < 26 ? COLS[i] : COLS[Math.floor(i / 26) - 1] + COLS[i % 26] }

function buildRow(rowNum, values, ss, styles = []) {
 const cells = values.map((val, i) => cell(colLetter(i), rowNum, val, ss, styles[i] ?? 0))
 return `<row r="${rowNum}">${cells.join('')}</row>`
}

function headerRow(rowNum, headers, ss) {
 return buildRow(rowNum, headers, ss, headers.map(() => 1))
}

function sectionRow(rowNum, label, ss) {
 return buildRow(rowNum, [label], ss, [2])
}

function kv(rowNum, key, value, ss) {
 return buildRow(rowNum, [key, v(value)], ss, [5, 0])
}

// --- Worksheet XML builder ----------------------------------------------------

function sheet(rows, colWidths = [], drawingRel = null) {
 const cols = colWidths.length
 ? `<cols>${colWidths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
 : ''
 const drawing = drawingRel ? `<drawing r:id="${drawingRel}"/>` : ''
 return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
 `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"` +
 ` xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
 `<sheetView workbookViewId="0" showGridLines="1"/>` +
 cols +
 `<sheetData>${rows.join('')}</sheetData>` +
 drawing +
 `</worksheet>`
}

// --- Chart XML ----------------------------------------------------------------

const CHART_COLORS = ['4472C4', 'ED7D31', 'A9D18E', 'FF0000', 'FFC000']

function seriesXml(idx, title, titleRef, catRef, valRef, rowCount, color) {
 // Build minimal numCache for cat (sequential 0-based numbers)
 const catPts = Array.from({ length: rowCount }, (_, i) => `<c:pt idx="${i}"><c:v>${i}</c:v></c:pt>`).join('')
 return `<c:ser>
 <c:idx val="${idx}"/><c:order val="${idx}"/>
 <c:tx><c:strRef><c:f>${titleRef}</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${xmlEsc(title)}</c:v></c:pt></c:strCache></c:strRef></c:tx>
 <c:spPr><a:ln><a:solidFill><a:srgbClr val="${color}"/></a:solidFill></a:ln></c:spPr>
 <c:marker><c:symbol val="none"/></c:marker>
 <c:smooth val="0"/>
 <c:cat><c:numRef><c:f>${catRef}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${rowCount}"/>${catPts}</c:numCache></c:numRef></c:cat>
 <c:val><c:numRef><c:f>${valRef}</c:f><c:numCache><c:formatCode>0.0</c:formatCode><c:ptCount val="${rowCount}"/></c:numCache></c:numRef></c:val>
</c:ser>`
}

function lineChartXml(sheetName, dataRowStart, dataRowEnd, catCol, series) {
 // series: [{title, titleRef, valCol, color}]
 const rowCount = dataRowEnd - dataRowStart + 1
 const catRef = `'${sheetName}'!$${catCol}$${dataRowStart}:$${catCol}$${dataRowEnd}`

 const seriesXmls = series.map((s, i) => {
 const valRef = `'${sheetName}'!$${s.valCol}$${dataRowStart}:$${s.valCol}$${dataRowEnd}`
 return seriesXml(i, s.title, `'${sheetName}'!$${s.valCol}$${dataRowStart - 1}`, catRef, valRef, rowCount, s.color || CHART_COLORS[i % CHART_COLORS.length])
 }).join('')

 return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"
 xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
 <c:lang val="es-ES"/>
 <c:style val="2"/>
 <c:chart>
 <c:autoTitleDeleted val="1"/>
 <c:plotArea>
 <c:layout/>
 <c:lineChart>
 <c:barDir val="col"/>
 <c:grouping val="standard"/>
 <c:varyColors val="0"/>
 ${seriesXmls}
 <c:marker><c:symbol val="none"/></c:marker>
 <c:smooth val="0"/>
 <c:axId val="100"/><c:axId val="101"/>
 </c:lineChart>
 <c:catAx>
 <c:axId val="100"/><c:scaling><c:orientation val="minMax"/></c:scaling>
 <c:delete val="0"/><c:axPos val="b"/>
 <c:numFmt formatCode="General" sourceLinked="0"/>
 <c:tickLblPos val="nextTo"/>
 <c:crossAx val="101"/>
 <c:auto val="1"/>
 <c:lblAlgn val="ctr"/>
 <c:lblOffset val="100"/>
 <c:noMultiLvlLbl val="0"/>
 </c:catAx>
 <c:valAx>
 <c:axId val="101"/><c:scaling><c:orientation val="minMax"/></c:scaling>
 <c:delete val="0"/><c:axPos val="l"/>
 <c:numFmt formatCode="0.0" sourceLinked="0"/>
 <c:tickLblPos val="nextTo"/>
 <c:crossAx val="100"/>
 </c:valAx>
 </c:plotArea>
 <c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend>
 <c:plotVisOnly val="1"/>
 <c:dispBlanksAs val="gap"/>
 </c:chart>
 <c:spPr>
 <a:solidFill><a:srgbClr val="0F172A"/></a:solidFill>
 <a:ln><a:solidFill><a:srgbClr val="1E2D45"/></a:solidFill></a:ln>
 </c:spPr>
</c:chartSpace>`
}

function drawingXml(chartRelId, fromRow, toRow, fromCol = 0, toCol = 9) {
 return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
 xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
 xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart">
 <xdr:twoCellAnchor moveWithCells="0" sizeWithCells="0">
 <xdr:from><xdr:col>${fromCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${fromRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
 <xdr:to><xdr:col>${toCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${toRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
 <xdr:graphicFrame macro="">
 <xdr:nvGraphicFramePr>
 <xdr:cNvPr id="1" name="Chart 1"/>
 <xdr:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></xdr:cNvGraphicFramePr>
 </xdr:nvGraphicFramePr>
 <xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>
 <a:graphic>
 <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">
 <c:chart r:id="${chartRelId}"/>
 </a:graphicData>
 </a:graphic>
 </xdr:graphicFrame>
 <xdr:clientData/>
 </xdr:twoCellAnchor>
</xdr:wsDr>`
}

// --- Relationship XML helpers -------------------------------------------------

function relsXml(rels) {
 const items = rels.map(r => `<Relationship Id="${r.id}" Type="${r.type}" Target="${r.target}"/>`).join('')
 return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
 `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items}</Relationships>`
}

const RT = {
 sheet: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet',
 styles: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles',
 sharedStrings: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings',
 drawing: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing',
 chart: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart',
 officeDocument: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument',
}

// --- Main report builder ------------------------------------------------------

export function buildExcelReport(report) {
 const ss = new SharedStrings()
 const sys = report.system || {}
 const cpu = sys.cpu || {}
 const gpu = report.metrics?.gpu || {}
 const mem = report.metrics?.memory || {}
 const hardware = report.metrics?.hardware || {}
 const history = report.metrics?.history || []
 const stress = report.metrics?.stress || null
 const gpuControllers = sys.graphics?.controllers || []
 const ramModules = sys.memory || []
 const disks = sys.disks || []
 const audio = sys.audio || []
 const network = sys.network || []
 const monitors = sys.monitors || []
 const board = sys.baseboard || {}
 const bios = sys.bios || {}
 const os = sys.os || {}
 const directx = sys.directx || {}
 const memSum = sys.memorySummary || {}

 const fmt = val => (val === null || val === undefined) ? '' : val
 const fmtDate = ts => ts ? new Date(ts).toLocaleString('es-ES') : ''
 const fmtNum = (n, d = 1) => (n === null || n === undefined || !isFinite(n)) ? '' : Number(n).toFixed(d)
 const gb = bytes => bytes ? (bytes / 1073741824).toFixed(1) + ' GB' : ''

 // -- Sheet 1: Resumen --------------------------------------------------------

 const s1rows = []
 let r = 1
 s1rows.push(buildRow(r++, ['INFORME DE EQUIPO FIXTEMP'], ss, [1]))
 s1rows.push(buildRow(r++, ['Generado el', fmtDate(Date.now())], ss, [5, 0]))
 s1rows.push(buildRow(r++, [], ss))
 s1rows.push(sectionRow(r++, 'IDENTIFICACION DEL EQUIPO', ss))
 s1rows.push(kv(r++, 'Nombre del equipo', hardware.hostname, ss))
 s1rows.push(kv(r++, 'Fabricante', fmt(sys.system?.manufacturer), ss))
 s1rows.push(kv(r++, 'Modelo del sistema', fmt(sys.system?.model), ss))
 s1rows.push(kv(r++, 'Tipo de sistema', fmt(sys.system?.systemType), ss))
 s1rows.push(kv(r++, 'Numero de serie', fmt(sys.system?.serial), ss))
 s1rows.push(buildRow(r++, [], ss))
 s1rows.push(sectionRow(r++, 'SISTEMA OPERATIVO', ss))
 s1rows.push(kv(r++, 'Sistema operativo', fmt(os.name), ss))
 s1rows.push(kv(r++, 'Version', `${fmt(os.version)} Build ${fmt(os.build)}`.trim(), ss))
 s1rows.push(kv(r++, 'Arquitectura', fmt(os.architecture), ss))
 s1rows.push(kv(r++, 'Instalado el', fmt(os.installDate), ss))
 s1rows.push(kv(r++, 'Ultimo arranque', fmt(os.lastBoot), ss))
 s1rows.push(kv(r++, 'Idioma', fmt(os.language), ss))
 s1rows.push(kv(r++, 'Archivo de paginacion', fmt(os.pageFile), ss))
 s1rows.push(buildRow(r++, [], ss))
 s1rows.push(sectionRow(r++, 'COMPONENTES PRINCIPALES', ss))
 s1rows.push(kv(r++, 'CPU', fmt(cpu.brand), ss))
 s1rows.push(kv(r++, 'Nucleos / Hilos', `${fmt(cpu.physicalCores)} / ${fmt(cpu.cores)}`, ss))
 s1rows.push(kv(r++, 'Reloj maximo', cpu.speedMax ? `${cpu.speedMax} GHz` : '', ss))
 s1rows.push(kv(r++, 'GPU principal', gpuControllers[0]?.model || fmt(gpu.model), ss))
 s1rows.push(kv(r++, 'VRAM', gpuControllers[0]?.vram ? `${gpuControllers[0].vram} MB` : (gpu.memoryTotal ? `${gpu.memoryTotal} MB` : ''), ss))
 s1rows.push(kv(r++, 'RAM total', sys.system?.totalMemoryGb ? `${sys.system.totalMemoryGb} GB` : (mem.total ? `${mem.total} GB` : ''), ss))
 s1rows.push(kv(r++, 'Placa madre', `${fmt(board.manufacturer)} ${fmt(board.model)}`.trim(), ss))
 s1rows.push(kv(r++, 'BIOS', `${fmt(bios.vendor)} ${fmt(bios.version)}`.trim(), ss))
 s1rows.push(kv(r++, 'Fecha BIOS', fmt(bios.releaseDate), ss))
 s1rows.push(kv(r++, 'DirectX', fmt(directx.version), ss))
 s1rows.push(kv(r++, 'Miracast', fmt(directx.miracast), ss))
 s1rows.push(buildRow(r++, [], ss))
 s1rows.push(sectionRow(r++, 'SENSORES EN TIEMPO REAL', ss))
 s1rows.push(kv(r++, 'CPU Carga', gpu ? `${report.metrics?.cpu?.load ?? ''}%` : '', ss))
 s1rows.push(kv(r++, 'CPU Temperatura', report.metrics?.cpu?.temperature !== null ? `${report.metrics?.cpu?.temperature ?? ''} C` : 'No disponible', ss))
 s1rows.push(kv(r++, 'CPU Reloj', report.metrics?.cpu?.clock ? `${report.metrics.cpu.clock} MHz` : '', ss))
 s1rows.push(kv(r++, 'GPU Carga', `${gpu.load ?? ''}%`, ss))
 s1rows.push(kv(r++, 'GPU Temperatura', gpu.temperature !== null ? `${gpu.temperature ?? ''} C` : 'No disponible', ss))
 s1rows.push(kv(r++, 'GPU Reloj', `${gpu.clock ?? ''} MHz`, ss))
 s1rows.push(kv(r++, 'RAM Usada', `${mem.used ?? ''} / ${mem.total ?? ''} GB`, ss))

 const sheet1 = sheet(s1rows, [32, 48], null)

 // -- Sheet 2: Procesador -----------------------------------------------------

 const s2rows = []
 r = 1
 s2rows.push(buildRow(r++, ['PROCESADOR'], ss, [1]))
 s2rows.push(buildRow(r++, [], ss))
 s2rows.push(kv(r++, 'Modelo', fmt(cpu.brand), ss))
 s2rows.push(kv(r++, 'Fabricante', fmt(cpu.manufacturer || cpu.vendor), ss))
 s2rows.push(kv(r++, 'Socket', fmt(cpu.socket), ss))
 s2rows.push(kv(r++, 'Arquitectura', fmt(cpu.architecture), ss))
 s2rows.push(kv(r++, 'Nucleos fisicos', fmt(cpu.physicalCores), ss))
 s2rows.push(kv(r++, 'Hilos logicos', fmt(cpu.cores), ss))
 s2rows.push(kv(r++, 'Procesadores fisicos', fmt(cpu.processors), ss))
 s2rows.push(kv(r++, 'Reloj base', cpu.speed ? `${cpu.speed} GHz` : '', ss))
 s2rows.push(kv(r++, 'Reloj maximo', cpu.speedMax ? `${cpu.speedMax} GHz` : '', ss))
 s2rows.push(kv(r++, 'Cache L2', cpu.l2CacheKb ? `${Number(cpu.l2CacheKb).toLocaleString()} KB` : '', ss))
 s2rows.push(kv(r++, 'Cache L3', cpu.l3CacheKb ? `${Number(cpu.l3CacheKb).toLocaleString()} KB` : '', ss))
 s2rows.push(kv(r++, 'Stepping', fmt(cpu.stepping), ss))
 s2rows.push(kv(r++, 'Virtualizacion', cpu.virtualizationFirmwareEnabled ? 'Habilitada' : 'Deshabilitada', ss))
 s2rows.push(kv(r++, 'TDP referencia', cpu.estimatedTdp ? `${cpu.estimatedTdp} W` : '', ss))

 const sheet2 = sheet(s2rows, [32, 48])

 // -- Sheet 3: GPU -------------------------------------------------------------

 const s3rows = []
 r = 1
 const gpuHeaders = ['GPU#', 'Modelo', 'Fabricante', 'VRAM (MB)', 'Bus', 'Driver', 'Modo actual', 'WDDM', 'DDI / Feature Levels', 'HDR', 'Monitor']
 s3rows.push(headerRow(r++, gpuHeaders, ss))
 for (let i = 0; i < gpuControllers.length; i++) {
 const g = gpuControllers[i]
 const styles = new Array(gpuHeaders.length).fill(0)
 s3rows.push(buildRow(r++, [i + 1, fmt(g.model), fmt(g.vendor), g.vram ?? '', fmt(g.bus), fmt(g.driverVersion), fmt(g.currentMode), fmt(g.driverModel), `${fmt(g.ddi)} ${fmt(g.featureLevels)}`.trim(), fmt(g.hdr), fmt(g.monitor)], ss, styles))
 }
 if (!gpuControllers.length && gpu.model) {
 s3rows.push(buildRow(r++, [1, fmt(gpu.model), fmt(gpu.vendor), gpu.memoryTotal || '', '', '', '', '', '', '', ''], ss))
 }

 const sheet3 = sheet(s3rows, [6, 35, 20, 12, 16, 20, 30, 20, 40, 20, 25])

 // -- Sheet 4: RAM -------------------------------------------------------------

 const s4rows = []
 r = 1
 s4rows.push(buildRow(r++, ['MEMORIA RAM'], ss, [1]))
 s4rows.push(kv(r++, 'Capacidad maxima placa', memSum.maxCapacityGb ? `${memSum.maxCapacityGb} GB` : '', ss))
 s4rows.push(kv(r++, 'Slots totales / Ocupados', `${fmt(memSum.slots)} / ${fmt(memSum.populated)}`, ss))
 s4rows.push(buildRow(r++, [], ss))
 const ramHeaders = ['Modulo#', 'Capacidad', 'Tipo', 'Vel. configurada (MHz)', 'Vel. rated (MHz)', 'Fabricante', 'Numero de parte', 'Banco', 'Slot', 'Serie']
 s4rows.push(headerRow(r++, ramHeaders, ss))
 for (let i = 0; i < ramModules.length; i++) {
 const m = ramModules[i]
 const capGb = m.size ? (m.size / 1073741824).toFixed(0) + ' GB' : ''
 s4rows.push(buildRow(r++, [i + 1, capGb, fmt(m.type), m.clockSpeed ?? '', m.speedMax ?? '', fmt(m.manufacturer), fmt(m.partNum), fmt(m.bank), fmt(m.slot), fmt(m.serial)], ss))
 }

 const sheet4 = sheet(s4rows, [8, 14, 8, 22, 18, 20, 28, 18, 18, 22])

 // -- Sheet 5: Almacenamiento --------------------------------------------------

 const s5rows = []
 r = 1
 const diskHeaders = ['Disco#', 'Modelo', 'Fabricante', 'Tipo', 'Interfaz', 'Tamano', 'S.M.A.R.T.', 'Firmware', 'Numero de serie']
 s5rows.push(headerRow(r++, diskHeaders, ss))
 for (let i = 0; i < disks.length; i++) {
 const d = disks[i]
 const sizeGb = d.size ? (d.size / 1073741824).toFixed(0) + ' GB' : ''
 s5rows.push(buildRow(r++, [i + 1, fmt(d.name), fmt(d.vendor), fmt(d.type), fmt(d.interfaceType || d.bus), sizeGb, fmt(d.smartStatus), fmt(d.firmwareRevision), fmt(d.serialNumber)], ss, new Array(9).fill(5)))
 if (d.volumes?.length) {
 for (const vol of d.volumes) {
 const volSize = vol.sizeGb ? `${Number(vol.sizeGb).toFixed(0)} GB` : ''
 const volFree = vol.freeGb ? `${Number(vol.freeGb).toFixed(0)} GB libres` : ''
 s5rows.push(buildRow(r++, ['', ` - ${fmt(vol.mount || vol.letter)}`, fmt(vol.label), fmt(vol.filesystem), '', volFree ? `${volFree} / ${volSize}` : volSize, '', '', ''], ss))
 }
 }
 }

 const sheet5 = sheet(s5rows, [6, 35, 20, 16, 14, 14, 12, 14, 28])

 // -- Sheet 6: Sistema ---------------------------------------------------------

 const s6rows = []
 r = 1
 s6rows.push(buildRow(r++, ['PLACA MADRE Y SISTEMA'], ss, [1]))
 s6rows.push(buildRow(r++, [], ss))
 s6rows.push(sectionRow(r++, 'PLACA MADRE', ss))
 s6rows.push(kv(r++, 'Fabricante', fmt(board.manufacturer), ss))
 s6rows.push(kv(r++, 'Modelo', fmt(board.model), ss))
 s6rows.push(kv(r++, 'Version', fmt(board.version), ss))
 s6rows.push(kv(r++, 'Serie', fmt(board.serial), ss))
 s6rows.push(buildRow(r++, [], ss))
 s6rows.push(sectionRow(r++, 'BIOS', ss))
 s6rows.push(kv(r++, 'Fabricante', fmt(bios.vendor), ss))
 s6rows.push(kv(r++, 'Version', fmt(bios.version), ss))
 s6rows.push(kv(r++, 'Fecha', fmt(bios.releaseDate), ss))
 s6rows.push(buildRow(r++, [], ss))

 if (audio.length) {
 s6rows.push(sectionRow(r++, 'AUDIO', ss))
 s6rows.push(headerRow(r++, ['Dispositivo', 'Fabricante', 'Driver', 'Estado'], ss))
 for (const a of audio) {
 s6rows.push(buildRow(r++, [fmt(a.name), fmt(a.manufacturer), fmt(a.driverVersion), fmt(a.status)], ss))
 }
 s6rows.push(buildRow(r++, [], ss))
 }

 if (network.length) {
 s6rows.push(sectionRow(r++, 'RED', ss))
 s6rows.push(headerRow(r++, ['Interfaz', 'Tipo', 'Velocidad', 'Fabricante', 'Modelo', 'MAC'], ss))
 for (const n of network) {
 s6rows.push(buildRow(r++, [fmt(n.iface), fmt(n.type), n.speed ? `${n.speed} Mbps` : '', fmt(n.manufacturer), fmt(n.model), fmt(n.mac)], ss))
 }
 s6rows.push(buildRow(r++, [], ss))
 }

 if (monitors.length) {
 s6rows.push(sectionRow(r++, 'MONITORES', ss))
 s6rows.push(headerRow(r++, ['Nombre', 'Resolucion', 'Estado'], ss))
 for (const m of monitors) {
 const res = m.screenWidth && m.screenHeight ? `${m.screenWidth} x ${m.screenHeight}` : ''
 s6rows.push(buildRow(r++, [fmt(m.name), res, fmt(m.status)], ss))
 }
 }

 const sheet6 = sheet(s6rows, [28, 45])

 // -- Sheet 7: Historial (with line chart) ------------------------------------

 const s7rows = []
 r = 1
 s7rows.push(buildRow(r++, ['HISTORIAL DE RENDIMIENTO (ultimos 2 min)'], ss, [1]))
 r++
 const histHeaders = ['Tiempo (s)', 'CPU %', 'GPU %', 'RAM %']
 s7rows.push(headerRow(r++, histHeaders, ss))
 const histDataStart = r
 const baseTime = history.length ? history[0].time : Date.now()
 for (const h of history) {
 const elapsedS = Math.round((h.time - baseTime) / 1000)
 s7rows.push(buildRow(r++, [elapsedS, h.cpu ?? 0, h.gpu ?? 0, h.ram ?? 0], ss, [4, 3, 3, 3]))
 }
 const histDataEnd = Math.max(r - 1, histDataStart)
 // Leave space for chart (starts at current r + 1)
 const chartStartRow = r + 1
 for (let i = 0; i < 25; i++) s7rows.push(buildRow(r++, [], ss))

 const sheet7RelId = history.length > 1 ? 'rId1' : null
 const sheet7 = sheet(s7rows, [14, 10, 10, 10], sheet7RelId)

 // -- Sheet 8: Prueba de estres ------------------------------------------------

 const s8rows = []
 r = 1
 const samples = stress?.samples || []
 const summary = stress?.summary || null

 s8rows.push(buildRow(r++, ['PRUEBA DE ESTRES'], ss, [1]))
 s8rows.push(buildRow(r++, [], ss))

 if (stress) {
 const typeNames = { cpu: 'Procesador', gpu: 'GPU', memory: 'Memoria RAM', disk: 'Disco' }
 s8rows.push(kv(r++, 'Componente', typeNames[stress.type] || stress.type, ss))
 s8rows.push(kv(r++, 'Intensidad', `${stress.intensity}%`, ss))
 s8rows.push(kv(r++, 'Duracion configurada', `${stress.duration}s`, ss))
 s8rows.push(kv(r++, 'Estado', stress.stopReason === 'completed' ? 'Completada' : stress.stopReason === 'temperature' ? 'Corte termico' : stress.stopReason || 'Detenida', ss))
 s8rows.push(kv(r++, 'Iniciada', fmtDate(stress.startedAt), ss))
 if (stress.stoppedAt) s8rows.push(kv(r++, 'Finalizada', fmtDate(stress.stoppedAt), ss))
 s8rows.push(buildRow(r++, [], ss))
 if (summary) {
 s8rows.push(sectionRow(r++, 'RESUMEN', ss))
 s8rows.push(kv(r++, 'Muestras', summary.samples, ss))
 s8rows.push(kv(r++, 'Actividad maxima', `${summary.peakActivity} ${samples[0]?.activityUnit || '%'}`, ss))
 s8rows.push(kv(r++, 'Actividad media', `${fmtNum(summary.averageActivity)} ${samples[0]?.activityUnit || '%'}`, ss))
 s8rows.push(kv(r++, 'Temperatura base', summary.baselineTemperature !== null ? `${summary.baselineTemperature} C` : 'No disponible', ss))
 s8rows.push(kv(r++, 'Temperatura maxima', summary.peakTemperature !== null ? `${summary.peakTemperature} C` : 'No disponible', ss))
 s8rows.push(kv(r++, 'Delta termico', summary.temperatureDelta !== null ? `${summary.temperatureDelta >= 0 ? '+' : ''}${summary.temperatureDelta} C` : '', ss))
 s8rows.push(kv(r++, 'Potencia media', summary.averagePower !== null ? `${fmtNum(summary.averagePower)} W` : 'No disponible', ss))
 s8rows.push(kv(r++, 'Potencia maxima', summary.peakPower !== null ? `${fmtNum(summary.peakPower)} W` : 'No disponible', ss))
 s8rows.push(kv(r++, 'Integridad', summary.verified ? 'Verificada' : 'Con errores', ss))
 s8rows.push(buildRow(r++, [], ss))
 }
 } else {
 s8rows.push(buildRow(r++, ['No se ejecuto ninguna prueba de estres en esta sesion.'], ss))
 }

 let stressDataStart = r
 let stressDataEnd = r
 const stressRelId = samples.length > 1 ? 'rId1' : null

 if (samples.length) {
 const stressHeaders = ['Tiempo (s)', 'Temperatura C', 'Potencia W', 'Actividad', 'CPU %', 'GPU %', 'RAM %']
 s8rows.push(headerRow(r++, stressHeaders, ss))
 stressDataStart = r
 for (const sp of samples) {
 const elapsed = Math.round(sp.elapsedMs / 1000)
 s8rows.push(buildRow(r++, [elapsed, sp.temperature ?? '', sp.power ?? '', sp.activity ?? '', sp.cpuLoad ?? '', sp.gpuLoad ?? '', sp.memoryLoad ?? ''], ss, [4, 3, 3, 3, 3, 3, 3]))
 }
 stressDataEnd = r - 1
 for (let i = 0; i < 25; i++) s8rows.push(buildRow(r++, [], ss))
 }

 const sheet8 = sheet(s8rows, [28, 45], stressRelId)

 // --- Assemble XLSX package ---------------------------------------------------

 const sheetDefs = [
 { name: 'Resumen', xml: sheet1, rId: 'rId1' },
 { name: 'Procesador', xml: sheet2, rId: 'rId2' },
 { name: 'GPU', xml: sheet3, rId: 'rId3' },
 { name: 'RAM', xml: sheet4, rId: 'rId4' },
 { name: 'Almacenamiento', xml: sheet5, rId: 'rId5' },
 { name: 'Sistema', xml: sheet6, rId: 'rId6' },
 { name: 'Historial', xml: sheet7, rId: 'rId7' },
 { name: 'Prueba de estres', xml: sheet8, rId: 'rId8' },
 ]

 const wbRelEntries = sheetDefs.map((s, i) => ({
 id: s.rId,
 type: RT.sheet,
 target: `worksheets/sheet${i + 1}.xml`
 }))
 wbRelEntries.push({ id: `rId${sheetDefs.length + 1}`, type: RT.styles, target: 'styles.xml' })
 wbRelEntries.push({ id: `rId${sheetDefs.length + 2}`, type: RT.sharedStrings, target: 'sharedStrings.xml' })

 const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
 `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"` +
 ` xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
 `<bookViews><workbookView activeTab="0"/></bookViews>` +
 `<sheets>${sheetDefs.map((s, i) => `<sheet name="${xmlEsc(s.name)}" sheetId="${i + 1}" r:id="${s.rId}"/>`).join('')}</sheets>` +
 `</workbook>`

 const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
 `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
 `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
 `<Default Extension="xml" ContentType="application/xml"/>` +
 `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
 sheetDefs.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
 `<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>` +
 `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
 (history.length > 1 ? `<Override PartName="/xl/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/><Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>` : '') +
 (samples.length > 1 ? `<Override PartName="/xl/charts/chart2.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/><Override PartName="/xl/drawings/drawing2.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>` : '') +
 `</Types>`

 const files = [
 { name: '[Content_Types].xml', data: contentTypes },
 { name: '_rels/.rels', data: relsXml([{ id: 'rId1', type: RT.officeDocument, target: 'xl/workbook.xml' }]) },
 { name: 'xl/workbook.xml', data: workbookXml },
 { name: 'xl/_rels/workbook.xml.rels', data: relsXml(wbRelEntries) },
 { name: 'xl/styles.xml', data: STYLES_XML },
 ...sheetDefs.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: s.xml })),
 ]

 // Charts for Historial sheet (sheet 7, index 6)
 if (history.length > 1) {
 const histChart = lineChartXml('Historial', histDataStart, histDataEnd, 'A', [
 { title: 'CPU %', valCol: 'B', color: '4472C4' },
 { title: 'GPU %', valCol: 'C', color: 'ED7D31' },
 { title: 'RAM %', valCol: 'D', color: 'A9D18E' },
 ])
 const histDrawing = drawingXml('rId1', chartStartRow, chartStartRow + 22, 0, 9)
 const histSheetRelIdx = 7 // sheet 7 = index 6, filename sheet7.xml
 files.push({ name: `xl/worksheets/_rels/sheet${histSheetRelIdx}.xml.rels`, data: relsXml([{ id: 'rId1', type: RT.drawing, target: '../drawings/drawing1.xml' }]) })
 files.push({ name: 'xl/drawings/drawing1.xml', data: histDrawing })
 files.push({ name: 'xl/drawings/_rels/drawing1.xml.rels', data: relsXml([{ id: 'rId1', type: RT.chart, target: '../charts/chart1.xml' }]) })
 files.push({ name: 'xl/charts/chart1.xml', data: histChart })
 }

 // Charts for stress sheet (sheet 8, index 7)
 if (samples.length > 1) {
 const hasTempData = samples.some(s => s.temperature !== null)
 const hasPowerData = samples.some(s => s.power !== null)
 const stressSeries = [
 { title: 'Actividad', valCol: 'D', color: '4472C4' },
 ...(hasTempData ? [{ title: 'Temperatura C', valCol: 'B', color: 'ED7D31' }] : []),
 ...(hasPowerData ? [{ title: 'Potencia W', valCol: 'C', color: 'FFC000' }] : []),
 { title: 'CPU %', valCol: 'E', color: 'A9D18E' },
 ]
 const stressChart = lineChartXml('Prueba de estres', stressDataStart, stressDataEnd, 'A', stressSeries)
 const stressDrawing = drawingXml('rId1', stressDataEnd + 2, stressDataEnd + 25, 0, 9)
 files.push({ name: 'xl/worksheets/_rels/sheet8.xml.rels', data: relsXml([{ id: 'rId1', type: RT.drawing, target: '../drawings/drawing2.xml' }]) })
 files.push({ name: 'xl/drawings/drawing2.xml', data: stressDrawing })
 files.push({ name: 'xl/drawings/_rels/drawing2.xml.rels', data: relsXml([{ id: 'rId1', type: RT.chart, target: '../charts/chart2.xml' }]) })
 files.push({ name: 'xl/charts/chart2.xml', data: stressChart })
 }

 // Shared strings last (needs all sheets built first to populate)
 files.push({ name: 'xl/sharedStrings.xml', data: ss.xml() })

 return buildZip(files)
}
