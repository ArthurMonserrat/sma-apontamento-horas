import { describe, expect, it } from 'vitest'

const legacyComponents = import.meta.glob('../components/**/*.{ts,tsx}', {
  eager: true,
  query: '?raw',
  import: 'default',
})
const legacyHooks = import.meta.glob('../hooks/**/*.{ts,tsx}', {
  eager: true,
  query: '?raw',
  import: 'default',
})
const legacyMocks = import.meta.glob('../mocks/**/*.{ts,tsx}', {
  eager: true,
  query: '?raw',
  import: 'default',
})
const legacyData = import.meta.glob('../data/**/*.{ts,tsx}', {
  eager: true,
  query: '?raw',
  import: 'default',
})
const legacyTopLevelPages = import.meta.glob('../pages/*.{ts,tsx}', {
  eager: true,
  query: '?raw',
  import: 'default',
})
const legacyAppRoutes = import.meta.glob('./AppRoutes*.{ts,tsx}', {
  eager: true,
  query: '?raw',
  import: 'default',
})
const legacySharedUtils = import.meta.glob('../shared/utils/**/*.{ts,tsx}', {
  eager: true,
  query: '?raw',
  import: 'default',
})
const legacyStorage = {
  ...import.meta.glob('../services/storage.ts', { eager: true, query: '?raw', import: 'default' }),
  ...import.meta.glob('../services/storage.test.ts', { eager: true, query: '?raw', import: 'default' }),
}
const legacyServices = import.meta.glob('../services/**/*.{ts,tsx}', {
  eager: true,
  query: '?raw',
  import: 'default',
})
const sharedSources = import.meta.glob('../shared/**/*.{ts,tsx}', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>
const modularLandmarks = import.meta.glob(
  [
    './layouts/*.{ts,tsx}',
    './providers/*.{ts,tsx}',
    './routes/*.{ts,tsx}',
    '../pages/{access,collaborator,supervisor,administration}/*.{ts,tsx}',
    '../demo/fixtures/*.{ts,tsx}',
  ],
  { eager: true, query: '?raw', import: 'default' },
)

const legacyDebt = {
  components: 0,
  hooks: 0,
  mocks: 0,
  data: 0,
  topLevelPages: 0,
  appRoutes: 0,
  sharedUtils: 0,
  storage: 0,
}

const allowedSharedFeatureImports: string[] = []
const allowedLegacyServices = ['../services/postCommit.ts']

function sharedFeatureImports() {
  const imports = Object.entries(sharedSources).flatMap(([file, source]) => {
    const specifiers = [
      ...source.matchAll(/from\s+['"]([^'"]+)['"]/g),
      ...source.matchAll(/import\s+['"]([^'"]+)['"]/g),
      ...source.matchAll(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g),
    ].map((match) => match[1])

    return specifiers
      .filter((specifier) => /(?:^|\/)(?:features|pages|app|demo)(?:\/|$)/.test(specifier))
      .map((specifier) => `${file} -> ${specifier}`)
  })

  return [...new Set(imports)].sort()
}

describe('architectural boundaries', () => {
  it('does not increase files in legacy horizontal directories', () => {
    expect({
      components: Object.keys(legacyComponents).length,
      hooks: Object.keys(legacyHooks).length,
      mocks: Object.keys(legacyMocks).length,
      data: Object.keys(legacyData).length,
      topLevelPages: Object.keys(legacyTopLevelPages).length,
      appRoutes: Object.keys(legacyAppRoutes).length,
      sharedUtils: Object.keys(legacySharedUtils).length,
      storage: Object.keys(legacyStorage).length,
    }).toEqual(legacyDebt)
  })

  it('keeps only the explicitly tracked service in the legacy directory', () => {
    expect(Object.keys(legacyServices).sort()).toEqual(allowedLegacyServices)
  })

  it('keeps the expected modular areas present', () => {
    const paths = Object.keys(modularLandmarks)

    expect(paths.some((path) => path.startsWith('./layouts/'))).toBe(true)
    expect(paths.some((path) => path.startsWith('./providers/'))).toBe(true)
    expect(paths.some((path) => path.startsWith('./routes/'))).toBe(true)
    expect(paths.some((path) => path.includes('/pages/access/'))).toBe(true)
    expect(paths.some((path) => path.includes('/pages/collaborator/'))).toBe(true)
    expect(paths.some((path) => path.includes('/pages/supervisor/'))).toBe(true)
    expect(paths.some((path) => path.includes('/pages/administration/'))).toBe(true)
    expect(paths.some((path) => path.includes('/demo/fixtures/'))).toBe(true)
  })

  it('keeps shared independent from features except for explicitly tracked debt', () => {
    expect(sharedFeatureImports()).toEqual(allowedSharedFeatureImports)
  })
})
