import { Keypair, TransactionBuilder } from '@stellar/stellar-sdk';
import { CliError } from './errors';

/**
 * Anything that can sign a Stellar transaction envelope.
 *
 * The CLI only ever talks to this interface, so a remote signer (Privy,
 * Turnkey, a KMS, a hardware wallet bridge) is one new factory in
 * `SIGNER_FACTORIES` and nothing else. Signers are chosen and configured
 * through environment variables only, never through flags, so keys do not
 * end up in shell history or agent transcripts.
 */
export interface Signer {
  /** Name shown in output, e.g. "secret-key". */
  readonly kind: string;
  /** G... address that signs. */
  publicKey(): Promise<string>;
  /** Return the envelope with this signer's signature added. */
  signTransaction(xdr: string, networkPassphrase: string): Promise<string>;
}

/** Environment variables as the CLI sees them (process.env in production, a plain object in tests). */
export type Env = Record<string, string | undefined>;

type SignerFactory = (env: Env) => Signer;

/** Local ed25519 key from STELLAR_SECRET_KEY (S...). */
export function secretKeySigner(secret: string): Signer {
  let keypair: Keypair;
  try {
    keypair = Keypair.fromSecret(secret.trim());
  } catch {
    throw new CliError('STELLAR_SECRET_KEY is not a valid Stellar secret key (S...)');
  }
  return {
    kind: 'secret-key',
    async publicKey() {
      return keypair.publicKey();
    },
    async signTransaction(xdr, passphrase) {
      const tx = TransactionBuilder.fromXDR(xdr, passphrase);
      tx.sign(keypair);
      return tx.toXDR();
    },
  };
}

/**
 * Registry of signer backends, selected with STELLAR_SIGNER (default
 * "secret-key"). To add one, register a factory that reads its own env vars
 * (for example PRIVY_APP_ID / PRIVY_WALLET_ID) and returns a `Signer`.
 */
export const SIGNER_FACTORIES: Record<string, SignerFactory> = {
  'secret-key': env => {
    if (!env.STELLAR_SECRET_KEY) {
      throw new CliError(
        'No signer configured: set STELLAR_SECRET_KEY, or use --dry-run with --address to get the unsigned XDR',
      );
    }
    return secretKeySigner(env.STELLAR_SECRET_KEY);
  },
};

export function resolveSigner(env: Env): Signer {
  const kind = env.STELLAR_SIGNER || 'secret-key';
  const factory = SIGNER_FACTORIES[kind];
  if (!factory) {
    throw new CliError(
      `Unsupported STELLAR_SIGNER "${kind}". Available: ${Object.keys(SIGNER_FACTORIES).join(', ')}`,
    );
  }
  return factory(env);
}

/** True when a signer can be built from the environment, without throwing. */
export function hasSigner(env: Env): boolean {
  return Boolean(env.STELLAR_SIGNER && env.STELLAR_SIGNER !== 'secret-key') || Boolean(env.STELLAR_SECRET_KEY);
}
