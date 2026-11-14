#!/usr/bin/env node
/**
 * Put a scrabber executable where the plugin can find it.
 *
 * scrabber is the capture engine and is not bundled with this plugin. Point this
 * script at a build of it, and it is copied into the plugin's `bin/`:
 *
 *   node scripts/install-scrabber.mjs "D:/path/to/scrabber/target/release/scrabber.exe"
 *   DSH_SECRETARY_SCRABBER=/opt/scrabber node scripts/install-scrabber.mjs
 *
 * Without an argument it searches `PATH`, which is enough when `scrabber` is
 * installed system-wide. The plugin itself also honours a `scrabberPath` config
 * value, so copying is optional.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PLUGIN_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const EXE = process.platform === 'win32' ? 'scrabber.exe' : 'scrabber'

function expand(candidate) {
  if (candidate === undefined || candidate === null || candidate.trim() === '') return null
  const resolved = path.resolve(candidate.trim())
  try {
    const stat = fs.statSync(resolved)
    if (!stat.isFile()) return null
    fs.accessSync(resolved, fs.constants.X_OK)
    return resolved
  } catch {
    return null
  }
}

const requested = [process.argv[2], process.env.DSH_SECRETARY_SCRABBER]
let source = null
for (const candidate of requested) {
  source = expand(candidate)
  if (source !== null) break
}

if (source === null) {
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    if (dir.trim() === '') continue
    source = expand(path.join(dir.trim(), EXE)) ?? expand(path.join(dir.trim(), 'scrabber'))
    if (source !== null) break
  }
}

if (source === null) {
  console.error('install-scrabber: no scrabber executable found.\n')
  console.error('Build it from its own project, then pass the result to this script:')
  console.error('  cd <scrabber project>')
  console.error('  cargo build --release')
  console.error(`  node ${path.join(PLUGIN_DIR, 'scripts', 'install-scrabber.mjs')} "<scrabber project>/target/release/${EXE}"`)
  process.exit(1)
}

const dest = path.join(PLUGIN_DIR, 'bin', EXE)
fs.mkdirSync(path.dirname(dest), { recursive: true })
fs.copyFileSync(source, dest)
try { fs.chmodSync(dest, 0o755) } catch { /* Windows ignores this */ }
console.log(`install-scrabber: ${source} -> ${dest}`)
