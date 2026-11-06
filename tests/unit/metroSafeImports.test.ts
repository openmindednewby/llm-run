import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sourceRoot = resolve(__dirname, '../../src');

const sourceFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });

const withoutStringContents = (source: string): string => source.replace(/'[^'\n]*'/g, "''");

describe('src', () => {
  it('with every source file read, has no import() of a non-literal so Metro can bundle it', () => {
    const files = sourceFiles(sourceRoot);

    const dynamicCalls = files.flatMap((file) => [...withoutStringContents(readFileSync(file, 'utf8')).matchAll(/\bimport\(\s*([^)\s]?)/g)].map((m) => `${file}:${m[1]}`));

    expect(files.length).toBeGreaterThan(0);
    expect(dynamicCalls.filter((call) => !/:['"]$/.test(call))).toEqual([]);
  });
});
