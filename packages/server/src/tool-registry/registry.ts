import type { BaseTool, ToolDefinition, ToolCategory } from '@starlink/shared'

export class ToolRegistry {
  private tools = new Map<string, BaseTool>()

  register(tool: BaseTool): void {
    const name = tool.definition.identity.name
    if (this.tools.has(name)) {
      throw new Error(`Tool "${name}" is already registered`)
    }
    this.tools.set(name, tool)
  }

  getTool(name: string): BaseTool {
    const tool = this.tools.get(name)
    if (!tool) throw new Error(`Tool "${name}" not found in registry`)
    return tool
  }

  has(name: string): boolean {
    return this.tools.has(name)
  }

  listAll(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => t.definition)
  }

  listByCategory(category: ToolCategory): ToolDefinition[] {
    return Array.from(this.tools.values())
      .filter((t) => t.definition.display.category === category)
      .map((t) => t.definition)
  }

  search(query: string): ToolDefinition[] {
    const q = query.toLowerCase()
    return Array.from(this.tools.values())
      .filter((t) => {
        const d = t.definition.display
        return (
          d.label.toLowerCase().includes(q) ||
          d.description.toLowerCase().includes(q) ||
          t.definition.identity.name.toLowerCase().includes(q)
        )
      })
      .map((t) => t.definition)
  }

  get size(): number {
    return this.tools.size
  }
}
