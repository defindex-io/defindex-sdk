# CLI Module

> **Living document.** Read this before modifying the module. Update it in the same change whenever the module's behavior, endpoints, files, or dependencies change.

**Source:** `src/cli/` · **Last verified:** 2026-10-24

## Purpose

The `defindex` command, shipped as a `bin` of this same package (`package.json:7-9`). It wraps `DefindexSDK` for shells, scripts and AI agents: non-interactive, `-f json` on every command, errors as `{"error": "..."}`. It covers what a depositor does (list vaults, inspect one, read a position, deposit, withdraw, sign); admin operations are not exposed. It is the only part of the package that signs, and the only part that imports `@stellar/stellar-sdk` (`package.json:71`). `src/index.ts` does not import it, so library consumers never load it.

## Structure

| File | Purpose |
|---|---|
| `src/cli/index.ts` | Entry point (shebang). Wires real dependencies (stdin, `DefindexSDK`, Stellar RPC) into `run()`. |
| `src/cli/run.ts` | Command table (`:11`), global flags, help, argument parsing with `node:util` `parseArgs`, output and error handling (`run`, `:101`). |
| `src/cli/context.ts` | `CliDeps` (`:12`, the test seam), `CliContext` (`:23`, lazy SDK, signer, cached `decimals()`), flag and address helpers, `toApiNumber` (`:104`). |
| `src/cli/commands/vaults.ts` | `vaults`, `vault <addr>`, `position <vault> [account]`, plus `vaultAssets` / `humanAmount` shared with the transaction commands. |
| `src/cli/commands/transactions.ts` | `deposit`, `withdraw` (amounts, shares, or `--all`), and the shared dry-run / sign-and-submit tail (`finish`). |
| `src/cli/commands/sign.ts` | `sign --xdr [--submit]`. |
| `src/cli/amounts.ts` | `parseUnits`, `parseRawAmount`, `formatUnits`. |
| `src/cli/signer.ts` | `Signer` interface (`:13`) and the `SIGNER_FACTORIES` registry (`:53`). |
| `src/cli/stellar.ts` | Network passphrases, default RPC URLs (`:18`), `decimals()` reads and local simulation (`createStellarClient`, `:56`). |
| `src/cli/output.ts` | JSON serialization (bigint safe) and text tables. |
| `src/cli/errors.ts` | `CliError` / `UsageError` and `errorMessage` (`:26`), which flattens raw API error bodies. |

## Commands and the SDK calls behind them

| Command | SDK methods |
|---|---|
| `vaults` | `discoverVaults` (public endpoint, works without `DEFINDEX_API_KEY`) |
| `vault <addr>` | `getVaultInfo` |
| `position <vault> [account]` | `getVaultInfo`, `getVaultBalance` |
| `deposit <vault>` | `getVaultInfo`, `depositToVault`, then `sendTransaction` unless `--dry-run` |
| `withdraw <vault>` | `--amount`: `getVaultInfo`, `withdrawFromVault`. `--shares` / `--raw-shares`: `withdrawShares`. `--all`: `getVaultBalance`, `withdrawShares`. Then `sendTransaction` unless `--dry-run` |
| `sign --xdr` | `sendTransaction` only with `--submit` |

Stellar RPC, no key needed: `simulateTransaction` for `decimals()` of every asset and vault token the command touches (cached per run), and for the `--dry-run` simulation (`src/cli/stellar.ts:56-89`).

## Gotchas & invariants

- **JSON contract.** In JSON mode stdout carries exactly one JSON document, success or error (`src/cli/run.ts:153`). Exit codes: `0` ok, `1` runtime (API, network, signing, failed simulation), `2` usage. Keep these stable; agents parse them.
- **Amounts are JSON numbers on the wire** (`DepositParams.amounts: number[]`). `toApiNumber` refuses values above `Number.MAX_SAFE_INTEGER` instead of rounding.
- **Multi-asset vaults.** `--amount` / `--raw-amount` take one comma-separated value per asset in `getVaultInfo().assets` order. Zero is allowed for some assets, not for all.
- **Share decimals** are read from the vault contract's own `decimals()`, not assumed.
- **Smart-wallet callers (C-addresses).** The API returns `xdr: null` and an `operationXDR`. A dry run prints it as `operationXdr` with `simulation: null`; a real run fails with a message, since the CLI cannot sign for a contract account.
- **`--dry-run` exits 1 when the local simulation fails**, but still prints the XDR (`src/cli/commands/transactions.ts:111`).
- **`STELLAR_RPC_URL` is one URL for whichever `--network` is passed.** Pointing it at a mainnet RPC and running `--network testnet` gives wrong decimals and simulations.
- **`/vault/discover?network=testnet`** (as of 2026-10-24) returns the mainnet vault addresses with `totalManagedFunds: null`. That is the API, not the CLI.
- **Jest and `@stellar/stellar-sdk`.** The SDK pulls ESM-only packages; `jest.config.js` compiles them with ts-jest (`transformIgnorePatterns`). `@stellar/stellar-sdk` 17 adds more (`@exodus/bytes`) that the pattern does not cover yet.

## Testing

- `tests/cli.test.ts`: argument parsing and exit codes, the JSON shape of every command (`apyPct`, `null` passthrough, human plus raw amounts), multi-asset amount validation, `--dry-run` never signing, `--all` withdrawals, smart-wallet output, signing with `STELLAR_SECRET_KEY` (signature verified). All through `run()` with fake `CliDeps`; no network.
- By hand: `pnpm run build && node dist/cli/index.js vaults` (no key needed).
