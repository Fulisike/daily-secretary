window.__ModuleLoader__.load({
  id: 'daily-secretary',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Fallback dictionary; the real one is registered with the locale service. */
    const ZH = {
      nav: '每日秘书',
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
.ds-input, .ds-select {
  margin-top: 8px; height: 32px; box-sizing: border-box; padding: 0 10px; min-width: 120px;
  border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px;
  background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary);
  font: inherit; font-size: 13px; outline: none;
}
.ds-input:focus, .ds-select:focus { border-color: var(--dsw-alias-brand-primary); }
.ds-select { min-width: 240px; max-width: 100%; }
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
      const [draft, setDraft] = React.useState({ captureSeconds: '', minutes: '', clock: '', route: '' })
      const [message, setMessage] = React.useState(null)

      const adopt = React.useCallback((next) => {
        setSnapshot(next)
        setDraft({
          captureSeconds: String(next.settings.captureIntervalSeconds),
          minutes: String(Math.round(next.settings.deltaTSeconds / 60)),
          clock: next.settings.dailyDigestAt,
          route: next.settings.provider === null ? '' : `${next.settings.provider}::${next.settings.model}`,
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

        h('div', { key: 'actions', className: 'ds-actions' }, [
          h('button', { key: 'save', type: 'button', className: 'ds-button ds-button-primary', disabled: busy, onClick: submit }, busy ? t('saving') : t('save')),
          h('button', { key: 'reset', type: 'button', className: 'ds-button', disabled: busy, onClick: () => save({ reset: true }) }, t('reset')),
          message === null ? null : h('span', { key: 'm', className: `ds-message ds-message-${message.tone}`, role: 'status', 'aria-live': 'polite' }, message.text),
        ]),

        h('div', { key: 'shortcuts', className: 'ds-row' }, [
          h('div', { key: 'l', className: 'ds-label' }, t('shortcuts')),
          h('div', { key: 'c', className: 'ds-actions', style: { marginTop: '10px' } }, [
            h('button', { key: 'shots', type: 'button', className: 'ds-button', onClick: () => openFolder('screenshots') }, t('openScreenshots')),
            h('button', { key: 'diary', type: 'button', className: 'ds-button', onClick: () => openFolder('diary') }, t('openDiary')),
          ]),
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
      },
    }
  },
})
