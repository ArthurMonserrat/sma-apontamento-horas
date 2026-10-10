import { readFile } from 'node:fs/promises';
import { describe, expect, test } from 'vitest';

describe('workspace test scripts', () => {
  test('separates API and frontend suites while keeping a complete test command', async () => {
    const packageJson = JSON.parse(
      await readFile(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts).toMatchObject({
      'test:api': 'vitest run api',
      'test:frontend': 'npm --prefix frontend test',
      test: 'npm run test:api && npm run test:frontend',
    });
  });
});
