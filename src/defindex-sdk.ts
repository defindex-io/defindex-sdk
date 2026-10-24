import { HttpClient } from './clients/http-client';
import {
  CreateVaultParams,
  CreateVaultDepositParams,
  CreateVaultAutoInvestParams,
  CreateVaultAutoInvestResponse,
  DepositParams,
  DiscoverVaultsResponse,
  DistributeFeesParams,
  FactoryAddressResponse,
  LockFeesParams,
  PauseStrategyParams,
  RebalanceParams,
  ReleaseFeesParams,
  RescueFromVaultParams,
  SendTransactionResponse,
  SetVaultRoleParams,
  SupportedNetworks,
  UnpauseStrategyParams,
  UpgradeWasmParams,
  VaultApyResponse,
  VaultBalanceResponse,
  VaultInfoResponse,
  VaultRoleResponse,
  VaultRoles,
  VaultTransactionResponse,
  WithdrawParams,
  WithdrawSharesParams,
  TransactionResponse,
} from './types';

/**
 * Configuration options for the DeFindex SDK
 */
export interface DefindexSDKConfig {
  apiKey?: string;
  /** Custom API base URL (defaults to 'https://api.defindex.io') */
  baseUrl?: string;
  /** Request timeout in milliseconds (defaults to 30000) */
  timeout?: number;
  /** Default network for all operations (can be overridden per method call) */
  defaultNetwork?: SupportedNetworks;
}

/**
 * DeFindex SDK - TypeScript client for DeFindex API
 *
 * @example
 * ```typescript
 * // Basic initialization with default network
 * const sdk = new DefindexSDK({
 *   baseUrl: 'https://api.defindex.io',
 *   defaultNetwork: SupportedNetworks.TESTNET
 * });
 *
 * // With API key authentication
 * const sdk = new DefindexSDK({
 *   apiKey: 'sk_your_api_key_here',
 *   baseUrl: 'https://api.defindex.io',
 *   defaultNetwork: SupportedNetworks.MAINNET
 * });
 *
 * // Now you can call methods without specifying network
 * const vaultInfo = await sdk.getVaultInfo('CVAULT...');
 *
 * // Or override for a specific call
 * const testnetInfo = await sdk.getVaultInfo('CVAULT...', SupportedNetworks.TESTNET);
 * ```
 */
export class DefindexSDK {
  private httpClient: HttpClient;
  private config: DefindexSDKConfig;
  private defaultNetwork?: SupportedNetworks;

  /**
   * Create a new DeFindex SDK instance
   * @param config - SDK configuration options
   */
  constructor(config: DefindexSDKConfig) {
    this.config = config;
    this.defaultNetwork = config.defaultNetwork;
    this.httpClient = new HttpClient(
      config.baseUrl || 'https://api.defindex.io',
      config.apiKey || '', // API key or empty string
      config.timeout || 30000
    );
  }

  /**
   * Get the network to use for a request
   * @param network - Optional network override
   * @returns The network to use (provided network or default)
   * @throws Error if no network is provided and no default is set
   */
  private getNetwork(network?: SupportedNetworks): SupportedNetworks {
    const resolvedNetwork = network ?? this.defaultNetwork;
    if (!resolvedNetwork) {
      throw new Error(
        'No network specified. Either provide a network parameter or set defaultNetwork in SDK config.'
      );
    }
    return resolvedNetwork;
  }

  /**
   * Get the current default network
   * @returns The default network or undefined if not set
   */
  public getDefaultNetwork(): SupportedNetworks | undefined {
    return this.defaultNetwork;
  }

  /**
   * Set the default network for all operations
   * @param network - The network to use as default
   */
  public setDefaultNetwork(network: SupportedNetworks): void {
    this.defaultNetwork = network;
  }

  //=======================================================================
  // System Operations
  //=======================================================================

  /**
   * Check API health status
   * @returns Health status information
   * @example
   * ```typescript
   * const health = await sdk.healthCheck();
   * if (health.status.reachable) {
   *   console.log('API is healthy');
   * }
   * ```
   */
  public async healthCheck(): Promise<any> {
    return this.httpClient.get<any>('/health');
  }

  //=======================================================================
  // Factory Operations
  //=======================================================================

  /**
   * Get the factory contract address for a specific network
   * @param network - Stellar network (optional, uses default if not specified)
   * @returns Factory contract address
   * @example
   * ```typescript
   * const factory = await sdk.getFactoryAddress();
   * console.log('Factory address:', factory.address);
   * ```
   */
  public async getFactoryAddress(network?: SupportedNetworks): Promise<FactoryAddressResponse> {
    const resolvedNetwork = this.getNetwork(network);
    return this.httpClient.get<FactoryAddressResponse>(`/factory/address?network=${resolvedNetwork}`);
  }

  /**
   * Create a new vault (requires Vault Manager role)
   * @param vaultConfig - Vault configuration including assets, fees, and roles
   * @param network - Stellar network (optional, uses default if not specified)
   * @returns Transaction XDR for vault creation
   * @example
   * ```typescript
   * const vaultConfig: CreateVaultParams = {
   *   roles: {
   *     manager: 'GMANAGER...',
   *     feeReceiver: 'GFEE...',
   *     emergencyManager: 'GEMERGENCY...',
   *     rebalanceManager: 'GREBALANCE...'
   *   },
   *   vaultFeeBps: 100, // 1%
   *   assets: [{ address: 'CASSET...', strategies: [...] }],
   *   name: 'My Vault',
   *   symbol: 'MVLT',
   *   upgradable: true,
   *   caller: 'GCALLER...'
   * };
   * const response = await sdk.createVault(vaultConfig);
   * ```
   */
  public async createVault(
    vaultConfig: CreateVaultParams,
    network?: SupportedNetworks,
  ): Promise<TransactionResponse> {
    const resolvedNetwork = this.getNetwork(network);
    return this.httpClient.post<TransactionResponse>(
      `/factory/create-vault?network=${resolvedNetwork}`,
      vaultConfig,
    );
  }

  /**
   * Create a new vault with initial deposit in a single transaction
   * @param vaultConfig - Vault configuration with initial deposit amounts
   * @param network - Stellar network (optional, uses default if not specified)
   * @returns Transaction XDR for vault creation and deposit
   * @example
   * ```typescript
   * const vaultConfig: CreateVaultDepositParams = {
   *   // ... vault config (same as CreateVaultParams)
   *   depositAmounts: [1000000, 2000000] // Initial deposit amounts
   * };
   * const response = await sdk.createVaultWithDeposit(vaultConfig);
   * ```
   */
  public async createVaultWithDeposit(
    vaultConfig: CreateVaultDepositParams,
    network?: SupportedNetworks,
  ): Promise<TransactionResponse> {
    const resolvedNetwork = this.getNetwork(network);
    return this.httpClient.post<TransactionResponse>(
      `/factory/create-vault-deposit?network=${resolvedNetwork}`,
      vaultConfig,
    );
  }

  /**
   * Create a new vault with auto-invest in a single atomic transaction
   *
   * This endpoint creates a batched transaction that:
   * 1. Creates the vault with initial deposit
   * 2. Invests funds in specified strategies (rebalance)
   * 3. Changes manager to the final address
   *
   * All operations are atomic - either all succeed or all fail.
   *
   * @param params - Auto-invest vault configuration with asset allocations and strategies
   * @param network - Stellar network (optional, uses default if not specified)
   * @returns Transaction XDR, predicted vault address, and warning about address prediction
   * @example
   * ```typescript
   * const params: CreateVaultAutoInvestParams = {
   *   caller: 'GCALLER...',
   *   roles: {
   *     emergencyManager: 'GEMERGENCY...',
   *     rebalanceManager: 'GREBALANCE...',
   *     feeReceiver: 'GFEE...',
   *     manager: 'GMANAGER...'
   *   },
   *   name: 'My Auto-Invest Vault',
   *   symbol: 'MAIV',
   *   vaultFee: 10, // 0.1% in basis points
   *   upgradable: true,
   *   assets: [{
   *     address: 'CASSET...',
   *     symbol: 'XLM',
   *     amount: 2000000000, // 200 XLM in stroops
   *     strategies: [
   *       { address: 'CSTRAT1...', name: 'hodl_strategy', amount: 1000000000 },
   *       { address: 'CSTRAT2...', name: 'yield_strategy', amount: 1000000000 }
   *     ]
   *   }]
   * };
   * const response = await sdk.createVaultAutoInvest(params);
   * console.log('Sign this XDR:', response.xdr);
   * console.log('Predicted vault address:', response.predictedVaultAddress);
   * ```
   */
  public async createVaultAutoInvest(
    params: CreateVaultAutoInvestParams,
    network?: SupportedNetworks,
  ): Promise<CreateVaultAutoInvestResponse> {
    const resolvedNetwork = this.getNetwork(network);
    return this.httpClient.post<CreateVaultAutoInvestResponse>(
      `/factory/create-vault-auto-invest?network=${resolvedNetwork}`,
      params,
    );
  }

  //=======================================================================
  // Vault Operations
  //=======================================================================

  /**
   * List the main DeFindex vaults on a network, with APY and managed funds
   * @param network - Stellar network (optional, uses default if not specified)
   * @returns Vault addresses with 30-day APY and total managed funds per asset; either is null when its read failed
   * @example
   * ```typescript
   * const { vaults } = await sdk.discoverVaults(SupportedNetworks.MAINNET);
   * vaults.forEach(v => console.log(v.address, v.apy));
   * ```
   */
  public async discoverVaults(network?: SupportedNetworks): Promise<DiscoverVaultsResponse> {
    const resolvedNetwork = this.getNetwork(network);
    return this.httpClient.get<DiscoverVaultsResponse>(`/vault/discover?network=${resolvedNetwork}`);
  }

  /**
   * Get comprehensive vault information
   * @param vaultAddress - The vault contract address
   * @param network - Stellar network (optional, uses default if not specified)
   * @returns Vault metadata, assets, strategies, and TVL information
   * @example
   * ```typescript
   * const vaultInfo = await sdk.getVaultInfo('CVAULT...');
   * console.log(`Vault: ${vaultInfo.name} (${vaultInfo.symbol})`);
   * console.log(`Total Assets: ${vaultInfo.totalAssets}`);
   * ```
   */
  public async getVaultInfo(
    vaultAddress: string,
    network?: SupportedNetworks,
  ): Promise<VaultInfoResponse> {
    const resolvedNetwork = this.getNetwork(network);
    return this.httpClient.get<VaultInfoResponse>(
      `/vault/${vaultAddress}?network=${resolvedNetwork}`,
    );
  }

  /**
   * Get user's vault balance and shares
   * @param vaultAddress - The vault contract address
   * @param userAddress - User's wallet address
   * @param network - Stellar network (optional, uses default if not specified)
   * @returns User's vault shares and underlying asset values
   * @example
   * ```typescript
   * const balance = await sdk.getVaultBalance('CVAULT...', 'GUSER...');
   * console.log(`Shares: ${balance.dfTokens}`);
   * console.log(`Underlying values: ${balance.underlyingBalance}`);
   * ```
   */
  public async getVaultBalance(
    vaultAddress: string,
    userAddress: string,
    network?: SupportedNetworks,
  ): Promise<VaultBalanceResponse> {
    const resolvedNetwork = this.getNetwork(network);
    return this.httpClient.get<VaultBalanceResponse>(
      `/vault/${vaultAddress}/balance?from=${userAddress}&network=${resolvedNetwork}`,
    );
  }

  /**
   * Get vault report with transaction details
   * @param vaultAddress - The vault contract address
   * @param network - Stellar network (optional, uses default if not specified)
   * @returns Vault report with transaction XDR and simulation response
   * @example
   * ```typescript
   * const report = await sdk.getReport('CVAULT...');
   * console.log(`Report XDR: ${report.xdr}`);
   * ```
   */
  public async getReport(
    vaultAddress: string,
    network?: SupportedNetworks,
  ): Promise<VaultTransactionResponse> {
    const resolvedNetwork = this.getNetwork(network);
    return this.httpClient.get<VaultTransactionResponse>(
      `/vault/${vaultAddress}/report?network=${resolvedNetwork}`,
    );
  }

  /**
   * Deposit assets into a vault
   * @param vaultAddress - The vault contract address
   * @param depositData - Deposit parameters including amounts and caller address
   * @param network - Stellar network (optional, uses default if not specified)
   * @returns Transaction XDR for signing and simulation response
   */
  public async depositToVault(
    vaultAddress: string,
    depositData: DepositParams,
    network?: SupportedNetworks,
  ): Promise<VaultTransactionResponse> {
    const resolvedNetwork = this.getNetwork(network);
    return this.httpClient.post<VaultTransactionResponse>(
      `/vault/${vaultAddress}/deposit?network=${resolvedNetwork}`,
      depositData,
    );
  }

  /**
   * Withdraw specific asset amounts from vault
   * @param vaultAddress - The vault contract address
   * @param withdrawData - Withdrawal parameters including amounts and caller
   * @param network - Stellar network (optional, uses default if not specified)
   * @returns Transaction XDR for signing and simulation response
   * @example
   * ```typescript
   * const withdrawData: WithdrawParams = {
   *   amounts: [500000, 1000000],
   *   caller: 'GUSER...',
   *   slippageBps: 100 // 1% slippage tolerance
   * };
   * const response = await sdk.withdrawFromVault('CVAULT...', withdrawData);
   * ```
   */
  public async withdrawFromVault(
    vaultAddress: string,
    withdrawData: WithdrawParams,
    network?: SupportedNetworks,
  ): Promise<VaultTransactionResponse> {
    const resolvedNetwork = this.getNetwork(network);
    return this.httpClient.post<VaultTransactionResponse>(
      `/vault/${vaultAddress}/withdraw?network=${resolvedNetwork}`,
      withdrawData,
    );
  }

  /**
   * Withdraw vault shares for underlying assets
   * @param vaultAddress - The vault contract address
   * @param shareData - Share withdrawal parameters including share amount and caller
   * @param network - Stellar network (optional, uses default if not specified)
   * @returns Transaction XDR for signing and simulation response
   */
  public async withdrawShares(
    vaultAddress: string,
    shareData: WithdrawSharesParams,
    network?: SupportedNetworks,
  ): Promise<VaultTransactionResponse> {
    const resolvedNetwork = this.getNetwork(network);
    return this.httpClient.post<VaultTransactionResponse>(
      `/vault/${vaultAddress}/withdraw-shares?network=${resolvedNetwork}`,
      shareData,
    );
  }

  /**
   * Get vault's Annual Percentage Yield (APY)
   * @param vaultAddress - The vault contract address
   * @param network - Stellar network (optional, uses default if not specified)
   * @returns APY information including percentage and calculation period
   * @example
   * ```typescript
   * const apy = await sdk.getVaultAPY('CVAULT...');
   * console.log(`APY: ${apy.apyPercent}% (calculated over ${apy.period})`);
   * ```
   */
  public async getVaultAPY(
    vaultAddress: string,
    network?: SupportedNetworks,
  ): Promise<VaultApyResponse> {
    const resolvedNetwork = this.getNetwork(network);
    return this.httpClient.get<VaultApyResponse>(
      `/vault/${vaultAddress}/apy?network=${resolvedNetwork}`,
    );
  }

  //=======================================================================
  // Vault Management Operations
  //=======================================================================

  /**
   * Rebalance vault strategies (Rebalance Manager role required)
   * @param vaultAddress - The vault contract address
   * @param rebalanceData - Rebalance parameters including investment instructions
   * @param network - Stellar network (optional, uses default if not specified)
   * @returns Transaction XDR for Rebalance Manager signing
   * @example
   * ```typescript
   * const rebalanceData: RebalanceParams = {
   *   caller: 'GREBALANCE_MANAGER...',
   *   instructions: [
   *     { type: 'Unwind', strategy_address: 'CSTRATEGY1...', amount: 500000 },
   *     { type: 'Invest', strategy_address: 'CSTRATEGY2...', amount: 1000000 },
   *     {
   *       type: 'SwapExactIn',
   *       token_in: 'GTOKEN1...',
   *       token_out: 'GTOKEN2...',
   *       amount: 250000,
   *       slippageToleranceBps: 100
   *     }
   *   ]
   * };
   * const response = await sdk.rebalanceVault('CVAULT...', rebalanceData);
   * ```
   */
  public async rebalanceVault(
    vaultAddress: string,
    rebalanceData: RebalanceParams,
    network?: SupportedNetworks,
  ): Promise<VaultTransactionResponse> {
    const resolvedNetwork = this.getNetwork(network);
    return this.httpClient.post<VaultTransactionResponse>(
      `/vault/${vaultAddress}/rebalance?network=${resolvedNetwork}`,
      rebalanceData,
    );
  }

  /**
   * Emergency rescue assets from strategy (Emergency Manager role required)
   * @param vaultAddress - The vault contract address
   * @param rescueData - Rescue parameters including strategy address and caller
   * @param network - Stellar network (optional, uses default if not specified)
   * @returns Transaction XDR for Emergency Manager signing and rescued assets info
   * @example
   * ```typescript
   * const rescueData: RescueFromVaultParams = {
   *   strategy_address: 'CSTRATEGY...',
   *   caller: 'GEMERGENCY_MANAGER...'
   * };
   * const response = await sdk.emergencyRescue('CVAULT...', rescueData);
   * ```
   */
  public async emergencyRescue(
    vaultAddress: string,
    rescueData: RescueFromVaultParams,
    network?: SupportedNetworks,
  ): Promise<VaultTransactionResponse> {
    const resolvedNetwork = this.getNetwork(network);
    return this.httpClient.post<VaultTransactionResponse>(
      `/vault/${vaultAddress}/rescue?network=${resolvedNetwork}`,
      rescueData,
    );
  }

  /**
   * Pause a specific strategy (Strategy Manager role required)
   * @param vaultAddress - The vault contract address
   * @param strategyData - Strategy pause parameters
   * @param network - Stellar network (optional, uses default if not specified)
   * @returns Transaction XDR for Strategy Manager signing
   */
  public async pauseStrategy(
    vaultAddress: string,
    strategyData: PauseStrategyParams,
    network?: SupportedNetworks,
  ): Promise<VaultTransactionResponse> {
    const resolvedNetwork = this.getNetwork(network);
    return this.httpClient.post<VaultTransactionResponse>(
      `/vault/${vaultAddress}/pause-strategy?network=${resolvedNetwork}`,
      strategyData,
    );
  }

  /**
   * Unpause a specific strategy (Strategy Manager role required)
   * @param vaultAddress - The vault contract address
   * @param strategyData - Strategy unpause parameters
   * @param network - Stellar network (optional, uses default if not specified)
   * @returns Transaction XDR for Strategy Manager signing
   */
  public async unpauseStrategy(
    vaultAddress: string,
    strategyData: UnpauseStrategyParams,
    network?: SupportedNetworks,
  ): Promise<VaultTransactionResponse> {
    const resolvedNetwork = this.getNetwork(network);
    return this.httpClient.post<VaultTransactionResponse>(
      `/vault/${vaultAddress}/unpause-strategy?network=${resolvedNetwork}`,
      strategyData,
    );
  }

  //=======================================================================
  // Role Operations
  //=======================================================================

  /**
   * Get a specific vault role address
   * @param vaultAddress - The vault contract address
   * @param roleToGet - The role to retrieve (manager, emergency_manager, rebalance_manager, fee_receiver)
   * @param network - Stellar network (optional, uses default if not specified)
   * @returns Role information with address
   * @example
   * ```typescript
   * const role = await sdk.getVaultRole('CVAULT...', VaultRoles.MANAGER);
   * console.log(`Manager address: ${role.address}`);
   * ```
   */
  public async getVaultRole(
    vaultAddress: string,
    roleToGet: VaultRoles,
    network?: SupportedNetworks,
  ): Promise<VaultRoleResponse> {
    const resolvedNetwork = this.getNetwork(network);
    return this.httpClient.get<VaultRoleResponse>(
      `/vault/${vaultAddress}/get/${roleToGet}?network=${resolvedNetwork}`
    );
  }

  /**
   * Set a vault role to a new address (Manager role required)
   * @param vaultAddress - The vault contract address
   * @param roleToSet - The role to set
   * @param roleData - Role assignment parameters including new address and caller
   * @param network - Stellar network (optional, uses default if not specified)
   * @returns Transaction XDR for Manager signing
   * @example
   * ```typescript
   * const roleData: SetVaultRoleParams = {
   *   caller: 'GMANAGER...',
   *   new_address: 'GNEW_MANAGER...'
   * };
   * const response = await sdk.setVaultRole('CVAULT...', VaultRoles.MANAGER, roleData);
   * ```
   */
  public async setVaultRole(
    vaultAddress: string,
    roleToSet: VaultRoles,
    roleData: SetVaultRoleParams,
    network?: SupportedNetworks,
  ): Promise<VaultTransactionResponse> {
    const resolvedNetwork = this.getNetwork(network);
    return this.httpClient.post<VaultTransactionResponse>(
      `/vault/${vaultAddress}/set/${roleToSet}?network=${resolvedNetwork}`,
      roleData,
    );
  }

  //=======================================================================
  // Vault Management Operations
  //=======================================================================

  /**
   * Lock vault fees and optionally update fee rate (Manager role required)
   * @param vaultAddress - The vault contract address
   * @param lockData - Lock fees parameters including optional new fee rate
   * @param network - Stellar network (optional, uses default if not specified)
   * @returns Transaction XDR for Manager signing
   * @example
   * ```typescript
   * const lockData: LockFeesParams = {
   *   caller: 'GMANAGER...',
   *   new_fee_bps: 150 // Optional: new fee rate in basis points (1.5%)
   * };
   * const response = await sdk.lockVaultFees('CVAULT...', lockData);
   * ```
   */
  public async lockVaultFees(
    vaultAddress: string,
    lockData: LockFeesParams,
    network?: SupportedNetworks,
  ): Promise<VaultTransactionResponse> {
    const resolvedNetwork = this.getNetwork(network);
    return this.httpClient.post<VaultTransactionResponse>(
      `/vault/${vaultAddress}/lock-fees?network=${resolvedNetwork}`,
      lockData,
    );
  }

  /**
   * Release fees from a specific strategy (Manager role required)
   * @param vaultAddress - The vault contract address
   * @param releaseData - Release fees parameters including strategy address and amount
   * @param network - Stellar network (optional, uses default if not specified)
   * @returns Transaction XDR for Manager signing
   * @example
   * ```typescript
   * const releaseData: ReleaseFeesParams = {
   *   caller: 'GMANAGER...',
   *   strategy_address: 'CSTRATEGY...',
   *   amount: 100000
   * };
   * const response = await sdk.releaseVaultFees('CVAULT...', releaseData);
   * ```
   */
  public async releaseVaultFees(
    vaultAddress: string,
    releaseData: ReleaseFeesParams,
    network?: SupportedNetworks,
  ): Promise<VaultTransactionResponse> {
    const resolvedNetwork = this.getNetwork(network);
    return this.httpClient.post<VaultTransactionResponse>(
      `/vault/${vaultAddress}/release-fees?network=${resolvedNetwork}`,
      releaseData,
    );
  }

  /**
   * Distribute accumulated vault fees to fee receiver (Manager role required)
   * @param vaultAddress - The vault contract address
   * @param distributeData - Distribution parameters including caller
   * @param network - Stellar network (optional, uses default if not specified)
   * @returns Transaction XDR for Manager signing
   * @example
   * ```typescript
   * const distributeData: DistributeFeesParams = {
   *   caller: 'GMANAGER...'
   * };
   * const response = await sdk.distributeVaultFees('CVAULT...', distributeData);
   * ```
   */
  public async distributeVaultFees(
    vaultAddress: string,
    distributeData: DistributeFeesParams,
    network?: SupportedNetworks,
  ): Promise<VaultTransactionResponse> {
    const resolvedNetwork = this.getNetwork(network);
    return this.httpClient.post<VaultTransactionResponse>(
      `/vault/${vaultAddress}/distribute-fees?network=${resolvedNetwork}`,
      distributeData,
    );
  }

  /**
   * Upgrade vault WASM contract (Manager role required)
   * @param vaultAddress - The vault contract address
   * @param newWasmHash - Upgrade parameters including new WASM hash and caller
   * @param network - Stellar network (optional, uses default if not specified)
   * @returns Transaction XDR for Manager signing
   * @example
   * ```typescript
   * const upgradeData: UpgradeWasmParams = {
   *   caller: 'GMANAGER...',
   *   new_wasm_hash: 'abcd1234...' // New WASM hash to upgrade to
   * };
   * const response = await sdk.upgradeVaultWasm('CVAULT...', upgradeData);
   * ```
   */
  public async upgradeVaultWasm(
    vaultAddress: string,
    newWasmHash: UpgradeWasmParams,
    network?: SupportedNetworks,
  ): Promise<VaultTransactionResponse> {
    const resolvedNetwork = this.getNetwork(network);
    return this.httpClient.post<VaultTransactionResponse>(
      `/vault/${vaultAddress}/upgrade?network=${resolvedNetwork}`,
      newWasmHash,
    );
  }


  //=======================================================================
  // Transaction Operations
  //=======================================================================

  /**
   * Submit a signed transaction to the Stellar blockchain
   * @param xdr - Base64 encoded signed transaction XDR
   * @param network - Stellar network (optional, uses default if not specified)
   * @returns Transaction response with hash and status
   */
  public async sendTransaction(
    xdr: string,
    network?: SupportedNetworks,
  ): Promise<SendTransactionResponse> {
    const resolvedNetwork = this.getNetwork(network);
    const payload = { xdr };
    return this.httpClient.post<SendTransactionResponse>(
      `/send?network=${resolvedNetwork}`,
      payload,
    );
  }
}
