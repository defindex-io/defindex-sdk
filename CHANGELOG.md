# DeFindex SDK Changelog

## Unreleased — CLI

**Added:**

- `defindex` command (package `bin`): `vaults`, `vault <addr>`, `position`, `deposit`, `withdraw`, `sign`
- `-f json` / `--output json` on every command; errors as `{"error": "..."}` with exit code 1 (runtime) or 2 (usage); `apyPct`, and `null` rather than 0 for missing values
- `deposit` / `withdraw --dry-run` builds and simulates and prints the unsigned XDR; `sign --xdr <xdr|-> [--submit]` signs it later
- Signer from environment variables only (`STELLAR_SECRET_KEY`), with a `STELLAR_SIGNER` registry for remote signers
- `DefindexSDK.discoverVaults()` for `GET /vault/discover`, with `DiscoverVaultsResponse` / `DiscoveredVault`

**Changed:**

- New runtime dependency `@stellar/stellar-sdk` (used by the CLI only); `engines.node` is now `>=22.0.0`, which that dependency requires

## 0.3.0 — Type System Cleanup & DX Improvements

Standardized naming conventions, removed `any` types, and unified response shapes for a cleaner developer experience.

**Renamed types:**

| Old | New |
|---|---|
| `CreateDefindexVault` | `CreateVaultParams` |
| `CreateDefindexVaultDepositDto` | `CreateVaultDepositParams` |
| `DepositToVaultParams` | `DepositParams` |
| `BaseTransactionResponse` | `TransactionResponse` |
| `BaseVaultTransactionResponse` | removed (merged into `TransactionResponse`) |
| `CreateDefindexVaultResponse` | removed (use `TransactionResponse`) |
| `CreateVaultDepositResponse` | removed (use `TransactionResponse`) |
| `SendTransactionErrorResponse` | removed |

**Renamed request fields (factory create endpoints):**

| Old | New |
|---|---|
| `vault_fee_bps` | `vaultFeeBps` |
| `deposit_amounts` | `depositAmounts` |
| `name_symbol: { name, symbol }` | flat `name` + `symbol` |

**Removed response fields (factory create endpoints):**

- `call_params` / `callParams` — removed entirely from create-vault and create-vault-deposit responses. These endpoints now return `TransactionResponse` only (`xdr`, `simulationResponse`, `operationXDR`, `isSmartWallet`).

**Vault roles now use named keys instead of numeric indices:**

```typescript
// Before
roles: { 0: "GEMERGENCY...", 1: "GFEE...", 2: "GMANAGER...", 3: "GREBALANCE..." }

// After
roles: { emergencyManager: "GEMERGENCY...", feeReceiver: "GFEE...", manager: "GMANAGER...", rebalanceManager: "GREBALANCE..." }
```

**`SendTransactionResponse` redesigned:**

- Removed raw XDR fields (`resultXdr`, `resultMetaXdr`, `envelopeXdr`, `returnValue`)
- Added `success: boolean` (replaces `status: string`)
- Added `result: TransactionResult | null` — a discriminated union (`vault_deposit`, `vault_withdraw`, `vault_create`, `unknown`) with parsed data
- Added `feeCharged: string`

**Removed all `any` types** — replaced with `unknown` for type safety.

**Improved error handling for `create-vault-auto-invest`:**

- Contract errors (e.g. `TokenErrors.InsufficientBalance`) now return proper 400 responses instead of generic 500 errors, matching the behavior of other endpoints.

---

## 0.2.0 — Smart Wallet Support

All transaction endpoints (vault and factory) now support smart wallets (C-addresses).

Every transaction response includes two new fields: `operationXDR` (base64 operation XDR) and `isSmartWallet` (boolean). When the caller is a smart wallet, `xdr` is `null` — use `operationXDR` to build the transaction client-side.

**Affected vault endpoints:** `/vault/:address/deposit`, `withdraw`, `withdraw-shares`, `rescue`, `pause-strategy`, `unpause-strategy`, `set-role/:role`, `report`, `rebalance`, `lock-fees`, `release-fees`, `distribute-fees`, `upgrade`

**Affected factory endpoints:** `/factory/create-vault`, `create-vault-deposit`, `create-vault-auto-invest`

## 0.2.1 — Remove LaunchTube

The LaunchTube integration has been removed. The `POST /send` endpoint now submits transactions directly to the Stellar network via Soroban RPC.

**Breaking changes:**

- The `launchtube` field in the request body has been removed. Passing `launchtube: true` is no longer necessary or accepted.
- The response is now always a `SendTransactionResponse` (Soroban RPC response). The `LaunchTubeResponse` type is no longer returned.

**Before:**
```json
POST /send?network=testnet
{ "xdr": "AAAAAgAAAA...", "launchtube": true }
```

**After:**
```json
POST /send?network=testnet
{ "xdr": "AAAAAgAAAA..." }
```

See [LLMS-MIGRATION.md](./LLMS-MIGRATION.md) for agent-friendly migration instructions.
