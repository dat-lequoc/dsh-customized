import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import plugin, { name, inject, apply } from '../lib/index.js'
import disableAuthPlugin, {
  name as disableAuthName,
  inject as disableAuthInject,
  applyDisableAuth,
  cleanUrl,
} from '../lib/disable-auth.js'

describe('dsh-customized metadata and exports', () => {
  it('exports correct metadata for root plugin', () => {
    assert.equal(name, 'dsh-customized')
    assert.deepEqual(inject, ['connection'])
    assert.equal(typeof apply, 'function')
    assert.equal(plugin.name, 'dsh-customized')
    assert.deepEqual(plugin.inject, ['connection'])
    assert.equal(typeof plugin.apply, 'function')
  })

  it('exports correct metadata for disable-auth module', () => {
    assert.equal(disableAuthName, 'dsh-customized/disable-auth')
    assert.deepEqual(disableAuthInject, ['connection'])
    assert.equal(typeof applyDisableAuth, 'function')
    assert.equal(disableAuthPlugin.name, 'dsh-customized/disable-auth')
    assert.deepEqual(disableAuthPlugin.inject, ['connection'])
  })
})

describe('cleanUrl helper', () => {
  it('strips ?token= query parameter', () => {
    const input = 'http://127.0.0.1:3080/?token=abc123secret'
    assert.equal(cleanUrl(input), 'http://127.0.0.1:3080/')
  })

  it('strips multiple query parameters and fragments', () => {
    const input = 'http://127.0.0.1:3080/?token=abc123secret&other=val#section'
    assert.equal(cleanUrl(input), 'http://127.0.0.1:3080/')
  })

  it('handles origin without trailing slash', () => {
    const input = 'http://127.0.0.1:3080'
    assert.equal(cleanUrl(input), 'http://127.0.0.1:3080/')
  })

  it('handles LAN URLs and custom ports', () => {
    const input = 'http://192.168.1.50:8080/?token=xyz'
    assert.equal(cleanUrl(input), 'http://192.168.1.50:8080/')
  })

  it('handles localhost URLs', () => {
    const input = 'http://localhost:3080/?token=123'
    assert.equal(cleanUrl(input), 'http://localhost:3080/')
  })

  it('falls back to input gracefully if string is not a valid URL', () => {
    const invalid = 'not-a-valid-url'
    assert.equal(cleanUrl(invalid), invalid)
  })
})

describe('disable-auth interception behavior', () => {
  function createMockContext(initialOverrides = {}) {
    const disposeCallbacks = []
    const connection = {
      authenticatedUrl(baseUrl) {
        return `${baseUrl}/?token=mock_token_123`
      },
      authorizeIndex(req, res) {
        return false
      },
      requestRejection(req) {
        if (req?.headers?.host === 'untrusted.com') return 403
        if (!req?.headers?.cookie) return 401
        return undefined
      },
      ...initialOverrides,
    }

    const ctx = {
      connection,
      on(event, cb) {
        if (event === 'dispose') {
          disposeCallbacks.push(cb)
        }
      },
      dispose() {
        for (const cb of disposeCallbacks) {
          cb()
        }
      },
    }

    return { ctx, connection }
  }

  it('overrides authenticatedUrl to return clean URL without token', () => {
    const { ctx, connection } = createMockContext()
    apply(ctx)

    const result = connection.authenticatedUrl('http://127.0.0.1:3080')
    assert.equal(result, 'http://127.0.0.1:3080/')
    assert.equal(result.includes('token='), false)
  })

  it('overrides authorizeIndex to always return true', () => {
    const { ctx, connection } = createMockContext()
    apply(ctx)

    // Should return true with no token/cookie
    assert.equal(connection.authorizeIndex({ url: '/', method: 'GET', headers: {} }, {}), true)
    // Should return true even with invalid token
    assert.equal(connection.authorizeIndex({ url: '/?token=invalid', method: 'GET', headers: {} }, {}), true)
  })

  it('overrides requestRejection to bypass 401 rejections', () => {
    const { ctx, connection } = createMockContext()
    apply(ctx)

    // Unauthenticated request (no cookie) would normally return 401 -> now undefined
    const unauthReq = { headers: { host: '127.0.0.1:3080' } }
    assert.equal(connection.requestRejection(unauthReq), undefined)

    // Authenticated request continues to return undefined
    const authReq = { headers: { host: '127.0.0.1:3080', cookie: 'dsh-auth=valid' } }
    assert.equal(connection.requestRejection(authReq), undefined)
  })

  it('preserves 403 Forbidden for untrusted hosts (DNS rebinding / host fence)', () => {
    const { ctx, connection } = createMockContext()
    apply(ctx)

    const untrustedReq = { headers: { host: 'untrusted.com' } }
    assert.equal(connection.requestRejection(untrustedReq), 403)
  })

  it('handles missing or non-function original connection methods gracefully', () => {
    const { ctx, connection } = createMockContext({
      requestRejection: undefined,
    })
    apply(ctx)

    const req = { headers: { host: '127.0.0.1:3080' } }
    assert.equal(connection.requestRejection(req), undefined)
  })

  it('safely does nothing if ctx.connection is undefined', () => {
    const ctx = {
      connection: undefined,
      on() {},
    }
    assert.doesNotThrow(() => apply(ctx))
  })

  it('restores original methods upon disposal', () => {
    const originalAuthUrl = function originalAuth(url) { return `${url}?token=orig` }
    const originalAuthorizeIndex = function origAuthIndex() { return false }
    const originalRequestRejection = function origReqRej() { return 401 }

    const { ctx, connection } = createMockContext({
      authenticatedUrl: originalAuthUrl,
      authorizeIndex: originalAuthorizeIndex,
      requestRejection: originalRequestRejection,
    })

    apply(ctx)

    // Confirm overridden
    assert.equal(connection.authenticatedUrl('http://127.0.0.1:3080'), 'http://127.0.0.1:3080/')
    assert.equal(connection.authorizeIndex(), true)
    assert.equal(connection.requestRejection({}), undefined)

    // Dispose
    ctx.dispose()

    // Confirm restored
    assert.equal(connection.authenticatedUrl('http://127.0.0.1:3080'), 'http://127.0.0.1:3080?token=orig')
    assert.equal(connection.authorizeIndex(), false)
    assert.equal(connection.requestRejection({}), 401)
  })
})
