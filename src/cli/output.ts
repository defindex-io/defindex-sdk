export type OutputFormat = 'table' | 'json';

/** Serialize with bigint as decimal strings, so raw amounts never lose precision. */
export function toJson(data: unknown): string {
  return JSON.stringify(data, (_, value) => (typeof value === 'bigint' ? value.toString() : value), 2);
}

/** Render rows as a fixed-width text table. `null` and `undefined` print as "-". */
export function table(rows: Record<string, unknown>[], columns?: string[]): string {
  if (rows.length === 0) return '(no results)';
  const cols = columns ?? Object.keys(rows[0]);
  const cell = (v: unknown) => (v === null || v === undefined ? '-' : String(v));
  const widths = cols.map(c => Math.max(c.length, ...rows.map(r => cell(r[c]).length)));
  const line = (values: string[]) => values.map((v, i) => v.padEnd(widths[i])).join('  ').trimEnd();
  return [line(cols), line(widths.map(w => '-'.repeat(w))), ...rows.map(r => line(cols.map(c => cell(r[c]))))].join('\n');
}

/** Render one object as aligned "key  value" lines. */
export function keyValues(data: Record<string, unknown>): string {
  const keys = Object.keys(data);
  const width = Math.max(...keys.map(k => k.length));
  return keys
    .map(k => {
      const v = data[k];
      const text = v === null || v === undefined ? '-' : typeof v === 'object' ? JSON.stringify(v) : String(v);
      return `${k.padEnd(width)}  ${text}`;
    })
    .join('\n');
}
