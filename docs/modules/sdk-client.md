# SDK Client Module

> **Living document.** Read this before modifying the module. Update it in the same change whenever the module's behavior, endpoints, files, or dependencies change.

**Source:** `src/defindex-sdk.ts`, `src/index.ts` · **Last verified:** 2026-09-04

## Purpose

`DefindexSDK` is the single public entry point of the `@defindex/sdk` package. It is a thin facade: every public method maps 1:1 to one DeFindex API route, resolves the network, and delegates to `HttpClient`. There is no local business logic, no signing, and no Stellar RPC access here. Changing a method signature is a breaking change for every downstream consumer of the published package.

## Structure

| File | Purpose |
|---|---|
| `src/defindex-sdk.ts` | `DefindexSDKConfig` interface and the `DefindexSDK` class (all API methods). |
| `src/index.ts` | Package barrel. Named exports plus a default export of `DefindexSDK`. |
| `examples/basic-example.ts` | Runnable end-to-end demo of the whole surface (`pnpm run example`, `package.json:28`). |

## Public surface

`src/index.ts` exports `DefindexSDK` and `DefindexSDKConfig` (`src/index.ts:2`), re-exports everything from `./types` (`src/index.ts:5`), exports `HttpClient` (`src/index.ts:8`), and sets `DefindexSDK` as the default export (`src/index.ts:12`).

Every method takes an optional trailing `network?: SupportedNetworks`. All routes carry `?network=<network>` as a query string.

| SDK method | HTTP | Path | Source |
|---|---|---|---|
| `healthCheck()` | GET | `/health` (no network param) | `src/defindex-sdk.ts:135` |
| `getFactoryAddress()` | GET | `/factory/address` | `src/defindex-sdk.ts:153` |
| `createVault()` | POST | `/factory/create-vault` | `src/defindex-sdk.ts:182` |
| `createVaultWithDeposit()` | POST | `/factory/create-vault-deposit` | `src/defindex-sdk.ts:207` |
| `createVaultAutoInvest()` | POST | `/factory/create-vault-auto-invest` | `src/defindex-sdk.ts:260` |
| `getVaultInfo()` | GET | `/vault/{vaultAddress}` | `src/defindex-sdk.ts:287` |
| `getVaultBalance()` | GET | `/vault/{vaultAddress}/balance?from={userAddress}` | `src/defindex-sdk.ts:310` |
| `getReport()` | GET | `/vault/{vaultAddress}/report` | `src/defindex-sdk.ts:332` |
| `depositToVault()` | POST | `/vault/{vaultAddress}/deposit` | `src/defindex-sdk.ts:349` |
| `withdrawFromVault()` | POST | `/vault/{vaultAddress}/withdraw` | `src/defindex-sdk.ts:377` |
| `withdrawShares()` | POST | `/vault/{vaultAddress}/withdraw-shares` | `src/defindex-sdk.ts:396` |
| `getVaultAPY()` | GET | `/vault/{vaultAddress}/apy` | `src/defindex-sdk.ts:419` |
| `rebalanceVault()` | POST | `/vault/{vaultAddress}/rebalance` | `src/defindex-sdk.ts:458` |
| `emergencyRescue()` | POST | `/vault/{vaultAddress}/rescue` | `src/defindex-sdk.ts:485` |
| `pauseStrategy()` | POST | `/vault/{vaultAddress}/pause-strategy` | `src/defindex-sdk.ts:504` |
| `unpauseStrategy()` | POST | `/vault/{vaultAddress}/unpause-strategy` | `src/defindex-sdk.ts:523` |
| `getVaultRole()` | GET | `/vault/{vaultAddress}/get/{role}` | `src/defindex-sdk.ts:551` |
| `setVaultRole()` | POST | `/vault/{vaultAddress}/set/{role}` | `src/defindex-sdk.ts:578` |
| `lockVaultFees()` | POST | `/vault/{vaultAddress}/lock-fees` | `src/defindex-sdk.ts:610` |
| `releaseVaultFees()` | POST | `/vault/{vaultAddress}/release-fees` | `src/defindex-sdk.ts:638` |
| `distributeVaultFees()` | POST | `/vault/{vaultAddress}/distribute-fees` | `src/defindex-sdk.ts:664` |
| `upgradeVaultWasm()` | POST | `/vault/{vaultAddress}/upgrade` | `src/defindex-sdk.ts:691` |
| `sendTransaction(xdr)` | POST | `/send` | `src/defindex-sdk.ts:714` |

Non-HTTP helpers: `getDefaultNetwork()` (`src/defindex-sdk.ts:108`) and `setDefaultNetwork()` (`src/defindex-sdk.ts:116`).

## Key methods

- **`constructor(config: DefindexSDKConfig)`** (`src/defindex-sdk.ts:78`) - builds the single `HttpClient` instance. Defaults are applied here and nowhere else: `baseUrl` falls back to `https://api.defindex.io` (`src/defindex-sdk.ts:82`), a missing `apiKey` becomes the empty string (`src/defindex-sdk.ts:83`), `timeout` falls back to `30000` ms (`src/defindex-sdk.ts:84`). An empty API key means the `Authorization` header is simply omitted (see the http-client doc), so an unauthenticated SDK constructs fine and only fails at request time.

- **`private getNetwork(network?)`** (`src/defindex-sdk.ts:94`) - the one piece of real logic in this class. Resolves `network ?? this.defaultNetwork` and throws a plain `Error` when both are absent. Every HTTP method calls it first, so a missing network fails locally before any request is made. Any new API method must call it too.

- **`sendTransaction(xdr, network?)`** (`src/defindex-sdk.ts:714`) - takes a bare base64 XDR string and wraps it into `{ xdr }` inline (`src/defindex-sdk.ts:719`). It does not sign. The caller signs the XDR returned by a transaction-building method (with `@stellar/stellar-sdk`, which this package does not depend on) and passes the signed XDR back in.

- **`getVaultRole` / `setVaultRole`** (`src/defindex-sdk.ts:551`, `:578`) - the role is interpolated straight into the URL path as a `VaultRoles` enum value. Those values are kebab-case (`src/types/vault.types.ts:275`), so the path segment is e.g. `emergency-manager`, not `emergency_manager`.

## Dependencies

- `HttpClient` from `src/clients/http-client.ts` - the only internal runtime dependency (`src/defindex-sdk.ts:1`).
- All request/response types from `src/types` (`src/defindex-sdk.ts:2-29`).
- External: the DeFindex API, default base URL `https://api.defindex.io` (`src/defindex-sdk.ts:82`). All contract addresses (factory, vaults, strategies) are resolved server-side by that API; none are hardcoded in `src/`.
- Env vars: none are read by `src/`. `DEFINDEX_API_KEY` and `DEFINDEX_API_URL` are read only by consumers, the example, and the integration tests (`.env.example:10`, `.env.example:17`, `examples/basic-example.ts:32`, `examples/basic-example.ts:87`).

## Gotchas & invariants

- **Every transaction-building method returns unsigned XDR, never a submitted transaction.** The flow is always: build -> sign externally -> `sendTransaction()`. `xdr` can be `null` when the caller is a smart wallet (C-address); in that case use `operationXDR` (`src/types/base.types.ts:2-7`, `CHANGELOG.md:57-61`).
- **LaunchTube is gone.** It was removed in 0.2.1 (`CHANGELOG.md:67-74`); `sendTransaction` has no `launchtube` parameter (`src/defindex-sdk.ts:714-724`). Do not reintroduce references to it.
- `healthCheck()` returns `Promise<any>` (`src/defindex-sdk.ts:135`) - the only untyped method left. If you type it, that is a breaking change for consumers relying on structural `any`.
- `this.config` is assigned in the constructor (`src/defindex-sdk.ts:79`) and never read anywhere else. Do not assume it is a live config store.
- The `// Vault Management Operations` banner appears twice (`src/defindex-sdk.ts:430` and `:592`). Grouping by comment banner is the file's convention, but the banners are not unique - search by method name, not by banner.
- **Possible route drift:** this SDK builds `/vault/{address}/set/{role}` (`src/defindex-sdk.ts:586`) while `CHANGELOG.md:63` lists the endpoint as `set-role/:role`. Confirm against the API before changing either. _TBD, unverified_ which one the deployed API accepts.
- Adding a method: define its types in `src/types/`, export them from `src/types/index.ts`, call `this.getNetwork(network)` first, then `this.httpClient.get/post`.

## Testing

- Unit tests: `tests/defindex-sdk.test.ts` (816 lines), run with `pnpm test` (`package.json:18`). They mock `HttpClient` wholesale (`tests/defindex-sdk.test.ts:35-42`) and assert on the mocked call, so they verify wiring and types, not the URLs actually produced.
- **Stale mock warning:** that mock still stubs `setAuthorizationHeader` and `setApiKey` (`tests/defindex-sdk.test.ts:39-40`), methods the real `HttpClient` does not define. Do not treat the mock as the client's contract.
- Integration tests: `tests/integration/defindex-sdk.integration.test.ts`, run with `pnpm run test:integration` (`package.json:20`). They self-skip when `DEFINDEX_API_KEY` is unset (`tests/integration/defindex-sdk.integration.test.ts:26-27`) - a green run is not proof they executed.
- Gap: no test asserts the exact request path of any method.
