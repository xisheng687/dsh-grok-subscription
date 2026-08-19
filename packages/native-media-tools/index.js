import { randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { mkdir, open, rename, unlink } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, extname, isAbsolute, join } from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'
import '@deepseek-ai/dsh-user-questions'
import { createMediaHandler, loadMediaKey, localMediaUrl, MEDIA_ROUTE_PATH } from './media-proxy.js'
import { analyzeVideo } from './video-analysis.js'

export const name = 'tool-native-media'
export const inject = ['tools', 'userQuestions']

const API_BASE = 'https://api.x.ai/v1'
const MAX_TTS_TEXT = 5_000
const MAX_AUDIO_BYTES = 25 * 1024 * 1024
const MAX_RESPONSE_BYTES = 32 * 1024 * 1024
const VOICES = new Set(['ara', 'eve', 'leo', 'rex', 'sal'])
const AUDIO_TYPES = new Map([
  ['.aac', 'audio/aac'],
  ['.flac', 'audio/flac'],
  ['.m4a', 'audio/mp4'],
  ['.mp3', 'audio/mpeg'],
  ['.mp4', 'audio/mp4'],
  ['.mpeg', 'audio/mpeg'],
  ['.oga', 'audio/ogg'],
  ['.ogg', 'audio/ogg'],
  ['.opus', 'audio/ogg'],
  ['.wav', 'audio/wav'],
  ['.webm', 'audio/webm'],
])
const MEDIA_TYPES = new Map([
  ...AUDIO_TYPES,
  ['.mkv', 'video/x-matroska'],
  ['.mov', 'video/quicktime'],
  ['.mp4', 'video/mp4'],
  ['.webm', 'video/webm'],
])

function textBlock(value) {
  return [{ type: 'text', text: JSON.stringify(value) }]
}

function requireLanguage(value) {
  const language = value?.trim() || 'auto'
  if (!/^(?:auto|[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*)$/.test(language)) {
    throw new Error('language must be auto or a BCP-47 language code')
  }
  return language
}

function accessToken() {
  const token = process.env.XAI_API_KEY?.trim()
  if (!token) throw new Error('XAI_API_KEY is required for xAI audio and long-video analysis')
  return token
}

async function readResponseLimited(response, limit) {
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > limit) throw new Error('xAI audio response exceeds the size limit')
  if (!response.body) return new Uint8Array()
  const reader = response.body.getReader()
  const chunks = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > limit) {
      await reader.cancel()
      throw new Error('xAI audio response exceeds the size limit')
    }
    chunks.push(value)
  }
  const joined = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    joined.set(chunk, offset)
    offset += chunk.byteLength
  }
  return joined
}

async function atomicWrite(path, bytes) {
  const temp = `${path}.tmp-${randomUUID()}`
  let handle
  try {
    handle = await open(temp, 'wx', 0o600)
    await handle.writeFile(bytes)
    await handle.sync()
    await handle.close()
    handle = undefined
    await rename(temp, path)
  } catch (error) {
    await handle?.close().catch(() => undefined)
    await unlink(temp).catch(() => undefined)
    throw error
  }
}

async function openAudio(path) {
  if (!isAbsolute(path)) throw new Error('input_path must be absolute')
  const mime = AUDIO_TYPES.get(extname(path).toLowerCase())
  if (!mime) throw new Error('input_path must use a supported audio extension')
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  try {
    const stat = await handle.stat()
    if (!stat.isFile()) throw new Error('input_path must be a regular file')
    if (stat.size <= 0 || stat.size > MAX_AUDIO_BYTES) throw new Error('audio file must be between 1 byte and 25 MiB')
    return { bytes: await handle.readFile(), mime, size: stat.size }
  } finally {
    await handle.close()
  }
}

async function inspectMedia(path) {
  if (!isAbsolute(path)) throw new Error('input_path must be absolute')
  const mime = MEDIA_TYPES.get(extname(path).toLowerCase())
  if (!mime) throw new Error('input_path must use a supported audio or video extension')
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  try {
    const stat = await handle.stat()
    if (!stat.isFile() || stat.size <= 0) throw new Error('input_path must be a non-empty regular file')
    return { mime, size: stat.size }
  } finally { await handle.close() }
}

function outputRoot(ctx) {
  return join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'native-media')
}

export function apply(ctx) {
  const home = process.env.DSH_HOME || join(homedir(), '.dsh')
  let mediaKey
  try { mediaKey = loadMediaKey(home) } catch (error) { ctx.logger?.warn?.('Grok media signing key unavailable', error) }
  let mediaRouteMounted = false
  const mediaUrlFor = (path) => mediaRouteMounted && mediaKey ? localMediaUrl(mediaKey, path) : undefined
  ctx.inject?.(['webServer'], (webCtx) => {
    webCtx.effect(() => {
      if (!mediaKey) return undefined
      const dispose = webCtx.webServer.register({ kind: 'prefix', path: MEDIA_ROUTE_PATH, handler: createMediaHandler(mediaKey) })
      mediaRouteMounted = true
      return () => { mediaRouteMounted = false; dispose() }
    })
  })

  ctx.tools.register(defineTool({
    name: 'media_text_to_speech',
    description: 'Create a private MP3 speech file with the xAI API. Requires XAI_API_KEY.',
    parameters: {
      text: { type: 'string', required: true, description: 'Text to speak, up to 5,000 characters.' },
      voice: { type: 'string', enum: ['ara', 'eve', 'leo', 'rex', 'sal'], description: 'Built-in xAI voice. Defaults to eve.' },
      language: { type: 'string', description: 'auto or a BCP-47 language code. Defaults to auto.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          path: { type: 'string', required: true },
          mime_type: { type: 'string', required: true },
          bytes: { type: 'integer', required: true },
          url: { type: 'string' },
        },
      },
      render: (_args, value) => textBlock(value),
    },
    timeoutMs: 120_000,
    async execute(args, exec) {
      const text = args.text.trim()
      if (!text || text.length > MAX_TTS_TEXT) throw new Error('text must contain 1 to 5,000 characters')
      const voice = args.voice ?? 'eve'
      if (!VOICES.has(voice)) throw new Error('unsupported voice')
      const token = accessToken()
      const response = await fetch(`${API_BASE}/tts`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ text, voice_id: voice, language: requireLanguage(args.language) }),
        signal: exec.signal,
      })
      if (!response.ok) {
        await response.body?.cancel()
        throw new Error(`xAI TTS failed with HTTP ${response.status}`)
      }
      const bytes = await readResponseLimited(response, MAX_RESPONSE_BYTES)
      const root = outputRoot(ctx)
      await mkdir(root, { recursive: true, mode: 0o700 })
      const path = join(root, `tts-${Date.now()}-${randomUUID()}.mp3`)
      await atomicWrite(path, bytes)
      return { path, mime_type: 'audio/mpeg', bytes: bytes.byteLength, ...(mediaUrlFor(path) ? { url: mediaUrlFor(path) } : {}) }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'media_speech_to_text',
    description: 'Transcribe a local audio file with the xAI API. Requires XAI_API_KEY and always asks before upload.',
    parameters: {
      input_path: { type: 'string', required: true, description: 'Absolute path to a supported audio file, maximum 25 MiB.' },
      language: { type: 'string', description: 'auto or a BCP-47 language code. Defaults to auto.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          text: { type: 'string', required: true },
          language: { type: 'string' },
          duration: { type: 'number' },
        },
      },
      render: (_args, value) => textBlock(value),
    },
    timeoutMs: 180_000,
    async execute(args, exec) {
      const audio = await openAudio(args.input_path)
      const label = '允许上传'
      const answer = await ctx.userQuestions.ask({
        questions: [{
          id: 'grok-stt-upload',
          header: '音频转写授权',
          question: `是否将 ${basename(args.input_path)}（${audio.size} 字节）上传到 api.x.ai 进行转写？`,
          detail: '文件内容会发送给 xAI。插件不会把 OAuth token 返回给浏览器或模型。',
          options: [
            { label, description: '仅本次上传这个音频文件。' },
            { label: '取消', description: '不上传文件。' },
          ],
        }],
        ...(exec.agent ? { agent: exec.agent } : {}),
        signal: exec.signal,
      })
      if (!answer.answers[0]?.selected.includes(label)) throw new Error('audio upload was not approved')
      const form = new FormData()
      form.set('format', 'true')
      form.set('language', requireLanguage(args.language))
      form.set('file', new Blob([audio.bytes], { type: audio.mime }), basename(args.input_path))
      const token = accessToken()
      const response = await fetch(`${API_BASE}/stt`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: form,
        signal: exec.signal,
      })
      const body = await response.json().catch(() => undefined)
      if (!response.ok || typeof body?.text !== 'string') throw new Error(`xAI STT failed with HTTP ${response.status}`)
      return {
        text: body.text,
        ...(typeof body.language === 'string' ? { language: body.language } : {}),
        ...(typeof body.duration === 'number' ? { duration: body.duration } : {}),
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'present_local_media',
    description: 'Show an existing local audio or video file as a persistent native player card in DeepSeek Harness. The file is not uploaded.',
    parameters: { input_path: { type: 'string', required: true, description: 'Absolute path to a supported local audio/video file.' } },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          kind: { type: 'string', required: true }, path: { type: 'string', required: true },
          url: { type: 'string', required: true }, mime_type: { type: 'string', required: true }, bytes: { type: 'integer', required: true },
        },
      },
      render: (_args, value) => textBlock(value),
    },
    async execute(args) {
      const media = await inspectMedia(args.input_path)
      const url = mediaUrlFor(args.input_path)
      if (!url) throw new Error('DSH web media route is unavailable')
      return { kind: media.mime.startsWith('video/') ? 'video' : 'audio', path: args.input_path, url, mime_type: media.mime, bytes: media.size }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'analyze_long_video',
    description: 'Understand a local video. Uses the original MP4/MOV file with its soundtrack when supported, otherwise falls back to sampled frames plus timestamped, diarized audio transcription. Requires XAI_API_KEY and asks before upload.',
    parameters: {
      input_path: { type: 'string', required: true, description: 'Absolute MP4, MOV, MKV, or WebM path; up to 12 GiB / 12 hours.' },
      prompt: { type: 'string', description: 'What to extract from the video. Defaults to a Chinese summary and timeline.' },
      language: { type: 'string', description: 'Speech language or auto. Defaults to auto.' },
      strategy: { type: 'string', enum: ['auto', 'original', 'sampled'], description: 'auto prefers the original file; original forbids fallback; sampled minimizes upload size. Defaults to auto.' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          kind: { type: 'string', required: true }, path: { type: 'string', required: true }, url: { type: 'string', required: true },
          analysis: { type: 'string', required: true }, transcript: { type: 'string', required: true },
          metadata: {
            type: 'object', required: true, additionalProperties: false,
            properties: {
              path: { type: 'string', required: true }, size: { type: 'integer', required: true }, duration: { type: 'number', required: true },
              width: { type: 'integer' }, height: { type: 'integer' }, video_codec: { type: 'string' }, has_audio: { type: 'boolean', required: true },
            },
          }, strategy: { type: 'string', required: true }, audio_mode: { type: 'string', required: true },
          fallback_reason: { type: 'string' }, sampled_frames: { type: 'integer', required: true }, frame_interval_seconds: { type: 'number', required: true },
        },
      },
      render: (_args, value) => textBlock(value),
    },
    timeoutMs: 30 * 60 * 1000,
    async execute(args, exec) {
      const language = requireLanguage(args.language)
      const result = await analyzeVideo({
        inputPath: args.input_path,
        prompt: typeof args.prompt === 'string' ? args.prompt.trim().slice(0, 10_000) : '',
        language,
        strategy: args.strategy ?? 'auto',
        token: accessToken(),
        signal: exec.signal,
        async onPrepared(metadata, plan) {
          const label = '允许本次分析'
          const original = plan.strategy === 'original'
          const answer = await ctx.userQuestions.ask({
            questions: [{
              id: 'grok-video-analysis-upload', header: '视频理解授权',
              question: original
                ? `是否将 ${basename(args.input_path)} 的原始视频和原声音轨发送到 xAI？`
                : `是否将 ${basename(args.input_path)} 的抽帧和原声音轨转写发送到 xAI？`,
              detail: original
                ? `整段原文件会临时上传，处理后立即请求删除，最长保留 1 小时。时长 ${metadata.duration.toFixed(1)} 秒，大小 ${metadata.size} 字节。${plan.fallback ? '若服务端不接受该视频格式，会自动改用抽帧与转写。' : ''}`
                : `原视频不会整体上传。最多发送 48 张抽帧和带时间戳/说话人信息的转写；临时文件在分析后删除。时长 ${metadata.duration.toFixed(1)} 秒。`,
              options: [{ label, description: original ? '仅允许本次原文件处理及已说明的回退。' : '仅允许本次派生内容处理。' }, { label: '取消', description: '不发送任何内容。' }],
            }],
            ...(exec.agent ? { agent: exec.agent } : {}), signal: exec.signal,
          })
          if (!answer.answers[0]?.selected.includes(label)) throw new Error('video analysis upload was not approved')
        },
      })
      const url = mediaUrlFor(args.input_path)
      if (!url) throw new Error('DSH web media route is unavailable')
      return { kind: 'video-analysis', path: args.input_path, url, ...result }
    },
  }))
}
