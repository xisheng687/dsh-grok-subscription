import { spawn } from 'node:child_process'
import { constants } from 'node:fs'
import { mkdtemp, open, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, extname, join } from 'node:path'

const VIDEO_TYPES = new Map([
  ['.mp4', 'video/mp4'], ['.mov', 'video/quicktime'], ['.mkv', 'video/x-matroska'], ['.webm', 'video/webm'],
])
const NATIVE_FILE_TYPES = new Set(['.mp4', '.mov'])
const ORIGINAL_STT_TYPES = new Set(['.mp4', '.mkv'])
const MAX_VIDEO_BYTES = 12 * 1024 * 1024 * 1024
const MAX_DURATION_SECONDS = 12 * 60 * 60
const MAX_NATIVE_FILE_BYTES = 50_000_000
const MAX_ORIGINAL_STT_BYTES = 200 * 1024 * 1024
const MAX_STT_UPLOAD_BYTES = 500_000_000
const SHORT_VIDEO_FRAMES = 24
const LONG_VIDEO_FRAMES = 48
const AUDIO_CHUNK_SECONDS = 15 * 60
const MAX_TRANSCRIPT_CHARS = 120_000
const DEFAULT_API_BASE = 'https://api.x.ai/v1'

class NativeVideoError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'NativeVideoError'
    this.status = status
  }
}

function run(command, args, { signal, maxOutput = 4 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], signal })
    const stdout = []
    const stderr = []
    let size = 0
    const collect = (target) => (chunk) => {
      size += chunk.length
      if (size > maxOutput) child.kill('SIGKILL')
      else target.push(chunk)
    }
    child.stdout.on('data', collect(stdout))
    child.stderr.on('data', collect(stderr))
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0 && size <= maxOutput) resolve({ stdout: Buffer.concat(stdout).toString(), stderr: Buffer.concat(stderr).toString() })
      else reject(new Error(`${command} failed (${code}): ${Buffer.concat(stderr).toString().slice(-1000)}`))
    })
  })
}

async function readRegularFileLimited(path, limit) {
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  try {
    const stat = await handle.stat()
    if (!stat.isFile() || stat.size <= 0 || stat.size > limit) throw new Error(`upload must be a regular file no larger than ${limit} bytes`)
    return await handle.readFile()
  } finally {
    await handle.close()
  }
}

async function inspectVideo(path, signal) {
  if (typeof path !== 'string' || !path.startsWith('/')) throw new Error('input_path must be absolute')
  if (!VIDEO_TYPES.has(extname(path).toLowerCase())) throw new Error('input_path must be MP4, MOV, MKV, or WebM')
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  let stat
  try { stat = await handle.stat() } finally { await handle.close() }
  if (!stat.isFile()) throw new Error('input_path must be a regular file')
  if (stat.size <= 0 || stat.size > MAX_VIDEO_BYTES) throw new Error('video must be between 1 byte and 12 GiB')
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', path], { signal })
  const probe = JSON.parse(stdout)
  const duration = Number(probe.format?.duration ?? probe.streams?.find((s) => s.codec_type === 'video')?.duration)
  if (!Number.isFinite(duration) || duration <= 0 || duration > MAX_DURATION_SECONDS) throw new Error('video duration must be between 0 and 12 hours')
  const stream = probe.streams?.find((s) => s.codec_type === 'video')
  if (!stream) throw new Error('input has no video stream')
  return {
    path, size: stat.size, duration,
    width: Number(stream.width) || undefined,
    height: Number(stream.height) || undefined,
    video_codec: stream.codec_name,
    has_audio: Boolean(probe.streams?.some((s) => s.codec_type === 'audio')),
  }
}

function responseText(body) {
  if (typeof body?.output_text === 'string') return body.output_text
  return (body?.output ?? []).flatMap((item) => item?.content ?? []).filter((item) => item?.type === 'output_text').map((item) => item.text).join('\n')
}

function timestamp(seconds) {
  const whole = Math.max(0, Math.floor(Number(seconds) || 0))
  const hours = Math.floor(whole / 3600)
  const minutes = Math.floor((whole % 3600) / 60)
  const secs = whole % 60
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}` : `${minutes}:${String(secs).padStart(2, '0')}`
}

function transcriptRows(body, offsetSeconds) {
  const words = Array.isArray(body?.words) ? body.words : []
  if (!words.length) {
    const text = typeof body?.text === 'string' ? body.text.trim() : ''
    return text ? [`[${timestamp(offsetSeconds)}] ${text}`] : []
  }
  const rows = []
  let row = []
  let rowStart = offsetSeconds + Number(words[0]?.start || 0)
  let speaker = words[0]?.speaker
  const flush = () => {
    if (!row.length) return
    rows.push(`[${timestamp(rowStart)}]${Number.isInteger(speaker) ? ` 说话人${speaker + 1}:` : ''} ${row.join(' ')}`)
    row = []
  }
  for (const word of words) {
    const nextSpeaker = word?.speaker
    const nextStart = offsetSeconds + Number(word?.start || 0)
    if (row.length && (nextSpeaker !== speaker || nextStart - rowStart >= 20 || row.join(' ').length >= 160)) {
      flush()
      rowStart = nextStart
      speaker = nextSpeaker
    }
    if (!row.length) {
      rowStart = nextStart
      speaker = nextSpeaker
    }
    if (typeof word?.text === 'string' && word.text.trim()) row.push(word.text.trim())
  }
  flush()
  return rows
}

async function sttFile(path, mime, token, language, signal, apiBase, offsetSeconds = 0) {
  const bytes = await readRegularFileLimited(path, MAX_STT_UPLOAD_BYTES)
  const form = new FormData()
  if (language !== 'auto') {
    form.set('format', 'true')
    form.set('language', language)
  }
  form.set('diarize', 'true')
  form.set('filler_words', 'true')
  // xAI requires the file field to be last so preceding options are honored.
  form.set('file', new Blob([bytes], { type: mime }), basename(path))
  const response = await fetch(`${apiBase}/stt`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: form, signal })
  const body = await response.json().catch(() => undefined)
  if (!response.ok || typeof body?.text !== 'string') throw new Error(`xAI STT failed with HTTP ${response.status}`)
  return transcriptRows(body, offsetSeconds)
}

function nativeEligible(metadata) {
  return metadata.size <= MAX_NATIVE_FILE_BYTES && NATIVE_FILE_TYPES.has(extname(metadata.path).toLowerCase())
}

function nativeFallbackAllowed(error) {
  return error instanceof NativeVideoError && [400, 404, 409, 413, 415, 422].includes(error.status)
}

async function analyzeOriginalFile({ metadata, prompt, token, signal, apiBase }) {
  const bytes = await readRegularFileLimited(metadata.path, MAX_NATIVE_FILE_BYTES)
  const form = new FormData()
  form.set('expires_after', '3600')
  form.set('purpose', 'assistants')
  form.set('file', new Blob([bytes], { type: VIDEO_TYPES.get(extname(metadata.path).toLowerCase()) }), basename(metadata.path))
  const upload = await fetch(`${apiBase}/files`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: form, signal })
  const uploaded = await upload.json().catch(() => undefined)
  if (!upload.ok || typeof uploaded?.id !== 'string') throw new NativeVideoError(`xAI original video upload failed with HTTP ${upload.status}`, upload.status)
  try {
    const content = [
      { type: 'input_text', text: `请直接分析所附原始视频文件，完整结合连续画面和原声音轨，包括对白、语气、停顿、音乐与环境声。给出中文概要、关键事件和带时间点的时间线；明确区分画面观察、声音观察、文字内容和推断。\n\n用户要求：${prompt || '完整理解这段视频。'}` },
      { type: 'input_file', file_id: uploaded.id },
    ]
    const response = await fetch(`${apiBase}/responses`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'grok-4.6', input: [{ role: 'user', content }], stream: false, max_output_tokens: 3000 }),
      signal,
    })
    const body = await response.json().catch(() => undefined)
    const analysis = responseText(body)
    if (!response.ok || !analysis) throw new NativeVideoError(`xAI original video analysis failed with HTTP ${response.status}`, response.status)
    return { analysis, transcript: '', metadata, strategy: 'original-file', audio_mode: 'original-soundtrack', sampled_frames: 0, frame_interval_seconds: 0 }
  } finally {
    await fetch(`${apiBase}/files/${encodeURIComponent(uploaded.id)}`, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } }).catch(() => undefined)
  }
}

async function analyzeSampled({ metadata, prompt, language, token, signal, apiBase, fallbackReason }) {
  const temp = await mkdtemp(join(tmpdir(), 'dsh-video-analysis-'))
  try {
    const frameBudget = metadata.duration > 30 * 60 ? LONG_VIDEO_FRAMES : SHORT_VIDEO_FRAMES
    const interval = Math.max(1, metadata.duration / Math.max(1, frameBudget - 1))
    await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', metadata.path, '-vf', `fps=1/${interval},scale='min(960,iw)':-2`, '-frames:v', String(frameBudget), '-q:v', '5', join(temp, 'frame-%03d.jpg')], { signal })
    const transcript = []
    let audioMode = 'none'
    if (metadata.has_audio) {
      const extension = extname(metadata.path).toLowerCase()
      if (metadata.size <= MAX_ORIGINAL_STT_BYTES && ORIGINAL_STT_TYPES.has(extension)) {
        transcript.push(...await sttFile(metadata.path, VIDEO_TYPES.get(extension), token, language, signal, apiBase))
        audioMode = 'original-container-stt'
      } else {
        // FLAC avoids the old 48 kbps MP3 quality loss while keeping chunks small.
        await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', metadata.path, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'flac', '-f', 'segment', '-segment_time', String(AUDIO_CHUNK_SECONDS), '-reset_timestamps', '1', join(temp, 'audio-%03d.flac')], { signal })
        const chunks = (await readdir(temp)).filter((name) => name.startsWith('audio-')).sort()
        for (let index = 0; index < chunks.length; index++) {
          transcript.push(...await sttFile(join(temp, chunks[index]), 'audio/flac', token, language, signal, apiBase, index * AUDIO_CHUNK_SECONDS))
        }
        audioMode = 'lossless-flac-chunks'
      }
    }
    const transcriptText = transcript.join('\n').slice(0, MAX_TRANSCRIPT_CHARS)
    const frames = (await readdir(temp)).filter((name) => name.startsWith('frame-')).sort()
    const content = [{
      type: 'input_text',
      text: `你在分析一个按时间顺序抽帧的视频。视频时长 ${metadata.duration.toFixed(1)} 秒，共 ${frames.length} 帧，帧间隔约 ${interval.toFixed(1)} 秒。\n带时间戳和说话人信息的原声音轨转写：\n${transcriptText || '（无音轨或没有识别到语音）'}\n\n用户要求：${prompt || '给出中文概要、关键事件和带时间点的时间线。明确区分画面观察、转写内容和推断。'}\n请返回清晰的中文 Markdown。`,
    }]
    for (const frame of frames) {
      const bytes = await readFile(join(temp, frame))
      content.push({ type: 'input_image', image_url: `data:image/jpeg;base64,${bytes.toString('base64')}`, detail: 'low' })
    }
    const response = await fetch(`${apiBase}/responses`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'grok-4.6', input: [{ role: 'user', content }], stream: false, max_output_tokens: 2500 }),
      signal,
    })
    const body = await response.json().catch(() => undefined)
    const analysis = responseText(body)
    if (!response.ok || !analysis) throw new Error(`xAI video synthesis failed with HTTP ${response.status}`)
    return {
      analysis, transcript: transcriptText, metadata, strategy: 'sampled-timeline', audio_mode: audioMode,
      sampled_frames: frames.length, frame_interval_seconds: interval,
      ...(fallbackReason ? { fallback_reason: fallbackReason } : {}),
    }
  } finally {
    await rm(temp, { recursive: true, force: true }).catch(() => undefined)
  }
}

export async function analyzeVideo({ inputPath, prompt, language, token, signal, strategy = 'auto', onPrepared, apiBase = DEFAULT_API_BASE }) {
  if (!['auto', 'original', 'sampled'].includes(strategy)) throw new Error('strategy must be auto, original, or sampled')
  const metadata = await inspectVideo(inputPath, signal)
  const eligible = nativeEligible(metadata)
  if (strategy === 'original' && !eligible) throw new Error('original-file mode requires MP4 or MOV no larger than 50 MB')
  const planned = strategy === 'sampled' || !eligible ? 'sampled' : 'original'
  await onPrepared(metadata, { strategy: planned, fallback: strategy === 'auto' && eligible })
  if (planned === 'original') {
    try {
      return await analyzeOriginalFile({ metadata, prompt, token, signal, apiBase })
    } catch (error) {
      if (strategy !== 'auto' || !nativeFallbackAllowed(error)) throw error
      return analyzeSampled({ metadata, prompt, language, token, signal, apiBase, fallbackReason: error.message })
    }
  }
  return analyzeSampled({ metadata, prompt, language, token, signal, apiBase })
}
