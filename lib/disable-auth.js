/**
 * Feature: disable-auth
 *
 * Disables web token authentication for DeepSeek Harness:
 * 1. authenticatedUrl: Returns clean URL without ?token= query parameter.
 * 2. authorizeIndex: Returns true unconditionally so index.html is served directly.
 * 3. requestRejection: Bypasses 401 Unauthorized rejections for RPC / API calls.
 */

export const name = 'dsh-customized/disable-auth'
export const inject = ['connection']

/**
 * Clean a base URL by resetting pathname to '/' and stripping search query and hash.
 *
 * @param {string} baseUrl
 * @returns {string}
 */
export function cleanUrl(baseUrl) {
  try {
    const url = new URL(baseUrl)
    url.pathname = '/'
    url.search = ''
    url.hash = ''
    return url.href
  } catch {
    return baseUrl
  }
}

/**
 * Apply the disable-auth interception on the connection service.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export function applyDisableAuth(ctx) {
  const connection = ctx.connection
  if (!connection) return

  const origAuthenticatedUrl = connection.authenticatedUrl?.bind(connection)
  const origAuthorizeIndex = connection.authorizeIndex?.bind(connection)
  const origRequestRejection = connection.requestRejection?.bind(connection)

  connection.authenticatedUrl = (baseUrl) => {
    return cleanUrl(baseUrl)
  }

  connection.authorizeIndex = (_req, _res) => {
    return true
  }

  connection.requestRejection = (request) => {
    if (typeof origRequestRejection === 'function') {
      const rejection = origRequestRejection(request)
      if (rejection === 401) {
        return undefined
      }
      return rejection
    }
    return undefined
  }

  ctx.on('dispose', () => {
    if (origAuthenticatedUrl) {
      connection.authenticatedUrl = origAuthenticatedUrl
    } else {
      delete connection.authenticatedUrl
    }

    if (origAuthorizeIndex) {
      connection.authorizeIndex = origAuthorizeIndex
    } else {
      delete connection.authorizeIndex
    }

    if (origRequestRejection) {
      connection.requestRejection = origRequestRejection
    } else {
      delete connection.requestRejection
    }
  })
}

export function apply(ctx) {
  applyDisableAuth(ctx)
}

export default {
  name,
  inject,
  apply,
}
