import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import * as bundle from '../index.js'
import { createMediaHandler, localMediaUrl } from '../packages/native-media-tools/media-proxy.js'

test('v0.3 delegates image UI to DSH rc.8 and keeps only the tool-view client edge', async () => {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(manifest.version, '0.3.0')
  assert.equal(manifest.dependencies['@deepseek-ai/dsh-subagent-acp'], '^0.1.0-rc.8')
  assert.deepEqual(manifest.dsh.client.inject, ['@deepseek-ai/dsh-client-ui-tool'])
  assert.equal(manifest.peerDependencies['@deepseek-ai/dsh-client-ui-attachment'], undefined)
  assert.deepEqual(manifest.files.filter((entry) => entry.startsWith('packages/')), ['packages/native-media-tools/*.js'])
  assert.equal(bundle.name, 'subscription-media-suite')
  assert.equal(typeof bundle.apply, 'function')
  assert.ok(Array.isArray(bundle.inject))
})

test('the retained audio/video route serves authenticated byte ranges', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-grok-media-route-'))
  const path = join(root, 'sample.mp4')
  await writeFile(path, Buffer.from('0123456789'))
  const key = Buffer.alloc(32, 7)
  const handler = createMediaHandler(key)
  const server = createServer((request, response) => { void handler(request, response) })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve))
    await rm(root, { recursive: true, force: true })
  })

  const address = server.address()
  assert(address && typeof address === 'object')
  const url = `http://127.0.0.1:${address.port}${localMediaUrl(key, path)}`

  const ranged = await fetch(url, { headers: { range: 'bytes=2-5' } })
  assert.equal(ranged.status, 206)
  assert.equal(ranged.headers.get('content-range'), 'bytes 2-5/10')
  assert.equal(await ranged.text(), '2345')

  const head = await fetch(url, { method: 'HEAD' })
  assert.equal(head.status, 200)
  assert.equal(head.headers.get('content-length'), '10')
  assert.equal(await head.text(), '')

  const tampered = new URL(url)
  tampered.searchParams.set('t', 'invalid')
  assert.equal((await fetch(tampered)).status, 404)
})
