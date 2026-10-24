import { DefindexSDK } from '../src';
import {
  CreateVaultParams,
  CreateVaultDepositParams,
  DepositParams,
  PauseStrategyParams,
  RescueFromVaultParams,
  SupportedNetworks,
  UnpauseStrategyParams,
  WithdrawParams,
  WithdrawSharesParams,
  RebalanceParams,
  VaultRoles,
  SetVaultRoleParams,
  LockFeesParams,
  ReleaseFeesParams,
  DistributeFeesParams,
  UpgradeWasmParams,
} from '../src/types';

// Mock axios to avoid actual HTTP calls
jest.mock('axios', () => ({
  create: jest.fn(() => ({
    get: jest.fn(),
    post: jest.fn(),
    defaults: { headers: { common: {} } },
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
  })),
}));

// Mock HttpClient
jest.mock('../src/clients/http-client', () => ({
  HttpClient: jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    post: jest.fn(),
    setAuthorizationHeader: jest.fn(),
    setApiKey: jest.fn(),
  })),
}));

describe('DefindexSDK - Unit Tests', () => {
  let sdk: DefindexSDK;
  let mockHttpClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('SDK Configuration', () => {
    it('should initialize with default config', () => {
      const config = {};
      sdk = new DefindexSDK(config);
      expect(sdk).toBeDefined();
      // The httpClient gets initialized with defaults
      expect((sdk as any).httpClient).toBeDefined();
    });

    it('should initialize with custom config', () => {
      const customConfig = {
        baseUrl: 'https://custom.api.com',
        apiKey: 'test-api-key',
        timeout: 60000,
        defaultNetwork: SupportedNetworks.TESTNET
      };
      sdk = new DefindexSDK(customConfig);
      expect((sdk as any).config.baseUrl).toBe(customConfig.baseUrl);
      expect((sdk as any).config.apiKey).toBe(customConfig.apiKey);
      expect((sdk as any).config.timeout).toBe(customConfig.timeout);
    });

    it('should handle empty api key gracefully', () => {
      sdk = new DefindexSDK({ apiKey: '' });
      expect((sdk as any).config.apiKey).toBe('');
    });
  });

  describe('System Operations', () => {
    beforeEach(() => {
      sdk = new DefindexSDK({ baseUrl: 'https://api.defindex.io' });
      mockHttpClient = (sdk as any).httpClient;
    });

    it('should perform a health check successfully', async () => {
      const mockResponse = { status: { reachable: true }, timestamp: Date.now() };
      mockHttpClient.get.mockResolvedValue(mockResponse);

      const result = await sdk.healthCheck();

      expect(result).toEqual(mockResponse);
      expect(result.status.reachable).toBe(true);
      expect(mockHttpClient.get).toHaveBeenCalledWith('/health');
      expect(mockHttpClient.get).toHaveBeenCalledTimes(1);
    });

    it('should handle health check errors', async () => {
      const error = new Error('Network error');
      mockHttpClient.get.mockRejectedValue(error);

      await expect(sdk.healthCheck()).rejects.toThrow('Network error');
      expect(mockHttpClient.get).toHaveBeenCalledWith('/health');
    });
  });

  describe('Factory Operations', () => {
    beforeEach(() => {
      sdk = new DefindexSDK({ baseUrl: 'https://api.defindex.io', defaultNetwork: SupportedNetworks.TESTNET, });
      mockHttpClient = (sdk as any).httpClient;
    });

    it('should get factory address for testnet', async () => {
      const mockResponse = {
        address: 'CCJDRCK7VBZV6KEJ433F2KXNELEGAAXYMQWFG6JGLVYATJ4SDEYLRWMD',
        network: 'testnet'
      };
      mockHttpClient.get.mockResolvedValue(mockResponse);

      const result = await sdk.getFactoryAddress(SupportedNetworks.TESTNET);

      expect(result).toEqual(mockResponse);
      expect(result.address).toMatch(/^C[A-Z0-9]{55}$/); // Valid contract address format
      expect(mockHttpClient.get).toHaveBeenCalledWith('/factory/address?network=testnet');
    });

    it('should get factory address for mainnet', async () => {
      const mockResponse = {
        address: 'CDFACTORY123456789012345678901234567890123456789012345678',
        network: 'mainnet'
      };
      mockHttpClient.get.mockResolvedValue(mockResponse);

      const result = await sdk.getFactoryAddress(SupportedNetworks.MAINNET);

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.get).toHaveBeenCalledWith('/factory/address?network=mainnet');
    });

    it('should handle factory address not found error', async () => {
      const error = new Error('Factory not found');
      mockHttpClient.get.mockRejectedValue(error);

      await expect(sdk.getFactoryAddress(SupportedNetworks.TESTNET)).rejects.toThrow('Factory not found');
    });

    it('should prepare a transaction to create a vault with complete configuration', async () => {
      const vaultConfig: CreateVaultParams = {
        roles: {
          manager: 'GMANAGER1234567890123456789012345678901234567890123456',
          feeReceiver: 'GFEE12345678901234567890123456789012345678901234567890',
          emergencyManager: 'GEMERGENCY123456789012345678901234567890123456789012',
          rebalanceManager: 'GREBALANCE123456789012345678901234567890123456789012'
        },
        vaultFeeBps: 100,
        assets: [{
          address: 'CASSET1234567890123456789012345678901234567890123456',
          strategies: [{
            address: 'CSTRATEGY123456789012345678901234567890123456789012',
            name: 'Test Strategy',
            paused: false
          }]
        }],
        name: 'Test Vault',
        symbol: 'TVT',
        upgradable: true,
        caller: 'GCALLER123456789012345678901234567890123456789012345'
      };
      const mockResponse = {
        xdr: 'AAAAAgAAAAC7VYzjqMryr...',
        simulationResponse: 'SUCCESS'
      };
      mockHttpClient.post.mockResolvedValue(mockResponse);

      const result = await sdk.createVault(vaultConfig, SupportedNetworks.TESTNET);

      expect(result).toEqual(mockResponse);
      expect(result.xdr).toBeTruthy();
      expect(mockHttpClient.post).toHaveBeenCalledWith('/factory/create-vault?network=testnet', vaultConfig);
    });

    it('should validate vault configuration parameters', async () => {
      const invalidVaultConfig = {
        roles: {
          manager: 'invalid_address',
          feeReceiver: '',
          emergencyManager: '',
          rebalanceManager: ''
        },
        vaultFeeBps: -1, // Invalid negative fee
        assets: [],
        name: '',
        symbol: '',
        upgradable: true,
        caller: 'GCALLER123456789012345678901234567890123456789012345'
      } as CreateVaultParams;

      const mockError = new Error('Invalid vault configuration');
      mockHttpClient.post.mockRejectedValue(mockError);

      await expect(sdk.createVault(invalidVaultConfig, SupportedNetworks.TESTNET))
        .rejects.toThrow('Invalid vault configuration');
    });

    it('should prepare a create a vault transaction with initial deposit', async () => {
      const vaultConfig: CreateVaultDepositParams = {
        roles: {
          manager: 'GMANAGER1234567890123456789012345678901234567890123456',
          feeReceiver: 'GFEE12345678901234567890123456789012345678901234567890',
          emergencyManager: '',
          rebalanceManager: ''
        },
        vaultFeeBps: 100,
        assets: [{
          address: 'CASSET1234567890123456789012345678901234567890123456',
          strategies: []
        }],
        name: 'Test Vault',
        symbol: 'TVT',
        upgradable: true,
        caller: 'GCALLER123456789012345678901234567890123456789012345',
        depositAmounts: [1000000, 2000000] // 1 and 2 tokens with 6 decimals
      };
      const mockResponse = {
        xdr: 'AAAAAgAAAAC7VYzjqMryr...',
        simulationResponse: 'SUCCESS'
      };
      mockHttpClient.post.mockResolvedValue(mockResponse);

      const result = await sdk.createVaultWithDeposit(vaultConfig, SupportedNetworks.TESTNET);

      expect(result).toEqual(mockResponse);
      expect(result.xdr).toBeTruthy();
      expect(result.simulationResponse).toBe('SUCCESS');
      expect(mockHttpClient.post).toHaveBeenCalledWith('/factory/create-vault-deposit?network=testnet', vaultConfig);
    });
  });

  describe('Vault Operations', () => {
    const vaultAddress = 'CVAULT123456789012345678901234567890123456789012345';

    beforeEach(() => {
      sdk = new DefindexSDK({ baseUrl: 'https://api.defindex.io' });
      mockHttpClient = (sdk as any).httpClient;
    });

    it('should get vault info', async () => {
      const mockResponse = {
        name: 'Test Vault',
        symbol: 'TVT',
        roles: {
          manager: 'GMANAGER1234567890123456789012345678901234567890123456',
          emergencyManager: 'GEMERGENCY123456789012345678901234567890123456789012',
          rebalanceManager: 'GREBALANCE123456789012345678901234567890123456789012',
          feeReceiver: 'GFEE12345678901234567890123456789012345678901234567890'
        },
        assets: [{
          address: 'CASSET1234567890123456789012345678901234567890123456',
          name: 'Test Asset',
          symbol: 'TST',
          strategies: [{
            address: 'CSTRATEGY123456789012345678901234567890123456789012',
            name: 'Test Strategy',
            paused: false
          }]
        }],
        totalManagedFunds: [{
          asset: 'CASSET1234567890123456789012345678901234567890123456',
          idle_amount: '1000000',
          invested_amount: '2000000',
          strategy_allocations: [{
            amount: '2000000',
            paused: false,
            strategy_address: 'CSTRATEGY123456789012345678901234567890123456789012'
          }],
          total_amount: '3000000'
        }],
        feesBps: { vaultFee: 100, defindexFee: 50 },
        apy: 12.5
      };
      mockHttpClient.get.mockResolvedValue(mockResponse);

      const result = await sdk.getVaultInfo(vaultAddress, SupportedNetworks.TESTNET);

      expect(result).toEqual(mockResponse);
      expect(result.name).toBe('Test Vault');
      expect(result.roles.manager).toMatch(/^G[A-Z0-9]+$/); // Valid Stellar address format
      expect(result.feesBps.vaultFee).toBeGreaterThanOrEqual(0);
      expect(result.apy).toBeGreaterThanOrEqual(0);
      expect(mockHttpClient.get).toHaveBeenCalledWith(`/vault/${vaultAddress}?network=testnet`);
    });

    it('should discover vaults', async () => {
      const mockResponse = {
        totalVaults: 1,
        vaults: [{ address: vaultAddress, apy: 5.93, totalManagedFunds: [{ asset: 'CASSET', total_amount: '100' }] }],
      };
      mockHttpClient.get.mockResolvedValue(mockResponse);

      const result = await sdk.discoverVaults(SupportedNetworks.MAINNET);

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.get).toHaveBeenCalledWith('/vault/discover?network=mainnet');
    });

    it('should handle vault not found error', async () => {
      const error = new Error('Vault not found');
      mockHttpClient.get.mockRejectedValue(error);

      await expect(sdk.getVaultInfo('INVALID_VAULT', SupportedNetworks.TESTNET))
        .rejects.toThrow('Vault not found');
    });

    it('should get vault balance for a user with valid data', async () => {
        const userAddress = 'GUSER1234567890123456789012345678901234567890123456789';
        const mockResponse = {
          dfTokens: 1000000, // 1 vault token (6 decimals)
          underlyingBalance: [500000, 750000] // Underlying asset balances
        };
        mockHttpClient.get.mockResolvedValue(mockResponse);

        const result = await sdk.getVaultBalance(vaultAddress, userAddress, SupportedNetworks.TESTNET);

        expect(result).toEqual(mockResponse);
        expect(result.dfTokens).toBeGreaterThanOrEqual(0);
        expect(Array.isArray(result.underlyingBalance)).toBe(true);
        expect(result.underlyingBalance.length).toBeGreaterThan(0);
        expect(mockHttpClient.get).toHaveBeenCalledWith(`/vault/${vaultAddress}/balance?from=${userAddress}&network=testnet`);
      });

    it('should handle zero balance gracefully', async () => {
      const userAddress = 'GNEWUSER123456789012345678901234567890123456789012';
      const mockResponse = { dfTokens: 0, underlyingBalance: [0, 0] };
      mockHttpClient.get.mockResolvedValue(mockResponse);

      const result = await sdk.getVaultBalance(vaultAddress, userAddress, SupportedNetworks.TESTNET);

      expect(result.dfTokens).toBe(0);
      expect(result.underlyingBalance.every(balance => balance === 0)).toBe(true);
    });

    it('should prepare a transaction to deposit to vault with valid parameters', async () => {
      const depositData: DepositParams = {
        amounts: [10000000, 20000000], // 1 and 2 tokens (7 decimals)
        caller: 'GUSER1234567890123456789012345678901234567890123456789',
        invest: true,
        slippageBps: 100 // 1% slippage tolerance
      };
      const mockResponse = {
        xdr: 'AAAAAgAAAAC7VYzjqMryr...',
        simulationResponse: 'SUCCESS',
        functionName: 'deposit',
        params: []
      };
      mockHttpClient.post.mockResolvedValue(mockResponse);

      const result = await sdk.depositToVault(vaultAddress, depositData, SupportedNetworks.TESTNET);

      expect(result).toEqual(mockResponse);
      expect(result.xdr).toBeTruthy();
      expect(result.simulationResponse).toBe('SUCCESS');
      expect(depositData.amounts.every(amount => amount > 0)).toBe(true);
      expect(mockHttpClient.post).toHaveBeenCalledWith(`/vault/${vaultAddress}/deposit?network=testnet`, depositData);
    });

    it('should validate deposit parameters', async () => {
      const invalidDepositData = {
        amounts: [-1000000], // Negative amount should fail
        caller: 'invalid_address',
        invest: true
      } as DepositParams;

      const mockError = new Error('Invalid deposit amount');
      mockHttpClient.post.mockRejectedValue(mockError);

      await expect(sdk.depositToVault(vaultAddress, invalidDepositData, SupportedNetworks.TESTNET))
        .rejects.toThrow('Invalid deposit amount');
    });

    it('should prepare a transaction to withdraw from vault', async () => {
      const withdrawData: WithdrawParams = { amounts: [50], caller: 'user_addr' };
      const mockResponse = { xdr: 'withdraw_xdr' };
      mockHttpClient.post.mockResolvedValue(mockResponse);

      const result = await sdk.withdrawFromVault(vaultAddress, withdrawData, SupportedNetworks.TESTNET);

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.post).toHaveBeenCalledWith(`/vault/${vaultAddress}/withdraw?network=testnet`, withdrawData);
    });

    it('should prepare a transaction to withdraw shares from vault', async () => {
      const shareData: WithdrawSharesParams = { shares: 100, caller: 'user_addr' };
      const mockResponse = { xdr: 'withdraw_shares_xdr' };
      mockHttpClient.post.mockResolvedValue(mockResponse);

      const result = await sdk.withdrawShares(vaultAddress, shareData, SupportedNetworks.TESTNET);

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.post).toHaveBeenCalledWith(`/vault/${vaultAddress}/withdraw-shares?network=testnet`, shareData);
    });

    it('should get vault APY', async () => {
      const mockResponse = { apy: 12.5 };
      mockHttpClient.get.mockResolvedValue(mockResponse);

      const result = await sdk.getVaultAPY(vaultAddress, SupportedNetworks.TESTNET);

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.get).toHaveBeenCalledWith(`/vault/${vaultAddress}/apy?network=testnet`);
    });

    it('should get vault report', async () => {
      const mockResponse = { xdr: 'report_xdr', simulationResponse: 'simulation_data', functionName: 'report', params: [] };
      mockHttpClient.get.mockResolvedValue(mockResponse);

      const result = await sdk.getReport(vaultAddress, SupportedNetworks.TESTNET);

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.get).toHaveBeenCalledWith(`/vault/${vaultAddress}/report?network=testnet`);
    });

  });

  describe('Vault Management', () => {
    const vaultAddress = 'VAULT_ADDRESS';

    beforeEach(() => {
      sdk = new DefindexSDK({ baseUrl: 'https://api.defindex.io' });
      mockHttpClient = (sdk as any).httpClient;
    });

    it('should prepare a transaction to perform an emergency rescue', async () => {
      const rescueData: RescueFromVaultParams = { strategy_address: 'strategy_addr', caller: 'manager_addr' };
      const mockResponse = { xdr: 'rescue_xdr' };
      mockHttpClient.post.mockResolvedValue(mockResponse);

      const result = await sdk.emergencyRescue(vaultAddress, rescueData, SupportedNetworks.TESTNET);

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.post).toHaveBeenCalledWith(`/vault/${vaultAddress}/rescue?network=testnet`, rescueData);
    });

    it('should prepare a transaction to pause a strategy', async () => {
      const pauseData: PauseStrategyParams = { strategy_address: 'strategy_addr', caller: 'manager_addr' };
      const mockResponse = { status: 'paused' };
      mockHttpClient.post.mockResolvedValue(mockResponse);

      const result = await sdk.pauseStrategy(vaultAddress, pauseData, SupportedNetworks.TESTNET);

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.post).toHaveBeenCalledWith(`/vault/${vaultAddress}/pause-strategy?network=testnet`, pauseData);
    });

    it('should prepare a transaction to unpause a strategy', async () => {
      const unpauseData: UnpauseStrategyParams = { strategy_address: 'strategy_addr', caller: 'manager_addr' };
      const mockResponse = { status: 'active' };
      mockHttpClient.post.mockResolvedValue(mockResponse);

      const result = await sdk.unpauseStrategy(vaultAddress, unpauseData, SupportedNetworks.TESTNET);

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.post).toHaveBeenCalledWith(`/vault/${vaultAddress}/unpause-strategy?network=testnet`, unpauseData);
    });

    it('should prepare a transaction to rebalance a vault', async () => {
      const rebalanceData: RebalanceParams = {
        caller: 'rebalance_manager_addr',
        instructions: [
          { type: 'Unwind', strategy_address: 'strategy1_addr', amount: 5000000 },
          { type: 'Invest', strategy_address: 'strategy2_addr', amount: 10000000 }
        ]
      };
      const mockResponse = { xdr: 'rebalance_xdr' };
      mockHttpClient.post.mockResolvedValue(mockResponse);

      const result = await sdk.rebalanceVault(vaultAddress, rebalanceData, SupportedNetworks.TESTNET);

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.post).toHaveBeenCalledWith(`/vault/${vaultAddress}/rebalance?network=testnet`, rebalanceData);
    });
  });

  describe('Role Operations', () => {
    const vaultAddress = 'VAULT_ADDRESS';

    beforeEach(() => {
      sdk = new DefindexSDK({ baseUrl: 'https://api.defindex.io' });
      mockHttpClient = (sdk as any).httpClient;
    });

    it('should get vault role', async () => {
      const mockResponse = { function_called: 'get_manager', address: 'manager_address' };
      mockHttpClient.get.mockResolvedValue(mockResponse);

      const result = await sdk.getVaultRole(vaultAddress, VaultRoles.MANAGER, SupportedNetworks.TESTNET);

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.get).toHaveBeenCalledWith(`/vault/${vaultAddress}/get/${VaultRoles.MANAGER}?network=testnet`);
    });

    it('should prepare a transaction to set vault role', async () => {
      const roleData: SetVaultRoleParams = { caller: 'manager_addr', new_address: 'new_manager_addr' };
      const mockResponse = { xdr: 'set_role_xdr' };
      mockHttpClient.post.mockResolvedValue(mockResponse);

      const result = await sdk.setVaultRole(vaultAddress, VaultRoles.MANAGER, roleData, SupportedNetworks.TESTNET);

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.post).toHaveBeenCalledWith(`/vault/${vaultAddress}/set/${VaultRoles.MANAGER}?network=testnet`, roleData);
    });
  });

  describe('Fee Management Operations', () => {
    const vaultAddress = 'VAULT_ADDRESS';

    beforeEach(() => {
      sdk = new DefindexSDK({ baseUrl: 'https://api.defindex.io' });
      mockHttpClient = (sdk as any).httpClient;
    });

    it('should prepare a transaction to lock vault fees', async () => {
      const lockData: LockFeesParams = { caller: 'manager_addr', new_fee_bps: 150 };
      const mockResponse = { xdr: 'lock_fees_xdr' };
      mockHttpClient.post.mockResolvedValue(mockResponse);

      const result = await sdk.lockVaultFees(vaultAddress, lockData, SupportedNetworks.TESTNET);

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.post).toHaveBeenCalledWith(`/vault/${vaultAddress}/lock-fees?network=testnet`, lockData);
    });

    it('should prepare a transaction to release vault fees', async () => {
      const releaseData: ReleaseFeesParams = { caller: 'manager_addr', strategy_address: 'strategy_addr', amount: 100000 };
      const mockResponse = { xdr: 'release_fees_xdr' };
      mockHttpClient.post.mockResolvedValue(mockResponse);

      const result = await sdk.releaseVaultFees(vaultAddress, releaseData, SupportedNetworks.TESTNET);

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.post).toHaveBeenCalledWith(`/vault/${vaultAddress}/release-fees?network=testnet`, releaseData);
    });

    it('should prepare a transaction to distribute vault fees', async () => {
      const distributeData: DistributeFeesParams = { caller: 'manager_addr' };
      const mockResponse = { xdr: 'distribute_fees_xdr' };
      mockHttpClient.post.mockResolvedValue(mockResponse);

      const result = await sdk.distributeVaultFees(vaultAddress, distributeData, SupportedNetworks.TESTNET);

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.post).toHaveBeenCalledWith(`/vault/${vaultAddress}/distribute-fees?network=testnet`, distributeData);
    });
  });

  describe('Vault Upgrade Operations', () => {
    const vaultAddress = 'VAULT_ADDRESS';

    beforeEach(() => {
      sdk = new DefindexSDK({ baseUrl: 'https://api.defindex.io' });
      mockHttpClient = (sdk as any).httpClient;
    });

    it('should prepare a transaction to upgrade vault WASM', async () => {
      const upgradeData: UpgradeWasmParams = { caller: 'manager_addr', new_wasm_hash: 'abcd1234567890abcdef' };
      const mockResponse = { xdr: 'upgrade_wasm_xdr' };
      mockHttpClient.post.mockResolvedValue(mockResponse);

      const result = await sdk.upgradeVaultWasm(vaultAddress, upgradeData, SupportedNetworks.TESTNET);

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.post).toHaveBeenCalledWith(`/vault/${vaultAddress}/upgrade?network=testnet`, upgradeData);
    });
  });

  describe('Transaction Operations', () => {
    beforeEach(() => {
      sdk = new DefindexSDK({ baseUrl: 'https://api.defindex.io' });
      mockHttpClient = (sdk as any).httpClient;
    });

    it('should send a transaction', async () => {
      const xdr = 'signed_xdr_string';
      const mockResponse = { txHash: 'tx_hash', success: true, result: null, ledger: 100, createdAt: '', latestLedger: 100, latestLedgerCloseTime: '', feeBump: false, feeCharged: '100' };
      mockHttpClient.post.mockResolvedValue(mockResponse);

      const result = await sdk.sendTransaction(xdr, SupportedNetworks.TESTNET);

      expect(result).toEqual(mockResponse);
      expect(mockHttpClient.post).toHaveBeenCalledWith('/send?network=testnet', { xdr });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    beforeEach(() => {
      sdk = new DefindexSDK({ baseUrl: 'https://api.defindex.io' });
      mockHttpClient = (sdk as any).httpClient;
    });

    it('should handle network timeouts gracefully', async () => {
      const timeoutError = new Error('Network timeout');
      timeoutError.name = 'TimeoutError';
      mockHttpClient.get.mockRejectedValue(timeoutError);

      await expect(sdk.healthCheck()).rejects.toThrow('Network timeout');
    });

    it('should handle authentication errors', async () => {
      const authError = new Error('Unauthorized');
      authError.name = 'AuthenticationError';
      mockHttpClient.get.mockRejectedValue(authError);

      await expect(sdk.getFactoryAddress(SupportedNetworks.TESTNET))
        .rejects.toThrow('Unauthorized');
    });

    it('should validate network parameter enum values', async () => {
      const invalidNetwork = 'invalid_network' as SupportedNetworks;
      const mockResponse = { address: 'FACTORY_ADDR' };
      mockHttpClient.get.mockResolvedValue(mockResponse);

      // SDK should still make the call, but API might reject invalid network
      await sdk.getFactoryAddress(invalidNetwork);
      expect(mockHttpClient.get).toHaveBeenCalledWith('/factory/address?network=invalid_network');
    });

    it('should handle malformed API responses', async () => {
      const malformedResponse = { unexpected: 'data', missing: 'required_fields' };
      mockHttpClient.get.mockResolvedValue(malformedResponse);

      const result = await sdk.healthCheck();
      expect(result).toEqual(malformedResponse);
    });

    it('should handle empty responses', async () => {
      mockHttpClient.get.mockResolvedValue(null);

      const result = await sdk.healthCheck();
      expect(result).toBeNull();
    });

    it('should validate XDR format in transaction responses', async () => {
      const vaultAddress = 'CVAULT123456789012345678901234567890123456789012345';
      const depositData: DepositParams = {
        amounts: [1000000],
        caller: 'GUSER1234567890123456789012345678901234567890123456789',
        invest: true
      };

      const responseWithInvalidXDR = {
        xdr: '', // Empty XDR should be handled
        simulationResponse: 'SUCCESS',
        functionName: 'deposit',
        params: []
      };
      mockHttpClient.post.mockResolvedValue(responseWithInvalidXDR);

      const result = await sdk.depositToVault(vaultAddress, depositData, SupportedNetworks.TESTNET);
      expect(result.xdr).toBe('');
      expect(result.simulationResponse).toBe('SUCCESS');
    });

    it('should handle concurrent requests properly', async () => {
      const promises: Promise<any>[] = [];
      mockHttpClient.get.mockResolvedValue({ status: 'ok' });

      // Make multiple concurrent health check requests
      for (let i = 0; i < 5; i++) {
        promises.push(sdk.healthCheck());
      }

      const results = await Promise.all(promises);
      expect(results).toHaveLength(5);
      expect(results.every((result: any) => result.status === 'ok')).toBe(true);
      expect(mockHttpClient.get).toHaveBeenCalledTimes(5);
    });

    it('should handle rate limiting errors', async () => {
      const rateLimitError = new Error('Rate limit exceeded');
      rateLimitError.name = 'RateLimitError';
      mockHttpClient.get.mockRejectedValue(rateLimitError);

      await expect(sdk.healthCheck()).rejects.toThrow('Rate limit exceeded');
    });

    it('should maintain SDK state after errors', async () => {
      // First request fails
      mockHttpClient.get.mockRejectedValueOnce(new Error('Network error'));

      await expect(sdk.healthCheck()).rejects.toThrow('Network error');

      // Second request should work normally
      mockHttpClient.get.mockResolvedValueOnce({ status: 'ok' });

      const result = await sdk.healthCheck();
      expect(result.status).toBe('ok');
    });

    it('should validate required parameters are present', async () => {
      const vaultAddress = '';  // Empty vault address
      const error = new Error('Invalid vault address');
      mockHttpClient.get.mockRejectedValue(error);

      await expect(sdk.getVaultInfo(vaultAddress, SupportedNetworks.TESTNET))
        .rejects.toThrow('Invalid vault address');
    });

    it('should handle large numerical values correctly', async () => {
      const largeAmountData: DepositParams = {
        amounts: [Number.MAX_SAFE_INTEGER], // Very large amount
        caller: 'GUSER1234567890123456789012345678901234567890123456789',
        invest: true
      };

      const mockResponse = { xdr: 'large_amount_xdr' };
      mockHttpClient.post.mockResolvedValue(mockResponse);

      const result = await sdk.depositToVault(
        'CVAULT123456789012345678901234567890123456789012345',
        largeAmountData,
        SupportedNetworks.TESTNET
      );

      expect(result).toEqual(mockResponse);
      expect(largeAmountData.amounts[0]).toBe(Number.MAX_SAFE_INTEGER);
    });
  });

  describe('Integration Scenarios', () => {
    beforeEach(() => {
      sdk = new DefindexSDK({
        baseUrl: 'https://api.defindex.io',
        apiKey: 'test-api-key-123',
        timeout: 60000
      });
      mockHttpClient = (sdk as any).httpClient;
    });

    it('should complete a full vault lifecycle workflow', async () => {
      // 1. Get factory address
      mockHttpClient.get.mockResolvedValueOnce({
        address: 'CFACTORY123456789012345678901234567890123456789012'
      });

      const factoryResult = await sdk.getFactoryAddress(SupportedNetworks.TESTNET);
      expect(factoryResult.address).toBeTruthy();

      // 2. Create vault
      const vaultConfig: CreateVaultParams = {
        roles: {
          manager: 'GMANAGER123',
          feeReceiver: '',
          emergencyManager: '',
          rebalanceManager: ''
        },
        vaultFeeBps: 100,
        assets: [],
        name: 'Test',
        symbol: 'TST',
        upgradable: true,
        caller: 'GCALLER123'
      };

      mockHttpClient.post.mockResolvedValueOnce({
        xdr: 'create_xdr',
        simulationResponse: 'SUCCESS'
      });

      const createResult = await sdk.createVault(vaultConfig, SupportedNetworks.TESTNET);
      expect(createResult.xdr).toBeTruthy();
      expect(createResult.simulationResponse).toBe('SUCCESS');

      // 3. Get vault info
      mockHttpClient.get.mockResolvedValueOnce({
        name: 'Test',
        symbol: 'TST',
        roles: {
          manager: 'GMANAGER123',
          feeReceiver: '',
          emergencyManager: '',
          rebalanceManager: ''
        },
        assets: [],
        totalManagedFunds: [],
        feesBps: { vaultFee: 100, defindexFee: 50 },
        apy: 0
      });

      const infoResult = await sdk.getVaultInfo('CVAULT123', SupportedNetworks.TESTNET);
      expect(infoResult.name).toBe('Test');

      // Verify all calls were made
      expect(mockHttpClient.get).toHaveBeenCalledTimes(2);
      expect(mockHttpClient.post).toHaveBeenCalledTimes(1);
    });

    it('should handle partial workflow failures gracefully', async () => {
      // Factory call succeeds
      mockHttpClient.get.mockResolvedValueOnce({ address: 'CFACTORY123' });
      const factoryResult = await sdk.getFactoryAddress(SupportedNetworks.TESTNET);
      expect(factoryResult.address).toBe('CFACTORY123');

      // Vault creation fails
      mockHttpClient.post.mockRejectedValueOnce(new Error('Creation failed'));

      const vaultConfig: CreateVaultParams = {
        roles: {
          manager: 'GMANAGER123',
          feeReceiver: '',
          emergencyManager: '',
          rebalanceManager: ''
        },
        vaultFeeBps: 100,
        assets: [],
        name: 'Test',
        symbol: 'TST',
        upgradable: true,
        caller: 'GCALLER123'
      };

      await expect(sdk.createVault(vaultConfig, SupportedNetworks.TESTNET))
        .rejects.toThrow('Creation failed');

      // SDK should still be functional for other operations
      mockHttpClient.get.mockResolvedValueOnce({ status: 'ok' });
      const healthResult = await sdk.healthCheck();
      expect(healthResult.status).toBe('ok');
    });
  });
});
