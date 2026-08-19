import * as acp from '@deepseek-ai/dsh-subagent-acp'
import * as media from './packages/native-media-tools/index.js'

export const name = 'subscription-media-suite'

// A DSH bundle patch is resolved from the user's profile, not from nested npm
// dependencies. Keeping each lane behind this one public package makes the
// release tarball genuinely one-command installable.
export const inject = [...new Set([...(acp.inject ?? []), ...(media.inject ?? [])])]

export function apply(ctx, config = {}) {
  const { mode = 'media', ...laneConfig } = config
  if (mode === 'media') return media.apply(ctx, laneConfig)
  if (mode === 'acp') return acp.apply(ctx, laneConfig)
  throw new Error(`unsupported subscription media suite mode: ${mode}`)
}
