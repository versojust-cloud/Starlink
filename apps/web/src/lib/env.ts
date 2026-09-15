type EnvOptions = {
  required?: boolean
  defaultValue?: string
  transform?: (value: string) => string
}

const warnedKeys = new Set<string>()

export function readEnv(key: string, options: EnvOptions = {}): string {
  const raw = process.env[key]
  let value = raw ?? options.defaultValue ?? ''

  if (!value && options.required && !warnedKeys.has(key)) {
    console.warn(`[env] Missing required env var ${key}`)
    warnedKeys.add(key)
  }

  if (value && options.transform) {
    value = options.transform(value)
  }

  return value
}

export function boolFromEnv(key: string, options: EnvOptions = {}): boolean {
  const value = readEnv(key, options).toLowerCase()
  return value === '1' || value === 'true'
}
