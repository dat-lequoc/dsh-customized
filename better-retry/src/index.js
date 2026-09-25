import z from '@deepseek-ai/schemastery'
import { CHANNEL, createRuntime } from './runtime.js'

export const name = 'dsh-better-retry'
export const inject = ['llm', 'settings', 'connection']

const patternSchema = z.object({
  id: z.string(), pattern: z.string(), mode: z.union([z.const('exact'), z.const('contains')]),
  code: z.string(), provider: z.string(), enabled: z.boolean(), sample: z.string(),
})
const settingsSchema = z.object({
  // The old field remains readable until the first successful management edit migrates it.
  rules: z.array(z.string()).default([]),
  patterns: z.array(patternSchema).default([]),
  disabledBuiltins: z.array(z.string()).default([]),
})

export function apply(ctx) {
  const scope = ctx.settings.register('dsh-better-retry', settingsSchema, {
    base: { rules: [], patterns: [], disabledBuiltins: [] },
  })
  const runtime = createRuntime(scope)
  ctx.effect(() => ctx.connection.rpc.handle(CHANNEL, (endpoint, input) => runtime.handle(endpoint, input)))
  ctx.on('llm/stream', (options, next) => rewriteStream(next(), runtime, options.provider ?? ''))
}

/** Classification keeps the original message and metadata; DSH owns the retry loop. */
async function* rewriteStream(source, runtime, provider) {
  for await (const chunk of source) {
    if (chunk?.type === 'finish' && chunk.reason?.kind === 'error') {
      const failure = chunk.reason.failure
      if (failure) {
        runtime.observe(failure, provider)
        if (runtime.match(failure, provider)) {
          yield { ...chunk, reason: { ...chunk.reason, failure: { ...failure, code: 'RATE_LIMIT' } } }
          continue
        }
      }
    }
    yield chunk
  }
}
