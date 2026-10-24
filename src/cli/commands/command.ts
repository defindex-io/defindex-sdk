import { CliContext, Values } from '../context';

export interface OptionSpec {
  type: 'string' | 'boolean';
  short?: string;
}

export interface CommandResult {
  /** What `-f json` prints. */
  data: unknown;
  /** What the default table format prints. */
  human: string;
  /** Defaults to 0. */
  exitCode?: number;
}

export interface Command {
  name: string;
  summary: string;
  /** Full help text for `defindex <command> --help`. */
  help: string;
  options: Record<string, OptionSpec>;
  /** Allowed number of positional arguments, [min, max]. */
  positionals: [number, number];
  run(ctx: CliContext, values: Values, positionals: string[]): Promise<CommandResult>;
}
