/**
 * Plugin configuration.
 *
 * Every tunable lives here and reaches the plugin through `cordis.patch.yml`,
 * so a user's settings survive plugin upgrades. Validation is strict about
 * unknown keys: a typo in the patch should fail loudly at activation instead of
 * silently reverting to a default.
 */

const KNOWN = new Set([
  'dataDir',
  'scrabberPath',
  'captureIntervalSeconds',
  'includeCursor',
  'deltaTSeconds',
  'imageBudget',
  'minWindowSeconds',
  'provider',
  'model',
  'dailyDigestAt',
  'digestRefreshMinutes',
  'dailySummaryMaxTokens',
  'segmentMaxTokens',
  'summaryStyle',
  'quipStyle',
  'widget',
  'registerTool',
])

/** Defaults, documented one by one in docs/DETAIL.md. */
export const DEFAULTS = {
  dataDir: null,
  scrabberPath: null,
  captureIntervalSeconds: 20,
  includeCursor: true,
  deltaTSeconds: 3_600,
  imageBudget: 8,
  minWindowSeconds: 60,
  provider: null,
  model: null,
  dailyDigestAt: '21:30',
  digestRefreshMinutes: 30,
  dailySummaryMaxTokens: 2_048,
  segmentMaxTokens: 3_072,
  summaryStyle: '',
  quipStyle: '',
  widget: true,
  registerTool: true,
}

function asBoolean(value, name) {
  if (typeof value !== 'boolean') throw new Error(`daily-secretary: ${name} must be true or false`)
  return value
}

function asInteger(value, name, { min, max }) {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.round(value) !== value) {
    throw new Error(`daily-secretary: ${name} must be a whole number`)
  }
  if (value < min || value > max) throw new Error(`daily-secretary: ${name} must be between ${min} and ${max}`)
  return value
}

function asNullableString(value, name) {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') throw new Error(`daily-secretary: ${name} must be a string or null`)
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function asStyle(value, name) {
  if (typeof value !== 'string') throw new Error(`daily-secretary: ${name} must be a string`)
  if (value.length > 500) throw new Error(`daily-secretary: ${name} must be at most 500 characters`)
  return value.trim()
}

/**
 * Validate and materialise one configuration object.
 *
 * @param {unknown} raw the `config` block from `cordis.patch.yml`
 * @returns {typeof DEFAULTS} a complete configuration
 */
export function parseConfig(raw) {
  if (raw === null || raw === undefined) return { ...DEFAULTS }
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new Error('daily-secretary: config must be an object')
  for (const key of Object.keys(raw)) {
    if (!KNOWN.has(key)) throw new Error(`daily-secretary: unknown config field "${key}"`)
  }
  const config = { ...DEFAULTS }
  if (raw.dataDir !== undefined) config.dataDir = asNullableString(raw.dataDir, 'dataDir')
  if (raw.scrabberPath !== undefined) config.scrabberPath = asNullableString(raw.scrabberPath, 'scrabberPath')
  if (raw.provider !== undefined) config.provider = asNullableString(raw.provider, 'provider')
  if (raw.model !== undefined) config.model = asNullableString(raw.model, 'model')
  if (raw.captureIntervalSeconds !== undefined) {
    config.captureIntervalSeconds = asInteger(raw.captureIntervalSeconds, 'captureIntervalSeconds', { min: 1, max: 3_600 })
  }
  if (raw.includeCursor !== undefined) config.includeCursor = asBoolean(raw.includeCursor, 'includeCursor')
  if (raw.deltaTSeconds !== undefined) {
    config.deltaTSeconds = asInteger(raw.deltaTSeconds, 'deltaTSeconds', { min: 60, max: 86_400 })
  }
  if (raw.imageBudget !== undefined) config.imageBudget = asInteger(raw.imageBudget, 'imageBudget', { min: 1, max: 19 })
  if (raw.minWindowSeconds !== undefined) {
    config.minWindowSeconds = asInteger(raw.minWindowSeconds, 'minWindowSeconds', { min: 0, max: 3_600 })
  }
  if (raw.digestRefreshMinutes !== undefined) {
    config.digestRefreshMinutes = asInteger(raw.digestRefreshMinutes, 'digestRefreshMinutes', { min: 0, max: 1_440 })
  }
  if (raw.segmentMaxTokens !== undefined) {
    config.segmentMaxTokens = asInteger(raw.segmentMaxTokens, 'segmentMaxTokens', { min: 256, max: 32_768 })
  }
  if (raw.dailySummaryMaxTokens !== undefined) {
    config.dailySummaryMaxTokens = asInteger(raw.dailySummaryMaxTokens, 'dailySummaryMaxTokens', { min: 256, max: 32_768 })
  }
  if (raw.widget !== undefined) config.widget = asBoolean(raw.widget, 'widget')
  if (raw.registerTool !== undefined) config.registerTool = asBoolean(raw.registerTool, 'registerTool')
  if (raw.summaryStyle !== undefined) config.summaryStyle = asStyle(raw.summaryStyle, 'summaryStyle')
  if (raw.quipStyle !== undefined) config.quipStyle = asStyle(raw.quipStyle, 'quipStyle')
  if (raw.dailyDigestAt !== undefined) {
    if (typeof raw.dailyDigestAt !== 'string' || !/^\d{1,2}:\d{1,2}$/.test(raw.dailyDigestAt.trim())) {
      throw new Error('daily-secretary: dailyDigestAt must look like "21:30"')
    }
    const [hour, minute] = raw.dailyDigestAt.trim().split(':').map(Number)
    if (hour > 23 || minute > 59) throw new Error('daily-secretary: dailyDigestAt must be a valid local time')
    config.dailyDigestAt = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  }
  return config
}

/** Standard Schema wrapper: Cordis validates the row's config at activation. */
export const Config = {
  '~standard': {
    version: 1,
    vendor: 'daily-secretary',
    validate(raw) {
      try {
        return { value: parseConfig(raw) }
      } catch (error) {
        return { issues: [{ message: error.message }] }
      }
    },
  },
}
