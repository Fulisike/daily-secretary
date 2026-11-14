/**
 * daily-secretary — a DSH plugin that watches the user's screen through
 * scrabber, writes a verbose work diary, and keeps a round always-on-top
 * companion on the desktop.
 *
 * The plugin owns three responsibilities:
 *
 * 1. capture — supervise scrabber, writing into `<root>/screenshots`;
 * 2. record — turn windows of screenshots into diary segments using `T` from a
 *    durable ledger (see lib/framing.js for the schedule);
 * 3. present — serve the widget's loopback API and publish the daily digest.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Config, parseConfig } from './lib/config.js'
import { analyzeSegment, composeDailyDigest, fallbackDigest } from './lib/analysis.js'
import { appendDetailSegment, writeDailyDigest } from './lib/diary.js'
import { deleteScreenshots } from './lib/cleanup.js'
import { clockReached, coveredDays, parseClock, planFlush, planWindow } from './lib/framing.js'
import { loadLedger, readJsonSync, writeJsonAtomic } from './lib/ledger.js'
import { dayKey, ensureStore, resolveStore, stamp } from './lib/paths.js'
import { CaptureRunner, locateScrabber } from './lib/scrabber.js'
import { startWidgetServer } from './lib/server.js'
import { listShots } from './lib/shots.js'
import { REVEAL_TARGETS, revealDirectory } from './lib/reveal.js'
import { clearSettings, effectiveSettings, parseSettingsPatch, readSettings, writeSettings, LIMITS as SETTINGS_LIMITS } from './lib/settings.js'
import { WidgetRunner, locateWidget } from './lib/widget.js'

export const name = 'daily-secretary'
export const inject = ['llm']
export { Config }

const TICK_MS = 15_000
const DIGEST_POLL_MS = 30_000

/** Plugin package directory; the default storage root lives here. */
const PLUGIN_DIR = fs.realpathSync(path.dirname(fileURLToPath(import.meta.url)))

/** A logger that also keeps a file trail next to the data. */
function createLogger(ctx, logsDir, label = 'daily-secretary') {
  const file = path.join(logsDir, 'secretary.log')
  const ring = []

  const write = (level, message, args) => {
    let formatted = message
    for (const value of args) formatted = formatted.replace('%s', String(value))
    const line = `${new Date().toISOString()} ${level.toUpperCase()} ${formatted}`
    ring.push(line)
    if (ring.length > 200) ring.shift()
    try {
      fs.mkdirSync(logsDir, { recursive: true })
      fs.appendFileSync(file, `${line}\n`, 'utf8')
    } catch { /* the console logger below still works */ }
    const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info'
    try {
      ctx.logger?.[method]?.(`${label}: ${formatted}`)
    } catch { /* never let logging break the plugin */ }
  }

  return {
    info: (message, ...args) => write('info', message, args),
    warn: (message, ...args) => write('warn', message, args),
    error: (message, ...args) => write('error', message, args),
    recent: () => ring.slice(-40),
  }
}



/** The profile's current model, read through DSH's own service. */
function profileSelection(ctx) {
  try {
    const selection = ctx.get('agentDefaultModel')?.currentSelection?.()
    return {
      provider: typeof selection?.provider === 'string' ? selection.provider : selection?.route?.provider,
      model: typeof selection?.model === 'string' ? selection.model : selection?.route?.model,
    }
  } catch {
    return { provider: undefined, model: undefined }
  }
}

class Secretary {
  constructor(ctx, config, logger) {
    this.ctx = ctx
    this.config = config
    this.logger = logger
    // The row config as loaded, kept so "reset" can return to it.
    this.defaults = {
      captureIntervalSeconds: config.captureIntervalSeconds,
      deltaTSeconds: config.deltaTSeconds,
      dailyDigestAt: config.dailyDigestAt,
      provider: config.provider,
      model: config.model,
    }
    this.store = resolveStore({ rootDir: config.dataDir ?? PLUGIN_DIR })
    ensureStore(this.store)

    this.lifetime = new AbortController()
    this.ledger = null
    this.route = null
    this.routeSource = null
    this.routeVision = null
    this.settingsOrigin = 'config'
    this.modelCache = null
    this.routeDisposer = null
    this.webOrigin = null
    this.runner = null
    this.captureMissing = null
    this.widget = null
    this.server = null
    this.busy = false
    this.failureStreak = 0
    this.nextRetryAt = 0
    this.widgetRetryAt = 0
    this.digestRetryAt = 0
    this.timers = []
    this.disposed = false
    this.busy = false
  }

  get ledgerFile() {
    return path.join(this.store.state, 'ledger.json')
  }

  get notesDir() {
    return this.store.notes
  }

  // ---------------------------------------------------------------- lifecycle

  async start() {
    const now = Date.now()
    const { ledger, recovered, fresh } = await loadLedger(this.ledgerFile, now)
    this.ledger = ledger
    if (recovered) this.logger.warn('daily-secretary: the ledger was unreadable and has been rebuilt')

    // Values saved from the settings page win over the row's config, which wins
    // over the built-in default.
    const saved = readSettings(this.store)
    const effective = effectiveSettings(this.config, saved)
    this.config.captureIntervalSeconds = effective.captureIntervalSeconds
    this.config.deltaTSeconds = effective.deltaTSeconds
    this.config.dailyDigestAt = effective.dailyDigestAt
    this.config.provider = effective.provider
    this.config.model = effective.model
    this.settingsOrigin = Object.keys(saved).length > 0 ? 'gui' : 'config'

    await this.#resolveRoute()

    const scrabberPath = locateScrabber({ configured: this.config.scrabberPath, pluginDir: PLUGIN_DIR })
    if (scrabberPath === null) {
      this.captureMissing = 'bundled scrabber executable not found — reinstall daily-secretary'
      this.logger.error('daily-secretary: %s', this.captureMissing)
    } else {
      this.logger.info('daily-secretary: scrabber at %s', scrabberPath)
      this.runner = new CaptureRunner({
        scrabberPath,
        screenshotsDir: this.store.screenshots,
        intervalSeconds: this.config.captureIntervalSeconds,
        cursor: this.config.includeCursor,
        logger: this.logger,
        logFile: path.join(this.store.logs, 'scrabber.log'),
      })
    }

    // Show the dot before any model call: a catch-up summary can take half a
    // minute, and the user should see the companion appear immediately.
    await this.#startWidget()
    this.#registerSettingsRoute()

    await this.#recover(now)
    if (this.ledger.capture === 'recording') this.#ensureCapture()
    else if (fresh) this.logger.info('daily-secretary: starting paused — click the dot to begin recording')
    else this.logger.info('daily-secretary: capture stays paused, as the user left it')

    await this.#catchUpDigests(now)
    this.#schedule()
    this.#watchWidget(Date.now())
    this.logger.info('daily-secretary: ready (T=%s)', stamp(this.ledger.cursor))
  }

  /**
   * A day whose work was recorded but whose daily piece was never written —
   * because the Harness was closed before the digest time — gets its piece now,
   * before today's work starts pushing it out of sight.
   */
  async #catchUpDigests(now) {
    const today = dayKey(now)
    for (let back = 2; back >= 1; back -= 1) {
      const day = dayKey(now - back * 86_400_000)
      if (day === today) continue
      if (this.readNotes(day).length === 0) continue
      if (fs.existsSync(path.join(this.store.daily, `${day}.md`))) continue
      this.logger.info('daily-secretary: writing the missed daily piece for %s', day)
      await this.#produceDigest({ day, reason: 'catchup', now })
    }
  }

  /**
   * Startup reconciliation.
   *
   * If `T` survived from an earlier run and screenshots are newer than it, the
   * machine was asleep, the process crashed, or the user simply closed the
   * Harness: everything since `T` is summarised once, across any date change,
   * exactly as specified.
   */
  async #recover(now) {
    const ledger = this.ledger
    if (ledger.cursor > now) {
      this.logger.warn('daily-secretary: ledger cursor was in the future; resetting it')
      ledger.cursor = now
    }
    const pending = await listShots(this.store.screenshots, { from: ledger.cursor, to: now })
    if (pending.files.length === 0) {
      ledger.cursor = now
      ledger.cursorDay = dayKey(now)
      await this.#persist()
      return
    }
    this.logger.info(
      'daily-secretary: resuming with %s unsent screenshots since %s',
      pending.files.length,
      stamp(ledger.cursor),
    )
    await this.#summarize({ start: ledger.cursor, end: now, reason: 'resume' })
  }

  /**
   * Pick the summarising model through DSH's own services.
   *
   * The route is either the one the user configured or the profile's current
   * model, and it is checked against the live `llm` registry — that registry is
   * the running DSH version's own list of what exists, so a model added,
   * renamed, or retired by a DSH upgrade is handled here without this plugin
   * knowing any model name itself.
   */
  async #resolveRoute() {
    const profile = profileSelection(this.ctx)
    let provider = this.config.provider ?? profile.provider
    let model = this.config.model ?? profile.model
    let source = this.config.provider !== null || this.config.model !== null ? 'config' : 'profile'

    if (typeof provider !== 'string' || provider === '' || typeof model !== 'string' || model === '') {
      this.logger.error('daily-secretary: no model route; set provider and model in the plugin config')
      return null
    }

    const fallBack = (why) => {
      if (source !== 'config') return false
      if (typeof profile.provider !== 'string' || typeof profile.model !== 'string') return false
      provider = profile.provider
      model = profile.model
      source = 'profile-fallback'
      this.logger.warn('daily-secretary: %s; falling back to the profile model %s / %s', why, provider, model)
      return true
    }

    try {
      const providers = await this.ctx.llm.listProviders?.()
      if (Array.isArray(providers) && providers.length > 0) {
        const known = providers.map((entry) => entry.id).filter((id) => typeof id === 'string')
        if (!known.includes(provider) && !fallBack(`provider "${provider}" is not registered (known: ${known.join(', ')})`)) {
          this.logger.error('daily-secretary: provider "%s" is not registered (known: %s)', provider, known.join(', '))
          return null
        }
      }
      const models = await this.ctx.llm.listModels?.(provider)
      if (Array.isArray(models) && models.length > 0) {
        const known = models.map((entry) => entry.id).filter((id) => typeof id === 'string')
        if (!known.includes(model) && !fallBack(`model "${model}" is not offered by ${provider} (known: ${known.slice(0, 16).join(', ')})`)) {
          this.logger.error('daily-secretary: model "%s" is not offered by %s (known: %s)', model, provider, known.slice(0, 16).join(', '))
          return null
        }
      }
    } catch (error) {
      this.logger.warn('daily-secretary: cannot validate the model route (%s)', error?.message ?? error)
    }

    // Image input is what turns screenshots into a record; say so up front.
    let vision = null
    try {
      const info = await this.ctx.llm.resolveModelInfo?.(provider, model)
      if (Array.isArray(info?.inputModalities)) vision = info.inputModalities.includes('image')
    } catch { /* adapters without capability lookup keep `null` */ }

    this.route = { provider, model }
    this.routeSource = source
    this.routeVision = vision
    if (vision === false) {
      this.logger.warn(
        'daily-secretary: %s / %s accepts no images, so records will be timeline-only; configure a vision model to read the screens',
        provider,
        model,
      )
    } else {
      this.logger.info(
        'daily-secretary: summarising with %s / %s (%s%s)',
        provider,
        model,
        source,
        vision === true ? ', image input' : '',
      )
    }
    return this.route
  }

  // ----------------------------------------------------------------- settings

  /** Refuse a route DSH does not actually offer, with the list of what it does. */
  async #checkRoute(provider, model) {
    try {
      const providers = await this.ctx.llm.listProviders?.()
      const known = Array.isArray(providers) ? providers.map((entry) => entry.id).filter((id) => typeof id === 'string') : []
      if (known.length > 0 && !known.includes(provider)) {
        return `没有这个服务商：${provider}（可用：${known.join('、')}）`
      }
      const models = await this.ctx.llm.listModels?.(provider)
      const ids = Array.isArray(models) ? models.map((entry) => entry.id).filter((id) => typeof id === 'string') : []
      if (ids.length > 0 && !ids.includes(model)) {
        return `服务商 ${provider} 下没有模型 ${model}（可用：${ids.slice(0, 10).join('、')}）`
      }
      return null
    } catch (error) {
      // A registry hiccup must not block saving a value the user chose.
      this.logger.warn('daily-secretary: cannot check the route (%s)', error?.message ?? error)
      return null
    }
  }

  /** Providers and models for the settings page, cached briefly. */
  async #modelCatalog() {
    const now = Date.now()
    if (this.modelCache !== null && now - this.modelCache.at < 30_000) return this.modelCache.value
    const catalog = []
    try {
      const providers = await this.ctx.llm.listProviders?.() ?? []
      for (const entry of providers) {
        if (typeof entry?.id !== 'string') continue
        let models = []
        try {
          models = await this.ctx.llm.listModels?.(entry.id) ?? []
        } catch {
          models = []
        }
        catalog.push({
          provider: entry.id,
          name: typeof entry.name === 'string' ? entry.name : entry.id,
          models: models
            .filter((model) => typeof model?.id === 'string')
            .map((model) => ({
              id: model.id,
              name: typeof model.name === 'string' ? model.name : model.id,
              image: Array.isArray(model.inputModalities) ? model.inputModalities.includes('image') : null,
            })),
        })
      }
    } catch (error) {
      this.logger.warn('daily-secretary: cannot list models (%s)', error?.message ?? error)
    }
    this.modelCache = { at: now, value: catalog }
    return catalog
  }

  /**
   * Save and apply settings from the GUI or the agent tool.
   *
   * The change is live: cadence, the daily time, and the model are re-read from
   * `config`, so nothing restarts and no recording window is lost.
   */
  async applySettings(patch) {
    if (this.ledger === null) return { ok: false, error: '插件还没启动完' }
    const base = {
      captureIntervalSeconds: this.config.captureIntervalSeconds,
      deltaTSeconds: this.config.deltaTSeconds,
      dailyDigestAt: this.config.dailyDigestAt,
      provider: this.config.provider,
      model: this.config.model,
    }
    const parsed = parseSettingsPatch(patch, base)
    if (parsed.ok !== true) return { ok: false, error: parsed.error }

    if (parsed.value.provider !== null && parsed.value.model !== null) {
      const problem = await this.#checkRoute(parsed.value.provider, parsed.value.model)
      if (problem !== null) return { ok: false, error: problem }
    }

    try {
      await writeSettings(this.store, parsed.value)
    } catch (error) {
      return { ok: false, error: `保存失败：${error?.message ?? error}` }
    }

    const intervalChanged = parsed.value.captureIntervalSeconds !== this.config.captureIntervalSeconds
    this.config.captureIntervalSeconds = parsed.value.captureIntervalSeconds
    this.config.deltaTSeconds = parsed.value.deltaTSeconds
    this.config.dailyDigestAt = parsed.value.dailyDigestAt
    this.config.provider = parsed.value.provider
    this.config.model = parsed.value.model
    this.settingsOrigin = 'gui'
    if (intervalChanged) await this.#restartCaptureIfRunning()
    await this.#resolveRoute()
    this.logger.info(
      'daily-secretary: settings saved (每 %ss 截屏, ΔT=%ss, daily %s, model %s)',
      parsed.value.captureIntervalSeconds,
      parsed.value.deltaTSeconds,
      parsed.value.dailyDigestAt,
      parsed.value.provider === null ? 'profile default' : `${parsed.value.provider} / ${parsed.value.model}`,
    )
    return { ok: true, snapshot: await this.settingsSnapshot() }
  }

  /**
   * scrabber takes its interval as a launch argument, so a live change means one
   * restart. Screenshots already captured stay in the open window.
   */
  async #restartCaptureIfRunning() {
    if (this.runner === null) return
    this.runner.intervalSeconds = this.config.captureIntervalSeconds
    if (!this.runner.running) return
    this.logger.info('daily-secretary: restarting scrabber for the new interval (%ss)', this.config.captureIntervalSeconds)
    await this.runner.stop()
    if (this.ledger?.capture === 'recording') this.runner.start()
  }

  /** Drop the saved overrides so the row config applies again. */
  async resetSettings() {
    if (this.ledger === null) return { ok: false, error: '插件还没启动完' }
    await clearSettings(this.store)
    this.config.captureIntervalSeconds = this.defaults.captureIntervalSeconds
    this.config.deltaTSeconds = this.defaults.deltaTSeconds
    this.config.dailyDigestAt = this.defaults.dailyDigestAt
    this.config.provider = this.defaults.provider
    this.config.model = this.defaults.model
    this.settingsOrigin = 'config'
    await this.#restartCaptureIfRunning()
    await this.#resolveRoute()
    this.logger.info('daily-secretary: settings reset to the plugin config')
    return { ok: true, snapshot: await this.settingsSnapshot() }
  }

  /**
   * Reveal one of the plugin's own folders in the OS file manager.
   *
   * `target` is a key, not a path: the directory comes from the plugin store, so
   * the page cannot ask for any other place on disk.
   */
  openFolder(target) {
    if (!REVEAL_TARGETS.includes(target)) {
      return { ok: false, error: `只能打开 ${REVEAL_TARGETS.join(' 或 ')}` }
    }
    const directory = target === 'screenshots' ? this.store.screenshots : this.store.diary
    try {
      fs.mkdirSync(directory, { recursive: true })
    } catch (error) {
      return { ok: false, error: `目录不存在且无法创建：${error?.message ?? error}` }
    }
    const result = revealDirectory(directory, { logger: this.logger })
    if (result.ok === true) this.logger.info('daily-secretary: opened %s', directory)
    return result
  }

  /** Everything the settings page shows. */
  async settingsSnapshot() {
    const day = dayKey(Date.now())
    const shots = await listShots(this.store.screenshots, { from: 0, to: Date.now() })
    return {
      ok: true,
      settings: {
        captureIntervalSeconds: this.config.captureIntervalSeconds,
        deltaTSeconds: this.config.deltaTSeconds,
        dailyDigestAt: this.config.dailyDigestAt,
        provider: this.config.provider,
        model: this.config.model,
      },
      dirs: {
        screenshots: this.store.screenshots,
        diary: this.store.diary,
      },
      origin: this.settingsOrigin,
      limits: SETTINGS_LIMITS,
      profile: profileSelection(this.ctx),
      route: this.route,
      routeSource: this.routeSource,
      vision: this.routeVision,
      models: await this.#modelCatalog(),
      capture: this.captureState,
      status: {
        day,
        segments: this.readNotes(day).length,
        lastSummaryAt: this.ledger?.lastSummaryAt ?? null,
        pendingShots: shots.files.length,
        lastError: this.ledger?.stats?.lastError ?? null,
      },
      store: this.store.root,
      notice: this.captureMissing,
    }
  }

  /**
   * Serve the settings page.
   *
   * DSH already serves this page from its own origin, so the route lives there
   * instead of on a second port: same-origin fetches need no CORS grant, and a
   * write has to name this origin, which keeps other local pages out.
   *
   * A handler route, not a resource route: the carrier answers a resource with
   * GET/HEAD only, and this page has to write.
   */
  #registerSettingsRoute() {
    const server = this.ctx.get('webServer')
    if (server === undefined || typeof server.register !== 'function') {
      this.logger.warn('daily-secretary: this profile has no web server, so the settings page cannot load')
      return
    }
    try {
      this.webOrigin = server.getOrigin()
    } catch {
      this.webOrigin = null
    }
    this.routeDisposer = server.register({
      kind: 'prefix',
      path: '/daily-secretary',
      handler: (request, response) => this.#handleSettingsRequest(request, response),
    })
    this.logger.info('daily-secretary: settings API on %s/daily-secretary/settings', this.webOrigin ?? '')
  }

  #handleSettingsRequest(request, response) {
    const send = (body, status = 200) => {
      const text = JSON.stringify(body)
      try {
        if (response.headersSent) {
          response.end()
          return
        }
        response.writeHead(status, {
          'content-type': 'application/json; charset=utf-8',
          'content-length': Buffer.byteLength(text),
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
        })
        response.end(request.method === 'HEAD' ? undefined : text)
      } catch { /* the page went away */ }
    }

    let url
    try {
      url = new URL(request.url ?? '/', 'http://127.0.0.1')
    } catch {
      return send({ ok: false, error: 'bad request url' }, 400)
    }
    if (url.pathname === '/daily-secretary/open') {
      if (request.method !== 'POST') {
        try {
          response.writeHead(405, { allow: 'POST' })
          response.end()
        } catch { /* ignore */ }
        return
      }
      const origin = request.headers.origin
      if (this.webOrigin !== null && typeof origin === 'string' && origin !== this.webOrigin) {
        return send({ ok: false, error: 'cross-origin request refused' }, 403)
      }
      const chunks = []
      let size = 0
      request.on('data', (chunk) => {
        size += chunk.length
        if (size > 4_096) {
          request.destroy()
          return
        }
        chunks.push(chunk)
      })
      request.on('error', () => { /* client hung up */ })
      request.on('end', () => {
        let body = {}
        try {
          const text = Buffer.concat(chunks).toString('utf8').trim()
          body = text === '' ? {} : JSON.parse(text)
        } catch {
          return send({ ok: false, error: '请求体必须是 JSON' }, 400)
        }
        try {
          const result = this.openFolder(body?.target)
          send(result, result.ok === true ? 200 : 400)
        } catch (error) {
          this.logger.warn('daily-secretary: cannot open the folder (%s)', error?.message ?? error)
          send({ ok: false, error: String(error?.message ?? error) }, 500)
        }
      })
      return
    }
    if (url.pathname !== '/daily-secretary/settings' && url.pathname !== '/daily-secretary/settings/') {
      return send({ ok: false, error: 'not found' }, 404)
    }

    if (request.method === 'GET' || request.method === 'HEAD') {
      this.settingsSnapshot()
        .then((snapshot) => send(snapshot))
        .catch((error) => {
          this.logger.warn('daily-secretary: settings read failed (%s)', error?.message ?? error)
          send({ ok: false, error: '读取设置失败' }, 500)
        })
      return
    }

    if (request.method !== 'POST') {
      try {
        response.writeHead(405, { allow: 'GET, HEAD, POST' })
        response.end()
      } catch { /* ignore */ }
      return
    }

    const origin = request.headers.origin
    if (this.webOrigin !== null && typeof origin === 'string' && origin !== this.webOrigin) {
      return send({ ok: false, error: 'cross-origin request refused' }, 403)
    }

    const chunks = []
    let size = 0
    request.on('data', (chunk) => {
      size += chunk.length
      if (size > 16_384) {
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('error', () => { /* client hung up */ })
    request.on('end', () => {
      let patch
      try {
        const text = Buffer.concat(chunks).toString('utf8').trim()
        patch = text === '' ? {} : JSON.parse(text)
      } catch {
        return send({ ok: false, error: '请求体必须是 JSON' }, 400)
      }
      const run = patch !== null && typeof patch === 'object' && patch.reset === true
        ? this.resetSettings()
        : this.applySettings(patch)
      run
        .then((result) => send(result, result.ok === true ? 200 : 400))
        .catch((error) => {
          this.logger.warn('daily-secretary: settings write failed (%s)', error?.message ?? error)
          send({ ok: false, error: String(error?.message ?? error) }, 500)
        })
    })
  }

  #schedule() {
    const tick = setInterval(() => {
      this.#tick().catch((error) => this.logger.error('daily-secretary: tick failed (%s)', error?.message ?? error))
    }, TICK_MS)
    tick.unref?.()
    const digest = setInterval(() => {
      this.#digestTick().catch((error) => this.logger.error('daily-secretary: digest tick failed (%s)', error?.message ?? error))
    }, DIGEST_POLL_MS)
    digest.unref?.()
    this.timers.push(tick, digest)
    this.#tick().catch(() => {})
  }

  async dispose() {
    this.disposed = true
    for (const timer of this.timers) clearInterval(timer)
    this.timers = []
    this.lifetime.abort()
    await this.runner?.stop().catch(() => {})
    this.runner?.dispose()
    this.widget?.stop()
    try { this.routeDisposer?.() } catch { /* already gone */ }
    this.routeDisposer = null
    await this.server?.close().catch(() => {})
    this.server = null
  }

  // ------------------------------------------------------------------ capture

  #ensureCapture() {
    if (this.runner === null) return
    if (this.runner.running) return
    this.runner.start()
  }

  get captureState() {
    if (this.captureMissing !== null) return 'unavailable'
    if (this.ledger?.capture === 'paused') return 'paused'
    if (this.runner === null) return 'unavailable'
    return 'recording'
  }

  /** Pause: stop capture, then flush everything captured so far. */
  async pause(reason = 'user') {
    if (this.ledger === null) return { ok: false, error: 'not ready' }
    if (this.ledger.capture === 'paused') return { ok: true, state: this.#state() }
    this.ledger.capture = 'paused'
    await this.#persist()
    await this.runner?.stop()
    const now = Date.now()
    const window = planFlush({ cursor: this.ledger.cursor, now })
    if (window !== null) await this.#summarize({ ...window, reason: `pause:${reason}` })
    else {
      this.ledger.cursor = now
      this.ledger.cursorDay = dayKey(now)
      await this.#persist()
    }
    this.logger.info('daily-secretary: capture paused (%s)', reason)
    return { ok: true, state: this.#state() }
  }

  /** Resume: pending screenshots are caught up first, then `T` becomes now. */
  async resume(reason = 'user') {
    if (this.ledger === null) return { ok: false, error: 'not ready' }
    const now = Date.now()
    this.ledger.capture = 'recording'
    await this.#persist()
    const pending = await listShots(this.store.screenshots, { from: this.ledger.cursor, to: now })
    if (pending.files.length > 0) {
      await this.#summarize({ start: this.ledger.cursor, end: now, reason: `resume:${reason}` })
    }
    this.ledger.cursor = now
    this.ledger.cursorDay = dayKey(now)
    await this.#persist()
    this.#ensureCapture()
    this.logger.info('daily-secretary: capture resumed (%s), T=%s', reason, stamp(now))
    return { ok: true, state: this.#state() }
  }

  // ---------------------------------------------------------------- recording

  async #tick() {
    if (this.disposed || this.ledger === null || this.busy) return
    this.ledger.lastTickAt = Date.now()
    const now = Date.now()

    this.#watchWidget(now)

    if (this.ledger.capture === 'recording') {
      this.#ensureCapture()
      const window = planWindow({
        cursor: this.ledger.cursor,
        now,
        deltaMs: this.config.deltaTSeconds * 1_000,
        minWindowMs: this.config.minWindowSeconds * 1_000,
      })
      if (window !== null) {
        await this.#summarize({ ...window, reason: window.reason })
        return
      }
    } else if (this.ledger.cursor < now - this.config.minWindowSeconds * 1_000 && now >= this.nextRetryAt) {
      // A paused plugin still owes a record for the tail it has not summarised.
      const window = planFlush({ cursor: this.ledger.cursor, now })
      if (window !== null) await this.#summarize({ ...window, reason: 'pause-retry' })
    }
  }

  /** Bring the desktop companion back if it ever went away. */
  #watchWidget(now) {
    if (this.widget === null || !this.widget.enabled) return
    if (this.widget.snapshot().running) return
    if (now < this.widgetRetryAt) return
    this.widgetRetryAt = now + 15_000
    this.logger.warn('daily-secretary: desktop widget is gone; restarting it')
    this.widget.start()
  }

  /**
   * Summarise one window, then release its screenshots.
   *
   * Order matters: the diary is written first, the ledger is advanced second,
   * and only then are files deleted, so a failure at any step keeps the
   * evidence on disk.
   */
  async #summarize({ start, end, reason }) {
    const shots = await listShots(this.store.screenshots, { from: start, to: end })

    if (shots.files.length === 0) {
      this.ledger.cursor = end
      this.ledger.cursorDay = dayKey(end)
      await this.#persist()
      this.logger.info('daily-secretary: window %s had no screenshots (%s)', stamp(start), reason)
      return { skipped: true }
    }

    if (this.route === null) {
      this.logger.warn('daily-secretary: keeping %s screenshots; no model route configured', shots.files.length)
      return { skipped: true, reason: 'no route' }
    }

    this.busy = true
    try {
      const days = coveredDays(start, end)
      const result = await analyzeSegment({
        llm: this.ctx.llm,
        attachments: this.ctx.get('attachments'),
        route: this.route,
        files: shots.files,
        start,
        end,
        days,
        budget: this.config.imageBudget,
        maxTokens: this.config.segmentMaxTokens,
        signal: this.lifetime.signal,
        logger: this.logger,
      })

      const day = dayKey(start)
      const file = await appendDetailSegment(this.store, {
        day,
        start,
        end,
        meta: `> ${result.meta}${days.length > 1 ? ` · 跨越 ${days.join('、')}` : ''}`,
        body: result.detail,
      })

      await this.#appendNote(day, {
        from: start,
        to: end,
        days,
        highlights: result.highlights,
        quip: result.quip,
      })

      this.ledger.cursor = end
      this.ledger.cursorDay = dayKey(end)
      this.ledger.lastSummaryAt = Date.now()
      this.ledger.stats.segments += 1
      this.ledger.stats.lastError = null
      await this.#persist()
      this.failureStreak = 0
      this.nextRetryAt = 0

      const removal = deleteScreenshots(this.store, shots.files, {
        auditFile: path.join(this.store.logs, 'deletions.jsonl'),
      })
      this.ledger.stats.deletedShots += removal.deleted.length
      await this.#persist()

      for (const kept of removal.kept) {
        this.logger.warn('daily-secretary: kept %s (%s)', kept.path, kept.reason)
      }
      this.logger.info(
        'daily-secretary: recorded %s → %s (%s), %s shots summarised, %s deleted',
        stamp(start),
        stamp(end),
        reason,
        shots.files.length,
        removal.deleted.length,
      )
      return { file, ...result, deleted: removal.deleted.length }
    } catch (error) {
      this.failureStreak += 1
      this.nextRetryAt = Date.now() + Math.min(15 * 60_000, 60_000 * this.failureStreak)
      this.ledger.stats.failures += 1
      this.ledger.stats.lastError = String(error?.message ?? error)
      await this.#persist()
      this.logger.error('daily-secretary: summary failed, screenshots kept (%s)', error?.message ?? error)
      return { skipped: true, reason: 'error' }
    } finally {
      this.busy = false
    }
  }

  // -------------------------------------------------------------------- diary

  #notesFile(day) {
    return path.join(this.notesDir, `${day}.json`)
  }

  readNotes(day) {
    const value = readJsonSync(this.#notesFile(day), [])
    return Array.isArray(value) ? value : []
  }

  async #appendNote(day, note) {
    const notes = this.readNotes(day)
    notes.push(note)
    await writeJsonAtomic(this.#notesFile(day), notes)
  }

  // ------------------------------------------------------------------- digest

  async #digestTick() {
    if (this.disposed || this.ledger === null || this.busy) return
    const now = Date.now()
    const day = dayKey(now)
    const minutes = parseClock(this.config.dailyDigestAt)
    const reached = clockReached(now, minutes)
    if (now < this.digestRetryAt) return

    if (reached && this.ledger.digestDay !== day) {
      await this.#produceDigest({ day, reason: 'scheduled', now })
      return
    }
    if (this.ledger.digestDay === day && this.ledger.digestAt !== null) {
      const notes = this.readNotes(day)
      const hasNewer = notes.length > 0 && (notes.at(-1)?.to ?? 0) > this.ledger.digestAt
      const stale = now - this.ledger.digestAt > this.config.digestRefreshMinutes * 60_000
      if (hasNewer && stale) await this.#produceDigest({ day, reason: 'refresh', now })
    }
  }

  /**
   * Generate the day's short piece.
   *
   * The pending window is flushed first so the digest includes everything up to
   * now, then the day's collected highlights are folded into one short text the
   * widget shows.
   */
  async #produceDigest({ day, reason, now }) {
    const notes = this.readNotes(day)
    if (notes.length === 0) {
      this.logger.info('daily-secretary: no work recorded for %s, skipping the daily piece', day)
      this.ledger.digestDay = day
      this.ledger.digestAt = now
      await this.#persist()
      return null
    }

    if (this.ledger.capture === 'recording') {
      const window = planFlush({ cursor: this.ledger.cursor, now })
      if (window !== null && window.end - window.start >= this.config.minWindowSeconds * 1_000) {
        await this.#summarize({ ...window, reason: 'digest' })
      }
    }

    if (this.route === null) return null
    const todayNotes = this.readNotes(day)
    if (todayNotes.length === 0) return null

    this.busy = true
    try {
      const digest = await composeDailyDigest({
        llm: this.ctx.llm,
        route: this.route,
        day,
        segments: todayNotes,
        maxTokens: this.config.dailySummaryMaxTokens,
        signal: this.lifetime.signal,
      })
      await writeDailyDigest(this.store, {
        day,
        title: digest.title,
        body: digest.body,
        quip: digest.quip,
        generatedAt: now,
        segments: todayNotes.length,
      })
      this.ledger.digestDay = day
      this.ledger.digestAt = now
      if (reason === 'scheduled' || reason === 'manual') this.ledger.panelAt = now
      await this.#persist()
      this.logger.info('daily-secretary: daily piece ready for %s (%s)', day, reason)
      return digest
    } catch (error) {
      // Never leave the card blank: fall back to a card built from the recorded
      // highlights, and try the model again on the next refresh window.
      this.digestRetryAt = now + 10 * 60_000
      const fallback = fallbackDigest(todayNotes)
      await writeDailyDigest(this.store, {
        day,
        title: fallback.title,
        body: fallback.body,
        quip: fallback.quip,
        generatedAt: now,
        segments: todayNotes.length,
      })
      this.ledger.digestDay = day
      this.ledger.digestAt = now
      if (reason === 'scheduled' || reason === 'manual') this.ledger.panelAt = now
      await this.#persist()
      this.logger.error('daily-secretary: daily piece fell back to highlights (%s)', error?.message ?? error)
      return fallback
    } finally {
      this.busy = false
    }
  }

  // ---------------------------------------------------------------- presenting

  async #startWidget() {
    if (!this.config.widget) return
    const binaryPath = locateWidget({ rootDir: PLUGIN_DIR })
    if (binaryPath === null) {
      this.logger.warn('daily-secretary: bundled desktop widget executable not found; reinstall daily-secretary')
      return
    }
    this.server = await startWidgetServer({
      getState: () => this.#state(),
      onAction: (action, payload) => this.#action(action, payload),
      logger: this.logger,
    })
    this.widget = new WidgetRunner({
      binaryPath,
      endpoint: { origin: this.server.origin, token: this.server.token },
      placementFile: path.join(this.store.state, 'widget.json'),
      pidFile: path.join(this.store.state, 'widget-pid.json'),
      logger: this.logger,
    })
    this.widget.start()
  }

  /** What the desktop widget renders. */
  #state() {
    const day = dayKey(Date.now())
    const notes = this.readNotes(day)
    const latest = this.#latestDaily()
    return {
      v: 1,
      capture: this.captureState,
      notice: this.captureMissing,
      day,
      segments: notes.length,
      digest: latest === null
        ? null
        : { day: latest.day, title: latest.title, text: latest.text, generatedAt: latest.generatedAt },
      // Advances only when a piece is generated on the daily schedule or on
      // request, so the widget opens the card once per generation and remembers
      // that it did — a background refresh never re-opens a card the user closed.
      openPanelAt: this.ledger?.panelAt ?? 0,
      lastSummaryAt: this.ledger?.lastSummaryAt ?? null,
      now: Date.now(),
    }
  }

  /** Newest daily digest, read from disk so a restart still shows it. */
  #latestDaily() {
    try {
      const files = fs.readdirSync(this.store.daily)
        .filter((file) => /^\d{4}-\d{2}-\d{2}\.md$/.test(file))
        .sort()
      if (files.length === 0) return null
      const file = files.at(-1)
      const raw = fs.readFileSync(path.join(this.store.daily, file), 'utf8')
      const lines = raw.split(/\r?\n/)
      const titleLine = lines.find((line) => line.startsWith('# ')) ?? ''
      const body = lines
        .filter((line) => !line.startsWith('# ') && !line.startsWith('<sub>') && !line.startsWith('---') && !line.startsWith('> '))
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
      return {
        day: file.replace(/\.md$/, ''),
        title: titleLine.replace(/^#\s*/, '').replace(/^[^·]*·\s*/, '').trim() || '今日小结',
        text: body,
        generatedAt: this.ledger?.digestAt ?? 0,
      }
    } catch {
      return null
    }
  }

  async #action(action, payload) {
    switch (action) {
      case 'pause':
        return this.pause('widget')
      case 'resume':
        return this.resume('widget')
      case 'record': {
        // "Summarise what you have right now" without waiting for the edge.
        if (this.ledger === null) return { ok: false, error: 'not ready' }
        const now = Date.now()
        await this.#summarize({ start: this.ledger.cursor, end: now, reason: 'manual' })
        return { ok: true, state: this.#state() }
      }
      case 'refresh': {
        const now = Date.now()
        await this.#produceDigest({ day: dayKey(now), reason: 'manual', now })
        return { ok: true, state: this.#state() }
      }
      case 'moved':
        // Placement is owned by the widget itself; nothing to store here.
        return { ok: true }
      case 'status':
        return { ok: true, state: this.#state() }
      default:
        return { ok: false, error: `unknown action ${action}` }
    }
  }

  // ------------------------------------------------------------------ plumbing

  async #persist() {
    if (this.ledger === null) return
    await writeJsonAtomic(this.ledgerFile, this.ledger)
  }

  /** Agent-facing status, shared by the optional tool. */
  async status() {
    return {
      capture: this.captureState,
      cursor: this.ledger?.cursor ?? null,
      cursorLabel: this.ledger === null ? null : stamp(this.ledger.cursor),
      route: this.route,
      routeSource: this.routeSource,
      vision: this.routeVision,
      settings: {
        deltaTSeconds: this.config.deltaTSeconds,
        dailyDigestAt: this.config.dailyDigestAt,
        captureIntervalSeconds: this.config.captureIntervalSeconds,
        imageBudget: this.config.imageBudget,
      },
      scrabber: this.runner?.snapshot() ?? null,
      widget: this.widget?.snapshot() ?? { available: false },
      stats: this.ledger?.stats ?? null,
      store: this.store.root,
      today: dayKey(Date.now()),
      notes: this.readNotes(dayKey(Date.now())).length,
      notice: this.captureMissing,
    }
  }
}

/**
 * Mount the plugin.
 *
 * @param {object} ctx Cordis context.
 * @param {unknown} raw the row's `config` block.
 */
export async function apply(ctx, raw) {
  const config = parseConfig(raw)
  const store = resolveStore({ rootDir: config.dataDir ?? PLUGIN_DIR })
  ensureStore(store)
  const logger = createLogger(ctx, store.logs)
  const secretary = new Secretary(ctx, config, logger)

  ctx.effect(() => async () => {
    await secretary.dispose()
  })

  try {
    await secretary.start()
  } catch (error) {
    logger.error('daily-secretary: failed to start (%s)', error?.message ?? error)
  }

  if (config.registerTool) {
    // `tools` is optional for this plugin: losing the tool must never cost the
    // user their screen recording, so it is mounted in its own scope.
    try {
      if (typeof ctx.inject === 'function') {
        ctx.inject(['tools'], (scoped) => {
          registerTool(scoped, secretary, logger).catch((error) => {
            logger.warn('daily-secretary: agent tool not registered (%s)', error?.message ?? error)
          })
        })
      } else {
        await registerTool(ctx, secretary, logger)
      }
    } catch (error) {
      logger.warn('daily-secretary: agent tool not registered (%s)', error?.message ?? error)
    }
  }
}

/**
 * Optional agent tool: lets the user ask "今天我都干了什么" inside a chat.
 * Registration is best effort — a host without the tool registry keeps the
 * plugin's capture and widget working.
 */
async function registerTool(ctx, secretary, logger) {
  try {
    let defineTool = (definition) => definition
    try {
      const tools = await import('@deepseek-ai/dsh-tools')
      if (typeof tools?.defineTool === 'function') defineTool = tools.defineTool
    } catch { /* plain object definition below */ }

    const definition = defineTool({
      name: 'daily_secretary',
      description:
        'Read the daily-secretary work diary: capture status, the current recording cursor, today\'s short summary, or the detailed record of a day. Also pauses and resumes screen recording.',
      parameters: {
        action: {
          type: 'string',
          enum: ['status', 'today', 'read', 'pause', 'resume', 'settings', 'configure', 'open'],
          description: 'status = capture/widget health; today = today\'s short summary; read = detailed diary of one day; pause/resume = control screen recording; settings = current GUI settings and model route; configure = change the settings below; open = reveal a folder in the file manager.',
        },
        captureSeconds: {
          type: 'number',
          description: 'For action=configure: seconds between screenshots (2-600).',
        },
        target: {
          type: 'string',
          enum: ['screenshots', 'diary'],
          description: 'For action=open: which folder of this plugin to reveal.',
        },
        day: {
          type: 'string',
          description: 'For action=read: local date YYYY-MM-DD. Defaults to today.',
        },
        deltaTMinutes: {
          type: 'number',
          description: 'For action=configure: minutes covered by one record window (5-360).',
        },
        dailyDigestAt: {
          type: 'string',
          description: 'For action=configure: local time the daily card appears, "HH:MM".',
        },
        provider: {
          type: 'string',
          description: 'For action=configure: DSH provider id. Send an empty string to follow the profile default.',
        },
        model: {
          type: 'string',
          description: 'For action=configure: model id inside that provider. Send an empty string to follow the profile default.',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            text: { type: 'string' },
          },
          required: ['text'],
        },
        render: (_args, value) => [{ type: 'text', text: value.text }],
      },
      async execute(args) {
        const action = args?.action ?? 'status'
        if (action === 'pause') {
          const result = await secretary.pause('tool')
          return {
            text: result.ok
              ? `已暂停记录。T=${stamp(secretary.ledger.cursor)}，之前的截屏已经总结并清理。`
              : `暂停失败：${result.error}`,
          }
        }
        if (action === 'resume') {
          const result = await secretary.resume('tool')
          return {
            text: result.ok
              ? `已恢复记录。T=${stamp(secretary.ledger.cursor)}。`
              : `恢复失败：${result.error}`,
          }
        }
        if (action === 'today') {
          const day = dayKey(Date.now())
          const file = path.join(secretary.store.daily, `${day}.md`)
          try {
            return { text: fs.readFileSync(file, 'utf8') }
          } catch {
            return { text: `今天还没有生成每日小结（每天 ${secretary.config.dailyDigestAt} 生成）。详细记录可以用 action=read 查看。` }
          }
        }
        if (action === 'read') {
          const day = typeof args?.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(args.day) ? args.day : dayKey(Date.now())
          const file = path.join(secretary.store.detail, `${day}.md`)
          try {
            return { text: await fs.promises.readFile(file, 'utf8') }
          } catch {
            return { text: `${day} 没有详细记录。` }
          }
        }
        if (action === 'settings') {
          const snapshot = await secretary.settingsSnapshot()
          return {
            text: JSON.stringify({
              settings: snapshot.settings,
              origin: snapshot.origin,
              route: snapshot.route,
              routeSource: snapshot.routeSource,
              vision: snapshot.vision,
              profile: snapshot.profile,
              capture: snapshot.capture,
              models: snapshot.models.map((group) => `${group.provider}: ${group.models.map((model) => `${model.id}${model.image ? '*' : ''}`).join(', ')}`),
            }, null, 2),
          }
        }
        if (action === 'open') {
          const target = args?.target === 'diary' ? 'diary' : 'screenshots'
          const result = secretary.openFolder(target)
          if (result.ok !== true) return { text: `打开失败：${result.error}` }
          return { text: `已在文件管理器中打开 ${result.directory}` }
        }
        if (action === 'configure') {
          const patch = {}
          if (typeof args?.captureSeconds === 'number') patch.captureIntervalSeconds = Math.round(args.captureSeconds)
          if (typeof args?.deltaTMinutes === 'number') patch.deltaTSeconds = Math.round(args.deltaTMinutes * 60)
          if (typeof args?.dailyDigestAt === 'string' && args.dailyDigestAt !== '') patch.dailyDigestAt = args.dailyDigestAt
          if (typeof args?.provider === 'string' || typeof args?.model === 'string') {
            patch.provider = args?.provider ?? ''
            patch.model = args?.model ?? ''
          }
          if (Object.keys(patch).length === 0) {
            return { text: '没有给出要修改的项（captureSeconds / deltaTMinutes / dailyDigestAt / provider+model）。' }
          }
          const result = await secretary.applySettings(patch)
          if (result.ok !== true) return { text: `保存失败：${result.error}` }
          const live = result.snapshot.settings
          return {
            text: `已保存并立即生效：每 ${live.captureIntervalSeconds}s 截屏 · 间隔 ${Math.round(live.deltaTSeconds / 60)} 分钟 · 每天 ${live.dailyDigestAt} 出卡片 · 模型 ${result.snapshot.route?.provider ?? '?'}/${result.snapshot.route?.model ?? '?'}（${result.snapshot.routeSource}）`,
          }
        }
        const status = await secretary.status()
        return { text: JSON.stringify(status, null, 2) }
      },
    })

    ctx.effect(() => ctx.tools.register(definition))
    logger.info('daily-secretary: agent tool registered')
  } catch (error) {
    logger.warn('daily-secretary: agent tool not registered (%s)', error?.message ?? error)
  }
}
