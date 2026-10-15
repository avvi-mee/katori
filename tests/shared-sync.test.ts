/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { expectedFiles, GEN } from '../scripts/sync-shared.mjs';

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]));

describe('server-shared copies for Edge Functions', () => {
  it('are up to date (run `npm run shared:sync`)', () => {
    const expected = expectedFiles() as Map<string, string>;
    const actual = new Map(walk(GEN).map((f) => [relative(GEN, f).replaceAll('\\', '/'), readFileSync(f, 'utf8')]));
    expect([...actual.keys()].sort()).toEqual([...expected.keys()].sort());
    for (const [rel, content] of expected) expect(actual.get(rel), rel).toBe(content);
  });

  it('only import zod or other server-shared files', () => {
    for (const [rel, content] of expectedFiles() as Map<string, string>) {
      for (const m of content.matchAll(/from '([^']+)'/g)) {
        const spec = m[1]!;
        expect(
          spec.startsWith('npm:zod@') || (spec.startsWith('.') && spec.endsWith('.ts')),
          `${rel} imports ${spec}`,
        ).toBe(true);
      }
    }
  });
});
