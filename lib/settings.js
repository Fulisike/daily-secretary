/**
 * Settings the user edits in the GUI.
 *
 * Three values that a user actually tunes — the recording cadence, the daily
 * card time, and the summarising model — live here instead of in the plugin's
 * `cordis.patch.yml`, so changing them never means editing YAML.
 *
 * Precedence: saved settings win over the row's `config`, which wins over the
 * built-in default. Saving is live: the plugin re-reads these values, so no
 * reload and no lost recording window.
 */

import fs from 'node:fs'
import path from 'node:path'
import { writeJsonAtomic } from './ledger.js'

export const SETTINGS_VERSION = 1

/** Bounds the GUI enforces and the Host refuses to go beyond. */
export const LIMITS = {
  /** 5 minutes … 6 hours. */
  deltaTSeconds: { min: 300, max: 21_600 },
  /** 2 seconds … 10 minutes between screenshots. */
  captureIntervalSeconds: { min: 2, max: 600 },
}

/** The keys the settings page may change. */
export const EDITABLE = ['captureIntervalSeconds', 'deltaTSeconds', 'dailyDigestAt', 'provider', 'model', 'summaryStyle', 'quipStyle']

/** Path of the saved settings file. */
export function settingsFile(store) {
  return path.join(store.state, 'settings.json')
}

/** Read the saved overrides; a missing or broken file is simply empty. */
export function readSettings(store) {
  try {
    const raw = JSON.parse(fs.readFileSync(settingsFile(store), 'utf8'))
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return {}
    const saved = {}
    if (Number.isFinite(raw.captureIntervalSeconds)) saved.captureIntervalSeconds = raw.captureIntervalSeconds
    if (Number.isFinite(raw.deltaTSeconds)) saved.deltaTSeconds = raw.deltaTSeconds
    if (typeof raw.dailyDigestAt === 'string') saved.dailyDigestAt = raw.dailyDigestAt
    if (typeof raw.provider === 'string' || raw.provider === null) saved.provider = raw.provider
    if (typeof raw.model === 'string' || raw.model === null) saved.model = raw.model
    if (typeof raw.summaryStyle === 'string') saved.summaryStyle = raw.summaryStyle
    if (typeof raw.quipStyle === 'string') saved.quipStyle = raw.quipStyle
    return saved
  } catch {
    return {}
  }
}

/** Persist one complete override set. */
export async function writeSettings(store, value) {
  const file = settingsFile(store)
  await writeJsonAtomic(file, { version: SETTINGS_VERSION, savedAt: Date.now(), ...value })
  return file
}

/** Forget the saved overrides so the row config applies again. */
export async function clearSettings(store) {
  try {
    await fs.promises.rm(settingsFile(store), { force: true })
    return true
  } catch {
    return false
  }
}

/**
 * Merge defaults, row config, and saved settings.
 *
 * @param {{ deltaTSeconds: number, dailyDigestAt: string, provider: string|null, model: string|null }} config
 * @param {object} saved
 */
export function effectiveSettings(config, saved) {
  return {
    captureIntervalSeconds: Number.isFinite(saved.captureIntervalSeconds)
      ? saved.captureIntervalSeconds
      : config.captureIntervalSeconds,
    deltaTSeconds: Number.isFinite(saved.deltaTSeconds) ? saved.deltaTSeconds : config.deltaTSeconds,
    dailyDigestAt: typeof saved.dailyDigestAt === 'string' ? saved.dailyDigestAt : config.dailyDigestAt,
    provider: saved.provider !== undefined ? saved.provider : config.provider,
    model: saved.model !== undefined ? saved.model : config.model,
    summaryStyle: typeof saved.summaryStyle === 'string' ? saved.summaryStyle : config.summaryStyle,
    quipStyle: typeof saved.quipStyle === 'string' ? saved.quipStyle : config.quipStyle,
  }
}

/** Validate one `HH:mm` value, returning the normalised text. */
export function normaliseClock(value) {
  if (typeof value !== 'string') return null
  const match = /^(\d{1,2}):(\d{1,2})$/.exec(value.trim())
  if (match === null) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour > 23 || minute > 59) return null
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

/**
 * Validate a patch coming from the settings page or the agent tool.
 *
 * Unknown keys are refused rather than ignored: a GUI that silently drops a
 * field is worse than one that says what it did not understand.
 *
 * @param {unknown} patch
 * @param {{ deltaTSeconds: number, dailyDigestAt: string, provider: string|null, model: string|null }} base
 * @returns {{ ok: true, value: object } | { ok: false, error: string }}
 */
export function parseSettingsPatch(patch, base) {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) {
    return { ok: false, error: '设置必须是一个对象' }
  }
  for (const key of Object.keys(patch)) {
    if (!EDITABLE.includes(key)) return { ok: false, error: `未知的设置项：${key}` }
  }

  const value = { ...base }

  if (Object.hasOwn(patch, 'captureIntervalSeconds')) {
    const seconds = patch.captureIntervalSeconds
    const limits = LIMITS.captureIntervalSeconds
    if (typeof seconds !== 'number' || !Number.isFinite(seconds) || Math.round(seconds) !== seconds) {
      return { ok: false, error: '截屏间隔必须是整数秒' }
    }
    if (seconds < limits.min || seconds > limits.max) {
      return { ok: false, error: `截屏间隔必须在 ${limits.min} 秒到 ${limits.max} 秒之间` }
    }
    value.captureIntervalSeconds = seconds
  }

  if (Object.hasOwn(patch, 'deltaTSeconds')) {
    const seconds = patch.deltaTSeconds
    if (typeof seconds !== 'number' || !Number.isFinite(seconds) || Math.round(seconds) !== seconds) {
      return { ok: false, error: '总结间隔必须是整数分钟' }
    }
    if (seconds < LIMITS.deltaTSeconds.min || seconds > LIMITS.deltaTSeconds.max) {
      return { ok: false, error: `总结间隔必须在 ${LIMITS.deltaTSeconds.min / 60} 分钟到 ${LIMITS.deltaTSeconds.max / 60} 分钟之间` }
    }
    value.deltaTSeconds = seconds
  }

  if (Object.hasOwn(patch, 'dailyDigestAt')) {
    const clock = normaliseClock(patch.dailyDigestAt)
    if (clock === null) return { ok: false, error: '每日小结时间必须写成 HH:mm，例如 21:30' }
    value.dailyDigestAt = clock
  }

  const touchesRoute = Object.hasOwn(patch, 'provider') || Object.hasOwn(patch, 'model')
  if (touchesRoute) {
    const provider = patch.provider ?? null
    const model = patch.model ?? null
    const blank = (entry) => entry === null || (typeof entry === 'string' && entry.trim() === '')
    if (blank(provider) && blank(model)) {
      value.provider = null
      value.model = null
    } else if (blank(provider) !== blank(model)) {
      return { ok: false, error: '服务商和模型要一起选，或者一起留空跟随配置档' }
    } else if (typeof provider !== 'string' || typeof model !== 'string') {
      return { ok: false, error: '服务商和模型必须是字符串' }
    } else {
      value.provider = provider.trim()
      value.model = model.trim()
    }
  }

  for (const key of ['summaryStyle', 'quipStyle']) {
    if (!Object.hasOwn(patch, key)) continue
    if (typeof patch[key] !== 'string') return { ok: false, error: `${key} 必须是字符串` }
    if (patch[key].length > 500) return { ok: false, error: `${key} 不能超过 500 个字符` }
    value[key] = patch[key].trim()
  }

  return { ok: true, value }
}
