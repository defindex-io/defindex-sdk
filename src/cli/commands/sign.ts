import { requireString } from '../context';
import { CliError } from '../errors';
import { keyValues } from '../output';
import { networkPassphrase, parseTransaction } from '../stellar';
import { Command } from './command';

export const signCommand: Command = {
  name: 'sign',
  summary: 'Sign an XDR with the configured signer, optionally submit it',
  help: `Usage: defindex sign --xdr <base64 | -> [--submit]

Signs a transaction envelope (for example the xdr of \`swap --dry-run\`) with
the signer from the environment and prints the signed XDR. Use "-" to read the
XDR from stdin. With --submit, sends it through the DeFindex API (needs
DEFINDEX_API_KEY). The --network must match the one the XDR was built for.

Signer (env only): STELLAR_SECRET_KEY=S...   (STELLAR_SIGNER selects other backends)

Example:
  defindex deposit CVAULT... --amount 10 --dry-run --address G... -f json \\
    | jq -r .xdr | defindex sign --xdr - --submit -f json`,
  options: { xdr: { type: 'string' }, submit: { type: 'boolean' } },
  positionals: [0, 0],
  async run(ctx, values) {
    let xdr = requireString(values, 'xdr');
    if (xdr === '-') xdr = (await ctx.deps.readStdin()).trim();
    if (!xdr) throw new CliError('No XDR on stdin');
    parseTransaction(xdr, ctx.network);

    const signer = ctx.signer();
    const address = await signer.publicKey();
    const signedXdr = await signer.signTransaction(xdr, networkPassphrase(ctx.network));
    const hash = Buffer.from(parseTransaction(signedXdr, ctx.network).hash()).toString('hex');

    if (values.submit !== true) {
      const data = { network: ctx.network, signer: address, hash, signedXdr };
      return { data, human: `${keyValues({ network: ctx.network, signer: address, hash })}\n\nSigned XDR:\n${signedXdr}` };
    }

    const sent = await ctx.sdk().sendTransaction(signedXdr, ctx.network);
    const data = {
      network: ctx.network,
      signer: address,
      txHash: sent.txHash ?? hash,
      success: sent.success,
      ledger: sent.ledger ?? null,
      feeCharged: sent.feeCharged ?? null,
      result: sent.result ?? null,
    };
    if (!sent.success) throw new CliError(`Transaction ${data.txHash} was submitted but did not succeed on ${ctx.network}`);
    return { data, human: keyValues({ network: ctx.network, signer: address, txHash: data.txHash, ledger: data.ledger }) };
  },
};
