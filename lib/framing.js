/**
 * Pure time-window planning for the ledger cursor `T`.
 *
 * The whole schedule of the plugin is these functions:
 *
 *   T -------- delta_T -------- T+delta_T -------- ...
 *   |<------ summarised window ------>|
 *
 * A window ends at whichever comes first of `T + deltaT` and the next local
 * midnight, so a long session still produces one record per day. Nothing here
 * touches the filesystem or the clock: callers pass `now`, which keeps the
 * behaviour testable across sleep, hibernate, and date changes.
 */

import { dayKey } from './paths.js'

const MINUTE = 60_000

/** Instant of the next local midnight strictly after `ms`. */
export function nextLocalMidnight(ms) {
  const d = new Date(ms)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0).getTime()
}

/** Instant of the local midnight that starts `ms`'s own day. */
export function localMidnight(ms) {
  const d = new Date(ms)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime()
}

/** Local `HH:mm` of one instant, used for the daily digest schedule. */
export function localClock(ms) {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Parse `HH:mm` into minutes since local midnight, or null. */
export function parseClock(text) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(text ?? '').trim())
  if (match === null) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return null
  return hour * 60 + minute
}

/** Whether the local `HH:mm` has been reached at `now` (same day). */
export function clockReached(now, minutes) {
  if (minutes === null) return false
  const d = new Date(now)
  return d.getHours() * 60 + d.getMinutes() >= minutes
}

/**
 * Next window to summarise, or null when `T` should stay put.
 *
 * The window always ends on the planned edge (`T + deltaT` or midnight), never
 * on `now`; screenshots captured after the edge belong to the following
 * window. A window shorter than `minWindowMs` is skipped so a pause one second
 * after a tick does not create a one-second record.
 *
 * @param {{ cursor: number, now: number, deltaMs: number, minWindowMs?: number }} input
 * @returns {{ start: number, end: number, reason: 'interval' | 'day' } | null}
 */
export function planWindow({ cursor, now, deltaMs, minWindowMs = MINUTE }) {
  if (!Number.isFinite(cursor) || !Number.isFinite(now) || !Number.isFinite(deltaMs) || deltaMs <= 0) return null
  if (now <= cursor) return null
  if (nextLocalMidnight(cursor) <= cursor) return null

  const intervalEdge = cursor + deltaMs
  const dayEdge = nextLocalMidnight(cursor)
  const edge = Math.min(intervalEdge, dayEdge)
  if (now < edge) return null
  if (edge - cursor < minWindowMs) return { start: cursor, end: edge, reason: edge === dayEdge ? 'day' : 'interval' }
  return { start: cursor, end: edge, reason: edge === dayEdge ? 'day' : 'interval' }
}

/**
 * The pause/boundary flush: summarise everything up to `now`.
 *
 * Used when the user pauses capture, when the daily digest is due, and when the
 * process starts again after a crash and finds screenshots newer than `T`.
 *
 * @param {{ cursor: number, now: number, minWindowMs?: number }} input
 * @returns {{ start: number, end: number } | null}
 */
export function planFlush({ cursor, now, minWindowMs = 0 }) {
  if (!Number.isFinite(cursor) || !Number.isFinite(now)) return null
  if (now <= cursor) return null
  if (now - cursor < minWindowMs) return null
  return { start: cursor, end: now }
}

/**
 * Days a window touches, in order. A catch-up window can span midnight or days
 * of suspended time; the detailed diary records every date it covers.
 *
 * @param {number} start
 * @param {number} end
 * @returns {string[]} local `YYYY-MM-DD` keys
 */
export function coveredDays(start, end) {
  const days = []
  let cursor = start
  let guard = 0
  while (guard++ < 400) {
    const key = dayKey(cursor)
    if (days.at(-1) !== key) days.push(key)
    const next = nextLocalMidnight(cursor)
    if (next > end) break
    cursor = next
  }
  return days
}
