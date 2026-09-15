import { bmcAnalysisSchema, type BmcAnalysis } from '@starlink/shared'

export function parseBmcAnalysisOutput(content: string | null): BmcAnalysis {
  if (!content?.trim()) {
    throw new Error('BMC agent returned empty content')
  }

  const json = extractJsonObject(content)
  const parsed = JSON.parse(json) as unknown
  return bmcAnalysisSchema.parse(parsed)
}

function extractJsonObject(content: string) {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) {
    return fenced[1].trim()
  }

  const start = content.indexOf('{')
  const end = content.lastIndexOf('}')
  if (start < 0 || end < start) {
    throw new Error('BMC agent output does not contain a JSON object')
  }

  return content.slice(start, end + 1)
}

