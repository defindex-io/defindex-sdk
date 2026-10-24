import { StrKey } from '@stellar/stellar-sdk';
import { DefindexSDK, DefindexSDKConfig } from '../defindex-sdk';
import { SupportedNetworks } from '../types';
import { CliError, UsageError } from './errors';
import { OutputFormat } from './output';
import { Env, resolveSigner, Signer } from './signer';
import { StellarClient } from './stellar';

export const DEFAULT_BASE_URL = 'https://api.defindex.io';

/** Everything a command touches outside its own arguments. Tests replace these. */
export interface CliDeps {
  env: Env;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  createSdk: (config: DefindexSDKConfig) => DefindexSDK;
  readStdin: () => Promise<string>;
  stellar: StellarClient;
}

export type Values = Record<string, string | boolean | string[] | undefined>;

export class CliContext {
  readonly baseUrl: string;
  private sdkInstance?: DefindexSDK;
  private decimalsCache = new Map<string, Promise<number>>();

  constructor(
    readonly deps: CliDeps,
    readonly network: SupportedNetworks,
    readonly format: OutputFormat,
  ) {
    this.baseUrl = deps.env.DEFINDEX_API_URL || DEFAULT_BASE_URL;
  }

  /**
   * SDK client. Built on first use so commands that need no key never ask for
   * one. `requireKey: false` is for the few public endpoints (`/vault/discover`).
   */
  sdk(requireKey = true): DefindexSDK {
    if (!this.sdkInstance) {
      const apiKey = this.deps.env.DEFINDEX_API_KEY;
      if (!apiKey) {
        if (requireKey) throw new CliError('DEFINDEX_API_KEY is not set. Get one at https://console.defindex.io');
        return this.deps.createSdk({ baseUrl: this.baseUrl, defaultNetwork: this.network });
      }
      this.sdkInstance = this.deps.createSdk({ apiKey, baseUrl: this.baseUrl, defaultNetwork: this.network });
    }
    return this.sdkInstance;
  }

  signer(): Signer {
    return resolveSigner(this.deps.env);
  }

  /** `decimals()` of a token or vault contract, read once per run. */
  decimals(contract: string): Promise<number> {
    let cached = this.decimalsCache.get(contract);
    if (!cached) {
      cached = this.deps.stellar.fetchDecimals(contract, this.network);
      this.decimalsCache.set(contract, cached);
    }
    return cached;
  }
}

export function requireString(values: Values, name: string): string {
  const value = values[name];
  if (typeof value !== 'string' || value.trim() === '') throw new UsageError(`--${name} is required`);
  return value;
}

export function optionalInt(values: Values, name: string, min = 0, max = Number.MAX_SAFE_INTEGER): number | undefined {
  const value = values[name];
  if (value === undefined) return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new UsageError(`--${name} must be an integer between ${min} and ${max}`);
  }
  return n;
}

export function list(value: unknown): string[] | undefined {
  if (typeof value !== 'string') return undefined;
  return value.split(',').map(s => s.trim()).filter(Boolean);
}

export function checkContract(value: string, what: string): string {
  if (!StrKey.isValidContract(value)) throw new UsageError(`${what} must be a contract address (C...), got "${value}"`);
  return value;
}

export function checkAccount(value: string, what: string): string {
  if (!StrKey.isValidEd25519PublicKey(value) && !StrKey.isValidContract(value)) {
    throw new UsageError(`${what} must be a Stellar address (G... or C...), got "${value}"`);
  }
  return value;
}

/**
 * The DeFindex API takes amounts as JSON numbers. Refuse anything a double
 * cannot hold exactly instead of sending a rounded amount.
 */
export function toApiNumber(raw: bigint): number {
  if (raw > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new UsageError(`Amount ${raw} is larger than the API accepts (${Number.MAX_SAFE_INTEGER} in the smallest unit)`);
  }
  return Number(raw);
}
