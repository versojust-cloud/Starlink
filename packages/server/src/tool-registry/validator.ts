import type { ToolInputSchema, ValidationResult, ValidationError } from '@starlink/shared'

export function validateAgainstSchema(
  input: Record<string, unknown>,
  schema: ToolInputSchema,
): ValidationResult {
  const errors: ValidationError[] = []

  for (const field of schema.required) {
    if (input[field] === undefined || input[field] === null) {
      errors.push({ path: field, message: `Required field "${field}" is missing` })
    }
  }

  for (const [key, value] of Object.entries(input)) {
    const prop = schema.properties[key]
    if (!prop) continue

    const actualType = Array.isArray(value) ? 'array' : typeof value
    if (prop.type !== 'any' && prop.type !== actualType && value !== null && value !== undefined) {
      errors.push({ path: key, message: `Expected ${prop.type} for "${key}", got ${actualType}` })
    }

    if (prop.enum && !prop.enum.includes(value)) {
      errors.push({ path: key, message: `"${key}" must be one of: ${prop.enum.join(', ')}` })
    }
  }

  return { valid: errors.length === 0, errors }
}
