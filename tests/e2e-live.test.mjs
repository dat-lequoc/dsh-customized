import { strict as assert } from 'node:assert'
import { spawn } from 'node:child_process'
import { createServer, request as httpRequest } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const PATCH_PATH = fileURLToPath(new URL('../cordis.patch.yml', import.meta.url))
const HARNESS_CLI = '/home/nightfury/deepseek-harness/apps/cli/src/bin.ts'

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('failed to obtain port')))
        return
      }
      const port = address.port
      server.close((err) => {
        if (err) reject(err)
        else resolve(port)
      })
    })
    server.on('error', reject)
  })
}

function startWebProcess(port, patchPath, dshHome) {
  return new Promise((resolve, reject) => {
    const args = [
      '--import',
      'tsx/esm',
      HARNESS_CLI,
      'web',
    ]
    if (patchPath) {
      args.push('--patch', patchPath)
    }
    args.push('--port', String(port), '--no-open')

    const child = spawn(process.execPath, args, {
      cwd: '/home/nightfury/deepseek-harness',
      env: {
        ...process.env,
        DSH_HOME: dshHome,
        DSH_TELEMETRY_MODE: 'DISABLED',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    let resolved = false

    const timeout = setTimeout(() => {
      if (!resolved) {
        child.kill('SIGTERM')
        reject(new Error(`Timed out waiting for dsh web startup. stdout:\n${stdout}\nstderr:\n${stderr}`))
      }
    }, 45000)

    function onData(chunk) {
      const str = chunk.toString()
      stdout += str
      const match = stdout.match(/dsh web:\s+(https?:\/\/[^\s]+)/)
      if (match && !resolved) {
        resolved = true
        clearTimeout(timeout)
        resolve({
          child,
          url: match[1],
          stdout: () => stdout,
          stderr: () => stderr,
        })
      }
    }

    child.stdout.on('data', onData)
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.once('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })

    child.once('exit', (code) => {
      clearTimeout(timeout)
      if (!resolved) {
        reject(new Error(`dsh web exited with code ${code} before startup. stdout:\n${stdout}\nstderr:\n${stderr}`))
      }
    })
  })
}

function stopProcess(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null) {
      resolve()
      return
    }
    child.once('exit', () => resolve())
    child.kill('SIGTERM')
    setTimeout(() => {
      try {
        child.kill('SIGKILL')
      } catch {}
    }, 5000)
  })
}

function postSettingsDescribe(port, host, cookie) {
  const body = JSON.stringify({
    type: 'client-request',
    rpcId: 'test-e2e-disable-auth',
    method: 'settings/describe',
    payload: { args: {} },
  })

  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: '127.0.0.1',
        port,
        path: '/api/settings/describe',
        method: 'POST',
        headers: {
          host,
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body),
          ...(cookie ? { cookie } : {}),
        },
      },
      (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          })
        })
      },
    )
    req.on('error', reject)
    req.end(body)
  })
}

describe('End-to-End Live Web Verification with dsh-customized', () => {
  let tmpHome
  let serverInfo

  it('boots dsh web with dsh-customized patch and satisfies all verification criteria', async () => {
    tmpHome = await mkdtemp(join(tmpdir(), 'dsh-customized-e2e-'))
    const port = await getFreePort()

    // 1. Startup log verification
    serverInfo = await startWebProcess(port, PATCH_PATH, tmpHome)
    const printedUrl = serverInfo.url

    // Must show clean URL without ?token=...
    assert.equal(printedUrl, `http://127.0.0.1:${port}/`)
    assert.equal(printedUrl.includes('token='), false)

    // 2. Root HTTP check on fresh client (no cookies)
    const rootRes = await fetch(`http://127.0.0.1:${port}/`, {
      method: 'GET',
      redirect: 'manual',
    })
    // Must return HTTP status 200 OK (not 401 or 303)
    assert.equal(rootRes.status, 200, `Expected 200 OK, got ${rootRes.status}`)
    const html = await rootRes.text()
    assert.ok(html.includes('<!DOCTYPE html>') || html.includes('<html'), 'Expected HTML response')

    // Also verify HEAD request returns 200 OK
    const headRes = await fetch(`http://127.0.0.1:${port}/`, {
      method: 'HEAD',
      redirect: 'manual',
    })
    assert.equal(headRes.status, 200, `Expected HEAD to return 200 OK, got ${headRes.status}`)

    // 3. API Check: POST /api/settings/describe with Host: 127.0.0.1:<port> and NO cookie
    const apiRes = await postSettingsDescribe(port, `127.0.0.1:${port}`)
    assert.equal(apiRes.statusCode, 200, `Expected API 200 OK, got ${apiRes.statusCode}: ${apiRes.body}`)

    const parsedApi = JSON.parse(apiRes.body)
    assert.equal(parsedApi.type, 'server-response')
    assert.equal(parsedApi.rpcId, 'test-e2e-disable-auth')
    assert.equal(parsedApi.result.ok, true)
    assert.ok(Array.isArray(parsedApi.result.value.namespaces), 'Expected namespaces array in settings describe')

    // 4. Verify that Host fence (DNS rebinding defense) still protects against untrusted hosts (403)
    const untrustedRes = await postSettingsDescribe(port, 'evil-attacker.com')
    assert.equal(untrustedRes.statusCode, 403, `Expected 403 for untrusted host, got ${untrustedRes.statusCode}`)

    // Stop patched server
    await stopProcess(serverInfo.child)
    serverInfo = null
  })

  it('verifies contrast: default web server without patch enforces token & 401', async () => {
    const unpatchedPort = await getFreePort()
    const defaultServer = await startWebProcess(unpatchedPort, null, tmpHome)

    try {
      // 1. Printed URL must contain token
      const defaultUrl = defaultServer.url
      assert.ok(defaultUrl.includes('token='), `Expected token in URL, got: ${defaultUrl}`)

      // 2. Unauthenticated root request receives 401 Unauthorized
      const rootRes = await fetch(`http://127.0.0.1:${unpatchedPort}/`, {
        method: 'GET',
        redirect: 'manual',
      })
      assert.equal(rootRes.status, 401, `Expected 401 Unauthorized without patch, got: ${rootRes.status}`)

      // 3. Unauthenticated API request receives 401
      const apiRes = await postSettingsDescribe(unpatchedPort, `127.0.0.1:${unpatchedPort}`)
      assert.equal(apiRes.statusCode, 401, `Expected 401 API without patch, got: ${apiRes.statusCode}`)
      assert.equal(apiRes.body, 'unauthorized')
    } finally {
      await stopProcess(defaultServer.child)
    }
  })

  // Cleanup after test
  it('cleans up test harness process', async () => {
    if (serverInfo?.child) {
      await stopProcess(serverInfo.child)
    }
    if (tmpHome) {
      await rm(tmpHome, { recursive: true, force: true }).catch(() => {})
    }
  })
})
