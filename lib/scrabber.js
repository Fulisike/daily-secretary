/**
 * scrabber supervisor.
 *
 * scrabber is the capture engine; this module never captures anything itself.
 * It finds the executable, runs it exactly the way its own launcher does
 * (`--path <dir> --interval N --forever --skip-duplicates`), and keeps it
 * alive: a locked screen or an unplugged monitor makes scrabber's capture
 * `expect()` panic, which exits the process, so a watchdog restarts it with
 * backoff instead of silently losing an afternoon of screenshots.
 */

import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { StringDecoder } from 'node:string_decoder'

const EXE = process.platform === 'win32' ? 'scrabber.exe' : 'scrabber'
const STANDALONE_EXE = process.platform === 'win32' ? 'scrabber-standalone.exe' : 'scrabber-standalone'
const RESTART_DELAYS_MS = [2_000, 5_000, 15_000, 30_000, 60_000]

/** Last path components + names worth trying without user configuration. */
function candidatePaths({ configured, pluginDir, env }) {
  const candidates = []
  if (typeof configured === 'string' && configured.trim() !== '') {
    const value = configured.trim()
    candidates.push(value)
    if (!path.isAbsolute(value)) candidates.push(path.resolve(pluginDir, value))
  }
  if (typeof env?.DSH_SECRETARY_SCRABBER === 'string' && env.DSH_SECRETARY_SCRABBER.trim() !== '') {
    candidates.push(env.DSH_SECRETARY_SCRABBER.trim())
  }
  candidates.push(path.join(pluginDir, 'bin', STANDALONE_EXE))
  candidates.push(path.join(pluginDir, 'bin', EXE))
  candidates.push(path.join(pluginDir, 'bin', 'scrabber'))
  if (env?.PATH) {
    for (const dir of env.PATH.split(path.delimiter)) {
      if (dir.trim() === '') continue
      candidates.push(path.join(dir.trim(), EXE))
      candidates.push(path.join(dir.trim(), 'scrabber'))
    }
  }
  return candidates
}

/** First executable scrabber, or null. */
export function locateScrabber({ configured, pluginDir, env = process.env }) {
  for (const candidate of candidatePaths({ configured, pluginDir, env })) {
    try {
      const resolved = path.resolve(candidate)
      const stat = fs.statSync(resolved)
      if (!stat.isFile()) continue
      fs.accessSync(resolved, fs.constants.X_OK)
      return resolved
    } catch { /* try the next candidate */ }
  }
  return null
}

/** Command line for one capture session. */
export function captureArgs({ screenshotsDir, intervalSeconds, cursor }) {
  const args = [
    '--path', screenshotsDir,
    '--interval', String(Math.max(1, Math.min(65_535, Math.round(intervalSeconds)))),
    '--forever',
    '--skip-duplicates',
  ]
  // scrabber only accepts --cursor in its Windows build; any other platform
  // rejects the flag outright.
  if (cursor && process.platform === 'win32') args.push('--cursor')
  return args
}

/** Whether a live pid is a scrabber we started earlier. Never guesses. */
function pidLooksLikeScrabber(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
  } catch {
    return false
  }
  try {
    if (process.platform === 'win32') {
      const out = execFileSyncSafe('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'])
      return out.toLowerCase().includes('scrabber')
    }
    if (process.platform === 'linux') {
      const cmdline = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8')
      return cmdline.toLowerCase().includes('scrabber')
    }
    const out = execFileSyncSafe('ps', ['-p', String(pid), '-o', 'command='])
    return out.toLowerCase().includes('scrabber')
  } catch {
    return false
  }
}

function execFileSyncSafe(command, args) {
  // Deliberately synchronous and bounded: this runs once per plugin start.
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 5_000, windowsHide: true })
  return result.stdout ?? ''
}

/** Supervisor for the single scrabber process this plugin owns. */
export class CaptureRunner {
  /**
   * @param {object} options
   * @param {string} options.scrabberPath resolved executable
   * @param {string} options.screenshotsDir capture destination (`<root>/screenshots`)
   * @param {number} options.intervalSeconds capture interval
   * @param {boolean} [options.cursor] include the mouse cursor (Windows only)
   * @param {{ info: Function, warn: Function, error: Function }} options.logger
   * @param {string} [options.logFile] append scrabber's own output here
   */
  constructor({ scrabberPath, screenshotsDir, intervalSeconds, cursor, logger, logFile }) {
    this.scrabberPath = scrabberPath
    this.screenshotsDir = screenshotsDir
    this.intervalSeconds = intervalSeconds
    this.cursor = cursor === true
    this.logger = logger
    this.logFile = logFile
    this.child = null
    this.wanted = false
    this.restarts = 0
    this.failures = 0
    this.lastExit = null
    this.startedAt = null
    this.stoppedAt = null
    this.recentOutput = []
    this.decoder = new StringDecoder('utf8')
    this.restartTimer = null
    this.logStream = null
  }

  get running() {
    return this.child !== null && this.child.exitCode === null
  }

  /** Start capture and keep it started until `stop()`. */
  start() {
    this.wanted = true
    if (this.running) return
    this.#spawn()
  }

  #openLog() {
    if (this.logStream !== null || !this.logFile) return null
    try {
      fs.mkdirSync(path.dirname(this.logFile), { recursive: true })
      this.logStream = fs.createWriteStream(this.logFile, { flags: 'a' })
      this.logStream.on('error', () => { this.logStream = null })
    } catch {
      this.logStream = null
    }
    return this.logStream
  }

  #spawn() {
    if (this.restartTimer !== null) {
      clearTimeout(this.restartTimer)
      this.restartTimer = null
    }
    const args = captureArgs({
      screenshotsDir: this.screenshotsDir,
      intervalSeconds: this.intervalSeconds,
      cursor: this.cursor,
    })
    let child
    try {
      child = spawnDetached(this.scrabberPath, args)
    } catch (error) {
      this.failures += 1
      this.logger.error('daily-secretary: cannot start scrabber (%s)', error?.message ?? error)
      this.#scheduleRestart()
      return
    }
    this.child = child
    this.startedAt = Date.now()
    this.stoppedAt = null
    this.logger.info('daily-secretary: scrabber started (pid %s, every %ss)', child.pid, this.intervalSeconds)

    const record = (chunk) => {
      const text = this.decoder.write(chunk)
      if (text === '') return
      for (const line of text.split(/\r?\n/)) {
        if (line.trim() === '') continue
        this.recentOutput.push(line.trim().slice(0, 500))
        if (this.recentOutput.length > 40) this.recentOutput.shift()
      }
      this.logStream?.write(text)
    }
    child.stdout?.on('data', record)
    child.stderr?.on('data', record)

    child.on('error', (error) => {
      this.failures += 1
      this.logger.error('daily-secretary: scrabber error (%s)', error?.message ?? error)
    })
    child.on('exit', (code, signal) => {
      this.child = null
      this.lastExit = { code, signal, at: Date.now() }
      if (!this.wanted) return
      this.failures += 1
      this.logger.warn('daily-secretary: scrabber exited unexpectedly (code %s, signal %s); restarting', code, signal)
      this.#scheduleRestart()
    })
  }

  #scheduleRestart() {
    if (!this.wanted || this.restartTimer !== null) return
    const delay = RESTART_DELAYS_MS[Math.min(this.restarts, RESTART_DELAYS_MS.length - 1)]
    this.restarts += 1
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null
      if (this.wanted && !this.running) this.#spawn()
    }, delay)
    this.restartTimer.unref?.()
  }

  /** Stop capture and cancel any pending restart. */
  async stop() {
    this.wanted = false
    if (this.restartTimer !== null) {
      clearTimeout(this.restartTimer)
      this.restartTimer = null
    }
    const child = this.child
    if (child === null) {
      this.stoppedAt = Date.now()
      return
    }
    this.child = null
    this.stoppedAt = Date.now()
    const exited = new Promise((resolve) => {
      const timer = setTimeout(resolve, 4_000)
      timer.unref?.()
      child.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
    })
    try {
      // On Windows this is TerminateProcess; scrabber keeps no state to flush.
      child.kill()
    } catch { /* already gone */ }
    await exited
    this.logger.info('daily-secretary: scrabber stopped')
  }

  /** Release the log file handle on plugin disposal. */
  dispose() {
    this.wanted = false
    if (this.restartTimer !== null) {
      clearTimeout(this.restartTimer)
      this.restartTimer = null
    }
    try { this.logStream?.end() } catch { /* ignore */ }
    this.logStream = null
  }

  /** Detached view of the supervisor for the widget and diagnostics. */
  snapshot() {
    return {
      running: this.running,
      wanted: this.wanted,
      restarts: this.restarts,
      failures: this.failures,
      startedAt: this.startedAt,
      lastExit: this.lastExit,
      recentOutput: this.recentOutput.slice(-3),
    }
  }
}

function spawnDetached(exe, args) {
  return spawn(exe, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    detached: false,
  })
}
