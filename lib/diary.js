/**
 * Diary files.
 *
 * Two sets, exactly as specified:
 *
 * 1. `diary/detail/<YYYY-MM-DD>.md` — every segment, verbose, delimited by
 *    timestamped rules. Consecutive segments share their boundary rule, so the
 *    file reads as one continuous log:
 *
 *    ===============2026/11/13 19:30:04===============
 *    ...记录...
 *    ===============2026/11/13 20:30:04===============
 *
 * 2. `diary/daily/<YYYY-MM-DD>.md` — the short daily piece the desktop widget
 *    shows, rewritten whenever it is regenerated.
 */

import fs from 'node:fs'
import path from 'node:path'
import { stamp } from './paths.js'

/** The rule that opens or closes one segment. */
export function separator(ms) {
  return `===============${stamp(ms)}===============`
}

/** Read the tail of a file without loading all of it. */
function readTail(file, bytes = 4_096) {
  let handle
  try {
    const size = fs.statSync(file).size
    const length = Math.min(size, bytes)
    const buffer = Buffer.alloc(length)
    handle = fs.openSync(file, 'r')
    fs.readSync(handle, buffer, 0, length, size - length)
    return buffer.toString('utf8')
  } catch {
    return null
  } finally {
    if (handle !== undefined) {
      try { fs.closeSync(handle) } catch { /* ignore */ }
    }
  }
}

/**
 * Append one segment to its day's detailed diary.
 *
 * When the file already ends with the exact opening rule of this segment (the
 * normal case, because `T` only ever moves forward to the edge of the previous
 * segment), the rule is not repeated; the segment adds its body and its closing
 * rule.
 *
 * @param {{ detail: string }} store
 * @param {{ day: string, start: number, end: number, body: string, meta?: string }} segment
 * @returns {Promise<string>} the file written
 */
export async function appendDetailSegment(store, segment) {
  const file = path.join(store.detail, `${segment.day}.md`)
  await fs.promises.mkdir(store.detail, { recursive: true })

  const body = String(segment.body ?? '').trim()
  const meta = segment.meta ? `${segment.meta.trim()}\n\n` : ''
  const tail = readTail(file)
  const exists = tail !== null
  const opening = separator(segment.start)
  const closing = separator(segment.end)
  const continues = exists && tail.trimEnd().endsWith(opening)

  const parts = []
  if (!exists) parts.push(`# ${segment.day} · 工作记录\n\n`)
  if (!continues) parts.push(`${opening}\n\n`)
  parts.push(`${meta}${body}\n\n`)
  parts.push(`${closing}\n\n`)

  await fs.promises.appendFile(file, parts.join(''), 'utf8')
  return file
}

/**
 * Rewrite the daily digest the widget shows.
 *
 * @param {{ daily: string }} store
 * @param {{ day: string, title: string, body: string, quip?: string, generatedAt: number, segments: number }} digest
 * @returns {Promise<string>}
 */
export async function writeDailyDigest(store, digest) {
  const file = path.join(store.daily, `${digest.day}.md`)
  await fs.promises.mkdir(store.daily, { recursive: true })
  const lines = [
    `# ${digest.day} · ${digest.title.trim() || '今日工作小结'}`,
    '',
    `<sub>生成于 ${new Date(digest.generatedAt).toLocaleString()} · 覆盖 ${digest.segments} 段工作 · 由 daily-secretary 汇总</sub>`,
    '',
    digest.body.trim(),
    '',
  ]
  if (digest.quip && digest.quip.trim() !== '') {
    lines.push('---', '', `> ${digest.quip.trim()}`, '')
  }
  const content = `${lines.join('\n')}\n`
  const tmp = `${file}.${process.pid}.tmp`
  await fs.promises.writeFile(tmp, content, 'utf8')
  await fs.promises.rename(tmp, file)
  return file
}

/** Read the newest daily digest as plain text for the widget, or null. */
export async function readDailyDigest(store, day) {
  for (const candidate of [day, undefined]) {
    const file = candidate === undefined
      ? await newestDailyFile(store)
      : path.join(store.daily, `${candidate}.md`)
    if (file === null) continue
    try {
      const text = await fs.promises.readFile(file, 'utf8')
      return { day: path.basename(file, '.md'), text }
    } catch { /* try the next candidate */ }
  }
  return null
}

async function newestDailyFile(store) {
  try {
    const names = await fs.promises.readdir(store.daily)
    const days = names.filter((name) => /^\d{4}-\d{2}-\d{2}\.md$/.test(name)).sort()
    return days.length === 0 ? null : path.join(store.daily, days.at(-1))
  } catch {
    return null
  }
}

/**
 * Strip the markdown the widget cannot render into the plain text it shows.
 * The desktop widget draws text itself, so headings, emphasis, and links are
 * reduced instead of being shown as punctuation.
 */
export function toPlainText(markdown) {
  return String(markdown ?? '')
    .replace(/^#+\s*/gm, '')
    .replace(/<sub>.*?<\/sub>/g, '')
    .replace(/^---$/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s*>\s?/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
