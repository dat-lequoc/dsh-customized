import { randomUUID } from 'node:crypto'
import { BUILTINS, commonStableFragment, customPatterns, effectivePatterns, ineligibleReason, matchingPattern, matchesPattern, normalizeMessage, usefulFragment } from './classifier.js'

export const CHANNEL = '/dsh-better-retry'

function text(value, label, max = 4096) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${label}: expected 1–${max} characters`)
  return value.trim()
}
function inputSample(input) {
  return {
    message: text(input.message, 'message'), code: text(input.code, 'code', 100),
    provider: typeof input.provider === 'string' && input.provider.trim() ? text(input.provider, 'provider', 200) : '*',
  }
}

/** One runtime owns the saved rules, bounded observed samples and serialized writes. */
export function createRuntime(scope) {
  const recent = []
  let pending = Promise.resolve()
  const settings = () => scope.get()
  const list = () => ({ rules: effectivePatterns(settings()), recent: [...recent] })
  const observe = (failure, provider) => {
    if (typeof failure?.message !== 'string' || failure.message.length > 4096) return
    const message = normalizeMessage(failure.message)
    const code = String(failure.code ?? '')
    if (recent.some(item => item.message === message && item.provider === provider && item.code === code)) return
    recent.unshift({ message, code, provider })
    recent.splice(100)
  }
  const preview = input => {
    const sample = inputSample(input)
    const normalized = normalizeMessage(sample.message)
    const reason = ineligibleReason(sample.message, sample.code)
    const existing = matchingPattern(settings(), sample.message, sample.code, sample.provider)
    const patterns = effectivePatterns(settings())
    const pool = [...recent, ...patterns.map(rule => ({ message: rule.sample, code: rule.code, provider: rule.provider }))]
      .filter(item => item.code === sample.code && item.provider === sample.provider)
    const candidates = [...new Set(pool.map(item => commonStableFragment([normalized, item.message])))]
      .filter(value => usefulFragment(value) && value !== normalized && value.length >= normalized.length * 0.6)
      .sort((a, b) => b.length - a.length)
    // Suggestions do not silently change a saved rule; exact normalized match is the default.
    const pattern = input.pattern === undefined ? normalized : normalizeMessage(text(input.pattern, 'pattern'))
    const mode = input.mode ?? 'exact'
    if (!['exact', 'contains'].includes(mode)) throw new Error('Unknown matching mode')
    const rule = { id: '', pattern, mode, code: sample.code, provider: sample.provider, enabled: true, sample: normalized }
    const valid = !reason && !!pattern && (mode === 'exact' || usefulFragment(pattern))
      && matchesPattern(sample.message, sample.code, sample.provider, rule)
    return { ...sample, normalized, pattern, mode, reason, valid, existing,
      suggestion: candidates[0] ?? null,
      matches: pool.filter(item => matchesPattern(item.message, item.code, item.provider, rule)).slice(0, 10) }
  }
  const save = async (patterns, disabledBuiltins) => {
    // First successful edit migrates every old string separately; old data is never collapsed.
    await scope.update({ rules: [], patterns: patterns.map(({ builtin, ...rule }) => rule), disabledBuiltins })
    return list()
  }
  const mutate = async (endpoint, input) => {
    const current = settings()
    let patterns = customPatterns(current)
    let disabled = [...(current.disabledBuiltins ?? [])]
    if (endpoint === 'add') {
      const proposal = preview(input)
      if (!proposal.valid) throw new Error(proposal.reason ?? 'Pattern must match the selected message; use a specific contiguous phrase')
      let rule = patterns.find(rule => rule.pattern === proposal.pattern && rule.mode === proposal.mode
        && rule.provider === proposal.provider && rule.code === proposal.code)
      if (rule) rule.enabled = true
      else {
        rule = { id: randomUUID(), pattern: proposal.pattern, mode: proposal.mode,
          code: proposal.code, provider: proposal.provider, sample: proposal.normalized, enabled: true }
        patterns.push(rule)
      }
      await save(patterns, disabled)
      const match = matchingPattern(settings(), proposal.message, proposal.code, proposal.provider)
      if (!match) throw new Error('Saved rule is not effective; check the settings provider')
      return { ...list(), matched: match }
    }
    const id = text(input.id, 'id', 200)
    if (endpoint === 'toggle' && typeof input.enabled !== 'boolean') throw new Error('enabled must be boolean')
    if (BUILTINS.some(rule => rule.id === id)) {
      // Built-ins remain visible and can be disabled; only custom rules can be deleted.
      if (endpoint === 'delete') throw new Error('Built-in rules can be disabled, not deleted')
      disabled = disabled.filter(value => value !== id)
      if (!input.enabled) disabled.push(id)
    } else {
      const rule = patterns.find(rule => rule.id === id)
      if (!rule) throw new Error('Rule no longer exists; refresh the list')
      if (endpoint === 'delete') patterns = patterns.filter(rule => rule.id !== id)
      else rule.enabled = input.enabled
    }
    return save(patterns, disabled)
  }
  return {
    observe,
    match: (failure, provider) => matchingPattern(settings(), failure.message, failure.code, provider),
    async handle(endpoint, input = {}) {
      try {
        if (endpoint === 'list') return { ok: true, value: list() }
        if (endpoint === 'preview' || endpoint === 'test') return { ok: true, value: preview(input) }
        if (!['add', 'toggle', 'delete'].includes(endpoint)) throw new Error('Unknown retry endpoint')
        const work = pending.then(() => mutate(endpoint, input))
        // A failed write must not block subsequent edits, but its caller still sees failure.
        pending = work.catch(() => undefined)
        return { ok: true, value: await work }
      } catch (error) {
        return { ok: false, error: { code: 'better-retry/invalid', message: error instanceof Error ? error.message : String(error), details: {} } }
      }
    },
  }
}
