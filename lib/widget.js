/**
 * The desktop companion process.
 *
 * The circular overlay is a real window on the user's desktop, which a page
 * inside the Harness cannot create, so it ships as a small native binary
 * (`native/widget`). This module finds it, starts it, and makes sure exactly one
 * copy is ever running.
 *
 * Two files, two owners: the widget writes its own placement (it is the only
 * process that knows where it was dragged), and the Host writes the pid it
 * started so a widget left behind by a crashed run can be reaped without
 * touching an unrelated process that reused the pid.
 */

import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const EXE = process.platform === 'win32' ? 'daily-secretary-widget.exe' : 'daily-secretary-widget'
const STANDALONE_EXE = process.platform === 'win32' ? 'daily-secretary-widget-standalone.exe' : 'daily-secretary-widget-standalone'

/** Where the widget binary can live, most specific first. */
export function locateWidget({ rootDir, env = process.env }) {
  const candidates = []
  if (typeof env.DSH_SECRETARY_WIDGET === 'string' && env.DSH_SECRETARY_WIDGET.trim() !== '') {
    candidates.push(env.DSH_SECRETARY_WIDGET.trim())
  }
  candidates.push(path.join(rootDir, 'bin', STANDALONE_EXE))
  candidates.push(path.join(rootDir, 'bin', EXE))
  candidates.push(path.join(rootDir, 'bin', 'daily-secretary-widget'))
  candidates.push(path.join(rootDir, 'native', 'widget', 'target', 'release', EXE))
  candidates.push(path.join(rootDir, 'native', 'widget', 'target', 'release', 'daily-secretary-widget'))
  candidates.push(path.join(rootDir, 'native', 'widget', 'target', 'debug', EXE))

  for (const candidate of candidates) {
    try {
      const resolved = path.resolve(candidate)
      if (!fs.statSync(resolved).isFile()) continue
      fs.accessSync(resolved, fs.constants.X_OK)
      return resolved
    } catch { /* next */ }
  }
  return null
}

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** Whether a live pid is a widget this plugin started earlier. Never guesses. */
function pidIsOurWidget(pid) {
  if (!pidAlive(pid)) return false
  try {
    if (process.platform === 'win32') {
      const out = spawnSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { encoding: 'utf8', timeout: 5_000, windowsHide: true })
      return (out.stdout ?? '').toLowerCase().includes('daily-secretary-widget')
    }
    if (process.platform === 'linux') {
      return fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').toLowerCase().includes('daily-secretary-widget')
    }
    const out = spawnSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8', timeout: 5_000 })
    return (out.stdout ?? '').toLowerCase().includes('daily-secretary-widget')
  } catch {
    return false
  }
}

/** Owns the widget process. */
export class WidgetRunner {
  /**
   * @param {object} options
   * @param {string|null} options.binaryPath
   * @param {{ origin: string, token: string }} options.endpoint
   * @param {string} options.placementFile widget-owned placement, read only here
   * @param {string} options.pidFile Host-owned record of the pid it started
   * @param {{ info: Function, warn: Function, error: Function }} options.logger
   */
  constructor({ binaryPath, endpoint, placementFile, pidFile, logger }) {
    this.binaryPath = binaryPath
    this.endpoint = endpoint
    this.placementFile = placementFile
    this.pidFile = pidFile
    this.logger = logger
    this.child = null
    this.enabled = binaryPath !== null
  }

  /** Placement remembered by the widget itself, if any. */
  readPlacement() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.placementFile, 'utf8'))
      if (Number.isFinite(raw?.x) && Number.isFinite(raw?.y)) return { x: raw.x, y: raw.y }
      return null
    } catch {
      return null
    }
  }

  /** Stop any widget left behind by a previous Host process. */
  reapStale() {
    let raw
    try {
      raw = JSON.parse(fs.readFileSync(this.pidFile, 'utf8'))
    } catch {
      return
    }
    const pid = raw?.pid
    if (!Number.isInteger(pid)) return
    if (!pidIsOurWidget(pid)) return
    this.logger.info('daily-secretary: stopping a widget left by a previous run (pid %s)', pid)
    try { process.kill(pid) } catch { /* already gone */ }
  }

  /** Start the widget. Returns false when no binary is available. */
  start() {
    if (!this.enabled) return false
    if (this.child !== null && this.child.exitCode === null) return true
    this.reapStale()

    const placement = this.readPlacement()
    const args = [
      '--endpoint', this.endpoint.origin,
      '--token', this.endpoint.token,
      '--state', this.placementFile,
    ]
    if (placement !== null) args.push('--position', `${Math.round(placement.x)},${Math.round(placement.y)}`)

    try {
      this.child = spawn(this.binaryPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
        windowsHide: true,
      })
    } catch (error) {
      this.logger.error('daily-secretary: cannot start the desktop widget (%s)', error?.message ?? error)
      this.child = null
      return false
    }
    this.child.stdout?.resume()
    this.child.stderr?.on('data', (chunk) => {
      const text = String(chunk).trim()
      if (text !== '') this.logger.warn('daily-secretary widget: %s', text.slice(0, 400))
    })
    this.child.on('error', (error) => {
      this.logger.error('daily-secretary: widget error (%s)', error?.message ?? error)
    })
    this.child.on('exit', (code, signal) => {
      this.logger.warn('daily-secretary: widget exited (code %s, signal %s)', code, signal)
      this.child = null
    })
    this.logger.info('daily-secretary: desktop widget started (pid %s)', this.child.pid)
    this.#rememberPid(this.child.pid)
    return true
  }

  #rememberPid(pid) {
    try {
      fs.mkdirSync(path.dirname(this.pidFile), { recursive: true })
      fs.writeFileSync(this.pidFile, `${JSON.stringify({ pid, at: Date.now() }, null, 2)}\n`, 'utf8')
    } catch { /* the widget still runs without a pid record */ }
  }

  /** Stop the widget, if running. */
  stop() {
    const child = this.child
    this.child = null
    if (child !== null && child.exitCode === null) {
      try { child.kill() } catch { /* already gone */ }
    }
  }

  /** Detached status for diagnostics. */
  snapshot() {
    return {
      available: this.enabled,
      binaryPath: this.binaryPath,
      running: this.child !== null && this.child.exitCode === null,
      pid: this.child?.pid ?? null,
    }
  }
}
