import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { analyzeSegment, buildTimeline, collectStream, fallbackDigest } from '../lib/analysis.js'
import { readTrailer, splitTrailer } from '../lib/reply.js'
import { deleteScreenshots } from '../lib/cleanup.js'
import { appendDetailSegment, separator, toPlainText } from '../lib/diary.js'
import { coveredDays, nextLocalMidnight, parseClock, clockReached, planFlush, planWindow } from '../lib/framing.js'
import { parseConfig } from '../lib/config.js'
import { REVEAL_TARGETS, revealCommand, revealDirectory } from '../lib/reveal.js'
import { createLedger, normalizeLedger } from '../lib/ledger.js'
import { effectiveSettings, normaliseClock, parseSettingsPatch } from '../lib/settings.js'
import { assertDeletableShot, dayKey, ensureStore, parseShotName, resolveStore } from '../lib/paths.js'
import { listShots, selectFrames } from '../lib/shots.js'

/** Fresh store under a temp directory, plus a helper that writes a scrabber shot. */
function makeStore() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-secretary-'))
  const store = resolveStore({ rootDir: root })
  ensureStore(store)
  const shot = (day, time, bytes = 'x') => {
    const dir = path.join(store.screenshots, day)
    fs.mkdirSync(dir, { recursive: true })
    const file = path.join(dir, `${day}T${time}.png`)
    fs.writeFileSync(file, bytes)
    return file
  }
  return { root, store, shot }
}

test('a fresh ledger starts paused, and only an explicit recording resumes it', () => {
  const fresh = createLedger(1_000)
  assert.equal(fresh.capture, 'paused', 'recording a screen must never be the default')
  assert.equal(fresh.panelAt, 0)
  assert.equal(normalizeLedger({ cursor: 5 }, 1_000).capture, 'paused')
  assert.equal(normalizeLedger({ cursor: 5, capture: 'paused' }, 1_000).capture, 'paused')
  assert.equal(normalizeLedger({ cursor: 5, capture: 'recording' }, 1_000).capture, 'recording')
  assert.equal(normalizeLedger({ cursor: 5, capture: 'nonsense' }, 1_000).capture, 'paused')
  assert.equal(normalizeLedger({ cursor: 5, panelAt: 42 }, 1_000).panelAt, 42)
  assert.equal(normalizeLedger({ cursor: 5 }, 1_000).panelAt, 0)
})

test('settings validation and precedence', () => {
  const base = { captureIntervalSeconds: 20, deltaTSeconds: 3_600, dailyDigestAt: '21:30', provider: null, model: null }

  assert.deepEqual(parseSettingsPatch({ deltaTSeconds: 1_800 }, base), {
    ok: true,
    value: { captureIntervalSeconds: 20, deltaTSeconds: 1_800, dailyDigestAt: '21:30', provider: null, model: null },
  })
  assert.deepEqual(parseSettingsPatch({ dailyDigestAt: '9:5' }, base).value.dailyDigestAt, '09:05')
  assert.equal(parseSettingsPatch({ captureIntervalSeconds: 5 }, base).value.captureIntervalSeconds, 5)
  assert.deepEqual(parseSettingsPatch({ provider: 'deepseek-account', model: 'deepseek-flash' }, base).value, {
    captureIntervalSeconds: 20, deltaTSeconds: 3_600, dailyDigestAt: '21:30', provider: 'deepseek-account', model: 'deepseek-flash',
  })
  // Empty route means "follow the profile".
  assert.equal(parseSettingsPatch({ provider: '', model: '' }, { ...base, provider: 'x', model: 'y' }).value.provider, null)

  assert.match(parseSettingsPatch({ nope: 1 }, base).error, /未知的设置项/)
  assert.match(parseSettingsPatch({ deltaTSeconds: 60 }, base).error, /5 分钟到 360 分钟/)
  assert.match(parseSettingsPatch({ deltaTSeconds: 1.5 }, base).error, /整数分钟/)
  assert.match(parseSettingsPatch({ captureIntervalSeconds: 1 }, base).error, /2 秒到 600 秒/)
  assert.match(parseSettingsPatch({ captureIntervalSeconds: 1.5 }, base).error, /整数秒/)
  assert.match(parseSettingsPatch({ dailyDigestAt: '25:00' }, base).error, /HH:mm/)
  assert.match(parseSettingsPatch({ provider: 'p' }, base).error, /一起选/)
  assert.match(parseSettingsPatch({ model: 'm' }, base).error, /一起选/)
  assert.equal(parseSettingsPatch('nope', base).ok, false)

  // Saved settings win over the row config, and a missing key falls back to it.
  assert.equal(effectiveSettings(base, { deltaTSeconds: 900 }).deltaTSeconds, 900)
  assert.equal(effectiveSettings(base, {}).deltaTSeconds, 3_600)
  assert.equal(effectiveSettings(base, { captureIntervalSeconds: 45 }).captureIntervalSeconds, 45)
  assert.equal(effectiveSettings(base, {}).captureIntervalSeconds, 20)
  assert.equal(effectiveSettings({ ...base, provider: 'p', model: 'm' }, { provider: null, model: null }).provider, null)

  assert.equal(normaliseClock('7:05'), '07:05')
  assert.equal(normaliseClock('24:00'), null)
  assert.equal(normaliseClock(''), null)
})

test('the file manager opener is per-platform and never takes a path from the caller', () => {
  assert.deepEqual(revealCommand('win32', 'D:/x/screenshots'), { command: 'explorer.exe', args: ['D:/x/screenshots'] })
  assert.deepEqual(revealCommand('darwin', '/x/diary'), { command: 'open', args: ['/x/diary'] })
  assert.deepEqual(revealCommand('linux', '/x/diary'), { command: 'xdg-open', args: ['/x/diary'] })
  assert.equal(revealCommand('aix', '/x'), null)
  assert.equal(revealCommand('win32', ''), null)

  const calls = []
  const spawner = (command, args) => {
    calls.push({ command, args })
    return { unref() {}, on() {} }
  }
  const ok = revealDirectory('D:/x/screenshots', { platform: 'win32', spawner })
  assert.equal(ok.ok, true)
  assert.equal(ok.directory, 'D:/x/screenshots')
  assert.deepEqual(calls, [{ command: 'explorer.exe', args: ['D:/x/screenshots'] }])

  const broken = revealDirectory('/x', { platform: 'win32', spawner: () => { throw new Error('nope') } })
  assert.equal(broken.ok, false)
  assert.match(broken.error, /nope/)
  assert.equal(revealDirectory('/x', { platform: 'aix', spawner }).ok, false)
  assert.deepEqual(REVEAL_TARGETS, ['screenshots', 'diary'])
})

test('scrabber file names carry the capture instant', () => {
  const parsed = parseShotName('2026-11-13T19.30.04.png')
  assert.ok(parsed)
  assert.equal(parsed.day, '2026-11-13')
  const d = new Date(parsed.ms)
  assert.equal(d.getHours(), 19)
  assert.equal(d.getMinutes(), 30)
  assert.equal(d.getSeconds(), 4)
  assert.equal(parseShotName('screenshot.png'), null)
  assert.equal(parseShotName('2026-11-13T19.30.png'), null)
  assert.equal(parseShotName('2026-02-31T10.00.00.png'), null)
})

test('a screenshot is only deletable exactly one date directory inside the root', () => {
  const { root, store, shot } = makeStore()
  const good = shot('2026-11-13', '10.00.00')
  assert.equal(assertDeletableShot(store, good).ok, true)

  const elsewhere = path.join(root, 'notes')
  fs.mkdirSync(elsewhere, { recursive: true })
  const outside = path.join(elsewhere, '2026-11-13T10.00.00.png')
  fs.writeFileSync(outside, 'x')
  assert.equal(assertDeletableShot(store, outside).ok, false, 'outside the screenshot root')

  const nestedDir = path.join(store.screenshots, '2026-11-13', 'deep')
  fs.mkdirSync(nestedDir, { recursive: true })
  const nested = path.join(nestedDir, '2026-11-13T10.00.00.png')
  fs.writeFileSync(nested, 'x')
  assert.equal(assertDeletableShot(store, nested).ok, false, 'not one level deep')

  const wrongName = path.join(store.screenshots, '2026-11-13', 'my-important-file.png')
  fs.writeFileSync(wrongName, 'x')
  assert.equal(assertDeletableShot(store, wrongName).ok, false, 'not a scrabber name')

  const mismatch = path.join(store.screenshots, '2026-11-13', '2026-11-14T10.00.00.png')
  fs.writeFileSync(mismatch, 'x')
  assert.equal(assertDeletableShot(store, mismatch).ok, false, 'name and directory disagree')

  const notADateDir = path.join(store.screenshots, 'keep-me')
  fs.mkdirSync(notADateDir, { recursive: true })
  const stray = path.join(notADateDir, '2026-11-13T10.00.00.png')
  fs.writeFileSync(stray, 'x')
  assert.equal(assertDeletableShot(store, stray).ok, false, 'parent is not a date directory')

  assert.equal(assertDeletableShot(store, store.screenshots).ok, false, 'the root itself is never a target')
  assert.equal(assertDeletableShot(store, path.join(store.screenshots, '2026-11-13')).ok, false, 'a directory is not a file')
})

test('cleanup deletes only eligible screenshots and never a foreign file', () => {
  const { root, store, shot } = makeStore()
  const a = shot('2026-11-13', '10.00.00', 'aaa')
  const b = shot('2026-11-13', '10.00.20', 'bbb')
  // A foreign file lives in its own date directory so the emptied one can go.
  const foreignDir = path.join(store.screenshots, '2026-11-14')
  fs.mkdirSync(foreignDir, { recursive: true })
  const foreign = path.join(foreignDir, 'notes.txt')
  fs.writeFileSync(foreign, 'do not delete')
  const outside = path.join(root, 'precious.txt')
  fs.writeFileSync(outside, 'do not delete')

  const files = [
    { path: a, ms: 1, size: 3 },
    { path: b, ms: 2, size: 3 },
    { path: foreign, ms: 3, size: 3 },
    { path: outside, ms: 4, size: 3 },
    { path: path.join(store.screenshots, '2026-11-13', '2026-11-13T10.00.40.png'), ms: 5, size: 0 },
  ]
  const result = deleteScreenshots(store, files, { auditFile: path.join(store.logs, 'deletions.jsonl') })

  assert.deepEqual(result.deleted.sort(), [a, b].sort())
  assert.equal(result.kept.length, 3)
  assert.equal(fs.existsSync(foreign), true, 'a non-screenshot file survives')
  assert.equal(fs.existsSync(outside), true, 'a file outside the store survives')
  assert.equal(fs.existsSync(path.dirname(a)), false, 'the emptied date directory is removed')
  assert.equal(fs.existsSync(foreignDir), true, 'a date directory holding anything else stays')
  const audit = fs.readFileSync(path.join(store.logs, 'deletions.jsonl'), 'utf8').trim().split('\n')
  assert.equal(audit.length, 2)
})

test('a date directory that still holds something is never removed', () => {
  const { store, shot } = makeStore()
  const a = shot('2026-11-13', '11.00.00')
  fs.writeFileSync(path.join(store.screenshots, '2026-11-13', 'keep.txt'), 'x')
  deleteScreenshots(store, [{ path: a, ms: 1, size: 1 }])
  assert.equal(fs.existsSync(a), false)
  assert.equal(fs.existsSync(path.join(store.screenshots, '2026-11-13')), true)
})

test('dry run deletes nothing', () => {
  const { store, shot } = makeStore()
  const a = shot('2026-11-13', '12.00.00')
  const result = deleteScreenshots(store, [{ path: a, ms: 1, size: 1 }], { dryRun: true })
  assert.equal(result.deleted.length, 1)
  assert.equal(fs.existsSync(a), true)
})

test('windows end on the interval edge or the next midnight, never on now', () => {
  const start = new Date(2026, 10, 13, 10, 0, 0, 0).getTime()
  const hour = 3_600_000

  assert.equal(planWindow({ cursor: start, now: start + hour - 1, deltaMs: hour }), null)

  const due = planWindow({ cursor: start, now: start + hour + 5_000, deltaMs: hour })
  assert.equal(due.reason, 'interval')
  assert.equal(due.start, start)
  assert.equal(due.end, start + hour, 'the edge is summarised, not "now"')

  const lateNight = new Date(2026, 10, 13, 23, 40, 0, 0).getTime()
  const midnight = planWindow({ cursor: lateNight, now: nextLocalMidnight(lateNight) + 1_000, deltaMs: hour })
  assert.equal(midnight.reason, 'day', 'a day boundary closes the window early')
  assert.equal(midnight.end, nextLocalMidnight(lateNight))
  assert.equal(dayKey(midnight.end), '2026-11-14')

  assert.equal(planWindow({ cursor: start, now: start - 1_000, deltaMs: hour }), null, 'a clock that went backwards is ignored')
})

test('flush summarises exactly up to now', () => {
  const start = 1_000_000
  assert.deepEqual(planFlush({ cursor: start, now: start + 90_000 }), { start, end: start + 90_000 })
  assert.equal(planFlush({ cursor: start, now: start }), null)
  assert.equal(planFlush({ cursor: start, now: start + 10, minWindowMs: 60_000 }), null)
})

test('a window spanning days reports every date it covers', () => {
  const from = new Date(2026, 10, 12, 22, 10, 0, 0).getTime()
  const to = new Date(2026, 10, 13, 9, 5, 0, 0).getTime()
  assert.deepEqual(coveredDays(from, to), ['2026-11-12', '2026-11-13'])
  assert.deepEqual(coveredDays(from, from + 60_000), ['2026-11-12'])
})

test('frame selection stays inside the budget and pins both ends', () => {
  const files = Array.from({ length: 180 }, (_, index) => ({ ms: index * 1_000, size: 1000 + index }))
  const picked = selectFrames(files, 8)
  assert.ok(picked.length <= 8)
  assert.equal(picked[0], 0)
  assert.equal(picked.at(-1), 179)
  const sorted = [...picked].sort((a, b) => a - b)
  assert.deepEqual(picked, sorted, 'chronological')
  assert.deepEqual(selectFrames(files.slice(0, 3), 8), [0, 1, 2], 'small inputs pass through')
  assert.deepEqual(selectFrames([], 8), [])
})

test('shot indexing honours the half-open window', async () => {
  const { store, shot } = makeStore()
  shot('2026-11-13', '10.00.00')
  const inside = shot('2026-11-13', '10.00.20')
  const after = shot('2026-11-13', '11.00.00')
  const from = new Date(2026, 10, 13, 10, 0, 0, 0).getTime()
  const to = new Date(2026, 10, 13, 10, 30, 0, 0).getTime()
  const listed = await listShots(store.screenshots, { from, to })
  assert.deepEqual(listed.files.map((file) => file.path), [inside])
  assert.ok(!listed.files.some((file) => file.path === after))
})

test('the reply keeps prose intact and lifts the trailer out of it', () => {
  const reply = '19:30 在写 ledger。\n\n19:45 编译失败一次。\n\n```json\n{"highlights":["修好原子写入"],"quip":"编译器的脾气比猫还大"}\n```'
  const { body, trailer } = splitTrailer(reply)
  assert.equal(body, '19:30 在写 ledger。\n\n19:45 编译失败一次。')
  const lifted = readTrailer(trailer, body)
  assert.deepEqual(lifted.highlights, ['修好原子写入'])
  assert.equal(lifted.quip, '编译器的脾气比猫还大')
})

test('a truncated trailer still leaves the whole body usable', () => {
  const cut = '正文第一段。\n\n正文第二段。\n\n```json\n{"highlights":["还没写完'
  const { body, trailer } = splitTrailer(cut)
  assert.equal(body, '正文第一段。\n\n正文第二段。')
  assert.equal(trailer, null)
  const lifted = readTrailer(null, body)
  assert.ok(lifted.highlights.length > 0, 'highlights fall back to the prose')
  assert.equal(lifted.highlights[0], '正文第一段。')
})

test('a plain reply without any trailer is still a valid record', () => {
  const { body, trailer } = splitTrailer('只有正文，没有任何围栏。')
  assert.equal(body, '只有正文，没有任何围栏。')
  assert.equal(trailer, null)
  assert.equal(readTrailer(null, body).highlights.length, 1)
})

test('an empty model reply is a failure, so no screenshot is released for it', async () => {
  async function* silent() {
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
  await assert.rejects(() => collectStream(silent()), /no text/)
})

test('the fallback card is built only from recorded facts', () => {
  const from = new Date(2026, 10, 13, 9, 0, 0, 0).getTime()
  const to = new Date(2026, 10, 13, 10, 0, 0, 0).getTime()
  const digest = fallbackDigest([
    { from, to, highlights: ['修好原子写入'], quip: '编译器脾气不小' },
  ])
  assert.equal(digest.title, '修好原子写入')
  assert.match(digest.body, /今天记录了 1 段工作/)
  assert.match(digest.body, /09:00–10:00/)
  assert.equal(digest.quip, '编译器脾气不小')
})

test('the timeline marks exactly the frames that are attached', () => {
  const files = [{ ms: 10, size: 1 }, { ms: 20, size: 1 }, { ms: 30, size: 1 }]
  const { text, pickedCount } = buildTimeline(files, [files[0], files[2]])
  assert.equal(pickedCount, 2)
  const lines = text.split('\n')
  assert.equal(lines.length, 3)
  assert.ok(lines[0].endsWith('★'))
  assert.ok(!lines[1].endsWith('★'))
  assert.ok(lines[2].endsWith('★'))
})

test('a text-only model gets a timeline-only request instead of images', async () => {
  const calls = []
  const llm = {
    resolveModelInfo: async () => ({ inputModalities: ['text'] }),
    async *stream(options) {
      calls.push(options)
      yield { type: 'text-delta', text: '只看到时间线。\n\n```json\n{"highlights":["整理文件"],"quip":"摸鱼"}\n```' }
      yield { type: 'finish', reason: { kind: 'stop' } }
    },
  }
  const files = [{ path: path.join(os.tmpdir(), 'unused.png'), ms: Date.now(), size: 1 }]
  const result = await analyzeSegment({
    llm,
    attachments: { imageLimits: { maxImagesPerMessage: 20 } },
    route: { provider: 'p', model: 'm' },
    files,
    start: files[0].ms - 1_000,
    end: files[0].ms,
    days: [dayKey(files[0].ms)],
    budget: 4,
    logger: { warn() {}, info() {} },
  })
  assert.equal(result.vision, false)
  assert.equal(result.images, 0)
  assert.equal(result.detail, '只看到时间线。')
  assert.deepEqual(result.highlights, ['整理文件'])
  const content = calls[0].messages[0].content
  assert.equal(content.length, 1, 'no image blocks without vision support')
  assert.equal(content[0].type, 'text')
})

test('consecutive diary segments share one separator', async () => {
  const { store } = makeStore()
  const start = new Date(2026, 10, 13, 10, 0, 0, 0).getTime()
  const mid = new Date(2026, 10, 13, 11, 0, 0, 0).getTime()
  const end = new Date(2026, 10, 13, 12, 0, 0, 0).getTime()
  await appendDetailSegment(store, { day: '2026-11-13', start, end: mid, body: '第一段' })
  await appendDetailSegment(store, { day: '2026-11-13', start: mid, end, body: '第二段' })
  const text = fs.readFileSync(path.join(store.detail, '2026-11-13.md'), 'utf8')
  assert.equal(text.split(separator(mid)).length - 1, 1, 'the shared boundary appears once')
  assert.ok(text.includes('第一段') && text.includes('第二段'))
  assert.ok(text.trimEnd().endsWith(separator(end)))
})

test('plain text drops the markdown the widget cannot draw', () => {
  const text = toPlainText('# 标题\n\n**加粗** 与 `代码`\n\n---\n\n> 引用')
  assert.ok(!text.includes('#'))
  assert.ok(!text.includes('**'))
  assert.ok(!text.includes('---'))
  assert.ok(text.includes('加粗'))
})

test('configuration validates, defaults, and rejects typos', () => {
  assert.equal(parseConfig(undefined).deltaTSeconds, 3_600)
  assert.equal(parseConfig({}).captureIntervalSeconds, 20)
  assert.equal(parseConfig({ dailyDigestAt: '9:5' }).dailyDigestAt, '09:05')
  assert.throws(() => parseConfig({ deltaTime: 10 }), /unknown config field/)
  assert.throws(() => parseConfig({ deltaTSeconds: 5 }), /between 60/)
  assert.throws(() => parseConfig({ widget: 'yes' }), /true or false/)
  assert.throws(() => parseConfig({ dailyDigestAt: '25:00' }), /valid local time/)
})

test('digest clock parsing', () => {
  assert.equal(parseClock('21:30'), 21 * 60 + 30)
  assert.equal(parseClock('nope'), null)
  const noon = new Date(2026, 10, 13, 12, 0, 0, 0).getTime()
  assert.equal(clockReached(noon, 11 * 60), true)
  assert.equal(clockReached(noon, 13 * 60), false)
  assert.equal(clockReached(noon, null), false)
})
