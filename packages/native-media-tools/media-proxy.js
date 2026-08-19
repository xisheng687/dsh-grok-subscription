import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { createReadStream, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, join } from 'node:path'

export const MEDIA_ROUTE_PATH = '/native-media'

const CONTENT_TYPES = new Map([
  ['.aac', 'audio/aac'], ['.flac', 'audio/flac'], ['.m4a', 'audio/mp4'],
  ['.mp3', 'audio/mpeg'], ['.oga', 'audio/ogg'], ['.ogg', 'audio/ogg'],
  ['.opus', 'audio/ogg'], ['.wav', 'audio/wav'], ['.webm', 'video/webm'],
  ['.mp4', 'video/mp4'], ['.mov', 'video/quicktime'], ['.mkv', 'video/x-matroska'],
])

export function loadMediaKey(homeDir) {
  const path = join(homeDir, '.native-media-key')
  try { return readFileSync(path) } catch (error) { if (error?.code !== 'ENOENT') throw error }
  mkdirSync(homeDir, { recursive: true, mode: 0o700 })
  const key = randomBytes(32)
  try {
    writeFileSync(path, key, { flag: 'wx', mode: 0o600 })
    return key
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error
    return readFileSync(path)
  }
}

function mediaToken(key, path) {
  return createHmac('sha256', key).update(path).digest('base64url')
}

export function localMediaUrl(key, path) {
  return `${MEDIA_ROUTE_PATH}/${encodeURIComponent(path)}?t=${encodeURIComponent(mediaToken(key, path))}`
}

function tokenMatches(expected, candidate) {
  const left = Buffer.from(expected)
  const right = Buffer.from(candidate ?? '')
  return left.length === right.length && timingSafeEqual(left, right)
}

function parseRange(value, size) {
  if (!value) return undefined
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim())
  if (!match || (!match[1] && !match[2])) return null
  let start
  let end
  if (!match[1]) {
    const suffix = Number(match[2])
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return null
    start = Math.max(0, size - suffix)
    end = size - 1
  } else {
    start = Number(match[1])
    end = match[2] ? Number(match[2]) : size - 1
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) return null
  return { start, end: Math.min(end, size - 1) }
}

export function createMediaHandler(key) {
  return async (req, res) => {
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { allow: 'GET, HEAD' }); res.end(); return
      }
      const url = new URL(req.url ?? '/', 'http://media')
      const prefix = `${MEDIA_ROUTE_PATH}/`
      if (!url.pathname.startsWith(prefix)) { res.writeHead(404); res.end(); return }
      let path
      try { path = decodeURIComponent(url.pathname.slice(prefix.length)) } catch { res.writeHead(400); res.end(); return }
      if (!tokenMatches(mediaToken(key, path), url.searchParams.get('t'))) { res.writeHead(404); res.end(); return }
      const info = await stat(path).catch(() => undefined)
      if (!info?.isFile()) { res.writeHead(404); res.end(); return }
      const range = parseRange(req.headers.range, info.size)
      if (range === null) {
        res.writeHead(416, { 'content-range': `bytes */${info.size}`, 'accept-ranges': 'bytes' }); res.end(); return
      }
      const headers = {
        'content-type': CONTENT_TYPES.get(extname(path).toLowerCase()) ?? 'application/octet-stream',
        'accept-ranges': 'bytes',
        'cache-control': 'private, max-age=31536000, immutable',
      }
      if (range) {
        headers['content-range'] = `bytes ${range.start}-${range.end}/${info.size}`
        headers['content-length'] = String(range.end - range.start + 1)
        res.writeHead(206, headers)
      } else {
        headers['content-length'] = String(info.size)
        res.writeHead(200, headers)
      }
      if (req.method === 'HEAD') { res.end(); return }
      const stream = createReadStream(path, range ?? {})
      stream.on('error', () => res.destroy())
      stream.pipe(res)
    } catch {
      if (!res.headersSent) res.writeHead(500)
      res.end()
    }
  }
}
