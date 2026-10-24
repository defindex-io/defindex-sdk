import {
  Account,
  Asset,
  Contract,
  FeeBumpTransaction,
  Keypair,
  Networks,
  rpc,
  scValToNative,
  Transaction,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { SupportedNetworks } from '../types';
import { CliError } from './errors';
import { Env } from './signer';

/** Public RPC used for decimals lookups and local simulation. Override with STELLAR_RPC_URL. */
export const DEFAULT_RPC_URLS: Record<SupportedNetworks, string> = {
  [SupportedNetworks.MAINNET]: 'https://mainnet.sorobanrpc.com',
  [SupportedNetworks.TESTNET]: 'https://soroban-testnet.stellar.org',
};

export function networkPassphrase(network: SupportedNetworks): string {
  return network === SupportedNetworks.MAINNET ? Networks.PUBLIC : Networks.TESTNET;
}

export interface SimulationSummary {
  ok: boolean;
  /** Minimum resource fee in stroops reported by the simulation, or null when it failed. */
  minResourceFee: string | null;
  error: string | null;
}

/** The on-chain calls the CLI makes on its own, behind one seam so tests can replace them. */
export interface StellarClient {
  /** `decimals()` of a token contract. */
  fetchDecimals(contract: string, network: SupportedNetworks): Promise<number>;
  /** Simulate a built transaction. Returns null for classic (non-Soroban) transactions. */
  simulate(xdr: string, network: SupportedNetworks): Promise<SimulationSummary | null>;
}

export function parseTransaction(xdr: string, network: SupportedNetworks): Transaction | FeeBumpTransaction {
  try {
    return TransactionBuilder.fromXDR(xdr.trim(), networkPassphrase(network));
  } catch (err) {
    throw new CliError(`Invalid transaction XDR: ${(err as Error).message}`);
  }
}

/** Contract id of the Stellar Asset Contract for a classic asset ("native" or CODE:ISSUER). */
export function classicAssetContract(code: string, issuer: string | null, network: SupportedNetworks): string {
  const asset = issuer ? new Asset(code, issuer) : Asset.native();
  return asset.contractId(networkPassphrase(network));
}

export function createStellarClient(env: Env): StellarClient {
  const server = (network: SupportedNetworks) =>
    new rpc.Server(env.STELLAR_RPC_URL || DEFAULT_RPC_URLS[network], { allowHttp: false });

  return {
    async fetchDecimals(contract, network) {
      // Read-only call: any source account works, it never has to exist or sign.
      const source = new Account(Keypair.random().publicKey(), '0');
      const tx = new TransactionBuilder(source, { fee: '100', networkPassphrase: networkPassphrase(network) })
        .addOperation(new Contract(contract).call('decimals'))
        .setTimeout(30)
        .build();
      const sim = await server(network).simulateTransaction(tx);
      if (!rpc.Api.isSimulationSuccess(sim) || !sim.result) {
        throw new CliError(`Could not read decimals() of ${contract} on ${network}; pass --raw-amount instead`);
      }
      return Number(scValToNative(sim.result.retval));
    },

    async simulate(xdr, network) {
      const tx = parseTransaction(xdr, network);
      const inner = tx instanceof FeeBumpTransaction ? tx.innerTransaction : tx;
      const isSoroban = inner.operations.some(op =>
        ['invokeHostFunction', 'extendFootprintTtl', 'restoreFootprint'].includes(op.type),
      );
      if (!isSoroban) return null;
      const sim = await server(network).simulateTransaction(inner);
      if (rpc.Api.isSimulationError(sim)) {
        return { ok: false, minResourceFee: null, error: sim.error };
      }
      return { ok: true, minResourceFee: sim.minResourceFee ?? null, error: null };
    },
  };
}
