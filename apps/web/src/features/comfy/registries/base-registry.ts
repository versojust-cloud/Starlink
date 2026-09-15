export function createRegistry<T extends { id: string }>() {
  const map = new Map<string, T>()

  return {
    register(item: T) {
      map.set(item.id, item)
      return item
    },
    unregister(id: string) {
      map.delete(id)
    },
    get(id: string) {
      return map.get(id)
    },
    all() {
      return [...map.values()]
    },
    clear() {
      map.clear()
    }
  }
}

