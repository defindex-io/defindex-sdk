# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Entry summary

`@defindex/sdk` v0.3.0 (`package.json:2-3`) is the official TypeScript client for the DeFindex vault API on Stellar/Soroban. Published to npm, MIT, server-side focused.
**Exposes:** the `DefindexSDK` class (default and named export), `HttpClient`, and every request/response type (`src/index.ts:2-12`). One method per API route: factory create-vault (3 variants), vault info/balance/APY/report, deposit/withdraw/withdraw-shares, rebalance, emergency rescue, pause/unpause strategy, get/set role, lock/release/distribute fees, WASM upgrade, `sendTransaction`. Full route table: `docs/modules/sdk-client.md`.
**Consumes:** the DeFindex API at `https://api.defindex.io` (default base URL, `src/defindex-sdk.ts:82`), authenticated with an API key sent as a Bearer token (`src/clients/http-client.ts:21`). Networks are `testnet` / `mainnet` (`src/types/network.types.ts:2`).
**No contract addresses are hardcoded** - the API resolves factory, vault and strategy contracts. Nothing in `src/` holds one.
**Signing is out of scope:** transaction methods return unsigned XDR; the caller signs (e.g. with `@stellar/stellar-sdk`, not a dependency of this package) and submits via `sendTransaction()`.

## Project Overview

A thin API client. There is no local business logic, no Stellar RPC access, and no key handling: `DefindexSDK` resolves a network, delegates to `HttpClient`, and returns the API payload. Only runtime dependency is `axios` (`package.json:67`).

## Development Commands

All from `package.json:15-29`.

- `pnpm run build` / `pnpm run build:watch` - compile TypeScript to `dist/`
- `pnpm test` or `pnpm run test:unit` - unit tests (mocked)
- `pnpm run test:integration` - integration tests against the real API (needs credentials)
- `pnpm run test:all` - unit then integration
- `pnpm run test:watch`, `pnpm run test:coverage`
- `pnpm run lint`, `pnpm run lint:fix`
- `pnpm run prepare` (build before publish), `pnpm run prepublishOnly` (test + lint)
- `pnpm run example` - run `examples/basic-example.ts` with dotenv loaded

## Architecture

Three modules. **Read the module doc before editing its source** - see `docs/modules/README.md`.

| Module | Source | Doc |
|---|---|---|
| SDK client | `src/defindex-sdk.ts`, `src/index.ts` | `docs/modules/sdk-client.md` |
| HTTP client | `src/clients/http-client.ts` | `docs/modules/http-client.md` |
| Types | `src/types/` | `docs/modules/types.md` |

Supporting: `tests/` (unit, mocked), `tests/integration/` (live API), `examples/basic-example.ts`, `EXAMPLES.md`, `LLMS-MIGRATION.md` (0.2.1 breaking-change guide), `defindex-sdk-skill.md` (consumer-facing integration skill).

## Cross-repo dependencies

| Direction | Target | What | Evidence |
|---|---|---|---|
| this repo -> DeFindex API service | `https://api.defindex.io` | Every SDK method is an HTTP call to this service. Default base URL, overridable via config. | `src/defindex-sdk.ts:82`, `.env.example:17`, `tests/integration/README.md:32-33` |
| other repos -> this repo | npm `@defindex/sdk` v0.3.0 | Published package. Consumers `import DefindexSDK, { SupportedNetworks } from '@defindex/sdk'`. | `package.json:2-3`, `defindex-sdk-skill.md:26,32` |
| this repo -> Soroswap | `soroswapRouter?: string` on `CreateVaultParams` | Optional Soroswap router address forwarded to the create-vault endpoint; the vault uses it for rebalance swaps (`SwapExactIn` / `SwapExactOut`). | `src/types/vault.types.ts:159`, `src/types/vault.types.ts:108-115` |
| this repo -> Stellar/Soroban contracts | factory, vault, strategy contracts | Never hardcoded. Factory address is fetched at runtime; vault addresses are caller-supplied. Testnet fixture addresses appear only in the example and integration tests. | `src/defindex-sdk.ts:155`, `examples/basic-example.ts:41-43`, `tests/integration/defindex-sdk.integration.test.ts:144` |
| this repo -> GitHub | `defindex-io/defindex-sdk` | Repository / issues home. | `package.json:43-49` |

No `@soroswap/*` or `@defindex/*` npm dependency (`package.json:66-68` lists `axios` only), no database, no message broker. `@stellar/stellar-sdk` is a documented companion for signing but is not declared as a dependency or peer dependency.

## Environment Configuration

Nothing in `src/` reads `process.env`. Env vars are for consumers, the example, and integration tests:

- `DEFINDEX_API_KEY` - API key, sent as `Authorization: Bearer <key>` (`.env.example:10`, `src/clients/http-client.ts:21`)
- `DEFINDEX_API_URL` - optional base URL override (`.env.example:17`, `examples/basic-example.ts:32`)

`DefindexSDKConfig` (`src/defindex-sdk.ts:34-42`): `apiKey?`, `baseUrl?` (default `https://api.defindex.io`), `timeout?` (default `30000`), `defaultNetwork?`.

**Known inconsistency:** `tests/integration/setup.ts:14` lists `DEFINDEX_BASE_URL` in `requiredEnvVars`, a name used nowhere else; the computed `missingVars` on the next line is never read. Only `DEFINDEX_API_KEY` actually gates the integration tests (`tests/integration/setup.ts:18-20`).

## Key Implementation Notes

- **Unsigned XDR everywhere.** Transaction-building methods return an XDR for external signing. `xdr` is `null` for smart-wallet callers (C-addresses) - use `operationXDR` instead (`src/types/base.types.ts:2-7`, `CHANGELOG.md:57-61`).
- **LaunchTube was removed in 0.2.1** (`CHANGELOG.md:67-74`). `sendTransaction` takes only `(xdr, network?)` (`src/defindex-sdk.ts:714`). Do not reintroduce it.
- **Network resolution.** Every method calls `getNetwork()` (`src/defindex-sdk.ts:94`), which throws locally if neither a per-call network nor `defaultNetwork` is set.
- **Errors are not `Error` objects.** The response interceptor rejects with the raw API body (`src/clients/http-client.ts:43`), so `err.message` is often `undefined`.
- **Build config:** ES2020, CommonJS, `strict: true`, declarations and source maps, output `dist/`, tests excluded (`tsconfig.json`). Published files are `dist/`, `README.md`, `LICENSE` (`package.json:7-11`).

## Vault Management Roles

Four roles, `VaultRoles` enum (`src/types/vault.types.ts:275-280`), whose kebab-case values are used as URL path segments:

- **Manager** (`manager`) - configure the vault, assign roles, pause/unpause strategies, manage fees, upgrade the WASM
- **Emergency Manager** (`emergency-manager`) - emergency rescue of assets from a strategy
- **Rebalance Manager** (`rebalance-manager`) - rebalance (invest, unwind, swap)
- **Fee Receiver** (`fee-receiver`) - receives distributed fees

Roles are set at creation via `VaultRolesConfig`, which uses camelCase keys instead (`src/types/vault.types.ts:120-129`). Regular users deposit, withdraw and read vault data with no role.

## Development Patterns

Adding an API method: define its types in the right `src/types/*.types.ts`, export them from `src/types/index.ts`, add the method to `DefindexSDK` under the matching comment banner, call `this.getNetwork(network)` first, then `this.httpClient.get/post`. Add a unit test with a mocked `HttpClient`. Keep `unknown` over `any` outside `src/clients/http-client.ts`.

## Module Documentation Convention (MANDATORY)

Every module has a living doc at `docs/modules/<module>.md` (flat file, one per module). `docs/modules/README.md` is the index that routes a module's source path to its doc. These are the fast on-ramp for anyone - human or agent - touching a module.

**Progressive disclosure - do NOT load all docs at once.** When you're about to touch a module, open `docs/modules/README.md`, find the ONE doc matching the code you're changing, and read only that. Never pull the whole `docs/modules/` folder into context.

**The workflow rule:**
1. **Before modifying a module, read its `docs/modules/<module>.md` first.** It holds the file map, key methods with `file:line`, dependencies, and gotchas.
2. **After modifying a module, update its doc in the same change.** New/removed endpoints, changed behavior, new gotchas, dependency changes - all go into the doc before the work is done. Bump the "Last verified" date.
3. Doc claims must be verified against source and cite `file:line`. Never document something you haven't confirmed exists.
4. **Adding a new module?** Create its `docs/modules/<module>.md` and add a row to `docs/modules/README.md` in the same change.

Docs follow a shared template: Purpose, Structure, Endpoints/Public surface, Key methods (`file:line`), Dependencies, Gotchas & invariants, Testing.

> Note: `docs/modules/` is tracked. `.gitignore:45` ignores only `docs/superpowers/`; do not re-add a blanket `docs/` rule, it would make these docs invisible to every other clone.
