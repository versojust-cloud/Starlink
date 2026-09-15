/**
 * BaseTool abstract class — the contract for all Tools in the system.
 * Every Tool extends this and implements `definition` + `execute()`.
 */

import type {
  ToolDefinition,
  ToolContext,
  ToolMessage,
  ValidationResult,
  ValidationError,
  DynamicParam,
} from './types.js'

export abstract class BaseTool {
  abstract readonly definition: ToolDefinition

  /**
   * Core execution method.
   * Yields ToolMessage items (supports streaming, progress, and final output).
   */
  abstract execute(
    input: Record<string, unknown>,
    context: ToolContext,
  ): AsyncGenerator<ToolMessage>

  /**
   * Validate input against the tool's inputSchema.
   */
  validate(input: Record<string, unknown>): ValidationResult {
    const errors: ValidationError[] = []
    const { properties, required } = this.definition.inputSchema

    for (const field of required) {
      if (input[field] === undefined || input[field] === null) {
        errors.push({ path: field, message: `Required field "${field}" is missing` })
      }
    }

    for (const [key, value] of Object.entries(input)) {
      const schema = properties[key]
      if (!schema) continue
      if (schema.type === 'string' && typeof value !== 'string') {
        errors.push({ path: key, message: `Expected string for "${key}"` })
      }
      if (schema.type === 'number' && typeof value !== 'number') {
        errors.push({ path: key, message: `Expected number for "${key}"` })
      }
      if (schema.type === 'boolean' && typeof value !== 'boolean') {
        errors.push({ path: key, message: `Expected boolean for "${key}"` })
      }
      if (schema.type === 'array' && !Array.isArray(value)) {
        errors.push({ path: key, message: `Expected array for "${key}"` })
      }
      if (schema.enum && !schema.enum.includes(value)) {
        errors.push({ path: key, message: `"${key}" must be one of: ${schema.enum.join(', ')}` })
      }
    }

    return { valid: errors.length === 0, errors }
  }

  /**
   * Optional: return dynamic parameters based on runtime context.
   */
  async getDynamicParams?(_context: ToolContext): Promise<DynamicParam[]>
}
