window.__ModuleLoader__.load({
  id: 'daily-secretary',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Fallback dictionary; the real one is registered with the locale service. */
    const ZH = {
      nav: '每日秘书',
      panelTitle: '每日秘书 · 工作记录',
      panelSubtitle: '每天一条本地工作记录，包含截屏区间、模型请求、返回内容和运行状态。',
      overviewTab: '每日记录',
      requestsTab: '模型请求',
      logsTab: '运行日志',
      loadingOverview: '正在读取记录…',
      overviewFailed: '读取失败',
      overviewNotMounted: 'DSH 主机没有加载每日秘书的数据接口。请完全退出并重启 DSH；若仍是 404，请查看主机日志中的 daily-secretary 启动信息。',
      noDays: '还没有每日记录。开始记录后，这里会按日期显示总结会话。',
      noSegments: '这一天还没有成功生成的记录。',
      noRequests: '这一天还没有模型请求。',
      today: '今天',
      sessionCount: '段记录',
      screenshotCount: '张截屏',
      sentImageCount: '张已发送图片',
      modelCalls: '次模型请求',
      dayTokens: '当天 token',
      lifetimeTokens: '插件累计 token',
      inputTokens: '输入',
      outputTokens: '输出',
      cacheTokens: '缓存',
      usageUnreported: '次调用未返回用量',
      requestSuccess: '成功',
      requestFailed: '失败',
      requestRunning: '请求中',
      requestQueued: '待重试',
      requestText: '发送给模型的文本',
      requestImages: '本次附图路径',
      requestResponse: '模型返回',
      requestError: '错误',
      runtime: '实时状态',
      captureEngine: '截屏进程',
      widgetProcess: '桌面圆点进程',
      processRunning: '运行中',
      processStopped: '未运行',
      processUnavailable: '不可用',
      homeDirectory: '数据主目录',
      pendingSummaryQueue: '待重试记录',
      pendingDigestQueue: '待重试小结',
      queuedShots: '待处理截屏',
      retryAttempts: '尝试次数',
      logNoHistory: '暂无运行日志',
      retryNow: '立即重试队列',
      retrying: '重试中…',
      retryDone: '已执行重试',
      nextRetry: '下次自动重试',
      styleSummary: '总结风格',
      styleSummaryHint: '例如：简洁直接、按项目分组、先结论后过程。最多 500 字。',
      styleQuip: '吐槽风格',
      styleQuipHint: '例如：轻松克制、像同事聊天，只吐槽流程不评价个人。最多 500 字。',
      openHome: '打开数据主目录',
      subtitle: '桌面上的圆点会在后台记录屏幕，并按下面的设置把截屏写成工作日记。改完点保存立刻生效，不用重启插件。',
      captureInterval: '截屏间隔',
      captureIntervalHint: 'scrabber 每隔 N 秒截一张（2–600 秒）；正在记录时改这一项会重启截屏进程',
      seconds: '秒',
      deltaT: '记录节奏',
      deltaTHint: '每 N 分钟总结一段，范围 5–360 分钟',
      minutes: '分钟',
      digestAt: '每日小结时间',
      digestAtHint: '到点后圆点会展开成卡片，本地时间',
      model: '总结模型',
      modelHint: '只列出 DSH 里已注册的模型；标「图片」的能真正看懂截屏，纯文字模型只能写时间线',
      followProfile: '跟随配置档',
      save: '保存',
      reset: '恢复默认',
      saving: '保存中…',
      saved: '已保存并生效',
      loading: '读取中…',
      loadFailed: '读取设置失败',
      statusRecording: '正在记录',
      statusPaused: '已暂停',
      statusUnavailable: '截屏不可用',
      segments: '今日已记录',
      segmentsUnit: '段',
      pending: '待总结截屏',
      pendingUnit: '张',
      storage: '数据目录',
      shortcuts: '快捷入口',
      openScreenshots: '打开截屏目录',
      openDiary: '打开记录目录',
      opened: '已打开',
      openFailed: '打开失败',
      visionMissing: '当前模型不支持图片输入，记录会退化成只有时间线',
      visionOk: '当前模型支持图片输入',
      fromGui: '这些值来自本页的保存',
      fromConfig: '这些值来自插件配置，尚未在本页保存过',
      saveFailed: '保存失败',
      pickBoth: '服务商和模型要一起选',
      unavailableHint: '没有找到 scrabber 可执行文件，装好后圆点才能记录',
    }
    const EN = {
      nav: 'Daily secretary',
      panelTitle: 'Daily secretary · Work log',
      panelSubtitle: 'One local work log per day, with screenshot windows, model requests, replies, and runtime status.',
      overviewTab: 'Daily logs',
      requestsTab: 'Model requests',
      logsTab: 'Runtime log',
      loadingOverview: 'Loading records…',
      overviewFailed: 'Could not load records',
      overviewNotMounted: 'The DSH host has not loaded the daily-secretary data API. Quit and restart DSH; if the 404 remains, check the host log for daily-secretary startup messages.',
      noDays: 'No daily records yet. They will appear here after recording starts.',
      noSegments: 'No successful records for this day yet.',
      noRequests: 'No model requests for this day.',
      today: 'Today',
      sessionCount: 'segments',
      screenshotCount: 'screenshots',
      sentImageCount: 'images sent',
      modelCalls: 'model requests',
      dayTokens: 'Selected day tokens',
      lifetimeTokens: 'Lifetime tokens',
      inputTokens: 'Input',
      outputTokens: 'Output',
      cacheTokens: 'Cache',
      usageUnreported: 'calls without usage data',
      requestSuccess: 'Succeeded',
      requestFailed: 'Failed',
      requestRunning: 'Running',
      requestQueued: 'Queued for retry',
      requestText: 'Text sent to the model',
      requestImages: 'Attached image paths',
      requestResponse: 'Model response',
      requestError: 'Error',
      runtime: 'Live status',
      captureEngine: 'Capture process',
      widgetProcess: 'Desktop widget',
      processRunning: 'Running',
      processStopped: 'Stopped',
      processUnavailable: 'Unavailable',
      homeDirectory: 'Data directory',
      pendingSummaryQueue: 'Summaries queued for retry',
      pendingDigestQueue: 'Daily digests queued for retry',
      queuedShots: 'Queued screenshots',
      retryAttempts: 'Attempts',
      logNoHistory: 'No runtime logs yet',
      retryNow: 'Retry queue now',
      retrying: 'Retrying…',
      retryDone: 'Retry started',
      nextRetry: 'Next automatic retry',
      styleSummary: 'Summary style',
      styleSummaryHint: 'For example: concise, grouped by project, conclusion before process. Up to 500 characters.',
      styleQuip: 'Quip style',
      styleQuipHint: 'For example: light and restrained, colleague-to-colleague, joke about process not people. Up to 500 characters.',
      openHome: 'Open data directory',
      subtitle: 'The desktop dot records the screen in the background and turns those screenshots into a work diary using the settings below. Changes apply as soon as you save them.',
      captureInterval: 'Screenshot interval',
      captureIntervalHint: 'scrabber captures one screenshot every N seconds (2–600); changing it while recording restarts the capture process',
      seconds: 's',
      deltaT: 'Recording cadence',
      deltaTHint: 'Summarise one window every N minutes (5–360)',
      minutes: 'min',
      digestAt: 'Daily card time',
      digestAtHint: 'The dot unfolds into the card at this local time',
      model: 'Summarising model',
      modelHint: 'Only models DSH has registered are listed; "image" models can actually read the screens',
      followProfile: 'Follow the profile',
      save: 'Save',
      reset: 'Reset',
      saving: 'Saving…',
      saved: 'Saved and applied',
      loading: 'Loading…',
      loadFailed: 'Could not read the settings',
      statusRecording: 'Recording',
      statusPaused: 'Paused',
      statusUnavailable: 'Capture unavailable',
      segments: 'Recorded today',
      segmentsUnit: '',
      pending: 'Pending screenshots',
      pendingUnit: '',
      storage: 'Data directory',
      shortcuts: 'Shortcuts',
      openScreenshots: 'Open screenshots',
      openDiary: 'Open records',
      opened: 'Opened',
      openFailed: 'Could not open',
      visionMissing: 'The current model takes no images, so records will be timeline-only',
      visionOk: 'The current model accepts images',
      fromGui: 'Saved from this page',
      fromConfig: 'From the plugin config; nothing saved here yet',
      saveFailed: 'Could not save',
      pickBoth: 'Pick a provider and a model together',
      unavailableHint: 'No scrabber executable was found, so the dot cannot record yet',
    }

    let translate = (key) => ZH[key] ?? key

    const STYLE = `
.ds-section { max-width: 620px; color: var(--dsw-alias-label-primary); }
.ds-subtitle { margin: 6px 0 18px; font-size: 13px; line-height: 1.6; color: var(--dsw-alias-label-secondary); }
.ds-row { padding: 14px 0; border-top: 1px solid var(--dsw-alias-border-l1); }
.ds-row:first-of-type { border-top: none; padding-top: 0; }
.ds-label { display: flex; align-items: baseline; gap: 8px; font-size: 13px; font-weight: 500; }
.ds-input, .ds-select, .ds-textarea {
  margin-top: 8px; height: 32px; box-sizing: border-box; padding: 0 10px; min-width: 120px;
  border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px;
  background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary);
  font: inherit; font-size: 13px; outline: none;
}
.ds-input:focus, .ds-select:focus, .ds-textarea:focus { border-color: var(--dsw-alias-brand-primary); }
.ds-select { min-width: 240px; max-width: 100%; }
.ds-textarea { display: block; width: min(620px, 100%); min-height: 68px; padding: 8px 10px; resize: vertical; }
.ds-unit { margin-left: 8px; font-size: 13px; color: var(--dsw-alias-label-secondary); }
.ds-hint { margin-top: 6px; font-size: 12px; line-height: 1.5; color: var(--dsw-alias-label-secondary); }
.ds-actions { display: flex; align-items: center; gap: 10px; margin-top: 20px; flex-wrap: wrap; }
.ds-button {
  height: 32px; padding: 0 16px; border-radius: 8px; font: inherit; font-size: 13px; cursor: pointer;
  border: 1px solid var(--dsw-alias-border-l1); background: transparent; color: var(--dsw-alias-label-primary);
}
.ds-button:hover { border-color: var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-2); }
.ds-button-primary { border-color: transparent; background: var(--dsw-alias-brand-primary); color: #fff; }
.ds-button-primary:hover { background: var(--dsw-alias-brand-primary); opacity: 0.9; }
.ds-button:disabled { opacity: 0.45; cursor: default; }
.ds-message { font-size: 12px; }
.ds-message-ok { color: var(--dsw-alias-state-success-primary); }
.ds-message-error { color: var(--dsw-alias-state-error-primary); }
.ds-facts { margin-top: 22px; padding-top: 14px; border-top: 1px solid var(--dsw-alias-border-l1); font-size: 12px; line-height: 1.9; color: var(--dsw-alias-label-secondary); }
.ds-facts code { font-size: 12px; color: var(--dsw-alias-label-primary); word-break: break-all; }
.ds-pill { display: inline-block; margin-left: 8px; padding: 1px 8px; border-radius: 999px; font-size: 11px; }
.ds-pill-ok { color: var(--dsw-alias-state-success-primary); background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 14%, transparent); }
.ds-pill-warn { color: var(--dsw-alias-state-warn-primary); background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 14%, transparent); }
.ds-pill-idle { color: var(--dsw-alias-state-idle-primary); background: color-mix(in srgb, var(--dsw-alias-state-idle-primary) 14%, transparent); }
.ds-shortcut-path { margin-top: 6px; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.ds-dashboard { width: 100%; max-width: 1180px; height: calc(100vh - 120px); box-sizing: border-box; display: flex; flex-direction: column; min-height: 0; overflow: hidden; color: var(--dsw-alias-label-primary); }
.ds-dashboard-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding-bottom: 18px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.ds-dashboard-title { margin: 0; font-size: 20px; font-weight: 600; }
.ds-dashboard-body { display: grid; grid-template-columns: 190px minmax(0, 1fr); gap: 20px; padding-top: 18px; flex: 1; min-height: 0; }
.ds-dashboard-days { display: flex; flex-direction: column; gap: 4px; min-height: 0; overflow-y: auto; }
.ds-day-button { text-align: left; padding: 9px 10px; border: 0; border-radius: 8px; background: transparent; color: var(--dsw-alias-label-primary); cursor: pointer; }
.ds-day-button:hover, .ds-day-button-active { background: var(--dsw-alias-bg-layer-2); }
.ds-day-meta { display: block; margin-top: 3px; font-size: 11px; color: var(--dsw-alias-label-secondary); }
.ds-dashboard-main { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.ds-dashboard-tabs { display: flex; gap: 6px; margin-bottom: 14px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.ds-dashboard-content { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
.ds-tab { padding: 8px 12px; border: 0; border-bottom: 2px solid transparent; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; font: inherit; }
.ds-tab-active { color: var(--dsw-alias-label-primary); border-bottom-color: var(--dsw-alias-brand-primary); }
.ds-dashboard-stats { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0 18px; }
.ds-stat { padding: 7px 10px; border-radius: 8px; background: var(--dsw-alias-bg-layer-2); font-size: 12px; }
.ds-session-card, .ds-request-card, .ds-log-card, .ds-digest-card, .ds-queue-card { margin: 10px 0; padding: 13px 14px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-layer-1); }
.ds-card-title { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 13px; font-weight: 600; }
.ds-pre { white-space: pre-wrap; overflow-wrap: anywhere; margin: 10px 0 0; font: inherit; font-size: 12px; line-height: 1.65; color: var(--dsw-alias-label-primary); }
.ds-image-list { margin: 8px 0 0; padding-left: 18px; font-size: 11px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.ds-dashboard-muted { color: var(--dsw-alias-label-secondary); font-size: 12px; }
.ds-runtime { margin: 14px 0; padding: 12px 14px; border-radius: 10px; background: var(--dsw-alias-bg-layer-2); font-size: 12px; line-height: 1.8; }
.ds-runtime-path { overflow-wrap: anywhere; }
.ds-runtime-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 8px; }
.ds-dashboard-error { color: var(--dsw-alias-state-error-primary); }
@media (max-width: 760px) { .ds-dashboard-body { grid-template-columns: 1fr; grid-template-rows: auto minmax(0, 1fr); } .ds-dashboard-days { max-height: 96px; flex-direction: row; overflow-x: auto; } .ds-day-button { min-width: 130px; } }
`

    function formatClock(ms) {
      if (!Number.isFinite(ms) || ms <= 0) return '—'
      const date = new Date(ms)
      const pad = (value) => String(value).padStart(2, '0')
      return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
    }

    function StatusPill({ capture }) {
      const t = translate
      const label = capture === 'recording'
        ? t('statusRecording')
        : capture === 'paused'
          ? t('statusPaused')
          : t('statusUnavailable')
      const tone = capture === 'recording' ? 'ok' : capture === 'paused' ? 'warn' : 'idle'
      return h('span', { className: `ds-pill ds-pill-${tone}` }, label)
    }

    function Section() {
      const t = translate
      const [snapshot, setSnapshot] = React.useState(null)
      const [phase, setPhase] = React.useState('loading')
      const [draft, setDraft] = React.useState({ captureSeconds: '', minutes: '', clock: '', route: '', summaryStyle: '', quipStyle: '' })
      const [message, setMessage] = React.useState(null)

      const adopt = React.useCallback((next) => {
        setSnapshot(next)
        setDraft({
          captureSeconds: String(next.settings.captureIntervalSeconds),
          minutes: String(Math.round(next.settings.deltaTSeconds / 60)),
          clock: next.settings.dailyDigestAt,
          route: next.settings.provider === null ? '' : `${next.settings.provider}::${next.settings.model}`,
          summaryStyle: next.settings.summaryStyle ?? '',
          quipStyle: next.settings.quipStyle ?? '',
        })
      }, [])

      const load = React.useCallback(async () => {
        try {
          const response = await fetch('/daily-secretary/settings', { headers: { accept: 'application/json' }, credentials: 'same-origin' })
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          const body = await response.json()
          if (body?.ok !== true) throw new Error(body?.error ?? 'bad payload')
          adopt(body)
          setPhase('ready')
        } catch (error) {
          setPhase('failed')
          setMessage({ tone: 'error', text: `${t('loadFailed')}：${error?.message ?? error}` })
        }
      }, [adopt, t])

      React.useEffect(() => { load() }, [load])

      const post = async (path, payload) => {
        const response = await fetch(path, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(payload),
        })
        return response.json()
      }

      const save = async (payload) => {
        setPhase('saving')
        setMessage(null)
        try {
          const body = await post('/daily-secretary/settings', payload)
          if (body?.ok === true) {
            adopt(body.snapshot)
            setMessage({ tone: 'ok', text: t('saved') })
          } else {
            setMessage({ tone: 'error', text: `${t('saveFailed')}：${body?.error ?? ''}` })
          }
        } catch (error) {
          setMessage({ tone: 'error', text: `${t('saveFailed')}：${error?.message ?? error}` })
        }
        setPhase('ready')
      }

      const submit = async () => {
        const seconds = Number(draft.captureSeconds)
        const minutes = Number(draft.minutes)
        if (!Number.isFinite(seconds)) {
          setMessage({ tone: 'error', text: t('captureIntervalHint') })
          return
        }
        if (!Number.isFinite(minutes)) {
          setMessage({ tone: 'error', text: t('deltaTHint') })
          return
        }
        const patch = {
          captureIntervalSeconds: Math.round(seconds),
          deltaTSeconds: Math.round(minutes * 60),
          dailyDigestAt: draft.clock,
          summaryStyle: draft.summaryStyle,
          quipStyle: draft.quipStyle,
        }
        if (draft.route === '') {
          patch.provider = ''
          patch.model = ''
        } else {
          const [provider, model] = draft.route.split('::')
          if (!provider || !model) {
            setMessage({ tone: 'error', text: t('pickBoth') })
            return
          }
          patch.provider = provider
          patch.model = model
        }
        await save(patch)
      }

      const openFolder = async (target) => {
        setMessage(null)
        try {
          const body = await post('/daily-secretary/open', { target })
          if (body?.ok === true) setMessage({ tone: 'ok', text: `${t('opened')}：${body.directory ?? ''}` })
          else setMessage({ tone: 'error', text: `${t('openFailed')}：${body?.error ?? ''}` })
        } catch (error) {
          setMessage({ tone: 'error', text: `${t('openFailed')}：${error?.message ?? error}` })
        }
      }

      const style = h('style', { key: 'style' }, STYLE)

      if (phase === 'loading' && snapshot === null) {
        return h('div', { className: 'ds-section' }, style, h('div', { className: 'ds-hint' }, t('loading')))
      }
      if (snapshot === null) {
        return h('div', { className: 'ds-section' }, style,
          h('div', { className: 'ds-label' }, t('nav')),
          h('div', { className: 'ds-message ds-message-error' }, message?.text ?? t('loadFailed')))
      }

      const settings = snapshot.settings
      const limits = snapshot.limits ?? {
        captureIntervalSeconds: { min: 2, max: 600 },
        deltaTSeconds: { min: 300, max: 21600 },
      }
      const groups = (Array.isArray(snapshot.models) ? snapshot.models : []).filter((group) => Array.isArray(group.models) && group.models.length > 0)
      const profileLabel = `${t('followProfile')}（${snapshot.profile?.provider ?? '?'} / ${snapshot.profile?.model ?? '?'}）`
      const busy = phase === 'saving'

      const routeOptions = [h('option', { key: 'profile', value: '' }, profileLabel)]
      for (const group of groups) {
        routeOptions.push(h('optgroup', { key: group.provider, label: group.name ?? group.provider },
          group.models.map((model) => h('option', { key: `${group.provider}::${model.id}`, value: `${group.provider}::${model.id}` },
            `${model.name ?? model.id}${model.image === true ? ' · 图片' : model.image === false ? ' · 仅文字' : ''}`))))
      }

      const numberRow = (key, labelText, hintText, value, unitText, min, max) => h('div', { key, className: 'ds-row' }, [
        h('label', { key: 'l', className: 'ds-label', htmlFor: `ds-${key}` }, labelText),
        h('div', { key: 'c' }, [
          h('input', {
            key: 'i',
            id: `ds-${key}`,
            className: 'ds-input',
            type: 'number',
            min,
            max,
            step: 1,
            value,
            disabled: busy,
            onChange: (event) => setDraft((current) => ({ ...current, [key]: event.target.value })),
          }),
          h('span', { key: 'u', className: 'ds-unit' }, unitText),
        ]),
        h('div', { key: 'h', className: 'ds-hint' }, hintText),
      ])

      return h('div', { className: 'ds-section' }, [
        style,
        h('div', { key: 'head', className: 'ds-label' }, [
          t('nav'),
          h(StatusPill, { key: 'pill', capture: snapshot.capture }),
        ]),
        h('p', { key: 'sub', className: 'ds-subtitle' }, t('subtitle')),

        numberRow('captureSeconds', t('captureInterval'), t('captureIntervalHint'), draft.captureSeconds, t('seconds'),
          limits.captureIntervalSeconds.min, limits.captureIntervalSeconds.max),
        numberRow('minutes', t('deltaT'), t('deltaTHint'), draft.minutes, t('minutes'),
          Math.round(limits.deltaTSeconds.min / 60), Math.round(limits.deltaTSeconds.max / 60)),

        h('div', { key: 'at', className: 'ds-row' }, [
          h('label', { key: 'l', className: 'ds-label', htmlFor: 'ds-dailyDigestAt' }, t('digestAt')),
          h('div', { key: 'c' },
            h('input', {
              id: 'ds-dailyDigestAt',
              className: 'ds-input',
              type: 'time',
              value: draft.clock,
              disabled: busy,
              onChange: (event) => setDraft((current) => ({ ...current, clock: event.target.value })),
            })),
          h('div', { key: 'h', className: 'ds-hint' }, t('digestAtHint')),
        ]),

        h('div', { key: 'model', className: 'ds-row' }, [
          h('label', { key: 'l', className: 'ds-label', htmlFor: 'ds-route' }, [
            t('model'),
            snapshot.vision === false
              ? h('span', { key: 'v', className: 'ds-pill ds-pill-warn' }, t('visionMissing'))
              : snapshot.vision === true
                ? h('span', { key: 'v', className: 'ds-pill ds-pill-ok' }, t('visionOk'))
                : null,
          ]),
          h('div', { key: 'c' },
            h('select', {
              id: 'ds-route',
              className: 'ds-select',
              value: draft.route,
              disabled: busy,
              onChange: (event) => setDraft((current) => ({ ...current, route: event.target.value })),
            }, routeOptions)),
          h('div', { key: 'h', className: 'ds-hint' }, t('modelHint')),
        ]),

        h('div', { key: 'summary-style', className: 'ds-row' }, [
          h('label', { key: 'l', className: 'ds-label', htmlFor: 'ds-summaryStyle' }, t('styleSummary')),
          h('textarea', {
            key: 'input', id: 'ds-summaryStyle', className: 'ds-textarea', maxLength: 500,
            value: draft.summaryStyle, disabled: busy,
            onChange: (event) => setDraft((current) => ({ ...current, summaryStyle: event.target.value })),
          }),
          h('div', { key: 'hint', className: 'ds-hint' }, t('styleSummaryHint')),
        ]),

        h('div', { key: 'quip-style', className: 'ds-row' }, [
          h('label', { key: 'l', className: 'ds-label', htmlFor: 'ds-quipStyle' }, t('styleQuip')),
          h('textarea', {
            key: 'input', id: 'ds-quipStyle', className: 'ds-textarea', maxLength: 500,
            value: draft.quipStyle, disabled: busy,
            onChange: (event) => setDraft((current) => ({ ...current, quipStyle: event.target.value })),
          }),
          h('div', { key: 'hint', className: 'ds-hint' }, t('styleQuipHint')),
        ]),

        h('div', { key: 'actions', className: 'ds-actions' }, [
          h('button', { key: 'save', type: 'button', className: 'ds-button ds-button-primary', disabled: busy, onClick: submit }, busy ? t('saving') : t('save')),
          h('button', { key: 'reset', type: 'button', className: 'ds-button', disabled: busy, onClick: () => save({ reset: true }) }, t('reset')),
          message === null ? null : h('span', { key: 'm', className: `ds-message ds-message-${message.tone}`, role: 'status', 'aria-live': 'polite' }, message.text),
        ]),

        h('div', { key: 'shortcuts', className: 'ds-row' }, [
          h('div', { key: 'l', className: 'ds-label' }, t('shortcuts')),
          h('div', { key: 'c', className: 'ds-actions', style: { marginTop: '10px' } }, [
            h('button', { key: 'home', type: 'button', className: 'ds-button', onClick: () => openFolder('home') }, t('openHome')),
            h('button', { key: 'shots', type: 'button', className: 'ds-button', onClick: () => openFolder('screenshots') }, t('openScreenshots')),
            h('button', { key: 'diary', type: 'button', className: 'ds-button', onClick: () => openFolder('diary') }, t('openDiary')),
          ]),
          h('div', { key: 'p0', className: 'ds-shortcut-path' }, `${t('homeDirectory')}：${snapshot.dirs?.home ?? ''}`),
          h('div', { key: 'p1', className: 'ds-shortcut-path' }, h('code', null, snapshot.dirs?.screenshots ?? '')),
          h('div', { key: 'p2', className: 'ds-shortcut-path' }, h('code', null, snapshot.dirs?.diary ?? '')),
        ]),

        h('div', { key: 'facts', className: 'ds-facts' }, [
          h('div', { key: 'o' }, snapshot.origin === 'gui' ? t('fromGui') : t('fromConfig')),
          h('div', { key: 'r' }, `${t('model')}：${snapshot.route?.provider ?? '—'} / ${snapshot.route?.model ?? '—'}`),
          h('div', { key: 's' }, `${t('segments')} ${snapshot.status?.segments ?? 0} ${t('segmentsUnit')} · ${t('pending')} ${snapshot.status?.pendingShots ?? 0} ${t('pendingUnit')} · ${formatClock(snapshot.status?.lastSummaryAt)}`),
          h('div', { key: 'i' }, `${t('captureInterval')} ${settings.captureIntervalSeconds}s · ${t('deltaT')} ${Math.round(settings.deltaTSeconds / 60)}${t('minutes')} · ${settings.dailyDigestAt}`),
          snapshot.notice ? h('div', { key: 'n' }, `${t('unavailableHint')}：${snapshot.notice}`) : null,
        ]),
      ])
    }

    function todayKey() {
      const date = new Date()
      const pad = (value) => String(value).padStart(2, '0')
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    }

    function formatTokens(value) {
      return Number.isFinite(value) ? value.toLocaleString() : '—'
    }

    function tokenCount(usage) {
      if (Number.isFinite(usage?.totalTokens)) return usage.totalTokens
      if (usage === null || typeof usage !== 'object') return undefined
      return (Number.isFinite(usage.inputTokens) ? usage.inputTokens : 0)
        + (Number.isFinite(usage.outputTokens) ? usage.outputTokens : 0)
    }

    function SecretaryIcon({ size = 18 }) {
      return h('svg', {
        width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': true,
      }, [
        h('rect', { key: 'box', x: 4, y: 5, width: 16, height: 15, rx: 2 }),
        h('path', { key: 'top', d: 'M8 3v4M16 3v4M4 10h16M8 14h3M8 17h6' }),
      ])
    }

    function Dashboard() {
      const t = translate
      const [selectedDay, setSelectedDay] = React.useState(todayKey())
      const [data, setData] = React.useState(null)
      const [phase, setPhase] = React.useState('loading')
      const [tab, setTab] = React.useState('daily')
      const [message, setMessage] = React.useState('')
      const [busyAction, setBusyAction] = React.useState(false)

      const refresh = React.useCallback(async () => {
        try {
          const response = await fetch(`/daily-secretary/overview?day=${encodeURIComponent(selectedDay)}`, {
            headers: { accept: 'application/json' }, credentials: 'same-origin',
          })
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          const body = await response.json()
          if (body?.ok !== true) throw new Error(body?.error ?? 'bad payload')
          setData(body)
          setPhase('ready')
        } catch (error) {
          setPhase('failed')
          const reason = String(error?.message ?? error)
          setMessage(reason === 'HTTP 404' ? t('overviewNotMounted') : `${t('overviewFailed')}：${reason}`)
        }
      }, [selectedDay])

      React.useEffect(() => {
        refresh()
        const timer = setInterval(refresh, 5_000)
        return () => clearInterval(timer)
      }, [refresh])

      const post = async (url, body) => {
        const response = await fetch(url, {
          method: 'POST', credentials: 'same-origin',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify(body ?? {}),
        })
        return response.json()
      }

      const retry = async () => {
        setBusyAction(true)
        setMessage('')
        try {
          const result = await post('/daily-secretary/retry')
          if (result?.ok !== true) throw new Error(result?.error ?? t('overviewFailed'))
          setMessage(t('retryDone'))
          await refresh()
        } catch (error) {
          setMessage(`${t('overviewFailed')}：${error?.message ?? error}`)
        } finally { setBusyAction(false) }
      }

      const openHome = async () => {
        try {
          const result = await post('/daily-secretary/open', { target: 'home' })
          if (result?.ok !== true) throw new Error(result?.error ?? '')
        } catch (error) { setMessage(`${t('openFailed')}：${error?.message ?? error}`) }
      }

      const style = h('style', { key: 'style' }, STYLE)
      if (data === null) {
        return h('div', { className: 'ds-dashboard' }, style,
          h('p', { className: phase === 'failed' ? 'ds-dashboard-error' : 'ds-dashboard-muted' }, message || t('loadingOverview')))
      }

      const { session, runtime, days } = data
      const usage = session.usage ?? {}
      const queues = (runtime.pendingSummaries?.length ?? 0) + (runtime.pendingDigests?.length ?? 0)
      const statusText = runtime.capture === 'recording' ? t('statusRecording') : runtime.capture === 'paused' ? t('statusPaused') : t('statusUnavailable')
      const statusTone = runtime.capture === 'recording' ? 'ok' : runtime.capture === 'paused' ? 'warn' : 'idle'
      const scrabberText = runtime.scrabber === null ? t('processUnavailable') : runtime.scrabber.running ? t('processRunning') : t('processStopped')
      const widgetText = runtime.widget === null ? t('processUnavailable') : runtime.widget.running ? t('processRunning') : t('processStopped')

      const dayButtons = (days ?? []).map((entry) => h('button', {
        key: entry.day, type: 'button',
        className: `ds-day-button${selectedDay === entry.day ? ' ds-day-button-active' : ''}`,
        onClick: () => setSelectedDay(entry.day),
      }, [
        h('span', { key: 'date' }, entry.day === todayKey() ? `${entry.day} · ${t('today')}` : entry.day),
        h('span', { key: 'meta', className: 'ds-day-meta' }, `${entry.segments} ${t('sessionCount')} · ${entry.screenshots} ${t('screenshotCount')} · ${formatTokens(entry.tokens)} tok`),
      ]))

      const segmentCards = (session.segments ?? []).slice().reverse().map((segment, index) => h('article', {
        key: segment.jobId ?? `${segment.from}-${index}`, className: 'ds-session-card',
      }, [
        h('div', { key: 'head', className: 'ds-card-title' }, [
          h('span', { key: 'time' }, `${formatClock(segment.from)} – ${formatClock(segment.to)}`),
          h('span', { key: 'shots', className: 'ds-dashboard-muted' }, `${segment.totalShots ?? 0} ${t('screenshotCount')} · ${(segment.sentImages ?? []).length} ${t('sentImageCount')}`),
        ]),
        h('div', { key: 'model', className: 'ds-dashboard-muted' }, `${segment.provider ?? '—'} / ${segment.model ?? '—'} · ${formatTokens(tokenCount(segment.usage))} tok`),
        h('ul', { key: 'highlights' }, (segment.highlights ?? []).map((line, i) => h('li', { key: i }, line))),
        segment.quip ? h('p', { key: 'quip', className: 'ds-dashboard-muted' }, `「${segment.quip}」`) : null,
        segment.detail ? h('details', { key: 'detail' }, [
          h('summary', { key: 'summary' }, t('requestResponse')),
          h('pre', { key: 'body', className: 'ds-pre' }, segment.detail),
        ]) : null,
        (segment.sentImages ?? []).length > 0 ? h('details', { key: 'images' }, [
          h('summary', { key: 'summary' }, `${t('requestImages')} (${segment.sentImages.length})`),
          h('ul', { key: 'list', className: 'ds-image-list' }, segment.sentImages.map((image, i) => h('li', { key: i }, `${formatClock(image.at)} · ${image.path}`))),
        ]) : null,
      ]))

      const queuedJobs = (runtime.pendingSummaries ?? []).filter((job) => {
        const date = new Date(job.start)
        const pad = (value) => String(value).padStart(2, '0')
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` === session.day
      }).map((job) => h('details', { key: job.id, className: 'ds-queue-card', open: true }, [
        h('summary', { key: 'summary', className: 'ds-card-title' }, [
          h('span', { key: 'window' }, `${formatClock(job.start)} – ${formatClock(job.end)} · ${job.files?.length ?? 0} ${t('queuedShots')}`),
          h('span', { key: 'attempts', className: 'ds-pill ds-pill-warn' }, `${t('requestQueued')} · ${t('retryAttempts')} ${job.attempts ?? 0}`),
        ]),
        job.lastError ? h('p', { key: 'error', className: 'ds-dashboard-error' }, `${job.lastError.code ?? ''} ${job.lastError.message ?? ''}`) : null,
        h('ul', { key: 'files', className: 'ds-image-list' }, (job.files ?? []).map((file, index) => h('li', { key: `${file.path}-${index}` }, `${formatClock(file.ms)} · ${file.path}`))),
      ]))
      const queuedDigests = (runtime.pendingDigests ?? []).filter((job) => job.day === session.day).map((job) => h('article', {
        key: job.id ?? job.day, className: 'ds-queue-card',
      }, [
        h('div', { key: 'title', className: 'ds-card-title' }, [
          h('span', { key: 'label' }, t('pendingDigestQueue')),
          h('span', { key: 'attempts', className: 'ds-pill ds-pill-warn' }, t('requestQueued') + ' · ' + t('retryAttempts') + ' ' + (job.attempts ?? 0)),
        ]),
        job.lastError ? h('p', { key: 'error', className: 'ds-dashboard-error' }, (job.lastError.code ?? '') + ' ' + (job.lastError.message ?? '')) : null,
      ]))

      const requestCards = (session.requests ?? []).map((call) => {
        const label = call.status === 'success' ? t('requestSuccess') : call.status === 'failed' ? t('requestFailed') : t('requestRunning')
        const tone = call.status === 'success' ? 'ok' : call.status === 'failed' ? 'idle' : 'warn'
        return h('details', { key: call.id, className: 'ds-request-card' }, [
          h('summary', { key: 'summary', className: 'ds-card-title' }, [
            h('span', { key: 'type' }, `${call.type === 'daily-digest' ? t('digestAt') : t('deltaT')} · ${call.provider ?? '—'} / ${call.model ?? '—'}`),
            h('span', { key: 'status', className: `ds-pill ds-pill-${tone}` }, label),
          ]),
          h('div', { key: 'time', className: 'ds-dashboard-muted' }, `${formatClock(call.startedAt)} · ${call.durationMs ?? '—'} ms · ${formatTokens(tokenCount(call.usage))} tok`),
          call.error ? h('p', { key: 'error', className: 'ds-dashboard-error' }, `${t('requestError')}：${call.error.code ?? ''} ${call.error.message}`) : null,
          (call.sentImages ?? []).length > 0 ? h('div', { key: 'images' }, [
            h('strong', { key: 'label' }, t('requestImages')),
            h('ul', { key: 'list', className: 'ds-image-list' }, call.sentImages.map((image, i) => h('li', { key: i }, `${formatClock(image.at)} · ${image.path}`))),
          ]) : null,
          h('details', { key: 'prompt' }, [
            h('summary', { key: 'summary' }, t('requestText')),
            h('pre', { key: 'text', className: 'ds-pre' }, call.request?.messages?.map((m) => m.text).join('\n\n') ?? call.requestText ?? ''),
            call.request?.system ? h('details', { key: 'system' }, [h('summary', { key: 'summary' }, 'System prompt'), h('pre', { key: 'text', className: 'ds-pre' }, call.request.system)]) : null,
          ]),
          call.responseText ? h('details', { key: 'response' }, [h('summary', { key: 'summary' }, t('requestResponse')), h('pre', { key: 'text', className: 'ds-pre' }, call.responseText)]) : null,
        ])
      })

      const runtimeEvents = [
        ...(runtime.events ?? []).map((line, i) => h('div', { key: `event-${i}`, className: 'ds-log-card ds-pre' }, line)),
        ...(runtime.scrabber?.recentOutput ?? []).map((line, i) => h('div', { key: `scrabber-${i}`, className: 'ds-log-card ds-pre' }, `scrabber · ${line}`)),
      ]

      const tabs = [
        ['daily', t('overviewTab')], ['requests', t('requestsTab')], ['logs', t('logsTab')],
      ].map(([key, label]) => h('button', {
        key, type: 'button', className: `ds-tab${tab === key ? ' ds-tab-active' : ''}`,
        onClick: () => setTab(key),
      }, label))

      return h('div', { className: 'ds-dashboard' }, [
        style,
        h('header', { key: 'head', className: 'ds-dashboard-head' }, [
          h('div', { key: 'title' }, [
            h('h1', { key: 'h', className: 'ds-dashboard-title' }, t('panelTitle')),
            h('p', { key: 'p', className: 'ds-subtitle' }, t('panelSubtitle')),
          ]),
          h('button', { key: 'home', type: 'button', className: 'ds-button', onClick: openHome }, t('openHome')),
        ]),
        h('section', { key: 'runtime', className: 'ds-runtime' }, [
          h('div', { key: 'state' }, [h('strong', { key: 'label' }, `${t('runtime')}：`), h('span', { key: 'pill', className: `ds-pill ds-pill-${statusTone}` }, statusText), ` · ${runtime.route?.provider ?? '—'} / ${runtime.route?.model ?? '—'}`]),
          h('div', { key: 'processes' }, `${t('captureEngine')}：${scrabberText} · ${t('widgetProcess')}：${widgetText}`),
          h('div', { key: 'home', className: 'ds-runtime-path' }, `${t('homeDirectory')}：${runtime.home}`),
          h('div', { key: 'queue' }, `${t('pendingSummaryQueue')}：${runtime.pendingSummaries?.length ?? 0} · ${t('pendingDigestQueue')}：${runtime.pendingDigests?.length ?? 0}${runtime.nextRetryAt ? ` · ${t('nextRetry')} ${formatClock(runtime.nextRetryAt)}` : ''}`),
          runtime.lastError ? h('div', { key: 'error', className: 'ds-dashboard-error' }, `${t('requestError')}：${runtime.lastError}`) : null,
          queues > 0 ? h('div', { key: 'actions', className: 'ds-runtime-actions' }, [
            h('button', { key: 'retry', type: 'button', className: 'ds-button ds-button-primary', disabled: busyAction, onClick: retry }, busyAction ? t('retrying') : t('retryNow')),
            message ? h('span', { key: 'message', className: 'ds-message' }, message) : null,
          ]) : message ? h('div', { key: 'message', className: 'ds-runtime-actions' }, message) : null,
        ]),
        h('div', { key: 'stats', className: 'ds-dashboard-stats' }, [
          h('div', { key: 'segments', className: 'ds-stat' }, `${session.segments?.length ?? 0} ${t('sessionCount')}`),
          h('div', { key: 'shots', className: 'ds-stat' }, `${(session.segments?.reduce((sum, item) => sum + (item.totalShots ?? 0), 0) ?? 0) + (runtime.pendingShots ?? 0)} ${t('screenshotCount')}`),
          h('div', { key: 'requests', className: 'ds-stat' }, `${session.requests?.filter((call) => call.phase === 'complete').length ?? 0} ${t('modelCalls')}`),
          h('div', { key: 'tokens', className: 'ds-stat' }, `${t('dayTokens')}：${formatTokens(usage.totalTokens)}`),
          h('div', { key: 'lifetime-tokens', className: 'ds-stat' }, `${t('lifetimeTokens')}：${formatTokens(runtime.usage?.totalTokens)}`),
          h('div', { key: 'token-split', className: 'ds-stat' }, `${t('inputTokens')} ${formatTokens(usage.inputTokens)} · ${t('outputTokens')} ${formatTokens(usage.outputTokens)} · ${t('cacheTokens')} ${formatTokens((usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0))}`),
          usage.unreportedCalls ? h('div', { key: 'unreported', className: 'ds-stat' }, `${usage.unreportedCalls} ${t('usageUnreported')}`) : null,
        ]),
        h('div', { key: 'body', className: 'ds-dashboard-body' }, [
          h('nav', { key: 'days', className: 'ds-dashboard-days', 'aria-label': t('overviewTab') }, dayButtons.length > 0 ? dayButtons : h('p', { className: 'ds-dashboard-muted' }, t('noDays'))),
          h('main', { key: 'main', className: 'ds-dashboard-main' }, [
            h('div', { key: 'tabs', className: 'ds-dashboard-tabs' }, tabs),
            h('div', { key: 'content', className: 'ds-dashboard-content' }, [
            tab === 'daily' ? h('section', { key: 'daily' }, [
              session.digest ? h('article', { key: 'digest', className: 'ds-digest-card' }, h('pre', { className: 'ds-pre' }, session.digest)) : null,
              queuedJobs,
              queuedDigests,
              segmentCards.length > 0 ? segmentCards : h('p', { key: 'empty', className: 'ds-dashboard-muted' }, t('noSegments')),
              session.segments?.some((segment) => !segment.detail) && session.detailDocument
                ? h('details', { key: 'legacy-detail', className: 'ds-session-card' }, [h('summary', { key: 'summary' }, t('requestResponse')), h('pre', { key: 'detail', className: 'ds-pre' }, session.detailDocument)])
                : null,
            ]) : null,
            tab === 'requests' ? (requestCards.length > 0 ? requestCards : h('p', { key: 'empty', className: 'ds-dashboard-muted' }, t('noRequests'))) : null,
            tab === 'logs' ? (runtimeEvents.length > 0 ? runtimeEvents : h('p', { key: 'empty', className: 'ds-dashboard-muted' }, t('logNoHistory'))) : null,
            ]),
          ]),
        ]),
      ])
    }

    function makeTranslate(ctx) {
      try {
        ctx.effect(() => {
          const offZh = ctx.locale.register('dailySecretary', 'zh', ZH)
          const offEn = ctx.locale.register('dailySecretary', 'en', EN)
          return () => { offZh?.(); offEn?.() }
        })
        const bound = ctx.locale.bind('dailySecretary')
        if (typeof bound === 'function') {
          return (key) => {
            try {
              const value = bound(key)
              return typeof value === 'string' && value !== key && value !== '' ? value : (ZH[key] ?? key)
            } catch {
              return ZH[key] ?? key
            }
          }
        }
      } catch { /* a locale service that refuses this namespace keeps the fallback */ }
      return (key) => ZH[key] ?? key
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        translate = makeTranslate(ctx)
        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: 'daily-secretary',
          order: 17,
          label: () => translate('nav'),
        }, Section))
        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: 'daily-secretary',
          locale: 'dailySecretary',
          inject: () => ({}),
        }, Dashboard))
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: 'daily-secretary',
          order: 14,
          label: () => translate('nav'),
          locale: 'dailySecretary',
        }, SecretaryIcon))
      },
    }
  },
})
