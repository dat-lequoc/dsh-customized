# dsh-better-retry

An error classification and automatic retry management plugin for DeepSeek Harness (DSH) Web.

It intelligently reclassifies transient `PI_AI_ERROR` failures matching defined message patterns into `RATE_LIMIT`, allowing DeepSeek Harness's native `@deepseek-ai/dsh-llm-retry` executor to handle them. The original request and diagnostic details remain untouched, while retry attempts, exponential backoff, jitter, and cancellation remain governed by your provider's DSH retry policy.

## Features

- **No Reinvented Retry Loops:** Leverages DSH's built-in `@deepseek-ai/dsh-llm-retry` executor instead of maintaining a separate retry mechanism.
- **Smart ID & Header Normalization:** Automatically strips volatile request IDs, trace IDs, correlation IDs, and UUIDs so transient errors match reliably regardless of per-request hashes.
- **Web UI Integration:**
  - **Chat Error Row:** Adds an **"Enable automatic retry"** button right beside failed turns to preview and save new patterns with one click.
  - **Settings Panel:** Dedicated **"Automatic retry"** section under Settings to inspect, enable/disable, delete, or test matching patterns.
- **Safety Boundaries:** Explicitly disallows non-transient failures (authentication errors, exhausted balance/quota, invalid requests, cancellations) from being converted to retries.
- **Bilingual Support:** Fully localized in English and Chinese, defaulting to English.

## Installation

### Add to DSH Web Profile

```sh
dsh plugin --profile web add link:/path/to/dsh-customized/better-retry
```

Or from GitHub:
```sh
dsh plugin --profile web add github:dat-lequoc/dsh-customized
```

Ensure your profile configuration contains both `@deepseek-ai/dsh-llm-retry` and `dsh-better-retry`:
```sh
dsh --profile web --dump-config
```

## How It Works

1. **Stream Interception:** Intercepts `llm/stream` events on the Host plane.
2. **Pattern Matching:** When a stream finishes with an error (`failure.code === 'PI_AI_ERROR'`), the error message is checked against enabled rules.
3. **Reclassification:** If matched, the failure code is rewritten to `RATE_LIMIT`.
4. **Executor Hand-off:** `@deepseek-ai/dsh-llm-retry` catches the `RATE_LIMIT` and performs standard exponential backoff with jitter and retry limits according to your provider configuration.

## Built-in Rules

The following rules are enabled by default and can be toggled in Settings:
- `Too many pending requests, please retry later`
- `Our servers are currently overloaded. Please try again later`

Common prefix tags such as `unknown:` or `server_error:` and volatile request IDs are automatically ignored during matching.

## Match Modes

1. **Normalized Full Match (`exact`):** Strips request IDs/UUIDs and normalizes whitespace/casing. The message must match completely.
2. **Contiguous Phrase (`contains`):** Matches a stable substring of at least 24 characters and 3 words. Prevents overly generic phrases like `please retry` from accidentally matching non-transient errors.

## Development & Testing

```sh
pnpm install
pnpm run check
pnpm run bundle
```

- `pnpm run check`: Runs all unit and integration tests (`node --test`) covering error normalization, common fragment derivation, host classification, RPC mutations, and UI components.
- `pnpm run bundle`: Builds host and browser bundles into `lib/` using `tsdown`.

## License

MIT
