import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const directory = resolve(__dirname, '../../../src/intent');

describe('src/intent', () => {
  it('with every source file read, imports only relative paths so a browser loads it with no import map', () => {
    const files = readdirSync(directory).filter((name) => name.endsWith('.ts'));

    const specifiers = files.flatMap((name) => [...readFileSync(resolve(directory, name), 'utf8').matchAll(/from\s+'([^']+)'|import\(\s*'([^']+)'/g)].map((m) => m[1] ?? m[2]));

    expect(files.length).toBeGreaterThan(0);
    expect(specifiers.length).toBeGreaterThan(0);
    expect(specifiers.filter((s) => !s.startsWith('./'))).toEqual([]);
  });
});
