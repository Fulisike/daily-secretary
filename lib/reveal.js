/**
 * Open one of the plugin's own folders in the OS file manager.
 *
 * The caller names a folder by a fixed key, never by a path: the directory is
 * resolved from the plugin's own store, so a request from the page can only ever
 * reveal the folders this plugin owns.
 */

import { spawn } from 'node:child_process'

/** The folders the settings page may reveal. */
export const REVEAL_TARGETS = ['screenshots', 'diary']

/**
 * Command that opens a directory in the platform's file manager.
 *
 * @param {string} platform `process.platform`
 * @param {string} directory absolute directory path
 * @returns {{ command: string, args: string[] } | null} null when the platform has no known opener
 */
export function revealCommand(platform, directory) {
  if (typeof directory !== 'string' || directory === '') return null
  if (platform === 'win32') return { command: 'explorer.exe', args: [directory] }
  if (platform === 'darwin') return { command: 'open', args: [directory] }
  if (platform === 'linux') return { command: 'xdg-open', args: [directory] }
  return null
}

/**
 * Start the platform's file manager on `directory`.
 *
 * Detached and unref'd: the plugin must not wait for, or be killed with, a file
 * manager the user may keep open. `explorer.exe` reports a non-zero exit code
 * even when it succeeds, so the exit code is deliberately not checked.
 *
 * @param {string} directory
 * @param {{ platform?: string, spawner?: Function, logger?: { warn: Function } }} [options]
 * @returns {{ ok: true, command: string, directory: string } | { ok: false, error: string }}
 */
export function revealDirectory(directory, options = {}) {
  const platform = options.platform ?? process.platform
  const plan = revealCommand(platform, directory)
  if (plan === null) return { ok: false, error: `这个平台没有已知的打开方式：${platform}` }
  const run = options.spawner ?? spawn
  try {
    const child = run(plan.command, plan.args, { detached: true, stdio: 'ignore', windowsHide: false })
    child?.unref?.()
    child?.on?.('error', (error) => options.logger?.warn?.('daily-secretary: cannot open %s (%s)', directory, error?.message ?? error))
    return { ok: true, command: plan.command, directory }
  } catch (error) {
    return { ok: false, error: `打开目录失败：${error?.message ?? error}` }
  }
}
