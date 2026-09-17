# dsh-customized

Opinionated personal customizations for DeepSeek Harness (`deepseek-harness`).

## Features

### 1. `disable-auth`
Disables web token launch authentication and browser session cookie requirement:
- **Clean startup URL:** The server prints `dsh web: http://127.0.0.1:3080/` without any query token (`?token=...`).
- **Direct Web UI serving:** Visiting `http://127.0.0.1:3080/` serves `index.html` directly with HTTP `200 OK` (no `303` redirect or `401 Unauthorized`).
- **Unauthenticated RPC / API access:** All `/api` RPC requests are accepted without requiring browser session cookies (no `401 Unauthorized`), while maintaining DNS rebinding / host fence protections (untrusted hosts still receive `403 Forbidden`).

---

## Installation

### Option 1: Direct One-Line Install (Recommended)

Install directly from GitHub into your DSH Web profile:

```bash
dsh plugin --profile web add github:dat-lequoc/dsh-customized
```

### Option 2: Clone & Local Development Install

Clone the repository and link your local checkout so ongoing edits take effect immediately:

```bash
git clone https://github.com/dat-lequoc/dsh-customized.git
cd dsh-customized
dsh plugin --profile web add .
```

---

After installation, the plugin automatically mounts as a bundle in the Web profile — you can launch `dsh web` normally without needing extra flags.

To uninstall:
```bash
dsh plugin --profile web remove dsh-customized
```

---

## How It Works

The Cordis plugin declares an `inject: ['connection']` dependency to intercept the `HostConnectionService` instance:
1. **`authenticatedUrl(baseUrl)`**: Strips query parameters and hashes, returning a clean origin URL without `?token=<launchToken>`.
2. **`authorizeIndex(req, res)`**: Returns `true` unconditionally so that `@deepseek-ai/dsh-host-frontend-static` serves `index.html` with status `200 OK`.
3. **`requestRejection(req)`**: Bypasses `401` rejections while preserving `403` rejections from the Host/Origin fence (`isTrustedApiRequest`).
4. **Lifecycle reversibility**: All overrides cleanly restore the original methods upon disposal (`ctx.on('dispose', ...)`).

---

## Alternative Configuration (Without Installing as Bundle)

### 1. On-Demand via CLI Flag (`--patch`)

To boot DeepSeek Harness Web with authentication disabled for a single run without installing:

```bash
dsh web --patch path/to/dsh-customized/cordis.patch.yml
```

*(Note: In Commander CLI, launcher options like `--patch` must come before web app specific flags like `--port` or `--no-open`, e.g., `dsh web --patch <path> --port 3080 --no-open`).*

### 2. Persistent Machine Configuration (`$DSH_HOME/cordis.patch.yml`)

Add the `- insert:` directive to your user patch layer in `~/.dsh/cordis.patch.yml` (or `$DSH_HOME/cordis.patch.yml`):

```yaml
- insert:
    - id: dsh-customized
      name: path/to/dsh-customized/lib/index.js
```

---

## Verification & Testing

### Running the Test Suite

```bash
pnpm test
```

The test suite includes:
- Metadata and export verification.
- `cleanUrl` helper unit tests (query token removal, fragment stripping, port preservation, URL validation fallback).
- Mock context interception and disposal reversibility tests.
- Full end-to-end integration tests asserting:
  1. Startup stdout shows `dsh web: http://127.0.0.1:<port>/` without `?token=`.
  2. `curl -I http://127.0.0.1:<port>/` returns `200 OK` on a fresh client with no cookies.
  3. POST to `/api/settings/describe` with valid JSON payload and NO cookie header returns `200 OK` and valid JSON data.
  4. Untrusted host requests (e.g. `Host: evil-attacker.com`) still receive `403 Forbidden`.
  5. Contrast verification against the unpatched server (which enforces `?token=` and `401`).
