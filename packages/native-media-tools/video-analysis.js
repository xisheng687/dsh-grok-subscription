import { spawn } from 'node:child_process'
import { constants } from 'node:fs'
import { mkdtemp, open, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, extname, join } from 'node:path'

const VIDEO_TYPES = new Map([
  ['.mp4', 'video/mp4'], ['.mov', 'video/quicktime'], ['.mkv', 'video/x-matroska'], ['.webm', 'video/webm'],
])
const MAX_VIDEO_BYTES = 12 * 1024 * 1024 * 1024
const MAX_DURATION_SECONDS = 12 * 60 * 60
const SHORT_VIDEO_FRAMES = 24
const LONG_VIDEO_FRAMES = 48
const AUDIO_CHUNK_SECONDS = 15 * 60
const MAX_TRANSCRIPT_CHARS = 120_000

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

async function sttChunk(path, token, language, signal) {
  const bytes = await readFile(path)
  if (bytes.byteLength > 25 * 1024 * 1024) throw new Error('an extracted audio chunk exceeds 25 MiB')
  const form = new FormData()
  form.set('format', 'true')
  form.set('language', language)
  form.set('file', new Blob([bytes], { type: 'audio/mpeg' }), basename(path))
  const response = await fetch('https://api.x.ai/v1/stt', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: form, signal })
  const body = await response.json().catch(() => undefined)
  if (!response.ok) throw new Error(`xAI STT failed with HTTP ${response.status}`)
  return typeof body?.text === 'string' ? body.text.trim() : ''
}

function responseText(body) {
  if (typeof body?.output_text === 'string') return body.output_text
  return (body?.output ?? []).flatMap((item) => item?.content ?? []).filter((item) => item?.type === 'output_text').map((item) => item.text).join('\n')
}

export async function analyzeVideo({ inputPath, prompt, language, token, signal, onPrepared }) {
  const metadata = await inspectVideo(inputPath, signal)
  await onPrepared(metadata)
  const temp = await mkdtemp(join(tmpdir(), 'dsh-grok-video-'))
  try {
    const frameBudget = metadata.duration > 30 * 60 ? LONG_VIDEO_FRAMES : SHORT_VIDEO_FRAMES
    const interval = Math.max(1, metadata.duration / Math.max(1, frameBudget - 1))
    await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', inputPath, '-vf', `fps=1/${interval},scale='min(960,iw)':-2`, '-frames:v', String(frameBudget), '-q:v', '5', join(temp, 'frame-%03d.jpg')], { signal })
    let transcript = ''
    if (metadata.has_audio) {
      await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', inputPath, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '48k', '-f', 'segment', '-segment_time', String(AUDIO_CHUNK_SECONDS), '-reset_timestamps', '1', join(temp, 'audio-%03d.mp3')], { signal })
      const chunks = (await readdir(temp)).filter((name) => name.startsWith('audio-')).sort()
      const rows = []
      for (let index = 0; index < chunks.length; index++) {
        const text = await sttChunk(join(temp, chunks[index]), token, language, signal)
        if (text) rows.push(`[${Math.floor(index * AUDIO_CHUNK_SECONDS / 60)}:00] ${text.slice(0, 16_000)}`)
      }
      transcript = rows.join('\n').slice(0, MAX_TRANSCRIPT_CHARS)
    }
    const frames = (await readdir(temp)).filter((name) => name.startsWith('frame-')).sort()
    const content = [{
      type: 'input_text',
      text: `你在分析一个按时间顺序抽帧的长视频。视频时长 ${metadata.duration.toFixed(1)} 秒，共 ${frames.length} 帧，帧间隔约 ${interval.toFixed(1)} 秒。\n音频分段转写：\n${transcript || '（无音轨或没有识别到语音）'}\n\n用户要求：${prompt || '给出中文概要、关键事件和带时间点的时间线。明确区分画面观察、转写内容和推断。'}\n请返回清晰的中文 Markdown。`,
    }]
    for (const frame of frames) {
      const bytes = await readFile(join(temp, frame))
      content.push({ type: 'input_image', image_url: `data:image/jpeg;base64,${bytes.toString('base64')}`, detail: 'low' })
    }
    const response = await fetch('https://api.x.ai/v1/responses', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'grok-4.6', input: [{ role: 'user', content }], stream: false, max_output_tokens: 2000 }),
      signal,
    })
    const body = await response.json().catch(() => undefined)
    const analysis = responseText(body)
    if (!response.ok || !analysis) throw new Error(`xAI video synthesis failed with HTTP ${response.status}`)
    return { analysis, transcript, metadata, sampled_frames: frames.length, frame_interval_seconds: interval }
  } finally {
    await rm(temp, { recursive: true, force: true }).catch(() => undefined)
  }
}
