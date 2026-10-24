import { VaultTransactionResponse } from '../../types';
import { parseRawAmount, parseUnits } from '../amounts';
import { checkAccount, checkContract, CliContext, list, optionalInt, toApiNumber, Values } from '../context';
import { CliError, UsageError } from '../errors';
import { keyValues, table } from '../output';
import { hasSigner, Signer } from '../signer';
import { networkPassphrase } from '../stellar';
import { Command, CommandResult } from './command';
import { humanAmount, VaultAssetSummary, vaultAssets } from './vaults';

const TX_FLAGS_HELP = `  --slippage-bps <n>      Slippage tolerance in basis points (API default 0)
  --dry-run               Build and simulate only; print the unsigned XDR, sign nothing
  --address <G...|C...>   Account that transacts (dry run without a signer); must match the signer otherwise

Signer (env only): STELLAR_SECRET_KEY=S...   (STELLAR_SIGNER selects other backends)`;

const TX_OPTIONS = {
  'slippage-bps': { type: 'string' as const },
  'dry-run': { type: 'boolean' as const },
  address: { type: 'string' as const },
};

/**
 * Who the transaction is built for. A real run needs a signer; a dry run only
 * needs an address, from --address or from the configured signer.
 */
async function resolveAccount(ctx: CliContext, values: Values): Promise<{ address: string; signer: Signer | null }> {
  const flag = values.address as string | undefined;
  if (values['dry-run'] === true) {
    if (flag) return { address: checkAccount(flag, '--address'), signer: null };
    if (!hasSigner(ctx.deps.env)) {
      throw new UsageError('--dry-run needs --address <G...> or a configured signer (STELLAR_SECRET_KEY)');
    }
    return { address: await ctx.signer().publicKey(), signer: null };
  }
  const signer = ctx.signer();
  const address = await signer.publicKey();
  if (flag && flag !== address) {
    throw new UsageError(`--address ${flag} does not match the signer's address ${address}`);
  }
  return { address, signer };
}

/**
 * Per-asset amounts, comma-separated in the vault's asset order. Zero is
 * allowed for some assets of a multi-asset vault, as long as one is positive.
 */
function readAssetAmounts(values: Values, flag: 'amount' | 'raw-amount', assets: VaultAssetSummary[]): number[] {
  const parts = list(values[flag]) ?? [];
  if (parts.length !== assets.length) {
    const order = assets.map(a => a.symbol ?? a.address).join(', ');
    throw new UsageError(`--${flag} needs ${assets.length} comma-separated value(s), one per vault asset in this order: ${order}`);
  }
  const raws = parts.map((p, i) => {
    if (flag === 'raw-amount') return parseRawAmount(p, true);
    const decimals = assets[i].decimals;
    if (decimals === null) throw new CliError(`Could not read the decimals of ${assets[i].address}; use --raw-amount`);
    return parseUnits(p, decimals, true);
  });
  if (!raws.some(r => r > 0n)) throw new UsageError('At least one amount must be greater than zero');
  return raws.map(toApiNumber);
}

function exactlyOne(values: Values, flags: string[]): string {
  const given = flags.filter(f => values[f] !== undefined && values[f] !== false);
  if (given.length !== 1) {
    throw new UsageError(`Use exactly one of ${flags.map(f => `--${f}`).join(', ')}${given.length > 1 ? ' (they are mutually exclusive)' : ''}`);
  }
  return given[0];
}

/** Shared tail of deposit and withdraw: dry-run output, or sign and submit. */
async function finish(
  ctx: CliContext,
  values: Values,
  action: string,
  vault: string,
  address: string,
  signer: Signer | null,
  built: VaultTransactionResponse,
  request: Record<string, unknown>,
): Promise<CommandResult> {
  const xdr = built.xdr ?? null;
  const operationXdr = built.operationXDR ?? null;

  if (values['dry-run'] === true || !signer) {
    const simulation = xdr ? await ctx.deps.stellar.simulate(xdr, ctx.network) : null;
    const data = {
      dryRun: true,
      action,
      network: ctx.network,
      vault,
      address,
      xdr,
      operationXdr,
      isSmartWallet: built.isSmartWallet ?? xdr === null,
      simulation,
      request,
    };
    const human = [
      keyValues({
        action,
        vault,
        address,
        simulation: simulation === null ? 'n/a' : simulation.ok ? 'ok' : `failed: ${simulation.error}`,
      }),
      '',
      xdr ? `Unsigned XDR:\n${xdr}` : `Smart wallet caller: no envelope. Operation XDR:\n${operationXdr}`,
    ].join('\n');
    // A failed simulation still prints the XDR, but exits non-zero so scripts stop here.
    return { data, human, exitCode: simulation && !simulation.ok ? 1 : 0 };
  }

  if (!xdr) {
    throw new CliError('The API returned no transaction envelope (smart wallet caller); use --dry-run and sign operationXdr with the wallet');
  }
  const signedXdr = await signer.signTransaction(xdr, networkPassphrase(ctx.network));
  const sent = await ctx.sdk().sendTransaction(signedXdr, ctx.network);
  if (!sent.success) throw new CliError(`Transaction ${sent.txHash} was submitted but did not succeed on ${ctx.network}`);
  const data = {
    dryRun: false,
    action,
    network: ctx.network,
    vault,
    address,
    txHash: sent.txHash,
    success: sent.success,
    ledger: sent.ledger ?? null,
    feeCharged: sent.feeCharged ?? null,
    result: sent.result ?? null,
    request,
  };
  return { data, human: keyValues({ action, vault, address, txHash: sent.txHash, ledger: data.ledger }) };
}

async function describeAmounts(ctx: CliContext, assets: VaultAssetSummary[], amounts: number[]) {
  return Promise.all(
    assets.map(async (a, i) => ({
      asset: a.address,
      symbol: a.symbol,
      amount: await humanAmount(ctx, a.address, amounts[i]),
      amountRaw: String(amounts[i]),
    })),
  );
}

export const depositCommand: Command = {
  name: 'deposit',
  summary: 'Deposit into a vault (or --dry-run for the unsigned XDR)',
  help: `Usage: defindex deposit <vault-address> (--amount <n[,n...]> | --raw-amount <n[,n...]>) [options]

Builds the deposit through the API (which simulates and assembles it), signs
it with the configured signer and submits it. With --dry-run it stops after
building, simulates on Stellar RPC and prints the unsigned XDR. Sign it later
with \`defindex sign --xdr <xdr> --submit\`. Needs DEFINDEX_API_KEY.

  --amount <list>         Human units, one value per vault asset, comma-separated (decimals come from each asset)
  --raw-amount <list>     Smallest units, same layout; exclusive with --amount
  --no-invest             Leave the deposit idle in the vault instead of investing it in the strategies
${TX_FLAGS_HELP}

Examples:
  defindex deposit CBNK... --amount 100 --dry-run --address G... -f json
  defindex deposit CVAULT... --amount 10 --network testnet`,
  options: { amount: { type: 'string' }, 'raw-amount': { type: 'string' }, 'no-invest': { type: 'boolean' }, ...TX_OPTIONS },
  positionals: [1, 1],
  async run(ctx, values, positionals) {
    const vault = checkContract(positionals[0], '<vault-address>');
    const flag = exactlyOne(values, ['amount', 'raw-amount']) as 'amount' | 'raw-amount';
    const slippageBps = optionalInt(values, 'slippage-bps', 0, 10000);
    const invest = values['no-invest'] !== true;
    const { address, signer } = await resolveAccount(ctx, values);

    const sdk = ctx.sdk();
    const assets = await vaultAssets(ctx, await sdk.getVaultInfo(vault, ctx.network));
    const amounts = readAssetAmounts(values, flag, assets);
    const built = await sdk.depositToVault(
      vault,
      { caller: address, amounts, invest, ...(slippageBps !== undefined && { slippageBps }) },
      ctx.network,
    );
    const request = { amounts: await describeAmounts(ctx, assets, amounts), invest, slippageBps: slippageBps ?? null };
    const result = await finish(ctx, values, 'deposit', vault, address, signer, built, request);
    result.human = `${table(request.amounts, ['symbol', 'amount', 'amountRaw'])}\n\n${result.human}`;
    return result;
  },
};

export const withdrawCommand: Command = {
  name: 'withdraw',
  summary: 'Withdraw from a vault by amounts, by shares, or everything',
  help: `Usage: defindex withdraw <vault-address> (--amount <list> | --raw-amount <list> | --shares <n> | --raw-shares <n> | --all) [options]

Builds the withdrawal through the API, signs it and submits it, or prints the
unsigned XDR with --dry-run. Needs DEFINDEX_API_KEY.

  --amount <list>         Underlying amounts in human units, one per vault asset, comma-separated
  --raw-amount <list>     Same in smallest units
  --shares <n>            Vault shares (dfTokens) to burn, human units
  --raw-shares <n>        Vault shares in smallest units
  --all                   Burn every share the account holds (full withdrawal)
${TX_FLAGS_HELP}

Examples:
  defindex withdraw CBNK... --all --dry-run --address G... -f json
  defindex withdraw CVAULT... --amount 5 --network testnet`,
  options: {
    amount: { type: 'string' },
    'raw-amount': { type: 'string' },
    shares: { type: 'string' },
    'raw-shares': { type: 'string' },
    all: { type: 'boolean' },
    ...TX_OPTIONS,
  },
  positionals: [1, 1],
  async run(ctx, values, positionals) {
    const vault = checkContract(positionals[0], '<vault-address>');
    const mode = exactlyOne(values, ['amount', 'raw-amount', 'shares', 'raw-shares', 'all']);
    const slippageBps = optionalInt(values, 'slippage-bps', 0, 10000);
    const { address, signer } = await resolveAccount(ctx, values);
    const sdk = ctx.sdk();
    const slippage = slippageBps !== undefined ? { slippageBps } : {};

    if (mode === 'amount' || mode === 'raw-amount') {
      const assets = await vaultAssets(ctx, await sdk.getVaultInfo(vault, ctx.network));
      const amounts = readAssetAmounts(values, mode, assets);
      const built = await sdk.withdrawFromVault(vault, { caller: address, amounts, ...slippage }, ctx.network);
      const request = { amounts: await describeAmounts(ctx, assets, amounts), shares: null, sharesRaw: null, slippageBps: slippageBps ?? null };
      return finish(ctx, values, 'withdraw', vault, address, signer, built, request);
    }

    let sharesRaw: bigint;
    if (mode === 'all') {
      const balance = await sdk.getVaultBalance(vault, address, ctx.network);
      sharesRaw = BigInt(String(balance.dfTokens ?? 0));
      if (sharesRaw === 0n) throw new CliError(`${address} holds no shares of ${vault} on ${ctx.network}`);
    } else if (mode === 'raw-shares') {
      sharesRaw = parseRawAmount(values['raw-shares'] as string);
    } else {
      sharesRaw = parseUnits(values.shares as string, await ctx.decimals(vault));
    }
    const shares = toApiNumber(sharesRaw);
    const built = await sdk.withdrawShares(vault, { caller: address, shares, ...slippage }, ctx.network);
    const request = {
      amounts: null,
      shares: await humanAmount(ctx, vault, sharesRaw),
      sharesRaw: sharesRaw.toString(),
      slippageBps: slippageBps ?? null,
    };
    return finish(ctx, values, 'withdraw', vault, address, signer, built, request);
  },
};
