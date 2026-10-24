import { VaultInfoResponse } from '../../types';
import { formatUnits } from '../amounts';
import { checkAccount, checkContract, CliContext } from '../context';
import { UsageError } from '../errors';
import { keyValues, table } from '../output';
import { hasSigner } from '../signer';
import { Command } from './command';

/** null, not 0, when the API has no value. */
export const numberOrNull = (v: unknown): number | null => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Human amount for a raw value, or null when the raw value or the decimals are unknown. */
export async function humanAmount(ctx: CliContext, asset: string, raw: unknown): Promise<string | null> {
  if (raw === undefined || raw === null) return null;
  try {
    return formatUnits(String(raw), await ctx.decimals(asset));
  } catch {
    return null;
  }
}

export interface VaultAssetSummary {
  address: string;
  symbol: string | null;
  name: string | null;
  decimals: number | null;
}

/** Vault assets in the order the vault expects amounts, with their decimals. */
export async function vaultAssets(ctx: CliContext, info: VaultInfoResponse): Promise<VaultAssetSummary[]> {
  return Promise.all(
    info.assets.map(async a => ({
      address: a.address,
      symbol: a.symbol ?? null,
      name: a.name ?? null,
      decimals: await ctx.decimals(a.address).catch(() => null),
    })),
  );
}

export const vaultsCommand: Command = {
  name: 'vaults',
  summary: 'List the main DeFindex vaults with APY and TVL',
  help: `Usage: defindex vaults

Lists the main DeFindex vaults on the network: address, 30-day APY (apyPct)
and total managed funds per asset. apyPct and totalManagedFunds are null when
the API could not compute them. This endpoint needs no API key.

Example:
  defindex vaults -f json`,
  options: {},
  positionals: [0, 0],
  async run(ctx) {
    const res = await ctx.sdk(false).discoverVaults(ctx.network);
    const rows = await Promise.all(
      res.vaults.map(async v => ({
        address: v.address,
        apyPct: numberOrNull(v.apy),
        totalManagedFunds:
          v.totalManagedFunds === null
            ? null
            : await Promise.all(
                v.totalManagedFunds.map(async f => ({
                  asset: f.asset,
                  amount: await humanAmount(ctx, f.asset, f.total_amount),
                  amountRaw: String(f.total_amount),
                })),
              ),
      })),
    );
    const human = table(
      rows.map(r => ({
        address: r.address,
        apyPct: r.apyPct,
        tvl: r.totalManagedFunds?.map(f => `${f.amount ?? f.amountRaw} ${f.asset.slice(0, 6)}…`).join(', ') ?? null,
      })),
    );
    return { data: rows, human };
  },
};

export const vaultCommand: Command = {
  name: 'vault',
  summary: 'Details of one vault: assets, strategies, allocation, fees, APY',
  help: `Usage: defindex vault <vault-address>

Name, symbol, APY (apyPct), fees in basis points, roles, and for each asset
its strategies and how much is idle or invested. Needs DEFINDEX_API_KEY.

Example:
  defindex vault CBNKCU3HGFKHFOF7JTGXQCNKE3G3DXS5RDBQUKQMIIECYKXPIOUGB2S3 -f json`,
  options: {},
  positionals: [1, 1],
  async run(ctx, _values, positionals) {
    const address = checkContract(positionals[0], '<vault-address>');
    const info = await ctx.sdk().getVaultInfo(address, ctx.network);
    const assets = await Promise.all(
      info.assets.map(async a => {
        const funds = info.totalManagedFunds?.find(f => f.asset === a.address);
        const amount = (raw: unknown) => humanAmount(ctx, a.address, raw);
        return {
          address: a.address,
          symbol: a.symbol ?? null,
          name: a.name ?? null,
          decimals: await ctx.decimals(a.address).catch(() => null),
          totalAmount: await amount(funds?.total_amount),
          totalAmountRaw: funds ? String(funds.total_amount) : null,
          idleAmount: await amount(funds?.idle_amount),
          idleAmountRaw: funds ? String(funds.idle_amount) : null,
          investedAmount: await amount(funds?.invested_amount),
          investedAmountRaw: funds ? String(funds.invested_amount) : null,
          strategies: await Promise.all(
            a.strategies.map(async s => {
              const alloc = funds?.strategy_allocations?.find(x => x.strategy_address === s.address);
              return {
                address: s.address,
                name: s.name,
                paused: s.paused,
                amount: await amount(alloc?.amount),
                amountRaw: alloc ? String(alloc.amount) : null,
              };
            }),
          ),
        };
      }),
    );
    const data = {
      address,
      network: ctx.network,
      name: info.name ?? null,
      symbol: info.symbol ?? null,
      apyPct: numberOrNull(info.apy),
      feesBps: { vaultFee: numberOrNull(info.feesBps?.vaultFee), defindexFee: numberOrNull(info.feesBps?.defindexFee) },
      roles: info.roles ?? null,
      assets,
    };
    const human = [
      keyValues({ address, name: data.name, symbol: data.symbol, apyPct: data.apyPct, vaultFeeBps: data.feesBps.vaultFee }),
      '',
      table(
        assets.flatMap(a =>
          a.strategies.map(s => ({ asset: a.symbol, total: a.totalAmount, strategy: s.name, allocated: s.amount, paused: s.paused })),
        ),
      ),
    ].join('\n');
    return { data, human };
  },
};

export const positionCommand: Command = {
  name: 'position',
  summary: "An account's shares in a vault and what they are worth",
  help: `Usage: defindex position <vault-address> [<account>]

Vault shares (dfTokens) held by <account> and their value in each underlying
asset. Without <account>, uses the configured signer's address. Needs
DEFINDEX_API_KEY.

Example:
  defindex position CBNK... GABC... -f json`,
  options: {},
  positionals: [1, 2],
  async run(ctx, _values, positionals) {
    const vault = checkContract(positionals[0], '<vault-address>');
    let account = positionals[1];
    if (!account) {
      if (!hasSigner(ctx.deps.env)) throw new UsageError('Pass an <account> or configure STELLAR_SECRET_KEY');
      account = await ctx.signer().publicKey();
    }
    checkAccount(account, '<account>');
    const sdk = ctx.sdk();
    const [info, balance] = await Promise.all([
      sdk.getVaultInfo(vault, ctx.network),
      sdk.getVaultBalance(vault, account, ctx.network),
    ]);
    const assets = await Promise.all(
      info.assets.map(async (a, i) => {
        const raw = balance.underlyingBalance?.[i];
        return {
          address: a.address,
          symbol: a.symbol ?? null,
          amount: await humanAmount(ctx, a.address, raw),
          amountRaw: raw === undefined || raw === null ? null : String(raw),
        };
      }),
    );
    const data = {
      vault,
      account,
      network: ctx.network,
      shares: await humanAmount(ctx, vault, balance.dfTokens),
      sharesRaw: String(balance.dfTokens ?? 0),
      assets,
    };
    const human = [
      keyValues({ vault, account, shares: data.shares ?? data.sharesRaw }),
      '',
      table(assets, ['symbol', 'amount', 'address']),
    ].join('\n');
    return { data, human };
  },
};
