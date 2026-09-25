import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { act, create } from 'react-test-renderer'
import { apply as applyClient } from '../src/client.js'
import { apply as applyHost } from '../src/index.js'
import { RuleList } from '../src/components.js'
import { renderToStaticMarkup } from 'react-dom/server'
import { dictionaries } from '../src/locale.js'

const t = key => dictionaries.zh[key]
const h = React.createElement

test('click preview, confirm, manage and disable through real Host endpoints', async () => {
  const registrations = []
  let value = { rules: [], patterns: [], disabledBuiltins: [] }
  let rpc, stream
  applyHost({
    settings: { register: () => ({ get: () => value, update: async patch => { value = { ...value, ...patch } } }) },
    connection: { rpc: { handle: (_channel, fn) => { rpc = fn; return () => {} } } },
    effect: fn => fn(), on: (_event, fn) => { stream = fn },
  })
  applyClient({
    effect: fn => fn(), locale: { register: () => () => {}, bind: () => t },
    connection: { rpc: { call: (_channel, endpoint, payload) => rpc(endpoint, payload) } },
    slots: { inject: (_key, fn) => fn(), register: (options, component) => { registrations.push({ options, component }); return () => {} } },
  })
  const chat = registrations.find(item => item.options.key === 'turn-error')
  const settings = registrations.find(item => item.options.name === 'settings.section')
  assert.equal(settings.options.label(), '自动重试')
  const message = 'upstream_error: Upstream request failed'
  let view
  await act(async () => { view = create(h(chat.component, { node: { data: { message, code: 'PI_AI_ERROR' } }, t, ...chat.options.inject() })) })
  const click = async label => {
    const button = view.root.findAllByType('button').find(item => item.children.join('') === label)
    assert.ok(button, `Missing visible action: ${label}`)
    assert.equal(button.props.disabled, false)
    await act(async () => { await button.props.onClick() })
  }
  await click('纳入自动重试')
  await click('预览匹配')
  assert.ok(JSON.stringify(view.toJSON()).includes('该模式能匹配当前错误'))
  await click('确认纳入自动重试')
  assert.equal(value.patterns.length, 1)
  const failure = async () => {
    const source = async function* () { yield { type: 'finish', reason: { kind: 'error', failure: { message, code: 'PI_AI_ERROR' } } } }
    for await (const chunk of stream({ provider: 'p' }, source)) return chunk.reason.failure.code
  }
  assert.equal(await failure(), 'RATE_LIMIT')
  await click('管理消息模式')
  const article = view.root.findAllByType('article').find(item => item.findAllByType('code').some(code => code.children.join('').includes('upstream_error')))
  assert.ok(article)
  await act(async () => { await article.findAllByType('button').find(item => item.children.join('') === '停用').props.onClick() })
  assert.equal(await failure(), 'PI_AI_ERROR')
  await act(async () => { await article.findAllByType('button').find(item => item.children.join('') === '删除').props.onClick() })
  assert.equal(value.patterns.length, 0)
  await act(async () => view.unmount())
  // The settings navigation renders the same complete manager without requiring an error row.
  await act(async () => { view = create(h(settings.component, { t, ...settings.options.inject() })) })
  assert.ok(JSON.stringify(view.toJSON()).includes('添加消息模式'))
  assert.ok(JSON.stringify(view.toJSON()).includes('测试消息是否命中'))
  await act(async () => view.unmount())
})

test('management keeps disabled patterns visible with enable and delete actions', () => {
  const html = renderToStaticMarkup(h(RuleList, { t, busy: false, mutate: () => {}, rules: [{
    id: 'r', builtin: false, enabled: false, pattern: 'upstream request failed', mode: 'exact', code: 'PI_AI_ERROR', provider: '*',
  }] }))
  assert.ok(html.includes('已停用'))
  assert.ok(html.includes('启用'))
  assert.ok(html.includes('删除'))
})
