import { TransactionResponse } from "./base.types";

/* Core vault creation types */
export interface AssetStrategySet {
  address: string;
  strategies: Strategy[];
}

export interface Strategy {
  address: string;
  name: string;
  paused: boolean;
}

/* Vault operation parameters */
export interface DepositParams {
  caller: string;
  amounts: number[];
  slippageBps?: number;
  invest: boolean;
}

/** @deprecated Use DepositParams instead */
export type DepositToVaultParams = DepositParams;

export interface WithdrawParams {
  caller: string;
  amounts: number[];
  slippageBps?: number;
}

export interface WithdrawSharesParams {
  caller: string;
  shares: number;
  slippageBps?: number;
}

export interface RescueFromVaultParams {
  caller: string;
  strategy_address: string;
}

export interface PauseStrategyParams {
  caller: string;
  strategy_address: string;
}

export interface UnpauseStrategyParams {
  caller: string;
  strategy_address: string;
}

/* Fee management interfaces */
export interface LockFeesParams {
  caller: string;
  new_fee_bps?: number;
}

export interface ReleaseFeesParams {
  caller: string;
  strategy_address: string;
  amount: number;
}

export interface DistributeFeesParams {
  caller: string;
}

/* Contract management interfaces */
export interface SetVaultRoleParams {
  caller: string;
  new_address: string;
}

export interface UpgradeWasmParams {
  caller: string;
  new_wasm_hash: string;
}

export interface RebalanceParams {
  caller: string;
  instructions: InstructionParam[];
}

export type Instruction =
  | { type: "Unwind"; strategy_address: string; amount: number }
  | { type: "Invest"; strategy_address: string; amount: number }
  | {
      type: "SwapExactIn";
      token_in: string;
      token_out: string;
      amount_in: number;
      amount_out_min: number;
      deadline: number;
    }
  | {
      type: "SwapExactOut";
      token_in: string;
      token_out: string;
      amount_out: number;
      amount_in_max: number;
      deadline: number;
    };

export type InstructionParam =
  | { type: "Unwind"; strategy_address: string; amount: number }
  | { type: "Invest"; strategy_address: string; amount: number }
  | {
      type: "SwapExactIn" | "SwapExactOut";
      token_in: string;
      token_out: string;
      amount: number;
      slippageToleranceBps?: number;
      deadline?: number;
    };

/* Vault data structures */

/** Typed vault roles configuration */
export interface VaultRolesConfig {
  /** Emergency manager address */
  emergencyManager: string;
  /** Rebalance manager address */
  rebalanceManager: string;
  /** Fee receiver address */
  feeReceiver: string;
  /** Vault manager address */
  manager: string;
}

export type VaultRole = VaultRolesConfig;

export interface VaultStrategy {
  address: string;
  name: string;
  paused: boolean;
}

export interface VaultAsset {
  address: string;
  name: string;
  symbol: string;
  strategies: VaultStrategy[];
}

export interface VaultFees {
  vaultFee: number;
  defindexFee: number;
}

/* Vault creation types */
export interface CreateVaultParams {
  caller: string;
  roles: VaultRolesConfig;
  vaultFeeBps: number;
  name: string;
  symbol: string;
  assets: AssetStrategySet[];
  soroswapRouter?: string;
  upgradable: boolean;
}

export interface CreateVaultDepositParams extends CreateVaultParams {
  depositAmounts: number[];
}

/* Vault managed funds types */
export interface ManagedFundsStrategyAllocation {
  amount: string;
  paused: boolean;
  strategy_address: string;
}

export interface AssetManagedFunds {
  asset: string;
  idle_amount: string;
  invested_amount: string;
  strategy_allocations: ManagedFundsStrategyAllocation[];
  total_amount: string;
}

/* Vault endpoint response types */
export interface VaultInfoResponse {
  name: string;
  symbol: string;
  roles: VaultRolesConfig;
  assets: VaultAsset[];
  totalManagedFunds: AssetManagedFunds[];
  feesBps: VaultFees;
  apy: number;
}

export interface VaultBalanceResponse {
  dfTokens: number;
  underlyingBalance: number[];
}

export interface VaultTransactionResponse extends TransactionResponse {
  functionName: string;
  params: unknown[];
}

export interface VaultApyResponse {
  apy: number;
}

export interface DiscoveredVault {
  address: string;
  /** 30-day APY (%), DeFiLlama method; null when the calculation failed */
  apy: number | null;
  /** Total managed funds per asset; null when the simulation for this vault failed */
  totalManagedFunds: { asset: string; total_amount: string }[] | null;
}

export interface DiscoverVaultsResponse {
  totalVaults: number;
  vaults: DiscoveredVault[];
}

/* Comprehensive Vault Methods Enum - Based on Contract Analysis */
export enum VaultMethods {
  // Core Vault Operations (VaultTrait)
  DEPOSIT = "deposit",
  WITHDRAW = "withdraw",
  RESCUE = "rescue",
  PAUSE_STRATEGY = "pause_strategy",
  UNPAUSE_STRATEGY = "unpause_strategy",
  GET_ASSETS = "get_assets",
  FETCH_TOTAL_MANAGED_FUNDS = "fetch_total_managed_funds",
  GET_ASSET_AMOUNTS_PER_SHARES = "get_asset_amounts_per_shares",
  GET_FEES = "get_fees",
  REPORT = "report",

  // Admin Interface Methods (AdminInterfaceTrait)
  SET_FEE_RECEIVER = "set_fee_receiver",
  GET_FEE_RECEIVER = "get_fee_receiver",
  SET_MANAGER = "set_manager",
  GET_MANAGER = "get_manager",
  SET_EMERGENCY_MANAGER = "set_emergency_manager",
  GET_EMERGENCY_MANAGER = "get_emergency_manager",
  SET_REBALANCE_MANAGER = "set_rebalance_manager",
  GET_REBALANCE_MANAGER = "get_rebalance_manager",
  UPGRADE = "upgrade",

  // Vault Management Methods (VaultManagementTrait)
  REBALANCE = "rebalance",
  LOCK_FEES = "lock_fees",
  RELEASE_FEES = "release_fees",
  DISTRIBUTE_FEES = "distribute_fees",

  TOTAL_SUPPLY = "total_supply",
  BALANCE = "balance",
  NAME = "name",
  SYMBOL = "symbol",
}

export enum VaultInfoInvocationMethods {
  GET_ASSETS = VaultMethods.GET_ASSETS,
  FETCH_TOTAL_MANAGED_FUNDS = VaultMethods.FETCH_TOTAL_MANAGED_FUNDS,
  GET_FEES = VaultMethods.GET_FEES,
  GET_MANAGER = VaultMethods.GET_MANAGER,
  GET_EMERGENCY_MANAGER = VaultMethods.GET_EMERGENCY_MANAGER,
  GET_REBALANCE_MANAGER = VaultMethods.GET_REBALANCE_MANAGER,
  GET_FEE_RECEIVER = VaultMethods.GET_FEE_RECEIVER,
  NAME = VaultMethods.NAME,
  SYMBOL = VaultMethods.SYMBOL,
}

export enum VaultGetRoleMethods {
  GET_EMERGENCY_MANAGER = VaultMethods.GET_EMERGENCY_MANAGER,
  GET_REBALANCE_MANAGER = VaultMethods.GET_REBALANCE_MANAGER,
  GET_MANAGER = VaultMethods.GET_MANAGER,
  GET_FEE_RECEIVER = VaultMethods.GET_FEE_RECEIVER,
}

export enum VaultSetRoleMethods {
  SET_MANAGER = VaultMethods.SET_MANAGER,
  SET_EMERGENCY_MANAGER = VaultMethods.SET_EMERGENCY_MANAGER,
  SET_REBALANCE_MANAGER = VaultMethods.SET_REBALANCE_MANAGER,
  SET_FEE_RECEIVER = VaultMethods.SET_FEE_RECEIVER,
}

export interface VaultRoleResponse {
  function_called: VaultGetRoleMethods;
  address: string;
}

export enum VaultRoles {
  MANAGER = 'manager',
  EMERGENCY_MANAGER = 'emergency-manager',
  REBALANCE_MANAGER = 'rebalance-manager',
  FEE_RECEIVER = 'fee-receiver',
}
