/**
 * The loopback API the desktop widget talks to.
 *
 * The widget is a separate native process, so the plugin needs a local channel.
 * It binds `127.0.0.1` on an ephemeral port with a per-run token: a request
 * without the token header is rejected before it can read anything, and no CORS
 * header is ever sent, so a random web page cannot read the diary through the
 * user's browser.
 */

import { randomBytes } from 'node:crypto'
import http from 'node:http'

const MAX_BODY_BYTES = 8_192

/** New per-run token. */
export function createToken() {
  return randomBytes(24).toString('hex')
}

/**
 * Start the loopback server.
 *
 * @param {object} options
 * @param {() => object} options.getState snapshot handed to the widget
 * @param {(action: string, payload: object) => Promise<object>} options.onAction
 * @param {{ info: Function, warn: Function }} options.logger
 * @returns {Promise<{ port: number, token: string, origin: string, close: () => Promise<void> }>}
 */
export function startWidgetServer({ getState, onAction, logger }) {
  const token = createToken()

  const server = http.createServer((request, response) => {
    const send = (status, body) => {
      const text = JSON.stringify(body)
      response.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'content-length': Buffer.byteLength(text),
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      })
      response.end(text)
    }

    if (request.headers['x-daily-secretary-token'] !== token) {
      request.resume()
      send(401, { error: 'token required' })
      return
    }

    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    if (request.method === 'GET' && url.pathname === '/api/state') {
      try {
        send(200, getState())
      } catch (error) {
        logger.warn('daily-secretary: state snapshot failed (%s)', error?.message ?? error)
        send(500, { error: 'state unavailable' })
      }
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/action') {
      let size = 0
      const chunks = []
      request.on('data', (chunk) => {
        size += chunk.length
        if (size > MAX_BODY_BYTES) {
          response.destroy()
          request.destroy()
          return
        }
        chunks.push(chunk)
      })
      request.on('error', () => { /* client hung up */ })
      request.on('end', () => {
        if (response.destroyed) return
        let payload = {}
        try {
          payload = Buffer.concat(chunks).toString('utf8').trim() === ''
            ? {}
            : JSON.parse(Buffer.concat(chunks).toString('utf8'))
        } catch {
          send(400, { error: 'body must be JSON' })
          return
        }
        const action = typeof payload?.action === 'string' ? payload.action : ''
        if (action === '') {
          send(400, { error: 'action required' })
          return
        }
        Promise.resolve(onAction(action, payload))
          .then((result) => send(200, result ?? { ok: true }))
          .catch((error) => {
            logger.warn('daily-secretary: widget action %s failed (%s)', action, error?.message ?? error)
            send(500, { error: String(error?.message ?? error) })
          })
      })
      return
    }

    send(404, { error: 'not found' })
  })

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address !== null ? address.port : 0
      logger.info('daily-secretary: widget API on http://127.0.0.1:%s', port)
      resolve({
        port,
        token,
        origin: `http://127.0.0.1:${port}`,
        async close() {
          await new Promise((done) => server.close(() => done()))
        },
      })
    })
  })
}
