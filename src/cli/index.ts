#!/usr/bin/env node
import { DefindexSDK } from '../defindex-sdk';
import { run } from './run';
import { createStellarClient } from './stellar';

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return '';
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

run(process.argv.slice(2), {
  env: process.env,
  stdout: text => process.stdout.write(`${text}\n`),
  stderr: text => process.stderr.write(`${text}\n`),
  createSdk: config => new DefindexSDK(config),
  readStdin,
  stellar: createStellarClient(process.env),
}).then(code => {
  process.exitCode = code;
});
