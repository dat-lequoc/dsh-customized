import { BetterTurnError, RuleManager } from './components.js'
import { NS, dictionaries } from './locale.js'

export const inject = ['slots', 'locale', 'connection']

export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, dictionaries), 'dsh-better-retry: locale')
  // Both screens call the active Host, so previews and actual classification cannot diverge.
  const call = async (endpoint, payload = {}) => {
    const result = await ctx.connection.rpc.call('/dsh-better-retry', endpoint, payload)
    if (!result.ok) throw new Error(result.error.message)
    return result.value
  }
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
    name: 'conversation.chat.node', key: 'turn-error', priority: -1, locale: NS,
    inject: () => ({ call }),
  }, BetterTurnError))
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: NS, order: 35, locale: NS,
    label: () => ctx.locale.bind(NS)('section'), inject: () => ({ call }),
  }, RuleManager))
}
