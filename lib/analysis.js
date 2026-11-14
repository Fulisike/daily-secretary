/**
 * The secretary brain.
 *
 * Stage A (`analyzeSegment`) turns one window of screenshots into a detailed
 * diary block plus machine-readable highlights, using the Host `llm` service
 * with image content. Stage B (`composeDailyDigest`) turns the whole day's
 * highlights into the short piece the desktop widget shows.
 *
 * Both prompts ask for prose FIRST and a machine-readable trailer LAST, so a
 * generation cut off by the token limit still leaves a complete record.
 */

import fs from 'node:fs'
import path from 'node:path'
import { clock, stamp } from './paths.js'
import { readTrailer, splitTrailer } from './reply.js'
import { describeWindow, selectFrames } from './shots.js'

/** Persona shared by both stages. */
export const SECRETARY_SYSTEM = `你是用户的私人秘书，代号"小秘"，负责把自动截屏转写成工作记录。

工作准则：
- 只根据证据说话。窗口标题、编辑器里的文件名、终端命令、浏览器标签、聊天内容、报错信息，都是可以引用的证据；看不清就写"看不清"，绝不编造。
- 具体优先于概括。写"在 VS Code 里改 lib/ledger.js 的原子写入"而不是"在处理一个编程任务"。
- 时间感要准。截屏的时间戳是真实时间，可以据此判断节奏（连续工作、长时间卡在同一屏、频繁切窗口、突然停手）。
- 语气忠实而有趣：允许适度吐槽、打趣、拟人，但不得扭曲事实，不得为了段子牺牲准确性。调侃对事不对人。
- 用简体中文，可以夹带必要的英文术语原文。`

/** Stage A instruction: prose first, trailer last. */
const SEGMENT_INSTRUCTION = `请写出这一段工作的详细记录。

输出格式严格如下：
1. 先直接写正文：Markdown，3-8 段，每段都要有具体证据和至少一个时间点，允许小标题或列表混排。正文里不要写分隔线，不要重复"记录区间"之类的标题。
2. 正文写完之后，另起一行，给一个 \`\`\`json 围栏，围栏里只放这两个字段：
{"highlights": ["3-6 条要点，每条一句话，说清这段时间实际推进了什么"], "quip": "一句吐槽，30 字以内，有趣但不刻薄"}

正文必须写在最前面——写太长被截断时，正文也要是完整的。`

/** Stage B instruction: same shape, fewer words. */
const DIGEST_INSTRUCTION = `请把今天各段工作的要点汇总成给用户自己看的一屏小结。

输出格式严格如下：
1. 先直接写正文：200-400 字，先按主线讲清今天实际做了什么（可以分 2-4 句），再点出节奏或偏航的地方。不要标题，不要 Markdown 分隔线。
2. 正文之后另起一行，给一个 \`\`\`json 围栏，围栏里只放：
{"title": "今天的一句话标题，12 字以内，有画面感", "quip": "一句吐槽，30 字以内"}`

/** First sentence, trimmed, when the model forgot to give a title. */
function titleFromBody(body) {
  const firstLine = String(body ?? '').split(/\n+/).map((line) => line.trim()).find((line) => line !== '') ?? ''
  const sentence = firstLine.split(/[。！？!?]/)[0] ?? ''
  const trimmed = sentence.replace(/[#*`>]/g, '').trim()
  if (trimmed === '') return '今天的小结'
  return trimmed.length > 14 ? `${trimmed.slice(0, 13)}…` : trimmed
}

/**
 * Timeline block for the prompt: every capture instant, marking the frames that
 * travel as images. Density and gaps are evidence the model can use.
 */
export function buildTimeline(files, picked) {
  const pickedMs = new Set(picked.map((file) => file.ms))
  const lines = files.map((file) => `${stamp(file.ms)}${pickedMs.has(file.ms) ? ' ★' : ''}`)
  return { text: lines.join('\n'), pickedCount: pickedMs.size }
}

/** Prompt body for one segment window. */
export function buildSegmentPrompt({ files, picked, start, end, days, timeline }) {
  const dayNote = days.length > 1 ? `\n注意：这一段跨越了 ${days.length} 天（${days.join('、')}），请按时间顺序分别交代。` : ''
  return [
    `记录区间：${describeWindow(start, end)}（本地时间）`,
    `这段区间共 ${files.length} 张截屏，其中 ${picked.length} 张以图片形式附在下面，标 ★ 的就是它们。`,
    '',
    '完整时间线（★ = 已附图）：',
    timeline,
    dayNote,
    '',
    '附图的顺序与下列标签一致，每个标签后面就是那一刻的屏幕：',
  ].join('\n')
}

/** Build the single user message holding the prompt and its images. */
export function buildImageMessage({ text, labeled }) {
  const content = [{ type: 'text', text }]
  for (const item of labeled) {
    content.push({ type: 'text', text: `── ${stamp(item.ms)} ──` })
    content.push({ type: 'image', attachment: item.ref })
  }
  return [{ role: 'user', content }]
}

/**
 * Concatenate a model stream into text.
 *
 * An empty reply is a failure, not a result: a reasoning model can spend the
 * whole token budget thinking and emit no text at all. Treating that as success
 * would delete screenshots nothing was learned from.
 */
export async function collectStream(stream) {
  let text = ''
  let failure = null
  for await (const chunk of stream) {
    if (chunk?.type === 'text-delta') text += chunk.text ?? ''
    else if (chunk?.type === 'finish') {
      const reason = chunk.reason
      if (reason?.kind === 'error' || reason?.kind === 'aborted') {
        failure = reason.failure ?? { message: `model ${reason.kind}` }
      }
    }
  }
  if (text.trim() === '') {
    const error = new Error(failure?.message ?? 'model returned no text (token budget spent on reasoning?)')
    error.code = failure?.code ?? 'EMPTY_REPLY'
    throw error
  }
  return text
}

/**
 * A card built only from recorded facts, used when the model cannot produce the
 * daily piece. Numbers and highlights are real; only the prose is missing.
 */
export function fallbackDigest(segments) {
  const highlights = segments.flatMap((segment) => segment.highlights ?? []).filter((line) => typeof line === 'string' && line !== '')
  const lines = segments.map((segment, index) => {
    const point = (segment.highlights ?? [])[0] ?? '（这一段没有要点）'
    return `${index + 1}. ${clock(segment.from)}–${clock(segment.to)} · ${point}`
  })
  const body = [
    `今天记录了 ${segments.length} 段工作。模型这次没能写出小结，下面是从每段要点直接汇总的版本：`,
    '',
    ...lines,
  ].join('\n')
  const title = highlights.length > 0 ? highlights[0].slice(0, 14) : '今天的小结'
  return { title, body, quip: segments.at(-1)?.quip ?? '' }
}

/**
 * Stage A: analyse one window of screenshots.
 *
 * @param {object} options
 * @param {{ stream: Function, resolveModelInfo?: Function }} options.llm
 * @param {{ saveImages?: Function, imageLimits?: object } | undefined} options.attachments
 * @param {{ provider: string, model: string }} options.route
 * @param {Array<{ path: string, ms: number, size: number }>} options.files
 * @param {number} options.start
 * @param {number} options.end
 * @param {string[]} options.days
 * @param {number} options.budget how many images to attach at most
 * @param {number} [options.maxTokens]
 * @param {AbortSignal} [options.signal]
 * @param {{ info: Function, warn: Function }} options.logger
 * @returns {Promise<{ detail: string, highlights: string[], quip: string, meta: string, images: number, vision: boolean }>}
 */
export async function analyzeSegment(options) {
  const { llm, attachments, route, files, start, end, days, logger } = options
  const indices = selectFrames(files, Math.max(1, options.budget))
  const picked = indices.map((index) => files[index])

  let vision = false
  if (typeof llm.resolveModelInfo === 'function') {
    try {
      const info = await llm.resolveModelInfo(route.provider, route.model, options.signal)
      vision = Array.isArray(info?.inputModalities) && info.inputModalities.includes('image')
    } catch (error) {
      logger.warn('daily-secretary: cannot resolve model capabilities (%s); assuming text only', error?.message ?? error)
    }
  }

  const context = buildSegmentPrompt({
    files,
    picked,
    start,
    end,
    days,
    timeline: buildTimeline(files, picked).text,
  })

  let labeled = []
  let imageNote = ''
  if (vision && attachments && picked.length > 0) {
    try {
      const limit = Math.min(
        Number(attachments.imageLimits?.maxImagesPerMessage ?? 20) - 1,
        picked.length,
      )
      const inputs = []
      for (const file of picked.slice(0, Math.max(0, limit))) {
        const data = await fs.promises.readFile(file.path)
        inputs.push({ data, mediaType: 'image/png', name: path.basename(file.path) })
      }
      const refs = await attachments.saveImages(inputs)
      labeled = inputs.map((_, index) => ({ ms: picked[index].ms, ref: refs[index] }))
    } catch (error) {
      logger.warn('daily-secretary: cannot attach screenshots (%s); falling back to the timeline', error?.message ?? error)
      labeled = []
      imageNote = '\n注意：本段截屏未能作为图片附上，请只依据时间线描述节奏，不要编造屏幕内容。\n'
    }
  } else if (!vision) {
    imageNote = '\n注意：当前模型不支持图片输入，本段只提供时间线，请只依据时间线描述工作节奏，并明确说明没有看到屏幕内容。\n'
  } else if (picked.length === 0) {
    imageNote = '\n注意：这一段没有留下截屏文件，请只依据时间线描述。\n'
  }

  const messages = buildImageMessage({ text: `${SEGMENT_INSTRUCTION}\n\n${context}${imageNote}`, labeled })

  const reply = await collectStream(llm.stream({
    provider: route.provider,
    model: route.model,
    system: SECRETARY_SYSTEM,
    messages,
    maxTokens: options.maxTokens ?? 3_072,
    signal: options.signal,
  }))

  const { body, trailer } = splitTrailer(reply)
  const { highlights, quip } = readTrailer(trailer, body)
  const detail = body.trim() === '' ? '（本段模型没有返回可用内容。）' : body.trim()
  const meta = `${describeWindow(start, end)} · 截屏 ${files.length} 张 · 精选 ${labeled.length} 帧${vision ? '' : ' · 仅时间线'}`
  return { detail, highlights, quip, meta, images: labeled.length, vision }
}

/**
 * Stage B: the day's short piece for the widget.
 *
 * @param {object} options
 * @param {{ provider: string, model: string }} options.route
 * @param {string} options.day
 * @param {Array<{ from: number, to: number, highlights: string[], quip: string }>} options.segments
 * @param {{ stream: Function }} options.llm
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<{ title: string, body: string, quip: string }>}
 */
export async function composeDailyDigest(options) {
  const { day, segments, llm, route } = options
  const notes = segments.map((segment, index) => {
    const range = `${clock(segment.from)}-${clock(segment.to)}`
    const points = segment.highlights.length > 0
      ? segment.highlights.map((line) => `  · ${line}`).join('\n')
      : '  · （无要点）'
    return `${index + 1}. [${range}]\n${points}${segment.quip ? `\n  吐槽素材：${segment.quip}` : ''}`
  }).join('\n')

  const prompt = `日期：${day}\n今天一共记录了 ${segments.length} 段工作：\n\n${notes}\n\n${DIGEST_INSTRUCTION}`
  const reply = await collectStream(llm.stream({
    provider: route.provider,
    model: route.model,
    system: SECRETARY_SYSTEM,
    messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
    maxTokens: options.maxTokens ?? 1_024,
    signal: options.signal,
  }))

  const { body, trailer } = splitTrailer(reply)
  const title = typeof trailer?.title === 'string' && trailer.title.trim() !== ''
    ? trailer.title.trim()
    : titleFromBody(body)
  const quip = typeof trailer?.quip === 'string' ? trailer.quip.trim() : ''
  return { title, body: body.trim(), quip }
}
