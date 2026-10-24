import { Account, Asset, Keypair, Networks, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import { formatUnits, parseUnits } from '../src/cli/amounts';
import { CliDeps } from '../src/cli/context';
import { run } from '../src/cli/run';

const VAULT = 'CBNKCU3HGFKHFOF7JTGXQCNKE3G3DXS5RDBQUKQMIIECYKXPIOUGB2S3';
const USDC = 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75';
const EURC = 'CDTKPWPLOURQA2SGTKTUQOWRCBZEORB4BWBOMJ3D3ZTQQSGE5F6JBQLV';
const STRATEGY = 'CDB2WMKQQNVZMEBY7Q7GZ5C7E7IAFSNMZ7GGVD6WKTCEWK7XOIAVZSAP';
const SIGNER = Keypair.fromSecret('SD3U7CIYKTM6NP5NZEE4Y4MJGFU2FWUVYLLY7UA7354U7LPHIODBO2BS');

function unsignedXdr(): string {
  return new TransactionBuilder(new Account(SIGNER.publicKey(), '1'), { fee: '100', networkPassphrase: Networks.PUBLIC })
    .addOperation(Operation.payment({ destination: SIGNER.publicKey(), asset: Asset.native(), amount: '1' }))
    .setTimeout(0)
    .build()
    .toXDR();
}

const vaultInfo = (assets = [USDC]) => ({
  name: 'DeFindex-Vault-Test',
  symbol: 'DFTEST',
  roles: { manager: 'GM', emergencyManager: 'GE', rebalanceManager: 'GR', feeReceiver: 'GF' },
  assets: assets.map(a => ({ address: a, name: 'X', symbol: a === USDC ? 'USDC' : 'EURC', strategies: [{ address: STRATEGY, name: 'blend', paused: false }] })),
  totalManagedFunds: [
    {
      asset: USDC,
      total_amount: '15000000',
      idle_amount: '5000000',
      invested_amount: '10000000',
      strategy_allocations: [{ amount: '10000000', paused: false, strategy_address: STRATEGY }],
    },
  ],
  feesBps: { vaultFee: 100, defindexFee: 2000 },
  apy: 5.9,
});

function setup(env: Record<string, string> = { DEFINDEX_API_KEY: 'sk_test' }, assets = [USDC]) {
  const sdk = {
    discoverVaults: jest.fn().mockResolvedValue({
      totalVaults: 2,
      vaults: [
        { address: VAULT, apy: 5.93, totalManagedFunds: [{ asset: USDC, total_amount: '25000000' }] },
        { address: 'CVAULT2', apy: null, totalManagedFunds: null },
      ],
    }),
    getVaultInfo: jest.fn().mockResolvedValue(vaultInfo(assets)),
    getVaultBalance: jest.fn().mockResolvedValue({ dfTokens: 12345678, underlyingBalance: [13000000] }),
    depositToVault: jest.fn().mockResolvedValue({ xdr: unsignedXdr(), simulationResponse: {}, functionName: 'deposit', params: [] }),
    withdrawFromVault: jest.fn().mockResolvedValue({ xdr: unsignedXdr(), simulationResponse: {}, functionName: 'withdraw', params: [] }),
    withdrawShares: jest.fn().mockResolvedValue({ xdr: unsignedXdr(), simulationResponse: {}, functionName: 'withdraw', params: [] }),
    sendTransaction: jest.fn().mockResolvedValue({ txHash: 'abc', success: true, ledger: 9, feeCharged: '100', result: null }),
  };
  const stdout: string[] = [];
  const stderr: string[] = [];
  const stellar = {
    fetchDecimals: jest.fn().mockResolvedValue(7),
    simulate: jest.fn().mockResolvedValue({ ok: true, minResourceFee: '1234', error: null }),
  };
  const createSdk = jest.fn().mockReturnValue(sdk);
  const deps: CliDeps = {
    env,
    stdout: t => stdout.push(t),
    stderr: t => stderr.push(t),
    createSdk,
    readStdin: jest.fn().mockResolvedValue(unsignedXdr()),
    stellar,
  };
  const json = () => JSON.parse(stdout.join('\n'));
  return { sdk, deps, stdout, stderr, stellar, createSdk, json };
}

describe('amounts', () => {
  it('converts both ways and never rounds', () => {
    expect(parseUnits('1.5', 7)).toBe(15000000n);
    expect(formatUnits('15000000', 7)).toBe('1.5');
    expect(() => parseUnits('1.12345678', 7)).toThrow('more than 7 decimal places');
    expect(() => parseUnits('0', 7)).toThrow();
    expect(parseUnits('0', 7, true)).toBe(0n);
  });
});

describe('argument parsing and errors', () => {
  it('reports usage errors as JSON on stdout with exit code 2', async () => {
    const t = setup();
    expect(await run(['deposit', VAULT, '--amount', '1', '--raw-amount', '1', '-f', 'json'], t.deps)).toBe(2);
    expect(t.json().error).toMatch(/exactly one of --amount, --raw-amount.*mutually exclusive/);
    expect(t.sdk.depositToVault).not.toHaveBeenCalled();
  });

  it('rejects a vault address that is not a contract', async () => {
    const t = setup();
    expect(await run(['vault', 'GNOTACONTRACT', '--output', 'json'], t.deps)).toBe(2);
    expect(t.json().error).toMatch(/must be a contract address/);
  });

  it('rejects unknown commands, flags and networks', async () => {
    for (const argv of [['nope'], ['vaults', '--bogus'], ['vaults', '--network', 'futurenet']]) {
      const t = setup();
      expect(await run([...argv, '-f', 'json'], t.deps)).toBe(2);
      expect(t.json().error).toBeDefined();
    }
  });

  it('prints errors to stderr in table mode', async () => {
    const t = setup();
    expect(await run(['vault'], t.deps)).toBe(2);
    expect(t.stdout).toEqual([]);
    expect(t.stderr[0]).toMatch(/^Error: /);
  });

  it('maps raw API error bodies to messages', async () => {
    const t = setup();
    t.sdk.getVaultInfo.mockRejectedValue({ statusCode: 403, message: 'Forbidden resource' });
    expect(await run(['vault', VAULT, '-f', 'json'], t.deps)).toBe(1);
    expect(t.json().error).toMatch(/^API error 403: Forbidden resource.*DEFINDEX_API_KEY/);
  });

  it('needs DEFINDEX_API_KEY for vault but not for vaults', async () => {
    const t = setup({});
    expect(await run(['vault', VAULT, '-f', 'json'], t.deps)).toBe(1);
    expect(t.json().error).toMatch(/DEFINDEX_API_KEY is not set/);
    const u = setup({});
    expect(await run(['vaults', '-f', 'json'], u.deps)).toBe(0);
    expect(u.createSdk).toHaveBeenCalledWith(expect.not.objectContaining({ apiKey: expect.anything() }));
  });
});

describe('reads', () => {
  it('vaults uses apyPct, keeps null as null, and adds human amounts', async () => {
    const t = setup();
    await run(['vaults', '-f', 'json'], t.deps);
    expect(t.json()).toEqual([
      { address: VAULT, apyPct: 5.93, totalManagedFunds: [{ asset: USDC, amount: '2.5', amountRaw: '25000000' }] },
      { address: 'CVAULT2', apyPct: null, totalManagedFunds: null },
    ]);
  });

  it('vault merges allocation into each asset and strategy', async () => {
    const t = setup();
    await run(['vault', VAULT, '-f', 'json', '-n', 'testnet'], t.deps);
    expect(t.sdk.getVaultInfo).toHaveBeenCalledWith(VAULT, 'testnet');
    const out = t.json();
    expect(out).toMatchObject({ address: VAULT, network: 'testnet', apyPct: 5.9, feesBps: { vaultFee: 100, defindexFee: 2000 } });
    expect(out.assets[0]).toEqual({
      address: USDC,
      symbol: 'USDC',
      name: 'X',
      decimals: 7,
      totalAmount: '1.5',
      totalAmountRaw: '15000000',
      idleAmount: '0.5',
      idleAmountRaw: '5000000',
      investedAmount: '1',
      investedAmountRaw: '10000000',
      strategies: [{ address: STRATEGY, name: 'blend', paused: false, amount: '1', amountRaw: '10000000' }],
    });
  });

  it('position reports shares and underlying value, defaulting to the signer', async () => {
    const t = setup({ DEFINDEX_API_KEY: 'k', STELLAR_SECRET_KEY: SIGNER.secret() });
    await run(['position', VAULT, '-f', 'json'], t.deps);
    expect(t.sdk.getVaultBalance).toHaveBeenCalledWith(VAULT, SIGNER.publicKey(), 'mainnet');
    expect(t.json()).toEqual({
      vault: VAULT,
      account: SIGNER.publicKey(),
      network: 'mainnet',
      shares: '1.2345678',
      sharesRaw: '12345678',
      assets: [{ address: USDC, symbol: 'USDC', amount: '1.3', amountRaw: '13000000' }],
    });
  });
});

describe('deposit', () => {
  it('--dry-run converts human amounts per asset, simulates, and never signs', async () => {
    const t = setup();
    const code = await run(['deposit', VAULT, '--amount', '2.5', '--dry-run', '--address', SIGNER.publicKey(), '-f', 'json'], t.deps);
    expect(code).toBe(0);
    expect(t.sdk.depositToVault).toHaveBeenCalledWith(VAULT, { caller: SIGNER.publicKey(), amounts: [25000000], invest: true }, 'mainnet');
    expect(t.sdk.sendTransaction).not.toHaveBeenCalled();
    expect(t.json()).toMatchObject({
      dryRun: true,
      action: 'deposit',
      xdr: unsignedXdr(),
      simulation: { ok: true },
      request: { amounts: [{ asset: USDC, symbol: 'USDC', amount: '2.5', amountRaw: '25000000' }], invest: true, slippageBps: null },
    });
  });

  it('needs one value per vault asset', async () => {
    const t = setup(undefined, [USDC, EURC]);
    expect(await run(['deposit', VAULT, '--amount', '1', '--dry-run', '--address', SIGNER.publicKey(), '-f', 'json'], t.deps)).toBe(2);
    expect(t.json().error).toMatch(/needs 2 comma-separated value\(s\).*USDC, EURC/);
    const u = setup(undefined, [USDC, EURC]);
    await run(['deposit', VAULT, '--raw-amount', '10,0', '--no-invest', '--slippage-bps', '50', '--dry-run', '--address', SIGNER.publicKey(), '-f', 'json'], u.deps);
    expect(u.sdk.depositToVault.mock.calls[0][1]).toEqual({ caller: SIGNER.publicKey(), amounts: [10, 0], invest: false, slippageBps: 50 });
  });

  it('signs with STELLAR_SECRET_KEY and submits', async () => {
    const t = setup({ DEFINDEX_API_KEY: 'k', STELLAR_SECRET_KEY: SIGNER.secret() });
    expect(await run(['deposit', VAULT, '--amount', '1', '-f', 'json'], t.deps)).toBe(0);
    const signed = TransactionBuilder.fromXDR(t.sdk.sendTransaction.mock.calls[0][0], Networks.PUBLIC);
    expect(signed.signatures).toHaveLength(1);
    expect(t.json()).toMatchObject({ dryRun: false, txHash: 'abc', success: true, ledger: 9 });
  });

  it('a real deposit without a signer fails before calling the API', async () => {
    const t = setup();
    expect(await run(['deposit', VAULT, '--amount', '1', '-f', 'json'], t.deps)).toBe(1);
    expect(t.json().error).toMatch(/STELLAR_SECRET_KEY/);
    expect(t.sdk.getVaultInfo).not.toHaveBeenCalled();
  });

  it('smart wallet callers get operationXdr in a dry run and a clear error otherwise', async () => {
    const t = setup();
    t.sdk.depositToVault.mockResolvedValue({ xdr: null, operationXDR: 'OPXDR', isSmartWallet: true, simulationResponse: {}, functionName: 'deposit', params: [] });
    await run(['deposit', VAULT, '--amount', '1', '--dry-run', '--address', VAULT, '-f', 'json'], t.deps);
    expect(t.json()).toMatchObject({ xdr: null, operationXdr: 'OPXDR', isSmartWallet: true, simulation: null });
  });

  it('exits 1 when the dry-run simulation fails', async () => {
    const t = setup();
    t.stellar.simulate.mockResolvedValue({ ok: false, minResourceFee: null, error: 'HostError' });
    expect(await run(['deposit', VAULT, '--amount', '1', '--dry-run', '--address', SIGNER.publicKey(), '-f', 'json'], t.deps)).toBe(1);
    expect(t.json().xdr).toBe(unsignedXdr());
  });
});

describe('withdraw', () => {
  it('--all burns every share the account holds', async () => {
    const t = setup();
    await run(['withdraw', VAULT, '--all', '--dry-run', '--address', SIGNER.publicKey(), '-f', 'json'], t.deps);
    expect(t.sdk.withdrawShares).toHaveBeenCalledWith(VAULT, { caller: SIGNER.publicKey(), shares: 12345678 }, 'mainnet');
    expect(t.json().request).toEqual({ amounts: null, shares: '1.2345678', sharesRaw: '12345678', slippageBps: null });
  });

  it('--shares uses the vault token decimals; --amount uses the asset decimals', async () => {
    const t = setup();
    await run(['withdraw', VAULT, '--shares', '1', '--dry-run', '--address', SIGNER.publicKey(), '-f', 'json'], t.deps);
    expect(t.stellar.fetchDecimals).toHaveBeenCalledWith(VAULT, 'mainnet');
    expect(t.sdk.withdrawShares.mock.calls[0][1].shares).toBe(10000000);
    const u = setup();
    await run(['withdraw', VAULT, '--amount', '0.5', '--slippage-bps', '100', '--dry-run', '--address', SIGNER.publicKey(), '-f', 'json'], u.deps);
    expect(u.sdk.withdrawFromVault).toHaveBeenCalledWith(VAULT, { caller: SIGNER.publicKey(), amounts: [5000000], slippageBps: 100 }, 'mainnet');
  });

  it('--all with no shares is an error, not an empty transaction', async () => {
    const t = setup();
    t.sdk.getVaultBalance.mockResolvedValue({ dfTokens: 0, underlyingBalance: [0] });
    expect(await run(['withdraw', VAULT, '--all', '--dry-run', '--address', SIGNER.publicKey(), '-f', 'json'], t.deps)).toBe(1);
    expect(t.json().error).toMatch(/holds no shares/);
  });

  it('modes are mutually exclusive', async () => {
    const t = setup();
    expect(await run(['withdraw', VAULT, '--all', '--shares', '1', '-f', 'json'], t.deps)).toBe(2);
  });
});

describe('sign', () => {
  it('signs from stdin without needing an API key', async () => {
    const t = setup({ STELLAR_SECRET_KEY: SIGNER.secret() });
    expect(await run(['sign', '--xdr', '-', '-f', 'json'], t.deps)).toBe(0);
    const out = t.json();
    const tx = TransactionBuilder.fromXDR(out.signedXdr, Networks.PUBLIC);
    expect(SIGNER.verify(tx.hash(), tx.signatures[0].signature())).toBe(true);
    expect(t.createSdk).not.toHaveBeenCalled();
  });

  it('--submit sends through sendTransaction', async () => {
    const t = setup({ DEFINDEX_API_KEY: 'k', STELLAR_SECRET_KEY: SIGNER.secret() });
    expect(await run(['sign', '--xdr', unsignedXdr(), '--submit', '-f', 'json', '-n', 'mainnet'], t.deps)).toBe(0);
    expect(t.sdk.sendTransaction).toHaveBeenCalledWith(expect.any(String), 'mainnet');
  });

  it('rejects an unknown STELLAR_SIGNER', async () => {
    const t = setup({ STELLAR_SIGNER: 'turnkey' });
    expect(await run(['sign', '--xdr', unsignedXdr(), '-f', 'json'], t.deps)).toBe(1);
    expect(t.json().error).toMatch(/Unsupported STELLAR_SIGNER "turnkey"/);
  });
});
