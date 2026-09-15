import { BenchmarkCaseSchema, type BenchmarkCase } from '../types.js'
import { ALL_CASES } from './cases/index.js'

export async function loadAllCases(): Promise<BenchmarkCase[]> {
  const errors: string[] = []
  const valid: BenchmarkCase[] = []
  for (const c of ALL_CASES) {
    const result = BenchmarkCaseSchema.safeParse(c)
    if (!result.success) {
      errors.push(
        `${c.case_id}: ${result.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ')}`
      )
      continue
    }
    valid.push(result.data)
  }
  if (errors.length > 0) {
    throw new Error(
      `Benchmark corpus validation failed:\n${errors.map((e) => `  · ${e}`).join('\n')}`
    )
  }
  return valid
}

export async function loadCaseById(caseId: string): Promise<BenchmarkCase | undefined> {
  const all = await loadAllCases()
  return all.find((c) => c.case_id === caseId)
}
