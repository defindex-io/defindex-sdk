# Types Module

> **Living document.** Read this before modifying the module. Update it in the same change whenever the module's behavior, endpoints, files, or dependencies change.

**Source:** `src/types/` · **Last verified:** 2026-09-04

## Purpose

Every request and response shape of the DeFindex API, expressed as TypeScript interfaces and enums. The whole folder is re-exported from the package root (`src/index.ts:5`), so these names are public API: renaming one is a breaking change for consumers, which is exactly what the 0.3.0 release was (`CHANGELOG.md:3-30`). This module holds no runtime logic other than enum values.

## Structure

| File | Purpose |
|---|---|
| `src/types/index.ts` | Barrel; re-exports all five files. |
| `src/types/base.types.ts` | `TransactionResponse` - the shared shape every transaction endpoint returns. |
| `src/types/network.types.ts` | `SupportedNetworks` enum. |
| `src/types/factory.types.ts` | Factory address, auto-invest params and response. |
| `src/types/vault.types.ts` | Vault params, roles, fees, rebalance instructions, vault responses (280 lines). |
| `src/types/stellar.types.ts` | `/send` request and the parsed transaction result union. |

## Public surface

Key anchors, all verified:

- `TransactionResponse` (`src/types/base.types.ts:2`) - `{ xdr: string | null; simulationResponse: unknown; operationXDR?: string; isSmartWallet?: boolean }`.
- `VaultTransactionResponse extends TransactionResponse` (`src/types/vault.types.ts:198`) adds `functionName` and `params`.
- `SupportedNetworks` (`src/types/network.types.ts:2`) - `TESTNET = 'testnet'`, `MAINNET = 'mainnet'`.
- `VaultRoles` (`src/types/vault.types.ts:275`) - `'manager'`, `'emergency-manager'`, `'rebalance-manager'`, `'fee-receiver'`. These strings are used as URL path segments.
- `VaultRolesConfig` (`src/types/vault.types.ts:120`) - named keys `emergencyManager`, `rebalanceManager`, `feeReceiver`, `manager`.
- `CreateVaultParams` (`src/types/vault.types.ts:152`), `CreateVaultDepositParams` (`:163`), `CreateVaultAutoInvestParams` (`src/types/factory.types.ts:39`).
- `InstructionParam` (`src/types/vault.types.ts:105`) - the rebalance instruction union actually used by `RebalanceParams` (`:80`).
- `TransactionResult` (`src/types/stellar.types.ts:36`) - discriminated union on `type`: `vault_deposit`, `vault_withdraw`, `vault_create`, `unknown`.
- `SendTransactionResponse` (`src/types/stellar.types.ts:43`).
- Contract-method enums: `VaultMethods` (`src/types/vault.types.ts:208`) and the three narrowed views `VaultInfoInvocationMethods` (`:244`), `VaultGetRoleMethods` (`:256`), `VaultSetRoleMethods` (`:263`).

## Gotchas & invariants

- **Two role vocabularies coexist and are not interchangeable.** `VaultRoles` (`src/types/vault.types.ts:275`) is kebab-case and goes in the URL path. `VaultRolesConfig` (`:120`) is camelCase and goes in a create-vault body. `VaultGetRoleMethods` (`:256`) is snake_case contract method names and comes back in `VaultRoleResponse.function_called` (`:270`). Picking the wrong one produces a 404 or a rejected body.
- **`Instruction` (`src/types/vault.types.ts:85`) is not the type used for rebalancing.** `RebalanceParams.instructions` is `InstructionParam[]` (`:80-83`). The two unions differ for swaps: `Instruction` takes `amount_in`/`amount_out_min`/`deadline`, `InstructionParam` takes a single `amount` plus optional `slippageToleranceBps`. `Instruction` is referenced nowhere in `src/` (verified) - treat it as legacy.
- `SendXdrDto` (`src/types/stellar.types.ts:2`) is exported but unused in `src/`; `sendTransaction` builds `{ xdr }` inline (`src/defindex-sdk.ts:719`).
- `VaultMethods`, `VaultInfoInvocationMethods` and `VaultSetRoleMethods` are consumer-facing only; nothing in `src/` reads them. Only `VaultGetRoleMethods` is used, inside `VaultRoleResponse` (`src/types/vault.types.ts:271`).
- `DepositToVaultParams` is a deprecated alias of `DepositParams` (`src/types/vault.types.ts:23-24`). Keep the alias; do not add new ones.
- **Amount unit inconsistency is real, not a doc error.** Vault params use `number[]` amounts (`src/types/vault.types.ts:18`) while managed-funds responses use `string` amounts (`:168-180`) and fees come back as `string` (`src/types/stellar.types.ts:61`). Large values arrive as strings to avoid precision loss; `HttpClient` accepts `bigint` on the way out (see the http-client doc).
- `simulationResponse` and `params` are typed `unknown` on purpose (`src/types/base.types.ts:3`, `src/types/vault.types.ts:200`). The 0.3.0 cleanup removed `any` from this folder (`CHANGELOG.md:49`); narrow with a type guard rather than reintroducing `any`.
- `vaultFeeBps` (`src/types/vault.types.ts:155`) and `vaultFee` (`src/types/factory.types.ts:49`) are both basis points but are named differently on the two create endpoints. Not a typo - match the endpoint.
- New types must be exported from `src/types/index.ts` or consumers cannot import them.

## Testing

- No dedicated test file. Types are exercised indirectly at compile time by `tests/defindex-sdk.test.ts`, which imports most param interfaces (`tests/defindex-sdk.test.ts:2-19`) and is compiled by `ts-jest` (`jest.config.js:2`).
- `tsc` is the real check here: `pnpm run build` (`package.json:16`) with `strict: true` (`tsconfig.json:8`). Tests are excluded from the build (`tsconfig.json:24-30`), so a type error in `tests/` only surfaces when jest runs.
