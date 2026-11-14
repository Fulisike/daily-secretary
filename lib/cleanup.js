/**
 * Screenshot cleanup.
 *
 * This is the only module in the plugin that removes anything, and it removes
 * only files that `assertDeletableShot()` accepts: a regular file, exactly one
 * level inside the plugin's own `screenshots` directory, inside a date
 * directory, with a name scrabber itself would have written, whose name and
 * directory agree. Directories are only ever removed with a non-recursive
 * `rmdir`, so a non-empty date directory can never lose content.
 *
 * Callers must only invoke this after the segment has been summarised and the
 * summary has been persisted; a failed summary keeps its screenshots.
 */

import fs from 'node:fs'
import path from 'node:path'
import { DAY_DIR_RE, assertDeletableShot } from './paths.js'

/**
 * Delete one batch of screenshots, reporting every file it refused to touch.
 *
 * @param {{ screenshots: string, logs: string }} store
 * @param {Array<{ path: string, ms: number, size: number }>} files
 * @param {{ auditFile?: string, dryRun?: boolean }} [options]
 * @returns {{ deleted: string[], kept: Array<{ path: string, reason: string }>, bytes: number }}
 */
export function deleteScreenshots(store, files, options = {}) {
  const deleted = []
  const kept = []
  let bytes = 0
  const dryRun = options.dryRun === true

  for (const file of files) {
    const verdict = assertDeletableShot(store, file.path)
    if (verdict.ok !== true) {
      kept.push({ path: file.path, reason: verdict.reason })
      continue
    }
    if (!dryRun) {
      try {
        fs.unlinkSync(verdict.realPath)
      } catch (error) {
        kept.push({ path: file.path, reason: `unlink failed: ${error?.code ?? error?.message ?? error}` })
        continue
      }
    }
    deleted.push(verdict.realPath)
    bytes += file.size
    if (options.auditFile) appendAudit(options.auditFile, { at: Date.now(), path: verdict.realPath, bytes: file.size, capturedAt: file.ms })
  }

  if (!dryRun) removeEmptyDayDirs(store, deleted)
  return { deleted, kept, bytes }
}

/** Remove date directories left empty by a deletion. Never recursive. */
function removeEmptyDayDirs(store, deletedFiles) {
  const parents = new Set(deletedFiles.map((file) => path.dirname(file)))
  for (const dir of parents) {
    if (path.dirname(dir) !== path.resolve(store.screenshots)) continue
    if (!DAY_DIR_RE.test(path.basename(dir))) continue
    try {
      // rmdir is atomic with respect to content: it refuses a non-empty dir.
      fs.rmdirSync(dir)
    } catch { /* not empty, or already gone: leave it alone */ }
  }
}

function appendAudit(file, record) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.appendFileSync(file, `${JSON.stringify(record)}\n`, 'utf8')
  } catch { /* an audit failure must never block or undo a deletion */ }
}
