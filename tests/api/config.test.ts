import { readFile } from 'node:fs/promises';
import { describe, expect, test } from 'vitest';

describe('Vercel configuration', () => {
  test('builds the frontend, preserves API routes, and falls back to the SPA', async () => {
    const config = JSON.parse(
      await readFile(new URL('../../vercel.json', import.meta.url), 'utf8'),
    );

    expect(config.buildCommand).toBe('npm run build');
    expect(config.outputDirectory).toBe('frontend/dist');
    expect(config.rewrites).toEqual([
      { source: '/api/(.*)', destination: '/api/$1' },
      { source: '/(.*)', destination: '/index.html' },
    ]);
  });
});
