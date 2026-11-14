/**
 * Reply parsing for the secretary prompts.
 *
 * The diary body is plain prose written BEFORE any machine-readable trailer, so
 * a truncated generation still yields a usable record: only the trailer is lost.
 */

/** Split a reply into prose and its optional JSON trailer. */
export function splitTrailer(text) {
  const raw = String(text ?? '')
  const fence = /```json\s*([\s\S]*?)```/i.exec(raw)
  if (fence !== null) {
    const body = raw.slice(0, fence.index).trim()
    try {
      const trailer = JSON.parse(fence[1])
      if (trailer !== null && typeof trailer === 'object' && !Array.isArray(trailer)) return { body, trailer }
    } catch {
      return { body, trailer: null }
    }
    return { body, trailer: null }
  }
  // An unterminated fence is what a token-limit cut looks like: drop it entirely.
  const open = raw.search(/```json/i)
  if (open !== -1) return { body: raw.slice(0, open).trim(), trailer: null }
  return { body: raw.trim(), trailer: null }
}

/** Normalise the machine-readable trailer. */
export function readTrailer(trailer, body) {
  const highlights = Array.isArray(trailer?.highlights)
    ? trailer.highlights.filter((item) => typeof item === 'string' && item.trim() !== '').map((item) => item.trim()).slice(0, 8)
    : fallbackHighlights(body)
  const quip = typeof trailer?.quip === 'string' ? trailer.quip.trim() : ''
  return { highlights, quip }
}

/** Last resort: the body's own headings or first sentences. */
export function fallbackHighlights(body) {
  const text = String(body ?? '').trim()
  if (text === '') return []
  const headings = text.split(/\n+/).filter((line) => /^#{1,6}\s+/.test(line.trim()))
  if (headings.length > 0) return headings.slice(0, 5).map((line) => line.trim().replace(/^#{1,6}\s+/, ''))
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
    .filter((paragraph) => paragraph !== '')
    .slice(0, 3)
    .map((paragraph) => (paragraph.length > 90 ? `${paragraph.slice(0, 88)}…` : paragraph))
}
