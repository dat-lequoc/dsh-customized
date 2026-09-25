import assert from 'node:assert/strict'
import test from 'node:test'
import { apply } from '../src/index.js'

export function fixture(initial = {}) {
  let value = { rules: [], patterns: [], disabledBuiltins: [], ...initial }
  let handler, stream
  const ctx = {
    settings: { register: () => ({ get: () => value, update: async patch => { value = { ...value, ...patch } } }) },
    connection: { rpc: { handle: (_channel, fn) => { handler = fn; return () => {} } } },
    effect: fn => fn(), on: (_event, fn) => { stream = fn },
  }
  apply(ctx)
  return {
    ctx, settings: () => value,
    raw: (endpoint, args) => handler(endpoint, args),
    async call(endpoint, args) {
      const result = await handler(endpoint, args)
      if (!result.ok) throw new Error(result.error.message)
      return result.value
    },
    async failure(message, provider = 'provider-a', code = 'PI_AI_ERROR') {
      const original = { type: 'finish', reason: { kind: 'error', failure: { code, message, extra: 'preserved' } } }
      const result = []
      for await (const item of stream({ provider }, () => (async function* () { yield original })())) result.push(item)
      return result[0].reason.failure
    },
  }
}

test('real Host apply keeps saved patterns independent, applies scoped edits and persists reload', async () => {
  const host = fixture({ rules: ['upstream_error: Upstream request failed', 'server went away'] })
  assert.equal((await host.failure('upstream_error: Upstream request failed')).code, 'RATE_LIMIT')
  assert.equal((await host.failure('server went away')).code, 'RATE_LIMIT')
  const message = 'temporary connection pool exhausted (request id: sample-1)'
  const result = await host.call('add', { message, code: 'PI_AI_ERROR', provider: 'provider-a', mode: 'exact' })
  assert.ok(result.matched)
  assert.equal(host.settings().rules.length, 0)
  assert.equal(host.settings().patterns.length, 3)
  assert.equal((await host.failure(message.replace('sample-1', 'sample-2'))).code, 'RATE_LIMIT')
  assert.equal((await host.failure(message, 'provider-b')).code, 'PI_AI_ERROR')
  assert.equal((await host.failure('server went away')).code, 'RATE_LIMIT')
  const id = result.matched.id
  await host.call('toggle', { id, enabled: false })
  assert.equal((await host.failure(message)).code, 'PI_AI_ERROR')
  await host.call('toggle', { id, enabled: true })
  const reloaded = fixture(host.settings())
  assert.equal((await reloaded.failure(message)).code, 'RATE_LIMIT')
  await reloaded.call('delete', { id })
  assert.equal((await reloaded.failure(message)).code, 'PI_AI_ERROR')
})

test('built-ins remain controllable and original diagnostics survive the real waterfall', async () => {
  const host = fixture()
  const message = 'server_error: Our servers are currently overloaded. Please try again later.'
  assert.deepEqual(await host.failure(message), { code: 'RATE_LIMIT', message, extra: 'preserved' })
  await host.call('toggle', { id: 'builtin-overloaded', enabled: false })
  assert.equal((await host.failure(message)).code, 'PI_AI_ERROR')
  assert.equal((await host.failure(message, 'provider-a', 'AUTH')).code, 'AUTH')
  await assert.rejects(host.call('add', { message: 'authentication failed', code: 'PI_AI_ERROR' }), /non-transient/)
})

test('preview never accepts a rule that cannot match and suggestions stay within the provider', async () => {
  const host = fixture()
  await host.failure('east gateway is currently overloaded please retry later')
  const sample = { message: 'west gateway is currently overloaded please retry later', code: 'PI_AI_ERROR', provider: 'provider-a' }
  const proposal = await host.call('preview', sample)
  assert.equal(proposal.suggestion, 'gateway is currently overloaded please retry later')
  assert.equal(proposal.mode, 'exact')
  assert.equal((await host.call('preview', { ...sample, provider: 'provider-b' })).suggestion, null)
  await assert.rejects(host.call('add', { ...sample, pattern: 'gateway currently overloaded please retry later', mode: 'contains' }), /Pattern must match/)
  await host.call('add', { ...sample, pattern: proposal.suggestion, mode: 'contains' })
  assert.equal((await host.failure('north gateway is currently overloaded please retry later')).code, 'RATE_LIMIT')
  assert.equal((await host.call('preview', { ...sample, code: 'RATE_LIMIT' })).reason, 'already-native')
})

test('concurrent saves keep both additions', async () => {
  const host = fixture()
  await Promise.all(['first upstream failure', 'second unrelated failure'].map(message => host.call('add', { message, code: 'PI_AI_ERROR' })))
  assert.equal(host.settings().patterns.length, 2)
})
