import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { analyzeVideo } from '../packages/native-media-tools/video-analysis.js'

async function fixtureVideo() {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-video-test-'))
  const path = join(dir, 'original-sound.mp4')
  const result = spawnSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', 'color=c=red:s=160x90:d=2',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2',
    '-shortest', '-c:v', 'mpeg4', '-q:v', '5', '-c:a', 'aac', path,
  ])
  assert.equal(result.status, 0, result.stderr?.toString())
  return { dir, path }
}

function listen(handler) {
  const server = createServer(handler)
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      resolve({ server, apiBase: `http://127.0.0.1:${port}/v1` })
    })
  })
}

async function bodyBytes(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return Buffer.concat(chunks)
}

test('original mode uploads the whole video, references its file id, and deletes it', async () => {
  const fixture = await fixtureVideo()
  const seen = { upload: false, response: false, deleted: false }
  const { server, apiBase } = await listen(async (req, res) => {
    if (req.method === 'POST' && req.url === '/v1/files') {
      const raw = (await bodyBytes(req)).toString('latin1')
      assert.ok(raw.indexOf('name="expires_after"') < raw.indexOf('name="file"'))
      assert.match(raw, /filename="original-sound\.mp4"/)
      seen.upload = true
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ id: 'file-video-test' }))
      return
    }
    if (req.method === 'POST' && req.url === '/v1/responses') {
      const payload = JSON.parse((await bodyBytes(req)).toString())
      const content = payload.input[0].content
      assert.ok(content.some((item) => item.type === 'input_file' && item.file_id === 'file-video-test'))
      assert.ok(content.some((item) => item.type === 'input_text' && item.text.includes('原声音轨')))
      seen.response = true
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ output_text: '原始视频分析成功' }))
      return
    }
    if (req.method === 'DELETE' && req.url === '/v1/files/file-video-test') {
      seen.deleted = true
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end('{}')
      return
    }
    res.writeHead(404); res.end()
  })
  try {
    let plan
    const result = await analyzeVideo({
      inputPath: fixture.path, prompt: '听清原声', language: 'auto', token: 'test-token',
      strategy: 'original', apiBase, onPrepared: async (_metadata, value) => { plan = value },
    })
    assert.deepEqual(plan, { strategy: 'original', fallback: false })
    assert.equal(result.strategy, 'original-file')
    assert.equal(result.audio_mode, 'original-soundtrack')
    assert.equal(result.sampled_frames, 0)
    assert.deepEqual(seen, { upload: true, response: true, deleted: true })
  } finally {
    server.close()
    await rm(fixture.dir, { recursive: true, force: true })
  }
})

test('auto mode falls back to frames plus diarized original-container STT', async () => {
  const fixture = await fixtureVideo()
  const seen = { upload: 0, stt: 0, response: 0 }
  const { server, apiBase } = await listen(async (req, res) => {
    if (req.method === 'POST' && req.url === '/v1/files') {
      await bodyBytes(req)
      seen.upload++
      res.writeHead(415, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'unsupported media' }))
      return
    }
    if (req.method === 'POST' && req.url === '/v1/stt') {
      const raw = (await bodyBytes(req)).toString('latin1')
      assert.ok(raw.indexOf('name="diarize"') < raw.indexOf('name="file"'))
      assert.match(raw, /filename="original-sound\.mp4"/)
      seen.stt++
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({
        text: '你好 世界', duration: 2,
        words: [
          { text: '你好', start: 0.1, end: 0.5, speaker: 0 },
          { text: '世界', start: 1.1, end: 1.5, speaker: 1 },
        ],
      }))
      return
    }
    if (req.method === 'POST' && req.url === '/v1/responses') {
      const payload = JSON.parse((await bodyBytes(req)).toString())
      assert.ok(payload.input[0].content.some((item) => item.type === 'input_image'))
      seen.response++
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ output_text: '采样回退分析成功' }))
      return
    }
    res.writeHead(404); res.end()
  })
  try {
    const result = await analyzeVideo({
      inputPath: fixture.path, prompt: '', language: 'auto', token: 'test-token',
      strategy: 'auto', apiBase, onPrepared: async () => undefined,
    })
    assert.equal(result.strategy, 'sampled-timeline')
    assert.equal(result.audio_mode, 'original-container-stt')
    assert.match(result.fallback_reason, /HTTP 415/)
    assert.match(result.transcript, /\[0:00\] 说话人1: 你好/)
    assert.match(result.transcript, /说话人2: 世界/)
    assert.ok(result.sampled_frames > 0)
    assert.deepEqual(seen, { upload: 1, stt: 1, response: 1 })
  } finally {
    server.close()
    await rm(fixture.dir, { recursive: true, force: true })
  }
})
