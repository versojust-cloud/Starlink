/**
 * Generic registry factory shared by agent, advisor, and future capability-driven
 * registries. Keyed by `id` (items must have a string `id` field).
 *
 * Behaviour:
 * - register() throws on duplicate id (fail fast — registration collisions
 *   are almost always bugs)
 * - unregister() is no-op if id not found
 * - all() returns a snapshot array (safe to iterate while mutating)
 */
export function createRegistry<T extends { id: string }>() {
  const map = new Map<string, T>()

  return {
    register(item: T): T {
      if (map.has(item.id)) {
        throw new Error(`Registry item "${item.id}" is already registered`)
      }
      map.set(item.id, item)
      return item
    },
    unregister(id: string): void {
      map.delete(id)
    },
    get(id: string): T | undefined {
      return map.get(id)
    },
    all(): T[] {
      return [...map.values()]
    },
    filter(pred: (item: T) => boolean): T[] {
      return [...map.values()].filter(pred)
    },
    has(id: string): boolean {
      return map.has(id)
    },
    clear(): void {
      map.clear()
    },
    get size(): number {
      return map.size
    }
  }
}

export type Registry<T extends { id: string }> = ReturnType<typeof createRegistry<T>>
