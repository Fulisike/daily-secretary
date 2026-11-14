#!/usr/bin/env node
/**
 * Build the desktop widget and copy it into the plugin's `bin/`.
 *
 * Run from the plugin directory: `node scripts/build-native.mjs`.
 * The plugin looks in `bin/` first, then at the crate's own dev build output,
 * so a plain `cargo build --release` in `native/widget` also works.
 */

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PLUGIN_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CRATE_DIR = path.join(PLUGIN_DIR, 'native', 'widget')
const EXE = process.platform === 'win32' ? 'daily-secretary-widget.exe' : 'daily-secretary-widget'
const STANDALONE_EXE = process.platform === 'win32' ? 'daily-secretary-widget-standalone.exe' : 'daily-secretary-widget-standalone'
const BUILT = path.join(CRATE_DIR, 'target', 'release', EXE)
const DEST = path.join(PLUGIN_DIR, 'bin', STANDALONE_EXE)

function fail(message) {
  console.error(`build-native: ${message}`)
  process.exit(1)
}

if (!fs.existsSync(path.join(CRATE_DIR, 'Cargo.toml'))) fail(`crate not found at ${CRATE_DIR}`)

console.log(`build-native: cargo build --release in ${CRATE_DIR}`)
const env = { ...process.env }
if (process.platform === 'win32') {
  env.RUSTFLAGS = [env.RUSTFLAGS, '-C target-feature=+crt-static'].filter(Boolean).join(' ')
}
const build = spawnSync('cargo', ['build', '--release'], {
  cwd: CRATE_DIR,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env,
})
if (build.error) fail(`cannot run cargo: ${build.error.message}. Install Rust from https://rustup.rs and retry.`)
if (build.status !== 0) fail(`cargo build failed with exit code ${build.status}`)
if (!fs.existsSync(BUILT)) fail(`expected ${BUILT} to exist after the build`)

fs.mkdirSync(path.dirname(DEST), { recursive: true })
fs.copyFileSync(BUILT, DEST)
try { fs.chmodSync(DEST, 0o755) } catch { /* Windows ignores this */ }
console.log(`build-native: copied to ${DEST}`)
