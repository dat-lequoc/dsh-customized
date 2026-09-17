/**
 * dsh-customized
 *
 * Opinionated personal customizations for DeepSeek Harness.
 * Feature 1: disable-auth (disables web token launch authentication and RPC cookie requirement).
 */

import { applyDisableAuth } from './disable-auth.js'

export const name = 'dsh-customized'
export const inject = ['connection']

export function apply(ctx, config) {
  applyDisableAuth(ctx, config)
}

export default {
  name,
  inject,
  apply,
}
