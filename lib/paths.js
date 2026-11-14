/**
 * Paths, names, and containment rules for the daily-secretary store.
 *
 * Every path this plugin ever deletes is produced by `resolveStore()`, and
 * `assertDeletableShot()` is the single gate a screenshot must pass before it
 * can be removed. Nothing else in the plugin calls `fs.unlink`.
 */

import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

/** File name scrabber writes: `2026-11-13T19.30.04.png` (see scrabber main.rs). */
export const SHOT_FILE_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})\.(\d{2})\.(\d{2})\.png$/

/** Directory name scrabber writes: `2026-11-13`. */
export const DAY_DIR_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Resolve every directory the plugin owns. `rootDir` is the plugin's own main
 * directory by default, so screenshots live in `<rootDir>/screenshots` exactly
 * as the user asked.
 *
 * @param {{ rootDir: string }} options
 * @returns {{ root: string, screenshots: string, diary: string, detail: string,
 *   daily: string, state: string, notes: string, logs: string, bin: string }}
 */
export function resolveStore({ rootDir }) {
  const root = path.resolve(rootDir)
  const screenshots = path.join(root, 'screenshots')
  const diary = path.join(root, 'diary')
  const state = path.join(root, 'state')
  return {
    root,
    screenshots,
    diary,
    detail: path.join(diary, 'detail'),
    daily: path.join(diary, 'daily'),
    state,
    notes: path.join(state, 'notes'),
    logs: path.join(root, 'logs'),
    bin: path.join(root, 'bin'),
  }
}

/** Create the directory skeleton. Idempotent. */
export function ensureStore(store) {
  for (const dir of [store.root, store.screenshots, store.diary, store.detail, store.daily, store.state, store.notes, store.logs, store.bin]) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

/** Zero-pad. */
const pad = (value) => String(value).padStart(2, '0')

/** `2026-11-13` for one local instant. */
export function dayKey(ms) {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** `2026/11/13 19:30:04` for one local instant — the diary separator format. */
export function stamp(ms) {
  const d = new Date(ms)
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** `19:30` for one local instant. */
export function clock(ms) {
  const d = new Date(ms)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * Parse a scrabber screenshot file name into its capture instant.
 * The file name is authoritative: scrabber builds it from the local clock at
 * capture time, so mtime is never required to order screenshots.
 *
 * @param {string} name
 * @returns {{ ms: number, day: string } | null} null when the name is not scrabber's.
 */
export function parseShotName(name) {
  const match = SHOT_FILE_RE.exec(name)
  if (match === null) return null
  const [, year, month, day, hour, minute, second] = match
  const ms = new Date(
    Number(year), Number(month) - 1, Number(day),
    Number(hour), Number(minute), Number(second), 0,
  ).getTime()
  if (!Number.isFinite(ms)) return null
  const key = `${year}-${month}-${day}`
  // Reject impossible dates (2026-02-31 rolls over; a round trip catches it).
  if (dayKey(ms) !== key) return null
  return { ms, day: key }
}

/** Whether `candidate` is inside `root` (string-level, after resolving both). */
export function isInside(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate))
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}

/** Stable short hash, used to key per-instance state without leaking paths. */
export function shortHash(value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 16)
}

/**
 * The one gate a file must pass before deletion.
 *
 * It fails closed: any doubt (missing root, symlink, unexpected depth, name
 * that scrabber would never write, file outside the root) rejects the file
 * instead of deleting it. The caller receives a reason so it can log why a
 * screenshot was kept.
 *
 * @param {{ screenshots: string }} store
 * @param {string} file candidate absolute or root-relative path
 * @returns {{ ok: true, realPath: string } | { ok: false, reason: string }}
 */
export function assertDeletableShot(store, file) {
  let rootReal
  try {
    rootReal = fs.realpathSync(store.screenshots)
  } catch {
    return { ok: false, reason: 'screenshot root is missing' }
  }
  const rootBase = path.basename(rootReal)
  if (rootReal === path.parse(rootReal).root || rootBase === '') {
    return { ok: false, reason: 'screenshot root looks like a filesystem root' }
  }
  if (rootBase !== 'screenshots') {
    return { ok: false, reason: `screenshot root must be named "screenshots", found "${rootBase}"` }
  }

  const target = path.resolve(file)
  if (!isInside(rootReal, target)) return { ok: false, reason: 'not inside the screenshot root' }

  let stat
  try {
    stat = fs.lstatSync(target)
  } catch {
    return { ok: false, reason: 'file disappeared' }
  }
  if (stat.isSymbolicLink()) return { ok: false, reason: 'symbolic link, not a regular file' }
  if (!stat.isFile()) return { ok: false, reason: 'not a regular file' }

  let real
  try {
    real = fs.realpathSync(target)
  } catch {
    return { ok: false, reason: 'cannot resolve' }
  }
  if (!isInside(rootReal, real)) return { ok: false, reason: 'resolves outside the screenshot root' }

  const dayDir = path.dirname(real)
  const dayName = path.basename(dayDir)
  if (path.dirname(real) !== dayDir || path.dirname(dayDir) !== rootReal) {
    return { ok: false, reason: 'not exactly one directory below the screenshot root' }
  }
  if (!DAY_DIR_RE.test(dayName)) return { ok: false, reason: 'parent is not a date directory' }
  const parsed = parseShotName(path.basename(real))
  if (parsed === null) return { ok: false, reason: 'name is not a scrabber screenshot name' }
  if (parsed.day !== dayName) return { ok: false, reason: 'name and date directory disagree' }

  return { ok: true, realPath: real }
}
