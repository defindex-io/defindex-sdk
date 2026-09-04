# HTTP Client Module

> **Living document.** Read this before modifying the module. Update it in the same change whenever the module's behavior, endpoints, files, or dependencies change.

**Source:** `src/clients/http-client.ts` · **Last verified:** 2026-09-04

## Purpose

`HttpClient` is a thin axios wrapper that owns transport concerns for the whole SDK: base URL, timeout, the Bearer auth header, BigInt-safe request bodies, and error shaping. `DefindexSDK` creates exactly one instance and routes every call through it, so any change here affects every SDK method at once. It is also re-exported from the package (`src/index.ts:8`), so its signature is public API.

## Structure

| File | Purpose |
|---|---|
| `src/clients/http-client.ts` | The entire module: one exported `HttpClient` class, 85 lines. |

## Public surface

| Member | Signature | Source |
|---|---|---|
| constructor | `(baseURL: string, apiKey: string, timeout = 30000)` | `src/clients/http-client.ts:10` |
| `get<T>` | `(url: string, config?: AxiosRequestConfig) => Promise<T>` | `src/clients/http-client.ts:56` |
| `post<T>` | `(url: string, data?: any, config?: AxiosRequestConfig) => Promise<T>` | `src/clients/http-client.ts:64` |
| `buildUrlWithQuery` | `(baseUrl: string, params: Record<string, any>) => string` | `src/clients/http-client.ts:72` |

`get` and `post` unwrap `response.data`, so callers never see an `AxiosResponse`.

## Key methods

- **`constructor`** (`src/clients/http-client.ts:10`) - three positional args, not an options object. `Authorization: Bearer <apiKey>` is added only when `apiKey` is truthy (`src/clients/http-client.ts:21`), which is why `DefindexSDK` can pass an empty string for an unauthenticated client. `Content-Type: application/json` is always set (`src/clients/http-client.ts:20`).

- **`transformRequest` hook** (`src/clients/http-client.ts:24-33`) - replaces axios's default request transform entirely. Any object body is `JSON.stringify`ed with a replacer that converts `bigint` to its decimal string. This exists because vault amounts can exceed `Number.MAX_SAFE_INTEGER` and plain `JSON.stringify` throws on BigInt.

- **response interceptor** (`src/clients/http-client.ts:37-49`) - on an HTTP error response it rejects with `error.response.data` (the raw API payload), deliberately discarding the `AxiosError`. Network-level failures reject with the original error. This is the "API error passthrough" behavior the SDK is built on.

- **`buildUrlWithQuery`** (`src/clients/http-client.ts:72`) - drops `undefined`/`null` values (`:74`), repeats the key for array values (`:77`), and URL-encodes both key and value.

## Dependencies

- `axios` - the only runtime dependency of the whole package (`package.json:67`).
- Consumed by `DefindexSDK` (`src/defindex-sdk.ts:1`) and re-exported publicly (`src/index.ts:8`).
- No env vars, no direct contract or database access. Base URL and API key are injected by the caller.

## Gotchas & invariants

- **Rejected values are not `Error` instances.** Because the interceptor rejects with `error.response.data` (`src/clients/http-client.ts:43`), a `catch (e)` block gets the API's JSON body. `e.message` is often `undefined`. Never assume `instanceof Error` downstream.
- **Replacing `transformRequest` is a breaking edit.** The custom array (`src/clients/http-client.ts:24-33`) overrides axios defaults, so `FormData`, `URLSearchParams`, streams and buffers are no longer handled by axios. Non-object bodies fall through unchanged (`:31`). Keep the BigInt replacer if you touch it.
- `buildUrlWithQuery` is dead code inside `src/` - no SDK method calls it (verified: only `src/clients/http-client.ts:72` and `tests/http-client.test.ts` reference it). `DefindexSDK` builds every URL with template literals instead. It is still public API, so do not delete it without a major bump.
- Empty-string values survive `buildUrlWithQuery` (only `undefined` and `null` are filtered), producing `key=` in the query string - asserted in `tests/http-client.test.ts:187`.
- File-level `eslint-disable @typescript-eslint/no-explicit-any` (`src/clients/http-client.ts:1`). This module is the sanctioned `any` island; the rest of `src/` should stay `unknown`-typed.

## Testing

- `tests/http-client.test.ts` (227 lines), run with `pnpm test` (`package.json:18`).
- **Critical gap:** axios is mocked globally in `tests/setup.ts:10-25`, so `axios.create` never runs the real config. The "BigInt serialization" test only asserts `post` was called with the raw object (`tests/http-client.test.ts:205-208`) - `transformRequest` is never executed. The "Error transformation" tests (`tests/http-client.test.ts:212-226`) likewise never exercise the response interceptor, since `interceptors.response.use` is a bare `jest.fn()`.
- What is genuinely covered: constructor header shape (`tests/http-client.test.ts:41-66`) and `buildUrlWithQuery` (`tests/http-client.test.ts:138-188`), which is pure and needs no HTTP.
- If you change the interceptor or the transform, add a test that does not rely on the global axios mock.
