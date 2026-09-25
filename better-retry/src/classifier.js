export const DEFAULT_RULES = [
  'too many pending requests, please retry later',
  'our servers are currently overloaded. please try again later',
]
export const BUILTINS = DEFAULT_RULES.map((pattern, index) => ({
  id: index === 0 ? 'builtin-pending' : 'builtin-overloaded', pattern,
  mode: 'contains', provider: '*', code: 'PI_AI_ERROR', enabled: true,
  sample: pattern, builtin: true,
}))

/** Keep diagnostic words in order; remove only known request-specific fields. */
export function normalizeMessage(message) {
  return String(message ?? '').trim().replace(/^(?:unknown|server_error):\s*/i, '')
    .replace(/\b(?:trace|correlation|request)[-_ ]?id\s*[:=]\s*[^\s,)]+/gi, '')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '')
    .replace(/\(\s*\)/g, '').replace(/\s+/g, ' ').replace(/[.。]+$/, '').trim().toLowerCase()
}

/** Longest contiguous word sequence, never an unordered bag of common words. */
export function commonStableFragment(messages) {
  const values = messages.map(normalizeMessage).filter(Boolean)
  if (!values.length) return ''
  const words = values[0].split(' ').slice(0, 128)
  for (let length = words.length; length > 0; length--) {
    for (let start = 0; start + length <= words.length; start++) {
      const candidate = words.slice(start, start + length).join(' ')
      if (values.every(value => value.includes(candidate))) return candidate
    }
  }
  return ''
}

export function usefulFragment(pattern) {
  const value = normalizeMessage(pattern)
  return value.length >= 24 && value.split(' ').length >= 3
    && !/^(?:please )?(?:try again|retry)(?: later)?$/.test(value)
}

/** Legacy strings become independent exact normalized patterns, even if short. */
export function customPatterns(settings) {
  const patterns = (settings.patterns ?? []).map(rule => ({ ...rule, builtin: false }))
  for (const [index, message] of (settings.rules ?? []).entries()) {
    const pattern = normalizeMessage(message)
    if (pattern && !patterns.some(rule => rule.pattern === pattern && rule.provider === '*')) {
      patterns.push({ id: `legacy-${index}`, pattern, mode: 'exact', provider: '*',
        code: 'PI_AI_ERROR', enabled: true, sample: pattern, builtin: false })
    }
  }
  return patterns
}

export function effectivePatterns(settings) {
  return [
    ...BUILTINS.map(rule => ({ ...rule, enabled: !(settings.disabledBuiltins ?? []).includes(rule.id) })),
    ...customPatterns(settings),
  ]
}

// Message checks apply only to unknown provider errors. Known codes retain DSH's policy.
export function ineligibleReason(message, code) {
  if (code !== 'PI_AI_ERROR') return code === 'RATE_LIMIT' ? 'already-native' : 'unsupported-code'
  if (/\b(?:unauthorized|forbidden|invalid api key|authentication failed|insufficient (?:quota|balance|credits)|quota exceeded|invalid request|cancelled|canceled)\b/i.test(message)) return 'non-transient'
  return null
}

export function matchesPattern(message, code, provider, rule) {
  if (!rule.enabled || rule.code !== code || (rule.provider !== '*' && rule.provider !== provider)) return false
  const value = normalizeMessage(message)
  const pattern = normalizeMessage(rule.pattern)
  if (!pattern || ineligibleReason(message, code)) return false
  return rule.mode === 'exact' ? value === pattern : usefulFragment(pattern) && value.includes(pattern)
}

export function matchingPattern(settings, message, code, provider = '') {
  return effectivePatterns(settings).find(rule => matchesPattern(message, code, provider, rule)) ?? null
}

/** Compatibility for the package's small pure classifier consumers. */
export function matchesRule(message, rule) {
  return usefulFragment(rule) && normalizeMessage(message).includes(normalizeMessage(rule))
}
export function createClassifier(initialRules = DEFAULT_RULES) {
  const rules = [...new Set(initialRules.map(normalizeMessage).filter(usefulFragment))]
  return {
    rules: () => [...rules],
    classify: message => rules.some(rule => matchesRule(message, rule)),
    add(messages) {
      const rule = commonStableFragment(messages)
      if (usefulFragment(rule) && !rules.includes(rule)) rules.push(rule)
      return rule
    },
  }
}
