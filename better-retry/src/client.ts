import React from 'react'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'

export const inject = ['slots', 'locale', 'remote']
const NS = 'dsh-better-retry'
const zh = {
  add: '纳入自动重试', added: '已纳入自动重试', saving: '正在保存…', error: '保存失败',
}
const en = {
  add: 'Enable automatic retry', added: 'Automatic retry enabled', saving: 'Saving…', error: 'Save failed',
}

/** Small action added to the terminal turn-error row. */
function BetterTurnError({ node, t, remote, locale }) {
  const [state, setState] = React.useState('idle')
  const copy = (locale().startsWith('zh') ? zh : en)
  const add = async () => {
    setState('saving')
    try {
      const result = await remote.settings.describe()
      const view = result.find(item => item.ns === 'dsh-better-retry')
      const current = Array.isArray(view?.value?.rules) ? view.value.rules : []
      if (!current.some(rule => rule === node.message)) {
        await remote.settings.update('dsh-better-retry', { rules: [...current, node.message] }, view?.revision)
      }
      setState('added')
    } catch (_error) { setState('error') }
  }
  return React.createElement('div', { className: 'dsh-better-retry-row', role: 'status' },
    React.createElement('span', { className: 'dsh-better-retry-title' }, t('turnError')),
    React.createElement('span', { className: 'dsh-better-retry-message' }, node.message),
    node.code ? React.createElement('code', null, node.code) : null,
    React.createElement('button', {
      type: 'button', disabled: state === 'saving' || state === 'added', onClick: add, title: copy.add,
      className: 'dsh-better-retry-button',
    }, state === 'saving' ? copy.saving : state === 'added' ? copy.added : state === 'error' ? copy.error : copy.add),
  )
}

export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-better-retry: locale')
  ctx.effect(() => ctx.styles?.insert?.(`
    .dsh-better-retry-row { display:flex; gap:8px; align-items:center; padding:2px 0; font-size:var(--dsh-content-font-size-secondary,13px); line-height:20px; }
    .dsh-better-retry-title { color:var(--dsw-alias-state-error-primary); font-weight:600; }
    .dsh-better-retry-message { color:var(--dsw-alias-label-secondary); overflow-wrap:anywhere; }
    .dsh-better-retry-button { margin-left:auto; flex:none; cursor:pointer; }
  `), 'dsh-better-retry: styles')
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
    name: 'conversation.chat.node', key: 'turn-error', priority: -1, locale: NS,
    inject: () => ({ remote: ctx.remote, locale: () => ctx.locale.getLocale().id }),
  }, props => React.createElement(BetterTurnError, { ...props, remote: props.remote, locale: props.locale })))
}
