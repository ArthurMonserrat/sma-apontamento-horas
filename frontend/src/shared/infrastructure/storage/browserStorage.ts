export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

function createMemoryStorage(): StorageLike {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value) },
  }
}

export function createResilientStorage(
  resolvePrimary: () => StorageLike,
  onError: (operation: 'resolve' | 'read' | 'write', error: unknown) => void = (operation, error) => {
    console.warn(`Storage local indisponível durante ${operation}; usando memória temporária.`, error)
  },
): StorageLike {
  const fallback = createMemoryStorage()
  const pendingWrites = new Set<string>()
  let primary: StorageLike | null = null
  let resolutionAttempted = false

  const getPrimary = () => {
    if (resolutionAttempted) return primary
    resolutionAttempted = true
    try {
      primary = resolvePrimary()
    } catch (error) {
      onError('resolve', error)
    }
    return primary
  }

  return {
    getItem(key) {
      const fallbackValue = fallback.getItem(key)
      if (pendingWrites.has(key)) return fallbackValue
      const resolved = getPrimary()
      if (!resolved) return fallbackValue
      try {
        const value = resolved.getItem(key)
        if (value !== null) fallback.setItem(key, value)
        return value ?? fallbackValue
      } catch (error) {
        onError('read', error)
        return fallbackValue
      }
    },
    setItem(key, value) {
      fallback.setItem(key, value)
      const resolved = getPrimary()
      if (!resolved) return
      try {
        resolved.setItem(key, value)
        pendingWrites.delete(key)
      } catch (error) {
        pendingWrites.add(key)
        onError('write', error)
      }
    },
  }
}

export function createBrowserStorage(): StorageLike {
  if (typeof window === 'undefined') return createMemoryStorage()
  return createResilientStorage(() => window.localStorage)
}
