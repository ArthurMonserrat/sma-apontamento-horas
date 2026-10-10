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
const legacySharedUtils = import.meta.glob('../shared/utils/**/*.{ts,tsx}', {
  eager: true,
  query: '?raw',
  import: 'default',
})
const sharedSources = import.meta.glob('../shared/**/*.{ts,tsx}', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

const legacyDebt = {
  components: 20,
  hooks: 1,
  mocks: 2,
  data: 1,
  sharedUtils: 2,
}

const allowedSharedFeatureImports = [
  '../shared/types/domain.ts -> ../../features/profile/types',
  '../shared/types/domain.ts -> ../../features/time-entries/types',
]

function sharedFeatureImports() {
  const imports = Object.entries(sharedSources).flatMap(([file, source]) =>
    [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)]
      .map((match) => match[1])
      .filter((specifier) => /(?:^|\/)(?:features|pages|app|demo)(?:\/|$)/.test(specifier))
      .map((specifier) => `${file} -> ${specifier}`),
  )

  return [...new Set(imports)].sort()
}

describe('architectural boundaries', () => {
  it('does not increase files in legacy horizontal directories', () => {
    expect({
      components: Object.keys(legacyComponents).length,
      hooks: Object.keys(legacyHooks).length,
      mocks: Object.keys(legacyMocks).length,
      data: Object.keys(legacyData).length,
      sharedUtils: Object.keys(legacySharedUtils).length,
    }).toEqual(legacyDebt)
  })

  it('keeps shared independent from features except for explicitly tracked debt', () => {
    expect(sharedFeatureImports()).toEqual(allowedSharedFeatureImports)
  })
})
