/**
 * Durable ledger: the plugin's only memory across process lifetime.
 *
 * `cursor` is `T`, the start of the not-yet-summarised window. It is written
 * after every state change and re-read on startup, which is what makes sleep,
 * hibernate, a crash, or a plain shutdown recoverable: whatever screenshots are
 * newer than `T` are summarised once when the plugin comes back.
 */

import fs from 'node:fs'
import path from 'node:path'

export const LEDGER_VERSION = 1

/** Fresh ledger for a directory that has never run before. */
export function createLedger(now) {
  return {
    version: LEDGER_VERSION,
    /** T: start of the pending window, epoch ms. */
    cursor: now,
    /** Local date of `cursor` at the time it was set. */
    cursorDay: null,
    /**
     * 'recording' | 'paused' — the capture intent the user last chose.
     * A fresh install starts paused: recording someone's screen without an
     * explicit click is not a default this plugin is willing to pick.
     */
    capture: 'paused',
    /** Last time the tick ran, for diagnostics only. */
    lastTickAt: null,
    /** Last successful summary, for the widget's "last record" line. */
    lastSummaryAt: null,
    /** Day of the newest generated daily digest. */
    digestDay: null,
    /** Instant the current daily digest was generated. */
    digestAt: null,
    /**
     * Instant of the last daily piece that asked the widget to open its card.
     * A background refresh updates the text without popping the card open again.
     */
    panelAt: 0,
    /** Counters, useful in logs and in the detail page. */
    pendingSummaries: [],
    pendingDigests: [],
    stats: { segments: 0, failures: 0, deletedShots: 0, lastError: null },
  }
}

/** Coerce anything read from disk into a usable ledger. */
export function normalizeLedger(raw, now) {
  const base = createLedger(now)
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return base
  const cursor = Number.isFinite(raw.cursor) ? raw.cursor : base.cursor
  // Only an explicit "recording" resumes capture; anything else stays paused.
  const capture = raw.capture === 'recording' ? 'recording' : 'paused'
  return {
    version: LEDGER_VERSION,
    cursor,
    cursorDay: typeof raw.cursorDay === 'string' ? raw.cursorDay : null,
    capture,
    lastTickAt: Number.isFinite(raw.lastTickAt) ? raw.lastTickAt : null,
    lastSummaryAt: Number.isFinite(raw.lastSummaryAt) ? raw.lastSummaryAt : null,
    digestDay: typeof raw.digestDay === 'string' ? raw.digestDay : null,
    digestAt: Number.isFinite(raw.digestAt) ? raw.digestAt : null,
    panelAt: Number.isFinite(raw.panelAt) ? raw.panelAt : 0,
    pendingSummaries: Array.isArray(raw.pendingSummaries) ? raw.pendingSummaries.filter((job) =>
      job && typeof job.id === 'string' && Number.isFinite(job.start) && Number.isFinite(job.end) && Array.isArray(job.files)) : [],
    pendingDigests: Array.isArray(raw.pendingDigests) ? raw.pendingDigests.filter((job) =>
      job && typeof job.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(job.day)) : [],
    stats: {
      segments: Number.isFinite(raw.stats?.segments) ? raw.stats.segments : 0,
      failures: Number.isFinite(raw.stats?.failures) ? raw.stats.failures : 0,
      deletedShots: Number.isFinite(raw.stats?.deletedShots) ? raw.stats.deletedShots : 0,
      lastError: typeof raw.stats?.lastError === 'string' ? raw.stats.lastError : null,
    },
  }
}

/** Read JSON, returning `fallback` for a missing or unreadable file. */
export function readJsonSync(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

/**
 * Replace one JSON file atomically: write a sibling temp file, then rename.
 * A crash between the two leaves the previous file intact, never a half write.
 */
export async function writeJsonAtomic(file, value) {
  const tmp = `${file}.${process.pid}.tmp`
  await fs.promises.mkdir(path.dirname(file), { recursive: true })
  await fs.promises.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await fs.promises.rename(tmp, file)
}

/**
 * Read the ledger, or create and persist a new one.
 * A corrupt ledger is preserved as `<name>.corrupt-<ts>` instead of being
 * silently overwritten, because it is the only record of `T`.
 */
export async function loadLedger(file, now) {
  let raw
  try {
    raw = JSON.parse(await fs.promises.readFile(file, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') {
      const ledger = createLedger(now)
      await writeJsonAtomic(file, ledger)
      return { ledger, fresh: true, recovered: false }
    }
    try {
      await fs.promises.rename(file, `${file}.corrupt-${now}`)
    } catch { /* keep going: a new ledger is better than no plugin */ }
    const ledger = createLedger(now)
    await writeJsonAtomic(file, ledger)
    return { ledger, fresh: true, recovered: true }
  }
  return { ledger: normalizeLedger(raw, now), fresh: false, recovered: false }
}
