const fs = require('fs')
const path = require('path')

function findRoot(startDir) {
  let current = startDir
  while (true) {
    const pkgPath = path.join(current, 'package.json')
    if (fs.existsSync(pkgPath)) {
      return current
    }
    const parent = path.dirname(current)
    if (parent === current) {
      return startDir
    }
    current = parent
  }
}

const args = process.argv.slice(2)
const rootDir = findRoot(process.cwd())
const pkgPath = path.join(rootDir, 'package.json')
const pkg = fs.existsSync(pkgPath)
  ? JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
  : { name: path.basename(rootDir), version: '0.0.0' }

function write(value) {
  process.stdout.write(String(value))
}

function done(value = '', code = 0) {
  if (value) {
    write(value)
  }
  process.exit(code)
}

if (args.length === 1 && args[0] === '--version') {
  done('10.99.0\n')
}

if (args.length === 3 && args[0] === '--workspace-root' && args[1] === 'exec' && args[2] === 'pwd') {
  done(`${rootDir}\n`)
}

if (args[0] === 'list') {
  const tree = [
    {
      name: pkg.name || path.basename(rootDir),
      version: pkg.version || '0.0.0',
      path: rootDir,
      private: Boolean(pkg.private),
      workspaces: pkg.workspaces,
      dependencies: {},
      optionalDependencies: {},
    },
  ]
  done(`${JSON.stringify(tree, null, 2)}\n`)
}

process.stderr.write(`pnpm-shim: unsupported arguments: ${args.join(' ')}\n`)
process.exit(1)
