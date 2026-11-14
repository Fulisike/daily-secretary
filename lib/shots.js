/**
 * Screenshot index.
 *
 * scrabber writes `<root>/screenshots/<YYYY-MM-DD>/<YYYY-MM-DD>T<HH.MM.SS>.png`,
 * so the capture instant is in the file name and no stat() is needed to order
 * frames. Directory listing only ever happens inside the plugin's own
 * screenshot root.
 */

import fs from 'node:fs'
import path from 'node:path'
import { DAY_DIR_RE, isInside, parseShotName, stamp } from './paths.js'

/**
 * List screenshots captured in `(from, to]`.
 *
 * @param {string} rootDir absolute path of the plugin's `screenshots` directory
 * @param {{ from: number, to: number }} range half-open window, epoch ms
 * @returns {Promise<{ from: number, to: number, files: Array<{ path: string, ms: number, day: string, size: number }> }>}
 */
export async function listShots(rootDir, { from, to }) {
  const files = []
  let days = []
  try {
    days = await fs.promises.readdir(rootDir, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') return { from, to, files }
    throw error
  }

  for (const entry of days) {
    if (!entry.isDirectory() || !DAY_DIR_RE.test(entry.name)) continue
    const dir = path.join(rootDir, entry.name)
    if (!isInside(rootDir, dir)) continue
    let names = []
    try {
      names = await fs.promises.readdir(dir)
    } catch {
      continue
    }
    for (const name of names) {
      const parsed = parseShotName(name)
      if (parsed === null) continue
      if (parsed.day !== entry.name) continue
      if (parsed.ms <= from || parsed.ms > to) continue
      const file = path.join(dir, name)
      let size = 0
      try {
        const stat = await fs.promises.lstat(file)
        if (!stat.isFile()) continue
        size = stat.size
      } catch {
        continue
      }
      files.push({ path: file, ms: parsed.ms, day: parsed.day, size })
    }
  }

  files.sort((a, b) => a.ms - b.ms)
  return { from, to, files }
}

/** Total bytes of an index. */
export function totalBytes(files) {
  let sum = 0
  for (const file of files) sum += file.size
  return sum
}

/** Human-readable window, e.g. `2026/11/13 19:30:04 → 20:30:04`. */
export function describeWindow(from, to) {
  const start = stamp(from)
  const end = stamp(to)
  if (start.slice(0, 10) === end.slice(0, 10)) return `${start} → ${end.slice(11)}`
  return `${start} → ${end}`
}

/**
 * Pick the frames sent to the model.
 *
 * An hour at a 20s interval can hold ~180 PNGs; a vision request should carry a
 * handful. Selection is deterministic: spread evenly across the window with
 * both ends pinned, then collapse neighbours whose byte size matches (scrabber
 * with `--skip-duplicates` produces equal-sized frames only when content
 * repeats), keeping the later frame so the model sees the settled state.
 *
 * @param {Array<{ ms: number, size: number }>} files ordered by time
 * @param {number} budget maximum number of frames
 * @returns {number[]} indices into `files`
 */
export function selectFrames(files, budget) {
  const count = files.length
  if (count === 0) return []
  const limit = Math.max(1, Math.min(Number(budget) || 1, count))
  if (count <= limit) return files.map((_, index) => index)
  if (limit === 1) return [Math.floor((count - 1) / 2)]

  const picked = []
  for (let i = 0; i < limit; i += 1) {
    const index = Math.round((i * (count - 1)) / (limit - 1))
    if (picked.at(-1) !== index) picked.push(index)
  }

  // Collapse equal-size neighbours but never below half the budget.
  const floor = Math.max(2, Math.ceil(limit / 2))
  const collapsed = []
  for (const index of picked) {
    const previous = collapsed.at(-1)
    if (previous !== undefined && files[previous].size === files[index].size && collapsed.length > 1) {
      collapsed[collapsed.length - 1] = index
      continue
    }
    collapsed.push(index)
  }
  return collapsed.length >= floor ? collapsed : picked
}
