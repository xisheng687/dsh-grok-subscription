// Re-export the official Harness ACP subagent plugin through this neutral bridge so
// the profile loader resolves the dependency from the bundle's own graph.
export {
  Config,
  apply,
  inject,
  name,
} from '@deepseek-ai/dsh-subagent-acp'
