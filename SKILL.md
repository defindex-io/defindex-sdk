---
name: defindex-sdk
description: Use when integrating DeFindex vault operations on Stellar - depositing into vaults, withdrawing from vaults, checking balances, creating vaults, or submitting Soroban transactions using the @defindex/sdk TypeScript package.
---

# DeFindex SDK Integration

## Overview

The DeFindex SDK (`@defindex/sdk`) provides server-side TypeScript access to DeFindex vaults on Stellar/Soroban. The SDK returns **unsigned XDR transactions** that must be signed with `@stellar/stellar-sdk` before submission.

**Core flow:** Call SDK method -> receive unsigned XDR -> sign with Stellar keypair -> submit via `sendTransaction()`.

## When to Use

- Building a backend or script that deposits/withdraws from DeFindex vaults
- Querying vault balances, APY, or vault info
- Creating new DeFindex vaults programmatically
- Any server-side Stellar/Soroban interaction with the DeFindex protocol

**Do NOT use for:** Frontend wallet integrations where the user signs in-browser (use Freighter or other wallet adapters directly with the XDR).

## Installation

```bash
pnpm add @defindex/sdk @stellar/stellar-sdk
```

## SDK Setup

```typescript
import DefindexSDK, { SupportedNetworks } from "@defindex/sdk";

const sdk = new DefindexSDK({
  apiKey: process.env.DEFINDEX_API_KEY as string, // Required for most operations
  baseUrl: "https://api.defindex.io",             // Optional, defaults to production
  timeout: 30000,                                  // Optional, ms
});
```

**Networks:** Use `SupportedNetworks.TESTNET` or `SupportedNetworks.MAINNET`.

## Transaction Signing Pattern

Every transaction-building method (deposit, withdraw, create vault, etc.) returns a response containing an `xdr` field. This XDR is an **unsigned Soroban transaction** that must be:

1. Parsed with `TransactionBuilder.fromXDR()`
2. Cast as `Transaction`
3. Signed with the caller's `Keypair`
4. Serialized back to XDR with `.toXDR()`
5. Submitted via `sdk.sendTransaction()`

```typescript
import { Keypair, Networks, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";

// After receiving a response with xdr from any SDK method:
const transaction = TransactionBuilder.fromXDR(response.xdr, Networks.TESTNET) as Transaction;
transaction.sign(callerKeypair);

const result = await sdk.sendTransaction(transaction.toXDR(), SupportedNetworks.TESTNET);
```

**Use `Networks.TESTNET` or `Networks.MAINNET`** from `@stellar/stellar-sdk` when parsing XDR.

## Core Operations

### Deposit into a Vault (Most Common)

Deposits assets into an existing vault. The `amounts` array corresponds to each asset the vault accepts, in **stroops** (1 XLM = 10,000,000 stroops, 1 USDC with 7 decimals = 10,000,000 stroops).

```typescript
import DefindexSDK, { DepositParams, SupportedNetworks } from "@defindex/sdk";
import { Keypair, Networks, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";

const callerKeypair = Keypair.fromSecret("S..._YOUR_SECRET_KEY");

const sdk = new DefindexSDK({
  apiKey: process.env.DEFINDEX_API_KEY as string,
  baseUrl: process.env.DEFINDEX_API_URL as string,
});

const vaultAddress = "CCJWW63WRWZASW7YIGWASHZVOKMDEKQ557CJOHRA5X3PG5KDPHWVITD5";

const depositParams: DepositParams = {
  amounts: [100000000],              // Amount per asset in stroops
  invest: false,                     // true = auto-invest into strategies after deposit
  caller: callerKeypair.publicKey(),
  // slippageBps?: 100,              // Optional: slippage tolerance in basis points (100 = 1%)
};

const depositResponse = await sdk.depositToVault(
  vaultAddress,
  depositParams,
  SupportedNetworks.TESTNET
);

// Sign and submit
const transaction = TransactionBuilder.fromXDR(
  depositResponse.xdr,
  Networks.TESTNET
) as Transaction;

transaction.sign(callerKeypair);

const result = await sdk.sendTransaction(
  transaction.toXDR(),
  SupportedNetworks.TESTNET
);

// result.success: boolean
// result.txHash: string
// result.result: { type: 'vault_deposit', sharesMinted: string }
```

### Withdraw from a Vault (By Amount)

Withdraw specific amounts of each underlying asset.

```typescript
import { WithdrawParams } from "@defindex/sdk";

const withdrawParams: WithdrawParams = {
  amounts: [50000000],               // Amount per asset to withdraw
  caller: callerKeypair.publicKey(),
  // slippageBps?: 100,
};

const withdrawResponse = await sdk.withdrawFromVault(
  vaultAddress,
  withdrawParams,
  SupportedNetworks.TESTNET
);

const tx = TransactionBuilder.fromXDR(withdrawResponse.xdr, Networks.TESTNET) as Transaction;
tx.sign(callerKeypair);
const result = await sdk.sendTransaction(tx.toXDR(), SupportedNetworks.TESTNET);
// result.result: { type: 'vault_withdraw', amountsOut: string[] }
```

### Withdraw from a Vault (By Shares)

Withdraw by burning a number of vault share tokens instead of specifying asset amounts.

```typescript
import { WithdrawSharesParams } from "@defindex/sdk";

const shareParams: WithdrawSharesParams = {
  shares: 1000000,                    // Number of vault shares to redeem
  caller: callerKeypair.publicKey(),
  // slippageBps?: 100,
};

const shareResponse = await sdk.withdrawShares(
  vaultAddress,
  shareParams,
  SupportedNetworks.TESTNET
);

const tx = TransactionBuilder.fromXDR(shareResponse.xdr, Networks.TESTNET) as Transaction;
tx.sign(callerKeypair);
await sdk.sendTransaction(tx.toXDR(), SupportedNetworks.TESTNET);
```

### Check Vault Balance

Returns the user's vault shares (dfTokens) and the underlying asset values.

```typescript
const balance = await sdk.getVaultBalance(
  vaultAddress,
  userPublicKey,          // Stellar public key (G...)
  SupportedNetworks.TESTNET
);

// balance.dfTokens: number       - User's vault share tokens
// balance.underlyingBalance: number[] - Value in each underlying asset
```

### Get Vault Info

```typescript
const info = await sdk.getVaultInfo(vaultAddress, SupportedNetworks.TESTNET);

// info.name: string
// info.symbol: string
// info.apy: number
// info.assets: VaultAsset[]       - Assets with their strategies
// info.totalManagedFunds: AssetManagedFunds[]
// info.feesBps: { vaultFee: number, defindexFee: number }
// info.roles: { manager, emergencyManager, rebalanceManager, feeReceiver }
```

### Get Vault APY

```typescript
const { apy } = await sdk.getVaultAPY(vaultAddress, SupportedNetworks.TESTNET);
// apy: number (percentage)
```

## Vault Creation (One-Time Setup)

### Create a Vault

```typescript
import { CreateVaultParams } from "@defindex/sdk";

const vaultConfig: CreateVaultParams = {
  caller: managerKeypair.publicKey(),
  roles: {
    manager: managerKeypair.publicKey(),
    emergencyManager: "G...",
    rebalanceManager: "G...",
    feeReceiver: "G...",
  },
  vaultFeeBps: 100,                   // 1% fee (basis points, 0-10000)
  name: "My DeFi Vault",              // 1-32 chars
  symbol: "MDV",                      // 1-10 chars
  upgradable: true,
  assets: [{
    address: "C..._ASSET_CONTRACT",   // Soroban asset contract address
    strategies: [{
      address: "C..._STRATEGY_CONTRACT",
      name: "Strategy Name",
      paused: false,
    }],
  }],
};

const createResponse = await sdk.createVault(vaultConfig, SupportedNetworks.TESTNET);

const tx = TransactionBuilder.fromXDR(createResponse.xdr, Networks.TESTNET) as Transaction;
tx.sign(managerKeypair);
const result = await sdk.sendTransaction(tx.toXDR(), SupportedNetworks.TESTNET);
// result.result: { type: 'vault_create', vaultAddress: string }
```

### Create Vault with Initial Deposit

Same as `CreateVaultParams` but adds `depositAmounts`:

```typescript
import { CreateVaultDepositParams } from "@defindex/sdk";

const config: CreateVaultDepositParams = {
  ...vaultConfig,                     // Same as CreateVaultParams
  depositAmounts: [10000000],         // Initial deposit per asset
};

const response = await sdk.createVaultWithDeposit(config, SupportedNetworks.TESTNET);
```

### Create Vault with Auto-Invest

Creates a vault, deposits, and invests into strategies atomically:

```typescript
import { CreateVaultAutoInvestParams } from "@defindex/sdk";

const params: CreateVaultAutoInvestParams = {
  caller: callerKeypair.publicKey(),
  roles: { manager: "G...", emergencyManager: "G...", rebalanceManager: "G...", feeReceiver: "G..." },
  name: "Auto-Invest Vault",
  symbol: "AIV",
  vaultFee: 100,
  upgradable: true,
  assets: [{
    address: "C..._ASSET_CONTRACT",
    symbol: "XLM",
    amount: 10000000,                 // Total deposit amount
    strategies: [{
      address: "C..._STRATEGY_CONTRACT",
      name: "XLM Strategy",
      amount: 10000000,               // Amount to invest in this strategy
    }],
  }],
};

const response = await sdk.createVaultAutoInvest(params, SupportedNetworks.TESTNET);
// response.predictedVaultAddress: string - The predicted vault address
// response.warning?: string - Address prediction caveats
```

## SendTransaction Response

All signed transactions are submitted via `sendTransaction()`. The response is:

```typescript
interface SendTransactionResponse {
  txHash: string;                  // Stellar transaction hash
  success: boolean;                // Whether it succeeded
  result: TransactionResult | null;
  ledger: number;
  createdAt: string;               // ISO 8601
  feeBump: boolean;
  feeCharged: string;              // Fee in stroops
}

// result is a discriminated union:
type TransactionResult =
  | { type: 'vault_deposit'; sharesMinted: string }
  | { type: 'vault_withdraw'; amountsOut: string[] }
  | { type: 'vault_create'; vaultAddress: string }
  | { type: 'unknown'; value: unknown }
```

## Quick Reference

| Operation | Method | Returns XDR? |
|---|---|---|
| Deposit | `depositToVault(vaultAddr, params, network)` | Yes |
| Withdraw (amount) | `withdrawFromVault(vaultAddr, params, network)` | Yes |
| Withdraw (shares) | `withdrawShares(vaultAddr, params, network)` | Yes |
| Balance | `getVaultBalance(vaultAddr, userAddr, network)` | No (read-only) |
| Vault info | `getVaultInfo(vaultAddr, network)` | No (read-only) |
| Vault APY | `getVaultAPY(vaultAddr, network)` | No (read-only) |
| Create vault | `createVault(config, network)` | Yes |
| Create + deposit | `createVaultWithDeposit(config, network)` | Yes |
| Create + auto-invest | `createVaultAutoInvest(params, network)` | Yes |
| Submit TX | `sendTransaction(signedXdr, network)` | N/A |

## Common Mistakes

**Wrong network constant when parsing XDR:** Use `Networks.TESTNET` (from `@stellar/stellar-sdk`) for XDR parsing but `SupportedNetworks.TESTNET` (from `@defindex/sdk`) for SDK method calls. They are different enums.

**Forgetting to cast the parsed transaction:** `TransactionBuilder.fromXDR()` returns a generic type. Always cast with `as Transaction`.

**Amounts in wrong units:** All amounts are in **stroops** (the smallest unit). For a 7-decimal token: 1 token = 10,000,000 stroops. For a 6-decimal token: 1 token = 1,000,000 stroops.

**Missing API key:** Most operations require an API key. Initialize the SDK with `apiKey` or authenticated calls will fail.

**Not waiting before sendTransaction:** After signing, a brief delay (~1s) before submitting can help avoid edge cases with Stellar's transaction queue.
